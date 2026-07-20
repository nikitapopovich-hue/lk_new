import { useEffect, useMemo, useState } from "react";
import { getOperatorPremiumAdjustments } from "./premiumAdjustments";
import { calculatePremium, OPERATOR_PREMIUM_RECORD, type PremiumInputs } from "./premiumCalculation";
import { PremiumCalculatorModal } from "./PremiumCalculatorModal";
import {
  PremiumKpiCalculation,
  PremiumMetricsBlock,
  PremiumResultCard,
  premiumPanelSurface,
} from "./premiumModalUi";
import "./CurrentPremiumInfoModal.css";

export function CurrentPremiumInfoModal(props: {
  open: boolean;
  onClose: () => void;
  record?: PremiumInputs;
}) {
  const fixedInputs = props.record ?? OPERATOR_PREMIUM_RECORD;
  const adjustments = useMemo(() => getOperatorPremiumAdjustments(), []);
  const [calculatorOpen, setCalculatorOpen] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setCalculatorOpen(false);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (calculatorOpen) setCalculatorOpen(false);
        else props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose, calculatorOpen]);

  const fixedCalculation = useMemo(() => calculatePremium(fixedInputs), [fixedInputs]);

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
          aria-labelledby="current-premium-info-title"
          className={`premium-info-modal__dialog premium-info-modal__dialog--wide w-full max-w-5xl p-5 sm:p-6 ${premiumPanelSurface}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="premium-info-modal__header">
            <div>
              <h2 id="current-premium-info-title" className="text-lg font-semibold text-white">
                Премия (текущая)
              </h2>
              <p className="premium-info-modal__intro mt-1">Показатели за текущий период</p>
            </div>
            <div className="premium-info-modal__header-actions">
              <button
                type="button"
                className="premium-info-modal__calc-open-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setCalculatorOpen(true);
                }}
              >
                Калькулятор премии
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10"
                onClick={props.onClose}
              >
                Закрыть
              </button>
            </div>
          </div>

          <div className="premium-info-modal__layout premium-info-modal__layout--aligned">
            <div className="premium-info-modal__layout-main">
              <PremiumMetricsBlock
                inputs={fixedInputs}
                calculation={fixedCalculation}
                readOnly
                hoursIdPrefix="fixed"
              />
            </div>
            <aside className="premium-info-modal__layout-side">
              <PremiumResultCard
                calculation={fixedCalculation}
                adjustments={adjustments}
                showGrandTotal
              />
              <PremiumKpiCalculation calculation={fixedCalculation} />
            </aside>
          </div>
        </div>
      </div>

      <PremiumCalculatorModal open={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
    </>
  );
}
