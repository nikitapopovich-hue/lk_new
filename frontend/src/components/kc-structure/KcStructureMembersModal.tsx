import type { KcStructureEmployee, KcStructureFlatNode } from "../../lib/kcStructure";
import "./KcStructureMembersModal.css";

type Props = {
  node: KcStructureFlatNode;
  onClose: () => void;
  onMemberClick: (employeeId: number) => void;
};

function MemberCard(props: {
  person: KcStructureEmployee;
  onClick: () => void;
  variant?: "grid" | "leader";
}) {
  const p = props.person;
  const variant = props.variant ?? "grid";
  return (
    <button
      type="button"
      className={`kc-map-members-card ${variant === "leader" ? "kc-map-members-card--leader" : ""}`}
      onClick={props.onClick}
    >
      {p.photoUrl ? (
        <img className="kc-map-members-card__photo" src={p.photoUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="kc-map-members-card__photo kc-map-members-card__photo--ph" aria-hidden>
          {p.fullName.charAt(0)}
        </span>
      )}
      <div className="kc-map-members-card__body">
        {variant === "leader" ? <p className="kc-map-members-card__badge">Руководитель</p> : null}
        <p className="kc-map-members-card__name">{p.fullName}</p>
        <p className="kc-map-members-card__meta">{p.position || "—"}</p>
        {p.subdivision || p.department ? (
          <p className="kc-map-members-card__sub">
            {[p.department, p.subdivision].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
    </button>
  );
}

export function KcStructureMembersModal(props: Props) {
  const { node } = props;

  if (node.isBranchLeader && node.manager) {
    return (
      <div className="kc-map-members-backdrop" role="presentation" onClick={props.onClose}>
        <div
          className="kc-map-members-dialog scrollbar-pari"
          role="dialog"
          aria-labelledby="kc-map-members-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="kc-map-members-dialog__head">
            <div>
              <h2 id="kc-map-members-title" className="kc-map-members-dialog__title">
                {node.title}
              </h2>
              <p className="kc-map-members-dialog__sub">1 участник</p>
            </div>
            <button type="button" className="kc-map-members-dialog__close" onClick={props.onClose} aria-label="Закрыть">
              ×
            </button>
          </header>
          <div className="kc-map-members-leader">
            <MemberCard person={node.manager} variant="leader" onClick={() => props.onMemberClick(node.manager!.id)} />
          </div>
        </div>
      </div>
    );
  }

  const manager = node.manager ?? null;
  const employees = node.employees.filter((e) => e.id !== manager?.id);
  const total = employees.length + (manager ? 1 : 0);

  return (
    <div className="kc-map-members-backdrop" role="presentation" onClick={props.onClose}>
      <div
        className="kc-map-members-dialog scrollbar-pari"
        role="dialog"
        aria-labelledby="kc-map-members-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="kc-map-members-dialog__head">
          <div>
            <h2 id="kc-map-members-title" className="kc-map-members-dialog__title">
              {node.title}
            </h2>
            <p className="kc-map-members-dialog__sub">
              {total} {total === 1 ? "участник" : total < 5 ? "участника" : "участников"}
            </p>
          </div>
          <button type="button" className="kc-map-members-dialog__close" onClick={props.onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        {total === 0 ? (
          <p className="kc-map-members-empty">В этой группе пока нет привязанных сотрудников.</p>
        ) : (
          <>
            {manager ? (
              <div className="kc-map-members-leader">
                <MemberCard person={manager} variant="leader" onClick={() => props.onMemberClick(manager.id)} />
              </div>
            ) : null}
            {employees.length > 0 ? (
              <>
                {manager ? <p className="kc-map-members-section-title">Сотрудники</p> : null}
                <div className="kc-map-members-grid">
                  {employees.map((p) => (
                    <MemberCard key={p.id} person={p} onClick={() => props.onMemberClick(p.id)} />
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
