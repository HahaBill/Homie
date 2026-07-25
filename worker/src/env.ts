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

  /** Required bearer token for POST /send-test. Route refuses if unset. */
  WORKER_ADMIN_TOKEN?: string;
}
