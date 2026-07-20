import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  label: string;
  allLabel: string;
  items: { key: string; label: string }[];
  /** null — выбраны все */
  selectedKeys: string[] | null;
  onChange: (keys: string[] | null) => void;
};

export function ViolationSeriesFilter(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const allSelected = props.selectedKeys === null;
  const selectedCount = allSelected ? props.items.length : (props.selectedKeys?.length ?? 0);

  const summary = useMemo(() => {
    if (props.items.length === 0) return "Нет данных";
    if (allSelected) return props.allLabel;
    if (selectedCount === 0) return "Ничего не выбрано";
    if (selectedCount === 1) {
      const key = props.selectedKeys![0];
      return props.items.find((i) => i.key === key)?.label ?? "1 выбран";
    }
    return `Выбрано: ${selectedCount}`;
  }, [allSelected, props.allLabel, props.items, props.selectedKeys, selectedCount]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function isChecked(key: string) {
    if (allSelected) return true;
    return props.selectedKeys!.includes(key);
  }

  function toggleAll() {
    if (allSelected) {
      props.onChange([]);
      return;
    }
    props.onChange(null);
  }

  function toggleKey(key: string) {
    const allKeys = props.items.map((i) => i.key);
    const current = allSelected ? [...allKeys] : [...props.selectedKeys!];
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    if (next.length === 0) {
      props.onChange([]);
      return;
    }
    if (next.length === allKeys.length) {
      props.onChange(null);
      return;
    }
    props.onChange(next);
  }

  return (
    <div ref={wrapRef} className="vj-series-filter">
      <span className="vj-series-filter__label">{props.label}</span>
      <div className="vj-series-filter__control">
        <button
          type="button"
          className="vj-brand-select__trigger vj-series-filter__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={props.items.length === 0}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{summary}</span>
          <span className="vj-brand-select__chevron" aria-hidden />
        </button>
        {open && props.items.length > 0 ? (
          <div
            className="vj-series-filter__menu vj-scroll"
            role="listbox"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <label className="vj-check vj-series-filter__row">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span className="vj-check__box" aria-hidden />
              <span>{props.allLabel}</span>
            </label>
            {props.items.map((item) => (
              <label key={item.key} className="vj-check vj-series-filter__row">
                <input
                  type="checkbox"
                  checked={isChecked(item.key)}
                  onChange={() => toggleKey(item.key)}
                />
                <span className="vj-check__box" aria-hidden />
                <span className="vj-series-filter__row-label">{item.label}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
