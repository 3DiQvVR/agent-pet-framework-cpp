#include "petcore/tools.hpp"

#include <cstdio>
#include <ctime>
#include <algorithm>
#include <chrono>
#include <filesystem>
#include <map>
#include <mutex>
#include <sstream>
#include <iomanip>
#include <thread>
#include <utility>

#include "petcore/errors.hpp"
#include "petcore/util.hpp"

#if defined(_WIN32)
#include <windows.h>
#include <winhttp.h>
#endif

namespace petcore {
namespace {

std::string localTimeString() {
    const std::time_t now = std::time(nullptr);
    std::tm tm{};
#if defined(_WIN32)
    localtime_s(&tm, &now);
#else
    localtime_r(&now, &tm);
#endif
    char buffer[64];
    std::strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &tm);
    return buffer;
}

json::Value makeSchema(const std::string& properties, const std::string& required) {
    return json::Value::parse("{\"type\":\"object\",\"properties\":" + properties +
                              ",\"required\":" + required + "}");
}

std::string requireString(const json::Value& args, const std::string& key) {
    if (const auto* value = args.find(key)) {
        if (value->isString() && !value->asString().empty()) return value->asString();
    }
    throw ToolError("missing required string argument: " + key);
}

#if defined(_WIN32)
std::wstring thbWiden(const std::string& s) {
    int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0);
    std::wstring w(static_cast<std::size_t>(n), L'\0');
    if (n) MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), w.data(), n);
    return w;
}
std::string thbEncode(const std::string& s) {
    std::ostringstream out;
    out << std::uppercase << std::hex;
    for (unsigned char c : s) {
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == ' ' || c == '-' || c == '_')
            out << (c == ' ' ? "+" : std::string(1, static_cast<char>(c)));
        else out << '%' << std::setw(2) << std::setfill('0') << static_cast<int>(c);
    }
    return out.str();
}
std::string thbSearchRequest(const std::string& query, int limit) {
    HINTERNET session = WinHttpOpen(L"PetCore/0.1 (THBWiki search)", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                   WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session) throw ToolError("THBWiki connection initialization failed");
    WinHttpSetTimeouts(session, 5000, 5000, 10000, 10000);
    HINTERNET connection = WinHttpConnect(session, L"thwiki.cc", INTERNET_DEFAULT_HTTPS_PORT, 0);
    const std::string path = "/api.php?action=query&list=search&srsearch=" + thbEncode(query) +
                             "&srlimit=" + std::to_string(limit) + "&format=json&utf8=1";
    HINTERNET request = connection ? WinHttpOpenRequest(connection, L"GET", thbWiden(path).c_str(),
        nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE) : nullptr;
    if (request) WinHttpAddRequestHeaders(request, L"User-Agent: PetCore/0.1 (desktop agent; THBWiki search)\r\n",
                                         static_cast<DWORD>(-1L), WINHTTP_ADDREQ_FLAG_ADD | WINHTTP_ADDREQ_FLAG_REPLACE);
    if (!request || !WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, nullptr, 0, 0, 0) ||
        !WinHttpReceiveResponse(request, nullptr)) {
        if (request) WinHttpCloseHandle(request); if (connection) WinHttpCloseHandle(connection);
        WinHttpCloseHandle(session); throw ToolError("THBWiki request failed or timed out");
    }
    std::string body; char buffer[4096]; DWORD got = 0;
    while (WinHttpReadData(request, buffer, sizeof(buffer), &got) && got) {
        if (body.size() + got > 1024 * 1024) break;
        body.append(buffer, got);
    }
    WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
    return body;
}
#endif

