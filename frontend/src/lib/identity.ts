export type DemoIdentity = { email: string };

const KEY = "lk.email";

export function getEmail(): string {
  return localStorage.getItem(KEY) ?? "";
}

export function setEmail(email: string) {
  localStorage.setItem(KEY, email.trim().toLowerCase());
}

