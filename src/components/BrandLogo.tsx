interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <span className={`brand-mark ${className}`.trim()} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
