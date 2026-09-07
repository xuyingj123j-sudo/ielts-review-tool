'use strict';

const { acceptedAnswers, answerMatches, normalizeAnswer } = require('./answerMatch');

const SECTION_UNLOCK_STREAK = 3;
const SECTION_UNLOCK_THRESHOLD = 0.7;
const CHECKLIST_FIELDS = Object.freeze([
  'check_gist',
  'check_key_sentences',
  'check_paraphrase',
  'check_redo_improved',
  'check_retention'
]);

function parseAnswerKey(answerKeyText) {
  const answers = new Map();
  for (const line of String(answerKeyText ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\.\s*(.*?)\s*$/u);
    if (!match || !match[2]) continue;
    const number = Number(match[1]);
    const accepted = acceptedAnswers(match[2]);
    if (!accepted.length || answers.has(number)) {
      throw new Error(`答案文本中的第 ${number} 题无效或重复`);
    }
    answers.set(number, {
      number,
      correctAnswer: match[2].trim(),
      acceptedAnswers: accepted
    });
  }
  if (!answers.size) throw new Error('答案文本中没有可解析的题目');
  return answers;
}

function parseTranscriptSegments(transcriptText, answerKeyText) {
  const transcript = String(transcriptText ?? '');
  const answerKey = parseAnswerKey(answerKeyText);
  const markers = [...transcript.matchAll(/\(Q(\d+)\)/gi)];
  const segments = [];
  let cursor = 0;

  for (const marker of markers) {
    const number = Number(marker[1]);
    const answer = answerKey.get(number);
    if (!answer) throw new Error(`原文包含答案文本中不存在的 Q${number}`);

    const beforeMarker = transcript.slice(cursor, marker.index);
    const trailingWhitespace = beforeMarker.match(/\s*$/u)?.[0] || '';
    const answerEnd = beforeMarker.length - trailingWhitespace.length;
    const matchingAnswer = [...answer.acceptedAnswers]
      .sort((left, right) => right.length - left.length)
      .find((candidate) => normalizeAnswer(beforeMarker.slice(answerEnd - candidate.length, answerEnd)) === normalizeAnswer(candidate));
    if (!matchingAnswer) throw new Error(`无法在原文 Q${number} 标记前定位答案“${answer.correctAnswer}”`);

    const answerStart = answerEnd - matchingAnswer.length;
    const text = beforeMarker.slice(0, answerStart);
    if (text) segments.push({ type: 'text', value: text });
    segments.push({ type: 'blank', number });
    if (trailingWhitespace) segments.push({ type: 'text', value: trailingWhitespace });
    cursor = marker.index + marker[0].length;
  }

  const tail = transcript.slice(cursor);
  if (tail) segments.push({ type: 'text', value: tail });
  const blankNumbers = segments.filter((segment) => segment.type === 'blank').map((segment) => segment.number);
  const answerNumbers = [...answerKey.keys()];
  if (blankNumbers.length !== answerNumbers.length || answerNumbers.some((number) => !blankNumbers.includes(number))) {
    throw new Error('原文中的题号与答案文本不一致');
  }
  return segments;
}

function gradeListeningAnswers(answerKeyText, submittedAnswers = {}) {
  const answerKey = parseAnswerKey(answerKeyText);
  const grading = [...answerKey.values()].map((answer) => {
    const rawAnswer = submittedAnswers[answer.number] ?? submittedAnswers[String(answer.number)] ?? '';
    return {
      number: answer.number,
      user_answer: String(rawAnswer),
      correct: answerMatches(rawAnswer, answer.correctAnswer),
      correct_answer: answer.correctAnswer,
      accepted_answers: answer.acceptedAnswers
    };
  });
  return {
    grading,
    score_correct: grading.filter((item) => item.correct).length,
    score_total: grading.length
  };
}

function isQualifiedAttempt(attempt) {
  const correct = Number(attempt.score_correct);
  const total = Number(attempt.score_total);
  return Number.isFinite(correct)
    && Number.isFinite(total)
    && total > 0
    && correct / total >= SECTION_UNLOCK_THRESHOLD
    && CHECKLIST_FIELDS.every((field) => Boolean(attempt[field]));
}

function qualifyingStreak(recentAttempts) {
  let streak = 0;
  for (const attempt of recentAttempts) {
    if (!isQualifiedAttempt(attempt)) break;
    streak += 1;
    if (streak === SECTION_UNLOCK_STREAK) break;
  }
  return streak;
}

function buildStageProgress(attemptsByStage) {
  const stages = [];
  for (let sectionNumber = 1; sectionNumber <= 4; sectionNumber += 1) {
    const recentAttempts = (attemptsByStage[sectionNumber] || []).slice(0, SECTION_UNLOCK_STREAK);
    const streak = qualifyingStreak(recentAttempts);
    const previous = stages[sectionNumber - 2];
    const unlocked = sectionNumber === 1 || (previous.unlocked && previous.qualified);
    stages.push({
      sectionNumber,
      unlocked,
      qualified: streak === SECTION_UNLOCK_STREAK,
      qualifyingStreak: streak,
      remaining: Math.max(0, SECTION_UNLOCK_STREAK - streak),
      recentAttemptCount: recentAttempts.length
    });
  }
  return stages;
}

module.exports = {
  CHECKLIST_FIELDS,
  SECTION_UNLOCK_STREAK,
  SECTION_UNLOCK_THRESHOLD,
  buildStageProgress,
  gradeListeningAnswers,
  isQualifiedAttempt,
  parseAnswerKey,
  parseTranscriptSegments,
  qualifyingStreak
};
