# 接入数据库

PetCore 的持久化只依赖一个接口：`petcore::IDatabase`（见 `include/petcore/database.hpp`）。
运行时通过 `DatabaseRegistry` 创建适配器，Agent、Web UI、角色卡注册表都不关心底层是文件、PostgreSQL 还是别的服务。

## 1. 当前内置的适配器

| adapter | 说明 | 配置 |
|---|---|---|
| `json` | 默认；单文件 JSON，原子写入，零依赖 | `{"adapter":"json","path":"data/petcore.json"}` |
| `memory` | 进程内内存，退出即丢，适合测试 | `{"adapter":"memory"}` |

**当前编译出的 `PetCore.exe` 只包含这两个适配器**。直接写 `"adapter":"postgres"` 会报：

```
unknown database adapter 'postgres'. Available: json, memory
```

要接 PostgreSQL/MySQL 等，需要把对应适配器编译进程序（见下文）。

## 2. 最快路径：继续用内置 JSON 数据库

`config.json`：

```json
{
  "database": {
    "adapter": "json",
    "path": "data/petcore.json",
    "options": {}
  }
}
```

- 路径相对 `config.json` 所在目录解析
- 包含 `sessions`、`messages`、`facts`、`characters` 四个节点
- 自定义角色卡、会话、记忆都在这个文件里
- 备份 = 复制文件；迁移 = 把文件放到新机器同路径

> 注意：JSON 适配器适合单进程桌面使用；不要多个 PetCore 实例同时写同一个文件。

## 3. 接入 PostgreSQL（完整步骤）

`examples/postgres_database.cpp.example` 是一份可用的 libpq 实现，包含：
会话、消息、事实、角色卡 CRUD，以及自动建表。

### 3.1 安装 libpq

任选一种：

```powershell
# vcpkg
vcpkg install libpq:x64-windows

# 或安装 PostgreSQL 官方 Windows 包，自带 libpq / pg_config
```

确保 CMake 能找到 `libpq-fe.h` 与 `libpq.lib`。

### 3.2 把示例变成真实源文件

```powershell
Copy-Item examples\postgres_database.cpp.example src\postgres_database.cpp
```

在 `CMakeLists.txt` 的 `PETCORE_SOURCES` 中加入：

```cmake
src/postgres_database.cpp
```

并链接 libpq：

```cmake
find_package(PostgreSQL REQUIRED)
target_link_libraries(petcore_core PUBLIC PostgreSQL::PostgreSQL)
```

如果使用 vcpkg，配置时加：

```powershell
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=<vcpkg>/scripts/buildsystems/vcpkg.cmake
```

### 3.3 注册适配器

在 `src/main.cpp` 顶部、`main()` 之前声明：

```cpp
namespace petcore {
void registerPostgresDatabase();
}
```

在 `main()` 里、**构造 `Runtime` 之前**调用：

```cpp
AppConfig config = AppConfig::load(options.configPath);
petcore::registerPostgresDatabase();   // 必须在 Runtime 之前
Runtime runtime(config);
```

`registerPostgresDatabase()` 已经在示例文件末尾实现，内部就是：

```cpp
DatabaseRegistry::registerFactory("postgres", [](const DatabaseConfig& config) {
    return std::make_unique<example::PostgresDatabase>(config);
});
```

### 3.4 修改 config.json

```json
{
  "database": {
    "adapter": "postgres",
    "path": "",
    "options": {
      "dsn": "host=127.0.0.1 port=5432 dbname=petcore user=petcore password=你的密码"
    }
  }
}
```

DSN 使用 libpq 的连接串格式；也可以写成 URL：

```
postgresql://petcore:密码@127.0.0.1:5432/petcore
```

### 3.5 启动与验证

```powershell
.\PetCore.exe doctor
```

应能看到：

```
databases: json, memory, postgres
```

启动 UI 后创建自定义角色、聊天、写记忆，然后验证：

```sql
SELECT id, payload FROM pc_characters;
SELECT id, character_id, title FROM pc_sessions;
SELECT session_id, key, value FROM pc_facts;
```

适配器在 `initialize()` 中自动创建：

- `pc_sessions`
- `pc_messages`
- `pc_facts`
- `pc_characters`

## 4. 接 MySQL / SQL Server / Redis / 远程服务

