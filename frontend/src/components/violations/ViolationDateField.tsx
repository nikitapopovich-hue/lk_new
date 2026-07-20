import { useEffect, useMemo, useRef, useState } from "react";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function parseRuDate(value: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const y = Number(m[3]);
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function formatRu(y: number, m: number, d: number): string {
  return `${String(d).padStart(2, "0")}.${String(m + 1).padStart(2, "0")}.${y}`;
}

function startWeekday(y: number, m: number): number {
  const day = new Date(y, m, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

export function ViolationDateField(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const parsed = parseRuDate(props.value);
  const today = new Date();
  const initial = parsed ?? { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() };

  const [viewYear, setViewYear] = useState(initial.y);
  const [viewMonth, setViewMonth] = useState(initial.m);

  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.y);
      setViewMonth(parsed.m);
    }
  }, [props.value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const grid = useMemo(() => {
    const first = startWeekday(viewYear, viewMonth);
    const total = daysInMonth(viewYear, viewMonth);
    const cells: (number | null)[] = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  function pickDay(day: number) {
    props.onChange(formatRu(viewYear, viewMonth, day));
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  const selected = parsed;

  return (
    <div ref={wrapRef} className="vj-date-field">
      <input
        id={props.id}
        className="vj-input vj-input--with-icon"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="09.05.2026"
        required={props.required}
        autoComplete="off"
      />
      <button
        type="button"
        className="vj-date-field__icon"
        aria-label="Открыть календарь"
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      </button>
      {open ? (
        <div className="vj-datepicker" role="dialog" aria-label="Выбор даты">
          <div className="vj-datepicker__head">
            <button type="button" className="vj-datepicker__nav" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
              ‹
            </button>
            <span className="vj-datepicker__title">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" className="vj-datepicker__nav" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
              ›
            </button>
          </div>
          <div className="vj-datepicker__weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w} className="vj-datepicker__weekday">
                {w}
              </span>
            ))}
          </div>
          <div className="vj-datepicker__grid">
            {grid.map((day, i) =>
              day === null ? (
                <span key={`e-${i}`} className="vj-datepicker__empty" />
              ) : (
                <button
                  key={`d-${i}-${day}`}
                  type="button"
                  className={`vj-datepicker__day${
                    selected &&
                    selected.y === viewYear &&
                    selected.m === viewMonth &&
                    selected.d === day
                      ? " vj-datepicker__day--selected"
                      : ""
                  }`}
                  onClick={() => pickDay(day)}
                >
                  {day}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            className="vj-datepicker__today"
            onClick={() => {
              const n = new Date();
              props.onChange(formatRu(n.getFullYear(), n.getMonth(), n.getDate()));
              setViewYear(n.getFullYear());
              setViewMonth(n.getMonth());
              setOpen(false);
            }}
          >
            Сегодня
          </button>
        </div>
      ) : null}
    </div>
  );
}
