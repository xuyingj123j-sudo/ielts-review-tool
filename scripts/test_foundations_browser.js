'use strict';

// Headless Chrome + CDP, using Node's built-in WebSocket; no frontend build or test dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function foundationsBrowserTest(base, temp, fixtures) {
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
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__spoken=[]; window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
      Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{lang:'en-GB',name:'Test English'}],cancel(){},speak(u){window.__spoken.push(u.text)},addEventListener(){}}});` });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const screenshot = async name => {
      await delay(300);
      const layout = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth})');
      assert.ok(layout.scroll <= layout.width && layout.body <= layout.width, JSON.stringify(layout));
      const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const target = process.env.FOUNDATIONS_SCREENSHOT_DIR || temp;
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, `${name}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`CDP_SCREENSHOT ${name}: ${JSON.stringify(layout)}`);
    };
    await cdp('Page.navigate', { url: base });
    await waitFor('!!document.querySelector("[data-go=foundations]")');
    assert.equal(await evaluate('!!document.querySelector("[data-go=numbers]")'), false);
    await mouseClick('[data-go=foundations]');
    await waitFor('!!document.querySelector(".foundations-page")');
    const entries = await evaluate('[...document.querySelectorAll("[data-foundation]")].map(e=>({text:e.textContent,disabled:e.disabled}))');
    assert.equal(entries.length, 4); assert.equal(entries.filter(e => e.disabled).length, 0);
    assert.deepEqual(entries.map(e => e.text.trim()), ['数字专项→', '拼写专项→', '同义替换专项→', '答案预测专项→']);
    assert.equal(await evaluate('/连读弱读|能力分析|我的错题/.test(document.querySelector(".foundations-page").textContent)'), false);
    console.log('CDP_FOUNDATIONS=' + JSON.stringify(entries));
    await screenshot('foundations-390');
    await mouseClick('[data-foundation=numbers]');
    await waitFor('!!document.querySelector("#number-start")');
    assert.ok(await evaluate('!!document.querySelector("#number-mistakes")'));
    console.log('CDP_NAV: home -> foundations; four drills active; numbers -> existing module with its own mistakes entry');

    // Formal review previews every due card with clear answers before preserving the existing blind queue.
    await evaluate("navigate('home')"); await waitFor('!!document.querySelector(".nav-item[data-page=review]")');
    await mouseClick('.nav-item[data-page=review]');
    await waitFor('!!document.querySelector(".review-preview")');
    const previewCards = await evaluate("api('/api/review/queue/preview')");
    const previewRows = await evaluate(`([...document.querySelectorAll('.review-preview-item')].map(row => ({ id: Number(row.dataset.previewCard), text: row.textContent })))`);
    assert.deepEqual(previewRows.map(row => row.id), previewCards.map(card => card.id));
    for (const card of previewCards) {
      const row = previewRows.find(item => item.id === card.id);
      assert.ok(row.text.includes(card.front)); assert.ok(row.text.includes(card.back));
    }
    const firstPreviewCard = previewCards[0];
    assert.equal(firstPreviewCard.review_mode, 'spelling');
    await mouseClick('#review-preview-start');
    await waitFor('!!document.querySelector("#spelling-form")');
    assert.equal(await evaluate('document.querySelector(".spelling-card h2").textContent'), firstPreviewCard.front);
    assert.equal(await evaluate(`document.querySelector('.review-wrap').textContent.includes(${JSON.stringify(firstPreviewCard.back)})`), false);
    console.log(`CDP_FORMAL_PREVIEW: ${previewCards.length} due cards show front+back; start test -> spelling blind UI; hidden answer=${JSON.stringify(firstPreviewCard.back)}`);

    // Single-card and free-practice entry points retain their direct self-test behavior.
    await evaluate("navigate('library')"); await waitFor(`!!document.querySelector('[data-practice-card="${fixtures.spellingId}"]')`);
    await mouseClick(`[data-practice-card="${fixtures.spellingId}"]`);
    await waitFor('document.querySelector("h1")?.textContent==="单卡练习"');
    assert.equal(await evaluate('!!document.querySelector(".review-preview")'), false);
    const savedReviewDates = fixtures.service.db.connection.prepare('SELECT id, next_review_date FROM cards').all();
    fixtures.service.db.connection.prepare("UPDATE cards SET next_review_date='2999-12-31'").run();
    await evaluate("navigate('review')");
    await waitFor('document.querySelector("h2")?.textContent==="今天已经清空啦"');
    assert.equal(await evaluate('!!document.querySelector(".review-preview")'), false);
    await mouseClick('[data-start-practice=all]');
    await waitFor('document.querySelector("h1")?.textContent==="自由练习"');
    assert.equal(await evaluate('!!document.querySelector(".review-preview")'), false);
    const restoreReviewDate = fixtures.service.db.connection.prepare('UPDATE cards SET next_review_date=? WHERE id=?');
    fixtures.service.db.connection.transaction(rows => rows.forEach(row => restoreReviewDate.run(row.next_review_date, row.id)))(savedReviewDates);
    console.log('CDP_REVIEW_BOUNDARIES: zero due -> direct empty state; single/free practice -> direct existing test UI; no preview page');

    await evaluate("navigate('spelling')");
    await waitFor('document.querySelectorAll("[data-spelling-category]").length===5');
    const categories = await evaluate('[...document.querySelectorAll("[data-spelling-category]")].map(e=>e.textContent)');
    assert.deepEqual(categories.map(t => t.trim().replace(/\s*→$/, '')), ['A · 人名地名','B · 星期月份日期','C · 高频答案词','D · 高频场景词','我的错词']);
    console.log('CDP_SPELLING_CATEGORIES=' + JSON.stringify(categories));
    await screenshot('spelling-390');
    await mouseClick('[data-spelling-category=name_place]');
    await waitFor('!!document.querySelector("#foundation-spelling-form")');
    assert.equal(await evaluate('document.querySelector("#spelling-practice").dataset.cardId'), String(fixtures.spellingId));
    const snapshot = fixtures.service.db.getCard(fixtures.spellingId);
    const countLogs = fixtures.service.db.connection.prepare('SELECT COUNT(*) n FROM review_logs').get().n;
    await screenshot('spelling-before-play');
    await mouseClick('.speech-button');
    assert.equal(await evaluate('window.__spoken.at(-1)'), 'A');
    await mouseClick('#foundation-spelling-answer'); await typeKeys('wrong');
    await mouseClick('#foundation-spelling-form button');
    await waitFor('!!document.querySelector("#foundation-spelling-result:not([hidden])")');
    assert.ok(await evaluate('document.querySelector("#foundation-spelling-result").textContent.includes("正确答案：A")'));
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#foundation-spelling-form")).display'), 'none');
    assert.deepEqual(fixtures.service.db.getCard(fixtures.spellingId), snapshot);
    assert.equal(fixtures.service.db.connection.prepare('SELECT COUNT(*) n FROM review_logs').get().n, countLogs);
    await screenshot('spelling-answer-390');
    console.log('CDP_SPELLING: actual mouse play -> speechSynthesis.speak("A"); keyboard answer -> read-only practice; correct answer displayed; card/logs unchanged');
    fixtures.service.reviewSpelling(fixtures.spellingId, { answer: 'wrong' });
    const mistakes = fixtures.service.spellingCards({ mistakes: 'true' });
    assert.ok(mistakes.some(c => c.id === fixtures.spellingId));
    // Isolate this card in the fixture to prove the wrong-word page actually renders it.
    const otherCards = fixtures.service.db.spellingCards(null, true).filter(c => c.id !== fixtures.spellingId);
    for (const card of otherCards) fixtures.service.reviewSpelling(card.id, { answer: fixtures.service.db.getCard(card.id).back });
    await mouseClick('#spelling-back'); await mouseClick('[data-spelling-category=mistakes]');
    await waitFor(`document.querySelector('#spelling-practice')?.dataset.cardId==='${fixtures.spellingId}'`);
    console.log('CDP_MY_MISTAKES: recently incorrect spelling card rendered, id=' + fixtures.spellingId);
    for (const width of [320, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      for (const page of ['foundations', 'spelling']) {
        await evaluate(`navigate('${page}')`); await waitFor(`!!document.querySelector('.${page}-page')`);
        await screenshot(`${page}-${width}`);
      }
    }
    // Existing entry/edit form category control and preservation.
    await evaluate("navigate('entry')"); await waitFor('!!document.querySelector("#review-mode")');
    assert.equal(await evaluate('document.querySelector("#spelling-category-field").hidden'), true);
    await mouseClick('#review-mode');
    assert.equal(await evaluate('document.querySelector("#spelling-category-field").hidden'), false);
    assert.equal(await evaluate('document.querySelector("#spelling-category").options.length'), 5);
    await evaluate(`state.editingId=${fixtures.spellingId}; navigate('entry')`);
    await waitFor('document.querySelector("#spelling-category")?.value==="name_place"');
    console.log('CDP_ENTRY: category hidden for flip; four optional categories for spelling; existing category restored on edit');
    // Formal spelling marking is only offered for listening and only on incorrect results.
    await evaluate(`(async () => {state.reviewKind='formal'; state.queue=[await api('/api/practice/cards/${fixtures.spellingId}')]; state.reviewIndex=0; renderCurrentReview()})()`);
    await mouseClick('#spelling-answer'); await typeKeys('wrong'); await mouseClick('#spelling-form button');
    await waitFor('!!document.querySelector(".error-type")');
    await evaluate(`document.querySelector('.error-type').value='SPELLING';document.querySelector('.error-type').dispatchEvent(new Event('change'))`);
    await waitFor('document.querySelector(".error-type")?.disabled===false');
    const latest = fixtures.service.db.connection.prepare('SELECT * FROM review_logs WHERE card_id=? ORDER BY id DESC LIMIT 1').get(fixtures.spellingId);
    assert.equal(latest.error_type, 'SPELLING');
    const flip = fixtures.service.createCard({ skill: '听力', type: '听力误听', front: 'sample', back: 'answer' });
    await evaluate(`(async () => {state.reviewKind='formal'; state.queue=[await api('/api/practice/cards/${flip.id}')]; state.reviewIndex=0; renderCurrentReview()})()`);
    await mouseClick('#flip-scene'); await mouseClick('[data-result=incorrect]');
    await waitFor('!!document.querySelector("#review-error-next") && !!document.querySelector(".error-type")');
    await mouseClick('#review-error-next');
    await waitFor('document.querySelector("h1")?.textContent==="本轮完成"');
    console.log('CDP_FLIP: listening incorrect has optional error picker; skip advances to completion');
    for (const skill of ['阅读','口语','写作']) {
      const card = fixtures.service.createCard({ skill, type: '生词', front: 'sample', back: 'answer' });
      await evaluate(`(async () => {state.reviewKind='formal'; state.queue=[await api('/api/practice/cards/${card.id}')]; state.reviewIndex=0; renderCurrentReview()})()`);
      await mouseClick('#flip-scene'); await mouseClick('[data-result=incorrect]');
      await waitFor('document.querySelector("h1")?.textContent==="本轮完成"');
      assert.equal(await evaluate('!!document.querySelector(".error-type")'), false);
    }
    console.log('CDP_REVIEW: listening spelling incorrect -> PUT SPELLING saved; other three skills -> no error picker');
    await cdp('Page.navigate', { url: `${base}/#listening-attempt/${fixtures.attemptId}` });
    await waitFor('document.querySelectorAll(".listening-item").length===2');
    assert.equal(await evaluate('document.querySelectorAll(".item-error-picker").length'), 1);
    await waitFor('!!document.querySelector(".error-type")');
    await evaluate(`document.querySelector('.error-type').value='PARAPHRASE';document.querySelector('.error-type').dispatchEvent(new Event('change'))`);
    await waitFor('document.querySelector(".error-type")?.disabled===false');
    assert.equal(fixtures.service.db.listeningItem(fixtures.attemptId, 1).error_type, 'PARAPHRASE');
    await mouseClick('[data-collect]');
    await waitFor('!!document.querySelector(".collect-dialog[open]")');
    const defaults = await evaluate(`Object.fromEntries(new FormData(document.querySelector('.collect-dialog form')))`);
    assert.equal(defaults.back, 'tower'); assert.equal(defaults.note, 'flower'); assert.equal(defaults.type, '听力误听'); assert.ok(defaults.front.includes('tower'));
    await screenshot('collect-form-390');
    await evaluate(`document.querySelector('.collect-dialog [name=type]').value='同义替换'`);
    await mouseClick('.collect-dialog [type=submit]');
    await waitFor('document.querySelector("[data-collect]")?.disabled===true');
    const collectedId = fixtures.service.db.listeningItem(fixtures.attemptId, 1).collected_card_id;
    assert.equal(fixtures.service.db.getCard(collectedId).source, 'real_error');
    assert.equal(fixtures.service.db.getCard(collectedId).type, '同义替换');
    await cdp('Page.reload');
    await waitFor('document.querySelector("[data-collect]")?.disabled===true');
    await waitFor('document.querySelector(".error-type")?.value==="PARAPHRASE"');
    await screenshot('listening-items-390');
    console.log('CDP_LISTENING: bookmarked result survives reload; wrong-only picker PUT saved; editable context/back/note/type defaults; collected source=real_error; duplicate button disabled after reload');
    assert.deepEqual(errors, []);
    console.log('CDP_EXCEPTIONS=[]; FOUNDATIONS_BROWSER=PASS');
  } finally {
    socket?.close();
    if (child.exitCode === null) { child.kill(); await Promise.race([once(child, 'exit'), delay(5000)]); }
  }
}
module.exports = { foundationsBrowserTest };

