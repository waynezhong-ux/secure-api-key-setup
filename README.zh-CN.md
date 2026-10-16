# secure-api-key-setup 中文使用说明

[English](README.md) | 简体中文

`secure-api-key-setup` 是一个可复用的 Codex Skill。它通过仅本机可访问的临时浏览器页面收集第三方 API Key，再调用目标工具官方的 Credential Store 或 Secret Store 保存凭据。

当前版本首先支持 Hypit endpoint。它不会自行建立明文密钥库，也不会要求你把 API Key 粘贴到聊天、终端命令、配置文件或环境变量中。

## 工作流程

为 Hypit endpoint 配置凭据时，这个 Skill 会：

1. 检查本机安装的 Hypit 版本；
2. 读取当前选中的 Runtime Profile；
3. 自动解析 endpoint 声明的 credential reference；
4. 使用 `hypit auth status` 检查当前状态，但不读取凭据内容；
5. 在 `127.0.0.1` 的随机端口启动临时页面；
6. 让你在 password 类型输入框中粘贴 API Key；
7. 只通过一次性的 POST body 把密钥送到本机进程；
8. 通过 stdin 调用 Hypit 官方 `hypit auth login` 保存；
9. 再次检查状态，并且只报告 `configured` 或 `missing`；
10. 保存成功后自动关闭临时本地服务。

## 使用前准备

请先确认：

- 已安装 Node.js 20 或更高版本；
- 使用支持 Skills 的 Codex；
- 本机已经安装 Hypit；
- Hypit 已选中一个 Runtime Profile；
- 目标 endpoint 已经在该 Profile 中声明；
- Hypit 官方 Credential Store 可写。

这个 Skill 只负责保存凭据，不会创建 Provider、Endpoint、binding、账户或第三方服务授权。

## 安装

### 方法一：通过 Git 克隆

将完整仓库克隆到 Codex 的 Skills 目录。

如果设置了 `CODEX_HOME`：

```powershell
git clone https://github.com/waynezhong-ux/secure-api-key-setup "$env:CODEX_HOME\skills\secure-api-key-setup"
```

如果没有设置 `CODEX_HOME`，可以使用默认目录：

```powershell
git clone https://github.com/waynezhong-ux/secure-api-key-setup "$HOME\.codex\skills\secure-api-key-setup"
```

macOS 或 Linux：

```bash
git clone https://github.com/waynezhong-ux/secure-api-key-setup "${CODEX_HOME:-$HOME/.codex}/skills/secure-api-key-setup"
```

### 方法二：下载源码

从 GitHub 下载源码压缩包，解压后把完整的 `secure-api-key-setup` 文件夹复制到：

- `$CODEX_HOME/skills/secure-api-key-setup`；或
- 未设置 `CODEX_HOME` 时的 `~/.codex/skills/secure-api-key-setup`。

不要只复制 `SKILL.md`。脚本、adapter 和安全文档必须保持原有相对目录结构。安装后，如果 Codex 没有立即发现 Skill，请重启或刷新 Codex。

## 基本用法

在 Codex 中直接调用 Skill，不要把真实 API Key 写进消息：

```text
$secure-api-key-setup 为 Hypit endpoint video.lingke 配置 API Key
```

替换已有凭据：

```text
$secure-api-key-setup 替换 Hypit endpoint images.personal 的 API Key
```

指定项目目录：

```text
在 D:\work\video-project 中使用 $secure-api-key-setup，为 Hypit endpoint speech.vendor 安全配置凭据
```

Codex 会从目标项目目录运行类似下面的本地命令：

```text
node <skill-directory>/scripts/secure-key-server.js --adapter hypit --endpoint <endpoint> --workspace <project-directory>
```

命令中不会出现 API Key，也不存在 `--key` 参数、密钥环境变量或 JSON 导入方式。

## 在浏览器页面中操作

1. 等待 Codex 自动打开本机临时页面。
2. 核对页面显示的 Endpoint 和 Credential 名称。
3. 在 **API Key** 输入框中粘贴密钥。
4. 点击 **Save securely**。
5. 页面显示 **Saved securely** 后，可以点击 **Close page**。

页面只监听 `127.0.0.1`，使用随机端口和一次性会话地址。如果页面显示 **Session expired**，关闭旧页面并重新调用 Skill，使用新打开的页面。不要刷新或重复使用旧链接。

## 如何判断是否成功

成功后，Codex 只会报告以下非敏感信息：

- Hypit 版本；
- endpoint 名称；
- credential reference；
- 状态 `configured` 或 `missing`。

Skill 不会回显 API Key，也不会显示开头、结尾、长度、哈希或其他指纹信息。

对于示例 endpoint `video.lingke`，当前 Profile 通常会把 `apiKey` slot 解析为：

```text
video.lingke.api-key
```

实际使用时以当前 Runtime Profile 自动解析的结果为准，不要手动硬编码 credential reference。

## 常见问题

### 找不到 Hypit

确认可以在同一个终端环境中运行：

```text
hypit --version
```

然后重新启动 Codex，或确保 Hypit 已加入当前用户的 PATH。

### 找不到 endpoint

确认 endpoint 已经在当前选中的 Runtime Profile 中声明，并且调用时使用了完整、准确的 endpoint instance 名称。

### Credential Store 不可写

Skill 会安全停止，不会退回到 `.env`、JSON 或临时明文文件。请先修复 Hypit 官方 Credential Store 的配置或权限，再重新运行。

### 点击保存后提示失败

保持页面打开并重试一次。如果会话已经过期，请关闭页面并重新调用 Skill。Codex 可以检查非敏感错误信息，但不应读取、显示或记录你输入的 Key。

### 状态仍然是 `missing`

这表示 Hypit 官方状态检查没有确认凭据已配置。重新运行流程即可，不要尝试从 Credential Store 读取或打印已保存值进行验证。

## 安全红线

真实 API Key 严禁出现在：

- URL 或 query string；
- 聊天内容；
- 终端命令参数；
- console 或日志；
- Git 提交；
- JSON、SVML 或 `.env`；
- 临时明文文件；
- 自动化剪贴板操作。

如果 Key 曾经出现在聊天、Issue、日志或版本库中，应把它视为已经泄露：立即到第三方服务撤销或轮换，然后使用本 Skill 录入新 Key。不要把旧 Key 再次发给 Codex。

完整安全模型请阅读 [docs/security.md](docs/security.md)。新增 adapter 前请阅读 [docs/adding-adapters.md](docs/adding-adapters.md)。

## 更新与卸载

如果使用 Git 安装，可进入 Skill 目录更新：

```text
git pull --ff-only
```

更新后建议刷新或重启 Codex。

卸载时删除整个 `secure-api-key-setup` Skill 目录即可。卸载 Skill 不会自动删除 Hypit Credential Store 中已经保存的凭据；如需删除凭据，请使用 Hypit 官方 auth/credential 管理方式。

## 开发与测试

在仓库根目录运行：

```text
npm test
npm run scan:secrets
```

测试只能使用明显的假 Key。仓库内置测试使用 `fake-test-key-do-not-use`，不会调用真实 Credential Store，也不得替换成真实凭据。

发布前请同时参考 [docs/release-checklist.md](docs/release-checklist.md)，并使用维护中的 secret scanner 检查仓库。

## 许可证

本项目使用 MIT License，详见 [LICENSE](LICENSE)。