class ThbWikiSearchTool final : public ITool {
public:
    ToolSpec spec() const override {
        return {"thbwiki_search", "搜索 THBWiki 东方Project词条，返回标题、摘要和页面链接。", makeSchema(
            "{\"query\":{\"type\":\"string\",\"description\":\"要搜索的词条关键词\"},\"limit\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":5}}", "[\"query\"]"), "read"};
    }
    ToolResult run(const json::Value& args, ToolContext&) override {
        const auto query = util::trim(requireString(args, "query"));
        if (query.empty() || query.size() > 120) return ToolResult::failure("query must be 1-120 UTF-8 bytes");
        int limit = util::jint(args, "limit", 3);
        if (limit < 1) limit = 1;
        if (limit > 5) limit = 5;
#if defined(_WIN32)
        static std::mutex mutex;
        static std::map<std::string, std::pair<std::time_t, std::string>> cache;
        std::lock_guard<std::mutex> lock(mutex);
        const auto now = std::time(nullptr);
        const std::string cacheKey = query + "\n" + std::to_string(limit);
        auto it = cache.find(cacheKey);
        if (it != cache.end() && now - it->second.first < 1800) return ToolResult::success(it->second.second);
        static std::time_t lastRequest = 0;
        if (now - lastRequest < 1) std::this_thread::sleep_for(std::chrono::milliseconds(1000));
        lastRequest = std::time(nullptr);
        const auto data = json::Value::parse(thbSearchRequest(query, limit));
        const auto* results = data.find("query");
        const auto* search = results ? results->find("search") : nullptr;
        if (!search || !search->isArray()) return ToolResult::failure("THBWiki returned no search results");
        std::ostringstream out;
        for (const auto& item : search->array()) {
            const auto title = util::jstr(item, "title");
            auto snippet = util::jstr(item, "snippet");
            for (auto p = snippet.find('<'); p != std::string::npos; p = snippet.find('<')) {
                const auto e = snippet.find('>', p); if (e == std::string::npos) break; snippet.replace(p, e-p+1, " ");
            }
            for (const auto& entity : {std::pair<std::string,std::string>{"&amp;","&"},{"&quot;","\""},{"&#39;","'"},{"&lt;","<"},{"&gt;",">"}})
                snippet = util::replaceAll(snippet, entity.first, entity.second);
            std::string pageTitle = title;
            std::replace(pageTitle.begin(), pageTitle.end(), ' ', '_');
            out << "- " << title << "：" << util::trim(snippet) << "\n  https://thwiki.cc/" << thbEncode(pageTitle) << "\n";
        }
        const auto text = search->empty() ? "THBWiki 未找到相关词条。" : out.str();
        if (cache.size() >= 128) cache.erase(cache.begin());
        cache[cacheKey] = {now, text};
        return ToolResult::success(text);
#else
        return ToolResult::failure("THBWiki search transport currently requires Windows");
#endif
    }
};

// Long-term facts can be scoped to a character (default, shared by all chats)
// or to a single session. Todos always stay session-scoped.
const std::string& factScope(const ToolContext& context) {
    return context.memoryScope.empty() ? context.sessionId : context.memoryScope;
}

class GetTimeTool final : public ITool {
public:
    ToolSpec spec() const override {
        return ToolSpec{"get_time", "返回用户电脑上的当前本地日期与时间。", makeSchema("{}", "[]"), "read"};
    }
    ToolResult run(const json::Value&, ToolContext&) override {
        return ToolResult::success(localTimeString());
    }
};

class RememberTool final : public ITool {
public:
    ToolSpec spec() const override {
        return ToolSpec{
            "remember",
            "把一条关于用户的事实写入长期记忆。key 简短稳定，value 是具体内容。",
            makeSchema(
                "{\"key\":{\"type\":\"string\",\"description\":\"记忆键，例如 用户昵称\"},"
                "\"value\":{\"type\":\"string\",\"description\":\"记忆内容\"},"
                "\"tags\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}}}",
                "[\"key\",\"value\"]"),
            "write"};
    }
    ToolResult run(const json::Value& args, ToolContext& context) override {
        const std::string key = requireString(args, "key");
        const std::string value = requireString(args, "value");
        std::vector<std::string> tags = util::jstrings(args, "tags");
        context.memory->remember(factScope(context), key, value, tags);
        return ToolResult::success("已记住 " + key + " = " + value,
                                   json::Value::object({{"key", key}, {"value", value}}));
    }
};

class RecallTool final : public ITool {
public:
    ToolSpec spec() const override {
        return ToolSpec{
            "recall",
            "按关键词和当前保持度检索长期记忆；成功回忆会强化记忆，长期未复习的内容可能暂时遗忘。",
            makeSchema(
                "{\"query\":{\"type\":\"string\"},"
                "\"limit\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":20}}",
                "[\"query\"]"),
            "read"};
    }
    ToolResult run(const json::Value& args, ToolContext& context) override {
        const std::string query = requireString(args, "query");
        int limit = util::jint(args, "limit", 5);
        if (limit <= 0) limit = 5;
        limit = (std::min)(limit, 20);
        const auto facts = context.memory->recall(factScope(context), query, static_cast<std::size_t>(limit));
        if (facts.empty()) return ToolResult::success("没有找到相关记忆。");
        std::ostringstream out;
        for (const auto& fact : facts) out << "- " << fact.key << "：" << fact.value << "\n";
        return ToolResult::success(util::trim(out.str()));
    }
};

