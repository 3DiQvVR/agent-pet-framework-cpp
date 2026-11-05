#include "petcore/agent.hpp"

#include <algorithm>
#include <cstdint>

#include "petcore/errors.hpp"
#include "petcore/util.hpp"

namespace petcore {
namespace {

int64_t messageCost(const Message& message) {
    int64_t cost = static_cast<int64_t>(message.content.size()) + 16;
    for (const auto& call : message.toolCalls) cost += static_cast<int64_t>(call.arguments.dump().size());
    return cost;
}

}  // namespace

bool AgentPolicy::isAllowed(const std::string& toolName) const {
    if (util::matchesAny(deny, toolName)) return false;
    if (allow.empty()) return true;
    return util::matchesAny(allow, toolName);
}

bool AgentPolicy::requiresApproval(const std::string& toolName) const {
    return util::matchesAny(approvalRequired, toolName);
}

bool AgentPolicy::approve(const ToolCall& call) const {
    if (!requiresApproval(call.name)) return true;
    return approvalHandler ? approvalHandler(call) : false;
}

AgentLoop::AgentLoop(ILLMProvider& llm, ToolRegistry& tools, MemoryService& memory, IDatabase& database,
                     AgentPolicy policy, int maxToolRounds, int maxPromptChars,
                     std::string replyStyle)
    : llm_(llm),
      tools_(tools),
      memory_(memory),
      database_(database),
      policy_(std::move(policy)),
      maxToolRounds_(maxToolRounds > 0 ? maxToolRounds : 6),
      maxPromptChars_(maxPromptChars > 0 ? maxPromptChars : 6000),
      replyStyle_(std::move(replyStyle)) {}

TurnResult AgentLoop::run(const SessionRecord& session, const CharacterCard& character,
                          const std::string& userText,
                          const std::function<void(const AgentEvent&)>& emit) {
    TurnResult result;
    auto publish = [&](const std::string& type, json::Value data) {
        AgentEvent event{type, std::move(data)};
        result.events.push_back(event);
        if (emit) emit(event);
    };

    EmotionState emotion = EmotionState::fromSessionState(session.state);
    emotion.decay(util::nowUnix());
    result.emotion = emotion;

    if (util::trim(userText).empty()) {
        result.text = "我在听。";
        result.stopReason = "empty_input";
        publish("done", json::Value::object({{"text", result.text}}));
        result.emotion = emotion;
        return result;
    }

    const MessageRecord userRecord = memory_.record(
        session.id, Message{"user", userText, {}, "", "", util::nowIso()});
    publish("user_message", json::Value::object({
                                {"id", userRecord.id},
                                {"content", userText},
                                {"seq", static_cast<double>(userRecord.seq)},
                            }));

    // Seed the context with history, then budget it from newest to oldest.
    std::vector<Message> history = memory_.history(session.id, character.historyLimit);
    std::vector<Message> context;
    std::string systemPrompt = character.buildSystemPrompt(
        emotion.name, emotion.intensity, session.summary, util::nowIso(), replyStyle_);
    if (static_cast<int>(systemPrompt.size()) > maxPromptChars_) {
        systemPrompt.resize(static_cast<std::size_t>(maxPromptChars_));
        systemPrompt += "\n…（设定已截断）";
    }
    context.push_back(Message{"system", systemPrompt, {}, "", "", util::nowIso()});

    int64_t budget = static_cast<int64_t>(maxPromptChars_) - messageCost(context.front());
    std::vector<Message> tail;
    for (auto it = history.rbegin(); it != history.rend(); ++it) {
        const int64_t cost = messageCost(*it);
        if (budget - cost < 0 && !tail.empty()) break;
        tail.push_back(*it);
        budget -= cost;
    }
    std::reverse(tail.begin(), tail.end());
    context.insert(context.end(), tail.begin(), tail.end());

    const json::Value schemas = tools_.schemas(character.toolsAllow, character.toolsDeny);
    auto cardAllows = [&](const std::string& name) {
        if (!character.toolsAllow.empty() && !util::matchesAny(character.toolsAllow, name)) return false;
        return !util::matchesAny(character.toolsDeny, name);
    };

    for (int round = 0; round < maxToolRounds_; ++round) {
        LLMResponse response;
        publish("assistant_start", json::Value::object({{"round", round + 1}}));
        try {
            response = llm_.chatStream(context, schemas, [&](const std::string& delta) {
                if (!delta.empty()) publish("assistant_delta", json::Value::object({{"content", delta}}));
            });
        } catch (const std::exception& error) {
            result.stopReason = "llm_error";
            result.text = "我这边暂时连不上大脑，等一下再试试好吗？";
            publish("error", json::Value::object({{"message", error.what()}}));
            memory_.record(session.id,
                           Message{"assistant", result.text, {}, "", "", util::nowIso()});
            publish("done", json::Value::object({{"text", result.text}, {"stop_reason", result.stopReason}}));
            result.emotion = emotion;
            return result;
        }
        result.usage = response.usage;

        // Preserve a complete-message event for non-streaming subscribers.
        if (!response.content.empty()) publish("assistant", json::Value::object({{"content", response.content}}));

        if (response.toolCalls.empty()) {
            result.text = response.content;
            result.stopReason = "completed";
            memory_.record(session.id,
                           Message{"assistant", response.content, {}, "", "", util::nowIso()});
            publish("done", json::Value::object({{"text", result.text}, {"stop_reason", result.stopReason}}));
            result.emotion = emotion;
            return result;
        }

        Message assistant{"assistant", response.content, response.toolCalls, "", "", util::nowIso()};
        memory_.record(session.id, assistant);
        context.push_back(assistant);

        for (const auto& call : response.toolCalls) {
            publish("tool_call", json::Value::object({
                                     {"id", call.id},
                                     {"name", call.name},
                                     {"arguments", call.arguments},
                                 }));

            ToolResult toolResult;
            if (!cardAllows(call.name) || !policy_.isAllowed(call.name)) {
                toolResult = ToolResult::failure("工具 " + call.name + " 被当前角色卡禁用");
                publish("policy_denied", json::Value::object({
                                             {"id", call.id},
                                             {"name", call.name},
                                             {"reason", "not allowed"},
                                         }));
            } else if (!policy_.approve(call)) {
                toolResult = ToolResult::failure("工具 " + call.name + " 需要用户批准，已被拒绝");
                publish("policy_denied", json::Value::object({
                                             {"id", call.id},
                                             {"name", call.name},
                                             {"reason", "approval required"},
                                         }));
            } else {
                ToolContext toolContext;
                toolContext.sessionId = session.id;
                toolContext.memoryScope =
                    character.memoryScope == "session" ? session.id : ("character:" + character.id);
                toolContext.character = std::make_shared<CharacterCard>(character);
                toolContext.database = &database_;
                toolContext.memory = &memory_;
                toolContext.emotion = &emotion;
                toolContext.emit = [&](const AgentEvent& event) { publish(event.type, event.data); };
                toolResult = tools_.call(call.name, call.arguments, toolContext);
            }

            std::string eventContent = toolResult.content;
            if (eventContent.size() > 1200) eventContent = eventContent.substr(0, 1200) + "…";
            publish("tool_result", json::Value::object({
                                       {"id", call.id},
                                       {"name", call.name},
                                       {"ok", toolResult.ok},
                                       {"content", eventContent},
                                   }));

            std::string toolContent =
                toolResult.ok ? toolResult.content : ("ERROR: " + toolResult.error);
            if (toolContent.size() > 12000) {
                toolContent = toolContent.substr(0, 12000) + "\n…（工具输出已截断）";
            }
            Message toolMessage{"tool", toolContent, {}, call.id, call.name, util::nowIso()};
            memory_.record(session.id, toolMessage);
            context.push_back(toolMessage);
        }
    }

    result.stopReason = "max_rounds";
    result.text = "我思考得有点久了，先停一下。你可以把问题拆小一点再问我。";
    memory_.record(session.id, Message{"assistant", result.text, {}, "", "", util::nowIso()});
    publish("done", json::Value::object({{"text", result.text}, {"stop_reason", result.stopReason}}));
    result.emotion = emotion;
    return result;
}

}  // namespace petcore
