# 状态侧边栏（dsh-status-sidebar）

一个本地 DSH（DeepSeek Harness）UI 插件：在左侧栏添加名为 **状态** 的入口，点击后在中栏内嵌
显示 <https://status.deepseek.com> 的实时页面（`iframe`，不是跳转链接）。

## 结构

| 文件 | 作用 |
| --- | --- |
| `package.json` | bundle 清单：`dsh.bundle.patch` 与 `dsh.client`（Web 端懒加载模块） |
| `cordis.patch.yml` | 插入 `dsh-status-sidebar` 一行插件 |
| `index.js` | Host 半侧：注册 `/api/status-sidebar.feed` 路由，读取并解析状态 RSS |
| `feed.js` | Host 半侧：抓取 RSS、解码实体并提取最新 `<item>` 的 `Status:` 值 |
| `client.js` | Client 半侧：注册 `main` 面板与 `sidebar.panellist` 侧栏入口，按状态绘制图标 |
| `locale/en.json`、`locale/zh.json` | 插件管理页显示用的标题与说明 |
| `icon.svg` | 插件管理页图标（本仓库原创的脉冲折线图形） |

## 实现要点

- 侧栏入口：`ctx.slots.register({ name: 'sidebar.panellist', id: 'status-sidebar', order: 20, ... })`。
  侧栏负责按钮、无障碍名称、选中态与折叠提示；本插件只提供图标组件。
- 面板内容：同一 id 作为 `main` keyed slot 的 `key`，侧栏选中该 id 即渲染本面板。
- 页面内容：`<iframe src="https://status.deepseek.com">` 铺满面板主体；顶部有标题与「刷新」按钮，
  刷新通过更换 iframe 的 React key 重新加载。加载完成前显示加载提示。
- 样式只使用宿主主题 token（`--dsw-alias-*`），不依赖任何 Harness Client 包。
- 可见文案通过 Client locale 服务（命名空间 `statusSidebar`）提供英文与中文。
- 侧栏图标在以下时机读取最新状态：网页启动时（`apply()` 立即请求一次 Host 路由
  `api/status-sidebar.feed`）；用户开始新一轮对话时（`useSessions` 中某个非 subagent
  会话的 `running` 由 false 变为 true，立即刷新并重置计时）；以及按时间定时刷新
  （最新状态为 `resolved`/`completed` 时每 10 分钟，其他可读状态每 1 分钟）。
  并发请求共享同一次读取；插件卸载时清除定时器。
- 网络断开时改用浏览器原生的 `navigator.onLine` 与 `online`/`offline` 事件（无需任何权限）：
  页面载入与每次读取前都先检查连通性，浏览器报告离线时不发出任何 feed 请求（包括加载时），
  等下一次 `online` 再走原有读取逻辑。若 `online` 到达时仍有读取在途，会在该次读取结束后
  立即重读，避免把旧请求的失败结果当成恢复后的状态。
- 浏览器在线但 feed 仍不可达时按 5s → 10s → 10s → 30s → 1min → 1min… 的间隔再确认；
  一旦可读或发生网络切换即重置该序列。
- 每次网络状态切换都会重新检测：`online`/`offline` 事件之外，还监听 `navigator.connection`
  的 `change`（按 `type`/`effectiveType` 判断是否为一次真正的网络切换，忽略仅带宽变化）；
  在线切换会立即读取并从 5s 重新退避，离线切换则暂停读取。
- Host 拉取 `feed.rss`，取第一个 `<item>` 的 `<description>`，解码 XML 实体后用
  `<p><strong>Status:</strong> {status}</p>` 的特征（捕获从 `</strong>` 后的空格之后开始）
  得到 `{status}`。
- 图标映射：`completed`/`resolved` → 绿色 `check-circle-2`；`investigating`/`identified`/
  `monitoring` → 红色 `circle-alert`；`ongoing` → 红色 `clock-alert`；`scheduled` → 黄色
  `clock`；其他状态或读取失败 → 白色（`currentColor`）`activity`。绿/红/黄取自主题 token
  `--dsw-alias-state-success/error/warn-primary`，形状内联自 `lucide-static` v1.67.0
  （ISC 许可，<https://lucide.dev/icons/>），尺寸跟随侧栏传入（展开 16px / 收起 18px），
  线宽为 `stroke-width="1.6"`。

## 版本约定

- `package.json` 的 `version` 必须与仓库当前版本一致，即最新 `v*` git tag 去掉 `v` 前缀
  （当前为 `1.1.0`，对应 tag `v1.1.0`）。
- 发版时先更新 `package.json` 的 `version`，合并到 `main` 后再打同名 tag；两者始终同步。

## 安装

插件以本地 bundle 安装到当前 profile（`web`），安装后对所有会话生效并持久化：

```bash
# 在 DSH 会话中由 plugin_manager 执行，而不是手工修改 profile
# action: install_bundle, target: /home/qwq/dsh-workshop/dsh-status-sidebar
```

卸载：`plugin_manager` 的 `remove_bundle`，目标为包名 `@local/dsh-status-sidebar`。

## 验证与限制

- 已核对 status.deepseek.com 的响应头：没有 `X-Frame-Options`，也没有限制 `frame-ancestors`
  的 CSP，因此可以嵌入。
- `feed.rss` 的响应没有 `Access-Control-Allow-Origin`，浏览器无法直接读取；因此状态由 Host
  路由 `/api/status-sidebar.feed` 代为读取（位于 Connection 的鉴权围栏内，需已登录的浏览器
  会话）。成功返回 `{ "status": "resolved" }`，无法读取时返回 `{ "status": null }`。
- 解析逻辑已用 Node 脚本对实时 feed 与全部 7 种状态样例验证；图标映射在 React 桩环境中验证
  （状态、颜色 token、图形、16px / 1.6 线宽）。Host 路由与离线回退也已单独验证。
- 刷新调度同样在 React 桩环境中验证：启动读取、10 分钟 / 1 分钟两档计时、新一轮对话触发、
  并发合并、subagent 轮次忽略；离线载入零请求、`online` 恢复、读取途中网络闪断后立即重读；
  在线不可达时 5s/10s/10s/30s/1min/1min 的连续退避；`online` 与
  `navigator.connection` 类型切换都会立即重读并重置退避；卸载移除全部监听器与定时器。
- 面板可见性受浏览器/网络影响；若状态页长时间空白，请检查本机能否直接访问该站点。
- 视觉渲染需在运行中的 Web GUI 中人工确认（本环境没有浏览器截图能力）。

## 本地 git 仓库

本目录是一个独立的 git 仓库，保存插件的完整源码与提交历史：

```bash
cd /home/qwq/dsh-workshop/dsh-status-sidebar
git log --oneline
```
