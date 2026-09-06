# 验收记录

验收标准以 [`../SPEC.md`](../SPEC.md) 第 1-7 条为准。本文件用于保存实际命令和结果，实施后回写证据，不以描述代替输出。

## 当前状态

2026-09-06 七次迭代仍仅修改本地代码与本地 SQLite；未连接线上服务器，未执行部署或 PM2 操作。

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

最终本地状态：`curl.exe -sS http://localhost:3001/api/cards` 解析后 `HTTP_CARD_COUNT=21`；`/` 与 `/speech.js` 均返回 HTTP 200；PID 29748 继续监听 `0.0.0.0:3001`，静态前端修改无需重启 Node 进程。浏览器控制台 error/warning 日志为空。本轮未连接 `47.107.180.139`，未执行部署、PM2 或线上数据库操作。

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
curl http://47.107.180.139:3000/ -> HTTP/1.1 200 OK
curl http://47.107.180.139:3001/ -> timeout after 8 seconds
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
