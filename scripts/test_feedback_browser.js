'use strict';

// Headless Chrome + CDP, using Node's built-in WebSocket; no frontend build or test dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function feedbackBrowserTest(base, temp, cards) {
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

    await cdp('Runtime.enable'); await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp('Page.navigate', { url: base });
    await waitFor('!!document.querySelector("[data-go=numbers]")');
    const hiddenListening = async () => {
      assert.equal(await evaluate(`document.querySelectorAll('[data-go="listening"], [data-go="listening-practice"], [data-listening-id]').length`), 0);
    };
    const screenshot = async name => {
      await delay(300);
      const layout = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth})');
      assert.ok(layout.scroll <= layout.width && layout.body <= layout.width, JSON.stringify(layout));
      const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const target = process.env.NUMBER_SCREENSHOT_DIR || temp;
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, `${name}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`移动端 ${name}: ${JSON.stringify(layout)}，截图已生成`);
    };
    const notice = async kind => {
      assert.equal(await evaluate('document.querySelector(".practice-notice")?.textContent'), `⚠️ ${kind}练习模式，本轮不影响复习进度`);
      const visible = await evaluate(`(() => {const e=document.querySelector('.practice-notice'), r=e.getBoundingClientRect(), s=getComputedStyle(e);return s.position==='sticky' && s.display!=='none' && r.bottom>0 && r.top<innerHeight})()`);
      assert.ok(visible);
    };
    await hiddenListening();
    assert.equal(await evaluate('document.querySelector("#app").textContent.includes("听力真题练习")'), false);
    await screenshot('feedback-home');
    await mouseClick('[data-go="task-templates"]');
    await waitFor('!!document.querySelector("#add-task-template")');
    await screenshot('feedback-editor');
    await mouseClick('#add-task-template input'); await typeKeys('CDP task');
    await mouseClick('#add-task-template button');
    await waitFor('[...document.querySelectorAll("[data-template-id] input")].some(e=>e.value==="CDP task")');
    const templateId = await evaluate('[...document.querySelectorAll("[data-template-id]")].find(e=>e.elements.name.value==="CDP task").dataset.templateId');
    await evaluate(`document.querySelector('[data-template-id="${templateId}"] input').value='CDP renamed'`);
    await mouseClick(`[data-template-id="${templateId}"] [type=submit]`);
    await waitFor(`document.querySelector('[data-template-id="${templateId}"] [type=submit]')?.disabled===false`);
    await mouseClick('[data-go=home]');
    await waitFor('[...document.querySelectorAll("[data-task-id]")].some(e=>e.textContent.includes("CDP renamed"))');
    const taskId = await evaluate('[...document.querySelectorAll("[data-task-id]")].find(e=>e.textContent.includes("CDP renamed")).dataset.taskId');
    await mouseClick(`[data-task-id="${taskId}"]`);
    await waitFor(`document.querySelector('[data-task-id="${taskId}"]')?.getAttribute('aria-pressed')==='true'`);
    await mouseClick('[data-go=weekly]');
    await waitFor('!!document.querySelector(".task-stats")');
    assert.ok(await evaluate('document.querySelector(".task-stats").textContent.includes("CDP renamed")'));
    await hiddenListening();
    await screenshot('feedback-weekly');
    await mouseClick('[data-go=home]'); await waitFor('!!document.querySelector("[data-go=task-templates]")');
    await mouseClick('[data-go=task-templates]'); await waitFor('!!document.querySelector("#add-task-template")');
    await mouseClick(`[data-delete-template="${templateId}"]`);
    await waitFor(`!document.querySelector('[data-template-id="${templateId}"]')`);
    console.log('CDP 今日任务：真实鼠标添加、改名、勾选、复盘展示和删除通过');
    await evaluate("navigate('review')"); await waitFor('!!document.querySelector("#flip-scene")');
    assert.equal(await evaluate('!!document.querySelector(".practice-notice")'), false);
    await hiddenListening();
    await evaluate("state.practiceScope='all'; navigate('practice')");
    await waitFor('!!document.querySelector(".practice-notice")');
    await notice('自由');
    await screenshot('feedback-free');
    // Library is newest-first; spelling is the newest fixture.
    await mouseClick('#spelling-answer'); await typeKeys('answer');
    await mouseClick('#spelling-form button');
    await waitFor('!!document.querySelector("#spelling-result:not([hidden])")');
    await notice('自由');
    await mouseClick('#spelling-next'); await waitFor('!!document.querySelector("#flip-scene")');
    await mouseClick('#flip-scene'); await notice('自由');
    await mouseClick('[data-result=correct]'); await waitFor('!!document.querySelector("#repeat-practice")');
    await notice('自由');
    console.log('CDP 自由练习：进入、拼写提交、下一张、翻卡及完成页提示持续可见');
    for (const card of cards) {
      await evaluate("navigate('library')"); await waitFor(`!!document.querySelector('[data-practice-card="${card.id}"]')`);
      await mouseClick(`[data-practice-card="${card.id}"]`);
      await waitFor('!!document.querySelector(".practice-notice")'); await notice('单卡');
      await screenshot(`feedback-single-${card.review_mode}`);
      if (card.review_mode === 'spelling') {
        await mouseClick('#spelling-answer'); await typeKeys('wrong');
        await mouseClick('#spelling-form button'); await waitFor('!!document.querySelector("#spelling-result:not([hidden])")');
        await notice('单卡'); await mouseClick('#spelling-next');
      } else {
        await mouseClick('#flip-scene'); await notice('单卡'); await mouseClick('[data-result=correct]');
      }
      await waitFor('!!document.querySelector("#repeat-practice")'); await notice('单卡');
    }
    console.log('CDP 单卡练习：卡片库真实点击、翻卡/拼写提交和完成页提示持续可见；正式复习无提示');
    await evaluate("navigate('listening')"); await waitFor('!!document.querySelector("[data-go=numbers]")');
    await hiddenListening();
    for (const page of ['home', 'entry', 'library', 'progress', 'weekly', 'numbers']) {
      await evaluate(`navigate('${page}')`); await hiddenListening();
    }
    assert.deepEqual(errors, []);
    console.log('CDP 真题入口：首页、导航、各可达页面无入口，旧导航目标回到首页，控制台异常0');
    console.log('全部三项反馈真实CDP浏览器验收通过。');
  } finally {
    socket?.close();
    if (child.exitCode === null) { child.kill(); await Promise.race([once(child, 'exit'), delay(5000)]); }
  }
}
module.exports = { feedbackBrowserTest };
