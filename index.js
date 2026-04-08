"use strict";

const readline = require("readline");
const Kahoot = require("kahoot.js-latest");

const C = {
  reset: "\x1b[0m",
  green: "\x1b[92m",
  purple: "\x1b[95m",
  cyan: "\x1b[96m",
  gray: "\x1b[90m",
};

function paint(color, text) {
  return `${color}${text}${C.reset}`;
}

function status(symbol, color, text) {
  return `${paint(color, symbol)}  ${text}`;
}

const clients = new Map();
let gamePin = 0;
let enteringPin = true;
let busy = false;
let inputBuffer = "";

function promptText() {
  return enteringPin ? "Enter game pin: " : "Bot name: ";
}

function renderPrompt() {
  if (busy) {
    return;
  }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(`${promptText()}${inputBuffer}`);
}

function printLine(message) {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(`${message}\n`);
  renderPrompt();
}

function parsePin(value) {
  const pin = Number.parseInt(value, 10);
  if (!Number.isFinite(pin) || pin <= 0) {
    return 0;
  }
  return pin;
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

async function addBot(name) {
  if (clients.has(name)) {
    printLine(status("!", C.cyan, `${name} bot already connected.`));
    return false;
  }

  const client = new Kahoot();
  clients.set(name, client);

  client.on("QuestionStart", (question) => {
    client.answer(randomAnswer(question)).catch(() => {});
  });

  client.on("Disconnect", (reason) => {
    clients.delete(name);
    printLine(
      status("!", C.gray, `${name} disconnected: ${reason || "unknown"}`),
    );
  });

  try {
    await client.join(gamePin, name);
    printLine(status("✓", C.green, `${name} connected.`));
    return true;
  } catch (err) {
    clients.delete(name);
    const message = formatError(err);
    if (message.toLowerCase().includes("duplicate name")) {
      printLine(status("⚠", C.purple, `${name} failed: duplicate bot name`));
      return false;
    }
    printLine(status("⚠", C.purple, `${name} failed: ${message}`));
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
}

process.on("SIGINT", () => {
  process.stdout.write("\n");
  closeAll();
  process.exit(0);
});

async function handleSubmit(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return;
  }

  if (enteringPin) {
    const pin = parsePin(trimmed);
    if (!pin) {
      printLine(status("⚠", C.purple, "PIN must be a number."));
      return;
    }
    gamePin = pin;
    enteringPin = false;
    printLine("Type bot names. Type exit to leave.");
    return;
  }

  if (trimmed.toLowerCase() === "exit") {
    closeAll();
    process.stdout.write("\n");
    process.exit(0);
  }
  await addBot(trimmed);
}

function onKeypress(str, key) {
  if (key && key.ctrl && key.name === "c") {
    process.kill(process.pid, "SIGINT");
    return;
  }

  if (busy) {
    return;
  }

  if (key && key.name === "return") {
    const submitted = inputBuffer;
    const trimmed = submitted.trim();
    inputBuffer = "";
    const shouldLock =
      !enteringPin && trimmed && trimmed.toLowerCase() !== "exit";
    if (shouldLock) {
      busy = true;
    }
    process.stdout.write("\n");
    handleSubmit(submitted)
      .then(() => {
        if (shouldLock) {
          busy = false;
        }
        renderPrompt();
      })
      .catch((err) => {
        if (shouldLock) {
          busy = false;
        }
        printLine(status("⚠", C.purple, `Error: ${formatError(err)}`));
        closeAll();
        process.exit(1);
      });
    return;
  }

  if (key && key.name === "backspace") {
    if (inputBuffer.length > 0) {
      inputBuffer = inputBuffer.slice(0, -1);
      renderPrompt();
    }
    return;
  }

  if (str && str >= " " && str !== "\u007f") {
    inputBuffer += str;
    renderPrompt();
  }
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
  process.stdin.setRawMode(true);
}
process.stdin.on("keypress", onKeypress);
process.stdin.resume();
renderPrompt();
