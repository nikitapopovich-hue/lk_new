import { useCallback, useEffect, useMemo, useState } from "react";
import { MagicSpotlightShell, MagicSurface } from "../components/MagicBento";
import { ChromaGrid } from "../components/kc-data/ChromaGrid";
import { KcEmployeeModal } from "../components/kc-data/KcEmployeeModal";
import { KcEmployeesMap } from "../components/kc-data/KcEmployeesMap";
import { KcEmployeesTable } from "../components/kc-data/KcEmployeesTable";
import { KcFieldAccessPanel } from "../components/kc-data/KcFieldAccessPanel";
import { KcImportPanel } from "../components/kc-data/KcImportPanel";
import { KcListSectionToggle } from "../components/kc-data/KcListSectionToggle";
import { KcViewModeToggle, type KcViewMode } from "../components/kc-data/KcViewModeToggle";
import "../components/kc-data/KcEmployeesToolbar.css";
import { operatorSurface } from "../components/operator/operatorTile";
import { getRole } from "../lib/role";
import {
  deleteKcEmployees,
  fetchKcEmployees,
  fetchKcResidenceGeo,
  groupKcCardsByDepartment,
  type ChromaCardDto,
  type KcEmployeeRecord,
  type KcFieldLabel,
  type KcResidenceGeoPoint,
} from "../lib/kcData";
import type { KcOfficeLocation } from "../lib/kcOfficeLocations";
import {
  filterCardsByListSection,
  filterEmployeesByListSection,
  type KcListSection,
} from "../lib/kcListSection";
import { filterCardsByEmployeeIds, rankEmployeesByQuery } from "../lib/kcSmartSearch";

const panel = `p-5 sm:p-6 ${operatorSurface}`;
const VIEW_MODE_KEY = "kc-view-mode";
const LIST_SECTION_KEY = "kc-list-section";

function loadListSection(): KcListSection {
  try {
    const v = localStorage.getItem(LIST_SECTION_KEY);
    if (v === "maternity" || v === "dismissed") return v;
    return "active";
  } catch {
    return "active";
  }
}

function loadViewMode(): KcViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === "table" || v === "map") return v;
    return "cards";
  } catch {
    return "cards";
  }
}

