/** Колокольчик в стиле интерфейса (бирюзовый контур). */
export function BellIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={props.className}
      aria-hidden
    >
      <path
        d="M12 3.25c-2.21 0-4 1.79-4 4v2.1c0 .58-.22 1.14-.62 1.56l-1.2 1.28A1.25 1.25 0 0 0 7.1 14.5h9.8a1.25 1.25 0 0 0 .92-2.11l-1.2-1.28a2.2 2.2 0 0 1-.62-1.56V7.25c0-2.21-1.79-4-4-4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 17.25a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
