'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Library = require('../js/library.js');

const NOW = 1_790_000_000_000;
const A = 'dQw4w9WgXcQ';
const B = 'jNQXAC9IVRw';
const C = '9bZkp7q19f0';
const LIST = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';

const fresh = () => Library.sanitizeLibrary(null, NOW);
const ids = (playlist) => playlist.items.map((item) => item.id || item.list);
const fixedRandom = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('always has Watch later and Liked videos, first', () => {
  const library = fresh();
  assert.deepEqual(
    library.playlists.map((p) => [p.id, p.name, p.items.length]),
    [
      ['WL', 'Watch later', 0],
      ['LL', 'Liked videos', 0],
    ],
  );
  // Even when storage has them in another order, renamed, or missing.
  const messy = Library.sanitizeLibrary(
    {
      playlists: [
        { id: 'tvabcdefghij', name: '  Road\ntrip  ', created: NOW - 5, items: [{ id: A, start: 30, list: LIST, title: 'x' }, { id: A }, { id: 'bad' }] },
        { id: 'LL', name: 'Hacked name', items: 'nope' },
        { id: 'tvabcdefghij', name: 'duplicate id, dropped' },
        { id: 'PLnotours123', name: 'not one of our IDs' },
        { id: 'tv0000000000', name: '   ' },
        null,
        'junk',
      ],
    },
    NOW,
  );
  assert.deepEqual(
    messy.playlists.map((p) => [p.id, p.name]),
    [
      ['WL', 'Watch later'],
      ['LL', 'Liked videos'],
      ['tvabcdefghij', 'Road trip'],
    ],
  );
  const trip = messy.playlists[2];
  // Saved videos are just videos: no start time and no playlist they came from.
  assert.deepEqual(trip.items, [{ id: A, list: null, start: 0, short: false, at: NOW, title: 'x' }]);
  assert.equal(trip.created, NOW - 5);
  assert.equal(trip.updated, NOW - 5);
});

test('caps how many playlists and videos are kept', () => {
  const many = { playlists: Array.from({ length: 80 }, (_, i) => ({ id: 'tv' + String(i).padStart(10, '0'), name: `P${i}` })) };
  assert.equal(Library.customPlaylists(Library.sanitizeLibrary(many, NOW)).length, Library.MAX_PLAYLISTS);
  const library = fresh();
  for (let i = 0; i < Library.MAX_ITEMS; i += 1) library.playlists[0].items.push({ id: null, list: 'PL' + i, start: 0, short: false, at: NOW });
  assert.equal(Library.addItem(library, 'WL', { id: A }, NOW), false, 'a full playlist refuses more');
});

test('saves, finds, removes, restores and moves videos', () => {
  const library = fresh();
  assert.equal(Library.addItem(library, 'WL', { id: A, title: 'Never Gonna', start: 42 }, NOW), true);
  assert.equal(Library.addItem(library, 'WL', { id: A }, NOW), false, 'no duplicates');
  assert.equal(Library.addItem(library, 'WL', { id: '<nope>' }, NOW), false);
  assert.equal(Library.addItem(library, 'nope', { id: A }, NOW), false);
  Library.addItem(library, 'WL', { id: B }, NOW + 1);
  Library.addItem(library, 'WL', { list: LIST }, NOW + 2);
  const wl = Library.getPlaylist(library, 'WL');
  assert.deepEqual(ids(wl), [LIST, B, A], 'newest first');
  assert.equal(wl.items[2].start, 0);
  assert.equal(wl.updated, NOW + 2);
  assert.equal(Library.has(library, 'WL', { id: A, list: LIST }), true, 'matched by video ID');
  assert.equal(Library.has(library, 'LL', { id: A }), false);

  const removed = Library.removeItem(library, 'WL', { id: B }, NOW + 3);
  assert.deepEqual(ids(wl), [LIST, A]);
  assert.equal(Library.removeItem(library, 'WL', { id: B }), null);
  assert.equal(Library.restoreItem(library, removed), true);
  assert.deepEqual(ids(wl), [LIST, B, A], 'back where it was');
  assert.equal(Library.restoreItem(library, removed), false, 'only once');

  assert.equal(Library.moveItem(library, 'WL', { id: A }, 0), true);
  assert.deepEqual(ids(wl), [A, LIST, B]);
  assert.equal(Library.moveItem(library, 'WL', { id: A }, -5), false, 'already at the top');
  assert.equal(Library.moveItem(library, 'WL', { id: A }, 99), true);
  assert.deepEqual(ids(wl), [LIST, B, A]);
});

