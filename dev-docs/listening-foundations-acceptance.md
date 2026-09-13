# 听力基础训练第一轮 · 本地验收交付

产品真源为根目录 SPEC.md 的 2026-09-12 第一轮章节。本文件仅记录实现边界、实际差异和命令证据，不修改产品规格。

## 尚待确认的规格冲突

专项拼写要求复用 `/api/practice/cards/:id/spelling`，同时要求用该次 `review_log_id` 标记错因。现有接口是只读自测，既不生成日志也不返回日志 id；本节又禁止改变这套后端逻辑。这三个条件无法同时满足。

本次已在对话中请求确认，未收到答复。当前保守实现保留只读专项自测，答错后提供“进入今日复习”入口；正式听力拼写/翻卡复习答错时可标记错因。**专项自测答错后的直接错因下拉尚未实现，因此不能把当前测试通过等同于整节规格无差异完成。** 未把自测结果偷偷写成正式复习日志。

本文件记录的是 2026-09-12 第一轮历史验收；其中枢纽入口数量已被 2026-09-13 最新 SPEC 取代，当前合同见 `acceptance.md` 的对应章节。

## 修改边界

- `src/domain/errorTypes.js` 是错因枚举唯一真源，经 `/api/foundations/meta` 提供给前端；拼写分类也由服务端单一提供。
- `cards` 普通加列 `source` / `spelling_category`；`review_logs`、`number_drill_attempts` 普通加列 `error_type`。`TYPES`、`migrateCardsTypeConstraint()` 未改动。
- 新建逐题明细表；批改汇总及明细、卡片收录及关联分别事务写入；收录强制 `real_error`，重复收录拒绝。删除已收录卡片将关联置空，保留原错题；删除练习记录级联删除其明细。
- `review()` / `reviewSpelling()` 增加 `review_log_id`，原判分和 SRS 规则保持。数字专项领域、页面和服务逻辑保持。
- 新增 `foundations.js` / `spelling.js`；首页唯一专项入口改为枢纽；真题结果与历史记录提供可收藏的 `#listening-attempt/<id>` 链接，刷新后仍可继续处理。既有隐藏真题主页的约束保留。
- 增加 `test_listening_foundations.js` 与 `scripts/test_foundations_browser.js`，接入 `npm test`。

## 旧测试的必要适配

不能声称所有旧文件“原样通过”：

1. 三个旧 CDP 配套脚本仅把首页直达数字页的路径更新为“首页 → 基础训练 → 数字专项”，其余业务断言保留。
2. `test_feedback.js` 原 `SELECT *` 迁移前后整行比较会把本轮明确新增的列视为差异。首次全量测试确实因此失败；现仅在预期值中补 `source='manual'`、`spelling_category=null` 和 `error_type=null`，仍然完整逐行比较全部原字段及新增字段。没有删除断言或修改用户真实库来迁就测试。

测试夹具和 CDP 脚本开发时也实际出现过外键插入顺序、语音 mock 类型、CDP 顶层 await 三种失败，均已修正。语音验收只 mock 系统语音边界；页面、HTTP、判分和数据库均真实运行，实际扬声器音质仍需用户试听。

## 本地运行

预览地址：`http://localhost:3001`。

数据库：`data/ielts-foundations-local.db`，由原 `data/ielts.db` 用 SQLite backup 复制，保留 39 张真实卡片，作为本地预览的持久运行数据保留，不含验收夹具。原始数据库保持只读、不迁移、不写入。用户在预览中的修改写入该副本。

启动命令：

```powershell
$env:PORT='3001'
$env:DB_PATH='D:\Codex工作区\ielts-review-tool\data\ielts-foundations-local.db'
node src/server.js
```

实际启动输出：

```text
IELTS Review Tool listening on http://0.0.0.0:3001
```

没有执行 git commit、git push、SSH、生产连接、部署或任何 PM2 命令。截图、日志、测试库和独立浏览器 profile 均在系统临时任务目录中生成；正式验收证据转录在本文件，临时原件在复核后清理。

## 最终命令与完整原始输出

以下由实际执行结果追加。新脚本打印的 `COMMAND: curl` 是实际 execFile 参数向量，每个参数用 JSON 编码展示；可直接运行 `node test_listening_foundations.js` 复现，无需手动处理 PowerShell 中文引号和换行转义。


### 1. ?????????curl?CDP

```powershell
npm.cmd test
```

