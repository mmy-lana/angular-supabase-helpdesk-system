-- Private attachment bucket.
--
-- Objects live at `<auth.uid()>/<file name>`: every author owns exactly one folder,
-- which is the invariant the `handle_comment_before_insert` trigger checks (HD003)
-- and the shape `SupabaseService.createSignedAttachmentUrl` reads back.

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

-- Customers only see attachments attached to public comments on their own tickets.
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