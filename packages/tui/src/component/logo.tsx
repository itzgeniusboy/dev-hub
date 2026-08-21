import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { wordmark } from "../logo"

const [wordmarkLeft, wordmarkRight] = wordmark.split(" ")

export function Logo() {
  const { theme } = useTheme()

  return (
    <box flexDirection="column">
      <text fg={theme.background} selectable={false}>
        {" "}
      </text>
      <box flexDirection="row">
        <text fg={theme.textMuted} selectable={false}>
          {wordmarkLeft}
        </text>
        <text fg={theme.background} selectable={false}>
          {" "}
        </text>
        <text fg={theme.text} attributes={TextAttributes.BOLD} selectable={false}>
          {wordmarkRight}
        </text>
      </box>
      <text fg={theme.background} selectable={false}>
        {" "}
      </text>
      <text fg={theme.background} selectable={false}>
        {" "}
      </text>
    </box>
  )
}
