#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <map>
#include <optional>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "petcore/config.hpp"
#include "petcore/http_server.hpp"
#include "petcore/runtime.hpp"
#include "petcore/util.hpp"

#if defined(_WIN32)
#include <windows.h>
#include <shellapi.h>
#endif

namespace {

using petcore::AgentEvent;
using petcore::AppConfig;
using petcore::CharacterCard;
using petcore::HttpServer;
using petcore::Runtime;

#if defined(_WIN32)
std::string wideToUtf8(const std::wstring& text) {
    if (text.empty()) return {};
    const int size = WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()),
                                         nullptr, 0, nullptr, nullptr);
    std::string result(static_cast<std::size_t>(size), '\0');
    WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), result.data(), size,
                        nullptr, nullptr);
    return result;
}
#endif

std::vector<std::string> utf8Arguments(int argc, char** argv) {
#if defined(_WIN32)
    int wideCount = 0;
    LPWSTR* wideArgs = CommandLineToArgvW(GetCommandLineW(), &wideCount);
    if (wideArgs) {
        std::vector<std::string> args;
        args.reserve(static_cast<std::size_t>(wideCount));
        for (int i = 0; i < wideCount; ++i) args.push_back(wideToUtf8(wideArgs[i]));
        LocalFree(wideArgs);
        return args;
    }
#endif
    return std::vector<std::string>(argv, argv + argc);
}

struct Options {
    std::string command = "ui";
    std::string configPath;
    std::string cardId;
    std::string message;
    std::string name;
    int port = 0;
    bool noOpen = false;
    std::vector<std::string> positional;
};

Options parseOptions(const std::vector<std::string>& args) {
    Options options;
    std::size_t start = 1;
    // No arguments (double-click) -> UI. An option as first token also means UI.
    if (args.size() > 1 && !args[1].empty() && args[1][0] != '-') {
        options.command = args[1];
        start = 2;
    }
    for (std::size_t i = start; i < args.size(); ++i) {
        const std::string& arg = args[i];
        auto value = [&](const std::string& flag) -> std::string {
            if (i + 1 >= args.size()) throw std::runtime_error("missing value for " + flag);
            return args[++i];
        };
        if (arg == "--config") options.configPath = value(arg);
        else if (arg == "--card") options.cardId = value(arg);
        else if (arg == "--message" || arg == "-m") options.message = value(arg);
        else if (arg == "--name") options.name = value(arg);
        else if (arg == "--port") options.port = std::stoi(value(arg));
        else if (arg == "--no-open") options.noOpen = true;
        else if (arg == "--no-wait") { /* retained for compatibility; UI stays alive */ }
        else if (arg == "--help" || arg == "-h") options.command = "help";
        else if (!arg.empty() && arg[0] == '-') throw std::runtime_error("unknown option: " + arg);
        else options.positional.push_back(arg);
    }
    return options;
}

void printCards(const Runtime& runtime) {
    const auto cards = runtime.characters().list();
    if (cards.empty()) {
        std::cout << "没有找到角色卡。\n";
        for (const auto& error : runtime.characters().errors()) std::cout << "  ! " << error << "\n";
        return;
    }
    std::cout << "\n可用的桌宠角色卡（" << cards.size() << "）：\n";
    for (std::size_t i = 0; i < cards.size(); ++i) {
        const auto& card = *cards[i];
        std::cout << "  " << (i + 1) << ") " << card.emoji << "  " << card.name << "  [" << card.id
                  << "]\n      " << card.tagline << "\n";
    }
    std::cout << "\n";
}

std::shared_ptr<const CharacterCard> chooseCard(Runtime& runtime, const std::string& preset) {
    if (!preset.empty()) return runtime.characters().get(preset);
    const auto cards = runtime.characters().list();
    if (cards.empty()) throw std::runtime_error("没有可用的角色卡，请检查 characters.dirs");
    printCards(runtime);

    for (int attempt = 0; attempt < 3; ++attempt) {
        std::cout << "选择角色（序号或 id，回车选 1）> " << std::flush;
        std::string line;
        if (!std::getline(std::cin, line)) break;
        line = petcore::util::trim(line);
        if (line.empty()) return cards.front();
        try {
            const std::size_t index = static_cast<std::size_t>(std::stoul(line));
            if (index >= 1 && index <= cards.size()) return cards[index - 1];
        } catch (...) {
        }
        for (const auto& card : cards) {
            if (card->id == line) return card;
        }
        std::cout << "没有这个角色，再试一次。\n";
    }
    return cards.front();
}

