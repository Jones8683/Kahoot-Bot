"use strict";

const blessed = require("blessed");
const Kahoot = require("kahoot.js-latest");

const MAX_BATCH_SIZE = 10000;
const DEFAULT_PARALLEL_JOINS = 35;
const HEADER_COLOR = "magenta";

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

const bots = new Map();
const joining = new Set();
const pendingKick = new Set();
const mutedDisconnect = new Set();

let gamePin = 0;
let waitingForPin = true;
let inputBuffer = "";
let cursorIndex = 0;
let inputScroll = 0;
let shuttingDown = false;
const commandHistory = [];
let historyIndex = -1;
let historySavedInput = "";

const screen = blessed.screen({
  smartCSR: true,
  title: "Kahoot Bot Manager",
  cursor: {
    artificial: false,
    shape: "line",
    blink: true,
  },
});

const header = blessed.box({
  top: 0,
  left: 0,
  width: "100%",
  height: 3,
  tags: true,
  padding: { left: 1, right: 1 },
  content: "{bold}Kahoot Bot Manager{/bold}\nType help for commands",
  border: { type: "line" },
  style: {
    fg: HEADER_COLOR,
    bg: "#1f1230",
    border: { fg: HEADER_COLOR },
    label: { fg: HEADER_COLOR, bold: true },
  },
});

const botsBox = blessed.box({
  top: 3,
  left: 0,
  width: "45%",
  bottom: 3,
  tags: true,
  padding: { left: 1, right: 1 },
  label: " Active Bots ",
  border: { type: "line" },
  content: "(none)",
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  scrollbar: { bg: "gray" },
  style: {
    fg: "white",
    bg: "#2d2a10",
    border: { fg: "yellow" },
    label: { fg: "yellow", bold: true },
  },
});

const logsBox = blessed.log({
  top: 3,
  left: "45%",
  width: "55%",
  bottom: 3,
  tags: true,
  padding: { left: 1, right: 1 },
  label: " Status ",
  border: { type: "line" },
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  scrollbar: { bg: "gray" },
  style: {
    fg: "white",
    bg: "#3d3410",
    border: { fg: "yellow" },
    label: { fg: "yellow", bold: true },
  },
});

