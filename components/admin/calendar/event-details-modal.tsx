'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarEvent } from './calendar-view'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconCalendar, IconClock, IconMapPin, IconUser, IconUsers, IconTrash, IconRepeat, IconLoader } from '@tabler/icons-react'
import { deleteClassEvent, cancelClassEvent } from '@/app/admin/calendar/actions'
import { toast } from 'sonner'
import { studioWallClockFromISO } from '@/lib/utils/studio-time'

interface EventDetailsModalProps {
  event: CalendarEvent
  onClose: () => void
  onEdit: (event: CalendarEvent) => void
}

export function EventDetailsModal({ event, onClose, onEdit }: EventDetailsModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [participants, setParticipants] = useState<any[]>([])
  const [loadingParticipants, setLoadingParticipants] = useState(true)
  
  const supabase = createClient()

  useEffect(() => {
    const fetchParticipants = async () => {
      try {
        setLoadingParticipants(true)
        const { data, error } = await supabase
          .from('class_bookings')
          .select(`
            id,
            status,
            profiles (
              full_name,
              email
            ),
            user_subscriptions (
              subscription_plans (
                name
              )
            )
          `)
          .eq('schedule_id', event.id)
          .eq('status', 'confirmed')
          .order('created_at', { ascending: true })

        if (error) throw error
        setParticipants(data || [])
      } catch (err) {
        console.error('Error fetching participants:', err)
      } finally {
        setLoadingParticipants(false)
      }
    }

    if (event.id) {
      fetchParticipants()
    }
  }, [event.id, supabase])

  const handleDeleteSingle = async () => {
    setLoading(true)
    setError('')

    try {
      const result = await deleteClassEvent({
        eventId: event.id,
        deleteType: 'single'
      })

      if (result.success) {
        toast.success('Cours supprimé avec succès')
        onClose()
      } else {
        setError(result.error || 'Erreur lors de la suppression')
      }
    } catch (err: any) {
      console.error('Error deleting event:', err)
      setError(err.message || 'Erreur lors de la suppression')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSeries = async () => {
    setLoading(true)
    setError('')

    try {
      const result = await deleteClassEvent({
        eventId: event.id,
        deleteType: 'all_recurring',
        classId: event.class_id
      })

      if (result.success) {
        toast.success('Série de cours supprimée avec succès')
        onClose()
      } else {
        setError(result.error || 'Erreur lors de la suppression de la série')
      }
    } catch (err: any) {
      console.error('Error deleting series:', err)
      setError(err.message || 'Erreur lors de la suppression de la série')
    } finally {
      setLoading(false)
    }
  }

  const getDifficultyLabel = (level: string) => {
    switch (level.toLowerCase()) {
      case 'all_levels':
        return 'Tous niveaux'
      case 'beginner':
        return 'Débutant'
      case 'intermediate':
        return 'Intermédiaire'
      case 'advanced':
        return 'Avancé'
      default:
        return level
    }
  }

  const startDate = studioWallClockFromISO(event.start_datetime)
  const endDate = studioWallClockFromISO(event.end_datetime)
  const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60))
  const occupancyRate = Math.round((event.current_bookings / event.max_capacity) * 100)

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Détails du Cours</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Event Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">{event.title}</h3>
              {event.is_recurring && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <IconRepeat className="h-3 w-3" />
                  Récurrent
                </Badge>
              )}
            </div>
            {event.description && (
              <p className="text-muted-foreground">{event.description}</p>
            )}
          </div>

          <Separator />

          {/* Event Details */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <IconCalendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {format(startDate, 'dd/MM/yyyy', { locale: fr })}
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <IconClock className="h-4 w-4 text-muted-foreground" />
              <span>
                {format(startDate, 'HH:mm')} - {format(endDate, 'HH:mm')} ({duration} min)
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <IconUser className="h-4 w-4 text-muted-foreground" />
              <span>{event.coach}</span>
            </div>

            <div className="flex items-center space-x-3">
              <IconMapPin className="h-4 w-4 text-muted-foreground" />
              <span>{event.location}</span>
            </div>

            <div className="flex items-center space-x-3">
              <IconUsers className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center space-x-2">
                <span>{event.current_bookings} / {event.max_capacity} participants</span>
                <Badge variant={occupancyRate >= 80 ? 'destructive' : occupancyRate >= 50 ? 'default' : 'secondary'}>
                  {occupancyRate}%
                </Badge>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="h-4 w-4" />
              <Badge variant="secondary">
                {getDifficultyLabel(event.difficulty_level)}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Participants Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <IconUsers className="h-4 w-4" />
                Liste des participants
              </h4>
              <Badge variant="outline">{participants.length}</Badge>
            </div>

            {loadingParticipants ? (
              <div className="flex justify-center py-4">
                <IconLoader className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : participants.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground bg-muted/30 rounded-md">
                Aucun participant inscrit
              </div>
            ) : (
              <div className="border rounded-md">
                <ScrollArea className="h-72 w-full rounded-md bg-muted/10">
                  <div className="p-4 space-y-2">
                    {participants.map((booking) => (
                      <div key={booking.id} className="flex items-center justify-between p-3 rounded-md bg-card border shadow-sm">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                            <span className="font-semibold text-xs text-primary">
                              {booking.profiles?.full_name?.charAt(0).toUpperCase() || '?'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">
                              {booking.profiles?.full_name || 'Utilisateur inconnu'}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {booking.profiles?.email}
                            </div>
                          </div>
                        </div>
                        {booking.user_subscriptions?.subscription_plans?.name && (
                          <Badge variant="secondary" className="text-[10px] shrink-0 ml-2">
                            {booking.user_subscriptions.subscription_plans.name}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-3 pb-2">
            {/* Delete Options */}
            <div className="space-y-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full border-foreground text-foreground hover:bg-foreground hover:text-background" size="sm">
                    <IconTrash className="h-4 w-4 mr-2" />
                    {event.is_recurring ? 'Supprimer cette occurrence' : 'Supprimer le cours'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                    <AlertDialogDescription>
                      {event.is_recurring 
                        ? 'Cette occurrence sera supprimée mais les autres cours de la série resteront.'
                        : 'Ce cours sera définitivement supprimé.'
                      }
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteSingle}
                      disabled={loading}
                      className="bg-foreground text-background hover:bg-foreground/90"
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {event.is_recurring && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full border-foreground text-foreground hover:bg-foreground hover:text-background" size="sm">
                      <IconTrash className="h-4 w-4 mr-2" />
                      Supprimer toute la série
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer la série complète</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tous les cours de cette série récurrente seront supprimés. Cette action est irréversible.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteSeries}
                        disabled={loading}
                        className="bg-foreground text-background hover:bg-foreground/90"
                      >
                        Supprimer la série
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}