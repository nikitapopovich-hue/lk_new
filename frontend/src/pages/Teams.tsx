import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bulkDeleteTeams,
  createTeam,
  deleteTeam,
  listTeams,
  updateTeam,
  type Team,
} from "../lib/teams";
import { fetchKcEmployees, type KcEmployeeRecord } from "../lib/kcData";

type MemberPickerProps = {
  employees: KcEmployeeRecord[];
  query: string;
  onQueryChange: (v: string) => void;
  selectedKcIds: Record<number, boolean>;
  onToggle: (id: number, checked: boolean) => void;
};

function MemberPicker({ employees, query, onQueryChange, selectedKcIds, onToggle }: MemberPickerProps) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => {
      const d = e.data ?? {};
      const hay = [
        e.id,
        d.fullName,
        d.department,
        d.subdivision,
        d.position,
        d.emailNew,
        d.city,
        d.line,
      ]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [employees, query]);

  const selectedCount = useMemo(
    () => Object.keys(selectedKcIds).filter((k) => selectedKcIds[Number(k)]).length,
    [selectedKcIds],
  );

  return (
    <>
      <input
        className="col-span-12 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40"
        placeholder="Поиск сотрудника (ФИО / подразделение / email)"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <div className="col-span-12 rounded-2xl border border-white/10 bg-black/10 p-2">
        <div className="max-h-72 overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-white/50">Нет совпадений.</div>
          ) : (
            filtered.map((e) => {
              const d = e.data ?? {};
              const on = !!selectedKcIds[e.id];
              return (
                <label
                  key={e.id}
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-xl px-3 py-2 hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/90">{d.fullName || `ID ${e.id}`}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-white/50">
                      {d.department ? <span>{d.department}</span> : null}
                      {d.subdivision ? <span>• {d.subdivision}</span> : null}
                      {d.position ? <span>• {d.position}</span> : null}
                      {d.emailNew ? <span>• {d.emailNew}</span> : null}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(ev) => onToggle(e.id, ev.target.checked)}
                    className="h-4 w-4 accent-[#00c7b1]"
                  />
                </label>
              );
            })
          )}
        </div>
        <div className="mt-2 px-3 pb-2 text-xs text-white/50">
          Выбрано: <span className="font-mono">{selectedCount}</span>
        </div>
      </div>
    </>
  );
}

function kcIdsFromRecord(selected: Record<number, boolean>): number[] {
  return Object.keys(selected)
    .map(Number)
    .filter((id) => selected[id]);
}

