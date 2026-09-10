# 验收记录

## 2026-09-09 数字听力专项本地验收

完成 `git diff` 自审并修正后执行 `node test_number_drill.js`，退出码0。脚本包含 SPEC 数字专项全部10项及六套旧回归；真实 HTTP 用 `curl.exe` 调用临时端口服务，测试数据不写入真实库。

- 1–7：固定日期、时间、金额、手机号、一般数字精确样例全部通过；日期闰年/两位年份、am/pm、整数金额、所有模板和 mixed 九个具体场景有确定性断言。原 mixed 分派实现正确，未重做。
- 8：question 响应只有 questionId/spokenText；错误作答带出正确答案与题干，重复提交400；错题可查，2题1对的 accuracy=50；同 session 3题2对的 summary score=2,total=3。空答案可记错、原始空格保留、满10分钟过期均通过。
- 9：test_srs.js / test_spelling.js / test_practice.js / test_speech.js / test_ui.js / test_listening.js 全部退出码0；实际库39张卡片及全部既有业务表逐行前后不变；18张旧卡普通加列迁移另由拼写回归覆盖。
- 10：无头 Chrome 移动模式，390×844和320×700均 width=scrollWidth=bodyScrollWidth；五页、10个对话入口、错题重练、提交前隐藏题干、纯数字朗读调用、无限重播、考试2次播放、真实20秒超时自动空答、1/2成绩和离页21秒无新增答题均通过。页面截图已人工查看，沿用暖色渐变、白色20px圆角卡片与原导航；检查后清理截图。系统语音 API 在自动化里做 mock，真实设备声音需用户试听。

本轮补齐 `public/numbers.js`、`test_number_drill.js` 及永久浏览器验收配套 `scripts/test_number_browser.js`；修复空答案拒绝、原始输入被trim、过期边界、金额畸形输入被误判及纯数字无法朗读。`git diff --check` 和工程 guardrails 均退出码0。

开发服务器保留在 http://127.0.0.1:3109/ ，PID 12376，监听0.0.0.0:3109；根页面、numbers.js、数字统计接口均HTTP200。新模块真实统计 total=0；服务器启动前后 cards SHA256 均为 `70f28e1b18fcb47046095e25cf9f77d78ae0ba2adecdceaaccf3236a12538344`，count=39。运行使用原 data/ielts.db，后续用户练习会正常写入专项答题表。

本轮没有部署、PM2操作、Git提交或推送。测试数据库和隔离Chrome profile自动删除，人工复核截图目录也已清理。

验收标准以 [`../SPEC.md`](../SPEC.md) 第 1-7 条为准。本文件用于保存实际命令和结果，实施后回写证据，不以描述代替输出。

## 当前状态

2026-09-06 七次迭代仍仅修改本地代码与本地 SQLite；未连接线上服务器，未执行部署或 PM2 操作。

### 自由练习模式（2026-09-07，本地，不部署）

1. Chrome 在临时数据库副本上实测 `todayDue=0`，复习页 DOM 显示“今天已经清空啦”及“练习全部卡片”/“练习今天已复习”两个入口。
2. 点击全部后 DOM 显示“自由练习”、`1 / 18 · 不记录进度`；翻卡后点“记得”进入 `2 / 18`，证明一轮可正常推进。
3. 临时验收卡 id=28 的自由练习 curl 提交返回 `{"correct":true,"correct_answer":"movie/film"}`；提交前后 `GET /api/cards?search=FREE_PRACTICE_SPELLING` 均为 `box=3,next_review_date=2026-09-20,review_count=0`，直查 `review_logs` 均为 0。
4. 卡片库中 id=27 点击/回车后 DOM 为“单卡练习”、`1 / 1 · 不记录进度`，正面文本与所选卡一致；对 id=28 用真实鼠标点击后进入拼写单卡界面。
5. id=28 在单卡界面提交 `cinema`，DOM 显示“正确答案：movie/film（仅自测，进度未变）”；curl 前后仍为 `box=3,next_review_date=2026-09-20,review_count=0`，`review_logs=0→0`。
6. 同一临时卡走正式 `POST /api/review/28/spelling`，curl 返回 `box_before=3,box_after=4,next_review_date=2026-09-13`；随后 curl 为 `box=4,next_review_date=2026-09-13,review_count=1`，`review_logs=0→1`。
7. `npm test` 全量通过，覆盖 SRS、拼写、自由/单卡练习、朗读、UI、听力挖空/解锁、每日任务和写作。正式 `data/ielts.db` 最终为 19 张，`integrity_check=ok`；其中 id=29 是任务验收前已由本地应用写入的拼写卡（`created_at=2026-09-06 23:34:26`），本轮未删除或改动它。临时副本与验收卡已清理。