class SetEmotionTool final : public ITool {
public:
    ToolSpec spec() const override {
        return ToolSpec{
            "set_emotion",
            "改变桌宠当前情绪。情绪只影响语气与动画，不要每轮都调用。",
            makeSchema(
                "{\"emotion\":{\"type\":\"string\"},"
                "\"intensity\":{\"type\":\"number\",\"minimum\":0,\"maximum\":1}}",
                "[\"emotion\"]"),
            "write"};
    }
    ToolResult run(const json::Value& args, ToolContext& context) override {
        const std::string name = requireString(args, "emotion");
        if (!context.character->emotions.count(name)) {
            return ToolResult::failure("角色 " + context.character->id + " 没有情绪: " + name);
        }
        double intensity = util::jdouble(args, "intensity", 0.7);
        context.emotion->set(name, intensity);
        if (context.emit) {
            context.emit(AgentEvent{"emotion",
                                    json::Value::object({
                                        {"name", name},
                                        {"label", context.character->emotionLabel(name)},
                                        {"intensity", intensity},
                                    })});
        }
        return ToolResult::success(context.character->emotionLabel(name),
                                   context.emotion->toSessionState());
    }
};

class TodoAddTool final : public ITool {
public:
    ToolSpec spec() const override {
        return ToolSpec{
            "todo_add",
            "添加一条待办事项，返回可传给 todo_done 的 key。",
            makeSchema("{\"text\":{\"type\":\"string\"}}", "[\"text\"]"),
            "write"};
    }
    ToolResult run(const json::Value& args, ToolContext& context) override {
        const std::string text = requireString(args, "text");
        const std::string shortId = util::uuid().substr(0, 8);
        const std::string key = "todo:" + shortId;
        json::Value payload = json::Value::object({{"text", text}, {"done", false}});
        context.database->upsertFact(context.sessionId, key, payload.dump(), {"todo"});
        return ToolResult::success("已添加待办：" + text + "（key=" + key + "）",
                                   json::Value::object({{"key", key}}));
    }
};

class TodoListTool final : public ITool {
public:
    ToolSpec spec() const override {
        return ToolSpec{"todo_list", "列出当前会话的所有待办事项。", makeSchema("{}", "[]"), "read"};
    }
    ToolResult run(const json::Value&, ToolContext& context) override {
        const auto facts = context.database->listFacts(context.sessionId);
        std::ostringstream out;
        int count = 0;
        for (const auto& fact : facts) {
            if (std::find(fact.tags.begin(), fact.tags.end(), "todo") == fact.tags.end()) continue;
            json::Value payload = json::Value::object({});
            try {
                payload = json::Value::parse(fact.value);
            } catch (...) {
            }
            const std::string text = util::jstr(payload, "text", fact.value);
            const bool done = util::jbool(payload, "done", false);
            out << (done ? "[x] " : "[ ] ") << text << "  (" << fact.key << ")\n";
            ++count;
        }
        if (count == 0) return ToolResult::success("当前没有待办事项。");
        return ToolResult::success(util::trim(out.str()));
    }
};

class TodoDoneTool final : public ITool {
public:
    ToolSpec spec() const override {
        return ToolSpec{
            "todo_done",
            "把一条待办标记为完成。key 来自 todo_add 或 todo_list。",
            makeSchema("{\"key\":{\"type\":\"string\"}}", "[\"key\"]"),
            "write"};
    }
    ToolResult run(const json::Value& args, ToolContext& context) override {
        const std::string key = requireString(args, "key");
        const auto facts = context.database->listFacts(context.sessionId);
        for (const auto& fact : facts) {
            if (fact.key != key) continue;
            json::Value payload = json::Value::object({});
            try {
                payload = json::Value::parse(fact.value);
            } catch (...) {
            }
            payload["done"] = true;
            context.database->upsertFact(context.sessionId, fact.key, payload.dump(), fact.tags);
            return ToolResult::success("已完成：" + util::jstr(payload, "text", fact.key));
        }
        return ToolResult::failure("找不到待办：" + key);
    }
};

class EchoTool final : public ITool {
public:
    ToolSpec spec() const override {
        return ToolSpec{"echo", "原样返回输入，仅用于演示工具扩展。",
                        makeSchema("{\"text\":{\"type\":\"string\"}}", "[\"text\"]"), "read"};
    }
    ToolResult run(const json::Value& args, ToolContext&) override {
        return ToolResult::success(requireString(args, "text"));
    }
};

// ---------------------------------------------------------------------------
// Sandboxed file tools (opt-in via config)
// ---------------------------------------------------------------------------

class Sandbox {
public:
    explicit Sandbox(std::string root) : root_(std::filesystem::weakly_canonical(root)) {
        std::filesystem::create_directories(root_);
    }

