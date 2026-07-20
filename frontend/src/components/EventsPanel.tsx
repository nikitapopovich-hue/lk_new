import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCalendarEvents,
  mskCalendarMonthWindow,
  type CalendarEventItem,
} from "../lib/calendar";
import { googleLoginUrl } from "../lib/auth";
import { getRole } from "../lib/role";
import { MagicSurface } from "./MagicBento";

const operatorSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.74)] to-[rgba(26,31,55,0.5)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

/** Интервал фонового обновления (мс): ~30 запросов/час на пользователя — комфортно для квот Google Calendar API. */
const CALENDAR_POLL_MS = 120_000;

const URL_IN_TEXT = /(https?:\/\/[^\s]+)/gi;

function trimTrailingPunctFromUrl(href: string) {
  return href.replace(/[.,;:!?)>\]]+$/g, "");
}

function EventLocation({ text }: { text: string }) {
  const parts = text.split(URL_IN_TEXT);
  if (parts.length === 1) {
    return <div className="mt-0.5 text-[11px] text-white/40">{text}</div>;
  }
  return (
    <div className="mt-0.5 break-words text-[11px] text-white/40">
      {parts.map((part, i) => {
        if (/^https?:\/\//i.test(part)) {
          const href = trimTrailingPunctFromUrl(part);
          return (
            <a
              key={`${i}-${href.slice(0, 24)}`}
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-pari-400 underline decoration-pari-500/50 underline-offset-2 hover:text-pari-300"
            >
              {part}
            </a>
          );
        }
        return part ? <span key={i}>{part}</span> : null;
      })}
    </div>
  );
}

export function EventsPanel() {
  const [items, setItems] = useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsCalendarAuth, setNeedsCalendarAuth] = useState(false);
  const loadingRef = useRef(false);

  const load = useCallback(async (silent: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) {
      setLoading(true);
      setError("");
      setNeedsCalendarAuth(false);
    }
    const { from, to } = mskCalendarMonthWindow();
    try {
      const data = await fetchCalendarEvents({ from, to });
      setItems(data.items ?? []);
      setError("");
      setNeedsCalendarAuth(false);
    } catch (e: unknown) {
      if (!silent) {
        setItems([]);
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setNeedsCalendarAuth(
          /401|Google Calendar|access_token|refresh|календар/i.test(message),
        );
      }
    } finally {
      loadingRef.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load(true);
    }, CALENDAR_POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  return (
    <MagicSurface className={`flex min-h-0 flex-col p-6 ${operatorSurface}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white">События</h2>
          <p className="mt-0.5 text-[11px] text-white/45">Только предстоящие</p>
        </div>
        <span className="text-sm font-medium text-[#a0aec0]">
          {loading ? "Загрузка…" : `Всего ${items.length}`}
        </span>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
          <p>{error}</p>
          {needsCalendarAuth ? (
            <a
              href={googleLoginUrl(getRole(), { consent: true })}
              className="mt-3 inline-flex rounded-lg border border-pari-500/40 bg-pari-500/15 px-3 py-1.5 text-xs font-semibold text-pari-200 transition hover:bg-pari-500/25"
            >
              Подключить Google Calendar
            </a>
          ) : (
            <span className="mt-2 block text-white/50">
              Выйдите и войдите снова через Google, чтобы выдать доступ к календарю.
            </span>
          )}
        </div>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <p className="mt-4 text-sm text-white/45">Предстоящих событий в текущем месяце (МСК) нет.</p>
      ) : null}

      <ul className="scrollbar-pari mt-5 max-h-[32rem] space-y-5 overflow-y-auto border-l border-white/15 pl-4 pr-1">
        {items.map((ev) => (
          <li key={ev.id || `${ev.title}-${ev.start}`} className="relative pl-1">
            <span className="absolute -left-[21px] top-1.5 block h-2 w-2 rounded-full bg-pari-500 shadow-[0_0_8px_rgba(0,199,177,0.6)]" />
            <div className="text-xs text-[#a0aec0]">{ev.dateLabel}</div>
            {ev.htmlLink ? (
              <a
                href={ev.htmlLink}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 block text-sm font-medium leading-snug text-white hover:text-pari-300"
              >
                {ev.title}
              </a>
            ) : (
              <div className="mt-0.5 text-sm font-medium leading-snug text-white">{ev.title}</div>
            )}
            {ev.location ? <EventLocation text={ev.location} /> : null}
          </li>
        ))}
      </ul>

      <a
        className="mt-4 text-center text-xs text-pari-400 hover:underline"
        href="https://calendar.google.com/calendar/"
        target="_blank"
        rel="noreferrer"
      >
        Открыть Google Calendar
      </a>
    </MagicSurface>
  );
}
