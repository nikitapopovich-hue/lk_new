/** Загрузка Maps JavaScript API (один раз на вкладку). */
let loadPromise: Promise<void> | null = null;

export function loadGoogleMapsApi(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) {
    return Promise.reject(new Error("Google Maps API key is empty"));
  }
  if (typeof google !== "undefined" && google.maps) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=ru&region=RU`;
    script.onload = () => {
      if (typeof google !== "undefined" && google.maps) {
        resolve();
      } else {
        reject(new Error("Google Maps API failed to initialize"));
      }
    };
    script.onerror = () => reject(new Error("Google Maps script load error"));
    document.head.appendChild(script);
  });
  return loadPromise;
}
