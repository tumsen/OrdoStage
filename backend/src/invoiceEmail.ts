import { env } from "./env";
import { generateInvoicePdf, type InvoiceData } from "./invoicePdf";

/** Send a PDF invoice to the buyer and optionally the seller (BCC). */
export async function sendInvoiceEmail(data: InvoiceData, pdfBytes: Uint8Array): Promise<void> {
  const to = data.buyerEmail ?? data.buyerVat ?? undefined; // must have some address
  if (!to) {
    console.log(`[INVOICE] No buyer email — skipping email for ${data.invoiceNumber}`);
    return;
  }

  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) {
    console.log(
      `[INVOICE DEV] Would send ${data.invoiceNumber} to ${to} (Resend not configured)`
    );
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(env.RESEND_API_KEY);

  const html = `
    <div style="font-family:sans-serif;color:#1a1a2e;max-width:520px">
      <h2 style="color:#9e1e8e;margin-bottom:4px">Thank you for your purchase!</h2>
      <p style="color:#555">Hi ${data.buyerName},</p>
      <p>Your payment for <strong>${data.packLabel}</strong> (${data.days} usage days) has been confirmed.</p>
      <p><strong>Invoice number:</strong> ${data.invoiceNumber}<br/>
         <strong>Amount:</strong> €${(data.amountCents / 100).toFixed(2)}<br/>
         <strong>Date:</strong> ${data.date.toLocaleDateString("en-GB", { dateStyle: "long" })}</p>
      <p style="color:#888;font-size:12px">Your full tax invoice/receipt is sent separately by Paddle (the payment processor).
      This PDF is a courtesy record from Ordo Stage.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="color:#aaa;font-size:11px">${data.sellerName} · ${data.sellerAddress} · ${data.sellerEmail}</p>
    </div>`;

  const b64 = Buffer.from(pdfBytes).toString("base64");

  await resend.emails.send({
    from: env.FROM_EMAIL,
    to,
    subject: `Invoice ${data.invoiceNumber} — Ordo Stage`,
    html,
    attachments: [
      {
        filename: `${data.invoiceNumber}.pdf`,
        content: b64,
      },
    ],
  });
}

/** Convenience: generate + send in one call. Returns the PDF bytes for storage. */
export async function generateAndSendInvoice(data: InvoiceData): Promise<Uint8Array> {
  const pdf = await generateInvoicePdf(data);
  await sendInvoiceEmail(data, pdf).catch((e) =>
    console.error("[INVOICE EMAIL ERROR]", e)
  );
  return pdf;
}
