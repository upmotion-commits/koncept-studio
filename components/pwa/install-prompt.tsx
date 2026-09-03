'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IconDownload, IconX, IconDeviceMobile, IconBrowser } from '@tabler/icons-react'
import { toast } from 'sonner'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    // Set client-side flag
    setIsClient(true)

    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        (window.navigator as any).standalone ||
                        window.location.search.includes('pwa=true')

    setIsInstalled(isStandalone)

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowInstallPrompt(true)
    }

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setShowInstallPrompt(false)
      toast.success('Application installée avec succès! 🎉')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Show prompt after delay if not installed
    if (!isStandalone) {
      const timer = setTimeout(() => {
        setShowInstallPrompt(true)
      }, 3000)

      return () => {
        clearTimeout(timer)
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
        window.removeEventListener('appinstalled', handleAppInstalled)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice

      if (outcome === 'accepted') {
        toast.success('Installation en cours...')
      } else {
        toast.info('Installation annulée')
      }

      setDeferredPrompt(null)
      setShowInstallPrompt(false)
    } else {
      // Manual install instructions
      toast.info('Utilisez le menu de votre navigateur pour installer l\'application')
    }
  }

  const handleDismiss = () => {
    setShowInstallPrompt(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem('installPromptDismissed', Date.now().toString())
    }
  }

  // Don't render on server-side
  if (!isClient) {
    return null
  }

  // Don't show if already installed or recently dismissed
  const dismissedTime = localStorage.getItem('installPromptDismissed')
  const recentlyDismissed = dismissedTime && (Date.now() - parseInt(dismissedTime)) < 24 * 60 * 60 * 1000 // 24h

  if (isInstalled || !showInstallPrompt || recentlyDismissed) {
    return null
  }

  // Never cover the planning: it is the screen members use the moment the
  // booking window opens, and this banner used to sit on top of the
  // "Réserver" buttons.
  if (pathname?.startsWith('/espace/planning')) {
    return null
  }

  return (
    <>
      {/* Mobile: a compact one-line bar so it never swallows half the screen */}
      <div className="fixed inset-x-3 bottom-3 z-50 md:hidden">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card/95 p-2 shadow-lg backdrop-blur">
          <IconDeviceMobile className="ml-1 h-5 w-5 flex-shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            Installer l&apos;application
          </span>
          <Button onClick={handleInstallClick} size="sm" className="h-9 flex-shrink-0">
            <IconDownload className="mr-1.5 h-4 w-4" />
            Installer
          </Button>
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="h-9 w-9 flex-shrink-0 p-0"
            aria-label="Plus tard"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Desktop: the full card, unchanged */}
      <Card className="fixed bottom-4 right-4 z-50 hidden w-full max-w-md shadow-lg border-2 border-primary/20 md:block">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <IconDeviceMobile className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Installer l&apos;Application</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0"
              aria-label="Fermer"
            >
              <IconX className="w-4 h-4" />
            </Button>
          </div>
          <CardDescription>
            Installez Koncept Studio pour une expérience native
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconBrowser className="w-4 h-4" />
            <span>Accès rapide depuis votre écran d&apos;accueil</span>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleInstallClick} className="flex-1 gap-2" size="sm">
              <IconDownload className="w-4 h-4" />
              Installer
            </Button>
            <Button variant="outline" onClick={handleDismiss} size="sm">
              Plus tard
            </Button>
          </div>

          {!deferredPrompt && (
            <p className="text-xs text-muted-foreground">
              💡 Si le bouton ne fonctionne pas, utilisez le menu ⋮ de votre navigateur → &quot;Ajouter à l&apos;écran d&apos;accueil&quot;
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
