import { useCallback, useEffect, useMemo, useState } from "react";
import { ViolationBrandSelect } from "../../components/violations/ViolationBrandSelect";
import { ViolationConfirmModal } from "../../components/violations/ViolationConfirmModal";
import { FinanceEntryFormModal } from "../../components/finance-journal/FinanceEntryFormModal";
import "../../components/violations/ViolationsJournal.css";
import {
  bulkDeleteFinanceEntries,
  currentMonthKey,
  deleteFinanceEntry,
  fetchFinanceEntries,
  fetchFinanceMeta,
  FINANCE_JOURNAL_LABELS,
  type FinanceEntry,
  type FinanceEntryType,
  type FinanceMeta,
} from "../../lib/financeJournal";
import { VIOLATION_MONTH_OPTIONS } from "../../lib/violationMonthOptions";

type SortKey = "date" | "employeeName" | "hours" | "reason" | "amount";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

type Props = {
  entryType: FinanceEntryType;
};

function parseRuDateMs(value: string): number {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!m) return 0;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

function compareEntries(a: FinanceEntry, b: FinanceEntry, key: SortKey): number {
  switch (key) {
    case "date":
      return parseRuDateMs(a.date) - parseRuDateMs(b.date);
    case "employeeName":
      return a.employeeName.localeCompare(b.employeeName, "ru");
    case "hours":
      return (a.hours || 0) - (b.hours || 0);
    case "reason":
      return (a.reason || "").localeCompare(b.reason || "", "ru");
    case "amount":
      return (a.amount || 0) - (b.amount || 0);
    default:
      return 0;
  }
}

