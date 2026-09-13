'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const Database = require('better-sqlite3');
const { ReviewDatabase, TYPES } = require('./src/db');
const { ReviewService } = require('./src/services');
const { createApp } = require('./src/app');
const { SPELLING_CATEGORY_LABELS } = require('./src/domain/spellingCategories');
const { foundationsBrowserTest } = require('./scripts/test_foundations_browser');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-foundations-'));
  let db, server, legacy;
  try {
    const filename = path.join(temp, 'current-shape.db');
    legacy = new Database(filename);
    legacy.exec(`CREATE TABLE cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, skill TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('同义替换','句子对照','语法修正','听力误听','生词')),
      front TEXT NOT NULL, front_audio TEXT, back TEXT NOT NULL, review_mode TEXT NOT NULL DEFAULT 'flip',
      note TEXT, box INTEGER NOT NULL DEFAULT 1, next_review_date TEXT NOT NULL,
      created_at TEXT NOT NULL, last_reviewed_at TEXT, review_count INTEGER NOT NULL DEFAULT 0);
      CREATE TRIGGER cards_identity_sentinel AFTER UPDATE ON cards BEGIN SELECT 1; END;
      CREATE TABLE review_logs (id INTEGER PRIMARY KEY, card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE,
        reviewed_at TEXT, result TEXT, box_before INTEGER, box_after INTEGER);`);
    const insert = legacy.prepare(`INSERT INTO cards (id,skill,type,front,front_audio,back,review_mode,next_review_date,created_at)
      VALUES (?,'听力','听力误听',?, ?, ?, ?, '2026-09-12','2026-09-12 09:00:00')`);
    insert.run(41, '原卡1', 'Original audio one', 'original', 'spelling');
    insert.run(42, '原卡2', 'Original audio two', 'second', 'spelling');
    legacy.exec("INSERT INTO review_logs VALUES (99, 41, '2026-09-11 12:00:00','incorrect',2,1)");
    const before = legacy.prepare('SELECT * FROM cards ORDER BY id').all();
    const rootpage = legacy.prepare("SELECT rootpage FROM sqlite_master WHERE name='cards'").get().rootpage;
    legacy.close();
    const originalMigration = ReviewDatabase.prototype.migrateCardsTypeConstraint;
    let rebuildCalls = 0;
    ReviewDatabase.prototype.migrateCardsTypeConstraint = function () { rebuildCalls++; throw new Error('本轮不得重建cards'); };
    try { db = new ReviewDatabase(filename); db.migrate(); }
    finally { ReviewDatabase.prototype.migrateCardsTypeConstraint = originalMigration; }
    assert.equal(rebuildCalls, 0);
    assert.equal(db.connection.prepare("SELECT rootpage FROM sqlite_master WHERE name='cards'").get().rootpage, rootpage);
    assert.ok(db.connection.prepare("SELECT name FROM sqlite_master WHERE name='cards_identity_sentinel'").get());
    assert.equal(db.connection.prepare("SELECT name FROM sqlite_master WHERE name='cards_new'").get(), undefined);
    for (const old of before) {
      const { source, spelling_category, ...row } = db.getCard(old.id);
      assert.deepEqual(row, old); assert.equal(source, 'manual'); assert.equal(spelling_category, null);
    }
    assert.equal(db.connection.pragma('table_info(cards)').find(c => c.name === 'source').dflt_value, "'manual'");
    assert.equal(db.reviewLog(99).error_type, null);
    assert.ok(db.connection.pragma('table_info(number_drill_attempts)').some(c => c.name === 'error_type' && !c.notnull));
    assert.ok(db.connection.pragma('table_info(number_drill_attempts)').some(c => c.name === 'resolved' && c.notnull && c.dflt_value === '0'));
    console.log(`MIGRATION: rebuildCalls=${rebuildCalls}; rootpage=${rootpage} unchanged; sentinel retained; cards_new absent; source default='manual'; nullable error_type columns and resolved=0 present`);
    console.log('PRESERVED_ROWS=' + JSON.stringify(db.connection.prepare('SELECT id, front_audio, review_mode, source FROM cards ORDER BY id').all()));
    assert.deepEqual(TYPES, ['同义替换','句子对照','语法修正','听力误听','生词']);
    assert.equal(Object.hasOwn(SPELLING_CATEGORY_LABELS, 'letter'), false);
    console.log('SPELLING_CATEGORIES=' + JSON.stringify(SPELLING_CATEGORY_LABELS) + '; letter absent');

    const service = new ReviewService(db);
    server = createApp(service).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const curl = async (route, method = 'GET', body, expected = method === 'POST' ? 201 : 200) => {
      const args = ['-sS', '--max-time', '10', '-X', method, '-w', '\n%{http_code}', `${base}${route}`];
      if (body !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(body).replace(/[^\x00-\x7f]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`));
      console.log('COMMAND: curl ' + args.map(arg => JSON.stringify(arg)).join(' '));
      const { stdout } = await promisify(execFile)(process.platform === 'win32' ? 'curl.exe' : 'curl', args, { windowsHide: true });
      console.log(stdout.trim());
      const lines = stdout.trim().split('\n'); assert.equal(Number(lines.pop()), expected, stdout);
      return JSON.parse(lines.join('\n'));
    };
    const basic = { skill: '听力', type: '听力误听', front: 'context', back: 'answer', note: 'my error' };
    const manual = await curl('/api/cards', 'POST', basic); assert.equal(manual.source, 'manual');
    for (const source of ['real_error', 'ielts_material', 'ai_generated']) {
      const card = await curl('/api/cards', 'POST', { ...basic, type: '同义替换', source });
      assert.equal(card.source, source); assert.equal(card.type, '同义替换');
    }
    for (const input of [{ source: 'bad' }, { source: null }, { review_mode: 'spelling', spelling_category: 'letter' }, { review_mode: 'spelling', spelling_category: 'bad' }]) {
      await curl('/api/cards', 'POST', { ...basic, ...input }, 400);
    }
    const incorrect = await curl(`/api/review/${manual.id}`, 'POST', { result: 'incorrect' }, 200);
    assert.ok(incorrect.review_log_id);
    assert.equal((await curl(`/api/review/logs/${incorrect.review_log_id}/error-type`, 'PUT', { error_type: 'SPELLING' })).error_type, 'SPELLING');
    assert.equal((await curl(`/api/review/logs/${incorrect.review_log_id}/error-type`, 'PUT', { error_type: null })).error_type, null);
    await curl(`/api/review/logs/${incorrect.review_log_id}/error-type`, 'PUT', { error_type: 'BAD' }, 400);
    await curl(`/api/review/logs/${incorrect.review_log_id}/error-type`, 'PUT', {}, 400);
    const correct = await curl(`/api/review/${manual.id}`, 'POST', { result: 'correct' }, 200);
    await curl(`/api/review/logs/${correct.review_log_id}/error-type`, 'PUT', { error_type: 'SPELLING' }, 400);
    await curl('/api/review/logs/999999/error-type', 'PUT', { error_type: null }, 404);

    const sections = db.importListeningTest({ sourceBook: 'Acceptance fixture', testNumber: 1, sections: [{
      sectionNumber: 1, title: 'Local fixture', audioPath: '/listening-audio/fixture.mp3',
      transcriptText: 'The answer is tower (Q1). It opens in September (Q2).', answerKeyText: '1. tower\n2. September'
    }] });
    const payload = { answers: { 1: 'flower', 2: 'September' }, check_gist: false, check_key_sentences: false,
      check_paraphrase: false, check_redo_improved: false, check_retention: false };
    const graded = await curl(`/api/listening/sections/${sections[0].id}/attempts`, 'POST', payload);
    const attemptId = graded.attempt.id;
    const itemPath = `/api/listening/attempts/${attemptId}/items`;
    const items = await curl(itemPath); assert.equal(items.length, 2); assert.equal(items[0].user_answer, 'flower');
    assert.ok(items[0].context.includes('tower'));
    assert.equal((await curl(`${itemPath}/1/error-type`, 'PUT', { error_type: 'SOUND_RECOGNITION' })).error_type, 'SOUND_RECOGNITION');
    await curl(`${itemPath}/2/error-type`, 'PUT', { error_type: 'SPELLING' }, 400);
    await curl(`${itemPath}/1/error-type`, 'PUT', { error_type: 'bad' }, 400);
    await curl(`${itemPath}/1/error-type`, 'PUT', { error_type: null });
    await curl(`${itemPath}/2/collect`, 'POST', basic, 400);
    await curl(`${itemPath}/1/collect`, 'POST', { ...basic, front: '' }, 400);
    assert.equal(db.listeningItem(attemptId, 1).collected_card_id, null);
    const collected = await curl(`${itemPath}/1/collect`, 'POST', { ...basic, source: 'ai_generated' });
    assert.equal(collected.source, 'real_error'); assert.equal(collected.box, 1);
    await curl(`${itemPath}/1/collect`, 'POST', basic, 400);
    assert.ok((await curl('/api/cards')).some(c => c.id === collected.id && c.source === 'real_error'));
    assert.equal((await curl(itemPath))[0].collected_card_id, collected.id);
    // Collection must roll back a card insert if updating its item fails.
    const rollbackAttempt = service.recordListeningAttempt(sections[0].id, payload).attempt.id;
    const countBefore = db.listCards().length;
    db.connection.exec("CREATE TRIGGER fail_collection BEFORE UPDATE OF collected_card_id ON listening_answer_items BEGIN SELECT RAISE(ABORT, 'test rollback'); END;");
    assert.throws(() => service.collectListeningCard(rollbackAttempt, 1, basic), /test rollback/);
    assert.equal(db.listCards().length, countBefore); assert.equal(db.listeningItem(rollbackAttempt, 1).collected_card_id, null);
    db.connection.exec('DROP TRIGGER fail_collection');
    const countAttempts = db.connection.prepare('SELECT COUNT(*) n FROM listening_attempts').get().n;
    db.connection.exec("CREATE TRIGGER fail_items BEFORE INSERT ON listening_answer_items BEGIN SELECT RAISE(ABORT, 'test grading rollback'); END;");
    assert.throws(() => service.recordListeningAttempt(sections[0].id, payload), /test grading rollback/);
    assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM listening_attempts').get().n, countAttempts);
    db.connection.exec('DROP TRIGGER fail_items');
    db.deleteCard(collected.id); assert.equal(db.listeningItem(attemptId, 1).collected_card_id, null);
    db.connection.prepare('DELETE FROM listening_attempts WHERE id=?').run(rollbackAttempt);
    assert.deepEqual(db.listeningItems(rollbackAttempt), []);
    console.log('TRANSACTIONS: grading/collection rollback verified; duplicate blocked; card deletion keeps item; attempt deletion cascades items');

    const spelling = await curl('/api/cards', 'POST', { ...basic, review_mode: 'spelling', spelling_category: 'name_place', back: 'A' });
    const preview = await curl('/api/review/queue/preview');
    const queue = await curl('/api/review/queue');
    assert.deepEqual(preview.map(card => card.id), queue.map(card => card.id));
    assert.equal(preview.find(card => card.id === spelling.id).back, 'A');
    assert.equal(Object.hasOwn(queue.find(card => card.id === spelling.id), 'back'), false);
    assert.equal(queue.find(card => card.id === spelling.id).spelling_audio, Buffer.from('A').toString('base64'));
    console.log(`PREVIEW_QUEUE: count=${preview.length}; same_ids=true; spelling_back=${JSON.stringify(preview.find(card => card.id === spelling.id).back)}; blind_back_absent=true; spelling_audio=${queue.find(card => card.id === spelling.id).spelling_audio}`);
    const snapshot = db.getCard(spelling.id); const logCount = db.connection.prepare('SELECT COUNT(*) n FROM review_logs').get().n;
    await curl(`/api/practice/cards/${spelling.id}/spelling`, 'POST', { answer: 'wrong' }, 200);
    assert.deepEqual(db.getCard(spelling.id), snapshot);
    assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM review_logs').get().n, logCount);
    const spellingError = await curl(`/api/review/${spelling.id}/spelling`, 'POST', { answer: 'wrong' }, 200);
    assert.ok(spellingError.review_log_id);
    await curl(`/api/review/logs/${spellingError.review_log_id}/error-type`, 'PUT', { error_type: 'SPELLING' });
    assert.ok((await curl('/api/spelling/cards?mistakes=true')).some(c => c.id === spelling.id));
    db.connection.prepare('UPDATE cards SET box=3 WHERE id=?').run(spelling.id);
    assert.ok(service.spellingCards({ mistakes: 'true' }).some(c => c.id === spelling.id), 'latest incorrect even at box3');
    service.reviewSpelling(spelling.id, { answer: 'A' });
    assert.ok(!service.spellingCards({ mistakes: 'true' }).some(c => c.id === spelling.id), 'latest correct supersedes prior incorrect');
    const extra = service.createCard({ ...basic, review_mode: 'spelling', spelling_category: 'scene_word' });
    assert.deepEqual(service.spellingCards({ category: 'name_place' }).map(c => c.id), [spelling.id]);
    assert.ok(!service.spellingCards({ category: 'name_place' })[0].back);
    assert.ok(service.spellingCards({ mistakes: 'true' }).some(c => c.id === extra.id), 'box1 without logs included');
    await curl(`/api/cards/${spelling.id}`, 'PUT', { note: 'updated' });
    assert.equal(db.getCard(spelling.id).spelling_category, 'name_place');
    await curl(`/api/cards/${spelling.id}`, 'PUT', { review_mode: 'flip', spelling_category: null });
    await curl(`/api/cards/${spelling.id}`, 'PUT', { review_mode: 'spelling', spelling_category: 'name_place' });
    db.close(); db = new ReviewDatabase(filename); service.db = db;
    assert.equal(db.listeningItems(attemptId).length, 2);
    console.log('PERSISTENCE: reopened database retains answer items; spelling practice is read-only; category/latest-log filters asserted');
    await foundationsBrowserTest(base, temp, { spellingId: spelling.id, attemptId, service });
    assert.deepEqual(db.connection.pragma('foreign_key_check'), []);
    assert.equal(db.connection.pragma('integrity_check', { simple: true }), 'ok');
    console.log('FOUNDATIONS_ACCEPTANCE=PASS; integrity_check=ok; foreign_key_check=[]');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    db?.close();
    if (legacy?.open) legacy.close();
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    console.log('CLEANUP: local test server closed; temporary database/browser profile/screenshots removed');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
