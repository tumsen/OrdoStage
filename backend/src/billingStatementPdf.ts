import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

export type BillingStatementLine = {
  description: string;
  detail?: string | null;
  quantity: number;
  unitCents: number;
  amountCents: number;
};

export type BillingStatementData = {
  /** Stable reference for matching this attachment to your external invoice. */
  statementRef: string;
  invoiceId: string;
  invoiceKind: string;
  status: string;
  issuedAt: Date;
  dueAt: Date;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  billingPlan: string;
  committedSeats?: number | null;
  sellerName: string;
  sellerAddress: string;
  sellerVat: string;
  sellerEmail: string;
  buyerName: string;
  buyerAddressLines: string[];
  buyerVat?: string | null;
  buyerEmail?: string | null;
  buyerContact?: string | null;
  buyerPhone?: string | null;
  lines: BillingStatementLine[];
  subtotalCents: number;
  discountPercent: number;
  discountCents: number;
  totalCents: number;
};

function money(cents: number, currency: string): string {
  const major = (cents / 100).toFixed(2);
  return currency === "EUR" ? `EUR ${major}` : `${currency} ${major}`;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtPeriod(start: Date, end: Date): string {
  // periodEnd in DB is typically exclusive midnight of next month; show inclusive last day.
  const inclusiveEnd = new Date(end.getTime() - 1);
  return `${fmtDate(start)} – ${fmtDate(inclusiveEnd)}`;
}

function kindLabel(kind: string): string {
  if (kind === "flex_monthly") return "Flex monthly usage";
  if (kind === "fixed_overage") return "Yearly plan overage";
  if (kind === "fixed_topup") return "Yearly plan seat top-up";
  return kind;
}

function planLabel(plan: string): string {
  return plan === "fixed" ? "Yearly (annual commitment)" : "Flex (monthly postpaid)";
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = rgb(0.1, 0.1, 0.12)
) {
  page.drawText(text, { x, y, size, font, color });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);
  return lines;
}

