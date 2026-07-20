import { useEffect } from "react";
import type { OvertimeRow, ReasonAmountRow } from "./financeDemoData";

const panelSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.96)] to-[rgba(26,31,55,0.96)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.45)]";

function fmtTableAmount(amount: number) {
  const positive = amount >= 0;
  const n = new Intl.NumberFormat("ru-RU").format(Math.abs(amount));
  return { text: `${positive ? "+" : "−"}${n}`, positive };
}

type FinanceRecordsModalProps =
  | { open: boolean; onClose: () => void; title: string; kind: "overtime"; rows: OvertimeRow[] }
  | { open: boolean; onClose: () => void; title: string; kind: "reason"; rows: ReasonAmountRow[] };

export function FinanceRecordsModal(props: FinanceRecordsModalProps) {
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-records-title"
        className={`flex max-h-[min(520px,85vh)] w-full max-w-lg flex-col p-5 sm:p-6 ${panelSurface}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex shrink-0 items-start justify-between gap-3">
          <h2 id="finance-records-title" className="text-lg font-semibold text-white">
            {props.title}
          </h2>
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
            onClick={props.onClose}
          >
            Закрыть
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {props.kind === "overtime" ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[11px] font-medium lowercase text-white/45">
                  <th className="pb-3 pr-3 font-medium">дата</th>
                  <th className="pb-3 pr-3 text-right font-medium">количество часов</th>
                  <th className="pb-3 text-right font-medium">сумма</th>
                </tr>
              </thead>
              <tbody>
                {props.rows.map((row) => {
                  const sum = fmtTableAmount(row.amount);
                  return (
                    <tr key={row.date} className="border-b border-white/[0.06] last:border-0">
                      <td className="py-3.5 pr-3 text-white/85">{row.date}</td>
                      <td className="py-3.5 pr-3 text-right text-white/85">{row.hours}</td>
                      <td className={`py-3.5 text-right font-semibold tabular-nums ${sum.positive ? "text-emerald-400" : "text-red-400"}`}>
                        {sum.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[11px] font-medium lowercase text-white/45">
                  <th className="pb-3 pr-4 font-medium">дата</th>
                  <th className="pb-3 pr-4 font-medium">основание</th>
                  <th className="pb-3 text-right font-medium">сумма</th>
                </tr>
              </thead>
              <tbody>
                {props.rows.map((row) => {
                  const sum = fmtTableAmount(row.amount);
                  return (
                    <tr key={`${row.date}-${row.reason}`} className="border-b border-white/[0.06] last:border-0">
                      <td className="py-3.5 pr-4 whitespace-nowrap text-white/85">{row.date}</td>
                      <td className="py-3.5 pr-4 text-white/85">{row.reason}</td>
                      <td className={`py-3.5 text-right font-semibold tabular-nums ${sum.positive ? "text-emerald-400" : "text-red-400"}`}>
                        {sum.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
