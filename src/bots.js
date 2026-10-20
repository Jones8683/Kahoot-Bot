import { setTimeout as sleep } from "node:timers/promises";
import Kahoot from "kahoot.js-latest";
import { visibleName } from "./names.js";
import { changed, log, state } from "./state.js";

const PARALLEL_JOINS = 35;
const LEAVE_DELAY = 600;

const batches = new Set();

function formatError(err) {
  if (typeof err === "string") return err;
  return String(err?.description || err?.message || "unknown error");
}

function randomAnswer(question) {
  const count =
    question?.quizQuestionAnswers?.length || question?.choices?.length || question?.numberOfChoices || 4;
  return Math.floor(Math.random() * count);
}

function leave(client) {
  try {
    client.leave(true);
  } catch {}
}

function joinGame(client, name) {
  return new Promise((resolve, reject) => {
    client.once("Disconnect", reject);
    client.join(state.pin, name).then(resolve, reject);
  });
}

async function connectBot(name) {
  const client = new Kahoot();
  state.bots.set(client, { name, active: false });
  changed();

  client.on("QuestionStart", (question) => {
    client.answer(randomAnswer(question)).catch(() => {});
  });

  try {
    await joinGame(client, name);
  } catch (err) {
    leave(client);
    if (!state.bots.delete(client)) return null;
    changed();
    return { joined: false, reason: formatError(err) };
  }

  if (!state.bots.has(client)) {
    leave(client);
    return null;
  }

  state.bots.get(client).active = true;
  client.on("Disconnect", (reason) => {
    if (!state.bots.delete(client)) return;
    changed();
    log("warn", reason === "Kicked" ? `${name} was kicked by the host` : `${name} disconnected: ${reason}`);
  });
  changed();
  return { joined: true };
}

function summarize(results, total) {
  const failures = new Map();
  let joined = 0;
  let failed = 0;

  for (const result of results) {
    if (result?.joined) {
      joined += 1;
    } else if (result) {
      failed += 1;
      failures.set(result.reason, (failures.get(result.reason) || 0) + 1);
    }
  }

  const reasons = [...failures].map(([reason, count]) => `${reason} x${count}`).join(", ");
  log(failed ? "warn" : "ok", `${joined}/${total} joined` + (failed ? `, ${failed} failed (${reasons})` : ""));
}

export async function addBots(names) {
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
  const bot = state.bots.get(client);
  state.bots.delete(client);
  if (bot.active) leave(client);
}

export function kickBot(name) {
  const clients = [...state.bots].filter(([, bot]) => visibleName(bot.name) === name).map(([client]) => client);
  if (!clients.length) {
    log("warn", "Bot not found");
    return;
  }
  clients.forEach(removeBot);
  changed();
  log("info", clients.length === 1 ? `${name} removed` : `${name} removed x${clients.length}`);
}

export function kickAll() {
  for (const batch of batches) batch.cancelled = true;
  for (const client of [...state.bots.keys()]) removeBot(client);
  changed();
}

export function changePin(pin) {
  kickAll();
  state.pin = pin;
  changed();
}

export async function leaveAll() {
  const hasBots = state.bots.size > 0;
  kickAll();
  if (hasBots) await sleep(LEAVE_DELAY);
}
