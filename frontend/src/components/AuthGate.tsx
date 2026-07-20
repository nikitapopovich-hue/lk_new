import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { applyUser, fetchMe, getSessionToken, setSessionToken } from "../lib/auth";

export function AuthGate(props: { children: ReactNode }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [bootError, setBootError] = useState("");
  const bootGen = useRef(0);

  useEffect(() => {
    const gen = ++bootGen.current;

    async function boot() {
      if (!getSessionToken()) {
        if (gen !== bootGen.current) return;
        setAuthed(false);
        setBootError("");
        setReady(true);
        return;
      }

      try {
        const user = await fetchMe();
        if (gen !== bootGen.current) return;
        if (user) {
          applyUser(user);
          setAuthed(true);
          setBootError("");
        } else {
          setSessionToken("");
          setAuthed(false);
          setBootError("Сессия истекла. Войдите снова.");
        }
      } catch (e: unknown) {
        if (gen !== bootGen.current) return;
        setAuthed(false);
        setBootError(e instanceof Error ? e.message : "Не удалось связаться с API");
      } finally {
        if (gen === bootGen.current) setReady(true);
      }
    }

    setReady(false);
    void boot();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020515] text-white/60">
        Загрузка…
      </div>
    );
  }

  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname, bootError }} />;
  }

  return <>{props.children}</>;
}
