// Server-side AI configuration. Keys come from environment variables or from
// a local config file written through the settings screen. Keys are never
// returned to the client — only whether a provider is configured.
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDERS, type ProviderCredentials } from './providers.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SHELF_DATA_DIR ?? path.join(here, '.data');
const FILE = path.join(DATA_DIR, 'ai-config.json');

const ENV: Record<string, { key?: string; base?: string }> = {
  anthropic: { key: 'ANTHROPIC_API_KEY', base: 'ANTHROPIC_BASE_URL' },
  openai: { key: 'OPENAI_API_KEY', base: 'OPENAI_BASE_URL' },
  gemini: { key: 'GEMINI_API_KEY' },
  compatible: { key: 'COMPATIBLE_API_KEY', base: 'COMPATIBLE_BASE_URL' },
  cloudflare: { key: 'CLOUDFLARE_API_KEY' },
  nvidia: { key: 'NVIDIA_API_KEY' },
};

type Stored = Record<string, ProviderCredentials & { models?: string[] }>;

async function readStored(): Promise<Stored> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8')) as Stored;
  } catch {
    return {};
  }
}

export async function credentialsFor(id: string): Promise<ProviderCredentials & { models?: string[] }> {
  const stored = (await readStored())[id] ?? {};
  const env = ENV[id] ?? {};
  return {
    apiKey: (env.key && process.env[env.key]) || stored.apiKey,
    baseUrl: (env.base && process.env[env.base]) || stored.baseUrl,
    models: stored.models,
  };
}

export function keyConfigAllowed(): boolean {
  return process.env.SHELF_ALLOW_KEY_CONFIG !== 'false';
}

export async function saveCredentials(id: string, patch: { apiKey?: string | null; baseUrl?: string | null; models?: string[] }): Promise<void> {
  if (!PROVIDERS.some((p) => p.id === id)) throw new Error('Unknown provider');
  const all = await readStored();
  const cur = { ...all[id] };
  if (patch.apiKey === null) delete cur.apiKey;
  else if (patch.apiKey) cur.apiKey = patch.apiKey.trim();
  if (patch.baseUrl === null) delete cur.baseUrl;
  else if (patch.baseUrl) cur.baseUrl = patch.baseUrl.trim();
  if (patch.models) cur.models = patch.models.map((m) => m.trim()).filter(Boolean);
  all[id] = cur;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(all, null, 2), { mode: 0o600 });
  await chmod(FILE, 0o600).catch(() => {});
}

export async function providerStatus() {
  const out = [];
  for (const p of PROVIDERS) {
    const c = await credentialsFor(p.id);
    const env = ENV[p.id] ?? {};
    out.push({
      id: p.id,
      name: p.name,
      models: [...new Set([...p.models, ...(c.models ?? [])])],
      defaultModel: p.defaultModel || c.models?.[0] || '',
      configured: p.needsBaseUrl ? !!c.baseUrl : !!c.apiKey,
      hasKey: !!c.apiKey,
      baseUrl: c.baseUrl ? c.baseUrl.replace(/\/\/[^@/]*@/, '//***@') : undefined,
      fromEnv: !!(env.key && process.env[env.key]),
      needsBaseUrl: !!p.needsBaseUrl,
      keyOptional: !!p.keyOptional,
    });
  }
  return out;
}
