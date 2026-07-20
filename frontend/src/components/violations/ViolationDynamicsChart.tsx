import { useMemo, useState } from "react";
import { monthKeyLabel, type ViolationDynamics } from "../../lib/violationJournal";
import { smoothAreaPath, smoothCurvePath } from "../operator/metricsChartPath";
import "./ViolationsJournal.css";

/** Те же размеры и отступы, что у MetricsBarChart на дашборде оператора. */
const CHART_W = 640;
const CHART_H = 188;
const PAD_LEFT = 52;
const PAD_RIGHT = 16;
const PAD_TOP = 18;
const PAD_BOTTOM = 28;
const AXIS_FONT = 12;

export const VIOLATION_CHART_COLORS = [
  "#00c7b1",
  "#42fcff",
  "#a78bfa",
  "#fbbf24",
  "#f87171",
  "#34d399",
  "#fb923c",
  "#60a5fa",
];

type Props = {
  data: ViolationDynamics;
  colorByKey?: Record<string, string>;
};

type HoverTip = { seriesIndex: number; monthIndex: number; value: number; x: number; y: number };

export function ViolationDynamicsChart(props: Props) {
  const { data } = props;
  const [hover, setHover] = useState<HoverTip | null>(null);

  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const baselineY = PAD_TOP + plotH;
  const monthCount = Math.max(data.months.length, 1);
  const slotW = plotW / monthCount;
  const singleSeries = data.series.length === 1;

  const maxVal = useMemo(() => {
    let m = 1;
    for (const s of data.series) {
      for (const v of s.monthly) m = Math.max(m, v);
    }
    return m;
  }, [data.series]);

  function monthCenterX(index: number) {
    return PAD_LEFT + slotW * index + slotW / 2;
  }

  function valueToY(value: number) {
    const norm = value / maxVal;
    return baselineY - norm * plotH;
  }

  const paths = useMemo(() => {
    return data.series.map((series, si) => {
      const color =
        props.colorByKey?.[series.key] ?? VIOLATION_CHART_COLORS[si % VIOLATION_CHART_COLORS.length]!;
      const gradientId = `vj-area-${series.key.replace(/\W/g, "_")}`;
      const points = series.monthly.map((value, mi) => ({
        x: monthCenterX(mi),
        y: valueToY(value),
        value,
        index: mi,
      }));
      if (points.length === 0) {
        return { curve: "", area: "", points: [], color, seriesIndex: si, gradientId };
      }
      const curve = smoothCurvePath(points);
      const area = smoothAreaPath(points, baselineY);
      return { curve, area, points, color, seriesIndex: si, gradientId };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, maxVal]);

  const ticks = useMemo(() => {
    const step = maxVal <= 5 ? 1 : Math.ceil(maxVal / 4);
    const out: number[] = [];
    for (let v = 0; v <= maxVal; v += step) out.push(v);
    if (out[out.length - 1] !== maxVal) out.push(maxVal);
    return out;
  }, [maxVal]);

  const hoverSeries = hover != null ? data.series[hover.seriesIndex] : null;
  const hoverColor =
    hover != null
      ? props.colorByKey?.[hoverSeries?.key ?? ""] ??
        VIOLATION_CHART_COLORS[hover.seriesIndex % VIOLATION_CHART_COLORS.length]
      : undefined;

  return (
    <div className="vj-dynamics-chart relative w-full">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="operator-metrics-chart h-[168px] w-full sm:h-[188px]"
        role="img"
        aria-label="Динамика нарушений"
      >
        <defs>
          {paths.map((p) => (
            <linearGradient key={p.gradientId} id={p.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={p.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
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
                {tick}
              </text>
            </g>
          );
        })}

        {paths.map((p) =>
          p.curve ? (
            <g key={p.seriesIndex}>
              {singleSeries ? <path d={p.area} fill={`url(#${p.gradientId})`} /> : null}
              <path
                d={p.curve}
                fill="none"
                stroke={p.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {p.points.map((pt) => {
                const active =
                  hover?.seriesIndex === p.seriesIndex && hover.monthIndex === pt.index;
                return (
                  <g key={pt.index}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={16}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() =>
                        setHover({
                          seriesIndex: p.seriesIndex!,
                          monthIndex: pt.index,
                          value: pt.value,
                          x: pt.x,
                          y: pt.y,
                        })
                      }
                      onMouseLeave={() =>
                        setHover((h) =>
                          h?.seriesIndex === p.seriesIndex && h.monthIndex === pt.index ? null : h,
                        )
                      }
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={active ? 5 : 3.5}
                      fill={p.color}
                      stroke="#0b1028"
                      strokeWidth={1.5}
                      className="pointer-events-none"
                    />
                  </g>
                );
              })}
            </g>
          ) : null,
        )}

        {data.months.map((mk, i) => (
          <text
            key={mk}
            x={monthCenterX(i)}
            y={CHART_H - 6}
            textAnchor="middle"
            fill="white"
            opacity={0.45}
            fontSize={11}
          >
            {monthKeyLabel(mk)}
          </text>
        ))}
      </svg>

      {hover != null && hoverSeries ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-white/10 bg-[#1a1f37]/95 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg"
          style={{
            left: `${(hover.x / CHART_W) * 100}%`,
            top: `${((hover.y - 8) / CHART_H) * 100}%`,
          }}
        >
          <span className="font-medium text-white/55">{hoverSeries.label}: </span>
          <span style={{ color: hoverColor }}>{monthKeyLabel(data.months[hover.monthIndex] ?? "")}</span>
          {" — "}
          {hover.value}
        </div>
      ) : null}
    </div>
  );
}

export function ViolationDynamicsLegend(props: {
  series: ViolationDynamics["series"];
  colorByKey: Record<string, string>;
}) {
  if (props.series.length === 0) return null;

  return (
    <div className="vj-dynamics-legend" aria-label="Легенда графика">
      {props.series.map((s) => {
        const color = props.colorByKey[s.key] ?? VIOLATION_CHART_COLORS[0]!;
        const delta = s.deltaPercent;
        const deltaClass = delta > 0 ? "text-red-300" : delta < 0 ? "text-emerald-300" : "text-white/45";
        return (
          <span key={s.key} className="vj-dynamics-legend__item">
            <span className="vj-dynamics-legend__dot" style={{ background: color }} />
            <span>
              {s.label}{" "}
              <span className={deltaClass}>
                ({delta > 0 ? "+" : ""}
                {delta}% к пред. мес.)
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
