# Shelfmark

Track your books, seforim, shiurim, audiobooks, podcasts and courses, and see detailed stats about how you read.

Shelfmark combines three things:

- **Shelfmark 1.0:** nested folders and libraries, Torah templates (Shas, Tanach, Chumash, Mishnah Berurah), goal dates with a pace forecast, a reading timer, streaks that can skip Shabbos, and a plan simulator.
- **Goodreads:** shelves (Want to read, Currently reading, Read, Didn't finish), half-star ratings, reviews, re-reads, a yearly reading challenge, a Year in Books summary, book covers, and import of your Goodreads library.
- **Bookmory:** a reading calendar, notes and quotes collected by book and page, reading speed, and a daily reading-time goal.

Everything stays on your device. There's no account and no server.

## What's in each tab

| Tab | What it does |
|---|---|
| **Today** | Streak, momentum, daily time goal, what you're reading, finish line, daily targets, reading challenge, quote of the day, goal forecasts, things that have gone quiet |
| **Library** | **Shelves** view (filter, search, sort, list or cover grid), **Folders** (nested libraries with goals and forecasts), **Map** (the whole tree at a glance) |
| **Journal** | **Calendar** of what you read each day with monthly totals, and **Notes & quotes** (searchable, filter by book) |
| **Stats** | **Overview:** heatmap, month by month (time, pages, sessions, days, finishes), days active per week, where your time goes, personal records, what you covered. **Books:** reading challenge, Year in Books, finished and pages per month or year, ratings, length, kinds, formats, top authors and genres, publication decades, highlights, cover wall, library and TBR outlook. **Habits:** pages per hour, reading patterns, when you read (weekday by hour), average time by weekday, pages over time, speed by book and by month. **Progress:** progress-over-time chart, goals, set-aside and did-not-finish items, "Future you", and a year-by-year life log |
| **Plan** | Compare up to three weekly schedules and see when each one finishes a book, folder or shelf |

## Moving your data over

- **From Shelfmark 1.0:** if this version is hosted at the same address as your old one, your data carries over automatically. Otherwise, in the old app go to **Settings** > **Export backup**, then in this app go to **Settings** > **Restore from backup**. Old session notes move into the Journal.
- **From Goodreads:** on goodreads.com, go to **My Books** > **Import and export** > **Export library**. Then in Shelfmark, go to **Settings** > **Import Goodreads library** and pick the `.csv` file. Your ratings, reviews, dates read, re-reads and shelves (as tags) come across. Books already in your library are skipped.

## Putting it on your phone (free)

This repository *is* the website, so there's nothing to build.

1. On GitHub, open this repository's **Settings** > **Pages**. Under **Branch**, pick the branch and `/ (root)`, then tap **Save**.
2. After a minute or two the app is at `https://YOUR-USERNAME.github.io/shelf/`.
3. Open that link in Chrome on Android, then tap **⋮** > **Install app**. On iPhone, open it in Safari and tap **Share** > **Add to Home Screen**.

It works offline, and covers you've already seen are kept for offline use. To publish an update, push the new files and change `VERSION` in `sw.js`.

For Google Play, follow the PWABuilder steps in the original Shelfmark `START-HERE.txt`, using this site's address. Update the privacy policy URL to `https://YOUR-USERNAME.github.io/shelf/privacy.html` and put your email address in `privacy.html`.

## Developing

It's plain HTML, CSS and JavaScript with no build step:

```
index.html        page shell and tab bar
app.css           all styles (light and dark themes)
js/core.js        helpers, data model, analytics, Goodreads parsing (no DOM; unit-tested)
js/store.js       saving and data changes
js/charts.js      SVG charts, stars, covers, tooltips
js/views.js       Today, Library, Journal
js/stats.js       Stats
js/plan.js        Plan simulator
js/sheets.js      pop-up sheets: add/edit, log, detail, notes, import/export, settings
js/app.js         event handling and startup
sw.js             offline support
```

```
npm start          # serve at http://localhost:8080
npm test           # unit tests for js/core.js
npm run smoke      # opens the app in headless Chromium with a year of sample data,
                   # visits every screen, and saves screenshots to tests/shots/
```
