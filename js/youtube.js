/*!
 * TubeVault: YouTube link parsing, embed URLs, player messages and saved-entry cleaning.
 * Pure functions, no DOM. In the browser it's exposed as `window.TubeVaultYT`; in Node it's
 * `module.exports` (for the tests).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TubeVaultYT = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/;
  const HOST = /^(?:[a-z0-9-]+\.)*(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;
  /** Finds a YouTube URL in other text, like a chat message or a pasted <iframe> snippet. */
  const URL_IN_TEXT = /(?:^|[^a-z0-9.-])((?:https?:)?(?:\/\/)?(?:[a-z0-9-]+\.)*(?:youtube(?:-nocookie)?\.com|youtu\.be)\/[^\s"'<>]*)/i;
  const ID_PATHS = ['embed', 'v', 'e', 'vi', 'shorts', 'live'];
  const CHANNEL_PATHS = ['channel', 'c', 'user'];

  const isVideoId = (value) => typeof value === 'string' && VIDEO_ID.test(value);
  const isListId = (value) => typeof value === 'string' && LIST_ID.test(value);

  /** "90", "90s", "1m30s", "1h2m3s", "1:30" or "1:02:03" → seconds. Anything else → 0. */
  function parseTime(value) {
    if (value === null || value === undefined) return 0;
    const v = String(value).trim().toLowerCase();
    if (!v) return 0;
    if (/^\d+$/.test(v)) return Number.parseInt(v, 10);
    const units = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (units && (units[1] || units[2] || units[3])) {
      return (Number(units[1]) || 0) * 3600 + (Number(units[2]) || 0) * 60 + (Number(units[3]) || 0);
    }
    const clock = v.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (clock) return (Number(clock[1]) || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    return 0;
  }

  /** 95 → "1:35", 3725 → "1:02:05" */
  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  const fail = (error) => ({ ok: false, error });

  /**
   * Turns pasted text into a playable video.
   *   → { ok: true, video: { id, list, start, short } }
   *   → { ok: false, error: 'empty' | 'invalid' | 'not-youtube' | 'channel' | 'no-video' }
   */
  function parse(input, depth = 0) {
    const text = String(input === null || input === undefined ? '' : input).trim();
    if (!text) return fail('empty');
    if (isVideoId(text)) return { ok: true, video: { id: text, list: null, start: 0, short: false } };

    const found = text.match(URL_IN_TEXT);
    let candidate = found ? found[1].replace(/[.,!?;:)\]}]+$/, '') : text;
    if (/\s/.test(candidate)) return fail('invalid');
    if (candidate.startsWith('//')) candidate = 'https:' + candidate;
    else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = 'https://' + candidate;

    let url;
    try {
      url = new URL(candidate);
    } catch (error) {
      return fail('invalid');
    }
    if (!/^https?:$/.test(url.protocol)) return fail('not-youtube');
    const host = url.hostname.match(HOST);
    if (!host) return fail('not-youtube');

    const params = url.searchParams;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const segments = url.pathname.split('/').filter(Boolean);
    const first = (segments[0] || '').toLowerCase();
    let id = null;
    let short = false;

    if (host[1].toLowerCase() === 'youtu.be') {
      id = segments[0] || null;
    } else if (first === 'watch' || first === '') {
      id = params.get('v') || segments[1] || null;
    } else if (ID_PATHS.includes(first)) {
      id = segments[1] || null;
      if (id === 'videoseries') id = null;
      short = first === 'shorts';
    } else if (first === 'attribution_link' && params.get('u') && depth < 2) {
      const inner = params.get('u');
      return parse('https://www.youtube.com' + (inner.startsWith('/') ? inner : '/' + inner), depth + 1);
    } else if (first.startsWith('@') || CHANNEL_PATHS.includes(first)) {
      return fail('channel');
    }

    if (id !== null && !isVideoId(id)) return fail('no-video');
    const list = isListId(params.get('list')) ? params.get('list') : null;
    if (!id && !list) return fail('no-video');

    const start = parseTime(params.get('t') || params.get('start') || params.get('time_continue') || hash.get('t') || hash.get('start'));
    return { ok: true, video: { id, list, start, short } };
  }

  /** Where the player lives. Private mode uses youtube-nocookie.com (YouTube's privacy-enhanced embed). */
  function embedOrigin(privacy) {
    return privacy === false ? 'https://www.youtube.com' : 'https://www.youtube-nocookie.com';
  }

  /**
   * The URL that goes in the <iframe>.
   * options: { privacy, autoplay, origin (this page's origin), widgetId (a number for this player) }
   * enablejsapi=1 lets the player report the title, channel and duration back (see readPlayerMessage).
   */
  function embedUrl(video, options = {}) {
    const path = video.id ? '/embed/' + video.id : '/embed/videoseries';
    const query = new URLSearchParams();
    if (video.list) query.set('list', video.list);
    if (video.start) query.set('start', String(video.start));
    if (options.autoplay) query.set('autoplay', '1');
    query.set('rel', '0');
    query.set('playsinline', '1');
    query.set('enablejsapi', '1');
    if (typeof options.origin === 'string' && /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(options.origin)) {
      query.set('origin', options.origin);
    }
    if (Number.isInteger(options.widgetId) && options.widgetId > 0) query.set('widgetid', String(options.widgetId));
    return `${embedOrigin(options.privacy)}${path}?${query}`;
  }

  /** A normal youtube.com link to the same video, for "Open in YouTube" and "Share". */
  function watchUrl(video) {
    if (!video.id) return 'https://www.youtube.com/playlist?list=' + encodeURIComponent(video.list);
    const query = new URLSearchParams({ v: video.id });
    if (video.list) query.set('list', video.list);
    if (video.start) query.set('t', video.start + 's');
    return 'https://www.youtube.com/watch?' + query;
  }

  const THUMBNAIL_QUALITIES = ['hq720', 'hqdefault', 'mqdefault'];

  /**
   * hq720 is a sharp 16:9 image (most videos have one). hqdefault always exists but is 4:3 with
   * black bars top and bottom, so it's shown cropped.
   */
  function thumbnailUrl(id, quality = 'hqdefault') {
    const name = THUMBNAIL_QUALITIES.includes(quality) ? quality : 'hqdefault';
    return 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/' + name + '.jpg';
  }

  /** Text from outside (the player, localStorage): no control characters, tidy spaces, limited length. */
  function cleanText(value, max = 200) {
    if (typeof value !== 'string') return '';
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  /**
   * Reads a message posted by the embedded player. It only talks once the URL has enablejsapi=1 and
   * the page has sent it {"event":"listening"}. Returns null for anything that isn't a player message.
   *   → { event, videoId?, title?, author?, duration?, live?, currentTime?, playlistCount?, error? }
   */
  function readPlayerMessage(data) {
    let message = data;
    if (typeof message === 'string') {
      if (message.length > 1000000 || message.charAt(0) !== '{') return null;
      try {
        message = JSON.parse(message);
      } catch (error) {
        return null;
      }
    }
    if (!message || typeof message !== 'object' || typeof message.event !== 'string') return null;

    const result = { event: message.event };
    if (message.event === 'onError') {
      const code = Number(message.info);
      if (Number.isInteger(code)) result.error = code;
      return result;
    }
    if (message.event === 'onStateChange') {
      if (isPlayerState(message.info)) result.state = message.info;
      return result;
    }

    const info = message.info && typeof message.info === 'object' ? message.info : null;
    if (!info) return result;
    const videoData = info.videoData && typeof info.videoData === 'object' ? info.videoData : null;
    if (videoData) {
      if (isVideoId(videoData.video_id)) result.videoId = videoData.video_id;
      const title = cleanText(videoData.title, 200);
      if (title) result.title = title;
      const author = cleanText(videoData.author, 100);
      if (author) result.author = author;
      if (videoData.isLive === true) result.live = true;
    }
    if (typeof info.duration === 'number' && info.duration >= 1 && info.duration < 1e7) {
      result.duration = Math.round(info.duration);
    }
    if (typeof info.currentTime === 'number' && info.currentTime >= 0 && info.currentTime < 1e7) {
      result.currentTime = info.currentTime;
    }
    if (Array.isArray(info.playlist) && info.playlist.length) result.playlistCount = info.playlist.length;
    if (Number.isInteger(info.playlistIndex) && info.playlistIndex >= 0 && info.playlistIndex < 100000) {
      result.playlistIndex = info.playlistIndex;
    }
    // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (isPlayerState(info.playerState)) result.state = info.playerState;
    return result;
  }

  function isPlayerState(value) {
    return Number.isInteger(value) && value >= -1 && value <= 5;
  }

  /** YouTube-style relative time: "just now", "5 minutes ago", "1 day ago", "3 weeks ago"… */
  function timeAgo(then, now = Date.now()) {
    const seconds = Math.max(0, Math.floor((now - then) / 1000));
    const units = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
    ];
    for (const [unit, size] of units) {
      const count = Math.floor(seconds / size);
      if (count >= 1) return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
    }
    return 'just now';
  }

  /** One history entry per video (or per playlist, for playlist-only links). */
  function historyKey(item) {
    return item.id ? 'v:' + item.id : 'l:' + item.list;
  }

  const toCount = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0);

  /**
   * Cleans one saved video or playlist (a watch-history or library entry) read from
   * localStorage, which anything could have written to. Keeps only valid IDs and known
   * fields. Returns null if there's nothing playable in it.
   */
  function sanitizeEntry(item, now = Date.now()) {
    if (!item || typeof item !== 'object') return null;
    const id = isVideoId(item.id) ? item.id : null;
    const listId = isListId(item.list) ? item.list : null;
    if (!id && !listId) return null;
    const entry = {
      id,
      list: listId,
      start: toCount(item.start),
      short: item.short === true,
      at: toCount(item.at) || now,
    };
    const title = cleanText(item.title, 200);
    if (title) entry.title = title;
    const author = cleanText(item.author, 100);
    if (author) entry.author = author;
    if (item.live === true) entry.live = true;
    else if (toCount(item.duration) && toCount(item.duration) < 1e7) entry.duration = toCount(item.duration);
    if (!id && isVideoId(item.thumb)) entry.thumb = item.thumb;
    if (toCount(item.count) && toCount(item.count) < 100000) entry.count = toCount(item.count);
    return entry;
  }

  /** Cleans a list of entries: drops broken ones and duplicates, and caps the length. */
  function sanitizeHistory(list, max = 24, now = Date.now()) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const clean = [];
    for (const item of list) {
      if (clean.length >= max) break;
      const entry = sanitizeEntry(item, now);
      if (!entry) continue;
      const key = historyKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push(entry);
    }
    return clean;
  }

  return {
    parse,
    parseTime,
    formatTime,
    embedOrigin,
    embedUrl,
    watchUrl,
    thumbnailUrl,
    cleanText,
    readPlayerMessage,
    timeAgo,
    historyKey,
    sanitizeEntry,
    sanitizeHistory,
    isVideoId,
    isListId,
  };
});
