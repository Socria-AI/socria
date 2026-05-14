# Socria

> AI that sharpens your thinking.
> Socria helps you reason through ideas, decisions, and uncertainty — without outsourcing your thinking.

This is the MVP web app for **Socria** (powered by **Socria Core 1.0**). It's a Next.js + TypeScript + Tailwind + Supabase + Clerk + OpenAI build, ready for Vercel.

---

## What's in here

```
socria/
├── app/
│   ├── (marketing)/              # Public-facing pages
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Landing
│   │   ├── how-it-works/page.tsx
│   │   └── pricing/page.tsx
│   ├── (app)/                    # Authenticated app shell (sidebar)
│   │   ├── layout.tsx            # Protected, mirrors Clerk user → DB
│   │   ├── dashboard/page.tsx
│   │   ├── chat/page.tsx         # Redirects to /dashboard
│   │   ├── chat/[id]/page.tsx    # Thought session view
│   │   └── settings/page.tsx
│   ├── sign-in/[[...sign-in]]/page.tsx
│   ├── sign-up/[[...sign-up]]/page.tsx
│   ├── api/
│   │   ├── chat/route.ts                  # Streams Socria responses
│   │   ├── conversations/route.ts         # List + create
│   │   └── conversations/[id]/route.ts    # Get + delete
│   ├── globals.css
│   └── layout.tsx                # Root, loads fonts + Clerk
├── components/
│   ├── AppSidebar.tsx
│   ├── Button.tsx
│   ├── ChatView.tsx              # Main chat UI (client)
│   ├── Logo.tsx
│   ├── MarketingFooter.tsx
│   ├── MarketingNav.tsx
│   └── NewSessionButton.tsx
├── lib/
│   ├── ensure-user.ts            # Mirrors Clerk user → DB
│   ├── openai.ts                 # Server-only OpenAI client
│   ├── socria-prompt.ts          # The exact Socria system prompt
│   ├── supabase.ts               # Server admin + browser anon clients
│   ├── types.ts
│   └── usage.ts                  # Rate limit + usage tracking
├── supabase/
│   └── schema.sql                # Run this in Supabase SQL editor
├── middleware.ts                 # Clerk auth on protected routes
├── tailwind.config.ts
├── next.config.js
├── tsconfig.json
├── package.json
├── postcss.config.js
└── .env.example                  # Copy to .env.local
```

---

## Why Clerk (not Supabase Auth)?

I chose **Clerk** for the MVP because:

