import { useEffect, useRef, useState } from "react";

type ColumnOption = { key: string; label: string };

type Props = {
  columns: ColumnOption[];
  hidden: Set<string>;
  onToggle: (key: string, visible: boolean) => void;
  onReset: () => void;
};

export function KcTableColumnSettings(props: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const visibleCount = props.columns.filter((c) => !props.hidden.has(c.key)).length;

  return (
    <div className="kc-table-layout__settings" ref={rootRef}>
      <button
        type="button"
        className="kc-table-layout__settings-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        Столбцы
      </button>
      {open ? (
        <div className="kc-table-layout__menu" role="menu">
          <p className="kc-table-layout__menu-hint">Перетащите заголовок для порядка. Тяните край — ширина.</p>
          <ul className="kc-table-layout__menu-list">
            {props.columns.map((col) => {
              const checked = !props.hidden.has(col.key);
              const onlyOne = visibleCount <= 1 && checked;
              return (
                <li key={col.key}>
                  <label className="kc-table-layout__menu-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={onlyOne}
                      onChange={(e) => props.onToggle(col.key, e.target.checked)}
                    />
                    <span>{col.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button type="button" className="kc-table-layout__reset" onClick={props.onReset}>
            Сбросить настройки таблицы
          </button>
        </div>
      ) : null}
    </div>
  );
}
