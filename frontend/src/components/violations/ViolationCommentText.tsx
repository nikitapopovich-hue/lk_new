import type { MouseEvent } from "react";

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function hrefFor(url: string): string {
  return url.startsWith("www.") ? `https://${url}` : url;
}

function splitComment(text: string): { kind: "text" | "url"; value: string; trailing?: string }[] {
  const parts: { kind: "text" | "url"; value: string; trailing?: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ kind: "text", value: text.slice(last, index) });
    }
    const trail = raw.match(/[.,;:!?)]+$/)?.[0] ?? "";
    const url = trail ? raw.slice(0, -trail.length) : raw;
    if (url) {
      parts.push({ kind: "url", value: url, trailing: trail || undefined });
    } else {
      parts.push({ kind: "text", value: raw });
    }
    last = index + raw.length;
  }
  if (last < text.length) {
    parts.push({ kind: "text", value: text.slice(last) });
  }
  return parts;
}

type Props = {
  text: string;
  empty?: string;
  className?: string;
  /** Не открывать строку таблицы при клике по ссылке */
  stopRowClick?: boolean;
};

export function ViolationCommentText(props: Props) {
  const trimmed = props.text.trim();
  if (!trimmed) {
    return <>{props.empty ?? "—"}</>;
  }

  const parts = splitComment(props.text);
  const hasUrl = parts.some((p) => p.kind === "url");
  if (!hasUrl) {
    return <span className={props.className}>{props.text}</span>;
  }

  function onLinkClick(e: MouseEvent<HTMLAnchorElement>) {
    if (props.stopRowClick) e.stopPropagation();
  }

  return (
    <span className={props.className}>
      {parts.map((part, i) =>
        part.kind === "url" ? (
          <span key={i}>
            <a
              href={hrefFor(part.value)}
              target="_blank"
              rel="noopener noreferrer"
              className="vj-comment-link"
              onClick={onLinkClick}
            >
              {part.value}
            </a>
            {part.trailing ?? ""}
          </span>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </span>
  );
}
