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