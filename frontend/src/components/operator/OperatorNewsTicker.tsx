import {
  OPERATOR_NEWS_TICKER_DEMO,
  operatorNewsForViewer,
  type OperatorNewsItem,
} from "./operatorNewsTickerDemo";
import { operatorSurface } from "./operatorTile";

const SEPARATOR = "   ◆   ";

function TickerSegment(props: { text: string }) {
  const parts = props.text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-pari-300 underline decoration-pari-500/40 underline-offset-2 hover:text-pari-200"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function TickerRun(props: { items: OperatorNewsItem[] }) {
  return (
    <span className="inline-flex items-center gap-0">
      {props.items.map((item, index) => (
        <span key={item.id} className="inline-flex shrink-0 items-center">
          {index > 0 ? <span className="mx-4 text-pari-500/50">{SEPARATOR}</span> : null}
          <TickerSegment text={item.text} />
        </span>
      ))}
    </span>
  );
}

type Props = {
  items?: OperatorNewsItem[];
  className?: string;
};

export function OperatorNewsTicker(props: Props) {
  const visible = operatorNewsForViewer(props.items ?? OPERATOR_NEWS_TICKER_DEMO);
  if (visible.length === 0) return null;

  const durationSec = Math.max(28, visible.reduce((acc, n) => acc + n.text.length, 0) * 0.12);

  return (
    <div
      className={`operator-news-ticker relative overflow-hidden ${operatorSurface} ${props.className ?? ""}`}
      role="region"
      aria-label="Новости"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-pari-500/10 via-transparent to-pari-500/10"
        aria-hidden
      />
      <div className="relative flex min-h-[44px] items-stretch sm:min-h-[48px]">
        <div className="flex shrink-0 items-center border-r border-white/[0.08] bg-pari-500/10 px-3 sm:px-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-pari-300 sm:text-[11px]">
            Новости
          </span>
        </div>
        <div className="operator-news-ticker__viewport relative min-w-0 flex-1 overflow-hidden py-3 pl-4 pr-10 sm:py-3.5">
          <div
            className="operator-news-ticker__track inline-flex whitespace-nowrap text-xs leading-relaxed text-white/85 sm:text-sm"
            style={{ animationDuration: `${durationSec}s` }}
          >
            <TickerRun items={visible} />
            <span className="mx-8 text-pari-500/40" aria-hidden>
              ◆
            </span>
            <TickerRun items={visible} />
          </div>
        </div>
      </div>
    </div>
  );
}
