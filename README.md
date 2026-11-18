# PetCore 网页封测分支

本目录提供 FastAPI 聊天服务、PostgreSQL 存储和 Next.js 网页。仓库根目录仍是 C++ 桌面应用。Python 读取根目录的内置角色卡。角色设定、工具回合、情绪、历史、摘要和事实都在服务端处理。

## 本机启动

在仓库根目录设置环境变量后运行 `docker compose -f migration/compose.yaml up --build`，打开 http://localhost:3000。设置 `POSTGRES_PASSWORD` 为随机 URL 安全字符串，`INVITES_JSON` 为 JSON 对象，每个键是稳定的用户标识，值是独立生成的至少 24 字符邀请码。网页只在当前页面内存中保存邀请码。每个用户单独分配，不要把环境文件或真实数据提交到 Git。默认模型为 mock。连接真实模型时设置 `LLM_BASE_URL`、`LLM_MODEL` 和 `LLM_API_KEY`。测试账户每天默认最多发起 100 轮，可以用 `DAILY_TURNS` 调整。生产入口需另行配置 HTTPS。

也可在仓库根目录运行以下命令。需要 Python 3.12、PostgreSQL 16 和 Node.js 22 或以上版本。`DATABASE_URL` 指向独立的 PostgreSQL 数据库，账号需要建表权限。

```sh
python -m pip install -r migration/requirements.txt
python -m uvicorn migration.service.api:app --port 8000
# 另开终端
cd migration/web
npm ci
npm run dev
```

## 导入、核对和回退

1. 停止旧应用写入，复制原始 JSON、用户角色目录及引用的本地资源。确认旧配置的适配器为 json。源文件仅供读取。
2. 对空的目标用户执行 `python -m migration.service.store import USER snapshot.json --user-cards characters`。没有用户卡目录时省略该参数。`CARD_DIRS` 仅允许部署者指定所有账号共享的基础卡库，使用系统路径分隔符。用户卡按文件名顺序覆盖基础卡，数据库卡最后覆盖。导入脚本保留原始字段；损坏的引用、重复序号或非法 JSON 使整个事务回滚。相同文件和相同用户卡重复导入返回 already imported。
3. 在首次聊天或查看记忆之前执行 `python -m migration.service.store export USER check.json --user-cards check-characters`。输出必须使用新路径。逐会话比较消息 ID、序号、工具参数和结果，再核对角色覆盖、摘要边界、事实及强化时间。备份原始 Live2D 等资源目录，导入器不复制二进制资源。
4. 验收后将该用户的写入口切到新服务。回退前暂停该用户流量，导出最新 JSON 与角色文件，在独立的 C++ 数据目录验证会话及事实后再切换。保留原始快照。PostgreSQL 的额度、请求去重记录只供网页端使用，整库备份应使用 pg_dump 并在隔离库演练 pg_restore。
5. 小批封测前，用测试用户检查首次响应时延、限额和 API 消耗。仓库中的 Docker 配置默认只向本机开放网页。桌面浮窗、文件工具、网络搜索和完整角色编辑器属于后续功能。

## 验证

在独立测试库中运行 `python -m unittest discover -s migration/tests -v`。测试会创建独立的随机用户。C++ 基线执行 `cmake -S . -B build`、`cmake --build build --config Release`、`ctest --test-dir build -C Release --output-on-failure`。进入 migration/web 运行 `npm ci && npm run build` 检查页面与类型。

浏览器以 Bearer 邀请码读取 /api/characters、/api/sessions 和 /api/memory。POST /api/chat 接收 session_id、message 和可选的 request_id（UUID）。同一轮重试应复用 request_id。事件使用 data 行内的 type 和 data。done 在整轮事务提交后发送。错误或额度不足在流中说明。客户端用已保存历史恢复页面，用完整回复校正分片。每个会话的写入串行，不同会话可同时调用模型。共享事实或遗忘版本发生冲突会结束本轮，并提示刷新重试。

这一版按角色读取该用户的会话数据并在内存中计算差异，适用于小批封测。扩容前需要用真实分布的脱敏样本测量大历史内存消耗、延迟和数据库连接数。
