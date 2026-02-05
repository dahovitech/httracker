/**
 * HTTracker Premium - Service Worker (Background Script)
 * Gère les opérations en arrière-plan et coordonne le téléchargement
 */

// État global du téléchargement
let downloadState = {
  isActive: false,
  isPaused: false,
  currentUrl: null,
  queue: [],
  downloaded: new Set(),
  failed: new Set(),
  resources: new Map(),
  stats: {
    totalFiles: 0,
    downloadedFiles: 0,
    totalSize: 0,
    startTime: null
  },
  settings: {
    depth: 2,
    parallel: 5,
    resourceTypes: ['html', 'css', 'js', 'images'],
    respectRobots: true,
    requestDelay: 100,
    requestTimeout: 30000,
    maxFileSize: 50 * 1024 * 1024,
    includeCookies: false,
    exportFormat: 'zip'
  }
};

// Ouvrir le side panel au clic sur l'icône
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Écouter les messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Permet l'envoi de réponse asynchrone
});

/**
 * Gestionnaire principal des messages
 */
async function handleMessage(message, sender, sendResponse) {
  switch (message.action) {
    case 'getTabInfo':
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        sendResponse({
          url: tabs[0].url,
          title: tabs[0].title
        });
      }
      break;

    case 'startDownload':
      await startDownload(message.config, sendResponse);
      break;

    case 'cancelDownload':
      cancelDownload(sendResponse);
      break;

    case 'pauseDownload':
      pauseDownload(sendResponse);
      break;

    case 'resumeDownload':
      resumeDownload(sendResponse);
      break;

    case 'getDownloadStatus':
      sendResponse({
        isActive: downloadState.isActive,
        isPaused: downloadState.isPaused,
        stats: downloadState.stats
      });
      break;

    case 'getSettings':
      const savedSettings = await chrome.storage.local.get('settings');
      sendResponse(savedSettings.settings || downloadState.settings);
      break;

    case 'saveSettings':
      await chrome.storage.local.set({ settings: message.settings });
      downloadState.settings = { ...downloadState.settings, ...message.settings };
      sendResponse({ success: true });
      break;

    case 'getHistory':
      const history = await getHistory();
      sendResponse(history);
      break;

    case 'clearHistory':
      await chrome.storage.local.set({ history: [] });
      sendResponse({ success: true });
      break;

    case 'getStats':
      const stats = await getStats();
      sendResponse(stats);
      break;

    case 'fetchResource':
      const resource = await fetchResource(message.url, message.options);
      sendResponse(resource);
      break;

    default:
      sendResponse({ error: 'Unknown action' });
  }
}

/**
 * Démarre le téléchargement d'un site
 */
async function startDownload(config, sendResponse) {
  if (downloadState.isActive) {
    sendResponse({ error: 'Un téléchargement est déjà en cours' });
    return;
  }

  // Initialiser l'état
  downloadState = {
    ...downloadState,
    isActive: true,
    isPaused: false,
    currentUrl: config.url,
    queue: [{ url: config.url, depth: 0, type: 'html' }],
    downloaded: new Set(),
    failed: new Set(),
    resources: new Map(),
    stats: {
      totalFiles: 1,
      downloadedFiles: 0,
      totalSize: 0,
      startTime: Date.now()
    },
    settings: { ...downloadState.settings, ...config }
  };

  sendResponse({ success: true, message: 'Téléchargement démarré' });

  // Démarrer le processus de crawl
  try {
    await crawlWebsite();
  } catch (error) {
    console.error('Erreur de crawl:', error);
    notifyProgress({ type: 'error', message: error.message });
  }
}

/**
 * Processus principal de crawl du site web
 */
async function crawlWebsite() {
  const { settings } = downloadState;
  const baseUrl = new URL(downloadState.currentUrl);

  notifyProgress({ type: 'log', message: `Démarrage du crawl de ${baseUrl.hostname}` });

  while (downloadState.queue.length > 0 && downloadState.isActive) {
    if (downloadState.isPaused) {
      await sleep(100);
      continue;
    }

    // Traiter les requêtes en parallèle
    const batch = downloadState.queue.splice(0, settings.parallel);

    await Promise.all(batch.map(async (item) => {
      if (downloadState.downloaded.has(item.url) || downloadState.failed.has(item.url)) {
        return;
      }

      try {
        await processResource(item, baseUrl);
      } catch (error) {
        downloadState.failed.add(item.url);
        notifyProgress({
          type: 'error',
          message: `Erreur: ${truncateUrl(item.url)}`
        });
      }

      // Délai entre les requêtes
      if (settings.requestDelay > 0) {
        await sleep(settings.requestDelay);
      }
    }));

    // Mettre à jour la progression
    updateProgress();
  }

  // Téléchargement terminé
  if (downloadState.isActive) {
    await finalizeDownload();
  }
}

