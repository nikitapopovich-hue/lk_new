import "./KcViewModeToggle.css";

export type KcViewMode = "cards" | "table" | "map";

type Props = {
  value: KcViewMode;
  onChange: (mode: KcViewMode) => void;
};

export function KcViewModeToggle(props: Props) {
  return (
    <div className="kc-view-toggle" role="group" aria-label="Режим отображения">
      <button
        type="button"
        className={`kc-view-toggle__btn ${props.value === "cards" ? "kc-view-toggle__btn--active" : ""}`}
        aria-pressed={props.value === "cards"}
        onClick={() => props.onChange("cards")}
      >
        Карточки
      </button>
      <button
        type="button"
        className={`kc-view-toggle__btn ${props.value === "table" ? "kc-view-toggle__btn--active" : ""}`}
        aria-pressed={props.value === "table"}
        onClick={() => props.onChange("table")}
      >
        Таблица
      </button>
      <button
        type="button"
        className={`kc-view-toggle__btn ${props.value === "map" ? "kc-view-toggle__btn--active" : ""}`}
        aria-pressed={props.value === "map"}
        onClick={() => props.onChange("map")}
      >
        Карта
      </button>
    </div>
  );
}
