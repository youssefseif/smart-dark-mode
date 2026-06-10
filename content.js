(function () {
  if (window.__smartDarkMode) return;

  const MODES = {
    soft: {
      bg: '#1f1f1f',
      bgAlt: '#2a2a2a',
      bgSurface: '#242424',
      text: '#e0e0e6',
      textMuted: '#b0b0b8',
    },
    deep: {
      bg: '#121212',
      bgAlt: '#1c1c1c',
      bgSurface: '#181818',
      text: '#d1d1d6',
      textMuted: '#9a9a9f',
    },
    midnight: {
      bg: '#000000',
      bgAlt: '#0d0d0d',
      bgSurface: '#0a0a0a',
      text: '#ffffff',
      textMuted: '#ababab',
    },
  };

  const LIGHT_BG_THRESHOLD = 0.45;
  const LIGHT_TEXT_THRESHOLD = 0.55;
  const TRANSPARENT_THRESHOLD = 0.05;

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'CANVAS', 'SVG', 'IMG']);

  let currentMode = 'off';
  let observer = null;
  let styleEl = null;
  let earlyStyleEl = null;

  function parseRGBA(color) {
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null;
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return {
      r: parseInt(m[1]),
      g: parseInt(m[2]),
      b: parseInt(m[3]),
      a: m[4] !== undefined ? parseFloat(m[4]) : 1,
    };
  }

  function luminance(r, g, b) {
    const toLinear = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  function getEffectiveBgColor(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const bg = parseRGBA(style.backgroundColor);
      if (bg && bg.a > TRANSPARENT_THRESHOLD) return bg;
      node = node.parentElement;
    }
    const htmlStyle = window.getComputedStyle(document.documentElement);
    const htmlBg = parseRGBA(htmlStyle.backgroundColor);
    if (htmlBg && htmlBg.a > TRANSPARENT_THRESHOLD) return htmlBg;
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function isLightColor(rgba) {
    if (!rgba) return true;
    const lum = luminance(rgba.r, rgba.g, rgba.b);
    return lum > LIGHT_BG_THRESHOLD;
  }

  function isLightText(rgba) {
    if (!rgba) return false;
    const lum = luminance(rgba.r, rgba.g, rgba.b);
    return lum > LIGHT_TEXT_THRESHOLD;
  }

  function isTransparent(rgba) {
    return !rgba || rgba.a < TRANSPARENT_THRESHOLD;
  }

  function pickBgColor(mode, depth) {
    const palette = MODES[mode];
    if (depth === 0) return palette.bg;
    if (depth % 2 === 0) return palette.bgAlt;
    return palette.bgSurface;
  }

  function getElementDepth(el) {
    let depth = 0;
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const bg = parseRGBA(style.backgroundColor);
      if (bg && bg.a > TRANSPARENT_THRESHOLD) depth++;
      node = node.parentElement;
    }
    return depth;
  }

  function applyToElement(el, mode) {
    if (SKIP_TAGS.has(el.tagName)) return;

    const style = window.getComputedStyle(el);
    const bgRGBA = parseRGBA(style.backgroundColor);
    const ownBgIsTransparent = isTransparent(bgRGBA);
    const effectiveBg = ownBgIsTransparent ? getEffectiveBgColor(el) : bgRGBA;
    const bgIsLight = isLightColor(effectiveBg);

    // Replace light backgrounds
    if (!ownBgIsTransparent && bgIsLight) {
      const depth = getElementDepth(el);
      el.style.setProperty('background-color', pickBgColor(mode, depth), 'important');
      el.dataset.sdmBgFixed = '1';

      const borderColor = parseRGBA(style.borderColor);
      if (borderColor && isLightColor(borderColor) && borderColor.a > 0.1) {
        el.style.setProperty('border-color', 'rgba(255,255,255,0.08)', 'important');
        el.dataset.sdmBorderFixed = '1';
      }
    }

    // Fix text: force light color on any element whose text is not already light,
    // sitting on a dark background (original OR replaced by us)
    const textRGBA = parseRGBA(style.color);
    if (!isLightText(textRGBA)) {
      // After possible bg replacement, what color is the background?
      const resolvedBg = el.dataset.sdmBgFixed
        ? parseRGBA(el.style.getPropertyValue('background-color'))
        : effectiveBg;

      if (!isLightColor(resolvedBg)) {
        el.style.setProperty('color', MODES[mode].text, 'important');
        el.dataset.sdmTextFixed = '1';
      } else if (bgIsLight && !el.dataset.sdmTextFixed) {
        // bg was light and we replaced it with dark → text must follow
        el.style.setProperty('color', MODES[mode].text, 'important');
        el.dataset.sdmTextFixed = '1';
      }
    }
  }

  function removeFromElement(el) {
    if (el.dataset.sdmBgFixed) {
      el.style.removeProperty('background-color');
      delete el.dataset.sdmBgFixed;
    }
    if (el.dataset.sdmTextFixed) {
      el.style.removeProperty('color');
      delete el.dataset.sdmTextFixed;
    }
    if (el.dataset.sdmBorderFixed) {
      el.style.removeProperty('border-color');
      delete el.dataset.sdmBorderFixed;
    }
  }

  function injectBaseStyles(mode) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = '__smart-dark-mode-base';
      (document.head || document.documentElement).appendChild(styleEl);
    }
    if (mode === 'off') {
      styleEl.textContent = '';
      return;
    }
    const p = MODES[mode];
    styleEl.textContent = `
      ::-webkit-scrollbar { background: ${p.bg} !important; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15) !important; border-radius: 4px !important; }
      ::selection { background: rgba(255,255,255,0.2) !important; color: ${p.text} !important; }
      input, textarea, select { color-scheme: dark !important; }
    `;
  }

  function injectEarlyStyle(mode) {
    if (!earlyStyleEl) {
      earlyStyleEl = document.createElement('style');
      earlyStyleEl.id = '__smart-dark-mode-early';
      (document.head || document.documentElement).insertBefore(earlyStyleEl, (document.head || document.documentElement).firstChild);
    }
    if (mode === 'off') {
      earlyStyleEl.textContent = '';
      return;
    }
    const p = MODES[mode];
    earlyStyleEl.textContent = `
      html { background-color: ${p.bg} !important; }
      body { background-color: ${p.bg} !important; color: ${p.text} !important; }
    `;
  }

  function processAll(mode) {
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      applyToElement(el, mode);
    }
  }

  function removeAll() {
    const allElements = document.querySelectorAll('[data-sdm-bg-fixed], [data-sdm-text-fixed], [data-sdm-border-fixed]');
    for (const el of allElements) removeFromElement(el);
  }

  function startObserver(mode) {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (SKIP_TAGS.has(node.tagName)) continue;
            applyToElement(node, mode);
            const children = node.querySelectorAll('*');
            for (const child of children) {
              if (!SKIP_TAGS.has(child.tagName)) applyToElement(child, mode);
            }
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function applyMode(mode) {
    currentMode = mode;
    if (mode === 'off') {
      stopObserver();
      removeAll();
      injectBaseStyles('off');
      injectEarlyStyle('off');
    } else {
      injectEarlyStyle(mode);
      injectBaseStyles(mode);
      if (document.body) {
        processAll(mode);
      } else {
        document.addEventListener('DOMContentLoaded', () => processAll(mode), { once: true });
      }
      startObserver(mode);
    }
  }

  chrome.storage.sync.get(['darkMode'], ({ darkMode = 'off' }) => {
    if (darkMode !== 'off') {
      injectEarlyStyle(darkMode);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => applyMode(darkMode), { once: true });
    } else {
      applyMode(darkMode);
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SET_MODE') applyMode(msg.mode);
  });

  window.__smartDarkMode = {
    applyEarly(mode) {
      if (mode !== 'off') injectEarlyStyle(mode);
    },
  };
})();
