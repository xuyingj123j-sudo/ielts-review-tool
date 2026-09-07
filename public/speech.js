'use strict';

(function exposeSpeechTools(globalObject, factory) {
  const speechTools = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = speechTools;
  if (globalObject) globalObject.IeltsSpeech = speechTools;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function hasEnglish(text = '') {
    return /[a-zA-Z]/.test(String(text));
  }

  function frontText(card = {}) {
    return String(card.front_audio || '').trim() || card.front || '';
  }

  function escapeAttribute(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function selectEnglishVoice(voices = []) {
    return voices.find((voice) => String(voice.lang).toLowerCase().startsWith('en-gb'))
      || voices.find((voice) => String(voice.lang).toLowerCase().startsWith('en'))
      || null;
  }

  function getEnglishVoice(synth) {
    if (!synth || typeof synth.getVoices !== 'function') return null;
    return selectEnglishVoice(synth.getVoices());
  }

  function speak(text, options = {}) {
    const synth = options.synth || globalThis.speechSynthesis;
    const Utterance = options.Utterance || globalThis.SpeechSynthesisUtterance;
    const voice = getEnglishVoice(synth);
    if (!hasEnglish(text) || !voice || typeof Utterance !== 'function') return false;

    synth.cancel();
    const utterance = new Utterance(String(text));
    utterance.voice = voice;
    utterance.lang = voice.lang || 'en-GB';
    synth.speak(utterance);
    return true;
  }

  function buttonHtml(text, label, options = {}) {
    const actualText = options.base64 ? decodeBase64Utf8(text) : text;
    if (!options.force && !hasEnglish(actualText)) return '';
    const target = options.target
      ? ` data-speech-target="${escapeAttribute(options.target)}"`
      : options.base64
        ? ` data-speech-base64="${escapeAttribute(text)}"`
        : ` data-speech-text="${escapeAttribute(text)}"`;
    const fallbackTarget = options.fallbackTarget
      ? ` data-speech-fallback-target="${escapeAttribute(options.fallbackTarget)}"`
      : '';
    const hidden = hasEnglish(actualText) ? '' : ' hidden';
    return `<button class="speech-button" type="button"${target}${fallbackTarget}${hidden} aria-label="朗读${escapeAttribute(label)}" title="朗读${escapeAttribute(label)}">🔊</button>`;
  }

  function decodeBase64Utf8(value = '') {
    if (typeof Buffer !== 'undefined') return Buffer.from(String(value), 'base64').toString('utf8');
    const bytes = Uint8Array.from(globalThis.atob(String(value)), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function buttonText(button, documentRef) {
    if (button.dataset.speechTarget) {
      const primary = documentRef.getElementById(button.dataset.speechTarget)?.value || '';
      if (primary.trim()) return primary;
      return documentRef.getElementById(button.dataset.speechFallbackTarget)?.value || '';
    }
    if (button.dataset.speechBase64) return decodeBase64Utf8(button.dataset.speechBase64);
    return button.dataset.speechText || '';
  }

  function refreshButton(button, options = {}) {
    const documentRef = options.documentRef || globalThis.document;
    const synth = options.synth || globalThis.speechSynthesis;
    const text = buttonText(button, documentRef);
    button.hidden = !hasEnglish(text);
    button.disabled = !button.hidden && !getEnglishVoice(synth);
  }

  function bindButtons(container, options = {}) {
    const documentRef = options.documentRef || globalThis.document;
    const buttons = [...container.querySelectorAll('.speech-button')];
    buttons.forEach((button) => {
      const target = button.dataset.speechTarget
        ? documentRef.getElementById(button.dataset.speechTarget)
        : null;
      const fallbackTarget = button.dataset.speechFallbackTarget
        ? documentRef.getElementById(button.dataset.speechFallbackTarget)
        : null;
      const refresh = () => refreshButton(button, options);
      target?.addEventListener('input', refresh);
      fallbackTarget?.addEventListener('input', refresh);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        speak(buttonText(button, documentRef), options);
      });
      refresh();
    });
  }

  function refreshButtons(container, options = {}) {
    container.querySelectorAll('.speech-button').forEach((button) => refreshButton(button, options));
  }

  return { hasEnglish, frontText, selectEnglishVoice, speak, buttonHtml, bindButtons, refreshButtons };
});
