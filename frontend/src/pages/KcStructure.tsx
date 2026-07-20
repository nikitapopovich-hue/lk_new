import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KcStructureMap } from "../components/kc-structure/KcStructureMap";
import { fetchKcEmployees, type KcEmployeeRecord, type KcFieldLabel } from "../lib/kcData";
import { fetchKcStructure, type KcStructureResponse } from "../lib/kcStructure";

export function KcStructurePage() {
  const navigate = useNavigate();
  const [data, setData] = useState<KcStructureResponse | null>(null);
  const [kcEmployees, setKcEmployees] = useState<KcEmployeeRecord[]>([]);
  const [fieldLabels, setFieldLabels] = useState<KcFieldLabel[]>([]);
  const [departmentHints, setDepartmentHints] = useState<string[]>([]);
  const [subdivisionHints, setSubdivisionHints] = useState<string[]>([]);
  const [kcCanEdit, setKcCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [structure, kc] = await Promise.all([fetchKcStructure(), fetchKcEmployees("")]);
      setData(structure);
      setKcEmployees(kc.employees);
      setFieldLabels(kc.fieldLabels);
      setDepartmentHints(kc.departmentHints ?? []);
      setSubdivisionHints(kc.subdivisionHints ?? []);
      setKcCanEdit(kc.canEdit);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="kc-map-root flex items-center justify-center">
        <p className="text-sm text-white/50">Загрузка структуры…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="kc-map-root flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-red-300">{error}</p>
        <button
          type="button"
          className="kc-map-close"
          onClick={() => navigate("/kc-data")}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <KcStructureMap
      data={data}
      kcEmployees={kcEmployees}
      fieldLabels={fieldLabels}
      departmentHints={departmentHints}
      subdivisionHints={subdivisionHints}
      kcCanEdit={kcCanEdit}
      onChanged={() => void load(true)}
      onClose={() => navigate("/kc-data")}
    />
  );
}
