'use strict';

window.IeltsFoundations = (() => {
  let metadata;
  const meta = async api => metadata ||= await api('/api/foundations/meta');
  async function errorPicker(container, { api, escapeHtml, showToast, url, value = null }) {
    const { errorTypes } = await meta(api);
    if (!container.isConnected) return;
    container.classList.add('field');
    container.innerHTML = `<label>错因（选填）<select class="error-type"><option value="">不标记</option>${Object.entries(errorTypes).map(([key, label]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`;
    const select = container.querySelector('select');
    let saved = value || '';
    select.onchange = async () => {
      select.disabled = true;
      try {
        await api(url, { method: 'PUT', body: JSON.stringify({ error_type: select.value || null }) });
        saved = select.value;
        showToast(saved ? '错因已保存' : '已清空错因');
      } catch (error) { select.value = saved; showToast(error.message); }
      finally { select.disabled = false; }
    };
  }
  function mount({ root, navigate }) {
    const entries = [
      ['数字专项', 'numbers'], ['拼写专项', 'spelling'],
      ['同义替换专项', 'paraphrase'], ['答案预测专项', 'prediction']
    ];
    root.innerHTML = `<section class="page foundations-page"><header class="page-header"><div><h1>听力基础训练</h1><p>IELTS Listening Foundations</p></div></header>
      <div class="grid number-grid">${entries.map(([title, target]) => `<button class="card number-tile ${target ? '' : 'disabled'}" data-foundation="${target || ''}" ${target ? '' : 'disabled'}><span class="number-label">${title}</span><span class="number-arrow">${target ? '→' : '即将上线'}</span></button>`).join('')}</div></section>`;
    root.querySelectorAll('[data-foundation]:not([disabled])').forEach(button => {
      button.onclick = () => navigate(button.dataset.foundation);
    });
  }
  return { mount, meta, errorPicker };
})();