```text

> ielts-review-tool@1.0.0 test
> node test_number_drill.js && node test_access_token.js && node test_feedback.js && node test_listening_foundations.js

✓ 1 日期生成：the twenty-first of March, twenty nineteen；序数词、年份、闰年断言通过
✓ 2 日期判分：三种指定格式、两位年份边界及错误日期通过
✓ 3 时间：quarter to four in the afternoon / 15:45；am/pm及拼读分支通过
✓ 4 金额：£29.99 自然语言精确匹配；无符号/单位容错、整数金额通过
✓ 5 手机号：07911234567 逐位朗读11段；空格容错和缺位错误通过
✓ 6 一般数字：固定生成4829；4829、4,829正确，4830错误
✓ 全角判分：五类别、全部指定全角标点/空格及混合输入通过；错数字、缺位/多位、非法日期/时间/金额仍判错
✓ 7 模板：10个入口均有模板；mixed确定性遍历9个具体subtype，类别与场景均匹配
TEST_SERVER=http://127.0.0.1:52073 PID=29888（随测试关闭）
curl POST /api/numbers/question → 201 {"questionId":"28404736-0cb5-40ae-ab81-70a1aa4477c1","spokenText":"Their wedding anniversary is on the seventeenth of February, nineteen sixty-one."}
curl POST /api/numbers/answer → 201 {"isCorrect":false,"correctAnswer":"1961-02-17","promptText":"Their wedding anniversary is on the seventeenth of February, nineteen sixty-one.","spokenText":"Their wedding anniversary is on the seventeenth of February, nineteen sixty-one."}
curl POST /api/numbers/answer → 400 {"error":"题目不存在、已作答或已过期"}
curl GET /api/numbers/mistakes → 200 [{"id":1,"mode":"dialogue","category":"date","subtype":"anniversary","prompt_text":"Their wedding anniversary is on the seventeenth of February, nineteen sixty-one.","spoken_text":"Their wedding anniversary is on the seventeenth of February, nineteen sixty-one.","correct_answer":"1961-02-17","user_answer":"wrong","is_correct":false,"exam_session_id":null,"attempted_at":"2026-09-09 05:00:00","error_type":null}]
curl POST /api/numbers/question → 201 {"questionId":"8f724968-32b2-4d4a-b429-7d5e96651b81","spokenText":"74"}
curl POST /api/numbers/answer → 201 {"isCorrect":true,"correctAnswer":"74","promptText":null,"spokenText":"74"}
curl GET /api/numbers/stats → 200 {"total":2,"correct":1,"accuracy":50,"byCategory":{"number":{"total":1,"correct":1,"accuracy":100},"date":{"total":1,"correct":0,"accuracy":0},"time":{"total":0,"correct":0,"accuracy":null},"money":{"total":0,"correct":0,"accuracy":null},"phone":{"total":0,"correct":0,"accuracy":null}}}
curl POST /api/numbers/exam/start → 201 {"examSessionId":"56a6a900-ee9f-4253-a580-9b8e8631ab4d"}
curl POST /api/numbers/question → 201 {"questionId":"197ab378-9d5a-4937-86d0-4e3e2ae81237","spokenText":"778123"}
curl POST /api/numbers/answer → 201 {"isCorrect":true,"correctAnswer":"778123","promptText":null,"spokenText":"778123"}
curl POST /api/numbers/question → 201 {"questionId":"f7853ba8-3d20-4ef4-a5a8-b5416bfb507f","spokenText":"the fourteenth of June, nineteen ninety-six"}
curl POST /api/numbers/answer → 201 {"isCorrect":true,"correctAnswer":"1996-06-14","promptText":null,"spokenText":"the fourteenth of June, nineteen ninety-six"}
curl POST /api/numbers/question → 201 {"questionId":"1c667c11-813d-44d0-abbd-2ef52ecb856b","spokenText":"twenty-five past eleven in the morning"}
curl POST /api/numbers/answer → 201 {"isCorrect":false,"correctAnswer":"11:25","promptText":null,"spokenText":"twenty-five past eleven in the morning"}
curl GET /api/numbers/exam/56a6a900-ee9f-4253-a580-9b8e8631ab4d/summary → 200 {"score":2,"total":3,"byCategory":{"number":{"score":1,"total":1,"accuracy":100},"date":{"score":1,"total":1,"accuracy":100},"time":{"score":0,"total":1,"accuracy":0},"money":{"score":0,"total":0,"accuracy":null},"phone":{"score":0,"total":0,"accuracy":null}}}
curl POST /api/numbers/answer → 400 {"error":"题目不存在、已作答或已过期"}
curl POST /api/numbers/question → 400 {"error":"对话测验类型无效"}
curl GET /api/numbers/mistakes?limit=0 → 400 {"error":"limit 必须是 1-100 的整数"}
✓ 8 curl HTTP：不泄题、一次性提交、原始输入、错题、50%统计、考试2/3、空答案及10分钟过期全部通过
curl POST /api/numbers/question → 201 {"questionId":"b2942456-fc98-4891-801d-dd47ef028ab1","spokenText":"ten to eight in the morning"}
curl POST /api/numbers/answer → 201 {"isCorrect":false,"correctAnswer":"07:50","promptText":null,"spokenText":"ten to eight in the morning"}
✓ 读法 curl：standalone time 返回自然语言 spokenText；number 同样返回 spokenText
curl POST /api/numbers/question → 201 {"questionId":"d59cadd5-50cd-4d6f-9a31-1872d4ecdd3e","spokenText":"twenty to nine in the morning"}
curl POST /api/numbers/answer → 201 {"isCorrect":true,"correctAnswer":"08:40","promptText":null,"spokenText":"twenty to nine in the morning"}
✓ 全角 curl：userAnswer=０８：４０，isCorrect=true；数据库保留原始全角输入
移动端 home: {"width":390,"scroll":390,"body":390}，截图已生成
颜色 date #FF6B6B 📅: rgb(255, 107, 107) = CSS变量渲染色
颜色 time #5B9DFF 🕐: rgb(91, 157, 255) = CSS变量渲染色
颜色 money #3CBE8B 💰: rgb(60, 190, 139) = CSS变量渲染色
颜色 phone #9C8CFB 📞: rgb(156, 140, 251) = CSS变量渲染色
颜色 mixed #8E8A94 🔀: rgb(142, 138, 148) = CSS变量渲染色
颜色 number #FF8A65 #: rgb(255, 138, 101) = CSS变量渲染色
颜色 money #3CBE8B 💰: rgb(60, 190, 139) = CSS变量渲染色
颜色 phone #9C8CFB 📞: rgb(156, 140, 251) = CSS变量渲染色
颜色 date #FF6B6B 🎂: rgb(255, 107, 107) = CSS变量渲染色
颜色 date #FF6B6B 👶: rgb(255, 107, 107) = CSS变量渲染色
颜色 date #FF6B6B ⏰: rgb(255, 107, 107) = CSS变量渲染色
颜色 date #FF6B6B 💍: rgb(255, 107, 107) = CSS变量渲染色
颜色 date #FF6B6B 🎬: rgb(255, 107, 107) = CSS变量渲染色
颜色 date #FF6B6B 📅: rgb(255, 107, 107) = CSS变量渲染色
颜色 number #FF8A65 #: rgb(255, 138, 101) = CSS变量渲染色
✓ 分类颜色变量、14个进阶/对话图标实色、独立数字橙及考试渐变断言通过
移动端 numbers: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 numbers-categories: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 numbers-320: {"width":320,"scroll":320,"body":320}，截图已生成
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"48"}
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"4829"}
✓ 读法 CDP standalone time 答错：ten to two in the afternoon
✓ 读法 CDP standalone time 答对：ten past six in the evening
✓ 读法 CDP standalone date 答错：the twenty-ninth of November, twenty fourteen
✓ 读法 CDP standalone date 答对：the first of December, two thousand and six
✓ 读法 CDP standalone money 答错：three hundred and thirty-two pounds
✓ 读法 CDP standalone money 答对：three hundred and twenty-five pounds
✓ 读法 CDP standalone phone 答错：无读法提示
✓ 读法 CDP standalone phone 答对：无读法提示
✓ 读法 CDP 一般数字：答后无读法提示
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"48"}
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"4829"}
移动端 practice: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 mistakes: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 stats: {"width":390,"scroll":390,"body":390}，截图已生成
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"48"}
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"4829"}
✓ 独立/对话/考试：真实坐标点击首次播放输入48，重播追加29得到4829，原输入节点/焦点/可编辑状态均保留
移动端 exam: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 summary: {"width":390,"scroll":390,"body":390}，截图已生成
✓ 10 Chrome移动端：5页及10个对话入口、提交前隐藏题干、数字朗读、无限练习、考试2次播放/20秒超时/1:2成绩、离页停止、390/320无横向滚动通过；真实设备发声待用户试听

> node test_srs.js
✓ 旧库安全迁移断言通过：卡片 id=41 与复习日志 id=9 均保留；新增生词 id=42
✓ front_audio 普通加列迁移断言通过：旧卡 id=41 保留且 front_audio = null
✓ 每日任务表迁移断言通过：daily_tasks 已创建，且 task_date + skill 唯一
✓ 写作记录表迁移断言通过：旧记录 id=7 保留，content 为 TEXT NOT NULL，历史空内容兼容为空字符串
✓ front_audio API 断言通过：front = "She often goes to a ______ near her house."；front_audio = "She often goes to a keep-fit studio near her house."
✓ 新卡立即入队断言通过：新卡ID 1 已出现在队列 [1]
✓ 生词类型接口断言通过：新卡ID 2，type = 生词
✓ SRS升箱断言通过：2 → 3 → 4
✓ SRS降箱断言通过：4 → 1
✓ 日期过滤断言通过：实际队列ID [3, 2, 4]；今天/昨天ID [4, 3]；明天ID 5 已排除
✓ 连续3天断言通过：streak = 3
✓ 中断后重计断言通过：streak = 1（不是4）
✓ 今日任务接口断言通过：只生成听力/阅读/口语 3 项；切换 false → true → false；历史写作行不返回
✓ 写作内容校验断言通过：不带 content 返回 400，空记录未写入
✓ 写作长度边界断言通过：5000 字成功，5001 字返回 400
✓ 写作完成接口断言通过：content 原文保存；最近7天完成 2 次 / 目标 1 次
✓ 每周写作明细断言通过：返回 2 条 completed_at + content，最新内容 = "Some people believe public transport should be free.\nI partly agree with this view."
✓ 每周复盘口径断言通过：每日任务听力 5/7、阅读 7/7、口语 6/7；四技能正确率 80%/33%/暂无/75%
✓ 纯数据响应断言通过：复盘响应只包含周期、任务、技能统计与写作次数
全部 SRS、三项每日任务、写作周记录与纯数据复盘测试通过。

> node test_spelling.js
✓ 公共判分复用断言通过：听力与卡片拼写均调用 src/domain/answerMatch.js
✓ review_mode 普通加列迁移断言通过：18张旧卡完整保留且全部默认 flip
✓ 提交前防泄露断言通过：拼写卡队列响应无 back 字段及 back 明文，保留仅供朗读的编码音源
✓ 拼写正确自动判分断言通过：" FILM " 命中 movie/film，box 2 → 3
✓ 拼写错误自动判分断言通过：box 4 → 1，响应 correct_answer = movie/film
✓ 普通 flip 回归断言通过：旧卡仍走翻卡接口并由第1箱升到第2箱

> node test_practice.js
✓ 自由练习范围断言通过：全部2张，今天已复习1张，拼写卡不泄露back明文
✓ 自由练习零落库断言通过：box=3→3, next=2026-09-07→2026-09-07, logs=0→0
✓ 单卡练习零落库断言通过：box=3→3, next=2026-09-07→2026-09-07, logs=0→0
✓ 正式复习回归通过：box=3→4, next=2026-09-07→2026-09-14, logs=0→1

> node test_speech.js
✓ front_audio 朗读断言通过：speak 文本 = "She often goes to a keep-fit studio near her house."，不是 front = "She often goes to a ______ near her house."
✓ 旧卡向后兼容断言通过：front_audio 为 null 时 speak 文本回退为 front = "identify the different species of butterflies"
✓ 拼写模式朗读断言通过：DOM不含back明文，点击喇叭时 speak 文本 = "movie/film"
✓ 连续点击断言通过：第二次朗读再次先调用 cancel，没有排队叠加
✓ 显示规则断言通过：纯中文“无处不在的”不生成喇叭；英文“ubiquitous”生成喇叭
✓ 语音降级断言通过：无 en-GB 时选择 en-US；没有英文语音时安全返回且不朗读
全部朗读功能测试通过。

> node test_ui.js
✓ note 动态标签断言通过：任意技能+句子对照均显示“错因（选填）”，其他类型显示“备注（选填）”
✓ 写作录入 UI 合同断言通过：展开 textarea、取消、空内容拦截、携带 content 提交及周记录渲染均存在
✓ front_audio 可见渲染合同断言通过：只在录入/编辑 textarea 回显，卡片库与复习正面只渲染 front
✓ 拼写模式 UI 合同断言通过：表单开关、专用复习表单、背面朗读及提交前不渲染back均存在
✓ 自由/单卡练习 UI 合同通过：清空入口、范围选择、卡片库点击和拼写只读提交路径均存在
✓ 听力练习 UI 合同断言通过：默认展示原文挖空、提交answers后原地展示自动判分，完整原文/答案仍可隐藏查看，5项表单保留
全部字段标签 UI 规则测试通过。

> node test_listening.js
✓ 真实原文挖空断言通过：blank number = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]，换行边界只挖掉 egg
✓ 多选一答案领域断言通过：Q6 填 movie 或 film 均为 10/10
✓ 听力试运行数据合同断言通过：共 4 个 Part，Section = [1, 2, 3, 4]
✓ 音频静态路由断言通过：HTTP 200，Content-Type = audio/mpeg
✓ 错题与容错断言通过：" Egg " 判对；Q2 判错并返回 correct_answer = tower；总分 9/10
✓ 单条达标记录断言通过：Section2 仍为 locked，Section1 连续达标 1/3
✓ 阶段解锁断言通过：Section1 最近3条均达标后，Section2 locked → unlocked
✓ checklist 不达标断言通过：自动判分 10/10 但只勾4项，qualified=false，Section3 未误解锁
✓ 分数阈值断言通过：6/10 即使5项全勾也不达标
✓ HTML 解析器断言通过：只提取 Test1 Part1-4，并分离标题、原文与答案
全部听力真题练习模块测试通过。
✓ 9 六套回归通过；真实库39张卡片及全部既有业务表逐行前后不变（18张旧卡迁移由test_spelling覆盖）
全部数字听力10项验收通过。
测试服务器已关闭，临时数据库/profile已清理；PID=29888 即将自然退出
curl GET /api/cards [无口令] → 401 {"error":"未授权"}
curl POST /api/cards [无口令] → 401 {"error":"未授权"}
curl PUT /api/cards/1 [无口令] → 401 {"error":"未授权"}
curl DELETE /api/cards/1 [无口令] → 401 {"error":"未授权"}
curl POST /api/numbers/question [无口令] → 401 {"error":"未授权"}
curl OPTIONS /api/unknown [无口令] → 401 {"error":"未授权"}
curl POST /api/cards [无口令] → 401 {"error":"未授权"}
curl GET /api/cards [错误口令] → 401 {"error":"未授权"}
curl POST /api/cards [错误口令] → 401 {"error":"未授权"}
curl PUT /api/cards/1 [错误口令] → 401 {"error":"未授权"}
curl DELETE /api/cards/1 [错误口令] → 401 {"error":"未授权"}
curl POST /api/numbers/question [错误口令] → 401 {"error":"未授权"}
curl OPTIONS /api/unknown [错误口令] → 401 {"error":"未授权"}
curl POST /api/cards [错误口令] → 401 {"error":"未授权"}
curl POST /api/cards [正确口令] → 201 {"id":1,"skill":"听力","type":"生词","front":"access fixture","front_audio":null,"back":"test","review_mode":"flip","note":null,"box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:01","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":null}
curl GET /api/cards [正确口令] → 200 [{"id":1,"skill":"听力","type":"生词","front":"access fixture","front_audio":null,"back":"test","review_mode":"flip","note":null,"box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:01","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":null}]
curl PUT /api/cards/1 [正确口令] → 200 {"id":1,"skill":"听力","type":"生词","front":"access fixture","front_audio":null,"back":"test","review_mode":"flip","note":null,"box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:01","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":null}
curl DELETE /api/cards/1 [正确口令] → 204 
curl GET / [无口令] → 200 (静态资源响应体已收到)
curl GET /styles.css [无口令] → 200 (静态资源响应体已收到)
curl GET /app.js [无口令] → 200 (静态资源响应体已收到)
curl GET /numbers.js [无口令] → 200 (静态资源响应体已收到)
curl GET /manifest.json [无口令] → 200 (静态资源响应体已收到)
curl GET /sw.js [无口令] → 200 (静态资源响应体已收到)
CDP 首次401：单一全屏口令框、自动聚焦、localStorage为空，移动布局 {"width":390,"scroll":390,"dialog":"rgb(253, 246, 242)"}
CDP 错误口令：重试401后清除localStorage并重新提示
CDP 正确口令：真实键盘/鼠标输入，localStorage保存，失败GET自动重试且首页渲染
CDP 刷新记忆：3个API请求均携带正确X-Access-Token，不再弹框
CDP 过期口令POST：清旧值后输入并重试，method/body保留 {"mode":"standalone","category":"number"}，练习页成功显示
全部访问口令真实CDP浏览器验收通过。
全部访问口令curl及浏览器验收通过。
访问口令测试服务器已关闭，临时数据库/profile已清理，即将自然退出。
curl GET /api/tasks/today → 200 [{"id":43,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":1,"name":"听力","skill":"听力"},{"id":44,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":2,"name":"阅读","skill":"阅读"},{"id":45,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":3,"name":"口语","skill":"口语"}]
✓ 迁移：默认三项顺序/状态不变，旧任务ID/完成时间及历史写作保留，重复启动/访问幂等
curl GET /api/tasks/templates → 200 [{"id":1,"name":"听力","sort_order":1,"active":1,"created_at":"2026-09-13 06:27:10"},{"id":2,"name":"阅读","sort_order":2,"active":1,"created_at":"2026-09-13 06:27:10"},{"id":3,"name":"口语","sort_order":3,"active":1,"created_at":"2026-09-13 06:27:10"}]
curl POST /api/tasks/templates → 400 {"error":"任务名不能为空"}
curl POST /api/tasks/templates → 400 {"error":"任务名不能为空"}
curl POST /api/tasks/templates → 400 {"error":"任务名不能为空"}
curl POST /api/tasks/templates → 201 {"id":4,"name":"精读一篇文章","sort_order":4,"active":1,"created_at":"2026-09-10 12:00:00"}
curl GET /api/tasks/today → 200 [{"id":43,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":1,"name":"听力","skill":"听力"},{"id":44,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":2,"name":"阅读","skill":"阅读"},{"id":45,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":3,"name":"口语","skill":"口语"},{"id":55,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":4,"name":"精读一篇文章","skill":"精读一篇文章"}]
curl POST /api/tasks/55/toggle → 200 {"id":55,"task_date":"2026-09-10","done":true,"completed_at":"2026-09-10 12:00:00","task_template_id":4,"name":"精读一篇文章","skill":"精读一篇文章"}
curl POST /api/tasks/55/toggle → 200 {"id":55,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":4,"name":"精读一篇文章","skill":"精读一篇文章"}
curl POST /api/tasks/55/toggle → 200 {"id":55,"task_date":"2026-09-10","done":true,"completed_at":"2026-09-10 12:00:00","task_template_id":4,"name":"精读一篇文章","skill":"精读一篇文章"}
curl GET /api/stats/weekly → 200 {"period":{"start":"2026-09-04","end":"2026-09-10","days":7},"dailyTasks":{"听力":{"completedDays":1,"targetDays":7},"阅读":{"completedDays":0,"targetDays":7},"口语":{"completedDays":0,"targetDays":7},"精读一篇文章":{"completedDays":2,"targetDays":7}},"skills":{"听力":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"阅读":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"口语":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"写作":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0}},"writing":{"completed":0,"target":1,"records":[]}}
curl PUT /api/tasks/templates/4 → 200 {"id":4,"name":"精读并摘录","sort_order":4,"active":1,"created_at":"2026-09-10 12:00:00"}
curl GET /api/stats/weekly → 200 {"period":{"start":"2026-09-04","end":"2026-09-10","days":7},"dailyTasks":{"听力":{"completedDays":1,"targetDays":7},"阅读":{"completedDays":0,"targetDays":7},"口语":{"completedDays":0,"targetDays":7},"精读并摘录":{"completedDays":2,"targetDays":7}},"skills":{"听力":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"阅读":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"口语":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"写作":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0}},"writing":{"completed":0,"target":1,"records":[]}}
curl DELETE /api/tasks/templates/4 → 204 
curl GET /api/tasks/today → 200 [{"id":43,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":1,"name":"听力","skill":"听力"},{"id":44,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":2,"name":"阅读","skill":"阅读"},{"id":45,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":3,"name":"口语","skill":"口语"}]
curl GET /api/stats/weekly → 200 {"period":{"start":"2026-09-04","end":"2026-09-10","days":7},"dailyTasks":{"听力":{"completedDays":1,"targetDays":7},"阅读":{"completedDays":0,"targetDays":7},"口语":{"completedDays":0,"targetDays":7},"精读并摘录":{"completedDays":1,"targetDays":7}},"skills":{"听力":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"阅读":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"口语":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"写作":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0}},"writing":{"completed":0,"target":1,"records":[]}}
curl POST /api/tasks/55/toggle → 404 {"error":"每日任务不存在"}
curl PUT /api/tasks/templates/4 → 404 {"error":"任务模板不存在"}
curl DELETE /api/tasks/templates/no-id → 400 {"error":"无效的任务模板 id"}
curl DELETE /api/tasks/templates/1 → 204 
curl DELETE /api/tasks/templates/2 → 204 
curl DELETE /api/tasks/templates/3 → 204 
curl GET /api/tasks/today → 200 []
✓ 模板增删改/勾选/取消、历史改名与删除保留、重复名称无漏项、特殊名称、全删不补种及次日不生成通过
curl GET /api/listening/overview → 200 {"stages":[{"sectionNumber":1,"unlocked":true,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[]},{"sectionNumber":2,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[]},{"sectionNumber":3,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[]},{"sectionNumber":4,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[]}]}
移动端 feedback-home: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 feedback-editor: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 feedback-weekly: {"width":390,"scroll":390,"body":390}，截图已生成
CDP 今日任务：真实鼠标添加、改名、勾选、复盘展示和删除通过
移动端 feedback-free: {"width":390,"scroll":390,"body":390}，截图已生成
CDP 自由练习：进入、拼写提交、下一张、翻卡及完成页提示持续可见
移动端 feedback-single-flip: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 feedback-single-spelling: {"width":390,"scroll":390,"body":390}，截图已生成
CDP 单卡练习：卡片库真实点击、翻卡/拼写提交和完成页提示持续可见；正式复习无提示
CDP 真题入口：首页、导航、各可达页面无入口，旧导航目标回到首页，控制台异常0
全部三项反馈真实CDP浏览器验收通过。
✓ 浏览器自由/单卡练习前后卡片及SRS完全不变，review_logs=0
curl GET /api/listening/overview → 200 {"stages":[{"sectionNumber":1,"unlocked":true,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[{"id":1,"section_number":1,"title":"Children’s Engineering Workshops","audio_path":"/listening-audio/Test1_Part1.mp3","source_book":"剑16","test_number":1,"latest_attempt_id":null,"latest_attempt_date":null,"latest_score_correct":null,"latest_score_total":null}]},{"sectionNumber":2,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[{"id":2,"section_number":2,"title":"Stevenson’s site","audio_path":"/listening-audio/Test1_Part2.mp3","source_book":"剑16","test_number":1,"latest_attempt_id":null,"latest_attempt_date":null,"latest_score_correct":null,"latest_score_total":null}]},{"sectionNumber":3,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[{"id":3,"section_number":3,"title":"Art Projects","audio_path":"/listening-audio/Test1_Part3.mp3","source_book":"剑16","test_number":1,"latest_attempt_id":null,"latest_attempt_date":null,"latest_score_correct":null,"latest_score_total":null}]},{"sectionNumber":4,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[{"id":4,"section_number":4,"title":"Stoicism","audio_path":"/listening-audio/Test1_Part4.mp3","source_book":"剑16","test_number":1,"latest_attempt_id":null,"latest_attempt_date":null,"latest_score_correct":null,"latest_score_total":null}]}]}
✓ 真实库副本迁移：39张卡片、22条旧任务、写作及全部听力/数字数据逐行不变；integrity_check=ok，foreign_key_check=[]
全部三项用户反馈验收通过。
反馈测试服务器/浏览器已关闭，临时数据库/profile已清理，即将自然退出。
MIGRATION: rebuildCalls=0; rootpage=2 unchanged; sentinel retained; cards_new absent; source default='manual'; nullable error_type columns present
PRESERVED_ROWS=[{"id":41,"front_audio":"Original audio one","review_mode":"spelling","source":"manual"},{"id":42,"front_audio":"Original audio two","review_mode":"spelling","source":"manual"}]
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u542c\\u529b\\u8bef\\u542c\",\"front\":\"context\",\"back\":\"answer\",\"note\":\"my error\"}"
{"id":43,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:27","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":null}
201
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u540c\\u4e49\\u66ff\\u6362\",\"front\":\"context\",\"back\":\"answer\",\"note\":\"my error\",\"source\":\"real_error\"}"
{"id":44,"skill":"听力","type":"同义替换","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:27","last_reviewed_at":null,"review_count":0,"source":"real_error","spelling_category":null}
201
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u540c\\u4e49\\u66ff\\u6362\",\"front\":\"context\",\"back\":\"answer\",\"note\":\"my error\",\"source\":\"ielts_material\"}"
{"id":45,"skill":"听力","type":"同义替换","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:28","last_reviewed_at":null,"review_count":0,"source":"ielts_material","spelling_category":null}
201
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u540c\\u4e49\\u66ff\\u6362\",\"front\":\"context\",\"back\":\"answer\",\"note\":\"my error\",\"source\":\"ai_generated\"}"
{"id":46,"skill":"听力","type":"同义替换","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:28","last_reviewed_at":null,"review_count":0,"source":"ai_generated","spelling_category":null}
201
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u542c\\u529b\\u8bef\\u542c\",\"front\":\"context\",\"back\":\"answer\",\"note\":\"my error\",\"source\":\"bad\"}"
{"error":"卡片来源无效"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u542c\\u529b\\u8bef\\u542c\",\"front\":\"context\",\"back\":\"answer\",\"note\":\"my error\",\"source\":null}"
{"error":"卡片来源无效"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u542c\\u529b\\u8bef\\u542c\",\"front\":\"context\",\"back\":\"answer\",\"note\":\"my error\",\"spelling_category\":\"letter\"}"
{"error":"拼写分类无效，只有拼写测试卡片可设置分类"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u542c\\u529b\\u8bef\\u542c\",\"front\":\"context\",\"back\":\"answer\",\"note\":\"my error\",\"review_mode\":\"spelling\",\"spelling_category\":\"bad\"}"
{"error":"拼写分类无效，只有拼写测试卡片可设置分类"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/review/43" "-H" "Content-Type: application/json" "--data-binary" "{\"result\":\"incorrect\"}"
{"id":43,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":1,"next_review_date":"2026-09-13","created_at":"2026-09-12 23:27:27","last_reviewed_at":"2026-09-12 23:27:28","review_count":1,"source":"manual","spelling_category":null,"review_log_id":100}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/review/logs/100/error-type" "-H" "Content-Type: application/json" "--data-binary" "{\"error_type\":\"SPELLING\"}"
{"id":100,"card_id":43,"reviewed_at":"2026-09-12 23:27:28","result":"incorrect","box_before":1,"box_after":1,"error_type":"SPELLING"}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/review/logs/100/error-type" "-H" "Content-Type: application/json" "--data-binary" "{\"error_type\":null}"
{"id":100,"card_id":43,"reviewed_at":"2026-09-12 23:27:28","result":"incorrect","box_before":1,"box_after":1,"error_type":null}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/review/logs/100/error-type" "-H" "Content-Type: application/json" "--data-binary" "{\"error_type\":\"BAD\"}"
{"error":"错因必须是有效枚举或 null"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/review/logs/100/error-type" "-H" "Content-Type: application/json" "--data-binary" "{}"
{"error":"错因必须是有效枚举或 null"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/review/43" "-H" "Content-Type: application/json" "--data-binary" "{\"result\":\"correct\"}"
{"id":43,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":2,"next_review_date":"2026-09-14","created_at":"2026-09-12 23:27:27","last_reviewed_at":"2026-09-12 23:27:28","review_count":2,"source":"manual","spelling_category":null,"review_log_id":101}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/review/logs/101/error-type" "-H" "Content-Type: application/json" "--data-binary" "{\"error_type\":\"SPELLING\"}"
{"error":"只能标记答错的复习记录"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/review/logs/999999/error-type" "-H" "Content-Type: application/json" "--data-binary" "{\"error_type\":null}"
{"error":"复习记录不存在"}
404
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/listening/sections/1/attempts" "-H" "Content-Type: application/json" "--data-binary" "{\"answers\":{\"1\":\"flower\",\"2\":\"September\"},\"check_gist\":false,\"check_key_sentences\":false,\"check_paraphrase\":false,\"check_redo_improved\":false,\"check_retention\":false}"
{"attempt":{"id":1,"section_id":1,"attempt_date":"2026-09-12","score_correct":1,"score_total":2,"check_gist":0,"check_key_sentences":0,"check_paraphrase":0,"check_redo_improved":0,"check_retention":0,"notes":null,"qualified":false},"grading":[{"number":1,"user_answer":"flower","correct":false,"correct_answer":"tower","accepted_answers":["tower"]},{"number":2,"user_answer":"September","correct":true,"correct_answer":"September","accepted_answers":["September"]}],"score_correct":1,"score_total":2,"stages":[{"sectionNumber":1,"unlocked":true,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":1},{"sectionNumber":2,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0},{"sectionNumber":3,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0},{"sectionNumber":4,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0}]}
201
COMMAND: curl "-sS" "--max-time" "10" "-X" "GET" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/listening/attempts/1/items"
[{"id":1,"attempt_id":1,"question_number":1,"user_answer":"flower","correct_answer":"tower","is_correct":0,"error_type":null,"collected_card_id":null,"context":"The answer is tower . It opens in September ."},{"id":2,"attempt_id":1,"question_number":2,"user_answer":"September","correct_answer":"September","is_correct":1,"error_type":null,"collected_card_id":null,"context":"The answer is tower . It opens in September ."}]
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/listening/attempts/1/items/1/error-type" "-H" "Content-Type: application/json" "--data-binary" "{\"error_type\":\"SOUND_RECOGNITION\"}"
{"id":1,"attempt_id":1,"question_number":1,"user_answer":"flower","correct_answer":"tower","is_correct":0,"error_type":"SOUND_RECOGNITION","collected_card_id":null}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/listening/attempts/1/items/2/error-type" "-H" "Content-Type: application/json" "--data-binary" "{\"error_type\":\"SPELLING\"}"
{"error":"只能处理错题"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/listening/attempts/1/items/1/error-type" "-H" "Content-Type: application/json" "--data-binary" "{\"error_type\":\"bad\"}"
{"error":"错因必须是有效枚举或 null"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/listening/attempts/1/items/1/error-type" "-H" "Content-Type: application/json" "--data-binary" "{\"error_type\":null}"
{"id":1,"attempt_id":1,"question_number":1,"user_answer":"flower","correct_answer":"tower","is_correct":0,"error_type":null,"collected_card_id":null}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/listening/attempts/1/items/2/collect" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u542c\\u529b\\u8bef\\u542c\",\"front\":\"context\",\"back\":\"answer\",\"note\":\"my error\"}"
{"error":"只能处理错题"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/listening/attempts/1/items/1/collect" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u542c\\u529b\\u8bef\\u542c\",\"front\":\"\",\"back\":\"answer\",\"note\":\"my error\"}"
{"error":"正面不能为空"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/listening/attempts/1/items/1/collect" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u542c\\u529b\\u8bef\\u542c\",\"front\":\"context\",\"back\":\"answer\",\"note\":\"my error\",\"source\":\"ai_generated\"}"
{"id":47,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:28","last_reviewed_at":null,"review_count":0,"source":"real_error","spelling_category":null}
201
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/listening/attempts/1/items/1/collect" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u542c\\u529b\\u8bef\\u542c\",\"front\":\"context\",\"back\":\"answer\",\"note\":\"my error\"}"
{"error":"这道错题已经收录"}
400
COMMAND: curl "-sS" "--max-time" "10" "-X" "GET" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards"
[{"id":47,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:28","last_reviewed_at":null,"review_count":0,"source":"real_error","spelling_category":null},{"id":46,"skill":"听力","type":"同义替换","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:28","last_reviewed_at":null,"review_count":0,"source":"ai_generated","spelling_category":null},{"id":45,"skill":"听力","type":"同义替换","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:28","last_reviewed_at":null,"review_count":0,"source":"ielts_material","spelling_category":null},{"id":44,"skill":"听力","type":"同义替换","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:27","last_reviewed_at":null,"review_count":0,"source":"real_error","spelling_category":null},{"id":43,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"answer","review_mode":"flip","note":"my error","box":2,"next_review_date":"2026-09-14","created_at":"2026-09-12 23:27:27","last_reviewed_at":"2026-09-12 23:27:28","review_count":2,"source":"manual","spelling_category":null},{"id":42,"skill":"听力","type":"听力误听","front":"原卡2","front_audio":"Original audio two","back":"second","review_mode":"spelling","note":null,"box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 09:00:00","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":null},{"id":41,"skill":"听力","type":"听力误听","front":"原卡1","front_audio":"Original audio one","back":"original","review_mode":"spelling","note":null,"box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 09:00:00","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":null}]
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "GET" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/listening/attempts/1/items"
[{"id":1,"attempt_id":1,"question_number":1,"user_answer":"flower","correct_answer":"tower","is_correct":0,"error_type":null,"collected_card_id":47,"context":"The answer is tower . It opens in September ."},{"id":2,"attempt_id":1,"question_number":2,"user_answer":"September","correct_answer":"September","is_correct":1,"error_type":null,"collected_card_id":null,"context":"The answer is tower . It opens in September ."}]
200
TRANSACTIONS: grading/collection rollback verified; duplicate blocked; card deletion keeps item; attempt deletion cascades items
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards" "-H" "Content-Type: application/json" "--data-binary" "{\"skill\":\"\\u542c\\u529b\",\"type\":\"\\u542c\\u529b\\u8bef\\u542c\",\"front\":\"context\",\"back\":\"A\",\"note\":\"my error\",\"review_mode\":\"spelling\",\"spelling_category\":\"letter\"}"
{"id":48,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"A","review_mode":"spelling","note":"my error","box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:27:28","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":"letter"}
201
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/practice/cards/48/spelling" "-H" "Content-Type: application/json" "--data-binary" "{\"answer\":\"wrong\"}"
{"correct":false,"correct_answer":"A"}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "POST" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/review/48/spelling" "-H" "Content-Type: application/json" "--data-binary" "{\"answer\":\"wrong\"}"
{"correct":false,"result":"incorrect","correct_answer":"A","box_before":1,"box_after":1,"review_log_id":102,"next_review_date":"2026-09-13"}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/review/logs/102/error-type" "-H" "Content-Type: application/json" "--data-binary" "{\"error_type\":\"SPELLING\"}"
{"id":102,"card_id":48,"reviewed_at":"2026-09-12 23:27:29","result":"incorrect","box_before":1,"box_after":1,"error_type":"SPELLING"}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "GET" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/spelling/cards?mistakes=true"
[{"id":48,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"review_mode":"spelling","note":"my error","box":1,"next_review_date":"2026-09-13","created_at":"2026-09-12 23:27:28","last_reviewed_at":"2026-09-12 23:27:29","review_count":1,"source":"manual","spelling_category":"letter","spelling_audio":"QQ=="},{"id":42,"skill":"听力","type":"听力误听","front":"原卡2","front_audio":"Original audio two","review_mode":"spelling","note":null,"box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 09:00:00","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":null,"spelling_audio":"c2Vjb25k"},{"id":41,"skill":"听力","type":"听力误听","front":"原卡1","front_audio":"Original audio one","review_mode":"spelling","note":null,"box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 09:00:00","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":null,"spelling_audio":"b3JpZ2luYWw="}]
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards/48" "-H" "Content-Type: application/json" "--data-binary" "{\"note\":\"updated\"}"
{"id":48,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"A","review_mode":"spelling","note":"updated","box":4,"next_review_date":"2026-09-19","created_at":"2026-09-12 23:27:28","last_reviewed_at":"2026-09-12 23:27:29","review_count":2,"source":"manual","spelling_category":"letter"}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards/48" "-H" "Content-Type: application/json" "--data-binary" "{\"review_mode\":\"flip\",\"spelling_category\":null}"
{"id":48,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"A","review_mode":"flip","note":"updated","box":4,"next_review_date":"2026-09-19","created_at":"2026-09-12 23:27:28","last_reviewed_at":"2026-09-12 23:27:29","review_count":2,"source":"manual","spelling_category":null}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:55750/api/cards/48" "-H" "Content-Type: application/json" "--data-binary" "{\"review_mode\":\"spelling\",\"spelling_category\":\"letter\"}"
{"id":48,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"A","review_mode":"spelling","note":"updated","box":4,"next_review_date":"2026-09-19","created_at":"2026-09-12 23:27:28","last_reviewed_at":"2026-09-12 23:27:29","review_count":2,"source":"manual","spelling_category":"letter"}
200
PERSISTENCE: reopened database retains answer items; spelling practice is read-only; category/latest-log filters asserted
CDP_FOUNDATIONS=[旧版枢纽输出已被 2026-09-13 最新 SPEC 作废；当前四入口证据见 acceptance.md]
CDP_SCREENSHOT foundations-390: {"width":390,"scroll":390,"body":390}
CDP_NAV: [旧版枢纽导航证据已被 2026-09-13 最新 SPEC 作废]
CDP_SPELLING_CATEGORIES=["A · 字母→","B · 人名地名→","C · 星期月份日期→","D · 高频答案词→","E · 高频场景词→","我的错词 →"]
CDP_SCREENSHOT spelling-390: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT spelling-before-play: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT spelling-answer-390: {"width":390,"scroll":390,"body":390}
CDP_SPELLING: actual mouse play -> speechSynthesis.speak("A"); keyboard answer -> read-only practice; correct answer displayed; card/logs unchanged
CDP_MY_MISTAKES: recently incorrect spelling card rendered, id=48
CDP_SCREENSHOT foundations-320: {"width":320,"scroll":320,"body":320}
CDP_SCREENSHOT spelling-320: {"width":320,"scroll":320,"body":320}
CDP_SCREENSHOT foundations-390: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT spelling-390: {"width":390,"scroll":390,"body":390}
CDP_ENTRY: category hidden for flip; five optional categories for spelling; existing category restored on edit
CDP_FLIP: listening incorrect has optional error picker; skip advances to completion
CDP_REVIEW: listening spelling incorrect -> PUT SPELLING saved; other three skills -> no error picker
CDP_SCREENSHOT collect-form-390: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT listening-items-390: {"width":390,"scroll":390,"body":390}
CDP_LISTENING: bookmarked result survives reload; wrong-only picker PUT saved; editable context/back/note/type defaults; collected source=real_error; duplicate button disabled after reload
CDP_EXCEPTIONS=[]; FOUNDATIONS_BROWSER=PASS
FOUNDATIONS_ACCEPTANCE=PASS; integrity_check=ok; foreign_key_check=[]
CLEANUP: local test server closed; temporary database/browser profile/screenshots removed

NPM_TEST_EXIT=0
```

