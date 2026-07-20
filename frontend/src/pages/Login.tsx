import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { fetchMe, passwordLogin } from "../lib/auth";
import { getEmail } from "../lib/identity";
import { getRole, setRole, type Role } from "../lib/role";
import MagicRings from "../components/MagicRings";

const ROLES: { id: Role; label: string }[] = [
  { id: "operator", label: "Оператор" },
  { id: "supervisor", label: "Руководитель" },
  { id: "superadmin", label: "Суперадмин" },
];

const ERROR_TEXT: Record<string, string> = {
  access_denied: "Вход отменён.",
  oauth_failed: "Ошибка обмена кода Google. Проверьте redirect URI и client secret на сервере.",
  redirect_uri_mismatch:
    "Redirect URI не совпадает с Google Cloud Console. Откройте /auth/config и добавьте oauthRedirectUri в Authorized redirect URIs.",
  invalid_grant:
    "Код авторизации недействителен (уже использован или истёк). Начните вход заново, не обновляйте страницу callback.",
  invalid_client: "Неверный GOOGLE_OAUTH_CLIENT_ID или GOOGLE_OAUTH_CLIENT_SECRET в .env на сервере.",
  no_email: "Google не вернул email.",
  domain: "Разрешены только аккаунты @pari.ru.",
  deleted_client:
    "OAuth-клиент в Google удалён или бэкенд шлёт старый Client ID. Откройте /auth/config и сверьте googleClientId с Google Console; уберите GOOGLE_OAUTH_* из переменных окружения Windows / Run Configuration в PyCharm.",
};

function RoleTab(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "rounded-full border px-3 py-1.5 text-[11px] font-medium tracking-wide transition",
        props.active
          ? "border-pari-400/60 bg-pari-500/15 text-pari-100 shadow-[0_0_16px_rgba(0,199,177,0.2)]"
          : "border-white/10 bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white/85",
      ].join(" ")}
    >
      {props.label}
    </button>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [role, setRoleState] = useState<Role>(getRole);
  const [email, setEmail] = useState(getEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const urlError = params.get("error");
  const bootError = (location.state as { bootError?: string } | null)?.bootError ?? "";

  const errorMessage = useMemo(() => {
    if (error) return error;
    if (bootError) return bootError;
    if (!urlError) return "";
    return ERROR_TEXT[urlError] ?? `Ошибка входа: ${urlError}`;
  }, [error, bootError, urlError]);

  useEffect(() => {
    setRole(role);
    fetchMe().then((u) => {
      if (u) navigate("/", { replace: true });
    });
  }, [navigate, role]);

  async function handleLogin() {
    setError("");
    const e = email.trim().toLowerCase();
    if (!e || !password) {
      setError("Укажите email и пароль.");
      return;
    }
    setLoading(true);
    try {
      await passwordLogin(e, password, role);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 z-0">
        <MagicRings
          color="#00C7B1"
          colorTwo="#753BBD"
          ringCount={6}
          speed={1}
          attenuation={10}
          lineThickness={2}
          baseRadius={0.35}
          radiusStep={0.1}
          scaleRate={0.1}
          opacity={1}
          blur={0}
          noiseAmount={0.1}
          rotation={0}
          ringGap={1.5}
          fadeIn={0.7}
          fadeOut={0.5}
          followMouse
          mouseInfluence={0.18}
          hoverScale={1.15}
          parallax={0.05}
          clickBurst
        />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col pointer-events-none">
        <header className="flex shrink-0 justify-end px-4 pt-6 sm:px-8">
          <nav className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
            {ROLES.map((r) => (
              <RoleTab
                key={r.id}
                label={r.label}
                active={role === r.id}
                onClick={() => {
                  setRoleState(r.id);
                  setRole(r.id);
                }}
              />
            ))}
          </nav>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-8 text-center sm:px-10">
          <h1 className="pointer-events-none max-w-4xl text-5xl font-extralight tracking-[-0.02em] sm:text-7xl md:text-8xl">
            <span className="bg-gradient-to-br from-white via-pari-100 to-[#753BBD] bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(0,199,177,0.15)]">
              PARI.One
            </span>
          </h1>
          <p className="pointer-events-none mt-6 max-w-lg text-base font-light leading-relaxed text-white/75 sm:text-lg">
            Одна точка входа во все системы
          </p>

          <div className="pointer-events-auto mt-12 w-full max-w-sm">
            {errorMessage ? (
              <p className="mb-5 rounded-2xl border border-red-500/35 bg-red-950/50 px-4 py-3 text-left text-sm text-red-100 backdrop-blur-md">
                {errorMessage}
              </p>
            ) : null}

            <div className="mb-4 space-y-3 text-left">
              <input
                type="email"
                autoComplete="username"
                className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white outline-none ring-pari-500/30 placeholder:text-white/30 focus:ring-2"
                placeholder="email@pari.ru"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
              />
              <input
                type="password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white outline-none ring-pari-500/30 placeholder:text-white/30 focus:ring-2"
                placeholder="Пароль"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") void handleLogin();
                }}
              />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleLogin()}
              className="group relative w-full overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-r from-[#00c7b1]/25 via-white/[0.08] to-[#753bbd]/30 px-8 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white shadow-[0_0_0_1px_rgba(0,199,177,0.25),0_12px_40px_rgba(117,59,189,0.25)] transition hover:border-pari-400/40 hover:shadow-[0_0_0_1px_rgba(0,199,177,0.45),0_16px_48px_rgba(0,199,177,0.2)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span
                className="absolute inset-0 bg-gradient-to-r from-pari-500/0 via-pari-400/20 to-[#753bbd]/0 opacity-0 transition group-hover:opacity-100"
                aria-hidden
              />
              <span className="relative">{loading ? "Подождите…" : "Войти"}</span>
            </button>
          </div>
        </main>

        <footer className="pointer-events-none shrink-0 pb-6 text-center text-xs text-white/35">
          @ 2026, Отдел реализации технических проектов
        </footer>
      </div>
    </div>
  );
}