`test_practice.js` 自动证据：

```text
✓ 自由练习范围断言通过：全部2张，今天已复习1张，拼写卡不泄露back明文
✓ 自由练习零落库断言通过：box=3→3, next=2026-09-07→2026-09-07, logs=0→0
✓ 单卡练习零落库断言通过：box=3→3, next=2026-09-07→2026-09-07, logs=0→0
✓ 正式复习回归通过：box=3→4, next=2026-09-07→2026-09-14, logs=0→1
```

本轮未连接线上服务器、未部署、未推送 GitHub。

### 卡片拼写测试模式（2026-09-07，本地，不部署）

`npm test` 全量通过。新增的 `test_spelling.js` 给普通旧表一次性插入 18 张卡，再由正式迁移入口打开，实际断言：

```text
✓ 公共判分复用断言通过：听力与卡片拼写均调用 src/domain/answerMatch.js
✓ review_mode 普通加列迁移断言通过：18张旧卡完整保留且全部默认 flip
✓ 提交前防泄露断言通过：拼写卡队列响应无 back 字段及 back 明文，保留仅供朗读的编码音源
✓ 拼写正确自动判分断言通过：" FILM " 命中 movie/film，box 2 → 3
✓ 拼写错误自动判分断言通过：box 4 → 1，响应 correct_answer = movie/film
✓ 普通 flip 回归断言通过：旧卡仍走翻卡接口并由第1箱升到第2箱
```

听力测试继续用真实剑16 Test1 Part1 数据通过 `" Egg "`、`movie/film` 两种写法和错题回显；SRS、每日任务、写作、听力阶段解锁、朗读、UI 合同测试均在同一轮 `npm test` 中通过。

本地 3001 使用临时验收卡（id=28）获得 HTTP 证据：

```text
POST /api/cards -> review_mode="spelling", back="movie/film", box=1
GET /api/review/queue -> id=28 无 back 属性，响应明文不含 movie/film
POST /api/review/28/spelling {"answer":" FILM "}
  -> {"correct":true,"result":"correct","box_before":1,"box_after":2,"correct_answer":"movie/film"}
POST /api/review/28/spelling {"answer":"cinema"}
  -> {"correct":false,"result":"incorrect","box_before":2,"box_after":1,"correct_answer":"movie/film"}
```

Chrome 本地页面提交前 DOM：仅显示 `SPELLING_DOM_PROMPT_20260907`、背面朗读按钮、拼写输入框和提交按钮；`htmlContainsBackPlaintext=false`、无手动 `data-result` 按钮、无横向溢出。提交错误答案后显示 `正确答案：movie/film（已回到第 1 箱）`，输入表单 `display=none`，下一张按钮可见。录入表单的“拼写测试模式”开关默认关闭、值为 `spelling`。

验收卡最终经 `DELETE /api/cards/28` 删除，HTTP 204；级联复习日志为 0。正式本地库最终证据：

```text
ROOT_HTTP=200
FINAL_CARD_COUNT=18
FINAL_CARD_IDS=1,3,4,5,6,8,9,10,11,13,15,17,18,21,22,23,26,27
ALL_REVIEW_MODES=["flip"]
REGRESSION_HTTP={"statsTotal":18,"tasks":["听力","阅读","口语"],"writingRecords":1,"listeningStages":4}
INTEGRITY_CHECK=ok
LOCAL_SERVER_PID=48924
```

本轮未连接线上服务器、未部署、未触碰 PM2、未推送 GitHub。

### 听力原文自动挖空与自动判分（本地，不部署）

`npm test` 读取已导入的剑16 Test1 Part1真实数据并通过以下断言：

