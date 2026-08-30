import { createClient as createClientSideClient } from '@/lib/supabase/client'
import { Database } from '@/lib/database.types'

type WhatsAppLogInsert = Database['public']['Tables']['whatsapp_logs']['Insert']
type WhatsAppLogRow = Database['public']['Tables']['whatsapp_logs']['Row']

interface WasenderMessage {
  session: string
  to: string
  text: string
}

interface WasenderResponse {
  status: boolean
  message: string
  messageId?: string
  error?: string
}

interface SendWhatsAppMessageParams {
  phoneNumber: string
  message: string
  eventType: 'signup' | 'activation' | 'waitlist_promotion' | 'class_cancellation' | 'subscription_request' | 'subscription_expiring'
  userId?: string | null
}

interface SendWhatsAppMessageResult {
  success: boolean
  messageId?: string
  error?: string
}

export class WhatsAppService {
  private wasenderApiKey: string
  private wasenderBaseUrl: string
  private useServerClient: boolean

  constructor(useServerClient: boolean = false) {
    // Ensure required environment variables are present
    this.wasenderApiKey = process.env.WASENDER_API_KEY || ''
    this.wasenderBaseUrl = process.env.WASENDER_BASE_URL || 'https://wasenderapi.com/api'
    this.useServerClient = useServerClient

    if (!this.wasenderApiKey) {
      console.error('Missing required Wasender environment variables')
    }
  }

  private async getSupabase() {
    if (this.useServerClient) {
      const { createClient: createServerClient } = await import('@/lib/supabase/server')
      return await createServerClient()
    } else {
      return createClientSideClient()
    }
  }

  /**
   * Normalize phone number to international format
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digits
    let cleaned = phoneNumber.replace(/\D/g, '')


    // If it starts with 0 and appears to be Moroccan (9-10 digits after removing 0)
    if (cleaned.startsWith('0') && (cleaned.length === 9 || cleaned.length === 10)) {
      cleaned = '212' + cleaned.substring(1)
    }
    // If it doesn't start with country code and is 8-9 digits, assume Moroccan
    else if ((cleaned.length === 8 || cleaned.length === 9) && !cleaned.startsWith('212')) {
      cleaned = '212' + cleaned
    }
    // If it already starts with 212, keep it
    else if (cleaned.startsWith('212') && cleaned.length >= 11) {
      // Already formatted correctly
    }
    // If it starts with other country codes, keep as is
    else if (cleaned.length >= 10 && (cleaned.startsWith('1') || cleaned.startsWith('33') || cleaned.startsWith('44'))) {
      // Keep international numbers as is
    }

    // Add + prefix if not present
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned
    }

    return cleaned
  }

  /**
   * Validate if the service is properly configured
   */
  private isConfigured(): boolean {
    return !!this.wasenderApiKey
  }

  /**
   * Log WhatsApp message to database
   */
  private async logMessage(params: {
    userId?: string | null
    eventType: WhatsAppLogInsert['event_type']
    phoneNumber: string
    messageContent: string
    status: 'pending' | 'success' | 'failed'
    errorMessage?: string | null
    wasenderMessageId?: string | null
    apiResponse?: string | null
  }): Promise<WhatsAppLogRow | null> {
    try {
      const supabase = await this.getSupabase()
      const { data, error } = await supabase
        .from('whatsapp_logs')
        .insert({
          user_id: params.userId,
          event_type: params.eventType,
          phone_number: params.phoneNumber,
          message_content: params.messageContent,
          status: params.status,
          error_message: params.errorMessage,
          twilio_message_sid: params.wasenderMessageId
        })
        .select()
        .single()

      if (error) {
        console.error('Error logging WhatsApp message:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error logging WhatsApp message:', error)
      return null
    }
  }

  /**
   * Send WhatsApp message via Wasender API
   */
  private async sendWasenderMessage(to: string, message: string): Promise<WasenderResponse | null> {
    if (!this.isConfigured()) {
      throw new Error('Wasender WhatsApp service is not properly configured')
    }

    try {
      const url = `${this.wasenderBaseUrl}/send-message`

      const payload = {
        to: to,
        text: message
      }

      console.log('DEBUG: Sending Wasender API request:', { url, payload })

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.wasenderApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      console.log('DEBUG: Wasender API HTTP response status:', response.status, response.statusText)

      const responseData = await response.json()
      console.log('DEBUG: Wasender API response data:', JSON.stringify(responseData, null, 2))

      if (!response.ok) {
        console.error('Wasender API error response:', responseData)
        throw new Error(responseData.message || `Wasender API error: ${response.status}`)
      }

      const result = {
        status: responseData.status || true,
        message: responseData.message || 'Message sent successfully',
        messageId: responseData.messageId || responseData.id
      }

      console.log('DEBUG: Processed Wasender response:', JSON.stringify(result, null, 2))

      return result
    } catch (error) {
      console.error('Error sending Wasender WhatsApp message:', error)
      throw error
    }
  }

  /**
   * Send WhatsApp message and log the result
   */
  async sendMessage({
    phoneNumber,
    message,
    eventType,
    userId
  }: SendWhatsAppMessageParams): Promise<SendWhatsAppMessageResult> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber)

