import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SecurityEventInput = {
  event: string;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  detail?: string | null;
};

/**
 * Append-only security log. Written server-side only, never surfaced in the app UI.
 * Failures are swallowed: logging must never block an auth action.
 */
export async function recordSecurityEvent(input: SecurityEventInput) {
  try {
    await supabaseAdmin.from("security_events").insert({
      event: input.event,
      email: input.email?.trim().toLowerCase() ?? null,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
      detail: input.detail ?? null,
    });
  } catch {
    // intentionally ignored
  }
  return { ok: true };
}
