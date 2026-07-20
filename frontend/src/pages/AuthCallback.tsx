import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { applyUser, fetchMe, persistTokenFromHash, setSessionToken, getApiBase } from "../lib/auth";

async function bootstrapSessionToken(): Promise<boolean> {
  const resp = await fetch(`${getApiBase()}/auth/session-token`, { credentials: "include" });
  if (!resp.ok) return false;
  const data = (await resp.json()) as { token?: string };
  if (!data.token) return false;
  setSessionToken(data.token);
  return true;
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    async function finishLogin() {
      let hasToken = persistTokenFromHash();
      if (!hasToken) {
        try {
          hasToken = await bootstrapSessionToken();
        } catch {
          hasToken = false;
        }
      }
      if (!hasToken) {
        setError("Не удалось установить сессию после входа.");
        return;
      }
      const user = await fetchMe();
      if (!user) {
        setError("Не удалось получить профиль после входа.");
        return;
      }
      applyUser(user);
      navigate("/", { replace: true });
    }

    void finishLogin().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020515] text-white">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-sm text-red-300">{error}</p>
            <a className="mt-4 inline-block text-sm text-pari-400 underline" href="/login">
              Вернуться на страницу входа
            </a>
          </>
        ) : (
          <p className="text-sm text-white/60">Завершаем вход…</p>
        )}
      </div>
    </div>
  );
}