1. **Drop-in UI components.** `<SignIn/>` and `<SignUp/>` ship working email, magic-link, OAuth (Google, Apple, GitHub) and password auth out of the box. With Supabase Auth, you build the forms yourself.
2. **A free tier that covers MVP traffic** (10k MAUs on free).
3. **Middleware integration with Next.js App Router is one line** (`clerkMiddleware`). Auth on server components via `await auth()`.
4. **Separation of concerns.** Supabase stays a pure data layer. We pass `userId` (Clerk's stable ID) as a string column. Service role bypasses RLS; anon key is blocked. Simple to reason about.

You can swap to Supabase Auth later — replace `middleware.ts`, `auth()` calls, and the sign-in/up pages. The DB schema doesn't change since `users.id` is a `text` column.

---

## Local setup

### Prerequisites
- Node 18.17+ (Node 20 recommended)
- A Supabase account (free): https://supabase.com
- A Clerk account (free): https://clerk.com
- An OpenAI API key: https://platform.openai.com

### 1. Install
```bash
git clone <your-repo> socria
cd socria
npm install
```

### 2. Create the Supabase project
1. Go to https://supabase.com → New Project.
2. Pick a strong DB password, save it.
3. Wait for it to provision (~1 min).
4. Open **SQL Editor → New Query**, paste the entire contents of `supabase/schema.sql`, click **Run**.
5. Go to **Settings → API** and grab:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (secret) → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Create the Clerk app
1. Go to https://clerk.com → New Application.
2. Enable the auth methods you want (email + Google is a good starting pair).
3. In **API Keys**, grab:
   - `Publishable Key` → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `Secret Key` → `CLERK_SECRET_KEY`

### 4. Get an OpenAI key
1. https://platform.openai.com → API Keys → create one.
2. Add billing if you haven't — you'll need at least a few dollars credit.

### 5. Environment variables
```bash
cp .env.example .env.local
```
Fill in every value from the steps above. Defaults for `OPENAI_MODEL=gpt-4o-mini` and `DAILY_MESSAGE_LIMIT=100` are fine.

### 6. Run it
```bash
npm run dev
```
Open http://localhost:3000.
- Hit "Try Socria" → sign up → you'll land on `/dashboard` → start a thought session.

---

## Deploy to Vercel

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Socria MVP"
git remote add origin git@github.com:YOUR_USER/socria.git
git push -u origin main
```

### 2. Import in Vercel
1. https://vercel.com → **Add New → Project**.
2. Select your GitHub repo.
3. Framework preset auto-detects **Next.js**.
4. **Don't deploy yet.** Click "Environment Variables" first.

### 3. Add env vars in Vercel
Add every variable from `.env.example` (skip the commented-out Stripe ones for now). For each: paste the value from your local `.env.local`. Mark `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, and `OPENAI_API_KEY` as **production + preview + dev**, encrypted.

Update `NEXT_PUBLIC_APP_URL` to your eventual Vercel URL (e.g. `https://socria.vercel.app`). You can adjust after deploy.

### 4. Deploy
Click **Deploy**. First build takes ~90s. When it's live:

### 5. Configure Clerk for your live domain
1. In Clerk dashboard → **Domains** → add `socria.vercel.app` (or your custom domain).
2. In **Paths**, confirm sign-in/up paths are `/sign-in` and `/sign-up`.

### 6. Test the live app
- Visit your Vercel URL.
- Sign up → land on `/dashboard`.
- Start a session → send a message.
- Check the **Network** tab to confirm `/api/chat` streams a response.
- In Supabase, open **Table Editor → conversations / messages / usage** to confirm rows are being written.

---

## Security checklist (already in place)

- ✅ `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are never sent to the client. They're only read inside `app/api/*` and `lib/openai.ts` / `lib/supabase.ts` (the `getSupabaseAdmin` function).
- ✅ All `/api/chat`, `/api/conversations*` routes check `auth()` and verify conversation ownership before any read or write.
- ✅ User input is length-checked (`MAX_INPUT_LEN = 8000`) and rejected if empty.
- ✅ A simple per-user daily message limit (`DAILY_MESSAGE_LIMIT`, default 100) is enforced in `lib/usage.ts`.
- ✅ Supabase RLS is enabled on every table. Since we use the service role key from server only and the anon key has no policies, the anon key effectively cannot read or write.
- ✅ `.env.local` is gitignored. `.env.example` ships with placeholder values only.

---

## How Socria's behavior is enforced

The exact philosophy prompt you provided lives in `lib/socria-prompt.ts` and is sent as the `system` message on every OpenAI call inside `app/api/chat/route.ts`. We also keep `max_tokens: 500` and `temperature: 0.7` to encourage the short, conversational, question-led rhythm Socria is designed around.

On the UI side:
- The empty-state CTA says **"What would you like to think through?"**
- Starter prompts are the four you specified.
- The "+" button is labeled **New thought session**, not "New chat".
- The composer footer says **"Socria asks. You think."**

---

## What to improve after MVP

In rough priority order:

1. **Streaming SSE polish.** The current implementation streams plain text. Move to Server-Sent Events with proper event types so we can stream metadata (token count, mode switch) alongside content.
2. **Mode switcher in the UI.** The system prompt defines Coach / Refine / Decision Audit — surface a toggle in the chat header so the user picks the mode. (You can do this by appending a `Mode: <name>` line to the system prompt for the session.)
3. **Edit/regenerate.** Let users edit their last message and regenerate Socria's reply.
4. **Per-user model choice.** Allow Pro users to switch between `gpt-4o-mini` and `gpt-4o`.
5. **Stripe billing.** Stripe Checkout for Pro ($12/mo), webhook to flip a `plan` column on `users`, gate `DAILY_MESSAGE_LIMIT` accordingly.
6. **Search history.** Trivial with Supabase: `ilike` over `messages.content` scoped to user's conversations.
7. **Export.** Markdown export of a thought session — "save what you thought through."
8. **Mobile sidebar.** Currently hidden below `md`. Add a drawer.
9. **Soft delete + 30-day retention.** Currently `DELETE` is hard. Add `deleted_at` for recovery.
10. **Observability.** Pipe `console.error` into Sentry or Vercel Logs alerts. Add a daily cron to summarize `usage` table.
11. **Abuse hardening.** Add per-IP rate limiting (Vercel KV + Upstash Ratelimit) on `/api/chat` for unauthenticated spam protection if you ever open a public demo.
12. **System prompt v2.** Build an eval set of "outsourced thinking" prompts ("write my essay", "decide for me", "give me 10 ideas") and verify Socria deflects them correctly. Tune the prompt based on failures.
13. **Memory.** A per-user note Socria can read at the start of a session ("Last time you were thinking about quitting your job — picking up where you left off?").
14. **Voice mode.** OpenAI Realtime API for a spoken reflective conversation. This is where Socria gets philosophically powerful — talking out loud forces clarity.

---

## Notes on Socria's product posture

The temptation when building an "AI app" is to make it answer faster, longer, smarter. Socria's product position is the opposite, and the UI has to reinforce it: the empty state, the bubble label, the language ("session" not "chat", "asks" not "answers"). When you ship, watch for any place where the UX whispers "we'll answer for you" — and fix it.

The hardest engineering problem here isn't the streaming or the schema. It's the prompt holding the line under pressure when users ask Socria to just give them the answer. The system prompt as written is strong; build evals to verify it stays strong as models update.
