# Codex++ 会话列表突破脚本

这是一个用于 [Codex++](https://github.com/b-nnett/codex-plusplus) 的用户脚本，目标是在 Codex Desktop 左侧原生会话列表里尽量显示更多本地历史会话，并让补充出来的旧会话可以正常点击打开。

> 这不是 OpenAI Codex 官方功能，也不是 Codex++ 主项目内置功能。它依赖 Codex Desktop 当前版本的前端内部接口，升级 Codex 后可能需要调整。

## 解决什么问题

Codex Desktop 的会话列表有时只加载最近约 50 条会话。即使本地数据库和 rollout 文件里还有更多历史会话，左侧列表也不一定显示。

这个脚本做了几件事：

- 自动点击侧边栏项目下的“展开显示 / Show more”按钮。
- 尝试把缺失的历史会话批量推进 Codex 原生 recent 缓存。
- 对仍然不能进入原生列表的会话，追加一个 `Extra history` 兜底分组。
- 点击 `Extra history` 中的旧会话时，先调用 Codex 内部恢复流程，再打开原生会话页，避免一直转圈加载。

## 适用环境

已实测环境：

- Windows
- Codex Desktop `26.513.4821.0`
- Codex++ `1.1.2`

理论上只要 Codex++ 支持用户脚本，且 Codex Desktop 的相关内部模块路径没有变化，就可能可用。

## 安装方法

1. 安装并启用 Codex++。
2. 打开 Codex++ 用户脚本目录：

   ```text
   %APPDATA%\Codex++\user_scripts
   ```

3. 把脚本复制进去：

   ```text
   scripts/codex-list-pagebuster.js
   ```

4. 重启 Codex Desktop，或者通过 Codex++ 重新加载用户脚本。

如果你当前机器已经有本脚本，可以直接覆盖同名文件：

```text
%APPDATA%\Codex++\user_scripts\codex-list-pagebuster.js
```

## 使用方式

脚本加载后会自动运行。正常情况下你会看到：

- 一部分历史会话直接出现在 Codex 原生项目分组里。
- 少数无法被原生 recent 列表接收的会话会出现在 `Extra history` 分组。

可以在开发者控制台检查状态：

```js
window.__codexListPagebuster.status()
```

手动触发扫描：

```js
window.__codexListPagebuster.expand()
```

停止脚本：

```js
window.__codexListPagebuster.stop()
```

## 为什么还有少数会话在 Extra history

有些会话即使数据库里存在，也可能被 Codex 原生列表过滤掉，例如：

- 来源是旧的 `vscode` 会话。
- `cwd` 路径带 Windows `\\?\` 前缀或路径非常特殊。
- 来源是内部子代理 / guardian / 审批类会话。
- 标题异常长或为空。

这类会话脚本会保留在 `Extra history` 作为兜底。点击时仍会尝试调用 Codex 内部的恢复流程，所以通常可以正常打开。

## 工作原理

脚本主要使用三层策略：

1. DOM 层：自动点击侧边栏的展开按钮。
2. 原生缓存层：调用 Codex 前端内部动作 `load-recent-conversation-ids-for-host`，让更多历史会话进入原生 recent 缓存。
3. 兜底打开层：点击补充行时调用 `maybe-resume-conversation`，再用 `windows.show_thread` 打开原生会话页。

## 风险说明

- 该脚本使用 Codex Desktop 的内部前端模块：

  ```js
  import("./assets/app-server-manager-signals-zAr_ejg8.js")
  ```

  文件名可能随 Codex Desktop 更新而变化。

- 脚本不会修改 SQLite 数据库，不会删除或改写会话记录。
- 如果 Codex 更新后脚本失效，删除用户脚本或调用 `window.__codexListPagebuster.stop()` 即可停用。

## 和 Codex++ 的关系

本项目是 Codex++ 的第三方用户脚本示例。Codex++ 提供注入脚本能力，本项目只是在这个能力上做了一个具体用途：增强 Codex Desktop 本地会话列表。

Codex++ 主项目：

- <https://github.com/b-nnett/codex-plusplus>

## License

MIT