### 2. ???????????

```text
REAL_DATABASE_UNCHANGED={"cards":39,"daily_tasks":22,"listening_attempts":0,"listening_sections":4,"listening_tests":1,"number_drill_attempts":8,"review_logs":121,"writing_completions":1}
PREVIEW_CARDS=39; ALL_ORIGINAL_CARD_FIELDS_UNCHANGED; source=manual; integrity_check=ok
SOURCE_BOUNDARIES=PASS: TYPES, migrateCardsTypeConstraint, number domain/UI, SRS domain, gradePracticeSpelling unchanged byte-for-byte (normalized line endings)
```

### 3. ?? HTTP ??

```text
curl.exe -sS -o NUL -w LOCAL_ROOT_HTTP=%{http_code}\n http://127.0.0.1:3001/
LOCAL_ROOT_HTTP=200

```

```text
curl.exe -sS http://127.0.0.1:3001/api/foundations/meta
{"errorTypes":{"UNKNOWN_WORD":"生词/词汇量","SOUND_RECOGNITION":"听音辨识","SPELLING":"拼写","SENTENCE_COMPREHENSION":"原文理解","PARAPHRASE":"同义替换","DISTRACTOR":"干扰信息","PREDICTION":"答案预测","LOST_POSITION":"跟丢位置","OTHER":"其他"},"spellingCategories":{"letter":"字母","name_place":"人名地名","calendar":"星期月份日期","high_freq_answer":"高频答案词","scene_word":"高频场景词"}}
```

