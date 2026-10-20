const MAX_BATCH_SIZE = 10000;
const INVISIBLE_CHARS = ["\u200B", "\u200C", "\u200D", "\u2060"];

function invisibleSuffix(index) {
  let suffix = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / INVISIBLE_CHARS.length)) {
    suffix += INVISIBLE_CHARS[(n - 1) % INVISIBLE_CHARS.length];
  }
  return suffix;
}

export function visibleName(name) {
  return Array.from(name)
    .filter((char) => !INVISIBLE_CHARS.includes(char))
    .join("");
}

export function parseNames(expression) {
  const match = expression.match(/^(.*?)\s*([*~])\s*(\d+)$/u);
  if (!match) return { names: expression ? [expression] : [] };

  const [, name, mode, countText] = match;
  const count = Number(countText);
  if (!name || count === 0) return { error: "Invalid add command" };
  if (count > MAX_BATCH_SIZE) return { error: "Too many bots requested" };

  const suffix = mode === "*" ? (index) => index + 1 : invisibleSuffix;
  return { names: Array.from({ length: count }, (_, index) => `${name}${suffix(index)}`) };
}