```text
✓ 真实原文挖空断言通过：blank number = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]，换行边界只挖掉 egg
✓ 多选一答案领域断言通过：Q6 填 movie 或 film 均为 10/10
✓ 错题与容错断言通过：" Egg " 判对；Q2 判错并返回 correct_answer = tower；总分 9/10
✓ 单条达标记录断言通过：Section2 仍为 locked，Section1 连续达标 1/3
✓ 阶段解锁断言通过：Section1 最近3条均达标后，Section2 locked → unlocked
✓ checklist 不达标断言通过：自动判分 10/10 但只勾4项，qualified=false，Section3 未误解锁
```

同一次 `npm test` 中 SRS、错词卡片 CRUD/迁移、到期队列、每日任务、写作记录、每周复盘、朗读与 UI 合同断言全部通过。

本地 3001 重启当前代码后只读 HTTP 证据：

```text
GET /api/listening/sections/1 -> HTTP=200
transcript_segments blank numbers=1,2,3,4,5,6,7,8,9,10
```

浏览器使用系统临时目录内的真实数据库备份交互，未写入用户正式库。提交 `Q1=" Egg "`、`Q2="wrong tower"`、`Q6="film"`，其余正确且 5 项全勾后，DOM 证据：

```json
{
  "summary":"自动判分：9/10",
  "inputCount":0,
  "correctCount":9,
  "incorrectCount":1,
  "results":["✓ Q1 Egg","✕ Q2 wrong tower → tower","✓ Q6 film"],
  "submitDisabled":true,
  "submitText":"已自动判分 9/10"
}
```

页面初始状态同时确认：10 个输入框题号为 1-10，完整原文与答案面板均隐藏，音频路径为 `/listening-audio/Test1_Part1.mp3`，无横向溢出。正式库验收前后均为 18 张卡片、4 条 `listening_sections`、0 条 `listening_attempts`；未新建持久化题目表，未写入正式练习记录。

### 听力真题练习模块试运行（本地，不部署）

`npm run import:listening` 实际输出：

```text
已导入 剑16 Test1：Part1 Children's Engineering Workshops；Part2 Stevenson's site；Part3 Art Projects；Part4 Stoicism
版权素材仅写入已忽略的 data/ielts.db 与 data/audio/。
IDEMPOTENT_COUNTS={"cards":18,"sections":4,"attempts":0,"tasks":10,"writing":1}
AUDIO_PART1_HASH_MATCH=True
AUDIO_PART2_HASH_MATCH=True
AUDIO_PART3_HASH_MATCH=True
AUDIO_PART4_HASH_MATCH=True
```

`curl http://localhost:3001/api/listening/sections` 返回 4 条，`section_number/title` 为：

```text
1 Children's Engineering Workshops
2 Stevenson's site
3 Art Projects
4 Stoicism
```

音频范围请求证据：

```text
HTTP/1.1 206 Partial Content
Accept-Ranges: bytes
Content-Type: audio/mpeg
Content-Range: bytes 0-15/13505290
Content-Length: 16
```

`npm test` 听力模块关键断言：

```text
✓ 单条达标记录断言通过：Section2 仍为 locked，Section1 连续达标 1/3
✓ 阶段解锁断言通过：Section1 最近3条均达标后，Section2 locked → unlocked
✓ 不达标记录断言通过：8/10 但只勾4项，qualified=false，Section3 未误解锁
✓ 分数阈值断言通过：6/10 即使5项全勾也不达标
✓ HTML 解析器断言通过：只提取 Test1 Part1-4，并分离标题、原文与答案
全部听力真题练习模块测试通过。
```

同一次 `npm test` 中既有 SRS、到期队列、每日任务、写作记录、每周复盘、朗读与 UI 合同断言全部通过。任务开始时本地库实际为 18 张卡片（不是任务描述中的 21+），导入前后均为 18；未补造、删除或修改既有卡片。

移动端 Chrome 390×844 实测：`hasHorizontalOverflow=false`，底部导航 `position=fixed`、`navBottom=830/viewportHeight=844`。页面显示 Section1 解锁、Section2-4 置灰；练习页音频 `readyState=4`、`error=null`，原文与答案初始 `hidden=true`，5 项 checkbox 均存在；点击显示后正文长度分别为 3566/108，控制台 error/warn 为空。浏览器未提交表单，真实库 `listening_attempts` 保持 0 条，留给用户试练。

Git 忽略证据：

```text
.gitignore:4:data/audio/  data/audio/Test1_Part1.mp3
.gitignore:2:data/*.db   data/ielts.db
git status --short --ignored: !! data/
```

