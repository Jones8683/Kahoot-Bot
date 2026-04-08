"use strict";

const readline = require("readline");
const Kahoot = require("kahoot.js-latest");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

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
let waitingForPrompt = false;
const pendingAsyncLogs = [];

function printLine(message, isAsyncEvent = false) {
  if (isAsyncEvent && waitingForPrompt) {
    pendingAsyncLogs.push(message);
    return;
  }
  console.log(message);
}

function ask(question) {
  return new Promise((resolve) => {
    waitingForPrompt = true;
    rl.question(question, (answer) => {
      waitingForPrompt = false;
      if (pendingAsyncLogs.length > 0) {
        process.stdout.write("\n");
        while (pendingAsyncLogs.length > 0) {
          console.log(pendingAsyncLogs.shift());
        }
      }
      resolve(answer.trim());
    });
  });
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
    printLine(status("!", C.cyan, `${name} bot already connected.`), true);
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
      true,
    );
  });

  try {
    await client.join(gamePin, name);
    printLine(status("✓", C.green, `${name} connected.`), true);
    return true;
  } catch (err) {
    clients.delete(name);
    const message = formatError(err);
    if (message.toLowerCase().includes("duplicate name")) {
      printLine(
        status("⚠", C.purple, `${name} failed: duplicate bot name`),
        true,
      );
      return false;
    }
    printLine(status("⚠", C.purple, `${name} failed: ${message}`), true);
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
  closeAll();
  rl.close();
  process.exit(0);
});

async function main() {
  while (!gamePin) {
    const pinInput = await ask("Enter game pin: ");
    const pin = parsePin(pinInput);
    if (!pin) {
      printLine(status("⚠", C.purple, "PIN must be a number."));
      continue;
    }
    gamePin = pin;
  }

  printLine("Type bot names. Type exit to leave.");
  while (true) {
    const name = await ask("Bot name: ");

    if (!name) {
      continue;
    }

    if (name.toLowerCase() === "exit") {
      break;
    }

    await addBot(name);
  }

  closeAll();
  rl.close();
}

main().catch((err) => {
  printLine(status("⚠", C.purple, `Error: ${formatError(err)}`));
  closeAll();
  rl.close();
  process.exit(1);
});
