import { MagicSurface } from "../MagicBento";
import { LinkIcon } from "./LinkIcon";
import { MoodIcon } from "./MoodIcons";
import { kpdMoodFromPercent } from "./kpdMood";
import { ProgressRing } from "./ProgressRing";
import {
  operatorRingSize,
  operatorRingStroke,
  operatorSquareTile,
  operatorSurface,
  operatorTileBody,
  operatorTileHeader,
} from "./operatorTile";

/** КПД — пока демо-значение; позже подключим расчёт по API. */
export function OperatorKpdCard(props: { percent?: number; pending?: boolean }) {
  const percent = props.pending
    ? null
    : Math.min(100, Math.max(0, props.percent ?? 95));
  const mood = kpdMoodFromPercent(percent ?? 0);

  return (
    <MagicSurface className={`h-full w-full ${operatorSurface} ${operatorSquareTile}`}>
      <header className={operatorTileHeader}>
        <h2 className="text-base font-bold text-white sm:text-lg">КПД</h2>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-pari-500/25 bg-pari-500/10 transition hover:border-pari-400/45 hover:bg-pari-500/20"
          aria-label="Подробнее о КПД — скоро"
          title="Скоро"
        >
          <LinkIcon color="#00c7b1" size={20} />
        </button>
      </header>

      <div className={operatorTileBody}>
        <ProgressRing
          percent={percent ?? 0}
          color={mood.ringColor}
          size={operatorRingSize}
          stroke={operatorRingStroke}
        >
          {props.pending ? (
            <span className="text-2xl font-bold leading-none text-white/40">…</span>
          ) : (
            <>
              <MoodIcon variant={mood.key} color={mood.color} size={40} />
              <span className="mt-1 text-[11px] font-semibold leading-none" style={{ color: mood.color }}>
                {mood.label}
              </span>
              <span className="mt-1.5 text-2xl font-bold leading-none tracking-tight text-white">{percent}%</span>
            </>
          )}
        </ProgressRing>
      </div>
    </MagicSurface>
  );
}
