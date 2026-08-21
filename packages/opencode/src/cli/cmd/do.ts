import type { Argv } from "yargs"
import { cmd } from "./cmd"

export const DoCommand = cmd({
  command: "do <task>",
  describe: "analyze a task and hire only the required Termux freelancers",
  builder: (yargs: Argv) => yargs.positional("task", {
    type: "string",
    describe: "task for the Businessman orchestrator",
  }),
  async handler(args: { task: string }) {
    try {
      const modulePath = "../../../../termux-core/src/index.ts"
      const { Businessman } = await import(modulePath)
      const businessman = new Businessman()
      await businessman.handleTask(args.task)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("Cannot find module") || message.includes("Module not found")) {
        process.stderr.write("Termux core not built. Run: cd packages/termux-core && bun run typecheck\n")
        return
      }
      throw error
    }
  },
})
