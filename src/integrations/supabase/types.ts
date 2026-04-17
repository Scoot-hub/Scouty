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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      contacts: {
        Row: {
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          linkedin_url: string | null
          notes: string | null
          organization: string
          phone: string
          photo_url: string | null
          role_title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          linkedin_url?: string | null
          notes?: string | null
          organization?: string
          phone?: string
          photo_url?: string | null
          role_title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          linkedin_url?: string | null
          notes?: string | null
          organization?: string
          phone?: string
          photo_url?: string | null
          role_title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_field_values: {
        Row: {
          created_at: string
          custom_field_id: string
          id: string
          player_id: string
          user_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          custom_field_id: string
          id?: string
          player_id: string
          user_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          custom_field_id?: string
          id?: string
          player_id?: string
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_custom_field_id_fkey"
            columns: ["custom_field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_values_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      match_assignments: {
        Row: {
          id: string
          user_id: string
          organization_id: string | null
          assigned_to: string | null
          assigned_by: string | null
          home_team: string
          away_team: string
          match_date: string
          match_time: string | null
          competition: string
          venue: string
          home_badge: string | null
          away_badge: string | null
          notes: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          organization_id?: string | null
          assigned_to?: string | null
          assigned_by?: string | null
          home_team: string
          away_team: string
          match_date: string
          match_time?: string | null
          competition?: string
          venue?: string
          home_badge?: string | null
          away_badge?: string | null
          notes?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          organization_id?: string | null
          assigned_to?: string | null
          assigned_by?: string | null
          home_team?: string
          away_team?: string
          match_date?: string
          match_time?: string | null
          competition?: string
          venue?: string
          home_badge?: string | null
          away_badge?: string | null
          notes?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_fields: {
        Row: {
          created_at: string
          display_order: number
          field_name: string
          field_options: Json | null
          field_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          field_name: string
          field_options?: Json | null
          field_type?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          field_name?: string
          field_options?: Json | null
          field_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          club: string
          contract_end: string | null
          created_at: string
          current_level: number
          date_of_birth: string | null
          external_data: Json | null
          external_data_fetched_at: string | null
          foot: string
          general_opinion: string
          generation: number
          has_news: string | null
          id: string
          is_archived: boolean
          league: string
          market_value: string | null
          name: string
          nationality: string
          notes: string | null
          photo_url: string | null
          position: string
          position_secondaire: string | null
          potential: number
          role: string | null
          shared_with_org: boolean
          task: string | null
          transfermarkt_id: string | null
          ts_report_published: boolean
          updated_at: string
          user_id: string | null
          zone: string
        }
        Insert: {
          club?: string
          contract_end?: string | null
          created_at?: string
          current_level?: number
          date_of_birth?: string | null
          external_data?: Json | null
          external_data_fetched_at?: string | null
          foot?: string
          general_opinion?: string
          generation?: number
          has_news?: string | null
          id?: string
          is_archived?: boolean
          league?: string
          market_value?: string | null
          name: string
          nationality?: string
          notes?: string | null
          photo_url?: string | null
          position?: string
          position_secondaire?: string | null
          potential?: number
          role?: string | null
          shared_with_org?: boolean
          task?: string | null
          transfermarkt_id?: string | null
          ts_report_published?: boolean
          updated_at?: string
          user_id?: string | null
          zone?: string
        }
        Update: {
          club?: string
          contract_end?: string | null
          created_at?: string
          current_level?: number
          date_of_birth?: string | null
          external_data?: Json | null
          external_data_fetched_at?: string | null
          foot?: string
          general_opinion?: string
          generation?: number
          has_news?: string | null
          id?: string
          is_archived?: boolean
          league?: string
          market_value?: string | null
          name?: string
          nationality?: string
          notes?: string | null
          photo_url?: string | null
          position?: string
          position_secondaire?: string | null
          potential?: number
          role?: string | null
          shared_with_org?: boolean
          task?: string | null
          transfermarkt_id?: string | null
          ts_report_published?: boolean
          updated_at?: string
          user_id?: string | null
          zone?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          civility: string | null
          club: string
          company: string | null
          created_at: string
          date_of_birth: string | null
          first_name: string | null
          full_name: string
          id: string
          last_name: string | null
          phone: string | null
          photo_url: string | null
          reference_club: string | null
          referred_by: string | null
          role: string
          siret: string | null
          social_instagram: string | null
          social_linkedin: string | null
          social_public: boolean
          social_x: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          civility?: string | null
          club?: string
          company?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          last_name?: string | null
          phone?: string | null
          photo_url?: string | null
          reference_club?: string | null
          referred_by?: string | null
          role?: string
          siret?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_public?: boolean
          social_x?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          civility?: string | null
          club?: string
          company?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          last_name?: string | null
          phone?: string | null
          photo_url?: string | null
          reference_club?: string | null
          referred_by?: string | null
          role?: string
          siret?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_public?: boolean
          social_x?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          drive_link: string | null
          file_url: string | null
          id: string
          opinion: string
          player_id: string
          report_date: string
          title: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          drive_link?: string | null
          file_url?: string | null
          id?: string
          opinion?: string
          player_id: string
          report_date?: string
          title?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          drive_link?: string | null
          file_url?: string | null
          id?: string
          opinion?: string
          player_id?: string
          report_date?: string
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          id: string
          name: string
          type: string
          invite_code: string
          logo_url: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type?: string
          invite_code?: string
          logo_url?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          invite_code?: string
          logo_url?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      player_org_shares: {
        Row: {
          id: string
          player_id: string
          organization_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          player_id: string
          organization_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          organization_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_org_shares_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_org_shares_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: string
          joined_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: string
          joined_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: string
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          id: string
          user_id: string
          author_name: string
          category: string
          title: string
          content: string
          likes: number
          replies_count: number
          is_archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          author_name: string
          category?: string
          title: string
          content: string
          likes?: number
          replies_count?: number
          is_archived?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          author_name?: string
          category?: string
          title?: string
          content?: string
          likes?: number
          replies_count?: number
          is_archived?: boolean
          created_at?: string
        }
        Relationships: []
      }
      community_replies: {
        Row: {
          id: string
          post_id: string
          user_id: string
          author_name: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
          author_name: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          user_id?: string
          author_name?: string
          content?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          id: string
          post_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      fixtures: {
        Row: {
          id: string
          user_id: string
          home_team: string
          away_team: string
          match_date: string
          match_time: string | null
          competition: string
          venue: string
          score_home: number | null
          score_away: number | null
          notes: string | null
          is_favorite: boolean
          source: string
          api_fixture_id: number | null
          api_league_id: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          home_team: string
          away_team: string
          match_date: string
          match_time?: string | null
          competition?: string
          venue?: string
          score_home?: number | null
          score_away?: number | null
          notes?: string | null
          is_favorite?: boolean
          source?: string
          api_fixture_id?: number | null
          api_league_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          home_team?: string
          away_team?: string
          match_date?: string
          match_time?: string | null
          competition?: string
          venue?: string
          score_home?: number | null
          score_away?: number | null
          notes?: string | null
          is_favorite?: boolean
          source?: string
          api_fixture_id?: number | null
          api_league_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      watchlists: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      watchlist_players: {
        Row: {
          id: string
          user_id: string
          watchlist_id: string
          player_id: string
          added_at: string
        }
        Insert: {
          id?: string
          user_id: string
          watchlist_id: string
          player_id: string
          added_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          watchlist_id?: string
          player_id?: string
          added_at?: string
        }
        Relationships: []
      }
      shadow_teams: {
        Row: {
          id: string
          user_id: string
          name: string
          formation: string
          logo_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          formation?: string
          logo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          formation?: string
          logo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      shadow_team_players: {
        Row: {
          id: string
          user_id: string
          shadow_team_id: string
          player_id: string
          position_slot: string
          rank: number
          added_at: string
        }
        Insert: {
          id?: string
          user_id: string
          shadow_team_id: string
          player_id: string
          position_slot: string
          rank?: number
          added_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          shadow_team_id?: string
          player_id?: string
          position_slot?: string
          rank?: number
          added_at?: string
        }
        Relationships: []
      }
      squad_players: {
        Row: {
          id: string
          organization_id: string
          name: string
          photo_url: string | null
          date_of_birth: string | null
          nationality: string
          club: string
          league: string
          foot: string
          market_value: string | null
          position: string
          position_secondaire: string | null
          jersey_number: number | null
          contract_start: string | null
          contract_end: string | null
          monthly_salary: number | null
          status: string
          agent_name: string
          agent_phone: string
          agent_email: string
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          photo_url?: string | null
          date_of_birth?: string | null
          nationality?: string
          club?: string
          league?: string
          foot?: string
          market_value?: string | null
          position?: string
          position_secondaire?: string | null
          jersey_number?: number | null
          contract_start?: string | null
          contract_end?: string | null
          monthly_salary?: number | null
          status?: string
          agent_name?: string
          agent_phone?: string
          agent_email?: string
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          photo_url?: string | null
          date_of_birth?: string | null
          nationality?: string
          club?: string
          league?: string
          foot?: string
          market_value?: string | null
          position?: string
          position_secondaire?: string | null
          jersey_number?: number | null
          contract_start?: string | null
          contract_end?: string | null
          monthly_salary?: number | null
          status?: string
          agent_name?: string
          agent_phone?: string
          agent_email?: string
          notes?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      club_logos: {
        Row: {
          club_name: string
          logo_url: string
          name_fr: string | null
          name_en: string | null
          name_es: string | null
          updated_at: string
        }
        Insert: {
          club_name: string
          logo_url: string
          name_fr?: string | null
          name_en?: string | null
          name_es?: string | null
          updated_at?: string
        }
        Update: {
          club_name?: string
          logo_url?: string
          name_fr?: string | null
          name_en?: string | null
          name_es?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      followed_clubs: {
        Row: {
          id: string
          user_id: string
          club_name: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          club_name: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          club_name?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          message: string | null
          icon: string | null
          link: string | null
          player_id: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          message?: string | null
          icon?: string | null
          link?: string | null
          player_id?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          title?: string
          message?: string | null
          icon?: string | null
          link?: string | null
          player_id?: string | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          id: string
          user_id: string
          category: string
          subject: string
          message: string
          page_url: string | null
          user_agent: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category?: string
          subject: string
          message: string
          page_url?: string | null
          user_agent?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          category?: string
          subject?: string
          message?: string
          page_url?: string | null
          user_agent?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          id: string
          user_id: string
          rating: number
          message: string | null
          page_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          rating: number
          message?: string | null
          page_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          rating?: number
          message?: string | null
          page_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      championship_players: {
        Row: {
          id: string
          user_id: string
          championship_name: string
          player_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          championship_name: string
          player_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          championship_name?: string
          player_id?: string
          created_at?: string
        }
        Relationships: []
      }
      custom_championships: {
        Row: {
          id: string
          name: string
          country: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          country?: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          country?: string
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          id: string
          user_id: string
          is_premium: boolean
          premium_since: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          plan_type: string
          billing_cycle: string | null
          subscription_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          is_premium?: boolean
          premium_since?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan_type?: string
          billing_cycle?: string | null
          subscription_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          is_premium?: boolean
          premium_since?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan_type?: string
          billing_cycle?: string | null
          subscription_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_player_counts: {
        Args: Record<string, never>
        Returns: {
          count: number
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      get_org_members: {
        Args: {
          organization_id: string
        }
        Returns: {
          id: string
          user_id: string
          role: string
          joined_at: string
          full_name: string
          club: string
          profile_role: string
          social_x: string | null
          social_instagram: string | null
          social_linkedin: string | null
          social_public: boolean
          email: string
        }[]
      }
      get_org_players: {
        Args: {
          org_id: string
        }
        Returns: Database["public"]["Tables"]["players"]["Row"][]
      }
      get_squad_players: {
        Args: {
          org_id: string
        }
        Returns: Database["public"]["Tables"]["squad_players"]["Row"][]
      }
      upsert_squad_player: {
        Args: Record<string, unknown>
        Returns: { success: boolean }
      }
      delete_squad_player: {
        Args: {
          id: string
          org_id: string
        }
        Returns: { success: boolean }
      }
      share_player_with_org: {
        Args: {
          player_id: string
          organization_id: string
        }
        Returns: { success: boolean }
      }
      unshare_player_from_org: {
        Args: {
          player_id: string
          organization_id: string
        }
        Returns: { success: boolean }
      }
      get_player_org_shares: {
        Args: {
          player_ids: string[]
        }
        Returns: {
          player_id: string
          organization_id: string
          organization_name: string
        }[]
      }
      get_scout_opinions: {
        Args: {
          player_id: string
          organization_id: string
        }
        Returns: {
          id: string
          player_id: string
          organization_id: string
          user_id: string
          current_level: number | null
          potential: number | null
          opinion: string | null
          notes: string | null
          links: Json | null
          match_observed: string | null
          observed_at: string | null
          scout_name: string | null
          created_at: string
        }[]
      }
      add_scout_opinion: {
        Args: {
          player_id: string
          organization_id: string
          current_level?: number | null
          potential?: number | null
          opinion?: string | null
          notes?: string | null
          links?: string[] | null
          match_observed?: string | null
          observed_at?: string | null
        }
        Returns: { success: boolean }
      }
      delete_scout_opinion: {
        Args: {
          opinion_id: string
        }
        Returns: { success: boolean }
      }
      community_mentionable_users: {
        Args: Record<string, never>
        Returns: {
          author_name: string
          user_id: string
          club: string | null
          role: string | null
        }[]
      }
      like_community_post: {
        Args: {
          post_id: string
          liker_id: string
        }
        Returns: { success: boolean }
      }
      increment_reply_count: {
        Args: {
          post_id: string
        }
        Returns: { success: boolean }
      }
      decrement_reply_count: {
        Args: {
          post_id: string
        }
        Returns: { success: boolean }
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    },
  },
} as const
