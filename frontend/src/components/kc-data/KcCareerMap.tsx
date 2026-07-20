import { useState } from "react";
import {
  careerStepsForView,
  emptyCareerStep,
  formatCareerDateInput,
  reorderCareerSteps,
  type CareerStep,
} from "../../lib/kcCareerPath";
import { kcFieldInputClass } from "./kcFieldStyles";
import { KcSuggestInput } from "./KcSuggestInput";
import "./KcCareerMap.css";

type Props = {
  steps: CareerStep[];
  editMode?: boolean;
  onChange?: (steps: CareerStep[]) => void;
  departmentHints?: string[];
  subdivisionHints?: string[];
};

function stepOrgLabel(step: CareerStep): string {
  return [step.department, step.subdivision].filter((p) => p.trim()).join(" · ");
}

function stepSummary(step: CareerStep): string {
  const parts = [step.date, step.title, stepOrgLabel(step)].filter((p) => p.trim());
  return parts.length ? parts.join(" · ") : "Новый этап";
}

export function KcCareerMap(props: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const departmentHints = props.departmentHints ?? [];
  const subdivisionHints = props.subdivisionHints ?? [];

  const viewSteps = careerStepsForView(props.steps);

  function updateStep(id: string, patch: Partial<CareerStep>) {
    if (!props.onChange) return;
    const next = props.steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
    props.onChange(next);
  }

  function removeStep(id: string) {
    props.onChange?.(props.steps.filter((s) => s.id !== id));
    setExpanded((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function addStep() {
    const step = emptyCareerStep();
    props.onChange?.([...props.steps, step]);
    setExpanded((prev) => ({ ...prev, [step.id]: true }));
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleDrop(targetId: string) {
    if (!dragId || !props.onChange || dragId === targetId) return;
    props.onChange(reorderCareerSteps(props.steps, dragId, targetId));
    setDragId(null);
  }

  if (props.editMode) {
    return (
      <section className="kc-career-map rounded-xl border border-white/[0.08] bg-black/20 p-4">
        <div className="kc-career-map__header">
          <p className="kc-career-map__title">Карта развития</p>
          <button
            type="button"
            className="rounded-lg border border-pari-500/40 bg-pari-500/15 px-2.5 py-1 text-xs font-medium text-pari-200 hover:bg-pari-500/25"
            onClick={addStep}
          >
            + Этап
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-white/40">
          Перетащите этапы за ручку, чтобы изменить порядок. Нажмите на этап, чтобы открыть и отредактировать поля.
          Сверху — ранний переход, внизу — более поздний. Дата — 09.02.2026.
        </p>
        {props.steps.length === 0 ? (
          <div className="kc-career-map__empty">Пока нет этапов. Нажмите «+ Этап», чтобы добавить первый.</div>
        ) : (
          <div className="kc-career-edit-list">
            {props.steps.map((step, index) => {
              const isOpen = expanded[step.id] ?? false;
              const isDragging = dragId === step.id;
              return (
                <div
                  key={step.id}
                  className={`kc-career-edit-card ${isDragging ? "kc-career-edit-card--dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(step.id);
                  }}
                >
                  <div className="kc-career-edit-card__head">
                    <button
                      type="button"
                      className="kc-career-drag-handle"
                      title="Перетащить"
                      draggable
                      onDragStart={(e) => {
                        setDragId(step.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragId(null)}
                      aria-label="Перетащить этап"
                    >
                      ⋮⋮
                    </button>
                    <button
                      type="button"
                      className="kc-career-edit-card__summary flex-1 text-left"
                      onClick={() => toggleExpanded(step.id)}
                    >
                      <span className="kc-career-edit-card__index">Этап {index + 1}</span>
                      <span className="kc-career-edit-card__preview">{stepSummary(step)}</span>
                      <span className="kc-career-edit-card__chevron">{isOpen ? "▲" : "▼"}</span>
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-500/20"
                      onClick={() => removeStep(step.id)}
                    >
                      Удалить
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="kc-career-edit-grid">
                      <label className="block text-xs text-white/50">
                        Дата
                        <input
                          className={kcFieldInputClass}
                          value={step.date}
                          placeholder="09.02.2026"
                          onChange={(e) => updateStep(step.id, { date: e.target.value })}
                          onBlur={(e) =>
                            updateStep(step.id, { date: formatCareerDateInput(e.target.value) })
                          }
                        />
                      </label>
                      <label className="block text-xs text-white/50">
                        Должность / роль
                        <input
                          className={kcFieldInputClass}
                          value={step.title}
                          placeholder="Оператор 2 линии"
                          onChange={(e) => updateStep(step.id, { title: e.target.value })}
                        />
                      </label>
                      <label className="block text-xs text-white/50">
                        Отдел
                        <KcSuggestInput
                          value={step.department}
                          onChange={(v) => updateStep(step.id, { department: v })}
                          suggestions={departmentHints}
                          placeholder="Служба поддержки"
                        />
                      </label>
                      <label className="block text-xs text-white/50">
                        Подразделение
                        <KcSuggestInput
                          value={step.subdivision}
                          onChange={(v) => updateStep(step.id, { subdivision: v })}
                          suggestions={subdivisionHints}
                          placeholder="VIP-линия"
                        />
                      </label>
                      <label className="block text-xs text-white/50 kc-career-span-2">
                        Комментарий (необязательно)
                        <input
                          className={kcFieldInputClass}
                          value={step.note}
                          placeholder="Перевод в VIP-линию"
                          onChange={(e) => updateStep(step.id, { note: e.target.value })}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="kc-career-map rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3 sm:px-4 sm:py-4">
      <p className="kc-career-map__title">Карта развития</p>
      {viewSteps.length === 0 ? (
        <p className="kc-career-map__empty mt-3">Этапы карьерного роста пока не указаны.</p>
      ) : (
        <div className="kc-career-timeline mt-4">
          {viewSteps.map((step) => {
            const org = stepOrgLabel(step);
            return (
              <article key={step.id} className="kc-career-step">
                <span className="kc-career-step__dot" aria-hidden />
                <div className="kc-career-step__card">
                  {step.date ? <p className="kc-career-step__date">{step.date}</p> : null}
                  {step.title ? <p className="kc-career-step__title">{step.title}</p> : null}
                  {org ? <p className="kc-career-step__dept">{org}</p> : null}
                  {step.note ? <p className="kc-career-step__note">{step.note}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
