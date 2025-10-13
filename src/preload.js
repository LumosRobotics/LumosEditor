const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  saveFile: (path, content) => ipcRenderer.invoke('save-file', { path, content }),
  readWorkspaceFile: (filePath) => ipcRenderer.invoke('read-workspace-file', filePath),
  getWorkspaceInfo: () => ipcRenderer.invoke('get-workspace-info'),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  openFolderPath: (folderPath) => ipcRenderer.invoke('open-folder-path', folderPath),
  createFile: (dirPath, fileName) => ipcRenderer.invoke('create-file', { dirPath, fileName }),
  createFolder: (dirPath, folderName) => ipcRenderer.invoke('create-folder', { dirPath, folderName }),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  initializeProject: (workspacePath) => ipcRenderer.invoke('initialize-project', workspacePath),
  
  // Serial port operations
  getSerialPorts: () => ipcRenderer.invoke('get-serial-ports'),
  compileCode: (code, boardType) => ipcRenderer.invoke('compile-code', { code, boardType }),
  compileWithArmGcc: (code, boardType) => ipcRenderer.invoke('compile-with-arm-gcc', { code, boardType }),
  flashDevice: (port, code, boardType) => ipcRenderer.invoke('flash-device', { port, code, boardType }),
  serialConnect: (port, baudRate) => ipcRenderer.invoke('serial-connect', { port, baudRate }),
  serialDisconnect: () => ipcRenderer.invoke('serial-disconnect'),
  serialWrite: (data) => ipcRenderer.invoke('serial-write', data),
  serialStatus: () => ipcRenderer.invoke('serial-status'),
  
  // Menu event listeners
  onMenuNewFile: (callback) => ipcRenderer.on('menu-new-file', callback),
  onMenuSave: (callback) => ipcRenderer.on('menu-save', callback),
  onMenuFlash: (callback) => ipcRenderer.on('menu-flash', callback),
  onMenuSerialMonitor: (callback) => ipcRenderer.on('menu-serial-monitor', callback),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', callback),
  onSaveFileAs: (callback) => ipcRenderer.on('save-file-as', callback),
  onSerialPortsUpdated: (callback) => ipcRenderer.on('serial-ports-updated', callback),
  onSerialDataReceived: (callback) => ipcRenderer.on('serial-data-received', callback),
  onSerialError: (callback) => ipcRenderer.on('serial-error', callback),
  
  // Workspace events
  onWorkspaceOpened: (callback) => ipcRenderer.on('workspace-opened', callback),
  onFileAdded: (callback) => ipcRenderer.on('file-added', callback),
  onFileChanged: (callback) => ipcRenderer.on('file-changed', callback),
  onFileRemoved: (callback) => ipcRenderer.on('file-removed', callback),
  onDirectoryAdded: (callback) => ipcRenderer.on('directory-added', callback),
  onDirectoryRemoved: (callback) => ipcRenderer.on('directory-removed', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});