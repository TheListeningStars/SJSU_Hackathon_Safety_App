This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

# PackTrack — project guide for agents

PackTrack pairs verified university students so they can walk home from campus together. Students meet at a safe meetup point, get matched with others heading the same way, walk as a group, and each person peels off at the point closest to their own destination. Human-facing setup docs are in `README.md`; this section is the context an agent needs before changing code.

## Privacy rules (do not break these)

These are the core promises of the app. Every change must keep them true, and they are enforced in the **database**, not just the UI:

1. **Only `.edu` emails can sign up.** Enforced by the `enforce_edu_email` trigger on `auth.users`. The client check in `sign-in.tsx` is only for a nicer error message.
2. **No matching until a government ID is verified.** `create_walk_request` and `find_or_create_group` require `profiles.verification_status = 'verified'`. Users can't change that column (column-level `grant update (first_name, avatar_path)`); only `review_id_verification(email, approved)` can, and app users can't call it.
3. **ID photos are never readable by other students.** The `id-documents` bucket has an insert policy for the owner's own folder and **no select policy**.
4. **Destinations and routes are private.** `walk_requests` is select-own only. Other group members see only first name, status, split point and split order (via `get_group_details`).
5. **Profile photos are shared only within a group both people confirmed.** Enforced by the avatars storage select policy, using `shares_confirmed_group()`. `get_group_details` also hides `avatar_path` until then.
6. **Contact info is shared only when both people opt in after a completed walk.** `contact_info` is select-own only; other people's contact details only come back from `get_share_status` / `get_mutual_contacts` when both `contact_shares` rows exist.
7. **Live location goes only to group members.** It uses a *private* Realtime broadcast channel `group:<group_id>`, gated by policies on `realtime.messages`.
8. **Gender and walking preference are private.** `profiles` is select-own; matching only uses them inside `find_or_create_group` (0004). Gender is locked after ID verification.

If a feature seems to need loosening one of these, stop and ask the team instead of working around it.

## Architecture

```
src/app/                    Expo Router screens
  _layout.tsx               Root Stack + auth guards (Stack.Protected): sign-in → onboarding → (tabs)
  sign-in.tsx               .edu email → one-time code (supabase.auth.signInWithOtp / verifyOtp)
  onboarding.tsx            name, avatar, contact info, ID photo + selfie → submit_id_verification
  (tabs)/index.tsx          pick meetup point + destination → Routes API walking route → create request → join group
  (tabs)/buddies.tsx        mutual contacts (get_mutual_contacts)
  (tabs)/profile.tsx        profile, contact info, sign out
  group/[id].tsx            live group: members, split points, confirm/start/arrive, live location
  share/[id].tsx            opt-in contact sharing after a completed walk
src/lib/
  supabase.ts               Supabase client (session in expo-sqlite localStorage)
  api.ts                    ALL database access: typed wrappers around tables and RPCs
  directions.ts             Google Routes API (walking) + polyline decoding; straight-line fallback with no key
  images.ts                 image picker, upload to Storage, signed avatar URLs
src/providers/session.tsx   session + profile context, isOnboarded()
src/components/             UI kit: Screen, Card, Field, Button, Avatar, SafetyBar, WalkMap (+ .web fallback)
supabase/migrations/        database schema, privacy rules and all matching logic
supabase/tests/             SQL scenario test against plain PostGIS (see "Testing")
```

**Most of the business logic is in Postgres, not TypeScript.** The client calls security-definer RPCs; it never writes to `walk_requests`, `walk_groups`, `group_members` or `contact_shares` directly. Key RPCs in `supabase/migrations/0001_packtrack.sql`:

| RPC | Purpose |
| --- | --- |
| `create_walk_request` | Stores destination and route (GeoJSON `[[lng,lat],…]`); requires verified status |
| `find_or_create_group` | Joins the best forming group (same meetup point, ±15 min, max 4) where nobody's trip grows >35% and the newcomer walks a real stretch together; otherwise creates one |
| `recompute_split_points` | Internal (0002). Picks an anchor member; the group walks the anchor's route and each member splits at the closest point to home, never within ~100 m of anyone's home |
| `plan_with_anchor` / `best_plan` | Internal (0002). Score a group plan for a given anchor: split points, distance together/alone, detour ratio |
| `get_group_details` | Everything the group screen shows, with privacy filtering applied |
| `confirm_group` / `start_walk` / `leave_group` / `mark_arrived` | Group lifecycle: `forming → walking → completed` (or `cancelled`) |
| `set_contact_share` / `get_share_status` / `get_mutual_contacts` | Mutual opt-in contact sharing |
| `review_id_verification` | Reviewer-only (SQL editor). Approves or rejects a student's ID |
| `walk_prefs_compatible` | Internal (0004). Co-ed vs same-gender preference check used by `find_or_create_group` |

