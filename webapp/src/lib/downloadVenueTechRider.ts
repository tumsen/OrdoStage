import { PDFDocument } from "pdf-lib";
import { pdf } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import React from "react";
import type { JSXElementConstructor, ReactElement } from "react";
import { VenueTechRiderCoverDoc } from "@/components/VenueTechRiderPDF";
import type { TourDetail, TourShow } from "../../../backend/src/types";

export async function downloadVenueTechRider(
  tour: TourDetail,
  show: TourShow
): Promise<void> {
  // 1. Generate the variable cover page as PDF bytes
  const coverElement = React.createElement(VenueTechRiderCoverDoc, {
    tour,
    show,
    // Double-cast through unknown because @react-pdf/renderer's pdf() expects
    // ReactElement<DocumentProps> but createElement returns a narrower type.
  }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
  const coverBlob = await pdf(coverElement).toBlob();
  const coverBuffer = await coverBlob.arrayBuffer();

  // 2. Try to fetch the static tech rider PDF (if one was uploaded)
  let staticBuffer: ArrayBuffer | null = null;
  if (tour.techRiderPdfName) {
    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
      const resp = await fetch(
        `${baseUrl}/api/tours/${tour.id}/tech-rider/download`,
        { credentials: "include" }
      );
      if (resp.ok) {
        staticBuffer = await resp.arrayBuffer();
      }
    } catch {
      // Static PDF unavailable, proceed with cover only
    }
  }

  // 3. Merge PDFs: cover first, then static rider pages
  let finalBytes: Uint8Array;

  if (staticBuffer) {
    const merged = await PDFDocument.create();

    const coverDoc = await PDFDocument.load(coverBuffer);
    const coverPagesCopied = await merged.copyPages(coverDoc, coverDoc.getPageIndices());
    coverPagesCopied.forEach((p) => merged.addPage(p));

    const staticDoc = await PDFDocument.load(staticBuffer);
    const staticPagesCopied = await merged.copyPages(staticDoc, staticDoc.getPageIndices());
    staticPagesCopied.forEach((p) => merged.addPage(p));

    finalBytes = await merged.save();
  } else {
    // No static PDF — just serve the cover page
    const coverDoc = await PDFDocument.load(coverBuffer);
    finalBytes = await coverDoc.save();
  }

  // 4. Trigger browser download
  // Wrap in ArrayBuffer to satisfy BlobPart type (avoids SharedArrayBuffer issue)
  const blob = new Blob([finalBytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const venueName = (
    show.venueName ||
    show.venueCity ||
    show.date.slice(0, 10)
  ).replace(/\s+/g, "-");
  a.download = `tech-rider-${venueName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
