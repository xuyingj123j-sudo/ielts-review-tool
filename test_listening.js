'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Sqlite = require('better-sqlite3');
const { createApp } = require('./src/app');
const { ReviewDatabase } = require('./src/db');
const { ReviewService } = require('./src/services');
const {
  SECTION_UNLOCK_STREAK,
  SECTION_UNLOCK_THRESHOLD,
  gradeListeningAnswers,
  parseAnswerKey,
  parseTranscriptSegments,
  isQualifiedAttempt
} = require('./src/domain/listening');
const { parseCambridgeListeningHtml } = require('./scripts/import_listening_test1');

const checklist = {
  check_gist: true,
  check_key_sentences: true,
  check_paraphrase: true,
  check_redo_improved: true,
  check_retention: true
};

async function main() {
  const realDatabase = new Sqlite(path.join(__dirname, 'data', 'ielts.db'), { readonly: true });
  const realPart1 = realDatabase.prepare(`
    SELECT listening_sections.*
    FROM listening_sections
    JOIN listening_tests ON listening_tests.id = listening_sections.test_id
    WHERE listening_tests.source_book = ? AND listening_tests.test_number = 1
      AND listening_sections.section_number = 1
  `).get('剑16');
  realDatabase.close();
  assert.ok(realPart1, '缺少已导入的剑16 Test1 Part1真实数据');

  const answerKey = parseAnswerKey(realPart1.answer_key_text);
  assert.deepEqual(answerKey.get(6).acceptedAnswers, ['movie', 'film']);
  const realSegments = parseTranscriptSegments(realPart1.transcript_text, realPart1.answer_key_text);
  const blankNumbers = realSegments.filter((segment) => segment.type === 'blank').map((segment) => segment.number);
  assert.deepEqual(blankNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const firstBlankIndex = realSegments.findIndex((segment) => segment.type === 'blank');
  assert.match(realSegments[firstBlankIndex - 1].value, /goes round an\n$/u, 'Q1只应挖掉egg，不能吞掉换行前的an');
  assert.equal(realSegments[firstBlankIndex - 1].value.endsWith('egg'), false);
  console.log(`✓ 真实原文挖空断言通过：blank number = [${blankNumbers.join(', ')}]，换行边界只挖掉 egg`);

  const correctAnswers = (six = 'movie', first = 'egg') => ({
    1: first, 2: 'tower', 3: 'car', 4: 'animals', 5: 'bridge',
    6: six, 7: 'decorate', 8: 'Wednesdays', 9: 'Fradstone', 10: 'Parking'
  });
  const movieScore = gradeListeningAnswers(realPart1.answer_key_text, correctAnswers('movie'));
  const filmScore = gradeListeningAnswers(realPart1.answer_key_text, correctAnswers('film'));
  assert.deepEqual([movieScore.score_correct, movieScore.score_total], [10, 10]);
  assert.deepEqual([filmScore.score_correct, filmScore.score_total], [10, 10]);
  console.log('✓ 多选一答案领域断言通过：Q6 填 movie 或 film 均为 10/10');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-listening-test-'));
  const audioDir = path.join(tempDir, 'audio');
  fs.mkdirSync(audioDir);
  fs.writeFileSync(path.join(audioDir, 'Test1_Part1.mp3'), Buffer.from('ID3-test-audio'));
  const database = new ReviewDatabase(path.join(tempDir, 'test.db'));
  database.importListeningTest({
    sourceBook: '剑16',
    testNumber: 1,
    sections: [1, 2, 3, 4].map((sectionNumber) => sectionNumber === 1 ? ({
      sectionNumber,
      title: realPart1.title,
      audioPath: '/listening-audio/Test1_Part1.mp3',
      transcriptText: realPart1.transcript_text,
      answerKeyText: realPart1.answer_key_text
    }) : ({
      sectionNumber,
      title: `测试标题 ${sectionNumber}`,
      audioPath: `/listening-audio/Test1_Part${sectionNumber}.mp3`,
      transcriptText: Array.from({ length: 10 }, (_, index) => `answer${index + 1} (Q${index + 1})`).join('\n'),
      answerKeyText: Array.from({ length: 10 }, (_, index) => `${index + 1}. answer${index + 1}`).join('\n')
    }))
  });
  const app = createApp(new ReviewService(database, () => new Date(2026, 8, 6, 12, 0, 0)), { audioDir });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(url, options) {
    const response = await fetch(`${base}${url}`, {
      headers: { 'content-type': 'application/json' },
      ...options
    });
    const body = await response.json();
    assert.ok(response.ok, JSON.stringify(body));
    return body;
  }

  try {
    assert.equal(SECTION_UNLOCK_STREAK, 3);
    assert.equal(SECTION_UNLOCK_THRESHOLD, 0.7);
    const sections = await request('/api/listening/sections');
    assert.equal(sections.length, 4);
    assert.deepEqual(sections.map((section) => section.section_number), [1, 2, 3, 4]);
    console.log(`✓ 听力试运行数据合同断言通过：共 ${sections.length} 个 Part，Section = [${sections.map((section) => section.section_number).join(', ')}]`);

    const audio = await fetch(`${base}/listening-audio/Test1_Part1.mp3`);
    assert.equal(audio.status, 200);
    assert.match(audio.headers.get('content-type'), /^audio\/mpeg/);
    assert.equal((await audio.arrayBuffer()).byteLength, 14);
    console.log(`✓ 音频静态路由断言通过：HTTP ${audio.status}，Content-Type = ${audio.headers.get('content-type')}`);

    const section1 = sections.find((section) => section.section_number === 1);
    const section2 = sections.find((section) => section.section_number === 2);
    const detail = await request(`/api/listening/sections/${section1.id}`);
    assert.deepEqual(detail.section.transcript_segments.filter((segment) => segment.type === 'blank').map((segment) => segment.number), blankNumbers);
    let overview = await request('/api/listening/overview');
    assert.deepEqual(overview.stages.map((stage) => stage.unlocked), [true, false, false, false]);

    const wrong = await request(`/api/listening/sections/${section1.id}/attempts`, {
      method: 'POST',
      body: JSON.stringify({ answers: { ...correctAnswers('movie', ' Egg '), 2: 'wrong tower' }, ...checklist, notes: '边界与错题验证' })
    });
    assert.deepEqual([wrong.score_correct, wrong.score_total], [9, 10]);
    assert.equal(wrong.grading.find((item) => item.number === 1).correct, true);
    assert.deepEqual(wrong.grading.find((item) => item.number === 2), {
      number: 2,
      user_answer: 'wrong tower',
      correct: false,
      correct_answer: 'tower',
      accepted_answers: ['tower']
    });
    console.log('✓ 错题与容错断言通过：" Egg " 判对；Q2 判错并返回 correct_answer = tower；总分 9/10');

    for (const [count, six] of [[1, 'movie'], [2, 'film'], [3, 'movie']]) {
      const result = await request(`/api/listening/sections/${section1.id}/attempts`, {
        method: 'POST',
        body: JSON.stringify({ answers: correctAnswers(six), ...checklist, notes: `达标 ${count}` })
      });
      assert.deepEqual([result.score_correct, result.score_total], [10, 10]);
      assert.equal(result.attempt.qualified, true);
      if (count === 1) {
        assert.equal(result.stages[1].unlocked, false);
        console.log('✓ 单条达标记录断言通过：Section2 仍为 locked，Section1 连续达标 1/3');
      }
    }
    overview = await request('/api/listening/overview');
    assert.equal(overview.stages[0].qualifyingStreak, 3);
    assert.equal(overview.stages[1].unlocked, true);
    console.log('✓ 阶段解锁断言通过：Section1 最近3条均达标后，Section2 locked → unlocked');

    const failed = await request(`/api/listening/sections/${section2.id}/attempts`, {
      method: 'POST',
      body: JSON.stringify({ answers: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, `answer${index + 1}`])), ...checklist, check_retention: false, notes: '只勾4项' })
    });
    assert.equal(failed.attempt.qualified, false);
    assert.equal(failed.stages[1].qualifyingStreak, 0);
    assert.equal(failed.stages[2].unlocked, false);
    console.log('✓ checklist 不达标断言通过：自动判分 10/10 但只勾4项，qualified=false，Section3 未误解锁');

    assert.equal(isQualifiedAttempt({ score_correct: 6, score_total: 10, ...checklist }), false);
    console.log('✓ 分数阈值断言通过：6/10 即使5项全勾也不达标');

    const fixture = `<body>${[1, 2, 3, 4].map((part) => `<div class="part"><h2>Test 1 · Part ${part} | Fixture ${part}</h2><pre>介绍\n剑桥雅思16 Test1 Part${part}\n雅思听力\n原文\nTranscript ${part}\n剑桥雅思16 Test1 Part${part}雅思听力答案\n${part}. answer</pre></div>`).join('')}</body>`;
    const parsed = parseCambridgeListeningHtml(fixture);
    assert.deepEqual(parsed.map(({ sectionNumber, title }) => ({ sectionNumber, title })), [
      { sectionNumber: 1, title: 'Fixture 1' },
      { sectionNumber: 2, title: 'Fixture 2' },
      { sectionNumber: 3, title: 'Fixture 3' },
      { sectionNumber: 4, title: 'Fixture 4' }
    ]);
    assert.equal(parsed[0].transcriptText, 'Transcript 1');
    assert.equal(parsed[0].answerKeyText, '1. answer');
    console.log('✓ HTML 解析器断言通过：只提取 Test1 Part1-4，并分离标题、原文与答案');
    console.log('全部听力真题练习模块测试通过。');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
