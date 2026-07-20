import type { KcListSection } from "../../lib/kcListSection";
import { KC_LIST_SECTION_LABELS } from "../../lib/kcListSection";
import "./KcListSectionToggle.css";

const SECTIONS: KcListSection[] = ["active", "maternity", "dismissed"];

type Props = {
  value: KcListSection;
  counts: Record<KcListSection, number>;
  onChange: (section: KcListSection) => void;
};

export function KcListSectionToggle(props: Props) {
  return (
    <div className="kc-list-section" role="group" aria-label="Раздел списка">
      {SECTIONS.map((section) => (
        <button
          key={section}
          type="button"
          className={`kc-list-section__btn ${props.value === section ? "kc-list-section__btn--active" : ""}`}
          aria-pressed={props.value === section}
          onClick={() => props.onChange(section)}
        >
          {KC_LIST_SECTION_LABELS[section]}
          <span className="kc-list-section__count">{props.counts[section]}</span>
        </button>
      ))}
    </div>
  );
}
