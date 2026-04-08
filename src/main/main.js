const { app, BrowserWindow, ipcMain, Notification, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Data Store ────────────────────────────────────────────────────────────────
const DATA_PATH = path.join(app.getPath('userData'), 'planify-data.json');

function loadData () {
  try {
    if (fs.existsSync(DATA_PATH)) {
      return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    }
  } catch (e) { console.error('Load error:', e); }
  return { plans: [], sessions: [] };
}

function saveData (data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) { console.error('Save error:', e); }
}

function isPlanRunning (plan) {
  if (!plan) return false;
  if (typeof plan.isRunning === 'boolean') return plan.isRunning;
  return Boolean(plan.enabled);
}

function normalizePlan (plan) {
  const running = isPlanRunning(plan);
  return {
    ...plan,
    isRunning: running,
    enabled: running,
  };
}

function normalizeData (data) {
  let changed = false;

  if (!Array.isArray(data.plans)) {
    data.plans = [];
    changed = true;
  }

  data.plans = data.plans.map((plan) => {
    const normalized = normalizePlan(plan);
    if (plan.isRunning !== normalized.isRunning || plan.enabled !== normalized.enabled) {
      changed = true;
    }
    return normalized;
  });

  if (!Array.isArray(data.sessions)) {
    data.sessions = [];
    changed = true;
  }

  if (changed) saveData(data);
  return data;
}

let appData = normalizeData(loadData());
let tray = null;
let isQuitting = false;
let backgroundNoticeShown = false;

// ─── Windows ───────────────────────────────────────────────────────────────────
let mainWindow = null;
let startupWindow = null;
const timerWindows = new Map(); // planId -> BrowserWindow

function createMainWindow () {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    backgroundColor: '#0d0d0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../assets/icon.ico'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      showBackgroundNotice();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createStartupWindow () {
  startupWindow = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    resizable: false,
    backgroundColor: '#0d0d0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    center: true,
  });
  startupWindow.loadFile(path.join(__dirname, '../renderer/startup.html'));
  startupWindow.once('ready-to-show', () => startupWindow.show());
}

function createTimerWindow (plan, sessionId) {
  if (timerWindows.has(plan.id)) {
    timerWindows.get(plan.id).focus();
    return;
  }

  const { x, y } = getTaskbarPopupPosition(188, 74);
  const win = new BrowserWindow({
    width: 188,
    height: 74,
    x,
    y,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    movable: false,
    backgroundColor: '#0d0d0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.loadFile(path.join(__dirname, '../renderer/timer.html'));
  win.once('ready-to-show', () => {
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.show();
    win.webContents.send('timer:init', { plan, sessionId });
  });

  win.on('closed', () => timerWindows.delete(plan.id));
  timerWindows.set(plan.id, win);
}

function getTaskbarPopupPosition (windowWidth, windowHeight) {
  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;
  const workArea = display.workArea;
  const margin = 10;

  const taskbarOnTop = workArea.y > bounds.y;
  const taskbarOnLeft = workArea.x > bounds.x;
  const taskbarOnRight = workArea.width < bounds.width && workArea.x === bounds.x;

  let x = workArea.x + workArea.width - windowWidth - margin;
  let y = workArea.y + workArea.height - windowHeight - margin;

  if (taskbarOnTop) {
    y = workArea.y + margin;
  } else if (taskbarOnLeft) {
    x = workArea.x + margin;
    y = workArea.y + workArea.height - windowHeight - margin;
  } else if (taskbarOnRight) {
    x = workArea.x + workArea.width - windowWidth - margin;
    y = workArea.y + workArea.height - windowHeight - margin;
  }

  return { x, y };
}

function showMainWindow () {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray () {
  if (tray) return;

  // Fall back to a simple generated icon if no asset icon is available in dev.
  const iconPath = path.join(__dirname, '../assets/icon.ico');
  let trayIcon = nativeImage.createFromPath(iconPath);
  if (trayIcon.isEmpty()) {
    trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAM1BMVEUAAAB8avd8avd8avd8avd8avd8avd8avd8avd8avd8avd8avd8avd8avd8avd8avd8avdQU8d6AAAAEHRSTlMA5PrXSMO2n51qV0IhDsN2RG96lwAAAE5JREFUGNNjYGBgZGJmYmRgAJEYGJmYGMSBmRmYGRgZEJkYGJiZGRgEGBgYwhKQYGRgZGBlYGRgYGSAAkYGJiYmBiYGFhZGBmYHAAAHWAAmYwSxbQAAAABJRU5ErkJggg==');
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Planify is running in background');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Planify', click: () => showMainWindow() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => showMainWindow());
  tray.on('click', () => showMainWindow());
}

function showBackgroundNotice () {
  if (backgroundNoticeShown) return;
  backgroundNoticeShown = true;

  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Planify is still running',
      body: 'Timers continue in the background. Open from the system tray hidden icons.',
      silent: true,
    });
    notification.show();
  }
}

// ─── Plan Timers (interval tracking) ──────────────────────────────────────────
const planIntervals = new Map(); // planId -> { intervalId, nextTrigger }

function syncRunningPlans () {
  const runningPlans = appData.plans.filter(isPlanRunning);
  const runningIds = new Set(runningPlans.map((plan) => plan.id));

  runningPlans.forEach((plan) => {
    if (!planIntervals.has(plan.id)) {
      startPlanTimer(plan);
    }
  });

  for (const planId of planIntervals.keys()) {
    if (!runningIds.has(planId)) {
      stopPlanTimer(planId);
    }
  }

  broadcastTimerState();
}

