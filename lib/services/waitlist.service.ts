'use client'

import { createClient } from '@/lib/supabase/client'

export class WaitlistService {
  private supabaseClient: ReturnType<typeof createClient> | null = null

  private get supabase() {
    if (!this.supabaseClient) {
      this.supabaseClient = createClient()
    }
    return this.supabaseClient
  }

  async leaveWaitlist(waitlistEntryId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser()
      if (!user) {
        return { success: false, error: 'Utilisateur non authentifié' }
      }

      // Atomic server-side RPC: removes the entry AND refunds the credit in
      // one transaction. The previous implementation deleted from the browser
      // and silently failed to refund (RLS blocked the update).
      const { data: result, error } = await this.supabase.rpc('leave_waitlist_v2', {
        p_waitlist_id: waitlistEntryId
      })

      if (error) {
        return { success: false, error: error.message }
      }

      if (!result?.success) {
        return { success: false, error: result?.message || "Entrée de liste d'attente non trouvée" }
      }

      return { success: true }
    } catch (error) {
      console.error('Error in leaveWaitlist:', error)
      return { success: false, error: "Une erreur inattendue s'est produite" }
    }
  }
}

export const waitlistService = new WaitlistService()
