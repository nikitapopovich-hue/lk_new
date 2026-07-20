import { useEffect, useState } from "react";

const STORAGE_KEY = "lk.sidebar.collapsed";

export function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Синхронизация с классом на .shell-layout (свёрнутое боковое меню). */
export function useShellSidebarCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);

  useEffect(() => {
    const sync = () => {
      const layout = document.querySelector(".shell-layout");
      setCollapsed(layout?.classList.contains("shell-layout--sidebar-collapsed") ?? readSidebarCollapsed());
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("storage", sync);
    return () => {
      obs.disconnect();
      window.removeEventListener("storage", sync);
    };
  }, []);

  return collapsed;
}
