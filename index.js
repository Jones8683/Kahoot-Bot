import blessed from "blessed";
import Kahoot from "kahoot.js-latest";

const MAX_BATCH_SIZE = 10000;
const DEFAULT_PARALLEL_JOINS = 35;
const HEADER_COLOR = "magenta";
const STATUS_STYLES = {
  info: { symbol: "[i]", color: "cyan" },
  ok: { symbol: "[+]", color: "green" },
  warn: { symbol: "[!]", color: "yellow" },
  err: { symbol: "[x]", color: "red" },
};

const INVIS = ["\u200B", "\u200C", "\u200D", "\u2060"];

function invisibleSuffix(index) {
  if (index === 0) return "";
  let result = "";
  let n = index;
  while (n > 0) {
    result += INVIS[(n - 1) % INVIS.length];
    n = Math.floor((n - 1) / INVIS.length);
  }
  return result;
}

function toChars(s) {
  return Array.from(String(s || ""));
}

const botStates = new Map();

let gamePin = 0;
let inputBuffer = "";
let cursorIndex = 0;
let inputScroll = 0;
let shuttingDown = false;
const commandHistory = [];
let historyIndex = -1;
let historySavedInput = "";
let commandQueue = Promise.resolve();
const PANEL_OPTIONS = {
  tags: true,
  padding: { left: 1, right: 1 },
  border: { type: "line" },
};
const SCROLL_OPTIONS = {
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  scrollbar: { bg: "gray" },
};

const screen = blessed.screen({
  smartCSR: true,
  title: "Kahoot Bot Manager",
  cursor: {
    artificial: false,
    shape: "line",
    blink: true,
  },
});

function createPanel(type, options) {
  return blessed[type]({
    ...PANEL_OPTIONS,
    ...options,
  });
}

const header = createPanel("box", {
  top: 0,
  left: 0,
  width: "100%",
  height: 3,
  content: "{bold}Kahoot Bot Manager{/bold}\nType help for commands",
  style: {
    fg: HEADER_COLOR,
    bg: "#1f1230",
    border: { fg: HEADER_COLOR },
    label: { fg: HEADER_COLOR, bold: true },
  },
});

const botsBox = createPanel("box", {
  top: 3,
  left: 0,
  width: "35%",
  bottom: 3,
  ...SCROLL_OPTIONS,
  label: " Active Bots ",
  content: "(none)",
  style: {
    fg: "white",
    bg: "#2d2a10",
    border: { fg: "yellow" },
    label: { fg: "yellow", bold: true },
  },
});

const logsBox = createPanel("log", {
  top: 3,
  left: "35%",
  width: "65%",
  bottom: 3,
  ...SCROLL_OPTIONS,
  label: " Logs ",
  style: {
    fg: "white",
    bg: "#3d3410",
    border: { fg: "yellow" },
    label: { fg: "yellow", bold: true },
  },
});

const inputBox = createPanel("box", {
  bottom: 0,
  left: 0,
  width: "100%",
  height: 3,
  label: " Input ",
  style: {
    fg: "white",
    bg: "#0f2e13",
    border: { fg: "green" },
    label: { fg: "green", bold: true },
  },
});

screen.append(header);
screen.append(botsBox);
screen.append(logsBox);
screen.append(inputBox);

function currentPrompt() {
  return gamePin ? "CMD> " : "PIN> ";
}

function setCursorVisible(visible) {
  if (visible) {
    screen.program.showCursor();
  } else {
    screen.program.hideCursor();
  }
}

function renderInput() {
  const prompt = currentPrompt();
  const chars = toChars(inputBuffer);
  const totalWidth = Math.max(1, (inputBox.width || 1) - 4);
  const promptChars = toChars(prompt).length;
  const fieldWidth = Math.max(1, totalWidth - promptChars);

  if (cursorIndex < inputScroll) {
    inputScroll = cursorIndex;
  }
  if (cursorIndex > inputScroll + fieldWidth) {
    inputScroll = cursorIndex - fieldWidth;
  }

  const visible = chars.slice(inputScroll, inputScroll + fieldWidth).join("");
  inputBox.setContent(`${prompt}${visible}`);

  screen.render();

  const relativeCursor = Math.max(0, Math.min(fieldWidth, cursorIndex - inputScroll));
  const row = inputBox.atop + 1;
  const col = inputBox.aleft + 2 + promptChars + relativeCursor;
  setCursorVisible(true);
  screen.program.cup(row, col);
}