const inputBox = blessed.box({
  bottom: 0,
  left: 0,
  width: "100%",
  height: 3,
  tags: true,
  padding: { left: 1, right: 1 },
  label: " Input ",
  border: { type: "line" },
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
  return waitingForPin ? "PIN> " : "CMD> ";
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
  const chars = Array.from(inputBuffer);
  const totalWidth = Math.max(1, (inputBox.width || 1) - 4);
  const promptChars = Array.from(prompt).length;
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

  const relativeCursor = Math.max(
    0,
    Math.min(fieldWidth, cursorIndex - inputScroll),
  );
  const row = inputBox.atop + 1;
  const col = inputBox.aleft + 2 + promptChars + relativeCursor;
  setCursorVisible(true);
  screen.program.cup(row, col);
}

function setInputBuffer(value) {
  inputBuffer = value;
  cursorIndex = Array.from(value).length;
  inputScroll = 0;
}

function insertChar(ch) {
  const chars = Array.from(inputBuffer);
  chars.splice(cursorIndex, 0, ch);
  inputBuffer = chars.join("");
  cursorIndex += 1;
}

function removeCharBeforeCursor() {
  if (cursorIndex <= 0) {
    return;
  }
  const chars = Array.from(inputBuffer);
  chars.splice(cursorIndex - 1, 1);
  inputBuffer = chars.join("");
  cursorIndex -= 1;
}

function removeCharAtCursor() {
  const chars = Array.from(inputBuffer);
  if (cursorIndex >= chars.length) {
    return;
  }
  chars.splice(cursorIndex, 1);
  inputBuffer = chars.join("");
}

function formatError(err) {
  if (err && err.description) {
    return String(err.description);
  }
  if (err && err.message) {
    return String(err.message);
  }
  if (typeof err === "string") {
    return err;
  }
  return "unknown error";
}

function parsePin(value) {
  const pin = Number.parseInt(value, 10);
  if (!Number.isFinite(pin) || pin <= 0) {
    return 0;
  }
  return pin;
}

function randomAnswer(question) {
  if (
    question &&
    Array.isArray(question.quizQuestionAnswers) &&
    question.quizQuestionAnswers.length > 0
  ) {
    return Math.floor(Math.random() * question.quizQuestionAnswers.length);
  }
  if (
    question &&
    Array.isArray(question.choices) &&
    question.choices.length > 0
  ) {
    return Math.floor(Math.random() * question.choices.length);
  }
  if (
    question &&
    Number.isInteger(question.numberOfChoices) &&
    question.numberOfChoices > 0
  ) {
    return Math.floor(Math.random() * question.numberOfChoices);
  }
  return Math.floor(Math.random() * 4);
}

function logStatus(level, text) {
  const palette = {
    info: { symbol: "[i]", color: "cyan" },
    ok: { symbol: "[+]", color: "green" },
    warn: { symbol: "[!]", color: "yellow" },
    err: { symbol: "[x]", color: "red" },
  };
  const entry = palette[level] || palette.info;

  logsBox.log(
    `{${entry.color}-fg}{bold}${entry.symbol}{/bold}{/${entry.color}-fg}  {white-fg}${text}{/white-fg}`,
  );
  logsBox.setScrollPerc(100);
  renderInput();
}

function refreshBots() {
  const names = Array.from(bots.keys()).reverse();

  const count = names.length;
  botsBox.setLabel(
    count > 0
      ? ` Active Bots {yellow-fg}(${count}){/yellow-fg} `
      : " Active Bots ",
  );

  if (names.length === 0) {
    botsBox.setContent("(none)");
    renderInput();
    return;
  }

  botsBox.setContent(names.join("\n"));
  renderInput();
}

function hasBot(name) {
  const key = String(name || "").trim();
  if (!key) {
    return false;
  }
  return bots.has(key) || joining.has(key);
}

async function connectBot(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    return "skipped";
  }

  if (hasBot(cleanName)) {
    logStatus("warn", `${cleanName} already exists`);
    return "skipped";
  }

  joining.add(cleanName);

  const client = new Kahoot();

  client.on("QuestionStart", (question) => {
    client.answer(randomAnswer(question)).catch(() => {});
  });

  client.on("Disconnect", (reason) => {
    joining.delete(cleanName);
    const existing = bots.get(cleanName);
    if (existing === client) {
      bots.delete(cleanName);
      refreshBots();
    }
    if (mutedDisconnect.delete(cleanName)) {
      return;
    }
    const msg = reason || "unknown";
    logStatus("warn", `${cleanName} disconnected: ${msg}`);
  });

  try {
    await client.join(gamePin, cleanName);
    joining.delete(cleanName);

    if (pendingKick.has(cleanName)) {
      pendingKick.delete(cleanName);
      mutedDisconnect.add(cleanName);
      try {
        client.leave(true);
      } catch (_err) {}
      logStatus("info", `${cleanName} removed`);
      return "skipped";
    }

    bots.set(cleanName, client);
    refreshBots();
    logStatus("ok", `${cleanName} connected`);
    return "connected";
  } catch (err) {
    joining.delete(cleanName);
    pendingKick.delete(cleanName);
    logStatus("err", `${cleanName} failed: ${formatError(err)}`);
    return "failed";
  }
}

function uniqueNames(names) {
  const seen = new Set();
  const output = [];

  for (const name of names) {
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      continue;
    }

    const key = cleanName.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(cleanName);
  }

  return output;
}

