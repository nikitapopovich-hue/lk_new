import { createPortal } from "react-dom";
import "./ViolationsJournal.css";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ViolationConfirmModal(props: Props) {
  return createPortal(
    <div className="vj-modal-backdrop" role="presentation">
      <div className="vj-modal" role="alertdialog" aria-labelledby="vj-confirm-title" style={{ maxWidth: "24rem" }}>
        <h2 id="vj-confirm-title" className="vj-modal__title">
          {props.title}
        </h2>
        <p className="vj-confirm-text">{props.message}</p>
        <div className="vj-modal-actions">
          <button type="button" className="kpd-btn kpd-btn--ghost" onClick={props.onCancel} disabled={props.busy}>
            {props.cancelLabel ?? "Отмена"}
          </button>
          <button
            type="button"
            className={`kpd-btn ${props.danger ? "kpd-btn--ghost" : "kpd-btn--primary"}`}
            style={props.danger ? { borderColor: "rgba(248,113,113,0.5)", color: "#fca5a5" } : undefined}
            onClick={props.onConfirm}
            disabled={props.busy}
          >
            {props.busy ? "…" : (props.confirmLabel ?? "Подтвердить")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
