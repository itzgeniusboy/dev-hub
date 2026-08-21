import fs from "fs"
import os from "os"
import path from "path"

export const API_PROVIDERS = ["groq", "openrouter", "deepseek", "gemini", "google", "cerebras", "openai"] as const
export type ApiProvider = (typeof API_PROVIDERS)[number]
export type ApiKeyStatus = "active" | "rate_limited" | "invalid" | "suspended" | "unknown"

export interface ApiKeyEntry {
  key: string
  label: string
  added: string
  status: ApiKeyStatus
  failures: number
  suspendedUntil?: string
  lastChecked?: string
}

export interface ProviderUsage {
  todayRequests: number
  todayInputTokens: number
  todayOutputTokens: number
  lastUsed?: string
}

export interface ApiVaultData {
  providers: Record<string, ApiKeyEntry[]>
  usage: Record<string, ProviderUsage>
  autoRotate: boolean
  fallbackToLocal: boolean
}

const home = () => process.env.HOME || os.homedir()
export const apiVaultPath = () => path.join(home(), ".nexus", "api-vault.json")
export const apiUsagePath = () => path.join(home(), ".nexus", "api-usage.json")

function emptyVault(): ApiVaultData {
  return { providers: {}, usage: {}, autoRotate: true, fallbackToLocal: true }
}

function parseObject(source: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(source)
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function normalizeEntry(value: unknown): ApiKeyEntry | undefined {
  if (!value || typeof value !== "object") return undefined
  const item = value as Record<string, unknown>
  if (typeof item.key !== "string" || !item.key.trim()) return undefined
  const status = item.status
  const validStatus: ApiKeyStatus = status === "active" || status === "rate_limited" || status === "invalid" || status === "suspended" ? status : "unknown"
  return {
    key: item.key.trim(),
    label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : "default",
    added: typeof item.added === "string" ? item.added : new Date().toISOString().slice(0, 10),
    status: validStatus,
    failures: typeof item.failures === "number" && Number.isFinite(item.failures) ? item.failures : 0,
    ...(typeof item.suspendedUntil === "string" ? { suspendedUntil: item.suspendedUntil } : {}),
    ...(typeof item.lastChecked === "string" ? { lastChecked: item.lastChecked } : {}),
  }
}

function normalizeVault(value: Record<string, unknown>): ApiVaultData {
  const providers: Record<string, ApiKeyEntry[]> = {}
  const rawProviders = value.providers && typeof value.providers === "object" ? (value.providers as Record<string, unknown>) : {}
  for (const [provider, entries] of Object.entries(rawProviders)) {
    if (!Array.isArray(entries)) continue
    providers[provider.toLowerCase()] = entries.map(normalizeEntry).filter((entry): entry is ApiKeyEntry => Boolean(entry))
  }
  const usage: Record<string, ProviderUsage> = {}
  const rawUsage = value.usage && typeof value.usage === "object" ? (value.usage as Record<string, unknown>) : {}
  for (const [provider, raw] of Object.entries(rawUsage)) {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
    usage[provider.toLowerCase()] = {
      todayRequests: typeof item.todayRequests === "number" ? item.todayRequests : typeof item.today_requests === "number" ? item.today_requests : 0,
      todayInputTokens: typeof item.todayInputTokens === "number" ? item.todayInputTokens : 0,
      todayOutputTokens: typeof item.todayOutputTokens === "number" ? item.todayOutputTokens : 0,
      ...(typeof item.lastUsed === "string" ? { lastUsed: item.lastUsed } : {}),
    }
  }
  return {
    providers,
    usage,
    autoRotate: value.autoRotate !== false,
    fallbackToLocal: value.fallbackToLocal !== false,
  }
}

export function loadApiVault(): ApiVaultData {
  const file = apiVaultPath()
  if (!fs.existsSync(file)) return emptyVault()
  return normalizeVault(parseObject(fs.readFileSync(file, "utf8")))
}

export function saveApiVault(vault: ApiVaultData): void {
  const file = apiVaultPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(vault, null, 2)}\n`, { mode: 0o600 })
  try {
    fs.chmodSync(file, 0o600)
  } catch {
    // Termux filesystems may not implement chmod; the file is still private by default.
  }
  saveUsage(vault.usage)
}

export function saveUsage(usage: Record<string, ProviderUsage>): void {
  const file = apiUsagePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(usage, null, 2)}\n`, { mode: 0o600 })
  try {
    fs.chmodSync(file, 0o600)
  } catch {
    // Best effort only.
  }
}

export function normalizeProvider(provider: string): ApiProvider | undefined {
  const normalized = provider.trim().toLowerCase()
  if (normalized === "google") return "gemini"
  return (API_PROVIDERS as readonly string[]).includes(normalized) ? (normalized as ApiProvider) : undefined
}

export function maskApiKey(key: string): string {
  const value = key.trim()
  if (value.length <= 8) return "********"
  return `${value.slice(0, Math.min(7, value.length - 3))}***${value.slice(-3)}`
}

