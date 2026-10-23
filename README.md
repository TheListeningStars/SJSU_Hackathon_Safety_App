# PackTrack

Pairs verified university students so nobody walks home from campus alone. Students meet at a safe meetup point, get matched with others heading the same way, walk together, and each person peels off at the point closest to their own destination.

## How it works

1. **Sign in** with a `.edu` email (one-time code). Non-university emails are rejected by the database.
2. **Verify** with a profile photo, a photo of a government ID and a selfie. ID images go to a private bucket that only reviewers can read. Matching stays locked until a reviewer approves.
3. **Plan a walk**: pick a meetup point, tap your destination on the map and choose when you're leaving. The app gets a walking route from the Google Routes API.
4. **Get matched**: PostGIS joins you to a forming group at the same meetup point (departing within 15 minutes, max 4 people) heading your way, as long as nobody's walk gets more than ~35% longer.
5. **Confirm**: confirming shares your profile photo with that group only. You see someone's photo once you've both confirmed.
6. **Walk**: the group follows one shared path, and each person peels off at the point closest to their home. For privacy, splits happen at least ~100 m before anyone's home. Live locations are shared over a private Realtime channel only group members can join. SafeWalk call/text and 911 buttons are always on screen.
7. **After the walk**: everyone taps "I'm home safe." Then each person can choose who to share contact info with. Info is revealed only when both people opt in.

## Stack

| Layer | Pick |
| --- | --- |
| App | Expo SDK 58, Expo Router, TypeScript |
| Maps & location | `react-native-maps`, `expo-location` |
| Backend | Supabase (Postgres + PostGIS + Realtime + Storage) |
| Routes | Google Routes API (walking mode) |
| SafeWalk call/text | `expo-linking` (`tel:` / `sms:`) |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run each file in [`supabase/migrations/`](supabase/migrations/) in order (`0001`, then `0002`). This creates the tables, privacy rules, storage buckets, Realtime policies and SJSU meetup points.
3. **Authentication → Email Templates → Magic Link**: add `{{ .Token }}` to the template so the email contains the 6-digit code the app asks for.
4. **Authentication → Sign In / Providers**: make sure Email is enabled.
5. **Realtime → Settings**: turn off "Allow public access" if you want only private channels (the app uses private ones).

### 2. Google Routes API (optional but recommended)

Enable the **Routes API** in Google Cloud and create an API key (the older Directions API can no longer be enabled on new projects). Without a key the app falls back to straight-line routes, which still works for a demo but makes matching less accurate.

### 3. Environment

```bash
cp .env.example .env.local
# fill in EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
```

### 4. Run

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go**. The map and camera need a phone (or simulator). The web build shows a simplified list instead of the map.

### 5. Approve students (reviewer)

New users land in "ID under review". To approve or reject them, run this in the Supabase SQL editor:

```sql
select public.review_id_verification('student@sjsu.edu', true);   -- approve
select public.review_id_verification('student@sjsu.edu', false);  -- reject (they're asked to resubmit)
```

ID photos are in **Storage → id-documents/<user id>/**.

## Demo with two people

1. Sign up two `.edu` accounts on two phones and approve both with the SQL above.
2. Both pick the same meetup point, drop destinations in roughly the same direction and choose the same departure time.
3. Both land in the same group. Each taps **Confirm**, then **Start walking**, then **I'm home safe**, then **Share contact info**.

## Project layout

```
src/app/              screens (Expo Router)
  sign-in.tsx         .edu email + one-time code
  onboarding.tsx      profile photo, contact info, ID + selfie
  (tabs)/index.tsx    plan a walk and get matched
  (tabs)/buddies.tsx  people you mutually shared with
  (tabs)/profile.tsx  your profile and contact info
  group/[id].tsx      live group: members, split points, live locations
  share/[id].tsx      opt-in contact sharing after a walk
src/lib/              Supabase client, API calls, walking routes, image upload
supabase/migrations/  database schema, privacy rules and matching logic
```

## Known limitations

- ID review is manual. For production, swap in a provider such as Stripe Identity or Persona and have its webhook call `review_id_verification`.
- The Google key is used from the client. Before launch, move Routes API calls into a Supabase Edge Function so the key stays server-side.
- Meetup point coordinates and the SafeWalk number (`src/constants/theme.ts`) are approximate. Check them before demoing.
