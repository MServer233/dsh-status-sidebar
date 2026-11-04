# 开发与发版

## 本地仓库

本目录是一个独立的 git 仓库，保存插件的完整源码与提交历史：

```bash
cd /home/qwq/dsh-workshop/dsh-status-sidebar
git log --oneline --decorate
git tag -n
```

- 默认分支为 `main`，发布使用 annotated tag（`v1.2.0`、`v1.1.0`、`v1.0.1`）。
- 仓库目前没有配置 remote，tag 与提交只存在本地。

## 版本约定

- `package.json` 的 `version` 必须与仓库最新 `v*` tag 去掉 `v` 前缀后的值一致
  （当前为 `1.2.0`，对应 `v1.2.0`）。
- 发版顺序：先在功能分支更新 `package.json` 的 `version`（并同步文档中的版本号）→ 合并到
  `main` → 在 `main` 上打同名 annotated tag。
- 功能分支合并前不要单独打版本 tag；tag 必须指向已包含对应版本号的提交。

## 改动如何生效

插件以本地 bundle 安装在 profile `web`；profile 的 `node_modules/@local/dsh-status-sidebar`
是指向本工作目录的符号链接。

- **Client 半侧**（`client.js`）：Host 会轮询该 artifact 的 mtime/ctime/size，变化后热替换浏览器
  模块；刷新页面也一定会加载新文件。
- **Host 半侧**（`index.js`、`feed.js`）：Node 已缓存模块，必须重新载入插件才会生效：

  ```text
  action: set_plugin
  target: include:dsh-status-sidebar
  enabled: false → true
  ```

  重新载入后建议再刷新一次页面，让 Client 与新 Host 对齐。
- 仅改 README/docs 不需要载入插件。

## 诊断日志

`client.js` 顶部的 `DEBUG` 是 Client 追踪日志的总开关，按分支生命周期管理：

- 开发分支（`feat/*`、`fix/*`）保持 `DEBUG = true`；合并回 `main` 前改为 `false`。
- 开启时，每次读取都会通过 `console.debug` 输出：
  - `read:start`：请求发出前的网络与轮询快照；
  - `read:result`：fetch 结果（HTTP 状态、`Status:` 值或错误）、当前网络与轮询状态、
    下一次轮询间隔 `nextDelayMs`；
  - `read:stale`：结果因网络切换被丢弃时的快照与原始结果；
  - `network:offline` / `network:online` / `network:switch`：网络事件后的快照；
  - `status:publish`：状态发布时的值与已订阅的图标数量；
  - `icon:render`：图标组件实际渲染出的状态与图形。
- 浏览器 console 默认可能隐藏 Debug/Verbose 级别；启用后可用 `[dsh-status-sidebar]` 过滤。
- 该开关不需要写进 commit 信息。

## 测试

刷新调度与网络时序有回归测试，直接运行：

```bash
cd /home/qwq/dsh-workshop/dsh-status-sidebar
node --test test/
```

`test/feed-schedule.test.mjs` 在 VM 中注入假定时器、假 `fetch`、假网络事件与 React 桩，
覆盖：

- 载入读取、10 分钟 / 1 分钟排程；
- 新一轮对话触发、subagent 忽略、并发合并；
- 离线载入零请求、`online` 恢复；
- 在线不可达时 5s/10s/10s/30s/1min/1min 退避；
- 断网瞬间发布回退图标、中止在途读取、丢弃迟到结果；
- `online` 与 `navigator.connection` 类型切换立即重读并重置退避；
- 卸载移除监听器、定时器与在途读取。

其余验证仍使用临时 Node 脚本：

1. **RSS 解析**：对实时 feed 与 7 种状态样例、原始/转义 HTML、大小写、多空格、缺失
   item/description/Status、数字实体解码逐项断言。
2. **Host 路由**：用真实 `HostConnectionService` + Cordis 挂载插件，调用
   `/api/status-sidebar.feed`，验证 `200 {"status":"resolved"}`、未知路径 `404`、插件卸载后
   路由撤销。
3. **图标映射**：在 React 桩环境中渲染组件，验证状态 → 图形/颜色 token/尺寸/线宽，以及
   读取失败时的 `activity` 回退。

## 验证与限制

- 已核对 status.deepseek.com：没有 `X-Frame-Options`，也没有限制 `frame-ancestors` 的 CSP，
  因此可以嵌入。
- `feed.rss` 没有 `Access-Control-Allow-Origin`，浏览器不能直接读取，必须经 Host 路由。
- 面板可见性受浏览器/网络影响；若状态页长时间空白，请检查本机能否直接访问该站点。
- 视觉渲染需在运行中的 Web GUI 中人工确认；本环境没有浏览器截图能力。
- 真实网络切换（不同 Wi-Fi、Wi-Fi ↔ 蜂窝）无法在本环境复现，网络行为通过模拟浏览器事件
  与不同 fetch 结果验证；同类型 Wi-Fi 之间切换可能不产生事件，最坏按 1 分钟档恢复。
