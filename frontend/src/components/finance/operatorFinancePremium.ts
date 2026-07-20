import { calcGrandPayout, getOperatorPremiumAdjustments, type PremiumAdjustments } from "./premiumAdjustments";
import {
  calculatePremium,
  OPERATOR_PREMIUM_RECORD,
  type PremiumInputs,
} from "./premiumCalculation";

export type OperatorPremiumSummary = {
  kpiPremium: number;
  adjustments: PremiumAdjustments;
  /** KPI + переработки + премии + перерасчёты + реферальная программа + штрафы. */
  totalWithAdjustments: number;
};

export function calcOperatorPremiumSummary(
  inputs: PremiumInputs = OPERATOR_PREMIUM_RECORD,
): OperatorPremiumSummary {
  const kpiPremium = calculatePremium(inputs).total;
  const adjustments = getOperatorPremiumAdjustments();
  return {
    kpiPremium,
    adjustments,
    totalWithAdjustments: calcGrandPayout(kpiPremium, adjustments),
  };
}

/** Сумма на карточке «Премия (текущая)» — KPI + доплаты и реферальная программа. */
export function getOperatorCurrentPremiumAmount(): number {
  return calcOperatorPremiumSummary().totalWithAdjustments;
}
