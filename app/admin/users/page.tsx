'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { IconUserCheck, IconMessage, IconCreditCard, IconUsers, IconUserPlus, IconPhone, IconUserMinus, IconChevronLeft, IconChevronRight, IconSearch, IconX, IconSettings, IconPlus, IconTrash, IconEye, IconUserX, IconDownload, IconRefresh, IconEdit, IconCalendar, IconMinus, IconCoin, IconClock, IconMapPin, IconUser } from '@tabler/icons-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'
import { formatDesiredPlansDisplay, parseDesiredPlans } from '@/lib/utils/plan-utils'
import { assignSubscriptionToUser, deleteUser } from './actions'
import * as XLSX from 'xlsx'

interface User {
  id: string
  email: string
  full_name: string
  phone?: string
  desired_plan?: string
  has_subscription_request?: boolean
  subscription_status: 'pending' | 'active' | 'inactive' | 'expired'
  created_at: string
  active_subscription?: {
    id: string
    status: string
    credits_remaining: number
    credits_used?: number
    weekly_credits_used?: number
    start_date?: string
    end_date: string
    plan_name: string
    plan_type?: string
    plan_price?: number
    weekly_limit?: number
  } | null
}

interface SubscriptionPlan {
  id: string
  name: string
  type: string
  credits: number | null
  price_dhs: number
  validity_months: number | null
  weekly_limit?: number | null
}

interface SubscriptionFormData {
  plan_id: string
  start_date: string
}

interface ModifySubscriptionFormData {
  plan_id: string
  start_date: string
  end_date: string
}

