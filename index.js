import blessed from "blessed";
import Kahoot from "kahoot.js-latest";

const MAX_BATCH_SIZE = 10000;
const PARALLEL_JOINS = 35;
const HISTORY_LIMIT = 100;
const INVISIBLE_CHARS = ["​", "‌", "‍", "⁠"];
const STATUS_STYLES = {
  info: { symbol: "[i]", color: "cyan" },
  ok: { symbol: "[+]", color: "green" },
  warn: { symbol: "[!]", color: "yellow" },
  err: { symbol: "[x]", color: "red" },
};
const HELP_TEXT = [
  "Commands:",
  "  pin <pin>",
  "  add <name>",
  "  add <name>*<count>",
  "  add <name>~<count>",
  "  kick <name>",
  "  kick all",
  "  help",
  "  exit",
].join("\n");

const bots = new Map();
const batches = new Set();
const history = [];

let gamePin = 0;
let input = "";
let cursor = 0;
let inputScroll = 0;
let historyIndex = -1;
let historyDraft = "";
let shuttingDown = false;

const screen = blessed.screen({
  smartCSR: true,
  title: "Kahoot Bot Manager",
  cursor: { artificial: false, shape: "line", blink: true },
});

function createPanel(type, color, background, options) {
  const panel = blessed[type]({
    tags: true,
    padding: { left: 1, right: 1 },
    border: { type: "line" },
    style: {
      fg: "white",
      bg: background,
      border: { fg: color },
      label: { fg: color, bold: true },
    },
    ...options,
  });
  screen.append(panel);
  return panel;
}

const scrollOptions = {
  top: 3,
  bottom: 3,
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  scrollbar: { bg: "gray" },
};

createPanel("box", "magenta", "#1f1230", {
  top: 0,
  width: "100%",
  height: 3,
  content: "{bold}Kahoot Bot Manager{/bold}\nType help for commands",
});

const botsBox = createPanel("box", "yellow", "#2d2a10", {
  ...scrollOptions,
  left: 0,
  width: "35%",
});

const logsBox = createPanel("log", "yellow", "#3d3410", {
  ...scrollOptions,
  left: "35%",
  width: "65%",
  label: " Logs ",
});

const inputBox = createPanel("box", "green", "#0f2e13", {
  bottom: 0,
  width: "100%",
  height: 3,
  label: " Input ",
});

function chars(text) {
  return Array.from(text);
}

function invisibleSuffix(index) {
  let suffix = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / INVISIBLE_CHARS.length)) {
    suffix += INVISIBLE_CHARS[(n - 1) % INVISIBLE_CHARS.length];
  }
  return suffix;
}

function formatError(err) {
  if (typeof err === "string") return err;
  return String(err?.description || err?.message || "unknown error");
}

function parsePin(text) {
  if (!/^\d+$/.test(text)) return 0;
  const pin = Number(text);
  return Number.isSafeInteger(pin) && pin > 0 ? pin : 0;
}

function parseNames(expression) {
  const match = expression.match(/^(.*?)\s*([*~])\s*(\d+)$/);
  if (!match) return { names: expression ? [expression] : [] };

  const [, name, mode, countText] = match;
  const count = Number(countText);
  if (!name || count === 0) return { error: "Invalid add command" };
  if (count > MAX_BATCH_SIZE) return { error: "Too many bots requested" };

  const suffix = mode === "*" ? (index) => index + 1 : invisibleSuffix;
  return { names: Array.from({ length: count }, (_, index) => `${name}${suffix(index)}`) };
}

function randomAnswer(question) {
  const count =
    question?.quizQuestionAnswers?.length || question?.choices?.length || question?.numberOfChoices || 4;
  return Math.floor(Math.random() * count);
}

function renderInput() {
  const prompt = gamePin ? "CMD> " : "PIN> ";
  const fieldWidth = Math.max(1, inputBox.width - 4 - prompt.length);

  inputScroll = Math.min(inputScroll, cursor);
  inputScroll = Math.max(inputScroll, cursor - fieldWidth);

  const visible = chars(input).slice(inputScroll, inputScroll + fieldWidth).join("");
  inputBox.setContent(`${prompt}${blessed.escape(visible)}`);
  screen.render();

  screen.program.showCursor();
  screen.program.cup(inputBox.atop + 1, inputBox.aleft + 2 + prompt.length + cursor - inputScroll);
}

function renderBots() {
  const names = [...bots.values()].filter((bot) => bot.active).map((bot) => blessed.escape(bot.name));
  botsBox.setLabel(names.length ? ` Active Bots {yellow-fg}(${names.length}){/yellow-fg} ` : " Active Bots ");
  botsBox.setContent(names.reverse().join("\n") || "(none)");
  renderInput();
}

function log(level, text) {
  const { symbol, color } = STATUS_STYLES[level];
  logsBox.log(`{${color}-fg}{bold}${symbol}{/bold}{/${color}-fg}  ${blessed.escape(text)}`);
  logsBox.setScrollPerc(100);
  renderInput();
}

function leave(client) {
  try {
    client.leave(true);
  } catch {}
}

function joinGame(client, name) {
  return new Promise((resolve, reject) => {
    client.once("Disconnect", reject);
    client.join(gamePin, name).then(resolve, reject);
  });
}

async function connectBot(name) {
  const client = new Kahoot();
  bots.set(client, { name, active: false });

  client.on("QuestionStart", (question) => {
    client.answer(randomAnswer(question)).catch(() => {});
  });

  try {
    await joinGame(client, name);
  } catch (err) {
    leave(client);
    return bots.delete(client) ? { joined: false, reason: formatError(err) } : null;
  }

  if (!bots.has(client)) {
    leave(client);
    return null;
  }

  bots.get(client).active = true;
  client.on("Disconnect", (reason) => {
    if (!bots.delete(client)) return;
    renderBots();
    log("warn", reason === "Kicked" ? `${name} was kicked by the host` : `${name} disconnected: ${reason}`);
  });
  renderBots();
  return { joined: true };
}

