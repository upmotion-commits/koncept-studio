export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      class_bookings: {
        Row: {
          booked_at: string | null
          cancelled_at: string | null
          cancellation_reason: string | null
          created_at: string
          id: string
          schedule_id: string
          status: string
          subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          booked_at?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          created_at?: string
          id?: string
          schedule_id: string
          status?: string
          subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          booked_at?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          created_at?: string
          id?: string
          schedule_id?: string
          status?: string
          subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_bookings_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedules: {
        Row: {
          cancellation_reason: string | null
          class_id: string
          created_at: string
          created_by: string | null
          current_bookings: number
          end_datetime: string
          exception_reason: string | null
          id: string
          is_cancelled: boolean
          is_exception: boolean
          is_recurring: boolean
          parent_schedule_id: string | null
          recurrence_end_date: string | null
          recurrence_rule: Json | null
          start_datetime: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          class_id: string
          created_at?: string
          created_by?: string | null
          current_bookings?: number
          end_datetime: string
          exception_reason?: string | null
          id?: string
          is_cancelled?: boolean
          is_exception?: boolean
          is_recurring?: boolean
          parent_schedule_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: Json | null
          start_datetime: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          class_id?: string
          created_at?: string
          created_by?: string | null
          current_bookings?: number
          end_datetime?: string
          exception_reason?: string | null
          id?: string
          is_cancelled?: boolean
          is_exception?: boolean
          is_recurring?: boolean
          parent_schedule_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: Json | null
          start_datetime?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_schedules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_schedules_parent_schedule_id_fkey"
            columns: ["parent_schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      class_waitlist: {
        Row: {
          created_at: string
          id: string
          joined_at: string | null
          notified_at: string | null
          position: number
          schedule_id: string
          subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string | null
          notified_at?: string | null
          position: number
          schedule_id: string
          subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string | null
          notified_at?: string | null
          position?: number
          schedule_id?: string
          subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_waitlist_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_waitlist_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_waitlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          coach: string
          created_at: string
          description: string | null
          difficulty_level: string
          duration: number
          id: string
          location: string
          max_capacity: number
          title: string
          updated_at: string
        }
        Insert: {
          coach: string
          created_at?: string
          description?: string | null
          difficulty_level: string
          duration: number
          id?: string
          location: string
          max_capacity: number
          title: string
          updated_at?: string
        }
        Update: {
          coach?: string
          created_at?: string
          description?: string | null
          difficulty_level?: string
          duration?: number
          id?: string
          location?: string
          max_capacity?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_change_logs: {
        Row: {
          admin_id: string
          change_amount: number
          created_at: string
          field_modified: string
          id: string
          new_value: number
          previous_value: number
          subscription_id: string
          subscription_type: string
          user_id: string
        }
        Insert: {
          admin_id: string
          change_amount: number
          created_at?: string
          field_modified: string
          id?: string
          new_value: number
          previous_value: number
          subscription_id: string
          subscription_type: string
          user_id: string
        }
        Update: {
          admin_id?: string
          change_amount?: number
          created_at?: string
          field_modified?: string
          id?: string
          new_value?: number
          previous_value?: number
          subscription_id?: string
          subscription_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_change_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_change_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_change_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          desired_plan: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          role: string
          subscription_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          desired_plan?: string | null
          email: string
          full_name: string
          id: string
          phone?: string | null
          role?: string
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          desired_plan?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: string
          subscription_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          credits: number
          id: string
          name: string
          price_dhs: number
          type: string
          updated_at: string
          validity_months: number
          weekly_limit: number | null
        }
        Insert: {
          created_at?: string
          credits: number
          id?: string
          name: string
          price_dhs: number
          type: string
          updated_at?: string
          validity_months: number
          weekly_limit?: number | null
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          name?: string
          price_dhs?: number
          type?: string
          updated_at?: string
          validity_months?: number
          weekly_limit?: number | null
        }
        Relationships: []
      }
      subscription_requests: {
        Row: {
          contacted_at: string | null
          created_at: string
          id: string
          notes: string | null
          plan_id: string
          requested_at: string | null
          resolved_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contacted_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          plan_id: string
          requested_at?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contacted_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          plan_id?: string
          requested_at?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          created_at: string
          credits_remaining: number
          credits_used: number
          end_date: string
          id: string
          last_weekly_reset: string | null
          plan_id: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
          weekly_credits_used: number
        }
        Insert: {
          created_at?: string
          credits_remaining?: number
          credits_used?: number
          end_date: string
          id?: string
          last_weekly_reset?: string | null
          plan_id: string
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
          weekly_credits_used?: number
        }
        Update: {
          created_at?: string
          credits_remaining?: number
          credits_used?: number
          end_date?: string
          id?: string
          last_weekly_reset?: string | null
          plan_id?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
          weekly_credits_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_promotion_notices: {
        Row: {
          id: string
          user_id: string
          schedule_id: string
          booking_id: string | null
          promoted_by: string | null
          promoted_at: string
          claimed_at: string | null
          notified_at: string | null
          attempts: number
          last_error: string | null
        }
        Insert: {
          id?: string
          user_id: string
          schedule_id: string
          booking_id?: string | null
          promoted_by?: string | null
          promoted_at?: string
          claimed_at?: string | null
          notified_at?: string | null
          attempts?: number
          last_error?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          schedule_id?: string
          booking_id?: string | null
          promoted_by?: string | null
          promoted_at?: string
          claimed_at?: string | null
          notified_at?: string | null
          attempts?: number
          last_error?: string | null
        }
        Relationships: []
      }
      whatsapp_logs: {
        Row: {
          id: string
          user_id: string | null
          event_type: 'signup' | 'activation' | 'waitlist_promotion' | 'class_cancellation' | 'subscription_request' | 'subscription_expiring'
          phone_number: string
          message_content: string
          status: 'pending' | 'success' | 'failed'
          error_message: string | null
          wasender_message_id: string | null
          api_response: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          event_type: 'signup' | 'activation' | 'waitlist_promotion' | 'class_cancellation' | 'subscription_request' | 'subscription_expiring'
          phone_number: string
          message_content: string
          status?: 'pending' | 'success' | 'failed'
          error_message?: string | null
          wasender_message_id?: string | null
          api_response?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          event_type?: 'signup' | 'activation' | 'waitlist_promotion' | 'class_cancellation' | 'subscription_request' | 'subscription_expiring'
          phone_number?: string
          message_content?: string
          status?: 'pending' | 'success' | 'failed'
          error_message?: string | null
          wasender_message_id?: string | null
          api_response?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      calendar_events_optimized: {
        Row: {
          class_id: string | null
          coach: string | null
          current_bookings: number | null
          description: string | null
          difficulty_level: string | null
          end_datetime: string | null
          id: string | null
          is_cancelled: boolean | null
          is_exception: boolean | null
          location: string | null
          max_capacity: number | null
          start_datetime: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_schedules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      book_class: {
        Args: {
          schedule_id: string
          subscription_id: string
        }
        Returns: Json
      }
      cancel_booking: {
        Args: {
          booking_id: string
        }
        Returns: Json
      }
      can_user_book_class: {
        Args: {
          schedule_id: string
        }
        Returns: {
          can_book: boolean
          reason: string
        }
      }
      create_user_subscription: {
        Args: {
          plan_id: string
        }
        Returns: Json
      }
      get_admin_users_data: {
        Args: {
          page_offset?: number
          page_limit?: number
        }
        Returns: {
          id: string
          full_name: string
          email: string
          role: string
          created_at: string
          active_subscription: Json
          booking_stats: Json
        }[]
      }
      get_class_availability: {
        Args: {
          schedule_id: string
        }
        Returns: {
          available_spots: number
          waitlist_count: number
          is_full: boolean
        }
      }
      get_class_statistics: {
        Args: {
          class_id: string
        }
        Returns: Json
      }
      get_popular_classes: {
        Args: {
          limit_count: number
        }
        Returns: Json[]
      }
      get_subscription_usage: {
        Args: {
          subscription_id: string
        }
        Returns: Json
      }
      get_user_dashboard_data: {
        Args: {
          user_uuid: string
        }
        Returns: {
          user_bookings: Json
          user_subscriptions: Json
          upcoming_classes: Json
          user_progress: Json
        }[]
      }
      get_user_valid_subscription: {
        Args: {
          user_uuid: string
        }
        Returns: Json[]
      }
      is_admin: {
        Args: {
          user_uuid?: string
        }
        Returns: boolean
      }
      join_waitlist: {
        Args: {
          schedule_id: string
          subscription_id: string
        }
        Returns: Json
      }
      book_class_v2: {
        Args: {
          p_schedule_id: string
        }
        Returns: Json
      }
      cancel_booking_v2: {
        Args: {
          p_booking_id: string
        }
        Returns: Json
      }
      join_waitlist_v2: {
        Args: {
          p_schedule_id: string
        }
        Returns: Json
      }
      leave_waitlist_v2: {
        Args: {
          p_waitlist_id: string
        }
        Returns: Json
      }
      admin_book_class_v2: {
        Args: {
          p_user_id: string
          p_schedule_id: string
        }
        Returns: Json
      }
      admin_refund_schedule_bookings: {
        Args: {
          p_schedule_id: string
        }
        Returns: Json
      }
      flag_no_show: {
        Args: {
          p_booking_id: string
        }
        Returns: Json
      }
      unflag_no_show: {
        Args: {
          p_booking_id: string
        }
        Returns: Json
      }
      enqueue_waitlist_promotion_notice: {
        Args: {
          p_user_id: string
          p_schedule_id: string
          p_booking_id?: string | null
        }
        Returns: Json
      }
      handle_waitlist_promotion: {
        Args: {
          schedule_uuid: string
        }
        Returns: Json
      }
      expire_subscriptions: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      cleanup_expired_waitlists: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      renew_subscription: {
        Args: {
          subscription_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}