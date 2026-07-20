import { ViolationBrandSelect } from "../violations/ViolationBrandSelect";
import {
  calcGrandPayout,
  getOperatorPremiumAdjustments,
  type PremiumAdjustments,
} from "./premiumAdjustments";
import {
  formatPremiumRate,
  formatPremiumRub,
  premiumFieldSelectOptions,
  type PremiumCalculation,
  type PremiumInputs,
} from "./premiumCalculation";

export const premiumPanelSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.96)] to-[rgba(26,31,55,0.96)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.45)]";

type MetricField = Exclude<keyof PremiumInputs, "lineHours" | "plannedHours" | "penalty">;

export function parsePremiumNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function PremiumKpiCalculation(props: { calculation: PremiumCalculation }) {
  const { calculation } = props;

  const steps: Array<{
    label: string;
    detail: string;
    value: string;
    result?: boolean;
  }> = [
    {
      label: "Сумма показателей",
      detail: "Итоговый мониторинг + КПД + Next Reply + First Reply",
      value: formatPremiumRub(calculation.baseSum),
    },
    {
      label: "× Коэффициенты",
      detail: "SL × CSAT (низкие оценки) × Проставление тематик",
      value: `× ${calculation.slMultiplier.toLocaleString("ru-RU")} × ${calculation.csatMultiplier.toLocaleString("ru-RU")} × ${calculation.themesMultiplier.toLocaleString("ru-RU")}`,
    },
    {
      label: "× Часы",
      detail: "Часы отработанные по факту ÷ Часы запланированные",
      value: `× ${calculation.lineHours.toLocaleString("ru-RU")} ÷ ${calculation.plannedHours.toLocaleString("ru-RU")}`,
    },
  ];

  if (calculation.penalty > 0) {
    steps.push({
      label: "− Штраф",
      detail: "Штраф (KPI)",
      value: `− ${formatPremiumRub(calculation.penalty)}`,
    });
  }

  steps.push({
    label: "Премия на руки",
    detail: "Итог KPI",
    value: formatPremiumRub(calculation.total),
    result: true,
  });

  return (
    <div className="premium-info-modal__kpi-calc">
      <p className="premium-info-modal__kpi-calc-title">Расчёт премии KPI</p>
      <div className="premium-info-modal__kpi-calc-steps">
        {steps.map((step, index) => (
          <div
            key={`${step.label}-${index}`}
            className={`premium-info-modal__kpi-calc-step${step.result ? " premium-info-modal__kpi-calc-step--result" : ""}`}
          >
            <div className="premium-info-modal__kpi-calc-step-text">
              <span className="premium-info-modal__kpi-calc-step-label">{step.label}</span>
              <span className="premium-info-modal__kpi-calc-step-detail">{step.detail}</span>
            </div>
            <span className="premium-info-modal__kpi-calc-step-value">{step.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PremiumResultCard(props: {
  calculation: PremiumCalculation;
  adjustments?: PremiumAdjustments;
  showGrandTotal?: boolean;
  calculator?: boolean;
}) {
  const adjustments = props.adjustments ?? getOperatorPremiumAdjustments();
  const kpiPremium = props.calculation.total;
  const totalWithAdjustments = calcGrandPayout(kpiPremium, adjustments);

  return (
    <div className="premium-info-modal__result">
      <p className="premium-info-modal__result-label">
        {props.calculator ? "Премия (тестовый расчёт)" : "Премия (текущая)"}
      </p>
      {props.calculator ? (
        <p className="premium-info-modal__result-hint">Калькулятор — сумма меняется при смене показателей</p>
      ) : null}
      <p className="premium-info-modal__result-value">{formatPremiumRub(kpiPremium)}</p>
      {props.showGrandTotal ? (
        <>
          <p className="premium-info-modal__result-note">
            Доплаты и удержания — на странице «Финансы»
          </p>
          <div className="premium-info-modal__result-parts">
          <div className="premium-info-modal__result-part">
            <span>Переработки</span>
            <span className="premium-info-modal__result-part-value--plus">
              {fmtSignedRub(adjustments.overtimeTotal)}
            </span>
          </div>
          <div className="premium-info-modal__result-part">
            <span>Премии</span>
            <span className="premium-info-modal__result-part-value--plus">
              {fmtSignedRub(adjustments.bonusesTotal)}
            </span>
          </div>
          <div className="premium-info-modal__result-part">
            <span>Перерасчёты</span>
            <span className={adjustments.recalculationsTotal >= 0 ? "premium-info-modal__result-part-value--plus" : "premium-info-modal__result-part-value--minus"}>
              {fmtSignedRub(adjustments.recalculationsTotal)}
            </span>
          </div>
          <div className="premium-info-modal__result-part">
            <span>Реферальная программа</span>
            <span className="premium-info-modal__result-part-value--plus">
              {fmtSignedRub(adjustments.referralsTotal)}
            </span>
          </div>
          <div className="premium-info-modal__result-part">
            <span>Штрафы</span>
            <span className="premium-info-modal__result-part-value--minus">
              {fmtSignedRub(adjustments.finesTotal)}
            </span>
          </div>
          <div className="premium-info-modal__result-part premium-info-modal__result-part--total">
            <span>{props.calculator ? "Итого (тест)" : "Итого с доплатами"}</span>
            <span>{formatPremiumRub(totalWithAdjustments)}</span>
          </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function fmtSignedRub(amount: number): string {
  const abs = formatPremiumRub(Math.abs(amount));
  if (amount > 0) return `+ ${abs}`;
  if (amount < 0) return `− ${abs}`;
  return abs;
}

export function PremiumMetricsBlock(props: {
  inputs: PremiumInputs;
  calculation: PremiumCalculation;
  readOnly?: boolean;
  onInputsChange?: (next: PremiumInputs) => void;
  hoursIdPrefix: string;
}) {
  let lastGroup: string | undefined;

  function setMetric<K extends MetricField>(key: K, value: PremiumInputs[K]) {
    props.onInputsChange?.({ ...props.inputs, [key]: value });
  }

  return (
    <div className="premium-info-modal__table" role="table" aria-label="Показатели премии">
      <div className="premium-info-modal__table-head" role="row">
        <span role="columnheader">Показатель</span>
        <span role="columnheader">Итоговый результат</span>
        <span role="columnheader">Итог от общей суммы премии</span>
      </div>

      {props.calculation.rows.map((row) => {
        const showGroup = row.group && row.group !== lastGroup;
        if (row.group) lastGroup = row.group;

        return (
          <div key={row.id}>
            {showGroup ? (
              <div className="premium-info-modal__table-row premium-info-modal__table-row--group">{row.group}</div>
            ) : null}
            <div className="premium-info-modal__table-row" role="row">
              <span className="premium-info-modal__metric-label" role="cell">
                {row.label}
                {row.hint ? <span className="premium-info-modal__metric-hint">{row.hint}</span> : null}
              </span>
              <span className="premium-info-modal__select-cell" role="cell">
                {props.readOnly || !row.field ? (
                  <span className="premium-info-modal__fixed-value">{row.actualValue}</span>
                ) : (
                  <ViolationBrandSelect
                    className="premium-info-modal__brand-select"
                    value={props.inputs[row.field]}
                    options={premiumFieldSelectOptions(row.field)}
                    onChange={(value) => setMetric(row.field!, value as PremiumInputs[typeof row.field])}
                  />
                )}
              </span>
              <span className="premium-info-modal__rate" role="cell">
                {formatPremiumRate(row.rateValue, row.kind)}
              </span>
            </div>
          </div>
        );
      })}

      <div className="premium-info-modal__table-row premium-info-modal__table-row--penalty" role="row">
        <span className="premium-info-modal__metric-label" role="cell">
          Штраф (KPI)
        </span>
        <span role="cell">
          {props.readOnly ? (
            <span className="premium-info-modal__fixed-value">
              {props.inputs.penalty > 0 ? formatPremiumRub(props.inputs.penalty) : "0 ₽"}
            </span>
          ) : (
            <input
              type="number"
              min={0}
              step={1}
              className="premium-info-modal__input"
              value={props.inputs.penalty}
              onChange={(e) =>
                props.onInputsChange?.({
                  ...props.inputs,
                  penalty: parsePremiumNumber(e.target.value),
                })
              }
              aria-label="Штраф KPI"
            />
          )}
        </span>
        <span className="premium-info-modal__rate premium-info-modal__rate--penalty" role="cell">
          − {formatPremiumRub(props.inputs.penalty)}
        </span>
      </div>

      <div className="premium-info-modal__table-row premium-info-modal__table-row--hours" role="row">
        <span className="premium-info-modal__metric-label" role="cell">
          Часы отработанные по факту
        </span>
        <span role="cell">
          {props.readOnly ? (
            <span className="premium-info-modal__fixed-value">
              {props.inputs.lineHours.toLocaleString("ru-RU")}
            </span>
          ) : (
            <input
              id={`${props.hoursIdPrefix}-line-hours`}
              type="number"
              min={0}
              step={0.1}
              className="premium-info-modal__input"
              value={props.inputs.lineHours}
              onChange={(e) =>
                props.onInputsChange?.({
                  ...props.inputs,
                  lineHours: parsePremiumNumber(e.target.value),
                })
              }
              aria-label="Часы отработанные по факту"
            />
          )}
        </span>
        <span className="premium-info-modal__rate premium-info-modal__rate--muted" role="cell">
          —
        </span>
      </div>

      <div className="premium-info-modal__table-row premium-info-modal__table-row--hours" role="row">
        <span className="premium-info-modal__metric-label" role="cell">
          Часы запланированные
        </span>
        <span role="cell">
          {props.readOnly ? (
            <span className="premium-info-modal__fixed-value">
              {props.inputs.plannedHours.toLocaleString("ru-RU")}
            </span>
          ) : (
            <input
              id={`${props.hoursIdPrefix}-planned-hours`}
              type="number"
              min={0}
              step={0.1}
              className="premium-info-modal__input"
              value={props.inputs.plannedHours}
              onChange={(e) =>
                props.onInputsChange?.({
                  ...props.inputs,
                  plannedHours: parsePremiumNumber(e.target.value),
                })
              }
              aria-label="Часы запланированные"
            />
          )}
        </span>
        <span className="premium-info-modal__rate premium-info-modal__rate--muted" role="cell">
          —
        </span>
      </div>
    </div>
  );
}
