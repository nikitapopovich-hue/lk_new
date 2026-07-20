import type { ReactNode } from "react";
import type { KpdMoodKey } from "./kpdMood";

type MoodIconProps = {
  variant: KpdMoodKey;
  color: string;
  size?: number;
  className?: string;
};

function FaceFrame({ color, size, children }: { color: string; size: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden
    >
      <circle cx="24" cy="24" r="19" stroke={color} strokeWidth="2.25" />
      {children}
    </svg>
  );
}

function Eye({ cx, color }: { cx: number; color: string }) {
  return <circle cx={cx} cy="19.5" r="2" fill={color} />;
}

function EyeLine({ x1, x2, y, color }: { x1: number; x2: number; y: number; color: string }) {
  return <path d={`M${x1} ${y} L${x2} ${y}`} stroke={color} strokeWidth="2.25" strokeLinecap="round" />;
}

export function MoodIcon({ variant, color, size = 44, className }: MoodIconProps) {
  const icon = (() => {
    switch (variant) {
      case "excellent":
        return (
          <FaceFrame color={color} size={size}>
            <Eye cx={17} color={color} />
            <Eye cx={31} color={color} />
            <path
              d="M14 28.5C17.5 35 30.5 35 34 28.5"
              stroke={color}
              strokeWidth="2.25"
              strokeLinecap="round"
            />
          </FaceFrame>
        );
      case "good":
        return (
          <FaceFrame color={color} size={size}>
            <Eye cx={17} color={color} />
            <Eye cx={31} color={color} />
            <path d="M16 30.5C19 33.5 29 33.5 32 30.5" stroke={color} strokeWidth="2.25" strokeLinecap="round" />
          </FaceFrame>
        );
      case "neutral":
        return (
          <FaceFrame color={color} size={size}>
            <Eye cx={17} color={color} />
            <Eye cx={31} color={color} />
            <path d="M16 31H32" stroke={color} strokeWidth="2.25" strokeLinecap="round" />
          </FaceFrame>
        );
      case "bad":
        return (
          <FaceFrame color={color} size={size}>
            <Eye cx={17} color={color} />
            <Eye cx={31} color={color} />
            <path d="M16 33.5C19 29.5 29 29.5 32 33.5" stroke={color} strokeWidth="2.25" strokeLinecap="round" />
          </FaceFrame>
        );
      case "veryBad":
        return (
          <FaceFrame color={color} size={size}>
            <EyeLine x1={14.5} x2={19.5} y={18.5} color={color} />
            <EyeLine x1={28.5} x2={33.5} y={18.5} color={color} />
            <path d="M15 34C18.5 30 29.5 30 33 34" stroke={color} strokeWidth="2.25" strokeLinecap="round" />
          </FaceFrame>
        );
    }
  })();

  return <span className={className}>{icon}</span>;
}
