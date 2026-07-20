/** Базовый URL API. В production при пустом VITE_API_BASE_URL — тот же хост (единый сервер). */
export function getApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured !== undefined && configured.trim() !== "") {
    return configured.trim().replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "http://127.0.0.1:1121";
  }
  return "";
}
