"use strict";

const Kahoot = require("kahoot.js-latest");

const args = process.argv.slice(2);
const pinRaw = args[0];
const namesFlagIndex = args.indexOf("--names");
const customNamesRaw =
  namesFlagIndex >= 0 ? args[namesFlagIndex + 1] || "" : "";
const customNames = customNamesRaw
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const countRaw = customNames.length > 0 ? String(customNames.length) : args[1];
const baseName = customNames.length > 0 ? "" : (args[2] || "").trim();

if (
  !pinRaw ||
  (!countRaw && customNames.length === 0) ||
  (customNames.length === 0 && !baseName)
) {
  console.log("Usage: node index.js <pin> <count> <name>");
  console.log('   or: node index.js <pin> --names "name1,name2,name3"');
  process.exit(1);
}

const pin = Number.parseInt(pinRaw, 10);
const count =
  customNames.length > 0 ? customNames.length : Number.parseInt(countRaw, 10);

if (!Number.isFinite(pin) || pin <= 0) {
  console.log("Invalid pin");
  process.exit(1);
}

if (!Number.isFinite(count) || count <= 0) {
  console.log("Invalid count");
  process.exit(1);
}

function makeName(index) {
  if (customNames.length > 0) {
    return customNames[index];
  }
  if (count === 1) {
    return baseName;
  }
  return `${baseName} ${index + 1}`;
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

function startBot(index) {
  const name = makeName(index);
  const client = new Kahoot();

  console.log(`Joining ${name}...`);

  client.on("Joined", () => {
    console.log(`[${name}] joined`);
  });

  client.on("QuestionStart", (question) => {
    client.answer(randomAnswer(question)).catch(() => {});
  });

  client.on("QuizEnd", () => {
    console.log(`[${name}] quiz ended`);
  });

  client.on("Disconnect", (reason) => {
    console.log(`[${name}] disconnected: ${reason || "unknown"}`);
  });

  client.join(pin, name).catch((err) => {
    const msg =
      err && err.description
        ? err.description
        : err && err.message
          ? err.message
          : err;
    console.log(`[${name}] failed: ${msg || "unknown error"}`);
  });
}

for (let i = 0; i < count; i += 1) {
  startBot(i);
}
