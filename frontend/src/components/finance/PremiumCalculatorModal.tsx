import { useEffect, useMemo, useState } from "react";
import { getOperatorPremiumAdjustments } from "./premiumAdjustments";
import {
  calculatePremium,
  DEFAULT_PREMIUM_INPUTS,
  type PremiumInputs,
} from "./premiumCalculation";
import {
  PremiumKpiCalculation,
  PremiumMetricsBlock,
  PremiumResultCard,
  premiumPanelSurface,
} from "./premiumModalUi";
import "./CurrentPremiumInfoModal.css";

export function PremiumCalculatorModal(props: { open: boolean; onClose: () => void }) {
  const [inputs, setInputs] = useState<PremiumInputs>(DEFAULT_PREMIUM_INPUTS);
  const adjustments = useMemo(() => getOperatorPremiumAdjustments(), []);
  const calculation = useMemo(() => calculatePremium(inputs), [inputs]);

  useEffect(() => {
    if (!props.open) return;
    setInputs(DEFAULT_PREMIUM_INPUTS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-calculator-title"
        className={`premium-info-modal__dialog premium-info-modal__dialog--wide w-full max-w-5xl p-5 sm:p-6 ${premiumPanelSurface}`}
      >
        <div className="premium-info-modal__header">
          <div>
            <h2 id="premium-calculator-title" className="text-lg font-semibold text-white">
              Калькулятор премии
            </h2>
            <p className="premium-info-modal__intro mt-1">
              Проверьте, как изменится сумма при других показателях
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10"
            onClick={props.onClose}
          >
            Закрыть
          </button>
        </div>

        <div className="premium-info-modal__layout premium-info-modal__layout--calc">
          <div className="premium-info-modal__layout-main">
            <PremiumMetricsBlock
              inputs={inputs}
              calculation={calculation}
              onInputsChange={setInputs}
              hoursIdPrefix="calc"
            />
          </div>
          <aside className="premium-info-modal__layout-side">
            <PremiumResultCard calculation={calculation} adjustments={adjustments} showGrandTotal calculator />
            <PremiumKpiCalculation calculation={calculation} />
          </aside>
        </div>
      </div>
    </div>
  );
}
