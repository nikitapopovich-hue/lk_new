import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { largeProfilePictureUrl, type AuthUser } from "../lib/auth";
import { fetchNotifications } from "../lib/notifications";
import { BellIcon } from "./BellIcon";
import { NotificationsModal } from "./NotificationsModal";

export function OperatorHeaderActions(props: { me: AuthUser | null; meReady: boolean }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [badgeCount, setBadgeCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchNotifications()
      .then((items) => {
        if (cancelled) return;
        setBadgeCount(items.filter((i) => !i.read).length);
      })
      .catch(() => {
        if (!cancelled) setBadgeCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

  function onUnreadChange(count: number) {
    setBadgeCount(count);
  }

  const picture = largeProfilePictureUrl(props.me?.pictureUrl, 256);
  const initials = (props.me?.givenName?.[0] ?? props.me?.displayName?.[0] ?? "?").toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-pari-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-pari-400/35 hover:bg-white/10 hover:text-pari-200"
        aria-label={badgeCount > 0 ? `Оповещения: ${badgeCount}` : "Оповещения"}
        onClick={() => setModalOpen(true)}
      >
        <BellIcon className="h-5 w-5" />
        {badgeCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pari-500 px-1 text-[10px] font-bold leading-none text-[#020515] ring-2 ring-[#020515]">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        ) : null}
      </button>

      <Link
        to="/profile"
        className="relative block h-10 w-10 shrink-0 rounded-full p-[2px] shadow-[0_0_16px_rgba(0,199,177,0.25)] transition hover:opacity-90"
        style={{
          background: "linear-gradient(135deg, #00c7b1 0%, #753bbd 100%)",
        }}
        title={props.me?.email ? `${props.me.email} — профиль` : "Профиль"}
        aria-label="Перейти в профиль"
      >
        {props.meReady && picture ? (
          <img
            src={picture}
            alt=""
            className="h-full w-full rounded-full object-cover bg-[#1a1f37]"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-full bg-[#1a1f37] text-sm font-semibold text-white/90">
            {props.meReady ? initials : "…"}
          </span>
        )}
      </Link>

      <NotificationsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onUnreadChange={onUnreadChange}
      />
    </div>
  );
}
