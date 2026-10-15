/*!
 * Calculator UI, theme switching and the FreeTube easter egg.
 *
 * Secret: switch to light mode, type 2 5 and press +. FreeTube opens.
 */
(function () {
  'use strict';

  const { Calculator } = window.CalcEngine;
  const YT = window.FreeTubeYT;
  const Library = window.FreeTubeLibrary;

  const $ = (selector) => document.querySelector(selector);
  const html = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const themeColorMeta = $('meta[name="theme-color"]');

  /** The number you type in light mode right before "+" to open FreeTube. */
  const SECRET_ENTRY = '25';
  const THEME_COLORS = { dark: '#0b0c0f', light: '#e9ecf1', vault: '#0f0f0f', vaultLight: '#ffffff' };

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

  // While the reveal plays, the browser sends every tap to <html> (the transition sits on top
  // of the page), so quick taps on the keys would be lost. Hand them to the button underneath.
  document.addEventListener('click', (event) => {
    if (event.target !== html || !html.classList.contains('is-theme-switching')) return;
    const button = Array.from(calcScreen.querySelectorAll('button')).find((node) => {
      const rect = node.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    if (!button) return;
    if (button.classList.contains('key')) flash(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: event.detail || 1, clientX: event.clientX, clientY: event.clientY }));
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
  const vault = startVault();

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
        if (value === '+' && vault.available && isLight() && calc.entry === SECRET_ENTRY) {
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
   * FreeTube: a private player that looks like YouTube and plays YouTube's
   * own embedded player.
   * ====================================================================== */
  /**
   * FreeTube must never take the calculator down with it. If it can't start (say the browser
   * cached an old copy of one file but not the others), the calculator works without the secret.
   */
  function startVault() {
    try {
      return createVault();
    } catch (error) {
      console.error('FreeTube could not start, so the calculator is running without it:', error);
      return { available: false, isOpen: false, open() {}, close() {} };
    }
  }

  function createVault() {
    // Check everything FreeTube needs before touching the page, so a mismatch fails cleanly here.
    const YT_NEEDS = ['parse', 'embedOrigin', 'embedUrl', 'watchUrl', 'thumbnailUrl', 'formatTime', 'timeAgo', 'readPlayerMessage', 'historyKey', 'sanitizeHistory'];
    const LIBRARY_NEEDS = [
      'sanitizeLibrary', 'getPlaylist', 'customPlaylists', 'isBuiltIn', 'has', 'addItem', 'removeItem', 'restoreItem', 'moveItem',
      'createPlaylist', 'renamePlaylist', 'deletePlaylist', 'restorePlaylist', 'applyDetails', 'updateDetails', 'findDetails',
      'sanitizeProgress', 'progressFor', 'recordProgress', 'resumeTime', 'watchedFraction', 'makeBackup', 'readBackup', 'mergeBackup',
    ];
    const missingHelpers = YT_NEEDS.filter((name) => !YT || typeof YT[name] !== 'function');
    if (missingHelpers.length) throw new Error(`js/youtube.js is missing or out of date (no ${missingHelpers.join(', ')})`);
    const missingLibrary = LIBRARY_NEEDS.filter((name) => !Library || typeof Library[name] !== 'function');
    if (missingLibrary.length) throw new Error(`js/library.js is missing or out of date (no ${missingLibrary.join(', ')})`);
    const root = $('#vault');
    if (!root) throw new Error('index.html has no #vault section');
    const find = (selector) => {
      const node = root.querySelector(selector);
      if (!node) throw new Error(`index.html is missing ${selector}, so it doesn't match js/app.js`);
      return node;
    };
    const findAll = (selector) => Array.from(root.querySelectorAll(selector));

    const masthead = find('#vault-masthead');
    const page = find('#vault-page');
    const rail = find('.yt-rail');
    const form = find('#vault-form');
    const input = find('#vault-input');
    const inputClear = find('#vault-input-clear');
    const message = find('#vault-msg');
    const settingsButton = find('#vault-settings-btn');
    const settingsMenu = find('#vault-settings');
    const settingsBackdrop = find('#vault-settings-backdrop');
    const menuMain = find('#vault-menu-main');
    const menuAppearance = find('#vault-menu-appearance');
    const guide = find('#vault-guide');
    const guideButton = find('#vault-guide-btn');
    const guidePlaylists = find('#vault-guide-playlists');
    const homeView = find('#vault-home');
    const chipBar = find('#vault-chips');
    const feed = find('#vault-feed');
    const feedNote = find('#vault-feed-note');
    const emptyState = find('#vault-empty');
    const libraryView = find('#vault-library');
    const libHistory = find('#vault-lib-history');
    const libHistoryEmpty = find('#vault-lib-history-empty');
    const libPlaylists = find('#vault-lib-playlists');
    const importFile = find('#vault-import-file');
    const playlistView = find('#vault-playlist');
    const plBg = find('#vault-pl-bg');
    const plThumb = find('#vault-pl-thumb');
    const plTitle = find('#vault-pl-title');
    const plMeta = find('#vault-pl-meta');
    const plTools = find('#vault-pl-tools');
    const plPlay = find('.yt-plhero__play');
    const plItems = find('#vault-pl-items');
    const plEmpty = find('#vault-pl-empty');
    const plEmptyText = find('#vault-pl-empty-text');
    const watchView = find('#vault-watch');
    const stage = find('#vault-stage');
    const titleEl = find('#vault-title');
    const owner = find('.yt-owner');
    const avatarEl = find('#vault-avatar');
    const channelEl = find('#vault-channel');
    const channelSubEl = find('#vault-channel-sub');
    const openLink = find('#vault-open');
    const likeButton = find('#vault-like');
    const saveButton = find('#vault-save-btn');
    const fullscreenButton = find('#vault-fs-btn');
    const desc = find('.yt-desc');
    const descMeta = find('#vault-desc-meta');
    const descLink = find('#vault-desc-link');
    const descNote = find('#vault-desc-note');
    const secondary = find('.yt-watch__secondary');
    const queuePanel = find('#vault-queue');
    const queueTitle = find('#vault-queue-title');
    const queueSub = find('#vault-queue-sub');
    const queueNext = find('#vault-queue-next');
    const queueList = find('#vault-queue-items');
    const upNext = find('#vault-upnext');
    const upNextNote = find('#vault-upnext-note');
    const fullWindowBar = find('#vault-fwbar');
    const fullWindowTitle = find('#vault-fwbar-title');
    const popup = find('#vault-popup');
    const popupBackdrop = find('#vault-popup-backdrop');
    const dialogScrim = find('#vault-dialog-scrim');
    const saveDialog = find('#vault-save');
    const saveTitle = find('#vault-save-title');
    const saveList = find('#vault-save-list');
    const saveNew = find('#vault-save-new');
    const saveForm = find('#vault-save-form');
    const saveName = find('#vault-save-name');
    const saveCount = find('#vault-save-count');
    const saveCreate = find('#vault-save-create');
    const nameDialog = find('#vault-name');
    const nameForm = find('#vault-name-form');
    const nameTitle = find('#vault-name-title');
    const nameInput = find('#vault-name-input');
    const nameCount = find('#vault-name-count');
    const nameOk = find('#vault-name-ok');
    const toast = find('#vault-toast');
    const toastText = find('#vault-toast-text');
    const toastAction = find('#vault-toast-action');

    const RECENT_KEY = 'freetube:recent';
    const SETTINGS_KEY = 'freetube:settings';
    const LIBRARY_KEY = 'freetube:library';
    const PROGRESS_KEY = 'freetube:progress';
    const MAX_RECENT = 24;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const ERRORS = {
      empty: 'Paste a YouTube link first',
      invalid: "That doesn't look like a YouTube link",
      'not-youtube': "That doesn't look like a YouTube link",
      channel: "That's a channel link. Open a video and copy its link instead",
      'no-video': "Couldn't find a video in that link",
    };
    const PLAYER_ERRORS = {
      2: "Something's wrong with this link, so the video can't play",
      5: "This video can't play in your browser",
      100: 'This video is unavailable. It may be private or removed',
      101: "The owner doesn't allow this video to play outside YouTube",
      150: "The owner doesn't allow this video to play outside YouTube",
      153: 'YouTube blocked the player. Open FreeTube from a web address, not a file',
    };
    const IMPORT_ERRORS = {
      'not-json': "That file isn't a FreeTube backup",
      'not-backup': "That file isn't a FreeTube backup",
      'too-big': 'That file is too big to be a FreeTube backup',
      newer: 'That backup is from a newer FreeTube. Reload the page and try again',
    };
    const APPEARANCE_LABELS = { device: 'Device theme', dark: 'Dark', light: 'Light' };
    const FILTER_EMPTY = {
      videos: 'Videos you watch will show up here.',
      shorts: 'Shorts you watch will show up here.',
      playlists: 'Playlists you watch will show up here.',
    };
    const PLAYLIST_EMPTY = {
      WL: 'Save videos for later with the Save button under a video, or from the ⋮ menu on any video.',
      LL: 'Videos you like will show up here. Use the Like button under a video.',
      custom: 'Add videos with the Save button under a video, or from the ⋮ menu on any video.',
    };
    const PLAYLIST_ICONS = { WL: 'clock', LL: 'like' };
    const AVATAR_COLORS = ['#ef6c00', '#c2185b', '#7b1fa2', '#512da8', '#1976d2', '#0097a7', '#00796b', '#388e3c', '#5d4037', '#455a64', '#d84315', '#303f9f'];
    const PASTE_HINT = finePointer.matches
      ? `paste with ${/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? '⌘V' : 'Ctrl+V'}`
      : 'long-press the box to paste';
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)');
    const compact = window.matchMedia('(max-width: 656px)');

    migrateStorage();
    const saved = readJSON(SETTINGS_KEY, null) || {};
    const settings = {
      privacy: saved.privacy !== false,
      appearance: Object.prototype.hasOwnProperty.call(APPEARANCE_LABELS, saved.appearance) ? saved.appearance : 'device',
    };
    let recent = YT.sanitizeHistory(readJSON(RECENT_KEY, []), MAX_RECENT);
    let library = Library.sanitizeLibrary(readJSON(LIBRARY_KEY, null));
    let progress = Library.sanitizeProgress(readJSON(PROGRESS_KEY, null));

    let isOpen = false;
    let view = 'home'; // the page under the player: 'home', 'library' or 'playlist'
    let shownPlaylist = null; // which playlist the playlist page shows
    let current = null; // what's on the watch page: { id, list, start, short }
    let live = {}; // what the player has told us about it: { videoId, title, author, duration, live, currentTime, state, playlistCount, playlistIndex }
    let player = null; // { frame, origin, widgetId, connected, timer, tries }
    let queue = null; // playing one of your playlists: { playlistId, name, items, index, shuffled }
    let widgetCount = 0;
    let filter = 'all';
    let closeTimer = 0;
    let toastTimer = 0;
    let messageTimer = 0;
    let toastHandler = null;
    let skipNextPop = false;
    let saveTarget = null; // the video the Save dialog is for
    let nameHandler = null; // what the name dialog does with the name you type
    let dialogReturn = null; // where focus goes back to when a dialog closes
    let popupAnchor = null; // the ⋮ button the open menu belongs to
    let progressTimer = 0;
    let progressDirty = false;
    let advanceTimer = 0;
    let fullWindow = false;
    let fullWindowExplained = false;
    let lastFullscreenExit = 0;

    applyAppearance();
    applyPrivacy();

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
      applyAppearance();
      void root.offsetWidth; // commit the starting circle so the reveal animates
      root.classList.add('is-open');
      root.scrollTop = 0;

      render();
      if (current) mount(current, false, resumePoint(current)); // back where you were, paused

      // The browser/phone Back button closes FreeTube instead of leaving the page.
      try {
        history.pushState({ freetube: true }, '');
      } catch (error) {
        /* history not available */
      }

      if (finePointer.matches) {
        setTimeout(() => {
          if (isOpen && !isDialogOpen()) input.focus({ preventScroll: true });
        }, reducedMotion.matches ? 0 : 450);
      }
    }

    function close(options = {}) {
      if (!isOpen) return;
      isOpen = false;
      exitFullscreen();
      unmount(); // stop playback right away (and save how far you got)
      closeOverlays();
      closeSearch();
      clearSearchError();

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

      if (!options.fromHistory && history.state && history.state.freetube) {
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

    // A reload while FreeTube was open leaves its history entry behind; tidy it up.
    if (history.state && history.state.freetube) {
      try {
        history.replaceState(null, '');
      } catch (error) {
        /* ignore */
      }
    }

    /* ------------------------------ navigation ---------------------------- */

    /** Goes to Home, You or a playlist page (stopping any video). */
    function showView(next, playlistId) {
      closeOverlays();
      leaveWatchPage();
      view = next;
      shownPlaylist = next === 'playlist' ? playlistId : null;
      if (next === 'playlist' && !Library.getPlaylist(library, playlistId)) {
        view = 'library';
        shownPlaylist = null;
      }
      render();
      root.scrollTo({ top: 0 });
    }

    /** The ✕ under the player: back to whichever page you were on. */
    function closeVideo() {
      closeOverlays();
      leaveWatchPage();
      render();
      root.scrollTo({ top: 0 });
    }

    function leaveWatchPage() {
      if (!current) return;
      exitFullscreen();
      unmount();
      current = null;
      live = {};
      queue = null;
    }

    /* ------------------------------ rendering ----------------------------- */

    function render() {
      const watching = Boolean(current);
      root.classList.toggle('is-watching', watching);
      homeView.hidden = watching || view !== 'home';
      libraryView.hidden = watching || view !== 'library';
      playlistView.hidden = watching || view !== 'playlist';
      watchView.hidden = !watching;
      renderGuide();
      findAll('[data-nav]').forEach((item) => {
        const nav = item.dataset.nav;
        let active = false;
        if (!watching && view === 'playlist') {
          // A playlist page lights up its own entry in the menu, and "You" in the mini guide.
          active = nav === shownPlaylist || (nav === 'library' && item.classList.contains('yt-rail__item'));
        } else if (!watching) {
          active = nav === view;
        }
        item.classList.toggle('is-active', active);
        if (active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
      if (watching) {
        renderWatchInfo();
        renderQueue();
        renderUpNext();
      } else if (view === 'library') {
        renderLibrary();
      } else if (view === 'playlist') {
        renderPlaylist();
      } else {
        renderHome();
      }
    }

    function renderHome() {
      const hasHistory = recent.length > 0;
      emptyState.hidden = hasHistory;
      chipBar.hidden = !hasHistory;
      feed.hidden = !hasHistory;
      feedNote.hidden = true;
      if (!hasHistory) {
        feed.replaceChildren();
        return;
      }
      findAll('[data-filter]').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.filter === filter)));
      const items = recent.filter(matchesFilter);
      feed.replaceChildren(...items.map((item) => videoCard(item, 'feed')));
      if (!items.length) {
        feedNote.textContent = FILTER_EMPTY[filter] || '';
        feedNote.hidden = false;
      }
    }

    function matchesFilter(item) {
      if (filter === 'videos') return Boolean(item.id) && !item.short;
      if (filter === 'shorts') return item.short;
      if (filter === 'playlists') return Boolean(item.list);
      return true;
    }

    /** Your playlists in the side menu, and how many videos the built-in ones hold. */
    function renderGuide() {
      guidePlaylists.replaceChildren(
        ...Library.customPlaylists(library).map((playlist) => {
          const item = el('button', 'yt-guide__item');
          item.type = 'button';
          item.dataset.vaultAction = 'playlist';
          item.dataset.playlist = playlist.id;
          item.dataset.nav = playlist.id;
          const name = el('span', 'yt-guide__label', playlist.name);
          name.dir = 'auto';
          item.append(icon('playlist'), name);
          return item;
        }),
      );
      findAll('[data-count]').forEach((node) => {
        const playlist = Library.getPlaylist(library, node.dataset.count);
        node.textContent = playlist && playlist.items.length ? String(playlist.items.length) : '';
      });
    }

    function renderLibrary() {
      const items = recent.slice(0, 12);
      libHistory.replaceChildren(...items.map((item) => videoCard(item, 'shelf')));
      libHistory.hidden = items.length === 0;
      libHistoryEmpty.hidden = items.length > 0;
      libPlaylists.replaceChildren(...library.playlists.map(playlistCard));
    }

    function playlistCard(playlist) {
      const count = playlist.items.length;
      const card = el('li', 'yt-plcard');
      const button = el('button', 'yt-plcard__thumb');
      button.type = 'button';
      button.setAttribute('aria-label', `${playlist.name}, ${videoCount(count)}`);
      const stack = el('span', 'yt-plcard__stack');
      const cover = coverFor(playlist, true);
      const badge = el('span', 'yt-thumb__badge');
      badge.append(icon('playlist'), document.createTextNode(videoCount(count)));
      cover.append(badge);
      stack.append(cover);
      button.append(stack);
      const title = el('h3', 'yt-plcard__title', playlist.name);
      title.dir = 'auto';
      const meta = el('p', 'yt-plcard__meta', count ? `Updated ${YT.timeAgo(playlist.updated)}` : 'No videos yet');
      card.append(button, title, meta, el('p', 'yt-plcard__link', 'View full playlist'));
      card.addEventListener('click', () => showView('playlist', playlist.id));
      return card;
    }

    /** A playlist's picture: its top video's thumbnail, or an icon while it's empty. */
    function coverFor(playlist, small) {
      const first = playlist.items[0];
      if (first) return thumbnail(first, { small, badge: false, progress: false });
      const box = el('span', 'yt-thumb');
      box.append(placeholder(null, PLAYLIST_ICONS[playlist.id] || 'playlist'));
      return box;
    }

    function renderPlaylist() {
      const playlist = Library.getPlaylist(library, shownPlaylist);
      if (!playlist) {
        // Deleted (maybe in another tab): fall back to the You page.
        view = 'library';
        shownPlaylist = null;
        render();
        return;
      }
      const items = playlist.items;
      const first = items[0];
      const coverId = first ? first.id || first.thumb : null;
      plBg.style.backgroundImage = coverId ? `url("${YT.thumbnailUrl(coverId, 'mqdefault')}")` : '';
      plThumb.replaceChildren(coverFor(playlist, false));
      plThumb.disabled = items.length === 0;
      plTitle.textContent = playlist.name;
      plMeta.replaceChildren(
        el('strong', '', 'Playlist'),
        el('br'),
        document.createTextNode(items.length ? `${videoCount(items.length)} · Updated ${YT.timeAgo(playlist.updated)}` : 'No videos yet'),
      );
      plTools.hidden = Library.isBuiltIn(playlist.id);
      plPlay.querySelectorAll('button').forEach((button) => {
        button.disabled = items.length === 0;
      });
      plItems.replaceChildren(...items.map((item, index) => playlistRow(playlist, item, index)));
      plEmpty.hidden = items.length > 0;
      plEmptyText.textContent = PLAYLIST_EMPTY[playlist.id] || PLAYLIST_EMPTY.custom;
    }

    function playlistRow(playlist, item, index) {
      const label = displayTitle(item);
      const row = el('li', 'yt-plitem');
      const thumbButton = el('button', 'yt-plitem__thumb');
      thumbButton.type = 'button';
      thumbButton.setAttribute('aria-label', `Play ${label}`);
      thumbButton.append(thumbnail(item, { small: true }));
      const text = el('div', 'yt-plitem__text');
      const title = el('h3', 'yt-plitem__title', label);
      title.dir = 'auto';
      title.title = label;
      const meta = el('p', 'yt-plitem__meta', channelLine(item));
      meta.dir = 'auto';
      text.append(title, meta);
      row.append(el('span', 'yt-plitem__index', String(index + 1)), thumbButton, text, menuButton(item, label, { from: 'playlist', playlistId: playlist.id }));
      row.addEventListener('click', () => startQueue(playlist.id, index, false));
      return row;
    }

    function renderWatchInfo() {
      if (!current) return;
      const entry = findEntry(current) || {};
      const author = live.author || (sameVideoAsEntry() ? entry.author : '') || '';
      titleEl.textContent = live.title || entry.title || fallbackTitle(current);
      fullWindowTitle.textContent = titleEl.textContent;
      channelEl.textContent = author || fallbackChannel(current);
      setAvatar(avatarEl, author);
      channelSubEl.textContent = settings.privacy ? 'Watching in private mode' : 'Watching on youtube.com';
      openLink.href = YT.watchUrl(current);

      const facts = [];
      const duration = live.duration || entry.duration;
      if (live.live || entry.live) facts.push('Live');
      else if (duration && current.id) facts.push(YT.formatTime(duration));
      if (current.short) facts.push('Short');
      if (current.list) {
        const count = live.playlistCount || entry.count;
        facts.push(count ? `Playlist · ${count} videos` : 'Playlist');
      }
      if (current.start) facts.push(`Starts at ${YT.formatTime(current.start)}`);
      descMeta.textContent = facts.join('  ·  ') || 'YouTube video';
      descLink.href = YT.watchUrl(current);
      descLink.textContent = YT.watchUrl(current);
      descNote.textContent = settings.privacy
        ? "Playing with YouTube's privacy-enhanced player (youtube-nocookie.com)."
        : 'Playing with the regular YouTube player (youtube.com).';
      renderWatchActions();
    }

    function renderWatchActions() {
      const isVideo = Boolean(current && current.id);
      const liked = isVideo && Library.has(library, Library.LIKED, current);
      likeButton.hidden = !isVideo;
      likeButton.setAttribute('aria-pressed', String(liked));
      likeButton.title = liked ? 'Unlike' : 'I like this';
      likeButton.querySelector('span').textContent = liked ? 'Liked' : 'Like';
      saveButton.title = isVideo ? 'Save to a playlist' : 'Save this playlist';
      syncFullscreenButton();
    }

    function renderQueue() {
      queuePanel.hidden = !queue;
      if (!queue) {
        queueList.replaceChildren();
        return;
      }
      queueTitle.textContent = queue.name;
      queueSub.textContent = `${queue.shuffled ? 'Shuffled · ' : ''}${queue.index + 1} / ${queue.items.length}`;
      queueNext.disabled = queue.index >= queue.items.length - 1;
      queueList.replaceChildren(...queue.items.map(queueRow));
      const row = queueList.children[queue.index];
      if (row) queueList.scrollTop = Math.max(0, row.offsetTop - 8);
    }

    function queueRow(item, index) {
      const isCurrent = index === queue.index;
      const row = el('li', isCurrent ? 'yt-qitem is-current' : 'yt-qitem');
      const button = el('button', 'yt-qitem__button');
      button.type = 'button';
      if (isCurrent) button.setAttribute('aria-current', 'true');
      const marker = el('span', 'yt-qitem__index');
      if (isCurrent) marker.append(icon('play'));
      else marker.textContent = String(index + 1);
      const text = el('span', 'yt-qitem__text');
      const title = el('span', 'yt-qitem__title', displayTitle(item));
      title.dir = 'auto';
      const channel = el('span', 'yt-qitem__channel', channelLine(item));
      channel.dir = 'auto';
      text.append(title, channel);
      button.append(marker, thumbnail(item, { small: true }), text);
      button.addEventListener('click', () => {
        if (queue && index !== queue.index) playQueueItem(index);
      });
      row.append(button);
      return row;
    }

    function renderUpNext() {
      const key = current ? YT.historyKey(current) : '';
      const items = recent.filter((item) => YT.historyKey(item) !== key);
      upNext.replaceChildren(...items.map((item) => videoCard(item, 'compact')));
      upNextNote.hidden = items.length > 0;
    }

    function videoCard(item, variant) {
      const label = displayTitle(item);
      const card = el('li', `yt-card yt-card--${variant}`);

      const thumbButton = el('button', 'yt-card__thumb');
      thumbButton.type = 'button';
      thumbButton.setAttribute('aria-label', `Play ${label}`);
      thumbButton.append(thumbnail(item, { small: variant !== 'feed' }));

      const body = el('div', 'yt-card__body');
      if (variant === 'feed') {
        const avatar = el('span', 'yt-avatar');
        avatar.setAttribute('aria-hidden', 'true');
        setAvatar(avatar, item.author);
        body.append(avatar);
      }
      const text = el('div', 'yt-card__text');
      const title = el('h3', 'yt-card__title', label);
      title.dir = 'auto';
      title.title = label;
      const channel = el('p', 'yt-card__channel', channelLine(item));
      channel.dir = 'auto';
      text.append(title, channel, el('p', 'yt-card__meta', metaLine(item)));

      body.append(text, menuButton(item, label, { from: 'history' }));
      card.append(thumbButton, body);
      card.addEventListener('click', () => play(toVideo(item)));
      return card;
    }

    function menuButton(item, label, context) {
      const button = el('button', 'yt-card__menu');
      button.type = 'button';
      button.title = 'More actions';
      button.setAttribute('aria-label', `More actions for ${label}`);
      button.setAttribute('aria-controls', 'vault-popup');
      button.setAttribute('aria-expanded', 'false');
      // Lets focus find this button again after the list is redrawn (say, while a dialog was open).
      button.dataset.focusKey = `${context.from}:${context.playlistId || ''}:${YT.historyKey(item)}`;
      button.append(icon('more'));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (popupAnchor === button) closePopup();
        else openItemMenu(button, item, context, event.detail === 0);
      });
      return button;
    }

    function thumbnail(item, options = {}) {
      const box = el('span', 'yt-thumb');
      const thumbId = item.id || item.thumb;
      if (thumbId) {
        const img = el('img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        // Big cards try the sharp HD thumbnail first, then the one every video has.
        let quality = options.small ? 'hqdefault' : 'hq720';
        const fallBack = () => {
          if (quality === 'hq720') {
            quality = 'hqdefault';
            img.classList.add('is-letterboxed');
            img.src = YT.thumbnailUrl(thumbId, quality);
          } else if (img.isConnected) {
            img.replaceWith(placeholder(item));
          }
        };
        img.addEventListener('error', fallBack);
        // A missing HD thumbnail comes back as a tiny grey 120×90 picture, not as an error.
        img.addEventListener('load', () => {
          if (quality === 'hq720' && img.naturalWidth <= 120) fallBack();
        });
        if (quality === 'hqdefault') img.classList.add('is-letterboxed');
        img.src = YT.thumbnailUrl(thumbId, quality);
        box.append(img);
      } else {
        box.append(placeholder(item));
      }
      if (options.badge !== false) {
        const badge = badgeFor(item);
        if (badge) box.append(badge);
      }
      // The red bar: how much of it you've watched.
      const watched = options.progress !== false && item.id ? Library.watchedFraction(Library.progressFor(progress, item.id)) : 0;
      if (watched > 0) {
        const bar = el('span', 'yt-thumb__progress');
        const fill = el('span');
        fill.style.width = `${(watched * 100).toFixed(1)}%`;
        bar.append(fill);
        box.append(bar);
      }
      return box;
    }

    function placeholder(item, iconName) {
      const node = el('span', 'yt-thumb__placeholder');
      node.append(icon(iconName || (item && item.id ? 'play' : 'playlist')));
      return node;
    }

    function badgeFor(item) {
      if (item.live) return el('span', 'yt-thumb__badge yt-thumb__badge--live', 'LIVE');
      if (!item.id) {
        const badge = el('span', 'yt-thumb__badge');
        badge.append(icon('playlist'), document.createTextNode(item.count ? `${item.count} videos` : 'Playlist'));
        return badge;
      }
      if (item.short) return el('span', 'yt-thumb__badge', 'SHORTS');
      if (item.duration) return el('span', 'yt-thumb__badge', YT.formatTime(item.duration));
      return null;
    }

    function setAvatar(node, author) {
      const letter = author ? Array.from(author.trim())[0] || '' : '';
      if (letter) {
        node.textContent = letter;
        node.style.setProperty('--avatar-bg', AVATAR_COLORS[hash(author) % AVATAR_COLORS.length]);
      } else {
        node.replaceChildren(icon('play'));
        node.style.removeProperty('--avatar-bg');
      }
    }

    function displayTitle(item) {
      return item.title || fallbackTitle(item);
    }

    function fallbackTitle(video) {
      return video.id ? `youtu.be/${video.id}` : 'YouTube playlist';
    }

    function channelLine(item) {
      if (!item.id) return item.author ? `Playlist · ${item.author}` : 'Playlist';
      return item.author || fallbackChannel(item);
    }

    function fallbackChannel(video) {
      if (video.short) return 'YouTube Shorts';
      if (!video.id) return 'YouTube playlist';
      return 'YouTube';
    }

    function metaLine(item) {
      const parts = [`Watched ${YT.timeAgo(item.at)}`];
      if (item.start) parts.push(`starts at ${YT.formatTime(item.start)}`);
      return parts.join(' · ');
    }

    function videoCount(count) {
      if (!count) return 'No videos';
      return count === 1 ? '1 video' : `${count} videos`;
    }

    /* ------------------------------ playback ------------------------------ */

    function submit() {
      const result = YT.parse(input.value);
      if (!result.ok) {
        showSearchError(ERRORS[result.error] || ERRORS.invalid);
        return;
      }
      play(result.video);
    }

    /** Plays a video. `auto` is for the next one in a playlist: it leaves the rest of the page alone. */
    function play(video, options = {}) {
      if (!options.auto) {
        closeOverlays();
        closeSearch();
        clearSearchError();
        input.value = '';
        syncInputClear();
      }
      if (!options.fromQueue) queue = null;
      // Pick up where you left off, unless the link says where to start.
      const resume = video.start > 0 ? 0 : resumePoint(video) || 0;
      addRecent(video);
      mount(video, true, resume || undefined);
      if (!options.auto) {
        root.scrollTo({ top: 0 });
        if (!finePointer.matches) input.blur(); // put the on-screen keyboard away
      }
      if (resume) {
        const key = YT.historyKey(video);
        showToast(`Resumed at ${YT.formatTime(resume)}`, {
          label: 'Start over',
          run: () => {
            if (current && YT.historyKey(current) === key) mount(current, true, 0);
          },
        });
      }
    }

    /** Where to start a video you've watched part of, or undefined to use its own start time. */
    function resumePoint(video) {
      const time = video.id ? Library.resumeTime(Library.progressFor(progress, video.id)) : 0;
      return time || undefined;
    }

    /** Puts a fresh YouTube <iframe> on the watch page. */
    function mount(video, autoplay, startAt) {
      unmount();
      current = video;
      live = {};
      const origin = YT.embedOrigin(settings.privacy);
      const widgetId = ++widgetCount;
      const start = startAt === undefined ? video.start : startAt;

      const frame = document.createElement('iframe');
      frame.className = 'yt-player__frame';
      frame.title = 'YouTube video player';
      frame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      frame.setAttribute('frameborder', '0');
      frame.src = YT.embedUrl(Object.assign({}, video, { start }), {
        autoplay,
        privacy: settings.privacy,
        origin: /^https?:$/.test(location.protocol) ? location.origin : '',
        widgetId,
      });

      const state = { frame, origin, widgetId, connected: false, timer: 0, tries: 0 };
      player = state;
      frame.addEventListener('load', () => listenTo(state));
      stage.replaceChildren(frame);
      stage.classList.toggle('is-short', Boolean(video.short));
      render();
    }

    function unmount() {
      clearTimeout(advanceTimer);
      if (player) clearInterval(player.timer);
      player = null;
      flushProgress();
      stage.replaceChildren();
    }

    /**
     * Asks the player to report back (title, channel, duration, progress, errors), the same
     * handshake YouTube's own IFrame API uses. If it never answers, the page just shows the link.
     */
    function listenTo(state) {
      clearInterval(state.timer);
      const hello = JSON.stringify({ event: 'listening', id: state.widgetId, channel: 'widget' });
      const send = () => {
        if (player !== state || state.connected || state.tries++ >= 40) {
          clearInterval(state.timer);
          return;
        }
        try {
          state.frame.contentWindow.postMessage(hello, state.origin);
        } catch (error) {
          /* the frame went away */
        }
      };
      send();
      state.timer = setInterval(send, 250);
    }

    window.addEventListener('message', (event) => {
      const state = player;
      // Only trust messages from our own player frame, served by YouTube.
      if (!state || event.source !== state.frame.contentWindow || event.origin !== state.origin) return;
      const data = YT.readPlayerMessage(event.data);
      if (!data) return;
      if (!state.connected) {
        state.connected = true;
        clearInterval(state.timer);
        // Also ask for state changes as events, like the IFrame API does (they tell us when a video ends).
        try {
          const command = { event: 'command', func: 'addEventListener', args: ['onStateChange'], id: state.widgetId, channel: 'widget' };
          state.frame.contentWindow.postMessage(JSON.stringify(command), state.origin);
        } catch (error) {
          /* the frame went away */
        }
      }
      if (data.event === 'onError') {
        if (data.error !== undefined) showPlayerError(data.error);
        return;
      }
      applyPlayerInfo(data);
    });

    function applyPlayerInfo(data) {
      if (!current) return;
      if (typeof data.currentTime === 'number') live.currentTime = data.currentTime;
      // A single video: ignore anything about a different one (like an end-screen suggestion).
      if (data.videoId && current.id && !current.list && data.videoId !== current.id) return;
      // A playlist moved on to its next video: start fresh for that one.
      if (data.videoId && live.videoId && data.videoId !== live.videoId) {
        live = { playlistCount: live.playlistCount, currentTime: live.currentTime, state: live.state };
      }
      if (typeof data.playlistIndex === 'number') live.playlistIndex = data.playlistIndex;
      if (typeof data.state === 'number') live.state = data.state;
      let changed = false;
      for (const field of ['videoId', 'title', 'author', 'duration', 'live', 'playlistCount']) {
        if (data[field] !== undefined && live[field] !== data[field]) {
          live[field] = data[field];
          changed = true;
        }
      }
      trackProgress();
      if (data.state === 0) handleEnded();
      if (!changed) return;
      rememberPlayerInfo();
      renderWatchInfo();
      if (queue) renderQueue();
    }

    /** Is the player showing the video the history entry is about (and not, say, a later playlist video)? */
    function sameVideoAsEntry() {
      if (!current || !current.id) return false;
      return live.videoId ? live.videoId === current.id : !current.list;
    }

    /** What the player has said about what's on screen, in the shape saved entries use. */
    function playerDetails() {
      if (!current) return null;
      if (current.id) {
        if (!sameVideoAsEntry()) return null;
        return { title: live.title, author: live.author, duration: live.duration, live: live.live };
      }
      // A playlist: the player doesn't say its name, so its first video gives the title,
      // thumbnail and channel.
      return { thumb: live.videoId, title: live.title, author: live.author, count: live.playlistCount };
    }

    /** Saves what the player told us into history and your playlists, so they show real titles. */
    function rememberPlayerInfo() {
      const details = playerDetails();
      if (!details) return;
      const entry = findEntry(current);
      if (entry && Library.applyDetails(entry, details)) saveRecent();
      if (Library.updateDetails(library, current, details)) saveLibrary();
      const queued = queue ? queue.items[queue.index] : null;
      if (queued && YT.historyKey(queued) === YT.historyKey(current)) Library.applyDetails(queued, details);
    }

    function showPlayerError(code) {
      if (!current) return;
      const url = YT.watchUrl(current);
      showToast(PLAYER_ERRORS[code] || "This video can't be played here", {
        label: 'Open in YouTube',
        run: () => window.open(url, '_blank', 'noopener'),
      });
    }

    /* ------------------------------- progress ----------------------------- */

    /** The video the player is on: for a YouTube playlist, whichever video it has reached. */
    function playingVideoId() {
      if (!current) return null;
      if (current.list) return live.videoId || current.id || null;
      return current.id;
    }

    function playingDuration() {
      if (live.duration) return live.duration;
      const entry = sameVideoAsEntry() ? findEntry(current) : null;
      return entry && entry.duration ? entry.duration : 0;
    }

    /** Remembers how far you got, so the video can pick up there next time. */
    function trackProgress() {
      const id = playingVideoId();
      // Only while it's actually playing or paused: before that the player reports its start time.
      if (!id || live.live || typeof live.currentTime !== 'number' || (live.state !== 1 && live.state !== 2)) return;
      if (Library.recordProgress(progress, id, live.currentTime, playingDuration())) scheduleProgressSave();
    }

    function scheduleProgressSave() {
      progressDirty = true;
      if (!progressTimer) progressTimer = setTimeout(flushProgress, 5000);
    }

    function flushProgress() {
      clearTimeout(progressTimer);
      progressTimer = 0;
      if (!progressDirty) return;
      progressDirty = false;
      writeJSON(PROGRESS_KEY, progress);
    }

    window.addEventListener('pagehide', flushProgress);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushProgress();
    });

    /** A video finished: fill its red bar, and move on if you're playing one of your playlists. */
    function handleEnded() {
      const id = playingVideoId();
      const duration = playingDuration();
      if (id && duration && !live.live && Library.recordProgress(progress, id, duration, duration)) scheduleProgressSave();
      if (!queue || !current) return;
      // A YouTube playlist keeps going by itself until its last video.
      if (!current.id && live.playlistCount && typeof live.playlistIndex === 'number' && live.playlistIndex < live.playlistCount - 1) return;
      const index = queue.index;
      const key = YT.historyKey(current);
      const advance = () => {
        if (!queue || queue.index !== index || !current || YT.historyKey(current) !== key) return;
        // Don't pull the page out from under an open dialog or menu: wait until it's closed.
        if (isDialogOpen() || !popup.hidden) {
          advanceTimer = setTimeout(advance, 1000);
          return;
        }
        nextInQueue(true);
      };
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(advance, 1000);
    }

    /* ------------------------- playing your playlists ---------------------- */

    function startQueue(playlistId, index, shuffled) {
      const playlist = Library.getPlaylist(library, playlistId);
      if (!playlist || !playlist.items.length) return;
      const items = playlist.items.map((item) => Object.assign({}, item));
      if (shuffled) shuffleInPlace(items);
      queue = { playlistId, name: playlist.name, items, index: 0, shuffled: Boolean(shuffled) };
      playQueueItem(shuffled ? 0 : Math.max(0, Math.min(index, items.length - 1)));
    }

    function playQueueItem(index, auto) {
      if (!queue || index < 0 || index >= queue.items.length) return;
      queue.index = index;
      const item = queue.items[index];
      // Saved videos play on their own, so "ended" really means it's time for the next one.
      play(item.id ? { id: item.id, list: null, start: 0, short: item.short } : toVideo(item), { fromQueue: true, auto: Boolean(auto) });
    }

    function nextInQueue(auto) {
      if (queue && queue.index + 1 < queue.items.length) playQueueItem(queue.index + 1, auto);
    }

    function shuffleInPlace(items) {
      for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = items[i];
        items[i] = items[j];
        items[j] = swap;
      }
    }

    /* ---------------------------- watch history --------------------------- */

    function findEntry(video) {
      if (!video) return null;
      const key = YT.historyKey(video);
      return recent.find((item) => YT.historyKey(item) === key) || null;
    }

    function toVideo(item) {
      return { id: item.id, list: item.list, start: item.start, short: item.short };
    }

    function addRecent(video) {
      const existing = findEntry(video);
      const known = existing || Library.findDetails(library, video) || {};
      const details = {};
      ['title', 'author', 'duration', 'live', 'thumb', 'count'].forEach((field) => {
        if (known[field] !== undefined) details[field] = known[field];
      });
      const entry = Object.assign(details, existing || {}, toVideo(video), { at: Date.now() });
      const key = YT.historyKey(video);
      recent = [entry].concat(recent.filter((item) => YT.historyKey(item) !== key)).slice(0, MAX_RECENT);
      saveRecent();
    }

    function removeRecent(key) {
      const index = recent.findIndex((item) => YT.historyKey(item) === key);
      if (index === -1) return;
      const removed = recent.splice(index, 1)[0];
      saveRecent();
      render();
      showToast('Removed from watch history', {
        label: 'Undo',
        run: () => {
          if (findEntry(removed)) return;
          recent.splice(Math.min(index, recent.length), 0, removed);
          recent = recent.slice(0, MAX_RECENT);
          saveRecent();
          render();
        },
      });
    }

    function clearHistory() {
      if (!recent.length) {
        showToast('Your watch history is already empty');
        return;
      }
      const previous = recent;
      recent = [];
      saveRecent();
      render();
      showToast('Watch history cleared', {
        label: 'Undo',
        run: () => {
          const keys = new Set(recent.map(YT.historyKey));
          recent = recent.concat(previous.filter((item) => !keys.has(YT.historyKey(item)))).slice(0, MAX_RECENT);
          saveRecent();
          render();
        },
      });
    }

    function saveRecent() {
      writeJSON(RECENT_KEY, recent);
    }

    /* ------------------------------- library ------------------------------ */

    function saveLibrary() {
      writeJSON(LIBRARY_KEY, library);
    }

    /** Saves the library and refreshes what's on screen (without disturbing the player). */
    function libraryChanged() {
      saveLibrary();
      if (current) {
        renderGuide();
        renderWatchActions();
      } else {
        render();
      }
    }

    /** A video plus everything known about it (title, channel…), ready to save. */
    function entryFor(video) {
      const entry = Object.assign(
        {},
        Library.findDetails(library, video) || {},
        findEntry(video) || {},
        video.id ? { id: video.id, list: null, short: Boolean(video.short) } : { id: null, list: video.list },
      );
      if (current && YT.historyKey(current) === YT.historyKey(video)) Library.applyDetails(entry, playerDetails());
      return entry;
    }

    function toggleLike() {
      if (!current || !current.id) return;
      const video = toVideo(current);
      if (Library.has(library, Library.LIKED, video)) {
        const removed = Library.removeItem(library, Library.LIKED, video);
        libraryChanged();
        showToast('Removed from Liked videos', {
          label: 'Undo',
          run: () => {
            if (Library.restoreItem(library, removed)) libraryChanged();
          },
        });
      } else if (Library.addItem(library, Library.LIKED, entryFor(video))) {
        libraryChanged();
        showToast('Added to Liked videos');
      } else {
        showToast('Liked videos is full');
      }
    }

    function addToPlaylist(playlistId, video) {
      const playlist = Library.getPlaylist(library, playlistId);
      if (!playlist) return;
      if (Library.addItem(library, playlistId, entryFor(video))) {
        libraryChanged();
        showToast(`Saved to ${playlist.name}`);
      } else if (!Library.has(library, playlistId, video)) {
        showToast(`${playlist.name} is full`);
      }
    }

    function removeFromPlaylist(playlistId, video) {
      const playlist = Library.getPlaylist(library, playlistId);
      const removed = playlist ? Library.removeItem(library, playlistId, video) : null;
      if (!removed) return;
      libraryChanged();
      showToast(`Removed from ${playlist.name}`, {
        label: 'Undo',
        run: () => {
          if (Library.restoreItem(library, removed)) libraryChanged();
        },
      });
    }

    function movePlaylistItem(playlistId, video, toIndex) {
      if (Library.moveItem(library, playlistId, video, toIndex)) libraryChanged();
    }

    function newPlaylist(returnTo) {
      openNameDialog(
        {
          title: 'New playlist',
          confirm: 'Create',
          onSubmit: (name) => {
            const playlist = Library.createPlaylist(library, name);
            if (!playlist) {
              showToast(`You can make up to ${Library.MAX_PLAYLISTS} playlists`);
              return;
            }
            saveLibrary();
            showView('playlist', playlist.id);
            showToast('Playlist created');
          },
        },
        returnTo,
      );
    }

    function renameShownPlaylist(returnTo) {
      const playlist = Library.getPlaylist(library, shownPlaylist);
      if (!playlist || Library.isBuiltIn(playlist.id)) return;
      openNameDialog(
        {
          title: 'Rename playlist',
          confirm: 'Save',
          value: playlist.name,
          onSubmit: (name) => {
            if (Library.renamePlaylist(library, playlist.id, name)) {
              libraryChanged();
              showToast('Playlist renamed');
            }
          },
        },
        returnTo,
      );
    }

    function deleteShownPlaylist() {
      const removed = Library.deletePlaylist(library, shownPlaylist);
      if (!removed) return;
      saveLibrary();
      showView('library');
      showToast(`Deleted ${removed.playlist.name}`, {
        label: 'Undo',
        run: () => {
          if (Library.restorePlaylist(library, removed)) libraryChanged();
        },
      });
    }

    function exportBackup() {
      flushProgress();
      const data = Library.makeBackup({ library, history: recent, progress });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = el('a');
      link.href = url;
      link.download = `freetube-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.hidden = true;
      root.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      showToast('Backup downloaded');
    }

    async function importBackup(file) {
      if (file.size > 5000000) {
        showToast(IMPORT_ERRORS['too-big']);
        return;
      }
      let text = '';
      try {
        text = await readFileText(file);
      } catch (error) {
        showToast("Couldn't read that file");
        return;
      }
      const backup = Library.readBackup(text, { maxHistory: MAX_RECENT });
      if (!backup.ok) {
        showToast(IMPORT_ERRORS[backup.error] || IMPORT_ERRORS['not-backup']);
        return;
      }
      const before = JSON.stringify([library, recent]);
      const state = { library, history: recent, progress };
      Library.mergeBackup(state, backup, { maxHistory: MAX_RECENT });
      library = state.library;
      recent = state.history;
      progress = state.progress;
      saveLibrary();
      saveRecent();
      progressDirty = true;
      flushProgress();
      render();
      showToast(JSON.stringify([library, recent]) === before ? 'Everything in that backup is already here' : 'Backup imported');
    }

    function readFileText(file) {
      if (typeof file.text === 'function') return file.text();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
    }

    // Another tab changed something: pick it up, so neither tab overwrites the other's changes.
    window.addEventListener('storage', (event) => {
      if (event.key === LIBRARY_KEY) {
        library = Library.sanitizeLibrary(readJSON(LIBRARY_KEY, null));
      } else if (event.key === RECENT_KEY) {
        recent = YT.sanitizeHistory(readJSON(RECENT_KEY, []), MAX_RECENT);
      } else if (event.key === PROGRESS_KEY) {
        const theirs = Library.sanitizeProgress(readJSON(PROGRESS_KEY, null));
        Object.keys(theirs).forEach((id) => {
          const mine = Library.progressFor(progress, id);
          if (!mine || theirs[id].at > mine.at) progress[id] = theirs[id];
        });
        return;
      } else {
        return;
      }
      if (isOpen && !isDialogOpen() && popup.hidden) {
        if (current) libraryChanged();
        else render();
      }
    });

    /* ------------------------------ full screen ---------------------------- */

    const fullscreen = {
      supported: () => typeof stage.requestFullscreen === 'function' || typeof stage.webkitRequestFullscreen === 'function',
      // False when the page is in a frame that doesn't allow full screen (like some previews).
      allowed: () => Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled),
      element: () => document.fullscreenElement || document.webkitFullscreenElement || null,
      request(node) {
        if (typeof node.requestFullscreen === 'function') return Promise.resolve(node.requestFullscreen({ navigationUI: 'hide' }));
        node.webkitRequestFullscreen();
        return Promise.resolve();
      },
      exit() {
        try {
          const result = typeof document.exitFullscreen === 'function' ? document.exitFullscreen() : document.webkitExitFullscreen();
          if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch (error) {
          /* already out */
        }
      },
    };

    function isFullscreen() {
      const node = fullscreen.element();
      return Boolean(node && root.contains(node));
    }

    function toggleFullscreen() {
      if (!current) return;
      if (isFullscreen()) {
        fullscreen.exit();
        return;
      }
      if (fullWindow) {
        setFullWindow(false);
        return;
      }
      if (fullscreen.supported() && fullscreen.allowed()) {
        let request;
        try {
          request = fullscreen.request(stage);
        } catch (error) {
          request = Promise.reject(error);
        }
        request.then(lockLandscape, () => setFullWindow(true));
      } else {
        setFullWindow(true);
      }
    }

    /** The fallback for when the browser won't do real full screen: the player fills the window. */
    function setFullWindow(on) {
      if (fullWindow === on) return;
      fullWindow = on;
      root.classList.toggle('is-fullwindow', on);
      fullWindowBar.hidden = !on;
      syncInert();
      syncFullscreenButton();
      if (on) {
        fullWindowTitle.textContent = titleEl.textContent;
        fullWindowBar.querySelector('button').focus({ preventScroll: true });
        if (!fullWindowExplained && fullscreen.supported() && !fullscreen.allowed()) {
          fullWindowExplained = true;
          showToast("This page isn't allowed to go full screen here, so the video fills the window instead");
        }
      } else if (fullWindowBar.contains(document.activeElement)) {
        fullscreenButton.focus({ preventScroll: true });
      }
    }

    function exitFullscreen() {
      if (isFullscreen()) fullscreen.exit();
      setFullWindow(false);
    }

    function syncFullscreenButton() {
      const on = isFullscreen() || fullWindow;
      fullscreenButton.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
      fullscreenButton.title = on ? 'Exit full screen (f)' : 'Full screen (f)';
      fullscreenButton.querySelector('use').setAttribute('href', on ? '#i-fullscreen-exit' : '#i-fullscreen');
    }

    ['fullscreenchange', 'webkitfullscreenchange'].forEach((type) => {
      document.addEventListener(type, () => {
        if (!fullscreen.element()) {
          lastFullscreenExit = Date.now();
          unlockOrientation();
        }
        syncFullscreenButton();
      });
    });

    // Phones: turn sideways for full screen, like the YouTube app (not for Shorts).
    function lockLandscape() {
      if (!current || current.short || finePointer.matches) return;
      try {
        const orientation = screen.orientation;
        if (orientation && typeof orientation.lock === 'function') orientation.lock('landscape').catch(() => {});
      } catch (error) {
        /* not supported */
      }
    }

    function unlockOrientation() {
      try {
        const orientation = screen.orientation;
        if (orientation && typeof orientation.unlock === 'function') orientation.unlock();
      } catch (error) {
        /* not supported */
      }
    }

    /* ------------------------------ settings ------------------------------ */

    function saveSettings() {
      writeJSON(SETTINGS_KEY, settings);
    }

    function effectiveTheme() {
      if (settings.appearance === 'device') return prefersLight.matches ? 'light' : 'dark';
      return settings.appearance;
    }

    function applyAppearance() {
      const theme = effectiveTheme();
      root.dataset.ytTheme = theme;
      if (isOpen) themeColorMeta.setAttribute('content', theme === 'light' ? THEME_COLORS.vaultLight : THEME_COLORS.vault);
      findAll('[data-appearance]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.appearance === settings.appearance)));
      findAll('[data-appearance-label]').forEach((node) => {
        node.textContent = APPEARANCE_LABELS[settings.appearance];
      });
    }

    if (typeof prefersLight.addEventListener === 'function') prefersLight.addEventListener('change', applyAppearance);
    else if (typeof prefersLight.addListener === 'function') prefersLight.addListener(applyAppearance);

    function applyPrivacy() {
      findAll('[data-vault-action="private"]').forEach((item) => {
        item.setAttribute('aria-pressed', String(settings.privacy));
        item.title = settings.privacy ? 'Private mode is on' : 'Private mode is off';
      });
      findAll('[data-private-label]').forEach((node) => {
        node.textContent = settings.privacy ? 'On' : 'Off';
      });
    }

    function togglePrivacy() {
      settings.privacy = !settings.privacy;
      saveSettings();
      applyPrivacy();
      if (current) {
        // Switch players without losing your place.
        const resumeAt = live.currentTime > 2 ? Math.floor(live.currentTime) : undefined;
        mount(current, true, resumeAt);
      }
      showToast(settings.privacy ? 'Private mode is on' : 'Private mode is off');
    }

    /* ------------------------- menus and search box ------------------------ */

    function toggleSettings(force, viaKeyboard) {
      const show = typeof force === 'boolean' ? force : settingsMenu.hidden;
      if (!show) {
        if (settingsMenu.hidden) return;
        const hadFocus = settingsMenu.contains(document.activeElement);
        settingsMenu.hidden = true;
        settingsBackdrop.hidden = true;
        settingsButton.setAttribute('aria-expanded', 'false');
        if (hadFocus) settingsButton.focus({ preventScroll: true });
        return;
      }
      closeGuide();
      closePopup(false);
      showMenuPanel(menuMain);
      settingsBackdrop.hidden = false;
      settingsMenu.hidden = false;
      // Line it up under the ⋮ button, but keep it on screen.
      const rect = settingsButton.getBoundingClientRect();
      const right = Math.min(window.innerWidth - rect.right, window.innerWidth - settingsMenu.offsetWidth - 8);
      settingsMenu.style.top = `${Math.round(rect.bottom + 4)}px`;
      settingsMenu.style.right = `${Math.max(8, Math.round(right))}px`;
      settingsButton.setAttribute('aria-expanded', 'true');
      if (viaKeyboard) focusFirst(menuMain);
    }

    function showMenuPanel(panel) {
      menuMain.hidden = panel !== menuMain;
      menuAppearance.hidden = panel !== menuAppearance;
    }

    function focusFirst(container) {
      const first = container.querySelector('button:not([hidden]):not(:disabled), input:not([hidden])');
      if (first) first.focus({ preventScroll: true });
    }

    function openGuide() {
      toggleSettings(false);
      closePopup(false);
      root.classList.add('is-guide-open');
      guide.inert = false;
      syncInert();
      guideButton.setAttribute('aria-expanded', 'true');
      focusFirst(guide.querySelector('.yt-guide__section'));
    }

    function closeGuide() {
      if (!root.classList.contains('is-guide-open')) return;
      root.classList.remove('is-guide-open');
      guide.inert = true;
      syncInert();
      guideButton.setAttribute('aria-expanded', 'false');
      if (guide.contains(document.activeElement) || document.activeElement === document.body) {
        guideButton.focus({ preventScroll: true });
      }
    }

    /** Keeps whatever is behind the side menu, a dialog or the full-window player out of reach. */
    function syncInert() {
      const covered = root.classList.contains('is-guide-open') || isDialogOpen();
      masthead.inert = covered || fullWindow;
      rail.inert = covered || fullWindow;
      page.inert = covered;
      [titleEl, owner, desc, secondary].forEach((node) => {
        node.inert = fullWindow;
      });
      fullWindowBar.inert = covered;
    }

    function closeMenus() {
      toggleSettings(false);
      closeGuide();
      closePopup(false);
    }

    function closeOverlays() {
      closeMenus();
      closeDialog(false);
    }

    /* The ⋮ menu on videos */
    function openItemMenu(anchor, item, context, viaKeyboard) {
      closeMenus();
      const video = toVideo(item);
      const inPlaylist = context.from === 'playlist' ? Library.getPlaylist(library, context.playlistId) : null;
      const actions = [];
      if (!inPlaylist || inPlaylist.id !== Library.WATCH_LATER) {
        const later = Library.has(library, Library.WATCH_LATER, video);
        actions.push({
          icon: 'clock',
          label: later ? 'Remove from Watch later' : 'Save to Watch later',
          run: () => (later ? removeFromPlaylist(Library.WATCH_LATER, video) : addToPlaylist(Library.WATCH_LATER, video)),
        });
      }
      actions.push({ icon: 'save', label: 'Save to playlist', run: () => openSaveDialog(video, anchor) });
      actions.push({ icon: 'share', label: 'Share', run: () => shareLink(video) });
      actions.push(null);
      if (inPlaylist) {
        const key = YT.historyKey(video);
        const index = inPlaylist.items.findIndex((entry) => YT.historyKey(entry) === key);
        if (index > 0) actions.push({ icon: 'to-top', label: 'Move to top', run: () => movePlaylistItem(inPlaylist.id, video, 0) });
        if (index < inPlaylist.items.length - 1) {
          actions.push({ icon: 'to-bottom', label: 'Move to bottom', run: () => movePlaylistItem(inPlaylist.id, video, inPlaylist.items.length - 1) });
        }
        actions.push({ icon: 'trash', label: `Remove from ${inPlaylist.name}`, run: () => removeFromPlaylist(inPlaylist.id, video) });
      } else {
        actions.push({ icon: 'trash', label: 'Remove from watch history', run: () => removeRecent(YT.historyKey(item)) });
      }
      popup.replaceChildren(...actions.map((action) => (action ? popupItem(action) : el('hr', 'yt-menu__divider'))));
      popupAnchor = anchor;
      anchor.setAttribute('aria-expanded', 'true');
      const sheet = compact.matches;
      popup.classList.toggle('is-sheet', sheet);
      popupBackdrop.classList.toggle('is-dim', sheet);
      popupBackdrop.hidden = false;
      popup.hidden = false;
      placePopup(anchor, sheet);
      if (viaKeyboard) focusFirst(popup);
    }

    function popupItem(action) {
      const button = el('button', 'yt-menu__item');
      button.type = 'button';
      button.append(icon(action.icon), el('span', 'yt-menu__label', action.label));
      button.addEventListener('click', () => {
        closePopup();
        action.run();
      });
      return button;
    }

    function placePopup(anchor, sheet) {
      popup.style.top = '';
      popup.style.right = '';
      popup.style.left = '';
      if (sheet) return;
      // Under the ⋮ button, lined up with its right edge; above it if there's no room below.
      const rect = anchor.getBoundingClientRect();
      const width = popup.offsetWidth;
      const height = popup.offsetHeight;
      let left = rect.right - width;
      if (left < 8) left = rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = rect.bottom + 4;
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
      popup.style.left = `${Math.round(left)}px`;
      popup.style.top = `${Math.round(top)}px`;
      popup.style.right = 'auto';
    }

    function closePopup(restoreFocus = true) {
      if (popup.hidden) return;
      const hadFocus = popup.contains(document.activeElement);
      popup.hidden = true;
      popupBackdrop.hidden = true;
      popup.replaceChildren();
      const anchor = popupAnchor;
      popupAnchor = null;
      if (anchor) anchor.setAttribute('aria-expanded', 'false');
      if (restoreFocus && hadFocus) refocus(anchor);
    }

    /** Puts focus back on a button, or on its replacement if the list was redrawn meanwhile. */
    function refocus(node) {
      let target = node;
      if (target && !target.isConnected && target.dataset && target.dataset.focusKey && window.CSS && CSS.escape) {
        target = root.querySelector(`[data-focus-key="${CSS.escape(target.dataset.focusKey)}"]`);
      }
      if (target && target.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
    }

    /* Dialogs */
    function openDialog(dialog, returnTo) {
      closeMenus();
      closeDialog(false);
      dialogReturn = returnTo || document.activeElement;
      dialogScrim.hidden = false;
      dialog.hidden = false;
      syncInert();
    }

    function closeDialog(restoreFocus = true) {
      if (!isDialogOpen()) return;
      saveDialog.hidden = true;
      nameDialog.hidden = true;
      dialogScrim.hidden = true;
      syncInert();
      saveTarget = null;
      nameHandler = null;
      const back = dialogReturn;
      dialogReturn = null;
      if (restoreFocus) refocus(back);
    }

    function isDialogOpen() {
      return !saveDialog.hidden || !nameDialog.hidden;
    }

    function openSaveDialog(video, returnTo) {
      const target = entryFor(video);
      openDialog(saveDialog, returnTo);
      saveTarget = target;
      saveTitle.textContent = target.id ? 'Save video to…' : 'Save playlist to…';
      renderSaveList();
      showCreateForm(false);
      focusFirst(saveList);
    }

    function renderSaveList() {
      // Liked videos fills up from the Like button, so it isn't offered here (same as YouTube).
      const lists = library.playlists.filter((playlist) => playlist.id !== Library.LIKED);
      saveList.replaceChildren(
        ...lists.map((playlist) => {
          const item = el('li');
          const label = el('label', 'yt-check');
          const box = el('input', 'yt-check__input');
          box.type = 'checkbox';
          box.dataset.playlist = playlist.id;
          box.checked = Library.has(library, playlist.id, saveTarget);
          const mark = el('span', 'yt-check__box');
          mark.append(icon('check'));
          const name = el('span', 'yt-check__label', playlist.name);
          name.dir = 'auto';
          label.append(box, mark, name, icon('lock'));
          label.title = 'Private: only on this browser';
          item.append(label);
          return item;
        }),
      );
    }

    function showCreateForm(show) {
      saveNew.hidden = show;
      saveForm.hidden = !show;
      saveName.value = '';
      syncCounter(saveName, saveCount, saveCreate);
      if (show) saveName.focus({ preventScroll: true });
    }

    function syncCounter(field, counter, submitButton) {
      counter.textContent = `${field.value.length}/${Library.MAX_NAME}`;
      submitButton.disabled = field.value.trim().length === 0;
    }

    function openNameDialog(options, returnTo) {
      nameTitle.textContent = options.title;
      nameOk.textContent = options.confirm;
      nameInput.value = options.value || '';
      syncCounter(nameInput, nameCount, nameOk);
      openDialog(nameDialog, returnTo);
      nameHandler = options.onSubmit;
      nameInput.focus({ preventScroll: true });
      nameInput.select();
    }

    function openSearch() {
      root.classList.add('is-search-open');
      input.focus({ preventScroll: true });
    }

    function closeSearch() {
      root.classList.remove('is-search-open');
    }

    function syncInputClear() {
      inputClear.hidden = input.value.length === 0;
    }

    function showSearchError(text) {
      form.classList.add('is-error');
      input.setAttribute('aria-invalid', 'true');
      message.textContent = text;
      message.hidden = false;
      if (compact.matches) root.classList.add('is-search-open'); // the box is tucked away on phones
      form.classList.remove('is-shaking');
      void form.offsetWidth;
      form.classList.add('is-shaking');
      clearTimeout(messageTimer);
      messageTimer = setTimeout(clearSearchError, 5000);
    }

    function clearSearchError() {
      clearTimeout(messageTimer);
      form.classList.remove('is-error');
      input.removeAttribute('aria-invalid');
      message.hidden = true;
      message.textContent = '';
    }

    async function pasteFromClipboard() {
      closeMenus();
      if (!(navigator.clipboard && typeof navigator.clipboard.readText === 'function')) {
        openSearch();
        showToast(`Tap the box and ${PASTE_HINT}`);
        return;
      }
      let text = '';
      try {
        text = (await navigator.clipboard.readText()).trim();
      } catch (error) {
        openSearch();
        showToast(`Your browser blocked the clipboard. Click the box and ${PASTE_HINT}`);
        return;
      }
      if (!text) {
        showToast('Your clipboard is empty');
        return;
      }
      const result = YT.parse(text);
      if (!result.ok) {
        showToast(ERRORS[result.error] || ERRORS.invalid);
        return;
      }
      play(result.video);
    }

    async function shareLink(video) {
      const url = YT.watchUrl(video);
      if (!finePointer.matches && typeof navigator.share === 'function') {
        try {
          await navigator.share({ url });
          return;
        } catch (error) {
          if (error && error.name === 'AbortError') return; // closed the share sheet
        }
      }
      showToast((await copyText(url)) ? 'Link copied to clipboard' : "Couldn't copy the link");
    }

    /* ------------------------------- events ------------------------------- */

    root.addEventListener('click', (event) => {
      const target = event.target.closest('[data-vault-action]');
      if (!target || !root.contains(target)) return;
      const viaKeyboard = event.detail === 0;
      switch (target.dataset.vaultAction) {
        case 'home':
          showView('home');
          break;
        case 'library':
          showView('library');
          break;
        case 'playlist':
          showView('playlist', target.dataset.playlist);
          break;
        case 'paste':
          pasteFromClipboard();
          break;
        case 'private':
          togglePrivacy();
          break;
        case 'clear-history':
          closeMenus();
          clearHistory();
          break;
        case 'lock':
          close();
          break;
        case 'guide':
          if (root.classList.contains('is-guide-open')) closeGuide();
          else openGuide();
          break;
        case 'guide-close':
          closeGuide();
          break;
        case 'settings':
          toggleSettings(undefined, viaKeyboard);
          break;
        case 'settings-close':
          toggleSettings(false);
          break;
        case 'appearance-menu':
          showMenuPanel(menuAppearance);
          focusFirst(menuAppearance); // the Back button, so focus isn't lost with the old panel
          break;
        case 'menu-back':
          showMenuPanel(menuMain);
          menuMain.querySelector('[data-vault-action="appearance-menu"]').focus({ preventScroll: true });
          break;
        case 'appearance':
          settings.appearance = target.dataset.appearance;
          saveSettings();
          applyAppearance();
          break;
        case 'search-open':
          openSearch();
          break;
        case 'search-close':
          closeSearch();
          break;
        case 'share':
          if (current) shareLink(current);
          break;
        case 'stop':
          closeVideo();
          break;
        case 'like':
          toggleLike();
          break;
        case 'save':
          if (current) openSaveDialog(toVideo(current), target);
          break;
        case 'fullscreen':
          toggleFullscreen();
          break;
        case 'queue-next':
          nextInQueue();
          break;
        case 'queue-close':
          queue = null;
          renderQueue();
          break;
        case 'play-all':
          startQueue(shownPlaylist, 0, false);
          break;
        case 'shuffle':
          startQueue(shownPlaylist, 0, true);
          break;
        case 'new-playlist':
          newPlaylist(target);
          break;
        case 'rename-playlist':
          renameShownPlaylist(target);
          break;
        case 'delete-playlist':
          deleteShownPlaylist();
          break;
        case 'export':
          exportBackup();
          break;
        case 'import':
          importFile.click();
          break;
        case 'save-new':
          showCreateForm(true);
          break;
        case 'dialog-close':
          closeDialog();
          break;
        case 'popup-close':
          closePopup();
          break;
        default:
          break;
      }
    });

    chipBar.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-filter]');
      if (!chip) return;
      filter = chip.dataset.filter;
      renderHome();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });

    input.addEventListener('input', () => {
      syncInputClear();
      if (form.classList.contains('is-error')) clearSearchError();
    });

    inputClear.addEventListener('click', () => {
      input.value = '';
      syncInputClear();
      clearSearchError();
      input.focus();
    });

    // Paste a link into the box and it starts playing straight away.
    input.addEventListener('paste', (event) => {
      const text = event.clipboardData ? event.clipboardData.getData('text') : '';
      const result = YT.parse(text);
      if (!result.ok) return; // not a link: let the browser paste it normally
      event.preventDefault();
      play(result.video);
    });

    // You can also paste a link anywhere in FreeTube (but text boxes get to paste normally).
    document.addEventListener('paste', (event) => {
      if (!isOpen || isTextField(event.target) || isDialogOpen()) return;
      const text = event.clipboardData ? event.clipboardData.getData('text') : '';
      if (!text.trim()) return;
      event.preventDefault();
      input.value = text.trim();
      syncInputClear();
      submit();
    });

    saveList.addEventListener('change', (event) => {
      const box = event.target.closest('input[data-playlist]');
      if (!box || !saveTarget) return;
      const playlist = Library.getPlaylist(library, box.dataset.playlist);
      if (!playlist) return;
      if (box.checked) {
        if (Library.addItem(library, playlist.id, saveTarget)) {
          showToast(`Saved to ${playlist.name}`);
        } else {
          box.checked = Library.has(library, playlist.id, saveTarget);
          if (!box.checked) showToast(`${playlist.name} is full`);
        }
      } else if (Library.removeItem(library, playlist.id, saveTarget)) {
        showToast(`Removed from ${playlist.name}`);
      }
      libraryChanged();
    });

    saveName.addEventListener('input', () => syncCounter(saveName, saveCount, saveCreate));

    saveForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!saveTarget || !saveName.value.trim()) return;
      const playlist = Library.createPlaylist(library, saveName.value);
      if (!playlist) {
        showToast(`You can make up to ${Library.MAX_PLAYLISTS} playlists`);
        return;
      }
      Library.addItem(library, playlist.id, saveTarget);
      closeDialog();
      libraryChanged();
      showToast(`Saved to ${playlist.name}`);
    });

    nameInput.addEventListener('input', () => syncCounter(nameInput, nameCount, nameOk));

    nameForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const handler = nameHandler;
      const value = nameInput.value;
      if (!value.trim()) return;
      closeDialog();
      if (handler) handler(value);
    });

    importFile.addEventListener('change', () => {
      const file = importFile.files && importFile.files[0];
      importFile.value = '';
      if (file) importBackup(file);
    });

    toastAction.addEventListener('click', () => {
      const run = toastHandler;
      hideToast();
      if (run) run();
    });

    document.addEventListener('keydown', (event) => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        // This Esc is the browser leaving full screen; don't lock as well.
        if (fullscreen.element() || Date.now() - lastFullscreenExit < 500) return;
        event.preventDefault();
        if (fullWindow) {
          setFullWindow(false);
          return;
        }
        // Otherwise Esc always locks straight away, even with a menu or dialog open.
        close();
        return;
      }
      if (isTextField(event.target) || event.ctrlKey || event.metaKey || event.altKey || isDialogOpen()) return;
      if (event.key === '/') {
        event.preventDefault();
        openSearch();
      } else if ((event.key === 'f' || event.key === 'F') && current) {
        event.preventDefault();
        toggleFullscreen();
      }
    });

    window.addEventListener('resize', () => {
      if (!isOpen) return;
      toggleSettings(false);
      closePopup(false);
      if (!compact.matches) closeSearch();
    });

    // The ⋮ menu is pinned to its button, so scrolling closes it (like YouTube).
    root.addEventListener(
      'scroll',
      () => {
        if (!popup.hidden && !popup.classList.contains('is-sheet')) closePopup(false);
      },
      { passive: true },
    );

    /* ------------------------------- helpers ------------------------------ */

    function isTextField(node) {
      return Boolean(node && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)));
    }

    function showToast(text, action) {
      toastText.textContent = text;
      toastHandler = action ? action.run : null;
      toastAction.hidden = !action;
      toastAction.textContent = action ? action.label : '';
      toast.classList.add('is-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(hideToast, action ? 6000 : 3000);
    }

    function hideToast() {
      clearTimeout(toastTimer);
      toast.classList.remove('is-visible');
      toastHandler = null;
    }

    function hash(text) {
      let value = 0;
      for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0;
      return value;
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

    /** This used to be called TubeVault: move anything saved under the old name to the new keys. */
    function migrateStorage() {
      try {
        ['recent', 'settings', 'library', 'progress'].forEach((name) => {
          const old = `tubevault:${name}`;
          const value = localStorage.getItem(old);
          if (value === null) return;
          if (localStorage.getItem(`freetube:${name}`) === null) localStorage.setItem(`freetube:${name}`, value);
          localStorage.removeItem(old);
        });
      } catch (error) {
        /* storage disabled */
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
        /* storage full or disabled; it just won't persist */
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

    return {
      available: true,
      open,
      close,
      get isOpen() {
        return isOpen;
      },
    };
  }
})();
