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

### Command Syntax
```
pin <pin>
add <name>
add <base>*<count>
add <base>~<count>
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
