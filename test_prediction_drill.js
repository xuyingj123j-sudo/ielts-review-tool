'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { ReviewDatabase } = require('./src/db');
const { ReviewService } = require('./src/services');
const { createApp } = require('./src/app');
const { ANSWER_TYPES, PREDICTION_TEMPLATES, generatePredictionQuestion } = require('./src/domain/predictionDrill');
const { predictionBrowserTest } = require('./scripts/test_prediction_browser');

function templateTests() {
  assert.ok(PREDICTION_TEMPLATES.length >= 15);
  assert.deepEqual(new Set(PREDICTION_TEMPLATES.map(template => template.answerType)), new Set(ANSWER_TYPES));
  for (const template of PREDICTION_TEMPLATES) {
    assert.ok(template.sentence.includes('{V}'), JSON.stringify(template));
    assert.ok(ANSWER_TYPES.includes(template.answerType), JSON.stringify(template));
    assert.ok(Array.isArray(template.fillers) && template.fillers.length >= 1, JSON.stringify(template));
    assert.ok(template.fillers.every(filler => typeof filler === 'string' && filler.length > 0), JSON.stringify(template));
  }
  const generated = generatePredictionQuestion({ random: () => 0 });
  assert.equal(generated.sentenceWithBlank, 'The total cost is £______.');
  assert.equal(generated.spokenText, 'The total cost is £45.');
  assert.equal(generated.answerType, 'NUMBER');
  assert.equal(generated.correctAnswer, '45');
  console.log(`✓ 模板：${PREDICTION_TEMPLATES.length}条；9类=${JSON.stringify(ANSWER_TYPES)}；每条均含{V}且fillers≥1`);
}

