import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

export abstract class BaseAgent {
  protected name: string;
  protected workspaceDir: string = "/tmp/nexus/agents";

  constructor(name: string) {
    this.name = name;
  }

  abstract execute(task: string): Promise<string>;

  protected sendIPC(targetAgent: string, payload: any) {
    const file = join(this.workspaceDir, `${targetAgent}_inbox.json`);
    writeFileSync(file, JSON.stringify(payload));
  }

  protected readIPC(): any {
    const file = join(this.workspaceDir, `${this.name}_inbox.json`);
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }
}
