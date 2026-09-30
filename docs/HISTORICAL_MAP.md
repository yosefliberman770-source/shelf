# Historical map

Tap a place while reading and see it on OpenHistoricalMap at the year the book is talking about.

## How it fits together

```
EPUB page (epub.js, unchanged)
  → place detection (src/lib/history/placeDetect.ts)
  → HistoricalPlaceService (src/lib/history/placeService.ts)
      → World Historical Gazetteer, through Shelf's server (server/historical.ts)
      → or Wikidata when no server with WHG is available (src/lib/history/providers.ts)
  → assess: likely / possible / which one? / not found (src/lib/history/assess.ts)
  → HistoricalPlace
  → HistoricalMapProvider → OpenHistoricalMap embed (src/lib/history/mapProviders.ts)
  → HistoricalMapPanel (src/components/history/HistoricalMapPanel.tsx)
```

The reader never talks to WHG directly. It uses `historicalPlaces` (the service), which picks the best available provider.

## Using it

* In the reader, tap the middle of the page → **Map**. Places on the page are listed; tap one.
* Or select a word → **🗺 Map**.
* Or tap an underlined place / an X-Ray place → **🗺 View on Historical Map**.
* In the map: move through time with the slider or type a year ("216 BC"), **▶ Play** animates year by year (OpenHistoricalMap's own `start_date`/`end_date`/`interval`), **Map places in this chapter**, **Follow the book**, **Sources & attribution**.
* The phone's back button closes the map and returns to the same place in the book.

## Environment variables (server only)

| Variable | Purpose |
|---|---|
| `WHG_API_TOKEN` | World Historical Gazetteer API token (from your WHG profile page). Used only by the server for the Reconciliation API (v0.2) and its data extension (dates, names); never sent to the browser. Without it the app uses WHG's public index search. |
| `WHG_USER_AGENT` | Optional User-Agent identifying your app to WHG. |
| `SHELF_ALLOWED_ORIGINS` | Comma-separated origins (e.g. your GitHub Pages site) allowed to call the server. |

### Getting WHG access

1. Create an account at https://whgazetteer.org/ .
2. Generate an API token from your profile (see https://docs.whgazetteer.org/content/technical/apis.html, "API Tokens").
3. Put it in `.env` as `WHG_API_TOKEN=…` (the file is git-ignored) and start the server with `npm start`.
4. If you use the app from GitHub Pages, deploy the server somewhere reachable, add your Pages origin to `SHELF_ALLOWED_ORIGINS`, and enter the server address in **Settings → AI & privacy → Historical maps**.

Without a server (e.g. plain GitHub Pages), places are looked up on Wikidata, which needs no key.

## Server routes

* `GET /api/historical/status` → `{ whg: boolean }`
* `POST /api/historical/place-search` `{ queries: [{ name, limit? }] }` → one WHG `/reconcile` request (max 50 names, WHG's batch size). A per-query `gateway` failure comes back as `{ error: 'gateway' }` and is never treated as "no match". 429/5xx → 503 with `Retry-After`.
* `GET /api/historical/place?id=pl:123` → the Linked Places record (geometry, names, dates, attribution). WHG's 451 ("source doesn't permit redistribution") is passed on as `restricted`, not retried.

## Dates

* Inside the app a year is an integer with **no year 0**: 218 BCE = `-218`, 1 BCE = `-1`, 1 CE = `1`.
* `parseHistoricalDate('218 BC')`, `formatHistoricalDate(-218)` → "218 BCE" (src/lib/history/dates.ts).
* OpenHistoricalMap (like ISO 8601) has a year 0, so `toOhmDate(-218)` = `-0217`. LPF years from WHG are converted the other way.
* Which year is used: a year you kept for the book → the last date written before the place → the latest date earlier in the chapter → the book's period (its historical start/end in Details) → "Historical date unknown" (you choose). A year you pick applies to the current chapter. Publication dates are never used.

## Place resolution

1. A place you already picked for that name in this book (remembered in `placeChoices`).
2. The local cache (`placeCache`, key `name|century|provider`, 30 days). Provider errors are never cached.
3. The provider — for WHG, the name plus the other place names on the page, in one batched request.
4. `assessCandidates` applies WHG's documented auto-confirm rule (spelling evidence + no tying rival), then context: the date rules out places that didn't exist yet; nearby places settle a region; on Wikidata only, a vastly better-known place can win. Otherwise the reader sees **"Which …?"**.

States: HIGH "Likely match", MEDIUM "Possible match", LOW, AMBIGUOUS "Multiple possible locations", UNRESOLVED "Location not confidently identified". No percentages are shown.

"Historical context" (e.g. Rome, 218 BCE → Roman Republic) comes only from Wikidata "country" statements that carry start/end dates — otherwise nothing is shown.

## Adding another map provider

Implement `HistoricalMapProvider` (`embedUrl(view, year, opts)`, `fullMapUrl`, `attribution`, `layers`) in `src/lib/history/mapProviders.ts` and add it to `MAP_PROVIDERS`. The panel only uses that interface.

## Adding another place source

Implement `PlaceProvider` (`available`, `search(queries[])`, optional `get`) returning `PlaceCandidate`s and add it to `PLACE_PROVIDERS` in priority order.

## Limitations

* The OpenHistoricalMap embed can't draw our own markers, so "Map places in this chapter" frames the map around all the places and lists them; tap one to go to it.
* The embed can't tell us where you've panned; changing the year keeps your view by sending only the date.
* WHG needs Shelf's server (for the token). GitHub Pages alone uses Wikidata.

## Tests

`npx vitest run src/lib/history server/historical.test.ts` — dates/BCE, place detection, date context, ambiguity, context-based disambiguation, caching, outages, batching, token handling, 451/429 handling, URL building.
