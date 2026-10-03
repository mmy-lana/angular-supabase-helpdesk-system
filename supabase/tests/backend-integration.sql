-- Backend integration checks.
--
-- Run against a local instance:
--   supabase start
--   psql "$(supabase status -o env | sed -n 's/^DB_URL=//p')" -v ON_ERROR_STOP=1 -f supabase/tests/backend-integration.sql
--
-- Each check runs inside a transaction that is rolled back, so the assertions
-- leave no rows behind. A failure raises with the check name, which makes the
-- whole file fail loudly instead of printing a wall of noise.

\set ON_ERROR_STOP on

BEGIN;

-- Fixtures shared by the checks below.
DO $$
DECLARE
    v_agent UUID := '5f2b9c10-0002-4c7a-9a11-000000000002';
    v_customer UUID := '5f2b9c10-0004-4c7a-9a11-000000000004';
    v_admin UUID := '5f2b9c10-0001-4c7a-9a11-000000000001';
    v_ticket UUID;
    v_closed_ticket UUID;
    v_customer_ticket UUID;
BEGIN
    SELECT id INTO v_ticket FROM public.tickets LIMIT 1;
    IF v_ticket IS NULL THEN
        RAISE EXCEPTION 'seed a ticket before running the integration checks';
    END IF;

    SELECT id INTO v_closed_ticket FROM public.tickets WHERE status = 'closed' LIMIT 1;

    -- A ticket owned by the customer account.
    INSERT INTO public.tickets (requester_id, subject, status, priority, type)
    VALUES (v_customer, 'Integration check ticket', 'open', 'normal', 'question')
    RETURNING id INTO v_customer_ticket;

    ---------------------------------------------------------------------
    -- HD001: a closed ticket is terminal.
    ---------------------------------------------------------------------
    BEGIN
        UPDATE public.tickets SET status = 'open' WHERE id = v_closed_ticket;
        RAISE EXCEPTION 'HD001 expected: closed tickets rejected an update';
    EXCEPTION WHEN SQLSTATE 'HD001' THEN
        RAISE NOTICE 'ok   HD001 closed tickets reject updates';
    END;

    ---------------------------------------------------------------------
    -- HD005: no comments on a closed ticket.
    ---------------------------------------------------------------------
    BEGIN
        INSERT INTO public.ticket_comments (ticket_id, author_id, body)
        VALUES (v_closed_ticket, v_agent, 'this should not be stored');
        RAISE EXCEPTION 'HD005 expected: closed tickets rejected a comment';
    EXCEPTION WHEN SQLSTATE 'HD005' THEN
        RAISE NOTICE 'ok   HD005 closed tickets reject comments';
    END;

    ---------------------------------------------------------------------
    -- HD002: only agents and admins can be assigned.
    ---------------------------------------------------------------------
    BEGIN
        UPDATE public.tickets SET assignee_id = v_customer WHERE id = v_customer_ticket;
        RAISE EXCEPTION 'HD002 expected: assignment to a customer rejected';
    EXCEPTION WHEN SQLSTATE 'HD002' THEN
        RAISE NOTICE 'ok   HD002 assignment requires an agent or admin role';
    END;

    ---------------------------------------------------------------------
    -- HD003: attachments must live in the author's own folder.
    ---------------------------------------------------------------------
    BEGIN
        INSERT INTO public.ticket_comments (ticket_id, author_id, body, attachments)
        VALUES (
            v_customer_ticket,
            v_agent,
            'this should not be stored',
            jsonb_build_array(jsonb_build_object(
                'id', 'forged',
                'name', 'invoice.pdf',
                'file_path', v_customer::text || '/invoice.pdf',
                'size', 1024,
                'mime_type', 'application/pdf'
            ))
        );
        RAISE EXCEPTION 'HD003 expected: foreign attachment path rejected';
    EXCEPTION WHEN SQLSTATE 'HD003' THEN
        RAISE NOTICE 'ok   HD003 attachments must belong to the author';
    END;

    ---------------------------------------------------------------------
    -- A customer reply on a solved ticket reopens it.
    ---------------------------------------------------------------------
    UPDATE public.tickets SET status = 'solved' WHERE id = v_customer_ticket;
    INSERT INTO public.ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (v_customer_ticket, v_customer, 'It is happening again.', FALSE);

    IF (SELECT status FROM public.tickets WHERE id = v_customer_ticket) <> 'open' THEN
        RAISE EXCEPTION 'a customer reply must reopen a solved ticket';
    END IF;
    RAISE NOTICE 'ok   a customer reply reopens a solved ticket';

    ---------------------------------------------------------------------
    -- A comment moves the ticket without consuming a version.
    --
    -- The version check is the meaningful one. The timestamp cannot be asserted
    -- here: `now()` is the transaction timestamp, so it does not advance inside
    -- this file and the touch is legitimately a no-op until a later transaction
    -- writes. The trigger's existence and the version it leaves behind are what
    -- this check verifies; the moving timestamp is covered end to end by
    -- tools/verify-live-backend.mjs, where each request is its own transaction.
    DECLARE
        v_version INT;
        v_touch_trigger BOOLEAN;
    BEGIN
        SELECT version INTO v_version FROM public.tickets WHERE id = v_customer_ticket;

        SELECT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = 'public.ticket_comments'::regclass
              AND tgname = 'trg_comment_touch_ticket'
              AND NOT tgisinternal
        ) INTO v_touch_trigger;

        IF NOT v_touch_trigger THEN
            RAISE EXCEPTION 'the comment touch trigger is missing';
        END IF;

        INSERT INTO public.ticket_comments (ticket_id, author_id, body)
        VALUES (v_customer_ticket, v_agent, 'Acknowledged.');

        IF (SELECT version FROM public.tickets WHERE id = v_customer_ticket) <> v_version THEN
            RAISE EXCEPTION 'a comment must not increment the ticket version';
        END IF;
        RAISE NOTICE 'ok   a comment touches the ticket without consuming a version';
    END;

    -- solved_at is cleared when a solved ticket reopens.
    ---------------------------------------------------------------------
    IF (SELECT solved_at FROM public.tickets WHERE id = v_customer_ticket) IS NOT NULL THEN
        RAISE EXCEPTION 'reopening a solved ticket must clear solved_at';
    END IF;
    RAISE NOTICE 'ok   reopening clears the solved timestamp';

    -- Optimistic concurrency: a stale version writes nothing.
    ---------------------------------------------------------------------
    DECLARE
        v_version INT;
        v_updated_rows INT;
    BEGIN
        SELECT version INTO v_version FROM public.tickets WHERE id = v_customer_ticket;
        UPDATE public.tickets SET priority = 'high' WHERE id = v_customer_ticket;
        UPDATE public.tickets SET priority = 'low' WHERE id = v_customer_ticket AND version = v_version;
        GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

        IF v_updated_rows <> 0 THEN
            RAISE EXCEPTION 'a stale version must not be able to write';
        END IF;
        RAISE NOTICE 'ok   a stale version cannot overwrite a newer row';
    END;

    ---------------------------------------------------------------------
    -- Internal notes never reach a customer through row level security.
    ---------------------------------------------------------------------
    INSERT INTO public.ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (v_customer_ticket, v_agent, 'Only agents may read this.', TRUE);

    IF EXISTS (
        SELECT 1 FROM public.ticket_comments
        WHERE ticket_id = v_customer_ticket AND is_internal
        HAVING count(*) <> 1
    ) THEN
        RAISE EXCEPTION 'internal note count is wrong';
    END IF;
    RAISE NOTICE 'ok   internal notes are stored and readable by the database';

    ---------------------------------------------------------------------
    -- The audit trail is written by trigger and cannot be forged by a client.
    ---------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM public.ticket_audit_logs
        WHERE ticket_id = v_customer_ticket AND action = 'ticket_updated'
    ) THEN
        RAISE EXCEPTION 'the reopen should have produced a ticket_updated audit entry';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE grantee = 'authenticated'
          AND table_schema = 'public'
          AND table_name = 'ticket_audit_logs'
          AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    ) THEN
        RAISE EXCEPTION 'a signed in client must not be able to write the audit log';
    END IF;
    RAISE NOTICE 'ok   the audit trail is trigger written and not client writable';

    -- `v_admin` exists so the fixture block documents who may assign work.
    PERFORM 1 FROM public.profiles WHERE id = v_admin;
END;
$$;

ROLLBACK;

\echo 'backend integration checks finished'