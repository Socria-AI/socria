# Socria — Lite Version

> AI that sharpens your thinking.

A simplified MVP. Landing page → chat → saved conversations. That's it.

## What this version is

- **Landing page** — your full marketing page, unchanged.
- **Chat** — full Socria chat with the system prompt enforced.
- **Saved conversations** — stored in your browser (localStorage). Persist on your device. Don't sync across devices.
- **No login** — anyone with the URL can chat.
- **No database** — nothing to set up, nothing to break.

## What you only need

1. **OpenAI API key** ($5 minimum credit)
2. **A Vercel account** (free)
3. **A GitHub account** (free) — *or* you can drag a zip into Vercel directly

That's it. No Supabase. No Clerk. No domain config.

---

## Deploy in 4 steps

### 1. Get an OpenAI key
1. https://platform.openai.com → Settings → Billing → add a card, top up $5.
2. **Set a monthly limit** of $10–20 in Settings → Limits.
3. API Keys → create new key → copy it (starts with `sk-`).

### 2. Push to GitHub
Easiest path:
1. Install GitHub Desktop: https://desktop.github.com
2. Open this `socria-lite` folder in GitHub Desktop.
3. **File** → **Add Local Repository** → pick the folder.
4. Click "create a repository" link → name it `socria` → Create.
5. Commit with message `initial commit` → click **Publish repository** → keep private.

### 3. Deploy on Vercel
1. https://vercel.com → Sign up with GitHub.
2. **Add New → Project** → import your `socria` repo.
3. Expand **Environment Variables** → add:
   - Name: `OPENAI_API_KEY` → Value: your key from step 1
   - Name: `OPENAI_MODEL` → Value: `gpt-4o-mini`
4. Click **Deploy**. Wait ~90 seconds.

### 4. Test it
- Visit your Vercel URL.
- Click **Start a thought session**.
- Send a message. Socria should reply.
- Refresh the page. Your conversation should still be there (saved to localStorage).

That's the whole deploy. No more steps.

---

## What's intentionally missing (and when to add it back)

| Feature | When to add it back |
|---|---|
| User accounts / login | When you have repeat users asking to log in across devices |
| Database / cloud sync | When users complain they lost conversations |
| Pricing / billing | When usage costs you more than you can comfortably absorb |
| Rate limiting | If someone abuses your URL |

For each one, you'll know exactly when you need it. Don't build for problems you don't have yet.

---

## A few honest notes about this version

- **Anyone with the URL can chat.** You'll be paying for their OpenAI usage. If you share the URL widely, set a tight OpenAI spending limit. The `gpt-4o-mini` model keeps costs low (~$0.001 per conversation).
- **Conversations live only in the user's browser.** Clearing browser data deletes them. If they switch devices, they don't see their old chats. That's the tradeoff for skipping the database.
- **No abuse protection.** Someone could script your `/api/chat` endpoint to burn your OpenAI credit. The $10–20 monthly limit on OpenAI is your real protection — set it.

---

## When you outgrow this

The full version (with Clerk + Supabase + accounts + cloud sync + billing) is in `socria.zip` from before. Come back to it when you have evidence people want a real account-based product. Probably after you have 50+ users actively returning to Socria.
