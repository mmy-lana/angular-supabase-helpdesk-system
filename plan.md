# Implementation Plan: Help Desk Ticketing System (angular-supabase-helpdesk-system)

---

## Technical Baseline & Architectural Decisions

- **Framework:** Angular (latest stable, standalone components, Signals architecture)
- **Change Detection:** `provideZonelessChangeDetection()` (zero `zone.js` dependency)
- **Rendering:** Single Page Application (`--ssr=false`)
- **Unit Testing:** Vitest (`@analogjs/vite-plugin-angular` test environment)
- **Responsive Architecture:**
  - Angular CDK `BreakpointObserver` (`@angular/cdk/layout`) for component swap logic (desktop navigation rail vs. mobile bottom navigation, desktop properties sidebar vs. mobile bottom sheet).
  - Hardcoded CSS media queries (`max-width: 767px`, `min-width: 768px`, `min-width: 1024px`, `min-width: 1280px`) for presentation styling.
- **Styling Architecture:** Pure CSS with scoped custom design tokens (strictly zero Tailwind CSS).
- **Backend Architecture & Build Configurations:**
  - `production` (default `ng build`): `useMockData: false`, connects to production Supabase URL/key, `demoAccounts: []`. Enforces full PostgreSQL RLS and security triggers.
  - `development` (default `ng serve`): `useMockData: false`, connects to local Docker Supabase (`http://127.0.0.1:54321`), injects local `demoAccounts`.
  - `demo` (`ng build --configuration demo`): `useMockData: true`, empty Supabase connection strings, injects sandbox `demoAccounts`. Used exclusively for static, offline showcase deployments.
- **Lazy Supabase Initialization:** `SupabaseService` and the underlying Supabase client must be lazily instantiated. When `environment.useMockData` is `true`, `SupabaseDataRepository` is never constructed, avoiding runtime exceptions from empty connection strings.
- **Authorization Disclaimer:** Static deployments built with `--configuration demo` run `MockDataRepository` and provide zero cryptographic authorization or security isolation; all mock data and internal notes are readable and mutable in the browser client. Production deployments strictly run the `production` configuration backed by Supabase PostgreSQL.
- **Typing Pipeline:** Strongly typed client generated via `supabase gen types typescript --local > src/app/core/models/database.types.ts`.
- **SQLSTATE Namespace:**
  - The custom error prefix `HD` (`HD001` through `HD099`) is explicitly reserved for application domain errors:
    - `HD001`: Closed ticket modification or reopening attempted.
    - `HD002`: Assigned user must have an agent or admin role.
    - `HD003`: Invalid attachment path (upload does not reside in caller directory).
    - `HD004`: Customer forbidden to assign ticket or modify tags on creation.
    - `HD005`: Cannot comment on a closed ticket.

---

## 1. Data Schema, Storage, Security & Database Functions

### 1.1 PostgreSQL Schema, Functions, Triggers, and Publications

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom Enums
CREATE TYPE user_role AS ENUM ('customer', 'agent', 'admin');
CREATE TYPE ticket_status AS ENUM ('new', 'open', 'pending', 'solved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE ticket_type AS ENUM ('question', 'incident', 'problem', 'task');

-- Profiles Table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'customer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

-- Revoke default update permissions and grant only safe editable fields
REVOKE ALL ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.profiles TO authenticated;

-- Tickets Table (Includes integer version for race-free optimistic concurrency)
CREATE TABLE public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    subject TEXT NOT NULL CHECK (char_length(trim(subject)) >= 3 AND char_length(subject) <= 255),
    status ticket_status NOT NULL DEFAULT 'new',
    priority ticket_priority NOT NULL DEFAULT 'normal',
    type ticket_type NOT NULL DEFAULT 'question',
    tags TEXT[] NOT NULL DEFAULT '{}',
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    solved_at TIMESTAMPTZ
);

-- Ticket Comments Table
CREATE TABLE public.ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    body TEXT NOT NULL CHECK (char_length(trim(body)) > 0),
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

-- Ticket Audit Logs Table
CREATE TABLE public.ticket_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

-- Indexes for performance and keyset pagination
CREATE INDEX idx_tickets_keyset ON public.tickets(created_at DESC, id DESC);
CREATE INDEX idx_tickets_requester ON public.tickets(requester_id);
CREATE INDEX idx_tickets_assignee ON public.tickets(assignee_id);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_ticket_comments_ticket_created ON public.ticket_comments(ticket_id, created_at ASC);
CREATE INDEX idx_ticket_audit_logs_ticket ON public.ticket_audit_logs(ticket_id);

-- Enable Realtime Publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets, public.ticket_comments;
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.ticket_comments REPLICA IDENTITY FULL;

-- Helper Function: Check User Role with Hardened Search Path
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- Trigger: Enforce New User Creation Profile (Validates avatar_url https prefix)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_avatar_url TEXT;
BEGIN
    v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
    IF v_avatar_url IS NOT NULL AND NOT (v_avatar_url ~* '^https://') THEN
        v_avatar_url := NULL;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        v_avatar_url,
        'customer'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger: Immutability for Closed Tickets, Solved Timestamp & Incremental Version
CREATE OR REPLACE FUNCTION public.handle_ticket_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Absolute immutability check: closed tickets reject any column modification
    IF OLD.status = 'closed' THEN
        RAISE EXCEPTION 'Closed tickets cannot be modified or reopened.' USING ERRCODE = 'HD001';
    END IF;

    NEW.updated_at = TIMEZONE('utc', NOW());

    -- Increment version ONLY when core mutable properties change (ignores comment touches)
    IF (
        OLD.status IS DISTINCT FROM NEW.status OR
        OLD.priority IS DISTINCT FROM NEW.priority OR
        OLD.type IS DISTINCT FROM NEW.type OR
        OLD.assignee_id IS DISTINCT FROM NEW.assignee_id OR
        OLD.tags IS DISTINCT FROM NEW.tags OR
        OLD.subject IS DISTINCT FROM NEW.subject
    ) THEN
        NEW.version = OLD.version + 1;
    END IF;

    -- Manage solved_at timestamp
    IF NEW.status = 'solved' AND OLD.status <> 'solved' THEN
        NEW.solved_at = TIMEZONE('utc', NOW());
    ELSIF NEW.status <> 'solved' AND OLD.status = 'solved' THEN
        NEW.solved_at = NULL;
    END IF;

    -- Enforce Assignee Role Validation
    IF NEW.assignee_id IS NOT NULL AND (OLD.assignee_id IS NULL OR NEW.assignee_id <> OLD.assignee_id) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = NEW.assignee_id AND role IN ('agent', 'admin')
        ) THEN
            RAISE EXCEPTION 'Assigned user must have an agent or admin role.' USING ERRCODE = 'HD002';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trg_ticket_updates
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE PROCEDURE public.handle_ticket_updates();