实现 `IDatabase` 的全部方法，注册一个新名字即可：

```cpp
class MyDatabase final : public petcore::IDatabase {
public:
    explicit MyDatabase(const petcore::DatabaseConfig& config) { /* 读取 config.options */ }

    void initialize() override;   // 建表/建索引
    void close() override;

    // 会话
    petcore::SessionRecord createSession(const std::string& characterId,
                                         const std::string& title) override;
    std::optional<petcore::SessionRecord> getSession(const std::string& id) override;
    std::vector<petcore::SessionRecord> listSessions(std::size_t limit) override;
    void updateSession(const petcore::SessionRecord& session) override;

    // 消息
    petcore::MessageRecord appendMessage(const std::string& sessionId,
                                         const petcore::Message& message) override;
    std::vector<petcore::MessageRecord> getMessages(const std::string& sessionId,
                                                    std::size_t limit, int afterSeq) override;
    int countMessages(const std::string& sessionId) override;

    // 长期记忆
    void upsertFact(const std::string& sessionId, const std::string& key,
                    const std::string& value,
                    const std::vector<std::string>& tags) override;
    std::vector<petcore::FactRecord> listFacts(const std::string& sessionId) override;

    // 自定义角色卡
    void upsertCharacter(const petcore::CharacterRecord& character) override;
    std::optional<petcore::CharacterRecord> getCharacter(const std::string& id) override;
    std::vector<petcore::CharacterRecord> listCharacters() override;
    bool deleteCharacter(const std::string& id) override;
};

// 注册，仍然要在 Runtime 之前
petcore::DatabaseRegistry::registerFactory("mydb", [](const petcore::DatabaseConfig& config) {
    return std::make_unique<MyDatabase>(config);
});
```

配置：

```json
{
  "database": {
    "adapter": "mydb",
    "options": { "host": "...", "port": 3306, "user": "...", "password": "...", "database": "petcore" }
  }
}
```

`config.options` 是自由 JSON，适配器自己解释，不需要改框架。

## 5. 数据模型约定

| 数据 | 关键字段 |
|---|---|
| 会话 | `id`, `character_id`, `title`, `summary`, `summary_upto`, `state`(JSON 文本), `created_at`, `updated_at` |
| 消息 | `id`, `session_id`, `seq`, `role`, `content`, `tool_calls`(JSON 文本), `tool_call_id`, `name`, `created_at` |
| 事实 | `session_id`（或 `character:<id>`）, `key`, `value`, `tags`, `created_at`, `updated_at` |
| 角色卡 | `id`, `payload`(完整角色卡 JSON), `created_at`, `updated_at` |

实现时注意：

- `seq` 必须在同一会话内单调递增；`getMessages(limit, afterSeq)` 依赖它
- `tool_calls` 建议直接存 `message.toJson()["tool_calls"].dump()`，读回时用 `Message::fromJson`
- 角色卡 `payload` 原样存 JSON 字符串，Registry 会解析并校验
- 读接口要线程安全；Web UI 会并发读列表，聊天会写消息

## 6. 从 JSON 迁移到 PostgreSQL

1. 先让 PostgreSQL 适配器跑通 `doctor`
2. 启动一次，让 `initialize()` 建表
3. 迁移角色卡最简单：在 UI 里重新创建，或把 `data/petcore.json` 中 `characters[*].payload` 插入 `pc_characters`
4. 会话/消息如要保留，写一次性脚本读取 JSON 并 `INSERT`；注意保持 `seq` 顺序

## 7. 常见问题

**Q：改了 `adapter` 仍报 unknown？**
A：适配器没有编译进程序。确认 `src/postgres_database.cpp` 在 CMake sources 里，且注册函数在 `Runtime` 之前调用。

**Q：连接失败？**
A：看 `doctor`/控制台错误；先用 `psql` 用同一 DSN 验证网络、密码、pg_hba.conf。

**Q：多个 PetCore 同时连一个库？**
A：可以，但 `appendMessage` 的 `seq = max(seq)+1` 需要数据库事务或唯一约束重试；示例是单进程假设。

**Q：角色卡删除后内置卡又回来了？**
A：这是设计行为。`cards/` 是只读底稿，数据库卡是覆盖层；删除覆盖层就回退到内置卡。