```text
curl.exe -sS http://127.0.0.1:3001/api/spelling/cards?category=letter
[]
```

### 4. ????????????????

????????????????????????????

```text

> ielts-review-tool@1.0.0 test
> node test_number_drill.js && node test_access_token.js && node test_feedback.js && node test_listening_foundations.js

✓ 1 日期生成：the twenty-first of March, twenty nineteen；序数词、年份、闰年断言通过
✓ 2 日期判分：三种指定格式、两位年份边界及错误日期通过
✓ 3 时间：quarter to four in the afternoon / 15:45；am/pm及拼读分支通过
✓ 4 金额：£29.99 自然语言精确匹配；无符号/单位容错、整数金额通过
✓ 5 手机号：07911234567 逐位朗读11段；空格容错和缺位错误通过
✓ 6 一般数字：固定生成4829；4829、4,829正确，4830错误
✓ 全角判分：五类别、全部指定全角标点/空格及混合输入通过；错数字、缺位/多位、非法日期/时间/金额仍判错
✓ 7 模板：10个入口均有模板；mixed确定性遍历9个具体subtype，类别与场景均匹配
TEST_SERVER=http://127.0.0.1:53385 PID=25828（随测试关闭）
curl POST /api/numbers/question → 201 {"questionId":"23697974-1f70-46b1-be64-be0119cf880a","spokenText":"The film will be released on the nineteenth of February, nineteen eighty-eight."}
curl POST /api/numbers/answer → 201 {"isCorrect":false,"correctAnswer":"1988-02-19","promptText":"The film will be released on the nineteenth of February, nineteen eighty-eight.","spokenText":"The film will be released on the nineteenth of February, nineteen eighty-eight."}
curl POST /api/numbers/answer → 400 {"error":"题目不存在、已作答或已过期"}
curl GET /api/numbers/mistakes → 200 [{"id":1,"mode":"dialogue","category":"date","subtype":"movie_release","prompt_text":"The film will be released on the nineteenth of February, nineteen eighty-eight.","spoken_text":"The film will be released on the nineteenth of February, nineteen eighty-eight.","correct_answer":"1988-02-19","user_answer":"wrong","is_correct":false,"exam_session_id":null,"attempted_at":"2026-09-09 05:00:00","error_type":null}]
curl POST /api/numbers/question → 201 {"questionId":"e48cfa6a-b0c3-42e3-a7d4-4dd17328b692","spokenText":"217"}
curl POST /api/numbers/answer → 201 {"isCorrect":true,"correctAnswer":"217","promptText":null,"spokenText":"217"}
curl GET /api/numbers/stats → 200 {"total":2,"correct":1,"accuracy":50,"byCategory":{"number":{"total":1,"correct":1,"accuracy":100},"date":{"total":1,"correct":0,"accuracy":0},"time":{"total":0,"correct":0,"accuracy":null},"money":{"total":0,"correct":0,"accuracy":null},"phone":{"total":0,"correct":0,"accuracy":null}}}
curl POST /api/numbers/exam/start → 201 {"examSessionId":"c148a2a7-8650-4468-a7dc-c1cae053356e"}
curl POST /api/numbers/question → 201 {"questionId":"7e9d1f34-f473-4943-b113-947da7c41bb5","spokenText":"32"}
curl POST /api/numbers/answer → 201 {"isCorrect":true,"correctAnswer":"32","promptText":null,"spokenText":"32"}
curl POST /api/numbers/question → 201 {"questionId":"2831a757-301f-4935-b3c2-fd2c390552d1","spokenText":"the twenty-sixth of February, nineteen sixty-seven"}
curl POST /api/numbers/answer → 201 {"isCorrect":true,"correctAnswer":"1967-02-26","promptText":null,"spokenText":"the twenty-sixth of February, nineteen sixty-seven"}
curl POST /api/numbers/question → 201 {"questionId":"f1b0ec3d-25d0-4f0f-bfde-751e5525456e","spokenText":"twenty past ten in the evening"}
curl POST /api/numbers/answer → 201 {"isCorrect":false,"correctAnswer":"22:20","promptText":null,"spokenText":"twenty past ten in the evening"}
curl GET /api/numbers/exam/c148a2a7-8650-4468-a7dc-c1cae053356e/summary → 200 {"score":2,"total":3,"byCategory":{"number":{"score":1,"total":1,"accuracy":100},"date":{"score":1,"total":1,"accuracy":100},"time":{"score":0,"total":1,"accuracy":0},"money":{"score":0,"total":0,"accuracy":null},"phone":{"score":0,"total":0,"accuracy":null}}}
curl POST /api/numbers/answer → 400 {"error":"题目不存在、已作答或已过期"}
curl POST /api/numbers/question → 400 {"error":"对话测验类型无效"}
curl GET /api/numbers/mistakes?limit=0 → 400 {"error":"limit 必须是 1-100 的整数"}
✓ 8 curl HTTP：不泄题、一次性提交、原始输入、错题、50%统计、考试2/3、空答案及10分钟过期全部通过
curl POST /api/numbers/question → 201 {"questionId":"01db64fa-fcd4-4426-bfab-bdadc7fee4c2","spokenText":"quarter to eleven in the morning"}
curl POST /api/numbers/answer → 201 {"isCorrect":false,"correctAnswer":"10:45","promptText":null,"spokenText":"quarter to eleven in the morning"}
✓ 读法 curl：standalone time 返回自然语言 spokenText；number 同样返回 spokenText
curl POST /api/numbers/question → 201 {"questionId":"d4c4c878-8903-493b-b026-7675b653a152","spokenText":"eleven o'clock in the morning"}
curl POST /api/numbers/answer → 201 {"isCorrect":true,"correctAnswer":"11:00","promptText":null,"spokenText":"eleven o'clock in the morning"}
✓ 全角 curl：userAnswer=１１：００，isCorrect=true；数据库保留原始全角输入
移动端 home: {"width":390,"scroll":390,"body":390}，截图已生成
颜色 date #FF6B6B 📅: rgb(255, 107, 107) = CSS变量渲染色
颜色 time #5B9DFF 🕐: rgb(91, 157, 255) = CSS变量渲染色
颜色 money #3CBE8B 💰: rgb(60, 190, 139) = CSS变量渲染色
颜色 phone #9C8CFB 📞: rgb(156, 140, 251) = CSS变量渲染色
颜色 mixed #8E8A94 🔀: rgb(142, 138, 148) = CSS变量渲染色
颜色 number #FF8A65 #: rgb(255, 138, 101) = CSS变量渲染色
颜色 money #3CBE8B 💰: rgb(60, 190, 139) = CSS变量渲染色
颜色 phone #9C8CFB 📞: rgb(156, 140, 251) = CSS变量渲染色
颜色 date #FF6B6B 🎂: rgb(255, 107, 107) = CSS变量渲染色
颜色 date #FF6B6B 👶: rgb(255, 107, 107) = CSS变量渲染色
颜色 date #FF6B6B ⏰: rgb(255, 107, 107) = CSS变量渲染色
颜色 date #FF6B6B 💍: rgb(255, 107, 107) = CSS变量渲染色
颜色 date #FF6B6B 🎬: rgb(255, 107, 107) = CSS变量渲染色
颜色 date #FF6B6B 📅: rgb(255, 107, 107) = CSS变量渲染色
颜色 number #FF8A65 #: rgb(255, 138, 101) = CSS变量渲染色
✓ 分类颜色变量、14个进阶/对话图标实色、独立数字橙及考试渐变断言通过
移动端 numbers: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 numbers-categories: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 numbers-320: {"width":320,"scroll":320,"body":320}，截图已生成
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"48"}
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"4829"}
✓ 读法 CDP standalone time 答错：twenty to eleven in the morning
✓ 读法 CDP standalone time 答对：five to seven in the evening
✓ 读法 CDP standalone date 答错：the twenty-first of September, nineteen sixty-three
✓ 读法 CDP standalone date 答对：the fourteenth of December, twenty fifteen
✓ 读法 CDP standalone money 答错：three hundred and seventy-three dollars
✓ 读法 CDP standalone money 答对：two hundred and nineteen pounds and fifty-six pence
✓ 读法 CDP standalone phone 答错：无读法提示
✓ 读法 CDP standalone phone 答对：无读法提示
✓ 读法 CDP 一般数字：答后无读法提示
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"48"}
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"4829"}
移动端 practice: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 mistakes: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 stats: {"width":390,"scroll":390,"body":390}，截图已生成
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"48"}
真实鼠标播放后逐字输入: {"same":true,"disabled":false,"readonly":false,"focused":true,"value":"4829"}
✓ 独立/对话/考试：真实坐标点击首次播放输入48，重播追加29得到4829，原输入节点/焦点/可编辑状态均保留
移动端 exam: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 summary: {"width":390,"scroll":390,"body":390}，截图已生成
✓ 10 Chrome移动端：5页及10个对话入口、提交前隐藏题干、数字朗读、无限练习、考试2次播放/20秒超时/1:2成绩、离页停止、390/320无横向滚动通过；真实设备发声待用户试听

> node test_srs.js
✓ 旧库安全迁移断言通过：卡片 id=41 与复习日志 id=9 均保留；新增生词 id=42
✓ front_audio 普通加列迁移断言通过：旧卡 id=41 保留且 front_audio = null
✓ 每日任务表迁移断言通过：daily_tasks 已创建，且 task_date + skill 唯一
✓ 写作记录表迁移断言通过：旧记录 id=7 保留，content 为 TEXT NOT NULL，历史空内容兼容为空字符串
✓ front_audio API 断言通过：front = "She often goes to a ______ near her house."；front_audio = "She often goes to a keep-fit studio near her house."
✓ 新卡立即入队断言通过：新卡ID 1 已出现在队列 [1]
✓ 生词类型接口断言通过：新卡ID 2，type = 生词
✓ SRS升箱断言通过：2 → 3 → 4
✓ SRS降箱断言通过：4 → 1
✓ 日期过滤断言通过：实际队列ID [3, 2, 4]；今天/昨天ID [4, 3]；明天ID 5 已排除
✓ 连续3天断言通过：streak = 3
✓ 中断后重计断言通过：streak = 1（不是4）
✓ 今日任务接口断言通过：只生成听力/阅读/口语 3 项；切换 false → true → false；历史写作行不返回
✓ 写作内容校验断言通过：不带 content 返回 400，空记录未写入
✓ 写作长度边界断言通过：5000 字成功，5001 字返回 400
✓ 写作完成接口断言通过：content 原文保存；最近7天完成 2 次 / 目标 1 次
✓ 每周写作明细断言通过：返回 2 条 completed_at + content，最新内容 = "Some people believe public transport should be free.\nI partly agree with this view."
✓ 每周复盘口径断言通过：每日任务听力 5/7、阅读 7/7、口语 6/7；四技能正确率 80%/33%/暂无/75%
✓ 纯数据响应断言通过：复盘响应只包含周期、任务、技能统计与写作次数
全部 SRS、三项每日任务、写作周记录与纯数据复盘测试通过。

> node test_spelling.js
✓ 公共判分复用断言通过：听力与卡片拼写均调用 src/domain/answerMatch.js
✓ review_mode 普通加列迁移断言通过：18张旧卡完整保留且全部默认 flip
✓ 提交前防泄露断言通过：拼写卡队列响应无 back 字段及 back 明文，保留仅供朗读的编码音源
✓ 拼写正确自动判分断言通过：" FILM " 命中 movie/film，box 2 → 3
✓ 拼写错误自动判分断言通过：box 4 → 1，响应 correct_answer = movie/film
✓ 普通 flip 回归断言通过：旧卡仍走翻卡接口并由第1箱升到第2箱

> node test_practice.js
✓ 自由练习范围断言通过：全部2张，今天已复习1张，拼写卡不泄露back明文
✓ 自由练习零落库断言通过：box=3→3, next=2026-09-07→2026-09-07, logs=0→0
✓ 单卡练习零落库断言通过：box=3→3, next=2026-09-07→2026-09-07, logs=0→0
✓ 正式复习回归通过：box=3→4, next=2026-09-07→2026-09-14, logs=0→1

> node test_speech.js
✓ front_audio 朗读断言通过：speak 文本 = "She often goes to a keep-fit studio near her house."，不是 front = "She often goes to a ______ near her house."
✓ 旧卡向后兼容断言通过：front_audio 为 null 时 speak 文本回退为 front = "identify the different species of butterflies"
✓ 拼写模式朗读断言通过：DOM不含back明文，点击喇叭时 speak 文本 = "movie/film"
✓ 连续点击断言通过：第二次朗读再次先调用 cancel，没有排队叠加
✓ 显示规则断言通过：纯中文“无处不在的”不生成喇叭；英文“ubiquitous”生成喇叭
✓ 语音降级断言通过：无 en-GB 时选择 en-US；没有英文语音时安全返回且不朗读
全部朗读功能测试通过。

> node test_ui.js
✓ note 动态标签断言通过：任意技能+句子对照均显示“错因（选填）”，其他类型显示“备注（选填）”
✓ 写作录入 UI 合同断言通过：展开 textarea、取消、空内容拦截、携带 content 提交及周记录渲染均存在
✓ front_audio 可见渲染合同断言通过：只在录入/编辑 textarea 回显，卡片库与复习正面只渲染 front
✓ 拼写模式 UI 合同断言通过：表单开关、专用复习表单、背面朗读及提交前不渲染back均存在
✓ 自由/单卡练习 UI 合同通过：清空入口、范围选择、卡片库点击和拼写只读提交路径均存在
✓ 听力练习 UI 合同断言通过：默认展示原文挖空、提交answers后原地展示自动判分，完整原文/答案仍可隐藏查看，5项表单保留
全部字段标签 UI 规则测试通过。

> node test_listening.js
✓ 真实原文挖空断言通过：blank number = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]，换行边界只挖掉 egg
✓ 多选一答案领域断言通过：Q6 填 movie 或 film 均为 10/10
✓ 听力试运行数据合同断言通过：共 4 个 Part，Section = [1, 2, 3, 4]
✓ 音频静态路由断言通过：HTTP 200，Content-Type = audio/mpeg
✓ 错题与容错断言通过：" Egg " 判对；Q2 判错并返回 correct_answer = tower；总分 9/10
✓ 单条达标记录断言通过：Section2 仍为 locked，Section1 连续达标 1/3
✓ 阶段解锁断言通过：Section1 最近3条均达标后，Section2 locked → unlocked
✓ checklist 不达标断言通过：自动判分 10/10 但只勾4项，qualified=false，Section3 未误解锁
✓ 分数阈值断言通过：6/10 即使5项全勾也不达标
✓ HTML 解析器断言通过：只提取 Test1 Part1-4，并分离标题、原文与答案
全部听力真题练习模块测试通过。
✓ 9 六套回归通过；真实库39张卡片及全部既有业务表逐行前后不变（18张旧卡迁移由test_spelling覆盖）
全部数字听力10项验收通过。
测试服务器已关闭，临时数据库/profile已清理；PID=25828 即将自然退出
curl GET /api/cards [无口令] → 401 {"error":"未授权"}
curl POST /api/cards [无口令] → 401 {"error":"未授权"}
curl PUT /api/cards/1 [无口令] → 401 {"error":"未授权"}
curl DELETE /api/cards/1 [无口令] → 401 {"error":"未授权"}
curl POST /api/numbers/question [无口令] → 401 {"error":"未授权"}
curl OPTIONS /api/unknown [无口令] → 401 {"error":"未授权"}
curl POST /api/cards [无口令] → 401 {"error":"未授权"}
curl GET /api/cards [错误口令] → 401 {"error":"未授权"}
curl POST /api/cards [错误口令] → 401 {"error":"未授权"}
curl PUT /api/cards/1 [错误口令] → 401 {"error":"未授权"}
curl DELETE /api/cards/1 [错误口令] → 401 {"error":"未授权"}
curl POST /api/numbers/question [错误口令] → 401 {"error":"未授权"}
curl OPTIONS /api/unknown [错误口令] → 401 {"error":"未授权"}
curl POST /api/cards [错误口令] → 401 {"error":"未授权"}
curl POST /api/cards [正确口令] → 201 {"id":1,"skill":"听力","type":"生词","front":"access fixture","front_audio":null,"back":"test","review_mode":"flip","note":null,"box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:22:14","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":null}
curl GET /api/cards [正确口令] → 200 [{"id":1,"skill":"听力","type":"生词","front":"access fixture","front_audio":null,"back":"test","review_mode":"flip","note":null,"box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:22:14","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":null}]
curl PUT /api/cards/1 [正确口令] → 200 {"id":1,"skill":"听力","type":"生词","front":"access fixture","front_audio":null,"back":"test","review_mode":"flip","note":null,"box":1,"next_review_date":"2026-09-12","created_at":"2026-09-12 23:22:14","last_reviewed_at":null,"review_count":0,"source":"manual","spelling_category":null}
curl DELETE /api/cards/1 [正确口令] → 204 
curl GET / [无口令] → 200 (静态资源响应体已收到)
curl GET /styles.css [无口令] → 200 (静态资源响应体已收到)
curl GET /app.js [无口令] → 200 (静态资源响应体已收到)
curl GET /numbers.js [无口令] → 200 (静态资源响应体已收到)
curl GET /manifest.json [无口令] → 200 (静态资源响应体已收到)
curl GET /sw.js [无口令] → 200 (静态资源响应体已收到)
CDP 首次401：单一全屏口令框、自动聚焦、localStorage为空，移动布局 {"width":390,"scroll":390,"dialog":"rgb(253, 246, 242)"}
CDP 错误口令：重试401后清除localStorage并重新提示
CDP 正确口令：真实键盘/鼠标输入，localStorage保存，失败GET自动重试且首页渲染
CDP 刷新记忆：3个API请求均携带正确X-Access-Token，不再弹框
CDP 过期口令POST：清旧值后输入并重试，method/body保留 {"mode":"standalone","category":"number"}，练习页成功显示
全部访问口令真实CDP浏览器验收通过。
全部访问口令curl及浏览器验收通过。
访问口令测试服务器已关闭，临时数据库/profile已清理，即将自然退出。
curl GET /api/tasks/today → 200 [{"id":43,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":1,"name":"听力","skill":"听力"},{"id":44,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":2,"name":"阅读","skill":"阅读"},{"id":45,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":3,"name":"口语","skill":"口语"}]
✓ 迁移：默认三项顺序/状态不变，旧任务ID/完成时间及历史写作保留，重复启动/访问幂等
curl GET /api/tasks/templates → 200 [{"id":1,"name":"听力","sort_order":1,"active":1,"created_at":"2026-09-13 06:22:23"},{"id":2,"name":"阅读","sort_order":2,"active":1,"created_at":"2026-09-13 06:22:23"},{"id":3,"name":"口语","sort_order":3,"active":1,"created_at":"2026-09-13 06:22:23"}]
curl POST /api/tasks/templates → 400 {"error":"任务名不能为空"}
curl POST /api/tasks/templates → 400 {"error":"任务名不能为空"}
curl POST /api/tasks/templates → 400 {"error":"任务名不能为空"}
curl POST /api/tasks/templates → 201 {"id":4,"name":"精读一篇文章","sort_order":4,"active":1,"created_at":"2026-09-10 12:00:00"}
curl GET /api/tasks/today → 200 [{"id":43,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":1,"name":"听力","skill":"听力"},{"id":44,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":2,"name":"阅读","skill":"阅读"},{"id":45,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":3,"name":"口语","skill":"口语"},{"id":55,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":4,"name":"精读一篇文章","skill":"精读一篇文章"}]
curl POST /api/tasks/55/toggle → 200 {"id":55,"task_date":"2026-09-10","done":true,"completed_at":"2026-09-10 12:00:00","task_template_id":4,"name":"精读一篇文章","skill":"精读一篇文章"}
curl POST /api/tasks/55/toggle → 200 {"id":55,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":4,"name":"精读一篇文章","skill":"精读一篇文章"}
curl POST /api/tasks/55/toggle → 200 {"id":55,"task_date":"2026-09-10","done":true,"completed_at":"2026-09-10 12:00:00","task_template_id":4,"name":"精读一篇文章","skill":"精读一篇文章"}
curl GET /api/stats/weekly → 200 {"period":{"start":"2026-09-04","end":"2026-09-10","days":7},"dailyTasks":{"听力":{"completedDays":1,"targetDays":7},"阅读":{"completedDays":0,"targetDays":7},"口语":{"completedDays":0,"targetDays":7},"精读一篇文章":{"completedDays":2,"targetDays":7}},"skills":{"听力":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"阅读":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"口语":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"写作":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0}},"writing":{"completed":0,"target":1,"records":[]}}
curl PUT /api/tasks/templates/4 → 200 {"id":4,"name":"精读并摘录","sort_order":4,"active":1,"created_at":"2026-09-10 12:00:00"}
curl GET /api/stats/weekly → 200 {"period":{"start":"2026-09-04","end":"2026-09-10","days":7},"dailyTasks":{"听力":{"completedDays":1,"targetDays":7},"阅读":{"completedDays":0,"targetDays":7},"口语":{"completedDays":0,"targetDays":7},"精读并摘录":{"completedDays":2,"targetDays":7}},"skills":{"听力":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"阅读":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"口语":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"写作":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0}},"writing":{"completed":0,"target":1,"records":[]}}
curl DELETE /api/tasks/templates/4 → 204 
curl GET /api/tasks/today → 200 [{"id":43,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":1,"name":"听力","skill":"听力"},{"id":44,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":2,"name":"阅读","skill":"阅读"},{"id":45,"task_date":"2026-09-10","done":false,"completed_at":null,"task_template_id":3,"name":"口语","skill":"口语"}]
curl GET /api/stats/weekly → 200 {"period":{"start":"2026-09-04","end":"2026-09-10","days":7},"dailyTasks":{"听力":{"completedDays":1,"targetDays":7},"阅读":{"completedDays":0,"targetDays":7},"口语":{"completedDays":0,"targetDays":7},"精读并摘录":{"completedDays":1,"targetDays":7}},"skills":{"听力":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"阅读":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"口语":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0},"写作":{"reviewTotal":0,"reviewCorrect":0,"accuracy":null,"masteredRate":0}},"writing":{"completed":0,"target":1,"records":[]}}
curl POST /api/tasks/55/toggle → 404 {"error":"每日任务不存在"}
curl PUT /api/tasks/templates/4 → 404 {"error":"任务模板不存在"}
curl DELETE /api/tasks/templates/no-id → 400 {"error":"无效的任务模板 id"}
curl DELETE /api/tasks/templates/1 → 204 
curl DELETE /api/tasks/templates/2 → 204 
curl DELETE /api/tasks/templates/3 → 204 
curl GET /api/tasks/today → 200 []
✓ 模板增删改/勾选/取消、历史改名与删除保留、重复名称无漏项、特殊名称、全删不补种及次日不生成通过
curl GET /api/listening/overview → 200 {"stages":[{"sectionNumber":1,"unlocked":true,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[]},{"sectionNumber":2,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[]},{"sectionNumber":3,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[]},{"sectionNumber":4,"unlocked":false,"qualified":false,"qualifyingStreak":0,"remaining":3,"recentAttemptCount":0,"sections":[]}]}
移动端 feedback-home: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 feedback-editor: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 feedback-weekly: {"width":390,"scroll":390,"body":390}，截图已生成
CDP 今日任务：真实鼠标添加、改名、勾选、复盘展示和删除通过
移动端 feedback-free: {"width":390,"scroll":390,"body":390}，截图已生成
CDP 自由练习：进入、拼写提交、下一张、翻卡及完成页提示持续可见
移动端 feedback-single-flip: {"width":390,"scroll":390,"body":390}，截图已生成
移动端 feedback-single-spelling: {"width":390,"scroll":390,"body":390}，截图已生成
CDP 单卡练习：卡片库真实点击、翻卡/拼写提交和完成页提示持续可见；正式复习无提示
CDP 真题入口：首页、导航、各可达页面无入口，旧导航目标回到首页，控制台异常0
全部三项反馈真实CDP浏览器验收通过。
✓ 浏览器自由/单卡练习前后卡片及SRS完全不变，review_logs=0
反馈测试服务器/浏览器已关闭，临时数据库/profile已清理，即将自然退出。
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
+ actual - expected
... Skipped lines

  {
    cards: [
      {
        back: 'highest',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: '塔',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: '模型车辆',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: '具备防水性能的靴子',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: '退潮时',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: '最高的塔',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: '搭建一辆车',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: '搭建动物模型',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: '获得奖品',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: '停车问题',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: 'design / build / make',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'five-minute movie',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'use recycled materials like card and wood',
        box: 2,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: "next we're going to work on encouraging insects",
        box: 2,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '句子对照'
      },
      {
        back: 'butterflies',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '句子对照'
      },
      {
        back: '核心替换：building a new ↔ replacing；答案：wall',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '句子对照'
      },
      {
        back: 'litter',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '听力误听'
      },
      {
        back: 'insects',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '听力误听'
      },
      {
        back: 'studio',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: 'skills',
        box: 3,
...
        skill: '阅读',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'used to study / analyse swimmers',
        box: 1,
...
        skill: '阅读',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'copying / copied / replicate / now everyone uses them',
        box: 2,
...
        skill: '阅读',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'other countries / other nations',
        box: 1,
...
        skill: '阅读',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'a championship',
        box: 2,
...
        skill: '阅读',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'assessment',
        box: 3,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: 'one hundred and eighty pounds',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '听力误听'
      },
      {
        back: 'athletes / sportsmen and women / pros / youngsters',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'copy / reproduce / replicate',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'measure / monitor / collect data / comes down to measurement',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'improve performance / wring improvements out / squeeze an extra hundredth / world-beating results',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'event / championship / competition / race',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'finance / fund / underpin',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'organisation / institute',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'employ / use / apply / be employed in',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'tiny / slight / gradual / an extra millimetre/hundredth',
        box: 1,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: 'City Centre/center',
        box: 2,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '生词'
      },
      {
        back: 'a long wait',
        box: 2,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      },
      {
        back: "We're due to get there at 11.30am",
        box: 2,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '听力误听'
      },
      {
        back: 'taxi',
        box: 2,
...
        skill: '听力',
+       source: 'manual',
+       spelling_category: null,
        type: '同义替换'
      }
    ],
    listening_attempts: [],
    listening_sections: [
...
        correct_answer: '2007-12-15',
+       error_type: null,
        exam_session_id: null,
        id: 2,
        is_correct: 0,
        mode: 'standalone',
        prompt_text: null,
...
        correct_answer: '08:00',
+       error_type: null,
        exam_session_id: null,
        id: 3,
        is_correct: 0,
        mode: 'standalone',
        prompt_text: null,
...
        correct_answer: '£59.00',
+       error_type: null,
        exam_session_id: null,
        id: 4,
        is_correct: 0,
        mode: 'standalone',
        prompt_text: null,
...
        correct_answer: '£197.16',
+       error_type: null,
        exam_session_id: null,
        id: 5,
        is_correct: 0,
        mode: 'standalone',
        prompt_text: null,
...
        correct_answer: '£339.75',
+       error_type: null,
        exam_session_id: null,
        id: 6,
        is_correct: 1,
        mode: 'standalone',
        prompt_text: null,
...
        correct_answer: '1984-06-16',
+       error_type: null,
        exam_session_id: null,
        id: 7,
        is_correct: 0,
        mode: 'dialogue',
        prompt_text: 'The film will be released on the sixteenth of June, nineteen eighty-four.',
...
        correct_answer: '3399',
+       error_type: null,
        exam_session_id: null,
        id: 8,
        is_correct: 1,
        mode: 'standalone',
        prompt_text: null,
...
        correct_answer: '2018-11-20',
+       error_type: null,
        exam_session_id: null,
        id: 9,
        is_correct: 0,
        mode: 'dialogue',
        prompt_text: 'He was born on the twentieth of November, twenty eighteen.',
...
        card_id: 1,
+       error_type: null,
        id: 1,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:26:48'
      },
      {
...
        card_id: 3,
+       error_type: null,
        id: 2,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:26:53'
      },
      {
...
        card_id: 4,
+       error_type: null,
        id: 3,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:27:01'
      },
      {
...
        card_id: 5,
+       error_type: null,
        id: 4,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:27:07'
      },
      {
...
        card_id: 6,
+       error_type: null,
        id: 5,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:27:11'
      },
      {
...
        card_id: 8,
+       error_type: null,
        id: 7,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:27:12'
      },
      {
...
        card_id: 9,
+       error_type: null,
        id: 8,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:27:13'
      },
      {
...
        card_id: 10,
+       error_type: null,
        id: 9,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:27:14'
      },
      {
...
        card_id: 11,
+       error_type: null,
        id: 10,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:27:14'
      },
      {
...
        card_id: 13,
+       error_type: null,
        id: 12,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:27:17'
      },
      {
...
        card_id: 15,
+       error_type: null,
        id: 13,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:27:18'
      },
      {
...
        card_id: 17,
+       error_type: null,
        id: 15,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:27:20'
      },
      {
...
        card_id: 18,
+       error_type: null,
        id: 16,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:47:43'
      },
      {
...
        card_id: 21,
+       error_type: null,
        id: 19,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:48:32'
      },
      {
...
        card_id: 22,
+       error_type: null,
        id: 20,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:48:42'
      },
      {
...
        card_id: 23,
+       error_type: null,
        id: 21,
        result: 'incorrect',
        reviewed_at: '2026-09-04 07:49:01'
      },
      {
...
        card_id: 1,
+       error_type: null,
        id: 22,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:01'
      },
      {
...
        card_id: 3,
+       error_type: null,
        id: 23,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:02'
      },
      {
...
        card_id: 4,
+       error_type: null,
        id: 24,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:02'
      },
      {
...
        card_id: 5,
+       error_type: null,
        id: 25,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:03'
      },
      {
...
        card_id: 6,
+       error_type: null,
        id: 26,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:04'
      },
      {
...
        card_id: 8,
+       error_type: null,
        id: 27,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:04'
      },
      {
...
        card_id: 9,
+       error_type: null,
        id: 28,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:05'
      },
      {
...
        card_id: 10,
+       error_type: null,
        id: 29,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:05'
      },
      {
...
        card_id: 11,
+       error_type: null,
        id: 30,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:06'
      },
      {
...
        card_id: 13,
+       error_type: null,
        id: 31,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:06'
      },
      {
...
        card_id: 15,
+       error_type: null,
        id: 32,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:07'
      },
      {
...
        card_id: 17,
+       error_type: null,
        id: 33,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:07'
      },
      {
...
        card_id: 18,
+       error_type: null,
        id: 34,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:08'
      },
      {
...
        card_id: 21,
+       error_type: null,
        id: 35,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:09'
      },
      {
...
        card_id: 22,
+       error_type: null,
        id: 36,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:10'
      },
      {
...
        card_id: 23,
+       error_type: null,
        id: 37,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:11'
      },
      {
...
        card_id: 26,
+       error_type: null,
        id: 38,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:12'
      },
      {
...
        card_id: 27,
+       error_type: null,
        id: 39,
        result: 'incorrect',
        reviewed_at: '2026-09-06 08:13:24'
      },
      {
...
        card_id: 29,
+       error_type: null,
        id: 44,
        result: 'correct',
        reviewed_at: '2026-09-06 23:34:39'
      },
      {
...
        card_id: 30,
+       error_type: null,
        id: 45,
        result: 'incorrect',
        reviewed_at: '2026-09-07 00:51:13'
      },
      {
...
        card_id: 31,
+       error_type: null,
        id: 46,
        result: 'incorrect',
        reviewed_at: '2026-09-07 00:58:49'
      },
      {
...
        card_id: 32,
+       error_type: null,
        id: 47,
        result: 'incorrect',
        reviewed_at: '2026-09-07 00:58:59'
      },
      {
...
        card_id: 1,
+       error_type: null,
        id: 48,
        result: 'incorrect',
        reviewed_at: '2026-09-07 00:59:12'
      },
      {
...
        card_id: 3,
+       error_type: null,
        id: 49,
        result: 'incorrect',
        reviewed_at: '2026-09-07 00:59:16'
      },
      {
...
        card_id: 4,
+       error_type: null,
        id: 50,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:00:08'
      },
      {
...
        card_id: 5,
+       error_type: null,
        id: 51,
        result: 'correct',
        reviewed_at: '2026-09-07 01:00:18'
      },
      {
...
        card_id: 6,
+       error_type: null,
        id: 52,
        result: 'correct',
        reviewed_at: '2026-09-07 01:00:22'
      },
      {
...
        card_id: 8,
+       error_type: null,
        id: 53,
        result: 'correct',
        reviewed_at: '2026-09-07 01:00:34'
      },
      {
...
        card_id: 9,
+       error_type: null,
        id: 54,
        result: 'correct',
        reviewed_at: '2026-09-07 01:00:36'
      },
      {
...
        card_id: 10,
+       error_type: null,
        id: 55,
        result: 'correct',
        reviewed_at: '2026-09-07 01:00:46'
      },
      {
...
        card_id: 11,
+       error_type: null,
        id: 56,
        result: 'correct',
        reviewed_at: '2026-09-07 01:00:48'
      },
      {
...
        card_id: 13,
+       error_type: null,
        id: 57,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:00:55'
      },
      {
...
        card_id: 15,
+       error_type: null,
        id: 58,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:01:06'
      },
      {
...
        card_id: 17,
+       error_type: null,
        id: 59,
        result: 'correct',
        reviewed_at: '2026-09-07 01:01:20'
      },
      {
...
        card_id: 18,
+       error_type: null,
        id: 60,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:01:30'
      },
      {
...
        card_id: 21,
+       error_type: null,
        id: 61,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:01:52'
      },
      {
...
        card_id: 22,
+       error_type: null,
        id: 62,
        result: 'correct',
        reviewed_at: '2026-09-07 01:02:07'
      },
      {
...
        card_id: 23,
+       error_type: null,
        id: 63,
        result: 'correct',
        reviewed_at: '2026-09-07 01:02:34'
      },
      {
...
        card_id: 27,
+       error_type: null,
        id: 64,
        result: 'correct',
        reviewed_at: '2026-09-07 01:02:51'
      },
      {
...
        card_id: 34,
+       error_type: null,
        id: 65,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:03:29'
      },
      {
...
        card_id: 35,
+       error_type: null,
        id: 66,
        result: 'correct',
        reviewed_at: '2026-09-07 01:03:37'
      },
      {
...
        card_id: 36,
+       error_type: null,
        id: 67,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:04:00'
      },
      {
...
        card_id: 37,
+       error_type: null,
        id: 68,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:04:43'
      },
      {
...
        card_id: 38,
+       error_type: null,
        id: 69,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:04:57'
      },
      {
...
        card_id: 39,
+       error_type: null,
        id: 70,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:05:20'
      },
      {
...
        card_id: 40,
+       error_type: null,
        id: 71,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:05:54'
      },
      {
...
        card_id: 41,
+       error_type: null,
        id: 72,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:06:06'
      },
      {
...
        card_id: 42,
+       error_type: null,
        id: 73,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:06:26'
      },
      {
...
        card_id: 43,
+       error_type: null,
        id: 74,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:06:47'
      },
      {
...
        card_id: 44,
+       error_type: null,
        id: 75,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:07:00'
      },
      {
...
        card_id: 45,
+       error_type: null,
        id: 76,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:07:19'
      },
      {
...
        card_id: 33,
+       error_type: null,
        id: 77,
        result: 'incorrect',
        reviewed_at: '2026-09-07 01:57:12'
      },
      {
...
        card_id: 26,
+       error_type: null,
        id: 78,
        result: 'correct',
        reviewed_at: '2026-09-08 05:31:47'
      },
      {
...
        card_id: 1,
+       error_type: null,
        id: 79,
        result: 'correct',
        reviewed_at: '2026-09-08 05:33:41'
      },
      {
...
        card_id: 3,
+       error_type: null,
        id: 80,
        result: 'correct',
        reviewed_at: '2026-09-08 05:33:43'
      },
      {
...
        card_id: 4,
+       error_type: null,
        id: 81,
        result: 'incorrect',
        reviewed_at: '2026-09-08 05:33:50'
      },
      {
...
        card_id: 13,
+       error_type: null,
        id: 82,
        result: 'correct',
        reviewed_at: '2026-09-08 05:33:54'
      },
      {
...
        card_id: 15,
+       error_type: null,
        id: 83,
        result: 'incorrect',
        reviewed_at: '2026-09-08 05:34:00'
      },
      {
...
        card_id: 18,
+       error_type: null,
        id: 84,
        result: 'incorrect',
        reviewed_at: '2026-09-08 05:34:09'
      },
      {
...
        card_id: 21,
+       error_type: null,
        id: 85,
        result: 'incorrect',
        reviewed_at: '2026-09-08 05:34:31'
      },
      {
...
        card_id: 30,
+       error_type: null,
        id: 86,
        result: 'correct',
        reviewed_at: '2026-09-08 05:34:35'
      },
      {
...
        card_id: 31,
+       error_type: null,
        id: 87,
        result: 'incorrect',
        reviewed_at: '2026-09-08 05:35:07'
      },
      {
...
        card_id: 32,
+       error_type: null,
        id: 88,
        result: 'incorrect',
        reviewed_at: '2026-09-08 05:35:14'
      },
      {
...
        card_id: 33,
+       error_type: null,
        id: 89,
        result: 'incorrect',
        reviewed_at: '2026-09-08 05:35:25'
      },
      {
...
        card_id: 34,
+       error_type: null,
        id: 90,
        result: 'incorrect',
        reviewed_at: '2026-09-08 05:35:32'
      },
      {
...
        card_id: 36,
+       error_type: null,
        id: 91,
        result: 'incorrect',
        reviewed_at: '2026-09-08 05:35:58'
      },
      {
...
        card_id: 37,
+       error_type: null,
        id: 92,
        result: 'incorrect',
        reviewed_at: '2026-09-08 05:36:17'
      },
      {
...
        card_id: 38,
+       error_type: null,
        id: 93,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:44:11'
      },
      {
...
        card_id: 39,
+       error_type: null,
        id: 94,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:44:55'
      },
      {
...
        card_id: 40,
+       error_type: null,
        id: 95,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:45:55'
      },
      {
...
        card_id: 41,
+       error_type: null,
        id: 96,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:46:14'
      },
      {
...
        card_id: 43,
+       error_type: null,
        id: 97,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:47:04'
      },
      {
...
        card_id: 44,
+       error_type: null,
        id: 98,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:49:06'
      },
      {
...
        card_id: 45,
+       error_type: null,
        id: 99,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:50:04'
      },
      {
...
        card_id: 46,
+       error_type: null,
        id: 100,
        result: 'correct',
        reviewed_at: '2026-09-10 02:50:16'
      },
      {
...
        card_id: 47,
+       error_type: null,
        id: 101,
        result: 'correct',
        reviewed_at: '2026-09-10 02:50:26'
      },
      {
...
        card_id: 48,
+       error_type: null,
        id: 102,
        result: 'correct',
        reviewed_at: '2026-09-10 02:50:53'
      },
      {
...
        card_id: 49,
+       error_type: null,
        id: 103,
        result: 'correct',
        reviewed_at: '2026-09-10 02:50:57'
      },
      {
...
        card_id: 29,
+       error_type: null,
        id: 104,
        result: 'correct',
        reviewed_at: '2026-09-10 02:51:06'
      },
      {
...
        card_id: 4,
+       error_type: null,
        id: 105,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:51:15'
      },
      {
...
        card_id: 15,
+       error_type: null,
        id: 106,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:51:31'
      },
      {
...
        card_id: 18,
+       error_type: null,
        id: 107,
        result: 'correct',
        reviewed_at: '2026-09-10 02:51:40'
      },
      {
...
        card_id: 21,
+       error_type: null,
        id: 108,
        result: 'correct',
        reviewed_at: '2026-09-10 02:51:53'
      },
      {
...
        card_id: 31,
+       error_type: null,
        id: 109,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:52:10'
      },
      {
...
        card_id: 32,
+       error_type: null,
        id: 110,
        result: 'correct',
        reviewed_at: '2026-09-10 02:52:23'
      },
      {
...
        card_id: 33,
+       error_type: null,
        id: 111,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:52:34'
      },
      {
...
        card_id: 34,
+       error_type: null,
        id: 112,
        result: 'correct',
        reviewed_at: '2026-09-10 02:52:41'
      },
      {
...
        card_id: 36,
+       error_type: null,
        id: 113,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:52:57'
      },
      {
...
        card_id: 37,
+       error_type: null,
        id: 114,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:54:12'
      },
      {
...
        card_id: 5,
+       error_type: null,
        id: 115,
        result: 'correct',
        reviewed_at: '2026-09-10 02:54:21'
      },
      {
...
        card_id: 6,
+       error_type: null,
        id: 116,
        result: 'correct',
        reviewed_at: '2026-09-10 02:54:52'
      },
      {
...
        card_id: 8,
+       error_type: null,
        id: 117,
        result: 'correct',
        reviewed_at: '2026-09-10 02:55:20'
      },
      {
...
        card_id: 9,
+       error_type: null,
        id: 118,
        result: 'correct',
        reviewed_at: '2026-09-10 02:55:25'
      },
      {
...
        card_id: 10,
+       error_type: null,
        id: 119,
        result: 'correct',
        reviewed_at: '2026-09-10 02:55:31'
      },
      {
...
        card_id: 11,
+       error_type: null,
        id: 120,
        result: 'correct',
        reviewed_at: '2026-09-10 02:55:33'
      },
      {
...
        card_id: 17,
+       error_type: null,
        id: 121,
        result: 'correct',
        reviewed_at: '2026-09-10 02:55:39'
      },
      {
...
        card_id: 22,
+       error_type: null,
        id: 122,
        result: 'correct',
        reviewed_at: '2026-09-10 02:55:48'
      },
      {
...
        card_id: 23,
+       error_type: null,
        id: 123,
        result: 'incorrect',
        reviewed_at: '2026-09-10 02:55:59'
      },
      {
...
        card_id: 27,
+       error_type: null,
        id: 124,
        result: 'correct',
        reviewed_at: '2026-09-10 02:56:11'
      },
      {
...
        card_id: 35,
+       error_type: null,
        id: 125,
        result: 'correct',
        reviewed_at: '2026-09-10 02:56:19'
      },
      {
...
        card_id: 1,
+       error_type: null,
        id: 126,
        result: 'correct',
        reviewed_at: '2026-09-10 02:56:30'
      },
      {
...
        card_id: 3,
+       error_type: null,
        id: 127,
        result: 'correct',
        reviewed_at: '2026-09-10 02:56:31'
      },
      {
...
        card_id: 13,
+       error_type: null,
        id: 128,
        result: 'correct',
        reviewed_at: '2026-09-10 02:56:33'
      },
      {
...
        card_id: 26,
+       error_type: null,
        id: 129,
        result: 'correct',
        reviewed_at: '2026-09-10 02:56:44'
      },
      {
...
        card_id: 30,
+       error_type: null,
        id: 130,
        result: 'correct',
        reviewed_at: '2026-09-10 02:56:47'
      }
    ],

    at main (D:\Codex工作区\ielts-review-tool\test_feedback.js:108:12) {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: [Object],
  expected: [Object],
  operator: 'deepStrictEqual',
  diff: 'simple'
}

NPM_TEST_EXIT=1

```

