const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { SerialPort } = require('serialport');
const chokidar = require('chokidar');
const SerialManager = require('./serial-manager');
const MCUFlasher = require('./flasher');
const ArmCompiler = require('./compilation');

let mainWindow;
let isDev = process.argv.includes('--dev');
let serialManager = new SerialManager();
let mcuFlasher = new MCUFlasher();
let armCompiler = new ArmCompiler();
let currentWorkspace = null;
let fileWatcher = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    titleBarStyle: 'hiddenInset'
  });

  mainWindow.loadFile('src/index.html');

  // Uncomment to open DevTools in dev mode
  // if (isDev) {
  //   mainWindow.webContents.openDevTools();
  // }

  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu-new-file')
        },
        {
          label: 'Open File',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFile()
        },
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => openFolder()
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu-save')
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => saveFileAs()
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    },
    {
      label: 'Device',
      submenu: [
        {
          label: 'Flash to Device',
          accelerator: 'CmdOrCtrl+U',
          click: () => mainWindow.webContents.send('menu-flash')
        },
        {
          label: 'Serial Monitor',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => mainWindow.webContents.send('menu-serial-monitor')
        },
        { type: 'separator' },
        {
          label: 'Refresh Ports',
          click: () => refreshSerialPorts()
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'C/C++ Files', extensions: ['c', 'cpp', 'h', 'hpp'] },
      { name: 'Arduino Files', extensions: ['ino'] }
    ]
  });

  if (!result.canceled) {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    mainWindow.webContents.send('file-opened', { path: filePath, content });
  }
}

async function saveFileAs() {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'C/C++ Files', extensions: ['c', 'cpp', 'h', 'hpp'] },
      { name: 'Arduino Files', extensions: ['ino'] }
    ]
  });

  if (!result.canceled) {
    mainWindow.webContents.send('save-file-as', result.filePath);
  }
}

async function openFolder() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Open Folder'
  });

  if (!result.canceled) {
    const folderPath = result.filePaths[0];
    await setWorkspace(folderPath);
  }
}

async function setWorkspace(folderPath) {
  currentWorkspace = folderPath;

  // Stop existing file watcher if any
  if (fileWatcher) {
    await fileWatcher.close();
  }

  // Set up file watcher for the new workspace
  fileWatcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\.((?!lumos).)+/, // ignore dotfiles except .lumos and .lumos_ws
    persistent: true,
    ignoreInitial: false,
    depth: 10
  });

  // Send initial file tree and workspace info
  const fileTree = await buildFileTree(folderPath);

  mainWindow.webContents.send('workspace-opened', {
    path: folderPath,
    name: path.basename(folderPath),
    fileTree
  });

  // Watch for file changes
  fileWatcher.on('add', (filePath) => {
    mainWindow.webContents.send('file-added', {
      path: filePath,
      relativePath: path.relative(currentWorkspace, filePath)
    });
  });

  fileWatcher.on('change', (filePath) => {
    mainWindow.webContents.send('file-changed', {
      path: filePath,
      relativePath: path.relative(currentWorkspace, filePath)
    });
  });

  fileWatcher.on('unlink', (filePath) => {
    mainWindow.webContents.send('file-removed', {
      path: filePath,
      relativePath: path.relative(currentWorkspace, filePath)
    });
  });

  fileWatcher.on('addDir', (dirPath) => {
    mainWindow.webContents.send('directory-added', {
      path: dirPath,
      relativePath: path.relative(currentWorkspace, dirPath)
    });
  });

  fileWatcher.on('unlinkDir', (dirPath) => {
    mainWindow.webContents.send('directory-removed', {
      path: dirPath,
      relativePath: path.relative(currentWorkspace, dirPath)
    });
  });
}

async function buildFileTree(dirPath) {
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const tree = [];

    for (const item of items) {
      // Skip hidden files and directories, but keep .lumos and .lumos_ws
      if (item.name.startsWith('.') && item.name !== '.lumos_ws' && item.name !== '.lumos') continue;

      const itemPath = path.join(dirPath, item.name);
      const relativePath = path.relative(currentWorkspace, itemPath);

      if (item.isDirectory()) {
        tree.push({
          name: item.name,
          path: itemPath,
          relativePath,
          type: 'directory',
          children: await buildFileTree(itemPath)
        });
      } else {
        tree.push({
          name: item.name,
          path: itemPath,
          relativePath,
          type: 'file',
          extension: path.extname(item.name)
        });
      }
    }

    // Sort: directories first, then files, both alphabetically
    return tree.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Error building file tree:', error);
    return [];
  }
}

async function refreshSerialPorts() {
  try {
    const ports = await SerialPort.list();
    mainWindow.webContents.send('serial-ports-updated', ports);
  } catch (error) {
    console.error('Error listing serial ports:', error);
  }
}

