import { useEffect, useState, type ReactNode } from "react";
import { FinanceRecordsModal } from "../components/finance/FinanceRecordsModal";
import { CurrentPremiumInfoModal } from "../components/finance/CurrentPremiumInfoModal";
import { GradeInfoModal } from "../components/finance/GradeInfoModal";
import { OPERATOR_CURRENT_GRADE } from "../components/finance/financeGradeData";
import { getOperatorCurrentPremiumAmount } from "../components/finance/operatorFinancePremium";
import infoIcon from "../assets/operator/info-circle.png";
import { MaskedIcon } from "../components/operator/MaskedIcon";
import {
  DEMO_BONUSES,
  DEMO_FINES,
  DEMO_OVERTIME,
  DEMO_RECALCULATIONS,
  DEMO_REFERRALS,
  LIST_PREVIEW_LIMIT,
  type OvertimeRow,
  type ReasonAmountRow,
} from "../components/finance/financeDemoData";
import { OperatorHeaderActions } from "../components/OperatorHeaderActions";
import { fetchMe, type AuthUser } from "../lib/auth";
import { fetchOperatorFinance } from "../lib/financeOperator";

const panelSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.74)] to-[rgba(26,31,55,0.5)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

const PORTAL_LINKS = {
  ndfl: "https://portal.paricorp.ru/platform/cloud-serviceorder/statement/2NDFL/",
  reference: "https://portal.paricorp.ru/platform/cloud-serviceorder/statement/REFERENCE_FROM_WORK/",
  employment: "https://portal.paricorp.ru/platform/cloud-serviceorder/statement/COPY_EMPLOYMENT_HISTORY/",
} as const;

const OPERATOR_CURRENT_PREMIUM = getOperatorCurrentPremiumAmount();

type ModalKind = "overtime" | "bonuses" | "fines" | "recalculations" | null;

function fmtRub(n: number) {
  return `${new Intl.NumberFormat("ru-RU").format(n)} руб.`;
}

function FinanceCard(props: { className?: string; children: ReactNode }) {
  return <section className={`p-5 sm:p-6 ${panelSurface} ${props.className ?? ""}`}>{props.children}</section>;
}

function ShowAllButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="shrink-0 rounded-lg border border-pari-500/30 bg-pari-500/15 px-2.5 py-1 text-[11px] font-medium text-pari-300 transition hover:bg-pari-500/25"
      onClick={props.onClick}
    >
      Показать всё
    </button>
  );
}

function MoneyAmount(props: { amount: number }) {
  if (props.amount === 0) {
    return <span className="shrink-0 text-sm font-semibold tabular-nums text-white/45">0 руб.</span>;
  }
  const positive = props.amount >= 0;
  return (
    <span className={`shrink-0 text-sm font-semibold tabular-nums ${positive ? "text-emerald-400" : "text-red-400"}`}>
      {positive ? "+" : "−"} {fmtRub(Math.abs(props.amount))}
    </span>
  );
}

function OvertimeListCard(props: { items: OvertimeRow[]; onShowAll: () => void }) {
  const preview = props.items.slice(0, LIST_PREVIEW_LIMIT);
  return (
    <FinanceCard className="flex min-h-[200px] flex-1 flex-col">
      <div className="mb-4 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Переработки</h2>
        <ShowAllButton onClick={props.onShowAll} />
      </div>
      <ul className="min-h-0 flex-1 space-y-3">
        {preview.map((item) => (
          <li
            key={item.date}
            className="flex items-start justify-between gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-sm text-white/90">Смена</p>
              <p className="mt-0.5 text-[11px] text-white/45">
                {item.date} · {item.hours} {item.hours === 1 ? "час" : item.hours < 5 ? "часа" : "часов"}
              </p>
            </div>
            <MoneyAmount amount={item.amount} />
          </li>
        ))}
      </ul>
    </FinanceCard>
  );
}

