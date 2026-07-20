import { createPortal } from "react-dom";
import { VIOLATION_FINE_CATALOG } from "../../lib/violationFineCatalog";
import "./ViolationsJournal.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ViolationFineInfoModal(props: Props) {
  if (!props.open) return null;

  return createPortal(
    <div className="vj-modal-backdrop vj-modal-backdrop--center" role="presentation" onClick={props.onClose}>
      <div
        className="vj-modal vj-modal--fines"
        role="dialog"
        aria-labelledby="vj-fines-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vj-modal__head">
          <h2 id="vj-fines-title" className="vj-modal__title">
            Суммы штрафов
          </h2>
          <button type="button" className="vj-modal__close" aria-label="Закрыть" onClick={props.onClose}>
            ×
          </button>
        </div>

        <div className="vj-fines-note">
          Сумма может быть скорректирована индивидуально под случай.
        </div>

        <div className="vj-fines-table-wrap">
          <table className="vj-fines-table">
            <thead>
              <tr>
                <th>Тип нарушения</th>
                <th className="vj-fines-table__sum">Сумма штрафа</th>
              </tr>
            </thead>
            <tbody>
              {VIOLATION_FINE_CATALOG.map((r) => (
                <tr key={r.type}>
                  <td>{r.type}</td>
                  <td className="vj-fines-table__sum">{r.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="vj-modal-actions">
          <div className="vj-modal-actions__start" />
          <div className="vj-modal-actions__end">
            <button type="button" className="kpd-btn kpd-btn--primary vj-btn" onClick={props.onClose}>
              Понятно
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
