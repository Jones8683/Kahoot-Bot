"use strict";

const blessed = require("blessed");
const Kahoot = require("kahoot.js-latest");

const clients = new Map();
const joinedBots = new Set();
const pendingBots = new Set();
let gamePin = 0;
let waitingForPin = true;
let inputBuffer = "";
let cursorIndex = 0;
let inputScroll = 0;

const screen = blessed.screen({
  smartCSR: true,
  title: "Kahoot Bot Launcher",
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
  content: "{bold}Kahoot Bot Launcher{/bold}\nAdd bot names Type exit to leave",
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "#240a3d",
    border: { fg: "magenta" },
    label: { fg: "magenta", bold: true },
  },
});

const botsBox = blessed.box({
  top: 3,
  left: 0,
  width: "40%",
  bottom: 3,
  tags: true,
  padding: { left: 1, right: 1 },
  label: " Joined Bots ",
  border: { type: "line" },
  content: "(none)",
  scrollable: true,
  alwaysScroll: true,
  style: {
    fg: "white",
    bg: "#3a320f",
    border: { fg: "yellow" },
    label: { fg: "yellow", bold: true },
  },
});

const logsBox = blessed.log({
  top: 3,
  left: "40%",
  width: "60%",
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
    bg: "#4a3f10",
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
  label: " Add Bot ",
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
  return waitingForPin ? "Kahoot PIN: " : "Bot name: ";
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
    return err.description;
  }
  if (err && err.message) {
    return err.message;
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

function logStatus(symbol, color, text) {
  logsBox.log(
    `{${color}-fg}{bold}${symbol}{/bold}{/${color}-fg}  {white-fg}${text}{/white-fg}`,
  );
  logsBox.setScrollPerc(100);
  renderInput();
}

function refreshBots() {
  const names = Array.from(joinedBots).sort((a, b) => a.localeCompare(b));
  if (names.length === 0) {
    botsBox.setContent("(none)");
  } else {
    botsBox.setContent(names.map((name) => `- ${name}`).join("\n"));
  }
  renderInput();
}

async function addBot(name) {
  if (joinedBots.has(name)) {
    logStatus("⚠", "yellow", `${name} bot already connected`);
    return false;
  }
  if (pendingBots.has(name)) {
    logStatus("⚠", "yellow", `${name} join already in progress`);
    return false;
  }

  const client = new Kahoot();
  pendingBots.add(name);
  clients.set(name, client);

  client.on("QuestionStart", (question) => {
    client.answer(randomAnswer(question)).catch(() => {});
  });

  client.on("Disconnect", (reason) => {
    clients.delete(name);
    joinedBots.delete(name);
    pendingBots.delete(name);
    refreshBots();
    logStatus("⚠", "yellow", `${name} disconnected: ${reason || "unknown"}`);
  });

  try {
    await client.join(gamePin, name);
    pendingBots.delete(name);
    joinedBots.add(name);
    refreshBots();
    logStatus("✓", "green", `${name} connected`);
    return true;
  } catch (err) {
    clients.delete(name);
    joinedBots.delete(name);
    pendingBots.delete(name);
    refreshBots();
    const message = formatError(err);
    if (message.toLowerCase().includes("duplicate name")) {
      logStatus("⚠", "magenta", `${name} failed: duplicate bot name`);
      return false;
    }
    logStatus("⚠", "magenta", `${name} failed: ${message}`);
    return false;
  }
}

function closeAll() {
  for (const client of clients.values()) {
    try {
      client.leave(true);
    } catch (_err) {}
  }
  clients.clear();
  joinedBots.clear();
  pendingBots.clear();
}

async function handleSubmit(raw) {
  const value = raw.trim();
  if (!value) {
    renderInput();
    return;
  }

  if (waitingForPin) {
    const pin = parsePin(value);
    if (!pin) {
      logStatus("⚠", "magenta", "PIN must be a number");
      renderInput();
      return;
    }
    gamePin = pin;
    waitingForPin = false;
    logStatus("✓", "green", "Game pin accepted");
    refreshBots();
    renderInput();
    return;
  }

  if (value.toLowerCase() === "exit") {
    closeAll();
    screen.destroy();
    process.exit(0);
  }

  addBot(value).catch((err) => {
    logStatus("⚠", "magenta", `${value} failed: ${formatError(err)}`);
  });
}

function submitCurrentInput() {
  const value = inputBuffer;
  setInputBuffer("");
  renderInput();
  handleSubmit(value).catch((err) => {
    logStatus("⚠", "magenta", `Error: ${formatError(err)}`);
    closeAll();
    setCursorVisible(true);
    screen.destroy();
    process.exit(1);
  });
}

process.on("SIGINT", () => {
  closeAll();
  setCursorVisible(true);
  screen.destroy();
  process.exit(0);
});

screen.key(["C-c"], () => {
  closeAll();
  setCursorVisible(true);
  screen.destroy();
  process.exit(0);
});

screen.on("keypress", (ch, key) => {
  if (key && key.name === "enter") {
    submitCurrentInput();
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
