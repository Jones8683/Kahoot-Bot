import { useCallback, useState, useSyncExternalStore } from "react";
import { Box, Text, useInput, useWindowSize } from "ink";
import wrapAnsi from "wrap-ansi";
import { runCommand } from "./commands.js";
import Prompt from "./prompt.jsx";
import ScrollPanel from "./scroll-panel.jsx";
import { getSnapshot, subscribe } from "./state.js";

const LOG_STYLES = {
  cmd: { symbol: "›", color: "magenta" },
  info: { symbol: "i", color: "cyan" },
  ok: { symbol: "+", color: "green" },
  warn: { symbol: "!", color: "yellow" },
  err: { symbol: "x", color: "red" },
};

const SHORTCUTS = [
  ["help", "commands"],
  ["↑↓", "history"],
  ["Tab", "switch panel"],
  ["PgUp/PgDn", "scroll"],
  ["Ctrl+C", "exit"],
];

function logRows(logs, width) {
  return logs.flatMap(({ id, level, text }) => {
    const { symbol, color } = LOG_STYLES[level];
    return wrapAnsi(text, Math.max(1, width - 2), { hard: true, trim: false })
      .split("\n")
      .map((line, index) => (
        <Text key={`${id}:${index}`} wrap="truncate-end">
          <Text bold color={color}>
            {index ? " " : symbol}
          </Text>{" "}
          {line}
        </Text>
      ));
  });
}

function Header({ pin, joining }) {
  return (
    <Box paddingX={1} gap={3}>
      <Text bold color="magenta">
        Kahoot Bot Manager
      </Text>
      {pin ? (
        <Text>
          PIN{" "}
          <Text bold color="green">
            {pin}
          </Text>
        </Text>
      ) : (
        <Text color="yellow">No game PIN set</Text>
      )}
      {joining > 0 && <Text color="yellow">{joining} joining...</Text>}
    </Box>
  );
}

function Footer() {
  return (
    <Box paddingX={1} columnGap={3} flexWrap="wrap">
      {SHORTCUTS.map(([key, action]) => (
        <Text key={key} dimColor>
          <Text bold>{key}</Text> {action}
        </Text>
      ))}
    </Box>
  );
}

export default function App({ onExit }) {
  const { columns, rows } = useWindowSize();
  const { pin, bots, joining, logs } = useSyncExternalStore(subscribe, getSnapshot);
  const [focus, setFocus] = useState("logs");

  useInput((input, key) => {
    if (key.ctrl && input === "c") onExit();
    else if (key.tab) setFocus((current) => (current === "logs" ? "bots" : "logs"));
  });

  const botRows = useCallback(
    () =>
      bots.map((name, index) => (
        <Text key={index} wrap="truncate-end">
          {name}
        </Text>
      )),
    [bots],
  );
  const buildLogRows = useCallback((width) => logRows(logs, width), [logs]);

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header pin={pin} joining={joining} />
      <Box flexGrow={1}>
        <ScrollPanel
          title={`Bots (${bots.length})`}
          color="yellow"
          width="35%"
          focused={focus === "bots"}
          rows={botRows}
          emptyText="No bots yet"
        />
        <ScrollPanel
          title="Logs"
          color="cyan"
          flexGrow={1}
          focused={focus === "logs"}
          anchor="bottom"
          rows={buildLogRows}
        />
      </Box>
      <Prompt title={pin ? "Command" : "Game PIN"} onSubmit={(text) => runCommand(text, onExit)} />
      <Footer />
    </Box>
  );
}
