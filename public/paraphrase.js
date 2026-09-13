'use strict';

window.IeltsParaphrase = (() => {
  let generation = 0;

  function dispose() {
    generation += 1;
    window.speechSynthesis?.cancel();
  }

  async function mount(context) {
    const { root, api, escapeHtml, speech, showToast, navigate } = context;
    const notice = '<p class="practice-notice">⚠️ 专项自测，本轮不影响复习进度</p>';
    const header = (title, back) => `<header class="page-header"><div><h1>${escapeHtml(title)}</h1><p>看题干，回忆原文表达</p></div><button class="text-link" id="paraphrase-back">${back}</button></header>`;

    function home() {
      const current = ++generation;
      root.innerHTML = `<section class="page paraphrase-page">${header('同义替换专项', '返回专项')}${notice}<div class="grid number-grid">
        <button class="card number-tile" id="paraphrase-start"><span class="number-label">开始练习</span><span class="number-arrow">→</span></button>
        <button class="card number-tile" id="paraphrase-mistakes"><span class="number-label">我的错题</span><span class="number-arrow">→</span></button>
      </div></section>`;
      root.querySelector('#paraphrase-back').onclick = () => navigate('foundations');
      root.querySelector('#paraphrase-start').onclick = () => practice(false, current);
      root.querySelector('#paraphrase-mistakes').onclick = () => practice(true, current);
    }

    async function practice(mistakes) {
      const current = ++generation;
      const title = mistakes ? '我的错题' : '同义替换练习';
      root.innerHTML = `<section class="page paraphrase-page">${header(title, '返回首页')}${notice}<div id="paraphrase-practice" class="card spelling-card">正在准备…</div></section>`;
      root.querySelector('#paraphrase-back').onclick = () => { dispose(); home(); };
      try {
        const cards = await api(`/api/paraphrase/cards${mistakes ? '?mistakes=true' : ''}`);
        if (current !== generation) return;
        const panel = root.querySelector('#paraphrase-practice');
        const card = cards[0];
        if (!card) {
          panel.innerHTML = `<h2>${mistakes ? '还没有同义替换错题' : '还没有同义替换卡片'}</h2><p>先在卡片库录入同义替换卡片，就能在这里自测。</p>`;
          return;
        }
        panel.dataset.cardId = card.id;
        panel.innerHTML = `<span class="badge reading">题目表达</span><h2>${escapeHtml(card.front)}</h2>
          <form id="paraphrase-form" class="field form-grid"><label for="paraphrase-answer">你回忆的原文表达</label><input id="paraphrase-answer" name="answer" required maxlength="5000" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="submit" class="primary-button">提交答案</button></form>
          <div id="paraphrase-result" class="spelling-result" hidden></div><button class="secondary-button" id="paraphrase-next" hidden>下一张</button>`;
        const form = panel.querySelector('#paraphrase-form');
        form.onsubmit = async event => {
          event.preventDefault();
          const submit = form.querySelector('button');
          submit.disabled = true;
          try {
            const result = await api(`/api/paraphrase/cards/${card.id}/test`, { method: 'POST', body: JSON.stringify({ answer: form.elements.answer.value }) });
            if (current !== generation) return;
            const feedback = panel.querySelector('#paraphrase-result');
            feedback.hidden = false;
            feedback.classList.add(result.correct ? 'correct' : 'incorrect');
            feedback.innerHTML = `${result.correct ? '✓ 回忆正确' : '✕ 再记一次'}<p>正确答案：<strong>${escapeHtml(result.correct_answer)}</strong>${speech.buttonHtml(result.correct_answer, '正确答案')}</p>`;
            speech.bindButtons(feedback);
            form.hidden = true;
            panel.querySelector('#paraphrase-next').hidden = false;
          } catch (error) {
            if (current === generation) { showToast(error.message); submit.disabled = false; }
          }
        };
        panel.querySelector('#paraphrase-next').onclick = () => practice(mistakes);
        form.elements.answer.focus();
      } catch (error) {
        if (current === generation) {
          showToast(error.message);
          root.querySelector('#paraphrase-practice').textContent = '暂时无法加载，请返回首页后重试。';
        }
      }
    }

    home();
  }

  return { mount, dispose };
})();
