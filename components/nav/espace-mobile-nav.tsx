'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ExpandableTabs } from '@/components/ui/expandable-tabs'
import {
  IconCalendarEvent,
  IconBookmark,
  IconId,
  IconClockHour4,
} from '@tabler/icons-react'

const espaceTabs = [
  {
    title: 'Planning',
    icon: IconCalendarEvent,
    href: '/espace/planning',
  },
  {
    title: 'Réservations',
    icon: IconBookmark,
    href: '/espace/reservations',
  },
  {
    title: 'Abonnement',
    icon: IconId,
    href: '/espace/abonnement',
  },
  {
    title: 'Demandes',
    icon: IconClockHour4,
    href: '/espace/subscriptions',
  },
]

export function EspaceMobileNav() {
  const pathname = usePathname()
  const router = useRouter()

  const handleTabChange = (index: number | null, tab?: any) => {
    if (tab?.href && index !== null) {
      router.push(tab.href)
    }
  }

  return (
    <div className="md:hidden border-t border-border/50 bg-background/20 backdrop-blur-xl shadow-sm">
      <div className="py-2">
        <ExpandableTabsWithRoute
          tabs={espaceTabs}
          currentPath={pathname}
          onChange={handleTabChange}
          activeColor="text-primary"
        />
      </div>
    </div>
  )
}

// Wrapper component that handles route-based selection
function ExpandableTabsWithRoute({
  tabs,
  currentPath,
  onChange,
  ...props
}: {
  tabs: typeof espaceTabs
  currentPath: string
  onChange: (index: number | null, tab?: any) => void
} & Omit<React.ComponentProps<typeof ExpandableTabs>, 'tabs' | 'onChange'>) {
  const activeIndex = tabs.findIndex(tab => currentPath === tab.href)

  return (
    <ExpandableTabs
      {...props}
      tabs={tabs}
      activeIndex={activeIndex >= 0 ? activeIndex : null}
      onChange={onChange}
    />
  )
}