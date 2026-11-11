#include "petcore/config.hpp"

#include <algorithm>
#include <filesystem>
#include <vector>

#include "petcore/errors.hpp"
#include "petcore/util.hpp"

namespace petcore {
namespace {

std::string stringField(const json::Value& object, const std::string& key,
                        const std::string& fallback) {
    if (const auto* value = object.find(key)) {
        if (value->isString()) return value->asString();
    }
    return fallback;
}

int intField(const json::Value& object, const std::string& key, int fallback) {
    if (const auto* value = object.find(key)) {
        if (value->isNumber()) return static_cast<int>(value->asNumber());
    }
    return fallback;
}

double doubleField(const json::Value& object, const std::string& key, double fallback) {
    if (const auto* value = object.find(key)) {
        if (value->isNumber()) return value->asNumber();
    }
    return fallback;
}

bool boolField(const json::Value& object, const std::string& key, bool fallback) {
    if (const auto* value = object.find(key)) {
        if (value->isBool()) return value->asBool();
    }
    return fallback;
}

std::vector<std::string> stringArray(const json::Value& object, const std::string& key) {
    std::vector<std::string> out;
    if (const auto* value = object.find(key)) {
        if (value->isArray()) {
            for (const auto& item : value->array()) {
                if (item.isString()) out.push_back(item.asString());
            }
        }
    }
    return out;
}

}  // namespace

AppConfig AppConfig::load(const std::string& path) {
    AppConfig config;
    std::filesystem::path configPath;

    if (!path.empty()) {
        configPath = std::filesystem::absolute(path);
        if (!std::filesystem::exists(configPath)) {
            throw ConfigError("config file not found: " + configPath.string());
        }
    } else {
        const auto candidate = std::filesystem::current_path() / "config.json";
        if (std::filesystem::exists(candidate)) configPath = candidate;
    }

    config.configPath = configPath.string();
    config.baseDir = configPath.empty() ? std::filesystem::current_path().string()
                                        : configPath.parent_path().string();

    // Convenience for double-clicking build/petcore.exe: if the current
    // directory has no cards/, walk up one or two levels to find the project.
    if (configPath.empty()) {
        std::filesystem::path base(config.baseDir);
        if (!std::filesystem::exists(base / "cards")) {
            for (const auto& candidate : {base.parent_path(), base.parent_path().parent_path()}) {
                if (!candidate.empty() && std::filesystem::exists(candidate / "cards")) {
                    config.baseDir = candidate.string();
                    break;
                }
            }
        }
    }

    json::Value root = json::Value::object({});
    if (!configPath.empty()) {
        try {
            root = json::Value::parse(util::readFile(configPath.string()));
        } catch (const std::exception& error) {
            throw ConfigError("cannot parse " + configPath.string() + ": " + error.what());
        }
        if (!root.isObject()) throw ConfigError("config root must be a JSON object");
    }

    if (const auto* llm = root.find("llm"); llm && llm->isObject()) {
        config.llm.provider = stringField(*llm, "provider", config.llm.provider);
        config.llm.model = stringField(*llm, "model", config.llm.model);
        config.llm.baseUrl = stringField(*llm, "base_url", config.llm.baseUrl);
        config.llm.apiKey = stringField(*llm, "api_key", config.llm.apiKey);
        config.llm.apiKeyEnv = stringField(*llm, "api_key_env", config.llm.apiKeyEnv);
        config.llm.temperature = doubleField(*llm, "temperature", config.llm.temperature);
        config.llm.maxTokens = intField(*llm, "max_tokens", config.llm.maxTokens);
        config.llm.timeoutSeconds = intField(*llm, "timeout", config.llm.timeoutSeconds);
        if (const auto* extra = llm->find("extra")) config.llm.extra = *extra;
    }

    if (const auto* database = root.find("database"); database && database->isObject()) {
        config.database.adapter = stringField(*database, "adapter", config.database.adapter);
        config.database.path = stringField(*database, "path", config.database.path);
        if (const auto* options = database->find("options")) config.database.options = *options;
    }

    if (const auto* agent = root.find("agent"); agent && agent->isObject()) {
        config.agent.maxToolRounds = intField(*agent, "max_tool_rounds", config.agent.maxToolRounds);
        config.agent.historyLimit = intField(*agent, "history_limit", config.agent.historyLimit);
        config.agent.autoSummarize = boolField(*agent, "auto_summarize", config.agent.autoSummarize);
        config.agent.summaryTrigger = intField(*agent, "summary_trigger", config.agent.summaryTrigger);
        config.agent.maxPromptChars = intField(*agent, "max_prompt_chars", config.agent.maxPromptChars);
        config.agent.approvalRequired = stringArray(*agent, "approval_required");
        config.agent.replyStyle = stringField(*agent, "reply_style", config.agent.replyStyle);
    }

    if (const auto* characters = root.find("characters"); characters && characters->isObject()) {
        config.characters.dirs = stringArray(*characters, "dirs");
        config.characters.userDir = stringField(*characters, "user_dir", "characters");
    }
    if (config.characters.dirs.empty()) config.characters.dirs.push_back("cards");
    if (config.characters.userDir.empty()) config.characters.userDir = "characters";
    for (auto& dir : config.characters.dirs) dir = util::resolvePath(config.baseDir, dir);
    config.characters.userDir = util::resolvePath(config.baseDir, config.characters.userDir);
    // User cards are loaded last so they can override a built-in card by id.
    if (std::find(config.characters.dirs.begin(), config.characters.dirs.end(),
                  config.characters.userDir) == config.characters.dirs.end()) {
        config.characters.dirs.push_back(config.characters.userDir);
    }

    if (const auto* tools = root.find("tools"); tools && tools->isObject()) {
        config.tools.filesEnabled = boolField(*tools, "files_enabled", config.tools.filesEnabled);
        config.tools.workspace = stringField(*tools, "workspace", "workspace");
    }
    if (config.tools.workspace.empty()) config.tools.workspace = "workspace";
    config.tools.workspace = util::resolvePath(config.baseDir, config.tools.workspace);

    if (const auto* ui = root.find("ui"); ui && ui->isObject()) {
        config.ui.host = stringField(*ui, "host", config.ui.host);
        config.ui.port = intField(*ui, "port", config.ui.port);
        config.ui.openBrowser = boolField(*ui, "open_browser", config.ui.openBrowser);
    }

    // Environment overrides (kept deliberately small and explicit).
    if (const auto value = util::userEnvironment("PETCORE_LLM_PROVIDER"); !value.empty()) {
        config.llm.provider = value;
    }
    if (const auto value = util::userEnvironment("PETCORE_LLM_MODEL"); !value.empty()) {
        config.llm.model = value;
    }
    if (const auto value = util::userEnvironment("PETCORE_LLM_BASE_URL"); !value.empty()) {
        config.llm.baseUrl = value;
    }
    if (const auto value = util::userEnvironment("PETCORE_LLM_API_KEY"); !value.empty()) {
        config.llm.apiKey = value;
    }
    if (config.llm.apiKey.empty() && !config.llm.apiKeyEnv.empty()) {
        config.llm.apiKey = util::userEnvironment(config.llm.apiKeyEnv);
    }
    if (const auto value = util::userEnvironment("PETCORE_DATABASE_ADAPTER"); !value.empty()) {
        config.database.adapter = value;
    }
    if (const auto value = util::userEnvironment("PETCORE_DATABASE_PATH"); !value.empty()) {
        config.database.path = value;
    }

    config.database.path = util::resolvePath(config.baseDir, config.database.path);
    if (config.llm.maxTokens <= 0) config.llm.maxTokens = 1024;
    if (config.agent.maxToolRounds <= 0) config.agent.maxToolRounds = 6;
    if (config.agent.historyLimit <= 0) config.agent.historyLimit = 20;
    return config;
}

json::Value AppConfig::toPublicJson() const {
    return json::Value::object({
        {"llm", json::Value::object({
            {"provider", llm.provider},
            {"model", llm.model},
            {"base_url", llm.baseUrl},
            {"api_key_set", !llm.apiKey.empty()},
        })},
        {"database", json::Value::object({
            {"adapter", database.adapter},
            {"path", database.path},
        })},
        {"agent", json::Value::object({
            {"max_tool_rounds", agent.maxToolRounds},
            {"history_limit", agent.historyLimit},
            {"auto_summarize", agent.autoSummarize},
            {"reply_style", agent.replyStyle},
        })},
        {"characters", json::Value::object({
            {"dirs", [&] {
                json::Value items = json::Value::array({});
                for (const auto& dir : characters.dirs) items.push_back(dir);
                return items;
            }()},
            {"user_dir", characters.userDir},
        })},
        {"tools", json::Value::object({{"files_enabled", tools.filesEnabled}})},
        {"ui", json::Value::object({
            {"host", ui.host},
            {"port", ui.port},
            {"open_browser", ui.openBrowser},
        })},
    });
}

}  // namespace petcore
