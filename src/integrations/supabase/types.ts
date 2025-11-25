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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      fixed_assignments: {
        Row: {
          assigned_to: string
          cell_id: string
          created_at: string
          created_by: string
          date_end: string
          date_start: string
          id: string
          room_id: string
        }
        Insert: {
          assigned_to: string
          cell_id: string
          created_at?: string
          created_by: string
          date_end: string
          date_start: string
          id?: string
          room_id: string
        }
        Update: {
          assigned_to?: string
          cell_id?: string
          created_at?: string
          created_by?: string
          date_end?: string
          date_start?: string
          id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assignments_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "room_cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assignments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          cell_id: string
          comment: string | null
          created_at: string | null
          from_user_id: string
          id: string
          reservation_id: string | null
          room_id: string
          stars: number
          to_user_id: string
        }
        Insert: {
          cell_id: string
          comment?: string | null
          created_at?: string | null
          from_user_id: string
          id?: string
          reservation_id?: string | null
          room_id: string
          stars: number
          to_user_id: string
        }
        Update: {
          cell_id?: string
          comment?: string | null
          created_at?: string | null
          from_user_id?: string
          id?: string
          reservation_id?: string | null
          room_id?: string
          stars?: number
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "room_cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_overrides: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          date: string
          id: string
          override_type: Database["public"]["Enums"]["override_type"]
          reservation_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          date: string
          id?: string
          override_type: Database["public"]["Enums"]["override_type"]
          reservation_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          date?: string
          id?: string
          override_type?: Database["public"]["Enums"]["override_type"]
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_overrides_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_overrides_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cell_id: string
          created_at: string | null
          date_end: string
          date_start: string
          id: string
          meeting_end: string | null
          meeting_start: string | null
          room_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          time_segment: Database["public"]["Enums"]["time_segment"]
          type: Database["public"]["Enums"]["reservation_type"]
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cell_id: string
          created_at?: string | null
          date_end: string
          date_start: string
          id?: string
          meeting_end?: string | null
          meeting_start?: string | null
          room_id: string
          status?: Database["public"]["Enums"]["reservation_status"]
          time_segment?: Database["public"]["Enums"]["time_segment"]
          type: Database["public"]["Enums"]["reservation_type"]
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cell_id?: string
          created_at?: string | null
          date_end?: string
          date_start?: string
          id?: string
          meeting_end?: string | null
          meeting_start?: string | null
          room_id?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          time_segment?: Database["public"]["Enums"]["time_segment"]
          type?: Database["public"]["Enums"]["reservation_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "room_cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      room_access: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["room_role"]
          room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["room_role"]
          room_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["room_role"]
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_access_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      room_cells: {
        Row: {
          created_at: string | null
          default_owner_id: string | null
          id: string
          label: string | null
          room_id: string
          type: Database["public"]["Enums"]["desk_type"]
          x: number
          y: number
        }
        Insert: {
          created_at?: string | null
          default_owner_id?: string | null
          id?: string
          label?: string | null
          room_id: string
          type?: Database["public"]["Enums"]["desk_type"]
          x: number
          y: number
        }
        Update: {
          created_at?: string | null
          default_owner_id?: string | null
          id?: string
          label?: string | null
          room_id?: string
          type?: Database["public"]["Enums"]["desk_type"]
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_cells_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_cells_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          grid_height: number
          grid_width: number
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          grid_height: number
          grid_width: number
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          grid_height?: number
          grid_width?: number
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          session_token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          session_token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          session_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          password: string
          role: Database["public"]["Enums"]["app_role"]
          username: string
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          password: string
          role?: Database["public"]["Enums"]["app_role"]
          username: string
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          password?: string
          role?: Database["public"]["Enums"]["app_role"]
          username?: string
        }
        Relationships: []
      }
      workspace_tips: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          text: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          text: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          text?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_current_user_id: { Args: never; Returns: string }
      has_role: {
        Args: { check_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      has_room_access: { Args: { check_room_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      desk_type:
        | "empty"
        | "desk"
        | "premium_desk"
        | "office"
        | "entrance"
        | "wall"
      override_type: "released" | "assigned"
      reservation_status: "pending" | "approved" | "rejected" | "cancelled"
      reservation_type:
        | "half_day"
        | "day"
        | "week"
        | "month"
        | "quarter"
        | "semester"
        | "meeting"
      room_role: "admin" | "member"
      time_segment: "AM" | "PM" | "FULL"
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
      app_role: ["admin", "user"],
      desk_type: [
        "empty",
        "desk",
        "premium_desk",
        "office",
        "entrance",
        "wall",
      ],
      override_type: ["released", "assigned"],
      reservation_status: ["pending", "approved", "rejected", "cancelled"],
      reservation_type: [
        "half_day",
        "day",
        "week",
        "month",
        "quarter",
        "semester",
        "meeting",
      ],
      room_role: ["admin", "member"],
      time_segment: ["AM", "PM", "FULL"],
    },
  },
} as const
