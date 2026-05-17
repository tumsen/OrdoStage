/** Must match `LineChart` margin + axis widths in `TieredSeatPricingCalculator`. */
export const PRICING_CHART_Y_AXIS_WIDTH = 44;
export const PRICING_CHART_MARGIN_RIGHT = 8;
export const PRICING_CHART_MARGIN = { top: 4, right: PRICING_CHART_MARGIN_RIGHT, left: 0, bottom: 4 } as const;

/** Horizontal padding so the seat slider track lines up with the chart plot (and dashed `ReferenceLine`). */
export function pricingChartSliderPadding(hasRightYAxis: boolean): {
  paddingLeft: number;
  paddingRight: number;
} {
  return {
    paddingLeft: PRICING_CHART_Y_AXIS_WIDTH,
    paddingRight: hasRightYAxis
      ? PRICING_CHART_Y_AXIS_WIDTH + PRICING_CHART_MARGIN_RIGHT
      : PRICING_CHART_MARGIN_RIGHT,
  };
}
