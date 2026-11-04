import type { ReactNode } from 'react'
import type { Route } from '../useHashRoute'

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
} as const

const TABS: { route: Route; label: string; icon: ReactNode }[] = [
  {
    route: 'ranking',
    label: 'Ranking',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
      </svg>
    ),
  },
  {
    route: 'gra',
    label: 'Gra',
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M12 4v16M3 12h18" />
      </svg>
    ),
  },
  {
    route: 'historia',
    label: 'Historia',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    route: 'gracze',
    label: 'Gracze',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2A6.5 6.5 0 0 1 21.5 20" />
      </svg>
    ),
  },
]

type Props = { current: Route; live: boolean }

export function Tabs({ current, live }: Props) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <a key={t.route} href={`#${t.route}`} className={t.route === current ? 'on' : undefined}>
          {t.icon}
          <span>
            {t.label}
            {t.route === 'gra' && live && <i className="live" aria-label="na żywo" />}
          </span>
        </a>
      ))}
    </nav>
  )
}