export function addApiKey(providerInput: string, key: string, label = "default"): ApiKeyEntry {
  const provider = normalizeProvider(providerInput)
  if (!provider) throw new Error(`Unsupported provider: ${providerInput}. Supported: ${API_PROVIDERS.join(", ")}`)
  if (!key.trim()) throw new Error("API key cannot be empty")
  const vault = loadApiVault()
  const entries = vault.providers[provider] ?? []
  const existing = entries.find((entry) => entry.key === key.trim())
  if (existing) {
    existing.label = label.trim() || existing.label
    existing.status = "active"
    existing.failures = 0
    saveApiVault(vault)
    return existing
  }
  const entry: ApiKeyEntry = {
    key: key.trim(),
    label: label.trim() || "default",
    added: new Date().toISOString().slice(0, 10),
    status: "active",
    failures: 0,
  }
  vault.providers[provider] = [...entries, entry]
  saveApiVault(vault)
  return entry
}

export function removeApiKey(providerInput: string, index: number): ApiKeyEntry {
  const provider = normalizeProvider(providerInput)
  if (!provider) throw new Error(`Unsupported provider: ${providerInput}`)
  if (!Number.isInteger(index) || index < 1) throw new Error("Key index must be a positive number")
  const vault = loadApiVault()
  const entries = vault.providers[provider] ?? []
  const removed = entries[index - 1]
  if (!removed) throw new Error(`No ${provider} key exists at index ${index}`)
  vault.providers[provider] = entries.filter((_, position) => position !== index - 1)
  if (vault.providers[provider].length === 0) delete vault.providers[provider]
  saveApiVault(vault)
  return removed
}

export function updateApiKeyStatus(providerInput: string, key: string, status: ApiKeyStatus, error?: unknown): void {
  const provider = normalizeProvider(providerInput)
  if (!provider) return
  const vault = loadApiVault()
  const entry = (vault.providers[provider] ?? []).find((candidate) => candidate.key === key)
  if (!entry) return
  entry.status = status
  entry.lastChecked = new Date().toISOString()
  if (status === "active") {
    entry.failures = 0
    delete entry.suspendedUntil
  } else if (status === "rate_limited" || status === "invalid") {
    entry.failures += 1
    if (entry.failures >= 3) {
      entry.status = "suspended"
      entry.suspendedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }
  }
  void error
  saveApiVault(vault)
}

export function recordApiUsage(providerInput: string, inputTokens: number, outputTokens: number): void {
  const provider = normalizeProvider(providerInput) ?? providerInput.toLowerCase()
  const vault = loadApiVault()
  const usage = vault.usage[provider] ?? { todayRequests: 0, todayInputTokens: 0, todayOutputTokens: 0 }
  usage.todayRequests += 1
  usage.todayInputTokens += Math.max(0, Math.round(inputTokens))
  usage.todayOutputTokens += Math.max(0, Math.round(outputTokens))
  usage.lastUsed = new Date().toISOString()
  vault.usage[provider] = usage
  saveApiVault(vault)
}

export function availableApiKeys(providerInput: string): ApiKeyEntry[] {
  const provider = normalizeProvider(providerInput)
  if (!provider) return []
  const now = Date.now()
  const vault = loadApiVault()
  return (vault.providers[provider] ?? []).filter((entry) => {
    if (entry.status !== "suspended") return true
    return !entry.suspendedUntil || Date.parse(entry.suspendedUntil) <= now
  })
}

export function apiVaultRows(): Array<{ provider: string; index: number; label: string; key: string; status: ApiKeyStatus; usage: ProviderUsage }> {
  const vault = loadApiVault()
  return Object.entries(vault.providers).flatMap(([provider, entries]) =>
    entries.map((entry, index) => ({ provider, index: index + 1, label: entry.label, key: maskApiKey(entry.key), status: entry.status, usage: vault.usage[provider] ?? { todayRequests: 0, todayInputTokens: 0, todayOutputTokens: 0 } })),
  )
}

export function apiVaultKeyEntries(): Array<{ provider: string; entry: ApiKeyEntry }> {
  const vault = loadApiVault()
  return Object.entries(vault.providers).flatMap(([provider, entries]) => entries.map((entry) => ({ provider, entry })))
}

export function setAutoRotation(enabled: boolean): void {
  const vault = loadApiVault()
  vault.autoRotate = enabled
  saveApiVault(vault)
}

export function getApiVaultStatus(): Pick<ApiVaultData, "autoRotate" | "fallbackToLocal"> {
  const vault = loadApiVault()
  return { autoRotate: vault.autoRotate, fallbackToLocal: vault.fallbackToLocal }
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function apiVaultKeyPath(): string {
  return apiVaultPath()
}

export function apiVaultHasKeys(providerInput?: string): boolean {
  if (providerInput) return availableApiKeys(providerInput).length > 0
  return apiVaultKeyEntries().length > 0
}

export function resetApiVaultForTests(): void {
  const file = apiVaultPath()
  if (fs.existsSync(file)) fs.unlinkSync(file)
  const usage = apiUsagePath()
  if (fs.existsSync(usage)) fs.unlinkSync(usage)
}

export { emptyVault }
