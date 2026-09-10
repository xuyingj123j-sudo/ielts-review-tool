'use strict';

// Headless Chrome + CDP, using Node's built-in WebSocket; no frontend build or test dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function accessBrowserTest(base, temp) {
  const executable = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].find(filename => fs.existsSync(filename));
  assert.ok(executable, '设置 CHROME_PATH 指向 Chrome/Edge，移动端验收不可跳过');
  assert.equal(typeof WebSocket, 'function', '浏览器验收需要 Node 22+ 内置 WebSocket');
  const profile = path.join(temp, 'chrome-profile');
  const child = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
    assert.ok(fs.existsSync(portFile), 'Chrome调试端口未就绪');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open');
    let id = 0;
    const pending = new Map(); const errors = [];
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
      if (data.id && pending.has(data.id)) { const item = pending.get(data.id); pending.delete(data.id); clearTimeout(item.timer); data.error ? item.reject(new Error(JSON.stringify(data.error))) : item.resolve(data.result); }
    });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => { pending.delete(current); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(current, { resolve, reject, timer }); socket.send(JSON.stringify({ id: current, method, params }));
    });
    const evaluate = async expression => {
      const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = async expression => {
      for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
      throw new Error(`浏览器等待失败: ${expression}`);
    };
    const mouseClick = async selector => {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
      await delay(300);
      const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    };
    const typeKeys = async text => {
      for (const key of text) {
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key });
      }
    };

    const requests = [];
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.method === 'Network.requestWillBeSent' && data.params.request.url.startsWith(`${base}/api/`)) {
        requests.push(data.params.request);
      }
    });
    await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp('Page.navigate', { url: base });
    await waitFor('!!document.querySelector("#access-token-dialog[open]")');
    assert.equal(await evaluate('localStorage.getItem("ielts_access_token")'), null);
    assert.equal(await evaluate('document.querySelectorAll("#access-token-dialog").length'), 1);
    assert.equal(await evaluate('document.activeElement.id'), 'access-token-input');
    const layout = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,dialog:getComputedStyle(document.querySelector("#access-token-dialog")).backgroundColor})');
    assert.ok(layout.scroll <= layout.width);
    assert.equal(layout.dialog, 'rgb(253, 246, 242)');
    console.log(`CDP 首次401：单一全屏口令框、自动聚焦、localStorage为空，移动布局 ${JSON.stringify(layout)}`);
    await typeKeys('wrong-secret'); await mouseClick('#access-token-dialog button');
    await waitFor('!!document.querySelector("#access-token-dialog[open]") && document.querySelector("#access-token-input").value === ""');
    assert.equal(await evaluate('localStorage.getItem("ielts_access_token")'), null);
    console.log('CDP 错误口令：重试401后清除localStorage并重新提示');
    await typeKeys('test-secret-123'); await mouseClick('#access-token-dialog button');
    await waitFor('!!document.querySelector("[data-go=numbers]") && !document.querySelector("#access-token-dialog")');
    assert.equal(await evaluate('localStorage.getItem("ielts_access_token")'), 'test-secret-123');
    console.log('CDP 正确口令：真实键盘/鼠标输入，localStorage保存，失败GET自动重试且首页渲染');
    requests.length = 0;
    await cdp('Page.reload', { ignoreCache: true });
    await waitFor('!!document.querySelector("[data-go=numbers]")');
    assert.equal(await evaluate('!!document.querySelector("#access-token-dialog")'), false);
    assert.ok(requests.length > 0);
    const requestToken = request => Object.entries(request.headers).find(([key]) => key.toLowerCase() === 'x-access-token')?.[1];
    assert.ok(requests.every(request => requestToken(request) === 'test-secret-123'));
    console.log(`CDP 刷新记忆：${requests.length}个API请求均携带正确X-Access-Token，不再弹框`);
    // Exercise a real UI POST with stale credentials; ensure its original JSON survives retry.
    await evaluate('localStorage.setItem("ielts_access_token", "expired-secret")');
    await mouseClick('[data-go=numbers]'); await mouseClick('#number-start');
    await waitFor('!!document.querySelector("#access-token-dialog[open]")');
    assert.equal(await evaluate('localStorage.getItem("ielts_access_token")'), null);
    await typeKeys('test-secret-123'); await mouseClick('#access-token-dialog button');
    await waitFor('!!document.querySelector("#number-form")');
    const posts = requests.filter(request => request.url.endsWith('/api/numbers/question'));
    assert.equal(posts.length, 2);
    assert.deepEqual(posts.map(requestToken), ['expired-secret', 'test-secret-123']);
    assert.equal(posts[0].postData, posts[1].postData);
    assert.equal(posts[1].method, 'POST');
    assert.equal(await evaluate('!!document.querySelector("#access-token-dialog")'), false);
    assert.deepEqual(errors, []);
    console.log(`CDP 过期口令POST：清旧值后输入并重试，method/body保留 ${posts[1].postData}，练习页成功显示`);
    console.log('全部访问口令真实CDP浏览器验收通过。');
  } finally {
    socket?.close();
    if (child.exitCode === null) { child.kill(); await Promise.race([once(child, 'exit'), delay(5000)]); }
  }
}
module.exports = { accessBrowserTest };
