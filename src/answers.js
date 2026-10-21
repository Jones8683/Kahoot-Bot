const SINGLE_CHOICE = new Set(['quiz', 'true_false']);

export function firstQuestionAnswer(payload) {
  const block = payload?.firstGameBlockData;
  if (!SINGLE_CHOICE.has(String(block?.gameBlockType))) return null;
  if (!Array.isArray(block.choices)) return null;

  const correct = block.choices.findIndex((choice) => choice?.correct === true);
  if (correct === -1) return null;

  return {
    index: Number.isInteger(block.questionIndex) ? block.questionIndex : 0,
    choice: correct,
  };
}
