'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SKILLS = Object.freeze(['听力', '阅读', '口语', '写作']);
const DAILY_TASK_SKILLS = Object.freeze(['听力', '阅读', '口语']);
const TYPES = Object.freeze(['同义替换', '句子对照', '语法修正', '听力误听', '生词']);

function sqlEnum(values) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(',');
}

function cardsTableSql(tableName) {
  if (!['cards', 'cards_new'].includes(tableName)) throw new Error('不允许的卡片表名');
  return `
    CREATE TABLE ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill TEXT NOT NULL CHECK (skill IN (${sqlEnum(SKILLS)})),
      type TEXT NOT NULL CHECK (type IN (${sqlEnum(TYPES)})),
      front TEXT NOT NULL,
      front_audio TEXT,
      back TEXT NOT NULL,
      note TEXT,
      box INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
      next_review_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_reviewed_at TEXT,
      review_count INTEGER NOT NULL DEFAULT 0
    )
  `;
}

class ReviewDatabase {
  constructor(filename) {
    const resolved = path.resolve(filename);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    this.connection = new Database(resolved);
    this.connection.pragma('journal_mode = WAL');
    this.connection.pragma('foreign_keys = ON');
    this.migrate();
  }

  migrate() {
    const cardsTable = this.connection.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cards'
    `).get();
    if (!cardsTable) {
      this.connection.exec(cardsTableSql('cards'));
    } else if (!cardsTable.sql.includes("'生词'")) {
      this.migrateCardsTypeConstraint();
    }

    const cardColumns = this.connection.pragma('table_info(cards)');
    if (!cardColumns.some((column) => column.name === 'front_audio')) {
      this.connection.exec('ALTER TABLE cards ADD COLUMN front_audio TEXT');
    }

    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS review_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        reviewed_at TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result IN ('correct','incorrect')),
        box_before INTEGER NOT NULL,
        box_after INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daily_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_date TEXT NOT NULL,
        skill TEXT NOT NULL CHECK (skill IN (${sqlEnum(SKILLS)})),
        done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
        completed_at TEXT,
        UNIQUE (task_date, skill)
      );
      CREATE TABLE IF NOT EXISTS writing_completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        completed_at TEXT NOT NULL,
        content TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(next_review_date);
      CREATE INDEX IF NOT EXISTS idx_cards_filters ON cards(skill, type, box);
      CREATE INDEX IF NOT EXISTS idx_review_logs_date ON review_logs(reviewed_at);
      CREATE INDEX IF NOT EXISTS idx_daily_tasks_date_done ON daily_tasks(task_date, done);
      CREATE INDEX IF NOT EXISTS idx_writing_completions_date ON writing_completions(completed_at);
    `);

