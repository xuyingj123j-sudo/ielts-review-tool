'use strict';

// Headless Chrome + CDP, using Node's built-in WebSocket; no frontend build or test dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function browserTest(base, temp, service) {
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
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
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
    const playbackInput = async () => {
      await evaluate('window.originalNumberInput=document.querySelector("#number-answer")');
      for (const [addition, expected] of [['48', '48'], ['29', '4829']]) {
        await mouseClick('#number-play');
        await typeKeys(addition);
        const state = await evaluate(`(() => {const input=document.querySelector('#number-answer');return {same:input===originalNumberInput,disabled:input.disabled,readonly:input.readOnly,focused:document.activeElement===input,value:input.value}})()`);
        console.log(`真实鼠标播放后逐字输入: ${JSON.stringify(state)}`);
        assert.deepEqual(state, { same: true, disabled: false, readonly: false, focused: true, value: expected });
      }
    };
    const screenshot = async (name, captureBeyondViewport = true) => {
      await delay(300); // Wait for the existing page-in animation before visual evidence.
      const overflow = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth})');
      assert.ok(overflow.scroll <= overflow.width && overflow.body <= overflow.width, JSON.stringify(overflow));
      const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport });
      const target = process.env.NUMBER_SCREENSHOT_DIR || temp;
      // An optional caller-owned directory is used only for visual review; caller cleans it afterwards.
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, `${name}.png`), Buffer.from(result.data, 'base64'));
      console.log(`移动端 ${name}: ${JSON.stringify(overflow)}，截图已生成`);
    };
    await cdp('Runtime.enable'); await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp('Page.navigate', { url: base });
    await waitFor('!!document.querySelector("[data-go=numbers]")');
    await screenshot('home');
    await click('[data-go=numbers]');
    assert.equal(await evaluate('[...document.querySelectorAll("[data-subtype]")].filter(button => button.dataset.subtype).length'), 10);
    assert.equal(await evaluate('document.querySelectorAll("[data-category]").length'), 14);
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".number-tile")).borderRadius'), '20px');
    assert.equal(await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--coral").trim()'), '#FF8A65');
    const palette = { number: '#FF8A65', date: '#FF6B6B', time: '#5B9DFF', money: '#3CBE8B', phone: '#9C8CFB', mixed: '#8E8A94' };
    for (const [category, hex] of Object.entries(palette)) {
      assert.equal(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--num-${category}').trim()`), hex);
    }
    const assertIcon = async (selector, category, icon) => {
      const actual = await evaluate(`(() => {
        const element=document.querySelector(${JSON.stringify(selector)});
        const probe=document.createElement('span');probe.style.backgroundColor='var(--num-${category})';document.body.append(probe);
        const expected=getComputedStyle(probe).backgroundColor;probe.remove();
        return {background:getComputedStyle(element).backgroundColor,expected,icon:element.textContent};
      })()`);
      assert.equal(actual.background, actual.expected, selector);
      assert.equal(actual.icon, icon, selector);
      console.log(`颜色 ${category} ${palette[category]} ${icon}: ${actual.background} = CSS变量渲染色`);
    };
    for (const [category, icon] of Object.entries({ date: '📅', time: '🕐', money: '💰', phone: '📞' })) {
      await assertIcon(`[data-category="${category}"][data-subtype=""] .number-icon`, category, icon);
    }
    for (const [subtype, category, icon] of [
      ['mixed', 'mixed', '🔀'], ['general', 'number', '#'], ['money', 'money', '💰'], ['phone', 'phone', '📞'],
      ['birthday', 'date', '🎂'], ['date_of_birth', 'date', '👶'], ['deadline', 'date', '⏰'],
      ['anniversary', 'date', '💍'], ['movie_release', 'date', '🎬'], ['date', 'date', '📅']
    ]) await assertIcon(`[data-subtype="${subtype}"] .number-icon`, category, icon);
    await assertIcon('.number-hero .number-icon', 'number', '#');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#number-start")).backgroundColor'), 'rgb(255, 138, 101)');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#number-exam")).backgroundImage'), 'linear-gradient(135deg, rgb(255, 177, 153), rgb(255, 143, 177))');
    console.log('✓ 分类颜色变量、14个进阶/对话图标实色、独立数字橙及考试渐变断言通过');
    await screenshot('numbers');
    await evaluate('document.querySelector("#number-exam").scrollIntoView({block:"center"})');
    await screenshot('numbers-categories', false);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true });
    await screenshot('numbers-320');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    // Mock only the operating system voice boundary; exercise the real speech.js and UI controls.
    await evaluate(`window.spoken=[]; window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}}; window.speechSynthesis.getVoices=()=>[{lang:'en-GB',name:'test'}]; window.speechSynthesis.cancel=()=>{}; window.speechSynthesis.speak=u=>window.spoken.push(u.text);`);
    await click('#number-start'); await waitFor('!!document.querySelector("#number-form")');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("#number-play")).backgroundColor'), 'rgb(255, 138, 101)');
    await playbackInput(); await mouseClick('#number-play');
    assert.equal(await evaluate('spoken.length'), 3);
    assert.match(await evaluate('spoken[0]'), /^\d{2,7}$/);
    await evaluate('document.querySelector("#number-answer").value=spoken[0];document.querySelector("#number-form").requestSubmit()');
    await waitFor('!!document.querySelector(".number-correct")');
    await click('#number-next'); await waitFor('!!document.querySelector("#number-form")');
    await click('#numbers-home');
    for (const subtype of ['mixed', 'general', 'money', 'phone', 'birthday', 'date_of_birth', 'deadline', 'anniversary', 'movie_release', 'date']) {
      await click(`[data-subtype="${subtype}"]`); await waitFor('!!document.querySelector("#number-form")');
      if (subtype === 'date') await playbackInput();
      const pending = [...service.pendingNumberQuestions.values()].at(-1);
      assert.equal(await evaluate(`document.querySelector('#app').textContent.includes(${JSON.stringify(pending.promptText)})`), false);
      assert.equal(await evaluate('!!document.querySelector(".number-prompt")'), false);
      await evaluate('document.querySelector("#number-answer").value="wrong";document.querySelector("#number-form").requestSubmit()');
      await waitFor('!!document.querySelector(".number-prompt")');
      assert.equal(await evaluate('document.querySelector(".number-prompt").textContent'), pending.promptText);
      if (subtype === 'date') await screenshot('practice');
      await click('#numbers-home');
    }
    await click('#number-mistakes'); await waitFor('!!document.querySelector(".number-mistake")');
    assert.ok(await evaluate('!!document.querySelector(".number-mistake .number-prompt")'));
    await screenshot('mistakes');
    await click('.number-mistake [data-category]'); await waitFor('!!document.querySelector("#number-form")');
    assert.equal([...service.pendingNumberQuestions.values()].at(-1).subtype, 'date');
    await click('#numbers-home'); await click('#number-stats');
    await waitFor('document.querySelectorAll(".number-report .stat-card").length===5'); await screenshot('stats');
    await click('#numbers-home'); await click('#number-exam');
    assert.equal(await evaluate('document.querySelector("#number-count").value'), '10');
    await evaluate('document.querySelector("#number-count").value="2";document.querySelector("#number-exam-form").requestSubmit()');
    await waitFor('!!document.querySelector("#number-clock")');
    await playbackInput();
    const played = await evaluate('spoken.length');
    await click('#number-play'); assert.equal(await evaluate('spoken.length'), played);
    assert.equal(await evaluate('document.querySelector("#number-play").disabled'), true);
    console.log('✓ 独立/对话/考试：真实坐标点击首次播放输入48，重播追加29得到4829，原输入节点/焦点/可编辑状态均保留');
    await screenshot('exam');
    // Let a real 20-second deadline expire with a nonempty answer: it must still be recorded wrong.
    await evaluate('document.querySelector("#number-answer").value="123"');
    await delay(21000);
    await waitFor('!!document.querySelector(".number-wrong")');
    assert.ok(await evaluate('document.querySelector("#number-feedback").textContent.includes("时间到")'));
    assert.equal(service.db.connection.prepare('SELECT user_answer FROM number_drill_attempts ORDER BY id DESC LIMIT 1').get().user_answer, '');
    await click('#number-next'); await waitFor('!!document.querySelector("#number-form")');
    const key = [...service.pendingNumberQuestions.values()].at(-1).correctAnswer;
    await evaluate(`document.querySelector('#number-answer').value=${JSON.stringify(key)};document.querySelector('#number-form').requestSubmit()`);
    await waitFor('!!document.querySelector(".number-correct")'); await click('#number-next');
    await waitFor('document.querySelectorAll(".number-report .stat-card").length===5');
    assert.equal(await evaluate('document.querySelector(".number-report h2").textContent'), '1/2');
    await screenshot('summary');
    // Leaving an active exam must cancel its timer and prevent background submissions.
    await click('#numbers-home'); await click('#number-exam');
    await evaluate('document.querySelector("#number-exam-form").requestSubmit()');
    await waitFor('!!document.querySelector("#number-clock")');
    const count = service.db.connection.prepare('SELECT COUNT(*) n FROM number_drill_attempts').get().n;
    await click('[data-page="home"]'); await waitFor('!!document.querySelector("[data-go=numbers]")');
    await delay(21000);
    assert.equal(service.db.connection.prepare('SELECT COUNT(*) n FROM number_drill_attempts').get().n, count);
    assert.deepEqual(errors, []);
    console.log('✓ 10 Chrome移动端：5页及10个对话入口、提交前隐藏题干、数字朗读、无限练习、考试2次播放/20秒超时/1:2成绩、离页停止、390/320无横向滚动通过；真实设备发声待用户试听');
  } finally {
    socket?.close();
    if (child.exitCode === null) { child.kill(); await Promise.race([once(child, 'exit'), delay(5000)]); }
  }
}
module.exports = { browserTest };
