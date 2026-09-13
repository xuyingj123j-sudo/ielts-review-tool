'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function predictionBrowserTest(base, temp, service) {
  const executable = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].find(filename => fs.existsSync(filename));
  assert.ok(executable, '设置 CHROME_PATH 指向 Chrome/Edge，答案预测 CDP 验收不可跳过');
  assert.equal(typeof WebSocket, 'function', '浏览器验收需要 Node 22+ 内置 WebSocket');
  const profile = path.join(temp, 'prediction-chrome-profile');
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
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const assertMobileLayout = async label => {
      await delay(300);
      const layout = await evaluate('({viewportWidth:innerWidth,htmlScrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth})');
      assert.ok(layout.htmlScrollWidth <= layout.viewportWidth && layout.bodyScrollWidth <= layout.viewportWidth, JSON.stringify(layout));
      const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(temp, `${label}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`CDP_MOBILE ${label}: ${JSON.stringify({ ...layout, hasHorizontalOverflow: false })}`);
    };

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__spoken=[]; window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
      Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{lang:'en-GB',name:'Test English'}],cancel(){},speak(u){window.__spoken.push(u.text)},addEventListener(){}}});` });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp('Page.navigate', { url: base });
    await waitFor('!!document.querySelector("[data-go=foundations]")');
    await click('[data-go=foundations]');
    await waitFor('!!document.querySelector("[data-foundation=prediction]:not([disabled])")');
    const entries = await evaluate('[...document.querySelectorAll("[data-foundation]")].map(node=>({title:node.querySelector(".number-label").textContent,target:node.dataset.foundation,disabled:node.disabled}))');
    assert.deepEqual(entries, [
      { title: '数字专项', target: 'numbers', disabled: false },
      { title: '拼写专项', target: 'spelling', disabled: false },
      { title: '同义替换专项', target: 'paraphrase', disabled: false },
      { title: '答案预测专项', target: 'prediction', disabled: false }
    ]);
    console.log(`✓ CDP 枢纽：${JSON.stringify(entries)}`);

    await click('[data-foundation=prediction]');
    await waitFor('!!document.querySelector("#prediction-start")');
    await click('#prediction-start');
    await waitFor('document.querySelector(".prediction-practice")?.dataset.step==="1"');
    const stepOne = await evaluate(`({
      typeButtons:[...document.querySelectorAll('[data-prediction-type]')].map(button=>button.dataset.predictionType),
      speaker:!!document.querySelector('#prediction-play'),
      input:!!document.querySelector('#prediction-answer'),
      blank:document.querySelector('.prediction-sentence').textContent
    })`);
    assert.deepEqual(stepOne.typeButtons, ['NUMBER', 'NOUN', 'VERB', 'ADJECTIVE', 'DATE', 'TIME', 'PLACE', 'NAME', 'OTHER']);
    assert.equal(stepOne.speaker, false);
    assert.equal(stepOne.input, false);
    assert.ok(stepOne.blank.includes('______'));
    await assertMobileLayout('prediction-step1-390');
    console.log(`✓ CDP STEP1：9类=${JSON.stringify(stepOne.typeButtons)}；speaker=${stepOne.speaker}；input=${stepOne.input}；blank=${JSON.stringify(stepOne.blank)}`);

    const question = [...service.pendingPredictionQuestions.values()].at(-1);
    assert.ok(question);
    await click(`[data-prediction-type="${question.answerType}"]`);
    await waitFor('document.querySelector(".prediction-practice")?.dataset.step==="2"');
    const stepTwo = await evaluate('({speaker:!!document.querySelector("#prediction-play"),input:!!document.querySelector("#prediction-answer"),typeButtons:document.querySelectorAll("[data-prediction-type]").length})');
    assert.deepEqual(stepTwo, { speaker: true, input: true, typeButtons: 0 });
    await click('#prediction-play');
    assert.equal(await evaluate('window.__spoken.at(-1)'), question.spokenText);
    await assertMobileLayout('prediction-step2-390');
    console.log(`✓ CDP STEP2：speaker=${stepTwo.speaker}；input=${stepTwo.input}；播放文本=${JSON.stringify(question.spokenText)}`);

    await evaluate(`document.querySelector('#prediction-answer').value=${JSON.stringify(question.correctAnswer)};document.querySelector('#prediction-form').requestSubmit()`);
    await waitFor('document.querySelectorAll(".prediction-feedback-row").length===2');
    const feedback = await evaluate('[...document.querySelectorAll(".prediction-feedback-row")].map(row=>({text:row.textContent.trim(),className:row.className}))');
    assert.equal(feedback[0].text.startsWith('预测：对'), true);
    assert.equal(feedback[1].text.startsWith('答案：对'), true);
    assert.ok(feedback.every(row => row.className.includes('correct')));
    assert.equal(await evaluate('document.querySelector(".prediction-complete-sentence").textContent.includes("完整原句")'), true);
    await assertMobileLayout('prediction-feedback-390');
    assert.deepEqual(exceptions, []);
    console.log(`✓ CDP 独立反馈：${JSON.stringify(feedback)}`);
    console.log('CDP_EXCEPTIONS=[]; PREDICTION_BROWSER=PASS');
  } finally {
    socket?.close();
    if (child.exitCode === null) { child.kill(); await Promise.race([once(child, 'exit'), delay(5000)]); }
  }
}

module.exports = { predictionBrowserTest };
