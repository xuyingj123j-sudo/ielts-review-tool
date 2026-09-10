'use strict';

const root = document.querySelector('#app');
const toast = document.querySelector('#toast');
const skillMeta = {
  听力: { className: 'listening', icon: '◉', color: '#FF8A65' },
  阅读: { className: 'reading', icon: '▥', color: '#4ECDC4' },
  口语: { className: 'speaking', icon: '◌', color: '#FF6FA5' },
  写作: { className: 'writing', icon: '✎', color: '#9C8CFB' }
};
const types = ['同义替换', '句子对照', '语法修正', '听力误听', '生词'];
const state = {
  page: 'home', queue: [], reviewIndex: 0, correct: 0, editingId: null,
  listeningSectionId: null, reviewKind: 'formal', practiceScope: 'all', practiceCardId: null
};
const speech = window.IeltsSpeech;
const cardUi = window.IeltsCardUi;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `请求失败（${response.status}）`);
  }
  return response.status === 204 ? null : response.json();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function loading() { root.innerHTML = '<div class="loading">正在把今天的复习准备好…</div>'; }

function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
}

async function navigate(page) {
  window.IeltsNumbers?.dispose();
  state.page = page;
  state.editingId = page === 'entry' ? state.editingId : null;
  setActiveNav(['progress', 'weekly', 'listening', 'listening-practice', 'numbers'].includes(page) ? 'home' : (page === 'practice' ? 'review' : page));
  loading();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  try {
    if (page === 'home') await renderHome();
    if (page === 'review') await renderReview();
    if (page === 'practice') await renderPractice();
    if (page === 'entry') await renderEntry();
    if (page === 'library') await renderLibrary();
    if (page === 'progress') await renderProgress();
    if (page === 'weekly') await renderWeekly();
    if (page === 'listening') await renderListeningOverview();
    if (page === 'listening-practice') await renderListeningPractice(state.listeningSectionId);
    if (page === 'numbers') window.IeltsNumbers.mount({ root, api, escapeHtml, speech, showToast });
  } catch (error) {
    root.innerHTML = `<div class="card empty-state"><div class="emoji">⚠️</div><h2>暂时没有加载成功</h2><p>${escapeHtml(error.message)}</p><button class="primary-button" id="retry">再试一次</button></div>`;
    document.querySelector('#retry')?.addEventListener('click', () => navigate(page));
  }
}

function pageHeader(title, subtitle, action = '') {
  return `<header class="page-header"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</header>`;
}