function memberLabel(employees: KcEmployeeRecord[], kcIds: number[]): string {
  if (!kcIds.length) return "—";
  const byId = new Map(employees.map((e) => [e.id, e]));
  return kcIds
    .map((id) => {
      const e = byId.get(id);
      return e?.data?.fullName?.trim() || `#${id}`;
    })
    .join(", ");
}

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [employees, setEmployees] = useState<KcEmployeeRecord[]>([]);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [selectedTeamIds, setSelectedTeamIds] = useState<Record<number, boolean>>({});
  const [editing, setEditing] = useState<Team | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuery, setEditQuery] = useState("");
  const [editSelected, setEditSelected] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setError("");
    try {
      const [t, kc] = await Promise.all([listTeams(), fetchKcEmployees()]);
      setTeams(t);
      setEmployees(kc.employees ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectedTeamIdList = useMemo(
    () => Object.keys(selectedTeamIds).map(Number).filter((id) => selectedTeamIds[id]),
    [selectedTeamIds],
  );

  const allTeamsSelected = teams.length > 0 && selectedTeamIdList.length === teams.length;

  function openEdit(team: Team) {
    setEditing(team);
    setEditName(team.name);
    setEditQuery("");
    const sel: Record<number, boolean> = {};
    for (const id of team.memberKcEmployeeIds ?? []) {
      sel[id] = true;
    }
    setEditSelected(sel);
  }

  function closeEdit() {
    setEditing(null);
    setEditName("");
    setEditQuery("");
    setEditSelected({});
  }

  return (
    <div className="min-w-0">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm text-white/60">Руководитель</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">Команды</div>
          <p className="mt-2 max-w-2xl text-sm text-white/50">
            Создавайте команды из сотрудников справочника «Данные КЦ». На дашборде можно выбрать команду и
            смотреть статистику только по её участникам.
          </p>
        </div>
      </header>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div className="text-sm font-medium text-white/80">Создать команду</div>
        <div className="mt-4 grid grid-cols-12 gap-3">
          <input
            className="col-span-12 md:col-span-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40"
            placeholder="Название команды"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <MemberPicker
            employees={employees}
            query={query}
            onQueryChange={setQuery}
            selectedKcIds={selected}
            onToggle={(id, checked) => setSelected((s) => ({ ...s, [id]: checked }))}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={busy}
            className="rounded-2xl border border-pari-500/50 bg-pari-500/15 px-4 py-2 text-sm text-white hover:bg-pari-500/20 disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await createTeam({
                  name: name.trim() || "Новая команда",
                  memberKcEmployeeIds: kcIdsFromRecord(selected),
                });
                setName("");
                setSelected({});
                setQuery("");
                await reload();
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Создать
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm font-medium text-white/80">Список команд</div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedTeamIdList.length > 0 ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-2xl border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-100 hover:bg-red-950/50 disabled:opacity-50"
                onClick={async () => {
                  if (!window.confirm(`Удалить выбранные команды (${selectedTeamIdList.length})?`)) return;
                  setBusy(true);
                  setError("");
                  try {
                    await bulkDeleteTeams(selectedTeamIdList);
                    setSelectedTeamIds({});
                    await reload();
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Удалить выбранные ({selectedTeamIdList.length})
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
              onClick={() => void reload()}
            >
              Обновить
            </button>
          </div>
        </div>

        {teams.length > 0 ? (
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              checked={allTeamsSelected}
              onChange={(e) => {
                if (!e.target.checked) {
                  setSelectedTeamIds({});
                  return;
                }
                const next: Record<number, boolean> = {};
                for (const t of teams) next[Number(t.id)] = true;
                setSelectedTeamIds(next);
              }}
              className="h-4 w-4 accent-[#00c7b1]"
            />
            Выбрать все
          </label>
        ) : null}

        <div className="mt-4 space-y-3">
          {teams.length === 0 ? (
            <div className="text-sm text-white/50">Пока нет команд.</div>
          ) : (
            teams.map((t) => {
              const tid = Number(t.id);
              const kcIds = t.memberKcEmployeeIds ?? [];
              return (
                <div key={t.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={!!selectedTeamIds[tid]}
                        onChange={(e) =>
                          setSelectedTeamIds((s) => ({ ...s, [tid]: e.target.checked }))
                        }
                        className="mt-1 h-4 w-4 accent-[#00c7b1]"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{t.name}</div>
                        <div className="mt-1 text-xs text-white/50">
                          Участников: {kcIds.length || t.memberUserIds.length}
                        </div>
                      </div>
                    </label>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
                        onClick={() => openEdit(t)}
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-xl border border-red-500/30 bg-red-950/20 px-3 py-1.5 text-xs text-red-100 hover:bg-red-950/40 disabled:opacity-50"
                        onClick={async () => {
                          if (!window.confirm(`Удалить команду «${t.name}»?`)) return;
                          setBusy(true);
                          setError("");
                          try {
                            await deleteTeam(t.id);
                            setSelectedTeamIds((s) => {
                              const next = { ...s };
                              delete next[tid];
                              return next;
                            });
                            await reload();
                          } catch (e: unknown) {
                            setError(e instanceof Error ? e.message : String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-white/60">{memberLabel(employees, kcIds)}</div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl border border-white/10 bg-[#0f1419] p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-edit-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div id="team-edit-title" className="text-lg font-semibold">
                  Редактировать команду
                </div>
                <div className="mt-1 text-xs text-white/50">ID {editing.id}</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-white/10 px-3 py-1 text-sm text-white/70 hover:bg-white/5"
                onClick={closeEdit}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-12 gap-3">
              <input
                className="col-span-12 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Название команды"
              />
              <MemberPicker
                employees={employees}
                query={editQuery}
                onQueryChange={setEditQuery}
                selectedKcIds={editSelected}
                onToggle={(id, checked) => setEditSelected((s) => ({ ...s, [id]: checked }))}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
                onClick={closeEdit}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-2xl border border-pari-500/50 bg-pari-500/15 px-4 py-2 text-sm text-white hover:bg-pari-500/20 disabled:opacity-50"
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await updateTeam(editing.id, {
                      name: editName.trim() || editing.name,
                      memberKcEmployeeIds: kcIdsFromRecord(editSelected),
                    });
                    closeEdit();
                    await reload();
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
