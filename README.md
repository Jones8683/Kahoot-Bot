# Kahoot Bot
### Features:
- Flood Kahoots with customisable bots
- Join multiple bots with the exact same name
- Manage different bots individually
- Instant random answers

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

<img width="1920" height="960" alt="Mockup" src="https://github.com/user-attachments/assets/035d66d6-7a64-41f5-8c80-f703fa90f096" />
