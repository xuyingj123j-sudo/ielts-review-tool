'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function paraphraseBrowserTest(base, temp, fixtures) {
  const executable = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].find(filename => fs.existsSync(filename));
  assert.ok(executable, '设置 CHROME_PATH 指向 Chrome/Edge，同义替换 CDP 验收不可跳过');
  assert.equal(typeof WebSocket, 'function', '浏览器验收需要 Node 22+ 内置 WebSocket');
  const profile = path.join(temp, 'paraphrase-chrome-profile');
  const child = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let index = 0; index < 100 && !fs.existsSync(portFile); index++) await delay(100);
    assert.ok(fs.existsSync(portFile), 'Chrome调试端口未就绪');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open');
    let id = 0;
    const pending = new Map();
    const exceptions = [];
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails.text);
      if (data.id && pending.has(data.id)) {
        const item = pending.get(data.id); pending.delete(data.id); clearTimeout(item.timer);
        data.error ? item.reject(new Error(JSON.stringify(data.error))) : item.resolve(data.result);
      }
    });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => { pending.delete(current); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(current, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: current, method, params }));
    });
    const evaluate = async expression => {
      const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = async expression => {
      for (let index = 0; index < 150; index++) { if (await evaluate(expression)) return; await delay(100); }
      throw new Error(`浏览器等待失败: ${expression}`);
    };
    const mouseClick = async selector => {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
      await delay(200);
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
    const screenshot = async name => {
      await delay(300);
      const layout = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,cardRadius:getComputedStyle(document.querySelector(".card")).borderRadius,background:getComputedStyle(document.body).backgroundColor})');
      assert.ok(layout.scroll <= layout.width && layout.body <= layout.width, JSON.stringify(layout));
      assert.equal(layout.cardRadius, '20px');
      assert.equal(layout.background, 'rgb(253, 246, 242)');
      const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const target = process.env.PARAPHRASE_SCREENSHOT_DIR || temp;
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, `${name}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`CDP_SCREENSHOT ${name}: ${JSON.stringify(layout)}`);
    };

    await cdp('Runtime.enable'); await cdp('Page.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__spoken=[]; window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
      Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{lang:'en-GB',name:'Test English'}],cancel(){},speak(u){window.__spoken.push(u.text)},addEventListener(){}}});` });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp('Page.navigate', { url: base });
    await waitFor('!!document.querySelector("[data-go=foundations]")');
    await mouseClick('[data-go=foundations]');
    await waitFor('!!document.querySelector("[data-foundation=paraphrase]:not([disabled])")');
    assert.equal(await evaluate(`!!document.querySelector('[data-foundation=prediction]:not([disabled])')`), true);
    await mouseClick('[data-foundation=paraphrase]');
    await waitFor('!!document.querySelector("#paraphrase-start")');
    assert.equal(await evaluate('document.querySelectorAll(".practice-notice").length'), 1);
    assert.equal(await evaluate('document.querySelector(".practice-notice").textContent.includes("专项自测，本轮不影响复习进度")'), true);
    await screenshot('paraphrase-home-390');
    await mouseClick('#paraphrase-start');
    await waitFor('!!document.querySelector("#paraphrase-form")');
    const cardId = Number(await evaluate('document.querySelector("#paraphrase-practice").dataset.cardId'));
    const card = fixtures.service.db.getCard(cardId);
    assert.equal(await evaluate('document.querySelector("#paraphrase-practice h2").textContent'), card.front);
    assert.equal(await evaluate('!!document.querySelector("#paraphrase-answer")'), true);
    assert.equal(await evaluate('document.querySelector(".practice-notice").textContent.includes("专项自测")'), true);
    const before = fixtures.service.db.getCard(cardId);
    const beforeLogs = fixtures.service.db.connection.prepare('SELECT COUNT(*) n FROM review_logs WHERE card_id=?').get(cardId).n;
    await mouseClick('#paraphrase-answer'); await typeKeys('wrong answer'); await mouseClick('#paraphrase-form button');
    await waitFor('!!document.querySelector("#paraphrase-result:not([hidden])")');
    assert.ok(await evaluate(`document.querySelector('#paraphrase-result').textContent.includes(${JSON.stringify(`正确答案：${card.back}`)})`));
    assert.equal(await evaluate('!!document.querySelector("#paraphrase-result .speech-button")'), true);
    await mouseClick('#paraphrase-result .speech-button');
    assert.equal(await evaluate('window.__spoken.at(-1)'), card.back);
    assert.equal(await evaluate('document.querySelector(".practice-notice").textContent.includes("专项自测")'), true);
    const noticeLayout = await evaluate(`(() => {const rect=document.querySelector('.practice-notice').getBoundingClientRect();return {top:rect.top,bottom:rect.bottom,height:rect.height,viewport:innerHeight}})()`);
    assert.ok(noticeLayout.bottom > 0 && noticeLayout.top < noticeLayout.viewport, JSON.stringify(noticeLayout));
    assert.deepEqual(fixtures.service.db.getCard(cardId), before);
    assert.equal(fixtures.service.db.connection.prepare('SELECT COUNT(*) n FROM review_logs WHERE card_id=?').get(cardId).n, beforeLogs);
    await screenshot('paraphrase-answer-390');
    console.log(`✓ CDP 同义替换练习：card=${cardId}；题干+输入框可见；提交后显示正确答案+朗读按钮；提示条视口位置=${JSON.stringify(noticeLayout)}；卡片/日志不变`);

    await mouseClick('#paraphrase-back'); await waitFor('!!document.querySelector("#paraphrase-mistakes")');
    await mouseClick('#paraphrase-mistakes');
    await waitFor(`document.querySelector('#paraphrase-practice')?.dataset.cardId==='${fixtures.wrongCardId}'`);
    assert.equal(await evaluate('document.querySelector("#paraphrase-practice h2").textContent'), fixtures.service.db.getCard(fixtures.wrongCardId).front);
    await screenshot('paraphrase-mistakes-390');
    for (const width of [320, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      await screenshot(`paraphrase-mistakes-${width}`);
    }
    assert.deepEqual(exceptions, []);
    console.log(`✓ CDP 我的错题：最近incorrect的听力同义替换卡 id=${fixtures.wrongCardId} 已渲染`);
    console.log('CDP_EXCEPTIONS=[]; PARAPHRASE_BROWSER=PASS');
  } finally {
    socket?.close();
    if (child.exitCode === null) { child.kill(); await Promise.race([once(child, 'exit'), delay(5000)]); }
  }
}

module.exports = { paraphraseBrowserTest };