/**
 * Traite une ressource individuelle
 */
async function processResource(item, baseUrl) {
  const { url, depth, type } = item;
  const { settings } = downloadState;

  // Vérifier si l'URL est valide et du même domaine
  try {
    const resourceUrl = new URL(url);
    if (resourceUrl.hostname !== baseUrl.hostname && type === 'html') {
      return; // Ne pas suivre les liens externes pour les pages HTML
    }
  } catch {
    return;
  }

  notifyProgress({ type: 'log', message: `Téléchargement: ${truncateUrl(url)}` });

  // Télécharger la ressource
  const response = await fetchWithTimeout(url, settings.requestTimeout);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const contentLength = parseInt(response.headers.get('content-length') || '0');

  // Vérifier la taille
  if (contentLength > settings.maxFileSize) {
    notifyProgress({
      type: 'warning',
      message: `Fichier trop volumineux ignoré: ${truncateUrl(url)}`
    });
    return;
  }

  // Récupérer le contenu
  let content;
  const isText = contentType.includes('text') ||
                 contentType.includes('javascript') ||
                 contentType.includes('json') ||
                 contentType.includes('xml');

  if (isText) {
    content = await response.text();
  } else {
    content = await response.arrayBuffer();
  }

  // Stocker la ressource
  const resourcePath = urlToPath(url, baseUrl);
  downloadState.resources.set(resourcePath, {
    url,
    content,
    contentType,
    size: isText ? content.length : content.byteLength
  });

  downloadState.downloaded.add(url);
  downloadState.stats.downloadedFiles++;
  downloadState.stats.totalSize += isText ? content.length : content.byteLength;

  notifyProgress({
    type: 'success',
    message: `OK: ${truncateUrl(url)}`
  });

  // Extraire les liens si c'est une page HTML et qu'on n'a pas atteint la profondeur max
  if (type === 'html' && isText && depth < settings.depth) {
    const links = extractLinks(content, url, baseUrl);
    addToQueue(links, depth + 1);
  }

  // Extraire les ressources CSS/JS
  if (type === 'html' && isText) {
    const resources = extractResources(content, url, baseUrl);
    addResourcesToQueue(resources);
  }

  // Extraire les imports CSS
  if (contentType.includes('css') && isText) {
    const cssResources = extractCSSResources(content, url, baseUrl);
    addResourcesToQueue(cssResources);
  }
}

/**
 * Extrait les liens d'une page HTML
 */
function extractLinks(html, pageUrl, baseUrl) {
  const links = [];
  const hrefRegex = /<a[^>]+href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const absoluteUrl = new URL(match[1], pageUrl).href;
      const parsedUrl = new URL(absoluteUrl);

      // Ignorer les ancres, javascript:, mailto:, etc.
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        continue;
      }

      // Vérifier si c'est le même domaine
      if (parsedUrl.hostname === baseUrl.hostname) {
        // Retirer le fragment
        parsedUrl.hash = '';
        links.push(parsedUrl.href);
      }
    } catch {
      // URL invalide, ignorer
    }
  }

  return [...new Set(links)];
}

/**
 * Extrait les ressources d'une page HTML (CSS, JS, images)
 */
