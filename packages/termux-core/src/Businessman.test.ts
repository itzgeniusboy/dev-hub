// @ts-nocheck -- this file is executed by Bun's test runner; production code remains type-checked separately.
import { expect, test } from "bun:test"
import { Businessman } from "./Businessman"
import type { StaffManager } from "./StaffManager"

const taskPlan = { workersNeeded: ["first", "second"], estimatedSize: "0MB", estimatedTime: "instant", taskType: "bot" }

function memoryQueue() {
  const updates: Array<{ id: string; state: string }> = []
  return {
    accept: async (id: string) => id,
    update: async (id: string, state: string) => { updates.push({ id, state }) },
    updates,
  }
}

test("throttles low-battery mobile tasks to one worker and releases the wake lock", async () => {
  const hired: string[] = []
  const calls: string[] = []
  const staff = {
    brain: { analyze: () => taskPlan, matchFreelancers: () => ["first", "second"] },
    hire: { hire: async (worker: string) => { hired.push(worker); return { success: true, sizeMB: 0 } }, },
    fire: { fireMany: async () => 0 },
  } as unknown as StaffManager
  const services = {
    acquireWakeLock: async () => { calls.push("lock") },
    releaseWakeLock: async () => { calls.push("unlock") },
    notify: async () => { calls.push("notify") },
    toast: async () => { calls.push("toast") },
  }
  const businessman = new Businessman({
    staff,
    services,
    botAgent: { execute: async () => ({}) },
    debugAgent: { execute: async () => ({}) },
    readPowerStatus: async () => ({ batteryPercent: 10, source: "termux" }),
    queue: memoryQueue(),
  })
  businessman.askUser = async () => false
  await businessman.handleTask("build")
  expect(hired).toEqual(["first"])
  expect(calls).toContain("lock")
  expect(calls).toContain("unlock")
})

test("releases wake locks and sends best-effort failure alerts when execution throws", async () => {
  const calls: string[] = []
  const staff = {
    brain: { analyze: () => taskPlan, matchFreelancers: () => [] },
    hire: { hire: async () => ({ success: true, sizeMB: 0 }) },
    fire: { fireMany: async () => 0 },
  } as unknown as StaffManager
  const businessman = new Businessman({
    staff,
    services: {
      acquireWakeLock: async () => { calls.push("lock") },
      releaseWakeLock: async () => { calls.push("unlock") },
      notify: async (title: string) => { calls.push(title) },
      toast: async (message: string) => { calls.push(message) },
    },
    botAgent: { execute: async () => { throw new Error("boom") } },
    debugAgent: { execute: async () => ({}) },
    readPowerStatus: async () => ({ batteryPercent: 80, source: "termux" }),
    queue: memoryQueue(),
  })
  await expect(businessman.handleTask("build")).rejects.toThrow("boom")
  expect(calls).toEqual(expect.arrayContaining(["lock", "unlock", "NEXUS task failed"]))
})

test("aborts before execution when required workers fail to install instead of reporting success", async () => {
  const calls: string[] = []
  const staff = {
    brain: { analyze: () => taskPlan, matchFreelancers: () => ["broken"] },
    hire: { hire: async () => ({ success: false, sizeMB: 0 }) },
    fire: { fireMany: async () => 0 },
  } as unknown as StaffManager
  const queue = memoryQueue()
  const businessman = new Businessman({
    staff,
    services: {
      acquireWakeLock: async () => { calls.push("lock") },
      releaseWakeLock: async () => { calls.push("unlock") },
      notify: async (title: string) => { calls.push(title) },
      toast: async () => {},
    },
    toolAgent: { execute: async () => ({}) },
    debugAgent: { execute: async () => ({}) },
    readPowerStatus: async () => ({ batteryPercent: 80, source: "termux" }),
    queue,
  })
  await expect(businessman.handleTask("build")).rejects.toThrow(/dependency installation failed/)
  expect(calls).not.toContain("NEXUS task completed")
  expect(queue.updates.at(-1)?.state).toBe("failed")
})
