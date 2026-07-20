import { useEffect, useMemo, useRef, useState } from "react";
import { kcFieldDropdownClass, kcFieldDropdownItemClass, kcFieldInputClass } from "./kcFieldStyles";

type Props = {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
};

function suggestionScore(query: string, item: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const lower = item.toLowerCase();
  if (lower.startsWith(q)) return 3;
  const surname = lower.split(/\s+/)[0] ?? "";
  if (surname.startsWith(q)) return 2;
  if (lower.includes(q)) return 1;
  return 0;
}

function matchSuggestions(query: string, items: string[]): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, 12);
  return items
    .map((item) => ({ item, score: suggestionScore(q, item) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.localeCompare(b.item, "ru"))
    .map((row) => row.item)
    .slice(0, 12);
}

export function KcSuggestInput(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filtered = useMemo(
    () => matchSuggestions(props.value, props.suggestions),
    [props.value, props.suggestions],
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(item: string) {
    props.onChange(item);
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={kcFieldInputClass}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          props.onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % filtered.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
          } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            pick(filtered[activeIndex]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 ? (
        <ul className={kcFieldDropdownClass} role="listbox">
          {filtered.map((item, index) => (
            <li key={item}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={kcFieldDropdownItemClass(index === activeIndex)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
