import type { JSX } from "react";

interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className }: BrandMarkProps): JSX.Element {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="6" r="4.5" fill="#C9742B" />
      <path
        d="M16 10.5V17M16 17H8V21.5M16 17H24V21.5"
        stroke="#C9742B"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="25" r="4" fill="#C9742B" />
      <circle cx="24" cy="25" r="4" fill="#C9742B" />
    </svg>
  );
}
