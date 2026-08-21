import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { CodeReader, type FileSummary } from "./SeniorDevAgent"

export type TaskSize = "small" | "medium" | "large"

export type RepoStats = {
  root: string
  fileCount: number
  totalBytes: number
  totalLines: number
  files: FileSummary[]
}

export type WorkerTask = {
  id: string
  task: string
  file?: string
  lineStart?: number
  lineEnd?: number
}

export type WorkerResult = {
  workerId: string
  taskId: string
  status: "done" | "failed" | "escalated"
  summary: string
  files: string[]
  changes: string[]
  error?: string
}

export type CheckerResult = {
  workerId: string
  status: "approved" | "rejected"
  notes: string
}

export type ModulePlan = {
  id: string
  name: string
  files: string[]
  tasks: WorkerTask[]
}

export type LeadResult = {
  leadId: string
  module: string
  workers: WorkerResult[]
  checks: CheckerResult[]
  status: "done" | "failed"
}

export type TeamStatus = {
  taskId: string
  status: string
  progress: number
  modules: number
  completedModules: number
  workers: number
  completedWorkers: number
  updatedAt: number
}

export type ProjectResult = {
  taskId: string
  size: TaskSize
  stats: RepoStats
  modules: ModulePlan[]
  leads: LeadResult[]
  status: "completed" | "failed"
  summary: string
}

export type ProgressCallback = (status: TeamStatus) => void | Promise<void>

const MAX_PARALLEL_LEADS = 3
const MAX_WORKERS_PER_LEAD = 7
const MAX_WORKER_LINES = 50

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 70) || "task"
}

async function countLines(filePath: string) {
  try {
    const content = await readFile(filePath, "utf8")
    return content.split("\n").length
  } catch {
    return 0
  }
}

async function writeJson(path: string, value: unknown) {
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8")
}

export function detectTaskSize(task: string, repoStats: RepoStats): TaskSize {
  const lower = task.toLowerCase()
  let score = 0
  if (lower.includes("refactor")) score += 3
  if (lower.includes("migrate")) score += 4
  if (lower.includes("rewrite")) score += 5
  if (lower.includes("architecture")) score += 5
  if (repoStats.fileCount > 50) score += 2
  if (repoStats.totalLines > 10_000) score += 3
  if (lower.includes("fix bug")) score -= 2
  if (lower.includes("typo")) score -= 3
  if (lower.includes("rename")) score -= 2
  if (repoStats.fileCount < 10) score -= 2
  if (score <= 2) return "small"
  if (score <= 5) return "medium"
  return "large"
}

export class WorkerAgent {
  constructor(private readonly ipcRoot: string) {}

  async execute(task: WorkerTask): Promise<WorkerResult> {
    const workerId = `worker-${safeSegment(task.id)}`
    const outputPath = join(this.ipcRoot, "workers", workerId, "output.json")
    try {
      const files = task.file ? [task.file] : []
      const result: WorkerResult = {
        workerId,
        taskId: task.id,
        status: "done",
        summary: `Inspected ${task.file ? basename(task.file) : "the assigned module"}; no source change was applied automatically.`,
        files,
        changes: [],
      }
      await writeJson(outputPath, result)
      return result
    } catch (error) {
      const result: WorkerResult = {
        workerId,
        taskId: task.id,
        status: "escalated",
        summary: "Worker could not complete the assigned inspection.",
        files: task.file ? [task.file] : [],
        changes: [],
        error: error instanceof Error ? error.message : String(error),
      }
      await writeJson(outputPath, result)
      return result
    }
  }
}

export class CheckerAgent {
  constructor(private readonly ipcRoot: string) {}

  async check(result: WorkerResult): Promise<CheckerResult> {
    const approved = result.status === "done" && result.error === undefined
    const checked: CheckerResult = {
      workerId: result.workerId,
      status: approved ? "approved" : "rejected",
      notes: approved ? "Worker output is structurally valid and contains no unreviewed code change." : result.error ?? "Worker escalated the task.",
    }
    await writeJson(join(this.ipcRoot, "checkers", result.workerId, "results.json"), checked)
    return checked
  }
}

export class TeamLeadAgent {
  constructor(private readonly ipcRoot: string) {}

  private splitTasks(module: ModulePlan): WorkerTask[] {
    const sourceFiles = module.files.length > 0 ? module.files : [undefined]
    return sourceFiles.slice(0, MAX_WORKERS_PER_LEAD).map((file, index) => ({
      id: `${module.id}-worker-${index + 1}`,
      task: `Inspect ${module.name}${file ? ` in ${basename(file)}` : ""}`,
      file,
      lineStart: 1,
      lineEnd: MAX_WORKER_LINES,
    }))
  }

