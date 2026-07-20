import { FinanceJournalLayout } from "../finance-journal/FinanceJournalLayout";

export function OvertimeLayoutPage() {
  return <FinanceJournalLayout basePath="/overtime" journalLabel="Переработки" withStats />;
}

export function BonusesLayoutPage() {
  return <FinanceJournalLayout basePath="/bonuses" journalLabel="Премии" />;
}

export function RecalculationsLayoutPage() {
  return <FinanceJournalLayout basePath="/recalculations" journalLabel="Перерасчёты" />;
}
