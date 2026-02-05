/**
 * HTTracker Premium - Content Script
 * Injecté dans les pages web pour l'extraction avancée des ressources
 */

// Écouter les messages du background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'extractPageData':
      const data = extractPageData();
      sendResponse(data);
      break;

    case 'extractDynamicResources':
      const resources = extractDynamicResources();
      sendResponse(resources);
      break;

    case 'getPageHTML':
      sendResponse({ html: document.documentElement.outerHTML });
      break;

    case 'getComputedStyles':
      const styles = getComputedStylesheets();
      sendResponse(styles);
      break;
  }
  return true;
});

/**
 * Extrait toutes les données de la page
 */
function extractPageData() {
  return {
    url: window.location.href,
    title: document.title,
    html: document.documentElement.outerHTML,
    baseUrl: document.baseURI,
    resources: extractAllResources(),
    meta: extractMetaData()
  };
}

/**
 * Extrait les métadonnées de la page
 */
function extractMetaData() {
  const meta = {};

  // Meta tags
  document.querySelectorAll('meta').forEach(tag => {
    const name = tag.getAttribute('name') || tag.getAttribute('property');
    const content = tag.getAttribute('content');
    if (name && content) {
      meta[name] = content;
    }
  });

  // Charset
  const charset = document.characterSet;
  if (charset) {
    meta.charset = charset;
  }

  return meta;
}

/**
 * Extrait toutes les ressources de la page
 */
function extractAllResources() {
  const resources = {
    stylesheets: [],
    scripts: [],
    images: [],
    fonts: [],
    videos: [],
    audios: [],
    links: [],
    iframes: []
  };

  // Stylesheets
  document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    const href = link.href;
    if (href && !href.startsWith('data:')) {
      resources.stylesheets.push({
        url: href,
        media: link.media || 'all'
      });
    }
  });

  // Style tags avec @import
  document.querySelectorAll('style').forEach(style => {
    const imports = extractCSSImports(style.textContent);
    imports.forEach(url => {
      resources.stylesheets.push({ url, media: 'all' });
    });
  });

  // Scripts
  document.querySelectorAll('script[src]').forEach(script => {
    const src = script.src;
    if (src && !src.startsWith('data:')) {
      resources.scripts.push({
        url: src,
        async: script.async,
        defer: script.defer,
        type: script.type || 'text/javascript'
      });
    }
  });

  // Images
  document.querySelectorAll('img').forEach(img => {
    const src = img.currentSrc || img.src;
    if (src && !src.startsWith('data:')) {
      resources.images.push({
        url: src,
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    }

    // srcset
    if (img.srcset) {
      const srcsetUrls = parseSrcset(img.srcset);
      srcsetUrls.forEach(url => {
        if (!url.startsWith('data:')) {
          resources.images.push({ url, fromSrcset: true });
        }
      });
    }
  });

  // Picture sources
  document.querySelectorAll('picture source').forEach(source => {
    if (source.srcset) {
      const srcsetUrls = parseSrcset(source.srcset);
      srcsetUrls.forEach(url => {
        if (!url.startsWith('data:')) {
          resources.images.push({ url, fromPicture: true });
        }
      });
    }
  });

  // Background images via computed styles
  document.querySelectorAll('*').forEach(el => {
    const bgImage = getComputedStyle(el).backgroundImage;
    if (bgImage && bgImage !== 'none') {
      const urls = extractUrlsFromCSSValue(bgImage);
      urls.forEach(url => {
        if (!url.startsWith('data:')) {
          resources.images.push({ url, fromCSS: true });
        }
      });
    }
  });

  // Videos
  document.querySelectorAll('video').forEach(video => {
    if (video.src && !video.src.startsWith('data:')) {
      resources.videos.push({ url: video.src });
    }
    video.querySelectorAll('source').forEach(source => {
      if (source.src && !source.src.startsWith('data:')) {
        resources.videos.push({ url: source.src, type: source.type });
      }
    });
  });

  // Audios
  document.querySelectorAll('audio').forEach(audio => {
    if (audio.src && !audio.src.startsWith('data:')) {
      resources.audios.push({ url: audio.src });
    }
    audio.querySelectorAll('source').forEach(source => {
      if (source.src && !source.src.startsWith('data:')) {
        resources.audios.push({ url: source.src, type: source.type });
      }
    });
  });

  // Links
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.href;
    if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('#')) {
      resources.links.push({
        url: href,
        text: link.textContent.trim().substring(0, 100),
        rel: link.rel
      });
    }
  });

  // Iframes
  document.querySelectorAll('iframe[src]').forEach(iframe => {
    if (iframe.src && !iframe.src.startsWith('data:')) {
      resources.iframes.push({ url: iframe.src });
    }
  });

  // Fonts depuis les styles
  resources.fonts = extractFontsFromStyles();

  return resources;
}

