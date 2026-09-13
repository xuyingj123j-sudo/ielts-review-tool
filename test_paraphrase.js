'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { ReviewDatabase } = require('./src/db');
const { ReviewService } = require('./src/services');
const { createApp } = require('./src/app');
const { paraphraseBrowserTest } = require('./scripts/test_paraphrase_browser');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-paraphrase-'));
  const database = new ReviewDatabase(path.join(temp, 'test.db'));
  const service = new ReviewService(database, () => new Date('2026-09-13T12:00:00'));
  let server;
  try {
    const make = (skill, front, back) => service.createCard({ skill, type: '同义替换', front, back });
    const slashCard = make('阅读', 'a place to watch films', 'movie/film');
    const wrongCard = make('听力', 'low-cost transport', 'cheap transport');
    const excludedCard = make('阅读', 'very large', 'enormous');
    const unrelated = service.createCard({ skill: '听力', type: '听力误听', front: 'ship', back: 'sheep' });
    database.connection.prepare('UPDATE cards SET box=3, review_count=2 WHERE id IN (?,?)').run(wrongCard.id, excludedCard.id);
    const addLog = database.connection.prepare('INSERT INTO review_logs (card_id,reviewed_at,result,box_before,box_after) VALUES (?,?,?,?,?)');
    addLog.run(wrongCard.id, '2026-09-13 10:00:00', 'incorrect', 2, 1);
    addLog.run(excludedCard.id, '2026-09-13 10:00:00', 'incorrect', 2, 1);
    addLog.run(excludedCard.id, '2026-09-13 11:00:00', 'correct', 1, 2);

    server = createApp(service).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    console.log(`PARAPHRASE_TEST_SERVER=${base} PID=${process.pid}（随测试关闭）`);
    const curl = async (route, method = 'GET', body, expected = 200) => {
      const args = ['-sS', '--max-time', '10', '-X', method, '-w', '\n%{http_code}', `${base}${route}`];
      if (body !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(body).replace(/[^\x00-\x7f]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`));
      const executable = process.platform === 'win32' ? 'curl.exe' : 'curl';
      console.log(`COMMAND: ${executable} ${args.map(argument => JSON.stringify(argument)).join(' ')}`);
      const { stdout } = await promisify(execFile)(executable, args, { windowsHide: true });
      console.log(stdout.trim());
      const lines = stdout.trim().split('\n');
      assert.equal(Number(lines.pop()), expected, stdout);
      return JSON.parse(lines.join('\n'));
    };

    const all = await curl('/api/paraphrase/cards');
    assert.deepEqual(new Set(all.map(card => card.id)), new Set([slashCard.id, wrongCard.id, excludedCard.id]));
    assert.ok(all.every(card => Object.hasOwn(card, 'back')));
    assert.equal(all.some(card => card.id === unrelated.id), false);
    console.log(`✓ curl 全部同义替换：ids=${JSON.stringify(all.map(card => card.id))}；阅读+听力共用；back明文字段完整`);

    const mistakes = await curl('/api/paraphrase/cards?mistakes=true');
    assert.deepEqual(new Set(mistakes.map(card => card.id)), new Set([slashCard.id, wrongCard.id]));
    console.log(`✓ curl 错题筛选：box=1 id=${slashCard.id} + 最近incorrect id=${wrongCard.id}；最近correct id=${excludedCard.id}已排除`);

    const rowBefore = database.getCard(slashCard.id);
    const logsBefore = database.connection.prepare('SELECT * FROM review_logs WHERE card_id=? ORDER BY id').all(slashCard.id);
    const correct = await curl(`/api/paraphrase/cards/${slashCard.id}/test`, 'POST', { answer: ' FILM ' });
    assert.deepEqual(correct, { correct: true, correct_answer: 'movie/film' });
    const incorrect = await curl(`/api/paraphrase/cards/${slashCard.id}/test`, 'POST', { answer: 'cinema' });
    assert.deepEqual(incorrect, { correct: false, correct_answer: 'movie/film' });
    const cardsAfter = await curl('/api/cards');
    const rowAfter = cardsAfter.find(card => card.id === slashCard.id);
    const logsAfter = database.connection.prepare('SELECT * FROM review_logs WHERE card_id=? ORDER BY id').all(slashCard.id);
    assert.deepEqual(rowAfter, rowBefore);
    assert.deepEqual(logsAfter, logsBefore);
    console.log(`✓ curl 只读自测：FILM命中movie/film，cinema判错并回显答案；box=${rowBefore.box}→${rowAfter.box}, review_count=${rowBefore.review_count}→${rowAfter.review_count}, review_logs=${logsBefore.length}→${logsAfter.length}`);
    await curl(`/api/paraphrase/cards/${unrelated.id}/test`, 'POST', { answer: 'sheep' }, 400);
    await curl('/api/paraphrase/cards?mistakes=false', 'GET', undefined, 400);

    database.connection.prepare('UPDATE cards SET box=3 WHERE id=?').run(slashCard.id);
    addLog.run(slashCard.id, '2026-09-13 12:00:00', 'correct', 1, 3);
    await paraphraseBrowserTest(base, temp, { service, wrongCardId: wrongCard.id });
    assert.deepEqual(database.connection.pragma('foreign_key_check'), []);
    assert.equal(database.connection.pragma('integrity_check', { simple: true }), 'ok');
    console.log('PARAPHRASE_ACCEPTANCE=PASS; integrity_check=ok; foreign_key_check=[]');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    database.close();
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    console.log('CLEANUP: local paraphrase server closed; temporary database/browser profile/screenshots removed');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