### 5. ?????????

???? `node test_listening_foundations.js`??????????????/?????????????????

first-run.txt

```text
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:64356/api/cards/48" "-H" "Content-Type: application/json" "--data-binary" "{\"review_mode\":\"spelling\",\"spelling_category\":\"letter\"}"
{"id":48,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"A","review_mode":"spelling","note":"updated","box":4,"next_review_date":"2026-09-19","created_at":"2026-09-12 23:18:36","last_reviewed_at":"2026-09-12 23:18:36","review_count":2,"source":"manual","spelling_category":"letter"}
200
PERSISTENCE: reopened database retains answer items; spelling practice is read-only; category/latest-log filters asserted
CDP_FOUNDATIONS=[旧版枢纽输出已被 2026-09-13 最新 SPEC 作废；当前四入口证据见 acceptance.md]
CDP_SCREENSHOT foundations-390: {"width":390,"scroll":390,"body":390}
CDP_NAV: [旧版枢纽导航证据已被 2026-09-13 最新 SPEC 作废]
CDP_SPELLING_CATEGORIES=["A · 字母→","B · 人名地名→","C · 星期月份日期→","D · 高频答案词→","E · 高频场景词→","我的错词 →"]
CDP_SCREENSHOT spelling-390: {"width":390,"scroll":390,"body":390}
CDP_SPEECH_STATE={"spoken":[],"voices":[{"lang":"en-GB","name":"Test English"}],"utterance":"function","button":"<button class=\"speech-button\" type=\"button\" data-speech-base64=\"QQ==\" aria-label=\"朗读正确拼写\" title=\"朗读正确拼写\">🔊</button>"}
CLEANUP: local test server closed; temporary database/browser profile/screenshots removed
node : AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
At line:2 char:178
+ ... | Out-Null; node test_listening_foundations.js *> (Join-Path $env:FOU ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (AssertionError ...strictly equal::String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 

undefined !== 'A'

    at foundationsBrowserTest (D:\Codex工作区\ielts-review-tool\scripts\test_foundations_browser.js:109:12)
    at async main (D:\Codex工作区\ielts-review-tool\test_listening_foundations.js:154:5) {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: undefined,
  expected: 'A',
  operator: 'strictEqual',
  diff: 'simple'
}
```

