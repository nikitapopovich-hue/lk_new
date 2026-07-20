import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getEmail } from "../../lib/identity";
import { kcBackofficeClientUrl } from "../../lib/kcBackoffice";
import {
  clampWidth,
  KC_TABLE_DEFAULT_COL_WIDTH,
  loadKcTableLayout,
  measureAutoFitWidths,
  mergeColumnLayout,
  saveKcTableLayout,
  type KcTableLayoutPrefs,
} from "../../lib/kcTableLayout";
import { formatKcFieldDisplay, type KcEmployeeRecord, type KcFieldLabel } from "../../lib/kcData";
import { buildResidenceMapQuery, formatDistanceKm, yandexMapsSearchUrl } from "../../lib/kcMaps";
import { getCellSortValue } from "../../lib/kcSmartSearch";
import { KcTableColumnSettings } from "./KcTableColumnSettings";
import "./KcEmployeesTable.css";

type SortDir = "asc" | "desc";

type TableColumn = KcFieldLabel | { key: "officeDistance"; label: string; virtual: true };

type Props = {
  employees: KcEmployeeRecord[];
  fieldLabels: KcFieldLabel[];
  selectedIds: Set<number>;
  selectionMode: boolean;
  showOfficeDistance?: boolean;
  distanceByEmployeeId?: Record<number, number | null>;
  distancesLoading?: boolean;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onRowClick: (id: number) => void;
};

function isVirtualColumn(col: TableColumn): col is { key: "officeDistance"; label: string; virtual: true } {
  return "virtual" in col && col.virtual;
}

function columnLabel(col: TableColumn): string {
  return col.label;
}

function buildAllColumns(fieldLabels: KcFieldLabel[], showOfficeDistance?: boolean): TableColumn[] {
  const base = fieldLabels.filter((f) => f.key !== "careerPath");
  if (!showOfficeDistance) return base;
  const hasResidence = base.some((f) => f.key === "residenceAddress");
  if (!hasResidence) return base;
  const result: TableColumn[] = [];
  for (const col of base) {
    result.push(col);
    if (col.key === "residenceAddress") {
      result.push({ key: "officeDistance", label: "Расстояние до офиса", virtual: true });
    }
  }
  return result;
}

