import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { StaffManager } from "./StaffManager"
import { FreelancerDB } from "./FreelancerDB"
import { BotAgent } from "./agents/BotAgent"
import { DebugAgent } from "./agents/DebugAgent"
import { ToolAgent } from "./agents/ToolAgent"
import { PersistentTaskQueue } from "./agents/SmartManager"
import { readPowerStatus, workloadPolicy } from "@nexus-ai/core/power"
import { ServiceManager } from "./ServiceManager"
import type { PowerStatus } from "@nexus-ai/core/power"

export type BusinessmanResult = {
  jobId: string
  plan: ReturnType<StaffManager["brain"]["analyze"]>
  hired: Array<{ name: string; success: boolean; sizeMB: number; alreadyThere?: boolean }>
  result: unknown
  keepTeam: boolean
  savedMB: number
}

export type BusinessmanDependencies = {
  staff?: StaffManager
  botAgent?: Pick<BotAgent, "execute">
  toolAgent?: Pick<ToolAgent, "execute">
  debugAgent?: Pick<DebugAgent, "execute">
  services?: Pick<ServiceManager, "acquireWakeLock" | "releaseWakeLock" | "notify" | "toast">
  readPowerStatus?: () => Promise<PowerStatus>
  queue?: Pick<PersistentTaskQueue, "accept" | "update">
}

export class Businessman {
  readonly staff: StaffManager
  readonly freelancers = new FreelancerDB()
  readonly activeJobs = new Map<string, { command: string; startedAt: number }>()
  private readonly botAgent: Pick<BotAgent, "execute">
  private readonly toolAgent: Pick<ToolAgent, "execute">
  private readonly debugAgent: Pick<DebugAgent, "execute">
  private readonly services: Pick<ServiceManager, "acquireWakeLock" | "releaseWakeLock" | "notify" | "toast">
  private readonly powerStatusReader: () => Promise<PowerStatus>
  private readonly queue: Pick<PersistentTaskQueue, "accept" | "update">

  constructor(dependencies: BusinessmanDependencies = {}) {
    this.staff = dependencies.staff ?? new StaffManager()
    this.botAgent = dependencies.botAgent ?? new BotAgent()
    this.toolAgent = dependencies.toolAgent ?? new ToolAgent()
    this.debugAgent = dependencies.debugAgent ?? new DebugAgent()
    this.services = dependencies.services ?? new ServiceManager()
    this.powerStatusReader = dependencies.readPowerStatus ?? readPowerStatus
    this.queue = dependencies.queue ?? new PersistentTaskQueue()
  }

  async handleTask(userCommand: string): Promise<BusinessmanResult> {
    const jobId = `job-${Date.now().toString(36)}`
    const plan = this.staff.brain.analyze(userCommand)
    this.activeJobs.set(jobId, { command: userCommand, startedAt: Date.now() })
    // Persist the task record before the CLI acknowledges acceptance.
    await this.queue.accept(jobId, userCommand, process.cwd())
    const power = await this.powerStatusReader()
    const policy = workloadPolicy(power)
    let wakeLockHeld = false

    console.log("🧠 Task analyzed successfully")
    console.log(`   Required: ${plan.workersNeeded.join(" + ") || "core team only"}`)
    console.log(`   Estimate: ${plan.estimatedSize} download, ~${plan.estimatedTime}`)
    if (policy.throttled) {
      console.warn(`⚠️ Mobile resource protection enabled: ${policy.reason}. Limiting this task to ${policy.maxConcurrency ?? 1} worker.`)
      if (policy.preferredModel) console.warn(`   Recommended lightweight local model: ${policy.preferredModel}`)
    }
    try {
      await this.services.acquireWakeLock()
      wakeLockHeld = true
    } catch {
      // Native Termux is optional; desktop and unsupported Android environments retain existing behavior.
    }

    const hired: Array<{ name: string; success: boolean; sizeMB: number; alreadyThere?: boolean }> = []
    try {
      const matchedWorkers = this.staff.brain.matchFreelancers(plan)
      const selectedWorkers = policy.maxConcurrency ? matchedWorkers.slice(0, policy.maxConcurrency) : matchedWorkers
      for (const worker of selectedWorkers) {
        const result = await this.staff.hire.hire(worker)
        hired.push({ name: worker, success: result.success, sizeMB: result.sizeMB, alreadyThere: result.alreadyThere })
      }

      const failedHires = hired.filter((worker) => !worker.success && !worker.alreadyThere)
      if (failedHires.length > 0) {
        const names = failedHires.map((worker) => worker.name).join(", ")
        console.error(`❌ Required workers failed to install: ${names}. Task aborted.`)
        console.error("   Close other package-manager processes or install them manually, then re-run.")
        throw new Error(`dependency installation failed for: ${names}`)
      }

      console.log("⚒️ Starting task execution...")
      const hiredWorkers = hired.filter((worker) => worker.success).map((worker) => worker.name)
      const context = { hiredWorkers }
      const generated = plan.taskType === "bot"
        ? await this.botAgent.execute(userCommand, context)
        : await this.toolAgent.execute(userCommand, context)
      const checked = await this.debugAgent.execute(userCommand, {
        ...context,
        outputDir: (generated as { outputDir?: string }).outputDir,
      })
      const result = { generated, checked }
      await this.queue.update(jobId, "completed")
      console.log(`✅ Task completed.${(generated as { outputDir?: string }).outputDir ? ` Files: ${(generated as { outputDir: string }).outputDir}` : ""}`)
      void this.services.notify("NEXUS task completed", userCommand.slice(0, 120)).catch(() => undefined)
      void this.services.toast("NEXUS task completed").catch(() => undefined)

      const keepTeam = hired.length > 0 ? await this.askUser("💾 Keep hired workers available? (y/n): ") : true
      let savedMB = 0
      if (!keepTeam && hired.length > 0) {
        savedMB = await this.staff.fire.fireMany(hired)
        console.log(`📊 Storage reclaimed: ${savedMB}MB`)
      } else if (keepTeam && hired.length > 0) {
        console.log(`💼 Kept on payroll: ${hired.map((worker) => worker.name).join(", ")}`)
      }

      return { jobId, plan, hired, result, keepTeam, savedMB }
    } catch (error) {
      await this.queue
        .update(jobId, "failed", error instanceof Error ? error.message : String(error))
        .catch(() => undefined)
      console.error("❌ Task failed. NEXUS will release temporary mobile resources.")
      void this.services.notify("NEXUS task failed", userCommand.slice(0, 120)).catch(() => undefined)
      void this.services.toast("NEXUS task failed").catch(() => undefined)
      throw error
    } finally {
      if (wakeLockHeld) void this.services.releaseWakeLock().catch(() => undefined)
      this.activeJobs.delete(jobId)
    }
  }

  async askUser(prompt: string): Promise<boolean> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.log(`${prompt} n (non-interactive default)`)
      return false
    }
    const rl = createInterface({ input, output })
    try {
      const answer = await rl.question(prompt)
      return answer.trim().toLowerCase().startsWith("y")
    } finally {
      rl.close()
    }
  }
}
