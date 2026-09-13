'use strict';

window.IeltsPrediction = (() => {
  const typeLabels = {
    NUMBER: 'Number · 数字', NOUN: 'Noun · 名词', VERB: 'Verb · 动词',
    ADJECTIVE: 'Adjective · 形容词', DATE: 'Date · 日期', TIME: 'Time · 时间',
    PLACE: 'Place · 地点', NAME: 'Name · 姓名', OTHER: 'Other · 其他'
  };
  let context;
  let generation = 0;

  function dispose() {
    generation += 1;
    window.speechSynthesis?.cancel();
  }

  const post = (route, body = {}) => context.api(`/api/prediction/${route}`, {
    method: 'POST', body: JSON.stringify(body)
  });

  function shell(title, subtitle, html, back) {
    dispose();
    window.scrollTo({ top: 0, behavior: 'instant' });
    context.root.innerHTML = `<section class="page numbers-page prediction-page"><header class="page-header"><div><h1>${context.escapeHtml(title)}</h1><p>${context.escapeHtml(subtitle)}</p></div><button class="text-link" id="prediction-back">${context.escapeHtml(back.label)}</button></header>${html}</section>`;
    context.root.querySelector('#prediction-back').onclick = back.action;
    return generation;
  }

  function home() {
    shell('答案预测', '先判断空格需要什么，再用听力验证。', `
      <div class="hero number-hero prediction-hero"><p class="eyebrow">PREDICT BEFORE LISTENING</p><h2>先猜类型，再听答案</h2><button class="primary-button" id="prediction-start">开始预测</button></div>
      <div class="grid number-grid"><button class="card number-tile" id="prediction-mistakes"><span class="number-label">↻ 错题</span><span class="number-arrow">→</span></button><button class="card number-tile" id="prediction-stats"><span class="number-label">▥ 统计</span><span class="number-arrow">→</span></button></div>`,
    { label: '返回专项', action: () => context.navigate('foundations') });
    context.root.querySelector('#prediction-start').onclick = start;
    context.root.querySelector('#prediction-mistakes').onclick = mistakes;
    context.root.querySelector('#prediction-stats').onclick = stats;
  }

  async function start() {
    const token = shell('STEP 1 · 预测类型', '只看题干，先判断空格需要哪类答案。', '<article class="card number-practice prediction-practice">正在准备题目…</article>', { label: '返回首页', action: home });
    try {
      const question = await post('question');
      if (token !== generation) return;
      const panel = context.root.querySelector('.prediction-practice');
      panel.dataset.step = '1';
      panel.innerHTML = `<span class="badge listening">STEP 1</span><p class="prediction-sentence">${context.escapeHtml(question.sentenceWithBlank)}</p><p class="number-status">选择你预测的答案类型</p><div class="prediction-type-grid">${Object.entries(typeLabels).map(([type, label]) => `<button type="button" class="secondary-button prediction-type" data-prediction-type="${type}">${context.escapeHtml(label)}</button>`).join('')}</div>`;
      panel.querySelectorAll('[data-prediction-type]').forEach((button) => {
        button.onclick = async () => {
          panel.querySelectorAll('button').forEach((item) => { item.disabled = true; });
          try {
            const result = await post('predict', { questionId: question.questionId, predictedType: button.dataset.predictionType });
            if (token === generation) showStepTwo(question.questionId, button.dataset.predictionType, result.spokenText);
          } catch (error) {
            if (token === generation) {
              panel.querySelectorAll('button').forEach((item) => { item.disabled = false; });
              context.showToast(error.message);
            }
          }
        };
      });
    } catch (error) {
      if (token === generation) context.root.querySelector('.prediction-practice').textContent = error.message;
    }
  }

  function showStepTwo(questionId, predictedType, spokenText) {
    const token = shell('STEP 2 · 听音填空', '类型已经锁定，现在播放完整句子。', `<article class="card number-practice prediction-practice" data-step="2"><span class="badge reading">STEP 2</span><div class="number-status">你的预测：${context.escapeHtml(typeLabels[predictedType])}</div><button type="button" class="primary-button number-speaker" id="prediction-play" aria-label="播放完整句子">🔊</button><p id="prediction-play-status">点击播放完整句子</p><form id="prediction-form"><label for="prediction-answer">你听到的答案</label><input id="prediction-answer" autocomplete="off" maxlength="5000" placeholder="填写空格里的实际答案"><button class="primary-button" type="submit">提交答案</button></form><div id="prediction-feedback" role="status"></div><button class="secondary-button" id="prediction-next" hidden>下一题</button></article>`, { label: '返回首页', action: home });
    const panel = context.root.querySelector('.prediction-practice');
    const input = panel.querySelector('#prediction-answer');
    const play = panel.querySelector('#prediction-play');
    play.onmousedown = event => event.preventDefault();
    play.onclick = () => {
      input.focus({ preventScroll: true });
      if (!context.speech.speak(spokenText)) context.showToast('英文语音尚未就绪，请启用设备英文语音后重试');
    };
    const form = panel.querySelector('#prediction-form');
    form.onsubmit = async event => {
      event.preventDefault();
      const submit = form.querySelector('button');
      submit.disabled = true;
      input.disabled = true;
      window.speechSynthesis?.cancel();
      try {
        const result = await post('answer', { questionId, userAnswer: input.value });
        if (token !== generation) return;
        form.hidden = true;
        play.disabled = true;
        panel.querySelector('#prediction-play-status').hidden = true;
        panel.querySelector('#prediction-feedback').innerHTML = `<div class="prediction-feedback-row ${result.predictionCorrect ? 'correct' : 'incorrect'}"><strong>预测：${result.predictionCorrect ? '对 ✓' : '错 ✕'}</strong><span>你选的 ${context.escapeHtml(typeLabels[predictedType])}，正确是 ${context.escapeHtml(typeLabels[result.correctType])}</span></div><div class="prediction-feedback-row ${result.answerCorrect ? 'correct' : 'incorrect'}"><strong>答案：${result.answerCorrect ? '对 ✓' : '错 ✕'}</strong><span>正确答案：${context.escapeHtml(result.correctAnswer)}</span></div><p class="prediction-complete-sentence">完整原句：${context.escapeHtml(result.sentence)}</p>`;
        panel.querySelector('#prediction-next').hidden = false;
      } catch (error) {
        if (token === generation) {
          submit.disabled = false;
          input.disabled = false;
          context.showToast(error.message);
        }
      }
    };
    panel.querySelector('#prediction-next').onclick = start;
    input.focus();
  }

  async function stats() {
    const token = shell('答案预测统计', '类型判断和听写答案分别计算。', '<div class="prediction-report">加载中…</div>', { label: '返回首页', action: home });
    try {
      const data = await context.api('/api/prediction/stats');
      if (token !== generation) return;
      context.root.querySelector('.prediction-report').innerHTML = `<div class="grid number-grid"><article class="card stat-card listening"><span class="stat-label">预测类型正确率</span><strong class="stat-value">${data.predictionAccuracy === null ? '—' : `${data.predictionAccuracy}%`}</strong><small>${data.total} 题</small></article><article class="card stat-card reading"><span class="stat-label">填写答案正确率</span><strong class="stat-value">${data.answerAccuracy === null ? '—' : `${data.answerAccuracy}%`}</strong><small>${data.total} 题</small></article></div>`;
    } catch (error) {
      if (token === generation) context.root.querySelector('.prediction-report').textContent = error.message;
    }
  }

  async function mistakes() {
    const token = shell('最近错题', '预测或填写任一项出错，都会留在这里。', '<div class="prediction-report">加载中…</div>', { label: '返回首页', action: home });
    try {
      const rows = await context.api('/api/prediction/mistakes?limit=20');
      if (token !== generation) return;
      context.root.querySelector('.prediction-report').innerHTML = rows.length ? `<div class="number-mistake-list">${rows.map((row) => `<article class="card number-mistake"><span class="badge ${row.prediction_correct ? 'reading' : 'listening'}">预测${row.prediction_correct ? '正确' : '错误'}</span><span class="badge ${row.answer_correct ? 'reading' : 'listening'}">答案${row.answer_correct ? '正确' : '错误'}</span><p class="prediction-sentence-small">${context.escapeHtml(row.sentence_template.replaceAll('{V}', '______'))}</p><p>你的预测：${context.escapeHtml(typeLabels[row.predicted_type])} · 正确类型：<strong>${context.escapeHtml(typeLabels[row.correct_type])}</strong></p><p>你的答案：${context.escapeHtml(row.user_answer) || '未作答'} · 正确答案：<strong>${context.escapeHtml(row.correct_answer)}</strong></p><small>${context.escapeHtml(row.attempted_at)}</small></article>`).join('')}</div>` : '<article class="card empty-state">还没有需要回顾的答案预测记录。</article>';
    } catch (error) {
      if (token === generation) context.root.querySelector('.prediction-report').textContent = error.message;
    }
  }

  return { mount(options) { context = options; home(); }, dispose };
})();
