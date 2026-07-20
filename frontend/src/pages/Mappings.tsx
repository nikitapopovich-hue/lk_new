import { useEffect, useMemo, useState } from "react";
import { getApiBase } from "../lib/apiBase";

const operatorSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.74)] to-[rgba(26,31,55,0.5)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

type Mapping = {
  id: number;
  email: string;
  displayName: string;
  backofficeUserId: string;
  backofficeLogonName: string;
  usedeskUserId: string;
  usedeskEmail: string;
  uisEmployeeId: string;
  uisLogin: string;
  notes: string;
};

const apiBase = getApiBase();

async function listMappings(q: string): Promise<Mapping[]> {
  const url = new URL(`${apiBase}/mappings`);
  if (q.trim()) url.searchParams.set("q", q.trim());
  const r = await fetch(url);
  if (!r.ok) throw new Error(`API ${r.status}`);
  const j = (await r.json()) as { items: Mapping[] };
  return j.items ?? [];
}

async function createMapping(input: Omit<Mapping, "id">) {
  const r = await fetch(`${apiBase}/mappings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (await r.json()) as Mapping;
}

async function updateMapping(id: number, patch: Partial<Omit<Mapping, "id">>) {
  const r = await fetch(`${apiBase}/mappings/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (await r.json()) as Mapping;
}

async function deleteMapping(id: number) {
  const r = await fetch(`${apiBase}/mappings/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (await r.json()) as { ok: boolean };
}

export function MappingsPage() {
  const [items, setItems] = useState<Mapping[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [showOnlyMissing, setShowOnlyMissing] = useState<{ bo: boolean; uis: boolean; usedesk: boolean }>({
    bo: false,
    uis: false,
    usedesk: false,
  });
  const [autoOnlyMissing, setAutoOnlyMissing] = useState<{ bo: boolean; uis: boolean; usedesk: boolean }>({
    bo: false,
    uis: true,
    usedesk: false,
  });
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<Mapping, "id">>({
    email: "",
    displayName: "",
    backofficeUserId: "",
    backofficeLogonName: "",
    usedeskUserId: "",
    usedeskEmail: "",
    uisEmployeeId: "",
    uisLogin: "",
    notes: "",
  });

  async function reload() {
    setError("");
    try {
      setItems(await listMappings(q));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canCreate = useMemo(() => form.email.trim().includes("@"), [form.email]);

  const filteredItems = useMemo(() => {
    return items.filter((m) => {
      if (showOnlyMissing.bo && m.backofficeUserId) return false;
      if (showOnlyMissing.uis && m.uisEmployeeId) return false;
      if (showOnlyMissing.usedesk && m.usedeskUserId) return false;
      return true;
    });
  }, [items, showOnlyMissing]);

  return (
    <div className="min-w-0 text-white">
      <header className={`flex items-end justify-between gap-4 p-6 ${operatorSurface}`}>
        <div>
          <div className="text-sm font-medium text-[#a0aec0]">Суперадмин</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-white">Маппинг сотрудников</div>
          <div className="mt-2 text-xs leading-relaxed text-white/55">
            Истина — email. ФИО может отличаться (отчество/ё/е). IDs задаём явно.
          </div>
        </div>
      </header>

      {error ? (
        <div className="mt-6 rounded-[20px] border border-red-500/40 bg-red-950/35 p-4 text-sm text-red-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
          {error}
        </div>
      ) : null}

      <section className={`mt-6 p-6 ${operatorSurface}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold tracking-tight text-white/90">Поиск</div>
          <button
            className="rounded-xl border border-white/[0.1] bg-white/[0.06] px-3 py-2 text-xs text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-white/[0.14] hover:bg-white/[0.1] hover:text-white"
            onClick={reload}
          >
            Обновить
          </button>
        </div>
        <div className="mt-4 grid grid-cols-12 gap-3">
          <input
            className="col-span-12 md:col-span-6 rounded-xl border border-white/[0.1] bg-black/35 px-4 py-3 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none ring-pari-500/20 placeholder:text-white/40 focus:ring-2"
            placeholder="email содержит..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="col-span-12 md:col-span-2 rounded-xl border border-white/[0.1] bg-white/[0.08] px-4 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-pari-400/30 hover:bg-white/[0.12]"
            onClick={reload}
          >
            Искать
          </button>
          <div className="col-span-12 md:col-span-4 text-xs text-white/50 self-center">
            API: <span className="font-mono">{apiBase}</span>
          </div>
        </div>
      </section>

      <section className={`mt-6 p-6 ${operatorSurface}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold tracking-tight text-white/90">Автосбор (Usedesk → Backoffice/UIS)</div>
          <div className="flex gap-2">
            <button
              className="rounded-xl border border-white/[0.1] bg-white/[0.06] px-3 py-2 text-xs text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-white/[0.14] hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const onlyMissing: string[] = [];
                  if (autoOnlyMissing.bo) onlyMissing.push("backoffice");
                  if (autoOnlyMissing.uis) onlyMissing.push("uis");
                  if (autoOnlyMissing.usedesk) onlyMissing.push("usedesk");
                  const r = await fetch(`${apiBase}/mappings/auto/suggest`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      onlyPariEmails: true,
                      minConfidence: 0.7,
                      includeExisting: true,
                      onlyMissing,
                    }),
                  });
                  if (!r.ok) throw new Error(`API ${r.status}`);
                  const j = (await r.json()) as { items: any[] };
                  setSuggestions(j.items ?? []);
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Собрать предложения
            </button>
            <button
              className="rounded-xl border border-pari-400/45 bg-pari-500/20 px-3 py-2 text-xs font-medium text-white shadow-[0_0_20px_rgba(0,199,177,0.12),inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-pari-300/50 hover:bg-pari-500/28 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={busy || suggestions.length === 0}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await fetch(`${apiBase}/mappings/auto/apply`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items: suggestions }),
                  });
                  if (!r.ok) throw new Error(`API ${r.status}`);
                  await reload();
                  setSuggestions([]);
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Применить
            </button>
          </div>
        </div>
        <div className="mt-3 text-xs text-white/50">
          Сопоставление по нормализованному ФИО (ё→е, пробелы) и уникальности. Перед применением можно посмотреть confidence.
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/60">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoOnlyMissing.uis}
              onChange={(e) => setAutoOnlyMissing((s) => ({ ...s, uis: e.target.checked }))}
              className="h-4 w-4 accent-[#00c7b1]"
            />
            Только без UIS
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoOnlyMissing.bo}
              onChange={(e) => setAutoOnlyMissing((s) => ({ ...s, bo: e.target.checked }))}
              className="h-4 w-4 accent-[#00c7b1]"
            />
            Только без Backoffice
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoOnlyMissing.usedesk}
              onChange={(e) => setAutoOnlyMissing((s) => ({ ...s, usedesk: e.target.checked }))}
              className="h-4 w-4 accent-[#00c7b1]"
            />
            Только без Usedesk
          </label>
        </div>
        {suggestions.length ? (
          <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-white/[0.08] bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {suggestions.slice(0, 200).map((s, idx) => (
              <div key={idx} className="border-b border-white/[0.06] px-4 py-3 text-xs last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate text-white/90">{s.email}</div>
                  <div className="mt-1 text-white/50">{s.displayName}</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-white/60">
                  <div>BO: {s.backofficeUserId || "—"}</div>
                  <div>UIS: {s.uisEmployeeId || "—"}</div>
                  <div className="font-mono">conf {Number(s.confidence).toFixed(2)}</div>
                </div>
                    {s.current ? (
                      <div className="mt-2 text-[11px] text-white/45">
                        Сейчас в БД — BO: {s.current.backofficeUserId || "—"}, UIS: {s.current.uisEmployeeId || "—"}
                      </div>
                    ) : null}
                {Array.isArray(s.backofficeCandidates) && s.backofficeCandidates.length ? (
                  <div className="mt-2 text-[11px] text-white/45">
                    BO кандидаты:{" "}
                    {s.backofficeCandidates
                      .map((c: any) => `${c.id}${c.logonName ? `(${c.logonName})` : ""}`)
                      .join(", ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 text-sm text-white/50">Предложений нет (или не настроены токены интеграций).</div>
        )}
      </section>

      <section className={`mt-6 p-6 ${operatorSurface}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold tracking-tight text-white/90">
            {editId ? `Редактирование #${editId}` : "Добавить"}
          </div>
          {editId ? (
            <button
              className="rounded-xl border border-white/[0.1] bg-white/[0.06] px-3 py-2 text-xs text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-white/[0.14] hover:bg-white/[0.1] hover:text-white"
              onClick={() => {
                setEditId(null);
                setForm({
                  email: "",
                  displayName: "",
                  backofficeUserId: "",
                  backofficeLogonName: "",
                  usedeskUserId: "",
                  usedeskEmail: "",
                  uisEmployeeId: "",
                  uisLogin: "",
                  notes: "",
                });
              }}
            >
              Сбросить
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-12 gap-3">
          <Field label="email" value={form.email} onChange={(v) => setForm((s) => ({ ...s, email: v }))} className="col-span-12 md:col-span-4" />
          <Field label="displayName" value={form.displayName} onChange={(v) => setForm((s) => ({ ...s, displayName: v }))} className="col-span-12 md:col-span-4" />
          <Field label="Backoffice userId" value={form.backofficeUserId} onChange={(v) => setForm((s) => ({ ...s, backofficeUserId: v }))} className="col-span-12 md:col-span-4" />

          <Field label="Backoffice logonName" value={form.backofficeLogonName} onChange={(v) => setForm((s) => ({ ...s, backofficeLogonName: v }))} className="col-span-12 md:col-span-4" />
          <Field label="Usedesk userId" value={form.usedeskUserId} onChange={(v) => setForm((s) => ({ ...s, usedeskUserId: v }))} className="col-span-12 md:col-span-4" />
          <Field label="Usedesk email" value={form.usedeskEmail} onChange={(v) => setForm((s) => ({ ...s, usedeskEmail: v }))} className="col-span-12 md:col-span-4" />

          <Field label="UIS employeeId" value={form.uisEmployeeId} onChange={(v) => setForm((s) => ({ ...s, uisEmployeeId: v }))} className="col-span-12 md:col-span-4" />
          <Field label="UIS login" value={form.uisLogin} onChange={(v) => setForm((s) => ({ ...s, uisLogin: v }))} className="col-span-12 md:col-span-4" />
          <Field label="notes" value={form.notes} onChange={(v) => setForm((s) => ({ ...s, notes: v }))} className="col-span-12 md:col-span-4" />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            disabled={!canCreate && !editId}
            className={[
              "rounded-xl border px-4 py-2 text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition",
              canCreate || editId
                ? "border-pari-400/45 bg-pari-500/20 text-white shadow-[0_0_20px_rgba(0,199,177,0.12),inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-pari-300/50 hover:bg-pari-500/28"
                : "cursor-not-allowed border-white/[0.08] bg-white/[0.04] text-white/40",
            ].join(" ")}
            onClick={async () => {
              setError("");
              try {
                if (editId) {
                  await updateMapping(editId, form);
                } else {
                  await createMapping(form);
                }
                setForm({
                  email: "",
                  displayName: "",
                  backofficeUserId: "",
                  backofficeLogonName: "",
                  usedeskUserId: "",
                  usedeskEmail: "",
                  uisEmployeeId: "",
                  uisLogin: "",
                  notes: "",
                });
                setEditId(null);
                await reload();
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            {editId ? "Сохранить изменения" : "Сохранить"}
          </button>
        </div>
      </section>

      <section className={`mt-6 p-6 ${operatorSurface}`}>
        <div className="text-sm font-semibold tracking-tight text-white/90">Список</div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/60">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOnlyMissing.uis}
              onChange={(e) => setShowOnlyMissing((s) => ({ ...s, uis: e.target.checked }))}
              className="h-4 w-4 accent-[#00c7b1]"
            />
            Показать только без UIS
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOnlyMissing.bo}
              onChange={(e) => setShowOnlyMissing((s) => ({ ...s, bo: e.target.checked }))}
              className="h-4 w-4 accent-[#00c7b1]"
            />
            Показать только без Backoffice
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOnlyMissing.usedesk}
              onChange={(e) => setShowOnlyMissing((s) => ({ ...s, usedesk: e.target.checked }))}
              className="h-4 w-4 accent-[#00c7b1]"
            />
            Показать только без Usedesk
          </label>
        </div>
        <div className="mt-4 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="text-sm text-white/50">Пока пусто.</div>
          ) : (
            filteredItems.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-white/[0.08] bg-black/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{m.email}</div>
                    <div className="mt-1 text-xs text-white/50">
                      {m.displayName ? m.displayName : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-white/50 font-mono">#{m.id}</div>
                    <button
                      className="rounded-lg border border-white/[0.1] bg-white/[0.06] px-2 py-1 text-[11px] text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:bg-white/[0.1] hover:text-white"
                      onClick={() => {
                        setEditId(m.id);
                        setForm({
                          email: m.email,
                          displayName: m.displayName,
                          backofficeUserId: m.backofficeUserId,
                          backofficeLogonName: m.backofficeLogonName,
                          usedeskUserId: m.usedeskUserId,
                          usedeskEmail: m.usedeskEmail,
                          uisEmployeeId: m.uisEmployeeId,
                          uisLogin: m.uisLogin,
                          notes: m.notes,
                        });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      title="Скопировать в форму (для редактирования)"
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-lg border border-red-500/35 bg-red-950/35 px-2 py-1 text-[11px] text-red-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-red-400/40 hover:bg-red-950/45"
                      onClick={async () => {
                        if (!confirm(`Удалить маппинг для ${m.email}?`)) return;
                        setError("");
                        try {
                          await deleteMapping(m.id);
                          await reload();
                        } catch (e: unknown) {
                          setError(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3 text-xs text-white/60">
                  <div>Backoffice: {m.backofficeUserId || "—"} {m.backofficeLogonName ? `(${m.backofficeLogonName})` : ""}</div>
                  <div>Usedesk: {m.usedeskUserId || "—"} {m.usedeskEmail ? `(${m.usedeskEmail})` : ""}</div>
                  <div>UIS: {m.uisEmployeeId || "—"} {m.uisLogin ? `(${m.uisLogin})` : ""}</div>
                </div>
                {m.notes ? <div className="mt-2 text-xs text-white/50">{m.notes}</div> : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={props.className}>
      <div className="mb-1 text-xs text-white/60">{props.label}</div>
      <input
        className="w-full rounded-xl border border-white/[0.1] bg-black/35 px-4 py-3 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none ring-pari-500/20 placeholder:text-white/40 focus:ring-2"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

