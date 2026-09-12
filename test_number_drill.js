'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawnSync } = require('node:child_process');
const { promisify } = require('node:util');
const Database = require('better-sqlite3');
const { ReviewDatabase } = require('./src/db');
const { ReviewService } = require('./src/services');
const { createApp } = require('./src/app');
const { generateQuestion, gradeAnswer, ordinal, yearToWords, CATEGORIES, DIALOGUE_TEMPLATES } = require('./src/domain/numberDrill');
const { browserTest } = require('./scripts/test_number_browser');

const now = new Date('2026-09-09T12:00:00Z');
function fixed(category, values) {
  return generateQuestion({ category, now, random: () => { assert.ok(values.length); return values.shift(); } });
}
function grade(category, correctAnswer, good, bad) {
  for (const userAnswer of good) assert.equal(gradeAnswer({ category, correctAnswer, userAnswer }), true, userAnswer);
  for (const userAnswer of bad) assert.equal(gradeAnswer({ category, correctAnswer, userAnswer }), false, userAnswer);
}
function unitTests() {
  assert.equal(ordinal(21), 'twenty-first'); assert.equal(ordinal(11), 'eleventh'); assert.equal(ordinal(12), 'twelfth');
  assert.equal(ordinal(13), 'thirteenth'); assert.equal(ordinal(22), 'twenty-second'); assert.equal(ordinal(31), 'thirty-first');
  for (const [year, words] of [[2019, 'twenty nineteen'], [1990, 'nineteen ninety'], [2000, 'two thousand'], [2005, 'two thousand and five']]) assert.equal(yearToWords(year), words);
  const date = fixed('date', [59.1 / 76, 2.1 / 12, 20.1 / 31]);
  assert.equal(date.spokenText, 'the twenty-first of March, twenty nineteen');
  assert.equal(date.correctAnswer, '2019-03-21');
  assert.equal(fixed('date', [64.1 / 76, 1.1 / 12, .999]).correctAnswer, '2024-02-29');
  assert.equal(fixed('date', [63.1 / 76, 1.1 / 12, .999]).correctAnswer, '2023-02-28');
  console.log('✓ 1 日期生成：the twenty-first of March, twenty nineteen；序数词、年份、闰年断言通过');
  grade('date', date.correctAnswer, ['21/03/2019', '2019-03-21', '21-03-2019', '21.03.19', '2019 03 21'], ['22/03/2019', '31/02/2019']);
  grade('date', '2035-01-01', ['1/1/35'], ['1/1/36']);
  grade('date', '1936-01-01', ['1/1/36'], ['1/1/35']);
  console.log('✓ 2 日期判分：三种指定格式、两位年份边界及错误日期通过');
  const time = fixed('time', [15.1 / 24, 9.1 / 12]);
  assert.equal(time.spokenText, 'quarter to four in the afternoon'); assert.equal(time.correctAnswer, '15:45');
  grade('time', time.correctAnswer, ['3:45pm', '15:45', '3:45 PM'], ['3:45am', '15:45pm']);
  grade('time', '00:00', ['12:00am'], ['12:00pm']);
  grade('time', '12:00', ['12:00 PM'], ['00:00']);
  for (const [minute, phrase] of [[0, "three o'clock"], [5, 'five past three'], [15, 'quarter past three'], [30, 'half past three'], [35, 'twenty-five to four'], [45, 'quarter to four']]) assert.equal(fixed('time', [15.1 / 24, (minute / 5 + .1) / 12]).spokenText, `${phrase} in the afternoon`);
  console.log('✓ 3 时间：quarter to four in the afternoon / 15:45；am/pm及拼读分支通过');
  const money = fixed('money', [0, 28.1 / 500, .9, .999]);
  assert.equal(money.correctAnswer, '£29.99'); assert.equal(money.spokenText, 'twenty-nine pounds and ninety-nine pence');
  grade('money', money.correctAnswer, ['29.99', '£29.99', '29.99 pounds'], ['29.90', '-29.99', '29.99.50']);
  assert.equal(fixed('money', [.9, 0, .1]).spokenText, 'one dollars');
  assert.equal(fixed('money', [.9, 0, .1]).correctAnswer, '$1.00');
  console.log('✓ 4 金额：£29.99 自然语言精确匹配；无符号/单位容错、整数金额通过');
  const phone = fixed('phone', [9, 1, 1, 2, 3, 4, 5, 6, 7].map(n => (n + .1) / 10));
  assert.equal(phone.correctAnswer, '07911234567'); assert.equal(phone.spokenText.split(', ').length, 11);
  assert.equal(phone.spokenText, 'zero, seven, nine, one, one, two, three, four, five, six, seven');
  grade('phone', phone.correctAnswer, ['07911 234567', '07911234567'], ['0791123456']);
  console.log('✓ 5 手机号：07911234567 逐位朗读11段；空格容错和缺位错误通过');
  const number = fixed('number', [2.1 / 6, 3829.1 / 9000]);
  assert.equal(number.correctAnswer, '4829'); assert.equal(number.spokenText, '4829');
  grade('number', number.correctAnswer, ['4829', '4,829'], ['4830']);
  console.log('✓ 6 一般数字：固定生成4829；4829、4,829正确，4830错误');
  grade('time', '03:50', ['０３：５０', '03： 50', '　０３：　５０　'], ['０３：５１', '０４：５０', '０３：６０', '２４：５０']);
  grade('date', '2019-03-21', ['２１／０３／２０１９', '２０１９－０３－２１', '２１．０３．２０１９', '　２０１９　０３　２１　'], ['２２／０３／２０１９', '２０１９－０４－２１', '３１／０２／２０１９']);
  grade('money', '£1234.56', ['１２３４．５６', '£１，２３４．５６', '　１，２３４．５６　'], ['１２３４．５７', '－１２３４．５６', '１２３４．５６．７']);
  grade('number', '4829', ['４８２９', '４，８２９', '　４８２９　'], ['４８３０', '４８２', '４８２９０', '4829０']);
  grade('phone', '07911234567', ['０７９１１２３４５６７', '　０７９１１　２３４５６７　'], ['０７９１１２３４５６８', '０７９１１２３４５６', '０７９１１２３４５６７０', '07911234567０']);
  console.log('✓ 全角判分：五类别、全部指定全角标点/空格及混合输入通过；错数字、缺位/多位、非法日期/时间/金额仍判错');
  for (const value of Object.values(DIALOGUE_TEMPLATES)) {
    assert.ok(value.templates.length >= 2);
    for (const template of value.templates) { assert.ok(template.includes('{V}')); assert.ok(!template.replaceAll('{V}', 'sample').includes('{V}')); }
  }
  const concrete = Object.keys(DIALOGUE_TEMPLATES).filter(key => key !== 'mixed');
  concrete.forEach((subtype, index) => {
    let first = true;
    const question = generateQuestion({ mode: 'dialogue', subtype: 'mixed', now, random: () => { if (first) { first = false; return (index + .1) / concrete.length; } return .2; } });
    assert.equal(question.subtype, subtype); assert.equal(question.category, DIALOGUE_TEMPLATES[subtype].category);
    assert.equal(question.promptText, question.spokenText);
    const template = DIALOGUE_TEMPLATES[subtype].templates[0];
    assert.ok(question.promptText.startsWith(template.split('{V}')[0]));
    assert.ok(question.promptText.endsWith(template.split('{V}')[1]));
    assert.ok(!question.promptText.includes('{V}'));
  });
  console.log('✓ 7 模板：10个入口均有模板；mixed确定性遍历9个具体subtype，类别与场景均匹配');
}
function realSnapshot() {
  const db = new Database(path.join(__dirname, 'data', 'ielts.db'), { readonly: true, fileMustExist: true });
  try {
    return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'number_drill_attempts' ORDER BY name").all().map(({ name }) => [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all()]));
  } finally { db.close(); }
}
async function main() {
  const before = realSnapshot();
  unitTests();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-number-test-'));
  const database = new ReviewDatabase(path.join(temp, 'test.db'));
  let clock = now;
  const service = new ReviewService(database, () => clock);
  const server = createApp(service).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`TEST_SERVER=${base} PID=${process.pid}（随测试关闭）`);
  try {
    const curl = async (route, body, expected = body ? 201 : 200) => {
      const args = ['-sS', '-w', '\n%{http_code}', `${base}/api/numbers/${route}`];
      // Unicode escapes preserve full-width input through Windows curl's argument encoding.
      if (body) args.push('-H', 'content-type: application/json', '--data-binary', JSON.stringify(body).replace(/[^\x00-\x7F]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`));
      const { stdout } = await promisify(execFile)(process.platform === 'win32' ? 'curl.exe' : 'curl', args, { windowsHide: true });
      const lines = stdout.trim().split('\n'); const status = Number(lines.pop()); const data = JSON.parse(lines.join('\n'));
      assert.equal(status, expected, JSON.stringify(data));
      console.log(`curl ${body ? 'POST' : 'GET'} /api/numbers/${route} → ${status} ${JSON.stringify(data)}`);
      return data;
    };
    const q = await curl('question', { mode: 'dialogue', subtype: 'mixed' });
    assert.deepEqual(Object.keys(q).sort(), ['questionId', 'spokenText']);
    assert.equal(database.connection.prepare('SELECT COUNT(*) n FROM number_drill_attempts').get().n, 0);
    const answer = await curl('answer', { questionId: q.questionId, userAnswer: 'wrong' });
    assert.equal(answer.isCorrect, false); assert.ok(answer.correctAnswer); assert.equal(answer.promptText, q.spokenText);
    await curl('answer', { questionId: q.questionId, userAnswer: 'wrong' }, 400);
    const mistakes = await curl('mistakes'); assert.equal(mistakes[0].prompt_text, q.spokenText);
    const q2 = await curl('question', { mode: 'standalone', category: 'number' });
    const numberAnswer = await curl('answer', { questionId: q2.questionId, userAnswer: ` ${q2.spokenText} ` });
    assert.equal(numberAnswer.spokenText, q2.spokenText);
    assert.equal(database.connection.prepare('SELECT user_answer FROM number_drill_attempts ORDER BY id DESC LIMIT 1').get().user_answer, ` ${q2.spokenText} `);
    const stats = await curl('stats'); assert.equal(stats.total, 2); assert.equal(stats.accuracy, 50);
    const exam = await curl('exam/start', { questionCount: 3, categories: CATEGORIES });
    for (let index = 0; index < 3; index++) {
      const question = await curl('question', { mode: 'exam', category: CATEGORIES[index] });
      // Test fixture reads server memory; answer keys are never exposed by the HTTP question contract.
      const correctAnswer = service.pendingNumberQuestions.get(question.questionId).correctAnswer;
      await curl('answer', { questionId: question.questionId, userAnswer: index < 2 ? correctAnswer : '', examSessionId: exam.examSessionId });
    }
    const result = await curl(`exam/${exam.examSessionId}/summary`); assert.equal(result.score, 2); assert.equal(result.total, 3);
    const expiring = service.numberQuestion({ mode: 'standalone', category: 'number' });
    clock = new Date(now.getTime() + 600000);
    await curl('answer', { questionId: expiring.questionId, userAnswer: '' }, 400);
    assert.equal(service.pendingNumberQuestions.size, 0);
    await curl('question', { mode: 'dialogue', subtype: 'invalid' }, 400);
    await curl('mistakes?limit=0', undefined, 400);
    console.log('✓ 8 curl HTTP：不泄题、一次性提交、原始输入、错题、50%统计、考试2/3、空答案及10分钟过期全部通过');
    const timeQuestion = await curl('question', { mode: 'standalone', category: 'time' });
    const timeAnswer = await curl('answer', { questionId: timeQuestion.questionId, userAnswer: 'wrong' });
    assert.equal(timeAnswer.spokenText, timeQuestion.spokenText);
    assert.match(timeAnswer.spokenText, /past|to|o'clock/);
    console.log('✓ 读法 curl：standalone time 返回自然语言 spokenText；number 同样返回 spokenText');
    const widthQuestion = await curl('question', { mode: 'standalone', category: 'time' });
    const widthExpected = service.pendingNumberQuestions.get(widthQuestion.questionId).correctAnswer;
    const widthInput = widthExpected.replace(/[0-9:]/g, character => String.fromCharCode(character.charCodeAt(0) + 0xFEE0));
    const widthAnswer = await curl('answer', { questionId: widthQuestion.questionId, userAnswer: widthInput });
    assert.equal(widthAnswer.isCorrect, true);
    assert.equal(widthAnswer.correctAnswer, widthExpected);
    assert.equal(database.connection.prepare('SELECT user_answer FROM number_drill_attempts ORDER BY id DESC LIMIT 1').get().user_answer, widthInput);
    console.log(`✓ 全角 curl：userAnswer=${widthInput}，isCorrect=true；数据库保留原始全角输入`);
    await browserTest(base, temp, service);
    for (const file of ['test_srs.js', 'test_spelling.js', 'test_practice.js', 'test_speech.js', 'test_ui.js', 'test_listening.js']) {
      console.log(`\n> node ${file}`);
      const result = spawnSync(process.execPath, [file], { cwd: __dirname, encoding: 'utf8', windowsHide: true });
      process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
      assert.equal(result.status, 0, file);
    }
    assert.deepEqual(realSnapshot(), before);
    console.log(`✓ 9 六套回归通过；真实库${before.cards.length}张卡片及全部既有业务表逐行前后不变（18张旧卡迁移由test_spelling覆盖）`);
    console.log('全部数字听力10项验收通过。');
  } finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); database.close();
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    console.log(`测试服务器已关闭，临时数据库/profile已清理；PID=${process.pid} 即将自然退出`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
