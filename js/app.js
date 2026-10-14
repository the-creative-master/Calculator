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
   * TubeVault: a private player that looks like YouTube and plays YouTube's
   * own embedded player.
   * ====================================================================== */
  function createVault() {
    const root = $('#vault');
    const find = (selector) => root.querySelector(selector);
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
    const homeView = find('#vault-home');
    const chipBar = find('#vault-chips');
    const feed = find('#vault-feed');
    const feedNote = find('#vault-feed-note');
    const emptyState = find('#vault-empty');
    const watchView = find('#vault-watch');
    const stage = find('#vault-stage');
    const titleEl = find('#vault-title');
    const avatarEl = find('#vault-avatar');
    const channelEl = find('#vault-channel');
    const channelSubEl = find('#vault-channel-sub');
    const openLink = find('#vault-open');
    const descMeta = find('#vault-desc-meta');
    const descLink = find('#vault-desc-link');
    const descNote = find('#vault-desc-note');
    const upNext = find('#vault-upnext');
    const upNextNote = find('#vault-upnext-note');
    const toast = find('#vault-toast');
    const toastText = find('#vault-toast-text');
    const toastAction = find('#vault-toast-action');

    const RECENT_KEY = 'tubevault:recent';
    const SETTINGS_KEY = 'tubevault:settings';
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
      153: 'YouTube blocked the player. Open TubeVault from a web address, not a file',
    };
    const APPEARANCE_LABELS = { device: 'Device theme', dark: 'Dark', light: 'Light' };
    const FILTER_EMPTY = {
      videos: 'Videos you watch will show up here.',
      shorts: 'Shorts you watch will show up here.',
      playlists: 'Playlists you watch will show up here.',
    };
    const AVATAR_COLORS = ['#ef6c00', '#c2185b', '#7b1fa2', '#512da8', '#1976d2', '#0097a7', '#00796b', '#388e3c', '#5d4037', '#455a64', '#d84315', '#303f9f'];
    const PASTE_HINT = finePointer.matches
      ? `paste with ${/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? '⌘V' : 'Ctrl+V'}`
      : 'long-press the box to paste';
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)');
    const compact = window.matchMedia('(max-width: 656px)');

    const saved = readJSON(SETTINGS_KEY, null) || {};
    const settings = {
      privacy: saved.privacy !== false,
      appearance: Object.prototype.hasOwnProperty.call(APPEARANCE_LABELS, saved.appearance) ? saved.appearance : 'device',
    };
    let recent = YT.sanitizeHistory(readJSON(RECENT_KEY, []), MAX_RECENT);

    let isOpen = false;
    let current = null; // what's on the watch page: { id, list, start, short }
    let live = {}; // what the player has told us about it: { videoId, title, author, duration, live, currentTime, playlistCount }
    let player = null; // { frame, origin, widgetId, connected, timer, tries }
    let widgetCount = 0;
    let filter = 'all';
    let closeTimer = 0;
    let toastTimer = 0;
    let messageTimer = 0;
    let toastHandler = null;
    let skipNextPop = false;

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
      if (current) mount(current, false); // back to what you were watching, paused

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
      closeMenus();
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

    /* ------------------------------ rendering ----------------------------- */

    function render() {
      const watching = Boolean(current);
      root.classList.toggle('is-watching', watching);
      homeView.hidden = watching;
      watchView.hidden = !watching;
      findAll('[data-vault-action="home"]').forEach((item) => item.classList.toggle('is-active', !watching));
      if (watching) {
        renderWatchInfo();
        renderUpNext();
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
      feed.replaceChildren(...items.map((item) => videoCard(item, false)));
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

    function renderWatchInfo() {
      if (!current) return;
      const entry = findEntry(current) || {};
      const author = live.author || (sameVideoAsEntry() ? entry.author : '') || '';
      titleEl.textContent = live.title || entry.title || fallbackTitle(current);
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
    }

    function renderUpNext() {
      const key = current ? YT.historyKey(current) : '';
      const items = recent.filter((item) => YT.historyKey(item) !== key);
      upNext.replaceChildren(...items.map((item) => videoCard(item, true)));
      upNextNote.hidden = items.length > 0;
    }

    function videoCard(item, isCompact) {
      const label = displayTitle(item);
      const card = el('li', isCompact ? 'yt-card yt-card--compact' : 'yt-card');

      const thumbButton = el('button', 'yt-card__thumb');
      thumbButton.type = 'button';
      thumbButton.setAttribute('aria-label', `Play ${label}`);
      thumbButton.append(thumbnail(item, isCompact));

      const body = el('div', 'yt-card__body');
      if (!isCompact) {
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

      const remove = el('button', 'yt-card__remove');
      remove.type = 'button';
      remove.title = 'Remove from watch history';
      remove.setAttribute('aria-label', `Remove ${label} from watch history`);
      remove.append(icon('x'));
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        removeRecent(YT.historyKey(item));
      });

      body.append(text, remove);
      card.append(thumbButton, body);
      card.addEventListener('click', () => play(toVideo(item)));
      return card;
    }

    function thumbnail(item, isCompact) {
      const box = el('span', 'yt-thumb');
      const thumbId = item.id || item.thumb;
      if (thumbId) {
        const img = el('img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        // Big cards try the sharp HD thumbnail first, then the one every video has.
        let quality = isCompact ? 'hqdefault' : 'hq720';
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
      const badge = badgeFor(item);
      if (badge) box.append(badge);
      return box;
    }

    function placeholder(item) {
      const node = el('span', 'yt-thumb__placeholder');
      node.append(icon(item.id ? 'play' : 'playlist'));
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

    /* ------------------------------ playback ------------------------------ */

    function submit() {
      const result = YT.parse(input.value);
      if (!result.ok) {
        showSearchError(ERRORS[result.error] || ERRORS.invalid);
        return;
      }
      play(result.video);
    }

    function play(video) {
      closeMenus();
      closeSearch();
      clearSearchError();
      input.value = '';
      syncInputClear();
      addRecent(video);
      mount(video, true);
      root.scrollTo({ top: 0 });
      if (!finePointer.matches) input.blur(); // put the on-screen keyboard away
    }

    function goHome() {
      closeMenus();
      if (current) {
        unmount();
        current = null;
        live = {};
      }
      render();
      root.scrollTo({ top: 0 });
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
      if (player) clearInterval(player.timer);
      player = null;
      stage.replaceChildren();
    }

    /**
     * Asks the player to report back (title, channel, duration, errors), the same handshake
     * YouTube's own IFrame API uses. If it never answers, the page just shows the link instead.
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
        live = { playlistCount: live.playlistCount, currentTime: live.currentTime };
      }
      let changed = false;
      for (const field of ['videoId', 'title', 'author', 'duration', 'live', 'playlistCount']) {
        if (data[field] !== undefined && live[field] !== data[field]) {
          live[field] = data[field];
          changed = true;
        }
      }
      if (!changed) return;
      rememberPlayerInfo();
      renderWatchInfo();
    }

    /** Is the player showing the video the history entry is about (and not, say, a later playlist video)? */
    function sameVideoAsEntry() {
      if (!current || !current.id) return false;
      return live.videoId ? live.videoId === current.id : !current.list;
    }

    /** Saves what the player told us into watch history, so the home page can show real titles. */
    function rememberPlayerInfo() {
      const entry = findEntry(current);
      if (!entry) return;
      const before = JSON.stringify(entry);
      if (entry.id) {
        if (sameVideoAsEntry()) {
          if (live.title) entry.title = live.title;
          if (live.author) entry.author = live.author;
          if (live.live) {
            entry.live = true;
            delete entry.duration;
          } else if (live.duration) {
            entry.duration = live.duration;
          }
        }
      } else {
        // A playlist: the player doesn't say its name, so its first video gives the title,
        // thumbnail and channel.
        if (!entry.thumb && live.videoId) entry.thumb = live.videoId;
        if (!entry.title && live.title) entry.title = live.title;
        if (!entry.author && live.author) entry.author = live.author;
        if (live.playlistCount) entry.count = live.playlistCount;
      }
      if (JSON.stringify(entry) !== before) saveRecent();
    }

    function showPlayerError(code) {
      if (!current) return;
      const url = YT.watchUrl(current);
      showToast(PLAYER_ERRORS[code] || "This video can't be played here", {
        label: 'Open in YouTube',
        run: () => window.open(url, '_blank', 'noopener'),
      });
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
      const entry = Object.assign({}, existing || {}, toVideo(video), { at: Date.now() });
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
      const first = container.querySelector('button:not([hidden])');
      if (first) first.focus({ preventScroll: true });
    }

    function openGuide() {
      toggleSettings(false);
      root.classList.add('is-guide-open');
      guide.inert = false;
      [masthead, page, rail].forEach((node) => {
        node.inert = true;
      });
      guideButton.setAttribute('aria-expanded', 'true');
      focusFirst(guide.querySelector('.yt-guide__section'));
    }

    function closeGuide() {
      if (!root.classList.contains('is-guide-open')) return;
      root.classList.remove('is-guide-open');
      guide.inert = true;
      [masthead, page, rail].forEach((node) => {
        node.inert = false;
      });
      guideButton.setAttribute('aria-expanded', 'false');
      if (guide.contains(document.activeElement) || document.activeElement === document.body) {
        guideButton.focus({ preventScroll: true });
      }
    }

    function closeMenus() {
      toggleSettings(false);
      closeGuide();
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

    async function share() {
      if (!current) return;
      const url = YT.watchUrl(current);
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
          goHome();
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
          share();
          break;
        case 'stop':
          goHome();
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

    // You can also paste anywhere in TubeVault.
    document.addEventListener('paste', (event) => {
      if (!isOpen || event.target === input) return;
      const text = event.clipboardData ? event.clipboardData.getData('text') : '';
      if (!text.trim()) return;
      event.preventDefault();
      input.value = text.trim();
      syncInputClear();
      submit();
    });

    toastAction.addEventListener('click', () => {
      const run = toastHandler;
      hideToast();
      if (run) run();
    });

    document.addEventListener('keydown', (event) => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        // Esc always locks straight away, even with a menu open.
        event.preventDefault();
        close();
        return;
      }
      const target = event.target;
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        openSearch();
      }
    });

    window.addEventListener('resize', () => {
      if (!isOpen) return;
      toggleSettings(false);
      if (!compact.matches) closeSearch();
    });

    /* ------------------------------- helpers ------------------------------ */

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
        /* storage full or disabled; history just won't persist */
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
      open,
      close,
      get isOpen() {
        return isOpen;
      },
    };
  }
})();
