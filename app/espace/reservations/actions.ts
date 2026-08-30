'use server'

import { createClient } from '@/lib/supabase/server'
import { whatsappServerService } from '@/lib/services/server'
import { generateWaitlistPromotionMessage } from '@/lib/utils/whatsapp-messages'

export async function sendWaitlistPromotionNotification(promotedUserId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Get the promoted user's profile information
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .eq('id', promotedUserId)
      .single()

    if (userError || !user) {
      console.error('Error fetching promoted user profile:', userError)
      return { success: false, error: 'Utilisateur non trouvé' }
    }

    // Send WhatsApp notification if user has phone number
    if (user.phone) {
      try {
        const message = generateWaitlistPromotionMessage(user)
        await whatsappServerService.sendMessage({
          phoneNumber: user.phone,
          message,
          eventType: 'waitlist_promotion',
          userId: user.id
        })
        console.log('WhatsApp auto-promotion notification sent successfully for user:', user.id)
        return { success: true }
      } catch (error) {
        console.error('Error sending WhatsApp auto-promotion notification:', error)
        return { success: false, error: 'Erreur lors de l\'envoi de la notification' }
      }
    } else {
      console.log('User has no phone number, skipping WhatsApp notification for user:', user.id)
      return { success: true }
    }
  } catch (error) {
    console.error('Error in sendWaitlistPromotionNotification:', error)
    return { success: false, error: 'Une erreur inattendue s\'est produite' }
  }
}

interface AdminBookClassParams {
  userId: string
  scheduleId: string
  adminId: string
}

export async function adminBookClass({
  userId,
  scheduleId,
  adminId
}: AdminBookClassParams): Promise<{ success: boolean; error?: string; bookingId?: string }> {
  try {
    const supabase = await createClient()

    // Atomic, capacity-safe admin booking. Authorization (admin role) is
    // enforced inside the database function via auth.uid().
    const { data: result, error } = await supabase.rpc('admin_book_class_v2', {
      p_user_id: userId,
      p_schedule_id: scheduleId
    })

    if (error) {
      if (error.message?.includes('capacité maximale')) {
        return { success: false, error: 'Le cours est complet' }
      }
      return { success: false, error: error.message }
    }

    if (!result?.success) {
      return { success: false, error: result?.message || 'Erreur lors de la création de la réservation' }
    }

    return { success: true, bookingId: result.booking_id }
  } catch (error) {
    console.error('Error in adminBookClass:', error)
    return { success: false, error: 'Une erreur inattendue s\'est produite' }
  }
}
