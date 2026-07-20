import { useMemo, useState } from "react";
import {
  METRIC_BAD_THRESHOLD,
  OPERATOR_METRIC_MONTHS,
  chartAxisTicks,
  chartScaleBounds,
  chartSeriesColor,
  formatAxisValue,
  formatChartValue,
  type OperatorMetricDemo,
} from "./operatorMetricsDemo";
import { smoothAreaPath, smoothCurvePath } from "./metricsChartPath";

type Props = {
  metric: OperatorMetricDemo;
  className?: string;
};

const CHART_W = 640;
const CHART_H = 188;
const PAD_LEFT = 52;
const PAD_RIGHT = 16;
const PAD_TOP = 18;
const PAD_BOTTOM = 28;

const AXIS_FONT = 12;
const THRESHOLD_FONT = 12;

type HoverTip = { index: number; value: number; x: number; y: number };

export function MetricsBarChart(props: Props) {
  const { metric } = props;
  const [hover, setHover] = useState<HoverTip | null>(null);

  const bounds = useMemo(() => chartScaleBounds(metric), [metric]);
  const ticks = useMemo(() => chartAxisTicks(metric, bounds), [metric, bounds]);
  const seriesColor = chartSeriesColor(metric);
  const threshold = METRIC_BAD_THRESHOLD[metric.key] ?? null;

  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const baselineY = PAD_TOP + plotH;
  const monthCount = OPERATOR_METRIC_MONTHS.length;
  const slotW = plotW / monthCount;

  const range = bounds.max - bounds.min || 1;

  function monthCenterX(index: number) {
    return PAD_LEFT + slotW * index + slotW / 2;
  }

  function valueToY(value: number) {
    const norm = (value - bounds.min) / range;
    return baselineY - norm * plotH;
  }

  const points = useMemo(() => {
    return metric.monthly
      .map((value, index) => {
        if (value == null) return null;
        return {
          index,
          value,
          x: monthCenterX(index),
          y: valueToY(value),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric.monthly, bounds.min, bounds.max]);

  const curvePath = points.length > 0 ? smoothCurvePath(points) : "";
  const areaPath = points.length > 0 ? smoothAreaPath(points, baselineY) : "";

  return (
    <div className={`relative ${props.className ?? ""}`}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-[168px] w-full sm:h-[188px]"
        role="img"
        aria-label={`Диаграмма: ${metric.label}`}
      >
        <defs>
          <linearGradient id={`metrics-area-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={seriesColor} stopOpacity={0.35} />
            <stop offset="100%" stopColor={seriesColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {ticks.map((tick) => {
          const y = valueToY(tick);
          return (
            <g key={tick}>
              <line
                x1={PAD_LEFT}
                y1={y}
                x2={CHART_W - PAD_RIGHT}
                y2={y}
                stroke="white"
                strokeOpacity={0.06}
                strokeDasharray="3 4"
              />
              <text
                x={PAD_LEFT - 8}
                y={y + 4}
                textAnchor="end"
                fill="white"
                opacity={0.55}
                fontSize={AXIS_FONT}
                fontWeight={500}
              >
                {formatAxisValue(metric, tick)}
                {metric.kind === "percent" ? "%" : ""}
              </text>
            </g>
          );
        })}

        {threshold != null && threshold >= bounds.min && threshold <= bounds.max ? (
          <g>
            <line
              x1={PAD_LEFT}
              y1={valueToY(threshold)}
              x2={CHART_W - PAD_RIGHT}
              y2={valueToY(threshold)}
              stroke="#f87171"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text
              x={CHART_W - PAD_RIGHT}
              y={valueToY(threshold) - 6}
              textAnchor="end"
              fill="#f87171"
              fontSize={THRESHOLD_FONT}
              fontWeight={600}
            >
              {metric.kind === "percent"
                ? `${threshold}%`
                : metric.kind === "count"
                  ? String(threshold)
                  : formatAxisValue(metric, threshold)}
            </text>
          </g>
        ) : null}

        {areaPath ? <path d={areaPath} fill={`url(#metrics-area-${metric.key})`} /> : null}
        {curvePath ? (
          <path
            d={curvePath}
            fill="none"
            stroke={seriesColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {points.map((p) => {
          const active = hover?.index === p.index;
          return (
            <g key={p.index}>
              <circle
                cx={p.x}
                cy={p.y}
                r={16}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHover({ index: p.index, value: p.value, x: p.x, y: p.y })}
                onMouseLeave={() => setHover((h) => (h?.index === p.index ? null : h))}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={active ? 5 : 3.5}
                fill={seriesColor}
                stroke="#0b1028"
                strokeWidth={1.5}
                className="pointer-events-none"
              />
            </g>
          );
        })}

        {OPERATOR_METRIC_MONTHS.map((label, i) => (
          <text
            key={label}
            x={monthCenterX(i)}
            y={CHART_H - 6}
            textAnchor="middle"
            fill="white"
            opacity={0.45}
            fontSize={11}
          >
            {label}
          </text>
        ))}
      </svg>

      {hover != null ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/10 bg-[#1a1f37]/95 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg"
          style={{
            left: `${(hover.x / CHART_W) * 100}%`,
            top: `${((hover.y - 8) / CHART_H) * 100}%`,
          }}
        >
          <span className="font-medium text-white/55">{OPERATOR_METRIC_MONTHS[hover.index]}: </span>
          {formatChartValue(metric, hover.value)}
        </div>
      ) : null}
    </div>
  );
}
