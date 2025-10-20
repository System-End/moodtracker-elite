const {
  app,
  BrowserWindow,
  powerMonitor,
  ipcMain,
  screen,
  Tray,
  Menu,
  globalShortcut,
} = require("electron");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

let mainWindow;
let tray;
let db;
const IDLE_THRESHOLD = 120; // TODO: change back to 120 for prod
const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
const DB_PATH = path.join(app.getPath("userData"), "moods.db");

function initDatabase() {
  db = new sqlite3.Database(DB_PATH);
  db.run(`
    CREATE TABLE IF NOT EXISTS moods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mood TEXT NOT NULL,
      energy INTEGER,
      note TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { position: "bottom-right", idleMinutes: 2 };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getWindowPosition(position) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 450;
  const windowHeight = 550;
  const padding = 20;

  const positions = {
    "top-left": { x: padding, y: padding },
    "top-right": { x: width - windowWidth - padding, y: padding },
    "bottom-left": { x: padding, y: height - windowHeight - padding },
    "bottom-right": {
      x: width - windowWidth - padding,
      y: height - windowHeight - padding,
    },
  };

  return positions[position] || positions["bottom-right"];
}

function createWindow() {
  const config = loadConfig();
  const position = getWindowPosition(config.position);

  mainWindow = new BrowserWindow({
    width: 450,
    height: 550,
    x: position.x,
    y: position.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("index.html");
}

function createTray() {
  // fallback icon - replace with actual icon.png in prod
  tray = new Tray(createDefaultIcon());

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Log Mood",
      click: () => mainWindow.show(),
    },
    {
      label: "View History",
      click: () => {
        mainWindow.webContents.send("show-history");
        mainWindow.show();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip("Mood Tracker");
  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    mainWindow.show();
  });
}

function createDefaultIcon() {
  const { nativeImage } = require("electron");

  // simple 16x16 purple circle as base64 PNG
  const iconData =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAE3SURBVDiNpdI7S0JRHMDx3+WRD8pHZhAUFQRBDdHQ0NQc0hINLU1Bc0NzRB9BaGhoaQyRoqWGhqYgCHoQBEEQRGPYC1+ZXb2Xbl4qcODC/Z/fOZxz/keQJAnDMGAYBpIkIQgCer0e0WhU8TidTkVhNBolnU5Ld3f38nq9XgRBIJvNks/nlU6n0zidTuXz+ZQsy1xeXtLr9chkMvh8Pnw+H+VyWbm6uiKRSJBKpUgmk1QqFer1OtVqlUajQavVolwuK81mk3a7TafTodvt0uv16Pf7DAYDBu+Dh8mQYcgH2u02s9mM6XSKKIrMZjPm8zmLxYLlcsl4PGY0GimSJCGKIpPJhOFwyGAw4O3tTZFl+U9Zlvl8nyGfzyuKoqxRVVX0L9frrVar1W9UVWU+n/Pw+Mher4eqqmxsbPANK8aErL8MfjYAAAAASUVORK5CYII=";

  return nativeImage.createFromDataURL(iconData);
}

function checkIdleState() {
  const idleTime = powerMonitor.getSystemIdleTime();
  const config = loadConfig();
  const threshold = (config.idleMinutes || 2) * 60;

  if (idleTime >= threshold && !mainWindow.isVisible()) {
    mainWindow.show();
  }
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();
  createTray();

  // dev shortcut
  globalShortcut.register("CommandOrControl+Shift+M", () => {
    console.log("Manual trigger");
    mainWindow.show();
  });

  // check every 30s
  setInterval(checkIdleState, 30000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", (e) => {
  e.preventDefault(); // keep running in tray
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
});

// IPC handlers
ipcMain.on("save-mood", (event, data) => {
  const { mood, energy, note } = data;
  db.run(
    "INSERT INTO moods (mood, energy, note, timestamp) VALUES (?, ?, ?, ?)",
    [mood, energy, note || null, Date.now()],
    (err) => {
      if (err) console.error(err);
      mainWindow.hide();
    }
  );
});

ipcMain.on("dismiss", () => {
  mainWindow.hide();
});

ipcMain.on("get-config", (event) => {
  event.returnValue = loadConfig();
});

ipcMain.on("save-config", (event, config) => {
  saveConfig(config);
  const position = getWindowPosition(config.position);
  mainWindow.setPosition(position.x, position.y);
});

ipcMain.on("get-moods", (event, days = 30) => {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  db.all(
    "SELECT * FROM moods WHERE timestamp > ? ORDER BY timestamp DESC",
    [since],
    (err, rows) => {
      event.reply("moods-data", rows);
    }
  );
});