second-run.txt

```text
200
PERSISTENCE: reopened database retains answer items; spelling practice is read-only; category/latest-log filters asserted
CDP_FOUNDATIONS=[旧版枢纽输出已被 2026-09-13 最新 SPEC 作废；当前四入口证据见 acceptance.md]
CDP_SCREENSHOT foundations-390: {"width":390,"scroll":390,"body":390}
CDP_NAV: [旧版枢纽导航证据已被 2026-09-13 最新 SPEC 作废]
CDP_SPELLING_CATEGORIES=["A · 字母→","B · 人名地名→","C · 星期月份日期→","D · 高频答案词→","E · 高频场景词→","我的错词 →"]
CDP_SCREENSHOT spelling-390: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT spelling-before-play: {"width":390,"scroll":390,"body":390}
CDP_HIT={"x":140,"y":326,"hit":"<button class=\"speech-button\" type=\"button\" data-speech-base64=\"QQ==\" aria-label=\"朗读正确拼写\" title=\"朗读正确拼写\">🔊</button>"}
CDP_SPEECH_STATE={"spoken":[],"voices":[{"lang":"en-GB","name":"Test English"}],"utterance":"function","button":"<button class=\"speech-button\" type=\"button\" data-speech-base64=\"QQ==\" aria-label=\"朗读正确拼写\" title=\"朗读正确拼写\">🔊</button>"}
CLEANUP: local test server closed; temporary database/browser profile/screenshots removed
node : AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
At line:2 char:92
+ ... ons-visual-20260912'; node test_listening_foundations.js 2>&1 | Out-F ...
+                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (AssertionError ...strictly equal::String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 

undefined !== 'A'

    at foundationsBrowserTest (D:\Codex工作区\ielts-review-tool\scripts\test_foundations_browser.js:111:12)
    at async main (D:\Codex工作区\ielts-review-tool\test_listening_foundations.js:154:5) {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: undefined,
  expected: 'A',
  operator: 'strictEqual',
  diff: 'simple'
}
```

