import { BaseAgent } from "./BaseAgent";
import { mkdirSync } from "node:fs";

export class Orchestrator {
  private agents: Map<string, BaseAgent> = new Map();

  constructor() {
    mkdirSync("/tmp/devhub/agents", { recursive: true });
  }

  register(agent: BaseAgent) {
    this.agents.set((agent as any).name, agent);
  }

  async dispatch(task: string): Promise<string> {
    // Very simple dispatch logic for the lightweight core
    if (task.includes("bot")) {
      return this.agents.get("BotAgent")?.execute(task) || "No BotAgent registered";
    }
    if (task.includes("python")) {
      return this.agents.get("PyAgent")?.execute(task) || "No PyAgent registered";
    }
    return this.agents.get("BashAgent")?.execute(task) || "No BashAgent registered";
  }
}
