import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { UserLiaison } from "@nexus/termux-core"
import { isBareUserTask, runBareUserTask } from "./quick-liaison"

const GIB = 1024 * 1024 * 1024

function memory(totalGiB: number, availableGiB: number) {
  return `MemTotal: ${totalGiB * 1024 * 1024} kB\nMemAvailable: ${availableGiB * 1024 * 1024} kB\n`
}

test("routes plain task input through the immediate liaison path", () => {
  assert.equal(isBareUserTask(["big task"]), true)
  assert.equal(isBareUserTask(["setup", "termux"]), false)
  assert.equal(isBareUserTask(["--help"]), false)
})

test("bare task acknowledgements expose simulated desktop High and Termux Low capacity plans", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexus-quick-liaison-"))
  const previousQueuePath = process.env.NEXUS_QUEUE_PATH
  try {
    for (const scenario of [
      { expected: "Device: PC (16GB) → HIGH mode", probe: { isTermux: false, totalMemoryBytes: 16 * GIB, processMemoryBytes: 0, meminfo: memory(16, 14) } },
      { expected: "Device: Termux (2GB) → LOW mode", probe: { isTermux: true, totalMemoryBytes: 2 * GIB, processMemoryBytes: 0, meminfo: memory(2, 1) } },
    ]) {
      process.env.NEXUS_QUEUE_PATH = join(root, `${scenario.probe.isTermux ? "termux" : "desktop"}.json`)
      const output: string[] = []
      const liaison = new UserLiaison({ background: true, notify: false, capacityProbe: scenario.probe })
      await runBareUserTask(["big task"], { liaison, write: (text) => output.push(text) })
      assert.match(output.join(""), new RegExp(scenario.expected.replace(/[()]/g, "\\$&")))
      assert.doesNotMatch(output.join(""), /queued/i)
    }
  } finally {
    if (previousQueuePath === undefined) delete process.env.NEXUS_QUEUE_PATH
    else process.env.NEXUS_QUEUE_PATH = previousQueuePath
    await rm(root, { recursive: true, force: true })
  }
})

test("bare task failures exit non-zero with a clean message instead of leaking internals", async () => {
  const failingLiaison = {
    handleUserMessage: async () => {
      throw new Error("EROFS: read-only file system, mkdir '/tmp'")
    },
  } as unknown as UserLiaison
  const previousExitCode = process.exitCode
  const errors: string[] = []
  const originalStderrWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((text: string) => {
    errors.push(String(text))
    return true
  }) as typeof process.stderr.write
  try {
    await runBareUserTask(["big task"], { liaison: failingLiaison })
    assert.equal(process.exitCode, 1)
    assert.match(errors.join(""), /Task failed: EROFS/)
    assert.doesNotMatch(errors.join(""), /async function/)
  } finally {
    process.stderr.write = originalStderrWrite
    if (previousExitCode === undefined) process.exitCode = 0
    else process.exitCode = previousExitCode
  }
})
