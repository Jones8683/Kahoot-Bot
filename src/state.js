const MAX_LOGS = 1000;
const REFRESH_DELAY = 50;

export const state = { pin: 0, bots: new Map(), logs: [] };

const listeners = new Set();
let snapshot = createSnapshot();
let refreshTimer = null;
let nextLogId = 0;

function createSnapshot() {
  const bots = [...state.bots.values()];
  const active = bots.filter((bot) => bot.active).map((bot) => bot.name).reverse();
  return { pin: state.pin, bots: active, joining: bots.length - active.length, logs: state.logs };
}

function refresh() {
  refreshTimer = null;
  snapshot = createSnapshot();
  for (const listener of listeners) listener();
}

export function changed() {
  refreshTimer ??= setTimeout(refresh, REFRESH_DELAY);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return snapshot;
}

export function log(level, text) {
  state.logs = [...state.logs.slice(1 - MAX_LOGS), { id: nextLogId++, level, text }];
  changed();
}
