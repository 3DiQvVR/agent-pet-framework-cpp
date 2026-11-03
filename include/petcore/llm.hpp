#pragma once

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "petcore/config.hpp"
#include "petcore/json.hpp"
#include "petcore/types.hpp"

namespace petcore {

class ILLMProvider {
public:
    virtual ~ILLMProvider() = default;
    virtual std::string name() const = 0;
    virtual LLMResponse chat(const std::vector<Message>& messages,
                             const json::Value& tools) = 0;
    virtual LLMResponse chatStream(const std::vector<Message>& messages, const json::Value& tools,
                                   const std::function<void(const std::string&)>& onDelta) {
        auto response = chat(messages, tools);
        if (onDelta && !response.content.empty()) onDelta(response.content);
        return response;
    }
};

using LLMFactory = std::function<std::unique_ptr<ILLMProvider>(const LLMConfig&)>;

class LLMRegistry {
public:
    static void registerFactory(const std::string& name, LLMFactory factory);
    static std::unique_ptr<ILLMProvider> create(const LLMConfig& config);
    static std::vector<std::string> available();
};

// Offline deterministic provider: exercises the full loop (tool call -> result
// -> answer) without network access. Also used by the test suite.
class MockLLM final : public ILLMProvider {
public:
    explicit MockLLM(const LLMConfig& config = LLMConfig{}) : config_(config) {}
    std::string name() const override { return "mock"; }
    LLMResponse chat(const std::vector<Message>& messages, const json::Value& tools) override;

private:
    LLMConfig config_;
};

// OpenAI-compatible provider. On Windows it uses WinHTTP (HTTPS, no dependency);
// elsewhere it reports a clear error until a transport is plugged in.
class OpenAICompatibleLLM final : public ILLMProvider {
public:
    explicit OpenAICompatibleLLM(LLMConfig config);
    std::string name() const override { return "openai"; }
    LLMResponse chat(const std::vector<Message>& messages, const json::Value& tools) override;
    LLMResponse chatStream(const std::vector<Message>& messages, const json::Value& tools,
                           const std::function<void(const std::string&)>& onDelta) override;

private:
    std::string post(const std::string& body);
    LLMConfig config_;
    std::string endpoint_;
};

}  // namespace petcore
