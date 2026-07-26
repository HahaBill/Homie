import "server-only";
import { supabaseAdmin } from "./supabase";
import { normalizePhone } from "./phone";

function phonesFrom(value: unknown): string[] {
  const phones: string[] = [];
  const add = (candidate: unknown) => {
    if (typeof candidate !== "string" || !candidate.trim()) return;
    try {
      phones.push(normalizePhone(candidate));
    } catch {
      /* Ignore bad historical values rather than blocking the record page. */
    }
  };
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    add((value as { call_phone?: unknown }).call_phone);
  }
  return phones;
}

function phoneFrom(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    return [normalizePhone(value)];
  } catch {
    return [];
  }
}

export async function syncVapiCallsForUser(userId: string): Promise<void> {
  const workerUrl = process.env.WORKER_URL;
  const workerToken = process.env.WORKER_ADMIN_TOKEN;
  if (!workerUrl || !workerToken) return;

  const { data } = await supabaseAdmin()
    .from("users")
    .select("phone, onboarding_profile")
    .eq("id", userId)
    .maybeSingle();
  const phones = Array.from(
    new Set([
      ...phoneFrom(data?.phone),
      ...phonesFrom(data?.onboarding_profile),
    ]),
  );
  if (phones.length === 0) return;

  await fetch(`${workerUrl.replace(/\/$/, "")}/sync-vapi-calls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${workerToken}`,
    },
    body: JSON.stringify({ user_id: userId, phones }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => undefined);
}
