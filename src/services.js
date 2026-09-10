'use strict';

const crypto = require('node:crypto');
const { SKILLS, DAILY_TASK_SKILLS, TYPES } = require('./db');
const { addDays, toLocalDate, transition } = require('./domain/srs');
const { answerMatches } = require('./domain/answerMatch');
const {
  CHECKLIST_FIELDS,
  SECTION_UNLOCK_STREAK,
  buildStageProgress,
  gradeListeningAnswers,
  isQualifiedAttempt,
  parseTranscriptSegments
} = require('./domain/listening');
const {
  CATEGORIES,
  DIALOGUE_SUBTYPES,
  generateQuestion,
  gradeAnswer
} = require('./domain/numberDrill');

const WEEKLY_WRITING_TARGET = 1;
const NUMBER_QUESTION_TTL_MS = 10 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function localDateTime(date) {
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, '0')).join(':');
  return `${toLocalDate(date)} ${time}`;
}

function validateText(value, label, required = true) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (required && !normalized) throw new HttpError(400, `${label}不能为空`);
  if (normalized.length > 5000) throw new HttpError(400, `${label}不能超过5000字`);
  return normalized || null;
}

class ReviewService {
  constructor(database, clock = () => new Date()) {
    this.db = database;
    this.clock = clock;
    this.pendingNumberQuestions = new Map();
  }

  listCards(query) {
    if (query.skill && !SKILLS.includes(query.skill)) throw new HttpError(400, '无效的技能筛选');
    if (query.type && !TYPES.includes(query.type)) throw new HttpError(400, '无效的类型筛选');
    if (query.box && !['1', '2', '3', '4', '5'].includes(String(query.box))) throw new HttpError(400, '无效的箱位筛选');
    return this.db.listCards({ ...query, box: query.box ? Number(query.box) : undefined });
  }

  normalizeCard(input) {
    if (!SKILLS.includes(input.skill)) throw new HttpError(400, '技能必须是听力、阅读、口语或写作');
    if (!TYPES.includes(input.type)) throw new HttpError(400, '卡片类型无效');
    if (!['flip', 'spelling'].includes(input.review_mode ?? 'flip')) throw new HttpError(400, '复习模式无效');
    return {
      skill: input.skill,
      type: input.type,
      front: validateText(input.front, '正面'),
      frontAudio: validateText(input.front_audio, '正面朗读用完整原句', false),
      back: validateText(input.back, '背面'),
      reviewMode: input.review_mode === undefined ? 'flip' : input.review_mode,
      note: validateText(input.note, '备注', false)
    };
  }

  createCard(input) {
    const now = this.clock();
    return this.db.createCard({
      ...this.normalizeCard(input),
      nextReviewDate: toLocalDate(now),
      createdAt: localDateTime(now)
    });
  }

  updateCard(id, input) {
    const existing = this.db.getCard(id);
    if (!existing) throw new HttpError(404, '卡片不存在');
    return this.db.updateCard(id, this.normalizeCard({ ...existing, ...input }));
  }

  deleteCard(id) {
    if (!this.db.deleteCard(id)) throw new HttpError(404, '卡片不存在');
  }

  queue() {
    return this.db.dueCards(toLocalDate(this.clock())).map((card) => this.safeReviewCard(card));
  }

  safeReviewCard(card) {
    if (card.review_mode !== 'spelling') return card;
    const { back, ...safeCard } = card;
    return { ...safeCard, spelling_audio: Buffer.from(back, 'utf8').toString('base64') };
  }

  practiceCards(scope = 'all') {
    if (!['all', 'today'].includes(scope)) throw new HttpError(400, '自由练习范围无效');
    const cards = scope === 'today'
      ? this.db.cardsReviewedOn(toLocalDate(this.clock()))
      : this.db.listCards();
    return cards.map((card) => this.safeReviewCard(card));
  }

  practiceCard(id) {
    const card = this.db.getCard(id);
    if (!card) throw new HttpError(404, '卡片不存在');
    return this.safeReviewCard(card);
  }

  gradePracticeSpelling(id, input) {
    const card = this.db.getCard(id);
    if (!card) throw new HttpError(404, '卡片不存在');
    if (card.review_mode !== 'spelling') throw new HttpError(400, '该卡片不是拼写测试模式');
    const answer = validateText(input?.answer, '拼写答案');
    return { correct: answerMatches(answer, card.back), correct_answer: card.back };
  }

  todayTasks() {
    return this.db.ensureDailyTasks(toLocalDate(this.clock())).map((task) => ({
      ...task,
      done: Boolean(task.done)
    }));
  }

