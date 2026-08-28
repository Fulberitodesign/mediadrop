const { app, BrowserWindow, ipcMain, dialog, nativeImage, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');

const MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.wmv': 'video/x-ms-wmv',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

function mimeTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Protocole prive "applib://" : permet au panneau de lire/streamer directement
// n'importe quel fichier local (pour l'ecoute audio, la lecture video et la
// generation de vignettes/formes d'onde) sans desactiver la securite web.
// Doit etre enregistre AVANT que l'app soit "ready".
// ---------------------------------------------------------------------------
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'applib',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);

// ---------------------------------------------------------------------------
// Stockage persistant de la "librairie" (liste des dossiers racine ajoutes)
// ---------------------------------------------------------------------------
const CONFIG_PATH = path.join(app.getPath('userData'), 'library.json');

function loadLibrary() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.folders)) return data.folders;
  } catch (err) {
    // Pas de fichier encore, ou fichier invalide -> librairie vide
  }
  return [];
}

function saveLibrary(folders) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ folders }, null, 2), 'utf-8');
}

let libraryFolders = loadLibrary();

// ---------------------------------------------------------------------------
// Icone utilisee pour le glisser-deposer natif. Chargee UNE SEULE FOIS, de
// facon synchrone, au demarrage : webContents.startDrag() doit etre appele
// de facon synchrone/immediate en reponse au geste de l'utilisateur, sinon
// le systeme d'exploitation annule le glisser-deposer avant qu'il ne
// commence (c'est ce qui empechait le drag de fonctionner de facon fiable).
// ---------------------------------------------------------------------------
const dragIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'drag-icon.png'));

// ---------------------------------------------------------------------------
// Fenetre principale
// ---------------------------------------------------------------------------
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 320,
    minHeight: 360,
    title: 'MediaDrop',
    alwaysOnTop: true, // reste visible au-dessus de Premiere Pro / autres logiciels
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  // Gestionnaire du protocole applib:// -> lit le fichier local directement
  // depuis le disque (via fs, en flux) et gere l'en-tete "Range" a la main,
  // pour permettre le seek dans les lecteurs audio/video (barre de
  // progression, avance rapide) de facon fiable sur Windows comme sur Mac.
  protocol.handle('applib', async (request) => {
    try {
      const url = new URL(request.url);
      const encoded = url.pathname.replace(/^\//, '') || url.hostname;
      const filePath = decodeURIComponent(encoded);

      const stat = await fs.promises.stat(filePath);
      const total = stat.size;
      const mimeType = mimeTypeFor(filePath);
      const range = request.headers.get('Range') || request.headers.get('range');

      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        let start = match && match[1] ? parseInt(match[1], 10) : 0;
        let end = match && match[2] ? parseInt(match[2], 10) : total - 1;
        if (Number.isNaN(start)) start = 0;
        if (Number.isNaN(end) || end >= total) end = total - 1;
        if (start > end) start = end;

        const nodeStream = fs.createReadStream(filePath, { start, end });
        const webStream = Readable.toWeb(nodeStream);
        return new Response(webStream, {
          status: 206,
          headers: {
            'Content-Type': mimeType,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
          },
        });
      }

      const nodeStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(nodeStream);
      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(total),
        },
      });
    } catch (err) {
      return new Response('Not Found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC : gestion de la librairie (dossiers racine)
// ---------------------------------------------------------------------------
ipcMain.handle('library:get', () => libraryFolders);

ipcMain.handle('library:addFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections'],
    title: 'Choisir un ou plusieurs dossiers a ajouter a la librairie',
  });
  if (result.canceled) return libraryFolders;

  for (const folderPath of result.filePaths) {
    if (!libraryFolders.some((f) => f.path === folderPath)) {
      libraryFolders.push({ name: path.basename(folderPath), path: folderPath });
    }
  }
  saveLibrary(libraryFolders);
  return libraryFolders;
});

ipcMain.handle('library:removeFolder', (event, folderPath) => {
  libraryFolders = libraryFolders.filter((f) => f.path !== folderPath);
  saveLibrary(libraryFolders);
  return libraryFolders;
});

ipcMain.handle('library:renameFolder', (event, folderPath, newName) => {
  const entry = libraryFolders.find((f) => f.path === folderPath);
  if (entry) {
    entry.name = newName;
    saveLibrary(libraryFolders);
  }
  return libraryFolders;
});

// ---------------------------------------------------------------------------
// IPC : lecture du systeme de fichiers
// ---------------------------------------------------------------------------
ipcMain.handle('fs:listDir', (event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.')) // masque les fichiers caches
      .map((e) => {
        const fullPath = path.join(dirPath, e.name);
        let size = 0;
        let mtime = 0;
        try {
          const stat = fs.statSync(fullPath);
          size = stat.size;
          mtime = stat.mtimeMs;
        } catch (err) {
          // fichier inaccessible (permissions, lien casse...) -> on ignore les stats
        }
        return {
          name: e.name,
          path: fullPath,
          isDirectory: e.isDirectory(),
          ext: e.isDirectory() ? '' : path.extname(e.name).toLowerCase(),
          size,
          mtime,
        };
      })
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
  } catch (err) {
    return { error: err.message };
  }
});

// Icone native du fichier (comme dans l'explorateur du systeme), en data URL
const iconCache = new Map();

ipcMain.handle('fs:getIcon', async (event, filePath) => {
  if (iconCache.has(filePath)) return iconCache.get(filePath);
  try {
    const icon = await app.getFileIcon(filePath, { size: 'normal' });
    const dataUrl = icon.toDataURL();
    iconCache.set(filePath, dataUrl);
    return dataUrl;
  } catch (err) {
    return null;
  }
});

ipcMain.handle('fs:openInSystem', (event, filePath) => {
  require('electron').shell.openPath(filePath);
});

ipcMain.handle('fs:showInFolder', (event, filePath) => {
  require('electron').shell.showItemInFolder(filePath);
});

// ---------------------------------------------------------------------------
// IPC : glisser-deposer natif vers n'importe quelle autre application
// (appel synchrone, sans attente, pour rester dans le geste de drag de l'OS)
// ---------------------------------------------------------------------------
ipcMain.on('drag:start', (event, filePath) => {
  event.sender.startDrag({
    file: filePath,
    icon: dragIcon,
  });
});
