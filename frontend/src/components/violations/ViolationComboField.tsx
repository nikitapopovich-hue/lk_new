import { useEffect, useMemo, useRef, useState } from "react";

const ADD_NEW = "__add_new__";

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
  if (!q) return items.slice(0, 16);
  return items
    .map((item) => ({ item, score: suggestionScore(q, item) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.localeCompare(b.item, "ru"))
    .map((row) => row.item)
    .slice(0, 16);
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  allowAddNew?: boolean;
  onAddNew?: (name: string) => void | Promise<void>;
};

export function ViolationComboField(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");

  const filtered = useMemo(() => matchSuggestions(query, props.suggestions), [query, props.suggestions]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setAddingNew(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function openList() {
    setOpen(true);
    setQuery(props.value);
    setActiveIndex(-1);
  }

  function pick(item: string) {
    if (item === ADD_NEW) {
      setAddingNew(true);
      setOpen(false);
      return;
    }
    props.onChange(item);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  async function submitNewType() {
    const name = newName.trim();
    if (!name) return;
    await props.onAddNew?.(name);
    props.onChange(name);
    setAddingNew(false);
    setNewName("");
  }

  if (addingNew && props.allowAddNew) {
    return (
      <div className="flex gap-2">
        <input
          className="vj-input"
          value={newName}
          placeholder="Название типа"
          autoFocus
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitNewType();
            if (e.key === "Escape") setAddingNew(false);
          }}
        />
        <button type="button" className="kpd-btn kpd-btn--primary" onClick={() => void submitNewType()}>
          OK
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        className="vj-input"
        value={open ? query : props.value}
        placeholder={props.placeholder}
        autoComplete="off"
        onFocus={openList}
        onClick={openList}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          props.onChange(v);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          const items = props.allowAddNew ? [...filtered, ADD_NEW] : filtered;
          if (!open || items.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            pick(items[activeIndex]!);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {open && (filtered.length > 0 || props.allowAddNew) ? (
        <ul className="vj-dropdown vj-scroll" role="listbox">
          {filtered.map((item, index) => (
            <li key={item}>
              <button
                type="button"
                role="option"
                className={`vj-dropdown__item ${index === activeIndex ? "vj-dropdown__item--active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
              >
                {item}
              </button>
            </li>
          ))}
          {props.allowAddNew ? (
            <li>
              <button
                type="button"
                className="vj-dropdown__item vj-dropdown__item--add"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(ADD_NEW);
                }}
              >
                + Добавить новый тип
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