function summarize(results, total) {
  const failures = new Map();
  let joined = 0;

  for (const result of results) {
    if (result?.joined) joined += 1;
    else if (result) failures.set(result.reason, (failures.get(result.reason) || 0) + 1);
  }

  const failed = [...failures.values()].reduce((sum, count) => sum + count, 0);
  const reasons = [...failures].map(([reason, count]) => `${reason} x${count}`).join(", ");
  const text = `${joined}/${total} joined` + (failed ? `, ${failed} failed (${reasons})` : "");
  log(failed ? "warn" : "ok", text);
}

async function addBots(names) {
  if (names.length === 1) {
    const result = await connectBot(names[0]);
    if (result?.joined) log("ok", `${names[0]} joined`);
    else if (result) log("err", `${names[0]} failed to join: ${result.reason}`);
    return;
  }

  const batch = { cancelled: false };
  const results = [];
  let next = 0;

  async function worker() {
    while (!batch.cancelled && next < names.length) {
      results.push(await connectBot(names[next++]));
    }
  }

  batches.add(batch);
  log("info", `Adding ${names.length} bots`);
  await Promise.all(Array.from({ length: Math.min(PARALLEL_JOINS, names.length) }, worker));
  batches.delete(batch);

  if (!batch.cancelled) summarize(results, names.length);
}

function removeBot(client) {
  const bot = bots.get(client);
  bots.delete(client);
  if (bot.active) leave(client);
}

function kickBot(name) {
  const client = [...bots].reverse().find(([, bot]) => bot.name === name)?.[0];
  if (!client) {
    log("warn", "Bot not found");
    return;
  }
  removeBot(client);
  renderBots();
  log("info", `${name} removed`);
}

function kickAll() {
  for (const batch of batches) batch.cancelled = true;
  for (const client of [...bots.keys()]) removeBot(client);
  renderBots();
}

function setPin(text) {
  const pin = parsePin(text);
  if (!pin) {
    log("err", "Invalid PIN");
  } else if (pin === gamePin) {
    log("info", `PIN already ${gamePin}`);
  } else {
    kickAll();
    gamePin = pin;
    log("ok", `PIN set to ${gamePin}`);
  }
}

const COMMANDS = {
  help() {
    log("info", HELP_TEXT);
  },
  exit() {
    shutdown(0);
  },
  pin(argument) {
    setPin(argument);
  },
  add(argument) {
    const { names, error } = parseNames(argument);
    if (error || !names.length) {
      log("err", error || "Enter a bot name");
      return;
    }
    addBots(names);
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

function handleCommand(text) {
  const [command = "", ...rest] = text.split(/\s+/);
  const name = command.toLowerCase();
  const argument = rest.join(" ");

  if (!gamePin && !["help", "exit", "pin"].includes(name)) {
    setPin(command);
  } else if (COMMANDS[name]) {
    COMMANDS[name](argument);
  } else {
    log("err", "Unknown command. Run help to list commands");
  }
}

function setInput(value) {
  input = value;
  cursor = chars(value).length;
  inputScroll = 0;
}

function submitInput() {
  const text = input.trim();
  setInput("");
  historyIndex = -1;
  historyDraft = "";

  if (!text) {
    renderInput();
    return;
  }

  history.unshift(text);
  history.length = Math.min(history.length, HISTORY_LIMIT);
  handleCommand(text);
}

function browseHistory(step) {
  const index = Math.max(-1, Math.min(history.length - 1, historyIndex + step));
  if (index === historyIndex) return;
  if (historyIndex === -1) historyDraft = input;
  historyIndex = index;
  setInput(index === -1 ? historyDraft : history[index]);
}

function editInput(start, deleteCount, text = "") {
  const list = chars(input);
  list.splice(start, deleteCount, ...chars(text));
  input = list.join("");
  cursor = start + chars(text).length;
}

function handleKey(ch, key) {
  const length = chars(input).length;

  switch (key.name) {
    case "enter":
      submitInput();
      return;
    case "up":
      browseHistory(1);
      break;
    case "down":
      browseHistory(-1);
      break;
    case "left":
      cursor = Math.max(0, cursor - 1);
      break;
    case "right":
      cursor = Math.min(length, cursor + 1);
      break;
    case "home":
      cursor = 0;
      break;
    case "end":
      cursor = length;
      break;
    case "backspace":
      if (cursor > 0) editInput(cursor - 1, 1);
      break;
    case "delete":
      if (cursor < length) editInput(cursor, 1);
      break;
    default:
      if (!ch || ch < " " || ch === "\u007f") return;
      editInput(cursor, 0, ch);
  }

  renderInput();
}

function shutdown(exitCode, err) {
  if (shuttingDown) return;
  shuttingDown = true;
  kickAll();
  screen.destroy();
  if (err) console.error(`Fatal error: ${formatError(err)}`);
  process.exit(exitCode);
}

process.on("uncaughtException", (err) => shutdown(1, err));
process.on("unhandledRejection", (err) => shutdown(1, err));

for (const signal of ["SIGHUP", "SIGTERM", "SIGINT"]) {
  process.on(signal, () => shutdown(0));
}

screen.on("keypress", (ch, key = {}) => {
  if (key.ctrl) {
    if (key.name === "c") shutdown(0);
    return;
  }
  handleKey(ch, key);
});

screen.on("resize", renderInput);

renderBots();
log("info", "Enter PIN to start");
log("info", "Run help to list commands");