function extractResources(html, pageUrl, baseUrl) {
  const resources = [];
  const { settings } = downloadState;

  // CSS
  if (settings.resourceTypes.includes('css')) {
    const cssRegex = /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["']|<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
    let match;
    while ((match = cssRegex.exec(html)) !== null) {
      const url = match[1] || match[2];
      if (url) {
        try {
          resources.push({ url: new URL(url, pageUrl).href, type: 'css' });
        } catch {}
      }
    }

    // Style inline avec @import
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    while ((match = styleRegex.exec(html)) !== null) {
      const imports = extractCSSImports(match[1], pageUrl);
      resources.push(...imports.map(url => ({ url, type: 'css' })));
    }
  }

  // JavaScript
  if (settings.resourceTypes.includes('js')) {
    const jsRegex = /<script[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = jsRegex.exec(html)) !== null) {
      try {
        resources.push({ url: new URL(match[1], pageUrl).href, type: 'js' });
      } catch {}
    }
  }

  // Images
  if (settings.resourceTypes.includes('images')) {
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      try {
        resources.push({ url: new URL(match[1], pageUrl).href, type: 'image' });
      } catch {}
    }

    // srcset
    const srcsetRegex = /srcset=["']([^"']+)["']/gi;
    while ((match = srcsetRegex.exec(html)) !== null) {
      const srcset = match[1].split(',');
      srcset.forEach(src => {
        const url = src.trim().split(/\s+/)[0];
        if (url) {
          try {
            resources.push({ url: new URL(url, pageUrl).href, type: 'image' });
          } catch {}
        }
      });
    }

    // background-image inline
    const bgRegex = /url\(["']?([^"')]+)["']?\)/gi;
    while ((match = bgRegex.exec(html)) !== null) {
      try {
        const url = new URL(match[1], pageUrl).href;
        if (isImageUrl(url)) {
          resources.push({ url, type: 'image' });
        }
      } catch {}
    }
  }

  // Fonts
  if (settings.resourceTypes.includes('fonts')) {
    const fontRegex = /url\(["']?([^"')]+\.(?:woff2?|ttf|otf|eot))["']?\)/gi;
    let match;
    while ((match = fontRegex.exec(html)) !== null) {
      try {
        resources.push({ url: new URL(match[1], pageUrl).href, type: 'font' });
      } catch {}
    }
  }

  return resources;
}

/**
 * Extrait les ressources d'un fichier CSS
 */
function extractCSSResources(css, cssUrl, baseUrl) {
  const resources = [];
  const { settings } = downloadState;

  // @import
  const imports = extractCSSImports(css, cssUrl);
  resources.push(...imports.map(url => ({ url, type: 'css' })));

  // url()
  const urlRegex = /url\(["']?([^"')]+)["']?\)/gi;
  let match;
  while ((match = urlRegex.exec(css)) !== null) {
    const url = match[1];
    if (url.startsWith('data:')) continue;

    try {
      const absoluteUrl = new URL(url, cssUrl).href;

      if (isImageUrl(absoluteUrl) && settings.resourceTypes.includes('images')) {
        resources.push({ url: absoluteUrl, type: 'image' });
      } else if (isFontUrl(absoluteUrl) && settings.resourceTypes.includes('fonts')) {
        resources.push({ url: absoluteUrl, type: 'font' });
      }
    } catch {}
  }

  return resources;
}

/**
 * Extrait les @import d'un CSS
 */
function extractCSSImports(css, baseUrl) {
  const imports = [];
  const importRegex = /@import\s+(?:url\()?["']?([^"'\)]+)["']?\)?/gi;
  let match;

  while ((match = importRegex.exec(css)) !== null) {
    try {
      imports.push(new URL(match[1], baseUrl).href);
    } catch {}
  }

  return imports;
}

/**
 * Ajoute des liens à la queue
 */
function addToQueue(urls, depth) {
  urls.forEach(url => {
    if (!downloadState.downloaded.has(url) &&
        !downloadState.failed.has(url) &&
        !downloadState.queue.some(item => item.url === url)) {
      downloadState.queue.push({ url, depth, type: 'html' });
      downloadState.stats.totalFiles++;
    }
  });
}

/**
 * Ajoute des ressources à la queue
 */
function addResourcesToQueue(resources) {
  resources.forEach(({ url, type }) => {
    if (!downloadState.downloaded.has(url) &&
        !downloadState.failed.has(url) &&
        !downloadState.queue.some(item => item.url === url)) {
      downloadState.queue.push({ url, depth: 0, type });
      downloadState.stats.totalFiles++;
    }
  });
}

/**
 * Convertit une URL en chemin de fichier
 */
function urlToPath(url, baseUrl) {
  try {
    const parsedUrl = new URL(url);
    let path = parsedUrl.pathname;

    // Ajouter le hostname pour les ressources externes
    if (parsedUrl.hostname !== baseUrl.hostname) {
      path = `/_external/${parsedUrl.hostname}${path}`;
    }

    // Gérer les chemins vides ou racine
    if (path === '' || path === '/') {
      path = '/index.html';
    }

    // Ajouter .html si nécessaire
    if (!path.includes('.') && !path.endsWith('/')) {
      path += '.html';
    }

    // Gérer les chemins se terminant par /
    if (path.endsWith('/')) {
      path += 'index.html';
    }

    // Ajouter les paramètres de requête comme partie du nom
    if (parsedUrl.search) {
      const ext = path.substring(path.lastIndexOf('.'));
      const base = path.substring(0, path.lastIndexOf('.'));
      path = base + '_' + encodeURIComponent(parsedUrl.search.substring(1)) + ext;
    }

    return path.startsWith('/') ? path.substring(1) : path;
  } catch {
    return 'unknown_' + Date.now();
  }
}