    const writingColumns = this.connection.pragma('table_info(writing_completions)');
    if (!writingColumns.some((column) => column.name === 'content')) {
      this.connection.exec("ALTER TABLE writing_completions ADD COLUMN content TEXT NOT NULL DEFAULT ''");
    }
  }

  migrateCardsTypeConstraint() {
    const existingViolations = this.connection.pragma('foreign_key_check');
    if (existingViolations.length) throw new Error('数据库存在外键异常，已停止 cards 表迁移');

    const foreignKeysWereEnabled = this.connection.pragma('foreign_keys', { simple: true }) === 1;
    this.connection.pragma('foreign_keys = OFF');
    try {
      this.connection.exec('BEGIN IMMEDIATE');
      try {
        const oldCount = this.connection.prepare('SELECT COUNT(*) AS count FROM cards').get().count;
        this.connection.exec(cardsTableSql('cards_new'));
        this.connection.exec(`
          INSERT INTO cards_new (
            id, skill, type, front, back, note, box, next_review_date,
            created_at, last_reviewed_at, review_count
          )
          SELECT
            id, skill, type, front, back, note, box, next_review_date,
            created_at, last_reviewed_at, review_count
          FROM cards
        `);
        const newCount = this.connection.prepare('SELECT COUNT(*) AS count FROM cards_new').get().count;
        if (newCount !== oldCount) throw new Error('cards 表迁移前后记录数不一致');

        this.connection.exec('DROP TABLE cards; ALTER TABLE cards_new RENAME TO cards;');
        const violations = this.connection.pragma('foreign_key_check');
        if (violations.length) throw new Error('cards 表迁移后外键校验失败');
        this.connection.exec('COMMIT');
      } catch (error) {
        if (this.connection.inTransaction) this.connection.exec('ROLLBACK');
        throw error;
      }
    } finally {
      this.connection.pragma(`foreign_keys = ${foreignKeysWereEnabled ? 'ON' : 'OFF'}`);
    }
  }

  listCards(filters = {}) {
    const clauses = [];
    const params = {};
    for (const key of ['skill', 'type', 'box']) {
      if (filters[key] !== undefined && filters[key] !== '') {
        clauses.push(`${key} = @${key}`);
        params[key] = filters[key];
      }
    }
    if (filters.search) {
      clauses.push('(front LIKE @search OR back LIKE @search OR note LIKE @search)');
      params.search = `%${filters.search}%`;
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.connection.prepare(`SELECT * FROM cards ${where} ORDER BY created_at DESC, id DESC`).all(params);
  }

  getCard(id) {
    return this.connection.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  }

  createCard(card) {
    const result = this.connection.prepare(`
      INSERT INTO cards (skill, type, front, front_audio, back, note, box, next_review_date, created_at)
      VALUES (@skill, @type, @front, @frontAudio, @back, @note, 1, @nextReviewDate, @createdAt)
    `).run({ ...card, frontAudio: card.frontAudio ?? null });
    return this.getCard(result.lastInsertRowid);
  }

  updateCard(id, card) {
    this.connection.prepare(`
      UPDATE cards SET skill=@skill, type=@type, front=@front, front_audio=@frontAudio, back=@back, note=@note
      WHERE id=@id
    `).run({ id, ...card, frontAudio: card.frontAudio ?? null });
    return this.getCard(id);
  }

  deleteCard(id) {
    return this.connection.prepare('DELETE FROM cards WHERE id = ?').run(id).changes > 0;
  }

  dueCards(today) {
    return this.connection.prepare(`
      SELECT * FROM cards WHERE next_review_date <= ?
      ORDER BY next_review_date ASC, box ASC, id ASC
    `).all(today);
  }

  applyReview({ id, result, boxBefore, boxAfter, nextReviewDate, reviewedAt }) {
    return this.connection.transaction(() => {
      const updated = this.connection.prepare(`
        UPDATE cards
        SET box=?, next_review_date=?, last_reviewed_at=?, review_count=review_count+1
        WHERE id=? AND box=?
      `).run(boxAfter, nextReviewDate, reviewedAt, id, boxBefore);
      if (updated.changes !== 1) throw new Error('卡片状态已变化，请刷新后重试');
      this.connection.prepare(`
        INSERT INTO review_logs (card_id, reviewed_at, result, box_before, box_after)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, reviewedAt, result, boxBefore, boxAfter);
      return this.getCard(id);
    })();
  }

  cardStats() {
    return this.connection.prepare(`
      SELECT skill, COUNT(*) AS total,
             SUM(CASE WHEN box = 5 THEN 1 ELSE 0 END) AS mastered
      FROM cards GROUP BY skill
    `).all();
  }

  reviewStats(sinceDate) {
    return this.connection.prepare(`
      SELECT substr(reviewed_at, 1, 10) AS date,
             COUNT(*) AS total,
             SUM(CASE WHEN result='correct' THEN 1 ELSE 0 END) AS correct
      FROM review_logs
      WHERE substr(reviewed_at, 1, 10) >= ?
      GROUP BY substr(reviewed_at, 1, 10)
      ORDER BY date ASC
    `).all(sinceDate);
  }

  reviewDates() {
    return this.connection.prepare(`
      SELECT DISTINCT substr(reviewed_at, 1, 10) AS date
      FROM review_logs ORDER BY date DESC
    `).all().map((row) => row.date);
  }

  ensureDailyTasks(taskDate) {
    return this.connection.transaction(() => {
      const insert = this.connection.prepare(`
        INSERT OR IGNORE INTO daily_tasks (task_date, skill, done, completed_at)
        VALUES (?, ?, 0, NULL)
      `);
      for (const skill of DAILY_TASK_SKILLS) insert.run(taskDate, skill);
      return this.connection.prepare(`
        SELECT * FROM daily_tasks
        WHERE task_date = ? AND skill IN ('听力', '阅读', '口语')
        ORDER BY CASE skill
          WHEN '听力' THEN 1 WHEN '阅读' THEN 2 WHEN '口语' THEN 3
        END
      `).all(taskDate);
    })();
  }

  toggleDailyTask(id, completedAt) {
    return this.connection.transaction(() => {
      const task = this.connection.prepare('SELECT * FROM daily_tasks WHERE id = ?').get(id);
      if (!task) return null;
      const done = task.done ? 0 : 1;
      this.connection.prepare(`
        UPDATE daily_tasks SET done = ?, completed_at = ? WHERE id = ?
      `).run(done, done ? completedAt : null, id);
      return this.connection.prepare('SELECT * FROM daily_tasks WHERE id = ?').get(id);
    })();
  }

  weeklyTaskStats(startDate, endDate) {
    return this.connection.prepare(`
      SELECT skill, COUNT(DISTINCT task_date) AS completed
      FROM daily_tasks
      WHERE task_date BETWEEN ? AND ? AND done = 1
      GROUP BY skill
    `).all(startDate, endDate);
  }

  reviewStatsBySkill(startDate, endDate) {
    return this.connection.prepare(`
      SELECT cards.skill AS skill,
             COUNT(*) AS total,
             SUM(CASE WHEN review_logs.result = 'correct' THEN 1 ELSE 0 END) AS correct
      FROM review_logs
      JOIN cards ON cards.id = review_logs.card_id
      WHERE substr(review_logs.reviewed_at, 1, 10) BETWEEN ? AND ?
      GROUP BY cards.skill
    `).all(startDate, endDate);
  }

  recordWritingCompletion(completedAt, content) {
    const result = this.connection.prepare(`
      INSERT INTO writing_completions (completed_at, content) VALUES (?, ?)
    `).run(completedAt, content);
    return this.connection.prepare('SELECT * FROM writing_completions WHERE id = ?').get(result.lastInsertRowid);
  }

  writingCompletions(startDate, endDate) {
    return this.connection.prepare(`
      SELECT id, completed_at, content
      FROM writing_completions
      WHERE substr(completed_at, 1, 10) BETWEEN ? AND ?
      ORDER BY completed_at DESC, id DESC
    `).all(startDate, endDate);
  }

  close() {
    this.connection.close();
  }
}

module.exports = { ReviewDatabase, SKILLS, DAILY_TASK_SKILLS, TYPES };
