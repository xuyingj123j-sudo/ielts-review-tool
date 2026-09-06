'use strict';

const path = require('path');
const { createApp } = require('./app');
const { ReviewDatabase } = require('./db');
const { ReviewService } = require('./services');

const port = Number(process.env.PORT || 3001);
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'ielts.db');
const database = new ReviewDatabase(dbPath);
const app = createApp(new ReviewService(database));
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`IELTS Review Tool listening on http://0.0.0.0:${port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