/**
 * Met à jour et notifie la progression
 */
function updateProgress() {
  const { stats } = downloadState;
  const progress = stats.totalFiles > 0
    ? Math.round((stats.downloadedFiles / stats.totalFiles) * 100)
    : 0;

  notifyProgress({
    type: 'progress',
    data: {
      percent: progress,
      downloaded: stats.downloadedFiles,
      total: stats.totalFiles,
      size: formatSize(stats.totalSize),
      queue: downloadState.queue.length
    }
  });
}

/**
 * Finalise le téléchargement et génère le fichier
 */
async function finalizeDownload() {
  notifyProgress({ type: 'log', message: 'Finalisation du téléchargement...' });

  try {
    // Réécrire les URLs dans les fichiers
    rewriteUrls();

    // Générer et télécharger le fichier
    if (downloadState.settings.exportFormat === 'zip') {
      await generateAndDownloadZip();
    } else {
      await generateAndDownloadMHTML();
    }

    // Sauvegarder dans l'historique
    await saveToHistory();

    // Mettre à jour les statistiques globales
    await updateGlobalStats();

    notifyProgress({
      type: 'complete',
      message: 'Téléchargement terminé avec succès!'
    });

  } catch (error) {
    notifyProgress({
      type: 'error',
      message: `Erreur de finalisation: ${error.message}`
    });
  }

  downloadState.isActive = false;
}

/**
 * Réécrit les URLs dans les fichiers pour le fonctionnement hors-ligne
 */
