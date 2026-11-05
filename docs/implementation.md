# 实现说明

## 结构

| 文件 | 作用 |
| --- | --- |
| `package.json` | bundle 清单：`dsh.bundle.patch` 与 `dsh.client`（Web 端立即加载的 Client 模块） |
| `cordis.patch.yml` | 向 profile 插入 `dsh-status-sidebar` 一行插件 |
| `index.js` | Host 半侧：注册 feed 路由与可达性探测路由，读取并解析状态 RSS |
| `feed.js` | Host 半侧：抓取 RSS、解码 XML 实体、提取最新 `<item>` 的 `Status:` 值，并定义两条路由路径 |
| `client.js` | Client 半侧：注册 `main` 面板与 `sidebar.panellist` 入口；内置唯一的读取/探测调度器，按状态绘制图标 |
| `locale/en.json`、`locale/zh.json` | 插件管理页显示用的标题与说明 |
| `icon.svg` | 插件管理页图标（本仓库原创的脉冲折线图形） |

## 侧栏与面板

- 侧栏入口通过 `sidebar.panellist` 列表槽位注册：

  ```js
  ctx.slots.register({
    name: 'sidebar.panellist',
    id: 'status-sidebar',
    order: 20,
    locale: 'statusSidebar',
    label: () => t('panel'),
  }, StatusPanelIcon)
  ```

  侧栏负责按钮、无障碍名称、选中态、折叠提示与半收起布局；插件只提供图标组件。
- 面板通过 `main` keyed 槽位注册，`key` 与侧栏入口 id 相同；侧栏选中该 id 即渲染面板。
- 面板内容为 `<iframe src="https://status.deepseek.com">`，顶部有标题与「刷新」按钮；刷新通过
  更换 iframe 的 React key 重新加载，加载完成前显示加载提示。

## 状态读取

### 为什么需要 Host 路由

`https://status.deepseek.com/feed.rss` 的响应没有 `Access-Control-Allow-Origin`，浏览器直接
`fetch` 会被 CORS 拦截。因此由 Host 半侧代取，Client 只请求同源路由。

- `index.js` 声明 `inject: ['connection']`，在 Connection 的鉴权围栏内注册
  `GET /api/status-sidebar.feed`。
- 上游请求带 8s 超时；成功返回 `{ "status": "resolved" }`，无法读取（离线、超时、非 2xx、
  无 `Status:` 段）返回 `{ "status": null }`。
- 另注册 `GET /api/status-sidebar.probe`：对 `feed.rss` 发 `HEAD`，3s 超时；收到任意 HTTP
  响应返回 `{ "reachable": true }`，连接失败或超时返回 `{ "reachable": false }`。该路由只
  判断 Host 能否出网，不读取 feed 正文。
- 响应与上游请求都使用 `no-store`，避免缓存旧的失败结果。

### RSS 解析

`feed.js` 对 feed 做以下处理：

1. 取第一个 `<item>`（feed 按时间倒序）。
2. 取该 item 的 `<description>`。
3. 解码 XML 实体：`&lt;`、`&gt;`、`&quot;`、`&apos;`、`&amp;` 以及 `&#x…;`/`&#…;` 数字引用。
4. 用 `<p><strong>Status:</strong> {status}</p>` 的特征匹配，捕获从 `</strong>` 后的空格之后
   开始的状态词，并转为小写。

## 刷新与网络策略（Client）

### 单一调度器

`client.js` 中的 `createFeedReader` 是唯一决定“何时读取”的地方。页面载入、新一轮对话、定时、
退避与网络事件都通过它，组件不直接持有定时器或网络标志：

- `start()` / `stop()`：绑定与卸载。
- `refresh()`：新一轮对话和定时器请求读取；与在途读取合并。
- `offline()` / `online()` / `switched()`：网络事件入口。
- `probeNow()`：主动可达性探测，是断网/恢复的权威来源。

