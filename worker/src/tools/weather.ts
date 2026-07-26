import { tool } from "@openai/agents-core";
import { z } from "zod";

/**
 * The agent's weather tool, ported from the personal-agent-template's
 * `agent/tools/weather.ts` and re-aimed at what actually matters here.
 *
 * The template's version reports temperature and a condition icon. For
 * someone with lupus or RA the load-bearing signals are different:
 *
 *   pressure_delta_24h — the correlation the whole product exists to surface
 *   uv_index_max       — photosensitivity is a lupus-specific concern
 *   temp_max           — heat pacing
 *
 * It returns observations, never advice: the model is told elsewhere never
 * to diagnose or predict a flare (docs/PRD.md §4), and this tool deliberately
 * hands back numbers and plain descriptions rather than recommendations, so
 * there is nothing here for it to launder a prediction through.
 */

const WEATHER_CODES: Record<number, string> = {
  0: "clear",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  48: "foggy",
  51: "light drizzle",
  61: "rain",
  71: "snow",
  80: "rain showers",
  95: "thunderstorms",
};

async function geocode(
  location: string,
): Promise<{ lat: number; lon: number; label: string } | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", location);
  url.searchParams.set("count", "1");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string; country?: string }>;
    };
    const hit = body.results?.[0];
    if (!hit) return null;
    return {
      lat: hit.latitude,
      lon: hit.longitude,
      label: hit.country ? `${hit.name}, ${hit.country}` : hit.name,
    };
  } catch {
    return null;
  }
}

export const weatherTool = tool({
  name: "weather",
  description:
    "Look up today's weather for a place, including the 24-hour barometric pressure change, " +
    "UV index and peak temperature. Use it when the person asks about the weather, the " +
    "pressure, the sun, or how the day looks. Report what it returns; never turn it into a " +
    "prediction about their symptoms.",
  parameters: z.object({
    location: z
      .string()
      .describe("Town, city or region to look up, e.g. 'London' or 'Manchester, UK'."),
  }),
  async execute({ location }) {
    const place = await geocode(location);
    if (!place) return `No weather found for "${location}".`;

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(place.lat));
    url.searchParams.set("longitude", String(place.lon));
    url.searchParams.set("hourly", "surface_pressure");
    url.searchParams.set(
      "daily",
      "uv_index_max,temperature_2m_max,temperature_2m_min,weather_code",
    );
    url.searchParams.set("past_days", "1");
    url.searchParams.set("forecast_days", "1");
    url.searchParams.set("timezone", "auto");

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return `Weather lookup failed for ${place.label}.`;
      const body = (await res.json()) as {
        hourly?: { surface_pressure?: Array<number | null> };
        daily?: {
          uv_index_max?: Array<number | null>;
          temperature_2m_max?: Array<number | null>;
          temperature_2m_min?: Array<number | null>;
          weather_code?: Array<number | null>;
        };
      };

      const parts: string[] = [`Weather for ${place.label} today:`];

      // past_days=1 puts yesterday at daily[0] and today at daily[1].
      const code = body.daily?.weather_code?.[1];
      if (typeof code === "number") parts.push(`- Conditions: ${WEATHER_CODES[code] ?? "mixed"}`);

      const hi = body.daily?.temperature_2m_max?.[1];
      const lo = body.daily?.temperature_2m_min?.[1];
      if (typeof hi === "number") {
        parts.push(
          typeof lo === "number"
            ? `- Temperature: ${Math.round(lo)}° to ${Math.round(hi)}°C`
            : `- High: ${Math.round(hi)}°C`,
        );
      }

      const uv = body.daily?.uv_index_max?.[1];
      if (typeof uv === "number") {
        parts.push(
          `- UV index peaks at ${uv.toFixed(1)}${uv >= 6 ? " (strong)" : uv >= 3 ? " (moderate)" : " (low)"}`,
        );
      }

      // Same hour yesterday sits 24 slots earlier in the hourly series.
      const pressures = body.hourly?.surface_pressure ?? [];
      const nowIdx = Math.min(pressures.length - 1, 35);
      const now = pressures[nowIdx];
      const before = pressures[nowIdx - 24];
      if (typeof now === "number" && typeof before === "number") {
        const delta = now - before;
        const direction = delta <= -3 ? "falling" : delta >= 3 ? "rising" : "steady";
        parts.push(
          `- Barometric pressure: ${Math.round(now)} hPa, ${direction} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)} hPa over 24h)`,
        );
      }

      return parts.join("\n");
    } catch {
      return `Weather lookup failed for ${place.label}.`;
    }
  },
});
