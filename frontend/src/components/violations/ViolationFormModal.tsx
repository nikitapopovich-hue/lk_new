import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fineAmountForViolationType,
  OTHER_VIOLATION_TYPE,
  VIOLATION_FINE_TYPE_NAMES,
} from "../../lib/violationFineCatalog";
import {
  createViolationEntry,
  todayRuDate,
  updateViolationEntry,
  type ViolationEntry,
  type ViolationEntryInput,
  type ViolationMeta,
} from "../../lib/violationJournal";
import { ViolationBrandSelect } from "./ViolationBrandSelect";
import { ViolationComboField } from "./ViolationComboField";
import { ViolationDateField } from "./ViolationDateField";
import { ViolationFineInfoModal } from "./ViolationFineInfoModal";
import "./ViolationsJournal.css";

type Props = {
  meta: ViolationMeta;
  entry?: ViolationEntry | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
};

const fieldLabelClass = "vj-field-label";

export function ViolationFormModal(props: Props) {
  const isEdit = Boolean(props.entry);
  const [fineInfoOpen, setFineInfoOpen] = useState(false);
  const [date, setDate] = useState(props.entry?.date ?? todayRuDate());
  const [employeeName, setEmployeeName] = useState(props.entry?.employeeName ?? "");
  const [recordedBy, setRecordedBy] = useState(props.entry?.recordedBy ?? "");
  const [groupName, setGroupName] = useState(props.entry?.groupName ?? "");
  const [violationType, setViolationType] = useState(props.entry?.violationType ?? "");
  const [penaltyKind, setPenaltyKind] = useState<"" | "warning" | "fine">(props.entry?.penaltyKind ?? "");
  const [hasExplanation, setHasExplanation] = useState(props.entry?.hasExplanation ?? false);
  const [fineAmount, setFineAmount] = useState(
    props.entry?.penaltyKind === "fine" ? String(props.entry.fineAmount) : "",
  );
  const [comment, setComment] = useState(props.entry?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fineTouched = useRef(false);
  const stashedFineAmount = useRef("");

  const typeOptions = useMemo(() => {
    const names = [...VIOLATION_FINE_TYPE_NAMES];
    if (violationType && !names.includes(violationType)) {
      names.push(violationType);
    }
    return names.map((name) => ({ value: name, label: name }));
  }, [violationType]);

  const commentRequired = violationType === OTHER_VIOLATION_TYPE;

  useEffect(() => {
    fineTouched.current = false;
    stashedFineAmount.current = "";
    if (props.entry?.penaltyKind === "fine") {
      const catalog = fineAmountForViolationType(props.entry.violationType);
      if (catalog != null && catalog !== props.entry.fineAmount) {
        fineTouched.current = true;
      }
    }
  }, [props.entry]);

  useEffect(() => {
    if (fineTouched.current || penaltyKind !== "fine") return;
    const catalog = fineAmountForViolationType(violationType);
    if (catalog != null) {
      setFineAmount(String(catalog));
      return;
    }
    const match = props.meta.violationTypes.find((t) => t.name === violationType);
    if (match) setFineAmount(String(match.fineAmount));
  }, [violationType, penaltyKind, props.meta.violationTypes]);

  function resolveCatalogFineAmount(): string {
    const catalog = fineAmountForViolationType(violationType);
    if (catalog != null) return String(catalog);
    const match = props.meta.violationTypes.find((t) => t.name === violationType);
    return match ? String(match.fineAmount) : "";
  }

  function handlePenaltyKindChange(next: "warning" | "fine") {
    if (next === penaltyKind) return;
    if (next === "warning") {
      if (fineAmount.trim()) stashedFineAmount.current = fineAmount;
      setFineAmount("");
      setPenaltyKind("warning");
      return;
    }
    setPenaltyKind("fine");
    if (stashedFineAmount.current) {
      setFineAmount(stashedFineAmount.current);
      fineTouched.current = true;
      return;
    }
    fineTouched.current = false;
    setFineAmount(resolveCatalogFineAmount());
  }

  function buildBody(): ViolationEntryInput {
    return {
      date,
      employeeName,
      recordedBy,
      groupName,
      violationType,
      penaltyKind: penaltyKind as "warning" | "fine",
      hasExplanation,
      fineAmount: penaltyKind === "fine" ? Number(fineAmount) || 0 : 0,
      comment,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!penaltyKind) {
      setError("Выберите «Предупреждение» или «Штраф»");
      return;
    }
    if (!violationType.trim()) {
      setError("Выберите тип нарушения");
      return;
    }
    if (!isEdit && !VIOLATION_FINE_TYPE_NAMES.includes(violationType)) {
      setError("Выберите тип из списка «Суммы штрафов»");
      return;
    }
    if (commentRequired && !comment.trim()) {
      setError("Для типа «Другое» укажите комментарий");
      return;
    }
    setSaving(true);
    try {
      const body = buildBody();
      if (isEdit && props.entry) {
        await updateViolationEntry(props.entry.id, body);
      } else {
        await createViolationEntry(body);
      }
      props.onSaved();
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="vj-modal-backdrop" role="presentation">
      <div className="vj-modal vj-scroll" role="dialog" aria-labelledby="vj-form-title">
        <div className="vj-modal__head">
          <div className="flex items-center gap-2">
            <h2 id="vj-form-title" className="vj-modal__title">
              {isEdit ? "Редактировать нарушение" : "Добавить нарушение"}
            </h2>
            <button
              type="button"
              className="vj-info-btn"
              aria-label="Информация о суммах штрафов"
              title="Суммы штрафов"
              onClick={() => setFineInfoOpen(true)}
            >
              <img src="/info-circle.svg" alt="" aria-hidden />
            </button>
          </div>
          <button type="button" className="vj-modal__close" aria-label="Закрыть" onClick={props.onClose}>
            ×
          </button>
        </div>

        <form className="vj-form-grid" onSubmit={handleSubmit}>
          <div>
            <label className={fieldLabelClass} htmlFor="vj-date">
              Дата
            </label>
            <ViolationDateField id="vj-date" value={date} onChange={setDate} required />
          </div>

          <div>
            <span className={fieldLabelClass}>Ф.И.О.</span>
            <ViolationComboField
              value={employeeName}
              onChange={setEmployeeName}
              suggestions={props.meta.employeeNames}
              placeholder="Выберите сотрудника"
            />
          </div>

          <div>
            <span className={fieldLabelClass}>Зафиксировано</span>
            <ViolationComboField
              value={recordedBy}
              onChange={setRecordedBy}
              suggestions={props.meta.recordedByHints}
              placeholder="Кто зафиксировал"
            />
          </div>

          <div>
            <span className={fieldLabelClass}>Группа</span>
            <ViolationComboField
              value={groupName}
              onChange={setGroupName}
              suggestions={props.meta.groupHints}
              placeholder="Группа"
            />
          </div>

          <div className="vj-form-span-2">
            <span className={fieldLabelClass}>Тип нарушения</span>
            <ViolationBrandSelect
              value={violationType}
              onChange={setViolationType}
              options={typeOptions}
              placeholder="Выберите тип нарушения"
            />
          </div>

          <div className="vj-form-span-2">
            <span className={fieldLabelClass}>Предупреждение / Штраф</span>
            <div className="vj-penalty-checks" role="radiogroup" aria-label="Предупреждение или штраф">
              <label className="vj-check">
                <input
                  type="radio"
                  name="penaltyKind"
                  checked={penaltyKind === "warning"}
                  onChange={() => handlePenaltyKindChange("warning")}
                />
                <span className="vj-check__box" aria-hidden />
                Предупреждение
              </label>
              <label className="vj-check">
                <input
                  type="radio"
                  name="penaltyKind"
                  checked={penaltyKind === "fine"}
                  onChange={() => handlePenaltyKindChange("fine")}
                />
                <span className="vj-check__box" aria-hidden />
                Штраф
              </label>
            </div>
          </div>

          <div>
            <label className="vj-check">
              <input
                type="checkbox"
                checked={hasExplanation}
                onChange={(e) => setHasExplanation(e.target.checked)}
              />
              <span className="vj-check__box" aria-hidden />
              Объяснительная
            </label>
          </div>

          <div>
            <label className={fieldLabelClass} htmlFor="vj-fine">
              Сумма штрафа
            </label>
            <input
              id="vj-fine"
              type="number"
              min={0}
              step={1}
              className="vj-input"
              value={fineAmount}
              onChange={(e) => {
                fineTouched.current = true;
                setFineAmount(e.target.value);
              }}
              disabled={penaltyKind !== "fine"}
            />
          </div>

          <div className="vj-form-span-2">
            <label className={fieldLabelClass} htmlFor="vj-comment">
              Комментарий{commentRequired ? " *" : ""}
            </label>
            <textarea
              id="vj-comment"
              rows={3}
              className="vj-input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={commentRequired ? "Обязательно для типа «Другое»" : "По желанию"}
              required={commentRequired}
            />
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
      <ViolationFineInfoModal open={fineInfoOpen} onClose={() => setFineInfoOpen(false)} />
    </div>,
    document.body,
  );
}