本地服务当前监听 `0.0.0.0:3001`；本轮未连接服务器、未触碰 PM2、未部署。

### 七次迭代：挖空正面与完整朗读原句分离

`npm test` 当前关键断言实际输出：

```text
✓ front_audio 普通加列迁移断言通过：旧卡 id=41 保留且 front_audio = null
✓ front_audio API 断言通过：front = "She often goes to a ______ near her house."；front_audio = "She often goes to a keep-fit studio near her house."
✓ front_audio 朗读断言通过：speak 文本 = "She often goes to a keep-fit studio near her house."，不是 front = "She often goes to a ______ near her house."
✓ 旧卡向后兼容断言通过：front_audio 为 null 时 speak 文本回退为 front = "identify the different species of butterflies"
✓ front_audio 可见渲染合同断言通过：只在录入/编辑 textarea 回显，卡片库与复习正面只渲染 front
```

本地 curl 创建验收卡响应包含 `front_audio`；DOM 检查时使用唯一标记 `DOM_SECRET_7`：

```text
CURL_POST_RESPONSE={"id":24,"skill":"听力","type":"听力误听","front":"She often goes to a ______ near her house.","back":"keep-fit studio",...,"front_audio":"She often goes to a keep-fit studio near her house. DOM_SECRET_7"}
卡片库：pageTextContainsFrontAudio=false，targetSpeechSource="She often goes to a keep-fit studio near her house. DOM_SECRET_7"
复习界面：pageTextContainsFrontAudio=false，visibleFront="She often goes to a ______ near her house."，frontSpeechSource="She often goes to a keep-fit studio near her house. DOM_SECRET_7"
CURL_FINAL_CARD_COUNT=21
CURL_FINAL_CARD_IDS=23,22,21,20,19,18,17,16,15,13,12,11,10,9,8,7,6,5,4,3,1
真实旧卡 DOM：visibleFront="building a new ___"，frontSpeechSource="building a new ___"，fallbackMatchesVisibleFront=true
ROOT_HTTP=200
```

验收期间发现本地 3001 启动后出现来源不明的并发删除，卡片一度从 21 降到 16。已立即停止服务，从 SQLite WAL 最后一个 21 张卡片的完整提交帧恢复；恢复后 `integrity_check=ok`，卡片 id 与 21 条关联复习日志均恢复。随后重启并连续检查 10 次，卡片数稳定为 21；验收卡 id=24 检查后删除，不混入用户数据。

### 六次迭代：写作记录保存正文

`npm test` 当前关键断言实际输出：

```text
✓ 写作记录表迁移断言通过：旧记录 id=7 保留，content 为 TEXT NOT NULL，历史空内容兼容为空字符串
✓ 写作内容校验断言通过：不带 content 返回 400，空记录未写入
✓ 写作长度边界断言通过：5000 字成功，5001 字返回 400
✓ 写作完成接口断言通过：content 原文保存；最近7天完成 2 次 / 目标 1 次
✓ 每周写作明细断言通过：返回 2 条 completed_at + content，最新内容 = "Some people believe public transport should be free.\nI partly agree with this view."
✓ 写作录入 UI 合同断言通过：展开 textarea、取消、空内容拦截、携带 content 提交及周记录渲染均存在
```

本地 HTTP 合同证据：

```text
CARD_COUNT_BEFORE=21
POST /api/writing/complete {} -> {"error":"写作内容不能为空"} HTTP_STATUS=400
POST /api/writing/complete {"content":"Task 2 practice: Public transport should be affordable and accessible. This record proves that writing content is stored."}
-> {"id":3,"completed_at":"2026-09-04 08:07:03","content":"Task 2 practice: Public transport should be affordable and accessible. This record proves that writing content is stored.","weeklyCompleted":3,"target":1} HTTP_STATUS=201
GET /api/stats/weekly -> writing.records 包含同一条 id=3、completed_at 与 content
CARD_COUNT_AFTER=21
LISTENING_PID=30648
```

本地 Edge 交互验证：点击“记一次写作”后表单和 textarea 可见；点击“取消”后表单隐藏且按钮恢复，未提交请求。复盘页展示 curl 新增记录的时间和全文。390×844 视口 `hasHorizontalOverflow=false`、底部导航 `position=fixed`。控制台仅有浏览器扩展自身的 message-port 错误，页面源码无错误。

### 五次迭代：三项每日任务、写作周记录与纯数据复盘

