// ===========================================================================
// Etat de l'application
// ===========================================================================
let libraryFolders = [];      // dossiers racine de la librairie
let currentPath = null;       // dossier actuellement affiche dans le panneau principal
let currentRootLabel = null;  // nom du dossier racine correspondant (pour le breadcrumb)
let currentEntries = [];      // contenu (fichiers/dossiers) du dossier courant
let viewMode = 'grid';        // 'grid' | 'list'
let expandedPaths = new Set();

const folderTreeEl = document.getElementById('folderTree');
const emptyLibraryHintEl = document.getElementById('emptyLibraryHint');
const fileGridEl = document.getElementById('fileGrid');
const emptyFolderHintEl = document.getElementById('emptyFolderHint');
const breadcrumbEl = document.getElementById('breadcrumb');
const searchInput = document.getElementById('searchInput');
const contextMenuEl = document.getElementById('contextMenu');
const previewAudio = document.getElementById('previewAudio');
const videoModal = document.getElementById('videoModal');
const modalVideo = document.getElementById('modalVideo');

const playerBar = document.getElementById('playerBar');
const playerPlayBtn = document.getElementById('playerPlayBtn');
const playerCurrentTime = document.getElementById('playerCurrentTime');
const playerDuration = document.getElementById('playerDuration');
const playerWaveform = document.getElementById('playerWaveform');
const playerWaveformImg = document.getElementById('playerWaveformImg');
const playerPlayhead = document.getElementById('playerPlayhead');
const playerVolumeSlider = document.getElementById('playerVolumeSlider');
const playerMuteBtn = document.getElementById('playerMuteBtn');
const playerFileName = document.getElementById('playerFileName');

// ===========================================================================
// Categories de fichiers previsualisables
// ===========================================================================
const AUDIO_EXT = new Set(['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg', '.oga', '.wma', '.aiff', '.aif', '.opus']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm', '.wmv', '.mpg', '.mpeg']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
const MAX_WAVEFORM_BYTES = 150 * 1024 * 1024; // au-dela, on affiche juste l'icone (evite de bloquer l'app)

function getCategory(ext) {
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (IMAGE_EXT.has(ext)) return 'image';
  return 'other';
}

// Construit l'URL applib:// (protocole prive, voir main.js) qui pointe vers
// un fichier local donne, pour pouvoir le lire/streamer dans <audio>/<video>/fetch.
function toMediaUrl(filePath) {
  return 'applib://local/' + encodeURIComponent(filePath);
}

// ===========================================================================
// Icones generiques (SVG en data URL) en attendant l'icone native du systeme
// ===========================================================================
const FOLDER_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#e8c25e"><path d="M10 4H2v16h20V6H12l-2-2z"/></svg>`
  );
const FILE_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9ab0c4"><path d="M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5z"/></svg>`
  );

// ===========================================================================
// Init
// ===========================================================================
async function init() {
  libraryFolders = await window.api.getLibrary();
  renderTree();
  if (libraryFolders.length > 0) {
    openFolder(libraryFolders[0].path, libraryFolders[0].name);
  }
}

document.getElementById('addFolderBtn').addEventListener('click', async () => {
  libraryFolders = await window.api.addFolder();
  renderTree();
  if (!currentPath && libraryFolders.length > 0) {
    openFolder(libraryFolders[0].path, libraryFolders[0].name);
  }
});

document.getElementById('gridViewBtn').addEventListener('click', () => setViewMode('grid'));
document.getElementById('listViewBtn').addEventListener('click', () => setViewMode('list'));

function setViewMode(mode) {
  viewMode = mode;
  fileGridEl.className = mode === 'grid' ? 'grid-view' : 'list-view';
  document.getElementById('gridViewBtn').classList.toggle('active', mode === 'grid');
  document.getElementById('listViewBtn').classList.toggle('active', mode === 'list');
}

searchInput.addEventListener('input', () => renderFiles());

// ===========================================================================
// Arbre de la librairie (panneau lateral)
// ===========================================================================
function renderTree() {
  folderTreeEl.innerHTML = '';
  emptyLibraryHintEl.style.display = libraryFolders.length === 0 ? 'block' : 'none';

  for (const root of libraryFolders) {
    folderTreeEl.appendChild(buildTreeNode(root.path, root.name, 0, true));
  }
}