function startPlanTimer (plan) {
  if (!isPlanRunning(plan)) return;
  if (planIntervals.has(plan.id)) return;

  const frequencyMs = plan.frequency * 60 * 1000;
  const nextTrigger = Date.now() + frequencyMs;

  const intervalId = setInterval(() => {
    triggerPlan(plan.id);
  }, frequencyMs);

  planIntervals.set(plan.id, { intervalId, nextTrigger });
  broadcastTimerState();
}

function stopPlanTimer (planId) {
  const entry = planIntervals.get(planId);
  if (entry) {
    clearInterval(entry.intervalId);
    planIntervals.delete(planId);
    broadcastTimerState();
  }
}

function triggerPlan (planId) {
  const plan = appData.plans.find(p => p.id === planId);
  if (!plan || !isPlanRunning(plan)) {
    stopPlanTimer(planId);
    return;
  }

  // Record session
  const session = {
    id: Date.now().toString(),
    planId,
    startedAt: new Date().toISOString(),
    duration: plan.duration,
    completed: false,
  };
  appData.sessions.push(session);
  saveData(appData);

  // Restart interval tracking
  const entry = planIntervals.get(planId);
  if (entry) {
    entry.nextTrigger = Date.now() + plan.frequency * 60 * 1000;
  }

  // Open timer window
  createTimerWindow(plan, session.id);

  if (Notification.isSupported()) {
    const notification = new Notification({
      title: `${plan.emoji || '⏱'} ${plan.name}`,
      body: `Break timer started for ${plan.duration} minute${plan.duration === 1 ? '' : 's'}.`,
      silent: true,
    });
    notification.on('click', () => {
      const timerWin = timerWindows.get(plan.id);
      if (timerWin) {
        timerWin.show();
        timerWin.focus();
      }
    });
    notification.show();
  }

  // Notify main window
  if (mainWindow) mainWindow.webContents.send('plan:triggered', { plan, session });
}

function broadcastTimerState () {
  const state = {};
  for (const [planId, entry] of planIntervals.entries()) {
    state[planId] = { nextTrigger: entry.nextTrigger };
  }
  if (mainWindow) mainWindow.webContents.send('timer:state', state);
}

// Keep alive broadcast every second for countdown
setInterval(() => {
  if (planIntervals.size > 0) broadcastTimerState();
}, 1000);

// ─── IPC Handlers ──────────────────────────────────────────────────────────────
// Data
ipcMain.handle('data:load', () => appData);

ipcMain.handle('plans:save', (_, plans) => {
  appData.plans = Array.isArray(plans) ? plans.map(normalizePlan) : [];
  saveData(appData);
  syncRunningPlans();
  return true;
});

ipcMain.handle('plan:add', (_, plan) => {
  plan.id = Date.now().toString();
  plan.createdAt = new Date().toISOString();
  plan.isRunning = false;
  plan.enabled = false;
  appData.plans.push(normalizePlan(plan));
  saveData(appData);
  return normalizePlan(plan);
});

ipcMain.handle('plan:update', (_, updated) => {
  const idx = appData.plans.findIndex(p => p.id === updated.id);
  if (idx !== -1) {
    const current = appData.plans[idx];
    appData.plans[idx] = normalizePlan({ ...current, ...updated });
    saveData(appData);
    syncRunningPlans();
    return appData.plans[idx];
  }
  return updated;
});

ipcMain.handle('plan:delete', (_, planId) => {
  stopPlanTimer(planId);
  appData.plans = appData.plans.filter(p => p.id !== planId);
  saveData(appData);
  return true;
});

ipcMain.handle('plan:toggle', (_, { planId, enabled }) => {
  const plan = appData.plans.find(p => p.id === planId);
  if (plan) {
    const isRunning = Boolean(enabled);
    plan.isRunning = isRunning;
    plan.enabled = isRunning;
    saveData(appData);
    if (isRunning) startPlanTimer(plan);
    else stopPlanTimer(planId);
  }
  return true;
});

// Startup response
ipcMain.on('startup:response', (_, { startAll }) => {
  if (startupWindow) { startupWindow.close(); startupWindow = null; }
  createMainWindow();

  if (startAll) {
    setTimeout(() => {
      appData.plans.filter(p => p.enabled).forEach(startPlanTimer);
    }, 500);
  }
});

// Timer window events
ipcMain.on('timer:complete', (_, { planId, sessionId }) => {
  const session = appData.sessions.find(s => s.id === sessionId);
  if (session) {
    session.completed = true;
    session.completedAt = new Date().toISOString();
    saveData(appData);
  }
  const win = timerWindows.get(planId);
  if (win) { win.close(); }
  if (mainWindow) mainWindow.webContents.send('session:completed', { planId, sessionId });
});

ipcMain.on('timer:dismiss', (_, { planId }) => {
  const win = timerWindows.get(planId);
  if (win) win.close();
});

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// ─── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createTray();

  createMainWindow();

  // Resume only plans explicitly marked as running.
  setTimeout(() => {
    appData.plans.filter(isPlanRunning).forEach(startPlanTimer);
  }, 400);
});

app.on('window-all-closed', () => {
  // Keep app alive in tray so plan timers continue in the background.
});

app.on('activate', () => {
  showMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  planIntervals.forEach((entry) => clearInterval(entry.intervalId));
});
