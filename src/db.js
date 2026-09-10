'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SKILLS = Object.freeze(['听力', '阅读', '口语', '写作']);
const DAILY_TASK_SKILLS = Object.freeze(['听力', '阅读', '口语']); // 仅用于首次迁移的默认值
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
      review_mode TEXT NOT NULL DEFAULT 'flip',
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
    if (!cardColumns.some((column) => column.name === 'review_mode')) {
      this.connection.exec("ALTER TABLE cards ADD COLUMN review_mode TEXT NOT NULL DEFAULT 'flip'");
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
      CREATE TABLE IF NOT EXISTS listening_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_book TEXT NOT NULL,
        test_number INTEGER NOT NULL CHECK (test_number BETWEEN 1 AND 99),
        UNIQUE (source_book, test_number)
      );
      CREATE TABLE IF NOT EXISTS listening_sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id INTEGER NOT NULL REFERENCES listening_tests(id) ON DELETE CASCADE,
        section_number INTEGER NOT NULL CHECK (section_number BETWEEN 1 AND 4),
        title TEXT NOT NULL,
        audio_path TEXT NOT NULL,
        transcript_text TEXT NOT NULL,
        answer_key_text TEXT NOT NULL,
        UNIQUE (test_id, section_number)
      );
      CREATE TABLE IF NOT EXISTS listening_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id INTEGER NOT NULL REFERENCES listening_sections(id) ON DELETE CASCADE,
        attempt_date TEXT NOT NULL,
        score_correct INTEGER NOT NULL CHECK (score_correct >= 0),
        score_total INTEGER NOT NULL CHECK (score_total > 0),
        check_gist INTEGER NOT NULL CHECK (check_gist IN (0, 1)),
        check_key_sentences INTEGER NOT NULL CHECK (check_key_sentences IN (0, 1)),
        check_paraphrase INTEGER NOT NULL CHECK (check_paraphrase IN (0, 1)),
        check_redo_improved INTEGER NOT NULL CHECK (check_redo_improved IN (0, 1)),
        check_retention INTEGER NOT NULL CHECK (check_retention IN (0, 1)),
        notes TEXT
      );
      CREATE TABLE IF NOT EXISTS number_drill_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mode TEXT NOT NULL CHECK (mode IN ('standalone','dialogue','exam')),
        category TEXT NOT NULL CHECK (category IN ('number','date','time','money','phone')),
        subtype TEXT,
        prompt_text TEXT,
        spoken_text TEXT NOT NULL,
        correct_answer TEXT NOT NULL,
        user_answer TEXT NOT NULL,
        is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
        exam_session_id TEXT,
        attempted_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(next_review_date);
      CREATE INDEX IF NOT EXISTS idx_cards_filters ON cards(skill, type, box);
      CREATE INDEX IF NOT EXISTS idx_review_logs_date ON review_logs(reviewed_at);
      CREATE INDEX IF NOT EXISTS idx_daily_tasks_date_done ON daily_tasks(task_date, done);
      CREATE INDEX IF NOT EXISTS idx_writing_completions_date ON writing_completions(completed_at);
      CREATE INDEX IF NOT EXISTS idx_listening_sections_stage ON listening_sections(section_number, test_id);
      CREATE INDEX IF NOT EXISTS idx_listening_attempts_stage_recent ON listening_attempts(section_id, attempt_date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_number_drill_attempts_recent ON number_drill_attempts(attempted_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_number_drill_exam_session ON number_drill_attempts(exam_session_id, id);
    `);

    const writingColumns = this.connection.pragma('table_info(writing_completions)');
    if (!writingColumns.some((column) => column.name === 'content')) {
      this.connection.exec("ALTER TABLE writing_completions ADD COLUMN content TEXT NOT NULL DEFAULT ''");
    }
    this.migrateTaskTemplates();
  }

  migrateTaskTemplates() {
    if (this.connection.pragma('table_info(daily_tasks)').some(column => column.name === 'task_template_id')) return;
    this.connection.transaction(() => {
      this.connection.exec(`
        CREATE TABLE task_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          sort_order INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          created_at TEXT NOT NULL
        );
      `);
      const insert = this.connection.prepare('INSERT INTO task_templates (name, sort_order, created_at) VALUES (?, ?, datetime(\'now\'))');
      DAILY_TASK_SKILLS.forEach((name, index) => insert.run(name, index + 1));
      // Keep legacy skill rows (including retired writing tasks) and their IDs intact.
      // New rows use the template FK; nullable skill only supports old data/imports.
      this.connection.exec(`
        CREATE TABLE daily_tasks_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_date TEXT NOT NULL,
          skill TEXT CHECK (skill IN (${sqlEnum(SKILLS)})),
          done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
          completed_at TEXT,
          task_template_id INTEGER REFERENCES task_templates(id),
          UNIQUE (task_date, skill),
          UNIQUE (task_date, task_template_id)
        );
        INSERT INTO daily_tasks_new (id, task_date, skill, done, completed_at, task_template_id)
        SELECT d.id, d.task_date, d.skill, d.done, d.completed_at, t.id
        FROM daily_tasks d LEFT JOIN task_templates t ON t.name = d.skill;
        DROP TABLE daily_tasks;
        ALTER TABLE daily_tasks_new RENAME TO daily_tasks;
        CREATE INDEX idx_daily_tasks_date_done ON daily_tasks(task_date, done);
        CREATE TRIGGER daily_tasks_legacy_template AFTER INSERT ON daily_tasks
        WHEN NEW.task_template_id IS NULL AND NEW.skill IS NOT NULL
        BEGIN
          UPDATE daily_tasks SET task_template_id = (
            SELECT id FROM task_templates WHERE id IN (1, 2, 3)
            AND id = CASE NEW.skill WHEN '听力' THEN 1 WHEN '阅读' THEN 2 WHEN '口语' THEN 3 END
          ) WHERE id = NEW.id;
        END;
      `);
      if (this.connection.pragma('foreign_key_check').length) throw new Error('任务模板迁移外键校验失败');
    })();
  }

  taskTemplates() {
    return this.connection.prepare('SELECT * FROM task_templates WHERE active = 1 ORDER BY sort_order, id').all();
  }

  createTaskTemplate(name, createdAt) {
    const result = this.connection.prepare(`INSERT INTO task_templates (name, sort_order, created_at)
      VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM task_templates), ?)`).run(name, createdAt);
    return this.connection.prepare('SELECT * FROM task_templates WHERE id = ?').get(result.lastInsertRowid);
  }

  renameTaskTemplate(id, name) {
    if (!this.connection.prepare('UPDATE task_templates SET name = ? WHERE id = ? AND active = 1').run(name, id).changes) return null;
    return this.connection.prepare('SELECT * FROM task_templates WHERE id = ?').get(id);
  }

  deleteTaskTemplate(id, today) {
    return this.connection.transaction(() => {
      if (!this.connection.prepare('UPDATE task_templates SET active = 0 WHERE id = ? AND active = 1').run(id).changes) return false;
      this.connection.prepare('DELETE FROM daily_tasks WHERE task_template_id = ? AND task_date = ?').run(id, today);
      return true;
    })();
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
      INSERT INTO cards (skill, type, front, front_audio, back, review_mode, note, box, next_review_date, created_at)
      VALUES (@skill, @type, @front, @frontAudio, @back, @reviewMode, @note, 1, @nextReviewDate, @createdAt)
    `).run({ ...card, frontAudio: card.frontAudio ?? null, reviewMode: card.reviewMode ?? 'flip' });
    return this.getCard(result.lastInsertRowid);
  }

  updateCard(id, card) {
    this.connection.prepare(`
      UPDATE cards SET skill=@skill, type=@type, front=@front, front_audio=@frontAudio, back=@back, review_mode=@reviewMode, note=@note
      WHERE id=@id
    `).run({ id, ...card, frontAudio: card.frontAudio ?? null, reviewMode: card.reviewMode ?? 'flip' });
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

  cardsReviewedOn(date) {
    return this.connection.prepare(`
      SELECT cards.*
      FROM cards
      WHERE cards.id IN (
        SELECT DISTINCT card_id FROM review_logs
        WHERE substr(reviewed_at, 1, 10) = ?
      )
      ORDER BY cards.last_reviewed_at DESC, cards.id ASC
    `).all(date);
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
        INSERT OR IGNORE INTO daily_tasks (task_date, task_template_id, done, completed_at)
        VALUES (?, ?, 0, NULL)
      `);
      for (const template of this.taskTemplates()) insert.run(taskDate, template.id);
      return this.connection.prepare(`
        SELECT d.id, d.task_date, d.done, d.completed_at, d.task_template_id, t.name, t.name AS skill
        FROM daily_tasks d JOIN task_templates t ON t.id = d.task_template_id
        WHERE d.task_date = ? AND t.active = 1 ORDER BY t.sort_order, t.id
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
      return this.connection.prepare(`SELECT d.id, d.task_date, d.done, d.completed_at, d.task_template_id, t.name, t.name AS skill
        FROM daily_tasks d LEFT JOIN task_templates t ON t.id = d.task_template_id WHERE d.id = ?`).get(id);
    })();
  }

  weeklyTaskStats(startDate, endDate) {
    return this.connection.prepare(`
      SELECT t.name, COUNT(DISTINCT CASE WHEN d.done = 1 AND d.task_date BETWEEN ? AND ? THEN d.task_date END) AS completed
      FROM task_templates t JOIN daily_tasks d ON d.task_template_id = t.id
      GROUP BY t.name ORDER BY MIN(t.sort_order), MIN(t.id)
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

  importListeningTest({ sourceBook, testNumber, sections }) {
    return this.connection.transaction(() => {
      this.connection.prepare(`
        INSERT INTO listening_tests (source_book, test_number) VALUES (?, ?)
        ON CONFLICT(source_book, test_number) DO NOTHING
      `).run(sourceBook, testNumber);
      const test = this.connection.prepare(`
        SELECT * FROM listening_tests WHERE source_book = ? AND test_number = ?
      `).get(sourceBook, testNumber);
      const upsert = this.connection.prepare(`
        INSERT INTO listening_sections (
          test_id, section_number, title, audio_path, transcript_text, answer_key_text
        ) VALUES (@testId, @sectionNumber, @title, @audioPath, @transcriptText, @answerKeyText)
        ON CONFLICT(test_id, section_number) DO UPDATE SET
          title=excluded.title,
          audio_path=excluded.audio_path,
          transcript_text=excluded.transcript_text,
          answer_key_text=excluded.answer_key_text
      `);
      for (const section of sections) upsert.run({ testId: test.id, ...section });
      return this.listListeningSections();
    })();
  }

  listListeningSections() {
    return this.connection.prepare(`
      SELECT listening_sections.id, listening_sections.section_number,
             listening_sections.title, listening_sections.audio_path,
             listening_tests.source_book, listening_tests.test_number,
             latest.id AS latest_attempt_id, latest.attempt_date AS latest_attempt_date,
             latest.score_correct AS latest_score_correct, latest.score_total AS latest_score_total
      FROM listening_sections
      JOIN listening_tests ON listening_tests.id = listening_sections.test_id
      LEFT JOIN listening_attempts AS latest ON latest.id = (
        SELECT id FROM listening_attempts
        WHERE section_id = listening_sections.id
        ORDER BY attempt_date DESC, id DESC LIMIT 1
      )
      ORDER BY listening_sections.section_number, listening_tests.source_book, listening_tests.test_number
    `).all();
  }

  getListeningSection(id) {
    return this.connection.prepare(`
      SELECT listening_sections.*, listening_tests.source_book, listening_tests.test_number
      FROM listening_sections
      JOIN listening_tests ON listening_tests.id = listening_sections.test_id
      WHERE listening_sections.id = ?
    `).get(id);
  }

  recentListeningAttemptsByStage(sectionNumber, limit = 3) {
    return this.connection.prepare(`
      SELECT listening_attempts.*
      FROM listening_attempts
      JOIN listening_sections ON listening_sections.id = listening_attempts.section_id
      WHERE listening_sections.section_number = ?
      ORDER BY listening_attempts.attempt_date DESC, listening_attempts.id DESC
      LIMIT ?
    `).all(sectionNumber, limit);
  }

  listeningAttemptsForSection(sectionId) {
    return this.connection.prepare(`
      SELECT * FROM listening_attempts WHERE section_id = ?
      ORDER BY attempt_date DESC, id DESC
    `).all(sectionId);
  }

  createListeningAttempt(attempt) {
    const result = this.connection.prepare(`
      INSERT INTO listening_attempts (
        section_id, attempt_date, score_correct, score_total, check_gist,
        check_key_sentences, check_paraphrase, check_redo_improved,
        check_retention, notes
      ) VALUES (
        @sectionId, @attemptDate, @scoreCorrect, @scoreTotal, @checkGist,
        @checkKeySentences, @checkParaphrase, @checkRedoImproved,
        @checkRetention, @notes
      )
    `).run(attempt);
    return this.connection.prepare('SELECT * FROM listening_attempts WHERE id = ?').get(result.lastInsertRowid);
  }

  createNumberDrillAttempt(attempt) {
    const result = this.connection.prepare(`
      INSERT INTO number_drill_attempts (
        mode, category, subtype, prompt_text, spoken_text, correct_answer,
        user_answer, is_correct, exam_session_id, attempted_at
      ) VALUES (
        @mode, @category, @subtype, @promptText, @spokenText, @correctAnswer,
        @userAnswer, @isCorrect, @examSessionId, @attemptedAt
      )
    `).run(attempt);
    return this.connection.prepare('SELECT * FROM number_drill_attempts WHERE id = ?').get(result.lastInsertRowid);
  }

  numberDrillMistakes(limit) {
    return this.connection.prepare(`
      SELECT * FROM number_drill_attempts
      WHERE is_correct = 0
      ORDER BY attempted_at DESC, id DESC
      LIMIT ?
    `).all(limit);
  }

  numberDrillStats(examSessionId = null) {
    const where = examSessionId === null ? '' : 'WHERE exam_session_id = ?';
    return this.connection.prepare(`
      SELECT category, COUNT(*) AS total, SUM(is_correct) AS correct
      FROM number_drill_attempts
      ${where}
      GROUP BY category
      ORDER BY category
    `).all(...(examSessionId === null ? [] : [examSessionId]));
  }

  close() {
    this.connection.close();
  }
}

module.exports = { ReviewDatabase, SKILLS, DAILY_TASK_SKILLS, TYPES };
