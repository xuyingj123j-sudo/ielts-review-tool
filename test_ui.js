'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const cardUi = require('./public/card-ui');

assert.equal(cardUi.noteLabel('阅读', '句子对照'), '错因（选填）');
assert.equal(cardUi.noteLabel('听力', '句子对照'), '错因（选填）');
assert.equal(cardUi.noteLabel('口语', '句子对照'), '错因（选填）');
assert.equal(cardUi.noteLabel('阅读', '生词'), '备注（选填）');
console.log('✓ note 动态标签断言通过：任意技能+句子对照均显示“错因（选填）”，其他类型显示“备注（选填）”');
const appSource = fs.readFileSync(require.resolve('./public/app.js'), 'utf8');
assert.match(appSource, /id="show-writing-form"/);
assert.match(appSource, /id="writing-content"[\s\S]*maxlength="5000"/);
assert.match(appSource, /id="cancel-writing"/);
assert.match(appSource, /if \(!content\)[\s\S]*return;/);
assert.match(appSource, /JSON\.stringify\(\{ content \}\)/);
assert.match(appSource, /weekly\.writing\.records\.map/);
console.log('✓ 写作录入 UI 合同断言通过：展开 textarea、取消、空内容拦截、携带 content 提交及周记录渲染均存在');
assert.match(appSource, /name="front_audio"[\s\S]*maxlength="5000"/);
assert.equal((appSource.match(/escapeHtml\(card\?\.front_audio \|\| ''\)/g) || []).length, 1);
assert.match(appSource, /<h3>\$\{escapeHtml\(card\.front\)\}<\/h3>\$\{speech\.buttonHtml\(speech\.frontText\(card\)/);
assert.match(appSource, /<h2>\$\{escapeHtml\(card\.front\)\}<\/h2>\$\{speech\.buttonHtml\(speech\.frontText\(card\)/);
assert.doesNotMatch(appSource, /<(?:h2|h3|p)[^>]*>\$\{escapeHtml\(card\??\.front_audio/);
console.log('✓ front_audio 可见渲染合同断言通过：只在录入/编辑 textarea 回显，卡片库与复习正面只渲染 front');
console.log('全部字段标签 UI 规则测试通过。');
