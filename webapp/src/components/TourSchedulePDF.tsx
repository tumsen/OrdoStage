import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Link,
} from "@react-pdf/renderer";
import type { TourDetail, TourShow } from "../../../backend/src/types";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111",
    backgroundColor: "#fff",
    paddingTop: 48,
    paddingBottom: 56,
    paddingLeft: 48,
    paddingRight: 112,
  },
  // Header
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#111",
    paddingBottom: 12,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 10,
    color: "#555",
  },
  headerMeta: {
    flexDirection: "row",
    gap: 24,
    marginTop: 8,
  },
  headerMetaItem: {
    flexDirection: "row",
    gap: 4,
  },
  headerMetaLabel: {
    fontSize: 8,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerMetaValue: {
    fontSize: 9,
    color: "#222",
  },
  // Section
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    paddingBottom: 4,
    marginBottom: 8,
  },
  // Info grid
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  infoItem: {
    width: "46%",
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 7.5,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 9.5,
    color: "#222",
  },
  // People list
  personRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  personName: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    width: "35%",
  },
  personRole: {
    fontSize: 9,
    color: "#555",
    width: "25%",
  },
  personContact: {
    fontSize: 8.5,
    color: "#777",
    flex: 1,
  },
  // Show card
  showCard: {
    borderWidth: 0.5,
    borderColor: "#ddd",
    borderRadius: 3,
    marginBottom: 16,
    overflow: "hidden",
  },
  showCardHeader: {
    backgroundColor: "#111",
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  showDayNumber: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#fff",
  },
  showDate: {
    fontSize: 9.5,
    color: "#bbb",
  },
  showCity: {
    fontSize: 9,
    color: "#aaa",
    textAlign: "right",
  },
  showCardBody: {
    padding: 12,
  },
  showBlock: {
    marginBottom: 10,
  },
  showBlockTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 5,
    borderBottomWidth: 0.3,
    borderBottomColor: "#eee",
    paddingBottom: 2,
  },
  timelineRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  timelineLabel: {
    fontSize: 8.5,
    color: "#666",
    width: 100,
  },
  timelineValue: {
    fontSize: 9,
    color: "#111",
    fontFamily: "Helvetica-Bold",
  },
  twoColGrid: {
    flexDirection: "row",
    gap: 12,
  },
  twoColCell: {
    flex: 1,
  },
  cellLabel: {
    fontSize: 7.5,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  cellValue: {
    fontSize: 9,
    color: "#222",
  },
  noteText: {
    fontSize: 9,
    color: "#444",
    lineHeight: 1.5,
  },
  // Calendar sidebar
  calSidebar: {
    position: "absolute",
    right: 8,
    top: 48,
    bottom: 56,
    width: 94,
    borderLeftWidth: 0.5,
    borderLeftColor: "#e0e0e0",
    paddingLeft: 8,
    overflow: "hidden",
  },
  calTitle: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    paddingBottom: 3,
  },
  calWeekRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 1,
  },
  calWeekNum: {
    fontSize: 5.5,
    color: "#bbb",
    width: 14,
    textAlign: "right",
  },
  calWeekLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: "#f0f0f0",
    marginLeft: 2,
  },
  calDayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 0.5,
    paddingHorizontal: 1,
    marginBottom: 0.5,
  },
  calWeekendRow: {
    backgroundColor: "#fdf8f3",
    borderRadius: 1,
  },
  calDayNum: {
    fontSize: 7,
    width: 12,
    textAlign: "right",
    color: "#777",
  },
  calWeekendDayNum: {
    color: "#b45309",
    fontFamily: "Helvetica-Bold",
  },
  calDayName: {
    fontSize: 6,
    width: 12,
    marginLeft: 2,
    color: "#bbb",
  },
  calWeekendDayName: {
    color: "#d97706",
  },
  calMonthLabel: {
    fontSize: 5.5,
    color: "#bbb",
    marginLeft: 1,
  },
  calBadge: {
    marginLeft: 2,
    borderRadius: 1,
    paddingHorizontal: 2,
    paddingVertical: 0.5,
  },
  calBadgeShow: {
    backgroundColor: "#fef2f2",
  },
  calBadgeTravel: {
    backgroundColor: "#eff6ff",
  },
  calBadgeDayOff: {
    backgroundColor: "#f0fdf4",
  },
  calBadgeText: {
    fontSize: 5.5,
  },
  calBadgeTextShow: {
    color: "#dc2626",
  },
  calBadgeTextTravel: {
    color: "#2563eb",
  },
  calBadgeTextDayOff: {
    color: "#16a34a",
  },
  calMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f0f0f0",
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginTop: 4,
    marginBottom: 2,
  },
  calMonthHeader: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  calMonthWeekNum: {
    fontSize: 5.5,
    color: "#999",
  },
  calEmptyDot: {
    fontSize: 7,
    color: "#ddd",
    marginLeft: 3,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 112,
    borderTopWidth: 0.5,
    borderTopColor: "#ccc",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7.5,
    color: "#999",
  },
  pageNumber: {
    fontSize: 7.5,
    color: "#999",
  },
  confidential: {
    fontSize: 7.5,
    color: "#bbb",
    fontFamily: "Helvetica-Oblique",
  },
  travelSection: {
    marginVertical: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f8f8f8",
    borderRadius: 3,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  travelLabel: {
    fontSize: 7.5,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  travelValue: {
    fontSize: 8.5,
    color: "#333",
    fontFamily: "Helvetica-Bold",
  },
  etdHighlight: {
    fontSize: 8.5,
    color: "#b45309",
    fontFamily: "Helvetica-Bold",
  },
  addressLink: {
    fontSize: 9,
    color: "#1d4ed8",
    textDecoration: "underline",
  },
});

