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
    `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0&playsinline=1`,
  );
  assert.equal(
    YT.embedUrl({ id: ID, list: null, start: 0 }, { privacy: false }),
    `https://www.youtube.com/embed/${ID}?rel=0&playsinline=1`,
  );
  assert.equal(
    YT.embedUrl({ id: ID, list: LIST, start: 90 }, { autoplay: true }),
    `https://www.youtube-nocookie.com/embed/${ID}?list=${LIST}&start=90&autoplay=1&rel=0&playsinline=1`,
  );
  assert.equal(
    YT.embedUrl({ id: null, list: LIST, start: 0 }, {}),
    `https://www.youtube-nocookie.com/embed/videoseries?list=${LIST}&rel=0&playsinline=1`,
  );
});

test('builds watch URLs and thumbnails', () => {
  assert.equal(YT.watchUrl({ id: ID, list: null, start: 0 }), `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(YT.watchUrl({ id: ID, list: LIST, start: 30 }), `https://www.youtube.com/watch?v=${ID}&list=${LIST}&t=30s`);
  assert.equal(YT.watchUrl({ id: null, list: LIST, start: 0 }), `https://www.youtube.com/playlist?list=${LIST}`);
  assert.equal(YT.thumbnailUrl(ID), `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
});
