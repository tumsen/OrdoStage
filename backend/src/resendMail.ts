import { env, isDeployedRuntime } from "./env";

function resolveFromHeader(): string {
  const f = env.FROM_EMAIL?.trim();
  if (f) return f;
  if (isDeployedRuntime()) {
    throw new Error(
      "FROM_EMAIL is not configured. Set it to a verified sender in Resend (same as team invites)."
    );
  }
  console.warn(
    "[email] FROM_EMAIL is not set — using Resend onboarding sender for local dev only."
  );
  return "OrdoStage <onboarding@resend.dev>";
}

/**
 * Send HTML mail via Resend. Checks the API result (Resend does not throw on failure).
 * @throws Error if the API key is missing or Resend returns an error.
 */
export async function sendHtmlEmail(opts: {
  to: string;
  subject: string;
  html: string;
  /** Plain-text body improves deliverability when set */
  text?: string;
}): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: resolveFromHeader(),
    to: opts.to.trim(),
    subject: opts.subject,
    html: opts.html,
    ...(opts.text ? { text: opts.text } : {}),
  });
  if (error) {
    console.error("[resend] send failed:", error.name, error.message, error.statusCode);
    throw new Error(error.message || "Email could not be sent");
  }
  if (data?.id) {
    console.log("[resend] email accepted id=%s to=%s subject=%s", data.id, opts.to, opts.subject);
  }
}

/** Base URL for links inside emails (password reset, etc.). Prefer FRONTEND_URL in production. */
export function appOriginForEmailLinks(): string {
  const front = env.FRONTEND_URL?.trim().replace(/\/+$/, "");
  if (front) return front;
  const back = env.BACKEND_URL.trim().replace(/\/+$/, "");
  if (isDeployedRuntime()) {
    console.warn(
      "[email] FRONTEND_URL is not set — using BACKEND_URL for links in emails. Set FRONTEND_URL to your deployed web app (e.g. https://ordostage.com) so reset links open the React app."
    );
  }
  return back;
}
