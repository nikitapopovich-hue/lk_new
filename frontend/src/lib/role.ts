export type Role = "operator" | "supervisor" | "superadmin";

const KEY = "lk.role";

export function getRole(): Role {
  const v = localStorage.getItem(KEY);
  if (v === "superadmin") return "superadmin";
  if (v === "supervisor") return "supervisor";
  return "operator";
}

export function setRole(role: Role) {
  localStorage.setItem(KEY, role);
}

