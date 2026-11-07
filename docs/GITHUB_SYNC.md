# GitHub 自动同步

此电脑通过 `scripts/setup-github-sync.ps1` 创建当前用户的 Windows 登录启动快捷方式，并启动隐藏的 PowerShell 同步进程。配置保存在本地 `.git/config`，不包含令牌。

- 每 15 秒检查一次 Git 状态；变更稳定至少 30 秒后自动执行 `git add --all`、提交、推送到配置时的分支。
- 新增、修改、删除均会提交；遵守 `.gitignore`。`config.json`、运行数据、构建产物和 `.env` 等不上传。
- 自动同步会提交尚在编辑中的代码，不保证每次提交通过编译或测试。请勿在受跟踪文件中填写密钥。
- 网络错误会记录日志，后续循环继续重试。远程发生分歧时不强制推送、不自动合并，需要手动解决。
- 切换分支、修改 origin 或检测到 Git 合并/变基操作时暂停同步，恢复原状态后继续。
- 仅在本机用户登录、进程运行且电脑未休眠时生效。移动项目目录后需要重新运行安装脚本。

启用或重新配置：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-github-sync.ps1
```

关闭自动同步并移除登录启动项：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-github-sync.ps1 -Disable
```

日志：`.git/github-sync.log`（最多约 2 MB，保留一份轮转日志）。检查状态：`git status -sb`、`git log -3 --oneline`。在另一台电脑使用需要安装 Git、配置 GitHub 身份验证，然后运行启用命令。

本机仓库已配置 GitHub HTTPS 代理 `http://127.0.0.1:7654`，与安装时的 Windows 系统代理一致。代理关闭或端口改变后，请更新本地 Git 配置：`git config --local http.https://github.com.proxy http://127.0.0.1:新端口`。不再需要代理时执行 `git config --local --unset http.https://github.com.proxy`。

安装时发现的旧任务 `PetCore-Git-AutoBackup` 已停用，由当前同步进程接替；旧脚本和日志仍保留在 `.git/` 中。