/**
 * Extrait les ressources chargées dynamiquement
 */
function extractDynamicResources() {
  const resources = [];

  // Observer les ressources du Performance API
  if (window.performance && performance.getEntriesByType) {
    const entries = performance.getEntriesByType('resource');
    entries.forEach(entry => {
      resources.push({
        url: entry.name,
        type: entry.initiatorType,
        size: entry.transferSize,
        duration: entry.duration
      });
    });
  }

  return resources;
}

/**
 * Extrait les @import des CSS
 */
function extractCSSImports(cssText) {
  const imports = [];
  const regex = /@import\s+(?:url\()?["']?([^"'\)]+)["']?\)?/gi;
  let match;

  while ((match = regex.exec(cssText)) !== null) {
    try {
      const url = new URL(match[1], window.location.href).href;
      imports.push(url);
    } catch {}
  }

  return imports;
}

/**
 * Parse un attribut srcset
 */
function parseSrcset(srcset) {
  return srcset.split(',').map(src => {
    const parts = src.trim().split(/\s+/);
    return parts[0];
  }).filter(url => url);
}

/**
 * Extrait les URLs d'une valeur CSS
 */
function extractUrlsFromCSSValue(value) {
  const urls = [];
  const regex = /url\(["']?([^"'\)]+)["']?\)/gi;
  let match;

  while ((match = regex.exec(value)) !== null) {
    try {
      const url = new URL(match[1], window.location.href).href;
      urls.push(url);
    } catch {}
  }

  return urls;
}

/**
 * Extrait les fonts depuis les stylesheets
 */
function extractFontsFromStyles() {
  const fonts = [];
  const fontUrlRegex = /url\(["']?([^"'\)]+\.(?:woff2?|ttf|otf|eot)[^"'\)]*)["']?\)/gi;

  // Parcourir les stylesheets
  try {
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (rules) {
          Array.from(rules).forEach(rule => {
            if (rule.cssText) {
              let match;
              while ((match = fontUrlRegex.exec(rule.cssText)) !== null) {
                try {
                  const url = new URL(match[1], sheet.href || window.location.href).href;
                  if (!fonts.some(f => f.url === url)) {
                    fonts.push({ url });
                  }
                } catch {}
              }
            }
          });
        }
      } catch (e) {
        // CORS peut bloquer l'accès aux règles
      }
    });
  } catch (e) {}

  return fonts;
}

/**
 * Récupère les styles calculés importants
 */
function getComputedStylesheets() {
  const styles = [];

  try {
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (rules) {
          let cssText = '';
          Array.from(rules).forEach(rule => {
            cssText += rule.cssText + '\n';
          });
          styles.push({
            href: sheet.href,
            cssText
          });
        }
      } catch (e) {
        // CORS
        if (sheet.href) {
          styles.push({ href: sheet.href, external: true });
        }
      }
    });
  } catch (e) {}

  return styles;
}

// Signaler que le content script est prêt
chrome.runtime.sendMessage({ action: 'contentScriptReady', url: window.location.href }).catch(() => {});
