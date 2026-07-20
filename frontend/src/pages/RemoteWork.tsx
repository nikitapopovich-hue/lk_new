import { useEffect, useMemo, useState } from "react";
import { MagicSurface } from "../components/MagicBento";
import { operatorSurface } from "../components/operator/operatorTile";
import {
  REMOTE_WORK_FIELDS,
  fetchRemoteWorkList,
  formatRemoteWorkFieldValue,
  remoteWorkStatusClass,
  remoteWorkStatusLabel,
  type RemoteWorkListItem,
  type RemoteWorkStatus,
} from "../lib/profile";

const panel = `p-5 sm:p-6 ${operatorSurface}`;

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function RemoteWorkCard(props: { item: RemoteWorkListItem }) {
  const { item } = props;
  const updated = formatUpdatedAt(item.updatedAt);

  return (
    <article className="rounded-xl border border-white/[0.06] bg-black/15 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">{item.fullName}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${remoteWorkStatusClass(item.status)}`}>
            {remoteWorkStatusLabel(item.status)}
          </span>
          {updated ? <span className="text-[10px] text-white/35">Обновлено: {updated}</span> : null}
        </div>
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {REMOTE_WORK_FIELDS.map((field) => {
          const raw = item.remoteWork[field.key];
          const display = field.kind === "select" ? formatRemoteWorkFieldValue(field.key, raw) : raw.trim() || "—";
          return (
            <div key={field.key} className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-white/40">{field.label}</dt>
              <dd className="mt-1 break-words text-sm font-medium text-white/90">{display}</dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}

function groupByDepartment(items: RemoteWorkListItem[]): { department: string; items: RemoteWorkListItem[] }[] {
  const map = new Map<string, RemoteWorkListItem[]>();
  for (const item of items) {
    const dept = item.department.trim() || "Без отдела";
    const list = map.get(dept) ?? [];
    list.push(item);
    map.set(dept, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ru"))
    .map(([department, deptItems]) => ({
      department,
      items: deptItems.sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")),
    }));
}

export function RemoteWorkPage() {
  const [items, setItems] = useState<RemoteWorkListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchRemoteWorkList()
      .then((list) => {
        if (!cancelled) setItems(list);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.fullName.toLowerCase().includes(q) ||
        i.department.toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q) ||
        REMOTE_WORK_FIELDS.some((f) => String(i.remoteWork[f.key]).toLowerCase().includes(q)),
    );
  }, [items, query]);

  const grouped = useMemo(() => groupByDepartment(filtered), [filtered]);

  const counts = useMemo(() => {
    const by = (s: RemoteWorkStatus) => items.filter((i) => i.status === s).length;
    return { filled: by("filled"), stale: by("stale"), empty: by("empty") };
  }, [items]);

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-pari-400/90">Руководитель</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Удалённая работа</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">
          Анкеты из раздела «Профиль» — операторы и руководители заполняют данные о возможности работы из дома.
        </p>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">{error}</div>
      ) : null}

      <MagicSurface className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/60">
            {loading ? (
              "Загрузка…"
            ) : (
              <>
                Всего: <span className="font-medium text-white">{items.length}</span>
                {items.length > 0 ? (
                  <>
                    {" "}
                    · заполнено: <span className="font-medium text-pari-300">{counts.filled}</span>
                    {counts.stale > 0 ? (
                      <>
                        {" "}
                        · актуализация: <span className="font-medium text-red-300">{counts.stale}</span>
                      </>
                    ) : null}
                    {counts.empty > 0 ? (
                      <>
                        {" "}
                        · не заполнено: <span className="font-medium text-red-300/90">{counts.empty}</span>
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </p>
          <input
            type="search"
            placeholder="Поиск по ФИО, отделу или полям…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full max-w-xs rounded-xl border border-white/[0.1] bg-black/35 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:ring-2 focus:ring-pari-500/30"
          />
        </div>

        {loading ? (
          <p className="mt-8 text-center text-sm text-white/45">Загрузка анкет…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-center text-sm text-white/45">
            {items.length === 0
              ? "Пока никто не сохранял профиль. Данные появятся после заполнения раздела «Удалённая работа» в профиле."
              : "Ничего не найдено по запросу."}
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            {grouped.map((group) => (
              <section key={group.department}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-pari-300/90">
                  {group.department}
                </h2>
                <div className="space-y-4">
                  {group.items.map((item) => (
                    <RemoteWorkCard key={item.email} item={item} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </MagicSurface>
    </div>
  );
}