  toggleTask(id) {
    const task = this.db.toggleDailyTask(id, localDateTime(this.clock()));
    if (!task) throw new HttpError(404, '每日任务不存在');
    return { ...task, done: Boolean(task.done) };
  }

  recordWritingCompletion(input) {
    const now = this.clock();
    const start = toLocalDate(addDays(now, -6));
    const end = toLocalDate(now);
    const content = validateText(input?.content, '写作内容');
    const completion = this.db.recordWritingCompletion(localDateTime(now), content);
    return {
      ...completion,
      weeklyCompleted: this.db.writingCompletions(start, end).length,
      target: WEEKLY_WRITING_TARGET
    };
  }

  review(id, result) {
    if (!['correct', 'incorrect'].includes(result)) throw new HttpError(400, 'result 必须是 correct 或 incorrect');
    const card = this.db.getCard(id);
    if (!card) throw new HttpError(404, '卡片不存在');
    if (card.review_mode === 'spelling') throw new HttpError(400, '拼写测试卡片必须提交拼写答案');
    const now = this.clock();
    const state = transition(card.box, result, now);
    return this.db.applyReview({
      id, result, boxBefore: state.boxBefore, boxAfter: state.boxAfter,
      nextReviewDate: state.nextReviewDate, reviewedAt: localDateTime(now)
    });
  }

  reviewSpelling(id, input) {
    const card = this.db.getCard(id);
    if (!card) throw new HttpError(404, '卡片不存在');
    if (card.review_mode !== 'spelling') throw new HttpError(400, '该卡片不是拼写测试模式');
    const answer = validateText(input?.answer, '拼写答案');
    const result = answerMatches(answer, card.back) ? 'correct' : 'incorrect';
    const now = this.clock();
    const state = transition(card.box, result, now);
    const updated = this.db.applyReview({
      id, result, boxBefore: state.boxBefore, boxAfter: state.boxAfter,
      nextReviewDate: state.nextReviewDate, reviewedAt: localDateTime(now)
    });
    return {
      correct: result === 'correct',
      result,
      correct_answer: card.back,
      box_before: state.boxBefore,
      box_after: updated.box,
      next_review_date: updated.next_review_date
    };
  }

  stats() {
    const now = this.clock();
    const start = toLocalDate(addDays(now, -6));
    const rows = this.db.cardStats();
    const skills = Object.fromEntries(SKILLS.map((skill) => [skill, { total: 0, mastered: 0, masteredRate: 0 }]));
    for (const row of rows) {
      skills[row.skill] = {
        total: row.total,
        mastered: row.mastered,
        masteredRate: row.total ? Math.round(row.mastered * 100 / row.total) : 0
      };
    }

    const reviewRows = this.db.reviewStats(start);
    const byDate = new Map(reviewRows.map((row) => [row.date, row]));
    const trend = [];
    for (let offset = -6; offset <= 0; offset += 1) {
      const date = toLocalDate(addDays(now, offset));
      const row = byDate.get(date) || { total: 0, correct: 0 };
      trend.push({ date, total: row.total, correct: row.correct, rate: row.total ? Math.round(row.correct * 100 / row.total) : null });
    }
    const reviewed = reviewRows.reduce((sum, row) => sum + row.total, 0);
    const correct = reviewRows.reduce((sum, row) => sum + row.correct, 0);
    const dates = this.db.reviewDates();
    let streak = 0;
    if (dates.length) {
      let cursor = new Date(`${dates[0]}T12:00:00`);
      const set = new Set(dates);
      while (set.has(toLocalDate(cursor))) {
        streak += 1;
        cursor = addDays(cursor, -1);
      }
    }
    const totalCards = Object.values(skills).reduce((sum, item) => sum + item.total, 0);
    const masteredCards = Object.values(skills).reduce((sum, item) => sum + item.mastered, 0);
    return {
      todayDue: this.queue().length,
      streak,
      totalCards,
      masteredCards,
      masteredRate: totalCards ? Math.round(masteredCards * 100 / totalCards) : 0,
      recentAccuracy: reviewed ? Math.round(correct * 100 / reviewed) : null,
      trend,
      skills
    };
  }

