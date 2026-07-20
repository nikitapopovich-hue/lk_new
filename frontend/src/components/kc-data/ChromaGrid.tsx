import type { CSSProperties } from "react";
import { MagicSurface } from "../MagicBento";
import { operatorSurface } from "../operator/operatorTile";
import { buildKcCardCaption } from "../../lib/kcDisplayFormat";
import { kcChromaStyle } from "./kcChromaPalette";
import { KcMessengerLinks } from "./KcMessengerLinks";
import "./ChromaGrid.css";

export type ChromaGridItem = {
  id: number;
  image?: string;
  fullName: string;
  city?: string;
  position?: string;
  line?: string;
  subdivision?: string;
  telegramUsername?: string;
  expressId?: string;
  emailNew?: string;
  onMaternityLeave?: boolean;
  isDismissed?: boolean;
};

type Props = {
  items: ChromaGridItem[];
  onCardClick: (id: number) => void;
  className?: string;
  selectionMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
};

export function ChromaGrid(props: Props) {
  return (
    <div className={`kc-chroma-grid ${props.className ?? ""}`}>
      {props.items.map((c, index) => {
        const palette = kcChromaStyle(index);
        const caption = buildKcCardCaption({
          fullName: c.fullName,
          city: c.city,
          position: c.position,
          line: c.line,
        });

        const selected = props.selectedIds?.has(c.id) ?? false;

        return (
          <div
            key={c.id}
            className={[
              "kc-chroma-card-wrap",
              selected ? "kc-chroma-card-wrap--selected" : "",
              c.isDismissed ? "kc-chroma-card-wrap--inactive" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="button"
            tabIndex={0}
            onClick={() => props.onCardClick(c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.onCardClick(c.id);
              }
            }}
          >
            <MagicSurface
              className={`magic-bento-card--fluid h-full w-full ${operatorSurface}`}
              enableBorderGlow
              style={
                {
                  background: palette.gradient,
                  borderColor: `${palette.borderColor}55`,
                  ["--glow-x" as string]: "50%",
                  ["--glow-y" as string]: "50%",
                } as CSSProperties
              }
            >
              <div
                className="kc-chroma-card-inner"
                onMouseMove={(e) => {
                  const card = e.currentTarget.closest(".magic-bento-card") as HTMLElement | null;
                  if (!card) return;
                  const rect = card.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  const y = ((e.clientY - rect.top) / rect.height) * 100;
                  card.style.setProperty("--glow-x", `${x}%`);
                  card.style.setProperty("--glow-y", `${y}%`);
                }}
              >
                {props.selectionMode && props.onToggleSelect ? (
                  <label
                    className="kc-chroma-select"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => props.onToggleSelect!(c.id)}
                      aria-label={`Выбрать ${caption.fullName}`}
                    />
                  </label>
                ) : null}
                <div className="kc-chroma-img-wrapper">
                  {c.image ? (
                    <img src={c.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="kc-chroma-no-photo" aria-hidden>
                      Нет фото
                    </div>
                  )}
                </div>
                <div className="kc-chroma-info">
                  <div className="kc-chroma-title">
                    {caption.fullName}
                    {c.onMaternityLeave && !c.isDismissed ? (
                      <span className="kc-chroma-status" title="В декрете" aria-label="В декрете">
                        🍼
                      </span>
                    ) : null}
                  </div>
                  {caption.cityLine ? <div className="kc-chroma-meta">{caption.cityLine}</div> : null}
                  {caption.positionLine ? <div className="kc-chroma-meta">{caption.positionLine}</div> : null}
                  {caption.lineLine ? <div className="kc-chroma-meta">{caption.lineLine}</div> : null}
                  <KcMessengerLinks
                    telegramUsername={c.telegramUsername}
                    expressId={c.expressId}
                    email={c.emailNew}
                  />
                </div>
              </div>
            </MagicSurface>
          </div>
        );
      })}
    </div>
  );
}