export function KcEmployeesTable(props: Props) {
  const allColumns = useMemo(
    () => buildAllColumns(props.fieldLabels, props.showOfficeDistance),
    [props.fieldLabels, props.showOfficeDistance],
  );

  const columnByKey = useMemo(() => {
    const map = new Map<string, TableColumn>();
    for (const col of allColumns) map.set(col.key, col);
    return map;
  }, [allColumns]);

  const allKeys = useMemo(() => allColumns.map((c) => c.key), [allColumns]);

  const [layout, setLayout] = useState<KcTableLayoutPrefs>(() => {
    const merged = mergeColumnLayout(allKeys, loadKcTableLayout());
    return {
      order: merged.order,
      widths: merged.widths,
      hidden: Array.from(merged.hidden),
    };
  });

  const userEmail = getEmail();

  useEffect(() => {
    const merged = mergeColumnLayout(allKeys, loadKcTableLayout(userEmail));
    setLayout({
      order: merged.order,
      widths: merged.widths,
      hidden: Array.from(merged.hidden),
    });
  }, [allKeys, userEmail]);

  const persistLayout = useCallback(
    (next: KcTableLayoutPrefs) => {
      setLayout(next);
      saveKcTableLayout(next, userEmail);
    },
    [userEmail],
  );

  const hiddenSet = useMemo(() => new Set(layout.hidden), [layout.hidden]);

  const visibleColumns = useMemo(() => {
    return layout.order
      .filter((key) => !hiddenSet.has(key))
      .map((key) => columnByKey.get(key))
      .filter((c): c is TableColumn => Boolean(c));
  }, [layout.order, hiddenSet, columnByKey]);

  const [sortKey, setSortKey] = useState<string>("fullName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [resizeKey, setResizeKey] = useState<string | null>(null);
  const [contentFit, setContentFit] = useState(false);

  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const sorted = useMemo(() => {
    const list = [...props.employees];
    list.sort((a, b) => {
      let av: string;
      let bv: string;
      if (sortKey === "officeDistance") {
        const aKm = props.distanceByEmployeeId?.[a.id];
        const bKm = props.distanceByEmployeeId?.[b.id];
        av = aKm == null ? "999999" : String(aKm).padStart(8, "0");
        bv = bKm == null ? "999999" : String(bKm).padStart(8, "0");
      } else {
        av = getCellSortValue(a, sortKey).toLocaleLowerCase("ru");
        bv = getCellSortValue(b, sortKey).toLocaleLowerCase("ru");
      }
      const cmp = av.localeCompare(bv, "ru", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [props.employees, props.distanceByEmployeeId, sortKey, sortDir]);

  const allSelected =
    sorted.length > 0 && sorted.every((e) => props.selectedIds.has(e.id));

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortIndicator(key: string): string {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  function moveColumn(dragged: string, target: string) {
    if (dragged === target) return;
    const order = [...layout.order];
    const from = order.indexOf(dragged);
    const to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, dragged);
    persistLayout({ ...layout, order });
  }

  function toggleColumnVisibility(key: string, visible: boolean) {
    const hidden = new Set(layout.hidden);
    if (visible) hidden.delete(key);
    else hidden.add(key);
    const visibleCount = layout.order.filter((k) => !hidden.has(k)).length;
    if (visibleCount === 0) return;
    persistLayout({ ...layout, hidden: Array.from(hidden) });
  }

  function resetLayout() {
    const merged = mergeColumnLayout(allKeys, null);
    persistLayout({
      order: merged.order,
      widths: Object.fromEntries(allKeys.map((k) => [k, KC_TABLE_DEFAULT_COL_WIDTH])),
      hidden: [],
    });
    setContentFit(false);
  }

  function autoFitLayout() {
    const keys = visibleColumns.map((c) => c.key);
    const labels = Object.fromEntries(visibleColumns.map((c) => [c.key, columnLabel(c)]));
    const cellTexts: Record<string, string[]> = {};
    for (const key of keys) {
      cellTexts[key] = [];
    }
    for (const emp of sorted) {
      for (const col of visibleColumns) {
        if (isVirtualColumn(col)) {
          const km = props.distanceByEmployeeId?.[emp.id];
          cellTexts[col.key].push(
            props.distancesLoading ? "…" : formatDistanceKm(km),
          );
          continue;
        }
        const raw = col.key === "department" ? emp.department : (emp.data[col.key] ?? "");
        cellTexts[col.key].push(formatKcFieldDisplay(col.key, raw));
      }
    }
    const fitted = measureAutoFitWidths(keys, labels, cellTexts);
    persistLayout({
      ...layout,
      widths: { ...layout.widths, ...fitted },
    });
    setContentFit(true);
  }

  function startResize(key: string, clientX: number) {
    const width = layout.widths[key] ?? KC_TABLE_DEFAULT_COL_WIDTH;
    resizeRef.current = { key, startX: clientX, startWidth: width };
    setResizeKey(key);
    setContentFit(false);
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const state = resizeRef.current;
      if (!state) return;
      const delta = e.clientX - state.startX;
      const width = clampWidth(state.startWidth + delta);
      setLayout((prev) => ({
        ...prev,
        widths: { ...prev.widths, [state.key]: width },
      }));
    }
    function onUp() {
      const state = resizeRef.current;
      if (state) {
        setLayout((prev) => {
          const next = {
            ...prev,
            widths: { ...prev.widths, [state.key]: prev.widths[state.key] ?? KC_TABLE_DEFAULT_COL_WIDTH },
          };
          saveKcTableLayout(next, userEmail);
          return next;
        });
      }
      resizeRef.current = null;
      setResizeKey(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [userEmail]);

  function renderCell(emp: KcEmployeeRecord, col: TableColumn) {
    if (isVirtualColumn(col)) {
      if (props.distancesLoading) {
        return <span className="kc-table__muted">…</span>;
      }
      const km = props.distanceByEmployeeId?.[emp.id];
      return formatDistanceKm(km);
    }

    const raw =
      col.key === "department" ? emp.department : (emp.data[col.key] ?? "");
    const display = formatKcFieldDisplay(col.key, raw);

    if ((col.key === "accountNumber" || col.key === "accountNumberExtra") && display !== "—") {
      const href = kcBackofficeClientUrl(raw);
      if (href) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="kc-table__address-link"
            title="Открыть в backoffice"
            onClick={(e) => e.stopPropagation()}
          >
            {display}
          </a>
        );
      }
    }

    if (col.key === "residenceAddress" && props.showOfficeDistance && display !== "—") {
      const mapQuery = buildResidenceMapQuery(emp.data.city ?? "", raw);
      const href = yandexMapsSearchUrl(mapQuery || display);
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="kc-table__address-link"
          title="Открыть в Яндекс.Картах"
          onClick={(e) => e.stopPropagation()}
        >
          {display}
        </a>
      );
    }

    return display;
  }

  const settingsColumns = useMemo(
    () => allColumns.map((c) => ({ key: c.key, label: columnLabel(c) })),
    [allColumns],
  );

  const tableWidthPx = useMemo(() => {
    const cols = visibleColumns.reduce(
      (sum, col) => sum + (layout.widths[col.key] ?? KC_TABLE_DEFAULT_COL_WIDTH),
      0,
    );
    return cols + (props.selectionMode ? 40 : 0);
  }, [visibleColumns, layout.widths, props.selectionMode]);

  return (
    <div className="kc-table-layout">
      <div className="kc-table-layout__toolbar">
        <button type="button" className="kc-table-layout__autofit-btn" onClick={autoFitLayout}>
          Автоподбор ширины
        </button>
        <KcTableColumnSettings
          columns={settingsColumns}
          hidden={hiddenSet}
          onToggle={toggleColumnVisibility}
          onReset={resetLayout}
        />
      </div>
      <div
        className={`kc-table-wrap scrollbar-pari${resizeKey ? " kc-table-wrap--resizing" : ""}${contentFit ? " kc-table-wrap--content-fit" : ""}`}
      >
        <table className="kc-table" style={{ width: Math.max(tableWidthPx, 1) }}>
          <colgroup>
            {props.selectionMode ? <col className="kc-table__col-check" /> : null}
            {visibleColumns.map((col) => (
              <col
                key={col.key}
                style={{ width: layout.widths[col.key] ?? KC_TABLE_DEFAULT_COL_WIDTH }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {props.selectionMode ? (
                <th className="kc-table__check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    aria-label="Выбрать всех"
                    onChange={props.onToggleSelectAll}
                  />
                </th>
              ) : null}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={`kc-table__th${dragKey === col.key ? " kc-table__th--drag" : ""}`}
                  style={{ width: layout.widths[col.key] ?? KC_TABLE_DEFAULT_COL_WIDTH }}
                  draggable
                  onDragStart={(e) => {
                    setDragKey(col.key);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", col.key);
                  }}
                  onDragEnd={() => setDragKey(null)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragged = e.dataTransfer.getData("text/plain") || dragKey;
                    if (dragged) moveColumn(dragged, col.key);
                    setDragKey(null);
                  }}
                >
                  <div className="kc-table__th-inner">
                    <span className="kc-table__drag-handle" title="Перетащите столбец" aria-hidden>
                      ⋮⋮
                    </span>
                    <button type="button" className="kc-table__sort" onClick={() => toggleSort(col.key)}>
                      <span>{col.label}</span>
                      <span className="kc-table__sort-icon" aria-hidden>
                        {sortIndicator(col.key)}
                      </span>
                    </button>
                    <span
                      className="kc-table__resize-handle"
                      title="Изменить ширину"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startResize(col.key, e.clientX);
                      }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (props.selectionMode ? 1 : 0)} className="kc-table__empty">
                  Сотрудники не найдены
                </td>
              </tr>
            ) : (
              sorted.map((emp) => (
                <tr
                  key={emp.id}
                  className={[
                    props.selectedIds.has(emp.id) ? "kc-table__row--selected" : "",
                    emp.isDismissed ? "kc-table__row--inactive" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => props.onRowClick(emp.id)}
                >
                  {props.selectionMode ? (
                    <td className="kc-table__check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={props.selectedIds.has(emp.id)}
                        aria-label={`Выбрать ${emp.data.fullName}`}
                        onChange={() => props.onToggleSelect(emp.id)}
                      />
                    </td>
                  ) : null}
                  {visibleColumns.map((col) => {
                    const content = renderCell(emp, col);
                    const title =
                      isVirtualColumn(col) || col.key === "residenceAddress"
                        ? typeof content === "string"
                          ? content
                          : undefined
                        : typeof content === "string"
                          ? content
                          : undefined;
                    return (
                      <td
                        key={col.key}
                        title={title}
                        style={{ width: layout.widths[col.key] ?? KC_TABLE_DEFAULT_COL_WIDTH }}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
