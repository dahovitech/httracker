/**
 * HTTracker Premium - SidePanel Script
 * Gère l'interface utilisateur et les interactions
 */

// État de l'application
const state = {
  currentTab: 'download',
  depth: 2,
  parallel: 5,
  isDownloading: false,
  settings: {}
};

// Éléments DOM
const elements = {};

/**
 * Initialisation
 */
document.addEventListener('DOMContentLoaded', async () => {
  initElements();
  initEventListeners();
  await loadSettings();
  await updateCurrentTab();
  await loadHistory();
  await loadStats();
});

/**
 * Initialise les références aux éléments DOM
 */
function initElements() {
  elements.app = document.querySelector('.app');
  elements.themeToggle = document.getElementById('themeToggle');
  elements.tabs = document.querySelectorAll('.tab');
  elements.tabContents = document.querySelectorAll('.tab-content');

  // Download tab
  elements.currentUrl = document.getElementById('currentUrl');
  elements.pageTitle = document.getElementById('pageTitle');
  elements.urlInput = document.getElementById('urlInput');
  elements.useCurrentUrl = document.getElementById('useCurrentUrl');
  elements.depthValue = document.getElementById('depthValue');
  elements.depthMinus = document.getElementById('depthMinus');
  elements.depthPlus = document.getElementById('depthPlus');
  elements.parallelValue = document.getElementById('parallelValue');
  elements.parallelMinus = document.getElementById('parallelMinus');
  elements.parallelPlus = document.getElementById('parallelPlus');
  elements.resourceFilters = document.querySelectorAll('.chip input');
  elements.startDownload = document.getElementById('startDownload');
  elements.progressSection = document.getElementById('progressSection');
  elements.cancelDownload = document.getElementById('cancelDownload');
  elements.progressBar = document.getElementById('progressBar');
  elements.progressPercent = document.getElementById('progressPercent');
  elements.filesDownloaded = document.getElementById('filesDownloaded');
  elements.totalSize = document.getElementById('totalSize');
  elements.progressLog = document.getElementById('progressLog');

  // History tab
  elements.historyList = document.getElementById('historyList');
  elements.clearHistory = document.getElementById('clearHistory');

  // Settings tab
  elements.respectRobots = document.getElementById('respectRobots');
  elements.requestDelay = document.getElementById('requestDelay');
  elements.requestTimeout = document.getElementById('requestTimeout');
  elements.maxFileSize = document.getElementById('maxFileSize');
  elements.includeCookies = document.getElementById('includeCookies');
  elements.verboseLogs = document.getElementById('verboseLogs');
  elements.exportFormatRadios = document.querySelectorAll('input[name="exportFormat"]');
  elements.resetSettings = document.getElementById('resetSettings');

  // Stats tab
  elements.totalDownloads = document.getElementById('totalDownloads');
  elements.totalFiles = document.getElementById('totalFiles');
  elements.totalSizeStats = document.getElementById('totalSizeStats');
  elements.htmlCount = document.getElementById('htmlCount');
  elements.cssCount = document.getElementById('cssCount');
  elements.jsCount = document.getElementById('jsCount');
  elements.imagesCount = document.getElementById('imagesCount');
  elements.otherCount = document.getElementById('otherCount');
  elements.exportStats = document.getElementById('exportStats');
}

/**
 * Initialise les écouteurs d'événements
 */
