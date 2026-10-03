export type UserRole = 'customer' | 'agent' | 'admin';
export type TicketStatus = 'new' | 'open' | 'pending' | 'solved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketType = 'question' | 'incident' | 'problem' | 'task';

export type IconName =
  | 'ticket'
  | 'user'
  | 'search'
  | 'table'
  | 'lock'
  | 'unlock'
  | 'close'
  | 'send'
  | 'attachment'
  | 'plus'
  | 'chevron-down'
  | 'check'
  | 'settings'
  | 'customers';

export type AttachmentRow = {
  id: string;
  name: string;
  file_path: string;
  size: number;
  mime_type: string;
};

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type TicketRow = {
  id: string;
  ticket_number: number;
  requester_id: string;
  assignee_id: string | null;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
  solved_at: string | null;
};

export type TicketCommentRow = {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  attachments: AttachmentRow[];
  created_at: string;
};

export type TicketAuditLogRow = {
  id: string;
  ticket_id: string;
  actor_id: string;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
};

/** Row shape returned by `*, requester:profiles!requester_id(*), assignee:profiles!assignee_id(*)`. */
export type TicketWithProfilesRow = TicketRow & {
  requester: ProfileRow;
  assignee: ProfileRow | null;
};

/** Row shape returned by `*, author:profiles!author_id(*)`. */
export type TicketCommentWithAuthorRow = TicketCommentRow & {
  author: ProfileRow;
};

/**
 * Structural contract of the `public` schema consumed by `@supabase/supabase-js`.
 * It mirrors the output of `supabase gen types typescript --local`, so the client
 * validates table, column and RPC argument names at compile time.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          email: string;
          full_name: string;
          avatar_url?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          full_name?: string;
          avatar_url?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tickets: {
        Row: TicketRow;
        Insert: {
          id?: string;
          ticket_number?: number;
          requester_id: string;
          assignee_id?: string | null;
          subject: string;
          status?: TicketStatus;
          priority?: TicketPriority;
          type?: TicketType;
          tags?: string[];
          version?: number;
          created_at?: string;
          updated_at?: string;
          solved_at?: string | null;
        };
        Update: {
          requester_id?: string;
          assignee_id?: string | null;
          subject?: string;
          status?: TicketStatus;
          priority?: TicketPriority;
          type?: TicketType;
          tags?: string[];
          version?: number;
          updated_at?: string;
          solved_at?: string | null;
        };
        Relationships: [];
      };
      ticket_comments: {
        Row: TicketCommentRow;
        Insert: {
          id?: string;
          ticket_id: string;
          author_id: string;
          body: string;
          is_internal?: boolean;
          attachments?: AttachmentRow[];
          created_at?: string;
        };
        Update: {
          body?: string;
          is_internal?: boolean;
          attachments?: AttachmentRow[];
        };
        Relationships: [];
      };
      ticket_audit_logs: {
        Row: TicketAuditLogRow;
        Insert: {
          id?: string;
          ticket_id: string;
          actor_id: string;
          action: string;
          changes?: Record<string, { from: unknown; to: unknown }>;
          created_at?: string;
        };
        Update: Record<never, never>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_ticket_atomic: {
        Args: {
          p_subject: string;
          p_body: string;
          p_priority?: TicketPriority;
          p_type?: TicketType;
          p_tags?: string[];
          p_assignee_id?: string | null;
          p_attachments?: AttachmentRow[];
        };
        Returns: TicketRow;
      };
    };
    Enums: {
      user_role: UserRole;
      ticket_status: TicketStatus;
      ticket_priority: TicketPriority;
      ticket_type: TicketType;
    };
    CompositeTypes: Record<never, never>;
  };
}