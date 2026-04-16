import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TourDetail, TourShow } from "../../../backend/src/types";

const S = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111",
    backgroundColor: "#fff",
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 48,
  },
  // Big header block
  heroBlock: {
    backgroundColor: "#111",
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 20,
  },
  heroLabel: {
    fontSize: 7.5,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 6,
  },
  heroTour: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#fff",
    marginBottom: 4,
  },
  heroDate: {
    fontSize: 11,
    color: "#ccc",
  },
  heroVenue: {
    fontSize: 9,
    color: "#aaa",
    marginTop: 2,
  },
  // Two-column grid
  twoCol: { flexDirection: "row", gap: 16, marginBottom: 14 },
  col: { flex: 1 },
  // Section
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    paddingBottom: 3,
    marginBottom: 7,
  },
  row: { flexDirection: "row", marginBottom: 4 },
  rowLabel: { fontSize: 8.5, color: "#666", width: 90 },
  rowValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111", flex: 1 },
  // Address
  addressLine: { fontSize: 9, color: "#444", marginBottom: 2 },
  // Contact row
  contactRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 3 },
  contactName: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#111" },
  contactDetail: { fontSize: 8.5, color: "#555" },
  // Notes
  noteText: { fontSize: 9, color: "#444", lineHeight: 1.5 },
  // Footer line
  footerLine: {
    borderTopWidth: 1,
    borderTopColor: "#111",
    paddingTop: 8,
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: "#555" },
  footerBold: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#111" },
});

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={S.row}>
      <Text style={S.rowLabel}>{label}</Text>
      <Text style={S.rowValue}>{value}</Text>
    </View>
  );
}

export function VenueTechRiderCoverDoc({
  tour,
  show,
}: {
  tour: TourDetail;
  show: TourShow;
}) {
  const formattedDate = (() => {
    const d = new Date(show.date);
    if (isNaN(d.getTime())) return show.date;
    return d.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  })();

  const venueLabel = [show.venueName, show.venueCity].filter(Boolean).join(", ");
  const handsNeeded = show.handsNeeded ?? tour.handsNeeded;
  const showDuration = tour.showDuration;
  const hasSchedule =
    show.getInTime ||
    show.rehearsalTime ||
    show.soundcheckTime ||
    show.doorsTime ||
    show.showTime;
  const hasContact = show.contactName || show.contactPhone || show.contactEmail;
  const hasHotel = show.hotelName || show.hotelAddress;

  return (
    <Document title={`Tech Rider — ${venueLabel || formattedDate}`}>
      <Page size="A4" style={S.page}>
        {/* Hero header */}
        <View style={S.heroBlock}>
          <Text style={S.heroLabel}>Venue Tech Rider</Text>
          <Text style={S.heroTour}>{tour.name}</Text>
          <Text style={S.heroDate}>{formattedDate}</Text>
          {venueLabel ? <Text style={S.heroVenue}>{venueLabel}</Text> : null}
        </View>

        {/* Venue address */}
        {show.venueAddress ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={S.sectionTitle}>Venue</Text>
            <Text style={S.addressLine}>{show.venueAddress}</Text>
          </View>
        ) : null}

        {/* Schedule + Crew side by side */}
        {(hasSchedule || showDuration || handsNeeded) ? (
          <View style={S.twoCol}>
            {/* Schedule */}
            {(hasSchedule || showDuration) ? (
              <View style={S.col}>
                <Text style={S.sectionTitle}>Schedule</Text>
                <Row label="Arrival / Get-in" value={show.getInTime} />
                <Row label="Rehearsal" value={show.rehearsalTime} />
                <Row label="Soundcheck" value={show.soundcheckTime} />
                <Row label="Doors open" value={show.doorsTime} />
                <Row label="Show time" value={show.showTime} />
                <Row label="Duration" value={showDuration} />
              </View>
            ) : null}

            {/* Crew */}
            {handsNeeded ? (
              <View style={S.col}>
                <Text style={S.sectionTitle}>Crew Required</Text>
                <Row label="Hands needed" value={String(handsNeeded)} />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Venue contact */}
        {hasContact ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={S.sectionTitle}>Venue Contact</Text>
            <View style={S.contactRow}>
              {show.contactName ? (
                <Text style={S.contactName}>{show.contactName}</Text>
              ) : null}
              {show.contactPhone ? (
                <Text style={S.contactDetail}>{show.contactPhone}</Text>
              ) : null}
              {show.contactEmail ? (
                <Text style={S.contactDetail}>{show.contactEmail}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Hotel */}
        {hasHotel ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={S.sectionTitle}>Hotel</Text>
            {show.hotelName ? (
              <Text style={[S.contactName, { marginBottom: 2 }]}>{show.hotelName}</Text>
            ) : null}
            {show.hotelAddress ? (
              <Text style={S.addressLine}>{show.hotelAddress}</Text>
            ) : null}
            {(show.hotelCheckIn || show.hotelCheckOut) ? (
              <Text style={S.contactDetail}>
                {[
                  show.hotelCheckIn ? `Check-in: ${show.hotelCheckIn}` : null,
                  show.hotelCheckOut ? `Check-out: ${show.hotelCheckOut}` : null,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Notes */}
        {(show.notes || tour.riderNotes) ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={S.sectionTitle}>Notes</Text>
            {show.notes ? <Text style={S.noteText}>{show.notes}</Text> : null}
            {tour.riderNotes ? (
              <Text style={[S.noteText, { marginTop: 4 }]}>{tour.riderNotes}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Footer */}
        <View style={S.footerLine}>
          <Text style={S.footerText}>
            {tour.tourManagerName ? `Tour Manager: ${tour.tourManagerName}` : ""}
            {tour.tourManagerPhone ? `  ·  ${tour.tourManagerPhone}` : ""}
          </Text>
          {tour.techRiderPdfName ? (
            <Text style={S.footerBold}>Technical specifications follow →</Text>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
