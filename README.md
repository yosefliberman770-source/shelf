# Shelf — a personal reading operating system

Shelf knows what you own, what you're reading, how much you've read, how fast you read, what you want to accomplish, what you've learned, and what you might explore next.

It combines a library, a reading tracker, a planner with real schedule mathematics, deep analytics, a personal knowledge graph and an optional AI assistant — all built on one shared data model.

```
DISCOVER → ADD → ORGANIZE → PLAN → READ → LOG → LEARN → ANALYZE → FORECAST → EXPLORE
```

## Quick start

Requires Node.js **22.18+** (the server runs TypeScript natively).

```bash
npm install
npm run dev        # app on http://localhost:5173, AI proxy on :8787
```

Production:

```bash
npm run build
npm start          # serves the built app and the AI proxy on http://127.0.0.1:8787
```

Set `PORT` / `HOST` to change the address. On first launch you can start empty or load a clearly-labelled **sample library** (removable from Settings → Data → Erase everything).

```bash
npm test           # engine, data layer and provider tests
npm run typecheck
```

## The eight sections

| Section | What it does |
|---|---|
| **🏠 Today** | Streak (with skip days), momentum vs. two weeks earlier, daily goal ring, reading challenge, active books with per-book daily targets, Log / Timer / Note / Quote / Pause, finish line, closest finishes (by reading *time*), goal forecast, up next, stale books, quote of the day, time budget. |
| **📚 Library** | One item object per book, in any number of nested folders and shelves. Default shelves + custom shelves, unlimited folder nesting with icons, colors, descriptions, tags, notes, goals and deadlines ("No deadline yet" is first-class). Cover / compact / list views, zoomable library map, combinable filters, sorting, bulk actions, drag-and-drop filing, smart collections, Goodreads import with preview. |
| **📖 Reading** | Active books, drag-and-drop NOW / NEXT / LATER / PAUSED / FINISHED queue, and a searchable journal (day / week / month / year). |
| **🧮 Plan** | Goals (daily → annual; pages, minutes, books, units, sessions), projects (books from any folder), plan simulator (A/B/C schedules compared visually, never applied until you press *Apply plan*), What-If Lab with ripple effects, library mathematics with complex weekly schedules, time budget, and an AI plain-language planner. |
| **📊 Insights** | Overview, books, habits (hour × weekday), progress, Reading Brain, forecast, Reading DNA, Hall of Fame and reading balance. Charts switch between bar / line / area / table and take date ranges. Progressive: nothing is shown until there's data to show. |
| **🧠 Knowledge** | Central notes & quotes database with filters and export, a knowledge library of subjects, concepts, people, places, events and periods, and an interactive, searchable, filterable knowledge graph. |
| **🧭 Explore** | Subject browser, connections, historical timeline (subject period vs. publication date), reading-territory map, rabbit-hole mode, discovery filters (library and Open Library), book comparison (no winners), reading paths → projects, gap finder, author universe. |
| **✨ AI** | Ask My Library, assistant, recommendations (5 modes), tutor (flashcards, multiple choice, short answer, essay, timeline, explain-it-back, Socratic), AI notebook. An **Ask AI** concierge on every screen adapts to where you are. |

## Architecture

```
src/
  db/          IndexedDB schema (Dexie), all writes (actions.ts), import/export, sample data
  engine/      Deterministic reading engine — pure functions, fully unit-tested
    dates.ts      local-timezone calendar math, eligible (non-excluded) days
    units.ts      measurement system: pages, chapters, minutes/hours, lessons, episodes, %, custom
    schedule.ts   weekly schedules → reading days, completion dates, required pace, deadline delta
    forecast.ts   item / folder / project / library forecasts
    streaks.ts    streaks with skip days, momentum
    stats.ts      aggregates for every chart
    goals.ts      goal progress, Reading DNA
    records.ts    personal records
    brain.ts      Reading Brain observations, each gated by minimum evidence
    future.ts     queue simulation, Future You, What-If scenarios, time budget
    query.ts      filters, sorting, smart collections, global search, NL question parser
  ai/          AI client, minimal-context builders, AI UI (panel, concierge, previews)
  components/  charts (inline SVG), knowledge graph (d3-force), sheets, library views
  pages/       one file per section
server/        AI proxy with a provider abstraction + static file server
```

### Data model

A **User**'s library is stored locally in the browser (IndexedDB) — a structured database with indexed tables for items, authors, folders, shelves, tags, reading instances, reading sessions, notes/quotes, goals, projects, plans, smart collections, concepts (subjects, people, places, events, periods), knowledge links, AI records, the active timer and settings.

* A **book is one object**. Folders, shelves, projects and collections reference it by id, so progress is always shared.
* **Progress lives on a ReadingInstance.** Rereading creates a new instance — earlier ratings, reviews, notes and sessions are never overwritten.
* **Sessions are the source of truth** for statistics. Logging supports `+N`, "I'm now at page X" and ranges ("pages 120–145"), with Undo.
* **Units are normalized**: hours are stored as minutes; aggregates use page-equivalents only when an honest conversion exists (pages, or a known print page count). Lessons, episodes etc. are reported separately rather than invented.
* **Historical coverage** (`histStart`/`histEnd`) is separate from **publication year**.
* The **timer is persisted**, so a closed tab never loses a session.

### The deterministic engine is authoritative

Everything numeric — progress, remaining units, current/average/required pace, reading days, completion dates, deadline status in *reading days*, streaks, goals, forecasts, what-if scenarios — is computed by `src/engine`. Non-reading weekdays and excluded dates (holidays, vacations) are removed from every pace and date calculation. Items, folders and projects with **no deadline yet** are never overdue but still get an estimated finish; adding a deadline immediately produces required pace and ahead/behind.

### AI layer

* **Provider-independent**: `server/providers.ts` implements Anthropic (official SDK, default `claude-opus-5`), OpenAI, Google Gemini and any OpenAI-compatible server (e.g. Ollama, LM Studio) behind one interface.
* **Keys never reach the browser.** Configure them with environment variables (or a `.env` file — see `.env.example`) (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `COMPATIBLE_BASE_URL`, `COMPATIBLE_API_KEY`) or from Settings → AI, which stores them server-side in `server/.data/ai-config.json` (mode 600). Set `SHELF_ALLOW_KEY_CONFIG=false` to disable the latter.
* **Minimal context**: each feature sends only what it needs; privacy toggles control notes, reviews, ratings and reading history; every AI screen shows exactly what will be shared.
* **AI proposes, you confirm.** AI never edits progress, dates, ratings, metadata, goals or statistics. Structured AI output (library queries, plans, paths, recommendations) is validated against real ids before use; results always come from the database.
* **Labelled and removable**: AI output carries an "AI-generated" badge, AI graph edges are dashed, and Settings/AI notebook can delete all AI data.
* **Graceful failure**: if the AI or server is unavailable, the rest of Shelf keeps working.
* For Claude Opus 5 / Fable 5.1 requests the server enables Anthropic's server-side refusal fallback (`fallbacks: "default"`).

### Notifications

Daily reminder, goal reminder, behind-schedule, finish line, completion, weekly summary and project deadline reminders are computed locally and delivered through the browser Notification API while Shelf is open; each is independently configurable.

### Data portability

Full JSON backup & restore (replace or merge), CSV exports (library, reading history, readings/ratings, notes, quotes), a multi-sheet spreadsheet export, raw JSON export, Goodreads import, and **Erase everything** with typed confirmation.
