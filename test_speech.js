'use strict';

const assert = require('node:assert/strict');
const speech = require('./public/speech');

class MockUtterance {
  constructor(text) { this.text = text; }
}

function createButton(text) {
  const handlers = {};
  return {
    dataset: { speechText: text },
    hidden: false,
    disabled: false,
    addEventListener(name, handler) { handlers[name] = handler; },
    click() {
      handlers.click({ preventDefault() {}, stopPropagation() {} });
    }
  };
}

const calls = [];
const britishVoice = { name: 'British English', lang: 'en-GB' };
const synth = {
  getVoices: () => [{ name: 'US English', lang: 'en-US' }, britishVoice],
  cancel: () => calls.push('cancel'),
  speak: (utterance) => calls.push({ text: utterance.text, voice: utterance.voice, lang: utterance.lang })
};
const audioCard = {
  front: 'She often goes to a ______ near her house.',
  front_audio: 'She often goes to a keep-fit studio near her house.'
};
const englishButton = createButton(speech.frontText(audioCard));
const container = { querySelectorAll: () => [englishButton] };
speech.bindButtons(container, { synth, Utterance: MockUtterance, documentRef: {} });
englishButton.click();

assert.deepEqual(calls, [
  'cancel',
  { text: audioCard.front_audio, voice: britishVoice, lang: 'en-GB' }
]);
assert.notEqual(calls[1].text, audioCard.front);
console.log(`✓ front_audio 朗读断言通过：speak 文本 = ${JSON.stringify(calls[1].text)}，不是 front = ${JSON.stringify(audioCard.front)}`);

calls.length = 0;
const legacyCard = { front: 'identify the different species of butterflies', front_audio: null };
const legacyButton = createButton(speech.frontText(legacyCard));
speech.bindButtons({ querySelectorAll: () => [legacyButton] }, { synth, Utterance: MockUtterance, documentRef: {} });
legacyButton.click();
assert.deepEqual(calls, [
  'cancel',
  { text: legacyCard.front, voice: britishVoice, lang: 'en-GB' }
]);
console.log(`✓ 旧卡向后兼容断言通过：front_audio 为 null 时 speak 文本回退为 front = ${JSON.stringify(calls[1].text)}`);

calls.length = 0;
const spellingBack = 'movie/film';
const spellingButtonMarkup = speech.buttonHtml(Buffer.from(spellingBack, 'utf8').toString('base64'), '正确拼写', { base64: true });
assert.equal(spellingButtonMarkup.includes(spellingBack), false);
const encoded = spellingButtonMarkup.match(/data-speech-base64="([^"]+)"/)[1];
const spellingButton = createButton('');
spellingButton.dataset = { speechBase64: encoded };
speech.bindButtons({ querySelectorAll: () => [spellingButton] }, { synth, Utterance: MockUtterance, documentRef: {} });
spellingButton.click();
assert.equal(calls[1].text, spellingBack);
console.log('✓ 拼写模式朗读断言通过：DOM不含back明文，点击喇叭时 speak 文本 = "movie/film"');

calls.length = 0;
englishButton.dataset.speechText = 'second request';
englishButton.click();
assert.deepEqual(calls, [
  'cancel',
  { text: 'second request', voice: britishVoice, lang: 'en-GB' }
]);
console.log('✓ 连续点击断言通过：第二次朗读再次先调用 cancel，没有排队叠加');

assert.equal(speech.buttonHtml('无处不在的', '卡片背面'), '');
assert.match(speech.buttonHtml('ubiquitous', '卡片正面'), /class="speech-button"/);
console.log('✓ 显示规则断言通过：纯中文“无处不在的”不生成喇叭；英文“ubiquitous”生成喇叭');

const fallbackVoice = { name: 'US English', lang: 'en-US' };
assert.equal(speech.selectEnglishVoice([{ name: '中文', lang: 'zh-CN' }, fallbackVoice]), fallbackVoice);
assert.equal(speech.speak('hello', {
  synth: { getVoices: () => [{ name: '中文', lang: 'zh-CN' }], cancel() {}, speak() {} },
  Utterance: MockUtterance
}), false);
console.log('✓ 语音降级断言通过：无 en-GB 时选择 en-US；没有英文语音时安全返回且不朗读');

console.log('全部朗读功能测试通过。');