`npm test` 当前断言实际输出：

```text
✓ 写作记录表迁移断言通过：writing_completions 已创建
✓ 今日任务接口断言通过：只生成听力/阅读/口语 3 项；切换 false → true → false；历史写作行不返回
✓ 写作完成接口断言通过：记录时间 2026-09-04 12:00:00；最近7天完成 2 次 / 目标 1 次
✓ 每周复盘口径断言通过：每日任务听力 5/7、阅读 7/7、口语 6/7；四技能正确率 80%/33%/暂无/75%
✓ 纯数据响应断言通过：复盘响应只包含周期、任务、技能统计与写作次数
✓ note 动态标签断言通过：任意技能+句子对照均显示“错因（选填）”，其他类型显示“备注（选填）”
```

本地 HTTP 与数据库证据：

```text
LISTENING_PID=34352
ROOT_HTTP=200
CARD_COUNT=21
CARD_IDS=23,22,21,20,19,18,17,16,15,13,12,11,10,9,8,7,6,5,4,3,1
TODAY_TASK_COUNT=3
TODAY_TASK_SKILLS=听力,阅读,口语
WEEKLY_WRITING=0/1
WEEKLY_TOP_LEVEL_KEYS=period,dailyTasks,skills,writing
```

本地 Edge 页面验证：主页“今日任务”只有听力、阅读、口语，独立“本周写作”卡片内可见“记一次写作”；复盘页只有前三项展示任务完成天数，写作卡不展示每日任务指标，页面无判断性或免责文案。录入页听力/口语的“句子对照”均显示“错因（选填）”，切换成“生词”恢复“备注（选填）”。390×844 视口 `hasHorizontalOverflow=false`、底部导航 `position=fixed`、写作按钮可见，控制台 error/warning 为空。

2026-09-04 二次迭代仅做本地代码与合同链路验证，未执行 SSH、部署或 PM2 操作。

2026-09-04 三次迭代仍仅修改本地前端；朗读验收证据在本轮命令执行后追加，线上部署继续排除在范围外。

### 三次迭代：朗读功能

`npm test` 中的 `test_speech.js` 实际输出：

```text
✓ 点击喇叭断言通过：cancel 后 speak 被调用，文本 = identify the different species of butterflies，语音 = en-GB
✓ 连续点击断言通过：第二次朗读再次先调用 cancel，没有排队叠加
✓ 显示规则断言通过：纯中文“无处不在的”不生成喇叭；英文“ubiquitous”生成喇叭
✓ 语音降级断言通过：无 en-GB 时选择 en-US；没有英文语音时安全返回且不朗读
全部朗读功能测试通过。
```

本地 Edge 页面交互证据：

```text
卡片库共 21 张；英文示例 building a new ___ / Another job ... is replacing the wall 的 speechButtons = 2
纯中文示例 parking problems / 停车问题 的 backButtonCount = 0
录入空表单 frontHidden=true, backHidden=true；输入 ubiquitous / 无处不在的后 frontHidden=false, backHidden=true
复习卡 tallest / highest 的正反面按钮均存在；点击正面喇叭后 flipped=false、controlsHidden=true；正常翻卡后 backSpeakerVisible=true
```

数据库现状说明：本轮修改前 `GET /api/cards` 已为 21 张，与任务描述的 22 张不一致；数据库 id 为 `[1,3,4,5,6,7,8,9,10,11,12,13,15,16,17,18,19,20,21,22,23]`。本轮不补造、不删除、不修改真实卡片，以修改后仍为 21 张作为数据未减少证据。

最终本地状态：`curl.exe -sS http://localhost:3001/api/cards` 解析后 `HTTP_CARD_COUNT=21`；`/` 与 `/speech.js` 均返回 HTTP 200；PID 29748 继续监听 `0.0.0.0:3001`，静态前端修改无需重启 Node 进程。浏览器控制台 error/warning 日志为空。本轮未连接 `<你的服务器IP>`，未执行部署、PM2 或线上数据库操作。

