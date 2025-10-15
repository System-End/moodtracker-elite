const {
  app,
  BrowserWindow,
  powerMonitor,
  ipcMain,
  screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

let mainWindow;
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
      timestamp INTEGER NOT NULL
    )
  `);
}

// Load or create config
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
  const windowWidth = 350;
  const windowHeight = 250;
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
    width: 350,
    height: 250,
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

  // Check idle state every 30 seconds
  setInterval(checkIdleState, 30000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC handlers
ipcMain.on("save-mood", (event, mood) => {
  db.run(
    "INSERT INTO moods (mood, timestamp) VALUES (?, ?)",
    [mood, Date.now()],
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

ipcMain.on("get-moods", (event, days = 7) => {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  db.all(
    "SELECT * FROM moods WHERE timestamp > ? ORDER BY timestamp DESC",
    [since],
    (err, rows) => {
      event.reply("moods-data", rows);
    }
  );
});
