# Kahoot Bot

### Features

- Flood Kahoots with bots named whatever you want
- Join multiple bots with the exact same name
- Manage different bots individually
- Instant random answers

### Setup

Requires [Node.js](https://nodejs.org) 22 or newer.

1. Clone the repository

```bash
git clone https://github.com/Jones8683/Kahoot-Bot
```

2. Install dependencies

```bash
npm install
```

### Run

```bash
npm start
```

### Commands

| Command              | Description                                    |
| -------------------- | ---------------------------------------------- |
| `pin <pin>`          | Set the game PIN to connect to the Kahoot quiz |
| `add <name>`         | Add a single bot to the game                   |
| `add <name>*<count>` | Add multiple bots with sequential names        |
| `add <name>~<count>` | Add multiple bots with exact duplicate names   |
| `kick <name>`        | Remove every bot with that name                |
| `kick all`           | Remove all bots at once                        |
| `help`               | Show available commands                        |
| `exit`               | Remove all bots and quit the program           |

### Keys

| Key           | Action                                 |
| ------------- | -------------------------------------- |
| `Enter`       | Run the typed command                  |
| `Up` / `Down` | Browse previous commands               |
| `Tab`         | Switch between the Bots and Logs panel |
| `PgUp/PgDn`   | Scroll the selected panel              |
| `Ctrl+C`      | Remove all bots and quit the program   |

<img width="1666" height="980" alt="Preview" src="Preview.png" />
