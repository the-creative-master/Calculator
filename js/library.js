/*!
 * FreeTube library: Watch later, Liked videos and your own playlists, how far you got in
 * each video, and backup files. It all lives in this browser's localStorage, so anything
 * read back is treated as untrusted and cleaned first.
 * Pure functions, no DOM. In the browser it's exposed as `window.FreeTubeLibrary` (load
 * youtube.js first); in Node it's `module.exports` (for the tests).
 */
(function (root, factory) {
  'use strict';
  const YT = root && root.FreeTubeYT ? root.FreeTubeYT : typeof require === 'function' ? require('./youtube.js') : null;
  if (!YT) throw new Error('library.js needs youtube.js to be loaded first');
  const api = factory(YT);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FreeTubeLibrary = api;
})(typeof self !== 'undefined' ? self : this, function (YT) {
  'use strict';

  const WATCH_LATER = 'WL';
  const LIKED = 'LL';
  const BUILT_IN = [
    { id: WATCH_LATER, name: 'Watch later' },
    { id: LIKED, name: 'Liked videos' },
  ];
  const PLAYLIST_ID = /^tv[a-z0-9]{10}$/;
  const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
  const MAX_PLAYLISTS = 50; // of your own, on top of Watch later and Liked videos
  const MAX_ITEMS = 500;
  const MAX_NAME = 150;
  const MAX_PROGRESS = 300;
  const BACKUP_APP = 'FreeTube';
  const OLD_BACKUP_APPS = ['TubeVault']; // backups made before the rename still import
  const BACKUP_VERSION = 1;

  const isBuiltIn = (id) => id === WATCH_LATER || id === LIKED;
  const toTime = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  };

  /* ------------------------------ playlists ------------------------------ */

  function emptyPlaylist(id, name, now) {
    return { id, name, created: now, updated: now, items: [] };
  }

  /** Saved videos are just videos: no start time, and no playlist they happened to be in. */
  function forLibrary(entry) {
    const item = Object.assign({}, entry, { start: 0 });
    if (item.id) {
      item.list = null;
      delete item.thumb;
      delete item.count;
    }
    return item;
  }

  /**
   * Cleans the library read from storage. Watch later and Liked videos always exist and come
   * first; your own playlists follow in the order you made them.
   */
  function sanitizeLibrary(raw, now = Date.now()) {
    const source = raw && typeof raw === 'object' && Array.isArray(raw.playlists) ? raw.playlists : [];
    const found = new Map();
    let custom = 0;
    for (const playlist of source) {
      if (!playlist || typeof playlist !== 'object') continue;
      const builtIn = BUILT_IN.find((item) => item.id === playlist.id);
      if (!builtIn && !(typeof playlist.id === 'string' && PLAYLIST_ID.test(playlist.id))) continue;
      if (found.has(playlist.id) || (!builtIn && custom >= MAX_PLAYLISTS)) continue;
      const name = builtIn ? builtIn.name : YT.cleanText(playlist.name, MAX_NAME);
      if (!name) continue;
      if (!builtIn) custom += 1;
      const created = toTime(playlist.created) || now;
      found.set(playlist.id, {
        id: playlist.id,
        name,
        created,
        updated: toTime(playlist.updated) || created,
        items: YT.sanitizeHistory(playlist.items, MAX_ITEMS, now).map(forLibrary),
      });
    }
    const playlists = BUILT_IN.map((item) => found.get(item.id) || emptyPlaylist(item.id, item.name, now));
    found.forEach((playlist, id) => {
      if (!isBuiltIn(id)) playlists.push(playlist);
    });
    return { playlists };
  }

  function getPlaylist(library, id) {
    return library.playlists.find((playlist) => playlist.id === id) || null;
  }

  function customPlaylists(library) {
    return library.playlists.filter((playlist) => !isBuiltIn(playlist.id));
  }

  function indexIn(playlist, video) {
    const key = YT.historyKey(video);
    return playlist.items.findIndex((item) => YT.historyKey(item) === key);
  }

  function has(library, playlistId, video) {
    const playlist = getPlaylist(library, playlistId);
    return Boolean(playlist) && indexIn(playlist, video) !== -1;
  }

  /** Puts a video (or a YouTube playlist) at the top of one of your playlists. */
  function addItem(library, playlistId, video, now = Date.now()) {
    const playlist = getPlaylist(library, playlistId);
    if (!playlist || playlist.items.length >= MAX_ITEMS) return false;
    const entry = YT.sanitizeEntry(video, now);
    if (!entry || indexIn(playlist, entry) !== -1) return false;
    entry.at = now; // when it was saved
    playlist.items.unshift(forLibrary(entry));
    playlist.updated = now;
    return true;
  }

  /** Takes a video out of a playlist. Returns what restoreItem needs to undo it, or null. */
  function removeItem(library, playlistId, video, now = Date.now()) {
    const playlist = getPlaylist(library, playlistId);
    const index = playlist ? indexIn(playlist, video) : -1;
    if (index === -1) return null;
    const item = playlist.items.splice(index, 1)[0];
    playlist.updated = now;
    return { playlistId, item, index };
  }

  function restoreItem(library, removed, now = Date.now()) {
    const playlist = removed ? getPlaylist(library, removed.playlistId) : null;
    if (!playlist || playlist.items.length >= MAX_ITEMS || indexIn(playlist, removed.item) !== -1) return false;
    playlist.items.splice(Math.min(removed.index, playlist.items.length), 0, removed.item);
    playlist.updated = now;
    return true;
  }

  function moveItem(library, playlistId, video, toIndex, now = Date.now()) {
    const playlist = getPlaylist(library, playlistId);
    const from = playlist ? indexIn(playlist, video) : -1;
    if (from === -1) return false;
    const to = Math.max(0, Math.min(playlist.items.length - 1, Math.floor(toIndex)));
    if (to === from) return false;
    playlist.items.splice(to, 0, playlist.items.splice(from, 1)[0]);
    playlist.updated = now;
    return true;
  }

  function createPlaylist(library, name, now = Date.now(), random = Math.random) {
    const clean = YT.cleanText(name, MAX_NAME);
    if (!clean || customPlaylists(library).length >= MAX_PLAYLISTS) return null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let id = 'tv';
      for (let i = 0; i < 10; i += 1) id += ID_CHARS[Math.floor(random() * ID_CHARS.length) % ID_CHARS.length];
      if (getPlaylist(library, id)) continue;
      const playlist = emptyPlaylist(id, clean, now);
      library.playlists.push(playlist);
      return playlist;
    }
    return null;
  }

  function renamePlaylist(library, id, name, now = Date.now()) {
    const playlist = isBuiltIn(id) ? null : getPlaylist(library, id);
    const clean = YT.cleanText(name, MAX_NAME);
    if (!playlist || !clean || clean === playlist.name) return false;
    playlist.name = clean;
    playlist.updated = now;
    return true;
  }

  /** Deletes one of your playlists (never Watch later or Liked videos). Returns undo info or null. */
  function deletePlaylist(library, id) {
    if (isBuiltIn(id)) return null;
    const index = library.playlists.findIndex((playlist) => playlist.id === id);
    if (index === -1) return null;
    return { playlist: library.playlists.splice(index, 1)[0], index };
  }

  function restorePlaylist(library, removed) {
    if (!removed || getPlaylist(library, removed.playlist.id) || customPlaylists(library).length >= MAX_PLAYLISTS) return false;
    library.playlists.splice(Math.min(removed.index, library.playlists.length), 0, removed.playlist);
    return true;
  }

  /**
   * Copies what the player said about a video onto a saved entry. For a YouTube playlist the
   * player only describes the video it's on, so the first video seen names it and gives it a
   * thumbnail. Returns true if anything changed.
   */
  function applyDetails(entry, details) {
    if (!entry || !details) return false;
    const before = JSON.stringify(entry);
    if (entry.id) {
      if (details.title) entry.title = details.title;
      if (details.author) entry.author = details.author;
      if (details.live) {
        entry.live = true;
        delete entry.duration;
      } else if (details.duration) {
        entry.duration = details.duration;
      }
    } else {
      if (!entry.thumb && YT.isVideoId(details.thumb)) entry.thumb = details.thumb;
      if (!entry.title && details.title) entry.title = details.title;
      if (!entry.author && details.author) entry.author = details.author;
      if (details.count) entry.count = details.count;
    }
    return JSON.stringify(entry) !== before;
  }

  /** Updates every saved copy of a video. Returns true if anything changed. */
  function updateDetails(library, video, details) {
    let changed = false;
    for (const playlist of library.playlists) {
      const index = indexIn(playlist, video);
      if (index !== -1 && applyDetails(playlist.items[index], details)) changed = true;
    }
    return changed;
  }

  /** A saved copy of a video (with its title and so on), from whichever playlist has one. */
  function findDetails(library, video) {
    for (const playlist of library.playlists) {
      const index = indexIn(playlist, video);
      if (index !== -1) return playlist.items[index];
    }
    return null;
  }

  /* ------------------------------- progress ------------------------------ */

  /** Cleans "how far you got" data: { videoId: { t: seconds, d: duration, at: when } }. */
  function sanitizeProgress(raw, max = MAX_PROGRESS) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const rows = [];
    for (const id of Object.keys(raw)) {
      const value = raw[id];
      if (!YT.isVideoId(id) || !value || typeof value !== 'object') continue;
      const time = Number(value.t);
      if (!Number.isFinite(time) || time < 0 || time >= 1e7) continue;
      const row = { t: Math.floor(time), at: toTime(value.at) };
      const duration = toTime(value.d);
      if (duration && duration < 1e7) row.d = duration;
      rows.push([id, row]);
    }
    rows.sort((a, b) => b[1].at - a[1].at);
    const clean = {};
    rows.slice(0, max).forEach(([id, row]) => {
      clean[id] = row;
    });
    return clean;
  }

  function progressFor(progress, id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(progress, id) ? progress[id] : null;
  }

  /** Remembers how far you got in a video, keeping the most recent ones. True if it changed. */
  function recordProgress(progress, id, time, duration, now = Date.now(), max = MAX_PROGRESS) {
    if (!YT.isVideoId(id) || !Number.isFinite(time) || time < 0 || time >= 1e7) return false;
    const previous = progressFor(progress, id);
    const row = { t: Math.floor(time), at: now };
    const length = toTime(duration) || (previous && previous.d) || 0;
    if (length && length < 1e7) row.d = length;
    const changed = !previous || previous.t !== row.t || previous.d !== row.d;
    progress[id] = row;
    const ids = Object.keys(progress);
    if (ids.length > max) {
      ids
        .sort((a, b) => progress[b].at - progress[a].at)
        .slice(max)
        .forEach((old) => {
          delete progress[old];
        });
    }
    return changed;
  }

  /** Watched to the end, give or take the credits (the last 5%, or the last 10% / 10 seconds). */
  function isFinished(row) {
    return Boolean(row && row.d) && (row.t >= row.d * 0.95 || row.d - row.t <= Math.min(10, row.d * 0.1));
  }

  /** Where to pick a video up again: where you left off, unless you'd barely started or had finished. */
  function resumeTime(row) {
    if (!row || row.t < 5 || isFinished(row)) return 0;
    return row.t;
  }

  /** How much of the red bar under a thumbnail to fill, from 0 to 1. */
  function watchedFraction(row) {
    if (!row || !row.d || row.t <= 0) return 0;
    if (isFinished(row)) return 1;
    return Math.min(1, row.t / row.d);
  }

  /* -------------------------------- backups ------------------------------ */

  function makeBackup(state, now = Date.now()) {
    return {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: new Date(now).toISOString(),
      library: state.library,
      history: state.history,
      progress: state.progress,
    };
  }

  /** Reads a backup file. Returns { ok: true, library, history, progress } or { ok: false, error }. */
  function readBackup(input, options = {}) {
    const now = options.now || Date.now();
    let data = input;
    if (typeof data === 'string') {
      if (data.length > 5000000) return { ok: false, error: 'too-big' };
      try {
        data = JSON.parse(data);
      } catch (error) {
        return { ok: false, error: 'not-json' };
      }
    }
    if (!data || typeof data !== 'object' || (data.app !== BACKUP_APP && !OLD_BACKUP_APPS.includes(data.app))) {
      return { ok: false, error: 'not-backup' };
    }
    if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) return { ok: false, error: 'newer' };
    return {
      ok: true,
      library: sanitizeLibrary(data.library, now),
      history: YT.sanitizeHistory(data.history, options.maxHistory || 24, now),
      progress: sanitizeProgress(data.progress),
    };
  }

  /**
   * Adds a backup to what's already here without losing anything: playlists are matched by ID
   * and their videos combined, history is combined newest first, and for progress the more
   * recent of the two wins. Returns how many playlists and videos were added.
   */
  function mergeBackup(state, backup, options = {}) {
    const maxHistory = options.maxHistory || 24;
    let playlists = 0;
    let videos = 0;
    for (const incoming of backup.library.playlists) {
      let target = getPlaylist(state.library, incoming.id);
      if (!target) {
        if (customPlaylists(state.library).length >= MAX_PLAYLISTS) continue;
        target = { id: incoming.id, name: incoming.name, created: incoming.created, updated: incoming.updated, items: [] };
        state.library.playlists.push(target);
        playlists += 1;
      }
      for (const item of incoming.items) {
        if (target.items.length >= MAX_ITEMS) break;
        if (indexIn(target, item) !== -1) continue;
        target.items.push(item);
        videos += 1;
      }
    }
    const keys = new Set(state.history.map(YT.historyKey));
    state.history = state.history
      .concat(backup.history.filter((item) => !keys.has(YT.historyKey(item))))
      .sort((a, b) => b.at - a.at)
      .slice(0, maxHistory);
    Object.keys(backup.progress).forEach((id) => {
      const mine = progressFor(state.progress, id);
      const theirs = backup.progress[id];
      if (!mine || theirs.at > mine.at) state.progress[id] = theirs;
    });
    state.progress = sanitizeProgress(state.progress);
    return { playlists, videos };
  }

  return {
    WATCH_LATER,
    LIKED,
    MAX_ITEMS,
    MAX_NAME,
    MAX_PLAYLISTS,
    isBuiltIn,
    sanitizeLibrary,
    getPlaylist,
    customPlaylists,
    has,
    addItem,
    removeItem,
    restoreItem,
    moveItem,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    restorePlaylist,
    applyDetails,
    updateDetails,
    findDetails,
    sanitizeProgress,
    progressFor,
    recordProgress,
    isFinished,
    resumeTime,
    watchedFraction,
    makeBackup,
    readBackup,
    mergeBackup,
  };
});