function buildTreeNode(folderPath, label, depth, isRoot) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node';

  const row = document.createElement('div');
  row.className = 'tree-row';
  if (folderPath === currentPath) row.classList.add('selected');

  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.textContent = expandedPaths.has(folderPath) ? '▾' : '▸';
  row.appendChild(caret);

  const icon = document.createElement('img');
  icon.className = 'folder-icon';
  icon.src = FOLDER_ICON;
  icon.width = 14;
  icon.height = 14;
  row.appendChild(icon);

  const labelEl = document.createElement('span');
  labelEl.className = 'label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const childrenContainer = document.createElement('div');
  childrenContainer.className = 'tree-children';
  childrenContainer.style.display = expandedPaths.has(folderPath) ? 'block' : 'none';

  async function toggleExpand() {
    if (expandedPaths.has(folderPath)) {
      expandedPaths.delete(folderPath);
      childrenContainer.style.display = 'none';
      caret.textContent = '▸';
    } else {
      expandedPaths.add(folderPath);
      caret.textContent = '▾';
      childrenContainer.style.display = 'block';
      await loadTreeChildren(folderPath, childrenContainer, depth + 1);
    }
  }

  caret.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExpand();
  });

  row.addEventListener('click', () => {
    openFolder(folderPath, label, isRoot ? label : currentRootLabel);
    renderTree(); // refresh selection highlight
  });

  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items = isRoot
      ? [
          { text: 'Renommer dans la librairie', action: () => renameLibraryFolder(folderPath, label) },
          { text: 'Ouvrir dans l’explorateur', action: () => window.api.showInFolder(folderPath) },
          { text: 'Retirer de la librairie', danger: true, action: () => removeLibraryFolder(folderPath) },
        ]
      : [{ text: 'Ouvrir dans l’explorateur', action: () => window.api.showInFolder(folderPath) }];
    showContextMenu(e.clientX, e.clientY, items);
  });

  wrapper.appendChild(row);
  wrapper.appendChild(childrenContainer);

  // Preload caret state if already expanded (e.g. re-render after selection change)
  if (expandedPaths.has(folderPath)) {
    loadTreeChildren(folderPath, childrenContainer, depth + 1);
  }

  return wrapper;
}

async function loadTreeChildren(folderPath, container, depth) {
  const entries = await window.api.listDir(folderPath);
  container.innerHTML = '';
  if (entries.error) return;
  const dirs = entries.filter((e) => e.isDirectory);
  for (const dir of dirs) {
    container.appendChild(buildTreeNode(dir.path, dir.name, depth, false));
  }
}

async function renameLibraryFolder(folderPath, oldName) {
  const newName = window.prompt('Nouveau nom pour ce dossier dans la librairie :', oldName);
  if (!newName || newName === oldName) return;
  libraryFolders = await window.api.renameFolder(folderPath, newName);
  renderTree();
  if (currentPath === folderPath) breadcrumbEl.textContent = newName;
}

async function removeLibraryFolder(folderPath) {
  libraryFolders = await window.api.removeFolder(folderPath);
  expandedPaths.delete(folderPath);
  renderTree();
  if (currentPath && currentPath.startsWith(folderPath)) {
    currentPath = null;
    fileGridEl.innerHTML = '';
    breadcrumbEl.innerHTML = '';
    if (libraryFolders.length > 0) {
      openFolder(libraryFolders[0].path, libraryFolders[0].name);
    }
  }
}

// ===========================================================================
// Panneau principal : contenu du dossier courant
// ===========================================================================
async function openFolder(folderPath, label, rootLabel) {
  currentPath = folderPath;
  if (rootLabel) currentRootLabel = rootLabel;
  else if (!currentRootLabel) currentRootLabel = label;

  searchInput.value = '';
  const entries = await window.api.listDir(folderPath);
  currentEntries = Array.isArray(entries) ? entries : [];
  renderBreadcrumb();
  renderFiles();
}

function renderBreadcrumb() {
  breadcrumbEl.innerHTML = '';
  if (!currentPath) return;

  // Trouve le dossier racine de la librairie correspondant a currentPath, si possible
  const root = libraryFolders.find(
    (f) => currentPath === f.path || currentPath.startsWith(f.path + '/') || currentPath.startsWith(f.path + '\\')
  );

  let displayRoot = root ? root.path : currentPath;
  let rootLabel = root ? root.name : currentPath;

  let rel = currentPath === displayRoot ? '' : currentPath.slice(displayRoot.length);
  const parts = rel.split(/[\\/]/).filter(Boolean);

  const crumbs = [{ label: rootLabel, path: displayRoot }];
  let acc = displayRoot;
  for (const part of parts) {
    acc = acc + (acc.endsWith('/') || acc.endsWith('\\') ? '' : '/') + part;
    crumbs.push({ label: part, path: acc });
  }

  crumbs.forEach((c, i) => {
    const span = document.createElement('span');
    span.className = 'crumb';
    span.textContent = c.label;
    span.addEventListener('click', () => openFolder(c.path, c.label, rootLabel));
    breadcrumbEl.appendChild(span);
    if (i < crumbs.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '/';
      breadcrumbEl.appendChild(sep);
    }
  });
}

