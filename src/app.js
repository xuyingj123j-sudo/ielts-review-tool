'use strict';

const path = require('path');
const express = require('express');
const { HttpError } = require('./services');

function parseId(value, label = '卡片') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, `无效的${label} id`);
  return id;
}

function createApp(service, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/cards', (req, res) => res.json(service.listCards(req.query)));
  app.post('/api/cards', (req, res) => res.status(201).json(service.createCard(req.body || {})));
  app.put('/api/cards/:id', (req, res) => res.json(service.updateCard(parseId(req.params.id), req.body || {})));
  app.delete('/api/cards/:id', (req, res) => {
    service.deleteCard(parseId(req.params.id));
    res.status(204).end();
  });
  app.get('/api/review/queue', (req, res) => res.json(service.queue()));
  app.post('/api/review/:id', (req, res) => res.json(service.review(parseId(req.params.id), req.body?.result)));
  app.post('/api/review/:id/spelling', (req, res) => res.json(service.reviewSpelling(parseId(req.params.id), req.body || {})));
  app.get('/api/practice/cards', (req, res) => res.json(service.practiceCards(req.query.scope)));
  app.get('/api/practice/cards/:id', (req, res) => res.json(service.practiceCard(parseId(req.params.id))));
  app.post('/api/practice/cards/:id/spelling', (req, res) => {
    res.json(service.gradePracticeSpelling(parseId(req.params.id), req.body || {}));
  });
  app.get('/api/tasks/today', (req, res) => res.json(service.todayTasks()));
  app.post('/api/tasks/:id/toggle', (req, res) => res.json(service.toggleTask(parseId(req.params.id, '任务'))));
  app.post('/api/writing/complete', (req, res) => res.status(201).json(service.recordWritingCompletion(req.body || {})));
  app.get('/api/stats', (req, res) => res.json(service.stats()));
  app.get('/api/stats/weekly', (req, res) => res.json(service.weeklyStats()));
  app.get('/api/listening/overview', (req, res) => res.json(service.listeningOverview()));
  app.get('/api/listening/sections', (req, res) => res.json(service.listListeningSections()));
  app.get('/api/listening/sections/:id', (req, res) => res.json(service.listeningSection(parseId(req.params.id, 'Section'))));
  app.post('/api/listening/sections/:id/attempts', (req, res) => {
    res.status(201).json(service.recordListeningAttempt(parseId(req.params.id, 'Section'), req.body || {}));
  });
  app.post('/api/numbers/question', (req, res) => res.status(201).json(service.numberQuestion(req.body || {})));
  app.post('/api/numbers/answer', (req, res) => res.status(201).json(service.answerNumberQuestion(req.body || {})));
  app.get('/api/numbers/mistakes', (req, res) => res.json(service.numberMistakes(req.query.limit)));
  app.get('/api/numbers/stats', (req, res) => res.json(service.numberStats()));
  app.post('/api/numbers/exam/start', (req, res) => res.status(201).json(service.startNumberExam(req.body || {})));
  app.get('/api/numbers/exam/:sessionId/summary', (req, res) => res.json(service.numberExamSummary(req.params.sessionId)));

  const publicDir = path.join(__dirname, '..', 'public');
  const audioDir = options.audioDir || path.join(__dirname, '..', 'data', 'audio');
  app.use('/listening-audio', express.static(audioDir, {
    index: false,
    dotfiles: 'deny',
    fallthrough: false,
    maxAge: '1h'
  }));
  app.use(express.static(publicDir, { maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next(new HttpError(404, '接口不存在'));
    return res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'JSON 格式无效' });
    }
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return res.status(status).json({ error: status >= 500 ? '服务器内部错误' : error.message });
  });
  return app;
}

module.exports = { createApp };
