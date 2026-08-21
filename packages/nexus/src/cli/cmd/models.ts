import { EOL } from "os"
import { Effect, Exit } from "effect"
import { ModelsDev } from "@nexus-ai/core/models-dev"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import { ProviderV2 } from "@nexus-ai/core/provider"

import { cmd } from "./cmd"
import * as Prompt from "../effect/prompt"
import { Config } from "@/config/config"
import { modelForProvider } from "@/provider/rotation"

export const ModelsListCommand = effectCmd({
  command: "list [provider]",
  aliases: ["ls", "$0"],
  describe: "list all available models",
  instance: true,
  builder: (yargs) =>
    yargs
      .positional("provider", {
        describe: "provider ID to filter models by",
        type: "string",
        array: false,
      })
      .option("verbose", {
        describe: "use more verbose model output (includes metadata like costs)",
        type: "boolean",
      })
      .option("refresh", {
        describe: "refresh the models cache from models.dev",
        type: "boolean",
      }),
  handler: Effect.fn("Cli.models.list")(function* (args) {
    const { Provider } = yield* Effect.promise(() => import("@/provider/provider"))
    if (args.refresh) {
      yield* ModelsDev.Service.use((s) => s.refresh(true))
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + "Models cache refreshed" + UI.Style.TEXT_NORMAL)
    }

    const provider = yield* Provider.Service
    const providers = yield* provider.list()

    const print = (providerID: ProviderV2.ID, verbose?: boolean) => {
      const p = providers[providerID]
      const sorted = Object.entries(p.models).sort(([a], [b]) => a.localeCompare(b))
      for (const [modelID, model] of sorted) {
        process.stdout.write(`${providerID}/${modelID}`)
        process.stdout.write(EOL)
        if (verbose) {
          process.stdout.write(JSON.stringify(model, null, 2))
          process.stdout.write(EOL)
        }
      }
    }

    if (args.provider) {
      const providerID = ProviderV2.ID.make(args.provider)
      if (!providers[providerID]) return yield* fail(`Provider not found: ${args.provider}`)
      print(providerID, args.verbose)
      return
    }

    const ids = Object.keys(providers).sort((a, b) => {
      const aIsNexus = a.startsWith("nexus")
      const bIsNexus = b.startsWith("nexus")
      if (aIsNexus && !bIsNexus) return -1
      if (!aIsNexus && bIsNexus) return 1
      return a.localeCompare(b)
    })

    for (const providerID of ids) print(ProviderV2.ID.make(providerID), args.verbose)
  }),
})

export const ModelsTestCommand = effectCmd({
  command: "test",
  describe: "test configured models to see which ones work",
  instance: true,
  handler: Effect.fn("Cli.models.test")(function* () {
    const { Provider } = yield* Effect.promise(() => import("@/provider/provider"))
    const s = yield* Provider.Service
    const cfgSvc = yield* Config.Service
    const cfg = yield* cfgSvc.get()

    UI.empty()
    yield* Prompt.intro("Testing configured models")

    const configured = Object.keys(cfg.provider ?? {})
    if (configured.length === 0) {
      yield* Prompt.log.warn("No custom providers configured.")
    }

    const testPrompt = "Reply with exactly OK"
    const providersToTest = ["groq", "openrouter", "google", "ollama", "openai", "opencode", ...configured]
    const tested = new Set<string>()

    for (const pid of providersToTest) {
      if (tested.has(pid)) continue
      tested.add(pid)

      const provider = yield* s.getProvider(ProviderV2.ID.make(pid))
      if (!provider) continue

      const preferredID = modelForProvider(pid, provider.models)
      const model = preferredID ? provider.models[preferredID] : Provider.sort(Object.values(provider.models))[0]
      if (!model) continue
      const label = `${pid}/${model.id}`
      const spinner = Prompt.spinner()
      yield* spinner.start(`Testing ${label}...`)

      const language = yield* s.getLanguage(model).pipe(Effect.exit)
      if (Exit.isFailure(language)) {
        const errStr = String(language.cause)
        if (/rate.?limit|quota exceeded/i.test(errStr)) {
          yield* spinner.stop(UI.Style.TEXT_WARNING_BOLD + "! " + UI.Style.TEXT_NORMAL + label + " (Rate limited)")
        } else {
          yield* spinner.stop(
            UI.Style.TEXT_DANGER_BOLD +
              "✗ " +
              UI.Style.TEXT_NORMAL +
              label +
              " (Failed)" +
              (process.env.NEXUS_DEBUG_API === "1" ? ` ${errStr}` : ""),
          )
        }
        continue
      }

      const result = yield* Effect.tryPromise({
        try: () => language.value.doGenerate({
          inputFormat: "prompt",
          mode: { type: "regular" },
          prompt: [{ role: "user", content: [{ type: "text", text: testPrompt }] }],
        }),
        catch: (e) => e,
      }).pipe(Effect.exit)
      if (Exit.isSuccess(result)) {
        yield* spinner.stop(UI.Style.TEXT_SUCCESS_BOLD + "✓ " + UI.Style.TEXT_NORMAL + label + " (Working)")
      } else {
        const errStr = String(result.cause)
        if (/rate.?limit|quota exceeded/i.test(errStr)) {
          yield* spinner.stop(UI.Style.TEXT_WARNING_BOLD + "! " + UI.Style.TEXT_NORMAL + label + " (Rate limited)")
        } else {
          yield* spinner.stop(
            UI.Style.TEXT_DANGER_BOLD +
              "✗ " +
              UI.Style.TEXT_NORMAL +
              label +
              " (Failed)" +
              (process.env.NEXUS_DEBUG_API === "1" ? ` ${errStr}` : ""),
          )
        }
      }
    }

    yield* Prompt.outro("Test complete")
  })
})

export const ModelsCommand = cmd({
  command: "models",
  describe: "manage available models",
  builder: (yargs) => yargs.command(ModelsListCommand).command(ModelsTestCommand).demandCommand(),
  async handler() {},
})
