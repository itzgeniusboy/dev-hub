import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import * as Prompt from "../effect/prompt"
import { Effect, Option } from "effect"
import { Process } from "@/util/process"
import { readNexusConfig, writeNexusConfig } from "./config"
import { PREFERRED_MODELS } from "@/provider/rotation"

function freeModelDefinitions(provider: keyof typeof PREFERRED_MODELS) {
  return Object.fromEntries(
    PREFERRED_MODELS[provider].map((id) => [
      id,
      {
        id,
        name: id,
        reasoning: false,
        tool_call: true,
        modalities: { input: ["text"], output: ["text"] },
      },
    ]),
  )
}

const PROVIDER_DEFINITIONS = {
  groq: {
    name: "Groq",
    api: "https://api.groq.com/openai/v1",
    npm: "@ai-sdk/openai-compatible",
    models: freeModelDefinitions("groq"),
  },
  openrouter: {
    name: "OpenRouter",
    api: "https://openrouter.ai/api/v1",
    npm: "@ai-sdk/openai-compatible",
    models: freeModelDefinitions("openrouter"),
  },
  google: {
    name: "Gemini",
    api: "https://generativelanguage.googleapis.com/v1beta/openai",
    npm: "@ai-sdk/openai-compatible",
    models: freeModelDefinitions("google"),
  },
} as const

type KeyProvider = keyof typeof PROVIDER_DEFINITIONS

async function validateKey(provider: KeyProvider, key: string): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const headers = { Authorization: `Bearer ${key}` }
    let response: Response
    if (provider === "groq") {
      response = await fetch("https://api.groq.com/openai/v1/models", { headers, signal: controller.signal })
    } else if (provider === "openrouter") {
      response = await fetch("https://openrouter.ai/api/v1/models", { headers, signal: controller.signal })
    } else {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {
        signal: controller.signal,
      })
    }
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function appendUnique(existing: string[] | undefined, value: string): string[] {
  return Array.from(new Set([...(existing ?? []), value]))
}

export const SetupOllamaCommand = effectCmd({
  command: "ollama",
  describe: "Auto-install Ollama + pull llama3",
  instance: false,
  handler: Effect.fn("Cli.setup.ollama")(function* () {
    UI.empty()
    yield* Prompt.intro("Installing Ollama")

    yield* Prompt.log.info("Installing Ollama via Termux package manager...")
    const installProc = Process.spawn(["pkg", "install", "-y", "ollama"], { stdio: "inherit" })
    const installCode = yield* Effect.tryPromise(() => installProc.exited)
    if (installCode !== 0) {
      return yield* fail("Ollama could not be installed with pkg. Install it manually, then run `nexus setup ollama` again.")
    }

    yield* Prompt.log.info("Starting Ollama service...")
    const serveProc = Process.spawn(["ollama", "serve"], { stdio: "ignore" })
    void serveProc.exited

    yield* Prompt.log.info("Pulling llama3 (4GB, ~10 mins on WiFi)...")
    const pullProc = Process.spawn(["ollama", "pull", "llama3"], { stdio: "inherit" })
    const pullCode = yield* Effect.tryPromise(() => pullProc.exited)
    if (pullCode !== 0) return yield* fail("Ollama installed, but llama3 could not be pulled.")

    const { path: configPath, data: cfg } = readNexusConfig()
    cfg.model = "ollama/llama3"
    cfg.provider = {
        ...(cfg.provider ?? {}),
        ollama: {
          name: "Ollama",
          api: "http://127.0.0.1:11434/v1",
          npm: "@ai-sdk/openai-compatible",
          env: [],
          models: {
            llama3: {
              id: "llama3",
              name: "Llama 3 (local)",
              reasoning: false,
              tool_call: true,
              modalities: { input: ["text"], output: ["text"] },
            },
            phi3: {
              id: "phi3",
              name: "Phi-3 (local)",
              reasoning: false,
              tool_call: true,
              modalities: { input: ["text"], output: ["text"] },
            },
            "qwen2.5-coder": {
              id: "qwen2.5-coder",
              name: "Qwen 2.5 Coder (local)",
              reasoning: false,
              tool_call: true,
              modalities: { input: ["text"], output: ["text"] },
            },
          },
        },
      }
    writeNexusConfig(configPath, cfg)

    yield* Prompt.log.success("✅ Ready! Using local model.")
    yield* Prompt.outro("Done")
  }),
})

