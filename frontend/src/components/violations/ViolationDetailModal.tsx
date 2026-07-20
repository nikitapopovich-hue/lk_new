import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ViolationEntry } from "../../lib/violationJournal";
import { fetchViolationEntries } from "../../lib/violationJournal";
import { ViolationCommentText } from "./ViolationCommentText";
import "./ViolationsJournal.css";

type Props = {
  title: string;
  month: string;
  employee?: string;
  violationType?: string;
  onClose: () => void;
};

export function ViolationDetailModal(props: Props) {
  const [entries, setEntries] = useState<ViolationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchViolationEntries({
      month: props.month,
      employee: props.employee,
      violationType: props.violationType,
    })
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.month, props.employee, props.violationType]);

  return createPortal(
    <div className="vj-modal-backdrop" role="presentation">
      <div className="vj-modal vj-modal--detail vj-scroll" role="dialog" aria-labelledby="vj-detail-title">
        <div className="vj-modal__head">
          <h2 id="vj-detail-title" className="vj-modal__title">
            {props.title}
          </h2>
          <button type="button" className="vj-modal__close" aria-label="Закрыть" onClick={props.onClose}>
            ×
          </button>
        </div>

        {loading ? <p className="text-sm text-white/50">Загрузка…</p> : null}
        {error ? (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error ? (
          <div className="vj-detail-list vj-scroll">
            {entries.length === 0 ? (
              <p className="text-sm text-white/50">Записей за выбранный период нет.</p>
            ) : (
              entries.map((row) => (
                <div key={row.id} className="vj-detail-row">
                  <div className="vj-detail-row__meta">
                    {row.date}
                    {row.employeeName ? ` · ${row.employeeName}` : null}
                    {row.groupName ? ` · ${row.groupName}` : null}
                    {!props.violationType && row.violationType ? ` · ${row.violationType}` : null}
                  </div>
                  <div>
                    <span className={row.penaltyKind === "fine" ? "vj-pill-fine" : "vj-pill-warn"}>
                      {row.penaltyLabel}
                    </span>
                    {row.penaltyKind === "fine" ? (
                      <span className="ml-2 text-white/75">{row.fineAmount} ₽</span>
                    ) : null}
                    {row.hasExplanation ? (
                      <span className="ml-2 text-white/50">Объяснительная</span>
                    ) : null}
                  </div>
                  {row.recordedBy ? (
                    <div className="mt-1 text-white/55">
                      <span className="text-white/45">Зафиксировал: </span>
                      {row.recordedBy}
                    </div>
                  ) : null}
                  {row.comment ? (
                    <div className="mt-1 text-white/70">
                      <ViolationCommentText text={row.comment} />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
