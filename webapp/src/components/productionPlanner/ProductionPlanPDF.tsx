import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { ProductionPlannerRow } from "@/lib/types";
import { formatMoneyFromCents } from "@/lib/formatMoney";
import {
  PRODUCTION_STATUS_LABELS,
  TASK_CATEGORY_LABELS,
} from "@/lib/productionPlannerTheme";
import { ProductionGanttPdfChart } from "@/components/productionPlanner/ProductionGanttPdfChart";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111",
    backgroundColor: "#fff",
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#111",
    paddingBottom: 12,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 10,
    color: "#555",
  },
  section: {
    marginBottom: 18,
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
  noteText: {
    fontSize: 9.5,
    color: "#333",
    lineHeight: 1.4,
  },
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
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#111",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#666",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  tableCell: {
    fontSize: 9,
    color: "#222",
  },
  critical: {
    color: "#b91c1c",
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#ccc",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7.5,
    color: "#888",
  },
  ganttPage: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 36,
  },
});

function formatPdfDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateRange(row: ProductionPlannerRow): string {
  if (row.startDate && row.endDate) {
    return `${formatPdfDate(`${row.startDate}T12:00:00`)} — ${formatPdfDate(`${row.endDate}T12:00:00`)}`;
  }
  if (row.premiereDate) return `Premiere ${formatPdfDate(`${row.premiereDate}T12:00:00`)}`;
  return "Dates TBD";
}

function phaseLines(row: ProductionPlannerRow) {
  return row.ganttLines
    .filter((l) => l.kind === "phase")
    .sort((a, b) => a.task.start.localeCompare(b.task.start));
}

export function ProductionPlanPDF({ row }: { row: ProductionPlannerRow }) {
  const generatedDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const statusLabel = PRODUCTION_STATUS_LABELS[row.status] ?? row.status;
  const phases = phaseLines(row);

  return (
    <Document title={`${row.title} — Production Plan`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{row.title}</Text>
          <Text style={styles.headerSubtitle}>
            Production Plan · {statusLabel} · {formatDateRange(row)}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.infoGrid}>
            {row.venueLabel ? (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Venue</Text>
                <Text style={styles.infoValue}>{row.venueLabel}</Text>
              </View>
            ) : null}
            {row.leadPersonName ? (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Production lead</Text>
                <Text style={styles.infoValue}>{row.leadPersonName}</Text>
              </View>
            ) : null}
            {row.premiereDate ? (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Premiere</Text>
                <Text style={styles.infoValue}>
                  {formatPdfDate(`${row.premiereDate}T12:00:00`)}
                </Text>
              </View>
            ) : null}
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Budget (planned)</Text>
              <Text style={styles.infoValue}>
                {formatMoneyFromCents(row.costSummary.plannedCents, row.costSummary.currencyCode)}
              </Text>
            </View>
          </View>
        </View>

        {row.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.noteText}>{row.description}</Text>
          </View>
        ) : null}

        {row.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.noteText}>{row.notes}</Text>
          </View>
        ) : null}

        {row.teams.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Teams ({row.teams.length})</Text>
            {row.teams.map((t) => (
              <View key={t.id} style={styles.personRow}>
                <Text style={styles.personName}>{t.team.name}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {row.people.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Crew ({row.people.length})</Text>
            {row.people.map((pp) => (
              <View key={pp.id} style={styles.personRow}>
                <Text style={styles.personName}>{pp.person.name}</Text>
                <Text style={styles.personRole}>{pp.role ?? pp.person.role ?? "—"}</Text>
                <Text style={styles.personContact}>
                  {[pp.person.phone, pp.person.email].filter(Boolean).join(" · ") || "—"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated {generatedDate}</Text>
          <Text style={styles.footerText}>Confidential — Internal use only</Text>
        </View>
      </Page>

      {phases.length > 0 ? (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{row.title}</Text>
            <Text style={styles.headerSubtitle}>Timeline · {phases.length} phases</Text>
          </View>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { width: "28%" }]}>Phase</Text>
            <Text style={[styles.tableHeaderCell, { width: "14%" }]}>Category</Text>
            <Text style={[styles.tableHeaderCell, { width: "22%" }]}>Dates</Text>
            <Text style={[styles.tableHeaderCell, { width: "16%" }]}>Assignee</Text>
            <Text style={[styles.tableHeaderCell, { width: "10%" }]}>Status</Text>
            <Text style={[styles.tableHeaderCell, { width: "10%" }]}>Progress</Text>
          </View>

          {phases.map((line) => {
            const start = formatPdfDate(line.task.start);
            const end =
              line.task.phaseKind === "span" ? formatPdfDate(line.task.end) : start;
            const dates =
              line.task.phaseKind === "span" && start !== end ? `${start} – ${end}` : start;
            return (
              <View key={line.lineId} style={styles.tableRow}>
                <Text
                  style={[
                    styles.tableCell,
                    { width: "28%" },
                    line.isCritical ? styles.critical : {},
                  ]}
                >
                  {line.label}
                  {line.isCritical ? " *" : ""}
                </Text>
                <Text style={[styles.tableCell, { width: "14%" }]}>
                  {TASK_CATEGORY_LABELS[line.category] ?? line.category}
                </Text>
                <Text style={[styles.tableCell, { width: "22%" }]}>{dates}</Text>
                <Text style={[styles.tableCell, { width: "16%" }]}>
                  {line.assigneeName ?? "—"}
                </Text>
                <Text style={[styles.tableCell, { width: "10%" }]}>
                  {(line.status ?? "planned").replace(/_/g, " ")}
                </Text>
                <Text style={[styles.tableCell, { width: "10%" }]}>
                  {line.task.progressPercent != null ? `${line.task.progressPercent}%` : "—"}
                </Text>
              </View>
            );
          })}

          <Text style={[styles.footerText, { marginTop: 12 }]}>* Critical path</Text>

          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>Generated {generatedDate}</Text>
            <Text style={styles.footerText}>{row.title} — Production Plan</Text>
          </View>
        </Page>
      ) : null}

      {row.ganttLines.length > 0 ? (
        <Page size="A4" orientation="landscape" style={styles.ganttPage}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{row.title}</Text>
            <Text style={styles.headerSubtitle}>Planner calendar · dependency arrows</Text>
          </View>
          <ProductionGanttPdfChart row={row} />
          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>Generated {generatedDate}</Text>
            <Text style={styles.footerText}>{row.title} — Gantt</Text>
          </View>
        </Page>
      ) : null}
    </Document>
  );
}

export async function downloadProductionPlanPDF(row: ProductionPlannerRow): Promise<void> {
  const blob = await pdf(<ProductionPlanPDF row={row} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${row.title.replace(/\s+/g, "-")}-production-plan.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
