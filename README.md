# RunTrain

A personal running app in the spirit of Runna: it builds you a periodized, week-by-week
training plan for a goal race (5K, 10K, half, or marathon) based on your experience and
current mileage, lets you log your runs against the plan, and charts your progress over
time. Multiple people can each create their own account and get their own plans and run log.

This is a **functional MVP**, not a 1:1 Runna clone. What's included and what's
intentionally left out is explained at the bottom of this file.

## What it does

- **Training plan generator** — pick a race distance, race date, days/week you can run,
  experience level, and current weekly mileage. It generates a full plan with Base, Build,
  Peak, and Taper phases, a long run, one quality session (tempo/intervals) per week, easy
  runs, rest days, and cutback weeks every 4th week.
- **Run logging** — log distance, duration, perceived effort, and notes against any
  scheduled workout (or unscheduled), and see pace calculated automatically.
- **Progress tracking** — weekly mileage chart, pace trend chart, and season totals.
- **Training log** — a Strava-style weekly log (Log in the nav): each week as a row, each
  run as a circle sized by distance, colored by workout type (easy/long/tempo/interval)
  when it's tied to a plan, with a year/month sidebar to jump around your history.
- **Route maps** — runs synced automatically from Strava show their GPS route on the
  activity detail page (OpenStreetMap, no API key needed). CSV imports and manually
  logged runs don't have GPS data available, so they won't show a map — that's a data
  limitation of those sources, not a bug.
- **Automatic Strava sync, or CSV import for Strava/Garmin** — connect your Strava
  account once and new runs sync in automatically, or upload a CSV export from either
  (Import Runs in the nav). New plans automatically use this history to suggest realistic
  starting mileage/days-per-week and to attach real pace targets (e.g. "5:30-5:50/km") to
  workouts instead of generic "easy pace" language — anchored to your own real training
  pace where possible, not just a generic percentage of race pace.
- **Adaptive plan engine** — your plan isn't static. It recalculates the *upcoming*
  portion of your schedule based on what you've actually logged. See "How the adaptive
  engine works" below for the full detail.
- **Manual plan editing** — click **Edit** on any workout (on the dashboard or a plan page)
  to hand-correct its date, type, title, description, or target distance — e.g. swap a run
  to a different day, or fix a session you don't agree with. Once you save an edit, that
  workout is frozen: the adaptive engine described above will never recalculate or
  overwrite it again, so your override always sticks. It's marked with an "Edited" badge
  so you can tell it apart from an automatic "Updated" one.
- **Link an existing run to a workout** — click **Link existing run** on any not-yet-done
  workout to attach an already-logged or already-imported run (e.g. a Strava-synced run
  that came in without ever being tied to a scheduled session) instead of logging a new
  one. An **Unlink** button on any linked run undoes it without deleting the run itself.
- **Manage Plan screen** — click **Manage Plan** on any plan page for a week-by-week
  calendar view where you can drag a workout onto a different day to swap the two, or tap
  **+ Add** on a rest day to schedule something there instead. Each week has its own
  **Reset** button that undoes any rearranging in that week, restoring the originally
  generated day-by-day layout. This only rearranges which day something falls on within its
  own week — it doesn't move workouts between weeks or support more than one workout per
  day (RunTrain always generates exactly one scheduled slot per day).
- **Multi-user** — each person signs up with their own email/password and only sees their
  own plans and runs.
- **Personal preferences** — each user can independently choose km or miles from a
  Settings page (nav bar). Every distance, pace, and elevation figure across the whole
  app — plan descriptions, workout cards, activity history, progress charts — switches to
  match. Settings also holds optional date of birth and sex, stored for future features
  but not required for anything today.

## How the adaptive engine works

This is a rules-based recalculation engine, not a machine learning model — but the rules
come from established sports-science concepts rather than being invented. Every time you
open your dashboard or a plan, it looks at your real logged history (any source — manual,
Strava, or Garmin) and adjusts what's still ahead of you. **Anything in the past —
completed or missed — is never rewritten.** Only workouts that haven't happened yet can
change.

Three things it does:

- **Acute:Chronic Workload Ratio (ACWR).** Compares your last 7 days of volume to your
  trailing 4-week average. A ratio of roughly 0.8-1.3 is the commonly-cited "healthy"
  range; above 1.5 is a widely-used elevated-injury-risk threshold (this comes from sports
  science research, e.g. Gabbett et al., not something made up for this app). When your
  ratio goes high, next week's volume gets hard-capped rather than left to climb further.
  With fewer than ~2 weeks of logged history, this shows as "not enough data" rather than
  guessing from too little information.
