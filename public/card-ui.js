(function initCardUi(globalScope, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalScope) globalScope.IeltsCardUi = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCardUi() {
  'use strict';

  function noteLabel(skill, type) {
    return type === '句子对照' ? '错因（选填）' : '备注（选填）';
  }

  return { noteLabel };
});
