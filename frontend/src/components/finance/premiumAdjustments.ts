import {
  DEMO_BONUSES,
  DEMO_FINES,
  DEMO_OVERTIME,
  DEMO_RECALCULATIONS,
  DEMO_REFERRALS,
  type OvertimeRow,
  type ReasonAmountRow,
  type ReferralRow,
} from "./financeDemoData";

export const OVERTIME_HOURLY_RATE = 400;

export type PremiumAdjustments = {
  overtime: readonly OvertimeRow[];
  bonuses: readonly ReasonAmountRow[];
  recalculations: readonly ReasonAmountRow[];
  fines: readonly ReasonAmountRow[];
  referrals: readonly ReferralRow[];
  overtimeTotal: number;
  bonusesTotal: number;
  recalculationsTotal: number;
  finesTotal: number;
  referralsTotal: number;
};

export function getOperatorPremiumAdjustments(): PremiumAdjustments {
  const overtime = DEMO_OVERTIME;
  const bonuses = DEMO_BONUSES;
  const recalculations = DEMO_RECALCULATIONS;
  const fines = DEMO_FINES;
  const referrals = DEMO_REFERRALS;
  return {
    overtime,
    bonuses,
    recalculations,
    fines,
    referrals,
    overtimeTotal: overtime.reduce((sum, row) => sum + row.amount, 0),
    bonusesTotal: bonuses.reduce((sum, row) => sum + row.amount, 0),
    recalculationsTotal: recalculations.reduce((sum, row) => sum + row.amount, 0),
    finesTotal: fines.reduce((sum, row) => sum + row.amount, 0),
    referralsTotal: referrals.reduce((sum, row) => sum + row.earnedReward, 0),
  };
}

export function calcGrandPayout(kpiPremium: number, adjustments: PremiumAdjustments): number {
  return Math.round(
    kpiPremium +
      adjustments.overtimeTotal +
      adjustments.bonusesTotal +
      adjustments.recalculationsTotal +
      adjustments.finesTotal +
      adjustments.referralsTotal,
  );
}

function hoursLabel(hours: number): string {
  if (hours === 1) return "1 час";
  if (hours >= 2 && hours <= 4) return `${hours} часа`;
  return `${hours} часов`;
}

export function formatOvertimeLine(row: OvertimeRow): string {
  return `${row.date} · ${hoursLabel(row.hours)}`;
}