function parseNameExpression(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return { names: [], error: "name is required" };
  }

  const starPattern = text.match(/^(.*?)\s*\*\s*(\d+)$/);
  if (starPattern) {
    const base = starPattern[1].trim();
    const count = Number.parseInt(starPattern[2], 10);

    if (!base) {
      return { names: [], error: "base name cannot be empty" };
    }
    if (!Number.isFinite(count) || count <= 0) {
      return { names: [], error: "pattern count must be a positive number" };
    }
    if (count > MAX_BATCH_SIZE) {
      return {
        names: [],
        error: `pattern count too large (max ${MAX_BATCH_SIZE})`,
      };
    }

    const names = [];
    for (let i = 0; i < count; i += 1) {
      names.push(`${base}${i + 1}`);
    }

    return { names, error: "" };
  }

  const clonePattern = text.match(/^(.*?)\s*~\s*(\d+)$/);
  if (clonePattern) {
    const base = clonePattern[1].trim();
    const count = Number.parseInt(clonePattern[2], 10);

    if (!base) {
      return { names: [], error: "base name cannot be empty" };
    }
    if (!Number.isFinite(count) || count <= 0) {
      return { names: [], error: "clone count must be a positive number" };
    }
    if (count > MAX_BATCH_SIZE) {
      return {
        names: [],
        error: `clone count too large (max ${MAX_BATCH_SIZE})`,
      };
    }

    const names = [];
    for (let i = 0; i < count; i += 1) {
      names.push(`${base}${invisibleSuffix(i)}`);
    }

    return { names, error: "" };
  }

  return { names: [text], error: "" };
}

async function addMany(names, parallelLimit) {
  const cleanNames = uniqueNames(names);
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

async function kickBot(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    logStatus("warn", "kick requires a bot name");
    return false;
  }

  if (joining.has(cleanName)) {
    joining.delete(cleanName);
    pendingKick.add(cleanName);
    logStatus("info", `${cleanName} removed`);
    return true;
  }

  const client = bots.get(cleanName);
  if (!client) {
    logStatus("warn", `${cleanName} not found`);
    return false;
  }

  bots.delete(cleanName);
  refreshBots();
  mutedDisconnect.add(cleanName);

  try {
    client.leave(true);
  } catch (_err) {}

  logStatus("info", `${cleanName} removed`);
  return true;
}

async function kickAll() {
  const names = [...Array.from(bots.keys()), ...Array.from(joining.values())];

  for (const name of names) {
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      continue;
    }

    if (joining.has(cleanName)) {
      joining.delete(cleanName);
      pendingKick.add(cleanName);
      continue;
    }

    const client = bots.get(cleanName);
    if (!client) {
      continue;
    }

    bots.delete(cleanName);
    mutedDisconnect.add(cleanName);
    try {
      client.leave(true);
    } catch (_err) {}
  }

  refreshBots();
}

function showHelp() {
  logStatus("info", "Command syntax:");
  logStatus("info", "  pin <pin>");
  logStatus("info", "  add <name>");
  logStatus("info", "  add <base>*<count>");
  logStatus("info", "  add <base>~<count>");
  logStatus("info", "  kick <name>");
  logStatus("info", "  kick all");
  logStatus("info", "  list");
  logStatus("info", "  clear");
  logStatus("info", "  help");
  logStatus("info", "  exit");
}

function parsePinFromCommand(text) {
  const clean = text.trim();
  const pinCommand = clean.match(/^pin\s+(\d+)$/i);
  if (pinCommand) {
    return parsePin(pinCommand[1]);
  }
  if (/^\d+$/.test(clean)) {
    return parsePin(clean);
  }
  return 0;
}

async function executeAdd(text) {
  const expression = text.replace(/^add\s+/i, "").trim();
  const parsed = parseNameExpression(expression);

  if (parsed.error) {
    logStatus("err", parsed.error);
    return;
  }

  await addMany(parsed.names, DEFAULT_PARALLEL_JOINS);
}

