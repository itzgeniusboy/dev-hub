import { execFile } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { SeniorDevAgent } from "./SeniorDevAgent"
import { ManagerAgent, type ProjectResult, type TeamStatus } from "./TeamHierarchy"

const execFileAsync = promisify(execFile)

export type MessageType = "greeting" | "small_talk" | "status_check" | "small_task" | "big_task" | "command" | "help" | "complaint"

export type TaskStatus = {
  taskId: string
  userId: string
  message: string
  status: string
  progress: number
  startedAt: number
  updatedAt: number
  result?: ProjectResult
  error?: string
}

export type LiaisonOptions = {
  onUpdate?: (status: TaskStatus) => void | Promise<void>
  notify?: boolean
  background?: boolean
}

const statusRoot = join("/tmp", "nexus", "liaison")

export function classifyMessage(message: string): MessageType {
  const lower = message.toLowerCase().trim()
  if (/^(hi|hello|hey|hola)\b/.test(lower)) return "greeting"
  if (/^(status|progress|kahan tak|kitna hua)\b/.test(lower)) return "status_check"
  if (/^(stop|cancel|pause|exit|kill)\b/.test(lower)) return "command"
  if (/^(help|kya kar sakte|commands|menu)\b/.test(lower)) return "help"
  if (/^(galat|error|bug|sahi nahi|fail)\b/.test(lower)) return "complaint"
  if (/^(time|date|weather|joke|batao)\b/.test(lower)) return "small_talk"
  const bigIndicators = ["refactor", "migrate", "rewrite", "architecture", "bot banao", "app banao", "repo", "project", "module"]
  return bigIndicators.some((word) => lower.includes(word)) ? "big_task" : "small_task"
}

