import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

const schema = z.object({
  event: z.enum(["password_reset_requested", "password_reset_completed"]),
  email: z.string().email().max(255).optional(),
});

/**
 * Records password-reset activity to the security log.
 * Deliberately returns the same shape regardless of whether the email exists.
 */
export const logSecurityEventFn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => schema.parse(raw))
  .handler(async ({ data }) => {
    const { recordSecurityEvent } = await import("@/lib/security-log.server");
    const ipAddress = getRequestIP({ xForwardedFor: true }) ?? null;
    const userAgent = getRequestHeader("user-agent") ?? null;
    await recordSecurityEvent({
      event: data.event,
      email: data.email ?? null,
      ipAddress,
      userAgent,
    });
    return { ok: true };
  });
