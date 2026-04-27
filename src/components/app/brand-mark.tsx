// "The Overlap" — Dobeu Tech Solutions signature mark.
// Two indigo circles intersecting with a solid amber center disc, per
// docs/design-system/BRAND.md. Sizes default to 32px; scale via the
// `size` prop. Set `monochrome` to render a single-color silhouette
// for footers / favicons.

interface BrandMarkProps {
  size?: number;
  monochrome?: boolean;
  className?: string;
}

export function BrandMark({
  size = 32,
  monochrome = false,
  className,
}: BrandMarkProps) {
  const indigo = monochrome ? "currentColor" : "#6B5CE7";
  const indigoDeep = monochrome ? "currentColor" : "#4A3FA8";
  const amber = monochrome ? "currentColor" : "#F4A261";
  return (
    <svg
      viewBox="0 0 64 40"
      width={(size * 64) / 40}
      height={size}
      role="img"
      aria-label="Dobeu Tech Solutions"
      className={className}
    >
      <circle
        cx="22"
        cy="20"
        r="16"
        fill={indigo}
        opacity={monochrome ? 1 : 0.92}
      />
      <circle
        cx="42"
        cy="20"
        r="16"
        fill={indigoDeep}
        opacity={monochrome ? 1 : 0.92}
      />
      <circle cx="32" cy="20" r="6.5" fill={amber} />
    </svg>
  );
}
