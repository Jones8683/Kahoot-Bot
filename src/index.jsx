import { format } from 'node:util';
import { render } from 'ink';
import App from './app.jsx';
import { leaveAll } from './bots.js';
import { log } from './state.js';

for (const method of ['log', 'info', 'warn', 'error']) {
  console[method] = (...args) => log('warn', format(...args));
}

log('info', 'Enter the game PIN to start, then type help to see commands');

const app = render(<App />, { alternateScreen: true, patchConsole: false });

try {
  await app.waitUntilExit();
} finally {
  await leaveAll();
}

process.exit();
