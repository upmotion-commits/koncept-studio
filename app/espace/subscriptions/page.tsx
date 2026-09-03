'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingSpinner } from '@/components/ui/loading'
import {
  IconPlus,
  IconClockHour4,
  IconCheck,
  IconAlertTriangle,
  IconActivity,
  IconCalendar,
  IconCoins,
  IconRefresh,
  IconUsers
} from '@tabler/icons-react'
import { PlanRequestForm } from '@/components/user/subscriptions/plan-request-form'
import { PlanRequestCard } from '@/components/user/subscriptions/plan-request-card'
import { getUserSubscriptionData } from './actions'
import { SubscriptionRequestWithPlan } from '@/lib/types/subscription-requests'
import { toast } from 'sonner'

interface UserSubscriptionData {
  requests: SubscriptionRequestWithPlan[]
  activeSubscriptions: any[]
  canCreateRequest: boolean
  maxActiveRequests: number
}

export default function SubscriptionsPage() {
  const [data, setData] = useState<UserSubscriptionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showNewRequestForm, setShowNewRequestForm] = useState(false)
  const [userSubscriptionStatus, setUserSubscriptionStatus] = useState<string | null>(null)

  const loadData = async () => {
    try {
      setIsLoading(true)

      // Get user subscription status from profile
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_status')
          .eq('id', user.id)
          .single()

        setUserSubscriptionStatus(profile?.subscription_status || null)
      }

      const result = await getUserSubscriptionData()

      if (result.success && result.data) {
        setData(result.data)
      } else {
        toast.error(result.error || 'Erreur lors du chargement des données')
      }
    } catch (error) {
      toast.error('Erreur lors du chargement des données')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleRequestSuccess = () => {
    setShowNewRequestForm(false)
    loadData()
  }

  const activeRequests = data?.requests.filter(r =>
    ['pending', 'contacted', 'approved'].includes(r.status)
  ) || []

  const completedRequests = data?.requests.filter(r =>
    ['fulfilled', 'cancelled', 'expired'].includes(r.status)
  ) || []

  // Priority functionality removed
  const expiringSoon = activeRequests.filter(r => {
    const expiry = new Date(r.expiresAt)
    const now = new Date()
    const diffTime = expiry.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays <= 3 && diffDays > 0
  })

  // Show suspended account message for inactive users
  if (userSubscriptionStatus === 'inactive') {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6 sm:mb-8 text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Compte suspendu</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Votre compte nécessite une attention particulière
            </p>
          </div>
          <Alert className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <IconAlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription>
              <div className="font-medium mb-2 text-red-800 dark:text-red-200">Compte temporairement suspendu</div>
              <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                Votre compte a été suspendu. Veuillez contacter le studio pour résoudre cette situation.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => window.open('tel:0663235797')}
                >
                  Appeler le studio
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => window.open('https://wa.me/212663235797')}
                >
                  WhatsApp
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <LoadingSpinner message="Chargement de vos demandes" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gradient mb-2">Mes demandes</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Gérez vos demandes d'abonnement et suivez leur progression
            </p>
          </div>

          <Dialog open={showNewRequestForm} onOpenChange={setShowNewRequestForm}>
            <DialogTrigger asChild>
              <Button
                disabled={!data?.canCreateRequest}
                className="w-full sm:w-auto gap-2 sm:mt-0"
                size="lg"
              >
                <IconPlus className="h-4 w-4" />
                <span className="text-sm sm:text-base">Nouvelle demande</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto mx-auto">
              <DialogHeader>
                <DialogTitle>Nouvelle demande d'abonnement</DialogTitle>
              </DialogHeader>
              <PlanRequestForm
                onSuccess={handleRequestSuccess}
                onCancel={() => setShowNewRequestForm(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Alerts */}
      {!data?.canCreateRequest && (
        <Alert className="border-foreground/20 bg-background">
          <IconAlertTriangle className="h-4 w-4 text-foreground" />
          <AlertDescription className="text-sm text-foreground">
            Vous avez atteint le maximum de {data?.maxActiveRequests} demandes actives.
            Vous pourrez créer une nouvelle demande une fois qu'une demande existante sera traitée.
          </AlertDescription>
        </Alert>
      )}

      {expiringSoon.length > 0 && (
        <Alert className="border-foreground/20 bg-background">
          <IconClockHour4 className="h-4 w-4 text-foreground" />
          <AlertDescription className="text-sm text-foreground">
            {expiringSoon.length} demande(s) expire(nt) bientôt. Assurez-vous de suivre leur progression.
          </AlertDescription>
        </Alert>
      )}


      {/* Active Subscriptions */}
      {data?.activeSubscriptions && data.activeSubscriptions.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center gap-2">
            <IconCheck className="h-5 w-5 text-foreground" />
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">Abonnements Actifs</h2>
            <Badge className="bg-foreground text-background text-xs">{data?.activeSubscriptions.length || 0}</Badge>
          </div>
          <div className="grid gap-3 sm:gap-4">
            {data.activeSubscriptions.map((subscription: any) => (
              <Card key={subscription.id} className="border-l-4 border-l-foreground bg-background hover:bg-muted/5 transition-colors">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-foreground text-sm sm:text-base">{subscription.subscription_plans?.name}</h4>
                      <Badge className="text-xs">
                        Actif
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <IconCoins className="h-3 w-3 sm:h-4 sm:w-4 text-foreground" />
                        <span>{subscription.subscription_plans?.price_dhs} DHS</span>
                      </div>
                      {subscription.subscription_plans?.type === 'abonnement' ? (
                        subscription.subscription_plans?.weekly_limit && (
                          <div className="flex items-center gap-1">
                            <IconUsers className="h-3 w-3 sm:h-4 sm:w-4 text-foreground" />
                            <span className="truncate">{subscription.subscription_plans.weekly_limit} séances/sem</span>
                          </div>
                        )
                      ) : (
                        subscription.subscription_plans?.credits && (
                          <div className="flex items-center gap-1">
                            <IconActivity className="h-3 w-3 sm:h-4 sm:w-4 text-foreground" />
                            <span className="truncate">{subscription.remaining_credits || subscription.subscription_plans.credits} séances</span>
                          </div>
                        )
                      )}
                      <div className="flex items-center gap-1">
                        <IconCalendar className="h-3 w-3 sm:h-4 sm:w-4 text-foreground" />
                        <span className="truncate">Jusqu'au {new Date(subscription.end_date).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Active Requests */}
      {activeRequests.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <IconClockHour4 className="h-5 w-5 text-foreground" />
              <h2 className="text-lg sm:text-xl font-semibold text-foreground">Demandes en Cours</h2>
              <Badge className="bg-foreground text-background text-xs">{activeRequests.length}</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="gap-2 w-full sm:w-auto"
            >
              <IconRefresh className="h-4 w-4" />
              <span className="text-sm">Actualiser</span>
            </Button>
          </div>
          <div className="grid gap-3 sm:gap-4">
            {activeRequests.map((request) => (
              <PlanRequestCard
                key={request.id}
                request={request}
                onUpdate={loadData}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State for Active Requests */}
      {activeRequests.length === 0 && (
        <Card className="border-dashed border-foreground/30 bg-background">
          <CardContent className="p-6 sm:p-8 text-center">
            <div className="p-3 w-fit mx-auto rounded-full bg-foreground/10 mb-4">
              <IconPlus className="h-8 w-8 sm:h-12 sm:w-12 text-foreground/70" />
            </div>
            <h3 className="text-base sm:text-lg font-medium mb-2 text-foreground">Aucune demande active</h3>
            <p className="text-sm sm:text-base text-muted-foreground mb-4">
              Créez votre première demande d'abonnement pour commencer
            </p>
            <Button
              onClick={() => setShowNewRequestForm(true)}
              disabled={!data?.canCreateRequest}
              className="gap-2 w-full sm:w-auto"
              size="lg"
            >
              <IconPlus className="h-4 w-4" />
              <span className="text-sm sm:text-base">Créer une demande</span>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Request History */}
      {completedRequests.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <Separator className="bg-foreground/20" />
          <div className="flex items-center gap-2">
            <IconActivity className="h-5 w-5 text-foreground" />
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">Historique des Demandes</h2>
            <Badge className="bg-foreground text-background text-xs">{completedRequests.length}</Badge>
          </div>
          <div className="grid gap-3 sm:gap-4">
            {completedRequests.map((request) => (
              <PlanRequestCard
                key={request.id}
                request={request}
                onUpdate={loadData}
                compact={true}
              />
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}