third-run.txt

```text
CDP_SCREENSHOT spelling-390: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT spelling-before-play: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT spelling-answer-390: {"width":390,"scroll":390,"body":390}
CDP_SPELLING: actual mouse play -> speechSynthesis.speak("A"); keyboard answer -> read-only practice; correct answer displayed; card/logs unchanged
CDP_MY_MISTAKES: recently incorrect spelling card rendered, id=48
CDP_SCREENSHOT foundations-320: {"width":320,"scroll":320,"body":320}
CDP_SCREENSHOT spelling-320: {"width":320,"scroll":320,"body":320}
CDP_SCREENSHOT foundations-390: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT spelling-390: {"width":390,"scroll":390,"body":390}
CDP_ENTRY: category hidden for flip; five optional categories for spelling; existing category restored on edit
CLEANUP: local test server closed; temporary database/browser profile/screenshots removed
node : AssertionError [ERR_ASSERTION]: {"exceptionId":1,"text":"Uncaught","lineNumber":0,"columnNumber":46,"scriptId":"
60","exception":{"type":"object","subtype":"error","className":"SyntaxError","description":"SyntaxError: Unexpected ide
ntifier 'api'","objectId":"6004234299679324598.2.2"}}
At line:2 char:92
+ ... ons-visual-20260912'; node test_listening_foundations.js 2>&1 | Out-F ...
+                           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (AssertionError ...79324598.2.2"}}:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
    at evaluate (D:\Codex工作区\ielts-review-tool\scripts\test_foundations_browser.js:43:14)
    at async foundationsBrowserTest (D:\Codex工作区\ielts-review-tool\scripts\test_foundations_browser.js:144:5)
    at async main (D:\Codex工作区\ielts-review-tool\test_listening_foundations.js:154:5) {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}
```

