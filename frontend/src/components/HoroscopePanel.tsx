import { useEffect, useState } from "react";
import { fetchHoroscopeDaily, formatHoroscopeDateRu, pickRandomHoroscopeLoadingPhrase, type HoroscopeDailyResponse } from "../lib/horoscope";
import { MagicSurface } from "./MagicBento";

const operatorSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.74)] to-[rgba(26,31,55,0.5)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

const LOADING_DOT_SUFFIXES = ["", ".", "..", "..."] as const;

export function HoroscopePanel() {
  const [data, setData] = useState<HoroscopeDailyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingPhrase] = useState(() => pickRandomHoroscopeLoadingPhrase());
  const [dotPhase, setDotPhase] = useState(0);

  useEffect(() => {
    if (!loading) return;
    setDotPhase(0);
    const id = window.setInterval(() => {
      setDotPhase((p) => (p + 1) % LOADING_DOT_SUFFIXES.length);
    }, 450);
    return () => window.clearInterval(id);
  }, [loading]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchHoroscopeDaily()
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const title = "Гороскоп дня";

  return (
    <MagicSurface className={`flex min-h-0 flex-col p-6 ${operatorSurface}`}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {loading ? (
          <span className="text-sm font-medium text-[#a0aec0]">
            {loadingPhrase}
            <span className="inline-block w-[3ch] shrink-0 text-left font-mono">
              {LOADING_DOT_SUFFIXES[dotPhase]}
            </span>
          </span>
        ) : data?.ok ? (
          <span className="text-sm font-medium text-pari-300">{data.signRu}</span>
        ) : (
          <span className="text-sm font-medium text-[#a0aec0]">—</span>
        )}
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-100">{error}</p>
      ) : null}

      {!loading && data && !data.ok ? (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-xs text-amber-100">
          {data.message}
        </p>
      ) : null}

      {!loading && data?.ok ? (
        <div className="scrollbar-pari mt-4 max-h-64 overflow-y-auto pr-1 text-sm leading-relaxed text-white/85">
          {data.horoscope ? (
            <>
              {data.date ? (
                <div className="mb-2 text-[11px] tracking-wide text-white/40">{formatHoroscopeDateRu(data.date)}</div>
              ) : null}
              <p>{data.horoscope}</p>
            </>
          ) : (
            <p className="text-white/45">Текст гороскопа пуст.</p>
          )}
        </div>
      ) : null}
    </MagicSurface>
  );
}
