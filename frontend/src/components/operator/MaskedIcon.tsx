type MaskedIconProps = {
  src: string;
  color: string;
  size?: number;
  className?: string;
  title?: string;
};

/** Линейная иконка PNG → заливка цветом через mask (фирменный стиль). */
export function MaskedIcon({ src, color, size = 40, className = "", title }: MaskedIconProps) {
  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      className={`inline-block shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
