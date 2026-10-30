import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: string;
          institution: string | null;
          department: string | null;
          year_of_study: number | null;
          student_staff_id: string | null;
          training_completed: string[] | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: string;
          institution?: string | null;
          department?: string | null;
          year_of_study?: number | null;
          student_staff_id?: string | null;
          training_completed?: string[] | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: string;
          institution?: string | null;
          department?: string | null;
          year_of_study?: number | null;
          student_staff_id?: string | null;
          training_completed?: string[] | null;
          created_at?: string;
        };
      };
      resource_categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
        };
      };
      resources: {
        Row: {
          id: string;
          owner_id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          type: string;
          location: string | null;
          capacity: number | null;
          eligibility_department: string | null;
          eligibility_min_year: number | null;
          required_training: boolean;
          training_required: string | null;
          supervision_required: boolean;
          usage_rules: string | null;
          deposit_amount: number | null;
          deposit_conditions: string | null;
          status: string;
          lifecycle_state: string;
          tags: string[] | null;
          created_at: string;
          updated_at: string;
          image_url: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          category_id?: string | null;
          name: string;
          description?: string | null;
          type: string;
          location?: string | null;
          capacity?: number | null;
          eligibility_department?: string | null;
          eligibility_min_year?: number | null;
          required_training?: boolean;
          training_required?: string | null;
          supervision_required?: boolean;
          usage_rules?: string | null;
          deposit_amount?: number | null;
          deposit_conditions?: string | null;
          status?: string;
          lifecycle_state?: string;
          tags?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          category_id?: string | null;
          name?: string;
          description?: string | null;
          type?: string;
          location?: string | null;
          capacity?: number | null;
          eligibility_department?: string | null;
          eligibility_min_year?: number | null;
          required_training?: boolean;
          training_required?: string | null;
          supervision_required?: boolean;
          usage_rules?: string | null;
          deposit_amount?: number | null;
          deposit_conditions?: string | null;
          status?: string;
          lifecycle_state?: string;
          tags?: string[] | null;
          created_at?: string;
          updated_at?: string;
          image_url?: string | null;
        };
      };
      bookings: {
        Row: {
          id: string;
          resource_id: string;
          borrower_id: string;
          status: string;
          start_time: string;
          end_time: string;
          rejection_reason: string | null;
          requested_at: string;
          decided_at: string | null;
          decided_by: string | null;
          checkout_at: string | null;
          checkout_by: string | null;
          checkout_condition: string | null;
          accessories_included: string[] | null;
          expected_return_at: string | null;
          return_at: string | null;
          return_by: string | null;
          return_condition: string | null;
          missing_accessories: string[] | null;
          damage_notes: string | null;
          created_at: string;
          updated_at: string;
          image_url: string | null;
        };
        Insert: {
          id?: string;
          resource_id: string;
          borrower_id: string;
          status?: string;
          start_time: string;
          end_time: string;
          rejection_reason?: string | null;
          requested_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          checkout_at?: string | null;
          checkout_by?: string | null;
          checkout_condition?: string | null;
          accessories_included?: string[] | null;
          expected_return_at?: string | null;
          return_at?: string | null;
          return_by?: string | null;
          return_condition?: string | null;
          missing_accessories?: string[] | null;
          damage_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          resource_id?: string;
          borrower_id?: string;
          status?: string;
          start_time?: string;
          end_time?: string;
          rejection_reason?: string | null;
          requested_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          checkout_at?: string | null;
          checkout_by?: string | null;
          checkout_condition?: string | null;
          accessories_included?: string[] | null;
          expected_return_at?: string | null;
          return_at?: string | null;
          return_by?: string | null;
          return_condition?: string | null;
          missing_accessories?: string[] | null;
          damage_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      incidents: {
        Row: {
          id: string;
          booking_id: string;
          reported_by: string;
          type: string;
          description: string;
          status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          resolution_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          reported_by: string;
          type: string;
          description: string;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          resolution_notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          reported_by?: string;
          type?: string;
          description?: string | null;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          resolution_notes?: string | null;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          message: string;
          related_resource_id: string | null;
          related_booking_id: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          message: string;
          related_resource_id?: string | null;
          related_booking_id?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          title?: string;
          message?: string;
          related_resource_id?: string | null;
          related_booking_id?: string | null;
          read?: boolean;
          created_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          reason: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          reason?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          reason?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
      };
      waiting_list: {
        Row: {
          id: string;
          resource_id: string;
          user_id: string;
          start_time: string;
          end_time: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          resource_id: string;
          user_id: string;
          start_time: string;
          end_time: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          resource_id?: string;
          user_id?: string;
          start_time?: string;
          end_time?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      mission_kits: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          description: string | null;
          purpose: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          description?: string | null;
          purpose?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          description?: string | null;
          purpose?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      mission_kit_items: {
        Row: {
          id: string;
          kit_id: string;
          resource_id: string;
          quantity: number;
          added_at: string;
        };
        Insert: {
          id?: string;
          kit_id: string;
          resource_id: string;
          quantity?: number;
          added_at?: string;
        };
        Update: {
          id?: string;
          kit_id?: string;
          resource_id?: string;
          quantity?: number;
          added_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
