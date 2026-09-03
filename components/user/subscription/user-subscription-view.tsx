'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, differenceInDays, startOfWeek, endOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import {
  IconCalendar,
  IconClock,
  IconCreditCard,
  IconUser,
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconTrendingUp,
  IconChartBar,
  IconTarget,
  IconClock as IconTimer
} from '@tabler/icons-react'
import { LoadingSpinner } from '@/components/ui/loading'

interface UserProfile {
  id: string
  full_name: string
  email: string
  subscription_status?: string
}

interface Subscription {
  id: string
  status: 'active' | 'expired' | 'cancelled'
  credits_remaining: number
  credits_used: number
  weekly_credits_used: number
  start_date: string
  end_date: string
  last_weekly_reset: string
  created_at: string
  subscription_plans: {
    id: string
    name: string
    type: 'carnet' | 'personal_training' | 'abonnement'
    credits: number
    price_dhs: number
    validity_months: number
    weekly_limit?: number
    description?: string
  }
}

interface SubscriptionHistory {
  id: string
  status: 'active' | 'expired' | 'cancelled'
  credits_remaining: number
  credits_used: number
  start_date: string
  end_date: string
  created_at: string
  subscription_plans: {
    name: string
    type: 'carnet' | 'personal_training' | 'abonnement'
  }
}


interface RecentBooking {
  id: string
  booked_at: string
  status: 'confirmed' | 'cancelled' | 'no_show'
  class_schedules: {
    start_datetime: string
    classes: {
      title: string
    }
  }
}

interface UserSubscriptionViewProps {
  user: UserProfile
  currentSubscriptions: Subscription[]
  subscriptionHistory: SubscriptionHistory[]
  recentBookings: RecentBooking[]
}

