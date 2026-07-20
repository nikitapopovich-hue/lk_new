import { useEffect, useState } from "react";
import { fetchMe, formatPersonDisplayName, type AuthUser } from "../lib/auth";
import {
  fetchEmployeeProfile,
  getRemoteWorkMissingFields,
  isRemoteWorkComplete,
  isRemoteWorkFieldFilled,
  PROFILE_SELECT_OPTIONS,
  REMOTE_WORK_FIELDS,
  updateEmployeeProfile,
  type EmployeeProfile,
  type ProfileRemoteWork,
  type ProfileSelectOption,
} from "../lib/profile";

const panelSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.74)] to-[rgba(26,31,55,0.5)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

const inputClass =
  "w-full rounded-xl border border-white/[0.1] bg-black/35 px-3 py-2.5 text-sm text-white outline-none ring-pari-500/20 placeholder:text-white/35 focus:ring-2";

const selectClass =
  "w-full rounded-xl border border-white/[0.1] bg-[#1a1f37] px-3 py-2.5 text-sm text-white outline-none ring-pari-500/20 focus:ring-2";

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-pari-400/80" aria-hidden>
      <path
        fill="currentColor"
        d="M13.586 3.586a2 2 0 0 1 2.828 2.828l-9.5 9.5a1 1 0 0 1-.45.26l-3.5 1a1 1 0 0 1-1.26-1.26l1-3.5a1 1 0 0 1 .26-.45l9.5-9.5zM12.172 5l2.828 2.828"
      />
    </svg>
  );
}

function FieldLabel(props: { children: string; required?: boolean }) {
  return (
    <p className="text-xs text-white/50">
      {props.children}
      {props.required ? <span className="ml-0.5 text-red-400">*</span> : null}
    </p>
  );
}

