import { addBots, changePin, kickAll, kickBot } from "./bots.js";
import { parseNames } from "./names.js";
import { log, state } from "./state.js";

const HELP_TEXT = [
  "Commands:",
  "  pin <pin>            Join a different game",
  "  add <name>           Add one bot",
  "  add <name>*<count>   Add bots named name1, name2, ...",
  "  add <name>~<count>   Add bots that all show the same name",
  "  kick <name>          Remove every bot with that name",
  "  kick all             Remove all bots",
  "  help                 Show this list",
  "  exit                 Remove all bots and quit",
].join("\n");

function parsePin(text) {
  if (!/^\d+$/.test(text)) return 0;
  const pin = Number(text);
  return Number.isSafeInteger(pin) && pin > 0 ? pin : 0;
}

function setPin(text) {
  const pin = parsePin(text);
  if (!pin) {
    log("err", "Enter a valid game PIN");
  } else if (pin === state.pin) {
    log("info", `PIN already ${pin}`);
  } else {
    changePin(pin);
    log("ok", `PIN set to ${pin}`);
  }
}

const COMMANDS = {
  help() {
    log("info", HELP_TEXT);
  },
  pin: setPin,
  add(argument) {
    const { names, error } = parseNames(argument);
    if (error || !names.length) {
      log("err", error || "Enter a bot name");
    } else {
      addBots(names);
    }
  },
  kick(argument) {
    if (!argument) {
      log("err", "Enter a bot name");
    } else if (argument.toLowerCase() === "all") {
      kickAll();
      log("info", "All bots removed");
    } else {
      kickBot(argument);
    }
  },
};

export function runCommand(text, exit) {
  const [command, ...rest] = text.split(/\s+/);
  const name = command.toLowerCase();
  const argument = rest.join(" ");

  log("cmd", text);

  if (name === "exit") {
    exit();
  } else if (!state.pin && name !== "help" && name !== "pin") {
    setPin(command);
  } else if (COMMANDS[name]) {
    COMMANDS[name](argument);
  } else {
    log("err", "Unknown command. Run help to list commands");
  }
}
