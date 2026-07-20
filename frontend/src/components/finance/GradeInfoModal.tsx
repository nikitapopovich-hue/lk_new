import { useEffect, useState } from "react";
import infoIcon from "../../assets/operator/info-circle.png";
import { MaskedIcon } from "../operator/MaskedIcon";
import { GradeBenefitInfoModal } from "./GradeBenefitInfoModal";
import { GradeTransitionInfoModal } from "./GradeTransitionInfoModal";
import type { BenefitInfoKey } from "./financeBenefitInfo";
import { hasBenefitInfo } from "./financeBenefitInfo";
import {
  getOperatorCurrentGradeIndex,
  hasGradeTransitionConditions,
  OPERATOR_GRADE_LEVELS,
  type GradeBenefit,
  type GradeLevel,
} from "./financeGradeData";
import "./GradeInfoModal.css";

const panelSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.96)] to-[rgba(26,31,55,0.96)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.45)]";

function LockIcon(props: { size?: number }) {
  const size = props.size ?? 22;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="16" r="1.25" fill="currentColor" />
    </svg>
  );
}

function BenefitLine(props: {
  item: GradeBenefit;
  locked?: boolean;
  passed?: boolean;
  onOpenInfo: (infoKey: BenefitInfoKey) => void;
}) {
  const showInfo = hasBenefitInfo(props.item.infoKey);

  return (
    <li
      className={[
        "grade-info-modal__benefit",
        props.locked ? "grade-info-modal__benefit--locked" : "",
        props.passed ? "grade-info-modal__benefit--passed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="grade-info-modal__benefit-mark" aria-hidden>
        ✦
      </span>
      <div className="grade-info-modal__benefit-row">
        {props.item.href ? (
          <a
            href={props.item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="grade-info-modal__benefit-link"
          >
            {props.item.label}
          </a>
        ) : (
          <span className="grade-info-modal__benefit-label">{props.item.label}</span>
        )}
        {showInfo && props.item.infoKey ? (
          <button
            type="button"
            className="grade-info-modal__benefit-info-btn"
            aria-label={`Подробнее: ${props.item.label}`}
            title="Подробнее"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              props.onOpenInfo(props.item.infoKey!);
            }}
          >
            <MaskedIcon src={infoIcon} color="#00c7b1" size={14} />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function GradeSlide(props: {
  level: GradeLevel;
  onOpenTransition: (level: GradeLevel) => void;
  onOpenBenefitInfo: (infoKey: BenefitInfoKey) => void;
}) {
  const locked = Boolean(props.level.locked);
  const passed = Boolean(props.level.passed);
  const showTransitionInfo = hasGradeTransitionConditions(props.level.id);

  const cardClass = locked
    ? "grade-info-modal__card--locked"
    : passed
      ? "grade-info-modal__card--passed"
      : "grade-info-modal__card--achieved";

  const benefitsTitle = locked ? "Недоступно" : passed ? "Было доступно" : "Доступно";

  return (
    <article className={["grade-info-modal__card", cardClass].join(" ")}>
      {locked ? (
        <span className="grade-info-modal__badge grade-info-modal__badge--next grade-info-modal__badge--locked">
          <LockIcon size={12} />
          Следующий грейд
        </span>
      ) : passed ? (
        <span className="grade-info-modal__badge grade-info-modal__badge--passed">✓ Пройден</span>
      ) : (
        <span className="grade-info-modal__badge">✓ Ваш грейд</span>
      )}

      <div className="grade-info-modal__grade-row">
        <p className="grade-info-modal__grade-num">{props.level.label}</p>
        {showTransitionInfo ? (
          <button
            type="button"
            className="grade-info-modal__info-btn"
            aria-label={`Условия перехода на грейд ${props.level.label}`}
            title="Рекомендованные условия перехода"
            onClick={(e) => {
              e.stopPropagation();
              props.onOpenTransition(props.level);
            }}
          >
            <MaskedIcon src={infoIcon} color="#00c7b1" size={18} />
          </button>
        ) : null}
      </div>

      <p className="grade-info-modal__benefits-title">{benefitsTitle}</p>
      <ul
        className={[
          "grade-info-modal__benefits",
          locked ? "grade-info-modal__benefits--locked" : "",
          passed ? "grade-info-modal__benefits--passed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {props.level.benefits.map((item) => (
          <BenefitLine
            key={item.label}
            item={item}
            locked={locked}
            passed={passed}
            onOpenInfo={props.onOpenBenefitInfo}
          />
        ))}
      </ul>
    </article>
  );
}

export function GradeInfoModal(props: { open: boolean; onClose: () => void }) {
  const levels = OPERATOR_GRADE_LEVELS;
  const [index, setIndex] = useState(0);
  const [transitionLevel, setTransitionLevel] = useState<GradeLevel | null>(null);
  const [benefitInfoKey, setBenefitInfoKey] = useState<BenefitInfoKey | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setIndex(getOperatorCurrentGradeIndex());
    setTransitionLevel(null);
    setBenefitInfoKey(null);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (benefitInfoKey) setBenefitInfoKey(null);
        else if (transitionLevel) setTransitionLevel(null);
        else props.onClose();
      }
      if (!transitionLevel && !benefitInfoKey) {
        if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
        if (e.key === "ArrowRight") setIndex((i) => Math.min(levels.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose, levels.length, transitionLevel, benefitInfoKey]);

  if (!props.open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={props.onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="grade-info-title"
          className={`w-full max-w-md p-5 sm:p-6 ${panelSurface}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="grade-info-title" className="text-lg font-semibold text-white">
                Грейд
              </h2>
              <p className="mt-1 text-xs text-white/45">Что доступно сейчас и на следующих уровнях</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10"
              onClick={props.onClose}
            >
              Закрыть
            </button>
          </div>

          <div className="grade-info-modal__carousel">
            <div
              className="grade-info-modal__track"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {levels.map((level) => (
                <div key={level.id} className="grade-info-modal__slide">
                  <GradeSlide
                    level={level}
                    onOpenTransition={setTransitionLevel}
                    onOpenBenefitInfo={setBenefitInfoKey}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grade-info-modal__nav">
            <button
              type="button"
              className="grade-info-modal__nav-btn"
              aria-label="Предыдущий грейд"
              disabled={index <= 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              ‹
            </button>
            <div className="grade-info-modal__dots" role="tablist" aria-label="Грейды">
              {levels.map((level, i) => (
                <button
                  key={level.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Грейд ${level.label}`}
                  className={`grade-info-modal__dot ${i === index ? "grade-info-modal__dot--active" : ""}`}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
            <button
              type="button"
              className="grade-info-modal__nav-btn"
              aria-label="Следующий грейд"
              disabled={index >= levels.length - 1}
              onClick={() => setIndex((i) => Math.min(levels.length - 1, i + 1))}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <GradeTransitionInfoModal
        open={transitionLevel !== null}
        gradeId={transitionLevel?.id ?? null}
        gradeLabel={transitionLevel?.label ?? ""}
        onClose={() => setTransitionLevel(null)}
      />

      <GradeBenefitInfoModal
        open={benefitInfoKey !== null}
        infoKey={benefitInfoKey}
        onClose={() => setBenefitInfoKey(null)}
      />
    </>
  );
}
