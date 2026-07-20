import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViolationCommentText } from "../../components/violations/ViolationCommentText";
import { ViolationConfirmModal } from "../../components/violations/ViolationConfirmModal";
import { ViolationFineInfoModal } from "../../components/violations/ViolationFineInfoModal";
import { ViolationBrandSelect } from "../../components/violations/ViolationBrandSelect";
import { ViolationFormModal } from "../../components/violations/ViolationFormModal";
import "../../components/violations/ViolationsJournal.css";
import {
  bulkDeleteViolationEntries,
  currentMonthKey,
  deleteViolationEntry,
  exportViolationJournalXlsx,
  fetchViolationEntries,
  fetchViolationMeta,
  importViolationJournalXlsx,
  type ViolationEntry,
  type ViolationMeta,
} from "../../lib/violationJournal";
import { VIOLATION_MONTH_OPTIONS } from "../../lib/violationMonthOptions";

type SortKey =
  | "date"
  | "employeeName"
  | "recordedBy"
  | "groupName"
  | "violationType"
  | "penaltyKind"
  | "hasExplanation"
  | "fineAmount";

type SortDir = "asc" | "desc";

type SortState = { key: SortKey; dir: SortDir };

const SORT_COLUMNS: { key: SortKey; label: string; title: string; className: string }[] = [
  { key: "date", label: "Дата", title: "Дата", className: "vj-col-date" },
  { key: "employeeName", label: "Ф.И.О.", title: "Ф.И.О.", className: "vj-col-fio" },
  { key: "recordedBy", label: "Зафикс.", title: "Зафиксировано", className: "vj-col-rec" },
  { key: "groupName", label: "Группа", title: "Группа", className: "vj-col-grp" },
  { key: "violationType", label: "Тип", title: "Тип нарушения", className: "vj-col-type" },
  { key: "penaltyKind", label: "П/Ш", title: "Предупреждение / Штраф", className: "vj-col-pen" },
  { key: "hasExplanation", label: "Объясн.", title: "Объяснительная", className: "vj-col-expl" },
  { key: "fineAmount", label: "Сумма", title: "Сумма", className: "vj-col-sum" },
];

function parseRuDateMs(value: string): number {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!m) return 0;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

