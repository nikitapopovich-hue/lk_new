import { useEffect, useRef, useState } from "react";
import { kcFieldDropdownClass, kcFieldDropdownItemClass, kcFieldInputClass } from "./kcFieldStyles";

type Option = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  disabled?: boolean;
};

export function KcSelectInput(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selected = props.options.find((o) => o.value === props.value) ?? props.options[0];

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(option: Option) {
    props.onChange(option.value);
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className={`${kcFieldInputClass} flex cursor-pointer items-center justify-between gap-2 text-left`}
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
        <span className={props.value ? "text-white" : "text-white/45"}>{selected?.label ?? "—"}</span>
        <span className="shrink-0 text-[10px] text-white/40" aria-hidden>
          ▼
        </span>
      </button>
      {open ? (
        <ul className={kcFieldDropdownClass} role="listbox">
          {props.options.map((option, index) => (
            <li key={`${option.value}-${option.label}`}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === props.value}
                className={kcFieldDropdownItemClass(index === activeIndex || option.value === props.value)}
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