function SortHeader(props: {
  label: string;
  title: string;
  className: string;
  active: boolean;
  dir: SortDir | null;
  onSort: () => void;
}) {
  return (
    <th className={props.className} title={props.title}>
      <button type="button" className="vj-th-sort" onClick={props.onSort} title={props.title}>
        <span>{props.label}</span>
        <span className="vj-th-sort__icon" aria-hidden>
          {props.active ? (props.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function FinanceJournalListPage(props: Props) {
  const labels = FINANCE_JOURNAL_LABELS[props.entryType];
  const showHours = props.entryType === "overtime";
  const showReason = props.entryType !== "overtime";

  const [month, setMonth] = useState(currentMonthKey);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [meta, setMeta] = useState<FinanceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formEntry, setFormEntry] = useState<FinanceEntry | null | "new">(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FinanceEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);

  const allSelected = entries.length > 0 && selected.size === entries.length;
  const selectedIds = useMemo(() => [...selected], [selected]);

  const sortedEntries = useMemo(() => {
    if (!sort) return entries;
    const copy = [...entries];
    copy.sort((a, b) => {
      const cmp = compareEntries(a, b, sort.key);
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [entries, sort]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchFinanceEntries(props.entryType, month ? { month } : {});
      setEntries(rows);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [props.entryType, month]);

  const reloadMeta = useCallback(async () => {
    try {
      setMeta(await fetchFinanceMeta(props.entryType));
    } catch {
      setMeta(null);
    }
  }, [props.entryType]);

  useEffect(() => {
    void reloadMeta();
  }, [reloadMeta]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalHours = useMemo(() => entries.reduce((sum, e) => sum + (e.hours || 0), 0), [entries]);
  const totalAmount = useMemo(() => entries.reduce((sum, e) => sum + (e.amount || 0), 0), [entries]);

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(entries.map((e) => e.id)));
  }

  async function handleDeleteOne() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await deleteFinanceEntry(props.entryType, confirmDelete.id);
      setConfirmDelete(null);
      setFormEntry(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDelete() {
    setBusy(true);
    try {
      await bulkDeleteFinanceEntries(props.entryType, selectedIds);
      setConfirmBulk(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  const addLabel =
    props.entryType === "overtime"
      ? "Добавить переработку"
      : props.entryType === "bonus"
        ? "Добавить премию"
        : "Добавить перерасчёт";

  const colSpan = showHours ? 5 : showReason ? 5 : 4;

  return (
    <div
      className={`vj-journal vj-journal--finance${showHours ? " vj-journal--finance-overtime" : ""}`}
    >
      <header className="vj-page-header">
        <div className="vj-page-header__row">
          <h1 className="kpd-page__title">{labels.title}</h1>
          <div className="vj-page-header__actions">
            <button
              type="button"
              className="vj-head-btn vj-head-btn--primary"
              onClick={() => setFormEntry("new")}
              disabled={!meta}
            >
              {addLabel}
            </button>
          </div>
        </div>
      </header>

      <div className="vj-month-filter kpd-filters">
        <div className="vj-month-field">
          <label htmlFor={`fj-month-${props.entryType}`}>Месяц</label>
          <ViolationBrandSelect
            id={`fj-month-${props.entryType}`}
            value={month}
            onChange={setMonth}
            options={VIOLATION_MONTH_OPTIONS}
          />
        </div>
        <button type="button" className="kpd-btn kpd-btn--ghost" onClick={() => setMonth("")}>
          За всё время
        </button>
      </div>

      <div className="vj-toolbar">
        <label className="vj-check">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={entries.length === 0} />
          <span className="vj-check__box" aria-hidden />
          Выбрать все
        </label>
        <button
          type="button"
          className="kpd-btn kpd-btn--ghost vj-toolbar__delete"
          disabled={selected.size === 0}
          onClick={() => setConfirmBulk(true)}
        >
          Удалить выбранные{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-300 mb-2" role="alert">
          {error}
        </p>
      ) : null}

      <div className="vj-table-wrap">
        <table className="vj-table">
          <thead>
            <tr>
              <th className="vj-col-check" />
              <SortHeader
                label="Дата"
                title="Дата"
                className="vj-col-date"
                active={sort?.key === "date"}
                dir={sort?.key === "date" ? sort.dir : null}
                onSort={() => toggleSort("date")}
              />
              <SortHeader
                label="Ф.И.О."
                title="Ф.И.О."
                className="vj-col-fio"
                active={sort?.key === "employeeName"}
                dir={sort?.key === "employeeName" ? sort.dir : null}
                onSort={() => toggleSort("employeeName")}
              />
              {showHours ? (
                <SortHeader
                  label="Часы"
                  title="Часы"
                  className="vj-col-pen"
                  active={sort?.key === "hours"}
                  dir={sort?.key === "hours" ? sort.dir : null}
                  onSort={() => toggleSort("hours")}
                />
              ) : null}
              {showReason ? (
                <SortHeader
                  label="Причина"
                  title="Причина"
                  className="vj-col-type"
                  active={sort?.key === "reason"}
                  dir={sort?.key === "reason" ? sort.dir : null}
                  onSort={() => toggleSort("reason")}
                />
              ) : null}
              <SortHeader
                label="Сумма"
                title="Сумма"
                className="vj-col-sum"
                active={sort?.key === "amount"}
                dir={sort?.key === "amount" ? sort.dir : null}
                onSort={() => toggleSort("amount")}
              />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="text-white/50">
                  Загрузка…
                </td>
              </tr>
            ) : sortedEntries.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-white/50">
                  {month ? "Записей за выбранный месяц нет" : "Записей пока нет"}
                </td>
              </tr>
            ) : (
              sortedEntries.map((row) => (
                <tr
                  key={row.id}
                  className={selected.has(row.id) ? "vj-row--selected" : undefined}
                  onClick={() => setFormEntry(row)}
                >
                  <td className="vj-col-check" onClick={(e) => e.stopPropagation()}>
                    <label className="vj-check">
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} />
                      <span className="vj-check__box" aria-hidden />
                    </label>
                  </td>
                  <td className="vj-col-date">{row.date}</td>
                  <td className="vj-col-fio">{row.employeeName}</td>
                  {showHours ? <td className="vj-col-pen">{row.hours}</td> : null}
                  {showReason ? <td className="vj-col-type">{row.reason || "—"}</td> : null}
                  <td className="vj-col-sum">{row.amount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && entries.length > 0 ? (
        <p className="mt-3 text-sm text-white/50">
          {showHours ? `Итого часов: ${totalHours}; ` : ""}
          Итого сумма: {totalAmount} ₽
        </p>
      ) : null}

      {formEntry && meta ? (
        <FinanceEntryFormModal
          entryType={props.entryType}
          meta={meta}
          entry={formEntry === "new" ? null : formEntry}
          onClose={() => setFormEntry(null)}
          onSaved={() => void reload()}
          onDelete={formEntry !== "new" ? () => setConfirmDelete(formEntry) : undefined}
        />
      ) : null}

      {confirmDelete ? (
        <ViolationConfirmModal
          title="Удалить запись?"
          message={`Удалить запись от ${confirmDelete.date} (${confirmDelete.employeeName})? Это действие нельзя отменить.`}
          confirmLabel="Удалить"
          danger
          busy={busy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleDeleteOne()}
        />
      ) : null}

      {confirmBulk ? (
        <ViolationConfirmModal
          title="Удалить выбранные?"
          message={`Удалить ${selected.size} записей? Это действие нельзя отменить.`}
          confirmLabel="Удалить"
          danger
          busy={busy}
          onCancel={() => setConfirmBulk(false)}
          onConfirm={() => void handleBulkDelete()}
        />
      ) : null}
    </div>
  );
}
