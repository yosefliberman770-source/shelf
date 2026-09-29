# Whole-book analysis (X-Ray and Book world)

```
EPUB (on this device)
 → chapters & paragraphs with their CFI positions       src/lib/book/text.ts
 → chunks of ~14,000 characters on paragraph edges      src/lib/book/chunk.ts
 → one AI request per chunk: characters, places, …      src/lib/book/extractPrompt.ts
   with evidence (paragraph, quote, stated/inferred)
 → names merged locally, no AI                           src/lib/book/resolve.ts
 → graph: entities, facts, relationships, events
 → places looked up in gazetteers (WHG / Wikidata)       src/lib/history/placeService.ts
 → character X-Ray written from the evidence, on demand  src/lib/book/synthesize.ts
```

The job runner (`src/lib/book/pipeline.ts`) saves every step in IndexedDB
(`bookText`, `bookChunks`, `bookJobs`, `bookGraph`, `bookXray`), so it can be
paused, cancelled, resumed, and it carries on after the app is closed. Each
chunk is identified by a hash of its text; an unchanged chunk is never sent
twice. The chapter you're reading is analysed first.

**Cost.** A typical novel is 40–70 requests, all through the AI manager, so
only free providers are used unless you've allowed paid AI. When free capacity
runs out the job waits (“it will continue automatically around 3:40”) instead
of spending money.

**Names.** “Mr. Darcy”, “Darcy” and “Fitzwilliam Darcy” merge; “Mr. Bennet”
and “Mrs. Bennet” don't; a bare name that could mean several people stays
separate and is marked “Might be …”. Ranks (Colonel, Captain…) go with
surnames, so “Colonel Fitzwilliam” isn't merged with “Fitzwilliam Darcy”.

**Spoilers.** Everything is filtered to the paragraph you're on (reader) or the
furthest point you've reached (Book world “Up to my page”). “Whole book” shows
everything, clearly labelled.

**Evidence.** Every fact records its chapter, paragraph and CFI, and whether the
book states it, implies it, or it's uncertain. Tapping a fact opens the reader
at that paragraph with a “Back to where you were” button.

**Removing entries.** ✕ on any X-Ray row (or “Remove from X-Ray” on its card)
hides it for that book, even after re-analysis; removed entries can be
restored. “Turn off X-Ray for this book” hides the panel entirely.

**Ask AI** in the reader includes the most relevant passages from the book (up
to your position, found locally) and the facts gathered about the person you're
asking about, and labels general knowledge separately.

Tests: `npx vitest run src/lib/book`.
