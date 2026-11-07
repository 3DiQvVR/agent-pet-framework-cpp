#pragma once
#include <functional>
#include <map>
#include <string>
#include "petcore/types.hpp"

namespace petcore::detail {
// Incremental SSE decoder shared by the transport and deterministic tests.
class LLMStreamDecoder {
public:
    explicit LLMStreamDecoder(std::function<void(const std::string&)> onDelta) : onDelta_(std::move(onDelta)) {}
    void feed(const std::string& bytes);
    bool done() const { return done_; }
    LLMResponse finish();
private:
    void line(std::string text);
    void event();
    std::function<void(const std::string&)> onDelta_;
    std::string pending_, data_;
    LLMResponse result_;
    std::map<int, std::pair<ToolCall, std::string>> calls_;
    bool done_ = false;
    bool finishedChoice_ = false;
};
}
