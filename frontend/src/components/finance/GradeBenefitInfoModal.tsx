import { useEffect } from "react";
import { BENEFIT_INFO, type BenefitInfoBlock, type BenefitInfoKey } from "./financeBenefitInfo";
import "./GradeInfoModal.css";

const panelSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.96)] to-[rgba(26,31,55,0.96)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.45)]";

function BenefitInfoBlockView(props: { block: BenefitInfoBlock }) {
  if (props.block.type === "heading") {
    return <h3 className="grade-benefit-info-modal__heading">{props.block.text}</h3>;
  }

  if (props.block.type === "list") {
    return (
      <ul className="grade-benefit-info-modal__list">
        {props.block.items.map((item) => (
          <li key={item} className="grade-benefit-info-modal__list-item">
            <span className="grade-benefit-info-modal__mark" aria-hidden>
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="grade-benefit-info-modal__paragraph">
      {props.block.parts.map((part, index) =>
        part.href ? (
          <a
            key={`${part.text}-${index}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="grade-benefit-info-modal__link"
          >
            {part.text}
          </a>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </p>
  );
}

export function GradeBenefitInfoModal(props: {
  open: boolean;
  infoKey: BenefitInfoKey | null;
  onClose: () => void;
}) {
  const info = props.infoKey ? BENEFIT_INFO[props.infoKey] : undefined;

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (!props.open || !props.infoKey || !info) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="grade-benefit-info-title"
        className={`w-full max-w-md p-5 sm:p-6 ${panelSurface}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="grade-benefit-info-title" className="text-lg font-semibold text-white">
            {info.title}
          </h2>
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10"
            onClick={props.onClose}
          >
            Закрыть
          </button>
        </div>

        <div className="grade-benefit-info-modal__body">
          {info.blocks.map((block, index) => (
            <BenefitInfoBlockView key={`${block.type}-${index}`} block={block} />
          ))}
        </div>
      </div>
    </div>
  );
}