  weeklyStats() {
    const now = this.clock();
    const start = toLocalDate(addDays(now, -6));
    const end = toLocalDate(now);
    const cardRows = this.db.cardStats();
    const taskRows = this.db.weeklyTaskStats(start, end);
    const reviewRows = this.db.reviewStatsBySkill(start, end);
    const cardsBySkill = new Map(cardRows.map((row) => [row.skill, row]));
    const tasksBySkill = new Map(taskRows.map((row) => [row.skill, row]));
    const reviewsBySkill = new Map(reviewRows.map((row) => [row.skill, row]));
    const writingRecords = this.db.writingCompletions(start, end);
    const skills = {};
    const dailyTasks = {};

    for (const skill of SKILLS) {
      const cards = cardsBySkill.get(skill) || { total: 0, mastered: 0 };
      const review = reviewsBySkill.get(skill) || { total: 0, correct: 0 };
      const accuracy = review.total ? Math.round(review.correct * 100 / review.total) : null;
      skills[skill] = {
        reviewTotal: review.total,
        reviewCorrect: review.correct,
        accuracy,
        masteredRate: cards.total ? Math.round(cards.mastered * 100 / cards.total) : 0
      };
    }
    for (const skill of DAILY_TASK_SKILLS) {
      dailyTasks[skill] = { completedDays: tasksBySkill.get(skill)?.completed || 0, targetDays: 7 };
    }

    return {
      period: { start, end, days: 7 },
      dailyTasks,
      skills,
      writing: {
        completed: writingRecords.length,
        target: WEEKLY_WRITING_TARGET,
        records: writingRecords
      }
    };
  }

  listeningProgress() {
    const attemptsByStage = {};
    for (let sectionNumber = 1; sectionNumber <= 4; sectionNumber += 1) {
      attemptsByStage[sectionNumber] = this.db.recentListeningAttemptsByStage(sectionNumber, SECTION_UNLOCK_STREAK);
    }
    return buildStageProgress(attemptsByStage);
  }

  listeningOverview() {
    const sections = this.db.listListeningSections();
    return {
      stages: this.listeningProgress().map((stage) => ({
        ...stage,
        sections: sections.filter((section) => section.section_number === stage.sectionNumber)
      }))
    };
  }

  listListeningSections() {
    return this.db.listListeningSections();
  }

  listeningSection(id) {
    const section = this.db.getListeningSection(id);
    if (!section) throw new HttpError(404, '听力 Section 不存在');
    const stage = this.listeningProgress()[section.section_number - 1];
    if (!stage.unlocked) throw new HttpError(403, `Section ${section.section_number} 阶段尚未解锁`);
    return {
      section: { ...section, transcript_segments: parseTranscriptSegments(section.transcript_text, section.answer_key_text) },
      stage,
      attempts: this.db.listeningAttemptsForSection(id)
    };
  }

  recordListeningAttempt(id, input) {
    const section = this.db.getListeningSection(id);
    if (!section) throw new HttpError(404, '听力 Section 不存在');
    const stage = this.listeningProgress()[section.section_number - 1];
    if (!stage.unlocked) throw new HttpError(403, `Section ${section.section_number} 阶段尚未解锁`);

    if (!input?.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) {
      throw new HttpError(400, 'answers 必须是按题号填写的答案对象');
    }
    if (Object.values(input.answers).some((answer) => typeof answer !== 'string')) {
      throw new HttpError(400, '每题答案必须是文本');
    }
    const score = gradeListeningAnswers(section.answer_key_text, input.answers);
    const checks = {};
    for (const field of CHECKLIST_FIELDS) {
      if (typeof input?.[field] !== 'boolean') throw new HttpError(400, '5项达标标准必须明确勾选或取消');
      checks[field] = input[field];
    }
    const attempt = this.db.createListeningAttempt({
      sectionId: id,
      attemptDate: toLocalDate(this.clock()),
      scoreCorrect: score.score_correct,
      scoreTotal: score.score_total,
      checkGist: Number(checks.check_gist),
      checkKeySentences: Number(checks.check_key_sentences),
      checkParaphrase: Number(checks.check_paraphrase),
      checkRedoImproved: Number(checks.check_redo_improved),
      checkRetention: Number(checks.check_retention),
      notes: validateText(input?.notes, '备注', false)
    });
    return {
      attempt: { ...attempt, qualified: isQualifiedAttempt(attempt) },
      grading: score.grading,
      score_correct: score.score_correct,
      score_total: score.score_total,
      stages: this.listeningProgress()
    };
  }

  cleanupNumberQuestions() {
    const cutoff = this.clock().getTime() - NUMBER_QUESTION_TTL_MS;
    for (const [questionId, question] of this.pendingNumberQuestions) {
      if (question.createdAt <= cutoff) this.pendingNumberQuestions.delete(questionId);
    }
  }

