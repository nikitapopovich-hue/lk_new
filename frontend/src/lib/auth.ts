import type { Role } from "./role";
import { getApiBase } from "./apiBase";
import { setEmail } from "./identity";
import { setRole } from "./role";
import { fetchWithTimeout } from "./http";

const TOKEN_KEY = "lk.session";
/** Раньше токен был в sessionStorage — переносим один раз. */
const LEGACY_SESSION_KEY = TOKEN_KEY;

function readStoredToken(): string {
  try {
    const local = localStorage.getItem(TOKEN_KEY);
    if (local) return local;
    const legacy = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (legacy) {
      localStorage.setItem(TOKEN_KEY, legacy);
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
      return legacy;
    }
  } catch {
    // private mode / blocked storage
  }
  return "";
}

export type AuthUser = {
  email: string;
  displayName: string;
  /** Имя из Google (given_name) */
  givenName?: string;
  /** Фамилия из Google (family_name) */
  familyName?: string;
  /** Имя+фамилия для приветствия (с бэкенда) */
  faceName?: string;
  preferredRole: Role;
  roles: Role[];
  mapped: boolean;
  birthdayKnown?: boolean;
  zodiacSign?: string | null;
  zodiacLabelRu?: string | null;
  pictureUrl?: string;
  hasGoogleCalendar?: boolean;
};

/** Строка для «Привет, …» и сайдбара: как в Google (имя+фамилия), иначе displayName. */
/** Google avatar URLs often end with =s96-c — request a larger size for UI. */
export function largeProfilePictureUrl(url: string | undefined | null, size = 512): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  if (!u.includes("googleusercontent.com")) return u;
  if (/=s\d+(-c)?/i.test(u)) return u.replace(/=s\d+(-c)?/i, `=s${size}$1`);
  if (/[?&]sz=\d+/i.test(u)) return u.replace(/([?&]sz=)\d+/i, `$1${size}`);
  return `${u}${u.includes("?") ? "&" : "?"}sz=${size}`;
}

export function formatPersonDisplayName(u: Pick<AuthUser, "displayName" | "faceName" | "givenName" | "familyName">): string {
  const face = u.faceName?.trim();
  if (face) return face;
  const gn = u.givenName?.trim();
  const fn = u.familyName?.trim();
  if (gn && fn) return `${gn} ${fn}`;
  if (gn) return gn;
  return u.displayName?.trim() || "";
}

export { getApiBase } from "./apiBase";

export function getSessionToken(): string {
  return readStoredToken();
}

export function setSessionToken(token: string) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export type AuthConfigResponse = {
  googleEnabled: boolean;
  demoEnabled: boolean;
  googleClientId?: string;
  apiBaseUrl?: string;
  oauthRedirectUri?: string;
  googleOAuthScopes?: string[];
  googleBirthdayScopeRequested?: boolean;
};

export async function fetchAuthConfig(): Promise<AuthConfigResponse> {
  const resp = await fetch(`${getApiBase()}/auth/config`);
  if (!resp.ok) return { googleEnabled: false, demoEnabled: true };
  return (await resp.json()) as AuthConfigResponse;
}

export async function fetchMe(): Promise<AuthUser | null> {
  const resp = await fetchWithTimeout(`${getApiBase()}/me`, { headers: authHeaders() }, 15_000);
  if (resp.status === 401) return null;
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = (await resp.json()) as { user: AuthUser };
  return data.user;
}

export function googleLoginUrl(role: Role, opts?: { consent?: boolean }) {
  const origin = encodeURIComponent(window.location.origin);
  const consent = opts?.consent === false ? "0" : "1";
  return `${getApiBase()}/auth/google/login?role=${encodeURIComponent(role)}&origin=${origin}&consent=${consent}`;
}

export async function demoLogin(email: string, role: Role): Promise<AuthUser> {
  const resp = await fetch(`${getApiBase()}/auth/demo/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = (await resp.json()) as {
    token: string;
    email: string;
    name: string;
    preferredRole: Role;
  };
  setSessionToken(data.token);
  applyUser({ email: data.email, displayName: data.name, preferredRole: data.preferredRole, roles: [data.preferredRole], mapped: false });
  return {
    email: data.email,
    displayName: data.name,
    preferredRole: data.preferredRole,
    roles: [data.preferredRole],
    mapped: false,
  };
}

export function applyUser(user: AuthUser) {
  setEmail(user.email);
  setRole(user.preferredRole);
  window.dispatchEvent(new CustomEvent("lk:identityChanged", { detail: { email: user.email } }));
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${getApiBase()}/auth/logout`, { method: "POST", headers: authHeaders() });
  } catch {
    // ignore
  }
  setSessionToken("");
}

export async function passwordLogin(email: string, password: string, role: Role): Promise<AuthUser> {
  const resp = await fetch(`${getApiBase()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role }),
  });
  if (!resp.ok) {
    if (resp.status === 401) throw new Error("Неверный логин или пароль");
    const text = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = (await resp.json()) as { token: string; email: string; name: string; preferredRole: Role };
  setSessionToken(data.token);
  const user: AuthUser = {
    email: data.email,
    displayName: data.name,
    preferredRole: data.preferredRole,
    roles: [data.preferredRole],
    mapped: false,
  };
  applyUser(user);
  return user;
}

export type AccountRow = { email: string; createdAt: string };

export async function listAccounts(): Promise<AccountRow[]> {
  const resp = await fetch(`${getApiBase()}/accounts`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const data = (await resp.json()) as { accounts: AccountRow[] };
  return data.accounts;
}

export async function createAccount(email: string): Promise<{ email: string; password: string }> {
  const resp = await fetch(`${getApiBase()}/accounts`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email }),
  });
  if (!resp.ok) {
    if (resp.status === 409) throw new Error("Учётка с таким email уже существует");
    const text = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as { email: string; password: string };
}

export async function deleteAccount(email: string): Promise<void> {
  const resp = await fetch(`${getApiBase()}/accounts/${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
}

export function persistTokenFromHash(): boolean {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  const token = params.get("token");
  const role = params.get("role") as Role | null;
  if (!token) return false;
  setSessionToken(token);
  if (role === "operator" || role === "supervisor" || role === "superadmin") setRole(role);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return true;
}
