#include "petcore/llm.hpp"

#include <algorithm>
#include <set>

#include "petcore/util.hpp"

namespace petcore {
namespace {

std::set<std::string> toolNames(const json::Value& tools) {
    std::set<std::string> names;
    if (tools.isArray()) {
        for (const auto& item : tools.array()) {
            if (const auto* fn = item.find("function")) {
                if (const auto* name = fn->find("name")) names.insert(name->stringOr(""));
            }
        }
    }
    return names;
}

std::string characterName(const std::vector<Message>& messages) {
    for (const auto& message : messages) {
        if (message.role != "system") continue;
        const auto marker = message.content.find("你是");
        if (marker == std::string::npos) continue;
        const auto start = marker + std::string("你是").size();
        auto end = message.content.find_first_of("，。,\n", start);
        if (end == std::string::npos) end = message.content.size();
        return util::trim(message.content.substr(start, end - start));
    }
    return "桌宠";
}

std::string afterTool(const Message& message) {
    const std::string name = message.name.empty() ? "工具" : message.name;
    const std::string content = util::trim(message.content);
    if (name == "get_time") return "现在是 " + content + "。";
    if (name == "remember") return "记住啦，下次我会想起来的。";
    if (name == "recall") {
        return content.empty() ? "我暂时还没想起什么。" : "我翻了翻记忆：" + content;
    }
    if (name == "set_emotion") return "嗯，我收到你的情绪了，我会陪着你的。";
    if (name.rfind("todo_", 0) == 0) return content.empty() ? "待办已经更新。" : content;
    if (name == "echo") return content;
    return content.empty() ? name + " 执行完成。" : "（" + name + " 返回）" + content;
}

std::string smallTalk(const std::string& name, const std::string& text) {
    if (text.empty()) return "我在呢，我是" + name + "。";
    if (text.find("你好") != std::string::npos || text.find("hello") != std::string::npos ||
        text.find("在吗") != std::string::npos) {
        return "你好呀，我是" + name + "。今天想聊点什么？";
    }
    if (text.find("你是谁") != std::string::npos) {
        return "我是" + name + "，一个跑在 PetCore 上的自主桌宠。";
    }
    return "（Mock 模式）我听到你说：「" + text +
           "」。接入真实模型后，我会结合角色卡、记忆和工具来回答。";
}

}  // namespace

LLMResponse MockLLM::chat(const std::vector<Message>& messages, const json::Value& tools) {
    const auto available = toolNames(tools);
    const Message last = messages.empty() ? Message{"user", "", {}, "", "", util::nowIso()} : messages.back();
    const std::string name = characterName(messages);

    if (last.role == "tool") return LLMResponse{afterTool(last), {}, {}, {}};

    std::string userText;
    for (auto it = messages.rbegin(); it != messages.rend(); ++it) {
        if (it->role == "user") {
            userText = it->content;
            break;
        }
    }

    if (userText.find("【记忆压缩】") != std::string::npos) {
        std::string summary = userText;
        if (summary.size() > 260) summary = summary.substr(0, 260) + "…";
        return LLMResponse{"摘要：" + summary, {}, {}, {}};
    }

    if (available.count("get_time") &&
        (userText.find("几点") != std::string::npos || userText.find("时间") != std::string::npos ||
         userText.find("日期") != std::string::npos || userText.find("time") != std::string::npos)) {
        return LLMResponse{"", {ToolCall{"call_time", "get_time", json::Value::object({})}}, {}, {}};
    }

    if (available.count("remember") && util::startsWith(userText, "记住")) {
        std::string payload = util::trim(userText.substr(std::string("记住").size()));
        auto stripPunctuation = [&payload]() {
            while (!payload.empty()) {
                if (payload.front() == ':' || payload.front() == ',') {
                    payload.erase(payload.begin());
                } else if (util::startsWith(payload, "：")) {
                    payload.erase(0, std::string("：").size());
                } else if (util::startsWith(payload, "，")) {
                    payload.erase(0, std::string("，").size());
                } else {
                    break;
                }
            }
        };
        stripPunctuation();
        std::string key = payload;
        std::string value = payload;
        const auto separator = payload.find("是");
        if (separator != std::string::npos) {
            key = util::trim(payload.substr(0, separator));
            value = util::trim(payload.substr(separator + std::string("是").size()));
        }
        if (key.empty()) key = "note";
        if (value.empty()) value = payload;
        return LLMResponse{"",
                           {ToolCall{"call_remember",
                                     "remember",
                                     json::Value::object({{"key", key.substr(0, 80)},
                                                          {"value", value.substr(0, 500)},
                                                          {"tags", json::Value::array({"user"})}})}},
                           {},
                           {}};
    }

    if (available.count("recall") &&
        (userText.find("记得") != std::string::npos || userText.find("回忆") != std::string::npos)) {
        return LLMResponse{"",
                           {ToolCall{"call_recall",
                                     "recall",
                                     json::Value::object({{"query", userText.substr(0, 120)},
                                                          {"limit", 5}})}},
                           {},
                           {}};
    }

    if (available.count("set_emotion")) {
        const bool sad = userText.find("难过") != std::string::npos ||
                         userText.find("伤心") != std::string::npos ||
                         userText.find("不开心") != std::string::npos ||
                         userText.find("累") != std::string::npos;
        const bool happy = userText.find("开心") != std::string::npos ||
                           userText.find("高兴") != std::string::npos ||
                           userText.find("太好了") != std::string::npos;
        if (sad) {
            return LLMResponse{"",
                               {ToolCall{"call_emotion",
                                         "set_emotion",
                                         json::Value::object({{"emotion", "sad"}, {"intensity", 0.7}})}},
                               {},
                               {}};
        }
        if (happy) {
            return LLMResponse{"",
                               {ToolCall{"call_emotion",
                                         "set_emotion",
                                         json::Value::object({{"emotion", "happy"}, {"intensity", 0.8}})}},
                               {},
                               {}};
        }
    }

    return LLMResponse{smallTalk(name, userText), {}, {}, {}};
}

}  // namespace petcore
