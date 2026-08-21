import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TermuxAdapter } from "./TermuxAdapter";

export class ToolGenerator {
  static generateTool(name: string, description: string) {
    const toolDir = join(TermuxAdapter.homePath, ".nexus", "tools", name);
    mkdirSync(toolDir, { recursive: true });

    // Generate installation script
    const installScript = `#!/bin/bash
echo "Installing dependencies for ${name}..."
${TermuxAdapter.packageManager} update -y
# Add dependencies here based on the tool description
`;
    writeFileSync(join(toolDir, "install.sh"), installScript, { mode: 0o755 });

    // Generate runner script
    const runScript = `#!/bin/bash
echo "Running NEXUS Tool: ${name}"
# Tool logic goes here
`;
    writeFileSync(join(toolDir, "run.sh"), runScript, { mode: 0o755 });

    console.log(`[NEXUS] Termux tool '${name}' scaffolded at ${toolDir}`);
    console.log(`To add to PATH, run: echo 'export PATH="$PATH:${toolDir}"' >> ~/.bashrc`);
  }
}
