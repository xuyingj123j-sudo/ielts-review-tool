'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('./src/app');
const { ReviewDatabase } = require('./src/db');
const { ReviewService } = require('./src/services');

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-practice-test-'));
  const database = new ReviewDatabase(path.join(tempDir, 'practice.db'));
  const clock = () => new Date(2026, 8, 7, 12, 0, 0);
  const service = new ReviewService(database, clock);
  const flip = service.createCard({ skill: '阅读', type: '生词', front: 'front', back: 'back' });
  const spelling = service.createCard({
    skill: '听力', type: '生词', front: '听音拼写', back: 'movie/film', review_mode: 'spelling'
  });
  database.connection.prepare("UPDATE cards SET box=3, next_review_date='2026-09-07' WHERE id=?").run(spelling.id);

  const app = createApp(service);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, options = {}) => {
    const response = await fetch(`${base}${url}`, {
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
      ...options
    });
    const body = await response.json();
    assert.ok(response.ok, JSON.stringify(body));
    return body;
  };
  const snapshot = (id) => database.connection.prepare(`
    SELECT box, next_review_date, last_reviewed_at, review_count,
      (SELECT COUNT(*) FROM review_logs WHERE card_id=cards.id) AS log_count
    FROM cards WHERE id=?
  `).get(id);

  try {
    await request(`/api/review/${flip.id}`, {
      method: 'POST', body: JSON.stringify({ result: 'correct' })
    });
    const all = await request('/api/practice/cards?scope=all');
    const today = await request('/api/practice/cards?scope=today');
    assert.deepEqual(new Set(all.map((card) => card.id)), new Set([flip.id, spelling.id]));
    assert.deepEqual(today.map((card) => card.id), [flip.id]);
    const safeSpelling = all.find((card) => card.id === spelling.id);
    assert.equal('back' in safeSpelling, false);
    assert.equal(Buffer.from(safeSpelling.spelling_audio, 'base64').toString('utf8'), 'movie/film');
    console.log('✓ 自由练习范围断言通过：全部2张，今天已复习1张，拼写卡不泄露back明文');

    const beforeFree = snapshot(spelling.id);
    const freeResult = await request(`/api/practice/cards/${spelling.id}/spelling`, {
      method: 'POST', body: JSON.stringify({ answer: ' FILM ' })
    });
    const afterFree = snapshot(spelling.id);
    assert.equal(freeResult.correct, true);
    assert.deepEqual(afterFree, beforeFree);
    console.log(`✓ 自由练习零落库断言通过：box=${beforeFree.box}→${afterFree.box}, next=${beforeFree.next_review_date}→${afterFree.next_review_date}, logs=${beforeFree.log_count}→${afterFree.log_count}`);

    const single = await request(`/api/practice/cards/${spelling.id}`);
    assert.equal(single.id, spelling.id);
    assert.equal(single.review_mode, 'spelling');
    assert.equal('back' in single, false);
    const beforeSingle = snapshot(spelling.id);
    const singleResult = await request(`/api/practice/cards/${spelling.id}/spelling`, {
      method: 'POST', body: JSON.stringify({ answer: 'wrong' })
    });
    const afterSingle = snapshot(spelling.id);
    assert.equal(singleResult.correct, false);
    assert.equal(singleResult.correct_answer, 'movie/film');
    assert.deepEqual(afterSingle, beforeSingle);
    console.log(`✓ 单卡练习零落库断言通过：box=${beforeSingle.box}→${afterSingle.box}, next=${beforeSingle.next_review_date}→${afterSingle.next_review_date}, logs=${beforeSingle.log_count}→${afterSingle.log_count}`);

    const beforeFormal = snapshot(spelling.id);
    const formal = await request(`/api/review/${spelling.id}/spelling`, {
      method: 'POST', body: JSON.stringify({ answer: 'movie' })
    });
    const afterFormal = snapshot(spelling.id);
    assert.equal(formal.correct, true);
    assert.equal(afterFormal.box, beforeFormal.box + 1);
    assert.notEqual(afterFormal.next_review_date, beforeFormal.next_review_date);
    assert.equal(afterFormal.log_count, beforeFormal.log_count + 1);
    console.log(`✓ 正式复习回归通过：box=${beforeFormal.box}→${afterFormal.box}, next=${beforeFormal.next_review_date}→${afterFormal.next_review_date}, logs=${beforeFormal.log_count}→${afterFormal.log_count}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