function getISOWeekPDF(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function addDaysPDF(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getISOWeekStartPDF(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const dow = r.getDay();
  r.setDate(r.getDate() - ((dow + 6) % 7));
  return r;
}

const DOW_PDF = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function formatPDFDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTourDateRange(shows: TourShow[]): string {
  if (shows.length === 0) return "No shows scheduled";
  const sorted = [...shows].sort((a, b) => a.date.localeCompare(b.date));
  const first = new Date(sorted[0].date);
  const last = new Date(sorted[sorted.length - 1].date);
  const fmtShort = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fmtShort(first)} – ${fmtShort(last)}`;
}

function TimeRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.timelineRow}>
      <Text style={styles.timelineLabel}>{label}</Text>
      <Text style={styles.timelineValue}>{value}</Text>
    </View>
  );
}

function InfoCell({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.twoColCell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

function ShowSection({ show, dayNumber }: { show: TourShow; dayNumber: number }) {
  const hasTimeline =
    show.getInTime || show.rehearsalTime || show.soundcheckTime || show.doorsTime || show.showTime;
  const hasContact = show.contactName || show.contactPhone || show.contactEmail;
  const hasHotel = show.hotelName || show.hotelAddress || show.hotelPhone || show.hotelCheckIn || show.hotelCheckOut;
  const hasTravelOrCatering = show.travelInfo || show.cateringInfo;

  return (
    <View style={styles.showCard} wrap={false}>
      {/* Header */}
      <View style={styles.showCardHeader}>
        <View>
          <Text style={styles.showDayNumber}>Day {dayNumber}</Text>
          <Text style={styles.showDate}>{formatPDFDate(show.date)}</Text>
        </View>
        <View>
          {show.venueCity ? <Text style={styles.showCity}>{show.venueCity}</Text> : null}
          {show.venueName ? (
            <Text style={[styles.showCity, { fontFamily: "Helvetica-Bold", color: "#ddd" }]}>
              {show.venueName}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.showCardBody}>
        {/* Venue address */}
        {show.venueAddress ? (
          <View style={[styles.showBlock, { marginBottom: 8 }]}>
            <Text style={[styles.cellLabel, { marginBottom: 2 }]}>Venue Address</Text>
            <Link src={`https://maps.google.com/?q=${encodeURIComponent(show.venueAddress ?? "")}`} style={styles.addressLink}>
              {show.venueAddress}
            </Link>
          </View>
        ) : null}

        {/* Timeline */}
        {hasTimeline ? (
          <View style={styles.showBlock}>
            <Text style={styles.showBlockTitle}>Schedule</Text>
            <TimeRow label="Get-in" value={show.getInTime} />
            <TimeRow label="Rehearsal" value={show.rehearsalTime} />
            <TimeRow label="Soundcheck" value={show.soundcheckTime} />
            <TimeRow label="Doors" value={show.doorsTime} />
            <TimeRow label="Show time" value={show.showTime} />
          </View>
        ) : null}

        {/* Contact */}
        {hasContact ? (
          <View style={styles.showBlock}>
            <Text style={styles.showBlockTitle}>Venue Contact</Text>
            <View style={styles.twoColGrid}>
              <InfoCell label="Name" value={show.contactName} />
              <InfoCell label="Phone" value={show.contactPhone} />
            </View>
            {show.contactEmail ? (
              <View style={{ marginTop: 4 }}>
                <InfoCell label="Email" value={show.contactEmail} />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Hotel */}
        {hasHotel ? (
          <View style={styles.showBlock}>
            <Text style={styles.showBlockTitle}>Hotel</Text>
            {show.hotelName ? (
              <Text style={[styles.cellValue, { fontFamily: "Helvetica-Bold", marginBottom: 3 }]}>
                {show.hotelName}
              </Text>
            ) : null}
            <View style={styles.twoColGrid}>
              {show.hotelAddress ? (
                <View style={styles.twoColCell}>
                  <Text style={styles.cellLabel}>Address</Text>
                  <Link src={`https://maps.google.com/?q=${encodeURIComponent(show.hotelAddress ?? "")}`} style={styles.addressLink}>
                    {show.hotelAddress}
                  </Link>
                </View>
              ) : null}
              <InfoCell label="Phone" value={show.hotelPhone} />
            </View>
            <View style={[styles.twoColGrid, { marginTop: 4 }]}>
              <InfoCell label="Check-in" value={show.hotelCheckIn} />
              <InfoCell label="Check-out" value={show.hotelCheckOut} />
            </View>
          </View>
        ) : null}

        {/* Travel & Catering */}
        {hasTravelOrCatering ? (
          <View style={styles.showBlock}>
            <View style={styles.twoColGrid}>
              {show.travelInfo ? (
                <View style={styles.twoColCell}>
                  <Text style={styles.showBlockTitle}>Travel Info</Text>
                  <Text style={styles.noteText}>{show.travelInfo}</Text>
                </View>
              ) : null}
              {show.cateringInfo ? (
                <View style={styles.twoColCell}>
                  <Text style={styles.showBlockTitle}>Catering</Text>
                  <Text style={styles.noteText}>{show.cateringInfo}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Notes */}
        {show.notes ? (
          <View style={styles.showBlock}>
            <Text style={styles.showBlockTitle}>Notes</Text>
            <Text style={styles.noteText}>{show.notes}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function TravelToNext({ currentShow, nextShow }: { currentShow: TourShow; nextShow: TourShow }) {
  const hasTravelInfo = currentShow.travelTimeMinutes || currentShow.distanceKm;
  const nextVenue = [nextShow.venueCity, nextShow.venueName].filter(Boolean).join(", ");
  const currentAddr = currentShow.venueAddress || currentShow.venueName || "";
  const nextAddr = nextShow.venueAddress || nextShow.venueName || "";
  const directionsUrl = currentAddr && nextAddr
    ? `https://www.google.com/maps/dir/${encodeURIComponent(currentAddr)}/${encodeURIComponent(nextAddr)}`
    : null;

  const etd = (currentShow.travelTimeMinutes && nextShow.getInTime)
    ? (() => {
        const match = nextShow.getInTime!.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;
        let total = parseInt(match[1]) * 60 + parseInt(match[2]) - currentShow.travelTimeMinutes!;
        if (total < 0) total += 1440;
        const h = Math.floor(total / 60) % 24;
        const m = total % 60;
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      })()
    : null;

  if (!hasTravelInfo && !directionsUrl) return null;

  return (
    <View style={styles.travelSection}>
      <View>
        <Text style={styles.travelLabel}>Travel to Next</Text>
        {nextVenue ? <Text style={styles.travelValue}>{nextVenue}</Text> : null}
      </View>
      {currentShow.distanceKm ? (
        <View>
          <Text style={styles.travelLabel}>Distance</Text>
          <Text style={styles.travelValue}>{currentShow.distanceKm} km</Text>
        </View>
      ) : null}
      {currentShow.travelTimeMinutes ? (
        <View>
          <Text style={styles.travelLabel}>Travel Time</Text>
          <Text style={styles.travelValue}>
            {currentShow.travelTimeMinutes < 60
              ? `${currentShow.travelTimeMinutes} min`
              : `${Math.floor(currentShow.travelTimeMinutes / 60)}h${currentShow.travelTimeMinutes % 60 > 0 ? ` ${currentShow.travelTimeMinutes % 60}min` : ""}`}
          </Text>
        </View>
      ) : null}
      {etd ? (
        <View>
          <Text style={styles.travelLabel}>Latest ETD</Text>
          <Text style={styles.etdHighlight}>{etd}</Text>
        </View>
      ) : null}
      {directionsUrl ? (
        <View>
          <Link src={directionsUrl} style={styles.addressLink}>Open in Maps</Link>
        </View>
      ) : null}
    </View>
  );
}

function PDFCalendarSidebar({ shows, startDate }: { shows: TourShow[]; startDate: string }) {
  if (shows.length === 0) return null;

  const showsByDate = new Map<string, TourShow[]>();
  for (const show of shows) {
    const k = new Date(show.date).toISOString().slice(0, 10);
    if (!showsByDate.has(k)) showsByDate.set(k, []);
    showsByDate.get(k)!.push(show);
  }

  // 14 days starting from startDate
  const start = new Date(startDate + "T00:00:00");
  const days: Date[] = [];
  for (let i = 0; i < 14; i++) {
    days.push(addDaysPDF(start, i));
  }

  let lastWeekNum = -1;
  let lastMonth = -1;

  return (
    <View style={styles.calSidebar} fixed>
      <Text style={styles.calTitle}>Next 14 Days</Text>
      {days.map((day) => {
        const k = day.toISOString().slice(0, 10);
        const dayShows = showsByDate.get(k) ?? [];
        const dowIndex = (day.getDay() + 6) % 7;
        const isWeekend = dowIndex >= 5;
        const isMonday = dowIndex === 0;
        const weekNum = getISOWeekPDF(day);
        const month = day.getMonth();

        const showMonthSep = month !== lastMonth;
        const showWeekSep = isMonday && weekNum !== lastWeekNum && !showMonthSep;

        if (showMonthSep) lastMonth = month;
        if (isMonday) lastWeekNum = weekNum;

        return (
          <View key={k}>
            {/* Month separator */}
            {showMonthSep ? (
              <View style={styles.calMonthRow}>
                <Text style={styles.calMonthHeader}>
                  {day.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                </Text>
                <Text style={styles.calMonthWeekNum}>W{weekNum}</Text>
              </View>
            ) : null}
            {/* Week separator (only on Mondays where month didn't also change) */}
            {showWeekSep ? (
              <View style={styles.calWeekRow}>
                <Text style={styles.calWeekNum}>W{weekNum}</Text>
                <View style={styles.calWeekLine} />
              </View>
            ) : null}
            <View style={[styles.calDayRow, isWeekend ? styles.calWeekendRow : {}]}>
              <Text style={[styles.calDayNum, isWeekend ? styles.calWeekendDayNum : {}]}>
                {day.getDate()}
              </Text>
              <Text style={[styles.calDayName, isWeekend ? styles.calWeekendDayName : {}]}>
                {DOW_PDF[dowIndex]}
              </Text>
              {dayShows.length === 0 ? (
                <Text style={styles.calEmptyDot}>·</Text>
              ) : null}
              {dayShows.map((show) => {
                const isTravel = show.type === "travel";
                const isDayOff = show.type === "day_off";
                const time = show.showTime ?? show.getInTime;
                const label = isTravel
                  ? "Travel"
                  : isDayOff
                  ? "Day off"
                  : show.venueName?.slice(0, 8) ?? show.venueCity?.slice(0, 8) ?? "Show";
                return (
                  <View
                    key={show.id}
                    style={[
                      styles.calBadge,
                      isTravel ? styles.calBadgeTravel : isDayOff ? styles.calBadgeDayOff : styles.calBadgeShow,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calBadgeText,
                        isTravel ? styles.calBadgeTextTravel : isDayOff ? styles.calBadgeTextDayOff : styles.calBadgeTextShow,
                      ]}
                    >
                      {time ? `${time} ` : ""}{label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function TourSchedulePDF({ tour }: { tour: TourDetail }) {
  const sortedShows = [...tour.shows].sort((a, b) => a.date.localeCompare(b.date));
  const generatedDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const statusLabel =
    tour.status === "active" ? "Active" : tour.status === "completed" ? "Completed" : "Draft";

  return (
    <Document title={`${tour.name} — Tour Schedule`}>
      {/* Cover / Overview page */}
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{tour.name}</Text>
          <Text style={styles.headerSubtitle}>
            Tour Schedule · {statusLabel} · {formatTourDateRange(sortedShows)}
          </Text>
        </View>

        {/* Tour Manager */}
        {(tour.tourManagerName || tour.tourManagerPhone || tour.tourManagerEmail) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tour Manager</Text>
            <View style={styles.infoGrid}>
              {tour.tourManagerName ? (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Name</Text>
                  <Text style={styles.infoValue}>{tour.tourManagerName}</Text>
                </View>
              ) : null}
              {tour.tourManagerPhone ? (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{tour.tourManagerPhone}</Text>
                </View>
              ) : null}
              {tour.tourManagerEmail ? (
                <View style={[styles.infoItem, { width: "96%" }]}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{tour.tourManagerEmail}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Description */}
        {tour.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.noteText}>{tour.description}</Text>
          </View>
        ) : null}

        {/* Notes */}
        {tour.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tour Notes</Text>
            <Text style={styles.noteText}>{tour.notes}</Text>
          </View>
        ) : null}

        {/* People */}
        {tour.people.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cast & Crew ({tour.people.length})</Text>
            {tour.people.map((tp) => (
              <View key={tp.id} style={styles.personRow}>
                <Text style={styles.personName}>{tp.person.name}</Text>
                <Text style={styles.personRole}>{tp.role ?? tp.person.role ?? "—"}</Text>
                <Text style={styles.personContact}>
                  {[tp.person.phone, tp.person.email].filter(Boolean).join(" · ") || "—"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Shows overview */}
        {sortedShows.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Shows Overview ({sortedShows.length} shows)</Text>
            {sortedShows.map((show, i) => (
              <View key={show.id} style={styles.personRow}>
                <Text style={[styles.personName, { width: "10%" }]}>Day {i + 1}</Text>
                <Text style={[styles.personRole, { width: "35%" }]}>{formatPDFDate(show.date)}</Text>
                <Text style={styles.personContact}>
                  {[show.venueCity, show.venueName].filter(Boolean).join(" · ") || "—"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated {generatedDate}</Text>
          <Text style={styles.confidential}>Confidential — For cast and crew only</Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
        <PDFCalendarSidebar shows={sortedShows} startDate={sortedShows[0]?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} />
      </Page>

      {/* One page per show */}
      {sortedShows.map((show, i) => {
        const nextShow = sortedShows[i + 1];
        const isDifferentDate = nextShow && show.date.slice(0, 10) !== nextShow.date.slice(0, 10);
        return (
          <Page key={show.id} size="A4" style={styles.page}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{tour.name}</Text>
              <Text style={styles.headerSubtitle}>Show Details</Text>
            </View>

            <ShowSection show={show} dayNumber={i + 1} />
            {isDifferentDate ? <TravelToNext currentShow={show} nextShow={nextShow} /> : null}

            <View style={styles.footer} fixed>
              <Text style={styles.footerText}>Generated {generatedDate}</Text>
              <Text style={styles.confidential}>Confidential — For cast and crew only</Text>
              <Text
                style={styles.pageNumber}
                render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
              />
            </View>
            <PDFCalendarSidebar shows={sortedShows} startDate={show.date.slice(0, 10)} />
          </Page>
        );
      })}
    </Document>
  );
}

export async function downloadTourPDF(tour: TourDetail): Promise<void> {
  const blob = await pdf(<TourSchedulePDF tour={tour} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${tour.name.replace(/\s+/g, "-")}-schedule.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
