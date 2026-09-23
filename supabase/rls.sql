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
alter table logos_usage          enable row level security;
alter table lifecycle_emails     enable row level security;

-- Force it for the table owner too, so a future superuser-ish role does not
-- silently slip past the policies it thinks are protecting it. The service
-- role key used by the API still bypasses RLS; this closes the owner path,
-- not that one.
alter table conversations        force row level security;
alter table user_profiles        force row level security;
alter table logos_connections    force row level security;
alter table socria_subscriptions force row level security;
alter table logos_usage          force row level security;
alter table lifecycle_emails     force row level security;

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
revoke all on logos_usage          from anon, authenticated;
revoke all on lifecycle_emails     from anon, authenticated;

-- lifecycle_emails is the one table here that holds a STATED PREFERENCE
-- rather than something the person made: the `unsubscribed` row is somebody
-- saying "stop". Readable, it says who has opted out of email; writable, it
-- is a switch on somebody else's inbox in either direction. It joined this
-- file late — it was the only table in schema.sql without RLS — and Logos 2
-- is what made that urgent: a shared room needs the anon key in the browser
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY), so from now on that key is public by
-- design, and any table Supabase's auto-generated REST API can still reach
-- is reachable by anyone who reads a script tag.
