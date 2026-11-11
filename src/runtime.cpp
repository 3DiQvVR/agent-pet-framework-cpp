#include "petcore/runtime.hpp"

#include <algorithm>
#include <array>
#include <stdexcept>
#include <utility>

#include "petcore/util.hpp"

namespace petcore {

namespace {
struct Profile {
    std::string id;
    LLMConfig config;
    std::string apiKeyEnv;
    bool configured = false;
};

std::string envValue(const std::string& name) { return util::userEnvironment(name); }

std::vector<Profile> profiles(const LLMConfig& configured) {
    std::vector<Profile> result;
    Profile current{"configured", configured, configured.apiKeyEnv, true};
    result.push_back(current);
    result.push_back(Profile{"mock", LLMConfig{}, "", false});
    result.back().config.provider = "mock";
    result.back().config.model = "mock";
    for (const auto& item : std::array<std::pair<const char*, const char*>, 6>{
             std::pair{"deepseek", "DEEPSEEK"}, {"openai", "OPENAI"},
             {"openrouter", "OPENROUTER"}, {"qwen", "QWEN"},
             {"ollama", "OLLAMA"}, {"lmstudio", "LMSTUDIO"}}) {
        Profile profile;
        profile.id = item.first;
        profile.config.provider = item.first;
        profile.apiKeyEnv = std::string(item.second) + "_API_KEY";
        profile.config.apiKeyEnv = profile.apiKeyEnv;
        profile.config.model = envValue(std::string(item.second) + "_MODEL");
        profile.config.baseUrl = envValue(std::string(item.second) + "_BASE_URL");
        if (profile.id == "qwen" && envValue(profile.apiKeyEnv).empty() &&
            !envValue("DASHSCOPE_API_KEY").empty()) {
            profile.apiKeyEnv = "DASHSCOPE_API_KEY";
            profile.config.apiKeyEnv = profile.apiKeyEnv;
        }
        profile.config.apiKey = envValue(profile.apiKeyEnv);
        result.push_back(std::move(profile));
    }
    return result;
}

void validateModelConfig(const LLMConfig& config) {
    if (config.model.empty() || config.model.size() > 200 || config.model.find('\n') != std::string::npos)
        throw std::runtime_error("模型 ID 不能为空，且不能超过 200 个字符");
    if (config.provider == "mock" && config.baseUrl.empty()) return;
    if (config.provider != "mock" && config.baseUrl.empty())
        throw std::runtime_error("该 Provider 缺少接口地址，请设置环境变量或在页面填写");
    if (config.baseUrl.size() > 2048 || config.baseUrl.find_first_of("\r\n?#") != std::string::npos ||
        (config.baseUrl.rfind("http://", 0) != 0 && config.baseUrl.rfind("https://", 0) != 0))
        throw std::runtime_error("接口地址必须是 http:// 或 https:// 地址，且不能包含查询参数");
}
}

Runtime::Runtime(AppConfig config)
    : config_(std::move(config)),
      initialLLM_(config_.llm),
      database_(DatabaseRegistry::create(config_.database)),
      characters_(config_.characters.dirs, database_.get()),
      llm_(LLMRegistry::create(config_.llm)),
      memory_(std::make_unique<MemoryService>(*database_, config_.agent.historyLimit)) {
    registerBuiltinTools(tools_, config_.tools.filesEnabled, config_.tools.workspace);

    rebuildAgent();
    sessions_ = std::make_unique<SessionManager>(*database_, characters_);
}

void Runtime::rebuildAgent() {
    AgentPolicy policy;
    policy.approvalRequired = config_.agent.approvalRequired;
    policy.approvalHandler = [](const ToolCall&) { return false; };
    agent_ = std::make_unique<AgentLoop>(*llm_, tools_, *memory_, *database_, std::move(policy),
                                         config_.agent.maxToolRounds, config_.agent.maxPromptChars,
                                         config_.agent.replyStyle);
}

Runtime::~Runtime() {
    if (database_) database_->close();
}

TurnResult Runtime::chat(const std::string& sessionId, const std::string& message,
                         const std::function<void(const AgentEvent&)>& emit) {
    std::lock_guard<std::mutex> lock(modelMutex_);
    const SessionRecord session = sessions_->get(sessionId);
    const auto card = sessions_->cardFor(session);
    TurnResult result = agent_->run(session, *card, message, emit);
    sessions_->saveEmotion(sessionId, result.emotion);

    if (config_.agent.autoSummarize) {
        memory_->maybeSummarize(sessionId, *llm_, config_.agent.summaryTrigger, 8);
    }
    return result;
}

void Runtime::reloadCharacters() { characters_.reload(); }

json::Value Runtime::modelSettings() const {
    std::lock_guard<std::mutex> lock(modelMutex_);
    json::Value items = json::Value::array({});
    for (const auto& profile : profiles(initialLLM_)) {
        const bool keySet = !profile.config.apiKey.empty() || !envValue(profile.apiKeyEnv).empty();
        items.push_back(json::Value::object({
            {"id", profile.id}, {"provider", profile.config.provider},
            {"model", profile.config.model}, {"base_url", profile.config.baseUrl},
            {"api_key_env", profile.apiKeyEnv}, {"api_key_set", keySet},
            {"configured", profile.id == activeProfile_},
        }));
    }
    return json::Value::object({{"active", activeProfile_}, {"profiles", items}});
}

json::Value Runtime::publicConfig() const {
    std::lock_guard<std::mutex> lock(modelMutex_);
    auto result = config_.toPublicJson();
    result["llm"]["provider"] = config_.llm.provider;
    result["llm"]["model"] = config_.llm.model;
    result["llm"]["api_key_set"] = !config_.llm.apiKey.empty() ||
                                      !envValue(config_.llm.apiKeyEnv).empty();
    return result;
}

void Runtime::switchModel(const json::Value& selection) {
    std::lock_guard<std::mutex> lock(modelMutex_);
    if (!selection.isObject()) throw std::runtime_error("模型配置必须是 JSON 对象");
    const std::string profileId = util::jstr(selection, "profile");
    const auto available = profiles(initialLLM_);
    auto it = std::find_if(available.begin(), available.end(), [&](const Profile& profile) {
        return profile.id == profileId;
    });
    if (it == available.end()) throw std::runtime_error("未知模型配置: " + profileId);
    LLMConfig next = it->config;
    const auto model = util::jstr(selection, "model", next.model);
    const auto baseUrl = util::jstr(selection, "base_url", next.baseUrl);
    next.model = model;
    next.baseUrl = baseUrl;
    const std::string environmentKey = envValue(it->apiKeyEnv);
    next.apiKey = environmentKey.empty() ? it->config.apiKey : environmentKey;
    next.apiKeyEnv = it->apiKeyEnv;
    validateModelConfig(next);
    auto replacement = LLMRegistry::create(next);
    llm_ = std::move(replacement);
    activeProfile_ = profileId;
    config_.llm = next;
    rebuildAgent();
}

}  // namespace petcore
