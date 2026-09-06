'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createApp } = require('./src/app');
const { ReviewDatabase } = require('./src/db');
const { ReviewService } = require('./src/services');
const { addDays, toLocalDate } = require('./src/domain/srs');

function assertLegacyMigration(tempDir) {
  const filename = path.join(tempDir, 'legacy.db');
  const legacy = new Database(filename);
  legacy.pragma('foreign_keys = ON');
  legacy.exec(`
    CREATE TABLE cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill TEXT NOT NULL CHECK (skill IN ('听力','阅读','口语','写作')),
      type TEXT NOT NULL CHECK (type IN ('同义替换','句子对照','语法修正','听力误听')),
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      note TEXT,
      box INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
      next_review_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_reviewed_at TEXT,
      review_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      reviewed_at TEXT NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('correct','incorrect')),
      box_before INTEGER NOT NULL,
      box_after INTEGER NOT NULL
    );
    CREATE TABLE writing_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      completed_at TEXT NOT NULL
    );
    INSERT INTO cards (
      id, skill, type, front, back, note, box, next_review_date,
      created_at, last_reviewed_at, review_count
    ) VALUES (
      41, '听力', '听力误听', 'legacy ship', 'legacy sheep', '用户已有卡片',
      2, '2026-09-06', '2026-09-01 09:00:00', '2026-09-04 09:00:00', 1
    );
    INSERT INTO review_logs (id, card_id, reviewed_at, result, box_before, box_after)
    VALUES (9, 41, '2026-09-04 09:00:00', 'correct', 1, 2);
    INSERT INTO writing_completions (id, completed_at)
    VALUES (7, '2026-09-03 20:00:00');
  `);
  legacy.close();

  const migrated = new ReviewDatabase(filename);
  try {
    const preservedCard = migrated.getCard(41);
    const preservedLog = migrated.connection.prepare('SELECT * FROM review_logs WHERE id = 9').get();
    assert.equal(preservedCard.front, 'legacy ship');
    assert.equal(preservedCard.front_audio, null);
    assert.equal(preservedCard.type, '听力误听');
    assert.equal(preservedLog.card_id, 41);
    assert.deepEqual(migrated.connection.pragma('foreign_key_check'), []);
    assert.ok(migrated.connection.pragma('table_info(cards)').some((column) => column.name === 'front_audio'));
    const word = migrated.createCard({
      skill: '阅读', type: '生词', front: 'ubiquitous', back: '无处不在的', note: '词汇测试',
      nextReviewDate: '2026-09-04', createdAt: '2026-09-04 12:00:00'
    });
    assert.equal(word.id, 42);
    assert.equal(word.type, '生词');
    const dailyTasksSql = migrated.connection.prepare(`
      SELECT sql FROM sqlite_master WHERE type='table' AND name='daily_tasks'
    `).get()?.sql;
    assert.match(dailyTasksSql, /UNIQUE\s*\(task_date,\s*skill\)/i);
    const writingCompletionsSql = migrated.connection.prepare(`
      SELECT sql FROM sqlite_master WHERE type='table' AND name='writing_completions'
    `).get()?.sql;
    assert.match(writingCompletionsSql, /completed_at TEXT NOT NULL/i);
    assert.match(writingCompletionsSql, /content TEXT NOT NULL/i);
    const preservedLegacyWriting = migrated.connection.prepare('SELECT * FROM writing_completions WHERE id = 7').get();
    assert.equal(preservedLegacyWriting.completed_at, '2026-09-03 20:00:00');
    assert.equal(preservedLegacyWriting.content, '');
    console.log('✓ 旧库安全迁移断言通过：卡片 id=41 与复习日志 id=9 均保留；新增生词 id=42');
    console.log('✓ front_audio 普通加列迁移断言通过：旧卡 id=41 保留且 front_audio = null');
    console.log('✓ 每日任务表迁移断言通过：daily_tasks 已创建，且 task_date + skill 唯一');
    console.log('✓ 写作记录表迁移断言通过：旧记录 id=7 保留，content 为 TEXT NOT NULL，历史空内容兼容为空字符串');
  } finally {
    migrated.close();
  }
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-review-test-'));
  assertLegacyMigration(tempDir);
  const database = new ReviewDatabase(path.join(tempDir, 'test.db'));
  const fixedNow = new Date(2026, 8, 4, 12, 0, 0);
  const app = createApp(new ReviewService(database, () => new Date(fixedNow)));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(url, options) {
    const response = await fetch(`${base}${url}`, {
      headers: { 'content-type': 'application/json' }, ...options
    });
    const body = response.status === 204 ? null : await response.json();
    assert.ok(response.ok, JSON.stringify(body));
    return body;
  }

  try {
    const card = await request('/api/cards', {
      method: 'POST', body: JSON.stringify({
        skill: '听力', type: '听力误听',
        front: 'She often goes to a ______ near her house.',
        front_audio: 'She often goes to a keep-fit studio near her house.',
        back: 'keep-fit studio', note: '听力挖空'
      })
    });
    assert.equal(card.front, 'She often goes to a ______ near her house.');
    assert.equal(card.front_audio, 'She often goes to a keep-fit studio near her house.');
    assert.equal(card.back, 'keep-fit studio');
    console.log(`✓ front_audio API 断言通过：front = ${JSON.stringify(card.front)}；front_audio = ${JSON.stringify(card.front_audio)}`);
    const immediateQueue = await request('/api/review/queue');
    assert.equal(card.next_review_date, toLocalDate(fixedNow));
    assert.ok(immediateQueue.some((item) => item.id === card.id), '新卡片创建后应立即进入当天队列');
    console.log(`✓ 新卡立即入队断言通过：新卡ID ${card.id} 已出现在队列 [${immediateQueue.map((item) => item.id).join(', ')}]`);

    const word = await request('/api/cards', {
      method: 'POST', body: JSON.stringify({ skill: '阅读', type: '生词', front: 'ubiquitous', back: '无处不在的', note: '例句或搭配' })
    });
    assert.equal(word.type, '生词');
    console.log(`✓ 生词类型接口断言通过：新卡ID ${word.id}，type = ${word.type}`);

    const boxes = [];
    for (let index = 0; index < 3; index += 1) {
      const reviewed = await request(`/api/review/${card.id}`, { method: 'POST', body: JSON.stringify({ result: 'correct' }) });
      boxes.push(reviewed.box);
    }
    assert.deepEqual(boxes, [2, 3, 4]);
    const reset = await request(`/api/review/${card.id}`, { method: 'POST', body: JSON.stringify({ result: 'incorrect' }) });
    assert.equal(reset.box, 1);
    console.log(`✓ SRS升箱断言通过：${boxes.join(' → ')}`);
    console.log(`✓ SRS降箱断言通过：4 → ${reset.box}`);

    const labels = ['昨天到期', '今天到期', '明天到期'];
    const dates = [addDays(fixedNow, -1), fixedNow, addDays(fixedNow, 1)].map(toLocalDate);
    const ids = [];
    for (let index = 0; index < labels.length; index += 1) {
      const item = await request('/api/cards', {
        method: 'POST', body: JSON.stringify({ skill: '阅读', type: '同义替换', front: labels[index], back: `答案${index + 1}` })
      });
      ids.push(item.id);
      database.connection.prepare('UPDATE cards SET next_review_date=? WHERE id=?').run(dates[index], item.id);
    }
    const queue = await request('/api/review/queue');
    const actualIds = queue.map((item) => item.id);
    assert.ok(actualIds.includes(ids[0]), '队列应包含昨天到期卡片');
    assert.ok(actualIds.includes(ids[1]), '队列应包含今天到期卡片');
    assert.ok(!actualIds.includes(ids[2]), '队列不应包含明天到期卡片');
    console.log(`✓ 日期过滤断言通过：实际队列ID [${actualIds.join(', ')}]；今天/昨天ID [${ids[1]}, ${ids[0]}]；明天ID ${ids[2]} 已排除`);

    database.connection.prepare('DELETE FROM review_logs').run();
    const insertLog = database.connection.prepare(`
      INSERT INTO review_logs (card_id, reviewed_at, result, box_before, box_after)
      VALUES (?, ?, 'correct', 1, 2)
    `);
    for (const offset of [-4, -3, -2]) {
      insertLog.run(card.id, `${toLocalDate(addDays(fixedNow, offset))} 12:00:00`);
    }
    const firstStats = await request('/api/stats');
    assert.equal(firstStats.streak, 3);
    console.log(`✓ 连续3天断言通过：streak = ${firstStats.streak}`);

    insertLog.run(card.id, `${toLocalDate(fixedNow)} 12:00:00`);
    const secondStats = await request('/api/stats');
    assert.equal(secondStats.streak, 1);
    console.log(`✓ 中断后重计断言通过：streak = ${secondStats.streak}（不是4）`);

    const todayTasks = await request('/api/tasks/today');
    assert.equal(todayTasks.length, 3);
    assert.deepEqual(todayTasks.map((task) => task.skill), ['听力', '阅读', '口语']);
    assert.ok(todayTasks.every((task) => task.done === false && task.completed_at === null));
    const toggledOn = await request(`/api/tasks/${todayTasks[0].id}/toggle`, { method: 'POST' });
    assert.equal(toggledOn.done, true);
    assert.match(toggledOn.completed_at, /^2026-09-04 12:00:00$/);
    const toggledOff = await request(`/api/tasks/${todayTasks[0].id}/toggle`, { method: 'POST' });
    assert.equal(toggledOff.done, false);
    assert.equal(toggledOff.completed_at, null);
    const todayTasksAgain = await request('/api/tasks/today');
    database.connection.prepare(`
      INSERT INTO daily_tasks (task_date, skill, done, completed_at)
      VALUES ('2026-09-04', '写作', 1, '2026-09-04 11:00:00')
    `).run();
    const todayTasksWithHistoricalWriting = await request('/api/tasks/today');
    assert.equal(todayTasksAgain.length, 3);
    assert.deepEqual(todayTasksWithHistoricalWriting.map((task) => task.skill), ['听力', '阅读', '口语']);
    console.log(`✓ 今日任务接口断言通过：只生成听力/阅读/口语 ${todayTasks.length} 项；切换 false → true → false；历史写作行不返回`);

    database.connection.prepare('DELETE FROM review_logs').run();
    database.connection.prepare('DELETE FROM daily_tasks').run();
    const speaking = await request('/api/cards', {
      method: 'POST', body: JSON.stringify({ skill: '口语', type: '句子对照', front: 'basic sentence', back: 'advanced sentence' })
    });
    const writing = await request('/api/cards', {
      method: 'POST', body: JSON.stringify({ skill: '写作', type: '语法修正', front: 'wrong sentence', back: 'correct sentence' })
    });
    database.connection.prepare('UPDATE cards SET box=5 WHERE id IN (?, ?)').run(card.id, writing.id);
    const insertTask = database.connection.prepare(`
      INSERT INTO daily_tasks (task_date, skill, done, completed_at) VALUES (?, ?, 1, ?)
    `);
    const completionDays = { 听力: 5, 阅读: 7, 口语: 6 };
    for (const [skill, days] of Object.entries(completionDays)) {
      for (let offset = 0; offset < days; offset += 1) {
        const date = toLocalDate(addDays(fixedNow, -offset));
        insertTask.run(date, skill, `${date} 09:00:00`);
      }
    }
    const insertResult = database.connection.prepare(`
      INSERT INTO review_logs (card_id, reviewed_at, result, box_before, box_after)
      VALUES (?, ?, ?, 1, 2)
    `);
    for (const result of ['correct', 'correct', 'correct', 'correct', 'incorrect']) insertResult.run(card.id, '2026-09-04 10:00:00', result);
    for (const result of ['correct', 'incorrect', 'incorrect']) insertResult.run(word.id, '2026-09-03 10:00:00', result);
    for (const result of ['correct', 'correct', 'correct', 'incorrect']) insertResult.run(writing.id, '2026-09-02 10:00:00', result);

    database.recordWritingCompletion('2026-08-28 08:00:00', '七天范围外的旧作文');
    database.recordWritingCompletion('2026-09-01 08:00:00', 'Dear Sir or Madam,\nI am writing to complain about the service.');
    const missingWritingResponse = await fetch(`${base}/api/writing/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    });
    assert.equal(missingWritingResponse.status, 400);
    assert.deepEqual(await missingWritingResponse.json(), { error: '写作内容不能为空' });
    const writingContent = 'Some people believe public transport should be free.\nI partly agree with this view.';
    const writingCompletion = await request('/api/writing/complete', {
      method: 'POST', body: JSON.stringify({ content: writingContent })
    });
    assert.equal(writingCompletion.completed_at, '2026-09-04 12:00:00');
    assert.equal(writingCompletion.content, writingContent);
    assert.equal(writingCompletion.weeklyCompleted, 2);
    assert.equal(writingCompletion.target, 1);

    const weekly = await request('/api/stats/weekly');
    assert.deepEqual(weekly.period, { start: '2026-08-29', end: '2026-09-04', days: 7 });
    assert.deepEqual(
      Object.fromEntries(Object.entries(weekly.skills).map(([skill, item]) => [skill, {
        reviewTotal: item.reviewTotal, accuracy: item.accuracy
      }])),
      {
        听力: { reviewTotal: 5, accuracy: 80 },
        阅读: { reviewTotal: 3, accuracy: 33 },
        口语: { reviewTotal: 0, accuracy: null },
        写作: { reviewTotal: 4, accuracy: 75 }
      }
    );
    assert.deepEqual(weekly.dailyTasks, {
      听力: { completedDays: 5, targetDays: 7 },
      阅读: { completedDays: 7, targetDays: 7 },
      口语: { completedDays: 6, targetDays: 7 }
    });
    assert.equal(weekly.writing.completed, 2);
    assert.equal(weekly.writing.target, 1);
    assert.deepEqual(weekly.writing.records.map(({ completed_at, content }) => ({ completed_at, content })), [
      { completed_at: '2026-09-04 12:00:00', content: writingContent },
      { completed_at: '2026-09-01 08:00:00', content: 'Dear Sir or Madam,\nI am writing to complain about the service.' }
    ]);
    assert.deepEqual(Object.keys(weekly).sort(), ['dailyTasks', 'period', 'skills', 'writing']);
    assert.deepEqual(Object.keys(weekly.skills.听力).sort(), ['accuracy', 'masteredRate', 'reviewCorrect', 'reviewTotal']);
    const maxLengthWriting = await request('/api/writing/complete', {
      method: 'POST', body: JSON.stringify({ content: 'a'.repeat(5000) })
    });
    assert.equal(maxLengthWriting.content.length, 5000);
    const overLengthWritingResponse = await fetch(`${base}/api/writing/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'a'.repeat(5001) })
    });
    assert.equal(overLengthWritingResponse.status, 400);
    assert.deepEqual(await overLengthWritingResponse.json(), { error: '写作内容不能超过5000字' });
    console.log('✓ 写作内容校验断言通过：不带 content 返回 400，空记录未写入');
    console.log('✓ 写作长度边界断言通过：5000 字成功，5001 字返回 400');
    console.log(`✓ 写作完成接口断言通过：content 原文保存；最近7天完成 ${weekly.writing.completed} 次 / 目标 ${weekly.writing.target} 次`);
    console.log(`✓ 每周写作明细断言通过：返回 ${weekly.writing.records.length} 条 completed_at + content，最新内容 = ${JSON.stringify(weekly.writing.records[0].content)}`);
    console.log('✓ 每周复盘口径断言通过：每日任务听力 5/7、阅读 7/7、口语 6/7；四技能正确率 80%/33%/暂无/75%');
    console.log('✓ 纯数据响应断言通过：复盘响应只包含周期、任务、技能统计与写作次数');
    console.log('全部 SRS、三项每日任务、写作周记录与纯数据复盘测试通过。');
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
