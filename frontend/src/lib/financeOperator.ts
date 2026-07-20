import { authHeaders, getApiBase } from "./auth";
import { fetchWithTimeout } from "./http";
import type { OvertimeRow, ReasonAmountRow } from "../components/finance/financeDemoData";

export type OperatorFinanceData = {
  overtime: OvertimeRow[];
  bonuses: ReasonAmountRow[];
  recalculations: ReasonAmountRow[];
  fines: ReasonAmountRow[];
};

export async function fetchOperatorFinance(): Promise<OperatorFinanceData> {
  const resp = await fetchWithTimeout(`${getApiBase()}/finance/my`, { headers: authHeaders() }, 15_000);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Финансы: ${resp.status} ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as OperatorFinanceData;
}
