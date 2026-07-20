import type { ChromaCardDto, KcEmployeeRecord } from "./kcData";

export type KcListSection = "active" | "maternity" | "dismissed";

export const KC_LIST_SECTION_LABELS: Record<KcListSection, string> = {
  active: "Активные",
  maternity: "В декрете",
  dismissed: "Уволенные",
};

export function employeeMatchesListSection(
  employee: Pick<KcEmployeeRecord, "onMaternityLeave" | "isDismissed">,
  section: KcListSection,
): boolean {
  if (section === "dismissed") return Boolean(employee.isDismissed);
  if (section === "maternity") return Boolean(employee.onMaternityLeave) && !employee.isDismissed;
  return !employee.onMaternityLeave && !employee.isDismissed;
}

export function filterEmployeesByListSection(
  employees: KcEmployeeRecord[],
  section: KcListSection,
): KcEmployeeRecord[] {
  return employees.filter((e) => employeeMatchesListSection(e, section));
}

export function filterCardsByListSection(cards: ChromaCardDto[], section: KcListSection): ChromaCardDto[] {
  return cards.filter((c) => {
    if (section === "dismissed") return Boolean(c.isDismissed);
    if (section === "maternity") return Boolean(c.onMaternityLeave) && !c.isDismissed;
    return !c.onMaternityLeave && !c.isDismissed;
  });
}