function compareEntries(a: ViolationEntry, b: ViolationEntry, key: SortKey): number {
  switch (key) {
    case "date":
      return parseRuDateMs(a.date) - parseRuDateMs(b.date);
    case "employeeName":
      return a.employeeName.localeCompare(b.employeeName, "ru");
    case "recordedBy":
      return a.recordedBy.localeCompare(b.recordedBy, "ru");
    case "groupName":
      return a.groupName.localeCompare(b.groupName, "ru");
    case "violationType":
      return a.violationType.localeCompare(b.violationType, "ru");
    case "penaltyKind":
      return a.penaltyKind.localeCompare(b.penaltyKind, "ru");
    case "hasExplanation":
      return Number(a.hasExplanation) - Number(b.hasExplanation);
    case "fineAmount":
      return (a.penaltyKind === "fine" ? a.fineAmount : 0) - (b.penaltyKind === "fine" ? b.fineAmount : 0);
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

export function ViolationsJournalPage() {
  const importRef = useRef<HTMLInputElement>(null);
  const [fineInfoOpen, setFineInfoOpen] = useState(false);
  const [month, setMonth] = useState(currentMonthKey);
  const [entries, setEntries] = useState<ViolationEntry[]>([]);
  const [meta, setMeta] = useState<ViolationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [formEntry, setFormEntry] = useState<ViolationEntry | null | "new">(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ViolationEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);

  const allSelected = entries.length > 0 && selected.size === entries.length;

  const sortedEntries = useMemo(() => {
    if (!sort) return entries;
    const copy = [...entries];
    copy.sort((a, b) => {
      const cmp = compareEntries(a, b, sort.key);
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [entries, sort]);

  const reloadMeta = useCallback(async () => {
    try {
      setMeta(await fetchViolationMeta());
    } catch {
      setMeta(null);
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchViolationEntries(month ? { month } : {});
      setEntries(rows);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void reloadMeta();
  }, [reloadMeta]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectedIds = useMemo(() => [...selected], [selected]);

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

  async function handleExport() {
    setExporting(true);
    setError("");
    try {
      const blob = await exportViolationJournalXlsx(month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = month ? month.replace("-", "") : "all";
      a.download = `zhurnal-narushenij-${suffix}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось скачать файл");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setError("");
    setImportMsg("");
    try {
      const result = await importViolationJournalXlsx(file);
      setImportMsg(result.message);
      await reload();
      await reloadMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function handleBulkDelete() {
    setBusy(true);
    try {
      await bulkDeleteViolationEntries(selectedIds);
      setConfirmBulk(false);
      await reload();
      await reloadMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteOne() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await deleteViolationEntry(confirmDelete.id);
      setConfirmDelete(null);
      setFormEntry(null);
      await reload();
      await reloadMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vj-journal">
      <header className="vj-page-header">
        <div className="vj-page-header__row">
          <h1 className="kpd-page__title">Журнал нарушений</h1>
          <div className="vj-page-header__actions">
            <button
              type="button"
              className="vj-info-btn"
              aria-label="Информация о суммах штрафов"
              title="Суммы штрафов"
              onClick={() => setFineInfoOpen(true)}
            >
              <img src="/info-circle.svg" alt="" aria-hidden />
            </button>
            <button
              type="button"
              className="vj-head-btn vj-head-btn--ghost"
              onClick={() => void handleExport()}
              disabled={exporting || loading}
            >
              {exporting ? "Скачивание…" : "Скачать Excel"}
            </button>
            <button
              type="button"
              className="vj-head-btn vj-head-btn--ghost"
              onClick={() => importRef.current?.click()}
              disabled={importing}
            >
              {importing ? "Загрузка…" : "Загрузить Excel"}
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
              }}
            />
            <button
              type="button"
              className="vj-head-btn vj-head-btn--primary"
              onClick={() => setFormEntry("new")}
              disabled={!meta}
            >
              Добавить нарушение
            </button>
          </div>
        </div>
      </header>

      <div className="vj-month-filter kpd-filters">
        <div className="vj-month-field">
          <label htmlFor="vj-month">Месяц</label>
          <ViolationBrandSelect
            id="vj-month"
            value={month}
            onChange={setMonth}
            options={VIOLATION_MONTH_OPTIONS}
          />
        </div>
        <button type="button" className="kpd-btn kpd-btn--ghost" onClick={() => setMonth("")}>
          За всё время
        </button>
      </div>

      {importMsg ? (
        <p className="text-sm text-pari-200 mb-2" role="status">
          {importMsg}
        </p>
      ) : null}

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
              {SORT_COLUMNS.map((col) => (
                <SortHeader
                  key={col.key}
                  label={col.label}
                  title={col.title}
                  className={col.className}
                  active={sort?.key === col.key}
                  dir={sort?.key === col.key ? sort.dir : null}
                  onSort={() => toggleSort(col.key)}
                />
              ))}
              <th className="vj-col-comm" title="Комментарий">
                Коммент.
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="text-white/50">
                  Загрузка…
                </td>
              </tr>
            ) : sortedEntries.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-white/50">
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
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                      />
                      <span className="vj-check__box" aria-hidden />
                    </label>
                  </td>
                  <td className="vj-col-date">{row.date}</td>
                  <td className="vj-col-fio">{row.employeeName}</td>
                  <td className="vj-col-rec">{row.recordedBy}</td>
                  <td className="vj-col-grp">{row.groupName}</td>
                  <td className="vj-col-type">{row.violationType}</td>
                  <td className="vj-col-pen">
                    <span
                      className={row.penaltyKind === "fine" ? "vj-pill-fine" : "vj-pill-warn"}
                      title={row.penaltyKind === "fine" ? "Штраф" : "Предупреждение"}
                    >
                      {row.penaltyKind === "fine" ? "Ш" : "П"}
                    </span>
                  </td>
                  <td className="vj-col-expl">{row.hasExplanation ? "Да" : "—"}</td>
                  <td className="vj-col-sum">{row.penaltyKind === "fine" ? row.fineAmount : "—"}</td>
                  <td className="vj-col-comm vj-cell-comm">
                    <ViolationCommentText text={row.comment} stopRowClick />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formEntry && meta ? (
        <ViolationFormModal
          meta={meta}
          entry={formEntry === "new" ? null : formEntry}
          onClose={() => setFormEntry(null)}
          onSaved={() => {
            void reload();
            void reloadMeta();
          }}
          onDelete={formEntry !== "new" ? () => setConfirmDelete(formEntry) : undefined}
        />
      ) : null}

      <ViolationFineInfoModal open={fineInfoOpen} onClose={() => setFineInfoOpen(false)} />

      {confirmDelete ? (
        <ViolationConfirmModal
          title="Удалить запись?"
          message={`Удалить нарушение от ${confirmDelete.date} (${confirmDelete.employeeName})? Это действие нельзя отменить.`}
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
