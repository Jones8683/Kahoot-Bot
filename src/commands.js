import { addBots, changePin, kickAll, kickBot } from './bots.js';
import { parseNames } from './names.js';
import { log, state } from './state.js';

const HELP_TEXT = [
  'Commands:',
  '  pin <pin>',
  '  add <name>',
  '  add <name>*<count>',
  '  add <name>~<count>',
  '  kick <name>',
  '  kick all',
  '  help',
  '  exit',
].join('\n');

function parsePin(text) {
  if (!/^\d+$/u.test(text)) return 0;
  const pin = Number(text);
  return Number.isSafeInteger(pin) && pin > 0 ? pin : 0;
}

function setPin(text) {
  const pin = parsePin(text);
  if (!pin) {
    log('err', 'Enter a valid game PIN');
  } else if (pin === state.pin) {
    log('info', `PIN already ${pin}`);
  } else {
    changePin(pin);
    log('ok', `PIN set to ${pin}`);
  }
}

const COMMANDS = {
  help() {
    log('info', HELP_TEXT);
  },
  pin: setPin,
  add(argument) {
    const { names, error } = parseNames(argument);
    if (error || names.length === 0) {
      log('err', error || 'Enter a bot name');
    } else {
      addBots(names);
    }
  },
  kick(argument) {
    if (!argument) {
      log('err', 'Enter a bot name');
    } else if (argument.toLowerCase() === 'all') {
      kickAll();
      log('info', 'All bots removed');
    } else {
      const count = kickBot(argument);
      if (count === 0) log('warn', 'Bot not found');
      else log('info', count === 1 ? `${argument} removed` : `${argument} removed x${count}`);
    }
  },
};

export function runCommand(text, exit) {
  const [command, ...rest] = text.split(/\s+/u);
  const name = command.toLowerCase();
  const argument = rest.join(' ');

  if (name === 'exit') {
    exit();
  } else if (!state.pin && name !== 'help' && name !== 'pin') {
    setPin(command);
  } else if (COMMANDS[name]) {
    COMMANDS[name](argument);
  } else {
    log('err', 'Unknown command · help for commands');
  }
}
