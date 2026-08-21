import { BaseAgent } from "./BaseAgent";

export class BashAgent extends BaseAgent {
  constructor() { super("BashAgent"); }
  async execute(task: string): Promise<string> {
    return `[BashAgent] Generated bash script for: ${task}`;
  }
}

export class PyAgent extends BaseAgent {
  constructor() { super("PyAgent"); }
  async execute(task: string): Promise<string> {
    return `[PyAgent] Generated python script for: ${task}`;
  }
}

export class BotAgent extends BaseAgent {
  constructor() { super("BotAgent"); }
  async execute(task: string): Promise<string> {
    return `[BotAgent] Scaffolded telegram bot for: ${task}`;
  }
}

export class FixAgent extends BaseAgent {
  constructor() { super("FixAgent"); }
  async execute(task: string): Promise<string> {
    return `[FixAgent] Analyzed logs and generated fix for: ${task}`;
  }
}
