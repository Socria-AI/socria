# Socria

> AI that sharpens your thinking.

Landing page → chat → saved conversations. Anonymous users get
localStorage-only sessions. Signed-in users get their conversations
synced across every device.

## What this version is

- **Landing page** — full marketing page.
- **Chat** — full Socria chat with the system prompt enforced.
- **Anonymous mode** — chat without signing in. Conversations save to
  the browser's localStorage only.
- **Signed-in mode** — Clerk handles auth; conversations sync to a
  Supabase Postgres table keyed by Clerk user id.
- **Migration** — the first time a browser signs in, any existing
  localStorage conversations are pushed to the cloud, then cleared.

## What you'll need

1. **OpenAI API key** ($5 minimum credit)
2. **A Clerk account** (free) — https://dashboard.clerk.com
3. **A Supabase project** (free) — https://supabase.com
4. **A Vercel account** (free)
5. **A GitHub account** (free)

---

## Deploy

### 1. Get an OpenAI key
1. https://platform.openai.com → Settings → Billing → add a card, top up $5.
2. **Set a monthly limit** of $10–20 in Settings → Limits.
3. API Keys → create new key → copy it (starts with `sk-`).

### 2. Set up Clerk
1. https://dashboard.clerk.com → create an application.
2. Pick the sign-in methods you want (email + Google is a good default).
3. Copy your **Publishable key** and **Secret key** from the API Keys page.

### 3. Set up Supabase
1. https://supabase.com → create a project. Save the database password.
2. SQL Editor → paste the contents of `supabase/schema.sql` → Run.
3. Project Settings → API → copy your **Project URL** and
   **service_role** key. (The service role key is server-only — never
   ship it to the browser.)

### 4. Set up Sanity (CMS for the journal)
1. https://www.sanity.io/manage → create a project. Pick the
   **Production** dataset. Free tier covers 3 users / 10k documents /
   100k API requests per month — plenty for a blog.
2. **API** tab → **CORS origins** → add `http://localhost:3000` and
   your production URL (e.g. `https://socria.vercel.app`). No
   credentials needed.
3. Copy the **Project ID** from the dashboard.
4. After deploy, go to `https://your-domain/studio`, sign in with the
   email you used to create the Sanity project, and the full editor is
   live. Create a **Category** doc first (e.g. "AI & society"), then
   write a **Post** referencing it.

### 5. Push to GitHub
1. Install GitHub Desktop: https://desktop.github.com
2. Open this folder in GitHub Desktop.
3. **File** → **Add Local Repository** → pick the folder.
4. Click "create a repository" link → name it `socria` → Create.
5. Commit `initial commit` → click **Publish repository** → keep private.

### 6. Deploy on Vercel
1. https://vercel.com → Sign up with GitHub.
2. **Add New → Project** → import your `socria` repo.
3. Expand **Environment Variables** and add:
   - `OPENAI_API_KEY` — your key from step 1
   - `OPENAI_MODEL` — `gpt-4o-mini`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — from step 2
   - `CLERK_SECRET_KEY` — from step 2
   - `SUPABASE_URL` — from step 3
   - `SUPABASE_SERVICE_ROLE_KEY` — from step 3
   - `NEXT_PUBLIC_SANITY_PROJECT_ID` — from step 4
   - `NEXT_PUBLIC_SANITY_DATASET` — `production`
4. Click **Deploy**. Wait ~90 seconds.

### 7. Test it
- Visit your Vercel URL.
- Click **Start a thought session** without signing in. Send a message.
  Refresh — conversation should still be there (localStorage).
- Click **Sign in** in the chat header. Complete the Clerk flow.
- That same conversation should now appear in the sidebar — it was
  migrated to Supabase on first sign-in.
- Open the site on another device, sign in with the same account, and
  your sessions should be there.

---

## What's still missing (and when to add it back)

| Feature | When to add it back |
|---|---|
| Pricing / billing | When usage costs you more than you can comfortably absorb |
| Rate limiting | If someone abuses your URL |
| Markdown rendering | When users want richer formatting in replies |

---

## A few honest notes

- **Anyone (even anonymous) can chat.** You'll be paying for their
  OpenAI usage. Set a tight monthly limit on OpenAI. `gpt-4o-mini`
  keeps costs low (~$0.001 per conversation).
- **The Supabase service role key bypasses RLS.** It lives only on the
  server (Vercel env var, used inside `/api/conversations`). The schema
  in `supabase/schema.sql` does not enable RLS — all access is gated by
  the Next.js API checking the Clerk session.
- **No abuse protection.** Someone could script `/api/chat` to burn
  your OpenAI credit. The OpenAI monthly limit is your real protection.
