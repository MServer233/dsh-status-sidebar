# 使用说明

## 功能

- 在 DSH Web GUI 左侧栏添加名为 **状态** 的入口（order 20）。
- 点击入口后，在中栏内嵌显示 <https://status.deepseek.com> 的实时页面（`iframe`，不是跳转链接）。
- 面板顶部有标题与「刷新」按钮；刷新会重新加载 `iframe`。
- 侧栏入口的图标会反映状态 RSS 中最新一条事件的 `Status:` 值。

## 侧栏图标

| `Status:` 值 | 图标 | 颜色 |
| --- | --- | --- |
| `completed`、`resolved` | `check-circle-2` | 绿 |
| `investigating`、`identified`、`monitoring` | `circle-alert` | 红 |
| `ongoing` | `clock-alert` | 红 |
| `scheduled` | `clock` | 黄 |
| 其他值、尚未读取、读取失败或断网 | `activity` | 主题主墨色（深色主题下为白） |

- 颜色取自宿主主题 token：`--dsw-alias-state-success-primary`、`--dsw-alias-state-error-primary`、
  `--dsw-alias-state-warn-primary`；回退图标使用 `currentColor`。
- 图标尺寸跟随侧栏：展开 16px、收起 18px；线宽 1.6。

## 刷新时机

- **页面载入**：在线时立即读取一次；浏览器报告离线时不发请求，等恢复在线后再读。
- **新一轮对话**：某个非 subagent 会话的 `running` 由 false 变为 true 时立即读取。
- **定时刷新**（基于最近一次成功读取的状态）：
  - `resolved` / `completed`：每 10 分钟。
  - 其他可读状态：每 1 分钟。
- **在线但 feed 不可达**：按 `5s → 10s → 10s → 30s → 1min → 1min…` 的间隔再确认。
- **断网**：`offline` 事件立即把图标切回 `activity`，同时取消定时器并中止在途读取；
  断网前的状态不会再显示，离线期间也不发出任何 feed 请求。
- **恢复在线 / 换网**：`online` 事件，以及 `navigator.connection` 的 `type`/`effectiveType`
  变化都会立即重读并从 5s 重置退避；在途读取会被丢弃，旧链路的结果不会覆盖新状态。

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

- 面板可见性受浏览器/网络影响；若状态页长时间空白，请检查本机能否直接访问该站点。
- 视觉渲染需在运行中的 Web GUI 中人工确认（本环境没有浏览器截图能力）。
- 同类型 Wi-Fi 之间切换（SSID 不同但 `type`/`effectiveType` 相同）时浏览器可能不产生事件；
  此时最坏按 1 分钟档恢复。
