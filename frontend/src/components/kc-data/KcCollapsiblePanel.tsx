import { type ReactNode, useState } from "react";
import "./KcCollapsiblePanel.css";

type Props = {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function KcCollapsiblePanel(props: Props) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);

  return (
    <section className={`kc-collapse ${open ? "kc-collapse--open" : ""}`}>
      <button
        type="button"
        className="kc-collapse__trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <h2 className="kc-collapse__title">{props.title}</h2>
          {!open && props.hint ? <p className="kc-collapse__hint">{props.hint}</p> : null}
        </div>
        <span className="kc-collapse__chevron" aria-hidden>
          ▼
        </span>
      </button>
      {open ? <div className="kc-collapse__body">{props.children}</div> : null}
    </section>
  );
}
