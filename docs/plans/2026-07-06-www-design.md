# WWW '26 — personal offline festival guide

**Date:** 2026-07-06
**Repo:** `org/jonasjohansson/www`
**Source:** https://whatwherewhen.nobodies.team/ (Elsewhere '26 / Nowhere regional burn, Spain)

## Purpose

A mobile-first, offline-first personal remake of the Elsewhere '26 festival guide for
Jonas + girlfriend. Three goals, all in one app:

1. **Offline mobile browser** (primary backbone) — browse/search/filter all 677 events on-site
   with zero signal.
2. **Interest-match "For You"** — AI-scored ranking of every event against the couple's taste.
3. **Calendar export** — favourites + top AI picks → dated `.ics` (and optional Google Calendar push).

Festival runs **Tue Jul 7 → Sun Jul 12, 2026** (verify during build; data references Mon Jul 6 as a
pre-festival build day, so Tue = Jul 7).

## Source / scraping

The site is a Vite/React PWA, deliberately fully offline: **no server or API**. The entire dataset
is one JSON array baked into `/assets/index-*.js`. "Scraping" = download that bundle, extract the
array, clean escaping. No auth/rate limits/pagination.

Event schema:
```json
{ "id":"uuid", "title":"", "camp":"", "loc":"", "desc":"", "time":"HH:MM",
  "dur":<minutes>, "cat":"heal|chill|adult|work|food|party|other",
  "days":["Tue".."Sun"], "recur":<bool> }
```

## Interest profile (seeds AI scan)

Broad: dance/music/parties + healing/chill/restorative + workshops/talks/art/play +
food/social. **Adult/kink: included but tagged**, with an in-app toggle (default ON, one tap to hide).
The AI ranks within everything; in-app toggles + favourites let the couple override.

## Architecture

### A. Build pipeline (runs once on Mac, bakes static output)
- `build/extract.mjs` — download bundle, extract + clean array → `data/events.raw.json`; derive day→date map.
- **AI scan** — fan out all 677 events through Claude (a Workflow at build time, no runtime API key
  needed) against the profile. Each event gets `score` 0–100, `forYou` bool, one-line `reason`.
  Merge → `public/events.json`. Fully static; **no runtime API calls**.

### B. App (mobile-first PWA, vanilla JS, offline)
- Views: `For You` (AI-ranked) · `Schedule` (day → time) · `Search` · `Favourites` · `Camps`.
- Filters: category chips, **adult toggle** (default on), day picker, "For You only".
- Card: title · camp · time+dur · days · category tag · AI reason · ♥ favourite. Tap → full desc.
- State (favourites, settings) in `localStorage`. High-contrast, big tap targets (sun-readable),
  earthy palette (`#2e4439` / `#e8dfc9`).
- Installable; service worker precaches shell + `events.json` → airplane-mode proof.

### C. Calendar
- "Export" → `.ics` from **favourites + top unseen AI picks** (deduped), real dated VEVENTs
  (recurring days → one entry per day at correct time). Import into any calendar; offline.
- Optional one-tap push of the same set to a dedicated "Elsewhere '26" Google Calendar via MCP.

### D. Delivery
- Repo `org/jonasjohansson/www`, localhost preview, deployed to a URL (Netlify) so it installs on phone.

## Non-goals (YAGNI)
- No live sync back to the source site (one-shot snapshot is fine; can re-run build to refresh).
- No accounts/backend. No runtime AI. No map (source has one; out of scope for v1).

## Risks / notes
- **Time-critical:** festival likely starts Jul 7 → must be installable on phone before losing signal.
- Verify festival dates + total event count against a fresh bundle at build time (bundle hash can change).
- A few records have quirky escaping — handled in extract step.