/** Precise usage statement PDF to attach to an external tax invoice (manual invoicing). */
export async function generateBillingStatementPdf(data: BillingStatementData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const W = 595;
  const H = 842;
  const L = 48;
  const R = W - 48;
  const contentWidth = R - L;
  const black = rgb(0.1, 0.1, 0.12);
  const grey = rgb(0.4, 0.4, 0.45);
  const dark = rgb(0.13, 0.13, 0.18);
  const lineGrey = rgb(0.85, 0.85, 0.88);

  let page = doc.addPage([W, H]);
  let y = H - 52;

  const ensureSpace = (needed: number) => {
    if (y - needed < 64) {
      page = doc.addPage([W, H]);
      y = H - 52;
      drawText(page, "OrdoStage — Usage billing statement (continued)", L, y, 9, bold, grey);
      y -= 18;
      page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: lineGrey });
      y -= 16;
    }
  };

  // Header
  drawText(page, "ORDOSTAGE", L, y, 18, bold, dark);
  drawText(page, "USAGE BILLING STATEMENT", R - 168, y, 12, bold, dark);
  y -= 14;
  drawText(page, "Attachment for external invoice (not a tax invoice)", L, y, 8, regular, grey);
  drawText(page, data.statementRef, R - 168, y, 9, regular, grey);
  y -= 16;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: lineGrey });
  y -= 20;

  // Meta grid
  const metaLeft = [
    ["Statement ref", data.statementRef],
    ["Internal invoice id", data.invoiceId],
    ["Kind", kindLabel(data.invoiceKind)],
    ["Status", data.status],
    ["Plan", planLabel(data.billingPlan)],
  ] as const;
  const metaRight = [
    ["Period (UTC)", fmtPeriod(data.periodStart, data.periodEnd)],
    ["Issued", fmtDate(data.issuedAt)],
    ["Due", fmtDate(data.dueAt)],
    ["Currency", data.currency],
    ...(data.committedSeats != null
      ? [["Committed seats", String(data.committedSeats)] as const]
      : []),
  ] as const;

  const metaTop = y;
  let ly = metaTop;
  for (const [k, v] of metaLeft) {
    drawText(page, k, L, ly, 8, bold, grey);
    drawText(page, v, L + 110, ly, 8, regular, black);
    ly -= 12;
  }
  let ry = metaTop;
  for (const [k, v] of metaRight) {
    drawText(page, k, 320, ry, 8, bold, grey);
    drawText(page, v, 320 + 90, ry, 8, regular, black);
    ry -= 12;
  }
  y = Math.min(ly, ry) - 10;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: lineGrey });
  y -= 18;

  // Parties
  drawText(page, "From (seller)", L, y, 8, bold, grey);
  drawText(page, "Bill to (organisation)", 320, y, 8, bold, grey);
  y -= 13;
  const sellerLines = [data.sellerName, data.sellerAddress, `VAT: ${data.sellerVat}`, data.sellerEmail];
  const buyerLines = [
    data.buyerName,
    ...data.buyerAddressLines,
    data.buyerVat ? `VAT: ${data.buyerVat}` : null,
    data.buyerEmail ? `Email: ${data.buyerEmail}` : null,
    data.buyerPhone ? `Phone: ${data.buyerPhone}` : null,
    data.buyerContact ? `Contact: ${data.buyerContact}` : null,
  ].filter(Boolean) as string[];

  const partyTop = y;
  let sy = partyTop;
  for (const line of sellerLines) {
    drawText(page, line, L, sy, 9, regular, black);
    sy -= 12;
  }
  let by = partyTop;
  for (const line of buyerLines) {
    drawText(page, line, 320, by, 9, regular, black);
    by -= 12;
  }
  y = Math.min(sy, by) - 12;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: lineGrey });
  y -= 18;

  // Table header
  ensureSpace(40);
  page.drawRectangle({ x: L, y: y - 4, width: contentWidth, height: 18, color: dark });
  drawText(page, "Description", L + 6, y, 8, bold, rgb(1, 1, 1));
  drawText(page, "Days", R - 168, y, 8, bold, rgb(1, 1, 1));
  drawText(page, "Monthly", R - 118, y, 8, bold, rgb(1, 1, 1));
  drawText(page, "Amount", R - 58, y, 8, bold, rgb(1, 1, 1));
  y -= 22;

  for (const line of data.lines) {
    const descLines = wrapText(line.description, regular, 8, 280);
    const detailLines = line.detail ? wrapText(line.detail, regular, 7, 280) : [];
    const blockH = 12 * (descLines.length + detailLines.length) + 6;
    ensureSpace(blockH + 8);

    let ty = y;
    for (const dl of descLines) {
      drawText(page, dl, L + 6, ty, 8, regular, black);
      ty -= 11;
    }
    for (const dl of detailLines) {
      drawText(page, dl, L + 6, ty, 7, regular, grey);
      ty -= 10;
    }
    drawText(page, String(line.quantity), R - 168, y, 8, regular, black);
    drawText(page, money(line.unitCents, data.currency), R - 118, y, 8, regular, black);
    drawText(page, money(line.amountCents, data.currency), R - 58, y, 8, regular, black);
    y = ty - 4;
    page.drawLine({ start: { x: L, y: y + 8 }, end: { x: R, y: y + 8 }, thickness: 0.4, color: lineGrey });
  }

  y -= 8;
  ensureSpace(70);
  const totalsX = R - 200;
  drawText(page, "Subtotal", totalsX, y, 9, regular, grey);
  drawText(page, money(data.subtotalCents, data.currency), R - 58, y, 9, regular, black);
  y -= 14;
  if (data.discountCents > 0) {
    drawText(page, `Discount (${data.discountPercent}%)`, totalsX, y, 9, regular, grey);
    drawText(page, `−${money(data.discountCents, data.currency)}`, R - 58, y, 9, regular, black);
    y -= 14;
  }
  page.drawRectangle({ x: totalsX - 8, y: y - 4, width: R - (totalsX - 8), height: 20, color: rgb(0.95, 0.95, 0.96) });
  drawText(page, "Total due (excl. VAT)", totalsX, y, 10, bold, dark);
  drawText(page, money(data.totalCents, data.currency), R - 58, y, 10, bold, dark);
  y -= 28;

  ensureSpace(60);
  drawText(page, "Notes for invoicing", L, y, 8, bold, grey);
  y -= 12;
  const notes = [
    "This document is a usage / billing statement for OrdoStage subscription charges.",
    "Flex seats are billed postpaid for the previous calendar month. Mid-month joins are prorated by UTC days from membership start.",
    "It is intended as an attachment to your official tax invoice from your invoicing system.",
    "Amounts are exclusive of VAT unless your invoicing system applies VAT separately.",
    `Match this attachment using statement ref ${data.statementRef}.`,
  ];
  for (const note of notes) {
    const wrapped = wrapText(note, regular, 8, contentWidth);
    ensureSpace(wrapped.length * 11 + 4);
    for (const wl of wrapped) {
      drawText(page, wl, L, y, 8, regular, grey);
      y -= 11;
    }
    y -= 2;
  }

  // Footer on last page
  page.drawLine({ start: { x: L, y: 46 }, end: { x: R, y: 46 }, thickness: 0.5, color: lineGrey });
  drawText(
    page,
    `${data.sellerName} · ${data.sellerAddress} · ${data.sellerVat} · ${data.sellerEmail}`,
    L,
    34,
    7,
    regular,
    grey
  );

  return doc.save();
}

export function buildBuyerAddressLines(org: {
  invoiceStreet?: string | null;
  invoiceNumber?: string | null;
  invoiceZip?: string | null;
  invoiceCity?: string | null;
  invoiceState?: string | null;
  invoiceCountry?: string | null;
}): string[] {
  const street = [org.invoiceStreet, org.invoiceNumber].filter(Boolean).join(" ").trim();
  const cityLine = [org.invoiceZip, org.invoiceCity].filter(Boolean).join(" ").trim();
  return [street, cityLine, org.invoiceState?.trim() || "", org.invoiceCountry?.trim() || ""].filter(
    Boolean
  );
}

export function statementRefForInvoice(invoice: {
  id: string;
  periodStart: Date;
  organizationId: string;
}): string {
  const ym = invoice.periodStart.toISOString().slice(0, 7).replace("-", "");
  return `OS-${ym}-${invoice.id.slice(-8).toUpperCase()}`;
}
