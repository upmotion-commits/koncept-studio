'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logout } from '@/app/actions/auth'
import Image from 'next/image'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IconCalendar, IconUsers, IconSettings, IconLogout, IconBarbell, IconCalendarEvent, IconCreditCard, IconCalendarStats, IconX, IconClock, IconBrandWhatsapp, IconSun, IconMoon, IconFileText, IconUserCheck, IconHistory } from '@tabler/icons-react'
import { useTheme } from 'next-themes'
import { Badge } from '@/components/ui/badge'

const navigation = [
  {
    title: 'Utilisateurs',
    href: '/admin/users',
    icon: IconUsers,
  },
  {
    title: 'Demandes',
    href: '/admin/subscription-requests',
    icon: IconFileText,
  },
  {
    title: 'Clients',
    href: '/admin/clients',
    icon: IconUserCheck,
  },
  {
    title: 'Planning',
    href: '/admin/calendar',
    icon: IconCalendarEvent,
  },
  {
    title: 'Réservations',
    href: '/admin/bookings',
    icon: IconCalendarStats,
  },
  {
    title: 'Annulations',
    href: '/admin/cancellations',
    icon: IconX,
  },
  {
    title: 'Liste d\'attente',
    href: '/admin/waitlist',
    icon: IconClock,
  },
  {
    title: 'Cours',
    href: '/admin/classes',
    icon: IconBarbell,
  },
  {
    title: 'Forfaits',
    href: '/admin/subscription-plans',
    icon: IconCreditCard,
  },
  {
    title: 'Historique Crédits',
    href: '/admin/credit-logs',
    icon: IconHistory,
  },
  {
    title: 'WhatsApp Logs',
    href: '/admin/whatsapp-logs',
    icon: IconBrandWhatsapp,
  },
]

interface NavigationItem {
  title: string
  href: string
  icon: React.ElementType
}

interface UserProfile {
  full_name: string | null
  email: string
}

export function AdminSidebar() {
  const pathname = usePathname()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [pendingUsersCount, setPendingUsersCount] = useState<number>(0)
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0)
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', authUser.id)
          .single()

        setUser({
          full_name: profile?.full_name || null,
          email: profile?.email || authUser.email || ''
        })
      }
    }

    const getPendingUsersCount = async () => {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('subscription_status', 'pending')

      setPendingUsersCount(count || 0)
    }

    const getPendingRequestsCount = async () => {
      const { count } = await supabase
        .from('subscription_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('is_active', true)

      setPendingRequestsCount(count || 0)
    }

    getUser()
    getPendingUsersCount()
    getPendingRequestsCount()

    // Set up real-time subscription for pending users count
    const usersChannel = supabase
      .channel('pending-users-count')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: 'subscription_status=eq.pending'
        },
        () => {
          getPendingUsersCount()
        }
      )
      .subscribe()

    // Set up real-time subscription for pending subscription requests count
    const requestsChannel = supabase
      .channel('pending-requests-count')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscription_requests',
          filter: 'status=eq.pending'
        },
        () => {
          getPendingRequestsCount()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(usersChannel)
      supabase.removeChannel(requestsChannel)
    }
  }, [supabase])

  return (
    <Sidebar className="border-r h-svh flex flex-col">
      <SidebarHeader className="border-b px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Image
            src="/images/logo.svg"
            alt="Koncept Studio Logo"
            width={32}
            height={32}
            className="h-8 w-8 dark:invert"
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Koncept Studio</span>
            <span className="text-xs text-muted-foreground">Administration</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex-1 flex flex-col px-3 pt-2 pb-4 overflow-y-auto">
        <div className="flex flex-col flex-1">
          <SidebarMenu className="space-y-1 flex-1">
            {navigation.slice(0, -1).map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={pathname === item.href}>
                  <Link href={item.href} className="flex items-center gap-4 px-4 py-3 text-base">
                    <item.icon className="h-5 w-5" />
                    <span className="flex-1 font-medium">{item.title}</span>
                    {item.title === 'Utilisateurs' && pendingUsersCount > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {pendingUsersCount}
                      </Badge>
                    )}
                    {item.title === 'Demandes' && pendingRequestsCount > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {pendingRequestsCount}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>

          <div className="mt-auto">
            <SidebarSeparator className="-mx-3 w-auto mb-1" />

            <SidebarMenu className="space-y-1">
              {navigation.slice(-1).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href} className="flex items-center gap-4 px-4 py-3 text-base">
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <button
                    onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                    className="flex items-center gap-4 px-4 py-3 text-base w-full text-left hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
                  >
                    {!mounted ? (
                      <div className="h-5 w-5" />
                    ) : theme === "light" ? (
                      <IconSun className="h-5 w-5" />
                    ) : (
                      <IconMoon className="h-5 w-5" />
                    )}
                    <span className="font-medium">
                      {!mounted ? "Thème" : theme === "light" ? "Thème clair" : "Thème sombre"}
                    </span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t px-3 py-4 flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start h-12 px-3">
              <Avatar className="h-8 w-8 mr-3">
                <AvatarFallback>
                  {user?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start flex-1 min-w-0 text-left">
                <span className="text-sm font-medium truncate w-full text-left">
                  {user?.full_name || 'Administrateur'}
                </span>
                <span className="text-xs text-muted-foreground truncate w-full text-left">
                  {user?.email}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user?.full_name || 'Administrateur'}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <form action={logout} className="w-full">
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full text-left flex items-center">
                  <IconLogout className="mr-2 h-4 w-4" />
                  Se déconnecter
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  )
}