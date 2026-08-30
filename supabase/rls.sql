-- Socria: deny-by-default Row Level Security.
--
-- Why this exists even though the app already scopes every query.
--
-- The Next.js API is the only thing that talks to Postgres, and it does so
-- with the service role key, which bypasses RLS entirely. So these policies
-- are NOT what keeps one user out of another user's rows — the `.eq('user_id',
-- userId)` filter on every read and write is. What RLS buys is the second
-- wall: if the anon/publishable key ever leaks, gets embedded in a client
-- bundle by mistake, or someone enables Supabase's auto-generated REST API
-- against these tables, the answer is zero rows instead of the whole table.
--
-- Enabling RLS with no policies is deliberate. There is no Supabase Auth JWT
-- in this system — identity comes from Clerk and lives only in the Next.js
-- process — so there is no `auth.uid()` to write a policy against. "Nobody
-- but the service role" is the honest, enforceable rule, and it is exactly
-- the posture we want.
--
-- Safe to re-run. Run this against the same project as schema.sql.

alter table conversations        enable row level security;
alter table user_profiles        enable row level security;
alter table logos_connections    enable row level security;
alter table socria_subscriptions enable row level security;
alter table logos_usage           enable row level security;

-- Force it for the table owner too, so a future superuser-ish role does not
-- silently slip past the policies it thinks are protecting it. The service
-- role key used by the API still bypasses RLS; this closes the owner path,
-- not that one.
alter table conversations        force row level security;
alter table user_profiles        force row level security;
alter table logos_connections    force row level security;
alter table socria_subscriptions force row level security;
alter table logos_usage           force row level security;

-- Deliberately no policies. With RLS on and no policy granting access, anon
-- and authenticated see nothing. If direct client access is ever added, add
-- policies here at the same time — do not disable RLS to make it work.

-- Belt and braces: revoke the table grants Supabase hands the API roles by
-- default, so the failure mode is a permission error rather than an empty
-- result that could be mistaken for "no data".
revoke all on conversations        from anon, authenticated;
revoke all on user_profiles        from anon, authenticated;
revoke all on logos_connections    from anon, authenticated;
revoke all on socria_subscriptions from anon, authenticated;
revoke all on logos_usage           from anon, authenticated;
