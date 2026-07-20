import { useEffect, useRef, useState } from "react";

export type ViolationSelectOption = { value: string; label: string };

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ViolationSelectOption[];
  className?: string;
  disabled?: boolean;
  placeholder?: string;
};

export function ViolationBrandSelect(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selected = props.options.find((o) => o.value === props.value) ?? null;
  const displayLabel = selected?.label ?? props.placeholder ?? "—";

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(option: ViolationSelectOption) {
    props.onChange(option.value);
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <div ref={wrapRef} className={`vj-brand-select ${props.className ?? ""}`}>
      <button
        type="button"
        id={props.id}
        className="vj-brand-select__trigger"
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setActiveIndex(-1);
        }}
        onKeyDown={(e) => {
          if (!open) {
            if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % props.options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i <= 0 ? props.options.length - 1 : i - 1));
          } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            pick(props.options[activeIndex]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <span className={selected ? undefined : "vj-brand-select__placeholder"}>{displayLabel}</span>
        <span className="vj-brand-select__chevron" aria-hidden />
      </button>
      {open ? (
        <ul className="vj-brand-select__menu vj-scroll" role="listbox">
          {props.options.map((option, index) => (
            <li key={`${option.value}-${option.label}`}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === props.value}
                className={[
                  "vj-brand-select__option",
                  index === activeIndex || option.value === props.value ? "vj-brand-select__option--active" : "",
                ].join(" ")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