export function KcDataPage() {
  const role = getRole();
  const isSuperadmin = role === "superadmin";
  const isSupervisorOrAdmin = role === "superadmin" || role === "supervisor";
  const canToggleView = isSupervisorOrAdmin;
  const showOfficeDistance = isSupervisorOrAdmin;

  const [employees, setEmployees] = useState<KcEmployeeRecord[]>([]);
  const [cards, setCards] = useState<ChromaCardDto[]>([]);
  const [fieldLabels, setFieldLabels] = useState<KcFieldLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [departmentHints, setDepartmentHints] = useState<string[]>([]);
  const [subdivisionHints, setSubdivisionHints] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<KcViewMode>(loadViewMode);
  const [listSection, setListSection] = useState<KcListSection>(loadListSection);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [distanceByEmployeeId, setDistanceByEmployeeId] = useState<Record<number, number | null>>({});
  const [geoPointsByEmployeeId, setGeoPointsByEmployeeId] = useState<Record<number, KcResidenceGeoPoint>>({});
  const [mapOffices, setMapOffices] = useState<KcOfficeLocation[]>([]);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchKcEmployees("");
      setEmployees(data.employees);
      setCards(data.cards);
      setFieldLabels(data.fieldLabels);
      setCanEdit(data.canEdit);
      setDepartmentHints(data.departmentHints ?? []);
      setSubdivisionHints(data.subdivisionHints ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const needGeo = showOfficeDistance && (viewMode === "table" || viewMode === "map");
    if (!needGeo) return;
    const items = employees
      .filter((e) => (e.data.residenceAddress ?? "").trim())
      .map((e) => ({
        employeeId: e.id,
        city: e.data.city ?? "",
        address: e.data.residenceAddress ?? "",
      }));
    if (items.length === 0) {
      setDistanceByEmployeeId({});
      setGeoPointsByEmployeeId({});
      setMapOffices([]);
      setGoogleMapsApiKey("");
      return;
    }
    let cancelled = false;
    setGeoLoading(true);
    void fetchKcResidenceGeo(items)
      .then((result) => {
        if (cancelled) return;
        setDistanceByEmployeeId(result.distances);
        setGeoPointsByEmployeeId(result.points);
        setMapOffices(result.offices);
        setGoogleMapsApiKey(result.googleMapsApiKey);
      })
      .catch(() => {
        if (cancelled) return;
        setDistanceByEmployeeId({});
        setGeoPointsByEmployeeId({});
        setMapOffices([]);
        setGoogleMapsApiKey("");
      })
      .finally(() => {
        if (!cancelled) setGeoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employees, showOfficeDistance, viewMode]);

  const sectionCounts = useMemo(
    () => ({
      active: filterEmployeesByListSection(employees, "active").length,
      maternity: filterEmployeesByListSection(employees, "maternity").length,
      dismissed: filterEmployeesByListSection(employees, "dismissed").length,
    }),
    [employees],
  );

  const sectionEmployees = useMemo(
    () => filterEmployeesByListSection(employees, listSection),
    [employees, listSection],
  );

  const filteredEmployees = useMemo(
    () => rankEmployeesByQuery(sectionEmployees, query),
    [sectionEmployees, query],
  );

  const filteredIdSet = useMemo(
    () => new Set(filteredEmployees.map((e) => e.id)),
    [filteredEmployees],
  );

  const sectionCards = useMemo(
    () => filterCardsByListSection(cards, listSection),
    [cards, listSection],
  );

  const filteredCards = useMemo(
    () => filterCardsByEmployeeIds(sectionCards, filteredIdSet),
    [sectionCards, filteredIdSet],
  );

  const grouped = useMemo(() => groupKcCardsByDepartment(filteredCards), [filteredCards]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? null,
    [employees, selectedId],
  );

  const modalOpen = selectedId != null || createOpen;
  const createMode = createOpen && selectedId == null;
  const selectionMode = isSuperadmin;

  function closeModal() {
    setSelectedId(null);
    setCreateOpen(false);
  }

  function setListSectionPersist(section: KcListSection) {
    setListSection(section);
    setSelectedIds(new Set());
    try {
      localStorage.setItem(LIST_SECTION_KEY, section);
    } catch {
      /* ignore */
    }
  }

  function setViewModePersist(mode: KcViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const visibleIds = filteredEmployees.map((e) => e.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Удалить выбранных сотрудников (${ids.length})?`)) return;
    setDeleting(true);
    setError("");
    try {
      await deleteKcEmployees(ids);
      setSelectedIds(new Set());
      if (selectedId != null && ids.includes(selectedId)) closeModal();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  const openEmployee = useCallback((id: number) => {
    setCreateOpen(false);
    setSelectedId(id);
  }, []);

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Данные КЦ</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/50">
          Справочник сотрудников контакт-центра. Выберите карточку или строку, чтобы открыть подробности.
        </p>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">{error}</div>
      ) : null}

      {isSuperadmin ? (
        <>
          <KcImportPanel onImported={() => void load()} />
          <KcFieldAccessPanel onSaved={() => void load()} />
        </>
      ) : null}

      <MagicSurface className={panel}>
        <div className="kc-employees-toolbar">
          <div className="kc-employees-toolbar__row kc-employees-toolbar__row--primary">
            <p className="kc-employees-toolbar__count">
              {loading ? (
                "Загрузка…"
              ) : (
                <>
                  Сотрудников: <strong>{filteredEmployees.length}</strong>
                  {query.trim() || listSection !== "active" ? (
                    <span className="kc-employees-toolbar__count-sub">
                      из {sectionEmployees.length}
                      {listSection === "active" && (sectionCounts.maternity > 0 || sectionCounts.dismissed > 0)
                        ? ` (всего ${employees.length})`
                        : ""}
                    </span>
                  ) : null}
                </>
              )}
            </p>
            <div className="kc-employees-toolbar__search-group">
              <input
                type="search"
                placeholder="Поиск"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="kc-employees-toolbar__search"
                aria-label="Поиск сотрудников"
              />
              {isSuperadmin ? (
                <button
                  type="button"
                  className="kc-employees-toolbar__add"
                  onClick={() => {
                    setSelectedId(null);
                    setCreateOpen(true);
                  }}
                >
                  + Сотрудник
                </button>
              ) : null}
            </div>
          </div>
          <div className="kc-employees-toolbar__row kc-employees-toolbar__row--secondary">
            <KcListSectionToggle
              value={listSection}
              counts={sectionCounts}
              onChange={setListSectionPersist}
            />
            {canToggleView ? <KcViewModeToggle value={viewMode} onChange={setViewModePersist} /> : null}
          </div>
        </div>

        {isSuperadmin && selectedIds.size > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2">
            <span className="text-xs text-white/70">Выбрано: {selectedIds.size}</span>
            <button
              type="button"
              className="rounded-lg border border-red-500/40 bg-red-500/20 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-500/30 disabled:opacity-50"
              disabled={deleting}
              onClick={() => void handleBulkDelete()}
            >
              {deleting ? "Удаление…" : "Удалить выбранных"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
              onClick={() => setSelectedIds(new Set())}
            >
              Снять выделение
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="mt-10 text-center text-sm text-white/45">Загрузка…</p>
        ) : filteredEmployees.length === 0 ? (
          <p className="mt-10 text-center text-sm text-white/45">Сотрудники не найдены.</p>
        ) : viewMode === "table" && canToggleView ? (
          <div className="kc-employees-view--table">
          <KcEmployeesTable
            employees={filteredEmployees}
            fieldLabels={fieldLabels}
            selectedIds={selectedIds}
            selectionMode={selectionMode}
            showOfficeDistance={showOfficeDistance}
            distanceByEmployeeId={distanceByEmployeeId}
            distancesLoading={geoLoading}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAllVisible}
            onRowClick={openEmployee}
          />
          </div>
        ) : viewMode === "map" && canToggleView ? (
          <KcEmployeesMap
            employees={filteredEmployees}
            points={geoPointsByEmployeeId}
            offices={mapOffices}
            loading={geoLoading}
            googleMapsApiKey={googleMapsApiKey}
            onEmployeeClick={openEmployee}
          />
        ) : (
          <MagicSpotlightShell glowColor="0, 199, 177" clickEffect enableSpotlight defaultEnableStars>
            <div className="mt-8 space-y-10">
              {grouped.map((deptSection) => (
                <section key={deptSection.department}>
                  <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-pari-300/90">
                    {deptSection.department}
                  </h2>
                  <div className="space-y-8">
                    {deptSection.subdivisions.map((sub) => (
                      <div key={`${deptSection.department}-${sub.name || "__none"}`}>
                        {sub.name ? (
                          <h3 className="mb-3 pl-1 text-xs font-medium uppercase tracking-wide text-white/45">
                            {sub.label}
                          </h3>
                        ) : null}
                        <ChromaGrid
                          items={sub.cards.map((c) => ({
                            id: c.id,
                            image: c.image,
                            fullName: c.fullName,
                            city: c.city,
                            position: c.position,
                            line: c.line,
                            telegramUsername: c.telegramUsername,
                            expressId: c.expressId,
                            emailNew: c.emailNew,
                            onMaternityLeave: c.onMaternityLeave,
                            isDismissed: c.isDismissed,
                          }))}
                          selectionMode={selectionMode}
                          selectedIds={selectedIds}
                          onToggleSelect={toggleSelect}
                          onCardClick={openEmployee}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </MagicSpotlightShell>
        )}
      </MagicSurface>

      <KcEmployeeModal
        open={modalOpen}
        createMode={createMode}
        employee={createMode ? null : selectedEmployee}
        fieldLabels={fieldLabels}
        canEdit={canEdit}
        departmentHints={departmentHints}
        subdivisionHints={subdivisionHints}
        onClose={closeModal}
        onSaved={(employee) => {
          setCreateOpen(false);
          setSelectedId(employee.id);
          void load();
        }}
      />
    </div>
  );
}
