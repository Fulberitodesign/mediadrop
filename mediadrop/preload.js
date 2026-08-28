const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Librairie (dossiers racine)
  getLibrary: () => ipcRenderer.invoke('library:get'),
  addFolder: () => ipcRenderer.invoke('library:addFolder'),
  removeFolder: (folderPath) => ipcRenderer.invoke('library:removeFolder', folderPath),
  renameFolder: (folderPath, newName) => ipcRenderer.invoke('library:renameFolder', folderPath, newName),

  // Systeme de fichiers
  listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),
  getIcon: (filePath) => ipcRenderer.invoke('fs:getIcon', filePath),
  openInSystem: (filePath) => ipcRenderer.invoke('fs:openInSystem', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('fs:showInFolder', filePath),

  // Glisser-deposer natif
  startDrag: (filePath) => ipcRenderer.send('drag:start', filePath),
});
