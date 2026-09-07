'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createApp } = require('./src/app');
const { ReviewDatabase } = require('./src/db');
const { ReviewService } = require('./src/services');
const { answerMatches } = require('./src/domain/answerMatch');

function createLegacyCards(filename) {
  const database = new Database(filename);
  database.exec(`
    CREATE TABLE cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill TEXT NOT NULL CHECK (skill IN ('听力','阅读','口语','写作')),
      type TEXT NOT NULL CHECK (type IN ('同义替换','句子对照','语法修正','听力误听','生词')),
      front TEXT NOT NULL,
      front_audio TEXT,
      back TEXT NOT NULL,
      note TEXT,
      box INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
      next_review_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_reviewed_at TEXT,
      review_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  const insert = database.prepare(`
    INSERT INTO cards (id, skill, type, front, back, box, next_review_date, created_at)
    VALUES (?, '阅读', '生词', ?, ?, 1, '2026-09-07', '2026-09-07 09:00:00')
  `);
  for (let id = 1; id <= 18; id += 1) insert.run(id, `旧卡${id}`, `答案${id}`);
  database.close();
}

async function main() {
  assert.equal(answerMatches(' Movie ', 'movie/film'), true);
  assert.equal(answerMatches('FILM', 'movie/film'), true);
  assert.equal(answerMatches('cinema', 'movie/film'), false);

  const listeningSource = fs.readFileSync(require.resolve('./src/domain/listening'), 'utf8');
  const serviceSource = fs.readFileSync(require.resolve('./src/services'), 'utf8');
  assert.match(listeningSource, /require\('\.\/answerMatch'\)/);
  assert.match(listeningSource, /answerMatches\(rawAnswer, answer\.correctAnswer\)/);
  assert.match(serviceSource, /require\('\.\/domain\/answerMatch'\)/);
  assert.match(serviceSource, /answerMatches\(answer, card\.back\)/);
  console.log('✓ 公共判分复用断言通过：听力与卡片拼写均调用 src/domain/answerMatch.js');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-spelling-test-'));
  const filename = path.join(tempDir, 'legacy-18.db');
  createLegacyCards(filename);
  const database = new ReviewDatabase(filename);
  const columns = database.connection.pragma('table_info(cards)');
  assert.ok(columns.some((column) => column.name === 'review_mode' && column.dflt_value === "'flip'"));
  assert.equal(database.connection.prepare('SELECT COUNT(*) AS count FROM cards').get().count, 18);
  assert.deepEqual(database.connection.prepare('SELECT DISTINCT review_mode FROM cards').all(), [{ review_mode: 'flip' }]);
  console.log('✓ review_mode 普通加列迁移断言通过：18张旧卡完整保留且全部默认 flip');

  const app = createApp(new ReviewService(database, () => new Date(2026, 8, 7, 12, 0, 0)));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(url, options = {}) {
    const response = await fetch(`${base}${url}`, {
      headers: { 'content-type': 'application/json' }, ...options
    });
    const body = await response.json();
    return { response, body };
  }

  try {
    const created = await request('/api/cards', {
      method: 'POST', body: JSON.stringify({
        skill: '听力', type: '生词', front: '听音写出“电影”', back: 'movie/film', review_mode: 'spelling'
      })
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.review_mode, 'spelling');
    database.connection.prepare('UPDATE cards SET box = 2 WHERE id = ?').run(created.body.id);

    const queue = await request('/api/review/queue');
    const queuedSpelling = queue.body.find((card) => card.id === created.body.id);
    assert.equal('back' in queuedSpelling, false);
    assert.equal(JSON.stringify(queuedSpelling).includes('movie/film'), false);
    assert.equal(Buffer.from(queuedSpelling.spelling_audio, 'base64').toString('utf8'), 'movie/film');
    console.log('✓ 提交前防泄露断言通过：拼写卡队列响应无 back 字段及 back 明文，保留仅供朗读的编码音源');

    const correct = await request(`/api/review/${created.body.id}/spelling`, {
      method: 'POST', body: JSON.stringify({ answer: ' FILM ' })
    });
    assert.equal(correct.response.status, 200);
    assert.deepEqual({ result: correct.body.result, before: correct.body.box_before, after: correct.body.box_after }, {
      result: 'correct', before: 2, after: 3
    });
    console.log('✓ 拼写正确自动判分断言通过：" FILM " 命中 movie/film，box 2 → 3');

    database.connection.prepare("UPDATE cards SET box = 4, next_review_date = '2026-09-07' WHERE id = ?").run(created.body.id);
    const incorrect = await request(`/api/review/${created.body.id}/spelling`, {
      method: 'POST', body: JSON.stringify({ answer: 'cinema' })
    });
    assert.equal(incorrect.response.status, 200);
    assert.deepEqual({ result: incorrect.body.result, before: incorrect.body.box_before, after: incorrect.body.box_after }, {
      result: 'incorrect', before: 4, after: 1
    });
    assert.equal(incorrect.body.correct_answer, 'movie/film');
    console.log('✓ 拼写错误自动判分断言通过：box 4 → 1，响应 correct_answer = movie/film');

    const blockedManual = await request(`/api/review/${created.body.id}`, {
      method: 'POST', body: JSON.stringify({ result: 'correct' })
    });
    assert.equal(blockedManual.response.status, 400);

    const flipCard = database.getCard(1);
    assert.equal(flipCard.review_mode, 'flip');
    const flipReview = await request('/api/review/1', {
      method: 'POST', body: JSON.stringify({ result: 'correct' })
    });
    assert.equal(flipReview.response.status, 200);
    assert.equal(flipReview.body.box, 2);
    assert.equal(flipReview.body.back, '答案1');
    console.log('✓ 普通 flip 回归断言通过：旧卡仍走翻卡接口并由第1箱升到第2箱');
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