调度器维护 `generation`：每次网络切换递增；读取开始时记录当时的 `generation`，结束后只有
仍相等才发布结果。配合 `AbortController`，网络事件可以中止在途请求并立即按新状态行动，
不会被旧请求的迟到结果覆盖。

### 可达性探测（断网检测）

浏览器的 `navigator.onLine` / `offline` 事件在部分环境（虚拟网卡、VM、远端网络）不会随真实
出网链路变化。因此调度器维护一个主动探测定时器：

- 正常时每 15 秒请求 `GET /api/status-sidebar.probe`；Host 对 feed 地址发 `HEAD`（3 秒超时）。
- 回复 `{ reachable: false }` 或探测请求本身失败：立即按断网处理（发布 `null`、中止在途
  读取、清空 read 定时器），探测周期切到 5 秒。
- 回复 `{ reachable: true }` 且 reader 当前离线：立即恢复并读取 feed。
- 回复非 2xx，或 `reachable` 不是布尔值（例如 Host 仍是旧版本、路由不存在）：视为
  `unavailable`，不改变网络状态，继续按原周期探测，避免版本错配造成误报。
- 探测维护独立的 `probeGeneration`：网络事件会中止在途探测并使其过期，迟到的探测结果不会
  覆盖新状态。

`offline` / `online` / `connection change` 仍保留为低延迟提示：`offline` 立即回退，`online`
立即读取并同时发起一次探测确认。

### 触发

- **页面载入**：`start()`；浏览器已离线时先发布 `null`（`wifi-off`）并立即探测，确认可达后再读取。
- **新一轮对话**：`useSessions` 选择器返回“非 subagent 且 `running` 为 true”的会话 id 集合；
  集合中出现新 id（即上一轮结束后重新开始）时调用 `refresh()`。subagent 轮次被忽略。
- **定时**：读取成功后，`resolved`/`completed` 排 10 分钟，其他可读状态排 1 分钟。
- **在线但不可达**：读取结果为 `null` 时按 `5s → 10s → 10s → 30s → 1min → 1min…` 退避；
  成功或网络切换会重置序列。

### 网络状态与优先级

1. **主动探测**是断网/恢复的权威来源，正常 15 秒一次，离线 5 秒一次。
2. `offline`：立即递增 `generation`、清空 read 定时器、中止在途读取与探测、发布 `null`，
   图标切换为 `wifi-off`。
3. `online`：立即读取并重置退避，同时立刻发起一次探测；若探测失败，数秒内会重新离线。
4. `navigator.connection` 的 `change`：仅当 `type`/`effectiveType` 签名变化（真正的换网，
   而非带宽波动）时按换网处理并探测。
5. 读取与探测各带 generation；网络事件或更新的一次探测会让旧结果过期，迟到的成功/失败都
   不会覆盖新状态。

### 其他

- 并发触发共享当前在途读取；读取完成后统一重新排程。
- 插件卸载时移除 `online`/`offline`/`connection` 监听器、清空两类定时器并中止在途请求。

## 图标

- 形状内联自 `lucide-static` v1.67.0（ISC 许可，<https://lucide.dev/icons/>）：`activity`、
  `check-circle-2`、`history`、`circle-alert`、`calendar-sync`、`calendar-clock`、`wifi-off`。
- `resolved`/`completed` 用绿色 `check-circle-2`；首次读取尚未发布时用 `history`；读取失败或
  断网（发布 `null`）时用 `wifi-off`；未知值用 `activity`，映射见[使用说明](usage.md#侧栏图标)。
- 尺寸使用侧栏传入值（展开 16px / 收起 18px），线宽固定 1.6。
- 颜色：`resolved`/`completed` 用绿色 token；`investigating`/`identified`/`monitoring`/`ongoing`
  用红色 token，`scheduled` 用黄色 token；缺省与等待使用 `currentColor`。

## 样式与本地化

- 样式只使用宿主主题 token（`--dsw-alias-*`），类名统一加 `dss-status-` 前缀，不依赖任何
  Harness Client 包。
- 可见文案通过 Client locale 服务（命名空间 `statusSidebar`）提供英文与中文。