async function renderHome() {
  const [stats, tasks, weekly] = await Promise.all([api('/api/stats'), api('/api/tasks/today'), api('/api/stats/weekly')]);
  root.innerHTML = `<section class="page">
    <header class="hero">
      <p class="eyebrow">YOUR IELTS REVIEW</p>
      <h1>今天，也向 7 分靠近一点</h1>
      <p class="hero-sub">到期的知识会自己回来找你。</p>
      <div class="hero-metrics">
        <div class="hero-metric"><strong>${stats.todayDue}</strong><span>今日待复习</span></div>
        <div class="hero-metric"><strong>${stats.streak}</strong><span>连续打卡天数</span></div>
      </div>
    </header>
    <article class="card listening-module-card">
      <div class="listening-module-icon">▶</div>
      <div><span class="badge listening">并列练习模块</span><h2>听力真题练习</h2><p>原文自动挖空并判分，连续达标后解锁下一阶段。</p></div>
      <button class="round-arrow listening-arrow" data-go="listening" aria-label="进入听力真题练习">→</button>
    </article>
    <article class="card listening-module-card">
      <div class="listening-module-icon">123</div>
      <div><h2>数字听力</h2><p>从数字、日期到真实对话，听清每一个细节。</p></div>
      <button class="round-arrow" data-go="numbers" aria-label="进入数字听力">→</button>
    </article>
    <div class="section-heading"><h2>四项积累</h2><button class="text-link" data-go="progress">查看进度</button></div>
    <div class="grid skill-grid">${Object.entries(skillMeta).map(([skill, meta]) => `
      <article class="card stat-card ${meta.className}">
        <div class="stat-icon">${meta.icon}</div><span class="stat-label">${skill}卡片</span>
        <strong class="stat-value">${stats.skills[skill].total}</strong><span class="stat-tail">↗</span>
      </article>`).join('')}</div>
    <div class="section-heading"><h2>今日任务</h2><button class="text-link" data-go="weekly">本周复盘</button></div>
    <div class="card task-list">${tasks.map((task) => {
      const meta = skillMeta[task.skill];
      return `<button class="task-item ${task.done ? 'done' : ''}" data-task-id="${task.id}" aria-pressed="${task.done}">
        <span class="task-check" style="--skill-color:${meta.color}">${task.done ? '✓' : ''}</span>
        <span><strong>${task.skill}</strong><small>${task.done ? '今天已完成' : '点击标记今日练习'}</small></span>
      </button>`;
    }).join('')}</div>
    <div class="section-heading"><h2>本周写作</h2></div>
    <article class="card writing-checkin">
      <div class="writing-checkin-summary"><span class="badge writing">每周目标</span><h3>完成 ${weekly.writing.completed} 次 / 目标 ${weekly.writing.target} 次</h3><p>把这周实际写的作文或书信内容记录下来。</p></div>
      <button class="primary-button" id="show-writing-form">记一次写作</button>
      <form class="writing-entry-form" id="writing-entry-form" hidden>
        <label for="writing-content">写作内容</label>
        <textarea id="writing-content" name="content" maxlength="5000" rows="9" placeholder="粘贴或输入这周写的作文、书信内容" required></textarea>
        <div class="button-row">
          <button class="primary-button" type="submit">确认记录</button>
          <button class="secondary-button" type="button" id="cancel-writing">取消</button>
        </div>
      </form>
    </article>
    <div class="section-heading"><h2>今天的节奏</h2></div>
    <article class="card action-card">
      <div><h3>${stats.todayDue ? `有 ${stats.todayDue} 张卡片在等你` : '今天的到期卡片已清空'}</h3>
      <p>${stats.todayDue ? '花几分钟翻一翻，让记忆更牢。' : '想再巩固一轮，可以进入自由练习。'}</p></div>
      <button class="round-arrow" ${stats.todayDue ? 'data-go="review"' : 'data-start-practice="all"'} aria-label="开始">→</button>
    </article>
  </section>`;
  bindGoButtons();
  bindPracticeButtons();
  document.querySelectorAll('[data-task-id]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await api(`/api/tasks/${button.dataset.taskId}/toggle`, { method: 'POST' });
      await renderHome();
    } catch (error) {
      button.disabled = false;
      showToast(error.message);
    }
  }));
  const showWritingButton = document.querySelector('#show-writing-form');
  const writingForm = document.querySelector('#writing-entry-form');
  const writingContent = document.querySelector('#writing-content');
  showWritingButton.addEventListener('click', () => {
    showWritingButton.hidden = true;
    writingForm.hidden = false;
    writingContent.focus();
  });
  document.querySelector('#cancel-writing').addEventListener('click', () => {
    writingForm.reset();
    writingForm.hidden = true;
    showWritingButton.hidden = false;
  });
  writingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = writingForm.querySelector('[type="submit"]');
    const content = writingContent.value.trim();
    if (!content) {
      showToast('请先输入写作内容');
      return;
    }
    submitButton.disabled = true;
    try {
      const result = await api('/api/writing/complete', { method: 'POST', body: JSON.stringify({ content }) });
      showToast(`已记录，本周完成 ${result.weeklyCompleted} 次`);
      await renderHome();
    } catch (error) {
      submitButton.disabled = false;
      showToast(error.message);
    }
  });
}

function bindGoButtons() {
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
}

function startPractice(scope, cardId = null) {
  state.practiceScope = scope;
  state.practiceCardId = cardId;
  navigate('practice');
}

function bindPracticeButtons() {
  document.querySelectorAll('[data-start-practice]').forEach((button) => button.addEventListener('click', () => {
    startPractice(button.dataset.startPractice);
  }));
  document.querySelectorAll('[data-practice-card]').forEach((card) => {
    const open = () => startPractice('single', Number(card.dataset.practiceCard));
    card.addEventListener('click', (event) => { if (!event.target.closest('button')) open(); });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
  });
}

function bindSpeechButtons() {
  speech.bindButtons(root);
}