function formatSize(bytes) {
  if (!bytes) return '';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function renderFiles() {
  fileGridEl.innerHTML = '';
  const query = searchInput.value.trim().toLowerCase();
  const filtered = query
    ? currentEntries.filter((e) => e.name.toLowerCase().includes(query))
    : currentEntries;

  emptyFolderHintEl.style.display = filtered.length === 0 ? 'block' : 'none';

  for (const entry of filtered) {
    fileGridEl.appendChild(buildFileItem(entry));
  }
}

// ===========================================================================
// Previsualisation : forme d'onde audio (Web Audio API, aucun outil externe)
// ===========================================================================
let sharedAudioCtx = null;
function getSharedAudioContext() {
  if (!sharedAudioCtx) sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return sharedAudioCtx;
}

const waveformCache = new Map(); // path -> Promise<dataUrl|null>

function renderWaveformDataUrl(audioBuffer) {
  const width = 200;
  const height = 80;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#15171c';
  ctx.fillRect(0, 0, width, height);

  const channelData = audioBuffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(channelData.length / width));
  const mid = height / 2;
  ctx.fillStyle = '#ffffff';
  for (let x = 0; x < width; x++) {
    const start = x * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, channelData.length);
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i++) {
      const v = channelData[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y1 = mid + min * mid * 0.92;
    const y2 = mid + max * mid * 0.92;
    const barHeight = Math.max(1, y2 - y1);
    ctx.fillRect(x, y1, 1, barHeight);
  }
  return canvas.toDataURL('image/png');
}

function generateWaveform(filePath, sizeBytes) {
  if (waveformCache.has(filePath)) return waveformCache.get(filePath);
  if (sizeBytes && sizeBytes > MAX_WAVEFORM_BYTES) {
    const p = Promise.resolve(null);
    waveformCache.set(filePath, p);
    return p;
  }
  const promise = (async () => {
    try {
      const res = await fetch(toMediaUrl(filePath));
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await getSharedAudioContext().decodeAudioData(arrayBuffer);
      return renderWaveformDataUrl(audioBuffer);
    } catch (err) {
      return null;
    }
  })();
  waveformCache.set(filePath, promise);
  return promise;
}

// ===========================================================================
// Previsualisation : vignette video (capture d'une image via <video>+<canvas>)
// ===========================================================================
const videoThumbCache = new Map(); // path -> Promise<dataUrl|null>

function generateVideoThumbnail(filePath) {
  if (videoThumbCache.has(filePath)) return videoThumbCache.get(filePath);
  const promise = new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.src = '';
      video.removeAttribute('src');
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), 8000);

    video.addEventListener('loadedmetadata', () => {
      const seekTime = video.duration && isFinite(video.duration) ? Math.min(1, video.duration / 2) : 0;
      try {
        video.currentTime = seekTime;
      } catch (err) {
        finish(null);
      }
    });

    video.addEventListener('seeked', () => {
      try {
        const width = 200;
        const height = 112;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        const vw = video.videoWidth || width;
        const vh = video.videoHeight || height;
        const scale = Math.min(width / vw, height / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (width - dw) / 2;
        const dy = (height - dh) / 2;
        ctx.drawImage(video, dx, dy, dw, dh);

        finish(canvas.toDataURL('image/jpeg', 0.82));
      } catch (err) {
        finish(null);
      }
    });

    video.addEventListener('error', () => finish(null));
    video.src = toMediaUrl(filePath);
  });
  videoThumbCache.set(filePath, promise);
  return promise;
}

// ===========================================================================
// Lecture audio (clic pour ecouter) et lecture video (lightbox)
// ===========================================================================
let currentAudioPath = null;
let selectedAudioPath = null; // dernier fichier audio selectionne/joue (pour le raccourci Espace)

