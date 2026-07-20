import { useEffect, useState } from "react";
import {
  fetchKcFieldVisibility,
  updateKcFieldVisibility,
  type KcFieldVisibilityItem,
} from "../../lib/kcData";
import { KcCollapsiblePanel } from "./KcCollapsiblePanel";

type Props = {
  onSaved?: () => void;
};

export function KcFieldAccessPanel(props: Props) {
  const [items, setItems] = useState<KcFieldVisibilityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchKcFieldVisibility()
      .then((res) => {
        if (!cancelled) setItems(res.items);
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

  function toggle(fieldKey: string, role: "operator" | "supervisor", checked: boolean) {
    setItems((prev) =>
      prev.map((row) =>
        row.fieldKey === fieldKey
          ? {
              ...row,
              visibleOperator: role === "operator" ? checked : row.visibleOperator,
              visibleSupervisor: role === "supervisor" ? checked : row.visibleSupervisor,
            }
          : row,
      ),
    );
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updateKcFieldVisibility(items);
      setSaved(true);
      props.onSaved?.();
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KcCollapsiblePanel
      title="Доступ к полям"
      hint="Видимость полей для операторов и руководителей"
      defaultOpen={false}
    >
      <p className="text-xs text-white/50">
        Отметьте, какие поля видят операторы и руководители. Суперадмин всегда видит все данные.
      </p>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {saved ? <p className="mt-3 text-xs text-pari-300">Сохранено</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-white/45">Загрузка…</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wide text-white/40">
                <th className="pb-2 pr-4">Поле</th>
                <th className="pb-2 pr-4 text-center">Оператор</th>
                <th className="pb-2 text-center">Руководитель</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.fieldKey} className="border-b border-white/[0.05] last:border-0">
                  <td className="py-2.5 pr-4 text-white/85">{row.label}</td>
                  <td className="py-2.5 pr-4 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/20 bg-black/40 accent-pari-500"
                      checked={row.visibleOperator}
                      disabled={saving}
                      onChange={(e) => toggle(row.fieldKey, "operator", e.target.checked)}
                    />
                  </td>
                  <td className="py-2.5 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/20 bg-black/40 accent-pari-500"
                      checked={row.visibleSupervisor}
                      disabled={saving}
                      onChange={(e) => toggle(row.fieldKey, "supervisor", e.target.checked)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        className="mt-4 rounded-xl border border-pari-500/40 bg-pari-500/20 px-4 py-2 text-sm font-medium text-white hover:bg-pari-500/30 disabled:opacity-50"
        disabled={saving || loading}
        onClick={() => void handleSave()}
      >
        {saving ? "Сохранение…" : "Сохранить настройки"}
      </button>
    </KcCollapsiblePanel>
  );
}
