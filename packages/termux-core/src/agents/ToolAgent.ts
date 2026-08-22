import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { BaseAgent, type AgentContext } from "./BaseAgent"

type RegistryEntry = {
  name: string
  path: string
  runtime: string
  createdAt: string
}

export class ToolAgent extends BaseAgent {
  readonly name = "tool-agent"
  readonly systemPrompt = "Prepare a small Termux-compatible script using only the hired tools."

  async execute(task: string, context: AgentContext) {
    const name = task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "nexus-tool"
    const outputDir = context.outputDir ?? join(homedir(), ".nexus", "tools", name)
    await mkdir(outputDir, { recursive: true })

    // Generated tools follow the documented contract: JSON on stdin, JSON on stdout.
    const runner = [
      "#!/data/data/com.termux/files/usr/bin/sh",
      "set -eu",
      'exec node "$(dirname "$0")/run.js"',
      `# Hired workers: ${context.hiredWorkers.join(", ") || "core team only"}`,
      "",
    ].join("\n")
    await writeFile(join(outputDir, "run.sh"), runner, { encoding: "utf8", mode: 0o755 })

    const toolScript = [
      "#!/usr/bin/env node",
      'let raw = ""',
      'process.stdin.on("data", (chunk) => (raw += chunk))',
      'process.stdin.on("end", () => {',
      "  let input = {}",
      '  try { input = JSON.parse(raw || "{}") } catch { input = {} }',
      "  process.stdout.write(",
      "    JSON.stringify({ ok: true, tool: " + JSON.stringify(name) + ", task: " + JSON.stringify(task) + ", input }) + \"\\n\",",
      "  )",
      "})",
      "",
    ].join("\n")
    await writeFile(join(outputDir, "run.js"), toolScript, { encoding: "utf8", mode: 0o755 })
    await this.recordRegistry({ name, path: outputDir, runtime: "node", createdAt: new Date().toISOString() })
    return { outputDir, name, files: ["run.sh", "run.js"] }
  }

  private async recordRegistry(entry: RegistryEntry) {
    const registryPath = join(homedir(), ".nexus", "tools", "registry.json")
    let registry: RegistryEntry[] = []
    try {
      const parsed = JSON.parse(await readFile(registryPath, "utf8")) as unknown
      if (Array.isArray(parsed)) registry = parsed as RegistryEntry[]
    } catch {
      // First entry starts a fresh registry.
    }
    const deduped = registry.filter((item) => item.path !== entry.path)
    deduped.push(entry)
    await mkdir(dirname(registryPath), { recursive: true })
    await writeFile(registryPath, JSON.stringify(deduped, null, 2) + "\n", "utf8")
  }
}