-- Trigger: Non-forgeable Audit Logging
CREATE OR REPLACE FUNCTION public.log_ticket_changes()
RETURNS TRIGGER AS $$
DECLARE
    changes_payload JSONB := '{}'::jsonb;
BEGIN
    IF OLD.status <> NEW.status THEN
        changes_payload = changes_payload || jsonb_build_object('status', jsonb_build_object('from', OLD.status, 'to', NEW.status));
    END IF;
    IF OLD.priority <> NEW.priority THEN
        changes_payload = changes_payload || jsonb_build_object('priority', jsonb_build_object('from', OLD.priority, 'to', NEW.priority));
    END IF;
    IF COALESCE(OLD.assignee_id, '00000000-0000-0000-0000-000000000000'::uuid) <> COALESCE(NEW.assignee_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        changes_payload = changes_payload || jsonb_build_object('assignee_id', jsonb_build_object('from', OLD.assignee_id, 'to', NEW.assignee_id));
    END IF;
    IF OLD.subject <> NEW.subject THEN
        changes_payload = changes_payload || jsonb_build_object('subject', jsonb_build_object('from', OLD.subject, 'to', NEW.subject));
    END IF;

    IF changes_payload <> '{}'::jsonb THEN
        INSERT INTO public.ticket_audit_logs (ticket_id, actor_id, action, changes)
        VALUES (
            NEW.id,
            COALESCE(auth.uid(), NEW.requester_id),
            'ticket_updated',
            changes_payload
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trg_audit_ticket_changes
    AFTER UPDATE ON public.tickets
    FOR EACH ROW EXECUTE PROCEDURE public.log_ticket_changes();

-- Trigger: Validate Comments Before Insert (Enforces HD005 and HD003)
CREATE OR REPLACE FUNCTION public.handle_comment_before_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket_status ticket_status;
    v_att JSONB;
BEGIN
    SELECT status INTO v_ticket_status FROM public.tickets WHERE id = NEW.ticket_id;
    IF v_ticket_status = 'closed' THEN
        RAISE EXCEPTION 'Cannot comment on a closed ticket.' USING ERRCODE = 'HD005';
    END IF;

    -- Validate that all attachment file paths reside strictly in the author's folder
    FOR v_att IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.attachments, '[]'::jsonb))
    LOOP
        IF NOT starts_with(v_att->>'file_path', NEW.author_id::text || '/') THEN
            RAISE EXCEPTION 'Invalid attachment path: Access denied.' USING ERRCODE = 'HD003';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trg_comment_before_insert
    BEFORE INSERT ON public.ticket_comments
    FOR EACH ROW EXECUTE PROCEDURE public.handle_comment_before_insert();

-- Trigger: Comments Bump Ticket Updated_At
CREATE OR REPLACE FUNCTION public.handle_comment_ticket_touch()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.tickets
    SET updated_at = TIMEZONE('utc', NOW())
    WHERE id = NEW.ticket_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trg_comment_touch_ticket
    AFTER INSERT ON public.ticket_comments
    FOR EACH ROW EXECUTE PROCEDURE public.handle_comment_ticket_touch();

-- Trigger: Customer Reply Reopens Solved Ticket
CREATE OR REPLACE FUNCTION public.handle_customer_reply_reopen()
RETURNS TRIGGER AS $$
DECLARE
    v_author_role user_role;
    v_ticket_status ticket_status;
BEGIN
    SELECT role INTO v_author_role FROM public.profiles WHERE id = NEW.author_id;
    SELECT status INTO v_ticket_status FROM public.tickets WHERE id = NEW.ticket_id;

    IF v_author_role = 'customer' AND v_ticket_status = 'solved' AND NEW.is_internal = FALSE THEN
        UPDATE public.tickets
        SET status = 'open'
        WHERE id = NEW.ticket_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trg_customer_reply_reopen
    AFTER INSERT ON public.ticket_comments
    FOR EACH ROW EXECUTE PROCEDURE public.handle_customer_reply_reopen();