fourth-run.txt

```text
{"id":48,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"A","review_mode":"spelling","note":"updated","box":4,"next_review_date":"2026-09-19","created_at":"2026-09-12 23:20:16","last_reviewed_at":"2026-09-12 23:20:16","review_count":2,"source":"manual","spelling_category":"letter"}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:63696/api/cards/48" "-H" "Content-Type: application/json" "--data-binary" "{\"review_mode\":\"flip\",\"spelling_category\":null}"
{"id":48,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"A","review_mode":"flip","note":"updated","box":4,"next_review_date":"2026-09-19","created_at":"2026-09-12 23:20:16","last_reviewed_at":"2026-09-12 23:20:16","review_count":2,"source":"manual","spelling_category":null}
200
COMMAND: curl "-sS" "--max-time" "10" "-X" "PUT" "-w" "\n%{http_code}" "http://127.0.0.1:63696/api/cards/48" "-H" "Content-Type: application/json" "--data-binary" "{\"review_mode\":\"spelling\",\"spelling_category\":\"letter\"}"
{"id":48,"skill":"听力","type":"听力误听","front":"context","front_audio":null,"back":"A","review_mode":"spelling","note":"updated","box":4,"next_review_date":"2026-09-19","created_at":"2026-09-12 23:20:16","last_reviewed_at":"2026-09-12 23:20:16","review_count":2,"source":"manual","spelling_category":"letter"}
200
PERSISTENCE: reopened database retains answer items; spelling practice is read-only; category/latest-log filters asserted
CDP_FOUNDATIONS=[旧版枢纽输出已被 2026-09-13 最新 SPEC 作废；当前四入口证据见 acceptance.md]
CDP_SCREENSHOT foundations-390: {"width":390,"scroll":390,"body":390}
CDP_NAV: [旧版枢纽导航证据已被 2026-09-13 最新 SPEC 作废]
CDP_SPELLING_CATEGORIES=["A · 字母→","B · 人名地名→","C · 星期月份日期→","D · 高频答案词→","E · 高频场景词→","我的错词 →"]
CDP_SCREENSHOT spelling-390: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT spelling-before-play: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT spelling-answer-390: {"width":390,"scroll":390,"body":390}
CDP_SPELLING: actual mouse play -> speechSynthesis.speak("A"); keyboard answer -> read-only practice; correct answer displayed; card/logs unchanged
CDP_MY_MISTAKES: recently incorrect spelling card rendered, id=48
CDP_SCREENSHOT foundations-320: {"width":320,"scroll":320,"body":320}
CDP_SCREENSHOT spelling-320: {"width":320,"scroll":320,"body":320}
CDP_SCREENSHOT foundations-390: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT spelling-390: {"width":390,"scroll":390,"body":390}
CDP_ENTRY: category hidden for flip; five optional categories for spelling; existing category restored on edit
CDP_REVIEW: listening spelling incorrect -> PUT SPELLING saved; other three skills -> no error picker
CDP_SCREENSHOT collect-form-390: {"width":390,"scroll":390,"body":390}
CDP_SCREENSHOT listening-items-390: {"width":390,"scroll":390,"body":390}
CDP_LISTENING: bookmarked result survives reload; wrong-only picker PUT saved; editable context/back/note/type defaults; collected source=real_error; duplicate button disabled after reload
CDP_EXCEPTIONS=[]; FOUNDATIONS_BROWSER=PASS
FOUNDATIONS_ACCEPTANCE=PASS; integrity_check=ok; foreign_key_check=[]
CLEANUP: local test server closed; temporary database/browser profile/screenshots removed
```


### 6. ?????????

?????????????? 17 ???????? PowerShell `Remove-Item -LiteralPath` ??????????????????????

???????

```text
TEMP_CLEANUP_EXISTS=False
FAILED_FIXTURE_EXISTS=False
FINAL_LOCAL_ROOT_HTTP=200
```

`git diff --check` ?? 0????????? CRLF ???????????`git status --short` ?? SPEC.md ??????????????????? SPEC.md????? PID=20332??? 3001 ?????

?????? CDP ?????DOM ????????320/390 ??????????????????????????? AGENTS.md ????????????????????????????????????????
