#include "petcore/runtime.hpp"

#include <utility>

#include "petcore/util.hpp"

namespace petcore {

Runtime::Runtime(AppConfig config)
    : config_(std::move(config)),
      database_(DatabaseRegistry::create(config_.database)),
      characters_(config_.characters.dirs, database_.get()),
      llm_(LLMRegistry::create(config_.llm)),
      memory_(std::make_unique<MemoryService>(*database_, config_.agent.historyLimit)) {
    registerBuiltinTools(tools_, config_.tools.filesEnabled, config_.tools.workspace);

    AgentPolicy policy;
    policy.allow = {};
    policy.deny = {};
    policy.approvalRequired = config_.agent.approvalRequired;
    policy.approvalHandler = [](const ToolCall&) {
        // Headless default: tools listed in approval_required are denied until an
        // embedding UI supplies its own handler.
        return false;
    };

    agent_ = std::make_unique<AgentLoop>(*llm_, tools_, *memory_, *database_, std::move(policy),
                                         config_.agent.maxToolRounds, config_.agent.maxPromptChars,
                                         config_.agent.replyStyle);
    sessions_ = std::make_unique<SessionManager>(*database_, characters_);
}

Runtime::~Runtime() {
    if (database_) database_->close();
}

TurnResult Runtime::chat(const std::string& sessionId, const std::string& message,
                         const std::function<void(const AgentEvent&)>& emit) {
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

}  // namespace petcore
