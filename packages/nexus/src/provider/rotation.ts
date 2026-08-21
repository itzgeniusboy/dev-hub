export type RotatingKeys = Record<string, string[] | undefined>

/**
 * Selects configured credentials in a deterministic round-robin order.
 * The engine is intentionally in-memory; secrets remain in NEXUS config/auth storage.
 */
export class RotationEngine {
  private readonly positions = new Map<string, number>()

  constructor(
    private readonly keys: RotatingKeys = {},
    private readonly enabled = true,
  ) {}

  next(providerID: string): string | undefined {
    if (!this.enabled) return undefined
    const values = keyValues(this.keys, providerID).filter((value) => typeof value === "string" && value.trim().length > 0)
    if (values.length === 0) return undefined
    const position = this.positions.get(providerID) ?? 0
    const value = values[position % values.length]
    this.positions.set(providerID, (position + 1) % values.length)
    return value
  }

  has(providerID: string): boolean {
    return this.enabled && keyValues(this.keys, providerID).some((value) => value.trim().length > 0)
  }

  static isRateLimited(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return /rate.?limit|too many requests|quota exceeded|freeusagelimit/i.test(message)
  }
}

export const PROVIDER_FALLBACK_ORDER = ["groq", "openrouter", "google", "ollama", "openai", "opencode"] as const

/** Canonical low-cost/free model order used by setup, default selection, and model tests. */
export const PREFERRED_MODELS = {
  groq: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  openrouter: [
    "meta-llama/llama-3.1-8b-instruct:free",
    "google/gemma-2b-it:free",
    "mistralai/mistral-7b-instruct:free",
  ],
  google: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-8b"],
} as const

export type PreferredProvider = keyof typeof PREFERRED_MODELS

export function preferredModelForProvider(providerID: string, models: Record<string, unknown>): string | undefined {
  const preferred = PREFERRED_MODELS[providerID as PreferredProvider]
  if (preferred) {
    const catalogKeys = Object.keys(models)
    for (const id of preferred) {
      if (models[id] !== undefined) return id
      // Fallback: match catalog keys that start with the preferred ID or vice-versa
      const partialMatch = catalogKeys.find((k) => id.startsWith(k) || k.startsWith(id) || k.includes(id.split(":")[0]))
      if (partialMatch) return partialMatch
    }
  }
  return undefined
}

export function providerPriority(providerID: string): number {
  const index = PROVIDER_FALLBACK_ORDER.indexOf(providerID as (typeof PROVIDER_FALLBACK_ORDER)[number])
  return index === -1 ? PROVIDER_FALLBACK_ORDER.length : index
}

export function isDeprecatedFreeProvider(providerID: string): boolean {
  return providerID === "opencode" || providerID === "nexus"
}

export function modelWarning(providerID: string): string | undefined {
  if (!isDeprecatedFreeProvider(providerID)) return undefined
  return "OpenCode free model is rate-limited. Consider: ollama, groq, or openrouter."
}

function keyValues(apiKeys: RotatingKeys, providerID: string): string[] {
  if (providerID === "google") return apiKeys.google ?? apiKeys.gemini ?? []
  if (providerID === "gemini") return apiKeys.gemini ?? apiKeys.google ?? []
  return apiKeys[providerID] ?? []
}

export function configuredProviderKeys(apiKeys: RotatingKeys | undefined, providerID: string): string[] {
  return keyValues(apiKeys ?? {}, providerID).filter((value) => value.trim().length > 0)
}

export function normalizeProviderKeyName(key: string): string | undefined {
  const normalized = key.trim().toUpperCase()
  if (!normalized.endsWith("_API_KEY")) return undefined
  const provider = normalized.slice(0, -"_API_KEY".length).toLowerCase()
  if (!["groq", "openrouter", "gemini", "google", "openai"].includes(provider)) return undefined
  return provider === "gemini" ? "google" : provider
}

export function redactSecret(value: string): string {
  if (value.length <= 8) return "********"
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

export function providerFromEnvKey(key: string): string | undefined {
  return normalizeProviderKeyName(key)
}

export function modelForProvider(providerID: string, models: Record<string, unknown>): string | undefined {
  const ids = Object.keys(models)
  const preferred = preferredModelForProvider(providerID, models)
  if (preferred) return preferred
  if (providerID === "ollama") return ids.find((id) => /qwen2\.5-coder|llama3|phi3/i.test(id)) ?? ids[0]
  if (providerID === "groq") return ids.find((id) => /llama|mixtral/i.test(id)) ?? ids[0]
  if (providerID === "openrouter") return ids.find((id) => /free/i.test(id)) ?? ids[0]
  if (providerID === "google") return ids.find((id) => /gemini/i.test(id)) ?? ids[0]
  return ids[0]
}

export function fallbackProviders(configured: Record<string, unknown>, available: string[]): string[] {
  return available
    .filter((id) => configured[id] !== undefined || ["ollama", "groq", "openrouter", "google", "openai"].includes(id))
    .sort((a, b) => providerPriority(a) - providerPriority(b) || a.localeCompare(b))
}

export function isOllamaProvider(providerID: string): boolean {
  return providerID === "ollama"
}

export function ollamaBaseURL(): string {
  return "http://127.0.0.1:11434/v1"
}
