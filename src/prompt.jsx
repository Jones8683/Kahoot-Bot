import { useReducer, useRef } from "react";
import { Text, useBoxMetrics, useCursor, useInput } from "ink";
import stringWidth from "string-width";
import Frame from "./frame.jsx";

const HISTORY_LIMIT = 100;
const PREFIX = "› ";

function widthOf(chars) {
  return stringWidth(chars.join(""));
}

export default function Prompt({ title, onSubmit }) {
  const ref = useRef(null);
  const { left, top, clientWidth, hasMeasured } = useBoxMetrics(ref);
  const { setCursorPosition } = useCursor();
  const editor = useRef({ chars: [], cursor: 0, scroll: 0, history: [], historyIndex: -1, draft: [] });
  const [, rerender] = useReducer((count) => count + 1, 0);

  function update(changes) {
    Object.assign(editor.current, changes);
    rerender();
  }

  function edit(start, deleteCount, inserted = []) {
    const chars = [...editor.current.chars];
    chars.splice(start, deleteCount, ...inserted);
    update({ chars, cursor: start + inserted.length });
  }

  function setText(chars) {
    update({ chars, cursor: chars.length, scroll: 0 });
  }

  function submit() {
    const text = editor.current.chars.join("").trim();
    const history = text ? [text, ...editor.current.history].slice(0, HISTORY_LIMIT) : editor.current.history;
    update({ history, historyIndex: -1, draft: [] });
    setText([]);
    if (text) onSubmit(text);
  }

  function browseHistory(step) {
    const { history, historyIndex, chars, draft } = editor.current;
    const index = Math.max(-1, Math.min(history.length - 1, historyIndex + step));
    if (index === historyIndex) return;
    update({ historyIndex: index, draft: historyIndex === -1 ? chars : draft });
    setText(index === -1 ? editor.current.draft : Array.from(history[index]));
  }

  useInput((input, key) => {
    const { chars, cursor } = editor.current;

    if (key.return) submit();
    else if (key.upArrow) browseHistory(1);
    else if (key.downArrow) browseHistory(-1);
    else if (key.leftArrow) update({ cursor: Math.max(0, cursor - 1) });
    else if (key.rightArrow) update({ cursor: Math.min(chars.length, cursor + 1) });
    else if (key.home) update({ cursor: 0 });
    else if (key.end) update({ cursor: chars.length });
    else if (key.backspace) {
      if (cursor > 0) edit(cursor - 1, 1);
    } else if (key.delete) {
      if (cursor < chars.length) edit(cursor, 1);
    } else if (!key.ctrl && !key.meta && !key.tab && !key.escape) {
      const text = input.replace(/[\u0000-\u001f\u007f]/g, "");
      if (text) edit(cursor, 0, Array.from(text));
    }
  });

  const { chars, cursor } = editor.current;
  const fieldWidth = Math.max(1, clientWidth - 2 - stringWidth(PREFIX));

  let scroll = Math.min(editor.current.scroll, cursor);
  while (widthOf(chars.slice(scroll, cursor)) >= fieldWidth) scroll += 1;
  editor.current.scroll = scroll;

  let end = cursor;
  while (end < chars.length && widthOf(chars.slice(scroll, end + 1)) <= fieldWidth) end += 1;

  setCursorPosition(
    hasMeasured
      ? { x: left + 2 + stringWidth(PREFIX) + widthOf(chars.slice(scroll, cursor)), y: top + 1 }
      : undefined,
  );

  return (
    <Frame ref={ref} title={title} color="green">
      <Text wrap="truncate-end">
        <Text bold color="green">
          {PREFIX}
        </Text>
        {chars.slice(scroll, end).join("")}
      </Text>
    </Frame>
  );
}
