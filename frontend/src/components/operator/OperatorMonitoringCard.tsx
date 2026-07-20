import { useEffect, useMemo, useState } from "react";
import { MagicSurface } from "../MagicBento";
import { LinkIcon } from "./LinkIcon";
import { monitoringGradeColor, monitoringGradeProgress } from "./kpdMood";
import { buildOperatorMonitoringDemoMonths } from "./operatorMonitoringDemo";
import { ProgressRing } from "./ProgressRing";
import {
  operatorRingSize,
  operatorRingStroke,
  operatorSquareTile,
  operatorSurface,
  operatorTileHeader,
} from "./operatorTile";
import "./OperatorMonitoringCard.css";

const MONITORING_URL = "https://final-monitoring.paricorp.ru:4446/dashboard";

export type MonitoringMonthSlide = {
  year: number;
  month: number;
  points: number | null;
  grade: string | null;
  empty: boolean;
  membersWithData?: number;
  membersTotal?: number;
};

export function monthLabelRu(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const name = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC" }).format(d);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function MonitoringRingContent(props: {
  entry: MonitoringMonthSlide;
  pending: boolean;
  ringColor: string;
}) {
  const { entry, pending, ringColor } = props;
  if (pending) {
    return <span className="text-2xl font-bold leading-none text-white/40">…</span>;
  }
  if (entry.empty) {
    return (
      <>
        <span className="text-center text-sm font-semibold leading-tight text-white/70">Нет данных</span>
        <span className="mt-1 text-[11px] font-semibold leading-none" style={{ color: ringColor }}>
          {monthLabelRu(entry.year, entry.month)}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="text-3xl font-bold leading-none text-white">{entry.grade ?? "—"}</span>
      <span className="mt-1 text-[11px] font-semibold leading-none" style={{ color: ringColor }}>
        {monthLabelRu(entry.year, entry.month)}
      </span>
      <span className="mt-1.5 text-2xl font-bold leading-none tracking-tight text-white">
        {entry.points == null
          ? "…"
          : entry.points.toLocaleString("ru-RU", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}
      </span>
    </>
  );
}

/** Мониторинг: карусель по месяцам (слева — прошлое, справа — текущий). */
export function OperatorMonitoringCard(props: {
  months?: MonitoringMonthSlide[];
  pending?: boolean;
  useDemo?: boolean;
  teamScope?: boolean;
}) {
  const months = useMemo(() => {
    if (props.months?.length) return props.months;
    if (props.useDemo) return buildOperatorMonitoringDemoMonths();
    return buildOperatorMonitoringDemoMonths().map((m) => ({ ...m, empty: true, points: null, grade: null }));
  }, [props.months, props.useDemo]);

  /** Слева — старые месяцы, справа — текущий. */
  const slides = useMemo(() => [...months].reverse(), [months]);

  const [index, setIndex] = useState(() => Math.max(0, slides.length - 1));

  useEffect(() => {
    setIndex(Math.max(0, slides.length - 1));
  }, [slides]);

  const slide = slides[index] ?? slides[slides.length - 1];
  const pending = Boolean(props.pending);
  const activeColor = monitoringGradeColor(slide?.grade, slide?.empty);

  const scopeHint =
    props.teamScope && slide?.membersTotal
      ? slide.membersWithData
        ? `Среднее · ${slide.membersWithData} из ${slide.membersTotal}`
        : `Нет данных · ${slide.membersTotal} в выборке`
      : null;

  const goOlder = () => setIndex((i) => Math.max(0, i - 1));
  const goNewer = () => setIndex((i) => Math.min(slides.length - 1, i + 1));

  return (
    <MagicSurface className={`h-full w-full ${operatorSurface} ${operatorSquareTile}`}>
      <header className={operatorTileHeader}>
        <h2 className="text-base font-bold text-white sm:text-lg">Мониторинг</h2>
        <a
          href={MONITORING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-pari-500/25 bg-pari-500/10 transition hover:border-pari-400/45 hover:bg-pari-500/20"
          aria-label="Открыть мониторинг в новой вкладке"
          title="Открыть мониторинг"
        >
          <LinkIcon color="#00c7b1" size={20} />
        </a>
      </header>

      <div className="operator-monitoring-card__body">
        <div className="operator-monitoring-card__ring">
          <div className="operator-monitoring-card__carousel">
            <div
              className="operator-monitoring-card__track"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {slides.map((entry) => {
                const ringColor = monitoringGradeColor(entry.grade, entry.empty);
                const ringPercent =
                  pending || entry.empty ? 0 : monitoringGradeProgress(entry.grade ?? "D");
                return (
                  <div
                    key={`${entry.year}-${entry.month}`}
                    className="operator-monitoring-card__slide"
                  >
                    <ProgressRing
                      percent={ringPercent}
                      color={ringColor}
                      size={operatorRingSize}
                      stroke={operatorRingStroke}
                    >
                      <MonitoringRingContent entry={entry} pending={pending} ringColor={ringColor} />
                    </ProgressRing>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {slides.length > 1 ? (
          <div className="operator-monitoring-card__nav">
            <button
              type="button"
              className="operator-monitoring-card__nav-btn"
              aria-label="Прошлые месяцы"
              disabled={pending || index <= 0}
              onClick={goOlder}
            >
              ‹
            </button>
            <div className="operator-monitoring-card__dots" role="tablist" aria-label="Месяцы">
              {slides.map((entry, i) => (
                <button
                  key={`dot-${entry.year}-${entry.month}`}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  className={`operator-monitoring-card__dot ${i === index ? "operator-monitoring-card__dot--active" : ""}`}
                  style={i === index ? { backgroundColor: activeColor } : undefined}
                  aria-label={monthLabelRu(entry.year, entry.month)}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
            <button
              type="button"
              className="operator-monitoring-card__nav-btn"
              aria-label="К текущему месяцу"
              disabled={pending || index >= slides.length - 1}
              onClick={goNewer}
            >
              ›
            </button>
          </div>
        ) : null}

        {scopeHint ? <p className="operator-monitoring-card__scope">{scopeHint}</p> : null}
      </div>
    </MagicSurface>
  );
}