- **Missed-session backoff / readiness bump.** Looks at your completion rate over the last
  couple of fully-elapsed weeks. Complete under half of what was scheduled, and the next
  two weeks' volume drops about 20% — a re-ramp, the way a coach would ease you back in
  after a break, instead of assuming you can absorb the original jump. Complete 80-95% and
  nothing changes. Complete everything at a low reported effort, and volume nudges up
  about 5% — capped so it never exceeds the plan's own original peak-volume target.
- **Pace refresh.** Race-pace projections (Riegel's formula — see "What it does" — no
  change there) are recalculated from your most recent best effort rather than frozen at
  plan-creation time, so upcoming easy/tempo/interval/race-pace numbers reflect your
  current fitness, not what it was when you first built the plan.

You'll see an **Adaptive Insights** card on your dashboard and each plan page showing a
projected finish time for your goal race (e.g. "Projected 10K finish: 48:15"), your
current training-load status, recent completion rate, and what (if anything) got adjusted
and why. The projected finish time updates as your pace projection does — it's not fixed
at plan creation. Individual workouts that changed get an "Updated" badge with the
original number shown alongside the new one, so you can always see what the plan
originally called for.

This only touches the plan you're viewing/training toward — it's a live recalculation
computed fresh each time you load the page, not something that permanently rewrites your
stored plan, so it's always working from your most current data.

This new version adds columns to track manual edits and day-swaps (see "Manual plan
editing" and "Manage Plan screen" above), so run `npx prisma db push` once after pulling
this update (see "Updating to a new version" below) — it's additive only and won't touch
existing plans, accounts, or logged runs.

## Preferences (units, date of birth, sex)

Click **Settings** in the nav to set:

- **Units** — km or miles. This is per-person, not global: each friend using the app picks
  their own. Switching it changes how distance, pace, and elevation are displayed
  everywhere (dashboard, plan pages, activity history, progress charts) and how new values
  you type in (workout distance, weekly mileage) are interpreted — everything is still
  stored internally in km, so switching back and forth never loses precision or corrupts
  old data.
- **Date of birth** and **sex** — both optional ("prefer not to say" is always an option).
  Not used by anything yet; they're there so future features (e.g. age-graded pace
  scoring) don't need another round of "everyone re-enter your profile."

If you already have RunTrain running and are updating to a version that includes this,
run `npx prisma db push` once after pulling the update (see "Updating to a new version"
below) — it adds the new preference columns without touching any existing accounts, plans,
or logged runs.

## Prerequisites

- [Node.js](https://nodejs.org) version 18 or later (20 LTS recommended).
- A free [Neon](https://neon.tech) Postgres database (takes about 2 minutes to create, no
  credit card). See "Deploying to the cloud" below for the full walkthrough — do that
  first, since local setup needs a `DATABASE_URL` from it either way.

## Your data lives in the cloud, not on your computer

The database is a hosted Postgres instance (Neon), not a file in this folder. That's
deliberate: it means your accounts, plans, and run history live independently of this app
folder entirely. Whenever you get an updated version of RunTrain (a new zip to unzip,
replacing or sitting alongside this folder), nothing about your data is affected — there's
no file to lose or carry over, because it was never on your computer in the first place.

## Setup (first time)

1. Create a free Neon project (see "Deploying to the cloud" below) and copy its connection
   string into `.env` as `DATABASE_URL`.
2. Open a terminal in this folder and run:

```bash
npm install
npx prisma db push
```

`db push` creates all the tables in your Neon database the first time you run it.

Then open `.env` and change `JWT_SECRET` to a long random string before you invite
friends to use it (this signs their login sessions):

```
JWT_SECRET="paste-a-long-random-string-here"
```

You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Running it

```bash
npm run dev
```

Then open **http://localhost:3000** in your browser. Sign up for an account and create
your first plan.

For everyday use afterwards, you only need `npm run dev` (skip the install/db push steps
— those are one-time setup).

## Updating to a new version

Whenever you get a new version of RunTrain to install:

1. Unzip it to a new folder (or over the old one — either works).
2. Copy your `DATABASE_URL` and `JWT_SECRET` from the old `.env` into the new one (same
   values — same Neon database).
3. `npm install`
4. `npx prisma db push` — this only ever adds new tables/columns as the app gains
   features; it never deletes existing data.
5. `npm run dev`

Because your data lives in Neon rather than in this folder, none of this touches your
existing accounts, plans, or logged runs.

## Automatic Strava sync

Instead of exporting and uploading a CSV every time, you can connect your Strava account
once and RunTrain pulls in new runs automatically — quietly, every time you open your
dashboard (no button needed, though a "Sync now" button is there too for right after a
run). Since RunTrain is self-hosted, you'll need to create your own free Strava API
application first — this is a one-time, ~2 minute setup, and it's a Strava requirement for
any app that isn't Strava's own, not something specific to this project.

### 1. Create a Strava API application

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api) (log in first if
   needed) and fill out the form. For "Website" and "Authorization Callback Domain", use
   your deployed domain — e.g. if your app is at `https://runtrain-yourname.onrender.com`,
   the callback domain is just `runtrain-yourname.onrender.com` (no `https://`, no
   trailing slash). If you're only testing locally for now, `localhost` works too.
