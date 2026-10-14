'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const YT = require('../js/youtube.js');

const ID = 'dQw4w9WgXcQ';
const LIST = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';

function video(input) {
  const result = YT.parse(input);
  assert.equal(result.ok, true, `expected "${input}" to parse, got ${JSON.stringify(result)}`);
  return result.video;
}

function error(input) {
  const result = YT.parse(input);
  assert.equal(result.ok, false, `expected "${input}" to be rejected`);
  return result.error;
}

test('understands the usual link formats', () => {
  const links = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&feature=share`,
    `http://m.youtube.com/watch?app=desktop&v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=AbCdEfGh123`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}?rel=0`,
    `https://www.youtube.com/v/${ID}`,
    `https://www.youtube.com/live/${ID}?si=xyz`,
    `https://www.youtube.com/watch/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
    `//www.youtube.com/embed/${ID}`,
    `  https://youtu.be/${ID}  `,
    ID,
  ];
  for (const link of links) assert.equal(video(link).id, ID, link);
});

test('detects Shorts', () => {
  const v = video(`https://www.youtube.com/shorts/${ID}?feature=share`);
  assert.equal(v.id, ID);
  assert.equal(v.short, true);
  assert.equal(video(`https://youtu.be/${ID}`).short, false);
});

test('reads timestamps', () => {
  assert.equal(video(`https://youtu.be/${ID}?t=90`).start, 90);
  assert.equal(video(`https://youtu.be/${ID}?t=90s`).start, 90);
  assert.equal(video(`https://www.youtube.com/watch?v=${ID}&t=1m30s`).start, 90);
  assert.equal(video(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`).start, 3723);
  assert.equal(video(`https://www.youtube.com/embed/${ID}?start=42`).start, 42);
  assert.equal(video(`https://www.youtube.com/watch?v=${ID}#t=15`).start, 15);
  assert.equal(video(`https://youtu.be/${ID}`).start, 0);
});

test('parseTime and formatTime', () => {
  assert.equal(YT.parseTime('2:05'), 125);
  assert.equal(YT.parseTime('1:02:03'), 3723);
  assert.equal(YT.parseTime('nonsense'), 0);
  assert.equal(YT.parseTime(null), 0);
  assert.equal(YT.formatTime(95), '1:35');
  assert.equal(YT.formatTime(3725), '1:02:05');
});

test('handles playlists', () => {
  const both = video(`https://www.youtube.com/watch?v=${ID}&list=${LIST}&index=2`);
  assert.equal(both.id, ID);
  assert.equal(both.list, LIST);

  const listOnly = video(`https://www.youtube.com/playlist?list=${LIST}`);
  assert.equal(listOnly.id, null);
  assert.equal(listOnly.list, LIST);

  assert.equal(video(`https://www.youtube.com/embed/videoseries?list=${LIST}`).list, LIST);
});

test('finds a link inside other text or embed code', () => {
  assert.equal(video(`omg watch this https://youtu.be/${ID} lol`).id, ID);
  assert.equal(video(`Check this: youtu.be/${ID}!`).id, ID);
  assert.equal(video(`(https://www.youtube.com/watch?v=${ID})`).id, ID);
  assert.equal(
    video(`<iframe width="560" height="315" src="https://www.youtube.com/embed/${ID}?si=abc" title="YouTube video player"></iframe>`).id,
    ID,
  );
});

test('follows attribution links', () => {
  const v = video(`https://www.youtube.com/attribution_link?a=abc&u=%2Fwatch%3Fv%3D${ID}%26feature%3Dshare`);
  assert.equal(v.id, ID);
});

test('rejects things that are not YouTube videos', () => {
  assert.equal(error(''), 'empty');
  assert.equal(error('   '), 'empty');
  assert.equal(error('hello world'), 'invalid');
  assert.equal(error('https://vimeo.com/123456'), 'not-youtube');
  assert.equal(error(`https://notyoutube.com/watch?v=${ID}`), 'not-youtube');
  assert.equal(error(`https://youtube.com.evil.example/watch?v=${ID}`), 'not-youtube');
  assert.ok(['invalid', 'not-youtube'].includes(error('javascript:alert(1)')));
  assert.ok(['invalid', 'not-youtube'].includes(error('ftp://youtube.com.example/x')));
  assert.equal(error('https://www.youtube.com/@SomeChannel'), 'channel');
  assert.equal(error('https://www.youtube.com/channel/UC38IQsAvIsxxjztdMZQtwHA'), 'channel');
  assert.equal(error('https://www.youtube.com/'), 'no-video');
  assert.equal(error('https://www.youtube.com/results?search_query=cats'), 'no-video');
  assert.equal(error('https://youtu.be/tooshort'), 'no-video');
  assert.equal(error('https://www.youtube.com/watch?v=<script>'), 'no-video');
});

test('only ever embeds from YouTube itself, whatever gets pasted', () => {
  const sneaky = [
    `javascript:alert(1)//youtube.com/watch?v=${ID}`,
    `https://evil.example/?next=https://youtu.be/${ID}`,
    `data:text/html,<a href="https://youtu.be/${ID}">`,
  ];
  for (const input of sneaky) {
    const result = YT.parse(input);
    if (!result.ok) continue;
    assert.equal(result.video.id, ID);
    assert.match(YT.embedUrl(result.video), /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
    assert.match(YT.embedUrl(result.video, { privacy: false }), /^https:\/\/www\.youtube\.com\/embed\//);
  }
});

test('builds embed URLs', () => {
  assert.equal(
    YT.embedUrl({ id: ID, list: null, start: 0 }, { autoplay: true }),
    `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0&playsinline=1&enablejsapi=1`,
  );
  assert.equal(
    YT.embedUrl({ id: ID, list: null, start: 0 }, { privacy: false }),
    `https://www.youtube.com/embed/${ID}?rel=0&playsinline=1&enablejsapi=1`,
  );
  assert.equal(
    YT.embedUrl({ id: ID, list: LIST, start: 90 }, { autoplay: true }),
    `https://www.youtube-nocookie.com/embed/${ID}?list=${LIST}&start=90&autoplay=1&rel=0&playsinline=1&enablejsapi=1`,
  );
  assert.equal(
    YT.embedUrl({ id: null, list: LIST, start: 0 }, {}),
    `https://www.youtube-nocookie.com/embed/videoseries?list=${LIST}&rel=0&playsinline=1&enablejsapi=1`,
  );
});

test('tells the player who is listening, but only with a real web origin', () => {
  const url = new URL(YT.embedUrl({ id: ID, list: null, start: 0 }, { origin: 'https://me.github.io', widgetId: 4 }));
  assert.equal(url.searchParams.get('origin'), 'https://me.github.io');
  assert.equal(url.searchParams.get('widgetid'), '4');
  assert.equal(new URL(YT.embedUrl({ id: ID }, { origin: 'http://localhost:8080' })).searchParams.get('origin'), 'http://localhost:8080');
  for (const origin of ['null', 'file://', 'javascript:alert(1)', 'https://a.b/path', '', undefined]) {
    assert.equal(new URL(YT.embedUrl({ id: ID }, { origin })).searchParams.has('origin'), false, String(origin));
  }
  assert.equal(new URL(YT.embedUrl({ id: ID }, { widgetId: -1 })).searchParams.has('widgetid'), false);
  assert.equal(YT.embedOrigin(true), 'https://www.youtube-nocookie.com');
  assert.equal(YT.embedOrigin(undefined), 'https://www.youtube-nocookie.com');
  assert.equal(YT.embedOrigin(false), 'https://www.youtube.com');
});

test('builds watch URLs and thumbnails', () => {
  assert.equal(YT.watchUrl({ id: ID, list: null, start: 0 }), `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(YT.watchUrl({ id: ID, list: LIST, start: 30 }), `https://www.youtube.com/watch?v=${ID}&list=${LIST}&t=30s`);
  assert.equal(YT.watchUrl({ id: null, list: LIST, start: 0 }), `https://www.youtube.com/playlist?list=${LIST}`);
  assert.equal(YT.thumbnailUrl(ID), `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  assert.equal(YT.thumbnailUrl(ID, 'hq720'), `https://i.ytimg.com/vi/${ID}/hq720.jpg`);
  assert.equal(YT.thumbnailUrl(ID, '../../evil'), `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
});

// Shaped like a real "initialDelivery" message from the embedded player (trimmed).
const INITIAL_DELIVERY = JSON.stringify({
  event: 'initialDelivery',
  info: {
    apiInterface: ['playVideo', 'pauseVideo', 'getVideoData'],
    playlist: null,
    playlistIndex: -1,
    playerState: 5,
    currentTime: 0,
    duration: 1344,
    videoUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    videoData: {
      video_id: 'M7lc1UVf-VE',
      author: '',
      title: 'YouTube Developers Live: Embedded Web Player Customization',
      isPlayable: true,
      errorCode: null,
      isLive: false,
    },
  },
  id: 1,
  channel: 'widget',
});

test('reads the title, channel and duration the player reports', () => {
  assert.deepEqual(YT.readPlayerMessage(INITIAL_DELIVERY), {
    event: 'initialDelivery',
    videoId: 'M7lc1UVf-VE',
    title: 'YouTube Developers Live: Embedded Web Player Customization',
    duration: 1344,
    currentTime: 0,
    state: 5, // cued
  });
  // The channel name often arrives a moment later.
  const later = { event: 'infoDelivery', info: { videoData: { video_id: 'M7lc1UVf-VE', author: 'Google for Developers', title: 'x' } } };
  assert.equal(YT.readPlayerMessage(JSON.stringify(later)).author, 'Google for Developers');
  // Objects work too (some browsers deliver them as-is).
  assert.equal(YT.readPlayerMessage(later).videoId, 'M7lc1UVf-VE');
  // Progress updates carry no details.
  assert.deepEqual(YT.readPlayerMessage('{"event":"infoDelivery","info":{"currentTime":8.08,"videoLoadedFraction":0.03}}'), {
    event: 'infoDelivery',
    currentTime: 8.08,
  });
  const playlist = { event: 'infoDelivery', info: { playlist: [ID, 'M7lc1UVf-VE', 'aqz-KE-bpKQ'], videoData: { video_id: ID, isLive: true } } };
  assert.deepEqual(YT.readPlayerMessage(playlist), { event: 'infoDelivery', videoId: ID, live: true, playlistCount: 3 });
});

test('reads player state changes, so playlists can move on when a video ends', () => {
  assert.deepEqual(YT.readPlayerMessage('{"event":"infoDelivery","info":{"playerState":0,"currentTime":213}}'), {
    event: 'infoDelivery',
    currentTime: 213,
    state: 0,
  });
  assert.deepEqual(YT.readPlayerMessage({ event: 'onStateChange', info: 1 }), { event: 'onStateChange', state: 1 });
  assert.deepEqual(YT.readPlayerMessage({ event: 'infoDelivery', info: { playlistIndex: 2 } }), { event: 'infoDelivery', playlistIndex: 2 });
  for (const junk of [9, -2, 1.5, '1', null]) {
    assert.equal(YT.readPlayerMessage({ event: 'onStateChange', info: junk }).state, undefined, String(junk));
    assert.equal(YT.readPlayerMessage({ event: 'infoDelivery', info: { playerState: junk, playlistIndex: junk } }).state, undefined);
  }
  assert.equal(YT.readPlayerMessage({ event: 'infoDelivery', info: { playlistIndex: -1 } }).playlistIndex, undefined);
});

test('reads player errors', () => {
  assert.deepEqual(YT.readPlayerMessage('{"event":"onError","info":150,"id":1,"channel":"widget"}'), { event: 'onError', error: 150 });
  assert.deepEqual(YT.readPlayerMessage({ event: 'onError', info: 'nope' }), { event: 'onError' });
});

test('ignores junk and keeps whatever the player sends harmless', () => {
  for (const junk of [null, undefined, 42, '', 'hello', '{not json', '[1,2]', '{"no":"event"}', { event: 5 }, '{'.repeat(10) + 'x'.repeat(1000001)]) {
    assert.equal(YT.readPlayerMessage(junk), null, String(junk).slice(0, 40));
  }
  const nasty = YT.readPlayerMessage({
    event: 'infoDelivery',
    info: {
      duration: -5,
      currentTime: 'soon',
      videoData: { video_id: '<img src=x>', title: '  Line\none\u0000\ttwo  ', author: 'A'.repeat(500) },
    },
  });
  assert.equal(nasty.videoId, undefined);
  assert.equal(nasty.title, 'Line one two');
  assert.equal(nasty.author.length, 100);
  assert.equal(nasty.duration, undefined);
  assert.equal(nasty.currentTime, undefined);
  assert.equal(YT.readPlayerMessage({ event: 'x', info: { videoData: { title: 123, author: {} } } }).title, undefined);
});

test('formats times the way YouTube does', () => {
  const now = Date.UTC(2026, 9, 14, 12, 0, 0);
  const ago = (seconds) => YT.timeAgo(now - seconds * 1000, now);
  assert.equal(ago(5), 'just now');
  assert.equal(ago(-30), 'just now');
  assert.equal(ago(60), '1 minute ago');
  assert.equal(ago(59 * 60), '59 minutes ago');
  assert.equal(ago(3600), '1 hour ago');
  assert.equal(ago(5 * 3600), '5 hours ago');
  assert.equal(ago(86400), '1 day ago');
  assert.equal(ago(6 * 86400), '6 days ago');
  assert.equal(ago(7 * 86400), '1 week ago');
  assert.equal(ago(29 * 86400), '4 weeks ago');
  assert.equal(ago(30 * 86400), '1 month ago');
  assert.equal(ago(400 * 86400), '1 year ago');
  assert.equal(ago(800 * 86400), '2 years ago');
});

test('cleans watch history from storage', () => {
  const now = 1_790_000_000_000;
  const history = YT.sanitizeHistory(
    [
      { id: ID, list: null, start: '65', short: false, at: now - 1000, title: ' Never\nGonna ', author: 'Rick Astley', duration: 213 },
      { id: ID, title: 'duplicate, dropped' },
      { id: null, list: LIST, thumb: 'M7lc1UVf-VE', count: 25, at: now },
      { id: 'aqz-KE-bpKQ', short: true, live: true, duration: 99, thumb: 'M7lc1UVf-VE' },
      { id: '<script>', list: 'bad list!' },
      { id: 'M7lc1UVf-VE', short: 'yes', start: -4, duration: 'long', count: 1e9, title: 42 },
      'junk',
      null,
    ],
    24,
    now,
  );
  assert.deepEqual(history, [
    { id: ID, list: null, start: 65, short: false, at: now - 1000, title: 'Never Gonna', author: 'Rick Astley', duration: 213 },
    { id: null, list: LIST, start: 0, short: false, at: now, thumb: 'M7lc1UVf-VE', count: 25 },
    { id: 'aqz-KE-bpKQ', list: null, start: 0, short: true, at: now, live: true },
    { id: 'M7lc1UVf-VE', list: null, start: 0, short: false, at: now },
  ]);
  assert.deepEqual(YT.sanitizeHistory('nope'), []);
  assert.equal(YT.sanitizeHistory(Array.from({ length: 50 }, (_, i) => ({ list: 'PL' + i })), 24).length, 24);
  assert.equal(YT.historyKey({ id: ID, list: LIST }), `v:${ID}`);
  assert.equal(YT.sanitizeEntry({ list: '<bad>' }), null);
  assert.equal(YT.sanitizeEntry('nope'), null);
  assert.deepEqual(YT.sanitizeEntry({ id: ID, title: ' Hi ', extra: 'dropped' }, now), { id: ID, list: null, start: 0, short: false, at: now, title: 'Hi' });
  assert.equal(YT.historyKey({ id: null, list: LIST }), `l:${LIST}`);
});
