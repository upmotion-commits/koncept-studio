import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/database.types'

type ClassBooking = Database['public']['Tables']['class_bookings']['Row']
type ClassWaitlist = Database['public']['Tables']['class_waitlist']['Row']
type ClassSchedule = Database['public']['Tables']['class_schedules']['Row']

export interface BookingData {
  scheduleId: string
  subscriptionId?: string // Now optional as we auto-select best subscription
}

export interface BookingResult {
  success: boolean
  error?: string
  booking?: ClassBooking | any // Allow custom booking data
}

export interface WaitlistResult {
  success: boolean
  error?: string
  waitlistEntry?: ClassWaitlist
}

export class BookingService {
  private supabaseClient: ReturnType<typeof createClient> | null = null

  private get supabase() {
    if (!this.supabaseClient) {
      this.supabaseClient = createClient()
    }
    return this.supabaseClient
  }

  async bookClass({ scheduleId }: BookingData): Promise<BookingResult> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser()
      if (!user) {
        return { success: false, error: 'Utilisateur non authentifié' }
      }

      // Single atomic, capacity-safe RPC (locks the schedule row, checks the
      // real confirmed count, picks the best subscription, consumes the credit)
      const { data: result, error } = await this.supabase.rpc('book_class_v2', {
        p_schedule_id: scheduleId
      })

      if (error) {
        // The DB capacity trigger raises a French message when the class fills
        // up between UI render and submission
        if (error.message?.includes('capacité maximale')) {
          return { success: false, error: 'Le cours est complet' }
        }
        return { success: false, error: error.message }
      }

      if (!result?.success) {
        return { success: false, error: result?.message || 'Réservation impossible' }
      }

      return {
        success: true,
        booking: {
          id: result.booking_id,
          subscription_id: result.subscription_id
        } as any
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  async cancelBooking(bookingId: string): Promise<BookingResult> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser()
      if (!user) {
        return { success: false, error: 'Utilisateur non authentifié' }
      }

      // Atomic cancel + type-aware refund + inline waitlist promotion.
      // The 3-hour deadline is enforced server-side by the function.
      const { data: result, error } = await this.supabase.rpc('cancel_booking_v2', {
        p_booking_id: bookingId
      })

      if (error) {
        return { success: false, error: error.message }
      }

      if (!result?.success) {
        return { success: false, error: result?.message || "Échec de l'annulation" }
      }

      // Notify the promoted user (if the cancellation freed a spot)
      if (result.promoted_user_id) {
        try {
          const { sendWaitlistPromotionNotification } = await import('@/app/espace/reservations/actions')
          await sendWaitlistPromotionNotification(result.promoted_user_id)
        } catch (notifyError) {
          console.error('Erreur lors de la notification de promotion:', notifyError)
        }
      }

      return {
        success: true,
        booking: {
          id: bookingId,
          status: 'cancelled',
          refunded: true
        } as any
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  async joinWaitlist({ scheduleId }: BookingData): Promise<WaitlistResult> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser()
      if (!user) {
        return { success: false, error: 'Utilisateur non authentifié' }
      }

      // Atomic RPC: fullness is decided on the REAL confirmed-booking count
      // (not the cached counter), the credit is consumed in the same transaction.
      const { data: result, error } = await this.supabase.rpc('join_waitlist_v2', {
        p_schedule_id: scheduleId
      })

      if (error) {
        return { success: false, error: error.message }
      }

      if (!result?.success) {
        return { success: false, error: result?.message || "Impossible de rejoindre la liste d'attente" }
      }

      return {
        success: true,
        waitlistEntry: { id: result.waitlist_id, position: result.position } as any,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  async leaveWaitlist(waitlistId: string): Promise<WaitlistResult> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser()
      if (!user) {
        return { success: false, error: 'Utilisateur non authentifié' }
      }

      // Atomic RPC: removal and refund happen in one transaction server-side
      const { data: result, error } = await this.supabase.rpc('leave_waitlist_v2', {
        p_waitlist_id: waitlistId
      })

      if (error) {
        return { success: false, error: error.message }
      }

      if (!result?.success) {
        return { success: false, error: result?.message || "Échec de la sortie de liste d'attente" }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  async getUserBookings(userId: string) {
    const { data, error } = await this.supabase
      .from('class_bookings')
      .select(`
        *,
        class_schedules (
          *,
          classes (*)
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  }

  async getUserWaitlistEntries(userId: string) {
    const { data, error } = await this.supabase
      .from('class_waitlist')
      .select(`
        *,
        class_schedules (
          *,
          classes (*)
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  }

  async getClassAvailability(scheduleId: string) {
    const { data, error } = await this.supabase.rpc('get_class_availability', {
      schedule_id: scheduleId,
    })

    if (error) throw error
    return data
  }

  async canUserBook(scheduleId: string): Promise<{ canBook: boolean; reason?: string; message?: string }> {
    try {
      const { data, error } = await this.supabase.rpc('can_user_book_class', {
        user_uuid: (await this.supabase.auth.getUser()).data.user?.id,
        schedule_uuid: scheduleId,
      })

      if (error) {
        return {
          canBook: false,
          reason: error.message,
        }
      }

      return {
        canBook: data.can_book,
        reason: data.reason,
        message: data.message,
      }
    } catch (error) {
      return {
        canBook: false,
        reason: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  // New method to get user's valid subscriptions
  async getUserValidSubscriptions(): Promise<any[]> {
    try {
      const { data: user } = await this.supabase.auth.getUser()
      if (!user.user) return []

      const { data, error } = await this.supabase.rpc('get_user_valid_subscriptions', {
        user_uuid: user.user.id,
      })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error getting user valid subscriptions:', error)
      return []
    }
  }

  // New method to check if user has only personal training (no carnet/abonnement)
  async hasOnlyPersonalTraining(): Promise<boolean> {
    try {
      const { data: user } = await this.supabase.auth.getUser()
      if (!user.user) return false

      // Check ALL subscriptions (including expired/consumed ones) to see if user ever had carnet/abonnement access
      const { data: allSubscriptions, error } = await this.supabase
        .from('user_subscriptions')
        .select(`
          subscription_plans (
            type
          )
        `)
        .eq('user_id', user.user.id)

      if (error) {
        console.error('Error fetching all subscriptions:', error)
        return false
      }

      // If no subscriptions at all, return false (show normal booking interface)
      if (!allSubscriptions || allSubscriptions.length === 0) return false

      // Check if user has ever had any carnet or abonnement subscriptions
      const hasOnlineEligible = allSubscriptions.some(sub =>
        (sub.subscription_plans as any)?.type === 'carnet' || (sub.subscription_plans as any)?.type === 'abonnement'
      )

      // If user has ever had carnet or abonnement, they can see bookings (return false)
      if (hasOnlineEligible) return false

      // Only return true if user has ONLY ever had personal_training subscriptions
      return allSubscriptions.every(sub => (sub.subscription_plans as any)?.type === 'personal_training')
    } catch (error) {
      console.error('Error checking personal training status:', error)
      return false
    }
  }
}