function EditableField(props: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  onValidationError?: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value);
  const [fieldError, setFieldError] = useState("");

  useEffect(() => {
    if (!editing) setDraft(props.value);
  }, [props.value, editing]);

  return (
    <div className="border-b border-white/[0.06] py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <FieldLabel required={props.required}>{props.label}</FieldLabel>
          {editing ? (
            <input
              className={`${inputClass} mt-2`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              disabled={props.disabled}
            />
          ) : (
            <p
              className={`mt-1 text-sm font-medium ${props.value.trim() ? "text-white" : "text-white/35 italic"}`}
            >
              {props.value.trim() || "Не заполнено"}
            </p>
          )}
        </div>
        {editing ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
              onClick={() => {
                setEditing(false);
                setDraft(props.value);
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              className="rounded-lg border border-pari-400/40 bg-pari-500/20 px-2 py-1 text-xs text-white hover:bg-pari-500/30"
              disabled={props.disabled}
              onClick={() => {
                const next = draft.trim();
                if (props.required && !next) {
                  const msg = `Укажите: ${props.label}`;
                  setFieldError(msg);
                  props.onValidationError?.(msg);
                  return;
                }
                setFieldError("");
                props.onSave(next);
                setEditing(false);
              }}
            >
              OK
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="rounded-lg p-1.5 hover:bg-white/5"
            aria-label={`Редактировать: ${props.label}`}
            disabled={props.disabled}
            onClick={() => setEditing(true)}
          >
            <PencilIcon />
          </button>
        )}
      </div>
      {fieldError ? <p className="mt-2 text-xs text-red-300">{fieldError}</p> : null}
    </div>
  );
}

function ProfileSelect(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  options?: readonly ProfileSelectOption[];
}) {
  const options = props.options ?? PROFILE_SELECT_OPTIONS;
  const showPlaceholder = !options.some((o) => o.value === props.value);
  return (
    <label className="block border-b border-white/[0.06] py-4 last:border-b-0">
      <FieldLabel required={props.required}>{props.label}</FieldLabel>
      <select
        className={`${selectClass} mt-2`}
        value={showPlaceholder ? "" : props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {showPlaceholder ? (
          <option value="" disabled>
            Выберите
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value || "empty"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SubscriptionToggle(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-white/[0.06] py-4 last:border-b-0">
      <span className="text-sm text-white/85">{props.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
        className={[
          "relative h-7 w-12 shrink-0 rounded-full transition",
          props.checked ? "bg-pari-500" : "bg-white/20",
          props.disabled ? "opacity-50" : "",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition",
            props.checked ? "left-[22px]" : "left-0.5",
          ].join(" ")}
        />
      </button>
    </label>
  );
}

export function ProfilePage() {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedHint, setSavedHint] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([fetchMe(), fetchEmployeeProfile()])
      .then(([user, prof]) => {
        if (cancelled) return;
        setMe(user);
        setProfile(prof);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function persist(patch: Parameters<typeof updateEmployeeProfile>[0]) {
    setSaving(true);
    setError("");
    setSavedHint("");
    try {
      const next = await updateEmployeeProfile(patch);
      setProfile(next);
      setSavedHint("Сохранено");
      window.setTimeout(() => setSavedHint(""), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function patchRemote(field: keyof ProfileRemoteWork, value: string) {
    if (!profile) return;
    if (!isRemoteWorkFieldFilled(field, value)) return;
    const remoteWork = { ...profile.remoteWork, [field]: value };
    setProfile({ ...profile, remoteWork });
    void persist({ remoteWork });
  }

  const missingRemoteFields = profile ? getRemoteWorkMissingFields(profile.remoteWork) : [];
  const remoteWorkComplete = profile ? isRemoteWorkComplete(profile.remoteWork) : false;

  const name = me ? formatPersonDisplayName(me) : "—";
  const email = me?.email ?? profile?.email ?? "";
  const picture = me?.pictureUrl?.trim();

  return (
    <div className="min-w-0 pb-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Профиль</h1>
        {savedHint ? <span className="text-xs text-pari-300">{savedHint}</span> : null}
      </header>

      {loading ? <p className="mt-6 text-sm text-white/50">Загрузка профиля…</p> : null}
      {error ? (
        <p className="mt-6 rounded-xl border border-red-500/35 bg-red-950/35 px-4 py-3 text-sm text-red-100">{error}</p>
      ) : null}

      {profile && me ? (
        <div className="mt-6 space-y-5">
          <section className={`flex flex-wrap items-center gap-5 p-6 ${panelSurface}`}>
            <div
              className="h-20 w-20 shrink-0 rounded-2xl p-[2px] shadow-[0_0_20px_rgba(0,199,177,0.2)]"
              style={{ background: "linear-gradient(135deg, #00c7b1 0%, #753bbd 100%)" }}
            >
              {picture ? (
                <img src={picture} alt="" className="h-full w-full rounded-[14px] object-cover bg-[#1a1f37]" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#1a1f37] text-2xl font-semibold text-white">
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p className="text-xl font-bold text-white sm:text-2xl">{name}</p>
              <p className="mt-1 text-sm text-white/55">{email}</p>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
            <section className={`lg:col-span-8 p-6 ${panelSurface}`}>
              <h2 className="text-lg font-semibold text-white">Удалённая работа</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/55">
                Укажите, пожалуйста, есть ли у вас возможность удалённого подключения к работе из дома. Все поля
                обязательны.
              </p>

              {!remoteWorkComplete ? (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  <p className="font-medium">Заполните все обязательные поля</p>
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-amber-100/85">
                    {missingRemoteFields.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 text-xs text-pari-300">Анкета заполнена полностью.</p>
              )}

              <div className="mt-6">
                {REMOTE_WORK_FIELDS.map((field) => {
                  const value = profile.remoteWork[field.key];
                  if (field.kind === "text") {
                    return (
                      <EditableField
                        key={field.key}
                        label={field.label}
                        value={value}
                        required
                        disabled={saving}
                        onValidationError={setError}
                        onSave={(v) => patchRemote(field.key, v)}
                      />
                    );
                  }
                  return (
                    <ProfileSelect
                      key={field.key}
                      label={field.label}
                      value={value}
                      required
                      options={field.options ?? PROFILE_SELECT_OPTIONS}
                      disabled={saving}
                      onChange={(v) => patchRemote(field.key, v)}
                    />
                  );
                })}
              </div>
            </section>

            <section className={`lg:col-span-4 p-6 ${panelSurface}`}>
              <h2 className="text-lg font-semibold text-white">Управление рассылкой</h2>
              <p className="mt-1 text-xs text-white/45">Аккаунт</p>

              <div className="mt-4">
                <SubscriptionToggle
                  label="Все уведомления"
                  checked={profile.subscriptions.all ?? true}
                  disabled={saving}
                  onChange={(all) => {
                    const subscriptions = { ...profile.subscriptions, all };
                    setProfile({ ...profile, subscriptions });
                    void persist({ subscriptions });
                  }}
                />
                <SubscriptionToggle
                  label="Премии"
                  checked={profile.subscriptions.bonuses}
                  disabled={saving || !(profile.subscriptions.all ?? true)}
                  onChange={(bonuses) => {
                    const subscriptions = { ...profile.subscriptions, bonuses };
                    setProfile({ ...profile, subscriptions });
                    void persist({ subscriptions });
                  }}
                />
                <SubscriptionToggle
                  label="Переработки"
                  checked={profile.subscriptions.overtime}
                  disabled={saving || !(profile.subscriptions.all ?? true)}
                  onChange={(overtime) => {
                    const subscriptions = { ...profile.subscriptions, overtime };
                    setProfile({ ...profile, subscriptions });
                    void persist({ subscriptions });
                  }}
                />
                <SubscriptionToggle
                  label="Штрафы"
                  checked={profile.subscriptions.newFines}
                  disabled={saving || !(profile.subscriptions.all ?? true)}
                  onChange={(newFines) => {
                    const subscriptions = { ...profile.subscriptions, newFines };
                    setProfile({ ...profile, subscriptions });
                    void persist({ subscriptions });
                  }}
                />
                <SubscriptionToggle
                  label="Перерасчёты"
                  checked={profile.subscriptions.recalculations ?? true}
                  disabled={saving || !(profile.subscriptions.all ?? true)}
                  onChange={(recalculations) => {
                    const subscriptions = { ...profile.subscriptions, recalculations };
                    setProfile({ ...profile, subscriptions });
                    void persist({ subscriptions });
                  }}
                />
                <SubscriptionToggle
                  label="Итоговый мониторинг"
                  checked={profile.subscriptions.monitoring ?? true}
                  disabled={saving || !(profile.subscriptions.all ?? true)}
                  onChange={(monitoring) => {
                    const subscriptions = { ...profile.subscriptions, monitoring };
                    setProfile({ ...profile, subscriptions });
                    void persist({ subscriptions });
                  }}
                />
                <SubscriptionToggle
                  label="КПД"
                  checked={profile.subscriptions.kpd ?? true}
                  disabled={saving || !(profile.subscriptions.all ?? true)}
                  onChange={(kpd) => {
                    const subscriptions = { ...profile.subscriptions, kpd };
                    setProfile({ ...profile, subscriptions });
                    void persist({ subscriptions });
                  }}
                />
              </div>
            </section>
          </div>

          <p className="text-center text-xs text-white/35">@ 2026, Отдел реализации технических проектов</p>
        </div>
      ) : null}
    </div>
  );
}