async function handleCommand(text) {
  const clean = text.trim();
  if (!clean) {
    renderInput();
    return;
  }

  if (/^(exit|quit)$/i.test(clean)) {
    await shutdown(0);
    return;
  }

  if (/^help$/i.test(clean)) {
    showHelp();
    return;
  }

  if (waitingForPin) {
    const pin = parsePinFromCommand(clean);
    if (!pin) {
      logStatus("err", "Enter a numeric PIN first");
      return;
    }

    gamePin = pin;
    waitingForPin = false;
    logStatus("ok", `PIN set to ${gamePin}`);
    return;
  }

  if (/^pin\s+\d+$/i.test(clean)) {
    const nextPin = parsePinFromCommand(clean);
    if (!nextPin) {
      logStatus("err", "Invalid PIN");
      return;
    }

    if (nextPin !== gamePin) {
      await kickAll();
      gamePin = nextPin;
      logStatus("ok", `PIN set to ${gamePin}`);
    } else {
      logStatus("info", `PIN already ${gamePin}`);
    }
    return;
  }

  if (/^clear$/i.test(clean)) {
    logsBox.setContent("");
    logStatus("info", "Log cleared");
    return;
  }

  if (/^list$/i.test(clean)) {
    const names = Array.from(bots.keys()).reverse();
    if (names.length === 0) {
      logStatus("info", "No active bots");
      return;
    }
    logStatus("info", `Active: ${names.join(", ")}`);
    return;
  }

  if (/^kick\s+all$/i.test(clean)) {
    await kickAll();
    logStatus("info", "All bots removed");
    return;
  }

  const kickMatch = clean.match(/^kick\s+(.+)$/i);
  if (kickMatch) {
    await kickBot(kickMatch[1]);
    return;
  }

  if (/^add\s+/i.test(clean)) {
    await executeAdd(clean);
    return;
  }

  logStatus("err", "Unknown command. Run help to list commands");
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

  handleCommand(value).catch(async (err) => {
    logStatus("err", `Fatal error: ${formatError(err)}`);
    await shutdown(1);
  });
}

async function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  try {
    await kickAll();
  } catch (_err) {}

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

process.on("SIGHUP", () => {
  shutdown(0).catch(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  shutdown(0).catch(() => {
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  shutdown(0).catch(() => {
    process.exit(0);
  });
});

screen.key(["C-c"], () => {
  shutdown(0).catch(() => {
    process.exit(0);
  });
});

screen.on("keypress", (ch, key) => {
  if (key && key.name === "enter") {
    submitCurrentInput();
    return;
  }
  if (key && key.name === "up") {
    if (commandHistory.length === 0) {
      return;
    }
    if (historyIndex === -1) {
      historySavedInput = inputBuffer;
    }
    historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
    setInputBuffer(commandHistory[historyIndex]);
    renderInput();
    return;
  }
  if (key && key.name === "down") {
    if (historyIndex === -1) {
      return;
    }
    historyIndex -= 1;
    setInputBuffer(
      historyIndex === -1 ? historySavedInput : commandHistory[historyIndex],
    );
    renderInput();
    return;
  }
  if (key && key.name === "left") {
    cursorIndex = Math.max(0, cursorIndex - 1);
    renderInput();
    return;
  }
  if (key && key.name === "right") {
    cursorIndex = Math.min(Array.from(inputBuffer).length, cursorIndex + 1);
    renderInput();
    return;
  }
  if (key && key.name === "home") {
    cursorIndex = 0;
    renderInput();
    return;
  }
  if (key && key.name === "end") {
    cursorIndex = Array.from(inputBuffer).length;
    renderInput();
    return;
  }
  if (key && key.name === "backspace") {
    removeCharBeforeCursor();
    renderInput();
    return;
  }
  if (key && key.name === "delete") {
    removeCharAtCursor();
    renderInput();
    return;
  }

  if (key && key.ctrl) {
    return;
  }

  if (typeof ch === "string" && ch >= " " && ch !== "\u007f") {
    insertChar(ch);
    renderInput();
  }
});

screen.on("resize", () => {
  renderInput();
});

refreshBots();
setInputBuffer("");
renderInput();
logStatus("info", "Enter PIN to start");
logStatus("info", "Run help to list commands");
