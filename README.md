# 雅思复习工具

基于 Leitner 五箱间隔重复的个人雅思复习触发工具。产品规格见 [`SPEC.md`](./SPEC.md)。

## 本地运行

```powershell
npm install
npm test
npm start
```

默认访问 `http://localhost:3001`，数据库保存到 `data/ielts.db`。可通过 `PORT` 与 `DB_PATH` 环境变量覆盖。

可选环境变量 `IELTS_ACCESS_TOKEN`：未设置或为空时无需口令；设置非空值后，全部 `/api/` 请求需携带与之完全匹配的 `X-Access-Token`，否则返回 `401 {"error":"未授权"}`。静态页面仍可直接打开，首次请求失败会弹出口令框，输入后保存在浏览器 `localStorage` 的 `ielts_access_token` 中并自动重试。修改环境变量后需重新启动该应用才能生效。

`npm test` 包含既有七套回归及新增口令验收；请在未设置 `IELTS_ACCESS_TOKEN` 的环境运行。单独验收口令可运行 `node test_access_token.js`，脚本自行设置测试口令，使用临时数据库、真实 curl 和独立 Chrome/CDP，并在结束后清理。浏览器验收需要 Node 22+ 和 Chrome/Edge，可用 `CHROME_PATH` 指定浏览器路径。

首次试运行听力真题模块前执行：

```powershell
npm run import:listening
```

该命令只解析用户本机已有的剑16 Test1 HTML、复制 Part1-4 音频，并把内容写入 `data/ielts.db`。`data/audio/`、数据库及版权内容数据目录均已被 `.gitignore` 排除，不得提交到 Git。

## API

- `GET/POST /api/cards`，卡片可选字段 `front_audio` 用作正面完整朗读原句；`review_mode` 可为 `flip`（默认）或 `spelling`
- `POST /api/review/:id/spelling`，拼写卡提交 `{ "answer": "..." }` 后自动判分并执行 Leitner 升降箱
- `PUT/DELETE /api/cards/:id`
- `GET /api/review/queue`
- `POST /api/review/:id`
- `GET /api/practice/cards?scope=all|today` 与 `GET /api/practice/cards/:id`，读取全部/今日已复习/单张自测卡片
- `POST /api/practice/cards/:id/spelling`，只返回拼写对错和正确答案，不更新箱位、日期或复习日志
- `GET /api/tasks/today`
- `POST /api/tasks/:id/toggle`
- `POST /api/writing/complete`，请求体 `{ "content": "本周实际写作内容" }`（必填，最多 5000 字）
- `GET /api/stats`
- `GET /api/stats/weekly`，`writing.records` 返回最近 7 天写作记录的 `completed_at` 与 `content`
- `GET /api/listening/overview`，返回四个 Section 阶段的解锁进度和试题列表
- `GET /api/listening/sections` 与 `GET /api/listening/sections/:id`；详情响应从原文和答案即时生成 `transcript_segments`，不持久化题目副本
- `POST /api/listening/sections/:id/attempts`，提交 `{ answers, 5项checklist, notes }`；服务端自动判分、保存分数并返回逐题结果

部署时由 PM2 运行 `src/server.js`，线上端口为 3001。
