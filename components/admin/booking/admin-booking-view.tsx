'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IconUser, IconSearch, IconCalendar, IconClock, IconMapPin, IconUser as IconCoach, IconCheck, IconAlertCircle } from '@tabler/icons-react'
import { format, parseISO, startOfWeek, addDays, isSameDay, isFuture, isPast } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'
import { adminBookClass } from '@/app/espace/reservations/actions'
import { formatStudioTime, studioWallClockFromISO } from '@/lib/utils/studio-time'

interface User {
  id: string
  full_name: string
  email: string
  phone: string | null
  subscription_status: string
}

interface ClassSchedule {
  id: string
  start_datetime: string
  end_datetime: string
  current_bookings: number
  classes: {
    id: string
    title: string
    description: string
    coach: string
    location: string
    difficulty_level: string
    max_capacity: number
  }
}

interface AdminBookingViewProps {
  adminId: string
}

export function AdminBookingView({ adminId }: AdminBookingViewProps) {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [schedules, setSchedules] = useState<ClassSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [showUserDialog, setShowUserDialog] = useState(false)
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const supabase = createClient()

  useEffect(() => {
    fetchSchedules()
  }, [currentWeekStart])

  const fetchUsers = async (query: string) => {
    if (!query || query.length < 2) {
      setUsers([])
      return
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, subscription_status')
        .eq('role', 'user')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
        .limit(10)

      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Erreur lors de la recherche d\'utilisateurs')
    }
  }

  const fetchSchedules = async () => {
    try {
      setLoading(true)
      const weekEnd = addDays(currentWeekStart, 7)

      const { data, error } = await supabase
        .from('class_schedules')
        .select(`
          id,
          start_datetime,
          end_datetime,
          current_bookings,
          is_cancelled,
          classes (
            id,
            title,
            description,
            coach,
            location,
            difficulty_level,
            max_capacity
          )
        `)
        .gte('start_datetime', currentWeekStart.toISOString())
        .lt('start_datetime', weekEnd.toISOString())
        .eq('is_cancelled', false)
        .order('start_datetime', { ascending: true })

      if (error) throw error
      setSchedules((data || []) as unknown as ClassSchedule[])
    } catch (error) {
      console.error('Error fetching schedules:', error)
      toast.error('Erreur lors du chargement du calendrier')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectUser = (user: User) => {
    setSelectedUser(user)
    setShowUserDialog(false)
    setSearchTerm('')
    setUsers([])
  }

  const handleBookClass = async (scheduleId: string, className: string) => {
    if (!selectedUser) {
      toast.error('Veuillez d\'abord sélectionner un utilisateur')
      return
    }

    try {
      const result = await adminBookClass({
        userId: selectedUser.id,
        scheduleId: scheduleId,
        adminId: adminId
      })

      if (!result.success) {
        toast.error('Erreur', {
          description: result.error || 'Impossible de créer la réservation'
        })
        return
      }

      toast.success('Réservation créée', {
        description: `${selectedUser.full_name} a été inscrit(e) au cours ${className}`
      })

      // Refresh schedules
      await fetchSchedules()
    } catch (error) {
      console.error('Error booking class:', error)
      toast.error('Une erreur est survenue lors de la réservation')
    }
  }

  const groupSchedulesByDay = () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i))
    const grouped: Record<string, ClassSchedule[]> = {}

    days.forEach(day => {
      const dayKey = format(day, 'yyyy-MM-dd')
      grouped[dayKey] = schedules.filter(schedule =>
        isSameDay(studioWallClockFromISO(schedule.start_datetime), day)
      )
    })

    return grouped
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'default'
      case 'pending':
        return 'secondary'
      case 'expired':
      case 'inactive':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const groupedSchedules = groupSchedulesByDay()
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i))

  return (
    <div className="space-y-6">
      {/* User Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconUser className="h-5 w-5" />
            Utilisateur sélectionné
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedUser ? (
            <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg border border-primary/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <IconUser className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{selectedUser.full_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  {selectedUser.phone && (
                    <p className="text-sm text-muted-foreground">{selectedUser.phone}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={getStatusColor(selectedUser.subscription_status)}>
                  {selectedUser.subscription_status === 'active' ? 'Actif' :
                   selectedUser.subscription_status === 'pending' ? 'En attente' :
                   selectedUser.subscription_status === 'expired' ? 'Expiré' : 'Inactif'}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUserDialog(true)}
                >
                  Changer
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowUserDialog(true)}
            >
              <IconSearch className="h-4 w-4 mr-2" />
              Rechercher un utilisateur
            </Button>
          )}
        </CardContent>
      </Card>

      {selectedUser?.subscription_status !== 'active' && selectedUser && (
        <Alert variant="destructive">
          <IconAlertCircle className="h-4 w-4" />
          <AlertDescription>
            Attention: Cet utilisateur n'a pas d'abonnement actif. Vérifiez qu'il dispose de crédits avant de réserver.
          </AlertDescription>
        </Alert>
      )}

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <Button
            variant="outline"
            onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
          >
            Semaine précédente
          </Button>
          <h2 className="text-lg font-semibold">
            {format(currentWeekStart, 'd MMM', { locale: fr })} - {format(addDays(currentWeekStart, 6), 'd MMM yyyy', { locale: fr })}
          </h2>
          <Button
            variant="outline"
            onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
          >
            Semaine suivante
          </Button>
        </div>

        {/* Calendar Grid */}
        {loading ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                Chargement du calendrier...
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {weekDays.map(day => {
              const dayKey = format(day, 'yyyy-MM-dd')
              const daySchedules = groupedSchedules[dayKey] || []
              const isToday = isSameDay(day, new Date())
              const isPastDay = isPast(day) && !isToday

              return (
                <Card key={dayKey} className={isToday ? 'border-primary' : ''}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {format(day, 'EEEE d MMM', { locale: fr })}
                      {isToday && (
                        <Badge variant="default" className="ml-2">Aujourd'hui</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {daySchedules.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Aucun cours
                      </p>
                    ) : (
                      daySchedules.map(schedule => {
                        const isFull = schedule.current_bookings >= schedule.classes.max_capacity
                        const isPastClass = isPast(parseISO(schedule.start_datetime))

                        return (
                          <Card key={schedule.id} className="border">
                            <CardContent className="p-3 space-y-2">
                              <div>
                                <p className="font-semibold text-sm">{schedule.classes.title}</p>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                  <IconClock className="h-3 w-3" />
                                  {formatStudioTime(schedule.start_datetime)} - {formatStudioTime(schedule.end_datetime)}
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <IconCoach className="h-3 w-3" />
                                  {schedule.classes.coach}
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <IconMapPin className="h-3 w-3" />
                                  {schedule.classes.location}
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t">
                                <Badge variant={isFull ? 'destructive' : 'secondary'} className="text-xs">
                                  {schedule.current_bookings}/{schedule.classes.max_capacity}
                                </Badge>

                                <Button
                                  size="sm"
                                  variant={isPastClass ? 'ghost' : 'default'}
                                  disabled={!selectedUser || isFull || isPastClass}
                                  onClick={() => handleBookClass(schedule.id, schedule.classes.title)}
                                  className="h-7 text-xs"
                                >
                                  {isPastClass ? (
                                    'Passé'
                                  ) : isFull ? (
                                    'Complet'
                                  ) : (
                                    <>
                                      <IconCheck className="h-3 w-3 mr-1" />
                                      Réserver
                                    </>
                                  )}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* User Search Dialog */}
        <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IconSearch className="h-5 w-5" />
                Rechercher un utilisateur
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search">Nom, email ou téléphone</Label>
                <Input
                  id="search"
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    fetchUsers(e.target.value)
                  }}
                  autoFocus
                />
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {users.length === 0 && searchTerm.length >= 2 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Aucun utilisateur trouvé
                  </p>
                )}

                {users.length === 0 && searchTerm.length < 2 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Tapez au moins 2 caractères pour rechercher
                  </p>
                )}

                {users.map(user => (
                  <Card
                    key={user.id}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => handleSelectUser(user)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <IconUser className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">{user.full_name}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                            {user.phone && (
                              <p className="text-sm text-muted-foreground">{user.phone}</p>
                            )}
                          </div>
                        </div>
                        <Badge variant={getStatusColor(user.subscription_status)}>
                          {user.subscription_status === 'active' ? 'Actif' :
                           user.subscription_status === 'pending' ? 'En attente' :
                           user.subscription_status === 'expired' ? 'Expiré' : 'Inactif'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
    </div>
  )
}