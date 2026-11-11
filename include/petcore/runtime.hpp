#pragma once

#include <functional>
#include <memory>
#include <mutex>
#include <string>

#include "petcore/agent.hpp"
#include "petcore/character.hpp"
#include "petcore/config.hpp"
#include "petcore/database.hpp"
#include "petcore/events.hpp"
#include "petcore/llm.hpp"
#include "petcore/memory.hpp"
#include "petcore/session.hpp"
#include "petcore/tools.hpp"

namespace petcore {

// Wires all adapters together. This is the only place that knows the concrete
// implementations; everything else depends on interfaces.
class Runtime {
public:
    explicit Runtime(AppConfig config);
    ~Runtime();

    Runtime(const Runtime&) = delete;
    Runtime& operator=(const Runtime&) = delete;

    const AppConfig& config() const { return config_; }
    IDatabase& database() { return *database_; }
    CharacterRegistry& characters() { return characters_; }
    const CharacterRegistry& characters() const { return characters_; }
    ToolRegistry& tools() { return tools_; }
    const ToolRegistry& tools() const { return tools_; }
    SessionManager& sessions() { return *sessions_; }
    AgentLoop& agent() { return *agent_; }
    EventBus& events() { return events_; }
    ILLMProvider& llm() { return *llm_; }

    TurnResult chat(const std::string& sessionId, const std::string& message,
                    const std::function<void(const AgentEvent&)>& emit = nullptr);

    void reloadCharacters();
    json::Value modelSettings() const;
    json::Value publicConfig() const;
    void switchModel(const json::Value& selection);

private:
    AppConfig config_;
    LLMConfig initialLLM_;
    mutable std::mutex modelMutex_;
    std::string activeProfile_ = "configured";
    std::unique_ptr<IDatabase> database_;
    CharacterRegistry characters_;
    std::unique_ptr<ILLMProvider> llm_;
    ToolRegistry tools_;
    std::unique_ptr<MemoryService> memory_;
    std::unique_ptr<AgentLoop> agent_;
    std::unique_ptr<SessionManager> sessions_;
    EventBus events_;
};

}  // namespace petcore
