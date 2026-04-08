# Planify 🎯

A Windows productivity app built with Electron that lets you create and manage customizable reminder plans with countdown timers.

## Features

- **Multiple Plans** — Create as many plans as you need (Stand Up, Water Break, Review, etc.)
- **Customizable Frequency** — Set how often each plan triggers (in minutes)
- **Customizable Duration** — Set how long each session should last
- **Timer Overlay** — A floating countdown window appears on screen when a plan triggers
- **Dashboard** — Stats at a glance: active plans, sessions today, completion rate, time invested
- **History** — Full session log with completed/skipped status
- **Startup Dialog** — Choose whether to auto-start plans each time the app opens
- **Per-Plan Toggle** — Enable/disable individual plans without deleting them
- **Emoji + Color** — Customize each plan's look

## Project Structure

```
planify/
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main process
│   │   └── preload.js       # Secure IPC bridge
│   └── renderer/
│       ├── index.html       # Main dashboard UI
│       ├── startup.html     # Startup dialog
│       └── timer.html       # Timer overlay window
├── package.json
└── README.md
```

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- npm v8 or higher

### Install & Run

```bash
# Install dependencies
npm install

# Start the app in development mode
npm start
```

### Build for Windows

```bash
# Build a distributable installer
npm run build
```

The installer will be created in the `dist/` folder.

## How It Works

1. **Create a Plan** — Click "New Plan" in the sidebar. Set a name, icon, color, frequency (e.g. every 60 minutes), and duration (e.g. 5 minutes).
2. **Enable the Plan** — Use the toggle on each plan card to start it running.
3. **Get Reminded** — When the frequency interval is up, a floating timer window appears in the bottom-right corner of your screen.
4. **Complete or Skip** — Use the timer window to mark the session done or skip it.
5. **Track Progress** — The dashboard shows your stats and the History tab logs everything.

## Data Storage

Plans and session history are saved automatically to your user data folder:
- **Windows**: `%APPDATA%\planify\planify-data.json`
