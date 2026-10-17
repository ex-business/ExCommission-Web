import type { ReactNode } from "react";

// 统一使用矢量线条图标，避免字符图标因系统字体不同而模糊或缺字。
export function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    plans: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5v1" />
      </>
    ),
    agents: (
      <>
        <rect x="9" y="3" width="6" height="5" rx="1" />
        <rect x="2" y="16" width="7" height="5" rx="1" />
        <rect x="15" y="16" width="7" height="5" rx="1" />
        <path d="M12 8v4M5.5 16v-4h13v4" />
      </>
    ),
    finance: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="M3 10h18M7 15h3M16 2v5" />
      </>
    ),
    reports: (
      <>
        <path d="M4 3v18h17M8 17v-5M13 17V7M18 17v-8" />
      </>
    ),
    system: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="9" cy="6" r="2" fill="white" />
        <circle cx="16" cy="12" r="2" fill="white" />
        <circle cx="8" cy="18" r="2" fill="white" />
      </>
    ),
    collapse: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16m7-12-4 4 4 4" />
      </>
    ),
    expand: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16m4-12 4 4-4 4" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
  };
  return (
    <svg
      className="navigation-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.plans}
    </svg>
  );
}