function ReasonListCard(props: {
  title: string;
  items: ReasonAmountRow[];
  onShowAll: () => void;
}) {
  const preview = props.items.slice(0, LIST_PREVIEW_LIMIT);
  return (
    <FinanceCard className="flex min-h-[200px] flex-1 flex-col">
      <div className="mb-4 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">{props.title}</h2>
        <ShowAllButton onClick={props.onShowAll} />
      </div>
      <ul className="min-h-0 flex-1 space-y-3">
        {preview.map((item) => (
          <li
            key={`${item.date}-${item.reason}`}
            className="flex items-start justify-between gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-sm text-white/90">{item.reason}</p>
              <p className="mt-0.5 text-[11px] text-white/45">{item.date}</p>
            </div>
            <MoneyAmount amount={item.amount} />
          </li>
        ))}
      </ul>
    </FinanceCard>
  );
}

function SupportMetric(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">{props.label}</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap text-white">{props.value}</span>
    </div>
  );
}

function CertificateLink(props: { href: string; children: string }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-pari-500/35 bg-pari-500/20 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white transition hover:border-pari-400/50 hover:bg-pari-500/30 sm:text-sm"
    >
      {props.children}
    </a>
  );
}

export function FinancePage() {
  const [meUser, setMeUser] = useState<AuthUser | null>(null);
  const [meReady, setMeReady] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [gradeInfoOpen, setGradeInfoOpen] = useState(false);
  const [premiumInfoOpen, setPremiumInfoOpen] = useState(false);
  const [overtimeRows, setOvertimeRows] = useState<OvertimeRow[]>(DEMO_OVERTIME);
  const [bonusRows, setBonusRows] = useState<ReasonAmountRow[]>(DEMO_BONUSES);
  const [fineRows, setFineRows] = useState<ReasonAmountRow[]>(DEMO_FINES);
  const [recalcRows, setRecalcRows] = useState<ReasonAmountRow[]>(DEMO_RECALCULATIONS);

  useEffect(() => {
    let cancelled = false;
    setMeReady(false);
    void fetchMe()
      .then((u) => {
        if (!cancelled) setMeUser(u);
      })
      .catch(() => {
        if (!cancelled) setMeUser(null);
      })
      .finally(() => {
        if (!cancelled) setMeReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchOperatorFinance()
      .then((data) => {
        if (cancelled) return;
        if (data.overtime.length) setOvertimeRows(data.overtime);
        if (data.bonuses.length) setBonusRows(data.bonuses);
        if (data.fines.length) setFineRows(data.fines);
        if (data.recalculations.length) setRecalcRows(data.recalculations);
      })
      .catch(() => {
        /* демо-данные остаются при недоступности API */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-w-0">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Финансы</h1>
        <OperatorHeaderActions me={meUser} meReady={meReady} />
      </header>

      <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
        <div className="space-y-5 lg:col-span-8">
          <div className="grid items-stretch gap-5 sm:grid-cols-2">
            <FinanceCard className="relative flex h-full flex-col overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-pari-500/25 via-[#753bbd]/20 to-transparent"
                aria-hidden
              />
              <div className="relative flex min-h-0 flex-1 flex-col">
                <div>
                  <p className="text-base font-bold text-white sm:text-lg">Служба поддержки</p>
                  <p className="mt-0.5 text-xs text-white/65">Специалист 2-ой линии</p>
                </div>
                <div className="mt-auto flex flex-col divide-y divide-white/[0.06] pt-6">
                  <SupportMetric label="Оклад" value={fmtRub(40200)} />
                  <SupportMetric label="MAX KPI" value={fmtRub(23000)} />
                  <SupportMetric label="Начало работы" value="08.05.2023" />
                </div>
              </div>
            </FinanceCard>

            <div className="flex flex-col gap-5">
              <FinanceCard className="shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-white/55">Премия (текущая)</p>
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-pari-500/25 bg-pari-500/10 transition hover:border-pari-400/45 hover:bg-pari-500/20"
                    aria-label="Информация о текущей премии"
                    title="Информация о текущей премии"
                    onClick={() => setPremiumInfoOpen(true)}
                  >
                    <MaskedIcon src={infoIcon} color="#00c7b1" size={18} />
                  </button>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{fmtRub(OPERATOR_CURRENT_PREMIUM)}</p>
                <p className="mt-3 text-xs text-white/45">Премия в прошлом месяце: {fmtRub(21000)}</p>
              </FinanceCard>

              <FinanceCard className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">Грейд</h2>
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-pari-500/25 bg-pari-500/10 transition hover:border-pari-400/45 hover:bg-pari-500/20"
                    aria-label="Информация о грейде"
                    title="Информация о грейде"
                    onClick={() => setGradeInfoOpen(true)}
                  >
                    <MaskedIcon src={infoIcon} color="#00c7b1" size={18} />
                  </button>
                </div>
                <p className="mt-4 text-4xl font-bold leading-none tracking-tight text-pari-300">{OPERATOR_CURRENT_GRADE}</p>
              </FinanceCard>
            </div>
          </div>

          <FinanceCard>
            <h2 className="text-sm font-semibold text-white">Справки</h2>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <CertificateLink href={PORTAL_LINKS.ndfl}>2НДФЛ</CertificateLink>
              <CertificateLink href={PORTAL_LINKS.reference}>справки с места работы</CertificateLink>
              <CertificateLink href={PORTAL_LINKS.employment}>копия трудовой книжки</CertificateLink>
            </div>
          </FinanceCard>

          <FinanceCard>
            <h2 className="mb-4 text-sm font-semibold text-white">Реферальная программа</h2>
            <ul className="space-y-4">
              {DEMO_REFERRALS.map((ref) => (
                <li key={ref.name} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">{ref.name}</p>
                      <p className="text-xs text-white/45">{ref.dept}</p>
                    </div>
                    <MoneyAmount amount={ref.earnedReward} />
                  </div>
                  <ul className="mt-3 space-y-1.5 text-xs">
                    {ref.done.map((step) => (
                      <li key={step} className="flex items-center gap-2 text-pari-300">
                        <span className="text-emerald-400" aria-hidden>
                          ✓
                        </span>
                        {step}
                      </li>
                    ))}
                    {ref.pending.map((step) => (
                      <li key={step} className="flex items-center gap-2 text-white/35">
                        <span className="h-3 w-3 rounded-full border border-white/20" aria-hidden />
                        {step}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </FinanceCard>
        </div>

        <div className="flex flex-col gap-5 lg:col-span-4">
          <OvertimeListCard items={overtimeRows} onShowAll={() => setModal("overtime")} />
          <ReasonListCard title="Премии" items={bonusRows} onShowAll={() => setModal("bonuses")} />
          <ReasonListCard title="Штрафы" items={fineRows} onShowAll={() => setModal("fines")} />
          <ReasonListCard title="Перерасчёты" items={recalcRows} onShowAll={() => setModal("recalculations")} />
        </div>
      </div>

      <p className="mt-8 border-t border-white/5 pt-6 text-sm text-white/45">
        @ 2026, Отдел реализации технических проектов
      </p>

      <FinanceRecordsModal
        open={modal === "overtime"}
        onClose={() => setModal(null)}
        title="Переработки"
        kind="overtime"
        rows={overtimeRows}
      />
      <FinanceRecordsModal
        open={modal === "bonuses"}
        onClose={() => setModal(null)}
        title="Премии"
        kind="reason"
        rows={bonusRows}
      />
      <FinanceRecordsModal
        open={modal === "fines"}
        onClose={() => setModal(null)}
        title="Штрафы"
        kind="reason"
        rows={fineRows}
      />
      <FinanceRecordsModal
        open={modal === "recalculations"}
        onClose={() => setModal(null)}
        title="Перерасчёты"
        kind="reason"
        rows={recalcRows}
      />
      <GradeInfoModal open={gradeInfoOpen} onClose={() => setGradeInfoOpen(false)} />
      <CurrentPremiumInfoModal open={premiumInfoOpen} onClose={() => setPremiumInfoOpen(false)} />
    </div>
  );
}