function rewriteUrls() {
  const baseUrl = new URL(downloadState.currentUrl);

  downloadState.resources.forEach((resource, path) => {
    if (typeof resource.content === 'string') {
      let content = resource.content;

      // Réécrire les liens absolus en relatifs
      const urlPatterns = [
        /href=["'](https?:\/\/[^"']+)["']/gi,
        /src=["'](https?:\/\/[^"']+)["']/gi,
        /url\(["']?(https?:\/\/[^"')]+)["']?\)/gi
      ];

      urlPatterns.forEach(pattern => {
        content = content.replace(pattern, (match, url) => {
          try {
            const parsedUrl = new URL(url);
            if (parsedUrl.hostname === baseUrl.hostname ||
                downloadState.downloaded.has(url)) {
              const relativePath = urlToPath(url, baseUrl);
              const currentDepth = (path.match(/\//g) || []).length;
              const prefix = '../'.repeat(currentDepth);
              return match.replace(url, prefix + relativePath);
            }
          } catch {}
          return match;
        });
      });

      resource.content = content;
    }
  });
}

/**
 * Génère et télécharge le fichier ZIP
 */
async function generateAndDownloadZip() {
  // Envoyer un message pour utiliser JSZip côté client
  const hostname = new URL(downloadState.currentUrl).hostname;
  const filename = `${hostname}_${formatDate(new Date())}.zip`;

  // Convertir les ressources pour l'envoi
  const resources = {};
  downloadState.resources.forEach((resource, path) => {
    if (typeof resource.content === 'string') {
      resources[path] = {
        content: resource.content,
        type: 'text'
      };
    } else {
      // Convertir ArrayBuffer en base64
      resources[path] = {
        content: arrayBufferToBase64(resource.content),
        type: 'binary'
      };
    }
  });

  // Envoyer au sidepanel pour génération du ZIP
  chrome.runtime.sendMessage({
    action: 'generateZip',
    data: {
      filename,
      resources
    }
  });
}

/**
 * Génère et télécharge le fichier MHTML
 */
async function generateAndDownloadMHTML() {
  // Obtenir l'onglet actif
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return;

  try {
    // Utiliser l'API pageCapture pour générer le MHTML
    chrome.pageCapture.saveAsMHTML({ tabId: tabs[0].id }, (mhtmlData) => {
      if (mhtmlData) {
        const hostname = new URL(downloadState.currentUrl).hostname;
        const filename = `${hostname}_${formatDate(new Date())}.mhtml`;

        const url = URL.createObjectURL(mhtmlData);
        chrome.downloads.download({
          url: url,
          filename: filename,
          saveAs: true
        });
      }
    });
  } catch (error) {
    console.error('Erreur MHTML:', error);
    // Fallback vers ZIP
    await generateAndDownloadZip();
  }
}

/**
 * Sauvegarde dans l'historique
 */
async function saveToHistory() {
  const { stats } = downloadState;
  const entry = {
    id: Date.now(),
    url: downloadState.currentUrl,
    date: new Date().toISOString(),
    files: stats.downloadedFiles,
    size: stats.totalSize,
    duration: Date.now() - stats.startTime
  };

  const { history = [] } = await chrome.storage.local.get('history');
  history.unshift(entry);

  // Garder les 50 derniers
  if (history.length > 50) {
    history.pop();
  }

  await chrome.storage.local.set({ history });
}

/**
 * Met à jour les statistiques globales
 */
async function updateGlobalStats() {
  const { globalStats = {
    totalDownloads: 0,
    totalFiles: 0,
    totalSize: 0,
    byType: { html: 0, css: 0, js: 0, images: 0, other: 0 }
  }} = await chrome.storage.local.get('globalStats');

  globalStats.totalDownloads++;
  globalStats.totalFiles += downloadState.stats.downloadedFiles;
  globalStats.totalSize += downloadState.stats.totalSize;

  // Compter par type
  downloadState.resources.forEach((resource, path) => {
    const ext = path.split('.').pop().toLowerCase();
    if (['html', 'htm'].includes(ext)) {
      globalStats.byType.html++;
    } else if (ext === 'css') {
      globalStats.byType.css++;
    } else if (['js', 'mjs'].includes(ext)) {
      globalStats.byType.js++;
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'].includes(ext)) {
      globalStats.byType.images++;
    } else {
      globalStats.byType.other++;
    }
  });

  await chrome.storage.local.set({ globalStats });
}

/**
 * Annule le téléchargement en cours
 */
function cancelDownload(sendResponse) {
  downloadState.isActive = false;
  downloadState.isPaused = false;
  downloadState.queue = [];

  notifyProgress({ type: 'cancelled', message: 'Téléchargement annulé' });
  sendResponse({ success: true });
}

/**
 * Met en pause le téléchargement
 */
function pauseDownload(sendResponse) {
  downloadState.isPaused = true;
  notifyProgress({ type: 'paused', message: 'Téléchargement en pause' });
  sendResponse({ success: true });
}

/**
 * Reprend le téléchargement
 */
function resumeDownload(sendResponse) {
  downloadState.isPaused = false;
  notifyProgress({ type: 'resumed', message: 'Téléchargement repris' });
  sendResponse({ success: true });
}

/**
 * Récupère l'historique
 */
async function getHistory() {
  const { history = [] } = await chrome.storage.local.get('history');
  return history;
}

/**
 * Récupère les statistiques
 */
async function getStats() {
  const { globalStats = {
    totalDownloads: 0,
    totalFiles: 0,
    totalSize: 0,
    byType: { html: 0, css: 0, js: 0, images: 0, other: 0 }
  }} = await chrome.storage.local.get('globalStats');
  return globalStats;
}

/**
 * Télécharge une ressource avec timeout
 */
async function fetchWithTimeout(url, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: downloadState.settings.includeCookies ? 'include' : 'omit'
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Télécharge une ressource unique
 */
async function fetchResource(url, options = {}) {
  try {
    const response = await fetchWithTimeout(url, options.timeout || 30000);
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get('content-type');
    const isText = contentType && (
      contentType.includes('text') ||
      contentType.includes('javascript') ||
      contentType.includes('json')
    );

    return {
      content: isText ? await response.text() : await response.arrayBuffer(),
      contentType,
      isText
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Notifie la progression au sidepanel
 */
function notifyProgress(data) {
  chrome.runtime.sendMessage({ action: 'progressUpdate', ...data }).catch(() => {
    // Le sidepanel peut ne pas être ouvert
  });
}

// === Utilitaires ===

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function truncateUrl(url, maxLength = 50) {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDate(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function isImageUrl(url) {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp'];
  const ext = url.split('.').pop().toLowerCase().split('?')[0];
  return imageExtensions.includes(ext);
}

function isFontUrl(url) {
  const fontExtensions = ['woff', 'woff2', 'ttf', 'otf', 'eot'];
  const ext = url.split('.').pop().toLowerCase().split('?')[0];
  return fontExtensions.includes(ext);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Installer le side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