function setPlayingUI(filePath, playing) {
  if (!filePath) return;
  const el = fileGridEl.querySelector(`[data-path="${CSS.escape(filePath)}"]`);
  if (el) {
    el.classList.toggle('is-playing', playing);
    const badge = el.querySelector('.play-badge');
    if (badge) badge.textContent = playing ? '⏸' : '▶';
  }
  if (filePath === currentAudioPath) {
    playerPlayBtn.textContent = playing ? '⏸' : '▶';
  }
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

previewAudio.addEventListener('play', () => setPlayingUI(currentAudioPath, true));
previewAudio.addEventListener('pause', () => setPlayingUI(currentAudioPath, false));
previewAudio.addEventListener('ended', () => setPlayingUI(currentAudioPath, false));
previewAudio.addEventListener('loadedmetadata', () => {
  playerDuration.textContent = formatTime(previewAudio.duration);
});
previewAudio.addEventListener('timeupdate', () => {
  if (!currentAudioPath || !previewAudio.duration) return;
  const ratio = (previewAudio.currentTime / previewAudio.duration) * 100;
  const el = fileGridEl.querySelector(`[data-path="${CSS.escape(currentAudioPath)}"] .progress-fill`);
  if (el) el.style.width = ratio + '%';
  playerPlayhead.style.left = ratio + '%';
  playerCurrentTime.textContent = formatTime(previewAudio.currentTime);
});

function showPlayerBar(filePath) {
  playerBar.style.display = 'flex';
  playerFileName.textContent = filePath.split(/[\\/]/).pop();
  playerFileName.title = filePath;
  playerWaveformImg.src = FILE_ICON;
  generateWaveform(filePath).then((dataUrl) => {
    if (dataUrl && currentAudioPath === filePath) playerWaveformImg.src = dataUrl;
  });
  playerCurrentTime.textContent = '0:00';
  playerDuration.textContent = formatTime(previewAudio.duration || 0);
  playerPlayhead.style.left = '0%';
}

function toggleAudioPreview(filePath) {
  selectedAudioPath = filePath;
  if (currentAudioPath === filePath && !previewAudio.paused) {
    previewAudio.pause();
    return;
  }
  const previousPath = currentAudioPath;
  if (currentAudioPath !== filePath) {
    currentAudioPath = filePath;
    previewAudio.src = toMediaUrl(filePath);
    showPlayerBar(filePath);
  }
  previewAudio.currentTime = currentAudioPath === previousPath ? previewAudio.currentTime : 0;
  previewAudio.play().catch(() => {});
  if (previousPath && previousPath !== filePath) setPlayingUI(previousPath, false);
}

// ---- Volume ----
let lastVolume = 1;
playerVolumeSlider.addEventListener('input', () => {
  const v = parseFloat(playerVolumeSlider.value);
  previewAudio.volume = v;
  previewAudio.muted = v === 0;
  if (v > 0) lastVolume = v;
  playerMuteBtn.textContent = v === 0 ? '🔇' : v < 0.5 ? '🔉' : '🔊';
});
playerMuteBtn.addEventListener('click', () => {
  if (previewAudio.muted || previewAudio.volume === 0) {
    previewAudio.muted = false;
    previewAudio.volume = lastVolume || 1;
    playerVolumeSlider.value = String(previewAudio.volume);
    playerMuteBtn.textContent = previewAudio.volume < 0.5 ? '🔉' : '🔊';
  } else {
    lastVolume = previewAudio.volume;
    previewAudio.muted = true;
    playerVolumeSlider.value = '0';
    playerMuteBtn.textContent = '🔇';
  }
});
previewAudio.volume = parseFloat(playerVolumeSlider.value);

// ---- Bouton lecture/pause et scrub de la barre de lecture ----
playerPlayBtn.addEventListener('click', () => {
  if (currentAudioPath) toggleAudioPreview(currentAudioPath);
});

playerWaveform.addEventListener('click', (e) => {
  if (!currentAudioPath || !previewAudio.duration) return;
  const rect = playerWaveform.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  previewAudio.currentTime = ratio * previewAudio.duration;
  if (previewAudio.paused) previewAudio.play().catch(() => {});
});

// ---- Raccourci clavier Espace : lecture/pause du dernier fichier audio utilise
// (comme la barre d'espace pour l'apercu rapide sur Mac / dans Premiere) ----
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.key !== ' ') return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return; // laisse taper un espace dans la recherche
  if (videoModal.style.display !== 'none') return; // laisse la video geree par ses propres controles
  if (!selectedAudioPath) return;
  e.preventDefault();
  toggleAudioPreview(selectedAudioPath);
});

function openVideoModal(filePath) {
  modalVideo.src = toMediaUrl(filePath);
  videoModal.style.display = 'flex';
}

function closeVideoModal() {
  modalVideo.pause();
  modalVideo.removeAttribute('src');
  videoModal.style.display = 'none';
}

document.getElementById('closeModalBtn').addEventListener('click', closeVideoModal);
videoModal.querySelector('.modal-backdrop').addEventListener('click', closeVideoModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && videoModal.style.display !== 'none') closeVideoModal();
});

