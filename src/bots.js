import { setTimeout as sleep } from 'node:timers/promises';
import Kahoot from 'kahoot.js-latest';
import { visibleName } from './names.js';
import { changed, log, state } from './state.js';

const PARALLEL_JOINS = 35;
const LEAVE_DELAY = 600;
const MIN_ANSWER_DELAY = 500;
const MAX_ANSWER_DELAY = 3000;
const ANSWER_ATTEMPTS = 2;

const batches = new Set();
let nextBotId = 0;

function formatError(err) {
  if (typeof err === 'string') return err;
  return String(err?.description || err?.message || 'unknown error');
}

function randomAnswer(question) {
  const count = question?.quizQuestionAnswers?.[question.questionIndex] || 4;
  return Math.floor(Math.random() * count);
}

// Spread answers out so Kahoot doesn't drop a burst of them arriving at once
function answerDelay(question) {
  const max = Math.min(MAX_ANSWER_DELAY, (question?.timeAvailable || 20000) / 2);
  return MIN_ANSWER_DELAY + Math.random() * Math.max(0, max - MIN_ANSWER_DELAY);
}

function leave(client) {
  try {
    client.leave(true);
  } catch {}
}

function joinGame(client, name) {
  return new Promise((resolve, reject) => {
    client.once('Disconnect', reject);
    client.join(state.pin, name).then(resolve, reject);
  });
}

async function connectBot(name) {
  const client = new Kahoot();
  state.bots.set(client, { id: nextBotId++, name, active: false });
  changed();

  client.on('QuestionStart', async (question) => {
    await sleep(answerDelay(question));
    if (!state.bots.has(client)) return;

    const choice = randomAnswer(question);
    for (let attempt = 1; attempt <= ANSWER_ATTEMPTS; attempt++) {
      try {
        await client.answer(choice);
        return;
      } catch {}
    }
    log('warn', `${name} couldn't answer question ${question.questionIndex + 1}`);
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
  client.on('Disconnect', (reason) => {
    if (!state.bots.delete(client)) return;
    changed();
    log(
      'warn',
      reason === 'Kicked' ? `${name} was kicked by the host` : `${name} disconnected: ${reason}`,
    );
  });
  changed();
  return { joined: true };
}

function summarize(names, results) {
  if (names.length === 1) {
    const [result] = results;
    if (result?.joined) log('ok', `${names[0]} joined`);
    else if (result) log('err', `${names[0]} failed to join: ${result.reason}`);
    return;
  }

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

  const reasons = [...failures].map(([reason, count]) => `${reason} x${count}`).join(', ');
  log(
    failed ? 'warn' : 'ok',
    `${joined}/${names.length} joined` + (failed ? `, ${failed} failed (${reasons})` : ''),
  );
}

export async function addBots(names) {
  const batch = { cancelled: false };
  const results = [];
  let next = 0;

  async function worker() {
    while (!batch.cancelled && next < names.length) {
      results.push(await connectBot(names[next++]));
    }
  }

  batches.add(batch);
  await Promise.all(Array.from({ length: Math.min(PARALLEL_JOINS, names.length) }, worker));
  batches.delete(batch);

  if (!batch.cancelled) summarize(names, results);
}

function removeBot(client) {
  const bot = state.bots.get(client);
  state.bots.delete(client);
  if (bot.active) leave(client);
}

export function kickBot(name) {
  const clients = [...state.bots]
    .filter(([, bot]) => visibleName(bot.name) === name)
    .map(([client]) => client);
  for (const client of clients) removeBot(client);
  changed();
  return clients.length;
}

export function kickAll() {
  for (const batch of batches) batch.cancelled = true;
  for (const client of state.bots.keys()) removeBot(client);
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
