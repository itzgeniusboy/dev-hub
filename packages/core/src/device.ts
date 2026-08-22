import os from "node:os"

export type DeviceTier = "low" | "medium" | "high"

export type DeviceResourceConfig = {
  tier: DeviceTier
  totalRamGB: number
  cpuCores: number
  isTermux: boolean
  maxConcurrency: number
  maxConcurrentTools: number
  maxToolOutputBytes: number
  maxToolOutputLines: number
  disableBackgroundAgents: boolean
  disableWatcher: boolean
  compactContext: boolean
  preferredModel?: string
}

type ResourceLimits = Omit<DeviceResourceConfig, "tier" | "totalRamGB" | "cpuCores" | "isTermux">

const LIMITS: Record<DeviceTier, ResourceLimits> = {
  low: {
    maxConcurrency: 1,
    maxConcurrentTools: 1,
    maxToolOutputBytes: 8 * 1024,
    maxToolOutputLines: 600,
    disableBackgroundAgents: true,
    disableWatcher: true,
    compactContext: true,
    preferredModel: "ollama/phi3",
  },
  medium: {
    maxConcurrency: 2,
    maxConcurrentTools: 2,
    maxToolOutputBytes: 50 * 1024,
    maxToolOutputLines: 2_000,
    disableBackgroundAgents: false,
    disableWatcher: false,
    compactContext: true,
    preferredModel: "groq/openai/gpt-oss-120b",
  },
  high: {
    maxConcurrency: 4,
    maxConcurrentTools: 4,
    maxToolOutputBytes: 200 * 1024,
    maxToolOutputLines: 10_000,
    disableBackgroundAgents: false,
    disableWatcher: false,
    compactContext: false,
  },
}

const isTermuxEnvironment = () =>
  Boolean(process.env.TERMUX_VERSION) ||
  process.env.PREFIX?.toLowerCase().includes("termux") === true ||
  os.homedir().toLowerCase().includes("com.termux")

export const detectDeviceTier = (): DeviceTier => {
  const totalRAMGB = os.totalmem() / 1024 / 1024 / 1024
  const cores = os.cpus()?.length || 2
  const termux = isTermuxEnvironment()

  if ((termux && totalRAMGB < 4) || totalRAMGB < 2) return "low"
  if (totalRAMGB < 8 || cores < 4) return "medium"
  return "high"
}

export const applyResourceLimits = (tier: DeviceTier): ResourceLimits => ({ ...LIMITS[tier] })

const positiveInteger = (value: string | undefined) => {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

const validTier = (value: string | undefined): DeviceTier | undefined =>
  value === "low" || value === "medium" || value === "high" ? value : undefined

export const getDeviceConfig = (overrides: { maxConcurrentTools?: number } = {}): DeviceResourceConfig => {
  const totalRamGB = os.totalmem() / 1024 / 1024 / 1024
  const cpuCores = os.cpus()?.length || 2
  const isTermux = isTermuxEnvironment()
  const tier = validTier(process.env.NEXUS_DEVICE_TIER) ?? detectDeviceTier()
  const base = applyResourceLimits(tier)
  const maxConcurrency = positiveInteger(process.env.NEXUS_MAX_CONCURRENCY) ?? base.maxConcurrency
  const maxConcurrentTools =
    positiveInteger(process.env.NEXUS_MAX_CONCURRENT_TOOLS) ?? overrides.maxConcurrentTools ?? base.maxConcurrentTools
  const maxToolOutputBytes = positiveInteger(process.env.NEXUS_MAX_TOOL_OUTPUT_BYTES) ?? base.maxToolOutputBytes
  const maxToolOutputLines = positiveInteger(process.env.NEXUS_MAX_TOOL_OUTPUT_LINES) ?? base.maxToolOutputLines
  const compactContext = process.env.NEXUS_DISABLE_AUTOCOMPACT === "0" ? false : base.compactContext

  return {
    tier,
    totalRamGB,
    cpuCores,
    isTermux,
    maxConcurrency,
    maxConcurrentTools,
    maxToolOutputBytes,
    maxToolOutputLines,
    disableBackgroundAgents: process.env.NEXUS_DISABLE_BACKGROUND_AGENTS === "1" || base.disableBackgroundAgents,
    disableWatcher: process.env.NEXUS_DISABLE_WATCHER === "1" || base.disableWatcher,
    compactContext,
    preferredModel: process.env.NEXUS_DEFAULT_MODEL?.trim() || base.preferredModel,
  }
}

export const deviceSummary = (config: DeviceResourceConfig = getDeviceConfig()) => {
  const tier = config.tier.toUpperCase()
  const mode = config.tier === "low" ? "Lightweight" : config.tier === "medium" ? "Balanced" : "Full"
  return `Device: ${tier} (${config.totalRamGB.toFixed(1)}GB RAM, ${config.isTermux ? "Termux" : `${config.cpuCores} cores`})\nMode: ${mode} (${config.maxConcurrentTools} concurrent tools, ${Math.round(config.maxToolOutputBytes / 1024)}KB output cap${config.preferredModel ? `, ${config.preferredModel} preferred` : ""})`
}
