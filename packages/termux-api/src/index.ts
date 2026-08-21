import { Effect } from "effect"

export const TermuxAPI = {
  initialize: () => Effect.sync(() => console.log("[TermuxAPI] Android Native Engine initialized (lazy-loaded)")),
  readSms: () => Effect.succeed("SMS read"),
  analyzeApk: (path: string) => Effect.succeed(`APK analyzed: ${path}`),
  notify: (title: string, content: string) => Effect.succeed(`Notification sent: ${title}`),
  clipboardGet: () => Effect.succeed("Clipboard read"),
  clipboardSet: (text: string) => Effect.succeed("Clipboard written"),
}
