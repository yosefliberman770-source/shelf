# AI providers

Shelf can use several AI services and picks one automatically for each request.
Everything is free by default: **paid AI is off and the monthly limit is $0**
until you change both in Settings → AI → Advanced.

## How a request is answered

```
feature → complete() → AIManager (src/ai/manager.ts)
            → remembered answer? (same question asked before) → done
            → route(task): providers in your order, a suitable model each
            → adapter (src/ai/providers/adapters.ts) → provider
            → limit / error? rest that provider, try the next one
            → nothing free left? stop and say so (never switches to paid)
```

* **Modes** — Maximum free (default), Best quality, Fastest, Manual.
* **Tasks** — each feature says what kind of job it is (definition, chapter
  summary, book analysis extraction, character X-Ray, …). Quick jobs go to the
  fastest free model, hard ones to the strongest. You can pin a job to a model
  under Routing.
* **Rate limits** — a provider that returns “too many requests” rests for a
  while (longer each time); “quota used up” rests until the next day (UTC);
  a rejected key rests 12 hours. The app shows “Gemini limit reached — switched
  to Groq.” when it moves on.
* **Paid models** are skipped unless *Allow paid AI* is on **and** this month’s
  estimated spend is below your limit. OpenRouter models count as free only
  when both published prices are exactly $0. Gemini counts as paid if you tick
  “billing is on” for your key’s Google project.

## Providers

| Provider | Free tier (from its docs) | Where the key goes |
|---|---|---|
| Google Gemini | Free tier with daily limits (while billing is off) | Settings → AI (this device) |
| Groq | Free plan, per-model limits | Settings → AI |
| Mistral | Free mode with rate limits | Settings → AI |
| OpenRouter | `:free` models only | Settings → AI |
| Cerebras | Trial credits | Settings → AI |
| Hugging Face | Small monthly credits | Settings → AI |
| Cohere | Trial key, 1,000 calls/month | Settings → AI |
| Cloudflare Workers AI | 10,000 neurons/day | Server `.env` only (blocks browser calls) |
| NVIDIA NIM | Free prototyping | Server `.env` only (blocks browser calls) |
| Ollama | Local, free | Settings → AI → Ollama address |

Keys entered in the app are stored only in that browser (`localStorage`, kept
apart from the rest of the settings) and are never included in backups, logs
or anything Shelf uploads. Server keys live in `.env` (git-ignored); see
`.env.example`. Nothing is logged except provider, model, task, timing and
success — never keys or text.

## Usage

Settings → AI → Usage shows requests today/this month, tokens, estimated cost,
successes, failures and limit hits, plus a log of recent requests. Providers
don’t tell apps how much free allowance remains, so that isn’t shown.

## Testing

`npx vitest run src/ai` covers routing, free-only rules, fallback and
cooldowns with mocked providers. “Test connection” in Settings sends the
smallest possible request (a 5-token “ok”). Live providers can only be
verified with real keys.
