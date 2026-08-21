import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { BaseAgent, type AgentContext } from "./BaseAgent"

function safeName(input: string): string {
  const value = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return value.slice(0, 48) || "nexus-bot"
}

export class BotAgent extends BaseAgent {
  readonly name = "bot-agent"
  readonly systemPrompt = "Prepare a lightweight Python Telegram bot using the hired Telegram worker."

  async execute(task: string, context: AgentContext) {
    const name = safeName(task.includes("echo") ? "echo-bot" : task)
    const outputDir = context.outputDir ?? join(homedir(), ".nexus", "bots", name)
    await mkdir(outputDir, { recursive: true })
    const main = `import os\nfrom telegram import Update\nfrom telegram.ext import Application, MessageHandler, ContextTypes, filters\n\nasync def echo(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    if update.message:\n        await update.message.reply_text(update.message.text or "")\n\ndef main():\n    token = os.environ["TELEGRAM_BOT_TOKEN"]\n    app = Application.builder().token(token).build()\n    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))\n    app.run_polling()\n\nif __name__ == "__main__":\n    main()\n`
    const run = "#!/data/data/com.termux/files/usr/bin/sh\nset -eu\nexec python main.py\n"
    const install = "#!/data/data/com.termux/files/usr/bin/sh\nset -eu\npython -m pip install --user --no-cache-dir python-telegram-bot\n"
    await writeFile(join(outputDir, "main.py"), main, "utf8")
    await writeFile(join(outputDir, "run.sh"), run, { encoding: "utf8", mode: 0o755 })
    await writeFile(join(outputDir, "install.sh"), install, { encoding: "utf8", mode: 0o755 })
    return { outputDir, name, files: ["main.py", "run.sh", "install.sh"] }
  }
}