2. Once created, you'll see a **Client ID** and **Client Secret** on that same page.

### 2. Add the credentials

Add these three values to your `.env` (locally) and as Environment Variables in Render
(for the deployed version) — see "Deploying to the cloud" below if you haven't set those
up yet:

```
STRAVA_CLIENT_ID="your-client-id"
STRAVA_CLIENT_SECRET="your-client-secret"
APP_BASE_URL="https://runtrain-yourname.onrender.com"
```

`APP_BASE_URL` must exactly match the domain you entered as the Authorization Callback
Domain in step 1 (same domain, `https://`, no trailing slash).

### 3. Push the schema and redeploy

This feature added a few new columns, so run `npx prisma db push` once (same as any other
update — see "Updating to a new version") and redeploy on Render with the new environment
variables set.

### 4. Connect

Go to **Import Runs** in the nav — you'll see a **Connect Strava** button at the top.
Click it, approve access on Strava's consent screen, and you're done. From then on, each
person who wants automatic sync connects their own Strava account the same way — it's
per-person, not a shared setting. A **Disconnect** button is there if you ever want to
stop syncing (it doesn't delete any runs already imported).

A couple of things worth knowing: only running activities sync (rides, swims, etc. are
skipped, same as CSV import); the first sync after connecting pulls about the last 13
months of history, after that it only pulls what's new; and syncing is throttled to at
most once every 30 minutes per person to stay well within Strava's API limits — so if you
just logged a run and want it in immediately, use the "Sync now" button rather than
waiting.

Strava-synced runs also show their GPS route as a map on the activity detail page. If you
connected Strava before this feature existed, your already-synced runs won't have route
data yet — ongoing syncs only fetch what's new, not re-fetch old activities. Disconnecting
and reconnecting Strava triggers a fresh full sync that backfills routes for your existing
history too.

## Importing your run history (Strava or Garmin Connect)

If you'd rather not connect your Strava account (or you use Garmin), the manual CSV
option is still here — go to **Import Runs** in the nav, pick your source, then:

**Strava:**

1. On strava.com (not the mobile app), go to Settings &rarr; My Account &rarr; "Download
   or Delete Your Account" &rarr; "Request Your Archive."
2. Strava emails you a link once it's ready (can take a few minutes to a few hours).
3. Unzip the download and find `activities.csv` inside it.
4. Upload that file on the Import Runs page.

**Garmin Connect:**

1. On connect.garmin.com (the website, not the app), go to Activities, then scroll all
   the way down to load your full history.
2. Click "Export CSV" at the bottom of the activity list.
3. Upload the downloaded file on the Import Runs page.
4. You'll be asked whether your Garmin account displays distance in kilometers or
   miles — Garmin's export doesn't include that information, so this has to be told to
   it rather than guessed. If you're not sure, check a race or long run in the file: a
   marathon showing as ~26.2 means miles, ~42.2 means km.

Both importers only pull in running activities (Run, Trail Run, Running, Treadmill
Running, etc.) — rides, swims, and everything else are skipped automatically.
Re-uploading the same file (or a newer export that includes older activities again)
won't create duplicates.

Once you've imported history, any **new** plan you create will:

- Pre-fill "current weekly mileage" and "days per week" from your actual last 8 weeks of
  running (shown in a banner on the New Plan page — still editable).
- Attach a real projected pace to each workout (e.g. "5:30-5:50/km"), estimated from your
  single best recent effort using Riegel's formula. This is a rough estimate, not a lab
  test — treat the pace ranges as a guide, not gospel.

This only affects plans created after you import; it won't retroactively change existing
plans.

## Letting friends use it too

The simplest way is same Wi-Fi: run `npm run dev`, find your computer's local IP address
(e.g. `192.168.1.42`), and have them visit `http://192.168.1.42:3000` from their phone or
laptop while on the same network. No setup, but only works while your computer is on,
awake, and everyone's on the same network as you — fine for a quick demo, not for ongoing
use.

For friends to reach it anytime, from anywhere, deploy it to the cloud — see the next
section. It's a genuinely free setup (Render + Neon), with one trade-off: the app "sleeps"
after 15 minutes with no visitors and takes about a minute to wake back up on the next
visit. Once deployed, everyone (including you) uses the same URL and creates their own
account via the sign-up page — there's no separate invite step, and each account's plans
and runs are private to that person.

## Deploying to the cloud (Render + Neon)

This gives you a real URL — something like `https://runtrain-yourname.onrender.com` —
that you and your friends can use from any device, anytime, without your computer needing
to be on. Both services used here are free.

### 1. Create your Neon database

1. Go to [neon.tech](https://neon.tech) and sign up (no credit card needed).
2. Create a new project — any name is fine (e.g. "runtrain").
3. On the project dashboard, find the **connection string** (usually shown right after
   creation, or under Connection Details). It looks like:
   `postgresql://user:password@ep-something.region.aws.neon.tech/neondb?sslmode=require`
4. Copy it — you'll need it twice: once for your local `.env`, once for Render.

### 2. Put the code on GitHub

Render deploys from a Git repository. If this folder isn't a Git repo yet:

```bash
cd /path/to/runtrain
git init
git add .
git commit -m "Initial commit"
```

Then create a new (private is fine) repository on [github.com](https://github.com/new),
and follow the "push an existing repository" instructions it shows you, roughly:

```bash
git remote add origin https://github.com/YOUR-USERNAME/runtrain.git
git branch -M main
git push -u origin main
```

`.env` is already excluded via `.gitignore`, so your secrets won't be pushed — you'll set
them directly in Render instead (next step).

### 3. Create the Render web service

1. Go to [render.com](https://render.com) and sign up.
2. Click **New +** &rarr; **Web Service**, and connect the GitHub repo you just pushed.
3. Set:
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Under **Environment Variables**, add:
   - `DATABASE_URL` — the Neon connection string from step 1
   - `JWT_SECRET` — a long random string (generate one with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - Optional, for automatic Strava sync — `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and
     `APP_BASE_URL` (see "Automatic Strava sync" below)
5. Click **Create Web Service**. The first deploy takes a few minutes.

### 4. Create the database tables

Once you have your Neon connection string, run this once from your own terminal (it talks
directly to Neon over the internet, so it works before or after the Render deploy):

```bash
DATABASE_URL="paste-your-neon-connection-string-here" npx prisma db push
```

### 5. Share it

Once Render finishes deploying, it gives you a URL like
`https://runtrain-yourname.onrender.com`. Send that to your friends — everyone signs up
for their own account there. Remember: if nobody's visited in the last 15 minutes, the
next visit takes about a minute to wake the app back up. That's the free tier's only
real trade-off.

## Resetting the database

If you ever want a clean slate:

```bash
npx prisma db push --force-reset
```

This deletes all users, plans, and logged runs from your Neon database. (You can also just
delete the project from the Neon dashboard and create a fresh one.)

## Project structure

```
app/            Next.js pages and API routes
components/     Reusable UI (forms, workout cards, nav)
lib/            Plan-generation algorithm, auth, database client
prisma/         Database schema
```

The training plan algorithm lives in `lib/planGenerator.ts` — it's plain, readable
TypeScript, so if you want to tweak the periodization (e.g. change how aggressive the
mileage ramp is, or how the long run is sized), that's the file to edit.

## What's different from the real Runna app

Runna's core product is built around adaptive, ML-driven plan recalibration and live GPS
run tracking synced from your phone or watch (Garmin, Apple Watch, Strava, etc.), plus a
paid subscription and native mobile apps. Building that is a multi-month, multi-engineer
undertaking. This app instead gives you:

- A solid rules-based plan generator (not ML-adaptive; it won't automatically reshuffle
  your week if you miss a run, though you can always create a new plan).
- Manual run logging (distance/time you enter yourself) rather than live GPS tracking or
  watch sync.
- A web app rather than a native iOS/Android app — it works well on mobile browsers, but
  isn't installable from an app store.

If down the line you want live GPS tracking or Strava/Garmin sync added, that's a
reasonable next phase to scope out separately.
