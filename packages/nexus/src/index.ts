import { EOL } from "os"

declare const NEXUS_VERSION: unknown

const args = process.argv.slice(2)
if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
  const version = typeof NEXUS_VERSION === "string" ? NEXUS_VERSION : "local"
  process.stdout.write(version + EOL)
  process.exit(0)
}

await import("./main")
