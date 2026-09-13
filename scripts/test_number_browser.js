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
    await waitFor('!!document.querySelector("[data-go=foundations]")');
    await screenshot('home');
    await click('[data-go=foundations]');
    const foundationEntries = await evaluate('[...document.querySelectorAll("[data-foundation]")].map(element => ({text:element.querySelector(".number-label").textContent,target:element.dataset.foundation,disabled:element.disabled}))');
    assert.deepEqual(foundationEntries, [
      { text: '数字专项', target: 'numbers', disabled: false },
      { text: '拼写专项', target: 'spelling', disabled: false },
      { text: '同义替换专项', target: 'paraphrase', disabled: false },
      { text: '答案预测专项', target: 'prediction', disabled: false }
    ]);
    assert.equal(await evaluate('/连读弱读|能力分析|我的错题/.test(document.querySelector(".foundations-page").textContent)'), false);
    console.log(`✓ CDP 枢纽页：4个入口=${JSON.stringify(foundationEntries.map(entry => entry.text))}；无连读弱读、能力分析、我的错题`);
    await click('[data-foundation=numbers]');
    assert.ok(await evaluate('!!document.querySelector("#number-mistakes")'));
    console.log('✓ CDP 数字专项首页：自带“错题”入口仍存在');
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
    assert.equal(await evaluate('!!document.querySelector("#number-feedback .number-spoken")'), false);
    await click('#number-next'); await waitFor('!!document.querySelector("#number-form")');
    await click('#numbers-home');
    for (const category of ['time', 'date', 'money', 'phone']) {
      for (const correct of [false, true]) {
        await click(`[data-category="${category}"][data-subtype=""]`);
        await waitFor('!!document.querySelector("#number-form")');
        const pending = [...service.pendingNumberQuestions.values()].at(-1);
        assert.equal(await evaluate('!!document.querySelector(".number-spoken")'), false);
        await evaluate(`document.querySelector('#number-answer').value=${JSON.stringify(correct ? pending.correctAnswer : 'wrong')};document.querySelector('#number-form').requestSubmit()`);
        await waitFor(`!!document.querySelector('.number-${correct ? 'correct' : 'wrong'}')`);
        assert.equal(await evaluate('document.querySelector("#number-feedback .number-spoken em")?.textContent ?? null'), category === 'phone' ? null : pending.spokenText);
        console.log(`✓ 读法 CDP standalone ${category} ${correct ? '答对' : '答错'}：${category === 'phone' ? '无读法提示' : pending.spokenText}`);
        await click('#numbers-home');
      }
    }
    console.log('✓ 读法 CDP 一般数字：答后无读法提示');
    for (const subtype of ['mixed', 'general', 'money', 'phone', 'birthday', 'date_of_birth', 'deadline', 'anniversary', 'movie_release', 'date']) {
      await click(`[data-subtype="${subtype}"]`); await waitFor('!!document.querySelector("#number-form")');
      if (subtype === 'date') await playbackInput();
      const pending = [...service.pendingNumberQuestions.values()].at(-1);
      assert.equal(await evaluate(`document.querySelector('#app').textContent.includes(${JSON.stringify(pending.promptText)})`), false);
      assert.equal(await evaluate('!!document.querySelector(".number-prompt")'), false);
      await evaluate('document.querySelector("#number-answer").value="wrong";document.querySelector("#number-form").requestSubmit()');
      await waitFor('!!document.querySelector(".number-prompt")');
      assert.equal(await evaluate('document.querySelector(".number-prompt").textContent'), pending.promptText);
      if (subtype !== 'mixed') assert.equal(await evaluate('document.querySelector("#number-feedback .number-spoken em")?.textContent ?? null'), ['date', 'time', 'money'].includes(pending.category) ? pending.spokenText : null);
      if (subtype === 'date') await screenshot('practice');
      await click('#numbers-home');
    }
    service.db.connection.prepare('UPDATE number_drill_attempts SET resolved=1 WHERE is_correct=0 AND resolved=0').run();
    const insertMistake = service.db.connection.prepare(`INSERT INTO number_drill_attempts
      (mode,category,subtype,prompt_text,spoken_text,correct_answer,user_answer,is_correct,exam_session_id,attempted_at,resolved)
      VALUES (@mode,@category,@subtype,@prompt,@prompt,@correct,'wrong',0,NULL,@attemptedAt,0)`);
    const seededMistakes = [
      { mode: 'standalone', category: 'number', subtype: null, prompt: 'Queue number 1234', correct: '1234', attemptedAt: '2026-09-09 13:00:01' },
      { mode: 'dialogue', category: 'date', subtype: 'birthday', prompt: 'Queue birthday 2001-04-03', correct: '2001-04-03', attemptedAt: '2026-09-09 13:00:02' },
      { mode: 'standalone', category: 'phone', subtype: null, prompt: 'Queue phone 07911111111', correct: '07911111111', attemptedAt: '2026-09-09 13:00:03' }
    ];
    for (const row of seededMistakes) row.id = Number(insertMistake.run(row).lastInsertRowid);
    const reviewQueue = service.db.connection.prepare('SELECT * FROM number_drill_attempts WHERE is_correct=0 AND resolved=0 ORDER BY attempted_at DESC,id DESC').all();
    assert.deepEqual(reviewQueue.map(row => row.category), ['phone', 'date', 'number']);
    await click('#number-mistakes'); await waitFor('!!document.querySelector(".number-mistake")');
    assert.equal(await evaluate('document.querySelectorAll(".number-mistake").length'), 3);
    assert.ok(await evaluate('!!document.querySelector(".number-mistake .number-prompt")'));
    assert.equal(await evaluate('document.querySelectorAll(".number-mistake button").length'), 0);
    assert.equal(await evaluate('document.querySelectorAll("#number-review-mistakes").length'), 1);
    assert.equal(await evaluate('document.querySelector("#number-review-mistakes").childNodes[0].textContent.trim()'), '开始复习错题');
    assert.equal(await evaluate('document.querySelector(".number-report").textContent.includes("复习这道错题")'), false);
    await screenshot('mistakes');
    await click('#number-review-mistakes');
    for (let index = 0; index < reviewQueue.length; index++) {
      await waitFor(`document.querySelector('.page-header h1')?.textContent==='错题复习 · ${index + 1}/3' && !!document.querySelector('#number-form')`);
      const reviewQuestion = [...service.pendingNumberQuestions.values()].at(-1);
      assert.equal(reviewQuestion.category, reviewQueue[index].category);
      assert.equal(reviewQuestion.subtype, reviewQueue[index].subtype);
      const correct = index !== 1;
      await evaluate(`document.querySelector('#number-answer').value=${JSON.stringify(correct ? reviewQuestion.correctAnswer : 'wrong-again')};document.querySelector('#number-form').requestSubmit()`);
      await waitFor(`!!document.querySelector('.number-${correct ? 'correct' : 'wrong'}')`);
      assert.ok((await evaluate('document.querySelector("#number-next").textContent')).includes(index === 2 ? '查看复习总结' : `第 ${index + 2}/3 条`));
      await click('#number-next');
    }
    await waitFor('!!document.querySelector(".number-mistake-summary")');
    const reviewSummary = await evaluate('document.querySelector(".number-mistake-summary").textContent');
    assert.ok(reviewSummary.includes('复习 3 条 · 解决 2 条'));
    assert.ok(reviewSummary.includes('剩余 1 条'));
    await screenshot('mistake-summary');
    await click('#number-back-to-mistakes');
    await waitFor('!!document.querySelector(".number-mistake")');
    const listedIds = await evaluate('[...document.querySelectorAll(".number-mistake")].map(row=>Number(row.dataset.mistakeId))');
    assert.equal(listedIds.includes(reviewQueue[0].id), false);
    assert.equal(listedIds.includes(reviewQueue[1].id), true);
    assert.equal(listedIds.includes(reviewQueue[2].id), false);
    console.log(`✓ CDP 错题整套排队：3条不同category按队列进入同类新题；2对1错；总结=“复习 3 条 · 解决 2 条”；答对id=${reviewQueue[0].id},${reviewQueue[2].id}移出，答错id=${reviewQueue[1].id}保留`);
    service.db.connection.prepare('UPDATE number_drill_attempts SET resolved=1 WHERE is_correct=0 AND resolved=0').run();
    await click('#numbers-home'); await click('#number-mistakes');
    await waitFor('!!document.querySelector(".number-report .empty-state")');
    assert.equal(await evaluate('!!document.querySelector("#number-review-mistakes")'), false);
    assert.equal(await evaluate('document.querySelector(".number-report .empty-state").textContent'), '还没有错题，去听一道题吧。');
    console.log('✓ CDP 错题空状态：不显示“开始复习错题”，不会启动0题会话');
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
    await click('[data-page="home"]'); await waitFor('!!document.querySelector("[data-go=foundations]")');
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