// ===========================================================================
// Construction d'un element de fichier (grille ou liste)
// ===========================================================================
function buildFileItem(entry) {
  const item = document.createElement('div');
  item.className = 'file-item';
  item.draggable = true;
  item.dataset.path = entry.path;

  const category = entry.isDirectory ? 'folder' : getCategory(entry.ext);

  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'thumb-wrap';

  const img = document.createElement('img');
  img.className = 'icon';
  img.src = entry.isDirectory ? FOLDER_ICON : FILE_ICON;
  thumbWrap.appendChild(img);

  if (!entry.isDirectory && (category === 'audio' || category === 'video')) {
    const playBadge = document.createElement('div');
    playBadge.className = 'play-badge';
    playBadge.textContent = '▶';
    thumbWrap.appendChild(playBadge);
  }
  if (!entry.isDirectory && category === 'audio') {
    const progressTrack = document.createElement('div');
    progressTrack.className = 'progress-track';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressTrack.appendChild(progressFill);
    thumbWrap.appendChild(progressTrack);
  }

  item.appendChild(thumbWrap);

  // Chargement asynchrone de la miniature adaptee au type de fichier
  if (!entry.isDirectory) {
    if (category === 'image') {
      img.onerror = () => {
        img.onerror = null;
        window.api.getIcon(entry.path).then((d) => { if (d) img.src = d; });
      };
      img.src = toMediaUrl(entry.path);
      img.classList.add('thumb-cover');
    } else if (category === 'video') {
      generateVideoThumbnail(entry.path).then((dataUrl) => {
        if (dataUrl) {
          img.src = dataUrl;
          img.classList.add('thumb-cover');
        } else {
          window.api.getIcon(entry.path).then((d) => { if (d) img.src = d; });
        }
      });
    } else if (category === 'audio') {
      generateWaveform(entry.path, entry.size).then((dataUrl) => {
        if (dataUrl) {
          img.src = dataUrl;
          img.classList.add('thumb-cover');
        } else {
          window.api.getIcon(entry.path).then((d) => { if (d) img.src = d; });
        }
      });
    } else {
      window.api.getIcon(entry.path).then((dataUrl) => {
        if (dataUrl) img.src = dataUrl;
      });
    }
  }

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = entry.name;
  item.appendChild(name);

  if (viewMode === 'list' && !entry.isDirectory) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = formatSize(entry.size);
    item.appendChild(meta);
  }

  if (entry.isDirectory) {
    item.addEventListener('dblclick', () => openFolder(entry.path, entry.name));
    item.title = 'Double-clic pour ouvrir';
  } else {
    item.title =
      category === 'audio' ? `${entry.name} — clic pour ecouter, glisser pour utiliser`
      : category === 'video' ? `${entry.name} — clic pour visionner, glisser pour utiliser`
      : entry.name;

    if (category === 'audio') {
      item.addEventListener('click', () => toggleAudioPreview(entry.path));
    } else if (category === 'video') {
      item.addEventListener('click', () => openVideoModal(entry.path));
    }
    item.addEventListener('dblclick', () => window.api.openInSystem(entry.path));
  }

  // Glisser-deposer natif vers n'importe quel autre logiciel (Premiere Pro, etc.)
  item.addEventListener('dragstart', (e) => {
    e.preventDefault();
    item.classList.add('dragging');
    window.api.startDrag(entry.path);
  });
  item.addEventListener('dragend', () => item.classList.remove('dragging'));

  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const menuItems = [
      { text: 'Afficher dans le dossier', action: () => window.api.showInFolder(entry.path) },
      { text: 'Ouvrir', action: () => window.api.openInSystem(entry.path) },
    ];
    showContextMenu(e.clientX, e.clientY, menuItems);
  });

  return item;
}

// ===========================================================================
// Menu contextuel generique
// ===========================================================================
function showContextMenu(x, y, items) {
  contextMenuEl.innerHTML = '';
  for (const it of items) {
    const div = document.createElement('div');
    div.className = 'item' + (it.danger ? ' danger' : '');
    div.textContent = it.text;
    div.addEventListener('click', () => {
      hideContextMenu();
      it.action();
    });
    contextMenuEl.appendChild(div);
  }
  contextMenuEl.style.left = x + 'px';
  contextMenuEl.style.top = y + 'px';
  contextMenuEl.style.display = 'block';
}

function hideContextMenu() {
  contextMenuEl.style.display = 'none';
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('contextmenu', (e) => {
  // Ferme le menu si on fait un clic droit ailleurs qu'un item gere plus haut
  if (!e.defaultPrevented) hideContextMenu();
});

init();
