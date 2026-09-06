# 雅思复习工具

基于 Leitner 五箱间隔重复的个人雅思复习触发工具。产品规格见 [`SPEC.md`](./SPEC.md)。

## 本地运行

```powershell
npm install
npm test
npm start
```

默认访问 `http://localhost:3001`，数据库保存到 `data/ielts.db`。可通过 `PORT` 与 `DB_PATH` 环境变量覆盖。

## API

- `GET/POST /api/cards`，卡片可选字段 `front_audio` 用作正面完整朗读原句；为空时回退朗读 `front`
- `PUT/DELETE /api/cards/:id`
- `GET /api/review/queue`
- `POST /api/review/:id`
- `GET /api/tasks/today`
- `POST /api/tasks/:id/toggle`
- `POST /api/writing/complete`，请求体 `{ "content": "本周实际写作内容" }`（必填，最多 5000 字）
- `GET /api/stats`
- `GET /api/stats/weekly`，`writing.records` 返回最近 7 天写作记录的 `completed_at` 与 `content`

部署时由 PM2 运行 `src/server.js`，线上端口为 3001。
