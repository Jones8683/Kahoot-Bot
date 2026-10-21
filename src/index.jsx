import { format } from 'node:util';
import { render } from 'ink';
import App from './app.jsx';
import { leaveAll } from './bots.js';
import { log } from './state.js';

for (const method of ['log', 'info', 'warn', 'error']) {
  console[method] = (...args) => log('warn', format(...args));
}

process.stdout.write('\u001B]0;Kahoot Bot Manager\u0007');

log('info', 'Enter game PIN • help for commands');

const app = render(<App />, { alternateScreen: true, patchConsole: false });

try {
  await app.waitUntilExit();
} finally {
  await leaveAll();
}

process.exit();