function setInputBuffer(value) {
  inputBuffer = value;
  cursorIndex = toChars(value).length;
  inputScroll = 0;
}

function insertChar(ch) {
  const chars = toChars(inputBuffer);
  chars.splice(cursorIndex, 0, ch);
  inputBuffer = chars.join("");
  cursorIndex += 1;
}

function removeCharBeforeCursor() {
  if (cursorIndex <= 0) {
    return;
  }
  const chars = toChars(inputBuffer);
  chars.splice(cursorIndex - 1, 1);
  inputBuffer = chars.join("");
  cursorIndex -= 1;
}

function removeCharAtCursor() {
  const chars = toChars(inputBuffer);
  if (cursorIndex >= chars.length) {
    return;
  }
  chars.splice(cursorIndex, 1);
  inputBuffer = chars.join("");
}

function formatError(err) {
  if (typeof err === "string") return err;
  return String(err?.description || err?.message || "unknown error");
}

function parsePin(value) {
  const text = String(value || "").trim();
  if (!/^\d+$/.test(text)) {
    return 0;
  }
  const pin = Number(text);
  return Number.isSafeInteger(pin) && pin > 0 ? pin : 0;
}

function randomAnswer(question) {
  if (
    question &&
    Array.isArray(question.quizQuestionAnswers) &&
    question.quizQuestionAnswers.length > 0
  ) {
    return Math.floor(Math.random() * question.quizQuestionAnswers.length);
  }
  if (question && Array.isArray(question.choices) && question.choices.length > 0) {
    return Math.floor(Math.random() * question.choices.length);
  }
  if (question && Number.isInteger(question.numberOfChoices) && question.numberOfChoices > 0) {
    return Math.floor(Math.random() * question.numberOfChoices);
  }
  return Math.floor(Math.random() * 4);
}

function logStatus(level, text) {
  const entry = STATUS_STYLES[level] || STATUS_STYLES.info;

  logsBox.log(
    `{${entry.color}-fg}{bold}${entry.symbol}{/bold}{/${entry.color}-fg}  {white-fg}${text}{/white-fg}`,
  );
  logsBox.setScrollPerc(100);
  renderInput();
}

function leaveBot(name, client) {
  try {
    client.leave(true);
  } catch (err) {
    logStatus("warn", `${name} could not be removed: ${formatError(err)}`);
  }
}

function refreshBots() {
  const names = Array.from(botStates.entries())
    .filter(([, state]) => state.status === "active")
    .map(([, state]) => state.name)
    .reverse();

  const count = names.length;
  botsBox.setLabel(count > 0 ? ` Active Bots {yellow-fg}(${count}){/yellow-fg} ` : " Active Bots ");

  if (names.length === 0) {
    botsBox.setContent("(none)");
    renderInput();
    return;
  }

  botsBox.setContent(names.join("\n"));
  renderInput();
}

async function connectBot(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    return "skipped";
  }

  const client = new Kahoot();
  const botId = Symbol(cleanName);
  botStates.set(botId, {
    client,
    name: cleanName,
    status: "joining",
    pendingKick: false,
    mutedDisconnect: false,
  });

  client.on("QuestionStart", (question) => {
    client.answer(randomAnswer(question)).catch(() => {});
  });

  client.on("Disconnect", (reason) => {
    const state = botStates.get(botId);
    if (!state || state.client !== client) {
      return;
    }
    botStates.delete(botId);
    if (state.status === "active") {
      refreshBots();
    }
    if (state.mutedDisconnect) {
      return;
    }
    const msg = reason || "unknown";
    logStatus("warn", `${cleanName} disconnected: ${msg}`);
  });

  try {
    await client.join(gamePin, cleanName);
    const state = botStates.get(botId);
    if (!state || state.client !== client) {
      return "skipped";
    }

    if (state.pendingKick) {
      state.mutedDisconnect = true;
      leaveBot(cleanName, client);
      botStates.delete(botId);
      logStatus("info", `${cleanName} removed`);
      return "skipped";
    }

    state.status = "active";
    refreshBots();
    logStatus("ok", `${cleanName} connected`);
    return "connected";
  } catch (err) {
    botStates.delete(botId);
    logStatus("err", `${cleanName} failed: ${formatError(err)}`);
    return "failed";
  }
}

