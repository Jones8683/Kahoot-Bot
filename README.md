# Kahoot Bot Manager

### Setup

1. Clone repository

```bash
git clone https://github.com/Jones8683/Kahoot-Bot
```

2. Install dependencies

```bash
npm install
```

### Run

Double-click `run.bat`

Flow:

1. Enter the game pin with `pin <pin>` or just type the pin number first.
2. Add bots with one simple syntax style.
3. Remove bots with `kick <name>` or `kick all`.
4. Type `help` anytime for syntax.
5. Type `exit` to quit.

### Command Syntax

```text
pin <pin>
add <name>
add <base>*<count>
kick <name>
kick all
list
clear
help
exit
```

### Run From Terminal

```bash
node index.js
```
