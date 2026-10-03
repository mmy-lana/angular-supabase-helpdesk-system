-- Help desk schema: enums, tables, triggers, the atomic create RPC and row level security.
-- Applied by `supabase db reset` (local Docker) or `supabase db push` (hosted).
-- Client type contract lives in src/app/core/models/database.types.ts.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom enums ---------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('customer', 'agent', 'admin');
CREATE TYPE ticket_status AS ENUM ('new', 'open', 'pending', 'solved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE ticket_type AS ENUM ('question', 'incident', 'problem', 'task');

-- Tables ---------------------------------------------------------------------

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'customer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

-- Only the two fields a user is allowed to edit on their own profile are granted;
-- `role` and `email` stay under database control.
REVOKE ALL ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.profiles TO authenticated;

-- `version` carries optimistic concurrency: clients update with `.eq('version', n)`
-- and the trigger increments it whenever a mutable property changes.
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

CREATE TABLE public.ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    body TEXT NOT NULL CHECK (char_length(trim(body)) > 0),
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

-- Append only: the log is written by trigger, never by the client.
CREATE TABLE public.ticket_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

-- Indexes --------------------------------------------------------------------

CREATE INDEX idx_tickets_keyset ON public.tickets(created_at DESC, id DESC);
CREATE INDEX idx_tickets_requester ON public.tickets(requester_id);
CREATE INDEX idx_tickets_assignee ON public.tickets(assignee_id);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_ticket_comments_ticket_created ON public.ticket_comments(ticket_id, created_at ASC);
CREATE INDEX idx_ticket_audit_logs_ticket ON public.ticket_audit_logs(ticket_id);

-- Grants: the anon role never reaches application tables.
REVOKE ALL ON public.tickets FROM anon;
REVOKE ALL ON public.ticket_comments FROM anon;
REVOKE ALL ON public.ticket_audit_logs FROM anon;
REVOKE ALL ON public.profiles FROM anon;

REVOKE ALL ON public.tickets FROM authenticated;
GRANT SELECT, UPDATE ON public.tickets TO authenticated;

REVOKE ALL ON public.ticket_comments FROM authenticated;
GRANT SELECT, INSERT ON public.ticket_comments TO authenticated;

REVOKE ALL ON public.ticket_audit_logs FROM authenticated;
GRANT SELECT ON public.ticket_audit_logs TO authenticated;

-- Realtime -------------------------------------------------------------------
-- REPLICA IDENTITY FULL makes UPDATE payloads carry every column, which is what
-- the client needs to rebuild a ticket after someone else edits it.

ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets, public.ticket_comments;
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.ticket_comments REPLICA IDENTITY FULL;

-- Functions ------------------------------------------------------------------
-- Every function pins `search_path = ''` and qualifies names, so a caller cannot
-- shadow `auth.uid()` or the table references through a temporary object. That
-- empty path is also in force while PostgreSQL validates a function body, so
-- custom enum types have to be written as `public.ticket_status` rather than
-- `ticket_status` even though both name the same type.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_avatar_url TEXT;
BEGIN
    IF NEW.email IS NULL THEN
        RAISE EXCEPTION 'Help desk accounts require an email address.' USING ERRCODE = 'HD004';
    END IF;

    v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
    IF v_avatar_url IS NOT NULL AND NOT (v_avatar_url ~* '^https://') THEN
        v_avatar_url := NULL;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)),
        v_avatar_url,
        'customer'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_ticket_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- A closed ticket is terminal: no edits, no reopening.
    IF OLD.status = 'closed' THEN
        RAISE EXCEPTION 'Closed tickets cannot be modified or reopened.' USING ERRCODE = 'HD001';
    END IF;

    NEW.updated_at = TIMEZONE('utc', NOW());

    -- Only property changes bump the version, so adding a comment does not
    -- invalidate a client's optimistic concurrency token.
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

    IF NEW.status = 'solved' AND OLD.status <> 'solved' THEN
        NEW.solved_at = TIMEZONE('utc', NOW());
    ELSIF NEW.status <> 'solved' AND OLD.status = 'solved' THEN
        NEW.solved_at = NULL;
    END IF;

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

CREATE OR REPLACE FUNCTION public.handle_comment_before_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket_status public.ticket_status;
    v_att JSONB;
BEGIN
    SELECT status INTO v_ticket_status FROM public.tickets WHERE id = NEW.ticket_id;
    IF v_ticket_status = 'closed' THEN
        RAISE EXCEPTION 'Cannot comment on a closed ticket.' USING ERRCODE = 'HD005';
    END IF;

    -- Attachments may only reference objects inside the author's own folder.
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

CREATE OR REPLACE FUNCTION public.handle_customer_reply_reopen()
RETURNS TRIGGER AS $$
DECLARE
    v_author_role public.user_role;
    v_ticket_status public.ticket_status;
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

-- Atomic creation: ticket, opening comment and audit entry commit together, so a
-- ticket can never exist without its first message.
CREATE OR REPLACE FUNCTION public.create_ticket_atomic(
    p_subject TEXT,
    p_body TEXT,
    p_priority public.ticket_priority DEFAULT 'normal',
    p_type public.ticket_type DEFAULT 'question',
    p_tags TEXT[] DEFAULT '{}'::TEXT[],
    p_assignee_id UUID DEFAULT NULL,
    p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS public.tickets AS $$
DECLARE
    v_user_id UUID;
    v_user_role public.user_role;
    v_ticket public.tickets;
    v_att JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;

    IF p_assignee_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_assignee_id AND role IN ('agent', 'admin')
    ) THEN
        RAISE EXCEPTION 'Assignee must be an agent or admin.' USING ERRCODE = 'HD002';
    END IF;

    IF v_user_role = 'customer' THEN
        IF p_assignee_id IS NOT NULL THEN
            RAISE EXCEPTION 'Customers cannot assign tickets.' USING ERRCODE = 'HD004';
        END IF;
        -- Priority and type drive the queue an agent works through. Letting a
        -- customer pick them at creation time is an escalation path, so both are
        -- pinned to the least urgent reading and left to the agents to raise.
        p_tags := '{}'::TEXT[];
        p_priority := 'normal';
        p_type := 'question';
    END IF;

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

REVOKE EXECUTE ON FUNCTION public.create_ticket_atomic(TEXT, TEXT, public.ticket_priority, public.ticket_type, TEXT[], UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ticket_atomic(TEXT, TEXT, public.ticket_priority, public.ticket_type, TEXT[], UUID, JSONB) TO authenticated;

-- Row level security ---------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_audit_logs ENABLE ROW LEVEL SECURITY;

-- Agents and admins need the directory to render requester and assignee names.
CREATE POLICY "Profiles access policy"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() OR
        role IN ('agent', 'admin') OR
        public.current_user_role() IN ('agent', 'admin')
    );

-- The column grant is the real boundary here: `role` and `email` are not updatable.
CREATE POLICY "Profile self-update"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

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

CREATE POLICY "Audit logs SELECT policy"
    ON public.ticket_audit_logs FOR SELECT
    TO authenticated
    USING (public.current_user_role() IN ('agent', 'admin'));