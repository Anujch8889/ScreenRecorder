const { app, BrowserWindow, ipcMain, dialog, globalShortcut, screen, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let cameraWindow;
let cursorWindow;
let cursorInterval;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        },
    });

    const isDev = process.env.npm_lifecycle_event === 'electron:dev';

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Automatically grant permissions
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'accessibility'];
        if (allowedPermissions.includes(permission)) {
            callback(true);
        } else {
            callback(false);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (cameraWindow) cameraWindow.close();
        if (cursorWindow) cursorWindow.close();
        cleanupCursor();
    });
}

function createCameraWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    cameraWindow = new BrowserWindow({
        width: 300,
        height: 300,
        x: width - 320,
        y: height - 320,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: true,
        hasShadow: false,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const isDev = process.env.npm_lifecycle_event === 'electron:dev';
    const url = isDev ? 'http://localhost:5173/#camera' : `file://${path.join(__dirname, '../dist/index.html')}#camera`;

    cameraWindow.loadURL(url);
    cameraWindow.hide();
}

function createCursorWindow() {
    const { width, height } = screen.getPrimaryDisplay().bounds;

    cursorWindow = new BrowserWindow({
        width: width,
        height: height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        hasShadow: false,
        skipTaskbar: true,
        focusable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    cursorWindow.setIgnoreMouseEvents(true);

    const isDev = process.env.npm_lifecycle_event === 'electron:dev';
    const url = isDev ? 'http://localhost:5173/#cursor' : `file://${path.join(__dirname, '../dist/index.html')}#cursor`;

    cursorWindow.loadURL(url);
    cursorWindow.hide(); // CRITICAL: Hide by default to prevent blocking screen

    cursorWindow.setIgnoreMouseEvents(true, { forward: true }); // Ensure clicks pass through
}

function startCursorTracking() {
    if (cursorInterval) clearInterval(cursorInterval);
    cursorInterval = setInterval(() => {
        // Only track if cursor window is valid and visible
        if (cursorWindow && !cursorWindow.isDestroyed() && cursorWindow.isVisible()) {
            const point = screen.getCursorScreenPoint();
            // Send relative to window (which is 0,0)
            cursorWindow.webContents.send('cursor-move', point);
        }
    }, 16); // 60 FPS
}

function cleanupCursor() {
    clearInterval(cursorInterval);
}

app.whenReady().then(() => {
    createWindow();
    createCameraWindow();
    createCursorWindow();

    globalShortcut.register('F9', () => {
        if (mainWindow) mainWindow.webContents.send('hotkey-start-stop');
    });

    globalShortcut.register('F10', () => {
        if (mainWindow) mainWindow.webContents.send('hotkey-pause-resume');
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
            createCameraWindow();
            createCursorWindow();
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ------------- FFmpeg Setup -------------
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
ffmpeg.setFfmpegPath(ffmpegPath);
const os = require('os');

// ------------- IPC Handlers -------------

ipcMain.handle('show-camera', () => {
    if (cameraWindow) cameraWindow.show();
});

ipcMain.handle('hide-camera', () => {
    if (cameraWindow) cameraWindow.hide();
});

ipcMain.handle('show-cursor', () => {
    if (cursorWindow) {
        cursorWindow.show();
        startCursorTracking();
    }
});

ipcMain.handle('hide-cursor', () => {
    if (cursorWindow) {
        cursorWindow.hide();
        cleanupCursor();
    }
});

ipcMain.handle('get-sources', async () => {
    return await desktopCapturer.getSources({ types: ['screen'] });
});

ipcMain.handle('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('open-win-settings', () => {
    require('electron').shell.openExternal('ms-settings:privacy-webcam');
});

ipcMain.handle('save-video', async (event, buffer, extension = 'webm') => {
    const filters = [{ name: 'Video File', extensions: [extension] }];
    if (extension === 'mp4') filters.push({ name: 'WebM Video', extensions: ['webm'] });

    const { filePath } = await dialog.showSaveDialog({
        buttonLabel: 'Save Video',
        defaultPath: `recording-${Date.now()}.${extension}`,
        filters: filters
    });

    if (filePath) {
        // If user wants raw webm (or file path ends in webm), just save
        if (filePath.endsWith('.webm')) {
            fs.writeFile(filePath, Buffer.from(buffer), (err) => {
                if (err) console.error('Failed to save file:', err);
            });
            return { success: true, filePath };
        }

        // Convert to MP4
        const tempPath = path.join(os.tmpdir(), `temp-${Date.now()}.webm`);
        fs.writeFileSync(tempPath, Buffer.from(buffer));

        return new Promise((resolve) => {
            ffmpeg(tempPath)
                .outputOptions('-c:v libx264')
                .output(filePath)
                .on('end', () => {
                    fs.unlink(tempPath, () => { });
                    resolve({ success: true, filePath });
                })
                .on('error', (err) => {
                    console.error('Conversion Error:', err);
                    fs.unlink(tempPath, () => { });
                    const fallbackPath = filePath + '.webm';
                    fs.copyFileSync(tempPath, fallbackPath);
                    resolve({ success: false, error: 'Conversion failed. Saved as ' + path.basename(fallbackPath) });
                })
                .run();
        });
    }
    return { canceled: true };
});
