export type NexusApiKeyProvider = {
  id: "groq" | "openrouter" | "deepseek" | "gemini" | "cerebras" | "openai" | "opencode"
  name: string
}

export const NEXUS_API_KEY_PROVIDERS: NexusApiKeyProvider[] = [
  { id: "groq", name: "Groq" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "gemini", name: "Gemini" },
  { id: "cerebras", name: "Cerebras" },
  { id: "openai", name: "OpenAI" },
  { id: "opencode", name: "OpenCode" },
]
