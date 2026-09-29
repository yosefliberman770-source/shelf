// Every AI provider Shelf can use, with its real API details, official
// "get a key" page, and what's known about its free tier. Checked against each
// provider's own documentation (see docsUrl); free tiers change, so the
// Settings screen always says what the tier is based on.

export type ProviderId = 'gemini' | 'groq' | 'mistral' | 'openrouter' | 'cerebras' | 'cloudflare' | 'nvidia' | 'huggingface' | 'cohere' | 'ollama';

/** How a provider can be reached from the app. */
export type Transport =
  /** Directly from the browser/phone (the provider allows it); the key is stored on this device. */
  | 'device'
  /** Only through Shelf's server (the provider blocks browser calls); the key lives in the server's .env. */
  | 'server'
  /** A program on your own computer. */
  | 'local';

export type Tier = 'free' | 'paid' | 'unknown' | 'local';

export interface ModelInfo {
  id: string;
  label?: string;
  tier: Tier;
  /** 1 (small/weak) … 5 (strongest). Used by "Best quality". Editable in Settings. */
  quality: number;
  /** 1 (slow) … 5 (fastest). Used by "Fastest". */
  speed: number;
  context?: number;
  /** USD per million tokens, when the provider publishes it (OpenRouter does). */
  pricePerMTokIn?: number;
  pricePerMTokOut?: number;
}

export interface ProviderDef {
  id: ProviderId;
  name: string;
  transport: Transport;
  /** Official page where you create an API key. */
  keyUrl: string;
  docsUrl: string;
  /** What the free tier is, in plain words (from the provider's docs). */
  freeNote: string;
  /** Default tier of this provider's models (individual models can differ). */
  tier: Tier;
  keyOptional?: boolean;
  /** What this provider's keys start with, to catch a key pasted into the wrong place. */
  keyPrefix?: string;
  /** Cloudflare needs an account id as well as a token. */
  needsAccountId?: boolean;
  /** API base (OpenAI-compatible providers). */
  baseUrl: string;
  /** Wire format. */
  api: 'openai' | 'gemini' | 'cohere';
  /** Models to offer before the list is fetched (and if listing isn't possible). */
  models: ModelInfo[];
  /** Environment variable names on the server (for server transport). */
  env: string[];
}

