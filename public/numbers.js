'use strict';

window.IeltsNumbers = (() => {
  const categories = { number: '一般数字', date: '日期', time: '时间', money: '金额', phone: '手机号码' };
  const subtypes = { mixed: '混合', general: '一般数字', money: '金额', phone: '手机号码', birthday: '生日', date_of_birth: '出生日期', deadline: '截止日期', anniversary: '纪念日', movie_release: '电影上映', date: '日期' };
  const themes = ['listening', 'reading', 'speaking', 'writing'];
  const categoryIcons = { number: '#', date: '📅', time: '🕐', money: '💰', phone: '📞', mixed: '🔀' };
  const subtypeCategories = { general: 'number', money: 'money', phone: 'phone', birthday: 'date', date_of_birth: 'date', deadline: 'date', anniversary: 'date', movie_release: 'date', date: 'date', mixed: 'mixed' };
  const subtypeIcons = { birthday: '🎂', date_of_birth: '👶', deadline: '⏰', anniversary: '💍', movie_release: '🎬' };
  let context, generation = 0, timer;
  function dispose() {
    generation += 1;
    clearInterval(timer);
    window.speechSynthesis?.cancel();
  }
  const post = (url, body) => context.api(`/api/numbers/${url}`, { method: 'POST', body: JSON.stringify(body) });
  function page(title, subtitle, html) {
    dispose();
    window.scrollTo({ top: 0, behavior: 'instant' });
    context.root.innerHTML = `<section class="page numbers-page"><header class="page-header"><div><h1>${title}</h1><p>${subtitle}</p></div><button class="text-link" id="numbers-home">返回专项</button></header>${html}</section>`;
    context.root.querySelector('#numbers-home').onclick = home;
    return generation;
  }
  function launchButton(label, category, subtype = '') {
    const theme = subtype ? subtypeCategories[subtype] : category;
    const icon = subtypeIcons[subtype] || categoryIcons[theme];
    return `<button type="button" class="card number-tile" data-num-theme="${theme}" data-category="${category}" data-subtype="${subtype}"><span class="number-icon" aria-hidden="true">${icon}</span><span class="number-label">${label}</span><span class="number-arrow" aria-hidden="true">→</span></button>`;
  }
  function bindPractice() {
    context.root.querySelectorAll('[data-category]').forEach(button => {
      button.onclick = () => practice({ mode: button.dataset.subtype ? 'dialogue' : 'standalone', category: button.dataset.category, subtype: button.dataset.subtype || null });
    });
  }
  function home() {
    page('数字听力', '听清数字，也听懂它出现的语境。', `
      <div class="hero number-hero" data-num-theme="number"><p class="eyebrow">LISTEN TO THE DETAILS</p><h2><span class="number-icon" aria-hidden="true">#</span> 从一个数字开始</h2><button class="primary-button" id="number-start">开始数字测验</button></div>
      <div class="grid number-grid"><button class="card number-tile" id="number-mistakes">↻ 错题</button><button class="card number-tile" id="number-stats">▥ 统计</button></div>
      <div class="section-heading"><h2>进阶测验</h2></div><div class="grid number-grid">${Object.entries(categories).slice(1).map(([key, label]) => launchButton(label, key)).join('')}</div>
      <button class="card number-exam-entry" id="number-exam">考试模式 <span>限时 · 混合出题 →</span></button>
      <div class="section-heading"><h2>对话测验</h2></div><div class="grid number-grid">${Object.entries(subtypes).map(([key, label]) => launchButton(label, '', key)).join('')}</div>`);
    context.root.querySelector('#numbers-home').onclick = () => context.navigate('foundations');
    context.root.querySelector('#number-start').onclick = () => practice({ mode: 'standalone', category: 'number' });
    context.root.querySelector('#number-mistakes').onclick = mistakes;
    context.root.querySelector('#number-stats').onclick = stats;
    context.root.querySelector('#number-exam').onclick = examSetup;
    bindPractice();
  }
  async function practice(config, exam = null, mistakeReview = null) {
    const reviewingMistake = Boolean(mistakeReview);
    const title = exam
      ? `考试 · ${exam.index + 1}/${exam.count}`
      : reviewingMistake
        ? `错题复习 · ${mistakeReview.index + 1}/${mistakeReview.mistakeQueue.length}`
        : (config.mode === 'dialogue' ? `${subtypes[config.subtype]} · 对话` : categories[config.category]);
    const subtitle = exam
      ? '每题20秒，最多播放2次。'
      : reviewingMistake
        ? `正在复习第 ${mistakeReview.index + 1} / 总 ${mistakeReview.mistakeQueue.length} 条`
        : '点击喇叭听题，可反复播放。';
    const token = page(title, subtitle, '<div class="card empty-state">正在准备题目…</div>');
    try {
      const question = await post('question', config);
      if (token !== generation) return;
      const panel = context.root.querySelector('.empty-state');
      panel.className = 'card number-practice';
      panel.dataset.numTheme = config.mode === 'dialogue' ? subtypeCategories[config.subtype] : config.category;
      panel.innerHTML = `<div class="number-status">${exam ? '<strong id="number-clock">20 秒</strong>' : '<span>只听声音，输入你听到的答案</span>'}</div>
        <button type="button" class="primary-button number-speaker" id="number-play" aria-label="播放题目">🔊</button><p id="number-play-status">${exam ? '剩余播放 2 次' : '不限播放次数'}</p>
        <form id="number-form"><label for="number-answer">你的答案</label><input id="number-answer" autocomplete="off" maxlength="5000" placeholder="输入数字、日期、时间或金额"><button class="primary-button" type="submit">提交答案</button></form>
        <div id="number-feedback" role="status"></div><button class="secondary-button" id="number-next" hidden>${exam && exam.index + 1 === exam.count ? '查看成绩' : reviewingMistake ? (mistakeReview.index + 1 === mistakeReview.mistakeQueue.length ? '查看复习总结' : `下一条 · 第 ${mistakeReview.index + 2}/${mistakeReview.mistakeQueue.length} 条`) : '下一题'}</button>`;
      let plays = 0, busy = false, answered = false, timedOut = false;
      const deadline = exam ? Date.now() + 20000 : null;
      const play = panel.querySelector('#number-play');
      const form = panel.querySelector('form');
      const input = panel.querySelector('input');
      const submitButton = form.querySelector('button');
      // Keep an active input/selection through pointer-down; click also handles first play and keyboard activation.
      play.onmousedown = event => event.preventDefault();
      play.onclick = () => {
        if (!input.disabled && !input.readOnly) input.focus({ preventScroll: true });
        if (exam && plays >= 2) return;
        if (!context.speech.speak(question.spokenText, { allowNumeric: true })) {
          context.showToast('英文语音尚未就绪，请启用设备英文语音后重试');
          return;
        }
        plays += 1;
        if (exam) {
          panel.querySelector('#number-play-status').textContent = `剩余播放 ${2 - plays} 次`;
          play.disabled = plays >= 2;
        }
      };
      async function submit(timeout = false) {
        if (busy || answered || token !== generation) return;
        timedOut ||= timeout;
        busy = true;
        submitButton.disabled = true;
        input.disabled = true;
        clearInterval(timer);
        window.speechSynthesis?.cancel();
        try {
          const result = await post('answer', {
            questionId: question.questionId,
            userAnswer: timedOut ? '' : input.value,
            ...(exam ? { examSessionId: exam.id } : {}),
            ...(reviewingMistake ? { resolvingMistakeId: mistakeReview.mistakeQueue[mistakeReview.index].id } : {})
          });
          if (token !== generation) return;
          answered = true;
          const category = config.mode === 'dialogue' ? subtypeCategories[config.subtype] : config.category;
          panel.querySelector('#number-feedback').innerHTML = `<h2 class="${result.isCorrect ? 'number-correct' : 'number-wrong'}">${timedOut ? '时间到 · 回顾答案' : result.isCorrect ? '答对了 ✓' : '再记一次'}</h2><p>正确答案：<strong>${context.escapeHtml(result.correctAnswer)}</strong></p>${['date', 'time', 'money'].includes(category) ? `<p class="number-spoken">英语读作：<em>${context.escapeHtml(result.spokenText)}</em></p>` : ''}${result.promptText ? `<p class="number-prompt">${context.escapeHtml(result.promptText)}</p>` : ''}`;
          if (reviewingMistake && result.isCorrect) mistakeReview.resolvedCount += 1;
          panel.querySelector('#number-next').hidden = false;
        } catch (error) {
          if (token !== generation) return;
          context.showToast(error.message);
          submitButton.disabled = false;
          input.disabled = timedOut;
          submitButton.textContent = '重试提交';
          if (exam && !timedOut) startClock();
        } finally { busy = false; }
      }
      form.onsubmit = event => { event.preventDefault(); submit(); };
      panel.querySelector('#number-next').onclick = () => {
        if (reviewingMistake) {
          mistakeReview.index += 1;
          return mistakeReview.index === mistakeReview.mistakeQueue.length ? mistakeSummary(mistakeReview) : mistakeQuestion(mistakeReview);
        }
        if (!exam) return practice(config);
        exam.index += 1;
        return exam.index === exam.count ? summary(exam) : examQuestion(exam);
      };
      function startClock() {
        timer = setInterval(() => {
          const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
          panel.querySelector('#number-clock').textContent = `${seconds} 秒`;
          if (!seconds) submit(true);
        }, 200);
      }
      if (exam) startClock();
      input.focus();
    } catch (error) {
      if (token !== generation) return;
      context.root.querySelector('.empty-state').innerHTML = `<p>${context.escapeHtml(error.message)}</p><button class="secondary-button" id="number-retry">重新加载</button>`;
      context.root.querySelector('#number-retry').onclick = () => practice(config, exam, mistakeReview);
    }
  }
  function examSetup() {
    page('考试模式', '从五类题目中随机抽题，每题20秒。', `<form class="card number-practice" id="number-exam-form"><label for="number-count">题量（1–100）</label><input id="number-count" type="number" min="1" max="100" value="10" required><button class="primary-button" type="submit">开始考试</button></form>`);
    context.root.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const token = generation;
      const button = event.target.querySelector('button');
      const count = Number(context.root.querySelector('#number-count').value);
      button.disabled = true;
      try {
        const result = await post('exam/start', { questionCount: count, categories: Object.keys(categories) });
        if (token === generation) examQuestion({ id: result.examSessionId, count, index: 0 });
      } catch (error) { if (token === generation) { button.disabled = false; context.showToast(error.message); } }
    };
  }
  function examQuestion(exam) {
    const keys = Object.keys(categories);
    return practice({ mode: 'exam', category: keys[Math.floor(Math.random() * keys.length)] }, exam);
  }
  function mistakeQuestion(review) {
    const mistake = review.mistakeQueue[review.index];
    return practice({
      mode: mistake.subtype ? 'dialogue' : 'standalone',
      category: mistake.category,
      subtype: mistake.subtype || null
    }, null, review);
  }
  function mistakeSummary(review) {
    page('错题复习总结', '这一轮已经全部完成。', `<article class="card number-practice number-mistake-summary"><h2>复习 ${review.mistakeQueue.length} 条 · 解决 ${review.resolvedCount} 条</h2><p>本轮复习了 ${review.mistakeQueue.length} 条错题，解决了 ${review.resolvedCount} 条，剩余 ${review.mistakeQueue.length - review.resolvedCount} 条。</p><button class="primary-button" id="number-back-to-mistakes">返回错题列表</button></article>`);
    context.root.querySelector('#number-back-to-mistakes').onclick = mistakes;
  }
  function accuracyCards(byCategory) {
    return `<div class="grid number-grid">${Object.entries(byCategory).map(([key, row], index) => `<article class="card stat-card ${themes[index % themes.length]}"><div class="stat-icon">${index + 1}</div><span class="stat-label">${categories[key]}</span><strong class="stat-value">${row.accuracy === null ? '—' : `${row.accuracy}%`}</strong><small>${row.total} 题</small></article>`).join('')}</div>`;
  }
  async function report(title, url, render) {
    const token = page(title, '每一次作答，都是积累。', '<div class="number-report">加载中…</div>');
    try {
      const data = await context.api(`/api/numbers/${url}`);
      if (token !== generation) return;
      context.root.querySelector('.number-report').innerHTML = render(data);
      bindPractice();
    } catch (error) {
      if (token !== generation) return;
      context.root.querySelector('.number-report').textContent = error.message;
    }
  }
  const summary = exam => report('考试成绩', `exam/${exam.id}/summary`, data => `<article class="card number-practice"><h2>${data.score}/${data.total}</h2><p>本次考试得分</p></article>${accuracyCards(data.byCategory)}`);
  const stats = () => report('数字听力统计', 'stats', data => `<article class="card number-practice"><h2>${data.accuracy === null ? '暂无记录' : `${data.accuracy}%`}</h2><p>总正确率 · 已答 ${data.total} 题 · 答对 ${data.correct} 题</p></article>${accuracyCards(data.byCategory)}`);
  async function mistakes() {
    const token = page('最近错题', '把未解决的错题作为一整套连续复习。', '<div class="number-report">加载中…</div>');
    try {
      const rows = await context.api('/api/numbers/mistakes?limit=100');
      if (token !== generation) return;
      const reportPanel = context.root.querySelector('.number-report');
      if (!rows.length) {
        reportPanel.innerHTML = '<div class="card empty-state">还没有错题，去听一道题吧。</div>';
        return;
      }
      reportPanel.innerHTML = `<button class="card number-exam-entry" id="number-review-mistakes">开始复习错题 <span>${rows.length} 条排队复习 →</span></button><div class="number-mistake-list">${rows.map(row => `<article class="card number-mistake" data-mistake-id="${row.id}"><span class="badge listening">${row.subtype ? subtypes[row.subtype] : categories[row.category]}</span><p>${context.escapeHtml(row.attempted_at)}</p>${row.prompt_text ? `<p class="number-prompt">${context.escapeHtml(row.prompt_text)}</p>` : ''}<p>你的答案：${context.escapeHtml(row.user_answer) || '未作答'}</p><p>正确答案：<strong>${context.escapeHtml(row.correct_answer)}</strong></p></article>`).join('')}</div>`;
      context.root.querySelector('#number-review-mistakes').onclick = () => mistakeQuestion({ mistakeQueue: rows, index: 0, resolvedCount: 0 });
    } catch (error) {
      if (token === generation) context.root.querySelector('.number-report').textContent = error.message;
    }
  }
  return { mount(options) { context = options; home(); }, dispose };
})();