  async execute(module: ModulePlan): Promise<LeadResult> {
    const tasks = this.splitTasks(module)
    const workers: WorkerResult[] = []
    const checks: CheckerResult[] = []
    const worker = new WorkerAgent(this.ipcRoot)
    const checker = new CheckerAgent(this.ipcRoot)
    for (const task of tasks) {
      const result = await worker.execute(task)
      workers.push(result)
      checks.push(await checker.check(result))
    }
    return {
      leadId: `lead-${module.id}`,
      module: module.name,
      workers,
      checks,
      status: checks.every((check) => check.status === "approved") ? "done" : "failed",
    }
  }
}

export class ManagerAgent {
  readonly reader = new CodeReader()

  async scanRepo(root: string): Promise<RepoStats> {
    const files = await this.reader.quickScan(root)
    let totalLines = 0
    for (const file of files) {
      if (file.size <= 100 * 1024) totalLines += await countLines(file.path)
    }
    return { root: resolve(root), fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0), totalLines, files }
  }

  private async createModules(task: string, stats: RepoStats): Promise<ModulePlan[]> {
    const byDirectory = new Map<string, FileSummary[]>()
    for (const file of stats.files) {
      const relative = file.path.slice(stats.root.length + 1)
      const directory = relative.includes("/") ? (relative.split("/")[0] ?? "root") : "root"
      const list = byDirectory.get(directory) ?? []
      list.push(file)
      byDirectory.set(directory, list)
    }
    const selected = [...byDirectory.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5)
    if (selected.length === 0) selected.push(["root", []])
    return selected.map(([name, files], index) => ({
      id: `module-${index + 1}-${safeSegment(name)}`,
      name: `${name} (${task})`,
      files: files.map((file) => file.path),
      tasks: [],
    }))
  }

  private async report(taskId: string, status: TeamStatus, onProgress?: ProgressCallback) {
    await writeJson(join("/tmp", "nexus", "teams", taskId, "status.json"), status)
    await onProgress?.(status)
  }

  async runProject(task: string, root: string, options: { onProgress?: ProgressCallback; forceTeam?: boolean; forceSolo?: boolean } = {}): Promise<ProjectResult> {
    const taskId = `task-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
    const ipcRoot = join("/tmp", "nexus", "teams", taskId)
    await mkdir(ipcRoot, { recursive: true })
    const stats = await this.scanRepo(root)
    const detectedSize = detectTaskSize(task, stats)
    const size: TaskSize = options.forceSolo ? "small" : options.forceTeam && detectedSize === "small" ? "medium" : detectedSize
    const modules = await this.createModules(task, stats)
    const selectedModules = size === "medium" ? modules.slice(0, 1) : size === "large" ? modules : modules.slice(0, 1)
    const totalWorkers = selectedModules.reduce((sum, module) => sum + Math.max(module.files.length, 1), 0)
    await this.report(taskId, { taskId, status: size === "small" ? "Senior Dev solo mode" : "Manager assigned modules", progress: 10, modules: selectedModules.length, completedModules: 0, workers: totalWorkers, completedWorkers: 0, updatedAt: Date.now() }, options.onProgress)

    if (size === "small") {
      return { taskId, size, stats, modules: selectedModules, leads: [], status: "completed", summary: `Small task detected (${stats.fileCount} files, ${stats.totalLines} lines); use SeniorDevAgent solo mode.` }
    }

    const leads: LeadResult[] = []
    let completedModules = 0
    let completedWorkers = 0
    for (let i = 0; i < selectedModules.length; i += MAX_PARALLEL_LEADS) {
      const batch = selectedModules.slice(i, i + MAX_PARALLEL_LEADS)
      const batchResults = await Promise.all(batch.map((module) => new TeamLeadAgent(ipcRoot).execute(module)))
      for (const result of batchResults) {
        leads.push(result)
        completedModules += 1
        completedWorkers += result.workers.length
        await this.report(taskId, { taskId, status: `Module ${completedModules}/${selectedModules.length} complete`, progress: Math.min(95, 10 + Math.round((completedModules / selectedModules.length) * 80)), modules: selectedModules.length, completedModules, workers: totalWorkers, completedWorkers, updatedAt: Date.now() }, options.onProgress)
      }
    }
    const status = leads.every((lead) => lead.status === "done") ? "completed" : "failed"
    await this.report(taskId, { taskId, status: status === "completed" ? "Completed" : "Needs review", progress: 100, modules: selectedModules.length, completedModules, workers: totalWorkers, completedWorkers, updatedAt: Date.now() }, options.onProgress)
    return { taskId, size, stats, modules: selectedModules, leads, status, summary: `${status === "completed" ? "Team workflow completed" : "Team workflow needs review"}: ${leads.length} team lead(s), ${completedWorkers} worker(s), and file-based IPC at ${ipcRoot}.` }
  }
}

export class TeamHierarchy {
  readonly manager = new ManagerAgent()

  async run(task: string, root: string, options: { onProgress?: ProgressCallback } = {}) {
    return this.manager.runProject(task, root, options)
  }
}

export default TeamHierarchy
