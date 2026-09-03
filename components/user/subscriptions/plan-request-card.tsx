'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  IconTrash,
  IconClock,
  IconUser,
  IconAlertTriangle
} from '@tabler/icons-react'
import { SubscriptionRequestWithPlan } from '@/lib/types/subscription-requests'
import { getStatusInfo, getTypeInfo, formatTimeUntilExpiry, isRequestExpiringSoon } from '@/lib/types/subscription-requests'
import { deleteSubscriptionRequest } from '@/app/espace/subscriptions/actions'
import { toast } from 'sonner'

interface PlanRequestCardProps {
  request: SubscriptionRequestWithPlan
  onUpdate?: () => void
  compact?: boolean
}

export function PlanRequestCard({ request, onUpdate, compact = false }: PlanRequestCardProps) {
  const [isLoading, setIsLoading] = useState(false)

  const statusInfo = getStatusInfo(request.status)
  const typeInfo = getTypeInfo(request.requestType)
  const isExpiringSoon = isRequestExpiringSoon(request.expiresAt)

  // Edit and cancel functionality removed - requests are now managed by admin only

  const performDelete = async () => {
    try {
      setIsLoading(true)

      const result = await deleteSubscriptionRequest(request.id)

      if (result.success) {
        toast.success('Demande supprimée avec succès')
        onUpdate?.()
      } else {
        toast.error(result.error || 'Erreur lors de la suppression')
      }
    } catch (error) {
      toast.error('Erreur lors de la suppression')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = () => {
    toast('Êtes-vous sûr de vouloir supprimer cette demande ?', {
      action: {
        label: 'Supprimer',
        onClick: performDelete
      },
      cancel: {
        label: 'Annuler',
        onClick: () => {}
      }
    })
  }

  if (compact) {
    return (
      <Card className="border-foreground/20 bg-background hover:bg-muted/5 transition-colors border-l-4 border-l-foreground">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h4 className="min-w-0 flex-1 font-medium text-sm text-foreground truncate">{request.plan.name}</h4>
                <Badge className="bg-foreground text-background text-xs">
                  {statusInfo.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {request.plan.priceDhs} DHS • {format(new Date(request.createdAt), 'dd/MM/yyyy')}
              </p>
            </div>
            {request.status !== 'fulfilled' && (
              <div className="flex gap-1 self-start sm:self-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={isLoading}
                  
                >
                  <IconTrash className="h-4 w-4" />
                  <span className="sr-only">Supprimer la demande</span>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`border-foreground/20 bg-background hover:bg-muted/5 transition-colors ${isExpiringSoon ? 'border-foreground bg-muted/10' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <CardTitle className="min-w-0 flex-1 text-base sm:text-lg text-foreground truncate">{request.plan.name}</CardTitle>
              <Badge className="bg-foreground text-background text-xs">
                {statusInfo.label}
              </Badge>
              <Badge className="bg-muted text-foreground border-foreground/20 text-xs">
                {typeInfo.label}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
              <div>
                <span className="truncate">{request.plan.priceDhs} DHS</span>
              </div>
              <div>
                <span className="truncate">{format(new Date(request.createdAt), 'dd MMMM yyyy', { locale: fr })}</span>
              </div>
            </div>
          </div>

          {request.status !== 'fulfilled' && (
            <div className="flex gap-2 self-start sm:self-center">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDelete}
                disabled={isLoading}
                
              >
                <IconTrash className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {/* Plan Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
            <div>
              <span className="text-muted-foreground">Type:</span>
              <span className="ml-2 font-medium text-foreground">{request.plan.type}</span>
            </div>
            {request.plan.credits && (
              <div>
                <span className="text-muted-foreground">Crédits:</span>
                <span className="ml-2 font-medium text-foreground">{request.plan.credits}</span>
              </div>
            )}
            {request.plan.weeklyLimit && (
              <div>
                <span className="text-muted-foreground">Limite/semaine:</span>
                <span className="ml-2 font-medium text-foreground">{request.plan.weeklyLimit}</span>
              </div>
            )}
            {request.plan.validityMonths && (
              <div>
                <span className="text-muted-foreground">Validité:</span>
                <span className="ml-2 font-medium text-foreground">{request.plan.validityMonths} mois</span>
              </div>
            )}
          </div>

          {/* Status Information */}
          <div className="border-t border-foreground/20 pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <IconUser className="h-4 w-4 text-foreground" />
              <span className="text-xs sm:text-sm text-foreground">{statusInfo.description}</span>
            </div>

            <div className="flex items-center gap-2">
              <IconClock className="h-4 w-4 text-foreground" />
              <span className="text-xs sm:text-sm text-foreground">
                {formatTimeUntilExpiry(request.expiresAt)}
              </span>
              {isExpiringSoon && (
                <IconAlertTriangle className="h-4 w-4 text-foreground" />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}