Member status: `joined → confirmed → arrived` (or `left`).

## Changing the database

- `0001_packtrack.sql` and `0002_shared_path_matching.sql` have **already been applied** to the team's Supabase project (`ivsgdxmiuahfzfhxkook`). **Never edit applied migrations.** Add a new file `supabase/migrations/000N_<description>.sql` with only the changes (`create or replace function …`, `alter table …`), and tell the human to run it in the Supabase SQL Editor.
- New RPCs: use `security definer`, `set search_path = public, extensions`, check `auth.uid()`, and add a typed wrapper in `src/lib/api.ts`. Internal helpers must `revoke execute … from public, anon, authenticated`.
- PostGIS is installed in the `extensions` schema. Return lat/lng as plain numbers (`st_y(geom)`, `st_x(geom)`) because PostgREST returns geometry as hex.

## Testing

```bash
npx tsc --noEmit     # 1 known error in src/components/app-tabs.web.tsx (from the Expo template)
npx expo lint        # 1 known error in src/hooks/use-color-scheme.web.ts (from the Expo template)
```

Database logic: `supabase/tests/scenario.sql` runs the whole flow (signup rules, verification gate, matching, split points, photo and contact privacy) on a throwaway PostGIS container. `00_supabase_stubs.sql` stands in for Supabase's auth/storage/realtime schemas:

```bash
docker run -d --name pt-pg -e POSTGRES_PASSWORD=pw postgis/postgis:16-3.4
docker cp supabase/tests/00_supabase_stubs.sql pt-pg:/tmp/a.sql
docker cp supabase/migrations/0001_packtrack.sql pt-pg:/tmp/b.sql
docker cp supabase/migrations/0002_shared_path_matching.sql pt-pg:/tmp/b2.sql
docker cp supabase/tests/scenario.sql pt-pg:/tmp/c.sql
for f in a b b2 c; do docker exec pt-pg psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/$f.sql; done
docker rm -f pt-pg
```

Every check prints `NOTICE: PASS: …`; a failure raises `FAIL: …`. Apply new migrations after `b2.sql` and extend `scenario.sql` when you change matching or privacy logic. (On Git Bash for Windows, `export MSYS_NO_PATHCONV=1` first.)

## Conventions

- Colors come from tokens in `src/constants/theme.ts` (`accent`, `success`, `warning`, `danger`, …) via `ThemedText themeColor=` / `useTheme()`. Don't hardcode colors in screens.
- Build screens from `Screen`, `Card`, `Field`, `ErrorText` (`src/components/screen.tsx`) and `Button` (`src/components/button.tsx`).
- `react-native-maps` has no web support: map code goes through `WalkMap`, which has a `.web.tsx` fallback.
- The SafeWalk phone number and meetup coordinates are placeholders to check (`theme.ts`, seed data in the migration).
- The React Compiler lint rules are on: don't call `setState` directly inside `useEffect`, and don't call `Date.now()` during render.

## Local environment gotchas

- Env vars live in `.env.local` (git-ignored; template in `.env.example`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, optional `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`. Never commit keys or tokens.
- The project is developed in WSL, so phones can't reach the dev server over LAN. Use `npx expo start --tunnel`. That needs the Expo CLI signed in to the same account as Expo Go (`npx expo login`, or an `EXPO_TOKEN` env var). Without a login, use `npx expo start --tunnel ngrok`.
- Supabase's built-in email sender allows only ~2 emails per hour; configure custom SMTP for team use. The Magic Link and Confirm signup email templates must include `{{ .Token }}`, because the app asks for a code, not a link.
- To approve a test account: `select public.review_id_verification('someone@sjsu.edu', true);` in the SQL Editor.

## Known gaps / ideas

- ID review is manual. Production should use Stripe Identity or Persona, with a webhook calling `review_id_verification`.
- The Google Routes API key is used from the client; move it to a Supabase Edge Function before launch.
- No push notifications yet (e.g. "someone joined your group"). The group screen updates through Realtime only while it's open.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
