'use strict';

const { SKILLS, DAILY_TASK_SKILLS, TYPES } = require('./db');
const { addDays, toLocalDate, transition } = require('./domain/srs');

const WEEKLY_WRITING_TARGET = 1;

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
    return {
      skill: input.skill,
      type: input.type,
      front: validateText(input.front, '正面'),
      frontAudio: validateText(input.front_audio, '正面朗读用完整原句', false),
      back: validateText(input.back, '背面'),
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
    return this.db.dueCards(toLocalDate(this.clock()));
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
    const now = this.clock();
    const state = transition(card.box, result, now);
    return this.db.applyReview({
      id, result, boxBefore: state.boxBefore, boxAfter: state.boxAfter,
      nextReviewDate: state.nextReviewDate, reviewedAt: localDateTime(now)
    });
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
}

module.exports = { HttpError, ReviewService, WEEKLY_WRITING_TARGET, localDateTime };
