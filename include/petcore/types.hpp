#pragma once

#include <string>
#include <utility>
#include <vector>

#include "petcore/json.hpp"

namespace petcore {

struct ToolCall {
    std::string id;
    std::string name;
    json::Value arguments = json::Value::object({});

    json::Value toJson() const {
        return json::Value::object({
            {"id", id},
            {"name", name},
            {"arguments", arguments},
        });
    }

    static ToolCall fromJson(const json::Value& value) {
        ToolCall call;
        call.id = value.find("id") ? value.at("id").stringOr("") : "";
        call.name = value.find("name") ? value.at("name").stringOr("") : "";
        if (const auto* args = value.find("arguments")) call.arguments = *args;
        return call;
    }
};

struct Message {
    std::string role;       // system | user | assistant | tool
    std::string content;
    std::vector<ToolCall> toolCalls;
    std::string toolCallId;
    std::string name;
    std::string createdAt;

    json::Value toJson() const {
        json::Value value = json::Value::object({
            {"role", role},
            {"content", content},
            {"tool_call_id", toolCallId},
            {"name", name},
            {"created_at", createdAt},
        });
        json::Value calls = json::Value::array({});
        for (const auto& call : toolCalls) calls.push_back(call.toJson());
        value["tool_calls"] = calls;
        return value;
    }

    static Message fromJson(const json::Value& value) {
        Message message;
        message.role = value.find("role") ? value.at("role").stringOr("assistant") : "assistant";
        message.content = value.find("content") ? value.at("content").stringOr("") : "";
        message.toolCallId = value.find("tool_call_id") ? value.at("tool_call_id").stringOr("") : "";
        message.name = value.find("name") ? value.at("name").stringOr("") : "";
        message.createdAt = value.find("created_at") ? value.at("created_at").stringOr("") : "";
        if (const auto* calls = value.find("tool_calls")) {
            if (calls->isArray()) {
                for (const auto& item : calls->array()) message.toolCalls.push_back(ToolCall::fromJson(item));
            }
        }
        return message;
    }

    // OpenAI-compatible wire format.
    json::Value toWire() const {
        if (role == "assistant" && !toolCalls.empty()) {
            json::Value calls = json::Value::array({});
            for (const auto& call : toolCalls) {
                json::Value fn = json::Value::object({
                    {"name", call.name},
                    {"arguments", call.arguments.dump()},
                });
                calls.push_back(json::Value::object({
                    {"id", call.id},
                    {"type", "function"},
                    {"function", fn},
                }));
            }
            return json::Value::object({
                {"role", "assistant"},
                {"content", content.empty() ? json::Value(nullptr) : json::Value(content)},
                {"tool_calls", calls},
            });
        }
        if (role == "tool") {
            return json::Value::object({
                {"role", "tool"},
                {"tool_call_id", toolCallId},
                {"content", content},
            });
        }
        json::Value value = json::Value::object({{"role", role}, {"content", content}});
        if (!name.empty()) value["name"] = name;
        return value;
    }
};

struct LLMResponse {
    std::string content;
    std::vector<ToolCall> toolCalls;
    json::Value usage = json::Value::object({});
    json::Value raw = json::Value::object({});
};

struct ToolResult {
    bool ok = true;
    std::string content;
    json::Value data = json::Value::object({});
    std::string error;

    static ToolResult success(std::string content, json::Value data = json::Value::object({})) {
        ToolResult result;
        result.ok = true;
        result.content = std::move(content);
        result.data = std::move(data);
        return result;
    }

    static ToolResult failure(std::string error) {
        ToolResult result;
        result.ok = false;
        result.error = std::move(error);
        result.content = result.error;
        return result;
    }

    json::Value toJson() const {
        return json::Value::object({
            {"ok", ok},
            {"content", content},
            {"data", data},
            {"error", error},
        });
    }
};

struct AgentEvent {
    std::string type;
    json::Value data = json::Value::object({});

    json::Value toJson() const {
        return json::Value::object({{"type", type}, {"data", data}});
    }
};

}  // namespace petcore
