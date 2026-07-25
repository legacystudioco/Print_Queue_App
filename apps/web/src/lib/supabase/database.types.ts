export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          active: boolean
          created_at: string
          display_name: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      bed_clear_confirmations: {
        Row: {
          ams_verified: boolean
          build_plate_clear: boolean
          confirmed_by: string
          created_at: string
          id: string
          previous_print_removed: boolean
          print_job_id: string
        }
        Insert: {
          ams_verified: boolean
          build_plate_clear: boolean
          confirmed_by: string
          created_at?: string
          id?: string
          previous_print_removed: boolean
          print_job_id: string
        }
        Update: {
          ams_verified?: boolean
          build_plate_clear?: boolean
          confirmed_by?: string
          created_at?: string
          id?: string
          previous_print_removed?: boolean
          print_job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bed_clear_confirmations_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bed_clear_confirmations_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_ams_slots: {
        Row: {
          color_name: string | null
          created_at: string
          id: string
          is_used: boolean
          job_id: string
          material_name: string | null
          notes: string | null
          slot_number: number
          updated_at: string
        }
        Insert: {
          color_name?: string | null
          created_at?: string
          id?: string
          is_used?: boolean
          job_id: string
          material_name?: string | null
          notes?: string | null
          slot_number: number
          updated_at?: string
        }
        Update: {
          color_name?: string | null
          created_at?: string
          id?: string
          is_used?: boolean
          job_id?: string
          material_name?: string | null
          notes?: string | null
          slot_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_ams_slots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_files: {
        Row: {
          created_at: string
          file_size_bytes: number
          filename: string
          id: string
          job_id: string
          printer_brand: Database["public"]["Enums"]["printer_brand"]
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_size_bytes: number
          filename: string
          id?: string
          job_id: string
          printer_brand: Database["public"]["Enums"]["printer_brand"]
          storage_path: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number
          filename?: string
          id?: string
          job_id?: string
          printer_brand?: Database["public"]["Enums"]["printer_brand"]
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_files_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          notify_on_manual_intervention: boolean
          notify_on_print_completed: boolean
          notify_on_print_failed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notify_on_manual_intervention?: boolean
          notify_on_print_completed?: boolean
          notify_on_print_failed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          notify_on_manual_intervention?: boolean
          notify_on_print_completed?: boolean
          notify_on_print_failed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      print_job_notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          dispatched_at: string | null
          id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          print_job_id: string
          printer_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json
          dispatched_at?: string | null
          id?: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          print_job_id: string
          printer_id: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          dispatched_at?: string | null
          id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          print_job_id?: string
          printer_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_job_notifications_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_job_notifications_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          estimated_duration_seconds: number | null
          failure_message: string | null
          id: string
          name: string
          notes: string | null
          printer_id: string
          queue_position: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          estimated_duration_seconds?: number | null
          failure_message?: string | null
          id?: string
          name: string
          notes?: string | null
          printer_id: string
          queue_position?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          estimated_duration_seconds?: number | null
          failure_message?: string | null
          id?: string
          name?: string
          notes?: string | null
          printer_id?: string
          queue_position?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_commands: {
        Row: {
          attempt_count: number
          claimed_at: string | null
          claimed_by_bridge: string | null
          command_type: Database["public"]["Enums"]["printer_command_type"]
          completed_at: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          payload: Json
          print_job_id: string | null
          printer_id: string
          requested_at: string
          requested_by: string
          result: Json | null
          status: Database["public"]["Enums"]["printer_command_status"]
        }
        Insert: {
          attempt_count?: number
          claimed_at?: string | null
          claimed_by_bridge?: string | null
          command_type: Database["public"]["Enums"]["printer_command_type"]
          completed_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          payload?: Json
          print_job_id?: string | null
          printer_id: string
          requested_at?: string
          requested_by: string
          result?: Json | null
          status?: Database["public"]["Enums"]["printer_command_status"]
        }
        Update: {
          attempt_count?: number
          claimed_at?: string | null
          claimed_by_bridge?: string | null
          command_type?: Database["public"]["Enums"]["printer_command_type"]
          completed_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          payload?: Json
          print_job_id?: string | null
          printer_id?: string
          requested_at?: string
          requested_by?: string
          result?: Json | null
          status?: Database["public"]["Enums"]["printer_command_status"]
        }
        Relationships: [
          {
            foreignKeyName: "printer_commands_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_commands_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_commands_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          message: string
          payload: Json | null
          print_job_id: string | null
          printer_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          message: string
          payload?: Json | null
          print_job_id?: string | null
          printer_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          payload?: Json | null
          print_job_id?: string | null
          printer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "printer_events_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_events_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      printers: {
        Row: {
          brand: Database["public"]["Enums"]["printer_brand"]
          bridge_id: string | null
          created_at: string
          current_job_id: string | null
          enabled: boolean
          id: string
          last_seen_at: string | null
          local_ip: string | null
          model: string
          name: string
          serial_number: string | null
          status: Database["public"]["Enums"]["printer_status"]
          updated_at: string
        }
        Insert: {
          brand: Database["public"]["Enums"]["printer_brand"]
          bridge_id?: string | null
          created_at?: string
          current_job_id?: string | null
          enabled?: boolean
          id?: string
          last_seen_at?: string | null
          local_ip?: string | null
          model?: string
          name: string
          serial_number?: string | null
          status?: Database["public"]["Enums"]["printer_status"]
          updated_at?: string
        }
        Update: {
          brand?: Database["public"]["Enums"]["printer_brand"]
          bridge_id?: string | null
          created_at?: string
          current_job_id?: string | null
          enabled?: boolean
          id?: string
          last_seen_at?: string | null
          local_ip?: string | null
          model?: string
          name?: string
          serial_number?: string | null
          status?: Database["public"]["Enums"]["printer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "printers_current_job_id_fkey"
            columns: ["current_job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          disabled_at: string | null
          endpoint: string
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          disabled_at?: string | null
          endpoint: string
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          disabled_at?: string | null
          endpoint?: string
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_job_file: {
        Args: {
          p_file_size_bytes: number
          p_filename: string
          p_job_id: string
          p_printer_brand: Database["public"]["Enums"]["printer_brand"]
          p_storage_path: string
        }
        Returns: {
          created_at: string
          file_size_bytes: number
          filename: string
          id: string
          job_id: string
          printer_brand: Database["public"]["Enums"]["printer_brand"]
          storage_path: string
        }
        SetofOptions: {
          from: "*"
          to: "job_files"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_transition_print_job_status: {
        Args: {
          p_from: Database["public"]["Enums"]["print_job_status"]
          p_to: Database["public"]["Enums"]["print_job_status"]
        }
        Returns: boolean
      }
      claim_next_printer_command: {
        Args: { p_bridge_id: string; p_printer_id: string }
        Returns: {
          attempt_count: number
          claimed_at: string | null
          claimed_by_bridge: string | null
          command_type: Database["public"]["Enums"]["printer_command_type"]
          completed_at: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          payload: Json
          print_job_id: string | null
          printer_id: string
          requested_at: string
          requested_by: string
          result: Json | null
          status: Database["public"]["Enums"]["printer_command_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "printer_commands"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_print_job: {
        Args: {
          p_ams_slots: Json
          p_created_by: string
          p_estimated_duration_seconds: number
          p_files: Json
          p_id: string
          p_name: string
          p_notes: string
          p_printer_id: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          created_by: string
          estimated_duration_seconds: number | null
          failure_message: string | null
          id: string
          name: string
          notes: string | null
          printer_id: string
          queue_position: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      insert_queued_print_job: {
        Args: {
          p_created_by: string
          p_estimated_duration_seconds: number
          p_id: string
          p_name: string
          p_notes: string
          p_printer_id: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          created_by: string
          estimated_duration_seconds: number | null
          failure_message: string | null
          id: string
          name: string
          notes: string | null
          printer_id: string
          queue_position: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_active_app_user: { Args: never; Returns: boolean }
      reassign_job_printer: {
        Args: { p_job_id: string; p_new_printer_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          created_by: string
          estimated_duration_seconds: number | null
          failure_message: string | null
          id: string
          name: string
          notes: string | null
          printer_id: string
          queue_position: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reorder_queue: {
        Args: { p_ordered_job_ids: string[]; p_printer_id: string }
        Returns: undefined
      }
      requeue_print_job: {
        Args: {
          p_created_by: string
          p_new_id: string
          p_source_job_id: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          created_by: string
          estimated_duration_seconds: number | null
          failure_message: string | null
          id: string
          name: string
          notes: string | null
          printer_id: string
          queue_position: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      retry_print_job: {
        Args: { p_job_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          created_by: string
          estimated_duration_seconds: number | null
          failure_message: string | null
          id: string
          name: string
          notes: string | null
          printer_id: string
          queue_position: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_next_print: {
        Args: {
          p_ams_verified: boolean
          p_build_plate_clear: boolean
          p_idempotency_key: string
          p_job_id: string
          p_previous_print_removed: boolean
          p_printer_id: string
          p_requested_by: string
        }
        Returns: {
          attempt_count: number
          claimed_at: string | null
          claimed_by_bridge: string | null
          command_type: Database["public"]["Enums"]["printer_command_type"]
          completed_at: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          payload: Json
          print_job_id: string | null
          printer_id: string
          requested_at: string
          requested_by: string
          result: Json | null
          status: Database["public"]["Enums"]["printer_command_status"]
        }
        SetofOptions: {
          from: "*"
          to: "printer_commands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      notification_type:
        | "print_completed"
        | "print_failed"
        | "manual_intervention_required"
      print_job_status:
        | "uploaded"
        | "queued"
        | "ready"
        | "command_pending"
        | "downloading"
        | "uploading_to_printer"
        | "starting"
        | "printing"
        | "completed"
        | "failed"
        | "skipped"
        | "cancelled"
      printer_brand: "bambu" | "snapmaker" | "flashforge"
      printer_command_status:
        | "pending"
        | "claimed"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      printer_command_type:
        | "start_print"
        | "refresh_status"
        | "cancel_print"
        | "pause_print"
        | "resume_print"
        | "deliver_print"
      printer_status:
        | "online"
        | "offline"
        | "idle"
        | "preparing"
        | "printing"
        | "paused"
        | "completed"
        | "failed"
        | "unknown"
      user_role: "admin" | "operator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      notification_type: [
        "print_completed",
        "print_failed",
        "manual_intervention_required",
      ],
      print_job_status: [
        "uploaded",
        "queued",
        "ready",
        "command_pending",
        "downloading",
        "uploading_to_printer",
        "starting",
        "printing",
        "completed",
        "failed",
        "skipped",
        "cancelled",
      ],
      printer_brand: ["bambu", "snapmaker", "flashforge"],
      printer_command_status: [
        "pending",
        "claimed",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      printer_command_type: [
        "start_print",
        "refresh_status",
        "cancel_print",
        "pause_print",
        "resume_print",
        "deliver_print",
      ],
      printer_status: [
        "online",
        "offline",
        "idle",
        "preparing",
        "printing",
        "paused",
        "completed",
        "failed",
        "unknown",
      ],
      user_role: ["admin", "operator"],
    },
  },
} as const
