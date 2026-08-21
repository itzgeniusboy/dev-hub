import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { BaseAgent, type AgentContext } from "./BaseAgent"

export class ToolAgent extends BaseAgent {
  readonly name = "tool-agent"
  readonly systemPrompt = "Prepare a small Termux-compatible script using only the hired tools."

  async execute(task: string, context: AgentContext) {
    const name = task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "devhub-tool"
    const outputDir = context.outputDir ?? join(homedir(), ".dev-hub", "tools", name)
    await mkdir(outputDir, { recursive: true })
    const script = `#!/data/data/com.termux/files/usr/bin/sh\nset -eu\nprintf '%s\\n' ${JSON.stringify(`Dev Hub task: ${task}`)}\n# Hired workers: ${context.hiredWorkers.join(", ") || "core team only"}\n`
    await writeFile(join(outputDir, "run.sh"), script, { encoding: "utf8", mode: 0o755 })
    return { outputDir, name, files: ["run.sh"] }
  }
}