function initEventListeners() {
  // Thème
  elements.themeToggle.addEventListener('click', toggleTheme);

  // Onglets
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Download tab
  elements.useCurrentUrl.addEventListener('click', async () => {
    const info = await getTabInfo();
    if (info && info.url) {
      elements.urlInput.value = info.url;
    }
  });

  elements.depthMinus.addEventListener('click', () => updateStepper('depth', -1));
  elements.depthPlus.addEventListener('click', () => updateStepper('depth', 1));
  elements.parallelMinus.addEventListener('click', () => updateStepper('parallel', -1));
  elements.parallelPlus.addEventListener('click', () => updateStepper('parallel', 1));

  elements.resourceFilters.forEach(filter => {
    filter.addEventListener('change', () => {
      filter.closest('.chip').classList.toggle('active', filter.checked);
    });
  });

  elements.startDownload.addEventListener('click', startDownload);
  elements.cancelDownload.addEventListener('click', cancelDownload);

  // History tab
  elements.clearHistory.addEventListener('click', clearHistory);

  // Settings tab
  elements.respectRobots.addEventListener('change', saveSettings);
  elements.requestDelay.addEventListener('change', saveSettings);
  elements.requestTimeout.addEventListener('change', saveSettings);
  elements.maxFileSize.addEventListener('change', saveSettings);
  elements.includeCookies.addEventListener('change', saveSettings);
  elements.verboseLogs.addEventListener('change', saveSettings);
  elements.exportFormatRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.radio-card').forEach(card => {
        card.classList.toggle('active', card.querySelector('input').checked);
      });
      saveSettings();
    });
  });
  elements.resetSettings.addEventListener('click', resetSettings);

  // Stats tab
  elements.exportStats.addEventListener('click', exportStats);

  // Messages du background
  chrome.runtime.onMessage.addListener(handleMessage);
}

/**
 * Gère les messages du background script
 */
function handleMessage(message, sender, sendResponse) {
  switch (message.action) {
    case 'progressUpdate':
      handleProgressUpdate(message);
      break;

    case 'generateZip':
      generateZip(message.data);
      break;
  }
}

/**
 * Met à jour la progression du téléchargement
 */
function handleProgressUpdate(message) {
  const { type, data, message: msg } = message;

  switch (type) {
    case 'progress':
      elements.progressBar.style.width = `${data.percent}%`;
      elements.progressPercent.textContent = `${data.percent}%`;
      elements.filesDownloaded.textContent = data.downloaded;
      elements.totalSize.textContent = data.size;
      break;

    case 'log':
    case 'success':
    case 'error':
    case 'warning':
      addLogEntry(msg, type);
      break;

    case 'complete':
      state.isDownloading = false;
      addLogEntry(msg, 'success');
      showNotification('Téléchargement terminé!', 'success');
      setTimeout(() => {
        elements.progressSection.classList.add('hidden');
        resetDownloadUI();
      }, 2000);
      loadHistory();
      loadStats();
      break;

    case 'cancelled':
      state.isDownloading = false;
      elements.progressSection.classList.add('hidden');
      resetDownloadUI();
      break;
  }
}

/**
 * Ajoute une entrée dans le log
 */
function addLogEntry(message, type = 'log') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

  elements.progressLog.appendChild(entry);
  elements.progressLog.scrollTop = elements.progressLog.scrollHeight;

  // Limiter le nombre d'entrées
  while (elements.progressLog.children.length > 100) {
    elements.progressLog.removeChild(elements.progressLog.firstChild);
  }
}

/**
 * Récupère les informations de l'onglet actif
 */
async function getTabInfo() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getTabInfo' }, response => {
      resolve(response);
    });
  });
}

/**
 * Met à jour l'affichage de l'onglet actuel
 */
async function updateCurrentTab() {
  const info = await getTabInfo();
  if (info) {
    elements.currentUrl.textContent = info.url || 'N/A';
    elements.pageTitle.textContent = truncateText(info.title || 'Sans titre', 30);
    elements.urlInput.value = info.url || '';
  }
}

/**
 * Change d'onglet
 */
function switchTab(tabId) {
  state.currentTab = tabId;

  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });

  elements.tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });

  // Charger les données si nécessaire
  if (tabId === 'history') {
    loadHistory();
  } else if (tabId === 'stats') {
    loadStats();
  }
}

/**
 * Change le thème
 */
function toggleTheme() {
  const currentTheme = elements.app.dataset.theme;
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  elements.app.dataset.theme = newTheme;
  chrome.storage.local.set({ theme: newTheme });
}

/**
 * Met à jour un stepper
 */
function updateStepper(type, delta) {
  const min = type === 'depth' ? 0 : 1;
  const max = type === 'depth' ? 10 : 20;

  state[type] = Math.min(max, Math.max(min, state[type] + delta));

  if (type === 'depth') {
    elements.depthValue.textContent = state.depth;
  } else {
    elements.parallelValue.textContent = state.parallel;
  }
}

