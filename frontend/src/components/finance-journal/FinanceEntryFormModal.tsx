import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ViolationComboField } from "../violations/ViolationComboField";
import { ViolationDateField } from "../violations/ViolationDateField";
import "../violations/ViolationsJournal.css";
import {
  createFinanceEntry,
  FINANCE_JOURNAL_LABELS,
  OVERTIME_HOUR_RATE,
  todayRuDate,
  updateFinanceEntry,
  type FinanceEntry,
  type FinanceEntryInput,
  type FinanceEntryType,
  type FinanceMeta,
} from "../../lib/financeJournal";

type Props = {
  entryType: FinanceEntryType;
  meta: FinanceMeta;
  entry?: FinanceEntry | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
};

const fieldLabelClass = "vj-field-label";

function overtimeAmount(hours: number): number {
  return Math.round(hours * OVERTIME_HOUR_RATE);
}

export function FinanceEntryFormModal(props: Props) {
  const isEdit = Boolean(props.entry);
  const showHours = props.entryType === "overtime";
  const showReason = props.entryType !== "overtime";
  const labels = FINANCE_JOURNAL_LABELS[props.entryType];

  const [date, setDate] = useState(props.entry?.date ?? todayRuDate());
  const [employeeName, setEmployeeName] = useState(props.entry?.employeeName ?? "");
  const [hours, setHours] = useState(
    props.entry?.hours != null ? String(props.entry.hours) : showHours ? "1" : "",
  );
  const [amount, setAmount] = useState(
    props.entry ? String(props.entry.amount) : showHours ? String(OVERTIME_HOUR_RATE) : "",
  );
  const [reason, setReason] = useState(props.entry?.reason ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const amountTouched = useRef(isEdit);

  const employeeOptions = useMemo(() => props.meta.employeeNames, [props.meta.employeeNames]);

  useEffect(() => {
    if (!showHours || amountTouched.current) return;
    const parsed = Number(hours.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setAmount(String(overtimeAmount(parsed)));
  }, [hours, showHours]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body: FinanceEntryInput = {
      date,
      employeeName,
      amount: Number(amount.replace(",", ".")) || 0,
      reason,
    };
    if (showHours) body.hours = Number(hours.replace(",", ".")) || 0;
    try {
      if (props.entry) {
        await updateFinanceEntry(props.entryType, props.entry.id, body);
      } else {
        await createFinanceEntry(props.entryType, body);
      }
      props.onSaved();
      props.onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="vj-modal-backdrop" role="presentation">
      <div className="vj-modal vj-scroll" role="dialog" aria-labelledby="fj-form-title">
        <div className="vj-modal__head">
          <h2 id="fj-form-title" className="vj-modal__title">
            {isEdit ? `Редактировать: ${labels.title.toLowerCase()}` : `Добавить: ${labels.title.toLowerCase()}`}
          </h2>
          <button type="button" className="vj-modal__close" aria-label="Закрыть" onClick={props.onClose}>
            ×
          </button>
        </div>

        <form className="vj-form-grid" onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <label className={fieldLabelClass} htmlFor="fj-date">
              Дата
            </label>
            <ViolationDateField id="fj-date" value={date} onChange={setDate} required />
          </div>

          <div>
            <span className={fieldLabelClass}>Ф.И.О.</span>
            <ViolationComboField
              value={employeeName}
              onChange={setEmployeeName}
              suggestions={employeeOptions}
              placeholder="Выберите сотрудника"
            />
          </div>

          {showHours ? (
            <div>
              <label className={fieldLabelClass} htmlFor="fj-hours">
                Часы
              </label>
              <input
                id="fj-hours"
                type="number"
                min={0}
                step={0.5}
                className="vj-input"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                required
              />
            </div>
          ) : null}

          {showReason ? (
            <div className="vj-form-span-2">
              <label className={fieldLabelClass} htmlFor="fj-reason">
                Причина
              </label>
              <input
                id="fj-reason"
                className="vj-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
          ) : null}

          <div className={showReason ? "vj-form-span-2" : undefined}>
            <label className={fieldLabelClass} htmlFor="fj-amount">
              Сумма, ₽
            </label>
            <input
              id="fj-amount"
              type="number"
              step={1}
              className="vj-input"
              value={amount}
              onChange={(e) => {
                amountTouched.current = true;
                setAmount(e.target.value);
              }}
              required
            />
            {showHours ? (
              <p className="mt-1 text-[11px] text-white/40">400 ₽ за час — можно изменить вручную</p>
            ) : null}
          </div>

          {error ? (
            <p className="vj-form-span-2 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <div className="vj-form-span-2 vj-modal-actions">
            <div className="vj-modal-actions__start">
              {isEdit && props.onDelete ? (
                <button
                  type="button"
                  className="kpd-btn kpd-btn--ghost vj-btn vj-btn--danger"
                  onClick={props.onDelete}
                  disabled={saving}
                >
                  Удалить
                </button>
              ) : null}
            </div>
            <div className="vj-modal-actions__end">
              <button type="button" className="kpd-btn kpd-btn--ghost vj-btn" onClick={props.onClose} disabled={saving}>
                Отмена
              </button>
              <button type="submit" className="kpd-btn kpd-btn--primary vj-btn" disabled={saving}>
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