void printEvent(const CharacterCard& card, const AgentEvent& event) {
    static bool streamingAssistant = false;
    if (event.type == "assistant_delta") {
        if (!streamingAssistant) { std::cout << card.name << " > "; streamingAssistant = true; }
        std::cout << petcore::util::jstr(event.data, "content") << std::flush;
    } else if (event.type == "done") {
        if (streamingAssistant) { std::cout << "\n"; streamingAssistant = false; }
    } else if (event.type == "assistant") {
        if (!streamingAssistant) std::cout << card.name << " > " << petcore::util::jstr(event.data, "content") << "\n";
    } else if (event.type == "tool_call") {
        std::cout << "  · 调用 " << petcore::util::jstr(event.data, "name") << " "
                  << event.data.at("arguments").dump() << "\n";
    } else if (event.type == "tool_result") {
        std::string content = petcore::util::jstr(event.data, "content");
        if (content.size() > 300) content = content.substr(0, 300) + "…";
        std::cout << "  · 结果 " << (petcore::util::jbool(event.data, "ok") ? "✓ " : "✗ ") << content
                  << "\n";
    } else if (event.type == "emotion") {
        std::cout << "  · 情绪 → " << petcore::util::jstr(event.data, "label") << "\n";
    } else if (event.type == "policy_denied") {
        std::cout << "  · 已拦截 " << petcore::util::jstr(event.data, "name") << "（"
                  << petcore::util::jstr(event.data, "reason") << "）\n";
    } else if (event.type == "error") {
        std::cout << "  ! " << petcore::util::jstr(event.data, "message") << "\n";
    }
}

void printHistory(Runtime& runtime, const std::string& sessionId) {
    const auto records = runtime.database().getMessages(sessionId, 20, 0);
    for (const auto& record : records) {
        const std::string role = record.message.role == "user" ? "你" : "桌宠";
        std::cout << role << "：" << record.message.content << "\n";
    }
}

void printMemory(Runtime& runtime, const std::string& sessionId) {
    const auto session = runtime.sessions().get(sessionId);
    const auto card = runtime.sessions().cardFor(session);
    const auto facts = runtime.database().listFacts(card->memoryScope == "session" ? sessionId : "character:" + card->id);
    if (facts.empty()) {
        std::cout << "（还没有长期记忆）\n";
        return;
    }
    for (const auto& fact : facts) {
        std::cout << "- " << fact.key << "：" << fact.value << "\n";
    }
}

std::string templateCard(const std::string& id, const std::string& name) {
    const std::string text = R"JSON({
  "schema_version": 1,
  "id": "{{ID}}",
  "name": "{{NAME}}",
  "tagline": "一句话介绍你的桌宠",
  "emoji": "🌱",
  "color": "#7aa2d6",
  "greeting": "嗨，我是{{NAME}}。",
  "persona": {
    "system": "你是{{NAME}}，一个住在电脑桌面上的小伙伴。你真诚、好奇，会承认自己不知道的事情。",
    "speaking_style": "口语化，短句，偶尔用一点颜文字。",
    "boundaries": ["不假装是人类", "不编造工具结果", "不泄露用户隐私"]
  },
  "emotions": {
    "neutral": {"label": "平静", "color": "#8fa3bf"},
    "happy": {"label": "开心", "color": "#ffd166"},
    "sad": {"label": "低落", "color": "#7aa2d6"},
    "curious": {"label": "好奇", "color": "#9b8cff"}
  },
  "default_emotion": "neutral",
  "tools": {"allow": ["get_time", "remember", "recall", "set_emotion", "todo_*"], "deny": []},
  "memory": {"history_limit": 20},
  "voice": {"provider": "none", "voice_id": ""},
  "metadata": {"author": "you", "version": "1.0.0", "tags": ["自定义"]}
})JSON";
    return petcore::util::replaceAll(petcore::util::replaceAll(text, "{{ID}}", id), "{{NAME}}", name);
}

int runDoctor(Runtime& runtime) {    std::cout << "PetCore doctor\n==============\n";
    std::cout << "config: " << (runtime.config().configPath.empty() ? "(defaults)" : runtime.config().configPath) << "\n";
    std::cout << runtime.config().toPublicJson().dump(2) << "\n";
    std::cout << "cards: " << runtime.characters().list().size() << "\n";
    for (const auto& error : runtime.characters().errors()) std::cout << "  ! " << error << "\n";
    std::cout << "sessions: " << runtime.sessions().list(1000).size() << "\n";
    std::cout << "tools: " << petcore::util::join(runtime.tools().names(), ", ") << "\n";
    std::cout << "providers: " << petcore::util::join(petcore::LLMRegistry::available(), ", ") << "\n";
    std::cout << "databases: " << petcore::util::join(petcore::DatabaseRegistry::available(), ", ") << "\n";
    return 0;
}