/**
 * Démarre le téléchargement
 */
async function startDownload() {
  const url = elements.urlInput.value.trim();

  if (!url) {
    showNotification('Veuillez entrer une URL', 'error');
    return;
  }

  if (!isValidUrl(url)) {
    showNotification('URL invalide', 'error');
    return;
  }

  // Collecter les types de ressources
  const resourceTypes = [];
  elements.resourceFilters.forEach(filter => {
    if (filter.checked) {
      resourceTypes.push(filter.value);
    }
  });

  // Configuration
  const config = {
    url,
    depth: state.depth,
    parallel: state.parallel,
    resourceTypes,
    ...state.settings
  };

  // Afficher la progression
  state.isDownloading = true;
  elements.progressSection.classList.remove('hidden');
  elements.progressLog.innerHTML = '<div class="log-entry">Initialisation...</div>';
  elements.progressBar.style.width = '0%';
  elements.progressPercent.textContent = '0%';
  elements.filesDownloaded.textContent = '0';
  elements.totalSize.textContent = '0 KB';

  // Démarrer le téléchargement
  chrome.runtime.sendMessage({
    action: 'startDownload',
    config
  }, response => {
    if (response.error) {
      showNotification(response.error, 'error');
      elements.progressSection.classList.add('hidden');
      state.isDownloading = false;
    }
  });
}

/**
 * Annule le téléchargement
 */
function cancelDownload() {
  chrome.runtime.sendMessage({ action: 'cancelDownload' });
}

/**
 * Génère le fichier ZIP
 */
async function generateZip(data) {
  const { filename, resources } = data;

  try {
    const zip = new JSZip();

    Object.entries(resources).forEach(([path, resource]) => {
      if (resource.type === 'text') {
        zip.file(path, resource.content);
      } else {
        // Convertir base64 en binaire
        const binary = atob(resource.content);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        zip.file(path, bytes);
      }
    });

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    // Télécharger
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

  } catch (error) {
    console.error('Erreur génération ZIP:', error);
    showNotification('Erreur lors de la génération du fichier', 'error');
  }
}

/**
 * Charge l'historique
 */
async function loadHistory() {
  chrome.runtime.sendMessage({ action: 'getHistory' }, history => {
    renderHistory(history || []);
  });
}

/**
 * Affiche l'historique
 */
function renderHistory(history) {
  if (history.length === 0) {
    elements.historyList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p>Aucun téléchargement</p>
      </div>
    `;
    return;
  }

  elements.historyList.innerHTML = history.map(item => `
    <div class="history-item" data-id="${item.id}">
      <div class="history-icon">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
          <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/>
          <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="currentColor" stroke-width="2"/>
        </svg>
      </div>
      <div class="history-info">
        <div class="history-url">${truncateText(item.url, 40)}</div>
        <div class="history-meta">
          <span>${formatDate(new Date(item.date))}</span>
          <span>${item.files} fichiers</span>
          <span>${formatSize(item.size)}</span>
        </div>
      </div>
      <div class="history-actions">
        <button class="history-redownload" title="Re-télécharger" onclick="redownload('${item.url}')">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M1 4v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="history-delete" title="Supprimer" onclick="deleteHistoryItem(${item.id})">
          <svg viewBox="0 0 24 24" fill="none">
            <polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Re-télécharge un site
 */
window.redownload = function(url) {
  elements.urlInput.value = url;
  switchTab('download');
};

/**
 * Supprime un élément de l'historique
 */
window.deleteHistoryItem = async function(id) {
  chrome.runtime.sendMessage({ action: 'getHistory' }, async history => {
    const filtered = history.filter(item => item.id !== id);
    chrome.storage.local.set({ history: filtered }, () => {
      loadHistory();
    });
  });
};

/**
 * Efface l'historique
 */
async function clearHistory() {
  if (confirm('Êtes-vous sûr de vouloir effacer tout l\'historique?')) {
    chrome.runtime.sendMessage({ action: 'clearHistory' }, () => {
      loadHistory();
      showNotification('Historique effacé', 'success');
    });
  }
}

/**
 * Charge les statistiques
 */
async function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, stats => {
    if (stats) {
      elements.totalDownloads.textContent = stats.totalDownloads || 0;
      elements.totalFiles.textContent = stats.totalFiles || 0;
      elements.totalSizeStats.textContent = formatSize(stats.totalSize || 0);

      const byType = stats.byType || { html: 0, css: 0, js: 0, images: 0, other: 0 };
      const maxCount = Math.max(...Object.values(byType), 1);

      elements.htmlCount.textContent = byType.html;
      elements.cssCount.textContent = byType.css;
      elements.jsCount.textContent = byType.js;
      elements.imagesCount.textContent = byType.images;
      elements.otherCount.textContent = byType.other;

      // Mettre à jour les barres
      document.querySelectorAll('.chart-bar').forEach(bar => {
        const type = bar.dataset.type;
        const count = byType[type] || 0;
        bar.style.width = `${(count / maxCount) * 100}%`;
      });
    }
  });
}