-- Stored Procedure: Atomic Ticket Creation
CREATE OR REPLACE FUNCTION public.create_ticket_atomic(
    p_subject TEXT,
    p_body TEXT,
    p_priority ticket_priority DEFAULT 'normal',
    p_type ticket_type DEFAULT 'question',
    p_tags TEXT[] DEFAULT '{}'::TEXT[],
    p_assignee_id UUID DEFAULT NULL,
    p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS public.tickets AS $$
DECLARE
    v_user_id UUID;
    v_user_role user_role;
    v_ticket public.tickets;
    v_att JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;

    -- Prevent assignment to non-agents
    IF p_assignee_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_assignee_id AND role IN ('agent', 'admin')
    ) THEN
        RAISE EXCEPTION 'Assignee must be an agent or admin.' USING ERRCODE = 'HD002';
    END IF;

    -- Security validation: Customers cannot assign tickets or define custom tags
    IF v_user_role = 'customer' THEN
        IF p_assignee_id IS NOT NULL THEN
            RAISE EXCEPTION 'Customers cannot assign tickets.' USING ERRCODE = 'HD004';
        END IF;
        p_tags := '{}'::TEXT[];
    END IF;

    -- Attachment path validation: ensure caller owns storage paths (null-safe)
    FOR v_att IN SELECT * FROM jsonb_array_elements(COALESCE(p_attachments, '[]'::jsonb))
    LOOP
        IF NOT starts_with(v_att->>'file_path', v_user_id::text || '/') THEN
            RAISE EXCEPTION 'Invalid attachment path: Access denied.' USING ERRCODE = 'HD003';
        END IF;
    END LOOP;

    INSERT INTO public.tickets (
        requester_id,
        assignee_id,
        subject,
        status,
        priority,
        type,
        tags
    ) VALUES (
        v_user_id,
        p_assignee_id,
        p_subject,
        'new',
        p_priority,
        p_type,
        p_tags
    ) RETURNING * INTO v_ticket;

    INSERT INTO public.ticket_comments (
        ticket_id,
        author_id,
        body,
        is_internal,
        attachments
    ) VALUES (
        v_ticket.id,
        v_user_id,
        p_body,
        FALSE,
        p_attachments
    );

    INSERT INTO public.ticket_audit_logs (ticket_id, actor_id, action, changes)
    VALUES (
        v_ticket.id,
        v_user_id,
        'ticket_created',
        jsonb_build_object('subject', p_subject, 'type', p_type, 'priority', p_priority)
    );

    RETURN v_ticket;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Profiles access policy"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() OR 
        role IN ('agent', 'admin') OR
        public.current_user_role() IN ('agent', 'admin')
    );

CREATE POLICY "Profile self-update"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- Tickets Policies
CREATE POLICY "Tickets SELECT policy"
    ON public.tickets FOR SELECT
    TO authenticated
    USING (
        auth.uid() = requester_id OR 
        public.current_user_role() IN ('agent', 'admin')
    );

CREATE POLICY "Tickets UPDATE policy"
    ON public.tickets FOR UPDATE
    TO authenticated
    USING (public.current_user_role() IN ('agent', 'admin'))
    WITH CHECK (public.current_user_role() IN ('agent', 'admin'));

-- Ticket Comments Policies
CREATE POLICY "Comments SELECT policy"
    ON public.ticket_comments FOR SELECT
    TO authenticated
    USING (
        public.current_user_role() IN ('agent', 'admin') OR
        (
            is_internal = FALSE AND
            EXISTS (
                SELECT 1 FROM public.tickets t
                WHERE t.id = ticket_comments.ticket_id
                AND t.requester_id = auth.uid()
            )
        )
    );

CREATE POLICY "Comments INSERT policy"
    ON public.ticket_comments FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = author_id AND (
            public.current_user_role() IN ('agent', 'admin') OR
            (
                is_internal = FALSE AND
                EXISTS (
                    SELECT 1 FROM public.tickets t
                    WHERE t.id = ticket_comments.ticket_id
                    AND t.requester_id = auth.uid()
                )
            )
        )
    );

-- Audit Logs Policies
CREATE POLICY "Audit logs SELECT policy"
    ON public.ticket_audit_logs FOR SELECT
    TO authenticated
    USING (public.current_user_role() IN ('agent', 'admin'));
```

### 1.2 Supabase Storage Configuration

- **Bucket Name:** `ticket-attachments`
- **Public Visibility:** Private
- **File Size Limit:** 10,485,760 bytes (10 MB)
- **MIME Whitelist:** `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, `text/plain`, `application/zip`

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ticket-attachments', 
    'ticket-attachments', 
    FALSE, 
    10485760, 
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'application/zip']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Attachment Upload Access"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'ticket-attachments' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Attachment Read Access"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'ticket-attachments' AND (
            public.current_user_role() IN ('agent', 'admin') OR
            EXISTS (
                SELECT 1 FROM public.ticket_comments tc
                JOIN public.tickets t ON t.id = tc.ticket_id
                WHERE t.requester_id = auth.uid()
                AND tc.is_internal = FALSE
                AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(tc.attachments) elem
                    WHERE elem->>'file_path' = name
                )
            )
        )
    );
```

---

## 2. Database Models, Pure TypeScript Interfaces, and Explicit Mappers

### 2.1 Database Row Interfaces (`src/app/core/models/database.types.ts`)

```typescript
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

export interface AttachmentRow {
  id: string;
  name: string;
  file_path: string;
  size: number;
  mime_type: string;
}

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface TicketRow {
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
}

export interface TicketCommentRow {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  attachments: AttachmentRow[];
  created_at: string;
}

export interface TicketAuditLogRow {
  id: string;
  ticket_id: string;
  actor_id: string;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
}
```

### 2.2 Environment Models (`src/environments/environment.interface.ts`)

```typescript
export interface DemoAccount {
  readonly label: string;
  readonly email: string;
  readonly password: string;
}

export interface EnvironmentConfig {
  readonly production: boolean;
  readonly useMockData: boolean;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly demoAccounts: readonly DemoAccount[];
}
```

### 2.3 Domain Interfaces, Errors & DTOs (`src/app/core/models/helpdesk.models.ts`)

```typescript
import { UserRole, TicketStatus, TicketPriority, TicketType, IconName } from './database.types';

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  readonly size: number;
  readonly mimeType: string;
}

