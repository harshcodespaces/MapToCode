"use client";

import React from "react";
import type { MobileMode } from "./MobileHeader";
import styles from "./MobileWorkspace.module.css";

interface MobileBottomNavProps {
  activeMode: MobileMode;
  onChange: (mode: MobileMode) => void;
}

const items: Array<{
  mode: MobileMode;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    mode: "files",
    label: "Files",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2h6.5A1.5 1.5 0 0 1 20 7.5v10A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
        <path d="M4 8h16" />
      </svg>
    ),
  },
  {
    mode: "canvas",
    label: "Canvas",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
        <path d="M10 7h4a2 2 0 0 1 2 2v5M7 10v4a2 2 0 0 0 2 2h5" />
      </svg>
    ),
  },
  {
    mode: "code",
    label: "Code",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
      </svg>
    ),
  },
  {
    mode: "run",
    label: "Run",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 5 12 7-12 7z" />
      </svg>
    ),
  },
];

export default function MobileBottomNav({
  activeMode,
  onChange,
}: MobileBottomNavProps): React.JSX.Element {
  return (
    <nav
      className={styles.bottomNav}
      aria-label="Mobile workspace navigation"
    >
      {items.map((item) => {
        const active = activeMode === item.mode;

        return (
          <button
            key={item.mode}
            type="button"
            className={`${styles.navItem} ${
              active ? styles.navItemActive : ""
            }`}
            onClick={() => onChange(item.mode)}
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}