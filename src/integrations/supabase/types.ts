export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      approval_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string | null;
          actor_role: Database["public"]["Enums"]["app_role"] | null;
          amount: number | null;
          created_at: string;
          detail: string | null;
          id: string;
          org_id: string;
          requisition_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name?: string | null;
          actor_role?: Database["public"]["Enums"]["app_role"] | null;
          amount?: number | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          org_id: string;
          requisition_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          actor_role?: Database["public"]["Enums"]["app_role"] | null;
          amount?: number | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          org_id?: string;
          requisition_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "approval_audit_log_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_rules: {
        Row: {
          approval_mode: Database["public"]["Enums"]["approval_mode"];
          created_at: string;
          extra_role_if_unbudgeted: Database["public"]["Enums"]["app_role"] | null;
          id: string;
          is_active: boolean;
          label: string;
          max_amount: number | null;
          min_amount: number;
          org_id: string;
          required_roles: Database["public"]["Enums"]["app_role"][];
          sort_order: number;
        };
        Insert: {
          approval_mode?: Database["public"]["Enums"]["approval_mode"];
          created_at?: string;
          extra_role_if_unbudgeted?: Database["public"]["Enums"]["app_role"] | null;
          id?: string;
          is_active?: boolean;
          label: string;
          max_amount?: number | null;
          min_amount?: number;
          org_id: string;
          required_roles?: Database["public"]["Enums"]["app_role"][];
          sort_order?: number;
        };
        Update: {
          approval_mode?: Database["public"]["Enums"]["approval_mode"];
          created_at?: string;
          extra_role_if_unbudgeted?: Database["public"]["Enums"]["app_role"] | null;
          id?: string;
          is_active?: boolean;
          label?: string;
          max_amount?: number | null;
          min_amount?: number;
          org_id?: string;
          required_roles?: Database["public"]["Enums"]["app_role"][];
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "approval_rules_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_steps: {
        Row: {
          comment: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          org_id: string;
          reason: string | null;
          required_role: Database["public"]["Enums"]["app_role"];
          requisition_id: string;
          status: Database["public"]["Enums"]["approval_status"];
          step_order: number;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          org_id: string;
          reason?: string | null;
          required_role: Database["public"]["Enums"]["app_role"];
          requisition_id: string;
          status?: Database["public"]["Enums"]["approval_status"];
          step_order: number;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          org_id?: string;
          reason?: string | null;
          required_role?: Database["public"]["Enums"]["app_role"];
          requisition_id?: string;
          status?: Database["public"]["Enums"]["approval_status"];
          step_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "approval_steps_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approval_steps_requisition_id_fkey";
            columns: ["requisition_id"];
            isOneToOne: false;
            referencedRelation: "requisitions";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_invoices: {
        Row: {
          created_at: string;
          created_by: string | null;
          currency: Database["public"]["Enums"]["currency_code"];
          description: string | null;
          due_date: string;
          id: string;
          invoice_number: string;
          issue_date: string;
          marked_paid_by: string | null;
          notes: string | null;
          org_id: string;
          paid_at: string | null;
          payment_reference: string | null;
          period_end: string;
          period_start: string;
          plan: Database["public"]["Enums"]["subscription_plan"];
          status: string;
          subtotal: number;
          total_amount: number | null;
          updated_at: string;
          vat_amount: number | null;
          vat_rate: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          currency?: Database["public"]["Enums"]["currency_code"];
          description?: string | null;
          due_date: string;
          id?: string;
          invoice_number: string;
          issue_date?: string;
          marked_paid_by?: string | null;
          notes?: string | null;
          org_id: string;
          paid_at?: string | null;
          payment_reference?: string | null;
          period_end: string;
          period_start: string;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          status?: string;
          subtotal: number;
          total_amount?: number | null;
          updated_at?: string;
          vat_amount?: number | null;
          vat_rate?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          currency?: Database["public"]["Enums"]["currency_code"];
          description?: string | null;
          due_date?: string;
          id?: string;
          invoice_number?: string;
          issue_date?: string;
          marked_paid_by?: string | null;
          notes?: string | null;
          org_id?: string;
          paid_at?: string | null;
          payment_reference?: string | null;
          period_end?: string;
          period_start?: string;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          status?: string;
          subtotal?: number;
          total_amount?: number | null;
          updated_at?: string;
          vat_amount?: number | null;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "billing_invoices_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          id: string;
          org_id: string;
          purchase_order_id: string | null;
          supplier_id: string | null;
          invoice_number: string;
          issue_date: string;
          due_date: string;
          currency: Database["public"]["Enums"]["currency_code"];
          subtotal: number;
          vat_amount: number;
          total_amount: number;
          seller_legal_name: string;
          seller_tin: string | null;
          buyer_legal_name: string;
          buyer_tin: string | null;
          irn: string | null;
          irn_clearance_status: "pending" | "cleared" | "flagged";
          irn_cleared_at: string | null;
          three_way_match_status: "pending" | "matched" | "discrepancy_flagged";
          match_discrepancies: Json;
          status: "draft" | "pending_approval" | "approved_for_payment" | "paid" | "rejected";
          notes: string | null;
          wht_applicable: boolean;
          wht_rate: number;
          wht_amount: number | null;
          wht_credit_note_received: boolean;
          wht_credit_note_reference: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          purchase_order_id?: string | null;
          supplier_id?: string | null;
          invoice_number: string;
          issue_date?: string;
          due_date: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          subtotal?: number;
          vat_amount?: number;
          total_amount?: number;
          seller_legal_name?: string;
          seller_tin?: string | null;
          buyer_legal_name?: string;
          buyer_tin?: string | null;
          irn?: string | null;
          irn_clearance_status?: "pending" | "cleared" | "flagged";
          irn_cleared_at?: string | null;
          three_way_match_status?: "pending" | "matched" | "discrepancy_flagged";
          match_discrepancies?: Json;
          status?: "draft" | "pending_approval" | "approved_for_payment" | "paid" | "rejected";
          notes?: string | null;
          wht_applicable?: boolean;
          wht_rate?: number;
          wht_amount?: number | null;
          wht_credit_note_received?: boolean;
          wht_credit_note_reference?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          purchase_order_id?: string | null;
          supplier_id?: string | null;
          invoice_number?: string;
          issue_date?: string;
          due_date?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          subtotal?: number;
          vat_amount?: number;
          total_amount?: number;
          seller_legal_name?: string;
          seller_tin?: string | null;
          buyer_legal_name?: string;
          buyer_tin?: string | null;
          irn?: string | null;
          irn_clearance_status?: "pending" | "cleared" | "flagged";
          irn_cleared_at?: string | null;
          three_way_match_status?: "pending" | "matched" | "discrepancy_flagged";
          match_discrepancies?: Json;
          status?: "draft" | "pending_approval" | "approved_for_payment" | "paid" | "rejected";
          notes?: string | null;
          wht_applicable?: boolean;
          wht_rate?: number;
          wht_amount?: number | null;
          wht_credit_note_received?: boolean;
          wht_credit_note_reference?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          kind: string;
          org_id: string;
          read_at: string | null;
          requisition_id: string | null;
          rfq_id: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          org_id: string;
          read_at?: string | null;
          requisition_id?: string | null;
          rfq_id?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          org_id?: string;
          read_at?: string | null;
          requisition_id?: string | null;
          rfq_id?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_requisition_id_fkey";
            columns: ["requisition_id"];
            isOneToOne: false;
            referencedRelation: "requisitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_rfq_id_fkey";
            columns: ["rfq_id"];
            isOneToOne: false;
            referencedRelation: "rfqs";
            referencedColumns: ["id"];
          },
        ];
      };
      org_invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          id: string;
          invited_by: string | null;
          org_id: string;
          roles: Database["public"]["Enums"]["app_role"][];
          status: string;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          invited_by?: string | null;
          org_id: string;
          roles?: Database["public"]["Enums"]["app_role"][];
          status?: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          invited_by?: string | null;
          org_id?: string;
          roles?: Database["public"]["Enums"]["app_role"][];
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_invitations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          base_currency: Database["public"]["Enums"]["currency_code"];
          created_at: string;
          id: string;
          name: string;
          plan: Database["public"]["Enums"]["subscription_plan"];
          primary_contact_email: string | null;
          status: string;
          suspended_at: string | null;
          suspension_reason: string | null;
        };
        Insert: {
          base_currency?: Database["public"]["Enums"]["currency_code"];
          created_at?: string;
          id?: string;
          name: string;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          primary_contact_email?: string | null;
          status?: string;
          suspended_at?: string | null;
          suspension_reason?: string | null;
        };
        Update: {
          base_currency?: Database["public"]["Enums"]["currency_code"];
          created_at?: string;
          id?: string;
          name?: string;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          primary_contact_email?: string | null;
          status?: string;
          suspended_at?: string | null;
          suspension_reason?: string | null;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          note: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          note?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          note?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      po_line_items: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"];
          description: string;
          id: string;
          purchase_order_id: string;
          quantity: number;
          sort_order: number;
          unit_price: number;
        };
        Insert: {
          currency?: Database["public"]["Enums"]["currency_code"];
          description: string;
          id?: string;
          purchase_order_id: string;
          quantity?: number;
          sort_order?: number;
          unit_price?: number;
        };
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"];
          description?: string;
          id?: string;
          purchase_order_id?: string;
          quantity?: number;
          sort_order?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "po_line_items_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          department: string | null;
          email: string;
          full_name: string;
          id: string;
          org_id: string | null;
        };
        Insert: {
          created_at?: string;
          department?: string | null;
          email?: string;
          full_name?: string;
          id: string;
          org_id?: string | null;
        };
        Update: {
          created_at?: string;
          department?: string | null;
          email?: string;
          full_name?: string;
          id?: string;
          org_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          budget_amount: number | null;
          created_at: string;
          id: string;
          location: string | null;
          name: string;
          org_id: string;
        };
        Insert: {
          budget_amount?: number | null;
          created_at?: string;
          id?: string;
          location?: string | null;
          name: string;
          org_id: string;
        };
        Update: {
          budget_amount?: number | null;
          created_at?: string;
          id?: string;
          location?: string | null;
          name?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_orders: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by_name: string | null;
          delivery_address: string | null;
          fx_rate_note: string | null;
          id: string;
          issued_at: string;
          issued_by: string;
          org_id: string;
          override_reason: string | null;
          po_number: string;
          quote_id: string | null;
          recommended_quote_id: string | null;
          requisition_id: string | null;
          rfq_id: string | null;
          settlement_currency: Database["public"]["Enums"]["currency_code"];
          status: Database["public"]["Enums"]["po_status"];
          supplier_id: string | null;
          total_amount: number;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by_name?: string | null;
          delivery_address?: string | null;
          fx_rate_note?: string | null;
          id?: string;
          issued_at?: string;
          issued_by: string;
          org_id: string;
          override_reason?: string | null;
          po_number?: string;
          quote_id?: string | null;
          recommended_quote_id?: string | null;
          requisition_id?: string | null;
          rfq_id?: string | null;
          settlement_currency?: Database["public"]["Enums"]["currency_code"];
          status?: Database["public"]["Enums"]["po_status"];
          supplier_id?: string | null;
          total_amount?: number;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by_name?: string | null;
          delivery_address?: string | null;
          fx_rate_note?: string | null;
          id?: string;
          issued_at?: string;
          issued_by?: string;
          org_id?: string;
          override_reason?: string | null;
          po_number?: string;
          quote_id?: string | null;
          recommended_quote_id?: string | null;
          requisition_id?: string | null;
          rfq_id?: string | null;
          settlement_currency?: Database["public"]["Enums"]["currency_code"];
          status?: Database["public"]["Enums"]["po_status"];
          supplier_id?: string | null;
          total_amount?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_orders_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_requisition_id_fkey";
            columns: ["requisition_id"];
            isOneToOne: false;
            referencedRelation: "requisitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_rfq_id_fkey";
            columns: ["rfq_id"];
            isOneToOne: false;
            referencedRelation: "rfqs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      quote_items: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"];
          description: string;
          id: string;
          quantity: number;
          quote_id: string;
          requisition_item_id: string | null;
          sort_order: number;
          unit_price: number;
          vat_amount: number;
          vat_rate: number;
        };
        Insert: {
          currency?: Database["public"]["Enums"]["currency_code"];
          description: string;
          id?: string;
          quantity?: number;
          quote_id: string;
          requisition_item_id?: string | null;
          sort_order?: number;
          unit_price?: number;
          vat_amount?: number;
          vat_rate?: number;
        };
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"];
          description?: string;
          id?: string;
          quantity?: number;
          quote_id?: string;
          requisition_item_id?: string | null;
          sort_order?: number;
          unit_price?: number;
          vat_amount?: number;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_items_requisition_item_id_fkey";
            columns: ["requisition_item_id"];
            isOneToOne: false;
            referencedRelation: "requisition_items";
            referencedColumns: ["id"];
          },
        ];
      };
      quotes: {
        Row: {
          attachment_path: string | null;
          currency: Database["public"]["Enums"]["currency_code"];
          delivery_charge: number;
          id: string;
          lead_time_days: number | null;
          org_id: string;
          payment_terms: string | null;
          rfq_id: string;
          status: Database["public"]["Enums"]["quote_status"];
          submitted_at: string;
          subtotal: number;
          supplier_id: string;
          total_amount: number;
          validity_days: number | null;
          vat_amount: number;
          warranty_note: string | null;
        };
        Insert: {
          attachment_path?: string | null;
          currency?: Database["public"]["Enums"]["currency_code"];
          delivery_charge?: number;
          id?: string;
          lead_time_days?: number | null;
          org_id: string;
          payment_terms?: string | null;
          rfq_id: string;
          status?: Database["public"]["Enums"]["quote_status"];
          submitted_at?: string;
          subtotal?: number;
          supplier_id: string;
          total_amount?: number;
          validity_days?: number | null;
          vat_amount?: number;
          warranty_note?: string | null;
        };
        Update: {
          attachment_path?: string | null;
          currency?: Database["public"]["Enums"]["currency_code"];
          delivery_charge?: number;
          id?: string;
          lead_time_days?: number | null;
          org_id?: string;
          payment_terms?: string | null;
          rfq_id?: string;
          status?: Database["public"]["Enums"]["quote_status"];
          submitted_at?: string;
          subtotal?: number;
          supplier_id?: string;
          total_amount?: number;
          validity_days?: number | null;
          vat_amount?: number;
          warranty_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "quotes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_rfq_id_fkey";
            columns: ["rfq_id"];
            isOneToOne: false;
            referencedRelation: "rfqs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      requisition_items: {
        Row: {
          attachments: Json | null;
          description: string;
          estimated_unit_price: number;
          id: string;
          quantity: number;
          requisition_id: string;
          sort_order: number;
          unit: string;
        };
        Insert: {
          attachments?: Json | null;
          description: string;
          estimated_unit_price?: number;
          id?: string;
          quantity?: number;
          requisition_id: string;
          sort_order?: number;
          unit?: string;
        };
        Update: {
          attachments?: Json | null;
          description?: string;
          estimated_unit_price?: number;
          id?: string;
          quantity?: number;
          requisition_id?: string;
          sort_order?: number;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requisition_items_requisition_id_fkey";
            columns: ["requisition_id"];
            isOneToOne: false;
            referencedRelation: "requisitions";
            referencedColumns: ["id"];
          },
        ];
      };
      requisitions: {
        Row: {
          created_at: string;
          currency: Database["public"]["Enums"]["currency_code"];
          id: string;
          is_unbudgeted: boolean;
          needed_by: string | null;
          notes: string | null;
          org_id: string;
          project_id: string | null;
          reference: string;
          requester_id: string;
          status: Database["public"]["Enums"]["requisition_status"];
          submitted_at: string | null;
          title: string;
          total_amount: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          id?: string;
          is_unbudgeted?: boolean;
          needed_by?: string | null;
          notes?: string | null;
          org_id: string;
          project_id?: string | null;
          reference?: string;
          requester_id: string;
          status?: Database["public"]["Enums"]["requisition_status"];
          submitted_at?: string | null;
          title: string;
          total_amount?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: Database["public"]["Enums"]["currency_code"];
          id?: string;
          is_unbudgeted?: boolean;
          needed_by?: string | null;
          notes?: string | null;
          org_id?: string;
          project_id?: string | null;
          reference?: string;
          requester_id?: string;
          status?: Database["public"]["Enums"]["requisition_status"];
          submitted_at?: string | null;
          title?: string;
          total_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requisitions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requisitions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      rfq_invitations: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          opened_at: string | null;
          org_id: string;
          responded_at: string | null;
          rfq_id: string;
          supplier_id: string;
          token: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          opened_at?: string | null;
          org_id: string;
          responded_at?: string | null;
          rfq_id: string;
          supplier_id: string;
          token?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          opened_at?: string | null;
          org_id?: string;
          responded_at?: string | null;
          rfq_id?: string;
          supplier_id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rfq_invitations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rfq_invitations_rfq_id_fkey";
            columns: ["rfq_id"];
            isOneToOne: false;
            referencedRelation: "rfqs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rfq_invitations_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      rfqs: {
        Row: {
          all_responded_notified_at: string | null;
          closed_notified_at: string | null;
          closes_at: string;
          created_at: string;
          created_by: string;
          id: string;
          instructions: string | null;
          org_id: string;
          reference: string;
          requisition_id: string;
          status: Database["public"]["Enums"]["rfq_status"];
          title: string;
        };
        Insert: {
          all_responded_notified_at?: string | null;
          closed_notified_at?: string | null;
          closes_at?: string;
          created_at?: string;
          created_by: string;
          id?: string;
          instructions?: string | null;
          org_id: string;
          reference?: string;
          requisition_id: string;
          status?: Database["public"]["Enums"]["rfq_status"];
          title: string;
        };
        Update: {
          all_responded_notified_at?: string | null;
          closed_notified_at?: string | null;
          closes_at?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          instructions?: string | null;
          org_id?: string;
          reference?: string;
          requisition_id?: string;
          status?: Database["public"]["Enums"]["rfq_status"];
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rfqs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rfqs_requisition_id_fkey";
            columns: ["requisition_id"];
            isOneToOne: false;
            referencedRelation: "requisitions";
            referencedColumns: ["id"];
          },
        ];
      };
      security_events: {
        Row: {
          created_at: string;
          detail: string | null;
          email: string | null;
          event: string;
          id: string;
          ip_address: string | null;
          user_agent: string | null;
        };
        Insert: {
          created_at?: string;
          detail?: string | null;
          email?: string | null;
          event: string;
          id?: string;
          ip_address?: string | null;
          user_agent?: string | null;
        };
        Update: {
          created_at?: string;
          detail?: string | null;
          email?: string | null;
          event?: string;
          id?: string;
          ip_address?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          contact_name: string | null;
          created_at: string;
          email: string | null;
          id: string;
          is_compliant: boolean;
          name: string;
          org_id: string;
          phone: string | null;
          rating: number | null;
          tax_id: string | null;
        };
        Insert: {
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_compliant?: boolean;
          name: string;
          org_id: string;
          phone?: string | null;
          rating?: number | null;
          tax_id?: string | null;
        };
        Update: {
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_compliant?: boolean;
          name?: string;
          org_id?: string;
          phone?: string | null;
          rating?: number | null;
          tax_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          org_id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          org_id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_receipts: {
        Row: {
          id: string;
          org_id: string;
          purchase_order_id: string;
          project_id: string | null;
          receiving_officer_id: string | null;
          receiving_officer_name: string;
          delivery_note_ref: string | null;
          delivered_at: string;
          status: "accepted" | "partial" | "rejected";
          quality_observations: string | null;
          photos: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          purchase_order_id: string;
          project_id?: string | null;
          receiving_officer_id?: string | null;
          receiving_officer_name: string;
          delivery_note_ref?: string | null;
          delivered_at?: string;
          status?: "accepted" | "partial" | "rejected";
          quality_observations?: string | null;
          photos?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          purchase_order_id?: string;
          project_id?: string | null;
          receiving_officer_id?: string | null;
          receiving_officer_name?: string;
          delivery_note_ref?: string | null;
          delivered_at?: string;
          status?: "accepted" | "partial" | "rejected";
          quality_observations?: string | null;
          photos?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      delivery_receipt_items: {
        Row: {
          id: string;
          delivery_receipt_id: string;
          po_item_id: string | null;
          description: string;
          quantity_delivered: number;
          quantity_accepted: number;
          quantity_rejected: number;
          rejection_reason: string | null;
        };
        Insert: {
          id?: string;
          delivery_receipt_id: string;
          po_item_id?: string | null;
          description: string;
          quantity_delivered?: number;
          quantity_accepted?: number;
          quantity_rejected?: number;
          rejection_reason?: string | null;
        };
        Update: {
          id?: string;
          delivery_receipt_id?: string;
          po_item_id?: string | null;
          description?: string;
          quantity_delivered?: number;
          quantity_accepted?: number;
          quantity_rejected?: number;
          rejection_reason?: string | null;
        };
        Relationships: [];
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          po_item_id: string | null;
          description: string;
          quantity: number;
          unit_price: number;
          vat_rate: number;
          total_amount: number;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          po_item_id?: string | null;
          description: string;
          quantity?: number;
          unit_price?: number;
          vat_rate?: number;
          total_amount?: number;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          po_item_id?: string | null;
          description?: string;
          quantity?: number;
          unit_price?: number;
          vat_rate?: number;
          total_amount?: number;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          org_id: string;
          invoice_id: string | null;
          purchase_order_id: string | null;
          amount: number;
          currency: Database["public"]["Enums"]["currency_code"];
          payment_method: "bank_transfer" | "virtual_account" | "invoice_billing" | "card";
          payment_reference: string | null;
          paid_at: string;
          status: "pending" | "completed" | "failed";
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          invoice_id?: string | null;
          purchase_order_id?: string | null;
          amount: number;
          currency?: Database["public"]["Enums"]["currency_code"];
          payment_method?: "bank_transfer" | "virtual_account" | "invoice_billing" | "card";
          payment_reference?: string | null;
          paid_at?: string;
          status?: "pending" | "completed" | "failed";
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          invoice_id?: string | null;
          purchase_order_id?: string | null;
          amount?: number;
          currency?: Database["public"]["Enums"]["currency_code"];
          payment_method?: "bank_transfer" | "virtual_account" | "invoice_billing" | "card";
          payment_reference?: string | null;
          paid_at?: string;
          status?: "pending" | "completed" | "failed";
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ndpa_consent_logs: {
        Row: {
          id: string;
          org_id: string;
          user_id: string | null;
          consent_type: string;
          granted: boolean;
          ip_address: string | null;
          details: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id?: string | null;
          consent_type: string;
          granted?: boolean;
          ip_address?: string | null;
          details?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          user_id?: string | null;
          consent_type?: string;
          granted?: boolean;
          ip_address?: string | null;
          details?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      units_of_measure: {
        Row: {
          id: string;
          org_id: string;
          code: string;
          name: string;
          symbol: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          code: string;
          name: string;
          symbol?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          code?: string;
          name?: string;
          symbol?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      item_categories: {
        Row: {
          id: string;
          org_id: string;
          code: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          code: string;
          name: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      items: {
        Row: {
          id: string;
          org_id: string;
          category_id: string | null;
          uom_id: string | null;
          sku: string | null;
          name: string;
          description: string | null;
          estimated_unit_price: number;
          currency: Database["public"]["Enums"]["currency_code"];
          preferred_supplier_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          category_id?: string | null;
          uom_id?: string | null;
          sku?: string | null;
          name: string;
          description?: string | null;
          estimated_unit_price?: number;
          currency?: Database["public"]["Enums"]["currency_code"];
          preferred_supplier_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          category_id?: string | null;
          uom_id?: string | null;
          sku?: string | null;
          name?: string;
          description?: string | null;
          estimated_unit_price?: number;
          currency?: Database["public"]["Enums"]["currency_code"];
          preferred_supplier_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sites: {
        Row: {
          id: string;
          org_id: string;
          project_id: string;
          name: string;
          location: string | null;
          contact_person: string | null;
          contact_phone: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          project_id: string;
          name: string;
          location?: string | null;
          contact_person?: string | null;
          contact_phone?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          project_id?: string;
          name?: string;
          location?: string | null;
          contact_person?: string | null;
          contact_phone?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cost_codes: {
        Row: {
          id: string;
          org_id: string;
          project_id: string | null;
          code: string;
          description: string;
          allocated_amount: number;
          committed_amount: number;
          incurred_amount: number;
          currency: Database["public"]["Enums"]["currency_code"];
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          project_id?: string | null;
          code: string;
          description: string;
          allocated_amount?: number;
          committed_amount?: number;
          incurred_amount?: number;
          currency?: Database["public"]["Enums"]["currency_code"];
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          project_id?: string | null;
          code?: string;
          description?: string;
          allocated_amount?: number;
          committed_amount?: number;
          incurred_amount?: number;
          currency?: Database["public"]["Enums"]["currency_code"];
          created_at?: string;
        };
        Relationships: [];
      };
      secure_action_tokens: {
        Row: {
          id: string;
          org_id: string;
          token_hash: string;
          action_type: string;
          entity_type: string;
          entity_id: string;
          actor_id: string | null;
          recipient_identifier: string;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          token_hash: string;
          action_type: string;
          entity_type: string;
          entity_id: string;
          actor_id?: string | null;
          recipient_identifier: string;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          token_hash?: string;
          action_type?: string;
          entity_type?: string;
          entity_id?: string;
          actor_id?: string | null;
          recipient_identifier?: string;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_org_id: { Args: never; Returns: string };
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][];
          _user_id: string;
        };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_org_staff: { Args: { _user_id: string }; Returns: boolean };
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean };
      org_users_with_roles: {
        Args: {
          _org_id: string;
          _roles: Database["public"]["Enums"]["app_role"][];
        };
        Returns: {
          email: string;
          full_name: string;
          roles: Database["public"]["Enums"]["app_role"][];
          user_id: string;
        }[];
      };
      project_budget_status: {
        Args: { _project_id: string };
        Returns: {
          budget_amount: number;
          committed: number;
          issued: number;
          remaining: number;
        }[];
      };
      sweep_overdue_billing: { Args: never; Returns: number };
    };
    Enums: {
      app_role:
        "requester" | "approver" | "procurement_officer" | "finance" | "executive" | "admin";
      approval_mode: "sequential" | "parallel";
      approval_status: "pending" | "approved" | "rejected" | "skipped";
      currency_code: "NGN" | "USD";
      po_status: "draft" | "issued" | "acknowledged" | "cancelled";
      quote_status: "invited" | "submitted" | "shortlisted" | "awarded" | "rejected";
      requisition_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "rfq_issued"
        | "po_issued"
        | "cancelled";
      rfq_status: "open" | "closed" | "awarded" | "cancelled";
      subscription_plan: "starter" | "growth" | "business" | "enterprise" | "custom";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["requester", "approver", "procurement_officer", "finance", "executive", "admin"],
      approval_mode: ["sequential", "parallel"],
      approval_status: ["pending", "approved", "rejected", "skipped"],
      currency_code: ["NGN", "USD"],
      po_status: ["draft", "issued", "acknowledged", "cancelled"],
      quote_status: ["invited", "submitted", "shortlisted", "awarded", "rejected"],
      requisition_status: [
        "draft",
        "pending_approval",
        "approved",
        "rejected",
        "rfq_issued",
        "po_issued",
        "cancelled",
      ],
      rfq_status: ["open", "closed", "awarded", "cancelled"],
      subscription_plan: ["starter", "growth", "business", "enterprise", "custom"],
    },
  },
} as const;
