export type RotatingKeys = Record<string, string[] | undefined>

import { getCachedKeyStatus } from "../api/ApiVault"

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
    const allValues = keyValues(this.keys, providerID).filter((value) => typeof value === "string" && value.trim().length > 0)
    if (allValues.length === 0) return undefined

    // Determine how many healthy keys exist to decide if we can afford to skip rate-limited ones
    const now = Date.now()
    // First, filter out invalid/suspended completely
    const eligibleValues = allValues.filter(val => {
      const status = getCachedKeyStatus(val)
      if (!status) return true
      if (status.status === "invalid") return false
      if (status.status === "suspended" && status.suspendedUntil && Date.parse(status.suspendedUntil) > now) return false
      return true
    })
    
    if (eligibleValues.length === 0) return undefined
    
    const healthyCount = eligibleValues.filter(val => {
      const status = getCachedKeyStatus(val)
      return !status || status.status !== "rate_limited"
    }).length

    let position = this.positions.get(providerID) ?? 0
    let attempts = 0
    let selectedValue: string | undefined = undefined

    // Determine target pool: if healthyCount > 0, we only pick from healthy keys.
    // If healthyCount === 0, we pick from all eligible (which means they are all rate_limited).
    const targetPool = healthyCount > 0 
      ? eligibleValues.filter(val => {
          const status = getCachedKeyStatus(val)
          return !status || status.status !== "rate_limited"
        })
      : eligibleValues

    // A simpler approach: iterate over allValues starting from position, and pick the first one that is in targetPool.
    while (attempts < allValues.length) {
      const index = position % allValues.length
      const value = allValues[index]
      position++
      attempts++
      
      if (targetPool.includes(value)) {
        selectedValue = value
        // Update the position in the map to the index *after* the one we just picked,
        // so the next call starts searching from the subsequent key.
        this.positions.set(providerID, (index + 1) % allValues.length)
        break
      }
    }

    if (selectedValue !== undefined) {
      return selectedValue
    }

    return undefined
  }

  has(providerID: string): boolean {
    return this.enabled && keyValues(this.keys, providerID).some((value) => value.trim().length > 0)
  }

  /** Number of distinct non-empty keys available for this provider's rotation cycle. */
  keyCount(providerID: string): number {
    if (!this.enabled) return 0
    return keyValues(this.keys, providerID).filter((value) => typeof value === "string" && value.trim().length > 0).length
  }

  static isRateLimited(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return /rate.?limit|too many requests|quota exceeded|freeusagelimit/i.test(message)
  }

  /** Provider failures that should advance to another configured engine. */
  static isFallbackable(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return /rate.?limit|too many requests|quota exceeded|freeusagelimit|(?:model|resource).*(?:not found|does not exist|do not have access)|(?:not found|does not exist).*(?:model|resource)|invalid[_ -]?api[_ -]?key|api[_ -]?key.*invalid|(?:invalid|missing).*(?:authentication|credentials)|unauthorized|forbidden|missing authentication header|(?:status|http|error)?\s*[:(]?\s*(?:401|403|404|429)\b|unexpected server error|failed to fetch/i.test(
      message,
    )
  }
}

export const PROVIDER_FALLBACK_ORDER = ["groq", "openrouter", "google", "ollama", "opencode", "openai"] as const

/** Canonical low-cost/free model order used by setup, default selection, and model tests. */
export const PREFERRED_MODELS = {
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  openrouter: [
    "meta-llama/llama-3.1-8b-instruct:free",
    "google/gemma-2b-it:free",
    "mistralai/mistral-7b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
  ],
  google: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"],
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
  return false // We want opencode to be available as a fallback
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