  numberQuestion(input) {
    this.cleanupNumberQuestions();
    const mode = input?.mode;
    if (!['standalone', 'dialogue', 'exam'].includes(mode)) throw new HttpError(400, '数字听力模式无效');
    if (mode === 'dialogue') {
      if (!DIALOGUE_SUBTYPES.includes(input?.subtype)) throw new HttpError(400, '对话测验类型无效');
    } else if (!CATEGORIES.includes(input?.category)) {
      throw new HttpError(400, '数字听力类别无效');
    }
    const question = generateQuestion({
      mode,
      category: input?.category,
      subtype: mode === 'dialogue' ? input.subtype : null,
      now: this.clock()
    });
    const questionId = crypto.randomUUID();
    this.pendingNumberQuestions.set(questionId, {
      correctAnswer: question.correctAnswer,
      category: question.category,
      subtype: question.subtype,
      mode: question.mode,
      promptText: question.promptText,
      spokenText: question.spokenText,
      createdAt: this.clock().getTime()
    });
    return { questionId, spokenText: question.spokenText };
  }

  answerNumberQuestion(input) {
    this.cleanupNumberQuestions();
    const questionId = typeof input?.questionId === 'string' ? input.questionId.trim() : '';
    if (typeof input?.userAnswer !== 'string' || input.userAnswer.length > 5000) {
      throw new HttpError(400, '答案必须是5000字以内的文本');
    }
    const userAnswer = input.userAnswer;
    const question = this.pendingNumberQuestions.get(questionId);
    if (!question) throw new HttpError(400, '题目不存在、已作答或已过期');
    let examSessionId = null;
    if (question.mode === 'exam') {
      examSessionId = typeof input?.examSessionId === 'string' ? input.examSessionId.trim() : '';
      if (!examSessionId || examSessionId.length > 100) throw new HttpError(400, '考试 session id 无效');
    }
    const isCorrect = gradeAnswer({
      category: question.category,
      correctAnswer: question.correctAnswer,
      userAnswer
    });
    this.db.createNumberDrillAttempt({
      mode: question.mode,
      category: question.category,
      subtype: question.subtype,
      promptText: question.promptText,
      spokenText: question.spokenText,
      correctAnswer: question.correctAnswer,
      userAnswer,
      isCorrect: Number(isCorrect),
      examSessionId,
      attemptedAt: localDateTime(this.clock())
    });
    this.pendingNumberQuestions.delete(questionId);
    return { isCorrect, correctAnswer: question.correctAnswer, promptText: question.promptText };
  }

  numberMistakes(limitValue) {
    this.cleanupNumberQuestions();
    const limit = limitValue === undefined ? 20 : Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'limit 必须是 1-100 的整数');
    return this.db.numberDrillMistakes(limit).map((attempt) => ({
      ...attempt,
      is_correct: Boolean(attempt.is_correct)
    }));
  }

  numberStats() {
    this.cleanupNumberQuestions();
    const rows = this.db.numberDrillStats();
    const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, { total: 0, correct: 0, accuracy: null }]));
    for (const row of rows) {
      byCategory[row.category] = {
        total: row.total,
        correct: row.correct,
        accuracy: Math.round(row.correct * 100 / row.total)
      };
    }
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const correct = rows.reduce((sum, row) => sum + row.correct, 0);
    return { total, correct, accuracy: total ? Math.round(correct * 100 / total) : null, byCategory };
  }

  startNumberExam(input) {
    this.cleanupNumberQuestions();
    const questionCount = Number(input?.questionCount);
    const categories = input?.categories;
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) {
      throw new HttpError(400, '考试题量必须是 1-100 的整数');
    }
    if (!Array.isArray(categories) || !categories.length || categories.some((category) => !CATEGORIES.includes(category))) {
      throw new HttpError(400, '考试类别无效');
    }
    return { examSessionId: crypto.randomUUID() };
  }

  numberExamSummary(sessionId) {
    this.cleanupNumberQuestions();
    if (typeof sessionId !== 'string' || !sessionId.trim()) throw new HttpError(400, '考试 session id 无效');
    const rows = this.db.numberDrillStats(sessionId.trim());
    const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, { score: 0, total: 0, accuracy: null }]));
    for (const row of rows) {
      byCategory[row.category] = {
        score: row.correct,
        total: row.total,
        accuracy: Math.round(row.correct * 100 / row.total)
      };
    }
    return {
      score: rows.reduce((sum, row) => sum + row.correct, 0),
      total: rows.reduce((sum, row) => sum + row.total, 0),
      byCategory
    };
  }
}

module.exports = { HttpError, NUMBER_QUESTION_TTL_MS, ReviewService, WEEKLY_WRITING_TARGET, localDateTime };
