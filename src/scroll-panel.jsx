import { useMemo, useRef, useState } from "react";
import { Box, Text, useBoxMetrics, useInput } from "ink";
import Frame from "./frame.jsx";

export default function ScrollPanel({ title, color, focused, anchor = "top", rows: buildRows, emptyText, ...props }) {
  const ref = useRef(null);
  const { clientWidth, clientHeight } = useBoxMetrics(ref);
  const [offset, setOffset] = useState(null);

  const innerWidth = Math.max(1, clientWidth - 2);
  const rows = useMemo(() => buildRows(innerWidth), [buildRows, innerWidth]);
  const maxOffset = Math.max(0, rows.length - clientHeight);
  const anchorOffset = anchor === "bottom" ? maxOffset : 0;
  const start = offset === null ? anchorOffset : Math.min(offset, maxOffset);
  const visible = rows.slice(start, start + clientHeight);

  function scrollBy(amount) {
    const next = Math.max(0, Math.min(maxOffset, start + amount));
    setOffset(next === anchorOffset ? null : next);
  }

  useInput(
    (_, key) => {
      const page = Math.max(1, clientHeight - 1);
      if (key.pageUp) scrollBy(-page);
      if (key.pageDown) scrollBy(page);
    },
    { isActive: focused },
  );

  const position = maxOffset > 0 ? `${start + 1}-${start + visible.length} of ${rows.length}` : "";

  return (
    <Frame
      ref={ref}
      title={title}
      color={color}
      active={focused}
      footer={position}
      flexDirection="column"
      {...props}
    >
      {rows.length ? visible : <Text dimColor>{emptyText}</Text>}
    </Frame>
  );
}
