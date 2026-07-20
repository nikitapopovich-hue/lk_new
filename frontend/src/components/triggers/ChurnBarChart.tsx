import { useMemo, useState } from "react";
import { CHURN_BY_MONTH } from "./triggersDemoData";

const W = 400;
const H = 160;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 28;

type Hover = { index: number; x: number; y: number; value: number; month: string };

export function ChurnBarChart() {
  const [hover, setHover] = useState<Hover | null>(null);

  const maxVal = useMemo(() => Math.max(...CHURN_BY_MONTH.map((m) => m.value), 1), []);
  const yMax = Math.max(maxVal + 1, 5);
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const baselineY = PAD_T + plotH;
  const slotW = plotW / CHURN_BY_MONTH.length;
  const barW = Math.min(32, slotW * 0.55);

  const yTicks = useMemo(() => {
    const step = yMax <= 5 ? 1 : 2;
    const ticks: number[] = [];
    for (let v = 0; v <= yMax; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] !== yMax) ticks.push(yMax);
    return ticks;
  }, [yMax]);

  function valueToY(value: number) {
    return baselineY - (value / yMax) * plotH;
  }

  function barCenterX(index: number) {
    return PAD_L + slotW * index + slotW / 2;
  }

  return (
    <div className="relative mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[168px] w-full" role="img" aria-label="Динамика оттока по месяцам">
        <defs>
          <linearGradient id="churnBarFill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgb(0, 140, 125)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="rgb(52, 211, 192)" stopOpacity="1" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => {
          const y = valueToY(tick);
          return (
            <g key={tick}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <text x={PAD_L - 8} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize="10">
                {tick}
              </text>
            </g>
          );
        })}

        <line x1={PAD_L} y1={baselineY} x2={W - PAD_R} y2={baselineY} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

        {CHURN_BY_MONTH.map((m, i) => {
          const cx = barCenterX(i);
          const topY = valueToY(m.value);
          const barH = baselineY - topY;
          const x = cx - barW / 2;
          const isHover = hover?.index === i;

          return (
            <g
              key={m.month}
              onMouseEnter={() => setHover({ index: i, x: cx, y: topY, value: m.value, month: m.month })}
              onMouseLeave={() => setHover(null)}
              className="cursor-default"
            >
              <rect
                x={x}
                y={topY}
                width={barW}
                height={Math.max(barH, 4)}
                rx={6}
                fill={isHover ? "url(#churnBarFill)" : "url(#churnBarFill)"}
                opacity={isHover ? 1 : 0.88}
              />
              <text x={cx} y={H - 8} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10">
                {m.month}
              </text>
            </g>
          );
        })}

        {hover ? (
          <g pointerEvents="none">
            <line
              x1={hover.x}
              y1={PAD_T}
              x2={hover.x}
              y2={baselineY}
              stroke="rgba(52,211,192,0.35)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <rect
              x={Math.min(Math.max(hover.x - 52, PAD_L), W - PAD_R - 104)}
              y={Math.max(hover.y - 36, PAD_T)}
              width={104}
              height={28}
              rx={8}
              fill="rgba(15,20,40,0.95)"
              stroke="rgba(255,255,255,0.12)"
            />
            <text
              x={Math.min(Math.max(hover.x, PAD_L + 52), W - PAD_R - 52)}
              y={Math.max(hover.y - 18, PAD_T + 18)}
              textAnchor="middle"
              fill="white"
              fontSize="11"
              fontWeight="600"
            >
              {hover.month}: {hover.value} чел.
            </text>
          </g>
        ) : null}
      </svg>
      <p className="mt-1 text-center text-[10px] text-white/35">Увольнения, чел.</p>
    </div>
  );
}
