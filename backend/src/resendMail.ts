import { env } from "./env";

function resolveFromHeader(): string {
  const f = env.FROM_EMAIL?.trim();
  if (f) return f;
  console.warn(
    "[email] FROM_EMAIL is not set — using Resend onboarding sender. Add your domain in Resend and set FROM_EMAIL (e.g. OrdoStage <noreply@yourdomain.com>)."
  );
  return "OrdoStage <onboarding@resend.dev>";
}

/**
 * Send HTML mail via Resend. Checks the API result (Resend does not throw on failure).
 * @throws Error if the API key is missing or Resend returns an error.
 */
export async function sendHtmlEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: resolveFromHeader(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    console.error("[resend] send failed:", error.name, error.message, error.statusCode);
    throw new Error(error.message || "Email could not be sent");
  }
}

/** Base URL for links inside emails (password reset, etc.). Prefer FRONTEND_URL in production. */
export function appOriginForEmailLinks(): string {
  const front = env.FRONTEND_URL?.trim().replace(/\/+$/, "");
  if (front) return front;
  const back = env.BACKEND_URL.trim().replace(/\/+$/, "");
  if (env.NODE_ENV === "production") {
    console.warn(
      "[email] FRONTEND_URL is not set — using BACKEND_URL for links in emails. Set FRONTEND_URL to your deployed web app (e.g. https://ordostage.com) so reset links open the React app."
    );
  }
  return back;
}
