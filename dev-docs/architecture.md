# 架构

## Decision

The single recommended architecture is a monolithic Node.js application: Express provides the JSON API and static SPA, while one SQLite file stores cards and review logs. PM2 runs the service directly with no frontend build chain.

## Technology Stack Decision

用户已确认 Node.js、Express、SQLite、原生 JavaScript SPA 与 PM2/阿里云为唯一技术主线。

## Framework Best-Practice Contract

遵守 Express 中间件与错误处理约定、SQLite 事务和外键约束、浏览器标准 API。Do not introduce a private competing architecture, frontend framework, parallel state store, or duplicated SRS rules.

## Owner Layers

| 层 | 唯一职责 | 禁止承担 |
| --- | --- | --- |
| `src/domain/srs.js` | 箱位迁移、间隔与日期计算 | HTTP、SQL、DOM |
| `src/db.js` | schema、卡片 CRUD、到期查询、日志聚合 | UI 和路由格式 |
| `src/services.js` | 输入校验、用例编排、统计结果、每周写作目标常量 | 静态资源和 DOM |
| `src/app.js` | Express 请求/响应映射、静态文件 | 重复业务规则 |
| `public/` | SPA 展示与交互 | 自建业务真源或 mock 数据 |

朗读能力由 `public/speech.js` 单一负责：检测英文字母、选择 `en-GB`/英文降级语音、取消前一次朗读并调用 Web Speech API；正面朗读源也由该模块的 `frontText(card)` 统一决定：优先 `front_audio`，为空时回退 `front`。`public/app.js` 只渲染可见的 `front` 并把朗读源交给喇叭按钮；`front_audio` 仅允许在录入/编辑表单中以可见文字回显。

`cards.front_audio` 是 `src/db.js` 的可空 `TEXT` 字段，旧库通过普通 `ALTER TABLE cards ADD COLUMN front_audio TEXT` 扩展，不重建卡片表；`src/services.js` 复用 5000 字文本校验并将空值归一为 `null`。

`daily_tasks` 由 `src/db.js` 负责唯一约束、按日仅补齐听力/阅读/口语三项、切换与聚合；历史写作任务行允许保留，但今日任务查询不会返回。写作周任务由 `writing_completions(completed_at, content)` 记录，目标常量 `WEEKLY_WRITING_TARGET` 与 `content` 的必填/5000 字校验由 `src/services.js` 单一维护；旧表通过新增 `TEXT NOT NULL DEFAULT ''` 列保留历史空记录，新接口不会再产生空内容。Express 只映射 `/api/tasks/*`、`POST /api/writing/complete` 与 `/api/stats/weekly`。动态 note 标签是纯展示规则，由 `public/card-ui.js` 单一负责，所有“句子对照”均显示“错因（选填）”。

## 合同与风险

- API 合同严格采用 SPEC 的七个端点。
- 日期使用本地日历 `YYYY-MM-DD`；新卡创建时当天到期，到期查询为 `next_review_date <= 今天`；复习后仍由 `src/domain/srs.js` 计算下次日期。
- `cards.type` 的枚举真源是 `src/db.js` 的 `TYPES`；扩大 SQLite `CHECK` 约束时通过事务内建新表、复制并核对记录数、替换旧表及外键校验完成，保留既有卡片 id 和复习日志关联。
- 连续打卡从最近一个有日志的日期向前按自然日连续聚合，日期断点后重新计数。
- 删除卡片时通过外键级联删除对应日志。
- 最大回归风险是日期边界、SRS 状态迁移和统计误算，由 `test_srs.js` 及 HTTP 验收锁定。
- 朗读回归风险是纯中文误显示、连续点击排队和语音选择错误，由 `test_speech.js` 的浏览器 API mock 断言锁定。
- `front_audio` 回归风险是完整原句被当作正面可见文字渲染，或老卡片不再朗读 `front`；由 `test_speech.js` mock 断言与卡片库/复习界面 DOM 可见文本检查共同锁定。
- 每日任务以 `(task_date, skill)` 唯一，重复访问不会新增重复行；完成状态存整数 0/1，API 输出布尔值。
- 每周复盘固定取今天及前 6 天，任务完成天数来自 `daily_tasks.done=1`，正确率通过 `review_logs JOIN cards` 按技能聚合，掌握率复用卡片箱位统计。
- 每周复盘只返回数据：三项每日任务完成天数、四技能正确率与掌握率、写作完成次数、目标及最近 7 天每条写作的 `completed_at`/`content`，不生成判断性文案。

## Forbidden Paths

- Do not move SRS transitions, due-date rules, or streak aggregation into route handlers or browser code.
- Do not add login, mock product data, a frontend framework, or a second product truth beside `SPEC.md`.
