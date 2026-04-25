import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  /** Seller (OrdoStage) */
  sellerName: string;
  sellerAddress: string;
  sellerVat: string;
  sellerEmail: string;
  /** Buyer (organization) */
  buyerName: string;
  buyerAddress?: string | null;
  buyerVat?: string | null;
  buyerEmail?: string | null;
  buyerLogoData?: Uint8Array | null;
  buyerLogoMimeType?: string | null;
  /** Line item */
  packLabel: string;
  days: number;
  amountCents: number;
}

function cents(n: number): string {
  return (n / 100).toFixed(2);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("da-DK", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Generate a simple, clean PDF invoice. Returns the raw bytes. */
export async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const W = 595;
  const black = rgb(0, 0, 0);
  const grey = rgb(0.5, 0.5, 0.5);
  const dark = rgb(0.13, 0.13, 0.18);
  const accent = rgb(0.62, 0.12, 0.55); // OrdoStage magenta-ish

  let y = 780;
  const L = 56; // left margin
  const R = W - 56; // right margin

  // --- Header ---
  page.drawText("ORDO STAGE", {
    x: L,
    y,
    size: 22,
    font: bold,
    color: dark,
  });
  y -= 16;
  page.drawText("Invoice Management Platform", {
    x: L,
    y,
    size: 10,
    font: regular,
    color: grey,
  });

  // Invoice title (right)
  page.drawText("INVOICE", {
    x: R - 80,
    y: 780,
    size: 22,
    font: bold,
    color: accent,
  });
  page.drawText(data.invoiceNumber, {
    x: R - 80,
    y: 760,
    size: 11,
    font: regular,
    color: grey,
  });

  y = 730;
  // Divider
  page.drawLine({
    start: { x: L, y },
    end: { x: R, y },
    thickness: 1,
    color: rgb(0.88, 0.88, 0.88),
  });

  // --- Seller block ---
  y = 710;
  page.drawText("From", {
    x: L,
    y,
    size: 8,
    font: bold,
    color: grey,
  });
  y -= 14;
  page.drawText(data.sellerName, { x: L, y, size: 10, font: bold, color: black });
  y -= 13;
  page.drawText(data.sellerAddress, { x: L, y, size: 9, font: regular, color: black });
  y -= 13;
  page.drawText(`VAT: ${data.sellerVat}`, { x: L, y, size: 9, font: regular, color: black });
  y -= 13;
  page.drawText(data.sellerEmail, { x: L, y, size: 9, font: regular, color: black });

  // --- Buyer block (right column) ---
  let by = 710;
  const BL = 320;
  if (data.buyerLogoData && data.buyerLogoMimeType) {
    try {
      const image = data.buyerLogoMimeType.includes("png")
        ? await doc.embedPng(data.buyerLogoData)
        : await doc.embedJpg(data.buyerLogoData);
      const maxW = 120;
      const maxH = 42;
      const scaled = image.scale(Math.min(maxW / image.width, maxH / image.height));
      page.drawImage(image, {
        x: R - maxW,
        y: by - scaled.height + 6,
        width: scaled.width,
        height: scaled.height,
      });
      by -= 46;
    } catch {
      // Ignore invalid image bytes and continue invoice generation.
    }
  }
  page.drawText("To", { x: BL, y: by, size: 8, font: bold, color: grey });
  by -= 14;
  page.drawText(data.buyerName, { x: BL, y: by, size: 10, font: bold, color: black });
  by -= 13;
  if (data.buyerAddress) {
    page.drawText(data.buyerAddress, { x: BL, y: by, size: 9, font: regular, color: black });
    by -= 13;
  }
  if (data.buyerVat) {
    page.drawText(`VAT: ${data.buyerVat}`, { x: BL, y: by, size: 9, font: regular, color: black });
    by -= 13;
  }
  if (data.buyerEmail) {
    page.drawText(data.buyerEmail, { x: BL, y: by, size: 9, font: regular, color: black });
    by -= 13;
  }

  // Date
  by -= 6;
  page.drawText("Invoice date:", { x: BL, y: by, size: 8, font: bold, color: grey });
  page.drawText(fmtDate(data.date), { x: BL + 72, y: by, size: 8, font: regular, color: black });

  // --- Line item table ---
  y = Math.min(y, by) - 36;

  // Table header bar
  page.drawRectangle({
    x: L,
    y: y - 4,
    width: R - L,
    height: 20,
    color: dark,
  });
  page.drawText("Description", { x: L + 8, y: y + 1, size: 9, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Days", { x: R - 120, y: y + 1, size: 9, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Amount (EUR)", { x: R - 80, y: y + 1, size: 9, font: bold, color: rgb(1, 1, 1) });

  y -= 24;

  // Row
  const desc = `OrdoStage usage billing — ${data.packLabel} (${data.days} days)`;
  page.drawText(desc, { x: L + 8, y, size: 10, font: regular, color: black });
  page.drawText(String(data.days), { x: R - 115, y, size: 10, font: regular, color: black });
  page.drawText(`€${cents(data.amountCents)}`, { x: R - 78, y, size: 10, font: regular, color: black });

  y -= 24;
  page.drawLine({
    start: { x: L, y: y + 8 },
    end: { x: R, y: y + 8 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });

  // Total bar
  y -= 8;
  page.drawRectangle({
    x: L,
    y: y - 4,
    width: R - L,
    height: 22,
    color: rgb(0.96, 0.96, 0.96),
  });
  page.drawText("Total (excl. VAT):", { x: L + 8, y: y + 3, size: 10, font: bold, color: dark });
  page.drawText(`€${cents(data.amountCents)}`, { x: R - 78, y: y + 3, size: 10, font: bold, color: dark });

  y -= 30;
  page.drawText(
    "Paddle (Paddle.com) is the reseller and merchant of record for this transaction.",
    { x: L, y, size: 8, font: regular, color: grey }
  );
  y -= 12;
  page.drawText(
    "Your official tax invoice / receipt is provided by Paddle and sent separately.",
    { x: L, y, size: 8, font: regular, color: grey }
  );

  // --- Footer ---
  y = 52;
  page.drawLine({
    start: { x: L, y: y + 18 },
    end: { x: R, y: y + 18 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  page.drawText(
    `${data.sellerName} · ${data.sellerAddress} · ${data.sellerVat} · ${data.sellerEmail}`,
    { x: L, y, size: 7.5, font: regular, color: grey }
  );

  return doc.save();
}
