#pragma once

#include <functional>
#include <string>
#include <vector>

#include "petcore/character.hpp"
#include "petcore/database.hpp"
#include "petcore/emotion.hpp"
#include "petcore/llm.hpp"
#include "petcore/memory.hpp"
#include "petcore/tools.hpp"
#include "petcore/types.hpp"

namespace petcore {

struct AgentPolicy {
    std::vector<std::string> allow;
    std::vector<std::string> deny;
    std::vector<std::string> approvalRequired;
    // Return true to allow a tool that requires approval. Defaults to deny.
    std::function<bool(const ToolCall&)> approvalHandler;

    bool isAllowed(const std::string& toolName) const;
    bool requiresApproval(const std::string& toolName) const;
    bool approve(const ToolCall& call) const;
};

struct TurnResult {
    std::string text;
    std::vector<AgentEvent> events;
    std::string stopReason = "completed";
    json::Value usage = json::Value::object({});
    EmotionState emotion;
};

// The autonomous closed loop: model -> tool calls -> tool results -> model.
class AgentLoop {
public:
    AgentLoop(ILLMProvider& llm, ToolRegistry& tools, MemoryService& memory, IDatabase& database,
              AgentPolicy policy, int maxToolRounds = 6, int maxPromptChars = 6000,
              std::string replyStyle = "");

    TurnResult run(const SessionRecord& session, const CharacterCard& character,
                   const std::string& userText,
                   const std::function<void(const AgentEvent&)>& emit = nullptr);

private:
    ILLMProvider& llm_;
    ToolRegistry& tools_;
    MemoryService& memory_;
    IDatabase& database_;
    AgentPolicy policy_;
    int maxToolRounds_;
    int maxPromptChars_;
    std::string replyStyle_;
};

}  // namespace petcore
