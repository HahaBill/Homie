import "server-only";

/**
 * Open-Meteo barometric snapshot (PRD §9 — free, no API key).
 *
 * PRD §8's users table carries no location, so all users currently share a
 * default coordinate (HOMIE_DEFAULT_LAT/LON, falling back to central
 * London). Good enough for the hackathon radius; per-user location is a
 * schema addition for later.
 */

export type PressureSnapshot = {
  pressureHpa: number;
  pressureDelta24h: number;
  tempC: number;
  humidity: number;
};

export async function fetchPressure(): Promise<PressureSnapshot | null> {
  const lat = process.env.HOMIE_DEFAULT_LAT ?? "51.5072";
  const lon = process.env.HOMIE_DEFAULT_LON ?? "-0.1276";
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    "&hourly=surface_pressure,temperature_2m,relative_humidity_2m" +
    "&past_days=1&forecast_days=1&timezone=UTC";

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      hourly?: {
        time?: string[];
        surface_pressure?: number[];
        temperature_2m?: number[];
        relative_humidity_2m?: number[];
      };
    };
    const h = body.hourly;
    if (!h?.time?.length || !h.surface_pressure?.length) return null;

    // Index of the current UTC hour; the same hour yesterday sits 24 slots
    // earlier because past_days=1 prepends exactly one day.
    const nowIso = new Date().toISOString().slice(0, 13);
    let idx = h.time.findIndex((t) => t.startsWith(nowIso));
    if (idx === -1) idx = Math.min(35, h.time.length - 1);
    const prev = idx - 24;

    // Open-Meteo pads hours it has no data for with nulls, so every value has
    // to be checked at idx — not just pressure. Previously a gap produced
    // NaN temp/humidity, which serialises to null on the way into the weather
    // table and quietly stored a row that looks like a real reading.
    const pressure = h.surface_pressure[idx];
    const before = prev >= 0 ? h.surface_pressure[prev] : pressure;
    const temp = h.temperature_2m?.[idx];
    const humidity = h.relative_humidity_2m?.[idx];
    if (![pressure, before, temp, humidity].every((v) => typeof v === "number" && Number.isFinite(v))) {
      return null;
    }

    return {
      pressureHpa: round1(pressure as number),
      pressureDelta24h: round1((pressure as number) - (before as number)),
      tempC: round1(temp as number),
      humidity: round1(humidity as number),
    };
  } catch {
    return null;
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
