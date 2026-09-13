'use strict';

window.IeltsSpelling = (() => {
  let generation = 0;
  function dispose() { generation += 1; window.speechSynthesis?.cancel(); }
  async function mount(context) {
    const { root, api, escapeHtml, speech, showToast, navigate } = context;
    const token = ++generation;
    const { spellingCategories } = await window.IeltsFoundations.meta(api);
    if (token !== generation) return;
    const header = (title, back) => `<header class="page-header"><div><h1>${escapeHtml(title)}</h1><p>听发音，写出正确拼写</p></div><button class="text-link" id="spelling-back">${back}</button></header>`;
    function home() {
      root.innerHTML = `<section class="page spelling-page">${header('拼写专项', '返回专项')}<div class="grid number-grid">${Object.entries(spellingCategories).map(([key, label], index) => `<button class="card number-tile" data-spelling-category="${key}"><span>${String.fromCharCode(65 + index)} · ${escapeHtml(label)}</span><span>→</span></button>`).join('')}<button class="card number-tile" data-spelling-category="mistakes">我的错词 <span>→</span></button></div></section>`;
      root.querySelector('#spelling-back').onclick = () => navigate('foundations');
      root.querySelectorAll('[data-spelling-category]').forEach(button => {
        button.onclick = () => practice(button.dataset.spellingCategory);
      });
    }
    async function practice(category) {
      const current = ++generation;
      const title = category === 'mistakes' ? '我的错词' : spellingCategories[category];
      root.innerHTML = `<section class="page spelling-page">${header(title, '返回分类')}<div id="spelling-practice" class="card spelling-card">正在准备…</div></section>`;
      root.querySelector('#spelling-back').onclick = () => { dispose(); home(); };
      try {
        const cards = await api(`/api/spelling/cards?${category === 'mistakes' ? 'mistakes=true' : `category=${category}`}`);
        if (current !== generation) return;
        const panel = root.querySelector('#spelling-practice');
        const card = cards[0]; // Database randomizes this category's cards.
        if (!card) {
          panel.innerHTML = '<h2>还没有可练习的卡片</h2><p>录入拼写卡并选择分类后，就能在这里练习。</p><button class="primary-button" id="spelling-entry">录入卡片</button>';
          panel.querySelector('#spelling-entry').onclick = () => navigate('entry');
          return;
        }
        panel.dataset.cardId = card.id;
        panel.innerHTML = `<p class="practice-notice">⚠️ 专项自测，本轮不影响复习进度</p><span class="badge listening">第 ${card.box} 箱</span><h2>${escapeHtml(card.front)}</h2>
          <div class="spelling-audio">${speech.buttonHtml(card.spelling_audio, '正确拼写', { base64: true })}<span>播放题目</span></div>
          <form id="foundation-spelling-form" class="field form-grid"><label for="foundation-spelling-answer">你的答案</label><input id="foundation-spelling-answer" name="answer" required maxlength="5000" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="submit" class="primary-button">提交答案</button></form>
          <div id="foundation-spelling-result" class="spelling-result" hidden></div><button class="secondary-button" id="foundation-spelling-next" hidden>下一张</button>`;
        speech.bindButtons(panel);
        const form = panel.querySelector('form');
        form.onsubmit = async event => {
          event.preventDefault();
          const submit = form.querySelector('button'); submit.disabled = true;
          try {
            const result = await api(`/api/practice/cards/${card.id}/spelling`, { method: 'POST', body: JSON.stringify({ answer: form.elements.answer.value }) });
            if (current !== generation) return;
            const feedback = panel.querySelector('#foundation-spelling-result');
            feedback.hidden = false;
            feedback.innerHTML = `${result.correct ? '✓ 拼写正确' : '✕ 拼写错误'}<p>正确答案：<strong>${escapeHtml(result.correct_answer)}</strong></p>${!result.correct && card.skill === '听力' ? '<p>本次为自测。可在今日正式复习答错后标记错因。</p><button class="text-link" id="spelling-formal">进入今日复习</button>' : ''}`;
            panel.querySelector('#spelling-formal')?.addEventListener('click', () => navigate('review'));
            form.hidden = true; panel.querySelector('#foundation-spelling-next').hidden = false;
          } catch (error) { if (current === generation) { showToast(error.message); submit.disabled = false; } }
        };
        panel.querySelector('#foundation-spelling-next').onclick = () => practice(category);
      } catch (error) {
        if (current === generation) {
          showToast(error.message);
          root.querySelector('#spelling-practice').textContent = '暂时无法加载，请返回分类后重试。';
        }
      }
    }
    home();
  }
  return { mount, dispose };
})();
