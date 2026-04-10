import type { SVGProps } from 'react';

type IconName =
  | 'home'
  | 'orders'
  | 'coffee'
  | 'shisha'
  | 'wallet'
  | 'crown'
  | 'checkCircle'
  | 'users'
  | 'lifebuoy'
  | 'clock'
  | 'menu'
  | 'chart'
  | 'support'
  | 'building'
  | 'chevronRight'
  | 'spark'
  | 'phone'
  | 'lock'
  | 'dashboard';

type AppIconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  title?: string;
};

const baseProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function AppIcon({ name, title, className, ...props }: AppIconProps) {
  return (
    <svg
      {...baseProps}
      {...props}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      {renderPath(name)}
    </svg>
  );
}

function renderPath(name: IconName) {
  switch (name) {
    case 'home':
      return (
        <>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
          <path d="M9.5 20v-6h5v6" />
        </>
      );
    case 'orders':
      return (
        <>
          <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </>
      );
    case 'coffee':
      return (
        <>
          <path d="M6 8h8.5a2.5 2.5 0 0 1 0 5H13" />
          <path d="M7 8v5a4 4 0 0 0 4 4h1a4 4 0 0 0 4-4v-2" />
          <path d="M8 4.5c1 1 .9 2.1 0 3" />
          <path d="M11 3.5c1 1.2 1 2.7 0 4" />
          <path d="M5 20h14" />
        </>
      );
    case 'shisha':
      return (
        <>
          <path d="M8 4.5c1 1 .9 2.1 0 3" />
          <path d="M11 3.5c1 1.2 1 2.7 0 4" />
          <path d="M14 4.5c1 1 .9 2.1 0 3" />
          <path d="M12 7v4.5" />
          <path d="M9 11.5h6" />
          <path d="M10 11.5v3a2 2 0 0 0 4 0v-3" />
          <path d="M12 14.5V20" />
          <path d="M12 20h6a2 2 0 0 0 2-2v-1" />
          <path d="M8 20h8" />
        </>
      );
    case 'wallet':
      return (
        <>
          <path d="M4 8.5h16a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a3 3 0 0 1 3-3h10" />
          <path d="M16.5 13.5h.01" />
          <path d="M18 8.5V6a2 2 0 0 0-2-2H7" />
        </>
      );
    case 'crown':
      return (
        <>
          <path d="M4 17 6.5 7l5.5 5 5.5-5L20 17Z" />
          <path d="M4 20h16" />
          <circle cx="6.5" cy="6" r="1.5" />
          <circle cx="12" cy="10" r="1.5" />
          <circle cx="17.5" cy="6" r="1.5" />
        </>
      );
    case 'checkCircle':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.5 12 2.3 2.3 4.8-5" />
        </>
      );
    case 'users':
      return (
        <>
          <path d="M16.5 19v-1.5a3.5 3.5 0 0 0-3.5-3.5H8a3.5 3.5 0 0 0-3.5 3.5V19" />
          <circle cx="10.5" cy="8" r="3" />
          <path d="M17 14a3 3 0 0 1 3 3V19" />
          <path d="M16.5 5.5a2.5 2.5 0 1 1 0 5" />
        </>
      );
    case 'lifebuoy':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M8.8 8.8 6.2 6.2" />
          <path d="M15.2 8.8 17.8 6.2" />
          <path d="M8.8 15.2 6.2 17.8" />
          <path d="M15.2 15.2 17.8 17.8" />
        </>
      );
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5v5l3 2" />
        </>
      );
    case 'menu':
      return (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2.5" />
          <path d="M8 9h8" />
          <path d="M8 12h8" />
          <path d="M8 15h5" />
        </>
      );
    case 'chart':
      return (
        <>
          <path d="M5 19V9" />
          <path d="M12 19V5" />
          <path d="M19 19v-7" />
          <path d="M4 19h16" />
        </>
      );
    case 'support':
      return (
        <>
          <path d="M12 20a7 7 0 0 0 7-7V9a7 7 0 0 0-14 0v4a7 7 0 0 0 7 7Z" />
          <path d="M5 12H3.5A1.5 1.5 0 0 0 2 13.5v1A1.5 1.5 0 0 0 3.5 16H5" />
          <path d="M19 12h1.5a1.5 1.5 0 0 1 1.5 1.5v1a1.5 1.5 0 0 1-1.5 1.5H19" />
          <path d="M9 11h6" />
          <path d="M10 15h4" />
        </>
      );
    case 'building':
      return (
        <>
          <path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V20" />
          <path d="M9 8h2" />
          <path d="M13 8h2" />
          <path d="M9 12h2" />
          <path d="M13 12h2" />
          <path d="M10 20v-4h4v4" />
        </>
      );
    case 'chevronRight':
      return <path d="m9 6 6 6-6 6" />;
    case 'spark':
      return (
        <>
          <path d="m12 3 1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3L12 3Z" />
          <path d="M18.5 15.5 19.5 18l2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" />
        </>
      );
    case 'phone':
      return (
        <>
          <rect x="7" y="3" width="10" height="18" rx="2.5" />
          <path d="M10 6.5h4" />
          <path d="M11.5 17.5h1" />
        </>
      );
    case 'lock':
      return (
        <>
          <rect x="5" y="10" width="14" height="10" rx="2.5" />
          <path d="M8 10V7.5A4 4 0 0 1 12 3.5a4 4 0 0 1 4 4V10" />
        </>
      );
    case 'dashboard':
      return (
        <>
          <rect x="4" y="4" width="7" height="7" rx="1.75" />
          <rect x="13" y="4" width="7" height="11" rx="1.75" />
          <rect x="4" y="13" width="7" height="7" rx="1.75" />
          <rect x="13" y="17" width="7" height="3" rx="1.5" />
        </>
      );
    default:
      return null;
  }
}