/**
 * Exporte les statistiques
 */
function exportStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, stats => {
    const data = JSON.stringify(stats, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `httracker_stats_${formatDateFile(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

/**
 * Charge les paramètres
 */
async function loadSettings() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, settings => {
      state.settings = settings || {};

      // Appliquer les paramètres à l'UI
      if (settings) {
        elements.respectRobots.checked = settings.respectRobots !== false;
        elements.requestDelay.value = settings.requestDelay || 100;
        elements.requestTimeout.value = settings.requestTimeout / 1000 || 30;
        elements.maxFileSize.value = settings.maxFileSize / (1024 * 1024) || 50;
        elements.includeCookies.checked = settings.includeCookies || false;
        elements.verboseLogs.checked = settings.verboseLogs || false;

        const format = settings.exportFormat || 'zip';
        elements.exportFormatRadios.forEach(radio => {
          radio.checked = radio.value === format;
          radio.closest('.radio-card').classList.toggle('active', radio.checked);
        });
      }

      // Charger le thème
      chrome.storage.local.get('theme', ({ theme }) => {
        elements.app.dataset.theme = theme || 'dark';
      });

      resolve();
    });
  });
}

/**
 * Sauvegarde les paramètres
 */
function saveSettings() {
  let exportFormat = 'zip';
  elements.exportFormatRadios.forEach(radio => {
    if (radio.checked) exportFormat = radio.value;
  });

  const settings = {
    respectRobots: elements.respectRobots.checked,
    requestDelay: parseInt(elements.requestDelay.value) || 100,
    requestTimeout: (parseInt(elements.requestTimeout.value) || 30) * 1000,
    maxFileSize: (parseInt(elements.maxFileSize.value) || 50) * 1024 * 1024,
    includeCookies: elements.includeCookies.checked,
    verboseLogs: elements.verboseLogs.checked,
    exportFormat
  };

  state.settings = settings;

  chrome.runtime.sendMessage({
    action: 'saveSettings',
    settings
  });
}

/**
 * Réinitialise les paramètres
 */
function resetSettings() {
  const defaults = {
    respectRobots: true,
    requestDelay: 100,
    requestTimeout: 30000,
    maxFileSize: 50 * 1024 * 1024,
    includeCookies: false,
    verboseLogs: false,
    exportFormat: 'zip'
  };

  chrome.runtime.sendMessage({
    action: 'saveSettings',
    settings: defaults
  }, () => {
    loadSettings();
    showNotification('Paramètres réinitialisés', 'success');
  });
}

/**
 * Réinitialise l'UI de téléchargement
 */
function resetDownloadUI() {
  elements.progressBar.style.width = '0%';
  elements.progressPercent.textContent = '0%';
  elements.filesDownloaded.textContent = '0';
  elements.totalSize.textContent = '0 KB';
}

/**
 * Affiche une notification
 */
function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
      ${type === 'success'
        ? '<path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" stroke-width="2"/><polyline points="22,4 12,14.01 9,11.01" stroke="currentColor" stroke-width="2"/>'
        : '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2"/>'}
    </svg>
    <span>${message}</span>
  `;

  // Créer le container si nécessaire
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// === Utilitaires ===

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDate(date) {
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateFile(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
