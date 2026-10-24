import type { ReactNode } from 'react';

export type AdminIconName =
  | 'home'
  | 'orders'
  | 'package'
  | 'layers'
  | 'basket'
  | 'sparkles'
  | 'users'
  | 'megaphone'
  | 'chart'
  | 'plug'
  | 'settings'
  | 'search'
  | 'menu'
  | 'close'
  | 'chevron'
  | 'arrow'
  | 'chevrons'
  | 'external';
export function AdminIcon({ name, size = 19 }: { name: AdminIconName; size?: number }) {
  const paths: Record<AdminIconName, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v12h14V9M9 21v-7h6v7" />
      </>
    ),
    orders: (
      <>
        <rect x="4" y="4" width="16" height="17" rx="2" />
        <path d="M8 3v3m8-3v3M8 11h8m-8 5h6" />
      </>
    ),
    package: (
      <>
        <path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10" />
      </>
    ),
    layers: (
      <>
        <path d="m12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5" />
      </>
    ),
    basket: (
      <>
        <path d="m5 10 4-7m10 7-4-7M3 10h18l-2 11H5zM8 14v4m8-4v4" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5v1" />
      </>
    ),
    megaphone: (
      <>
        <path d="M3 11v3h4l11 5V6L7 11zM7 14l2 7h3l-2-6M20 9v7" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18M7 17v-4m5 4V8m5 9v-7" />
      </>
    ),
    plug: (
      <>
        <path d="M8 3v6m8-6v6M6 9h12v3a6 6 0 0 1-12 0zM12 18v4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M10 2h4l1 3 3 1 3-1 2 4-2 2v2l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-2l-2-2 2-4 3 1 3-1z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    close: (
      <>
        <path d="M5 5l14 14M19 5 5 19" />
      </>
    ),
    chevron: (
      <>
        <path d="m9 5 7 7-7 7" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    chevrons: (
      <>
        <path d="m11 5-7 7 7 7m8-14-7 7 7 7" />
      </>
    ),
    external: (
      <>
        <path d="M13 5h6v6m0-6-9 9M19 14v5H5V5h6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
