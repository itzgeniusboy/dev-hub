import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"

export function Logo() {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" alignItems="center">
      <text fg={theme.background} selectable={false}>
        {" "}
      </text>
      <text fg={theme.textMuted} selectable={false}>
        {"       ◇      ◇      ◇"}
      </text>
      <text fg={theme.borderSubtle} selectable={false}>
        {"       │      │      │"}
      </text>
      <text fg={theme.borderActive} selectable={false}>
        {"   ╭──────┬──────┬──────╮"}
      </text>
      <box flexDirection="row">
        <text fg={theme.borderActive}>│</text>
        <text fg={theme.info}> PLAN  </text>
        <text fg={theme.borderActive}>│</text>
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          BUILD 
        </text>
        <text fg={theme.borderActive}>│</text>
        <text fg={theme.success}> CHECK </text>
        <text fg={theme.borderActive}>│</text>
      </box>
      <text fg={theme.borderActive} selectable={false}>
        {"   ╰──────┴──────┴──────╯"}
      </text>
      <text fg={theme.accent} attributes={TextAttributes.BOLD} selectable={false}>
        {"        ◉  POWER CORE"}
      </text>
      <text fg={theme.textMuted} selectable={false}>
        {"     MULTI-AGENT GRID ONLINE"}
      </text>
      <text fg={theme.background} selectable={false}>
        {" "}
      </text>
    </box>
  )
}

