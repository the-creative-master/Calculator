/*!
 * TubeVault: YouTube link parsing and embed URLs. Pure functions, no DOM.
 * In the browser it's exposed as `window.TubeVaultYT`; in Node it's `module.exports` (for the tests).
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

  /** The URL that goes in the <iframe>. Private mode uses youtube-nocookie.com (YouTube's privacy-enhanced embed). */
  function embedUrl(video, options = {}) {
    const origin = options.privacy === false ? 'https://www.youtube.com' : 'https://www.youtube-nocookie.com';
    const path = video.id ? '/embed/' + video.id : '/embed/videoseries';
    const query = new URLSearchParams();
    if (video.list) query.set('list', video.list);
    if (video.start) query.set('start', String(video.start));
    if (options.autoplay) query.set('autoplay', '1');
    query.set('rel', '0');
    query.set('playsinline', '1');
    return `${origin}${path}?${query}`;
  }

  /** A normal youtube.com link to the same video, for "Open on YouTube" and "Copy link". */
  function watchUrl(video) {
    if (!video.id) return 'https://www.youtube.com/playlist?list=' + encodeURIComponent(video.list);
    const query = new URLSearchParams({ v: video.id });
    if (video.list) query.set('list', video.list);
    if (video.start) query.set('t', video.start + 's');
    return 'https://www.youtube.com/watch?' + query;
  }

  function thumbnailUrl(id) {
    return 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/mqdefault.jpg';
  }

  return { parse, parseTime, formatTime, embedUrl, watchUrl, thumbnailUrl, isVideoId, isListId };
});
