'use client'

import { useAuth } from '@/hooks/use-auth'
import { useSubscription } from '@/hooks/use-subscription'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { NavbarThemeToggle } from './navbar-client'
import { EspaceMobileNav } from './espace-mobile-nav'
import Image from 'next/image'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Navbar() {
  const { user, signOut, loading } = useAuth()
  const { subscription } = useSubscription()
  const pathname = usePathname()
  const router = useRouter()
  const [hasOnlineSubscription, setHasOnlineSubscription] = useState(false)
  const [hasAnyValidSubscription, setHasAnyValidSubscription] = useState(false)
  const [checkingSubscriptions, setCheckingSubscriptions] = useState(true)
  const [activeSection, setActiveSection] = useState('')
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null)
  const supabase = createClient()

  // Check if user has any online-eligible subscriptions (abonnement or carnet)
  useEffect(() => {
    const checkOnlineSubscriptions = async () => {
      if (!user) {
        setHasOnlineSubscription(false)
        setHasAnyValidSubscription(false)
        setCheckingSubscriptions(false)
        return
      }

      try {
        const { data: subscriptions, error } = await supabase
          .from('user_subscriptions')
          .select(`
            *,
            subscription_plans (
              type
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .gte('end_date', new Date().toISOString())

        if (error) {
          console.error('Error checking subscriptions:', error)
          setHasOnlineSubscription(false)
          setHasAnyValidSubscription(false)
          return
        }

        // Check if user has any abonnement or carnet subscriptions (for online booking)
        const hasOnlineEligible = subscriptions?.some(sub =>
          sub.subscription_plans?.type &&
          ['abonnement', 'carnet'].includes(sub.subscription_plans.type)
        ) || false

        // Check if user has any valid subscription (including personal_training)
        const hasAnyValid = subscriptions?.some(sub =>
          sub.subscription_plans?.type &&
          ['abonnement', 'carnet', 'personal_training'].includes(sub.subscription_plans.type)
        ) || false

        setHasOnlineSubscription(hasOnlineEligible)
        setHasAnyValidSubscription(hasAnyValid)
      } catch (error) {
        console.error('Error checking online subscriptions:', error)
        setHasOnlineSubscription(false)
        setHasAnyValidSubscription(false)
      } finally {
        setCheckingSubscriptions(false)
      }
    }

    checkOnlineSubscriptions()
  }, [user, supabase])

  // Reset navigatingTo when pathname changes (navigation completed)
  useEffect(() => {
    setNavigatingTo(null)
  }, [pathname])

  // Handle navigation with immediate visual feedback
  const handleNavigation = (href: string, e: React.MouseEvent) => {
    e.preventDefault()
    setNavigatingTo(href)
    router.push(href)
  }

  // Check if we're on the home page
  const isHomePage = pathname === '/'
  // Check if we're on espace pages
  const isEspacePage = pathname.startsWith('/espace')

  // Scroll detection for active section highlighting
  useEffect(() => {
    if (!isHomePage) return

    const handleScroll = () => {
      const sections = ['presentation-studio', 'presentation-coach', 'faq', 'contact', 'nous-trouver']
      const scrollPosition = window.scrollY + 100 // Offset for navbar height

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = document.getElementById(sections[i])
        if (section) {
          const offsetTop = section.offsetTop
          if (scrollPosition >= offsetTop) {
            setActiveSection(sections[i])
            break
          }
        }
      }

      // If we're at the very top, set studio as active
      if (window.scrollY < 50) {
        setActiveSection('presentation-studio')
      }
    }

    // Set initial active section
    handleScroll()

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isHomePage])

  // Show loading state while determining auth status
  if (loading) {
    return (
      <nav className="bg-background/95 backdrop-blur-md border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex justify-between h-16 lg:h-20">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold text-primary hover:text-primary/80 transition-colors">
                Koncept Studio
              </Link>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
              <NavbarThemeToggle />
              <div className="h-10 w-20 bg-muted animate-pulse rounded"></div>
            </div>
          </div>
        </div>
      </nav>
    )
  }

  // Get profile info from user metadata or subscription data
  const profile = {
    full_name: user?.user_metadata?.full_name || '',
    role: user?.user_metadata?.role || 'user',
    subscription_status: subscription?.status || 'pending'
  }

  const handleLogout = async () => {
    try {
      await signOut()
      router.push('/')
      router.refresh()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }


  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 lg:h-20">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="group flex items-center space-x-2">
              <Image
                src="/images/logo.svg"
                alt="Koncept Studio Logo"
                width={32}
                height={32}
                className="w-8 h-8 dark:invert"
              />
              <span className="text-xl lg:text-2xl font-bold group-hover:scale-102 transition-transform">
                Koncept Studio
              </span>
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-2 lg:space-x-4">
            {isHomePage && (
              <>
                <Link
                  href="/#presentation-studio"
                  className={`px-4 py-3 lg:px-6 lg:py-3 text-base lg:text-lg font-medium rounded-lg transition-all ${
                    activeSection === 'presentation-studio'
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  Studio
                </Link>
                <Link
                  href="/#presentation-coach"
                  className={`px-4 py-3 lg:px-6 lg:py-3 text-base lg:text-lg font-medium rounded-lg transition-all ${
                    activeSection === 'presentation-coach'
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  Coach
                </Link>
                <Link
                  href="/#faq"
                  className={`px-4 py-3 lg:px-6 lg:py-3 text-base lg:text-lg font-medium rounded-lg transition-all ${
                    activeSection === 'faq'
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  FAQ
                </Link>
                <Link
                  href="/#contact"
                  className={`px-4 py-3 lg:px-6 lg:py-3 text-base lg:text-lg font-medium rounded-lg transition-all ${
                    activeSection === 'contact'
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  Contact
                </Link>
                <Link
                  href="/#nous-trouver"
                  className={`px-4 py-3 lg:px-6 lg:py-3 text-base lg:text-lg font-medium rounded-lg transition-all ${
                    activeSection === 'nous-trouver'
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  Nous trouver
                </Link>
              </>
            )}

            {isEspacePage && (
              <>
                <Link
                  href="/espace/planning"
                  onClick={(e) => handleNavigation('/espace/planning', e)}
                  className={`px-4 py-3 lg:px-6 lg:py-3 text-base lg:text-lg font-medium rounded-lg transition-all ${
                    pathname === '/espace/planning' || navigatingTo === '/espace/planning'
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  Planning
                </Link>
                <Link
                  href="/espace/reservations"
                  onClick={(e) => handleNavigation('/espace/reservations', e)}
                  className={`px-4 py-3 lg:px-6 lg:py-3 text-base lg:text-lg font-medium rounded-lg transition-all ${
                    pathname === '/espace/reservations' || navigatingTo === '/espace/reservations'
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  Mes réservations
                </Link>
                <Link
                  href="/espace/abonnement"
                  onClick={(e) => handleNavigation('/espace/abonnement', e)}
                  className={`px-4 py-3 lg:px-6 lg:py-3 text-base lg:text-lg font-medium rounded-lg transition-all ${
                    pathname === '/espace/abonnement' || navigatingTo === '/espace/abonnement'
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  Mon abonnement
                </Link>
                <Link
                  href="/espace/subscriptions"
                  onClick={(e) => handleNavigation('/espace/subscriptions', e)}
                  className={`px-4 py-3 lg:px-6 lg:py-3 text-base lg:text-lg font-medium rounded-lg transition-all ${
                    pathname === '/espace/subscriptions' || navigatingTo === '/espace/subscriptions'
                      ? 'text-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  Mes demandes
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <NavbarThemeToggle />
            {!user ? (
              <Button
                asChild
                className="shadow-soft hover:shadow-brutal transition-all"
              >
                <Link href="/login">Mon espace</Link>
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" aria-label="Menu du compte" className="relative h-11 w-11 rounded-full hover:bg-primary/10 transition-colors">
                    <Avatar className="h-10 w-10 shadow-soft">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {(profile.full_name || user?.email || '').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      {profile.full_name && (
                        <p className="text-sm font-medium leading-none">{profile.full_name}</p>
                      )}
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>

                  <DropdownMenuSeparator />

                  {/* Show navigation based on user role and current page */}
                  {pathname === '/' && (
                    <>
                      {profile.role === 'admin' ? (
                        <DropdownMenuItem asChild>
                          <Link href="/admin">Administration</Link>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem asChild>
                          <Link href="/espace">Mon espace</Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem asChild>
                    <button onClick={handleLogout} className="w-full text-left">
                      Se déconnecter
                    </button>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        {isHomePage && !user && (
          <div className="md:hidden border-t border-border">
            <div className="grid grid-cols-5 gap-1 py-2 px-2">
              <Link
                href="/#presentation-studio"
                className={`text-sm font-semibold transition-colors text-center py-3 px-2 rounded-md ${
                  activeSection === 'presentation-studio'
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                }`}
              >
                Studio
              </Link>
              <Link
                href="/#presentation-coach"
                className={`text-sm font-semibold transition-colors text-center py-3 px-2 rounded-md ${
                  activeSection === 'presentation-coach'
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                }`}
              >
                Coach
              </Link>
              <Link
                href="/#faq"
                className={`text-sm font-semibold transition-colors text-center py-3 px-2 rounded-md ${
                  activeSection === 'faq'
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                }`}
              >
                FAQ
              </Link>
              <Link
                href="/#contact"
                className={`text-sm font-semibold transition-colors text-center py-3 px-2 rounded-md ${
                  activeSection === 'contact'
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                }`}
              >
                Contact
              </Link>
              <Link
                href="/#nous-trouver"
                className={`text-sm font-semibold transition-colors text-center py-3 px-2 rounded-md ${
                  activeSection === 'nous-trouver'
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                }`}
              >
                Adresse
              </Link>
            </div>
          </div>
        )}

        {isEspacePage && <EspaceMobileNav />}
      </div>
    </nav>
  )
}