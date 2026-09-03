'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  IconPlus,
  IconCheck,
  IconUsers,
  IconActivity,
  IconClock,
  IconChevronDown,
  IconChevronUp
} from '@tabler/icons-react'
import { CreateRequestData } from '@/lib/schemas/subscription-requests'
import { createSubscriptionRequest, getAvailableSubscriptionPlans } from '@/app/espace/subscriptions/actions'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/ui/loading'

interface PlanRequestFormProps {
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

interface SubscriptionPlan {
  id: string
  name: string
  type: string
  credits?: number
  price_dhs: number
  validity_months?: number
  weekly_limit?: number
  description?: string
}

interface PlanType {
  type: string
  label: string
  description: string
  plans: SubscriptionPlan[]
  expanded: boolean
}

export function PlanRequestForm({ onSuccess, onCancel, className }: PlanRequestFormProps) {
  const [planTypes, setPlanTypes] = useState<PlanType[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPlans, setIsLoadingPlans] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<string>('')

  // Load available plans
  useEffect(() => {
    async function loadPlans() {
      try {
        const result = await getAvailableSubscriptionPlans()

        if (result.success && result.data) {
          // Group plans by type and create plan types
          const grouped = result.data.reduce((acc: { [key: string]: SubscriptionPlan[] }, plan) => {
            if (!acc[plan.type]) {
              acc[plan.type] = []
            }
            acc[plan.type].push(plan)
            return acc
          }, {})

          // Create plan types with descriptions
          const types: PlanType[] = Object.entries(grouped).map(([type, plans]) => ({
            type,
            label: getTypeLabel(type),
            description: getTypeDescription(type),
            plans,
            expanded: false
          }))

          setPlanTypes(types)
        }
      } catch (error) {
        toast.error('Erreur lors du chargement des plans')
      } finally {
        setIsLoadingPlans(false)
      }
    }

    loadPlans()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedPlan) {
      toast.error('Veuillez sélectionner un plan')
      return
    }

    try {
      setIsLoading(true)

      const requestData: CreateRequestData = {
        planId: selectedPlan,
      }

      const result = await createSubscriptionRequest(requestData)

      if (result.success) {
        toast.success('Demande créée avec succès!')
        onSuccess?.()
      } else {
        toast.error(result.error || 'Erreur lors de la création de la demande')
      }
    } catch (error) {
      toast.error('Erreur lors de la création de la demande')
    } finally {
      setIsLoading(false)
    }
  }

  const getTypeLabel = (type: string): string => {
    const labels: { [key: string]: string } = {
      'carnet': 'Carnet',
      'personal_training': 'Personal training',
      'abonnement': 'Abonnement annuel'
    }
    return labels[type] || type.charAt(0).toUpperCase() + type.slice(1)
  }

  const getTypeDescription = (type: string): string => {
    const descriptions: { [key: string]: string } = {
      'carnet': 'Formules flexibles avec un nombre défini de séances',
      'personal_training': 'Accompagnement personnalisé one-to-one',
      'abonnement': 'Abonnement annuel avec limite de séances par semaine'
    }
    return descriptions[type] || ''
  }

  const togglePlanType = (typeIndex: number) => {
    setPlanTypes(prev =>
      prev.map((planType, index) =>
        index === typeIndex
          ? { ...planType, expanded: !planType.expanded }
          : planType
      )
    )
  }

  const allPlans = planTypes.flatMap(pt => pt.plans)
  const selectedPlanData = allPlans.find(p => p.id === selectedPlan)

  if (isLoadingPlans) {
    return (
      <LoadingSpinner message="Chargement des formules" />
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header — the title itself lives in the DialogHeader above */}
      <p className="text-sm sm:text-base text-muted-foreground">
        Sélectionnez la formule qui vous intéresse pour créer votre demande
      </p>

      {/* Plan Types and Plans */}
      <div className="space-y-4 sm:space-y-6">
        {planTypes.map((planType, typeIndex) => (
          <div key={planType.type} className="space-y-3 sm:space-y-4">
            {/* Type Header */}
            <Card className="bg-muted/30 border-foreground/20">
              <CardHeader className="pb-3 sm:pb-4">
                <div className="flex flex-col space-y-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                  <div className="space-y-1 flex-1">
                    <h3 className="text-lg sm:text-xl font-semibold text-foreground">{planType.label}</h3>
                    <p className="text-sm text-muted-foreground pr-2">{planType.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePlanType(typeIndex)}
                    className="ml-0 sm:ml-4 self-start sm:self-start mt-0 sm:mt-0 text-foreground hover:bg-foreground/10"
                  >
                    <span className="text-sm">{planType.expanded ? 'Masquer' : 'Voir les formules'}</span>
                    {planType.expanded ? (
                      <IconChevronUp className="w-4 h-4 ml-2" />
                    ) : (
                      <IconChevronDown className="w-4 h-4 ml-2" />
                    )}
                  </Button>
                </div>
              </CardHeader>
            </Card>

            {/* Plans Grid (shown when expanded) */}
            {planType.expanded && (
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {planType.plans.map((plan) => (
                  <Card
                    key={plan.id}
                    className={`cursor-pointer transition-all border-2 ${
                      selectedPlan === plan.id
                        ? 'border-foreground bg-foreground/5 ring-1 ring-foreground/20'
                        : 'border-foreground/20 hover:border-foreground/50 hover:shadow-md hover:bg-muted/5'
                    }`}
                    onClick={() => setSelectedPlan(plan.id)}
                  >
                    <CardHeader className="pb-2 sm:pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base sm:text-lg leading-tight flex-1 pr-2 text-foreground">{plan.name}</CardTitle>
                        {selectedPlan === plan.id && (
                          <IconCheck className="h-5 w-5 text-foreground mt-0.5 flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-xl sm:text-2xl font-bold text-foreground">
                        {plan.price_dhs} DHS
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 sm:space-y-3">
                      {plan.description && (
                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{plan.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {/* For non-abonnement plans, show total séances */}
                        {planType.type !== 'abonnement' && plan.credits && plan.credits > 0 && (
                          <Badge className="text-xs px-2 py-1 bg-foreground text-background">
                            <IconCheck className="w-3 h-3 mr-1 flex-shrink-0" />
                            <span className="truncate">Total: {plan.credits} séances</span>
                          </Badge>
                        )}

                        {/* For non-abonnement plans, show validity in months only */}
                        {plan.validity_months && planType.type !== 'abonnement' && (
                          <Badge className="text-xs px-2 py-1 bg-foreground text-background">
                            <IconClock className="w-3 h-3 mr-1 flex-shrink-0" />
                            <span className="truncate">Valide {plan.validity_months} mois</span>
                          </Badge>
                        )}

                        {/* For abonnement plans, show weekly limit */}
                        {plan.weekly_limit && planType.type === 'abonnement' && (
                          <Badge className="text-xs px-2 py-1 bg-foreground text-background">
                            <IconUsers className="w-3 h-3 mr-1 flex-shrink-0" />
                            <span className="truncate">{plan.weekly_limit} séances/semaine max</span>
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Selected Plan Summary */}
      {selectedPlanData && (
        <Card className="bg-foreground/5 border-foreground/20">
          <CardContent className="p-4 sm:p-6">
            <h4 className="font-semibold mb-3 text-foreground">Formule sélectionnée: {selectedPlanData.name}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Prix:</span>
                <span className="ml-2 font-medium text-foreground">{selectedPlanData.price_dhs} DHS</span>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>
                <span className="ml-2 font-medium text-foreground">{getTypeLabel(selectedPlanData.type)}</span>
              </div>
              {selectedPlanData.credits && (
                <div>
                  <span className="text-muted-foreground">Séances:</span>
                  <span className="ml-2 font-medium text-foreground">{selectedPlanData.credits}</span>
                </div>
              )}
              {selectedPlanData.validity_months && (
                <div>
                  <span className="text-muted-foreground">Validité:</span>
                  <span className="ml-2 font-medium text-foreground">{selectedPlanData.validity_months} mois</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Section */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 pt-6 border-t border-foreground/20">
        <div className="text-sm text-muted-foreground text-center sm:text-left">
          {!selectedPlan
            ? 'Aucune formule sélectionnée'
            : `${selectedPlanData?.name} sélectionnée`
          }
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
              size="lg"
              className="min-w-[150px] w-full sm:w-auto order-2 sm:order-1"
            >
              Annuler
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!selectedPlan || isLoading}
            size="lg"
            className="min-w-[200px] w-full sm:w-auto order-1 sm:order-2"
          >
            {isLoading ? 'Création en cours...' : 'Créer la demande'}
          </Button>
        </div>
      </div>
    </div>
  )
}