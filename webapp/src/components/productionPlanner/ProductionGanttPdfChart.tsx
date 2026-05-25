import { Path, Svg, Text, View, StyleSheet } from "@react-pdf/renderer";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { ProductionPlannerRow } from "@/lib/types";
import { buildGanttDependencyArrows } from "@/lib/productionGanttDependencies";
import { dateToPct } from "@/lib/productionGanttMath";
import { ganttTaskBoundsFromLines } from "@/lib/productionGanttRange";
import { PDF_GANTT_CATEGORY_FILL } from "@/lib/productionGanttPdfColors";
import { TASK_CATEGORY_LABELS } from "@/lib/productionPlannerTheme";

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  chartWrap: {
    flexDirection: "row",
    borderWidth: 0.5,
    borderColor: "#ddd",
  },
  labelCol: {
    width: 118,
    borderRightWidth: 0.5,
    borderRightColor: "#ddd",
    backgroundColor: "#f8f8f8",
  },
  labelRow: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    justifyContent: "center",
  },
  labelText: {
    fontSize: 7,
    color: "#222",
  },
  labelTextCritical: {
    fontSize: 7,
    color: "#b91c1c",
    fontFamily: "Helvetica-Bold",
  },
  chartArea: {
    width: 400,
    position: "relative",
    backgroundColor: "#fff",
  },
  chartHeader: {
    height: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 2,
  },
  monthTick: {
    position: "absolute",
    bottom: 2,
    fontSize: 6,
    color: "#888",
  },
  rowBg: {
    position: "absolute",
    left: 0,
    right: 0,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  bar: {
    position: "absolute",
    borderRadius: 2,
    opacity: 0.92,
  },
  legend: {
    marginTop: 6,
    fontSize: 7,
    color: "#666",
  },
});

const ROW_H = 14;
const CHART_W = 400;
const HEADER_H = 20;

function formatMonthTick(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function dependencyPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const midX = x1 + Math.max(10, (x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

export function ProductionGanttPdfChart({ row }: { row: ProductionPlannerRow }) {
  const lines = row.ganttLines.filter((l) => {
    const t = new Date(l.task.start).getTime();
    return Number.isFinite(t);
  });
  if (lines.length === 0) return null;

  const bounds = ganttTaskBoundsFromLines(
    lines.map((l) => ({ task: { start: l.task.start, end: l.task.end } }))
  );
  if (!bounds) return null;

  const rangeStart = parseISO(`${bounds.from}T00:00:00`);
  const rangeEnd = parseISO(`${bounds.to}T00:00:00`);
  const dayCount = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart) + 1);
  const bodyH = lines.length * ROW_H;
  const chartH = HEADER_H + bodyH;

  const arrows = buildGanttDependencyArrows(lines, rangeStart, rangeEnd);

  const monthTicks: { leftPct: number; label: string }[] = [];
  const tickCount = Math.min(12, dayCount);
  for (let i = 0; i <= tickCount; i++) {
    const pct = tickCount === 0 ? 0 : (i / tickCount) * 100;
    const dayOffset = Math.round((pct / 100) * (dayCount - 1));
    const d = new Date(rangeStart.getTime() + dayOffset * 86_400_000);
    monthTicks.push({ leftPct: pct, label: formatMonthTick(d) });
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Planner calendar</Text>
      <View style={styles.chartWrap}>
        <View style={styles.labelCol}>
          <View style={{ height: HEADER_H, borderBottomWidth: 0.5, borderBottomColor: "#ddd" }} />
          {lines.map((line) => (
            <View key={line.lineId} style={[styles.labelRow, { height: ROW_H }]}>
              <Text style={line.isCritical ? styles.labelTextCritical : styles.labelText}>
                {line.label.length > 22 ? `${line.label.slice(0, 21)}…` : line.label}
              </Text>
            </View>
          ))}
        </View>
        <View style={[styles.chartArea, { height: chartH }]}>
          <View style={[styles.chartHeader, { height: HEADER_H }]}>
            {monthTicks.map((t) => (
              <Text
                key={t.label + t.leftPct}
                style={[
                  styles.monthTick,
                  { left: (t.leftPct / 100) * CHART_W },
                ]}
              >
                {t.label}
              </Text>
            ))}
          </View>
          <View style={{ height: bodyH, position: "relative" }}>
            {lines.map((_, i) => (
              <View
                key={`bg-${i}`}
                style={[
                  styles.rowBg,
                  { top: i * ROW_H, height: ROW_H, width: CHART_W },
                ]}
              />
            ))}
            {lines.map((line, rowIndex) => {
              const leftPct = dateToPct(parseISO(line.task.start), rangeStart, rangeEnd);
              const rightPct = dateToPct(parseISO(line.task.end), rangeStart, rangeEnd);
              const widthPct = Math.max(0.8, rightPct - leftPct);
              const fill = PDF_GANTT_CATEGORY_FILL[line.category] ?? "#64748b";
              const isMilestone =
                line.task.phaseKind === "milestone" || line.task.phaseKind === "deadline";
              return (
                <View
                  key={`bar-${line.lineId}`}
                  style={[
                    styles.bar,
                    {
                      top: rowIndex * ROW_H + 3,
                      left: (leftPct / 100) * CHART_W,
                      width: Math.max(isMilestone ? 6 : 4, (widthPct / 100) * CHART_W),
                      height: ROW_H - 6,
                      backgroundColor: fill,
                    },
                  ]}
                />
              );
            })}
            {arrows.length > 0 ? (
              <Svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: CHART_W,
                  height: bodyH,
                }}
                viewBox={`0 0 ${CHART_W} ${bodyH}`}
              >
                {arrows.map((a) => {
                  const x1 = (a.fromPct / 100) * CHART_W;
                  const x2 = (a.toPct / 100) * CHART_W;
                  const y1 = a.fromRow * ROW_H + ROW_H / 2;
                  const y2 = a.toRow * ROW_H + ROW_H / 2;
                  return (
                    <Path
                      key={a.key}
                      d={dependencyPath(x1, y1, x2, y2)}
                      stroke="#64748b"
                      strokeWidth={1.2}
                      fill="none"
                    />
                  );
                })}
              </Svg>
            ) : null}
          </View>
        </View>
      </View>
      <Text style={styles.legend}>
        Arrows show finish-to-start dependencies. Colors:{" "}
        {[...new Set(lines.map((l) => l.category))].slice(0, 6).map(
          (c) => TASK_CATEGORY_LABELS[c] ?? c
        ).join(", ")}
        {lines.length > 6 ? "…" : ""}.
      </Text>
    </View>
  );
}
