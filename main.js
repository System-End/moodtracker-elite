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
const IDLE_THRESHOLD = 120; // seconds (2 minutes)
const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
const DB_PATH = path.join(app.getPath("userData"), "moods.db");

// Initialize database
function initDatabase() {
  db = new sqlite3.Database(DB_PATH);
  db.run(`
    CREATE TABLE IF NOT EXISTS moods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mood TEXT NOT NULL,
      note TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
}

// Load/create config
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

// Calculate window position based on config
function getWindowPosition(position) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 400;
  const windowHeight = 350;
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
    width: 400,
    height: 350,
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

// Create system tray icon
function createTray() {
  // Create a simple icon
  const iconPath = path.join(__dirname, "icon.png");

  // For testing
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

  // Double click to open
  tray.on("double-click", () => {
    mainWindow.show();
  });
}

// Create a simple icon for testing
function createDefaultIcon() {
  const { nativeImage } = require("electron");
  const canvas = require("canvas");
  const canvasObj = canvas.createCanvas(16, 16);
  const ctx = canvasObj.getContext("2d");

  ctx.fillStyle = "#667eea";
  ctx.beginPath();
  ctx.arc(8, 8, 7, 0, Math.PI * 2);
  ctx.fill();

  return nativeImage.createFromDataURL(canvasObj.toDataURL());
}

// Check for idle state
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

  // Testing shortcutw
  globalShortcut.register("CommandOrControl+Shift+M", () => {
    console.log("Manual trigger - showing window");
    mainWindow.show();
  });

  // Check idle state every 30 seconds
  setInterval(checkIdleState, 30000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", (e) => {
  // Prevent quit - keep running in tray
  e.preventDefault();
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
});

// IPC handlers
ipcMain.on("save-mood", (event, data) => {
  const { mood, note } = data;
  db.run(
    "INSERT INTO moods (mood, note, timestamp) VALUES (?, ?, ?)",
    [mood, note || null, Date.now()],
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
