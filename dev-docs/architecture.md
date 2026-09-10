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
| `src/domain/answerMatch.js` | 大小写/首尾空格归一化、`/` 多答案比较 | 听力题号解析、HTTP、DOM |
| `src/domain/numberDrill.js` | 数字专项五类别生成、九个具体对话场景与 mixed 分派、类别判分 | HTTP、SQL、DOM |
| `src/db.js` | schema、卡片 CRUD、到期查询、日志聚合 | UI 和路由格式 |
| `src/services.js` | 输入校验、用例编排、统计结果、每周写作目标常量 | 静态资源和 DOM |
| `src/app.js` | Express 请求/响应映射、静态文件 | 重复业务规则 |
| `public/` | SPA 展示与交互 | 自建业务真源或 mock 数据 |

听力真题模块与 Leitner 卡片模块并列：`src/domain/listening.js` 单一拥有答案文本解析、原文即时挖空，以及 `SECTION_UNLOCK_STREAK=3`、`SECTION_UNLOCK_THRESHOLD=0.7`、5 项 checklist 和最近记录判定；答案比较统一委托 `src/domain/answerMatch.js`，拼写卡也调用同一函数。`src/db.js` 只持久化 `listening_tests/listening_sections/listening_attempts`，不建题目表；`src/services.js` 负责阶段链式解锁、请求校验、自动分数写入和用例编排；Express 仅暴露 `/api/listening/*` 与不列目录的 `/listening-audio/*` 静态音频；SPA 消费 `transcript_segments` 渲染输入框并展示逐题结果，不重复解析或判分。版权原文、答案、音频仅进入 `.gitignore` 覆盖的 SQLite 与 `data/audio/`，导入脚本本身不包含素材正文。

朗读能力由 `public/speech.js` 单一负责：检测英文字母、选择 `en-GB`/英文降级语音、取消前一次朗读并调用 Web Speech API；正面朗读源也由该模块的 `frontText(card)` 统一决定：优先 `front_audio`，为空时回退 `front`。`public/app.js` 只渲染可见的 `front` 并把朗读源交给喇叭按钮；`front_audio` 仅允许在录入/编辑表单中以可见文字回显。

`cards.front_audio` 是 `src/db.js` 的可空 `TEXT` 字段，旧库通过普通 `ALTER TABLE cards ADD COLUMN front_audio TEXT` 扩展，不重建卡片表；`src/services.js` 复用 5000 字文本校验并将空值归一为 `null`。

`cards.review_mode` 是 `TEXT NOT NULL DEFAULT 'flip'`，旧库只执行普通 `ADD COLUMN`，不重建卡片表。`flip` 继续走既有翻卡与手动“记得/不记得”接口；`spelling` 的到期队列隐藏 `back` 明文，仅下发供 Web Speech API 朗读的编码音源，提交到 `/api/review/:id/spelling` 后由服务层调用公共答案比较函数并把判定结果交给原有 `transition`。错误响应回显 `correct_answer`；浏览器不拥有第二套判分或箱位规则。

自由练习由 `ReviewService` 拥有读取范围、拼写卡脱敏和只读判分合同：`all` 读全库，`today` 通过 `src/db.js` 按当天 `review_logs` 的去重 `card_id` 取卡，单卡按 id 读取。`POST /api/practice/cards/:id/spelling` 只调用 `answerMatches`并返回判分，不调用 `transition`/`applyReview`。SPA 的正式复习和额外练习共用 `renderCurrentReview`/`renderSpellingReview`，仅由 `reviewKind` 选择正式写入端点或只读端点；浏览器不计算 SRS 日期。

`daily_tasks` 由 `src/db.js` 负责唯一约束、按日仅补齐听力/阅读/口语三项、切换与聚合；历史写作任务行允许保留，但今日任务查询不会返回。写作周任务由 `writing_completions(completed_at, content)` 记录，目标常量 `WEEKLY_WRITING_TARGET` 与 `content` 的必填/5000 字校验由 `src/services.js` 单一维护；旧表通过新增 `TEXT NOT NULL DEFAULT ''` 列保留历史空记录，新接口不会再产生空内容。Express 只映射 `/api/tasks/*`、`POST /api/writing/complete` 与 `/api/stats/weekly`。动态 note 标签是纯展示规则，由 `public/card-ui.js` 单一负责，所有“句子对照”均显示“错因（选填）”。

## 合同与风险