export interface Profile {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly avatarUrl: string | null;
  readonly role: UserRole;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Ticket {
  readonly id: string;
  readonly ticketNumber: number;
  readonly requesterId: string;
  readonly assigneeId: string | null;
  readonly subject: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly type: TicketType;
  readonly tags: readonly string[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly solvedAt: string | null;
  readonly requester?: Profile;
  readonly assignee?: Profile | null;
}

export interface TicketComment {
  readonly id: string;
  readonly ticketId: string;
  readonly authorId: string;
  readonly body: string;
  readonly isInternal: boolean;
  readonly attachments: readonly Attachment[];
  readonly createdAt: string;
  readonly author?: Profile;
}

export interface TicketAuditLog {
  readonly id: string;
  readonly ticketId: string;
  readonly actorId: string;
  readonly action: string;
  readonly changes: Readonly<Record<string, { from: unknown; to: unknown }>>;
  readonly createdAt: string;
  readonly actor?: Profile;
}

export interface WorkspaceTab {
  readonly id: string;
  readonly type: 'ticket' | 'view' | 'new-ticket' | 'search';
  readonly title: string;
  readonly ticketId?: string;
  readonly isDirty: boolean;
  readonly icon: IconName;
}

export interface CreateTicketDTO {
  readonly subject: string;
  readonly body: string;
  readonly priority: TicketPriority;
  readonly type: TicketType;
  readonly tags: readonly string[];
  readonly assigneeId?: string | null;
  readonly attachments?: readonly Attachment[];
}

export interface UpdateTicketDTO {
  readonly subject?: string;
  readonly status?: TicketStatus;
  readonly priority?: TicketPriority;
  readonly type?: TicketType;
  readonly assigneeId?: string | null;
  readonly tags?: readonly string[];
  readonly version: number;
}

export interface CreateCommentDTO {
  readonly ticketId: string;
  readonly body: string;
  readonly isInternal: boolean;
  readonly attachments?: readonly Attachment[];
}

export class TicketClosedError extends Error {
  constructor(message = 'Closed tickets cannot be modified or reopened.') {
    super(message);
    this.name = 'TicketClosedError';
  }
}

export class TicketConcurrencyError extends Error {
  constructor(message = 'Ticket could not be updated or access was denied. Refresh and try again.') {
    super(message);
    this.name = 'TicketConcurrencyError';
  }
}

export class InvalidAssigneeError extends Error {
  constructor(message = 'Assignee must have an agent or admin role.') {
    super(message);
    this.name = 'InvalidAssigneeError';
  }
}

export class InvalidAttachmentPathError extends Error {
  constructor(message = 'Invalid attachment path: Access denied.') {
    super(message);
    this.name = 'InvalidAttachmentPathError';
  }
}

export class CustomerAssignmentForbiddenError extends Error {
  constructor(message = 'Customers cannot assign tickets or set tags on creation.') {
    super(message);
    this.name = 'CustomerAssignmentForbiddenError';
  }
}

export class CommentForbiddenError extends Error {
  constructor(message = 'Access denied: You do not have permission to post this comment.') {
    super(message);
    this.name = 'CommentForbiddenError';
  }
}
```

### 2.4 Explicit Mappers (`src/app/core/mappers/helpdesk.mapper.ts`)

```typescript
import { ProfileRow, TicketRow, TicketCommentRow, TicketAuditLogRow, AttachmentRow } from '../models/database.types';
import { Profile, Ticket, TicketComment, TicketAuditLog, Attachment } from '../models/helpdesk.models';

export class HelpdeskMapper {
  static toProfile(row: ProfileRow): Profile {
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  static toAttachment(row: AttachmentRow): Attachment {
    return {
      id: row.id,
      name: row.name,
      filePath: row.file_path,
      size: row.size,
      mimeType: row.mime_type
    };
  }

  static toAttachmentRow(att: Attachment): AttachmentRow {
    return {
      id: att.id,
      name: att.name,
      file_path: att.filePath,
      size: att.size,
      mime_type: att.mimeType
    };
  }

  static toAttachmentRowList(attachments?: readonly Attachment[]): AttachmentRow[] {
    if (!attachments || attachments.length === 0) return [];
    return attachments.map(att => this.toAttachmentRow(att));
  }

  static toTicket(
    row: TicketRow, 
    requesterRow?: ProfileRow, 
    assigneeRow?: ProfileRow | null
  ): Ticket {
    return {
      id: row.id,
      ticketNumber: row.ticket_number,
      requesterId: row.requester_id,
      assigneeId: row.assignee_id,
      subject: row.subject,
      status: row.status,
      priority: row.priority,
      type: row.type,
      tags: Object.freeze([...row.tags]),
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      solvedAt: row.solved_at,
      requester: requesterRow ? this.toProfile(requesterRow) : undefined,
      assignee: assigneeRow ? this.toProfile(assigneeRow) : null
    };
  }

  static toTicketComment(row: TicketCommentRow, authorRow?: ProfileRow): TicketComment {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      authorId: row.author_id,
      body: row.body,
      isInternal: row.is_internal,
      attachments: Object.freeze((row.attachments || []).map(att => this.toAttachment(att))),
      createdAt: row.created_at,
      author: authorRow ? this.toProfile(authorRow) : undefined
    };
  }

  static toAuditLog(row: TicketAuditLogRow, actorRow?: ProfileRow): TicketAuditLog {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      actorId: row.actor_id,
      action: row.action,
      changes: Object.freeze({ ...row.changes }),
      createdAt: row.created_at,
      actor: actorRow ? this.toProfile(actorRow) : undefined
    };
  }
}
```

---

## 3. Responsive Layout Contracts & Visual Shell

### 3.1 Breakpoint & Layout Matrix

| Breakpoint Range | Navigation Rail / Bar | Ticket Left Pane (Properties) | Center Pane (Conversation) | Right Pane (Customer Context) |
| :--- | :--- | :--- | :--- | :--- |
| **>= 1280px** (Desktop Wide) | Fixed Left Rail (52px) | Fixed Left Sidebar (260px) | Fluid (min 480px) | Fixed Right Sidebar (280px) |
| **1024px - 1279px** (Desktop Compact) | Fixed Left Rail (52px) | Fixed Left Sidebar (240px) | Fluid (min 440px) | Collapsible Right Overlay Panel |
| **768px - 1023px** (Tablet) | Collapsed Left Rail (48px) | Slide-over Drawer (320px) | Fluid (100% width) | Off-canvas Drawer via Header Trigger |
| **< 768px** (360px, 390px, 430px Mobile) | Fixed Bottom Nav (4 items, `100dvh` aware) | Single-column Bottom Sheet | Full Width Single Column | Nested in Requester Modal / Sheet |

### 3.2 Mobile Touch & Form Factor Guardrails

- **Viewport Metric:** Layout heights utilize `height: 100dvh` and `min-height: 100dvh` to counter mobile browser address bar resizing.
- **Safe Area Inset:** Apply `padding-bottom: env(safe-area-inset-bottom)` to the bottom mobile navigation dock and the ticket reply dock.
- **Touch Target Standard:** All interactive triggers (including tag remove buttons, dropdown menu items, and tab close buttons) must have a tap footprint of at least 44x44px.
  - Tab close visual size: 14x14px SVG wrapped inside a transparent 44x44px hit-box container.
- **iOS Zoom Lock Prevention:** All `<input>`, `<textarea>`, and `<select>` controls explicitly use `font-size: 16px` to prevent automatic viewport zooming on mobile WebKit.
- **Bottom Navigation Items (Maximum 4):**
  1. `Views` (Icon: table)
  2. `Search` (Icon: search)
  3. `New Ticket` (Icon: plus)
  4. `Profile` (Icon: user - opens drawer containing Profile, Role Switch [demo/dev only], and Sign Out)
- **Table Responsive Mode (<768px):** The ticket table collapses into clean cards containing Subject, Status Badge, Priority Badge, Requester Name, and relative timestamp.

---

## 4. Concurrency, Realtime & State Architecture

### 4.1 Layering Architecture

```
[Core Services]
  ├── SupabaseService (lazy low-level client wrapper)
  ├── AuthStateService (holds session signals, provides user identity)
  ├── DataRepository (Abstract Token)
  │     ├── SupabaseDataRepository (Postgres + RLS + RPC calls)
  │     └── MockDataRepository (In-memory + localStorage fallback)
  ├── TicketService (Consumes DataRepository)
  ├── WorkspaceTabService (tab array signals, dirty flags, active ID)
  └── NotificationService (toast signals queue)

[Realtime Bridge]
  └── TicketRealtimeService (Subscribes to channels, emits signals to Feature Stores)

[Feature Stores / Components]
  └── Features consume Core Services; Core Services NEVER import from Features.
```

### 4.2 Data Repositories & Realtime Subscriptions

#### 1. Repository Abstraction (`DataRepository`)

```typescript
export abstract class DataRepository {
  abstract getTicketsByView(view: string, cursor?: { createdAt: string; id: string }): Promise<readonly Ticket[]>;
  abstract getTicketById(id: string): Promise<Ticket>;
  abstract getComments(ticketId: string): Promise<readonly TicketComment[]>;
  abstract createTicket(dto: CreateTicketDTO): Promise<Ticket>;
  abstract updateTicket(ticketId: string, dto: UpdateTicketDTO): Promise<Ticket>;
  abstract claimTicket(ticketId: string, agentId: string, version: number): Promise<Ticket>;
  abstract addComment(dto: CreateCommentDTO): Promise<TicketComment>;
}
```

App bootstrap resolution in `src/app/app.config.ts`:

```typescript
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(appRoutes),
    {
      provide: DataRepository,
      useClass: environment.useMockData ? MockDataRepository : SupabaseDataRepository
    }
  ]
};
```

#### 2. `SupabaseDataRepository` Implementation

```typescript
import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthStateService } from './auth-state.service';
import { DataRepository } from './data-repository.interface';
import { 
  Ticket, TicketComment, CreateTicketDTO, UpdateTicketDTO, CreateCommentDTO,
  TicketClosedError, TicketConcurrencyError, InvalidAssigneeError,
  InvalidAttachmentPathError, CustomerAssignmentForbiddenError, CommentForbiddenError
} from '../models/helpdesk.models';
import { HelpdeskMapper } from '../mappers/helpdesk.mapper';
import { TicketRow, TicketCommentRow } from '../models/database.types';

