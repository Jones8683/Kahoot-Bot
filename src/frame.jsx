import { Box, Text } from "ink";

export default function Frame({ ref, title, color, active = true, footer, children, ...props }) {
  return (
    <Box ref={ref} borderStyle="round" borderColor={active ? color : "gray"} paddingX={1} {...props}>
      <Box position="absolute" top={-1} left={1}>
        <Text bold color={color}>
          {` ${title} `}
        </Text>
      </Box>
      {footer && (
        <Box position="absolute" bottom={-1} right={1}>
          <Text dimColor>{` ${footer} `}</Text>
        </Box>
      )}
      {children}
    </Box>
  );
}
