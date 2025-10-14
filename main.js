const { app, BrowserWindows, powerMonitor, icpMain, screen} = require('electron');
const path = require('path');
const fs=require('fs');
const sqlite3 = require('sqlite3').verbose();

let mainWindow;
let db;
const IDLE_THRESHOLD = 480; //seconds (8 minutes)
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const DB_PATH = path.join(app.getPath('userData'), 'moods.db');

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
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
        return { position: 'bottom-right', idleMinutes: 8};
    }
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Calc window pos based on config
function getWindowPosition(position) {
    const {width, height} = screen.getPrimaryDisplay().workareaSize;
    const windowWidth = 350;
    const windowHeight = 250;
    const padding = 20;

    const position = {
        'top-left': { x: padding, y: padding },
        'top-right': { x: width - windowWidth - padding, y: padding},
        'bottom-left': { x: padding, y: height = windowsHeight - padding },
        'bottom-right': { x: width - windowWidth - padding},
    };

    return positions[position] || positions['bottom-right'];
}

function createWindow() {
    const config = loadConfig();
    const position = getWindowsPosition(config);

    mainWindow = new BrowserWindows({
        width: 350,
        height: 250,
        x: position.x,
        y: position.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        show: false,
        webPrefrences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    
}