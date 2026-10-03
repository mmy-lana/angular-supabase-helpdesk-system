-- Local Docker fixtures for the `development` configuration.
-- Creates the two accounts listed in src/environments/environment.development.ts,
-- plus a handful of colleagues and tickets so every view has something to show.

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
                        recovery_token, email_change_token_new, email_change)
VALUES
    ('00000000-0000-0000-0000-000000000000', '5f2b9c10-0002-4c7a-9a11-000000000002', 'authenticated', 'authenticated',
     'agent@example.com', crypt('DevPassword123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Nina Okafor"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', '5f2b9c10-0004-4c7a-9a11-000000000004', 'authenticated', 'authenticated',
     'customer@example.com', crypt('DevPassword123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Tomas Eriksen"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', '5f2b9c10-0001-4c7a-9a11-000000000001', 'authenticated', 'authenticated',
     'admin@example.org', crypt('DevPassword123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Priya Raman"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', '5f2b9c10-0003-4c7a-9a11-000000000003', 'authenticated', 'authenticated',
     'marcus.feld@example.org', crypt('DevPassword123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Marcus Feld"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', '5f2b9c10-0005-4c7a-9a11-000000000005', 'authenticated', 'authenticated',
     'aiko.tanaka@example.org', crypt('DevPassword123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Aiko Tanaka"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', '5f2b9c10-0006-4c7a-9a11-000000000006', 'authenticated', 'authenticated',
     'samuel.ortiz@example.org', crypt('DevPassword123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Samuel Ortiz"}', now(), now(), '', '', '', '');

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.email IN ('agent@example.com', 'customer@example.com', 'admin@example.org',
                  'marcus.feld@example.org', 'aiko.tanaka@example.org', 'samuel.ortiz@example.org');

-- Profiles are created by the on_auth_user_created trigger; promote the two
-- service accounts the seed declares. Direct role updates by end users are
-- rejected by the column grant on public.profiles.
UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@example.org';
UPDATE public.profiles SET role = 'agent' WHERE email IN ('agent@example.com', 'marcus.feld@example.org');
-- Ticket history ------------------------------------------------------------
-- The same conversation the offline showcase carries, so a developer comparing
-- the two targets sees the same workspace rather than an empty queue.

INSERT INTO public.tickets (id, requester_id, assignee_id, subject, status, priority, type, tags, version, created_at, updated_at, solved_at)
VALUES
  ('a1000000-0000-4000-8000-000000000001', '5f2b9c10-0004-4c7a-9a11-000000000004', NULL,
   'March invoice export downloads an empty file', 'new', 'high', 'incident', ARRAY['billing','export'], 1,
   now() - interval '2 hours', now() - interval '2 hours', NULL),
  ('a1000000-0000-4000-8000-000000000002', '5f2b9c10-0005-4c7a-9a11-000000000005', '5f2b9c10-0002-4c7a-9a11-000000000002',
   'Cannot add a second billing contact to our workspace', 'open', 'normal', 'problem', ARRAY['accounts','contacts'], 3,
   now() - interval '7 hours', now() - interval '6 hours', NULL),
  ('a1000000-0000-4000-8000-000000000003', '5f2b9c10-0006-4c7a-9a11-000000000006', NULL,
   'SSO login loop for users with two email addresses', 'new', 'urgent', 'incident', ARRAY['sso','login'], 1,
   now() - interval '11 hours', now() - interval '11 hours', NULL),
  ('a1000000-0000-4000-8000-000000000004', '5f2b9c10-0004-4c7a-9a11-000000000004', '5f2b9c10-0003-4c7a-9a11-000000000003',
   'Webhook retries are duplicating order updates', 'pending', 'normal', 'problem', ARRAY['api','webhooks'], 3,
   now() - interval '26 hours', now() - interval '25 hours', NULL),
  ('a1000000-0000-4000-8000-000000000005', '5f2b9c10-0005-4c7a-9a11-000000000005', '5f2b9c10-0002-4c7a-9a11-000000000002',
   'How do I move a ticket to a different team?', 'solved', 'low', 'question', '{}', 3,
   now() - interval '50 hours', now() - interval '44 hours', now() - interval '44 hours'),
  ('a1000000-0000-4000-8000-000000000006', '5f2b9c10-0006-4c7a-9a11-000000000006', '5f2b9c10-0002-4c7a-9a11-000000000002',
   'Attachment upload fails for files larger than 4 MB', 'open', 'normal', 'incident', ARRAY['attachments','upload'], 3,
   now() - interval '73 hours', now() - interval '58 hours', NULL),
  ('a1000000-0000-4000-8000-000000000007', '5f2b9c10-0004-4c7a-9a11-000000000004', '5f2b9c10-0002-4c7a-9a11-000000000002',
   'Password reset emails never arrive', 'solved', 'urgent', 'incident', ARRAY['login','email'], 3,
   now() - interval '96 hours', now() - interval '90 hours', now() - interval '90 hours'),
  ('a1000000-0000-4000-8000-000000000008', '5f2b9c10-0005-4c7a-9a11-000000000005', NULL,
   'Custom fields are missing from the ticket export', 'new', 'low', 'task', ARRAY['export'], 1,
   now() - interval '120 hours', now() - interval '120 hours', NULL),
  ('a1000000-0000-4000-8000-000000000009', '5f2b9c10-0006-4c7a-9a11-000000000006', '5f2b9c10-0003-4c7a-9a11-000000000003',
   'Audit log retention: can we extend beyond 90 days?', 'open', 'normal', 'question', ARRAY['compliance','audit'], 3,
   now() - interval '240 hours', now() - interval '200 hours', NULL),
  ('a1000000-0000-4000-8000-000000000010', '5f2b9c10-0004-4c7a-9a11-000000000004', '5f2b9c10-0002-4c7a-9a11-000000000002',
   'Ticket numbers restarted after the workspace merge', 'pending', 'normal', 'question', ARRAY['accounts'], 3,
   now() - interval '300 hours', now() - interval '280 hours', NULL);

INSERT INTO public.ticket_comments (ticket_id, author_id, body, is_internal, created_at)
VALUES
  ('a1000000-0000-4000-8000-000000000001', '5f2b9c10-0004-4c7a-9a11-000000000004',
   'Our finance team runs the invoice export every last working day of the month. Since the February release the download is a 0 byte file, both from the UI and from the scheduled job.', FALSE, now() - interval '2 hours'),
  ('a1000000-0000-4000-8000-000000000002', '5f2b9c10-0005-4c7a-9a11-000000000005',
   'The "Add contact" button is greyed out for our second billing contact. We have owner, admin and billing roles assigned already.', FALSE, now() - interval '7 hours'),
  ('a1000000-0000-4000-8000-000000000002', '5f2b9c10-0002-4c7a-9a11-000000000002',
   'Thanks for the screenshots. The workspace is on the legacy contact model, which only allows one billing contact. I am checking with the account team.', FALSE, now() - interval '6 hours'),
  ('a1000000-0000-4000-8000-000000000003', '5f2b9c10-0006-4c7a-9a11-000000000006',
   'Around forty users are bounced back to the sign in page after the identity provider. They all have a personal address as a secondary alias.', FALSE, now() - interval '11 hours'),
  ('a1000000-0000-4000-8000-000000000004', '5f2b9c10-0004-4c7a-9a11-000000000004',
   'We receive the same order.updated event two or three times when our endpoint takes longer than two seconds to answer.', FALSE, now() - interval '26 hours'),
  ('a1000000-0000-4000-8000-000000000004', '5f2b9c10-0003-4c7a-9a11-000000000003',
   'That matches the retry window we changed last quarter. Could you send a request id from one duplicated delivery?', FALSE, now() - interval '25 hours'),
  ('a1000000-0000-4000-8000-000000000005', '5f2b9c10-0005-4c7a-9a11-000000000005',
   'We want to route billing questions to a different group of agents without reassigning every ticket by hand.', FALSE, now() - interval '50 hours'),
  ('a1000000-0000-4000-8000-000000000005', '5f2b9c10-0002-4c7a-9a11-000000000002',
   'Open the ticket properties and pick a different team in the assignee field. The view on the left filters by team afterwards.', FALSE, now() - interval '46 hours'),
  ('a1000000-0000-4000-8000-000000000005', '5f2b9c10-0005-4c7a-9a11-000000000005',
   'That is exactly what we needed. Thank you.', FALSE, now() - interval '44 hours'),
  ('a1000000-0000-4000-8000-000000000006', '5f2b9c10-0006-4c7a-9a11-000000000006',
   'Screenshots of 4.5 MB fail with "upload failed". Smaller files go through.', FALSE, now() - interval '73 hours'),
  ('a1000000-0000-4000-8000-000000000006', '5f2b9c10-0002-4c7a-9a11-000000000002',
   'Confirmed on our side as well. The storage limit is currently applied lower than the documented 10 MB.', FALSE, now() - interval '60 hours'),
  ('a1000000-0000-4000-8000-000000000006', '5f2b9c10-0002-4c7a-9a11-000000000002',
   'Infrastructure ticket raised internally, reference OPS-2291. I will keep this thread updated.', TRUE, now() - interval '58 hours'),
  ('a1000000-0000-4000-8000-000000000007', '5f2b9c10-0004-4c7a-9a11-000000000004',
   'Three colleagues asked for a reset link this morning and none of the emails arrived, including the spam folder.', FALSE, now() - interval '96 hours'),
  ('a1000000-0000-4000-8000-000000000007', '5f2b9c10-0002-4c7a-9a11-000000000002',
   'Our mail provider was rate limiting the workspace. The limit is lifted and pending resets go out on the next retry.', FALSE, now() - interval '92 hours'),
  ('a1000000-0000-4000-8000-000000000007', '5f2b9c10-0004-4c7a-9a11-000000000004',
   'All three people are back in. Thanks for the quick turnaround.', FALSE, now() - interval '90 hours'),
  ('a1000000-0000-4000-8000-000000000008', '5f2b9c10-0005-4c7a-9a11-000000000005',
   'We added a "Region" field last month. It shows in the UI but not in the CSV we download each Monday.', FALSE, now() - interval '120 hours'),
  ('a1000000-0000-4000-8000-000000000009', '5f2b9c10-0006-4c7a-9a11-000000000006',
   'Our auditors ask for a year of change history. The workspace only keeps 90 days.', FALSE, now() - interval '240 hours'),
  ('a1000000-0000-4000-8000-000000000009', '5f2b9c10-0003-4c7a-9a11-000000000003',
   'Retention can be raised to 400 days on your plan. I have sent the self service form.', FALSE, now() - interval '230 hours'),
  ('a1000000-0000-4000-8000-000000000010', '5f2b9c10-0004-4c7a-9a11-000000000004',
   'After we merged the two workspaces our ticket numbers started again at 1, which breaks the reference in our audit documents.', FALSE, now() - interval '300 hours'),
  ('a1000000-0000-4000-8000-000000000010', '5f2b9c10-0002-4c7a-9a11-000000000002',
   'Numbering is continuous per workspace in the current release. I am checking whether the merged workspace can keep its original range.', FALSE, now() - interval '280 hours');

-- Closed last, on purpose: the HD005 trigger refuses comments on a closed
-- ticket, and the point of that trigger is exactly what this seed demonstrates.
UPDATE public.tickets
SET status = 'closed', solved_at = now() - interval '200 hours'
WHERE id = 'a1000000-0000-4000-8000-000000000009';

-- The on_auth_user_created trigger and the comment triggers write the audit trail;
-- one creation entry per ticket keeps it consistent with a real run.
INSERT INTO public.ticket_audit_logs (ticket_id, actor_id, action, changes, created_at)
SELECT t.id, t.requester_id, 'ticket_created',
       jsonb_build_object('subject', t.subject, 'type', t.type, 'priority', t.priority),
       t.created_at
FROM public.tickets t;
