# VitalNest — Setup guide

Everything here runs on free plans: **Supabase Free**, **Vercel Hobby**, **GitHub Free**.
Total time: about 20 minutes.

---

## 1. Supabase (database, logins, report storage)

1. Go to <https://supabase.com> → **Start your project** → sign in with the Advankart Solutions GitHub account.
2. **New project**
   - Name: `vitalnest`
   - Database password: generate one and keep it safe (it isn't needed by the app)
   - Region: **South Asia (Mumbai)** for the fastest speed in India
3. When the project is ready, open **SQL Editor → New query**, paste the full contents of [`supabase/schema.sql`](../supabase/schema.sql), and click **Run**. You should see "Success. No rows returned".
4. **Authentication → Sign In / Providers → Email** → turn **OFF "Confirm email"** → Save.
   (VitalNest uses usernames, not real e-mails, so confirmation must be off.)
5. **Project Settings → API Keys** (or the **Connect** button at the top) and copy:
   - **Project URL** — `https://xxxx.supabase.co`
   - **anon / publishable key** — `eyJ…` or `sb_publishable_…`
   These two values are safe to put in the app (security is enforced by the database rules). **Never** use the `service_role` / secret key.

> Free Supabase projects pause after 7 days with **no activity at all**. Normal daily use keeps it awake. If it pauses, click "Restore" in the dashboard. No data is lost.

## 2. GitHub (code + automatic APK builds)

The code lives in the repository **`vitalnest`** on the Advankart Solutions GitHub account.

Add these **repository secrets** (Settings → Secrets and variables → Actions → New repository secret):

| Secret | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL from step 1.5 |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key from step 1.5 |
| `ANDROID_KEYSTORE_BASE64` | release signing key (provided separately — keep a backup!) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `vitalnest` |
| `ANDROID_KEY_PASSWORD` | same as keystore password |

Every push to `main` builds a new APK automatically (**Actions** tab, ~6 minutes) and publishes it under **Releases**. To rebuild manually: Actions → *Build Android APK* → **Run workflow**.

> Keep `vitalnest-release.jks` and its password backed up (e.g. Google Drive). Android only accepts updates signed with the same key.

## 3. Vercel (website for the family)

1. Go to <https://vercel.com/signup> → **Hobby** → **Continue with GitHub** (Advankart Solutions account).
2. **Add New → Project** → import `vitalnest`.
3. Framework: **Vite** (auto-detected). Open **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon / publishable key
4. **Deploy**. You get a link like `https://vitalnest-xxxx.vercel.app` (you can rename it in Settings → Domains, e.g. `vitalnest-advankart.vercel.app`, or add your own domain).

Every push to GitHub redeploys the site automatically.

## 4. Install on phones

**Android (recommended for reminders):** open the GitHub **Releases** page → download `VitalNest.apk` → open it → allow "Install unknown apps" if asked.
Then open the app → More → Reminders & notifications → **Turn on reminders** → allow **exact alarms** if prompted.

**iPhone / any phone:** open the Vercel link in Safari/Chrome → Share → **Add to Home Screen**. (Web reminders only appear while the app is open.)

## 5. First use

1. **Create account** (username + password) → **Create family** → fill in the first health profile (condition, details, targets). Starter reminders are added automatically based on the condition.
2. Add other people: tap the name at the top → **Add family member**.
3. Invite relatives: More → **Family & sharing** → **WhatsApp invite**. They create their own login and enter the 6-letter code. They join as *Viewer*; promote to *Caregiver* if they log readings.

## Forgotten password
There's no e-mail reset because the app uses usernames. To fix a forgotten password:
1. In Supabase, open **Authentication → Users**, find `theirusername@vitalnest.app`, and delete that user.
2. The person signs up again with the same username and joins with the invite code.
Health records are safe because they belong to the family, not to the login. If their own profile was "linked to me", tick that box again in their profile.

## Local development
```bash
cp .env.example .env.local     # fill in the two values
npm install
npm run dev                    # http://localhost:5173
npm run android:sync           # copy web build into the Android project
npx cap open android           # open in Android Studio (optional, for local APK builds)
```
