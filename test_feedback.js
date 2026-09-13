'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const Database = require('better-sqlite3');
const { ReviewDatabase } = require('./src/db');
const { ReviewService } = require('./src/services');
const { createApp } = require('./src/app');
const { feedbackBrowserTest } = require('./scripts/test_feedback_browser');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-feedback-test-'));
  let db, server;
  try {
    const filename = path.join(temp, 'legacy.db');
    const legacy = new Database(filename);
    legacy.exec(`CREATE TABLE daily_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, task_date TEXT NOT NULL,
      skill TEXT NOT NULL CHECK (skill IN ('听力','阅读','口语','写作')),
      done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)), completed_at TEXT,
      UNIQUE (task_date, skill));
      INSERT INTO daily_tasks VALUES (41,'2026-09-09','听力',1,'2026-09-09 12:00:00');
      INSERT INTO daily_tasks VALUES (42,'2026-09-09','写作',1,'2026-09-09 12:00:00');`);
    legacy.close();
    db = new ReviewDatabase(filename);
    assert.deepEqual(db.taskTemplates().map(t => [t.name, t.sort_order, t.active]), [['听力', 1, 1], ['阅读', 2, 1], ['口语', 3, 1]]);
    const old = db.connection.prepare('SELECT * FROM daily_tasks ORDER BY id').all();
    assert.equal(old[0].id, 41); assert.equal(old[0].done, 1); assert.equal(old[0].task_template_id, 1);
    assert.equal(old[1].id, 42); assert.equal(old[1].skill, '写作');
    db.migrate(); assert.equal(db.taskTemplates().length, 3);
    let now = new Date('2026-09-10T12:00:00');
    const service = new ReviewService(db, () => now);
    server = createApp(service).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    let base = `http://127.0.0.1:${server.address().port}`;
    const curl = async (route, method = 'GET', body, expected = method === 'POST' ? 201 : method === 'DELETE' ? 204 : 200) => {
      const args = ['-sS', '--max-time', '10', '-X', method, '-w', '\n%{http_code}', `${base}${route}`];
      if (body !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(body).replace(/[^\x00-\x7f]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`));
      const { stdout } = await promisify(execFile)(process.platform === 'win32' ? 'curl.exe' : 'curl', args, { windowsHide: true });
      const lines = stdout.trim().split('\n');
      assert.equal(Number(lines.pop()), expected, stdout);
      const text = lines.join('\n');
      console.log(`curl ${method} ${route} → ${expected} ${text}`);
      return text ? JSON.parse(text) : null;
    };
    assert.deepEqual((await curl('/api/tasks/today')).map(t => t.name), ['听力', '阅读', '口语']);
    const ids = service.todayTasks().map(t => t.id);
    assert.deepEqual(service.todayTasks().map(t => t.id), ids);
    console.log('✓ 迁移：默认三项顺序/状态不变，旧任务ID/完成时间及历史写作保留，重复启动/访问幂等');
    await curl('/api/tasks/templates');
    for (const name of ['', '  ', 42]) await curl('/api/tasks/templates', 'POST', { name }, 400);
    const template = await curl('/api/tasks/templates', 'POST', { name: '精读一篇文章' });
    const task = (await curl('/api/tasks/today')).find(t => t.task_template_id === template.id);
    assert.ok(task);
    assert.equal((await curl(`/api/tasks/${task.id}/toggle`, 'POST', undefined, 200)).done, true);
    assert.equal((await curl(`/api/tasks/${task.id}/toggle`, 'POST', undefined, 200)).done, false);
    await curl(`/api/tasks/${task.id}/toggle`, 'POST', undefined, 200);
    db.connection.prepare('INSERT INTO daily_tasks (task_date, task_template_id, done, completed_at) VALUES (?, ?, 1, ?)').run('2026-09-09', template.id, '2026-09-09 13:00:00');
    assert.deepEqual((await curl('/api/stats/weekly')).dailyTasks['精读一篇文章'], { completedDays: 2, targetDays: 7 });
    await curl(`/api/tasks/templates/${template.id}`, 'PUT', { name: '精读并摘录' });
    assert.equal(service.todayTasks().find(t => t.id === task.id).name, '精读并摘录');
    assert.deepEqual((await curl('/api/stats/weekly')).dailyTasks['精读并摘录'], { completedDays: 2, targetDays: 7 });
    const yesterday = db.connection.prepare('SELECT * FROM daily_tasks WHERE task_template_id = ? AND task_date = ?').get(template.id, '2026-09-09');
    await curl(`/api/tasks/templates/${template.id}`, 'DELETE');
    assert.ok(!(await curl('/api/tasks/today')).some(t => t.id === task.id));
    assert.deepEqual(db.connection.prepare('SELECT * FROM daily_tasks WHERE id = ?').get(yesterday.id), yesterday);
    assert.deepEqual((await curl('/api/stats/weekly')).dailyTasks['精读并摘录'], { completedDays: 1, targetDays: 7 });
    await curl(`/api/tasks/${task.id}/toggle`, 'POST', undefined, 404);
    await curl(`/api/tasks/templates/${template.id}`, 'PUT', { name: '不能复活' }, 404);
    await curl('/api/tasks/templates/no-id', 'DELETE', undefined, 400);
    for (const t of db.taskTemplates()) await curl(`/api/tasks/templates/${t.id}`, 'DELETE');
    assert.deepEqual(await curl('/api/tasks/today'), []);
    db.migrate(); assert.deepEqual(db.taskTemplates(), []);
    now = new Date('2026-09-11T12:00:00');
    assert.deepEqual(service.todayTasks(), []);
    const replacement = service.createTaskTemplate({ name: '精读并摘录' });
    assert.notEqual(replacement.id, template.id);
    assert.equal(service.todayTasks().length, 1);
    assert.deepEqual(service.weeklyStats().dailyTasks['精读并摘录'], { completedDays: 1, targetDays: 7 });
    const special = service.createTaskTemplate({ name: '__proto__' });
    service.todayTasks();
    assert.deepEqual(service.weeklyStats().dailyTasks.__proto__, { completedDays: 0, targetDays: 7 });
    service.deleteTaskTemplate(special.id);
    console.log('✓ 模板增删改/勾选/取消、历史改名与删除保留、重复名称无漏项、特殊名称、全删不补种及次日不生成通过');
    const overview = await curl('/api/listening/overview');
    assert.equal(overview.stages.length, 4);
    const cards = ['flip', 'spelling'].map(review_mode => service.createCard({ skill: '听力', type: '生词', front: `feedback ${review_mode}`, back: 'answer', review_mode }));
    const beforePractice = db.connection.prepare('SELECT * FROM cards ORDER BY id').all();
    await feedbackBrowserTest(base, temp, cards);
    assert.deepEqual(db.connection.prepare('SELECT * FROM cards ORDER BY id').all(), beforePractice);
    assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM review_logs').get().n, 0);
    console.log('✓ 浏览器自由/单卡练习前后卡片及SRS完全不变，review_logs=0');
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    server = null;
    db.close(); db = null;
    // Verify a real local database copy; never open the user database through migrating code.
    const sourcePath = path.join(__dirname, 'data', 'ielts.db');
    const source = new Database(sourcePath, { readonly: true });
    const snapshot = connection => Object.fromEntries(['cards', 'review_logs', 'writing_completions', 'listening_tests', 'listening_sections', 'listening_attempts', 'number_drill_attempts'].map(table => [table, connection.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
    const before = snapshot(source);
    const oldTasks = source.prepare('SELECT * FROM daily_tasks ORDER BY id').all();
    try { await source.backup(path.join(temp, 'real-copy.db')); } finally { source.close(); }
    db = new ReviewDatabase(path.join(temp, 'real-copy.db'));
    assert.deepEqual(snapshot(db.connection), {
      ...before,
      cards: before.cards.map(row => ({ source: 'manual', spelling_category: null, ...row })),
      review_logs: before.review_logs.map(row => ({ error_type: null, ...row })),
      number_drill_attempts: before.number_drill_attempts.map(row => ({ error_type: null, resolved: 0, ...row }))
    });
    for (const task of oldTasks) {
      const migrated = db.connection.prepare('SELECT * FROM daily_tasks WHERE id = ?').get(task.id);
      for (const [key, value] of Object.entries(task)) assert.equal(migrated[key], value);
    }
    assert.equal(db.connection.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(db.connection.pragma('foreign_key_check'), []);
    server = createApp(new ReviewService(db)).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const realOverview = await curl('/api/listening/overview');
    assert.equal(realOverview.stages.flatMap(stage => stage.sections).length, before.listening_sections.length);
    console.log(`✓ 真实库副本迁移：${before.cards.length}张卡片、${oldTasks.length}条旧任务、写作及全部听力/数字数据逐行不变；integrity_check=ok，foreign_key_check=[]`);
    console.log('全部三项用户反馈验收通过。');
  } finally {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    db?.close();
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    console.log('反馈测试服务器/浏览器已关闭，临时数据库/profile已清理，即将自然退出。');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