export const PROVIDER_DEFS: ProviderDef[] = [
  {
    id: 'gemini', name: 'Google Gemini', transport: 'device', api: 'gemini',
    keyUrl: 'https://aistudio.google.com/app/apikey', docsUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
    freeNote: 'Free tier with daily limits, as long as billing is not enabled on the Google project behind your key.',
    tier: 'free', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', env: ['GEMINI_API_KEY'],
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'free', quality: 4, speed: 4 },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', tier: 'free', quality: 2, speed: 5 },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'free', quality: 5, speed: 2 },
    ],
  },
  {
    id: 'groq', keyPrefix: 'gsk_', name: 'Groq', transport: 'device', api: 'openai',
    keyUrl: 'https://console.groq.com/keys', docsUrl: 'https://console.groq.com/docs/rate-limits',
    freeNote: 'Free plan with per-model limits (requests and tokens per minute/day).',
    tier: 'free', baseUrl: 'https://api.groq.com/openai/v1', env: ['GROQ_API_KEY'],
    models: [
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', tier: 'free', quality: 4, speed: 4 },
      { id: 'llama-3.1-8b-instant', tier: 'free', quality: 2, speed: 5 },
      { id: 'llama-3.3-70b-versatile', tier: 'free', quality: 3, speed: 4 },
    ],
  },
  {
    id: 'mistral', name: 'Mistral', transport: 'device', api: 'openai',
    keyUrl: 'https://console.mistral.ai/api-keys', docsUrl: 'https://docs.mistral.ai/getting-started/quickstart',
    freeNote: 'Free mode in Mistral AI Studio, with rate limits.',
    tier: 'free', baseUrl: 'https://api.mistral.ai/v1', env: ['MISTRAL_API_KEY'],
    models: [
      { id: 'mistral-small-latest', tier: 'free', quality: 3, speed: 4 },
      { id: 'mistral-medium-latest', tier: 'free', quality: 4, speed: 3 },
      { id: 'mistral-large-latest', tier: 'free', quality: 4, speed: 2 },
    ],
  },
  {
    id: 'openrouter', keyPrefix: 'sk-or-', name: 'OpenRouter', transport: 'device', api: 'openai',
    keyUrl: 'https://openrouter.ai/settings/keys', docsUrl: 'https://openrouter.ai/docs/api-reference/limits',
    freeNote: 'Models ending in “:free” cost nothing (with a daily request cap). Every other model is paid.',
    tier: 'unknown', baseUrl: 'https://openrouter.ai/api/v1', env: ['OPENROUTER_API_KEY'],
    models: [
      { id: 'openrouter/free', label: 'Any free model (OpenRouter picks)', tier: 'free', quality: 3, speed: 3 },
    ],
  },
  {
    id: 'cerebras', keyPrefix: 'csk-', name: 'Cerebras', transport: 'device', api: 'openai',
    keyUrl: 'https://cloud.cerebras.ai/', docsUrl: 'https://inference-docs.cerebras.ai/support/rate-limits',
    freeNote: 'Free trial credits ($5, 30 days) after adding a payment method; no charge unless you buy more credits.',
    tier: 'free', baseUrl: 'https://api.cerebras.ai/v1', env: ['CEREBRAS_API_KEY'],
    models: [
      { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', tier: 'free', quality: 4, speed: 5 },
    ],
  },
  {
    id: 'cloudflare', name: 'Cloudflare Workers AI', transport: 'server', api: 'openai', needsAccountId: true,
    keyUrl: 'https://dash.cloudflare.com/profile/api-tokens', docsUrl: 'https://developers.cloudflare.com/workers-ai/platform/pricing/',
    freeNote: '10,000 Neurons per day free. On the free Workers plan, requests beyond that fail instead of costing money.',
    tier: 'free', baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1', env: ['CLOUDFLARE_API_KEY', 'CLOUDFLARE_ACCOUNT_ID'],
    models: [
      { id: '@cf/meta/llama-3.1-8b-instruct', tier: 'free', quality: 2, speed: 4 },
      { id: '@cf/openai/gpt-oss-120b', label: 'GPT-OSS 120B', tier: 'free', quality: 4, speed: 3 },
    ],
  },
  {
    id: 'nvidia', keyPrefix: 'nvapi-', name: 'NVIDIA NIM', transport: 'server', api: 'openai',
    keyUrl: 'https://build.nvidia.com/settings/api-keys', docsUrl: 'https://docs.api.nvidia.com/nim/reference/llm-apis',
    freeNote: 'Free hosted endpoints for development and prototyping on build.nvidia.com.',
    tier: 'free', baseUrl: 'https://integrate.api.nvidia.com/v1', env: ['NVIDIA_API_KEY'],
    models: [
      { id: 'meta/llama-3.3-70b-instruct', tier: 'free', quality: 3, speed: 3 },
    ],
  },
  {
    id: 'huggingface', keyPrefix: 'hf_', name: 'Hugging Face', transport: 'device', api: 'openai',
    keyUrl: 'https://huggingface.co/settings/tokens', docsUrl: 'https://huggingface.co/docs/inference-providers/pricing',
    freeNote: 'Small monthly free credits ($0.10 for free accounts). Going beyond requires buying credits.',
    tier: 'free', baseUrl: 'https://router.huggingface.co/v1', env: ['HUGGINGFACE_API_KEY'],
    models: [
      { id: 'meta-llama/Llama-3.1-8B-Instruct', tier: 'free', quality: 2, speed: 3 },
    ],
  },
  {
    id: 'cohere', name: 'Cohere', transport: 'device', api: 'cohere',
    keyUrl: 'https://dashboard.cohere.com/api-keys', docsUrl: 'https://docs.cohere.com/docs/rate-limits',
    freeNote: 'Trial keys are free, limited to 1,000 API calls a month. Production keys are paid.',
    tier: 'free', baseUrl: 'https://api.cohere.com/v2', env: ['COHERE_API_KEY'],
    models: [
      { id: 'command-r7b-12-2024', label: 'Command R7B', tier: 'free', quality: 2, speed: 4 },
      { id: 'command-a-03-2025', label: 'Command A', tier: 'free', quality: 4, speed: 2 },
    ],
  },
  {
    id: 'ollama', name: 'Ollama (on your computer)', transport: 'local', api: 'openai', keyOptional: true,
    keyUrl: 'https://ollama.com/download', docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
    freeNote: 'Runs on your own computer — no usage limits or costs. Speed and quality depend on your machine.',
    tier: 'local', baseUrl: 'http://localhost:11434/v1', env: [],
    models: [],
  },
];

