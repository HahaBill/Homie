/** Worker environment bindings. No Durable Object binding — see wrangler.jsonc. */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  SENDBLUE_API_KEY_ID: string;
  SENDBLUE_API_KEY_SECRET: string;
  SENDBLUE_FROM_NUMBER: string;
  SENDBLUE_WEBHOOK_SECRET?: string;
  SKIP_SENDBLUE_VERIFY?: string;

  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;

  /** Shared secret Vapi sends on its webhook. Route refuses if unset. */
  VAPI_WEBHOOK_SECRET?: string;

  /** Required bearer token for POST /send-test. Route refuses if unset. */
  WORKER_ADMIN_TOKEN?: string;

  /**
   * HMAC key for report-link tokens — must equal the Next.js app's
   * LINK_SIGNING_SECRET so links minted by either side verify here (same
   * format as lib/server/token.ts). Unset = report links silently disabled.
   */
  LINK_SIGNING_SECRET?: string;

  /**
   * Set to "1" to store raw inbound message text in audit_log. Off by default:
   * that text is health data, and audit_log is insert-only (PRD §8) with
   * erasure limited to dropping the user_id link, so anything written here
   * outlives a DELETE request. Debugging aid only — never enable in an
   * environment holding real users' messages.
   */
  DEBUG_LOG_TEXT?: string;
}