test('creates, renames and deletes your own playlists, but never the built-in ones', () => {
  const library = fresh();
  const random = fixedRandom([0.1, 0.5, 0.9]);
  const mix = Library.createPlaylist(library, '  Late\tnight mix ', NOW, random);
  assert.match(mix.id, /^tv[a-z0-9]{10}$/);
  assert.equal(mix.name, 'Late night mix');
  assert.equal(Library.createPlaylist(library, '   ', NOW), null);
  assert.equal(Library.createPlaylist(library, 'x'.repeat(400), NOW).name.length, Library.MAX_NAME);
  // An ID clash just picks another one.
  const again = Library.createPlaylist(library, 'Same random', NOW, fixedRandom([0.1, 0.5, 0.9]));
  assert.notEqual(again.id, mix.id);

  assert.equal(Library.renamePlaylist(library, mix.id, 'Chill', NOW + 1), true);
  assert.equal(Library.getPlaylist(library, mix.id).name, 'Chill');
  assert.equal(Library.renamePlaylist(library, mix.id, 'Chill'), false, 'same name');
  assert.equal(Library.renamePlaylist(library, 'WL', 'Mine now'), false);
  assert.equal(Library.deletePlaylist(library, 'LL'), null);

  const deleted = Library.deletePlaylist(library, mix.id);
  assert.equal(Library.getPlaylist(library, mix.id), null);
  assert.equal(Library.restorePlaylist(library, deleted), true);
  assert.equal(library.playlists[2].id, mix.id, 'restored in its old spot');
  assert.equal(Library.restorePlaylist(library, deleted), false);

  const full = fresh();
  for (let i = 0; i < Library.MAX_PLAYLISTS; i += 1) Library.createPlaylist(full, `P${i}`, NOW);
  assert.equal(Library.createPlaylist(full, 'One too many', NOW), null);
});

test('keeps saved copies up to date with what the player reports', () => {
  const library = fresh();
  Library.addItem(library, 'WL', { id: A }, NOW);
  Library.addItem(library, 'LL', { id: A }, NOW);
  Library.addItem(library, 'WL', { list: LIST }, NOW);
  assert.equal(Library.updateDetails(library, { id: A }, { title: 'Never Gonna Give You Up', author: 'Rick Astley', duration: 213 }), true);
  assert.equal(Library.updateDetails(library, { id: A }, { title: 'Never Gonna Give You Up' }), false, 'nothing new');
  assert.equal(Library.getPlaylist(library, 'LL').items[0].author, 'Rick Astley');
  assert.equal(Library.findDetails(library, { id: A }).duration, 213);
  assert.equal(Library.findDetails(library, { id: C }), null);
  // Going live drops the duration.
  Library.updateDetails(library, { id: A }, { live: true, duration: 50 });
  assert.equal(Library.findDetails(library, { id: A }).live, true);
  assert.equal(Library.findDetails(library, { id: A }).duration, undefined);
  // A YouTube playlist is named after the first video the player shows.
  Library.updateDetails(library, { list: LIST }, { thumb: B, title: 'First video', author: 'jawed', count: 12 });
  Library.updateDetails(library, { list: LIST }, { thumb: C, title: 'Second video', count: 13 });
  assert.deepEqual(Library.findDetails(library, { list: LIST }), { id: null, list: LIST, start: 0, short: false, at: NOW, thumb: B, title: 'First video', author: 'jawed', count: 13 });
});

test('remembers how far you got, and where to pick up again', () => {
  const progress = {};
  assert.equal(Library.recordProgress(progress, A, 61.7, 213, NOW), true);
  assert.deepEqual(Library.progressFor(progress, A), { t: 61, d: 213, at: NOW });
  assert.equal(Library.recordProgress(progress, A, 61.2, 0, NOW + 1), false, 'same second, keeps the duration');
  assert.equal(Library.progressFor(progress, A).d, 213);
  assert.equal(Library.recordProgress(progress, 'nope', 5, 10), false);
  assert.equal(Library.recordProgress(progress, A, NaN, 10), false);

  assert.equal(Library.resumeTime({ t: 61, d: 213 }), 61);
  assert.equal(Library.resumeTime({ t: 3, d: 213 }), 0, 'barely started');
  assert.equal(Library.resumeTime({ t: 205, d: 213 }), 0, 'finished: start over');
  assert.equal(Library.resumeTime({ t: 18, d: 19 }), 0);
  assert.equal(Library.resumeTime({ t: 400 }), 400, 'no duration known');
  assert.equal(Library.resumeTime(null), 0);

  assert.equal(Library.watchedFraction({ t: 50, d: 200 }), 0.25);
  assert.equal(Library.watchedFraction({ t: 195, d: 200 }), 1, 'finished shows a full bar');
  assert.equal(Library.watchedFraction({ t: 50 }), 0);
  assert.equal(Library.watchedFraction(undefined), 0);

  // Keeps only the most recent videos.
  const capped = {};
  for (let i = 0; i < 5; i += 1) Library.recordProgress(capped, `video${i}xxxxx`, 10, 100, NOW + i, 3);
  assert.deepEqual(Object.keys(capped).sort(), ['video2xxxxx', 'video3xxxxx', 'video4xxxxx']);

  // "constructor" is a valid-looking video ID; it must not find Object.prototype.constructor.
  assert.equal(Library.progressFor({}, 'constructor'), null);
});

