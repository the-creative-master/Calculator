/*!
 * Calculator UI, theme switching and the TubeVault easter egg.
 *
 * Secret: switch to light mode, type 2 5 and press +. TubeVault opens.
 */
(function () {
  'use strict';

  const { Calculator } = window.CalcEngine;
  const YT = window.TubeVaultYT;

  const $ = (selector) => document.querySelector(selector);
  const html = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const themeColorMeta = $('meta[name="theme-color"]');

  /** The number you type in light mode right before "+" to open TubeVault. */
  const SECRET_ENTRY = '25';
  const THEME_COLORS = { dark: '#0b0c0f', light: '#e9ecf1', vault: '#09090c' };

  // iOS Safari only applies :active styles when there's a touch listener.
  document.addEventListener('touchstart', () => {}, { passive: true });

  /* ====================================================================== *
   * Theme. Always starts in dark mode; light mode is only for this visit.
   * ====================================================================== */
  const calcScreen = $('#calc-screen');
  const themeToggle = $('#theme-toggle');

  const isLight = () => html.dataset.theme === 'light';

  function applyTheme(theme) {
    html.dataset.theme = theme;
    themeToggle.setAttribute('aria-checked', String(theme === 'light'));
    themeColorMeta.setAttribute('content', THEME_COLORS[theme]);
  }

  function toggleTheme() {
    const next = isLight() ? 'dark' : 'light';
    if (typeof document.startViewTransition !== 'function' || reducedMotion.matches) {
      applyTheme(next);
      return;
    }
    // A circle of the new theme grows out of the toggle.
    const rect = themeToggle.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    html.classList.add('is-theme-switching');
    const transition = document.startViewTransition(() => applyTheme(next));
    transition.ready
      .then(() => {
        html.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 560, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {});
    transition.finished.finally(() => html.classList.remove('is-theme-switching'));
  }

  themeToggle.addEventListener('click', (event) => {
    toggleTheme();
    if (event.detail > 0) themeToggle.blur(); // pointer click: keep Enter meaning "="
  });

  applyTheme('dark');

  /* ====================================================================== *
   * Calculator
   * ====================================================================== */
  const calc = new Calculator();
  const display = {
    history: $('#display-history'),
    main: $('#display-main'),
    preview: $('#display-preview'),
  };
  const keypad = $('#keypad');
  const vault = createVault();

  function render() {
    display.history.textContent = calc.history;
    display.main.textContent = calc.expression;
    display.main.classList.toggle('is-error', Boolean(calc.error));
    display.preview.textContent = calc.preview;
    fitDisplay();
  }

  /** Shrinks the main line so long numbers fit; past the minimum size, it scrolls to the end. */
  function fitDisplay() {
    const el = display.main;
    el.style.removeProperty('--fit');
    if (el.scrollWidth > el.clientWidth) {
      const fit = Math.max(0.42, (el.clientWidth / el.scrollWidth) * 0.98);
      el.style.setProperty('--fit', fit.toFixed(3));
    }
    el.scrollLeft = el.scrollWidth;
  }

  function keyButton(action, value) {
    const selector = value === undefined
      ? `[data-action="${action}"]`
      : `[data-action="${action}"][data-value="${value}"]`;
    return keypad.querySelector(selector);
  }

  function press(action, value, source) {
    switch (action) {
      case 'digit':
        calc.inputDigit(value);
        break;
      case 'decimal':
        calc.inputDecimal();
        break;
      case 'operator':
        if (value === '+' && isLight() && calc.entry === SECRET_ENTRY) {
          calc.clear();
          render();
          vault.open(source || keyButton('operator', '+'));
          return;
        }
        calc.inputOperator(value);
        break;
      case 'equals':
        calc.equals();
        break;
      case 'clear':
        calc.clear();
        break;
      case 'backspace':
        calc.backspace();
        break;
      case 'negate':
        calc.toggleSign();
        break;
      case 'percent':
        calc.percent();
        break;
      default:
        return;
    }
    render();
  }

  keypad.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    press(button.dataset.action, button.dataset.value, button);
    // After a mouse or touch press, drop focus so the Enter key still means "=".
    if (event.detail > 0) button.blur();
  });

  const KEYMAP = {
    '+': ['operator', '+'],
    '-': ['operator', '-'],
    '*': ['operator', '*'],
    x: ['operator', '*'],
    X: ['operator', '*'],
    '/': ['operator', '/'],
    '.': ['decimal'],
    ',': ['decimal'],
    Enter: ['equals'],
    '=': ['equals'],
    Backspace: ['backspace'],
    Escape: ['clear'],
    Delete: ['clear'],
    c: ['clear'],
    C: ['clear'],
    '%': ['percent'],
    F9: ['negate'],
  };

  function flash(button) {
    if (!button) return;
    button.classList.add('is-pressed');
    clearTimeout(button.flashTimer);
    button.flashTimer = setTimeout(() => button.classList.remove('is-pressed'), 120);
  }

  document.addEventListener('keydown', (event) => {
    if (vault.isOpen || event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const mapping = /^[0-9]$/.test(event.key) ? ['digit', event.key] : KEYMAP[event.key];
    if (!mapping) return;
    // When a key is focused with Tab, Enter should press that key.
    if (event.key === 'Enter' && document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    event.preventDefault();
    const [action, value] = mapping;
    const button = keyButton(action, value);
    flash(button);
    press(action, value, button);
  });

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(fitDisplay);
  });

  render();

  /* ====================================================================== *
   * TubeVault
   * ====================================================================== */
  function createVault() {
    const root = $('#vault');
    const bar = root.querySelector('.vault__bar');
    const form = $('#vault-form');
    const field = $('#vault-field');
    const input = $('#vault-input');
    const message = $('#vault-msg');
    const pasteButton = $('#vault-paste');
    const stage = $('#vault-stage');
    const empty = $('#vault-empty');
    const nowBar = $('#vault-now');
    const nowTitle = $('#vault-now-title');
    const nowTags = $('#vault-now-tags');
    const copyButton = $('#vault-copy');
    const openLink = $('#vault-open');
    const stopButton = $('#vault-stop');
    const lockButton = $('#vault-lock');
    const privateToggle = $('#vault-private');
    const recentSection = $('#vault-recent');
    const recentGrid = $('#vault-recent-grid');
    const clearButton = $('#vault-clear');
    const toast = $('#vault-toast');

    const RECENT_KEY = 'tubevault:recent';
    const SETTINGS_KEY = 'tubevault:settings';
    const MAX_RECENT = 12;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const ERRORS = {
      empty: 'Paste a YouTube link first.',
      invalid: "That doesn't look like a YouTube link.",
      'not-youtube': "That doesn't look like a YouTube link.",
      channel: "That's a channel link. Open a video and copy its link instead.",
      'no-video': "Couldn't find a video in that link.",
    };
    const PASTE_SHORTCUT = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? '⌘V' : 'Ctrl+V';

    let isOpen = false;
    let current = null;
    let closeTimer = 0;
    let toastTimer = 0;
    let skipNextPop = false;

    const savedSettings = readJSON(SETTINGS_KEY, null);
    const settings = { privacy: !(savedSettings && savedSettings.privacy === false) };
    let recent = sanitizeRecent(readJSON(RECENT_KEY, []));

    privateToggle.checked = settings.privacy;
    if (!(navigator.clipboard && typeof navigator.clipboard.readText === 'function')) pasteButton.hidden = true;

    /* ---------------------------- open / close ---------------------------- */

    function open(originEl) {
      if (isOpen) return;
      isOpen = true;
      clearTimeout(closeTimer);

      const rect = originEl ? originEl.getBoundingClientRect() : null;
      const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
      root.style.setProperty('--origin-x', `${Math.round(x)}px`);
      root.style.setProperty('--origin-y', `${Math.round(y)}px`);

      root.classList.remove('is-closing');
      root.hidden = false;
      root.inert = false;
      calcScreen.inert = true;
      document.body.classList.add('is-vault-open');
      themeColorMeta.setAttribute('content', THEME_COLORS.vault);
      void root.offsetWidth; // commit the starting circle so the reveal animates
      root.classList.add('is-open');
      root.scrollTop = 0;

      showMessage('');
      renderRecent();
      if (current) mount(current, false);
      else showEmptyState();

      // The browser/phone Back button closes TubeVault instead of leaving the page.
      try {
        history.pushState({ tubevault: true }, '');
      } catch (error) {
        /* history not available */
      }

      if (finePointer.matches) {
        setTimeout(() => {
          if (isOpen) input.focus({ preventScroll: true });
        }, reducedMotion.matches ? 0 : 450);
      }
    }

    function close(options = {}) {
      if (!isOpen) return;
      isOpen = false;
      unmount(); // stop playback right away

      root.classList.remove('is-open');
      root.classList.add('is-closing');
      root.inert = true;
      calcScreen.inert = false;
      document.body.classList.remove('is-vault-open');
      themeColorMeta.setAttribute('content', THEME_COLORS[isLight() ? 'light' : 'dark']);
      if (root.contains(document.activeElement)) document.activeElement.blur();
      hideToast();

      closeTimer = setTimeout(() => {
        root.hidden = true;
        root.classList.remove('is-closing');
      }, reducedMotion.matches ? 0 : 220);

      if (!options.fromHistory && history.state && history.state.tubevault) {
        skipNextPop = true;
        history.back();
      }
    }

    window.addEventListener('popstate', () => {
      if (skipNextPop) {
        skipNextPop = false;
        return;
      }
      if (isOpen) close({ fromHistory: true });
    });

    // A reload while TubeVault was open leaves its history entry behind; tidy it up.
    if (history.state && history.state.tubevault) {
      try {
        history.replaceState(null, '');
      } catch (error) {
        /* ignore */
      }
    }

    /* ------------------------------ playback ------------------------------ */

    function submit() {
      const result = YT.parse(input.value);
      if (!result.ok) {
        showMessage(ERRORS[result.error] || ERRORS.invalid, true);
        field.classList.remove('is-shaking');
        void field.offsetWidth;
        field.classList.add('is-shaking');
        return;
      }
      play(result.video);
    }

    function play(video) {
      showMessage('');
      input.value = '';
      mount(video, true);
      addRecent(video);
      if (!finePointer.matches) input.blur(); // put the on-screen keyboard away
      revealPlayer();
    }

    /** Puts a fresh YouTube <iframe> on the stage. (A new iframe each time keeps the Back button clean.) */
    function mount(video, autoplay) {
      current = video;
      const frame = document.createElement('iframe');
      frame.className = 'vault-player__frame';
      frame.title = video.id ? 'YouTube video player' : 'YouTube playlist player';
      frame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen');
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      frame.setAttribute('frameborder', '0');
      frame.src = YT.embedUrl(video, { autoplay, privacy: settings.privacy });

      unmount();
      stage.appendChild(frame);
      stage.classList.toggle('is-short', Boolean(video.short));
      empty.hidden = true;
      renderNowPlaying();
    }

    function unmount() {
      const frame = stage.querySelector('iframe');
      if (frame) frame.remove();
    }

    function stopVideo() {
      unmount();
      current = null;
      showEmptyState();
    }

    function showEmptyState() {
      unmount();
      stage.classList.remove('is-short');
      empty.hidden = false;
      nowBar.hidden = true;
    }

    function revealPlayer() {
      requestAnimationFrame(() => {
        const rect = stage.getBoundingClientRect();
        const top = bar.getBoundingClientRect().bottom;
        if (rect.top >= top && rect.bottom <= window.innerHeight) return;
        stage.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      });
    }

    function renderNowPlaying() {
      if (!current) {
        nowBar.hidden = true;
        return;
      }
      nowBar.hidden = false;
      nowTitle.textContent = describe(current);
      nowTags.replaceChildren(...tagsFor(current).map((text) => el('span', 'vault-tag', text)));
      openLink.href = YT.watchUrl(current);
    }

    /* --------------------------- recently played -------------------------- */

    function addRecent(video) {
      const key = recentKey(video);
      recent = [
        { id: video.id, list: video.list, start: video.start, short: video.short, at: Date.now() },
        ...recent.filter((item) => recentKey(item) !== key),
      ].slice(0, MAX_RECENT);
      writeJSON(RECENT_KEY, recent);
      renderRecent();
    }

    function removeRecent(index) {
      recent.splice(index, 1);
      writeJSON(RECENT_KEY, recent);
      renderRecent();
    }

    function renderRecent() {
      recentSection.hidden = recent.length === 0;
      recentGrid.replaceChildren(...recent.map(recentCard));
    }

    function recentCard(item, index) {
      const card = el('li', 'vault-card');

      const playButton = el('button', 'vault-card__play');
      playButton.type = 'button';
      playButton.setAttribute('aria-label', `Play ${describe(item)}`);
      playButton.addEventListener('click', () => {
        play({ id: item.id, list: item.list, start: item.start, short: item.short });
      });

      const thumb = el('span', 'vault-card__thumb');
      if (item.id) {
        const img = el('img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('error', () => img.replaceWith(placeholder('play')), { once: true });
        img.src = YT.thumbnailUrl(item.id);
        thumb.append(img);
      } else {
        thumb.append(placeholder('playlist'));
      }
      const tags = tagsFor(item);
      if (tags.length) {
        const badges = el('span', 'vault-card__badges');
        badges.append(...tags.map((text) => el('span', 'vault-card__badge', text)));
        thumb.append(badges);
      }
      const overlay = el('span', 'vault-card__overlay');
      const overlayIcon = el('span');
      overlayIcon.append(icon('play'));
      overlay.append(overlayIcon);
      thumb.append(overlay);

      const meta = el('span', 'vault-card__meta');
      meta.append(el('span', 'vault-card__id', item.id || describe(item)), el('span', 'vault-card__time', timeAgo(item.at)));
      playButton.append(thumb, meta);

      const removeButton = el('button', 'vault-card__remove');
      removeButton.type = 'button';
      removeButton.title = 'Remove';
      removeButton.setAttribute('aria-label', `Remove ${describe(item)} from recently played`);
      removeButton.append(icon('x'));
      removeButton.addEventListener('click', () => removeRecent(index));

      card.append(playButton, removeButton);
      return card;
    }

    /* ------------------------------- events ------------------------------- */

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });

    input.addEventListener('input', () => {
      if (message.classList.contains('is-error')) showMessage('');
    });

    // Paste a link into the box and it starts playing straight away.
    input.addEventListener('paste', (event) => {
      const text = event.clipboardData ? event.clipboardData.getData('text') : '';
      const result = YT.parse(text);
      if (!result.ok) return; // not a link: let the browser paste it normally
      event.preventDefault();
      play(result.video);
    });

    // You can also paste anywhere in TubeVault.
    document.addEventListener('paste', (event) => {
      if (!isOpen || event.target === input) return;
      const text = event.clipboardData ? event.clipboardData.getData('text') : '';
      if (!text.trim()) return;
      event.preventDefault();
      input.value = text.trim();
      submit();
    });

    pasteButton.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text.trim()) {
          showMessage('Your clipboard is empty.', true);
          return;
        }
        input.value = text.trim();
        submit();
      } catch (error) {
        showMessage(`Your browser blocked clipboard access. Paste with ${PASTE_SHORTCUT} instead.`, true);
        input.focus();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      const typing = event.target === input;
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        input.focus();
      }
    });

    lockButton.addEventListener('click', () => close());
    stopButton.addEventListener('click', stopVideo);

    copyButton.addEventListener('click', async () => {
      if (!current) return;
      showToast((await copyText(YT.watchUrl(current))) ? 'Link copied' : "Couldn't copy the link");
    });

    clearButton.addEventListener('click', () => {
      recent = [];
      writeJSON(RECENT_KEY, recent);
      renderRecent();
      showToast('Recently played cleared');
    });

    privateToggle.addEventListener('change', () => {
      settings.privacy = privateToggle.checked;
      writeJSON(SETTINGS_KEY, settings);
      if (current) mount(current, true);
      showToast(settings.privacy ? 'Private mode on' : 'Private mode off');
    });

    /* ------------------------------- helpers ------------------------------ */

    function showMessage(text, isError = false) {
      message.textContent = text;
      message.classList.toggle('is-error', Boolean(text) && isError);
    }

    function showToast(text) {
      toast.textContent = text;
      toast.classList.add('is-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(hideToast, 1800);
    }

    function hideToast() {
      clearTimeout(toastTimer);
      toast.classList.remove('is-visible');
    }

    function describe(video) {
      if (video.id) return `youtu.be/${video.id}`;
      return `Playlist · ${video.list.slice(0, 8)}`;
    }

    function tagsFor(video) {
      const tags = [];
      if (video.short) tags.push('Short');
      if (video.list && video.id) tags.push('Playlist');
      if (video.start) tags.push(`from ${YT.formatTime(video.start)}`);
      return tags;
    }

    function recentKey(video) {
      return video.id ? `v:${video.id}` : `l:${video.list}`;
    }

    function sanitizeRecent(list) {
      if (!Array.isArray(list)) return [];
      return list
        .filter((item) => item && (YT.isVideoId(item.id) || YT.isListId(item.list)))
        .map((item) => ({
          id: YT.isVideoId(item.id) ? item.id : null,
          list: YT.isListId(item.list) ? item.list : null,
          start: Number(item.start) > 0 ? Math.floor(Number(item.start)) : 0,
          short: Boolean(item.short),
          at: Number(item.at) || Date.now(),
        }))
        .slice(0, MAX_RECENT);
    }

    function timeAgo(timestamp) {
      const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
      if (seconds < 45) return 'just now';
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.round(hours / 24);
      if (days < 7) return `${days}d ago`;
      return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // Older or non-secure contexts: fall back to a hidden textarea.
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        root.append(area);
        area.select();
        let copied = false;
        try {
          copied = document.execCommand('copy');
        } catch (fallbackError) {
          copied = false;
        }
        area.remove();
        return copied;
      }
    }

    function readJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (error) {
        return fallback;
      }
    }

    function writeJSON(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        /* storage full or disabled; recently played just won't persist */
      }
    }

    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function icon(name) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'icon');
      svg.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', `#i-${name}`);
      svg.append(use);
      return svg;
    }

    function placeholder(name) {
      const box = el('span', 'vault-card__placeholder');
      box.append(icon(name));
      return box;
    }

    return {
      open,
      close,
      get isOpen() {
        return isOpen;
      },
    };
  }
})();