export const providerDef = (id: string) => PROVIDER_DEFS.find((p) => p.id === id);

/** Kinds of work, so simple jobs go to fast free models and hard ones to stronger ones. */
export type AITask =
  | 'definition' | 'sentence' | 'paragraph' | 'page-summary' | 'chapter-summary' | 'book-summary'
  | 'character' | 'history' | 'compare' | 'book-question' | 'general' | 'writing' | 'translation'
  | 'brainstorm' | 'reasoning' | 'extraction' | 'classification' | 'resolution' | 'synthesis' | 'recommendation';

export const TASKS: { id: AITask; label: string; weight: 'light' | 'standard' | 'heavy' }[] = [
  { id: 'definition', label: 'Word definition', weight: 'light' },
  { id: 'sentence', label: 'Sentence explanation', weight: 'light' },
  { id: 'paragraph', label: 'Paragraph explanation', weight: 'standard' },
  { id: 'page-summary', label: 'Page summary', weight: 'light' },
  { id: 'chapter-summary', label: 'Chapter summary', weight: 'standard' },
  { id: 'book-summary', label: 'Book summary', weight: 'heavy' },
  { id: 'character', label: 'Character analysis', weight: 'standard' },
  { id: 'history', label: 'Historical analysis', weight: 'standard' },
  { id: 'compare', label: 'Compare passages', weight: 'heavy' },
  { id: 'book-question', label: 'Ask about current book', weight: 'standard' },
  { id: 'general', label: 'General AI question', weight: 'standard' },
  { id: 'writing', label: 'Writing assistance', weight: 'standard' },
  { id: 'translation', label: 'Translation', weight: 'light' },
  { id: 'brainstorm', label: 'Brainstorming', weight: 'standard' },
  { id: 'reasoning', label: 'Complex reasoning', weight: 'heavy' },
  { id: 'extraction', label: 'Book analysis: extraction', weight: 'light' },
  { id: 'classification', label: 'Simple classification', weight: 'light' },
  { id: 'resolution', label: 'Book analysis: merging names', weight: 'standard' },
  { id: 'synthesis', label: 'Book analysis: character X-Rays', weight: 'heavy' },
  { id: 'recommendation', label: 'Reading recommendations', weight: 'standard' },
];

/** Which provider a key most likely belongs to, from its prefix. */
export function keyOwner(key: string): ProviderDef | undefined {
  const k = key.trim();
  return PROVIDER_DEFS.find((d) => d.keyPrefix && k.startsWith(d.keyPrefix));
}

/** A plain warning if a key clearly isn't for this provider, else undefined. */
export function keyMismatch(id: ProviderId, key: string, onlyCertain = false): string | undefined {
  const def = providerDef(id);
  const k = key.trim();
  if (!def || !k) return undefined;
  // A key that clearly belongs to another provider.
  const other = keyOwner(k);
  if (other && other.id !== id) return `This looks like a ${other.name} key. Paste it under ${other.name} instead.${def.keyPrefix ? ` ${def.name} keys start with “${def.keyPrefix}”.` : ''}`;
  if (!def.keyPrefix || k.startsWith(def.keyPrefix)) return undefined;
  return onlyCertain ? undefined : `${def.name} keys usually start with “${def.keyPrefix}”. Check you copied the right key.`;
}
