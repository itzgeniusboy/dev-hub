import { EOL } from "node:os"
import type { UserLiaison } from "@nexus/termux-core"

const knownCommands = new Set([
  "acp", "agent", "api", "asset", "attach", "bot", "completion", "config", "console", "db", "debug", "dev", "do", "export", "generate", "github", "import", "liaison", "mcp", "mod", "models", "pr", "providers", "run", "serve", "session", "setup", "stats", "tui", "uninstall", "upgrade", "web",
])

export function isBareUserTask(args: string[]) {
  return args.length > 0 && !args[0]?.startsWith("-") && !knownCommands.has(args[0] ?? "")
}

export async function runBareUserTask(args: string[], dependencies: {
  liaison?: UserLiaison
  write?: (text: string) => void
} = {}) {
  const { UserLiaison } = await import("@nexus/termux-core")
  const liaison = dependencies.liaison ?? new UserLiaison()
  const response = await liaison.handleUserMessage(args.join(" "), "local", process.cwd())
  ;(dependencies.write ?? process.stdout.write.bind(process.stdout))(response + EOL)
}