test('cleans progress from storage', () => {
  const clean = Library.sanitizeProgress({
    [A]: { t: '61.9', d: 213, at: NOW },
    [B]: { t: -1, at: NOW },
    [C]: { t: 5, d: 'x', at: NOW - 10 },
    'not-an-id': { t: 1, at: NOW },
    __proto__: { t: 1 },
    constructor: 'junk',
  });
  assert.deepEqual(clean, { [A]: { t: 61, at: NOW, d: 213 }, [C]: { t: 5, at: NOW - 10 } });
  assert.deepEqual(Library.sanitizeProgress([1, 2]), {});
  assert.deepEqual(Library.sanitizeProgress('nope'), {});
});

test('backs up and restores without losing anything', () => {
  const mine = { library: fresh(), history: [{ id: A, list: null, start: 0, short: false, at: NOW - 100 }], progress: { [A]: { t: 10, d: 213, at: NOW - 100 } } };
  Library.addItem(mine.library, 'WL', { id: A }, NOW);
  const road = Library.createPlaylist(mine.library, 'Road trip', NOW);
  Library.addItem(mine.library, road.id, { id: B }, NOW);

  const file = JSON.stringify(Library.makeBackup(mine, NOW));
  const backup = Library.readBackup(file, { now: NOW });
  assert.equal(backup.ok, true);
  assert.deepEqual(backup.library, mine.library, 'round trip');

  // Restoring on another browser with its own stuff merges the two.
  const theirs = { library: fresh(), history: [{ id: C, list: null, start: 0, short: false, at: NOW }], progress: { [A]: { t: 99, d: 213, at: NOW } } };
  Library.addItem(theirs.library, 'WL', { id: C }, NOW);
  const added = Library.mergeBackup(theirs, backup);
  assert.deepEqual(added, { playlists: 1, videos: 2 });
  assert.deepEqual(ids(Library.getPlaylist(theirs.library, 'WL')), [C, A]);
  assert.deepEqual(ids(Library.getPlaylist(theirs.library, road.id)), [B]);
  assert.deepEqual(theirs.history.map((item) => item.id), [C, A], 'newest first');
  assert.equal(theirs.progress[A].t, 99, 'the more recent progress wins');
  // Importing the same file twice adds nothing.
  assert.deepEqual(Library.mergeBackup(theirs, Library.readBackup(file, { now: NOW })), { playlists: 0, videos: 0 });

  assert.deepEqual(Library.readBackup('{oops'), { ok: false, error: 'not-json' });
  assert.deepEqual(Library.readBackup('{"app":"Other"}'), { ok: false, error: 'not-backup' });
  // Backups from before the rename (when it was called TubeVault) still work.
  assert.equal(JSON.parse(file).app, 'FreeTube');
  const oldBackup = Library.readBackup(JSON.stringify(Object.assign(JSON.parse(file), { app: 'TubeVault' })), { now: NOW });
  assert.equal(oldBackup.ok, true);
  assert.deepEqual(oldBackup.library, mine.library);
  assert.deepEqual(Library.readBackup({ app: 'FreeTube', version: 99 }), { ok: false, error: 'newer' });
  assert.deepEqual(Library.readBackup(null), { ok: false, error: 'not-backup' });
  const junk = Library.readBackup({ app: 'FreeTube', version: 1, library: 'x', history: 5, progress: [] }, { now: NOW });
  assert.equal(junk.ok, true);
  assert.equal(junk.library.playlists.length, 2);
  assert.deepEqual(junk.history, []);
});
