# Kahoot Bot Manager

### Setup
1. Clone the repository
```bash
git clone https://github.com/Jones8683/Kahoot-Bot
```
2. Install dependencies
```bash
npm install
```

### Run
Double-click `run.bat`

### Flow
1. Enter the game PIN with `pin <pin>` or just type the number directly.
2. Add bots using any of the syntax styles below.
3. Remove bots with `kick <name>` or `kick all`.
4. Type `help` anytime to list commands.
5. Type `exit` to quit.

### Commands

| Command | Description |
|---------|-------------|
| `pin <pin>` | Set the game PIN to connect to the Kahoot quiz |
| `add <name>` | Add a single bot to the game |
| `add <base>*<count>` | Add multiple bots with sequential names |
| `add <base>~<count>` | Add multiple bots with exact duplicate names |
| `kick <name>` | Remove a specific bot from the game |
| `kick all` | Remove all bots at once |
| `list` | Display all active bots |
| `clear` | Clear the screen |
| `help` | Show available commands |
| `exit` | Quit the program |

### Run From Terminal
```bash
node index.js
```