function taskId() {
  return `liaison-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export class UserLiaison {
  private readonly activeTasks = new Map<string, TaskStatus>()
  private readonly seniorDev: SeniorDevAgent
  private readonly manager: ManagerAgent
  private readonly options: LiaisonOptions

  constructor(options: LiaisonOptions = {}) {
    this.options = options
    this.seniorDev = new SeniorDevAgent()
    this.manager = new ManagerAgent()
  }

  async handleUserMessage(message: string, userId = "local", root = "."): Promise<string> {
    const type = classifyMessage(message)
    switch (type) {
      case "greeting":
        return "Bolo bhai! Kya kaam hai? Help ke liye 'help' likho."
      case "small_talk":
        return this.handleSmallTalk(message)
      case "help":
        return this.getHelpText()
      case "status_check":
        return this.getActiveTaskStatus(userId)
      case "command":
        return this.handleCommand(message, userId)
      case "complaint":
        return "Samajh gaya. Error ya expected result bhejo; main usse Senior Dev workflow mein analyze karunga."
      case "small_task":
        return this.executeSmallTask(message, root, userId)
      case "big_task":
        return this.startBigTask(message, root, userId)
    }
  }

  private handleSmallTalk(message: string) {
    const lower = message.toLowerCase()
    if (lower.includes("time")) return `Local time: ${new Date().toLocaleTimeString()}`
    if (lower.includes("date")) return `Date: ${new Date().toLocaleDateString()}`
    if (lower.includes("weather")) return "Weather lookup needs a configured weather provider."
    if (lower.includes("joke")) return "Bug report: the code worked once, so we called it production-ready."
    return "Main ready hoon. 'help' likho ya koi task bhejo."
  }

  private async executeSmallTask(message: string, root: string, userId: string) {
    await this.emit({ taskId: "solo", userId, message, status: "Senior Dev analyzing", progress: 20, startedAt: Date.now(), updatedAt: Date.now() })
    const result = /\b(review|analy[sz]e|scan|inspect)\b/i.test(message)
      ? await this.seniorDev.analyze(root)
      : await this.seniorDev.fix(root, { runTests: true })
    return `Complete. ${result.summary}`
  }

  private async startBigTask(message: string, root: string, userId: string) {
    const id = taskId()
    const now = Date.now()
    const initial: TaskStatus = { taskId: id, userId, message, status: "Manager planning", progress: 5, startedAt: now, updatedAt: now }
    this.activeTasks.set(id, initial)
    await this.persist(initial)
    const ack = `Samajh gaya. Bada task hai; Manager team workflow shuru kar raha hai.\nTask ID: ${id}\nProgress check karne ke liye 'status' likho.`
    const run = async () => {
      try {
        const result = await this.manager.runProject(message, root, {
          onProgress: async (update) => {
            const status = this.fromTeamStatus(update, id, userId, message, now)
            await this.emit(status)
          },
        })
        const complete: TaskStatus = { ...this.activeTasks.get(id) ?? initial, status: result.status === "completed" ? "Complete" : "Needs review", progress: 100, updatedAt: Date.now(), result }
        await this.emit(complete)
        if (this.options.notify !== false) await this.notifyUser(`Task ${id}: ${complete.status}`)
      } catch (error) {
        const failed: TaskStatus = { ...this.activeTasks.get(id) ?? initial, status: "Failed", progress: 100, updatedAt: Date.now(), error: error instanceof Error ? error.message : String(error) }
        await this.emit(failed)
        if (this.options.notify !== false) await this.notifyUser(`Task ${id}: failed`)
      }
    }
    if (this.options.background !== false) {
      void run()
    } else {
      await run()
    }
    return ack
  }

  private fromTeamStatus(update: TeamStatus, id: string, userId: string, message: string, startedAt: number): TaskStatus {
    return { taskId: id, userId, message, status: update.status, progress: update.progress, startedAt, updatedAt: update.updatedAt }
  }

  private async emit(status: TaskStatus) {
    this.activeTasks.set(status.taskId, status)
    await this.persist(status)
    await this.options.onUpdate?.(status)
  }

  private async persist(status: TaskStatus) {
    await mkdir(statusRoot, { recursive: true })
    await writeFile(join(statusRoot, `${status.taskId}.json`), JSON.stringify(status, null, 2) + "\n", "utf8")
  }

  async getActiveTasks(userId = "local") {
    return [...this.activeTasks.values()].filter((task) => task.userId === userId && task.status !== "Complete" && task.status !== "Failed")
  }

  private getActiveTaskStatus(userId: string) {
    const tasks = [...this.activeTasks.values()].filter((task) => task.userId === userId && task.status !== "Complete" && task.status !== "Failed")
    if (tasks.length === 0) return "Sab kaam complete hai. Kuch aur bolo."
    return ["Active tasks:", ...tasks.map((task) => `${this.progressBar(task.progress)} ${task.taskId} — ${task.status} (${task.progress}%)`)].join("\n")
  }

  private progressBar(progress: number) {
    const filled = Math.max(0, Math.min(10, Math.floor(progress / 10)))
    return `[${"#".repeat(filled)}${"-".repeat(10 - filled)}]`
  }

  private async handleCommand(message: string, userId: string) {
    if (/^\s*(stop|cancel|pause|kill)\b/i.test(message)) {
      const tasks = await this.getActiveTasks(userId)
      for (const task of tasks) {
        const stopped = { ...task, status: "Cancelled", progress: task.progress, updatedAt: Date.now() }
        this.activeTasks.set(task.taskId, stopped)
        await this.persist(stopped)
      }
      return tasks.length > 0 ? `Cancelled ${tasks.length} active task(s).` : "No active tasks found."
    }
    return "Command received."
  }

  private getHelpText() {
    return [
      "NEXUS User Liaison commands:",
      "  nexus dev read <github-url>   Clone/scan workflow entry",
      "  nexus dev analyze <path>      Static bug analysis",
      "  nexus dev fix <path>          Safe fix workflow",
      "  nexus dev review <path>       Review workflow",
      "  nexus dev optimize <path>     Performance review",
      "  nexus dev status              Active team status",
      "  stop / cancel                 Cancel active liaison tasks",
    ].join("\n")
  }

  private async notifyUser(message: string) {
    if (!process.env.TERMUX_VERSION || !process.env.PREFIX) return
    try {
      await execFileAsync("termux-notification", ["--title", "NEXUS", "--content", message], { timeout: 5000 })
    } catch {
      // Termux:API is optional; console/status files remain the source of truth.
    }
  }
}

export default UserLiaison
