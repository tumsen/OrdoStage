/** Stored on `PersonDocument.type` — used for uploads and row editors. */
export const PERSON_DOCUMENT_TYPE_OPTIONS = [
  "passport",
  "driver_license",
  "certificate",
  "visa",
  "contract",
  "medical",
  "drawing",
  "image",
  "document",
  "other",
] as const;

export type PersonDocumentTypeKey = (typeof PERSON_DOCUMENT_TYPE_OPTIONS)[number];

const LABELS: Record<PersonDocumentTypeKey, string> = {
  passport: "Passport",
  driver_license: "Driver license",
  certificate: "Certificate",
  visa: "Visa",
  contract: "Contract",
  medical: "Medical",
  drawing: "Drawing",
  image: "Image",
  document: "Document",
  other: "Other",
};

export function personDocumentTypeLabel(value: string): string {
  if ((PERSON_DOCUMENT_TYPE_OPTIONS as readonly string[]).includes(value)) {
    return LABELS[value as PersonDocumentTypeKey];
  }
  return value.replace(/_/g, " ");
}