数字听力与卡片/听力真题并列。`ReviewService.pendingNumberQuestions` 保存 UUID 单题状态，请求时清理满10分钟的题目；生成不落库，只返回 `questionId/spokenText`。答案允许空字符串（考试超时），原始输入不 trim；数据库成功写入 `number_drill_attempts` 后才删除待答题。`mixed` 先选九种具体 subtype，再走该类型的类别与模板，持久化具体 subtype 供错题重练。

`public/numbers.js` 实现专项首页、单题、考试、错题、统计五个 SPA 视图，复用 `api`、配色变量和 `IeltsSpeech`；后者通过显式 `allowNumeric` 支持纯数字音源。考试前端默认10题、五类别随机、每题20秒、最多点击播放2次；超时以空答案提交，离页取消计时和朗读，异步回包按页面代次丢弃。考试 session UUID 按 SPEC 不持久化，服务端聚合已提交记录；本轮没有服务端防作弊或中断续考合同。

专项验收入口为 `node test_number_drill.js` / `npm test`，内含六套旧回归。`scripts/test_number_browser.js` 是永久验收配套脚本，用独立无头 Chrome 移动模式测试真实页面和20秒计时，只 mock 系统语音边界；需要 Node 22+（内置 WebSocket）和本机 Chrome/Edge，其他路径可用 `CHROME_PATH`。截图、浏览器 profile、测试数据库默认在系统临时任务目录生成并清理；`NUMBER_SCREENSHOT_DIR` 仅用于人工复核，设置者负责结束后清理。应用运行依然无需浏览器测试依赖或构建链。

- API 合同严格采用 SPEC 的七个端点。
- 日期使用本地日历 `YYYY-MM-DD`；新卡创建时当天到期，到期查询为 `next_review_date <= 今天`；复习后仍由 `src/domain/srs.js` 计算下次日期。
- `cards.type` 的枚举真源是 `src/db.js` 的 `TYPES`；扩大 SQLite `CHECK` 约束时通过事务内建新表、复制并核对记录数、替换旧表及外键校验完成，保留既有卡片 id 和复习日志关联。
- 连续打卡从最近一个有日志的日期向前按自然日连续聚合，日期断点后重新计数。
- 删除卡片时通过外键级联删除对应日志。
- 最大回归风险是日期边界、SRS 状态迁移和统计误算，由 `test_srs.js` 及 HTTP 验收锁定。
- 听力模块最大风险是把 Test 当解锁维度、只看分数忽略 checklist、或由 UI 重复计算阶段；`test_listening.js` 覆盖 Section 维度、最近 3 条、70% 阈值、5 项全勾和链式解锁。
- 听力自动判分最大风险是换行导致多挖词、把 `movie/film` 当成字面答案、或前端拥有第二套判分规则；`test_listening.js` 直接读取已导入的剑16 Test1 Part1真实数据，锁定 Q1-Q10、两种 Q6 答案、错题回显和归一化规则。
- 拼写模式最大风险是提交前泄露 `back`、绕过自动判分手动提交 result、或与听力比较规则分叉；`test_spelling.js` 锁定队列脱敏、专用接口、SRS 升降箱、18 张旧卡普通加列迁移与共享模块引用。
- 自由练习最大风险是误用正式复习端点导致调度状态或打卡统计污染；`test_practice.js` 同时锁定 `box`/`next_review_date`/`last_reviewed_at`/`review_count`/`review_logs` 零变化和正式路径仍升箱写日志。
- 朗读回归风险是纯中文误显示、连续点击排队和语音选择错误，由 `test_speech.js` 的浏览器 API mock 断言锁定。
- `front_audio` 回归风险是完整原句被当作正面可见文字渲染，或老卡片不再朗读 `front`；由 `test_speech.js` mock 断言与卡片库/复习界面 DOM 可见文本检查共同锁定。
- 每日任务以 `(task_date, skill)` 唯一，重复访问不会新增重复行；完成状态存整数 0/1，API 输出布尔值。
- 每周复盘固定取今天及前 6 天，任务完成天数来自 `daily_tasks.done=1`，正确率通过 `review_logs JOIN cards` 按技能聚合，掌握率复用卡片箱位统计。
- 每周复盘只返回数据：三项每日任务完成天数、四技能正确率与掌握率、写作完成次数、目标及最近 7 天每条写作的 `completed_at`/`content`，不生成判断性文案。

## Forbidden Paths

- Do not move SRS transitions, due-date rules, or streak aggregation into route handlers or browser code.
- Do not add login, mock product data, a frontend framework, or a second product truth beside `SPEC.md`.