@Injectable()
export class SupabaseDataRepository implements DataRepository {
  private readonly supabase = inject(SupabaseService);
  private readonly authState = inject(AuthStateService);

  async getTicketsByView(view: string, cursor?: { createdAt: string; id: string }): Promise<readonly Ticket[]> {
    let query = this.supabase.client
      .from('tickets')
      .select('*, requester:profiles!requester_id(*), assignee:profiles!assignee_id(*)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(25);

    if (cursor) {
      query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }

    if (view === 'unassigned') {
      query = query.is('assignee_id', null).in('status', ['new', 'open']);
    } else if (view === 'my-tickets') {
      const user = this.authState.currentUser();
      if (!user) return [];
      query = query.eq('assignee_id', user.id).in('status', ['new', 'open', 'pending']);
    } else if (view === 'solved') {
      query = query.eq('status', 'solved');
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to query tickets: ${error.message}`);
    return (data || []).map(row => HelpdeskMapper.toTicket(row as TicketRow, row.requester, row.assignee));
  }

  async getTicketById(id: string): Promise<Ticket> {
    const { data, error } = await this.supabase.client
      .from('tickets')
      .select('*, requester:profiles!requester_id(*), assignee:profiles!assignee_id(*)')
      .eq('id', id)
      .single();

    if (error || !data) throw new Error(`Ticket not found: ${error?.message || ''}`);
    return HelpdeskMapper.toTicket(data as TicketRow, data.requester, data.assignee);
  }

  async getComments(ticketId: string): Promise<readonly TicketComment[]> {
    const { data, error } = await this.supabase.client
      .from('ticket_comments')
      .select('*, author:profiles!author_id(*)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch comments: ${error.message}`);
    return (data || []).map(row => HelpdeskMapper.toTicketComment(row as TicketCommentRow, row.author));
  }

  async createTicket(dto: CreateTicketDTO): Promise<Ticket> {
    const { data, error } = await this.supabase.client.rpc('create_ticket_atomic', {
      p_subject: dto.subject,
      p_body: dto.body,
      p_priority: dto.priority,
      p_type: dto.type,
      p_tags: [...dto.tags],
      p_assignee_id: dto.assigneeId ?? null,
      p_attachments: HelpdeskMapper.toAttachmentRowList(dto.attachments)
    });

    if (error) {
      if (error.code === 'HD002') throw new InvalidAssigneeError();
      if (error.code === 'HD003') throw new InvalidAttachmentPathError();
      if (error.code === 'HD004') throw new CustomerAssignmentForbiddenError();
      throw new Error(`Failed to create ticket: ${error.message}`);
    }

    if (!data) throw new Error('Failed to create ticket: No data returned from database.');
    return HelpdeskMapper.toTicket(data as TicketRow);
  }

  async updateTicket(ticketId: string, dto: UpdateTicketDTO): Promise<Ticket> {
    const payload: Partial<TicketRow> = {};
    if (dto.subject !== undefined) payload.subject = dto.subject;
    if (dto.status !== undefined) payload.status = dto.status;
    if (dto.priority !== undefined) payload.priority = dto.priority;
    if (dto.type !== undefined) payload.type = dto.type;
    if (dto.assigneeId !== undefined) payload.assignee_id = dto.assigneeId;
    if (dto.tags !== undefined) payload.tags = [...dto.tags];

    const { data, error } = await this.supabase.client
      .from('tickets')
      .update(payload)
      .eq('id', ticketId)
      .eq('version', dto.version)
      .select('*, requester:profiles!requester_id(*), assignee:profiles!assignee_id(*)')
      .maybeSingle();

    if (error) {
      if (error.code === 'HD001') throw new TicketClosedError();
      if (error.code === 'HD002') throw new InvalidAssigneeError();
      if (error.code === 'HD003') throw new InvalidAttachmentPathError();
      throw new Error(`Database error updating ticket: ${error.message}`);
    }

    if (!data) throw new TicketConcurrencyError();
    return HelpdeskMapper.toTicket(data as TicketRow, data.requester, data.assignee);
  }

  async claimTicket(ticketId: string, agentId: string, version: number): Promise<Ticket> {
    const { data, error } = await this.supabase.client
      .from('tickets')
      .update({ assignee_id: agentId })
      .eq('id', ticketId)
      .eq('version', version)
      .is('assignee_id', null)
      .select('*, requester:profiles!requester_id(*), assignee:profiles!assignee_id(*)')
      .maybeSingle();

    if (error) {
      if (error.code === 'HD001') throw new TicketClosedError();
      if (error.code === 'HD002') throw new InvalidAssigneeError();
      throw new Error(`Failed to claim ticket: ${error.message}`);
    }

    if (!data) throw new TicketConcurrencyError('Conflict or permission denied: Ticket could not be claimed. Refresh and try again.');
    return HelpdeskMapper.toTicket(data as TicketRow, data.requester, data.assignee);
  }

  async addComment(dto: CreateCommentDTO): Promise<TicketComment> {
    const currentUser = this.authState.currentUser();
    if (!currentUser) {
      throw new CommentForbiddenError('Authentication required to submit comment.');
    }

    const { data, error } = await this.supabase.client
      .from('ticket_comments')
      .insert({
        ticket_id: dto.ticketId,
        author_id: currentUser.id,
        body: dto.body,
        is_internal: dto.isInternal,
        attachments: HelpdeskMapper.toAttachmentRowList(dto.attachments)
      })
      .select('*, author:profiles!author_id(*)')
      .single();

    if (error) {
      if (error.code === 'HD005') throw new TicketClosedError();
      if (error.code === 'HD003') throw new InvalidAttachmentPathError();
      if (error.code === '42501') throw new CommentForbiddenError();
      throw new Error(`Failed to add comment: ${error.message}`);
    }

    return HelpdeskMapper.toTicketComment(data as TicketCommentRow, data.author);
  }
}
```

#### 3. `MockDataRepository` Rules & Fixtures

`MockDataRepository` enforces all PostgreSQL domain invariants in client memory:
1. **Closed ticket immutability:** Rejects mutations or comment additions when `status === 'closed'` with `TicketClosedError`.
2. **Role constraints:** Customers cannot assign tickets or apply tags on creation (`CustomerAssignmentForbiddenError`). Assigned agents must possess role `agent` or `admin` (`InvalidAssigneeError`).
3. **Automated ticket lifecycle:** Inserting a customer comment on a `solved` ticket transitions ticket status to `open`.
4. **Comment side-effects:** Adding a comment updates ticket `updatedAt` without incrementing `version`.
5. **Concurrency checks:** Updates compare `dto.version === ticket.version`, increment `version = version + 1`, and throw `TicketConcurrencyError` on mismatch.
6. **Fixture Sanitization:** Pre-seeded static data strictly uses synthetic identities matching demo accounts (`agent@example.com`, `customer@example.com`) and RFC 2606 reserved domains (`@example.org`). State persists deltas to `localStorage` under `HELPDESK_MOCK_DATA_V1`.

#### 4. Realtime Channel Subscription Lifecycle

1. **Global Views Channel (`tickets-global-feed`):** A single channel listening to `postgres_changes` on table `tickets` without row filters to update badge counts and active view tables.
2. **Isolated Ticket Channels (`ticket-comments-${ticketId}`):** When a ticket tab is opened in `WorkspaceTabService`, a dedicated channel is spawned with filter `ticket_id=eq.${ticketId}`.
3. **Channel Cleanup:** When `WorkspaceTabService.closeTab(tabId)` is triggered, the associated channel is explicitly unsubscribed and garbage collected.
4. **Universal Attachment Ownership:** All authors attach only files stored in their own user folder (`auth.uid()`). The UI does not expose a "re-attach from customer upload" feature. Storage orphan cleanup is out of scope for the MVP.

---

## 5. Five-Phase Sequential Implementation Plan

### Phase 1: Types, Storage/API Client Config, and Base Utilities

- [ ] **Step 1.1: Core Database Types & Domain Interfaces**
  - Path: `src/app/core/models/database.types.ts`
  - Path: `src/app/core/models/helpdesk.models.ts`
  - Define `ProfileRow`, `TicketRow`, `TicketCommentRow`, `TicketAuditLogRow`, `AttachmentRow`, strict `IconName` union, domain models, and domain error classes (`TicketClosedError`, `TicketConcurrencyError`, `InvalidAssigneeError`, `InvalidAttachmentPathError`, `CustomerAssignmentForbiddenError`, `CommentForbiddenError`).
- [ ] **Step 1.2: Pure Entity Mappers**
  - Path: `src/app/core/mappers/helpdesk.mapper.ts`
  - Implement bidirectional transformation mapping snake_case PostgreSQL records to camelCase TypeScript domain interfaces and DTOs.
- [ ] **Step 1.3: Environment Configuration Contracts & Supabase Client**
  - Path: `src/environments/environment.interface.ts`
  - Path: `src/environments/environment.ts`
  - Path: `src/environments/environment.development.ts`
  - Path: `src/environments/environment.demo.ts`
  - Path: `src/app/core/services/supabase.service.ts`
  - Strictly type all environment targets against `EnvironmentConfig`.
  - Lazy instantiation of Supabase client: only initialized when `!environment.useMockData`.
- [ ] **Step 1.4: Authentication State Service**
  - Path: `src/app/core/services/auth-state.service.ts`
  - Signal-driven user authentication state (`currentUser`, `userProfile`, `userRole`, `isAuthenticated`).
  - Supports Supabase auth listener and mock auth switching.
- [ ] **Step 1.5: Functional Route Guards**
  - Path: `src/app/core/guards/auth.guard.ts`
  - Path: `src/app/core/guards/role.guard.ts`
  - Functional guards restricting `/workspace` routes to authenticated sessions and enforcing role-level authorization.
- [ ] **Step 1.6: Base Date/Time Utility Pipe**
  - Path: `src/app/shared/pipes/time-ago.pipe.ts`
  - High-performance timestamp formatter calculating relative time ("5m ago", "2h ago", "3d ago") without external libraries.

---

### Phase 2: Design Foundation & Atomic UI Primitives

- [ ] **Step 2.1: Zendesk Design System & Design Tokens**
  - Path: `src/styles.css`
  - Pure CSS custom variables:
    - Primary Emerald: `--zd-green-primary: #03363D`, `--zd-green-action: #138A04`
    - Internal Note Yellow: `--zd-yellow-bg: #FFF8E7`, `--zd-yellow-border: #FAD160`, `--zd-yellow-text: #704A00`
    - Neutrals: `--zd-canvas: #F8F9F9`, `--zd-border: #D8DCDE`, `--zd-text-main: #2F3941`, `--zd-text-secondary: #68737D`
    - Dynamic sizing: `min-height: 100dvh` shell, iOS 16px input safeguard.
  - Breakpoints hardcoded directly in CSS rules:
    - `@media (max-width: 767px)`
    - `@media (min-width: 768px) and (max-width: 1023px)`
    - `@media (min-width: 1024px) and (max-width: 1279px)`
    - `@media (min-width: 1280px)`
  - Layout component swapping driven by Angular CDK `BreakpointObserver`.
- [ ] **Step 2.2: Pure SVG Icon Component**
  - Path: `src/app/shared/ui/icon/icon.component.ts`
  - Standalone SVG renderer strictly typed against `IconName` union: `ticket`, `user`, `search`, `table`, `lock`, `unlock`, `close`, `send`, `attachment`, `plus`, `chevron-down`, `check`, `settings`, `customers`.
- [ ] **Step 2.3: Status & Priority Badges**
  - Path: `src/app/shared/ui/badge/badge.component.ts`
  - Compact Zendesk status pills (`new` [yellow border], `open` [red], `pending` [blue], `solved` [emerald], `closed` [slate]).
- [ ] **Step 2.4: Atomic Buttons & Loading Micro-Spinner**
  - Path: `src/app/shared/ui/button/button.component.ts`
  - Variants: `primary`, `secondary`, `internal`, `danger`, `ghost`.
  - Accessible focus rings, loading spinner, and minimum 44x44px touch targets.
- [ ] **Step 2.5: Accessible Dropdown / Property Select**
  - Path: `src/app/shared/ui/dropdown/dropdown.component.ts`
  - Keyboard-navigable (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`) selection component with minimum 44px option rows for touch devices.
- [ ] **Step 2.6: Toast Notification Queue**
  - Path: `src/app/shared/ui/toast/toast-container.component.ts`
  - Path: `src/app/core/services/notification.service.ts`
  - Signal-backed toast dispatch queue with automated auto-dismiss and stack management.

---

### Phase 3: Compound Molecules & Feature Components

- [ ] **Step 3.1: Workspace Tab Bar Component**
  - Path: `src/app/features/workspace/top-nav/tab-bar.component.ts`
  - Horizontal tab switcher displaying active status, unsaved dot indicator (`isDirty`), hit-padded 44x44px tab closure button, and "New Ticket" trigger.
  - Mandatory `@for (tab of tabs(); track tab.id)` syntax.
- [ ] **Step 3.2: Workspace Header & Global Search Bar**
  - Path: `src/app/features/workspace/top-nav/workspace-header.component.ts`
  - Search input box with debounced ticket query dispatcher and mobile drawer toggle button.
- [ ] **Step 3.3: Global Navigation Rail**
  - Path: `src/app/features/workspace/left-rail/global-nav-rail.component.ts`
  - Zendesk 52px vertical dark emerald sidebar. Displays navigation icons, user profile badge, and settings link.
- [ ] **Step 3.4: Mobile Responsive Navigation Bar & Drawer**
  - Path: `src/app/features/workspace/mobile-nav/mobile-bottom-nav.component.ts`
  - Path: `src/app/features/workspace/mobile-nav/mobile-drawer.component.ts`
  - 4-item bottom dock adhering to `env(safe-area-inset-bottom)`.
  - Slide-in modal drawer exposing user information and logout trigger. Role-switching control inside the drawer is conditionally rendered strictly when `!environment.production`.
- [ ] **Step 3.5: Ticket Conversation Timeline Item**
  - Path: `src/app/features/ticket-workspace/comment-item.component.ts`
  - Card rendering Public Replies (white background) vs Internal Notes (distinct yellow background `#FFF8E7`, agent lock badge). Attachment link list.
- [ ] **Step 3.6: Zendesk Dual-Mode Reply Box**
  - Path: `src/app/features/ticket-workspace/ticket-comment-box.component.ts`
  - Tab switcher for "Public Reply" vs "Internal Note". Dynamically modifies input background, status picker, and submission target.
- [ ] **Step 3.7: Ticket Properties Left Sidebar**
  - Path: `src/app/features/ticket-workspace/ticket-left-sidebar.component.ts`
  - Inputs for Assignee, Requester, Status, Priority, Type, and Tag chips (with 44px tap target chip deletion buttons).
- [ ] **Step 3.8: Ticket Requester Context Panel**
  - Path: `src/app/features/ticket-workspace/ticket-customer-pane.component.ts`
  - Sidebar showing customer profile, contact details, and prior ticket history. Collapsible below 1280px.
- [ ] **Step 3.9: New Ticket Creation Modal**
  - Path: `src/app/features/ticket-workspace/ticket-create-modal.component.ts`
  - Modal form for submitting a new ticket. Triggers atomic ticket creation via `DataRepository.createTicket`.

---

### Phase 4: Domain Logic, Reactive State, and Realtime Engine

- [ ] **Step 4.1: Data Repositories Implementation**
  - Path: `src/app/core/services/data-repository.interface.ts`
  - Path: `src/app/core/services/supabase-data.repository.ts`
  - Path: `src/app/core/services/mock-data.repository.ts`
  - Path: `src/app/core/services/ticket.service.ts`
  - Implement full database queries, optimistic concurrency via `version`, and fallback in-memory state engine.
- [ ] **Step 4.2: Realtime Synchronization Service**
  - Path: `src/app/core/services/ticket-realtime.service.ts`
  - Dual-channel subscription lifecycle: global feed channel (`tickets-global-feed`) and per-ticket channels (`ticket-comments-${ticketId}`) cleaned up on tab close.
- [ ] **Step 4.3: Views Query Service & Navigation Sidebar**
  - Path: `src/app/features/views/view-sidebar.component.ts`
  - Predefined views:
    - "Your unsolved tickets" (`assignee_id = current_user AND status IN ('new', 'open', 'pending')`)
    - "Unassigned tickets" (`assignee_id IS NULL AND status IN ('new', 'open')`)
    - "All unsolved tickets" (`status IN ('new', 'open', 'pending')`)
    - "Recently solved tickets" (`status = 'solved' ORDER BY solved_at DESC LIMIT 25`)
  - Badge counters calculated reactively.
- [ ] **Step 4.4: Workspace Multi-Tab Orchestration Service**
  - Path: `src/app/core/services/workspace-tab.service.ts`
  - Handles tab addition, tab destruction with confirmation if dirty, draft memory persistence, and active tab routing.

---

### Phase 5: Complete Page Assembly & Responsive Hardening

- [ ] **Step 5.1: Authentication Screens & Build Configuration Architecture**
  - Path: `src/app/features/auth/login.component.ts`
  - Path: `src/app/features/auth/register.component.ts`
  - Configure `angular.json` build targets for `production`, `development`, and `demo`.
  - In production, `demoAccounts: []` produces zero demo credential strings in final bundles.
- [ ] **Step 5.2: Views Screen Assembly & Responsive Ticket Table**
  - Path: `src/app/features/views/views-container.component.ts`
  - Path: `src/app/features/views/ticket-table.component.ts`
  - Desktop: Sortable tabular ticket view with status badges and timestamps.
  - Mobile (<768px): Card-based list with zero horizontal table overflow.
- [ ] **Step 5.3: Ticket Detail Workspace Assembly**
  - Path: `src/app/features/ticket-workspace/ticket-detail.component.ts`
  - Assembles `TicketLeftSidebar`, `TicketConversation`, `TicketCommentBox`, and `TicketCustomerPane`.
  - Responsive adjustments:
    - `>= 1280px`: Full 3-pane layout.
    - `1024px - 1279px`: Right context pane collapses into an overlay.
    - `< 768px`: Left property pane renders as a single-column bottom sheet.
- [ ] **Step 5.4: Master Workspace Shell & Routing Setup**
  - Path: `src/app/features/workspace/workspace-shell.component.ts`
  - Path: `src/app/app.routes.ts`
  - Integrates `GlobalNavRail`, `TabBar`, `WorkspaceHeader`, `MobileBottomNav`, and active tab outlet.
- [ ] **Step 5.5: Multi-Viewport Validation & Layout Hardening**
  - Strict validation across targets:
    - `360px` (Galaxy S8 / Small Android): Single-column stacked cards, bottom navigation, 44px tap targets.
    - `390px` (iPhone Standard): Safe area spacing, zero input zoom on focus (`font-size: 16px`).
    - `430px` (iPhone Pro Max): Fluid comment composer, single-column properties bottom sheet.
    - `768px - 1023px` (iPad Portrait): 48px collapsed left rail, full-width conversation view.
    - `1024px - 1279px` (Compact Desktop): Fluid conversation center (min 440px), property left pane (240px), customer overlay.
    - `>= 1280px` (Standard Desktop): Full 3-pane Zendesk workspace (52px rail + 260px left sidebar + fluid center + 280px customer pane).
- [ ] **Step 5.6: Security, Concurrency & Edge Case Verification**
  - Dual-layer test execution:
    - Backend Integration Suite (Requires Docker Supabase):
      - Direct client `UPDATE profiles SET role = 'admin'` rejected by PostgreSQL column privileges.
      - Inserting comment on closed ticket raises `HD005` (`TicketClosedError`).
      - Foreign attachment path upload raises `HD003` (`InvalidAttachmentPathError`).
      - Customer role isolated from internal notes via PostgreSQL RLS queries.
    - Frontend Unit/Domain Suite (Runs in both Docker and Mock modes):
      - Concurrency conflict handling when ticket `version` mismatches (`TicketConcurrencyError`).
      - Customer reply on a `solved` ticket transitions status to `open`.
      - Closed tickets remain immutable and reject updates.