| 标准 | 状态 | 证据摘要 |
| --- | --- | --- |
| 1 API 新建与筛选 | 已验证 | curl 筛选响应包含 id=1 及 front/back 原文 |
| 2 SRS 升降箱 | 已验证 | `2 → 3 → 4`，再 `4 → 1` |
| 3 到期队列日期过滤 | 已验证 | 实际 ID `[2,3]`，明天 ID `4` 被排除 |
| 4 连续打卡 | 已验证 | 连续为 3，中断后为 1 |
| 5 手机无横向滚动 | 已验证 | Chrome 390×844：scrollWidth=375、viewport=390、底部导航 fixed 且在视口内；已截图 |
| 6 PWA manifest | 部分验证 | CDP `Page.getAppManifest` 返回 `errors: []`；公网 HTTP 下安装能力未验证 |
| 7 PM2 与公网 | 未完整验证 | PM2 online、本机 3001 返回 200；公网 3001 超时，阿里云安全组未放行 |

## Bootstrap Gates

产品、边界、first closed loop、确认技术栈和 one recommended mainline 均已记录，唯一产品真源为 `SPEC.md`。

## Framework Practice Gate

Express、SQLite 与原生 SPA 的职责边界已记录；不得引入 private competing architecture。

## Stop Conditions

七条 SPEC 验收逐项留下证据或明确说明无法验证的原因，临时产物完成清理后才可收口。

## Evidence Log

### 1. curl 卡片接口

```text
POST /api/cards
{"id":1,"skill":"听力","type":"听力误听","front":"Could not distinguish ship","back":"The correct word is sheep","note":"长短元音辨析","box":1,"next_review_date":"2026-09-04","created_at":"2026-09-04 06:23:48","last_reviewed_at":null,"review_count":0}
GET /api/cards?skill=听力
[{"id":1,"skill":"听力","type":"听力误听","front":"Could not distinguish ship","back":"The correct word is sheep","note":"长短元音辨析","box":1,"next_review_date":"2026-09-04","created_at":"2026-09-04 06:23:48","last_reviewed_at":null,"review_count":0}]
```

### 2-4. `npm test`

```text
✓ 旧库安全迁移断言通过：卡片 id=41 与复习日志 id=9 均保留；新增生词 id=42
✓ 新卡立即入队断言通过：新卡ID 1 已出现在队列 [1]
✓ 生词类型接口断言通过：新卡ID 2，type = 生词
✓ SRS升箱断言通过：2 → 3 → 4
✓ SRS降箱断言通过：4 → 1
✓ 日期过滤断言通过：实际队列ID [3, 2, 4]；今天/昨天ID [4, 3]；明天ID 5 已排除
✓ 连续3天断言通过：streak = 3
✓ 中断后重计断言通过：streak = 1（不是4）
全部 SRS、队列、类型迁移与连续打卡测试通过。
```

### 5. Chrome 移动视口

```json
{
  "viewportWidth": 390,
  "bodyScrollWidth": 375,
  "htmlScrollWidth": 375,
  "hasHorizontalOverflow": false,
  "navPosition": "fixed",
  "navRect": { "top": 759.5, "bottom": 830, "height": 70.5 }
}
```

### 6. PWA

Chrome CDP `Page.getAppManifest` 实际结果包含：

```json
{
  "url": "http://127.0.0.1:3101/manifest.json",
  "errors": [],
  "manifest": {
    "name": "雅思复习工具",
    "display": "kStandalone",
    "startUrl": "http://127.0.0.1:3101/"
  }
}
```

### 7. 部署

```text
│ 3 │ ielts-review-tool │ default │ N/A │ fork │ 223511 │ 37s │ 0 │ online │
exec cwd: /opt/ielts-review-tool
node.js version: 20.20.2
curl http://127.0.0.1:3001/ -> HTTP/1.1 200 OK
curl http://<你的服务器IP>:3000/ -> HTTP/1.1 200 OK
curl http://<你的服务器IP>:3001/ -> timeout after 8 seconds
```

服务器 INPUT 防火墙策略为 ACCEPT，3001 已监听；实例无 RAM role、浏览器未登录阿里云控制台，因此无法代为修改安全组。需在阿里云安全组入方向放行 TCP 3001 后复测公网 URL。

## Drift Checklist

- 产品仍是复习触发器，不是笔记工具。
- SRS 与统计语义只有服务端单一真源。
- UI 使用 SPEC 指定视觉语言。
- 部署不触碰其他 PM2 进程。

## Drift Lock

- 当前真源：`SPEC.md`
- 禁止范围扩张：登录、框架替换、额外提醒
- 停止条件：七项逐条报告且临时产物清理