export const SetupFreeCommand = effectCmd({
  command: "free",
  describe: "Configure and validate Groq, OpenRouter, and Gemini keys",
  instance: false,
  handler: Effect.fn("Cli.setup.free")(function* () {
    const { path: configPath, data: cfg } = readNexusConfig()
    const current = { ...(cfg.api_keys ?? {}) } as Record<string, string[]>
    const providers: KeyProvider[] = ["groq", "openrouter", "google"]
    const labels: Record<KeyProvider, string> = {
      groq: "Groq API key (free from groq.com)",
      openrouter: "OpenRouter key (free from openrouter.ai)",
      google: "Gemini key (free from aistudio.google.com)",
    }
    let valid = 0

    UI.empty()
    yield* Prompt.intro("NEXUS Free API Setup")

    for (const provider of providers) {
      const existing = current[provider] ?? current[provider === "google" ? "gemini" : provider] ?? []
      if (existing.length > 0) {
        const verified: string[] = []
        for (const key of existing) {
          const ok = yield* Effect.tryPromise({
            try: () => validateKey(provider, key),
            catch: () => false,
          })
          if (ok) verified.push(key)
        }
        current[provider === "google" ? "gemini" : provider] = verified
        if (verified.length > 0) {
          yield* Prompt.log.info(`${labels[provider]} verified (${verified.length} key${verified.length === 1 ? "" : "s"})`)
          valid += verified.length
        } else {
          yield* Prompt.log.warn(`${labels[provider]} keys are invalid or unavailable; enter a new key to replace them.`)
        }
      }

      if ((current[provider] ?? current[provider === "google" ? "gemini" : provider] ?? []).length > 0) continue

      const answer = yield* Prompt.password({ message: `${labels[provider]}:`, mask: "*" })
      if (Option.isNone(answer)) continue
      const key = answer.value.trim()
      if (!key) continue

      const ok = yield* Effect.tryPromise({
        try: () => validateKey(provider, key),
        catch: () => false,
      })
      if (!ok) {
        yield* Prompt.log.error(`${provider} key validation failed; it was not saved.`)
        continue
      }

      const storageName = provider === "google" ? "gemini" : provider
      current[storageName] = appendUnique(current[storageName], key)
      valid++
      yield* Prompt.log.success(`${provider} key validated.`)
    }

    const provider = {
      ...(cfg.provider ?? {}),
      groq: { ...(cfg.provider?.groq ?? {}), ...PROVIDER_DEFINITIONS.groq },
      openrouter: { ...(cfg.provider?.openrouter ?? {}), ...PROVIDER_DEFINITIONS.openrouter },
      google: { ...(cfg.provider?.google ?? {}), ...PROVIDER_DEFINITIONS.google },
    }
    cfg.api_keys = current
    cfg.rotation = true
    cfg.provider = provider

    const preferredProvider = (["groq", "openrouter", "google"] as const).find((id) => {
      const storageName = id === "google" ? "gemini" : id
      return (current[storageName] ?? []).length > 0
    })
    if (preferredProvider) {
      cfg.model = `${preferredProvider}/${PREFERRED_MODELS[preferredProvider][0]}`
    } else if (typeof cfg.model === "string" && /^(groq|openrouter|google)\//.test(cfg.model)) {
      delete cfg.model
    }
    writeNexusConfig(configPath, cfg)

    if (valid > 0) {
      yield* Prompt.log.success("✅ Ready. NEXUS ab directly chalega.")
    } else {
      yield* Prompt.log.error("❌ Koi key kaam nahi kar rahi. Ollama try karo: nexus setup ollama")
    }
    yield* Prompt.outro("Done")
  }),
})

export const SetupCommand = cmd({
  command: "setup",
  describe: "Setup providers and models",
  builder: (yargs) => yargs.command(SetupOllamaCommand).command(SetupFreeCommand).demandCommand(),
  async handler() {},
})
