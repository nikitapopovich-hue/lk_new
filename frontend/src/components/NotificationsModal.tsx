import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  deleteAllArchivedNotifications,
  deleteArchivedNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../lib/notifications";

const panelSurface =
  "rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[rgba(6,11,38,0.96)] to-[rgba(26,31,55,0.96)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_rgba(0,0,0,0.45)]";

type Tab = "inbox" | "archive";

export function NotificationsModal(props: {
  open: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [tab, setTab] = useState<Tab>("inbox");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const inboxItems = useMemo(() => items.filter((i) => !i.read), [items]);
  const archiveItems = useMemo(() => items.filter((i) => i.read), [items]);
  const visibleItems = tab === "inbox" ? inboxItems : archiveItems;

  const syncUnread = useCallback(
    (list: NotificationItem[]) => {
      props.onUnreadChange?.(list.filter((i) => !i.read).length);
    },
    [props],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchNotifications();
      setItems(list);
      syncUnread(list);
      setSelectedArchiveIds(new Set());
    } catch (e: unknown) {
      setItems([]);
      syncUnread([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [syncUnread]);

  useEffect(() => {
    if (!props.open) return;
    void load();
  }, [props.open, load]);

  useEffect(() => {
    if (!props.open) {
      setTab("inbox");
      setExpandedId(null);
      setSelectedArchiveIds(new Set());
    }
  }, [props.open]);

  async function handleMarkRead(id: string) {
    setBusyId(id);
    setError("");
    try {
      await markNotificationRead(id);
      setItems((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
        syncUnread(next);
        return next;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    setError("");
    try {
      await markAllNotificationsRead();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMarkingAll(false);
    }
  }

  function removeFromList(ids: Set<string>) {
    setItems((prev) => {
      const next = prev.filter((n) => !ids.has(n.id));
      syncUnread(next);
      return next;
    });
    setSelectedArchiveIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (selectedArchiveIds.size === 0) return;
    setDeleting(true);
    setError("");
    try {
      await deleteArchivedNotifications([...selectedArchiveIds]);
      removeFromList(selectedArchiveIds);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteOne(id: string) {
    setBusyId(id);
    setError("");
    try {
      await deleteArchivedNotifications([id]);
      removeFromList(new Set([id]));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteAllArchive() {
    if (archiveItems.length === 0) return;
    setDeleting(true);
    setError("");
    try {
      await deleteAllArchivedNotifications();
      removeFromList(new Set(archiveItems.map((i) => i.id)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function toggleArchiveSelection(id: string) {
    setSelectedArchiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllArchive() {
    if (selectedArchiveIds.size === archiveItems.length) {
      setSelectedArchiveIds(new Set());
      return;
    }
    setSelectedArchiveIds(new Set(archiveItems.map((i) => i.id)));
  }

  if (!props.open) return null;

  const unread = inboxItems.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-[max(1rem,10vh)] backdrop-blur-sm sm:justify-end sm:pr-8 sm:pt-24"
      role="presentation"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-title"
        className={`w-full max-w-md p-5 ${panelSurface}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="notifications-title" className="text-lg font-semibold text-white">
              Оповещения
            </h2>
            <p className="mt-1 text-xs text-white/50">
              {tab === "inbox"
                ? unread > 0
                  ? `Непрочитанных: ${unread}`
                  : "Все сообщения просмотрены"
                : `В архиве: ${archiveItems.length}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {tab === "inbox" && unread > 0 ? (
              <button
                type="button"
                className="rounded-lg border border-pari-400/35 bg-pari-500/15 px-2 py-1 text-xs font-medium text-pari-200 hover:bg-pari-500/25 disabled:opacity-50"
                disabled={markingAll}
                onClick={() => void handleMarkAllRead()}
              >
                {markingAll ? "…" : "Прочитано всё"}
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
              onClick={props.onClose}
            >
              Закрыть
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-1 rounded-xl border border-white/[0.08] bg-black/25 p-1">
          <button
            type="button"
            className={[
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              tab === "inbox" ? "bg-pari-500/25 text-pari-100" : "text-white/55 hover:text-white/80",
            ].join(" ")}
            onClick={() => setTab("inbox")}
          >
            Входящие
            {unread > 0 ? (
              <span className="ml-1.5 inline-flex min-w-[1.1rem] justify-center rounded-full bg-pari-500/40 px-1 text-[10px]">
                {unread}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={[
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition",
              tab === "archive" ? "bg-white/10 text-white" : "text-white/55 hover:text-white/80",
            ].join(" ")}
            onClick={() => setTab("archive")}
          >
            Архив
            {archiveItems.length > 0 ? (
              <span className="ml-1.5 text-[10px] text-white/45">({archiveItems.length})</span>
            ) : null}
          </button>
        </div>

        {tab === "archive" && archiveItems.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
              onClick={toggleSelectAllArchive}
            >
              {selectedArchiveIds.size === archiveItems.length ? "Снять выделение" : "Выбрать все"}
            </button>
            {selectedArchiveIds.size > 0 ? (
              <button
                type="button"
                className="rounded-lg border border-red-400/30 bg-red-950/40 px-2 py-1 text-[11px] text-red-100 hover:bg-red-950/60 disabled:opacity-50"
                disabled={deleting}
                onClick={() => void handleDeleteSelected()}
              >
                {deleting ? "…" : `Удалить выбранные (${selectedArchiveIds.size})`}
              </button>
            ) : null}
            <button
              type="button"
              className="ml-auto rounded-lg border border-red-400/30 bg-red-950/40 px-2 py-1 text-[11px] text-red-100 hover:bg-red-950/60 disabled:opacity-50"
              disabled={deleting}
              onClick={() => void handleDeleteAllArchive()}
            >
              {deleting ? "…" : "Удалить все"}
            </button>
          </div>
        ) : null}

        <div className="scrollbar-pari mt-4 max-h-[min(24rem,60vh)] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <p className="py-8 text-center text-sm text-white/50">Загрузка…</p>
          ) : error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-100">{error}</p>
          ) : visibleItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/55">
              {tab === "inbox" ? "Новых оповещений нет" : "Архив пуст"}
            </p>
          ) : (
            visibleItems.map((n) => {
              const hasDetail = Boolean(n.detailBody?.trim());
              const expanded = expandedId === n.id;
              const inArchive = tab === "archive";

              return (
                <article
                  key={n.id}
                  className={[
                    "rounded-xl border px-3 py-3 text-sm",
                    inArchive
                      ? "border-white/[0.06] bg-black/20 text-white/80"
                      : "border-pari-400/25 bg-pari-500/10 text-white",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-2">
                    {inArchive ? (
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-pari-400"
                        checked={selectedArchiveIds.has(n.id)}
                        onChange={() => toggleArchiveSelection(n.id)}
                        aria-label="Выбрать для удаления"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{n.title}</h3>
                      <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-white/70">{n.body}</p>
                    </div>
                  </div>
                  {hasDetail && expanded ? (
                    <p className="mt-2 whitespace-pre-line rounded-lg border border-white/[0.06] bg-black/25 px-2 py-2 text-xs leading-relaxed text-white/65">
                      {n.detailBody}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {hasDetail ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-pari-300 hover:text-pari-200"
                        onClick={() => setExpandedId(expanded ? null : n.id)}
                      >
                        {expanded ? "Свернуть" : "Подробнее"}
                      </button>
                    ) : null}
                    {n.id === "remote-work-monthly" ? (
                      <Link
                        to="/profile"
                        className="text-xs font-medium text-pari-300 hover:text-pari-200"
                        onClick={props.onClose}
                      >
                        Перейти в профиль →
                      </Link>
                    ) : null}
                    {inArchive ? (
                      <button
                        type="button"
                        className="ml-auto rounded-lg border border-red-400/25 bg-red-950/30 px-2.5 py-1 text-xs text-red-100 hover:bg-red-950/50 disabled:opacity-50"
                        disabled={busyId === n.id || deleting}
                        onClick={() => void handleDeleteOne(n.id)}
                      >
                        {busyId === n.id ? "…" : "Удалить"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ml-auto rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 hover:bg-white/15 disabled:opacity-50"
                        disabled={busyId === n.id || markingAll}
                        onClick={() => void handleMarkRead(n.id)}
                      >
                        {busyId === n.id ? "…" : "Прочитано"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