interface UserSubscription {
  id: string
  plan_id: string
  plan_name: string
  plan_type: string
  plan_price: number
  credits_remaining: number
  credits_used: number
  weekly_credits_used: number
  weekly_limit: number | null
  start_date: string
  end_date: string
  status: 'active' | 'expired' | 'cancelled'
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showContactDialog, setShowContactDialog] = useState(false)
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false)
  const [showSubscriptionDetailsDialog, setShowSubscriptionDetailsDialog] = useState(false)
  const [showSubscriptionManagementDialog, setShowSubscriptionManagementDialog] = useState(false)
  const [userSubscriptions, setUserSubscriptions] = useState<UserSubscription[]>([])
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [subscriptionToDelete, setSubscriptionToDelete] = useState<{id: string, planName: string} | null>(null)
  const [showDeleteUserConfirmation, setShowDeleteUserConfirmation] = useState(false)
  const [userToDelete, setUserToDelete] = useState<{id: string, name: string, email: string} | null>(null)
  const [showModifySubscriptionDialog, setShowModifySubscriptionDialog] = useState(false)
  const [subscriptionToModify, setSubscriptionToModify] = useState<UserSubscription | null>(null)
  const [modifySubscriptionForm, setModifySubscriptionForm] = useState<ModifySubscriptionFormData>({
    plan_id: '',
    start_date: '',
    end_date: ''
  })
  const [subscriptionForm, setSubscriptionForm] = useState<SubscriptionFormData>({
    plan_id: '',
    start_date: format(new Date(), 'yyyy-MM-dd')
  })

  // Booking state
  const [upcomingClasses, setUpcomingClasses] = useState<any[]>([])
  const [loadingClasses, setLoadingClasses] = useState(false)
  const [selectedSubscriptionForBooking, setSelectedSubscriptionForBooking] = useState<string>('')

  // Credit management state
  const [showCreditDialog, setShowCreditDialog] = useState(false)
  const [creditAmount, setCreditAmount] = useState<number>(1)
  const [selectedSubscriptionForCredits, setSelectedSubscriptionForCredits] = useState<UserSubscription | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 10

  // Search and filtering state
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planInformeFilter, setPlanInformeFilter] = useState('all')
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [displayUsers, setDisplayUsers] = useState<User[]>([])
  const [filteredTotalCount, setFilteredTotalCount] = useState(0)

  const supabase = createClient()

  const applyFilters = (usersData: User[], page = 0) => {
    let filtered = [...usersData]

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim()
      filtered = filtered.filter(user =>
        user.full_name?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.phone?.toLowerCase().includes(searchLower) ||
        formatDesiredPlansDisplay(user.desired_plan || null)?.toLowerCase().includes(searchLower)
      )
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(user => user.subscription_status === statusFilter)
    }

    // Apply plan informé filter
    if (planInformeFilter !== 'all') {
      if (planInformeFilter === 'oui') {
        filtered = filtered.filter(user => user.has_subscription_request === true)
      } else if (planInformeFilter === 'non') {
        filtered = filtered.filter(user => user.has_subscription_request === false)
      }
    }

    setFilteredUsers(filtered)
    setFilteredTotalCount(filtered.length)

    // Apply pagination
    const startIndex = page * pageSize
    const endIndex = startIndex + pageSize
    const paginatedUsers = filtered.slice(startIndex, endIndex)

    setUsers(paginatedUsers)
    setDisplayUsers(paginatedUsers)
    setCurrentPage(page)
  }

  const fetchUsers = async (page = 0) => {
    try {
      setLoading(true)

      // Fetch all users (excluding admins)
      const { data: allUsersData, error: allUsersError } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          phone,
          desired_plan,
          subscription_status,
          created_at
        `)
        .eq('role', 'user')
        .order('created_at', { ascending: false })

      if (allUsersError) throw allUsersError

      // Fetch active subscriptions
      const { data: subscriptionsData, error: subscriptionsError } = await supabase
        .from('user_subscriptions')
        .select(`
          id,
          user_id,
          status,
          credits_remaining,
          credits_used,
          weekly_credits_used,
          start_date,
          end_date,
          subscription_plans (
            name,
            type,
            price_dhs,
            weekly_limit
          )
        `)
        .eq('status', 'active')

      if (subscriptionsError) throw subscriptionsError

      // Create a map of active subscriptions by user_id
      const subscriptionsMap = new Map()
      subscriptionsData?.forEach(sub => {
        subscriptionsMap.set(sub.user_id, sub)
      })

      // Get subscription request information for all users
      const allUserIds = (allUsersData || []).map(u => u.id)

      const { data: requestsData, error: requestsError } = await supabase
        .from('subscription_requests')
        .select('user_id')
        .in('user_id', allUserIds)
        .eq('is_active', true)

      if (requestsError) throw requestsError

      const usersWithRequests = new Set((requestsData || []).map(r => r.user_id))

      // Combine and format the data
      const formattedUsers: User[] = (allUsersData || []).map((user: any) => {
        const subscription = subscriptionsMap.get(user.id)

        return {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone,
          desired_plan: user.desired_plan,
          has_subscription_request: usersWithRequests.has(user.id),
          subscription_status: user.subscription_status,
          created_at: user.created_at,
          active_subscription: subscription ? {
            id: subscription.id,
            status: subscription.status,
            credits_remaining: subscription.credits_remaining,
            credits_used: subscription.credits_used,
            weekly_credits_used: subscription.weekly_credits_used,
            start_date: subscription.start_date,
            end_date: subscription.end_date,
            plan_name: subscription.subscription_plans?.name || 'Plan inconnu',
            plan_type: subscription.subscription_plans?.type,
            plan_price: subscription.subscription_plans?.price_dhs,
            weekly_limit: subscription.subscription_plans?.weekly_limit
          } : null
        }
      })

      setAllUsers(formattedUsers)
      setTotalCount(formattedUsers.length)
      // Apply current filters
      applyFilters(formattedUsers, page)
    } catch (err: any) {
      console.error('Error fetching users:', err)
      setError(`Erreur lors du chargement des utilisateurs: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, name, type, credits, price_dhs, validity_months, weekly_limit')
        .order('price_dhs', { ascending: true })

      if (error) throw error
      setPlans(data || [])
    } catch (err: any) {
      console.error('Error fetching plans:', err)
    }
  }

  const fetchUserSubscriptions = async (userId: string) => {
    try {
      setLoadingSubscriptions(true)
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_plans (
            name,
            type,
            price_dhs,
            weekly_limit
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedSubscriptions: UserSubscription[] = (data || []).map((sub: any) => ({
        id: sub.id,
        plan_id: sub.plan_id,
        plan_name: sub.subscription_plans?.name || 'Plan inconnu',
        plan_type: sub.subscription_plans?.type || '',
        plan_price: sub.subscription_plans?.price_dhs || 0,
        credits_remaining: sub.credits_remaining || 0,
        credits_used: sub.credits_used || 0,
        weekly_credits_used: sub.weekly_credits_used || 0,
        weekly_limit: sub.subscription_plans?.weekly_limit || null,
        start_date: sub.start_date,
        end_date: sub.end_date,
        status: sub.status,
        created_at: sub.created_at
      }))

      setUserSubscriptions(formattedSubscriptions)
    } catch (err: any) {
      console.error('Error fetching user subscriptions:', err)
      toast.error('Erreur lors du chargement des abonnements')
    } finally {
      setLoadingSubscriptions(false)
    }
  }

  // Effect for applying filters when search or status changes
  useEffect(() => {
    if (allUsers.length > 0) {
      applyFilters(allUsers, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, planInformeFilter])

  useEffect(() => {
    fetchUsers(0)
    fetchPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefresh = async () => {
    setSearchTerm('')
    setStatusFilter('all')
    setPlanInformeFilter('all')
    setCurrentPage(0)
    await fetchUsers(0)
    await fetchPlans()
    toast.success('Données actualisées')
  }

  const handleExport = () => {
    try {
      const dataToExport = filteredUsers.map(user => ({
        'Nom': user.full_name || '',
        'Email': user.email || '',
        'Téléphone': user.phone || '',
        'Plan Informé': user.has_subscription_request ? 'Oui' : 'Non',
        'Plan Souhaité': formatDesiredPlansDisplay(user.desired_plan || null) || '',
        'Statut Abonnement': user.subscription_status === 'pending' ? 'En attente' :
                            user.subscription_status === 'active' ? 'Actif' :
                            user.subscription_status === 'inactive' ? 'Inactif' : 'Expiré',
        'Date d\'inscription': format(new Date(user.created_at), 'dd/MM/yyyy HH:mm', { locale: fr }),
        'Abonnement Actuel': user.active_subscription?.plan_name || 'Aucun',
        'Crédits Restants': user.active_subscription?.credits_remaining || '',
        'Date Fin Abonnement': user.active_subscription?.end_date ?
          format(new Date(user.active_subscription.end_date), 'dd/MM/yyyy', { locale: fr }) : ''
      }))

      const ws = XLSX.utils.json_to_sheet(dataToExport)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Utilisateurs')

      // Auto-adjust column widths
      const colWidths = [
        { wch: 20 }, // Nom
        { wch: 25 }, // Email
        { wch: 15 }, // Téléphone
        { wch: 12 }, // Plan Informé
        { wch: 20 }, // Plan Souhaité
        { wch: 18 }, // Statut Abonnement
        { wch: 18 }, // Date d'inscription
        { wch: 20 }, // Abonnement Actuel
        { wch: 15 }, // Crédits Restants
        { wch: 18 }  // Date Fin Abonnement
      ]
      ws['!cols'] = colWidths

      const fileName = `utilisateurs-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.xlsx`
      XLSX.writeFile(wb, fileName)

      toast.success(`Export réalisé: ${fileName}`)
    } catch (error) {
      console.error('Error exporting:', error)
      toast.error('Erreur lors de l\'export')
    }
  }


  const handleAssignSubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return

    try {
      const result = await assignSubscriptionToUser({
        userId: selectedUser.id,
        planId: subscriptionForm.plan_id,
        startDate: subscriptionForm.start_date
      })

      if (!result.success) {
        throw new Error(result.error || 'Erreur lors de l\'attribution de l\'abonnement')
      }

      await fetchUsers(0)
      setShowSubscriptionDialog(false)
      setSelectedUser(null)
      setSubscriptionForm({
        plan_id: '',
        start_date: format(new Date(), 'yyyy-MM-dd')
      })

      toast.success(`Abonnement assigné à ${selectedUser.full_name}`)
    } catch (err: any) {
      console.error('Error assigning subscription:', err)
      toast.error(`Erreur lors de l'assignation: ${err?.message || 'Erreur inconnue'}`)
    }
  }

  const handleDeactivateUser = async (userId: string, userName: string) => {
    try {
      // Update user status to inactive
      const { error: userError } = await supabase
        .from('profiles')
        .update({ subscription_status: 'inactive' })
        .eq('id', userId)

      if (userError) throw userError

      // Cancel current subscription if exists
      const { error: subscriptionError } = await supabase
        .from('user_subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('status', 'active')

      if (subscriptionError) throw subscriptionError

      await fetchUsers(0)
      toast.success(`Utilisateur ${userName} désactivé`)
    } catch (err: any) {
      console.error('Error deactivating user:', err)
      toast.error('Erreur lors de la désactivation')
    }
  }

  const handleShowDeleteUserConfirmation = (user: User) => {
    setUserToDelete({
      id: user.id,
      name: user.full_name,
      email: user.email
    })
    setShowDeleteUserConfirmation(true)
  }

  const handleDeleteUser = async () => {
    if (!userToDelete) return

    try {
      const result = await deleteUser({ userId: userToDelete.id })

      if (!result.success) {
        throw new Error(result.error || 'Erreur lors de la suppression')
      }

      // Close dialogs and refresh data
      setShowDeleteUserConfirmation(false)
      setShowSubscriptionManagementDialog(false)
      setSelectedUser(null)
      setUserToDelete(null)

      await fetchUsers(0)
      toast.success(`Utilisateur ${userToDelete.name} supprimé définitivement`)
    } catch (err: any) {
      console.error('Error deleting user:', err)
      const errorMessage = err?.message || 'Erreur lors de la suppression de l\'utilisateur'
      toast.error(errorMessage)
    }
  }

  const handleShowDeleteConfirmation = (subscriptionId: string, planName: string) => {
    setSubscriptionToDelete({ id: subscriptionId, planName })
    setShowDeleteConfirmation(true)
  }

  const handleShowModifySubscription = (subscription: UserSubscription) => {
    setSubscriptionToModify(subscription)
    // Pre-fill form with current subscription data
    setModifySubscriptionForm({
      plan_id: subscription.plan_id,
      start_date: subscription.start_date,
      end_date: subscription.end_date
    })
    setShowModifySubscriptionDialog(true)
  }

  // Helper function to calculate end date based on plan and start date
  const calculateEndDate = (planId: string, startDate: string): string => {
    if (!planId || !startDate) return ''

    const selectedPlan = plans.find(p => p.id === planId)
    if (!selectedPlan || !selectedPlan.validity_months) return ''

    const start = new Date(startDate)
    const end = new Date(start)
    end.setMonth(end.getMonth() + selectedPlan.validity_months)

    return format(end, 'yyyy-MM-dd')
  }

  const handleDeleteSubscription = async () => {
    if (!subscriptionToDelete) return

    try {
      console.log('Attempting to delete subscription with ID:', subscriptionToDelete.id)

      // First, check if the subscription exists
      const { data: existingSubscription, error: checkError } = await supabase
        .from('user_subscriptions')
        .select('id, status')
        .eq('id', subscriptionToDelete.id)
        .single()

      if (checkError) {
        console.error('Error checking subscription existence:', checkError)
        throw new Error(`Erreur lors de la vérification: ${checkError.message}`)
      }

      if (!existingSubscription) {
        throw new Error('Abonnement introuvable')
      }

      console.log('Found subscription to delete:', existingSubscription)

      // Delete related records first to avoid foreign key constraint violations

      // Delete all bookings that reference this subscription
      const { error: bookingsDeleteError } = await supabase
        .from('class_bookings')
        .delete()
        .eq('subscription_id', subscriptionToDelete.id)

      if (bookingsDeleteError) {
        console.error('Error deleting related bookings:', bookingsDeleteError)
        throw new Error(`Erreur lors de la suppression des réservations: ${bookingsDeleteError.message}`)
      }

      // Delete all waitlist entries that reference this subscription
      const { error: waitlistDeleteError } = await supabase
        .from('class_waitlist')
        .delete()
        .eq('subscription_id', subscriptionToDelete.id)

      if (waitlistDeleteError) {
        console.error('Error deleting related waitlist entries:', waitlistDeleteError)
        throw new Error(`Erreur lors de la suppression des entrées de liste d'attente: ${waitlistDeleteError.message}`)
      }

      // Delete any subscription requests that reference this subscription
      const { error: subscriptionRequestsDeleteError } = await supabase
        .from('subscription_requests')
        .update({ resulting_subscription_id: null })
        .eq('resulting_subscription_id', subscriptionToDelete.id)

      if (subscriptionRequestsDeleteError) {
        console.error('Error updating related subscription requests:', subscriptionRequestsDeleteError)
        throw new Error(`Erreur lors de la mise à jour des demandes d'abonnement: ${subscriptionRequestsDeleteError.message}`)
      }

      console.log('Successfully deleted/updated related records')

      // Now delete the subscription record
      const { error: deleteError } = await supabase
        .from('user_subscriptions')
        .delete()
        .eq('id', subscriptionToDelete.id)

      if (deleteError) {
        console.error('Supabase delete error details:', deleteError)
        throw new Error(`Erreur de suppression: ${deleteError.message || deleteError.details || 'Erreur inconnue'}`)
      }

      console.log('Successfully deleted subscription')

      // Refresh data
      if (selectedUser) {
        await fetchUserSubscriptions(selectedUser.id)
        await fetchUsers(0)
      }

      // Close confirmation dialog
      setShowDeleteConfirmation(false)
      setSubscriptionToDelete(null)

      toast.success('Abonnement supprimé définitivement')
    } catch (err: any) {
      console.error('Error deleting subscription:', err)
      const errorMessage = err?.message || err?.details || 'Erreur inconnue lors de la suppression'
      toast.error(`Erreur: ${errorMessage}`)
    }
  }

  const handleModifySubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subscriptionToModify || !selectedUser) return

    try {
      // Validation
      if (new Date(modifySubscriptionForm.start_date) >= new Date(modifySubscriptionForm.end_date)) {
        throw new Error('La date de fin doit être postérieure à la date de début')
      }

      console.log('Modifying subscription with data:', modifySubscriptionForm)

      // Fetch the new plan's details to get the credits
      const { data: newPlan, error: planError } = await supabase
        .from('subscription_plans')
        .select('credits')
        .eq('id', modifySubscriptionForm.plan_id)
        .single()

      if (planError) throw planError

      // Update subscription in database
      const { error } = await supabase
        .from('user_subscriptions')
        .update({
          plan_id: modifySubscriptionForm.plan_id,
          credits_remaining: newPlan.credits,
          start_date: modifySubscriptionForm.start_date,
          end_date: modifySubscriptionForm.end_date,
          updated_at: new Date().toISOString()
        })
        .eq('id', subscriptionToModify.id)

      if (error) throw error


      // Refresh data
      await fetchUserSubscriptions(selectedUser.id)
      await fetchUsers(0)

      // Close dialog and reset form
      setShowModifySubscriptionDialog(false)
      setSubscriptionToModify(null)
      setModifySubscriptionForm({
        plan_id: '',
        start_date: '',
        end_date: ''
      })

      toast.success('Abonnement modifié avec succès')
    } catch (err: any) {
      console.error('Error modifying subscription:', err)
      const errorMessage = err?.message || 'Erreur lors de la modification de l\'abonnement'
      toast.error(errorMessage)
    }
  }

  const handleAssignNewSubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return

    try {
      const result = await assignSubscriptionToUser({
        userId: selectedUser.id,
        planId: subscriptionForm.plan_id,
        startDate: subscriptionForm.start_date
      })

      if (!result.success) {
        throw new Error(result.error || 'Erreur lors de l\'attribution de l\'abonnement')
      }

      // Refresh subscriptions and users data
      await fetchUserSubscriptions(selectedUser.id)
      await fetchUsers(0)

      // Reset form
      setSubscriptionForm({
        plan_id: '',
        start_date: format(new Date(), 'yyyy-MM-dd')
      })

      toast.success(`Nouvel abonnement assigné à ${selectedUser.full_name}`)
    } catch (err: any) {
      console.error('Error assigning subscription:', err)
      toast.error(`Erreur lors de l'assignation: ${err?.message || 'Erreur inconnue'}`)
    }
  }

  // Fetch upcoming classes for booking
  const fetchUpcomingClasses = async () => {
    try {
      setLoadingClasses(true)
      const now = new Date()
      const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

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
            coach,
            location,
            difficulty_level,
            max_capacity
          )
        `)
        .gte('start_datetime', now.toISOString())
        .lte('start_datetime', twoWeeksFromNow.toISOString())
        .eq('is_cancelled', false)
        .order('start_datetime', { ascending: true })
        .limit(50)

      if (error) throw error

      setUpcomingClasses(data || [])
    } catch (err: any) {
      console.error('Error fetching classes:', err)
      toast.error('Erreur lors du chargement des cours')
    } finally {
      setLoadingClasses(false)
    }
  }

  // Book class for user
  const handleAdminBookClass = async (scheduleId: string) => {
    if (!selectedUser || !selectedSubscriptionForBooking) {
      toast.error('Veuillez sélectionner un abonnement')
      return
    }

    try {
      // Create booking directly
      const { error: bookingError } = await supabase
        .from('class_bookings')
        .insert({
          user_id: selectedUser.id,
          schedule_id: scheduleId,
          subscription_id: selectedSubscriptionForBooking,
          status: 'confirmed',
          created_at: new Date().toISOString()
        })

      if (bookingError) throw bookingError

      // Update credits
      const subscription = userSubscriptions.find(s => s.id === selectedSubscriptionForBooking)
      if (subscription) {
        const subscriptionType = subscription.plan_type

        if (subscriptionType === 'abonnement') {
          // Increment weekly credits used
          const { error: updateError } = await supabase
            .from('user_subscriptions')
            .update({
              weekly_credits_used: (subscription.weekly_credits_used || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', selectedSubscriptionForBooking)

          if (updateError) throw updateError
        } else {
          // Decrement credits remaining and increment credits used for carnet/PT
          const { error: updateError } = await supabase
            .from('user_subscriptions')
            .update({
              credits_remaining: Math.max(0, subscription.credits_remaining - 1),
              credits_used: (subscription.credits_used || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', selectedSubscriptionForBooking)

          if (updateError) throw updateError
        }
      }

      // Update current_bookings count
      const classData = upcomingClasses.find(c => c.id === scheduleId)
      if (classData) {
        const { error: scheduleError } = await supabase
          .from('class_schedules')
          .update({
            current_bookings: classData.current_bookings + 1
          })
          .eq('id', scheduleId)

        if (scheduleError) throw scheduleError
      }

      toast.success('Réservation effectuée avec succès')

      // Refresh data
      await fetchUpcomingClasses()
      await fetchUserSubscriptions(selectedUser.id)
      await fetchUsers(0)
    } catch (err: any) {
      console.error('Error booking class:', err)
      toast.error(`Erreur lors de la réservation: ${err.message}`)
    }
  }

  // Increment/Decrement credits
  const handleAdjustCredits = async (action: 'increment' | 'decrement') => {
    if (!selectedSubscriptionForCredits || creditAmount <= 0) return

    try {
      const subscription = selectedSubscriptionForCredits
      const amount = action === 'increment' ? creditAmount : -creditAmount

      // Get current admin user
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) {
        toast.error('Session expirée. Veuillez vous reconnecter.')
        return
      }

      let updateData: any = {
        updated_at: new Date().toISOString()
      }

      let previousValue: number
      let newValue: number
      let fieldModified: string

      if (subscription.plan_type === 'abonnement') {
        // For abonnement, modify weekly_credits_used
        previousValue = subscription.weekly_credits_used || 0
        newValue = Math.max(0, previousValue + amount)

        // Check if it exceeds weekly limit
        if (newValue > (subscription.weekly_limit || 0)) {
          toast.error(`La limite hebdomadaire est de ${subscription.weekly_limit} crédits`)
          return
        }

        updateData.weekly_credits_used = newValue
        fieldModified = 'weekly_credits_used'
      } else {
        // For carnet/personal training, modify credits_remaining and credits_used
        previousValue = subscription.credits_remaining
        newValue = Math.max(0, previousValue + amount)
        const newCreditsUsed = Math.max(0, subscription.credits_used - amount)

        updateData.credits_remaining = newValue
        updateData.credits_used = newCreditsUsed
        fieldModified = 'credits_remaining'
      }

      const { error } = await supabase
        .from('user_subscriptions')
        .update(updateData)
        .eq('id', subscription.id)

      if (error) throw error

      // Log the credit change
      const { error: logError } = await supabase
        .from('credit_change_logs')
        .insert({
          user_id: selectedUser!.id,
          subscription_id: subscription.id,
          admin_id: currentUser.id,
          previous_value: previousValue,
          new_value: newValue,
          change_amount: amount,
          subscription_type: subscription.plan_type,
          field_modified: fieldModified
        })

      if (logError) {
        console.error('Error logging credit change:', logError)
        // Don't fail the operation if logging fails
      }

      toast.success(`Crédits ${action === 'increment' ? 'ajoutés' : 'retirés'} avec succès`)

      // Refresh data
      if (selectedUser) {
        await fetchUserSubscriptions(selectedUser.id)
        await fetchUsers(0)
      }

      setShowCreditDialog(false)
      setCreditAmount(1)
      setSelectedSubscriptionForCredits(null)
    } catch (err: any) {
      console.error('Error adjusting credits:', err)
      toast.error(`Erreur lors de la modification des crédits: ${err.message}`)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">En attente</Badge>
      case 'active':
        return <Badge variant="secondary">Actif</Badge>
      case 'expired':
        return <Badge variant="secondary">Expiré</Badge>
      case 'inactive':
        return <Badge variant="secondary">Inactif</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getStats = () => {
    // Use filtered users for stats calculation
    const dataSource = filteredUsers.length > 0 ? filteredUsers : allUsers
    const pendingUsers = dataSource.filter(u => u.subscription_status === 'pending')
    const pendingCount = pendingUsers.length
    const pendingWithRequests = pendingUsers.filter(u => u.has_subscription_request).length
    const pendingWithoutRequests = pendingUsers.filter(u => !u.has_subscription_request).length
    const activeCount = dataSource.filter(u => u.subscription_status === 'active').length
    const expiredCount = dataSource.filter(u => u.subscription_status === 'expired').length
    const inactiveCount = dataSource.filter(u => u.subscription_status === 'inactive').length

    return {
      pending: pendingCount,
      pendingWithRequests,
      pendingWithoutRequests,
      active: activeCount,
      expired: expiredCount,
      inactive: inactiveCount,
      total: dataSource.length,
      needsAttention: pendingCount
    }
  }

  const stats = getStats()
  const totalPages = Math.ceil(filteredTotalCount / pageSize)

  const handlePageChange = (newPage: number) => {
    if (newPage >= 0 && newPage < totalPages) {
      applyFilters(allUsers, newPage)
    }
  }

  const handleClearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setPlanInformeFilter('all')
  }

  if (loading && users.length === 0) {
    return (
      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Utilisateurs</h1>
            <p className="text-muted-foreground mt-2">
              Gérer tous les utilisateurs inscrits
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" disabled>
              <IconDownload className="h-4 w-4" />
              Exporter
            </Button>
            <Button variant="outline" className="gap-2" disabled>
              <IconRefresh className="h-4 w-4" />
              Actualiser
            </Button>
          </div>
        </div>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Chargement des utilisateurs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Utilisateurs</h1>
          <p className="text-muted-foreground mt-2">
            Gérer tous les utilisateurs inscrits
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleExport}
            variant="outline"
            className="gap-2"
            disabled={filteredUsers.length === 0}
          >
            <IconDownload className="h-4 w-4" />
            Exporter
          </Button>
          <Button onClick={handleRefresh} variant="outline" className="gap-2">
            <IconRefresh className="h-4 w-4" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Attente</CardTitle>
            <IconUserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
            {stats.pending > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {stats.pendingWithRequests} informés • {stats.pendingWithoutRequests} non informés
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actifs</CardTitle>
            <IconUserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactifs</CardTitle>
            <IconUserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inactive}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <IconUsers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconSearch className="h-4 w-4" />
            Recherche et filtres
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1">
              <div className="relative">
                <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom, email, téléphone ou plan informé..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="w-full sm:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrer par statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="inactive">Inactif</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Plan Informé Filter */}
            <div className="w-full sm:w-48">
              <Select value={planInformeFilter} onValueChange={setPlanInformeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Plan informé" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous (Plan informé)</SelectItem>
                  <SelectItem value="oui">Oui</SelectItem>
                  <SelectItem value="non">Non</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters */}
            {(searchTerm || statusFilter !== 'all' || planInformeFilter !== 'all') && (
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className="w-full sm:w-auto"
              >
                <IconX className="h-4 w-4 mr-2" />
                Effacer
              </Button>
            )}
          </div>

          {/* Results Summary */}
          {(searchTerm || statusFilter !== 'all' || planInformeFilter !== 'all') && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                {filteredTotalCount} utilisateur{filteredTotalCount !== 1 ? 's' : ''} trouvé{filteredTotalCount !== 1 ? 's' : ''}
                {searchTerm && ` pour "${searchTerm}"`}
                {statusFilter !== 'all' && ` avec le statut "${statusFilter}"`}
                {planInformeFilter !== 'all' && ` plan informé "${planInformeFilter}"`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {users.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">
              {(searchTerm || statusFilter !== 'all' || planInformeFilter !== 'all') ? 'Aucun résultat trouvé' : 'Aucun utilisateur trouvé'}
            </h3>
            <p className="text-muted-foreground">
              {(searchTerm || statusFilter !== 'all' || planInformeFilter !== 'all')
                ? 'Essayez de modifier vos critères de recherche ou de supprimer les filtres.'
                : 'Les utilisateurs apparaîtront ici une fois qu\'ils se seront inscrits.'
              }
            </p>
            {(searchTerm || statusFilter !== 'all' || planInformeFilter !== 'all') && (
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className="mt-4"
              >
                <IconX className="h-4 w-4 mr-2" />
                Effacer les filtres
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">Téléphone</TableHead>
                  <TableHead className="hidden xl:table-cell">Plan Informé</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden lg:table-cell">Date d'inscription</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">{user.full_name}</div>
                      <div className="text-xs text-muted-foreground sm:hidden break-all">{user.email}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-sm">{user.email}</div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="text-sm">
                        {user.phone ? (
                          <div className="flex items-center gap-1">
                            <IconPhone className="h-3 w-3" />
                            {user.phone}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Non renseigné</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <div className="text-sm">
                        {user.has_subscription_request ? (
                          <Badge variant="secondary">Oui</Badge>
                        ) : (
                          <Badge variant="secondary">Non</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(user.subscription_status)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="text-sm">
                        {format(new Date(user.created_at), 'dd/MM/yyyy', { locale: fr })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user)
                            fetchUserSubscriptions(user.id)
                            setShowSubscriptionManagementDialog(true)
                          }}
                        >
                          <IconCreditCard className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Gérer abonnement</span>
                          <span className="sr-only sm:hidden">Gérer abonnement</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination Controls */}
      {(totalPages > 1 || (searchTerm || statusFilter !== 'all' || planInformeFilter !== 'all')) && filteredTotalCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            Page {currentPage + 1} sur {totalPages} •
            Affichage de {Math.min(currentPage * pageSize + 1, filteredTotalCount)} à {Math.min((currentPage + 1) * pageSize, filteredTotalCount)} sur {filteredTotalCount} résultat{filteredTotalCount !== 1 ? 's' : ''}
            {(searchTerm || statusFilter !== 'all' || planInformeFilter !== 'all') && ` filtrés (${totalCount} au total)`}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 0}
            >
              <IconChevronLeft className="h-4 w-4" />
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
            >
              Suivant
              <IconChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Subscription Details Dialog */}
      <Dialog open={showSubscriptionDetailsDialog} onOpenChange={setShowSubscriptionDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails de l'abonnement</DialogTitle>
          </DialogHeader>

          {selectedUser && selectedUser.active_subscription && (
            <div className="space-y-6">
              {/* User Info */}
              <div>
                <h4 className="text-sm font-medium mb-2 text-foreground">Utilisateur</h4>
                <div className="bg-muted/20 rounded-lg p-3">
                  <p className="text-sm font-medium">{selectedUser.full_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  {selectedUser.phone && (
                    <p className="text-sm text-muted-foreground">{selectedUser.phone}</p>
                  )}
                </div>
              </div>

              {/* Plan Details */}
              <div>
                <h4 className="text-sm font-medium mb-2 text-foreground">Détails du plan</h4>
                <div className="bg-muted/20 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-xs font-medium text-muted-foreground mb-1">Plan</h5>
                      <p className="text-sm font-medium">{selectedUser.active_subscription.plan_name}</p>
                    </div>
                    <div>
                      <h5 className="text-xs font-medium text-muted-foreground mb-1">Statut</h5>
                      <Badge variant="secondary">
                        {selectedUser.active_subscription.status === 'active' ? 'Actif' :
                         selectedUser.active_subscription.status === 'expired' ? 'Expiré' :
                         selectedUser.active_subscription.status === 'cancelled' ? 'Annulé' :
                         selectedUser.active_subscription.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-xs font-medium text-muted-foreground mb-1">Date de début</h5>
                      <p className="text-sm">
                        {selectedUser.active_subscription.start_date
                          ? format(new Date(selectedUser.active_subscription.start_date), 'dd/MM/yyyy', { locale: fr })
                          : 'Non spécifiée'
                        }
                      </p>
                    </div>
                    <div>
                      <h5 className="text-xs font-medium text-muted-foreground mb-1">Date d'expiration</h5>
                      <p className="text-sm font-medium">
                        {format(new Date(selectedUser.active_subscription.end_date), 'dd/MM/yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Credits Info */}
              <div>
                <h4 className="text-sm font-medium mb-2 text-foreground">Utilisation des crédits</h4>
                <div className="bg-muted/20 rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <h5 className="text-xs font-medium text-muted-foreground mb-1">Restants</h5>
                      <p className="text-lg font-bold font-mono text-foreground">
                        {selectedUser.active_subscription.credits_remaining}
                      </p>
                    </div>
                    <div className="text-center">
                      <h5 className="text-xs font-medium text-muted-foreground mb-1">Utilisés</h5>
                      <p className="text-lg font-bold font-mono text-foreground">
                        {selectedUser.active_subscription.credits_used || 0}
                      </p>
                    </div>
                    {selectedUser.active_subscription.weekly_limit && (
                      <div className="text-center">
                        <h5 className="text-xs font-medium text-muted-foreground mb-1">Cette semaine</h5>
                        <p className="text-lg font-bold font-mono text-foreground">
                          {selectedUser.active_subscription.weekly_credits_used || 0}/{selectedUser.active_subscription.weekly_limit}
                        </p>
                      </div>
                    )}
                  </div>

                  {selectedUser.active_subscription.plan_price && (
                    <div className="pt-2 border-t border-border">
                      <div className="text-center">
                        <h5 className="text-xs font-medium text-muted-foreground mb-1">Prix du plan</h5>
                        <p className="text-sm font-medium">{selectedUser.active_subscription.plan_price} DHS</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => setShowSubscriptionDetailsDialog(false)}
                  className="w-full"
                >
                  Fermer
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    handleDeactivateUser(selectedUser.id, selectedUser.full_name)
                    setShowSubscriptionDetailsDialog(false)
                  }}
                  className="w-full border-foreground text-foreground hover:bg-foreground hover:text-background"
                >
                  <IconUserMinus className="h-4 w-4 mr-2" />
                  Désactiver l'utilisateur
                </Button>
              </div>
            </div>
          )}

          {selectedUser && !selectedUser.active_subscription && (
            <div className="space-y-6">
              {/* User Info */}
              <div>
                <h4 className="text-sm font-medium mb-2 text-foreground">Utilisateur</h4>
                <div className="bg-muted/20 rounded-lg p-3">
                  <p className="text-sm font-medium">{selectedUser.full_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  {selectedUser.phone && (
                    <p className="text-sm text-muted-foreground">{selectedUser.phone}</p>
                  )}
                </div>
              </div>

              {/* No Subscription */}
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <IconCreditCard className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">Aucun abonnement actif trouvé</p>
                <p className="text-sm text-muted-foreground mt-1">Cet utilisateur n'a pas d'abonnement actif</p>
              </div>

              {/* Actions */}
              <div className="flex justify-center pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => setShowSubscriptionDetailsDialog(false)}
                  className="w-full"
                >
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Subscription Assignment Dialog */}
      <Dialog open={showSubscriptionDialog} onOpenChange={setShowSubscriptionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assigner un Abonnement</DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <form onSubmit={handleAssignSubscription} className="space-y-4">
              <div>
                <p className="text-sm font-medium">
                  Utilisateur: {selectedUser.full_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedUser.email}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="plan_id">Plan d'abonnement</Label>
                <Select
                  value={subscriptionForm.plan_id}
                  onValueChange={(value) => setSubscriptionForm(prev => ({ ...prev, plan_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{plan.name}</span>
                          <span className="ml-2 text-sm text-muted-foreground">
                            {plan.price_dhs} DHS
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_date">Date de début</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={subscriptionForm.start_date}
                  onChange={(e) => setSubscriptionForm(prev => ({ ...prev, start_date: e.target.value }))}
                  required
                />
              </div>


              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowSubscriptionDialog(false)}>
                  Annuler
                </Button>
                <Button type="submit">
                  Assigner l'abonnement
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Comprehensive Subscription Management Dialog */}
      <Dialog open={showSubscriptionManagementDialog} onOpenChange={setShowSubscriptionManagementDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconSettings className="h-5 w-5" />
              Gestion des abonnements
            </DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-6">
              {/* User Info */}
              <Card className="border-muted-foreground/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-xl font-semibold text-foreground">{selectedUser.full_name}</h3>
                      <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                      {selectedUser.phone && (
                        <p className="text-sm text-muted-foreground">{selectedUser.phone}</p>
                      )}
                    </div>
                    <div className="text-right space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Statut</div>
                      {getStatusBadge(selectedUser.subscription_status)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="subscriptions" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 gap-1">
                  <TabsTrigger value="subscriptions" className="text-xs md:text-sm">Abonnements</TabsTrigger>
                  <TabsTrigger value="assign" className="text-xs md:text-sm">Assigner</TabsTrigger>
                  <TabsTrigger value="booking" className="text-xs md:text-sm">Réserver</TabsTrigger>
                  <TabsTrigger value="credits" className="text-xs md:text-sm">Crédits</TabsTrigger>
                  <TabsTrigger value="user-actions" className="text-xs md:text-sm col-span-2 md:col-span-1">Actions</TabsTrigger>
                </TabsList>

                {/* Current and Historical Subscriptions */}
                <TabsContent value="subscriptions" className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-foreground">Abonnements</h3>
                    <Badge variant="secondary" className="text-xs">
                      {userSubscriptions.length} abonnement{userSubscriptions.length > 1 ? 's' : ''}
                    </Badge>
                  </div>

                  {loadingSubscriptions ? (
                    <Card className="border-muted-foreground/20">
                      <CardContent className="text-center py-12">
                        <p className="text-muted-foreground">Chargement des abonnements...</p>
                      </CardContent>
                    </Card>
                  ) : userSubscriptions.length === 0 ? (
                    <Card className="border-muted-foreground/20">
                      <CardContent className="text-center py-12">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                          <IconCreditCard className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-foreground font-semibold text-lg mb-2">Aucun abonnement trouvé</p>
                        <p className="text-sm text-muted-foreground">Assignez un premier abonnement à cet utilisateur</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {userSubscriptions.map((subscription) => (
                        <Card key={subscription.id} className={`border-2 ${
                          subscription.status === 'active'
                            ? 'border-primary/20 bg-primary/5'
                            : subscription.status === 'expired'
                            ? 'border-muted-foreground/20 bg-muted/20'
                            : 'border-muted-foreground/20 bg-muted/10'
                        }`}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <CardTitle className="text-lg">{subscription.plan_name}</CardTitle>
                                <p className="text-sm text-muted-foreground capitalize">{subscription.plan_type}</p>
                              </div>
                              <Badge
                                variant={subscription.status === 'active' ? 'default' : 'secondary'}
                              >
                                {subscription.status === 'active' ? 'Actif' :
                                 subscription.status === 'expired' ? 'Expiré' : 'Annulé'}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {/* Usage Statistics */}
                            <div className={`grid gap-6 ${subscription.weekly_limit ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
                              <div className="text-center space-y-2">
                                <div className="text-2xl font-bold text-foreground">
                                  {subscription.credits_remaining}
                                </div>
                                <div className="text-xs font-medium text-muted-foreground">Crédits restants</div>
                              </div>
                              <div className="text-center space-y-2">
                                <div className="text-2xl font-bold text-foreground">
                                  {subscription.credits_used}
                                </div>
                                <div className="text-xs font-medium text-muted-foreground">Crédits utilisés</div>
                              </div>
                              {subscription.weekly_limit && (
                                <div className="text-center space-y-2">
                                  <div className="text-2xl font-bold text-foreground">
                                    {subscription.weekly_credits_used}/{subscription.weekly_limit}
                                  </div>
                                  <div className="text-xs font-medium text-muted-foreground">Cette semaine</div>
                                </div>
                              )}
                              <div className="text-center space-y-2">
                                <div className="text-2xl font-bold text-foreground">
                                  {subscription.plan_price} DH
                                </div>
                                <div className="text-xs font-medium text-muted-foreground">Prix</div>
                              </div>
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-border">
                              <div className="text-center space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">Date de début</div>
                                <div className="text-sm font-semibold text-foreground">
                                  {format(new Date(subscription.start_date), 'dd MMM yyyy', { locale: fr })}
                                </div>
                              </div>
                              <div className="text-center space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">Date d'expiration</div>
                                <div className="text-sm font-semibold text-foreground">
                                  {format(new Date(subscription.end_date), 'dd MMM yyyy', { locale: fr })}
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            {subscription.status === 'active' && (
                              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleShowModifySubscription(subscription)}
                                  className="text-muted-foreground hover:text-foreground hover:bg-muted/10"
                                >
                                  <IconEdit className="h-4 w-4 mr-2" />
                                  Modifier
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleShowDeleteConfirmation(subscription.id, subscription.plan_name)}
                                  className="text-muted-foreground hover:text-foreground hover:bg-muted/10"
                                >
                                  <IconTrash className="h-4 w-4 mr-2" />
                                  Supprimer
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Assign New Subscription */}
                <TabsContent value="assign" className="space-y-6">
                  <h3 className="text-xl font-semibold text-foreground">Assigner un nouvel abonnement</h3>

                  <Card className="border-muted-foreground/20">
                    <CardContent className="p-6">
                      <form onSubmit={handleAssignNewSubscription} className="space-y-6">
                        <div className="space-y-3">
                          <Label htmlFor="new_plan_id" className="text-sm font-medium text-foreground">Plan d'abonnement</Label>
                          <Select
                            value={subscriptionForm.plan_id}
                            onValueChange={(value) => setSubscriptionForm(prev => ({ ...prev, plan_id: value }))}
                          >
                            <SelectTrigger className="h-12">
                              <SelectValue placeholder="Sélectionner un plan" />
                            </SelectTrigger>
                            <SelectContent>
                              {plans.map((plan) => (
                                <SelectItem key={plan.id} value={plan.id}>
                                  <div className="flex items-center justify-between w-full">
                                    <span className="font-medium">{plan.name}</span>
                                    <span className="ml-3 text-sm text-muted-foreground">
                                      {plan.price_dhs} DH
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-3">
                          <Label htmlFor="new_start_date" className="text-sm font-medium text-foreground">Date de début</Label>
                          <Input
                            id="new_start_date"
                            type="date"
                            value={subscriptionForm.start_date}
                            onChange={(e) => setSubscriptionForm(prev => ({ ...prev, start_date: e.target.value }))}
                            required
                            className="h-12"
                          />
                        </div>

                        <div className="flex justify-end pt-4 border-t border-border">
                          <Button type="submit" disabled={!subscriptionForm.plan_id} className="h-12 px-6">
                            <IconPlus className="h-4 w-4 mr-2" />
                            Assigner l'abonnement
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Book Classes Tab */}
                <TabsContent value="booking" className="space-y-6">
                  <h3 className="text-xl font-semibold text-foreground">Réserver un cours pour {selectedUser.full_name}</h3>

                  {userSubscriptions.filter(s => s.status === 'active').length === 0 ? (
                    <Card className="border-muted-foreground/20">
                      <CardContent className="text-center py-12">
                        <IconCalendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-foreground font-semibold text-lg mb-2">Aucun abonnement actif</p>
                        <p className="text-sm text-muted-foreground">
                          L'utilisateur doit avoir un abonnement actif pour réserver des cours
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <Card className="border-muted-foreground/20">
                        <CardHeader>
                          <CardTitle className="text-lg">Sélectionner l'abonnement à utiliser</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Select value={selectedSubscriptionForBooking} onValueChange={setSelectedSubscriptionForBooking}>
                            <SelectTrigger className="h-12">
                              <SelectValue placeholder="Choisir un abonnement" />
                            </SelectTrigger>
                            <SelectContent>
                              {userSubscriptions
                                .filter(s => s.status === 'active')
                                .map((sub) => (
                                  <SelectItem key={sub.id} value={sub.id}>
                                    <div className="flex items-center justify-between w-full">
                                      <span className="font-medium">{sub.plan_name}</span>
                                      <span className="ml-3 text-sm text-muted-foreground">
                                        {sub.plan_type === 'abonnement'
                                          ? `${sub.weekly_credits_used}/${sub.weekly_limit} cette semaine`
                                          : `${sub.credits_remaining} crédits restants`
                                        }
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>

                      <Card className="border-muted-foreground/20">
                        <CardHeader className="flex flex-row items-center justify-between">
                          <CardTitle className="text-lg">Cours disponibles (14 prochains jours)</CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchUpcomingClasses}
                            disabled={loadingClasses}
                          >
                            <IconRefresh className={`h-4 w-4 mr-2 ${loadingClasses ? 'animate-spin' : ''}`} />
                            Actualiser
                          </Button>
                        </CardHeader>
                        <CardContent>
                          {loadingClasses ? (
                            <div className="text-center py-8">
                              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                              <p className="text-muted-foreground">Chargement des cours...</p>
                            </div>
                          ) : upcomingClasses.length === 0 ? (
                            <div className="text-center py-8">
                              <IconCalendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                              <p className="text-muted-foreground">Aucun cours disponible pour les 14 prochains jours</p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={fetchUpcomingClasses}
                                className="mt-4"
                              >
                                Charger les cours
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                              {upcomingClasses.map((classSchedule) => {
                                const classInfo = classSchedule.classes
                                const isFull = classSchedule.current_bookings >= classInfo.max_capacity

                                return (
                                  <Card key={classSchedule.id} className={`border ${isFull ? 'opacity-60' : ''}`}>
                                    <CardContent className="p-4">
                                      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                                        <div className="flex-1 space-y-2 w-full">
                                          <div className="flex items-center justify-between">
                                            <h4 className="font-semibold text-foreground">{classInfo.title}</h4>
                                            <Badge variant={isFull ? 'secondary' : 'default'} className="ml-2">
                                              {classSchedule.current_bookings}/{classInfo.max_capacity}
                                            </Badge>
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                              <IconCalendar className="h-3 w-3 shrink-0" />
                                              <span className="truncate">{format(new Date(classSchedule.start_datetime), 'EEE d MMM yyyy', { locale: fr })}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <IconClock className="h-3 w-3 shrink-0" />
                                              {format(new Date(classSchedule.start_datetime), 'HH:mm', { locale: fr })}
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <IconUser className="h-3 w-3 shrink-0" />
                                              <span className="truncate">{classInfo.coach}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <IconMapPin className="h-3 w-3 shrink-0" />
                                              <span className="truncate">{classInfo.location}</span>
                                            </div>
                                          </div>
                                        </div>
                                        <Button
                                          size="sm"
                                          onClick={() => handleAdminBookClass(classSchedule.id)}
                                          disabled={isFull || !selectedSubscriptionForBooking}
                                          className="w-full sm:w-auto shrink-0"
                                        >
                                          {isFull ? 'Complet' : 'Réserver'}
                                        </Button>
                                      </div>
                                    </CardContent>
                                  </Card>
                                )
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}
                </TabsContent>

                {/* Credit Management Tab */}
                <TabsContent value="credits" className="space-y-6">
                  <h3 className="text-xl font-semibold text-foreground">Gérer les crédits</h3>

                  {userSubscriptions.filter(s => s.status === 'active').length === 0 ? (
                    <Card className="border-muted-foreground/20">
                      <CardContent className="text-center py-12">
                        <IconCoin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-foreground font-semibold text-lg mb-2">Aucun abonnement actif</p>
                        <p className="text-sm text-muted-foreground">
                          L'utilisateur doit avoir un abonnement actif pour gérer les crédits
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4">
                      {userSubscriptions
                        .filter(s => s.status === 'active')
                        .map((subscription) => {
                          const isAbonnement = subscription.plan_type === 'abonnement'

                          return (
                            <Card key={subscription.id} className="border-2 border-primary/20">
                              <CardHeader>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <CardTitle className="text-lg">{subscription.plan_name}</CardTitle>
                                    <p className="text-sm text-muted-foreground capitalize">{subscription.plan_type}</p>
                                  </div>
                                  <Badge variant="default">Actif</Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {isAbonnement ? (
                                  // Abonnement: Show weekly credits
                                  <div className="grid grid-cols-2 gap-6">
                                    <div className="text-center space-y-2">
                                      <div className="text-3xl font-bold text-foreground">
                                        {subscription.weekly_credits_used || 0}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">Crédits utilisés cette semaine</div>
                                    </div>
                                    <div className="text-center space-y-2">
                                      <div className="text-3xl font-bold text-foreground">
                                        {subscription.weekly_limit || 0}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">Limite hebdomadaire</div>
                                    </div>
                                  </div>
                                ) : (
                                  // Carnet/PT: Show remaining and used credits
                                  <div className="grid grid-cols-2 gap-6">
                                    <div className="text-center space-y-2">
                                      <div className="text-3xl font-bold text-foreground">
                                        {subscription.credits_remaining}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">Crédits restants</div>
                                    </div>
                                    <div className="text-center space-y-2">
                                      <div className="text-3xl font-bold text-foreground">
                                        {subscription.credits_used}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">Crédits utilisés</div>
                                    </div>
                                  </div>
                                )}

                                <div className="flex gap-2 pt-4 border-t border-border">
                                  <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => {
                                      setSelectedSubscriptionForCredits(subscription)
                                      setShowCreditDialog(true)
                                    }}
                                    disabled={isAbonnement && (subscription.weekly_credits_used || 0) >= (subscription.weekly_limit || 0)}
                                  >
                                    <IconPlus className="h-4 w-4 mr-2" />
                                    {isAbonnement ? 'Ajouter utilisation' : 'Ajouter crédits'}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => {
                                      setSelectedSubscriptionForCredits(subscription)
                                      setCreditAmount(1)
                                      handleAdjustCredits('decrement')
                                    }}
                                    disabled={
                                      isAbonnement
                                        ? (subscription.weekly_credits_used || 0) === 0
                                        : subscription.credits_remaining === 0
                                    }
                                  >
                                    <IconMinus className="h-4 w-4 mr-2" />
                                    {isAbonnement ? 'Retirer utilisation' : 'Retirer crédits'}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                    </div>
                  )}
                </TabsContent>

                {/* User Actions */}
                <TabsContent value="user-actions" className="space-y-6">
                  <h3 className="text-xl font-semibold text-foreground">Actions utilisateur</h3>

                  <Card className="border-muted-foreground/20">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-foreground flex items-center gap-3">
                        <IconUserMinus className="h-5 w-5" />
                        Désactiver l'utilisateur
                      </CardTitle>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Cette action désactivera l'utilisateur et annulera tous ses abonnements actifs.
                        L'utilisateur ne pourra plus se connecter à son compte.
                      </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex justify-end pt-4 border-t border-border">
                        <Button
                          variant="outline"
                          onClick={() => {
                            handleDeactivateUser(selectedUser.id, selectedUser.full_name)
                            setShowSubscriptionManagementDialog(false)
                          }}
                          className="border-foreground text-foreground hover:bg-foreground hover:text-background h-12 px-6"
                        >
                          <IconUserMinus className="h-4 w-4 mr-2" />
                          Désactiver définitivement
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-muted-foreground/20">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-foreground flex items-center gap-3">
                        <IconTrash className="h-5 w-5" />
                        Supprimer l'utilisateur
                      </CardTitle>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        <strong>Attention :</strong> Cette action est irréversible et supprimera définitivement toutes les données de l'utilisateur, incluant :
                      </p>
                      <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground ml-4">
                        <li>Le profil utilisateur et ses informations</li>
                        <li>Tous les abonnements (actifs, expirés, annulés)</li>
                        <li>Toutes les réservations de cours</li>
                        <li>Toutes les entrées de liste d'attente</li>
                        <li>Les demandes d'abonnement</li>
                        <li>Les logs WhatsApp</li>
                        <li>Le compte d'authentification</li>
                      </ul>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex justify-end pt-4 border-t border-border">
                        <Button
                          variant="outline"
                          onClick={() => handleShowDeleteUserConfirmation(selectedUser)}
                          className="border-foreground text-foreground hover:bg-foreground hover:text-background h-12 px-6"
                        >
                          <IconTrash className="h-4 w-4 mr-2" />
                          Supprimer définitivement
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Footer Actions */}
              <div className="flex justify-end pt-6 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => setShowSubscriptionManagementDialog(false)}
                  className="h-12 px-6"
                >
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modify Subscription Dialog */}
      <Dialog open={showModifySubscriptionDialog} onOpenChange={setShowModifySubscriptionDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconEdit className="h-5 w-5" />
              Modifier l'abonnement
            </DialogTitle>
          </DialogHeader>

          {subscriptionToModify && (
            <div className="space-y-6">
              {/* Current Subscription Info */}
              <Card className="border-muted-foreground/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{subscriptionToModify.plan_name}</h3>
                      <p className="text-sm text-muted-foreground capitalize">{subscriptionToModify.plan_type}</p>
                    </div>
                    <Badge variant={subscriptionToModify.status === 'active' ? 'default' : 'secondary'}>
                      {subscriptionToModify.status === 'active' ? 'Actif' :
                       subscriptionToModify.status === 'expired' ? 'Expiré' : 'Annulé'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Modify Form */}
              <form onSubmit={handleModifySubscription} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Plan Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="modify_plan_id">Plan d'abonnement</Label>
                    <Select
                      value={modifySubscriptionForm.plan_id}
                      onValueChange={(value) => {
                        const newEndDate = calculateEndDate(value, modifySubscriptionForm.start_date)
                        setModifySubscriptionForm(prev => ({
                          ...prev,
                          plan_id: value,
                          end_date: newEndDate || prev.end_date
                        }))
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un plan" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            <div className="flex items-center justify-between w-full">
                              <span className="font-medium">{plan.name}</span>
                              <span className="ml-3 text-sm text-muted-foreground">
                                {plan.price_dhs} DH
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Start Date */}
                  <div className="space-y-2">
                    <Label htmlFor="modify_start_date">Date de début</Label>
                    <Input
                      id="modify_start_date"
                      type="date"
                      value={modifySubscriptionForm.start_date}
                      onChange={(e) => {
                        const newEndDate = calculateEndDate(modifySubscriptionForm.plan_id, e.target.value)
                        setModifySubscriptionForm(prev => ({
                          ...prev,
                          start_date: e.target.value,
                          end_date: newEndDate || prev.end_date
                        }))
                      }}
                      required
                    />
                  </div>

                  {/* End Date */}
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="modify_end_date">Date de fin</Label>
                    <Input
                      id="modify_end_date"
                      type="date"
                      value={modifySubscriptionForm.end_date}
                      onChange={(e) => setModifySubscriptionForm(prev => ({ ...prev, end_date: e.target.value }))}
                      required
                    />
                    {modifySubscriptionForm.plan_id && (
                      <p className="text-xs text-muted-foreground">
                        Calculée automatiquement selon la durée du plan (
                        {plans.find(p => p.id === modifySubscriptionForm.plan_id)?.validity_months} mois)
                      </p>
                    )}
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowModifySubscriptionDialog(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    disabled={!modifySubscriptionForm.plan_id}
                  >
                    <IconEdit className="h-4 w-4 mr-2" />
                    Enregistrer les modifications
                  </Button>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Subscription Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement l'abonnement "{subscriptionToDelete?.planName}" ?
            </AlertDialogDescription>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground font-medium">
                <strong>Attention :</strong> Cette action est irréversible et supprimera :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
                <li>L'abonnement et toutes ses données</li>
                <li>Toutes les réservations associées</li>
                <li>Toutes les entrées de liste d'attente associées</li>
                <li>Les références dans les demandes d'abonnement</li>
              </ul>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteConfirmation(false)}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubscription}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={showDeleteUserConfirmation} onOpenChange={setShowDeleteUserConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression de l'utilisateur</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement <strong>{userToDelete?.name}</strong> ({userToDelete?.email}) ?
            </AlertDialogDescription>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground font-medium mb-2">
                <strong>Attention :</strong> Cette action est irréversible et supprimera :
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Le profil utilisateur et toutes ses informations personnelles</li>
                <li>Tous les abonnements (actifs, expirés, annulés)</li>
                <li>Toutes les réservations de cours passées et futures</li>
                <li>Toutes les entrées de liste d'attente</li>
                <li>Les demandes d'abonnement</li>
                <li>Les logs WhatsApp</li>
                <li>Le compte d'authentification (l'utilisateur ne pourra plus se connecter)</li>
              </ul>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteUserConfirmation(false)
              setUserToDelete(null)
            }}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-foreground text-background hover:bg-foreground/90"
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Credit Adjustment Dialog */}
      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconCoin className="h-5 w-5" />
              {selectedSubscriptionForCredits?.plan_type === 'abonnement'
                ? 'Ajouter une utilisation hebdomadaire'
                : 'Ajouter des crédits'}
            </DialogTitle>
          </DialogHeader>

          {selectedSubscriptionForCredits && (
            <div className="space-y-6">
              <Card className="border-muted-foreground/20">
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold">{selectedSubscriptionForCredits.plan_name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">
                      {selectedSubscriptionForCredits.plan_type}
                    </p>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
                      {selectedSubscriptionForCredits.plan_type === 'abonnement' ? (
                        <>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-foreground">
                              {selectedSubscriptionForCredits.weekly_credits_used || 0}
                            </div>
                            <div className="text-xs text-muted-foreground">Utilisés</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-foreground">
                              {selectedSubscriptionForCredits.weekly_limit || 0}
                            </div>
                            <div className="text-xs text-muted-foreground">Limite</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-foreground">
                              {selectedSubscriptionForCredits.credits_remaining}
                            </div>
                            <div className="text-xs text-muted-foreground">Restants</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-foreground">
                              {selectedSubscriptionForCredits.credits_used}
                            </div>
                            <div className="text-xs text-muted-foreground">Utilisés</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <Label htmlFor="credit_amount">
                  {selectedSubscriptionForCredits.plan_type === 'abonnement'
                    ? 'Nombre d\'utilisations à ajouter'
                    : 'Nombre de crédits à ajouter'}
                </Label>
                <Input
                  id="credit_amount"
                  type="number"
                  min="1"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(parseInt(e.target.value) || 1)}
                  className="h-12 text-center text-lg font-semibold"
                />
                <p className="text-xs text-muted-foreground">
                  {selectedSubscriptionForCredits.plan_type === 'abonnement'
                    ? `Les utilisations seront ajoutées au compteur hebdomadaire (max: ${selectedSubscriptionForCredits.weekly_limit})`
                    : 'Les crédits seront ajoutés au solde actuel de l\'utilisateur'}
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreditDialog(false)
                    setCreditAmount(1)
                    setSelectedSubscriptionForCredits(null)
                  }}
                >
                  Annuler
                </Button>
                <Button
                  onClick={() => handleAdjustCredits('increment')}
                  disabled={creditAmount <= 0}
                >
                  <IconPlus className="h-4 w-4 mr-2" />
                  Ajouter {creditAmount} {selectedSubscriptionForCredits.plan_type === 'abonnement' ? 'utilisation' : 'crédit'}{creditAmount > 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}