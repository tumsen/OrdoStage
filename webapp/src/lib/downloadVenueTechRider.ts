import { PDFDocument } from "pdf-lib";
import { pdf } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import React from "react";
import type { JSXElementConstructor, ReactElement } from "react";
import { VenueTechRiderCoverDoc } from "@/components/VenueTechRiderPDF";
import type { TourDetail, TourShow } from "../../../backend/src/types";

// ── Internal helper: generate the merged PDF blob ────────────────────────────

async function generateVenueTechRiderBlob(
  tour: TourDetail,
  show: TourShow
): Promise<Blob> {
  // 1. Generate the variable cover page
  const coverElement = React.createElement(
    VenueTechRiderCoverDoc,
    { tour, show }
  ) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;
  const coverBlob = await pdf(coverElement).toBlob();
  const coverBuffer = await coverBlob.arrayBuffer();

  // 2. Try to fetch the uploaded static tech rider PDF
  let staticBuffer: ArrayBuffer | null = null;
  if (tour.techRiderPdfName) {
    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
      const resp = await fetch(
        `${baseUrl}/api/tours/${tour.id}/tech-rider/download`,
        { credentials: "include" }
      );
      if (resp.ok) staticBuffer = await resp.arrayBuffer();
    } catch {
      // Static PDF unavailable — proceed with cover only
    }
  }

  // 3. Merge: cover first, then static rider pages
  if (staticBuffer) {
    const merged = await PDFDocument.create();
    const coverDoc = await PDFDocument.load(coverBuffer);
    const staticDoc = await PDFDocument.load(staticBuffer);

    for (const p of await merged.copyPages(coverDoc, coverDoc.getPageIndices())) {
      merged.addPage(p);
    }
    for (const p of await merged.copyPages(staticDoc, staticDoc.getPageIndices())) {
      merged.addPage(p);
    }

    const bytes = await merged.save();
    return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  }

  // No static PDF — return just the cover
  const coverDoc = await PDFDocument.load(coverBuffer);
  const bytes = await coverDoc.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

function getVenueFileName(show: TourShow): string {
  return (
    (show.venueName || show.venueCity || show.date.slice(0, 10)).replace(/\s+/g, "-")
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Download the venue tech rider PDF to the user's device. */
export async function downloadVenueTechRider(
  tour: TourDetail,
  show: TourShow
): Promise<void> {
  const blob = await generateVenueTechRiderBlob(tour, show);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tech-rider-${getVenueFileName(show)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revoke so the download starts
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Open the venue tech rider PDF in a new browser tab (for printing). */
export async function printVenueTechRider(
  tour: TourDetail,
  show: TourShow
): Promise<void> {
  const blob = await generateVenueTechRiderBlob(tour, show);
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, "_blank");
  if (!tab) {
    // Popup blocked — fall back to download
    await downloadVenueTechRider(tour, show);
    return;
  }
  // Revoke after a generous delay so the tab can load and print
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/** Upload the venue tech rider PDF to storage, returns a public URL. */
export async function uploadVenueTechRiderForSharing(
  tour: TourDetail,
  show: TourShow
): Promise<string> {
  const blob = await generateVenueTechRiderBlob(tour, show);
  const filename = `tech-rider-${getVenueFileName(show)}.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });

  const formData = new FormData();
  formData.append("file", file);

  const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
  const resp = await fetch(
    `${baseUrl}/api/tours/${tour.id}/shows/${show.id}/venue-rider`,
    { method: "POST", body: formData, credentials: "include" }
  );
  if (!resp.ok) throw new Error("Upload failed");
  const trackingBaseUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
  const trackingUrl = `${trackingBaseUrl}/api/tours/${tour.id}/shows/${show.id}/venue-rider/track`;
  return trackingUrl;
}