export function UserSubscriptionView({
  user,
  currentSubscriptions,
  subscriptionHistory,
  recentBookings
}: UserSubscriptionViewProps) {
  // The page that renders this view already shows its own spinner while it
  // fetches; a second artificial delay here made users watch two in a row.
  const [isLoading] = useState(false)

  // Sort subscriptions by type priority: Abonnement -> Carnet -> Personal training
  const getSortedSubscriptions = (subscriptions: Subscription[]) => {
    const typeOrder = { 'abonnement': 1, 'carnet': 2, 'personal_training': 3 }
    return [...subscriptions].sort((a, b) => {
      const orderA = typeOrder[a.subscription_plans.type] || 999
      const orderB = typeOrder[b.subscription_plans.type] || 999
      return orderA - orderB
    })
  }

  // Show loading spinner
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <LoadingSpinner message="Chargement de vos abonnements" />
        </div>
      </div>
    )
  }

  // Show suspended account message for inactive users
  if (user.subscription_status === 'inactive') {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2">Compte suspendu</h1>
            <p className="text-muted-foreground">
              Votre compte nécessite une attention particulière
            </p>
          </div>
          <Alert variant="destructive" className="mb-6">
            <IconAlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium mb-2">Compte temporairement suspendu</div>
              <p className="text-sm">
                Votre compte a été suspendu. Veuillez contacter le studio pour résoudre cette situation.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => window.open('tel:0663235797')}>
                  Appeler le studio
                </Button>
                <Button variant="outline" onClick={() => window.open('https://wa.me/212663235797')}>
                  WhatsApp
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }
  
  const getStatusColor = (status: string) => {
    // Use theme-aware colors for all statuses
    return 'text-foreground bg-muted'
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Actif'
      case 'expired':
        return 'Expiré'
      case 'cancelled':
        return 'Annulé'
      case 'pending':
        return 'En attente'
      case 'resolved':
        return 'Résolu'
      default:
        return status
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'carnet':
        return 'Carnet'
      case 'personal_training':
        return 'Coaching Personnel'
      case 'abonnement':
        return 'Abonnement'
      default:
        return type
    }
  }

  // Calculate usage statistics
  const thisWeekBookings = recentBookings.filter(booking => {
    const bookingDate = new Date(booking.class_schedules.start_datetime)
    const weekStart = startOfWeek(new Date(), { locale: fr })
    const weekEnd = endOfWeek(new Date(), { locale: fr })
    return bookingDate >= weekStart && bookingDate <= weekEnd
  })

  const thisMonthBookings = recentBookings.filter(booking => {
    const bookingDate = new Date(booking.class_schedules.start_datetime)
    const now = new Date()
    return bookingDate.getMonth() === now.getMonth() && bookingDate.getFullYear() === now.getFullYear()
  })

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gradient mb-2">Mon abonnement</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Gérez votre abonnement et consultez votre utilisation
          </p>
        </div>

        {/* Current Subscriptions or Status */}
        {currentSubscriptions && currentSubscriptions.length > 0 ? (
          <div className="mb-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Abonnement{currentSubscriptions.length > 1 ? 's' : ''} actuel{currentSubscriptions.length > 1 ? 's' : ''}</h2>
              <Badge variant="secondary">{currentSubscriptions.length} abonnement{currentSubscriptions.length > 1 ? 's' : ''}</Badge>
            </div>

            {getSortedSubscriptions(currentSubscriptions).map(currentSubscription => (
              <Card key={currentSubscription.id} className="glass-effect border-l-4 border-l-foreground shadow-soft">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold">{currentSubscription.subscription_plans.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{getTypeLabel(currentSubscription.subscription_plans.type)}</Badge>
                      <Badge variant="secondary" className="px-3 py-1">
                        <IconCircleCheck className="h-3 w-3 mr-1" />
                        {getStatusLabel(currentSubscription.status)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`grid gap-6 ${currentSubscription.subscription_plans.type === 'personal_training' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'}`}>

                    {currentSubscription.subscription_plans.type !== 'personal_training' && (
                      <>
                        {currentSubscription.subscription_plans.type === 'abonnement' ? (
                          <div className="space-y-2">
                            <div className="text-sm text-muted-foreground">Utilisation hebdomadaire</div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span>{currentSubscription.weekly_credits_used} / {currentSubscription.subscription_plans.weekly_limit} séances</span>
                                <span>{Math.round((currentSubscription.weekly_credits_used / (currentSubscription.subscription_plans.weekly_limit || 1)) * 100)}%</span>
                              </div>
                              <Progress
                                value={(currentSubscription.weekly_credits_used / (currentSubscription.subscription_plans.weekly_limit || 1)) * 100}
                                className="h-2 bg-muted"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-sm text-muted-foreground">Crédits</div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span>{currentSubscription.credits_remaining} / {currentSubscription.subscription_plans.credits} restants</span>
                                <span>{Math.round((currentSubscription.credits_used / currentSubscription.subscription_plans.credits) * 100)}%</span>
                              </div>
                              <Progress
                                value={(currentSubscription.credits_used / currentSubscription.subscription_plans.credits) * 100}
                                className="h-2 bg-muted"
                              />
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Période and Temps restant - combined for mobile, separate for desktop */}
                    {currentSubscription.subscription_plans.type !== 'personal_training' ? (
                      <>
                        {/* Mobile layout - side by side */}
                        <div className="md:hidden">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div className="text-sm text-muted-foreground">Période</div>
                              <div className="font-medium">
                                {format(new Date(currentSubscription.start_date), 'dd/MM/yyyy', { locale: fr })}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                au {format(new Date(currentSubscription.end_date), 'dd/MM/yyyy', { locale: fr })}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-sm text-muted-foreground">Temps restant</div>
                              <div className="font-medium">
                                {differenceInDays(new Date(currentSubscription.end_date), new Date())} jours
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {currentSubscription.subscription_plans.price_dhs} DHS
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Desktop layout - separate grid cells */}
                        <div className="hidden md:block space-y-2">
                          <div className="text-sm text-muted-foreground">Période</div>
                          <div className="font-medium">
                            {format(new Date(currentSubscription.start_date), 'dd/MM/yyyy', { locale: fr })}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            au {format(new Date(currentSubscription.end_date), 'dd/MM/yyyy', { locale: fr })}
                          </div>
                        </div>

                        <div className="hidden md:block space-y-2 ml-8">
                          <div className="text-sm text-muted-foreground">Temps restant</div>
                          <div className="font-medium">
                            {differenceInDays(new Date(currentSubscription.end_date), new Date())} jours
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {currentSubscription.subscription_plans.price_dhs} DHS
                          </div>
                        </div>
                      </>
                    ) : (
                      // Personal training only shows période
                      <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">Période</div>
                        <div className="font-medium">
                          {format(new Date(currentSubscription.start_date), 'dd/MM/yyyy', { locale: fr })}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          au {format(new Date(currentSubscription.end_date), 'dd/MM/yyyy', { locale: fr })}
                        </div>
                      </div>
                    )}
                  </div>

                  {currentSubscription.subscription_plans.description && (
                    <div className="mt-6 p-4 bg-muted/50 rounded-xl border border-border">
                      <div className="text-sm text-muted-foreground">{currentSubscription.subscription_plans.description}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="mb-8">
            <Alert className="border-l-4 border-l-foreground">
              <IconAlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-2">Aucun abonnement actif</div>
                <p className="text-sm mb-3">
                  Vous n'avez pas d'abonnement actif actuellement. Vous pouvez demander, gérer et suivre vos demandes d'abonnement dans la section "Mes demandes".
                </p>
                <Button variant="outline" size="sm" asChild className="gap-2">
                  <Link href="/espace/subscriptions">
                    <IconCreditCard className="h-4 w-4" />
                    Aller à Mes demandes
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Subscription History */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Historique des abonnements</h2>
            <Badge variant="secondary">{subscriptionHistory.filter(sub => sub.status === 'expired').length} abonnement{subscriptionHistory.filter(sub => sub.status === 'expired').length > 1 ? 's' : ''}</Badge>
          </div>
          <div className="space-y-4">
            {subscriptionHistory.filter(sub => sub.status === 'expired').length === 0 ? (
              <Card className="glass-effect shadow-soft">
                <CardContent className="text-center py-12">
                  <IconCreditCard className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-semibold text-lg mb-2">Aucun abonnement expiré</h3>
                  <p className="text-muted-foreground">
                    Vos abonnements expirés apparaîtront ici
                  </p>
                </CardContent>
              </Card>
            ) : (
              subscriptionHistory.filter(sub => sub.status === 'expired').map(subscription => (
                <Card key={subscription.id} className={`glass-effect shadow-soft ${subscription.status === 'active' ? 'border-l-4 border-l-foreground' : ''}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-3 flex-1">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{subscription.subscription_plans.name}</h3>
                            <Badge variant="outline">{getTypeLabel(subscription.subscription_plans.type)}</Badge>
                            <Badge variant="secondary">
                              {subscription.status === 'active' ? <IconCircleCheck className="h-3 w-3 mr-1" /> : <IconCircleX className="h-3 w-3 mr-1" />}
                              {getStatusLabel(subscription.status)}
                            </Badge>
                          </div>
                        </div>

                        <div className={`grid gap-4 text-sm ${subscription.subscription_plans.type === 'personal_training' ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
                          <div>
                            <div className="text-muted-foreground">Période</div>
                            <div>{format(new Date(subscription.start_date), 'dd/MM/yyyy', { locale: fr })}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Fin</div>
                            <div>{format(new Date(subscription.end_date), 'dd/MM/yyyy', { locale: fr })}</div>
                          </div>
                          {subscription.subscription_plans.type !== 'personal_training' && (
                            <>
                              <div>
                                <div className="text-muted-foreground">Utilisé</div>
                                <div>{subscription.credits_used} crédits</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Restant</div>
                                <div>{subscription.credits_remaining} crédits</div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}