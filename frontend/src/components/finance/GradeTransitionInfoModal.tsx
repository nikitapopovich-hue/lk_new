import { useEffect } from "react";
import { GRADE_TRANSITION_INFO } from "./financeGradeData";
import "./GradeInfoModal.css";

const panelSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.96)] to-[rgba(26,31,55,0.96)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.45)]";

export function GradeTransitionInfoModal(props: {
  open: boolean;
  gradeId: string | null;
  gradeLabel: string;
  onClose: () => void;
}) {
  const sections = props.gradeId ? GRADE_TRANSITION_INFO[props.gradeId] : undefined;
  const hasContent = Boolean(sections?.some((section) => section.items.length > 0));
  const multiSection = (sections?.length ?? 0) > 1;
  const primarySectionTitle = sections?.[0]?.title;
  const modalTitle =
    multiSection && primarySectionTitle === "Рекомендованные условия перехода"
      ? primarySectionTitle
      : multiSection
        ? "Информация о грейде"
        : "Рекомендованные условия перехода";

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (!props.open || !props.gradeId || !hasContent || !sections) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="grade-transition-title"
        className={`w-full max-w-md p-5 sm:p-6 ${panelSurface}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="grade-transition-title" className="text-lg font-semibold text-white">
              {modalTitle}
            </h2>
            <p className="grade-transition-modal__subtitle">На грейд {props.gradeLabel}</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10"
            onClick={props.onClose}
          >
            Закрыть
          </button>
        </div>

        {sections.map((section, sectionIndex) => (
          <section key={section.title} className="grade-transition-modal__section">
            {multiSection && !(sectionIndex === 0 && section.title === modalTitle) ? (
              <h3 className="grade-transition-modal__section-title">{section.title}</h3>
            ) : null}
            <ul className="grade-transition-modal__list">
              {section.items.map((line) => (
                <li key={line} className="grade-transition-modal__item">
                  <span className="grade-transition-modal__mark" aria-hidden>
                    •
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
