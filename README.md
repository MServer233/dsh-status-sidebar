# 状态侧边栏（dsh-status-sidebar）

一个本地 DSH（DeepSeek Harness）UI 插件：在左侧栏添加名为 **状态** 的入口，点击后在中栏内嵌
显示 <https://status.deepseek.com> 的实时页面（`iframe`，不是跳转链接）。

## 结构

| 文件 | 作用 |
| --- | --- |
| `package.json` | bundle 清单：`dsh.bundle.patch` 与 `dsh.client`（Web 端懒加载模块） |
| `cordis.patch.yml` | 插入 `dsh-status-sidebar` 一行插件 |
| `index.js` | Host 半侧，空实现（面板完全由 Client 渲染） |
| `client.js` | Client 半侧：注册 `main` 面板与 `sidebar.panellist` 侧栏入口 |
| `locale/en.json`、`locale/zh.json` | 插件管理页显示用的标题与说明 |
| `icon.svg` | 插件图标（本仓库原创的脉冲折线图形） |

## 实现要点

- 侧栏入口：`ctx.slots.register({ name: 'sidebar.panellist', id: 'status-sidebar', order: 20, ... })`。
  侧栏负责按钮、无障碍名称、选中态与折叠提示；本插件只提供图标组件。
- 面板内容：同一 id 作为 `main` keyed slot 的 `key`，侧栏选中该 id 即渲染本面板。
- 页面内容：`<iframe src="https://status.deepseek.com">` 铺满面板主体；顶部有标题与「刷新」按钮，
  刷新通过更换 iframe 的 React key 重新加载。加载完成前显示加载提示。
- 样式只使用宿主主题 token（`--dsw-alias-*`），不依赖任何 Harness Client 包。
- 可见文案通过 Client locale 服务（命名空间 `statusSidebar`）提供英文与中文。

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
- 面板可见性受浏览器/网络影响；若状态页长时间空白，请检查本机能否直接访问该站点。
- 视觉渲染需在运行中的 Web GUI 中人工确认（本环境没有浏览器截图能力）。

## 本地 git 仓库

本目录是一个独立的 git 仓库，保存插件的完整源码与提交历史：

```bash
cd /home/qwq/dsh-workshop/dsh-status-sidebar
git log --oneline
```
