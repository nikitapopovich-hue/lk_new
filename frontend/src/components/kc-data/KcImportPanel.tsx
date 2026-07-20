import { useRef, useState } from "react";
import { authHeaders, getApiBase } from "../../lib/auth";
import { fetchWithTimeout } from "../../lib/http";
import { KcCollapsiblePanel } from "./KcCollapsiblePanel";

type Props = {
  onImported: () => void;
};

export function KcImportPanel(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function downloadTemplate() {
    setDownloading(true);
    setError("");
    try {
      const resp = await fetchWithTimeout(
        `${getApiBase()}/kc-data/template`,
        { headers: authHeaders() },
        30_000,
      );
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(text.slice(0, 200) || `Ошибка ${resp.status}`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "shablon-dannye-kc.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData();
      form.append("file", file);
      const headers = authHeaders();
      const resp = await fetchWithTimeout(
        `${getApiBase()}/kc-data/import`,
        { method: "POST", headers, body: form },
        180_000,
      );
      const text = await resp.text().catch(() => "");
      if (!resp.ok) {
        let msg = text.slice(0, 300);
        try {
          const j = JSON.parse(text) as { detail?: string | { msg?: string }[] };
          if (typeof j.detail === "string") msg = j.detail;
          else if (Array.isArray(j.detail) && j.detail[0] && typeof j.detail[0] === "object") {
            const first = j.detail[0] as { msg?: string };
            if (first.msg) msg = first.msg;
          }
        } catch {
          /* ignore */
        }
        if (resp.status >= 500 && msg === "Internal Server Error") {
          msg = "Сервер не смог обработать файл. Проверьте формат шаблона и логи API.";
        }
        throw new Error(msg || `Ошибка ${resp.status}`);
      }
      const data = JSON.parse(text) as { imported?: number; message?: string };
      setSuccess(data.message ?? `Загружено: ${data.imported ?? 0}`);
      props.onImported();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <KcCollapsiblePanel
      title="Импорт сотрудников"
      hint="Шаблон Excel и загрузка справочника"
      defaultOpen={false}
    >
      <p className="text-xs leading-relaxed text-white/50">
        Скачайте шаблон Excel: вкладка «Шаблон» — для загрузки, вкладка «Актуальный список» — сотрудники,
        уже на сайте. При загрузке новые сотрудники добавляются, а у существующих заполняются только пустые
        поля. Фото, Express ID и уже внесённые данные не перезаписываются.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-xl border border-pari-500/40 bg-pari-500/20 px-4 py-2 text-sm font-medium text-white hover:bg-pari-500/30 disabled:opacity-50"
          disabled={downloading || uploading}
          onClick={() => void downloadTemplate()}
        >
          {downloading ? "Скачивание…" : "Скачать шаблон (.xlsx)"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50"
          disabled={uploading || downloading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Загрузка…" : "Загрузить файл"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
          }}
        />
      </div>

      {success ? <p className="mt-3 text-sm text-pari-300">{success}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </KcCollapsiblePanel>
  );
}
