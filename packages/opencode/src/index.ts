import { EOL } from "os"

declare const OPENCODE_VERSION: unknown

const args = process.argv.slice(2)
if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
  const version = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
  process.stdout.write(version + EOL)
  process.exit(0)
}

await import("./main")