// IPC handlers
ipcMain.handle('save-file', async (event, { path, content }) => {
  try {
    fs.writeFileSync(path, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-serial-ports', async () => {
  try {
    const ports = await SerialPort.list();
    return ports;
  } catch (error) {
    console.error('Error listing serial ports:', error);
    return [];
  }
});

ipcMain.handle('compile-code', async (event, { code, boardType }) => {
  try {
    let result;

    if (boardType.startsWith('esp32')) {
      result = await mcuFlasher.compileESP32(code);
    } else if (boardType.startsWith('esp8266')) {
      result = await mcuFlasher.compileESP32(code); // ESP8266 uses similar process
    } else {
      // Default to Arduino compilation
      result = await mcuFlasher.compileArduino(code, boardType);
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('compile-with-arm-gcc', async (event) => {
  try {
    // Check if workspace is open
    if (!currentWorkspace) {
      return {
        success: false,
        error: 'No workspace open. Please open a folder first.',
        output: ''
      };
    }

    console.log('Compiling workspace with ARM GCC:', currentWorkspace);

    // Compile the entire workspace
    const result = await armCompiler.compileWorkspace(currentWorkspace);

    return result;
  } catch (error) {
    console.error('Error compiling with ARM GCC:', error);
    return {
      success: false,
      error: error.message,
      output: ''
    };
  }
});

ipcMain.handle('flash-device', async (event, { port, code, boardType }) => {
  try {
    let result;

    if (boardType.startsWith('esp32')) {
      result = await mcuFlasher.flashESP32(code, port);
    } else if (boardType.startsWith('esp8266')) {
      result = await mcuFlasher.flashESP32(code, port); // ESP8266 uses similar process
    } else {
      // Default to Arduino flashing
      result = await mcuFlasher.flashArduino(code, port, boardType);
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('serial-connect', async (event, { port, baudRate }) => {
  try {
    const result = await serialManager.connect(port, baudRate);

    // Set up data callback to send data to renderer
    serialManager.setDataCallback((data) => {
      mainWindow.webContents.send('serial-data-received', data);
    });

    serialManager.setErrorCallback((error) => {
      mainWindow.webContents.send('serial-error', error.message);
    });

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('serial-disconnect', async () => {
  try {
    await serialManager.disconnect();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('serial-write', async (event, data) => {
  try {
    await serialManager.write(data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('serial-status', async () => {
  return {
    connected: serialManager.isConnected(),
    portInfo: serialManager.getPortInfo()
  };
});

ipcMain.handle('read-workspace-file', async (event, filePath) => {
  try {
    // Security check: ensure file is within current workspace
    if (!currentWorkspace || !filePath.startsWith(currentWorkspace)) {
      throw new Error('File access denied: File is outside workspace');
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-workspace-info', async () => {
  if (currentWorkspace) {
    return {
      path: currentWorkspace,
      name: path.basename(currentWorkspace),
      fileTree: await buildFileTree(currentWorkspace)
    };
  }
  return null;
});

ipcMain.handle('open-folder-dialog', async () => {
  await openFolder();
  return { success: true };
});

ipcMain.handle('open-folder-path', async (event, folderPath) => {
  try {
    await setWorkspace(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-file', async (event, { dirPath, fileName }) => {
  try {
    // Security check: ensure directory is within current workspace
    if (!currentWorkspace || !dirPath.startsWith(currentWorkspace)) {
      throw new Error('Access denied: Directory is outside workspace');
    }

    const filePath = path.join(dirPath, fileName);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      throw new Error('File already exists');
    }

    // Create an empty file
    fs.writeFileSync(filePath, '', 'utf8');
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-folder', async (event, { dirPath, folderName }) => {
  try {
    // Security check: ensure directory is within current workspace
    if (!currentWorkspace || !dirPath.startsWith(currentWorkspace)) {
      throw new Error('Access denied: Directory is outside workspace');
    }

    const folderPath = path.join(dirPath, folderName);

    // Check if folder already exists
    if (fs.existsSync(folderPath)) {
      throw new Error('Folder already exists');
    }

    fs.mkdirSync(folderPath, { recursive: true });
    return { success: true, path: folderPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    // Security check: ensure file/folder is within current workspace
    if (!currentWorkspace || !filePath.startsWith(currentWorkspace)) {
      throw new Error('Access denied: Path is outside workspace');
    }

    // Check if path exists
    if (!fs.existsSync(filePath)) {
      throw new Error('Path does not exist');
    }

    // Check if it's a file or directory and delete accordingly
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      // Delete directory recursively
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      // Delete file
      fs.unlinkSync(filePath);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('initialize-project', async (event, workspacePath) => {
  try {
    // Security check: ensure path is the current workspace
    if (!currentWorkspace || workspacePath !== currentWorkspace) {
      throw new Error('Access denied: Invalid workspace path');
    }

    const lumosFile = path.join(workspacePath, '.lumos_ws');

    // Check if .lumos_ws already exists
    if (fs.existsSync(lumosFile)) {
      throw new Error('Project is already initialized');
    }

    // Create .lumos_ws file with project metadata
    const projectConfig = {
      name: path.basename(workspacePath),
      created: new Date().toISOString()
    };

    fs.writeFileSync(lumosFile, JSON.stringify(projectConfig, null, 2));

    // Create main.cpp in the workspace root (only if it doesn't exist)
    const mainFile = path.join(workspacePath, 'main.cpp');
    if (!fs.existsSync(mainFile)) {
      const defaultCode = `void setup() {
  // Your initialization code here
}

void loop() {
  // Your main code here
}`;
      fs.writeFileSync(mainFile, defaultCode);
    }

    return { success: true, message: 'Project initialized successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});