async function main() {
  templateTests();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-prediction-'));
  const database = new ReviewDatabase(path.join(temp, 'test.db'));
  const service = new ReviewService(database, () => new Date('2026-09-13T12:00:00'));
  let server;
  try {
    const columns = database.connection.pragma('table_info(prediction_drill_attempts)').map(column => column.name);
    assert.deepEqual(columns, ['id', 'sentence_template', 'correct_type', 'predicted_type', 'prediction_correct', 'correct_answer', 'user_answer', 'answer_correct', 'attempted_at']);
    console.log(`✓ 数据表字段：${JSON.stringify(columns)}`);

    server = createApp(service).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    console.log(`PREDICTION_TEST_SERVER=${base} PID=${process.pid}（随测试关闭）`);
    const curl = async (route, method = 'GET', body, expected = 200) => {
      const args = ['-sS', '--max-time', '10', '-X', method, '-w', '\n%{http_code}', `${base}${route}`];
      if (body !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(body).replace(/[^\x00-\x7f]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`));
      const executable = process.platform === 'win32' ? 'curl.exe' : 'curl';
      console.log(`COMMAND: ${executable} ${args.map(argument => JSON.stringify(argument)).join(' ')}`);
      const { stdout } = await promisify(execFile)(executable, args, { windowsHide: true });
      console.log(stdout.trim());
      const lines = stdout.trim().split('\n');
      assert.equal(Number(lines.pop()), expected, stdout);
      return JSON.parse(lines.join('\n'));
    };

    const first = await curl('/api/prediction/question', 'POST', {} , 201);
    assert.deepEqual(Object.keys(first).sort(), ['questionId', 'sentenceWithBlank']);
    assert.equal(Object.hasOwn(first, 'answerType'), false);
    assert.equal(Object.hasOwn(first, 'spokenText'), false);
    assert.equal(Object.hasOwn(first, 'correctAnswer'), false);
    assert.ok(first.sentenceWithBlank.includes('______'));
    console.log(`✓ curl STEP1不泄题：keys=${JSON.stringify(Object.keys(first).sort())}`);

    await curl('/api/prediction/answer', 'POST', { questionId: first.questionId, userAnswer: 'anything' }, 400);
    console.log('✓ curl 跳过predict直接answer：HTTP 400');

    const firstPending = service.pendingPredictionQuestions.get(first.questionId);
    const firstPredict = await curl('/api/prediction/predict', 'POST', { questionId: first.questionId, predictedType: firstPending.answerType });
    assert.deepEqual(firstPredict, { spokenText: firstPending.spokenText });
    const firstAnswer = await curl('/api/prediction/answer', 'POST', { questionId: first.questionId, userAnswer: ` ${firstPending.correctAnswer.toUpperCase()} ` }, 201);
    assert.equal(firstAnswer.predictionCorrect, true);
    assert.equal(firstAnswer.answerCorrect, true);
    assert.equal(firstAnswer.correctType, firstPending.answerType);
    assert.equal(firstAnswer.correctAnswer, firstPending.correctAnswer);
    const firstStats = await curl('/api/prediction/stats');
    assert.deepEqual(firstStats, { total: 1, predictionAccuracy: 100, answerAccuracy: 100 });
    console.log('✓ curl 组合1：类型对+答案对；stats={predictionAccuracy:100,answerAccuracy:100,total:1}');

    const second = await curl('/api/prediction/question', 'POST', {}, 201);
    const secondPending = service.pendingPredictionQuestions.get(second.questionId);
    const wrongType = ANSWER_TYPES.find(type => type !== secondPending.answerType);
    await curl('/api/prediction/predict', 'POST', { questionId: second.questionId, predictedType: wrongType });
    const secondAnswer = await curl('/api/prediction/answer', 'POST', { questionId: second.questionId, userAnswer: secondPending.correctAnswer }, 201);
    assert.deepEqual([secondAnswer.predictionCorrect, secondAnswer.answerCorrect], [false, true]);
    console.log(`✓ curl 组合2：类型错(${wrongType}→${secondPending.answerType})+答案对`);

    const third = await curl('/api/prediction/question', 'POST', {}, 201);
    const thirdPending = service.pendingPredictionQuestions.get(third.questionId);
    await curl('/api/prediction/predict', 'POST', { questionId: third.questionId, predictedType: thirdPending.answerType });
    const thirdAnswer = await curl('/api/prediction/answer', 'POST', { questionId: third.questionId, userAnswer: '__definitely_wrong__' }, 201);
    assert.deepEqual([thirdAnswer.predictionCorrect, thirdAnswer.answerCorrect], [true, false]);
    console.log(`✓ curl 组合3：类型对(${thirdPending.answerType})+答案错`);

    const stats = await curl('/api/prediction/stats');
    assert.deepEqual(stats, { total: 3, predictionAccuracy: 67, answerAccuracy: 67 });
    const mistakes = await curl('/api/prediction/mistakes?limit=20');
    assert.equal(mistakes.length, 2);
    assert.ok(mistakes.some(row => row.prediction_correct === false && row.answer_correct === true));
    assert.ok(mistakes.some(row => row.prediction_correct === true && row.answer_correct === false));
    console.log(`✓ curl 独立统计+错题：${JSON.stringify(stats)}；mistakes=${JSON.stringify(mistakes.map(row => ({ id: row.id, prediction_correct: row.prediction_correct, answer_correct: row.answer_correct })))}`);

    const invalid = await curl('/api/prediction/question', 'POST', {}, 201);
    await curl('/api/prediction/predict', 'POST', { questionId: invalid.questionId, predictedType: 'INVALID' }, 400);
    await curl('/api/prediction/mistakes?limit=0', 'GET', undefined, 400);
    console.log('✓ curl 校验：非法预测类型与limit=0均返回400');

    await predictionBrowserTest(base, temp, service);
    assert.deepEqual(database.connection.pragma('foreign_key_check'), []);
    assert.equal(database.connection.pragma('integrity_check', { simple: true }), 'ok');
    console.log('PREDICTION_ACCEPTANCE=PASS; integrity_check=ok; foreign_key_check=[]');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    database.close();
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    console.log('CLEANUP: local prediction server closed; temporary database/browser profile/screenshots removed');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
