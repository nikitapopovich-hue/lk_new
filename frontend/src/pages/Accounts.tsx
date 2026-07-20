import { useEffect, useState } from "react";
import { type AccountRow, createAccount, deleteAccount, listAccounts } from "../lib/auth";

export function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [email, setEmail] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      setAccounts(await listAccounts());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate() {
    setError("");
    setCreated(null);
    const e = email.trim().toLowerCase();
    if (!e) {
      setError("Укажите email.");
      return;
    }
    setLoading(true);
    try {
      const res = await createAccount(e);
      setCreated(res);
      setEmail("");
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(target: string) {
    if (!window.confirm(`Удалить учётку ${target}?`)) return;
    try {
      await deleteAccount(target);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6 text-white">
      <h1 className="mb-6 text-2xl font-light">Учётные записи</h1>

      <div className="mb-6 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-white/50">Email новой учётки</span>
            <input
              type="email"
              className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm outline-none ring-pari-500/30 focus:ring-2"
              placeholder="user@pari.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleCreate()}
            className="rounded-xl border border-pari-400/40 bg-pari-500/15 px-5 py-2.5 text-sm font-medium text-pari-100 disabled:opacity-50"
          >
            {loading ? "…" : "Создать"}
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

        {created ? (
          <div className="mt-4 rounded-xl border border-pari-400/30 bg-pari-950/40 p-3 text-sm">
            <p className="text-white/70">Учётка создана. Пароль показывается один раз:</p>
            <p className="mt-2 font-mono">
              {created.email} : <span className="text-pari-200">{created.password}</span>
            </p>
            <button
              type="button"
              className="mt-2 text-xs text-pari-300 underline"
              onClick={() => void navigator.clipboard.writeText(created.password)}
            >
              Скопировать пароль
            </button>
          </div>
        ) : null}
      </div>

      <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-black/30">
        {accounts.map((a) => (
          <li key={a.email} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{a.email}</span>
            <button
              type="button"
              className="text-xs text-red-300 hover:underline"
              onClick={() => void handleDelete(a.email)}
            >
              Удалить
            </button>
          </li>
        ))}
        {accounts.length === 0 ? (
          <li className="px-4 py-3 text-sm text-white/40">Учёток пока нет.</li>
        ) : null}
      </ul>
    </div>
  );
}