function normalizeNames(names) {
  return names.map((name) => String(name || "").trim()).filter(Boolean);
}

function parseNameExpression(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return { names: [], error: "name is required" };
  }

  const pattern = text.match(/^(.*?)\s*([*~])\s*(\d+)$/);
  if (pattern) {
    const name = pattern[1].trim();
    const count = Number.parseInt(pattern[3], 10);
    if (!name) {
      return { names: [], error: "name cannot be empty" };
    }
    if (!Number.isFinite(count) || count <= 0) {
      return {
        names: [],
        error: "count must be a positive number",
      };
    }
    if (count > MAX_BATCH_SIZE) {
      return {
        names: [],
        error: `count too large (max ${MAX_BATCH_SIZE})`,
      };
    }

    const suffix = pattern[2] === "*" ? (index) => index + 1 : invisibleSuffix;
    return {
      names: Array.from({ length: count }, (_, index) => `${name}${suffix(index)}`),
      error: "",
    };
  }

  return { names: [text], error: "" };
}

async function addMany(names, parallelLimit) {
  const cleanNames = normalizeNames(names);
  if (cleanNames.length === 0) {
    logStatus("warn", "No valid names");
    return;
  }

  const workers = Math.max(1, Math.min(parallelLimit, cleanNames.length));
  let index = 0;

  async function runWorker() {
    while (index < cleanNames.length) {
      const current = cleanNames[index];
      index += 1;
      await connectBot(current);
    }
  }

  const tasks = [];
  for (let i = 0; i < workers; i += 1) {
    tasks.push(runWorker());
  }

  await Promise.all(tasks);
}

function cleanupBot(botId, state = botStates.get(botId)) {
  if (!state) {
    return;
  }
  state.mutedDisconnect = true;
  botStates.delete(botId);
  refreshBots();
  leaveBot(state.name, state.client);
}

function kickBot(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    logStatus("warn", "kick requires a bot name");
    return false;
  }

  const entry = Array.from(botStates.entries())
    .reverse()
    .find(([, state]) => state.name === cleanName);
  if (!entry) {
    logStatus("warn", `${cleanName} not found`);
    return false;
  }
  const [botId, state] = entry;

  if (state.status === "joining") {
    state.pendingKick = true;
    logStatus("info", `${cleanName} removed`);
    return true;
  }

  cleanupBot(botId, state);
  logStatus("info", `${cleanName} removed`);
  return true;
}

function kickAll() {
  for (const [name, state] of botStates) {
    if (state.status === "joining") {
      state.pendingKick = true;
    } else {
      cleanupBot(name, state);
    }
  }
  refreshBots();
}
function showHelp() {
  logStatus("info", [
    "Commands:",
    "  pin <pin>",
    "  add <name>",
    "  add <name>*<count>",
    "  add <name>~<count>",
    "  kick <name>",
    "  kick all",
    "  help",
    "  exit",
  ].join("\n"));
}

async function executeAdd(expression) {
  if (!gamePin) {
    commandError("Set a valid PIN before adding bots");
    return;
  }

  const parsed = parseNameExpression(expression);

  if (parsed.error) {
    logStatus("err", parsed.error);
    return;
  }

  await addMany(parsed.names, DEFAULT_PARALLEL_JOINS);
}

function commandError(message) {
  logStatus("err", message);
}

function validateCommandArgs(command, args, { min = 0, max = Infinity, message } = {}) {
  if (args.length < min || args.length > max) {
    commandError(message || `${command} requires ${min} argument${min === 1 ? "" : "s"}`);
    return false;
  }
  return true;
}

