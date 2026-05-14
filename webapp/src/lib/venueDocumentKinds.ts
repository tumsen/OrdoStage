import type { VenueDocument } from "@/lib/types";

const LABELS: Record<VenueDocument["kind"], string> = {
  drawing: "Drawing",
  image: "Image",
  document: "Document",
  other: "Other",
};

export function venueDocumentKindLabel(kind: VenueDocument["kind"]): string {
  return LABELS[kind] ?? kind;
}
