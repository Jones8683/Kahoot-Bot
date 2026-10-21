import { useState, useSyncExternalStore } from 'react';
import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import TextInput from 'ink-text-input';
import { runCommand } from './commands.js';
import { getSnapshot, subscribe } from './state.js';

const LOG_STYLES = {
  info: { symbol: 'i', color: 'cyan' },
  ok: { symbol: '+', color: 'green' },
  warn: { symbol: '!', color: 'yellow' },
  err: { symbol: 'x', color: 'red' },
};

function Panel({ title, color, alignBottom = false, children, ...props }) {
  return (
    <Box borderStyle="round" borderColor={color} paddingX={1} {...props}>
      <Box position="absolute" top={-1} left={1}>
        <Text bold color={color}>{` ${title} `}</Text>
      </Box>
      <Box
        flexDirection="column"
        flexGrow={1}
        overflow="hidden"
        justifyContent={alignBottom ? 'flex-end' : 'flex-start'}
      >
        <Box flexDirection="column" flexShrink={0}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

function Header({ pin, joining }) {
  return (
    <Box paddingX={1} gap={3} flexShrink={0}>
      <Text bold color="magenta">
        Kahoot Bot Manager
      </Text>
      {pin ? (
        <Text>
          PIN{' '}
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

export default function App() {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const { pin, bots, joining, logs } = useSyncExternalStore(subscribe, getSnapshot);
  const [input, setInput] = useState('');
  const [scroll, setScroll] = useState(0);

  useInput((_, key) => {
    const page = Math.max(1, rows - 7);
    if (key.pageUp)
      setScroll((current) => Math.min(Math.max(0, logs.length - page - 1), current + page));
    if (key.pageDown) setScroll((current) => Math.max(0, current - page));
  });

  function submit(text) {
    setInput('');
    if (text.trim()) runCommand(text.trim(), exit);
  }

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header pin={pin} joining={joining} />
      <Box flexGrow={1}>
        <Panel title={`Bots (${bots.length})`} color="yellow" width="35%">
          {bots.length > 0 ? (
            bots.slice(0, rows).map((bot) => (
              <Text key={bot.id} wrap="truncate-end">
                {bot.name}
              </Text>
            ))
          ) : (
            <Text dimColor>No bots yet</Text>
          )}
        </Panel>
        <Panel
          title={scroll > 0 ? 'Logs (scrolled up)' : 'Logs'}
          color="cyan"
          flexGrow={1}
          alignBottom
        >
          {logs.slice(0, logs.length - scroll).map(({ id, level, text }) => (
            <Text key={id}>
              <Text bold color={LOG_STYLES[level].color}>
                {LOG_STYLES[level].symbol}
              </Text>{' '}
              {text}
            </Text>
          ))}
        </Panel>
      </Box>
      <Panel title={pin ? 'Command' : 'Game PIN'} color="green" flexShrink={0}>
        <Box>
          <Text bold color="green">
            {'› '}
          </Text>
          <TextInput value={input} onChange={setInput} onSubmit={submit} />
        </Box>
      </Panel>
    </Box>
  );
}
