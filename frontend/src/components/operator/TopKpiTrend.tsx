type TopKpiTrendProps = {
  changePercent: number;
};

export function TopKpiTrend({ changePercent }: TopKpiTrendProps) {
  const up = changePercent >= 0;
  const color = up ? "text-emerald-400" : "text-red-400";
  const arrow = up ? "↑" : "↓";

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${color}`}>
      <span aria-hidden className="text-[11px] leading-none">
        {arrow}
      </span>
      {Math.abs(changePercent)}%
    </span>
  );
}
