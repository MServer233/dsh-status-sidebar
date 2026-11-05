# 使用说明

## 功能

- 在 DSH Web GUI 左侧栏添加名为 **状态** 的入口（order 20）。
- 点击入口后，在中栏内嵌显示 <https://status.deepseek.com> 的实时页面（`iframe`，不是跳转链接）。
- 面板顶部有标题与「刷新」按钮；刷新会重新加载 `iframe`。
- 侧栏入口的图标会反映状态 RSS 中最新一条事件的 `Status:` 值。

## 侧栏图标

| 状态 | 图标 | 颜色 |
| --- | --- | --- |
| `completed`、`resolved` | `check-circle-2` | 绿 |
| 缺省：其他未知值 | `activity` | `currentColor` |
| 首次读取尚未完成（等待 fetch 返回） | `history` | `currentColor` |
| `investigating`、`identified`、`monitoring` | `circle-alert` | 红 |
| `ongoing` | `calendar-sync` | 红 |
| `scheduled` | `calendar-clock` | 黄 |
| 网络异常、读取失败或断网 | `wifi-off` | 红 |

- 颜色取自宿主主题 token：`--dsw-alias-state-success-primary`、`--dsw-alias-state-error-primary`、
  `--dsw-alias-state-warn-primary`；其余图标使用 `currentColor`（主题主墨色，深色主题下为白）。
- 图标尺寸跟随侧栏：展开 16px、收起 18px；线宽 1.6。

## 刷新时机

- **页面载入**：在线时立即读取一次，读取完成前显示 `history`；浏览器报告离线时直接显示
  `wifi-off` 并启动探测，恢复后再读。
- **新一轮对话**：某个非 subagent 会话的 `running` 由 false 变为 true 时立即读取。
- **定时刷新**（基于最近一次成功读取的状态）：
  - `resolved` / `completed`：每 10 分钟。
  - 其他可读状态：每 1 分钟。
- **在线但 feed 不可达**：按 `5s → 10s → 10s → 30s → 1min → 1min…` 的间隔再确认。
- **断网 / 恢复**：每 15 秒向 Host 发一次轻量探测（`HEAD feed.rss`，不读正文）。Host 无法
  连通时图标立即切到 `wifi-off`，并改为每 5 秒探测一次；恢复后立即读取 feed。
- 浏览器的 `offline` / `online` 事件仍作即时提示；若 `navigator.onLine` 因虚拟网卡、VM
  网络等原因没有变化，主动探测仍会在一个探测周期内发现断网。
- **换网**：`navigator.connection` 的 `type`/`effectiveType` 变化会立即探测并重读；在途读取
  与探测的旧结果都会被丢弃，不会覆盖新状态。

## 安装与卸载

插件以本地 bundle 安装到当前 profile（`web`），安装后对所有会话生效并持久化。安装通过
`plugin_manager` 执行，不要手工修改 profile：

```text
action: install_bundle
target: /home/qwq/dsh-workshop/dsh-status-sidebar
```

卸载：

```text
action: remove_bundle
target: @local/dsh-status-sidebar
```

重新载入（例如 Host 半侧改动后）：

```text
action: set_plugin
target: include:dsh-status-sidebar
enabled: false → true
```

## 已知限制

- 断网检测依赖 15 秒探测周期：最坏约 18 秒（含 3 秒 HEAD 超时）才切到 `wifi-off`；恢复后
  约 5 秒内开始读取。可调整 `client.js` 的 `PROBE_HEALTHY_MS` / `PROBE_OFFLINE_MS`。
- 探测是 Host 对 feed 地址的 `HEAD` 请求，只判断连通性，不下载 feed 正文。
- 面板可见性受浏览器/网络影响；若状态页长时间空白，请检查本机能否直接访问该站点。
- 视觉渲染需在运行中的 Web GUI 中人工确认（本环境没有浏览器截图能力）。
