import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { StaffManager } from "./StaffManager"
import { FreelancerDB } from "./FreelancerDB"
import { BotAgent } from "./agents/BotAgent"
import { DebugAgent } from "./agents/DebugAgent"
import { ToolAgent } from "./agents/ToolAgent"

export type BusinessmanResult = {
  jobId: string
  plan: ReturnType<StaffManager["brain"]["analyze"]>
  hired: Array<{ name: string; success: boolean; sizeMB: number; alreadyThere?: boolean }>
  result: unknown
  keepTeam: boolean
  savedMB: number
}

export class Businessman {
  readonly staff = new StaffManager()
  readonly freelancers = new FreelancerDB()
  readonly activeJobs = new Map<string, { command: string; startedAt: number }>()
  private readonly botAgent = new BotAgent()
  private readonly toolAgent = new ToolAgent()
  private readonly debugAgent = new DebugAgent()

  async handleTask(userCommand: string): Promise<BusinessmanResult> {
    const jobId = `job-${Date.now().toString(36)}`
    const plan = this.staff.brain.analyze(userCommand)
    this.activeJobs.set(jobId, { command: userCommand, startedAt: Date.now() })

    console.log("🧠 Brain: Task samajh gaya")
    console.log(`   Chahiye: ${plan.workersNeeded.join(" + ") || "core team only"}`)
    console.log(`   Estimate: ${plan.estimatedSize} download, ~${plan.estimatedTime}`)

    const hired: Array<{ name: string; success: boolean; sizeMB: number; alreadyThere?: boolean }> = []
    try {
      for (const worker of this.staff.brain.matchFreelancers(plan)) {
        const result = await this.staff.hire.hire(worker)
        hired.push({ name: worker, success: result.success, sizeMB: result.sizeMB, alreadyThere: result.alreadyThere })
      }

      console.log("⚒️ Kaam shuru...")
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
      console.log(`✅ Kaam khatm!${(generated as { outputDir?: string }).outputDir ? ` Files: ${(generated as { outputDir: string }).outputDir}` : ""}`)

      const keepTeam = hired.length > 0 ? await this.askUser("💾 Freelancers ko rakhein? (y/n): ") : true
      let savedMB = 0
      if (!keepTeam && hired.length > 0) {
        savedMB = await this.staff.fire.fireMany(hired)
        console.log(`📊 Total bachaya: ${savedMB}MB`)
      } else if (keepTeam && hired.length > 0) {
        console.log(`💼 Kept on payroll: ${hired.map((worker) => worker.name).join(", ")}`)
      }

      return { jobId, plan, hired, result, keepTeam, savedMB }
    } finally {
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