async function renderEntry() {
  let card = null;
  if (state.editingId) {
    const cards = await api('/api/cards');
    card = cards.find((item) => item.id === state.editingId) || null;
  }
  root.innerHTML = `<section class="page">
    ${pageHeader(card ? '编辑卡片' : '录入新卡片', card ? '修改后保留当前箱位与复习计划' : '今天记下，马上就能自测')}
    <form id="card-form" class="card form-card">
      <div class="form-grid two">
        <div class="field"><label for="skill">技能</label><select id="skill" name="skill" required>${Object.keys(skillMeta).map((value) => `<option ${card?.skill === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
        <div class="field"><label for="type">类型</label><select id="type" name="type" required>${types.map((value) => `<option ${card?.type === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid">
        <div class="field"><div class="field-label-row"><label for="front">正面 · 先问自己</label>${speech.buttonHtml(speech.frontText(card || {}), '正面', { target: 'front-audio', fallbackTarget: 'front', force: true })}</div><textarea id="front" name="front" maxlength="5000" required placeholder="题目表达、错误表达或低阶词">${escapeHtml(card?.front || '')}</textarea></div>
        <div class="field"><label for="front-audio">正面朗读用完整原句（可选，含答案，只用于生成语音，不会显示成文字）</label><textarea id="front-audio" name="front_audio" maxlength="5000" placeholder="例：She often goes to a keep-fit studio near her house.">${escapeHtml(card?.front_audio || '')}</textarea></div>
        <div class="field"><div class="field-label-row"><label for="back">背面 · 正确答案</label>${speech.buttonHtml(card?.back || '', '背面', { target: 'back', force: true })}</div><textarea id="back" name="back" maxlength="5000" required placeholder="原文表达、正确表达或高阶替换词">${escapeHtml(card?.back || '')}</textarea></div>
        <label class="mode-toggle" for="review-mode"><input id="review-mode" name="review_mode" type="checkbox" value="spelling" ${card?.review_mode === 'spelling' ? 'checked' : ''}><span><strong>拼写测试模式</strong><small>复习时听背面发音并输入拼写，系统自动判分</small></span></label>
        <div class="field"><label for="note" id="note-label">${cardUi.noteLabel(card?.skill || '听力', card?.type || types[0])}</label><textarea id="note" name="note" maxlength="5000" placeholder="补充说明或错因">${escapeHtml(card?.note || '')}</textarea></div>
        <div class="button-row"><button class="primary-button" type="submit">${card ? '保存修改' : '保存卡片'}</button>${card ? '<button class="secondary-button" type="button" id="cancel-edit">取消</button>' : ''}</div>
      </div>
    </form>
  </section>`;
  bindSpeechButtons();
  const updateNoteLabel = () => {
    document.querySelector('#note-label').textContent = cardUi.noteLabel(document.querySelector('#skill').value, document.querySelector('#type').value);
  };
  document.querySelector('#skill').addEventListener('change', updateNoteLabel);
  document.querySelector('#type').addEventListener('change', updateNoteLabel);
  document.querySelector('#cancel-edit')?.addEventListener('click', () => { state.editingId = null; navigate('library'); });
  document.querySelector('#card-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.review_mode = form.has('review_mode') ? 'spelling' : 'flip';
    try {
      if (card) await api(`/api/cards/${card.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/api/cards', { method: 'POST', body: JSON.stringify(payload) });
      showToast(card ? '修改已保存' : '已收进第 1 箱，可以马上复习');
      state.editingId = null;
      navigate(card ? 'library' : 'home');
    } catch (error) { showToast(error.message); }
  });
}

async function renderLibrary(filters = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  const cards = await api(`/api/cards?${params}`);
  root.innerHTML = `<section class="page">
    ${pageHeader('卡片库', `共 ${cards.length} 张匹配卡片`, '<button class="icon-button" data-go="entry" aria-label="新建卡片">＋</button>')}
    <div class="card filter-bar">
      <input class="search" id="search" placeholder="搜索正面、背面或备注" value="${escapeHtml(filters.search || '')}">
      <select id="filter-skill"><option value="">全部技能</option>${Object.keys(skillMeta).map((value) => `<option ${filters.skill === value ? 'selected' : ''}>${value}</option>`).join('')}</select>
      <select id="filter-type"><option value="">全部类型</option>${types.map((value) => `<option ${filters.type === value ? 'selected' : ''}>${value}</option>`).join('')}</select>
      <select id="filter-box"><option value="">全部箱位</option>${[1,2,3,4,5].map((value) => `<option value="${value}" ${String(filters.box) === String(value) ? 'selected' : ''}>第 ${value} 箱</option>`).join('')}</select>
    </div>
    <div class="library-list">${cards.length ? cards.map((card) => {
      const meta = skillMeta[card.skill];
      return `<article class="card library-card" data-skill="${card.skill}" data-practice-card="${card.id}" tabindex="0" role="button" aria-label="练习卡片：${escapeHtml(card.front)}">
        <div class="card-meta"><span class="badge ${meta.className}">${card.skill}</span><span class="badge plain-badge">${card.type}</span><span class="badge plain-badge">第 ${card.box} 箱</span></div>
        <div class="speech-line"><h3>${escapeHtml(card.front)}</h3>${speech.buttonHtml(speech.frontText(card), '卡片正面')}</div>
        <div class="speech-line library-back"><p>${escapeHtml(card.back)}</p>${speech.buttonHtml(card.back, '卡片背面')}</div>
        <div class="library-actions"><button class="secondary-button" data-edit="${card.id}">编辑</button><button class="danger-button" data-delete="${card.id}">删除</button></div>
      </article>`;
    }).join('') : '<article class="card empty-state"><div class="emoji">🗂️</div><h2>没有找到卡片</h2><p>换一个筛选条件，或录入今天的新收获。</p></article>'}</div>
  </section>`;
  bindGoButtons();
  bindSpeechButtons();
  bindPracticeButtons();
  const readFilters = () => ({ search: document.querySelector('#search').value.trim(), skill: document.querySelector('#filter-skill').value, type: document.querySelector('#filter-type').value, box: document.querySelector('#filter-box').value });
  let searchTimer;
  document.querySelector('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => renderLibrary(readFilters()), 250); });
  ['#filter-skill', '#filter-type', '#filter-box'].forEach((selector) => document.querySelector(selector).addEventListener('change', () => renderLibrary(readFilters())));
  document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); state.editingId = Number(button.dataset.edit); navigate('entry'); }));
  document.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (!window.confirm('确定删除这张卡片吗？对应复习记录也会删除。')) return;
    try { await api(`/api/cards/${button.dataset.delete}`, { method: 'DELETE' }); showToast('卡片已删除'); renderLibrary(readFilters()); }
    catch (error) { showToast(error.message); }
  }));
}

async function renderReview(reset = true) {
  if (reset) {
    state.reviewKind = 'formal';
    state.queue = await api('/api/review/queue');
    state.reviewIndex = 0;
    state.correct = 0;
  }
  renderCurrentReview();
}

async function renderPractice() {
  state.reviewKind = state.practiceScope === 'single' ? 'single' : 'free';
  state.queue = state.practiceScope === 'single'
    ? [await api(`/api/practice/cards/${state.practiceCardId}`)]
    : await api(`/api/practice/cards?scope=${state.practiceScope}`);
  state.reviewIndex = 0;
  state.correct = 0;
  renderCurrentReview();
}

function reviewTitle() {
  return state.reviewKind === 'formal' ? '今日复习' : (state.reviewKind === 'single' ? '单卡练习' : '自由练习');
}

function renderCurrentReview() {
  const total = state.queue.length;
  if (!total) {
    const isFormal = state.reviewKind === 'formal';
    root.innerHTML = `<section class="page review-wrap">${pageHeader(reviewTitle(), isFormal ? '到期卡片会自动出现在这里' : '额外练习不影响正式复习进度')}<div class="card empty-state"><div class="emoji">🌷</div><h2>${isFormal ? '今天已经清空啦' : '这个范围还没有卡片'}</h2><p>${isFormal ? '想再巩固一轮，可以自由练习全部或今天已复习的卡片。' : '可以改练全部卡片。'}</p><div class="practice-actions"><button class="primary-button" data-start-practice="all">练习全部卡片</button><button class="secondary-button" data-start-practice="today">练习今天已复习</button><button class="secondary-button" data-go="entry">录入卡片</button></div></div></section>`;
    bindGoButtons(); bindPracticeButtons(); return;
  }
  if (state.reviewIndex >= total) {
    const rate = Math.round(state.correct * 100 / total);
    const formal = state.reviewKind === 'formal';
    root.innerHTML = `<section class="page review-wrap">${pageHeader('本轮完成', formal ? '每一次回想，都在加固记忆' : '本轮只做自测，不改变箱位和日期')}<div class="card empty-state"><div class="emoji">✨</div><h2>练习了 ${total} 张</h2><p>本轮正确率 ${rate}% · 记得 ${state.correct} 张</p><div class="practice-actions">${formal ? '<button class="primary-button" data-start-practice="all">自由练习全部</button><button class="secondary-button" data-start-practice="today">再练今天已复习</button>' : '<button class="primary-button" id="repeat-practice">再练一轮</button>'}<button class="secondary-button" data-go="home">返回首页</button></div></div></section>`;
    bindGoButtons();
    bindPracticeButtons();
    document.querySelector('#repeat-practice')?.addEventListener('click', () => { state.reviewIndex = 0; state.correct = 0; renderCurrentReview(); });
    return;
  }
  const card = state.queue[state.reviewIndex];
  const meta = skillMeta[card.skill];
  if (card.review_mode === 'spelling') {
    renderSpellingReview(card, meta, total);
    return;
  }
  root.innerHTML = `<section class="page review-wrap">
    ${pageHeader(reviewTitle(), `${state.reviewIndex + 1} / ${total}${state.reviewKind === 'formal' ? '' : ' · 不记录进度'}`)}
    <div class="review-progress"><span style="width:${state.reviewIndex * 100 / total}%"></span></div>
    <div class="flip-scene" id="flip-scene" tabindex="0" role="button" aria-label="点击中间翻转卡片，点击两侧切换上一张/下一张">
      <span class="flip-nav prev ${state.reviewIndex > 0 ? '' : 'disabled'}" aria-hidden="true">‹</span>
      <span class="flip-nav next ${state.reviewIndex < total - 1 ? '' : 'disabled'}" aria-hidden="true">›</span>
      <article class="flip-card" id="flip-card">
        <div class="flip-face front"><span class="badge ${meta.className}">${card.skill} · 第 ${card.box} 箱</span><div class="speech-line review-speech"><h2>${escapeHtml(card.front)}</h2>${speech.buttonHtml(speech.frontText(card), '卡片正面')}</div><span class="flip-hint">轻触查看答案</span></div>
        <div class="flip-face back"><span class="flip-label">答案</span><div class="speech-line review-speech"><h2>${escapeHtml(card.back)}</h2>${speech.buttonHtml(card.back, '卡片背面')}</div>${card.note ? `<p class="flip-note">${escapeHtml(card.note)}</p>` : ''}</div>
      </article>
    </div>
    <div class="review-controls" id="review-controls" hidden><button class="danger-button" data-result="incorrect">还不记得</button><button class="primary-button" data-result="correct">记得</button></div>
  </section>`;
  bindSpeechButtons();
  const toggleFlip = () => {
    const flipped = document.querySelector('#flip-card').classList.toggle('flipped');
    document.querySelector('#review-controls').hidden = !flipped;
  };
  const goPrev = () => { if (state.reviewIndex > 0) { state.reviewIndex -= 1; renderCurrentReview(); } };
  const goNext = () => { if (state.reviewIndex < total - 1) { state.reviewIndex += 1; renderCurrentReview(); } };
  document.querySelector('#flip-scene').addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    if (ratio < 0.22) { goPrev(); return; }
    if (ratio > 0.78) { goNext(); return; }
    toggleFlip();
  });
  document.querySelector('#flip-scene').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') toggleFlip();
    if (event.key === 'ArrowLeft') goPrev();
    if (event.key === 'ArrowRight') goNext();
  });
  document.querySelectorAll('[data-result]').forEach((button) => button.addEventListener('click', async () => {
    document.querySelectorAll('[data-result]').forEach((item) => { item.disabled = true; });
    try {
      if (state.reviewKind === 'formal') {
        await api(`/api/review/${card.id}`, { method: 'POST', body: JSON.stringify({ result: button.dataset.result }) });
      }
      if (button.dataset.result === 'correct') state.correct += 1;
      state.reviewIndex += 1;
      renderCurrentReview();
    } catch (error) { showToast(error.message); document.querySelectorAll('[data-result]').forEach((item) => { item.disabled = false; }); }
  }));
}

function renderSpellingReview(card, meta, total) {
  root.innerHTML = `<section class="page review-wrap">
    ${pageHeader(reviewTitle(), `${state.reviewIndex + 1} / ${total}${state.reviewKind === 'formal' ? '' : ' · 不记录进度'}`)}
    <div class="review-progress"><span style="width:${state.reviewIndex * 100 / total}%"></span></div>
    <article class="card spelling-card">
      <span class="badge ${meta.className}">${card.skill} · 第 ${card.box} 箱</span>
      <h2>${escapeHtml(card.front)}</h2>
      <div class="spelling-audio">${speech.buttonHtml(card.spelling_audio, '正确拼写', { base64: true })}<span>听发音，写出正确拼写</span></div>
      <form id="spelling-form">
        <label for="spelling-answer">你的答案</label>
        <input id="spelling-answer" name="answer" autocomplete="off" autocapitalize="off" spellcheck="false" required>
        <button class="primary-button" type="submit">提交答案</button>
      </form>
      <div id="spelling-result" class="spelling-result" hidden></div>
      <button id="spelling-next" class="primary-button" type="button" hidden>下一张</button>
    </article>
  </section>`;
  bindSpeechButtons();
  document.querySelector('#spelling-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const endpoint = state.reviewKind === 'formal'
        ? `/api/review/${card.id}/spelling`
        : `/api/practice/cards/${card.id}/spelling`;
      const result = await api(endpoint, {
        method: 'POST', body: JSON.stringify({ answer: form.elements.answer.value })
      });
      if (result.correct) state.correct += 1;
      const resultBox = document.querySelector('#spelling-result');
      resultBox.hidden = false;
      resultBox.className = `spelling-result ${result.correct ? 'correct' : 'incorrect'}`;
      resultBox.innerHTML = result.correct
        ? (state.reviewKind === 'formal' ? `✓ 拼写正确，已进入第 ${result.box_after} 箱` : '✓ 拼写正确（仅自测，进度未变）')
        : (state.reviewKind === 'formal' ? `✕ 拼写错误，正确答案：<strong>${escapeHtml(result.correct_answer)}</strong>（已回到第 1 箱）` : `✕ 拼写错误，正确答案：<strong>${escapeHtml(result.correct_answer)}</strong>（仅自测，进度未变）`);
      form.hidden = true;
      document.querySelector('#spelling-next').hidden = false;
    } catch (error) {
      showToast(error.message);
      submit.disabled = false;
    }
  });
  document.querySelector('#spelling-next').addEventListener('click', () => {
    state.reviewIndex += 1;
    renderCurrentReview();
  });
}

async function renderProgress() {
  const stats = await api('/api/stats');
  root.innerHTML = `<section class="page">
    ${pageHeader('进度仪表盘', '从真实复习记录看见积累', '<button class="icon-button" data-go="home" aria-label="返回首页">←</button>')}
    <div class="grid progress-summary">
      <article class="card summary-card"><span>全部卡片</span><strong>${stats.totalCards}</strong></article>
      <article class="card summary-card"><span>第5箱掌握</span><strong>${stats.masteredRate}%</strong></article>
      <article class="card summary-card"><span>近7日正确率</span><strong>${stats.recentAccuracy === null ? '—' : `${stats.recentAccuracy}%`}</strong></article>
      <article class="card summary-card"><span>连续打卡</span><strong>${stats.streak} 天</strong></article>
    </div>
    <div class="section-heading"><h2>技能掌握</h2></div>
    <div class="grid skill-grid">${Object.entries(skillMeta).map(([skill, meta]) => {
      const item = stats.skills[skill];
      return `<article class="card progress-skill"><div class="progress-skill-head"><strong>${skill}</strong><span>${item.mastered}/${item.total}</span></div><div class="bar"><span style="width:${item.masteredRate}%;background:${meta.color}"></span></div></article>`;
    }).join('')}</div>
    <div class="section-heading"><h2>近7日正确率</h2></div>
    <article class="card trend-card"><div class="trend-chart">${stats.trend.map((day) => `<div class="trend-day"><i style="height:${day.rate === null ? 4 : Math.max(8, day.rate)}%"></i><small>${day.date.slice(5)}</small></div>`).join('')}</div></article>
  </section>`;
  bindGoButtons();
}

async function renderWeekly() {
  const weekly = await api('/api/stats/weekly');
  root.innerHTML = `<section class="page">
    ${pageHeader('本周复盘', `${weekly.period.start} 至 ${weekly.period.end}`, '<button class="icon-button" data-go="home" aria-label="返回首页">←</button>')}
    <article class="card weekly-writing-summary">
      <span class="stat-icon writing">✎</span>
      <div class="weekly-writing-content"><span>本周写作</span><strong>完成 ${weekly.writing.completed} 次 / 目标 ${weekly.writing.target} 次</strong>
        <div class="writing-records">${weekly.writing.records.length
          ? weekly.writing.records.map((record) => `<article class="writing-record"><time>${escapeHtml(record.completed_at)}</time><p>${escapeHtml(record.content)}</p></article>`).join('')
          : '<p class="writing-empty">本周还没有写作记录</p>'}
        </div>
      </div>
    </article>
    <div class="weekly-grid">${Object.entries(skillMeta).map(([skill, meta]) => {
      const item = weekly.skills[skill];
      const task = weekly.dailyTasks[skill];
      return `<article class="card weekly-card" style="--skill-color:${meta.color}">
        <div class="weekly-card-head"><span class="stat-icon ${meta.className}">${meta.icon}</span><h2>${skill}</h2></div>
        <div class="weekly-metrics">
          ${task ? `<div><strong>${task.completedDays}/${task.targetDays}</strong><span>任务完成天数</span></div>` : ''}
          <div><strong>${item.accuracy === null ? '—' : `${item.accuracy}%`}</strong><span>复习正确率</span></div>
          <div><strong>${item.masteredRate}%</strong><span>卡片掌握率</span></div>
        </div>
      </article>`;
    }).join('')}</div>
  </section>`;
  bindGoButtons();
}

async function renderListeningOverview() {
  const overview = await api('/api/listening/overview');
  const highest = [...overview.stages].reverse().find((stage) => stage.unlocked)?.sectionNumber || 1;
  root.innerHTML = `<section class="page listening-page">
    ${pageHeader('听力真题练习', `当前解锁到 Section ${highest}`, '<button class="icon-button" data-go="home" aria-label="返回首页">←</button>')}
    <article class="listening-guide"><strong>解锁规则</strong><span>当前阶段最近 3 条记录均达到 70%，并勾满 5 项标准，才解锁下一阶段。</span></article>
    <div class="listening-stage-list">${overview.stages.map((stage, index) => {
      const previous = overview.stages[index - 1];
      const status = stage.unlocked
        ? (stage.qualified ? '本阶段已达标' : `连续达标 ${stage.qualifyingStreak}/3`)
        : `还差 ${previous?.remaining ?? 3} 条达标记录解锁`;
      return `<section class="card listening-stage ${stage.unlocked ? '' : 'locked'}">
        <div class="listening-stage-head"><div><span class="stage-number">SECTION ${stage.sectionNumber}</span><h2>${stage.unlocked ? '已解锁' : '尚未解锁'}</h2></div><span class="stage-status">${status}</span></div>
        <div class="stage-progress"><span style="width:${stage.qualifyingStreak * 100 / 3}%"></span></div>
        <div class="listening-section-list">${stage.sections.length ? stage.sections.map((section) => `
          <button class="listening-section-item" data-listening-id="${section.id}" ${stage.unlocked ? '' : 'disabled'}>
            <span><strong>${escapeHtml(section.source_book)} Test ${section.test_number}</strong><small>${escapeHtml(section.title)}</small></span>
            <span class="section-score">${section.latest_attempt_id ? `最近 ${section.latest_score_correct}/${section.latest_score_total}` : '还没练过'}</span>
          </button>`).join('') : '<p class="stage-empty">本轮试运行暂未导入该阶段以外的题目</p>'}</div>
      </section>`;
    }).join('')}</div>
  </section>`;
  bindGoButtons();
  document.querySelectorAll('[data-listening-id]').forEach((button) => button.addEventListener('click', () => {
    state.listeningSectionId = Number(button.dataset.listeningId);
    navigate('listening-practice');
  }));
}

function listeningTranscriptHtml(segments) {
  return segments.map((segment) => {
    if (segment.type === 'text') return escapeHtml(segment.value);
    return `<label class="listening-blank" data-blank-number="${segment.number}"><span>Q${segment.number}</span><input name="answer_${segment.number}" data-answer-number="${segment.number}" type="text" autocomplete="off" aria-label="第 ${segment.number} 题答案"></label>`;
  }).join('');
}

function showListeningGrading(result) {
  for (const item of result.grading) {
    const blank = document.querySelector(`[data-blank-number="${item.number}"]`);
    if (!blank) continue;
    const feedback = document.createElement('span');
    feedback.className = `listening-answer-result ${item.correct ? 'correct' : 'incorrect'}`;
    feedback.textContent = item.correct
      ? `✓ Q${item.number} ${item.user_answer.trim()}`
      : `✕ Q${item.number} ${item.user_answer.trim() || '（空）'} → ${item.correct_answer}`;
    blank.replaceWith(feedback);
  }
  const summary = document.querySelector('#listening-score-result');
  summary.textContent = `自动判分：${result.score_correct}/${result.score_total}`;
  summary.hidden = false;
}

async function renderListeningPractice(sectionId) {
  if (!sectionId) return navigate('listening');
  const detail = await api(`/api/listening/sections/${sectionId}`);
  const { section, stage, attempts } = detail;
  root.innerHTML = `<section class="page listening-page listening-practice">
    ${pageHeader(`${escapeHtml(section.source_book)} Test ${section.test_number} · Part ${section.section_number}`, escapeHtml(section.title), '<button class="icon-button" data-go="listening" aria-label="返回听力练习首页">←</button>')}
    <article class="card audio-card">
      <span class="badge listening">Section ${section.section_number}</span>
      <h2>${escapeHtml(section.title)}</h2>
      <audio controls preload="metadata" src="${escapeHtml(section.audio_path)}">当前浏览器不支持音频播放。</audio>
      <p>播放音频，在下方原文挖空处填写答案，提交后自动判分。</p>
    </article>
    <article class="card listening-fill-card">
      <div><h2>原文填空</h2><p>答案位置由原文中的题号标记即时解析，不会另存题目副本。</p></div>
      <div id="listening-score-result" class="listening-score-result" hidden></div>
      <div class="listening-transcript-fill">${listeningTranscriptHtml(section.transcript_segments)}</div>
    </article>
    <div class="listening-reveal-grid">
      <article class="card reveal-card"><div><h2>完整原文</h2><p>默认隐藏，提交后复盘时再打开。</p></div><button class="secondary-button" data-reveal="transcript-panel">显示完整原文</button><pre id="transcript-panel" hidden>${escapeHtml(section.transcript_text)}</pre></article>
      <article class="card reveal-card"><div><h2>答案参考</h2><p>自评完成前建议保持隐藏。</p></div><button class="secondary-button" data-reveal="answer-panel">显示答案</button><pre id="answer-panel" hidden>${escapeHtml(section.answer_key_text)}</pre></article>
    </div>
    <article class="card listening-attempt-card">
      <div class="attempt-heading"><div><h2>记录这次练习</h2><p>当前阶段连续达标 ${stage.qualifyingStreak}/3</p></div><span class="stage-status">${stage.qualified ? '已达标' : `还差 ${stage.remaining} 条`}</span></div>
      <form id="listening-attempt-form">
        <fieldset class="checklist"><legend>5 项达标标准</legend>
          <label><input type="checkbox" name="check_gist">原文大意能看懂</label>
          <label><input type="checkbox" name="check_key_sentences">关键句能听懂</label>
          <label><input type="checkbox" name="check_paraphrase">题目改写能认出来</label>
          <label><input type="checkbox" name="check_redo_improved">错题重新做能明显提高</label>
          <label><input type="checkbox" name="check_retention">过两三天再听仍能听懂大部分</label>
        </fieldset>
        <div class="field"><label for="attempt-notes">备注（选填）</label><textarea id="attempt-notes" name="notes" maxlength="5000" placeholder="记下错因、易漏信号词或下次重点"></textarea></div>
        <button class="primary-button" type="submit">保存本次记录</button>
      </form>
    </article>
    <div class="section-heading"><h2>历史练习</h2><span class="muted-text">${attempts.length} 次</span></div>
    <div class="attempt-history">${attempts.length ? attempts.map((attempt) => `<article class="card attempt-row"><strong>${attempt.score_correct}/${attempt.score_total}</strong><span>${escapeHtml(attempt.attempt_date)}</span><small>${attempt.notes ? escapeHtml(attempt.notes) : '无备注'}</small></article>`).join('') : '<article class="card empty-state"><p>还没有练习记录。</p></article>'}</div>
  </section>`;
  bindGoButtons();
  document.querySelectorAll('[data-reveal]').forEach((button) => button.addEventListener('click', () => {
    const panel = document.querySelector(`#${button.dataset.reveal}`);
    panel.hidden = !panel.hidden;
    button.textContent = panel.hidden ? (button.dataset.reveal === 'transcript-panel' ? '显示完整原文' : '显示答案') : '收起';
  }));
  document.querySelector('#listening-attempt-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    const answers = Object.fromEntries([...document.querySelectorAll('[data-answer-number]')]
      .map((input) => [input.dataset.answerNumber, input.value]));
    const payload = {
      answers,
      notes: data.get('notes'),
      check_gist: data.has('check_gist'),
      check_key_sentences: data.has('check_key_sentences'),
      check_paraphrase: data.has('check_paraphrase'),
      check_redo_improved: data.has('check_redo_improved'),
      check_retention: data.has('check_retention')
    };
    submit.disabled = true;
    try {
      const result = await api(`/api/listening/sections/${section.id}/attempts`, { method: 'POST', body: JSON.stringify(payload) });
      showListeningGrading(result);
      form.querySelectorAll('input, textarea, button').forEach((control) => { control.disabled = true; });
      submit.textContent = `已自动判分 ${result.score_correct}/${result.score_total}`;
      showToast(result.attempt.qualified ? '记录已保存：本次达标' : '记录已保存：本次未达标');
    } catch (error) {
      submit.disabled = false;
      showToast(error.message);
    }
  });
}

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => { state.editingId = null; navigate(button.dataset.page); }));
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
if ('speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged', () => speech.refreshButtons(root));
navigate('home');
