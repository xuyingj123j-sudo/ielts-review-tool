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
const { accessBrowserTest } = require('./scripts/test_access_browser');

async function main() {
  const previous = process.env.IELTS_ACCESS_TOKEN;
  process.env.IELTS_ACCESS_TOKEN = 'test-secret-123';
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-access-test-'));
  const db = new ReviewDatabase(path.join(temp, 'test.db'));
  const server = createApp(new ReviewService(db)).listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const curl = async (route, method, token, expected, body) => {
      const args = ['-sS', '--max-time', '10', '-X', method, '-w', '\n%{http_code}', `${base}${route}`];
      if (token !== undefined) args.push('-H', `X-Access-Token: ${token}`);
      if (body !== undefined) {
        // Windows curl argv may use the system code page; JSON Unicode escapes preserve UTF-8 data.
        args.push('-H', 'Content-Type: application/json', '--data-binary', body.replace(/[^\x00-\x7f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`));
      }
      const { stdout } = await promisify(execFile)(process.platform === 'win32' ? 'curl.exe' : 'curl', args, { windowsHide: true });
      const lines = stdout.trim().split('\n');
      assert.equal(Number(lines.pop()), expected, stdout);
      const text = lines.join('\n');
      if (expected === 401) assert.deepEqual(JSON.parse(text), { error: '未授权' });
      console.log(`curl ${method} ${route} [${token === undefined ? '无口令' : token === 'test-secret-123' ? '正确口令' : '错误口令'}] → ${expected} ${route.startsWith('/api/') ? text : '(静态资源响应体已收到)'}`);
      return route.startsWith('/api/') && text ? JSON.parse(text) : text;
    };
    const payload = JSON.stringify({ skill: '听力', type: '生词', front: 'access fixture', back: 'test' });
    for (const token of [undefined, 'wrong-secret']) {
      await curl('/api/cards', 'GET', token, 401);
      await curl('/api/cards', 'POST', token, 401, payload);
      await curl('/api/cards/1', 'PUT', token, 401, payload);
      await curl('/api/cards/1', 'DELETE', token, 401);
      await curl('/api/numbers/question', 'POST', token, 401, '{}');
      await curl('/api/unknown', 'OPTIONS', token, 401);
      await curl('/api/cards', 'POST', token, 401, '{invalid');
    }
    assert.equal(db.connection.prepare('SELECT COUNT(*) n FROM cards').get().n, 0);
    const card = await curl('/api/cards', 'POST', 'test-secret-123', 201, payload);
    const cards = await curl('/api/cards', 'GET', 'test-secret-123', 200);
    assert.equal(cards[0].id, card.id);
    assert.equal(cards[0].front, 'access fixture');
    await curl(`/api/cards/${card.id}`, 'PUT', 'test-secret-123', 200, payload);
    await curl(`/api/cards/${card.id}`, 'DELETE', 'test-secret-123', 204);
    for (const route of ['/', '/styles.css', '/app.js', '/numbers.js', '/manifest.json', '/sw.js']) {
      assert.ok((await curl(route, 'GET', undefined, 200)).length > 0);
    }
    await accessBrowserTest(base, temp);
    console.log('全部访问口令curl及浏览器验收通过。');
  } finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    db.close();
    if (previous === undefined) delete process.env.IELTS_ACCESS_TOKEN;
    else process.env.IELTS_ACCESS_TOKEN = previous;
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    console.log('访问口令测试服务器已关闭，临时数据库/profile已清理，即将自然退出。');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
