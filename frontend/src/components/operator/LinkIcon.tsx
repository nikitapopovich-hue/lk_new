type LinkIconProps = {
  color?: string;
  size?: number;
};

export function LinkIcon({ color = "#00c7b1", size = 20 }: LinkIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 6H6a4 4 0 0 0 0 8h1"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 18h4a4 4 0 0 0 0-8h-1"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 15l6-6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