    // Log the pending message first
    const logEntry = await this.logMessage({
      userId,
      eventType,
      phoneNumber: normalizedPhone,
      messageContent: message,
      status: 'pending'
    })

    if (!this.isConfigured()) {
      const error = 'Wasender WhatsApp service is not properly configured'

      // Update log with error
      if (logEntry) {
        const supabase = await this.getSupabase()
        await supabase
          .from('whatsapp_logs')
          .update({
            status: 'failed',
            error_message: error
          })
          .eq('id', logEntry.id)
      }

      return { success: false, error }
    }

    try {
      // Send the message
      const response = await this.sendWasenderMessage(normalizedPhone, message)

      if (response) {
        console.log('DEBUG: Updating log entry to success for log ID:', logEntry?.id)

        // Update log with success - if we got here without throwing, the API call was successful
        if (logEntry) {
          const supabase = await this.getSupabase()
          const { data: updateResult, error: updateError } = await supabase
            .from('whatsapp_logs')
            .update({
              status: 'success',
              twilio_message_sid: response.messageId
            })
            .eq('id', logEntry.id)
            .select()

          console.log('DEBUG: Database update result:', { updateResult, updateError })

          if (updateError) {
            console.error('ERROR: Failed to update WhatsApp log status:', updateError)
          } else {
            console.log('DEBUG: Successfully updated log status to success')
          }
        }

        return {
          success: true,
          messageId: response.messageId
        }
      } else {
        throw new Error('No response from Wasender API')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

      // Update log with error
      if (logEntry) {
        const supabase = await this.getSupabase()
        await supabase
          .from('whatsapp_logs')
          .update({
            status: 'failed',
            error_message: errorMessage
          })
          .eq('id', logEntry.id)
      }

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Resend a failed WhatsApp message
   */
  async resendMessage(logId: string): Promise<SendWhatsAppMessageResult> {
    try {
      const supabase = await this.getSupabase()

      // Get the original log entry
      const { data: logEntry, error } = await supabase
        .from('whatsapp_logs')
        .select('*')
        .eq('id', logId)
        .single()

      if (error || !logEntry) {
        return { success: false, error: 'Log entry not found' }
      }

      // Resend the message
      const result = await this.sendMessage({
        phoneNumber: logEntry.phone_number,
        message: logEntry.message_content,
        eventType: logEntry.event_type as any,
        userId: logEntry.user_id
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Get WhatsApp logs with optional filters
   */
  async getLogs({
    eventType,
    status,
    limit = 50,
    offset = 0
  }: {
    eventType?: WhatsAppLogRow['event_type']
    status?: WhatsAppLogRow['status']
    limit?: number
    offset?: number
  } = {}): Promise<{
    logs: (WhatsAppLogRow & { profiles: { full_name: string | null; email: string } | null })[]
    count: number
  }> {
    try {
      const supabase = await this.getSupabase()
      let query = supabase
        .from('whatsapp_logs')
        .select(`
          *,
          profiles (
            full_name,
            email
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })

      if (eventType) {
        query = query.eq('event_type', eventType)
      }

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error, count } = await query
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('Error fetching WhatsApp logs:', error)
        return { logs: [], count: 0 }
      }

      return {
        logs: data || [],
        count: count || 0
      }
    } catch (error) {
      console.error('Error fetching WhatsApp logs:', error)
      return { logs: [], count: 0 }
    }
  }
}

// Export singleton instance
export const whatsappService = new WhatsAppService()