int runChat(Runtime& runtime, const Options& options) {
    auto card = chooseCard(runtime, options.cardId);
    auto current = runtime.sessions().create(card->id);
    std::cout << "\n" << card->emoji << " " << card->name << " 已上线。输入 /help 查看命令。\n";
    std::cout << card->name << " > " << current.greeting.content << "\n";

    if (!options.message.empty()) {
        runtime.chat(current.session.id, options.message, [&](const AgentEvent& event) {
            printEvent(*card, event);
        });
        return 0;
    }

    std::string line;
    while (true) {
        std::cout << "\n你 > " << std::flush;
        if (!std::getline(std::cin, line)) break;
        line = petcore::util::trim(line);
        if (line.empty()) continue;
        if (line == "/quit" || line == "/exit") break;
        if (line == "/help") {
            std::cout << "/cards  列出角色卡\n/switch 换一个角色\n/history 查看最近对话\n"
                         "/memory 查看长期记忆\n/quit   退出\n";
            continue;
        }
        if (line == "/cards") {
            printCards(runtime);
            continue;
        }
        if (line == "/switch") {
            card = chooseCard(runtime, "");
            current = runtime.sessions().create(card->id);
            std::cout << card->name << " > " << current.greeting.content << "\n";
            continue;
        }
        if (line == "/history") {
            printHistory(runtime, current.session.id);
            continue;
        }
        if (line == "/memory") {
            printMemory(runtime, current.session.id);
            continue;
        }
        runtime.chat(current.session.id, line, [&](const AgentEvent& event) {
            printEvent(*card, event);
        });
    }
    std::cout << "\n下次见。\n";
    return 0;
}

void openBrowser(const std::string& url) {
#if defined(_WIN32)
    const std::wstring wide(url.begin(), url.end());
    ShellExecuteW(nullptr, L"open", wide.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
#else
    const std::string command = "xdg-open '" + url + "' >/dev/null 2>&1 &";
    (void)std::system(command.c_str());
#endif
}

int runUi(Runtime& runtime, const Options& options) {
    const int port = options.port > 0 ? options.port : runtime.config().ui.port;
    const std::string webRoot = runtime.config().baseDir + "/web";
    if (!std::filesystem::exists(webRoot + "/index.html")) {
        std::cerr << "warning: web UI not found at " << webRoot << "\n";
    }
    HttpServer server(runtime, runtime.config().ui.host, port, webRoot);
    server.start();
    const std::string url = server.url();
    std::cout << "PetCore UI: " << url << "\n";
    if (runtime.config().ui.openBrowser && !options.noOpen) openBrowser(url);
    std::cout << "按 Ctrl+C 停止（关闭此窗口也会停止服务）。\n" << std::flush;
    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
}

}  // namespace

int main(int argc, char** argv) {
#if defined(_WIN32)
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
#endif
    std::ios::sync_with_stdio(false);

    try {
        const Options options = parseOptions(utf8Arguments(argc, argv));
        if (options.command == "help" || options.command == "--help") {
            std::cout
                << "PetCore — 自主闭环型桌宠框架\n\n"
                << "用法:\n"
                << "  petcore                    启动 UI 并自动打开浏览器（双击 exe 即可）\n"
                << "  petcore list   [--config config.json]\n"
                << "  petcore chat   [--config config.json] [--card id] [--message \"...\"]\n"
                << "  petcore ui     [--config config.json] [--port 8787] [--no-open]\n"
                << "  petcore doctor [--config config.json]\n"
                << "  petcore new-card <id> [--name 名称] [--config config.json]\n";
            return 0;
        }

        AppConfig config = AppConfig::load(options.configPath);
        Runtime runtime(config);

        if (options.command == "list" || options.command == "cards") {
            printCards(runtime);
            for (const auto& error : runtime.characters().errors()) std::cout << "! " << error << "\n";
            return 0;
        }
        if (options.command == "doctor") return runDoctor(runtime);
        if (options.command == "ui") return runUi(runtime, options);
        if (options.command == "new-card") {
            if (options.positional.empty()) throw std::runtime_error("new-card requires an id");
            const std::string id = options.positional.front();
            const std::string name = options.name.empty() ? id : options.name;
            std::filesystem::create_directories(config.characters.userDir);
            const std::string path = config.characters.userDir + "/" + id + ".json";
            if (std::filesystem::exists(path)) throw std::runtime_error("card already exists: " + path);
            petcore::util::writeFileAtomic(path, templateCard(id, name));
            std::cout << "已创建角色卡: " << path << "\n";
            return 0;
        }
        if (options.command == "chat") return runChat(runtime, options);

        std::cerr << "unknown command: " << options.command << "\n";
        return 2;
    } catch (const std::exception& error) {
        std::cerr << "error: " << error.what() << "\n";
        return 1;
    }
}