    std::filesystem::path resolve(const std::string& relative) const {
        if (relative.empty()) return root_;
        const std::filesystem::path path(relative);
        if (path.is_absolute()) throw ToolError("absolute paths are not allowed");
        const auto candidate = std::filesystem::weakly_canonical(root_ / path);
        const std::string rootText = root_.string();
        const std::string candidateText = candidate.string();
        if (candidateText != rootText &&
            candidateText.compare(0, rootText.size() + 1, rootText + std::string(1, std::filesystem::path::preferred_separator)) != 0) {
            throw ToolError("path escapes the workspace sandbox: " + relative);
        }
        return candidate;
    }

private:
    std::filesystem::path root_;
};

class FsReadTool final : public ITool {
public:
    explicit FsReadTool(std::shared_ptr<Sandbox> sandbox) : sandbox_(std::move(sandbox)) {}
    ToolSpec spec() const override {
        return ToolSpec{"fs_read", "读取工作区内的文本文件（最大 64KB）。",
                        makeSchema("{\"path\":{\"type\":\"string\"}}", "[\"path\"]"), "read"};
    }
    ToolResult run(const json::Value& args, ToolContext&) override {
        const auto path = sandbox_->resolve(requireString(args, "path"));
        std::ifstream stream(path, std::ios::binary);
        if (!stream) return ToolResult::failure("cannot open file: " + path.string());
        std::ostringstream buffer;
        buffer << stream.rdbuf();
        std::string text = buffer.str();
        text = util::truncateUtf8(text, 65536, "\n…（已截断）");
        return ToolResult::success(text, json::Value::object({{"path", path.string()}}));
    }

private:
    std::shared_ptr<Sandbox> sandbox_;
};

class FsWriteTool final : public ITool {
public:
    explicit FsWriteTool(std::shared_ptr<Sandbox> sandbox) : sandbox_(std::move(sandbox)) {}
    ToolSpec spec() const override {
        return ToolSpec{"fs_write", "向工作区写入文本文件（会覆盖原文件，最大 256KB）。",
                        makeSchema("{\"path\":{\"type\":\"string\"},\"content\":{\"type\":\"string\"}}",
                                   "[\"path\",\"content\"]"),
                        "write"};
    }
    ToolResult run(const json::Value& args, ToolContext&) override {
        const std::string content = requireString(args, "content");
        if (content.size() > 262144) return ToolResult::failure("content is too large");
        const auto path = sandbox_->resolve(requireString(args, "path"));
        util::writeFileAtomic(path.string(), content);
        return ToolResult::success("已写入 " + path.string(),
                                   json::Value::object({{"path", path.string()}}));
    }

private:
    std::shared_ptr<Sandbox> sandbox_;
};

class FsListTool final : public ITool {
public:
    explicit FsListTool(std::shared_ptr<Sandbox> sandbox) : sandbox_(std::move(sandbox)) {}
    ToolSpec spec() const override {
        return ToolSpec{"fs_list", "列出工作区内某个目录的文件（最多两层）。",
                        makeSchema("{\"path\":{\"type\":\"string\"}}", "[]"), "read"};
    }
    ToolResult run(const json::Value& args, ToolContext&) override {
        const std::string relative = util::jstr(args, "path", "");
        const auto directory = sandbox_->resolve(relative);
        if (!std::filesystem::is_directory(directory)) return ToolResult::failure("not a directory");
        std::ostringstream out;
        int count = 0;
        for (const auto& entry : std::filesystem::recursive_directory_iterator(directory)) {
            if (entry.is_regular_file()) {
                if (count++ >= 200) {
                    out << "…\n";
                    break;
                }
                out << std::filesystem::relative(entry.path(), directory).string() << "  "
                    << entry.file_size() << " bytes\n";
            }
        }
        return ToolResult::success(out.str().empty() ? "（空目录）" : out.str());
    }

private:
    std::shared_ptr<Sandbox> sandbox_;
};

}  // namespace

void registerBuiltinTools(ToolRegistry& registry, bool includeFileTools, const std::string& workspace) {
    registry.registerTool(std::make_shared<GetTimeTool>());
    registry.registerTool(std::make_shared<RememberTool>());
    registry.registerTool(std::make_shared<RecallTool>());
    registry.registerTool(std::make_shared<SetEmotionTool>());
    registry.registerTool(std::make_shared<TodoAddTool>());
    registry.registerTool(std::make_shared<TodoListTool>());
    registry.registerTool(std::make_shared<TodoDoneTool>());
    registry.registerTool(std::make_shared<EchoTool>());
    registry.registerTool(std::make_shared<ThbWikiSearchTool>());

    if (includeFileTools) {
        auto sandbox = std::make_shared<Sandbox>(workspace);
        registry.registerTool(std::make_shared<FsReadTool>(sandbox));
        registry.registerTool(std::make_shared<FsWriteTool>(sandbox));
        registry.registerTool(std::make_shared<FsListTool>(sandbox));
    }
}

}  // namespace petcore