const COMMANDS = {
  pin(tokens) {
    if (!validateCommandArgs("pin", tokens, { min: 1, max: 1, message: "Invalid PIN" })) {
      return;
    }

    const nextPin = parsePin(tokens[0]);
    if (!nextPin) {
      commandError("Invalid PIN");
    } else if (nextPin !== gamePin) {
      kickAll();
      gamePin = nextPin;
      logStatus("ok", `PIN set to ${gamePin}`);
    } else {
      logStatus("info", `PIN already ${gamePin}`);
    }
  },
  add(_tokens, argument) {
    return executeAdd(argument);
  },
  kick(tokens, argument) {
    if (tokens.length === 1 && tokens[0].toLowerCase() === "all") {
      kickAll();
      logStatus("info", "All bots removed");
      return;
    }

    if (validateCommandArgs("kick", tokens, { min: 1, message: "kick requires a bot name" })) {
      kickBot(argument);
    }
  },
};

async function handleCommand(text) {
  const clean = text.trim();
  if (!clean) {
    renderInput();
    return;
  }

  const [command, ...tokens] = clean.split(/\s+/);
  const name = command.toLowerCase();
  const argument = tokens.join(" ");

  if (name === "exit" || name === "quit") {
    await shutdown(0);
    return;
  }
  if (name === "help") {
    showHelp();
    return;
  }

  if (!gamePin) {
    const pin = parsePin(name === "pin" && tokens.length === 1 ? tokens[0] : command);
    if (!pin) {
      commandError("Enter a numeric PIN first");
      return;
    }
    gamePin = pin;
    logStatus("ok", `PIN set to ${gamePin}`);
    return;
  }

  const handler = COMMANDS[name];
  if (!handler) {
    commandError("Unknown command. Run help to list commands");
    return;
  }
  await handler(tokens, argument);
}

function submitCurrentInput() {
  const value = inputBuffer;
  setInputBuffer("");

  if (value.trim()) {
    commandHistory.unshift(value);
    if (commandHistory.length > 100) {
      commandHistory.pop();
    }
  }
  historyIndex = -1;
  historySavedInput = "";

  renderInput();

  commandQueue = commandQueue
    .then(() => handleCommand(value))
    .catch((err) => {
      logStatus("err", `Fatal error: ${formatError(err)}`);
      return shutdown(1);
    });
}

async function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  try {
    kickAll();
  } catch (err) {
    console.error(`Failed to remove bots during shutdown: ${formatError(err)}`);
  }

  setCursorVisible(true);
  screen.destroy();
  process.exit(exitCode);
}

process.on("uncaughtException", (err) => {
  logStatus("err", `Uncaught error: ${formatError(err)}`);
  shutdown(1).catch(() => {
    process.exit(1);
  });
});

process.on("unhandledRejection", (reason) => {
  logStatus("err", `Unhandled rejection: ${formatError(reason)}`);
  shutdown(1).catch(() => {
    process.exit(1);
  });
});

function handleExitSignal() {
  shutdown(0).catch(() => {
    process.exit(0);
  });
}

for (const signal of ["SIGHUP", "SIGTERM", "SIGINT"]) {
  process.on(signal, handleExitSignal);
}

screen.key(["C-c"], handleExitSignal);

screen.on("keypress", (ch, key) => {
  if (key?.ctrl) {
    return;
  }

  switch (key?.name) {
    case "enter":
      submitCurrentInput();
      return;
    case "up":
      if (commandHistory.length === 0) return;
      if (historyIndex === -1) historySavedInput = inputBuffer;
      historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setInputBuffer(commandHistory[historyIndex]);
      break;
    case "down":
      if (historyIndex === -1) return;
      historyIndex -= 1;
      setInputBuffer(historyIndex === -1 ? historySavedInput : commandHistory[historyIndex]);
      break;
    case "left":
      cursorIndex = Math.max(0, cursorIndex - 1);
      break;
    case "right":
      cursorIndex = Math.min(toChars(inputBuffer).length, cursorIndex + 1);
      break;
    case "home":
      cursorIndex = 0;
      break;
    case "end":
      cursorIndex = toChars(inputBuffer).length;
      break;
    case "backspace":
      removeCharBeforeCursor();
      break;
    case "delete":
      removeCharAtCursor();
      break;
    default:
      if (typeof ch !== "string" || ch < " " || ch === "\u007f") return;
      insertChar(ch);
  }

  renderInput();
});

screen.on("resize", () => {
  renderInput();
});

refreshBots();
setInputBuffer("");
renderInput();
logStatus("info", "Enter PIN to start");
logStatus("info", "Run help to list commands");
