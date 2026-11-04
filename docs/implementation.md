# 实现说明

## 结构

| 文件 | 作用 |
| --- | --- |
| `package.json` | bundle 清单：`dsh.bundle.patch` 与 `dsh.client`（Web 端立即加载的 Client 模块） |
| `cordis.patch.yml` | 向 profile 插入 `dsh-status-sidebar` 一行插件 |
| `index.js` | Host 半侧：注册 `/api/status-sidebar.feed`，读取并解析状态 RSS |
| `feed.js` | Host 半侧：抓取 RSS、解码 XML 实体并提取最新 `<item>` 的 `Status:` 值 |
| `client.js` | Client 半侧：注册 `main` 面板与 `sidebar.panellist` 入口，按状态绘制图标 |
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
- 响应与上游请求都使用 `no-store`，避免缓存旧的失败结果。

### RSS 解析

`feed.js` 对 feed 做以下处理：

1. 取第一个 `<item>`（feed 按时间倒序）。
2. 取该 item 的 `<description>`。
3. 解码 XML 实体：`&lt;`、`&gt;`、`&quot;`、`&apos;`、`&amp;` 以及 `&#x…;`/`&#…;` 数字引用。
4. 用 `<p><strong>Status:</strong> {status}</p>` 的特征匹配，捕获从 `</strong>` 后的空格之后
   开始的状态词，并转为小写。

## 刷新与网络策略（Client）

### 触发

- **页面载入**：`apply()` 的 `ctx.effect` 注册监听器后调用 `refreshStatus()`。
- **新一轮对话**：`useSessions` 选择器返回“非 subagent 且 `running` 为 true”的会话 id 集合；
  集合中出现新 id（即上一轮结束后重新开始）时立即 `refreshStatus()`。subagent 轮次被忽略。
- **定时**：读取成功后，`resolved`/`completed` 排 10 分钟，其他可读状态排 1 分钟。
- **在线但不可达**：读取结果为 `null` 且浏览器在线时，按
  `5s → 10s → 10s → 30s → 1min → 1min…` 退避；成功或网络切换会重置序列。

### 连通性

- 页面载入与每次读取前检查 `navigator.onLine`；离线时不发出任何 feed 请求。
- 监听 `online` / `offline`：
  - `offline`：标记断网、清空定时器、暂停读取。
  - `online`：立即重新检测并读取，重置退避。
- 监听 `navigator.connection` 的 `change`，按 `type`/`effectiveType` 组成签名；只有签名变化
  （真正的换网，而非仅带宽波动）才立即重读并重置退避。
- 若网络切换时仍有读取在途，标记 `pendingOnlineRefresh`，在该次读取结束后立即重读，
  避免旧请求的失败结果结束新一轮检测。

### 其他

- 并发调用共享同一个 in-flight 读取；读取完成后统一重新排程。
- 插件卸载时移除 `online`/`offline`/`connection` 监听器并清空定时器。

## 图标

- 形状内联自 `lucide-static` v1.67.0（ISC 许可，<https://lucide.dev/icons/>）：`activity`、
  `check-circle-2`、`circle-alert`、`clock-alert`、`clock`。
- 状态到图标的映射见[使用说明](usage.md#侧栏图标)。
- 尺寸使用侧栏传入值（展开 16px / 收起 18px），线宽固定 1.6。
- 颜色只使用主题 token；回退图标使用 `currentColor`。

## 样式与本地化

- 样式只使用宿主主题 token（`--dsw-alias-*`），类名统一加 `dss-status-` 前缀，不依赖任何
  Harness Client 包。
- 可见文案通过 Client locale 服务（命名空间 `statusSidebar`）提供英文与中文。
