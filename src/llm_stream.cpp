#include "petcore/llm_stream.hpp"
#include "petcore/errors.hpp"
#include "petcore/util.hpp"

namespace petcore::detail {
void LLMStreamDecoder::feed(const std::string& bytes) {
    if (done_) return;
    pending_ += bytes;
    std::size_t pos;
    while (!done_ && (pos = pending_.find('\n')) != std::string::npos) {
        auto text = pending_.substr(0, pos);
        pending_.erase(0, pos + 1);
        line(std::move(text));
    }
}

void LLMStreamDecoder::line(std::string text) {
    if (!text.empty() && text.back() == '\r') text.pop_back();
    if (text.empty()) { event(); return; }
    if (text.rfind("data:", 0) != 0) return;
    auto value = text.substr(5);
    if (!value.empty() && value.front() == ' ') value.erase(0, 1);
    if (!data_.empty()) data_ += '\n';
    data_ += value;
}

void LLMStreamDecoder::event() {
    const auto data = util::trim(data_);
    data_.clear();
    if (data.empty()) return;
    if (data == "[DONE]") { done_ = true; return; }
    json::Value root;
    try { root = json::Value::parse(data); }
    catch (const std::exception&) { throw LLMError("invalid JSON in LLM stream"); }
    if (root.find("error")) throw LLMError("LLM stream reported an error");
    if (const auto* usage = root.find("usage")) result_.usage = *usage;
    const auto* choices = root.find("choices");
    if (!choices || !choices->isArray()) throw LLMError("LLM stream has no choices array");
    if (choices->empty()) return; // usage-only terminal chunk
    const auto& choice = choices->at(0);
    if (!util::jstr(choice, "finish_reason").empty()) finishedChoice_ = true;
    const auto* delta = choice.find("delta");
    if (!delta) return;
    auto text = util::jstr(*delta, "content");
    if (text.empty()) text = util::jstr(*delta, "refusal");
    if (!text.empty()) {
        result_.content += text;
        if (onDelta_) onDelta_(text);
    }
    const auto* chunks = delta->find("tool_calls");
    if (chunks && chunks->isArray()) for (const auto& part : chunks->array()) {
        const auto index = util::jint(part, "index", 0);
        if (index < 0) throw LLMError("invalid tool call index in stream");
        auto& entry = calls_[index];
        entry.first.id += util::jstr(part, "id");
        if (const auto* fn = part.find("function")) {
            entry.first.name += util::jstr(*fn, "name");
            entry.second += util::jstr(*fn, "arguments");
        }
    }
}

LLMResponse LLMStreamDecoder::finish() {
    if (!done_) {
        if (!pending_.empty()) line(std::move(pending_));
        event();
    }
    if (!done_ && !finishedChoice_) throw LLMError("LLM stream ended before completion");
    for (auto& [index, entry] : calls_) {
        (void)index;
        if (entry.first.id.empty() || entry.first.name.empty()) throw LLMError("incomplete streamed tool call");
        try { entry.first.arguments = json::Value::parse(entry.second); }
        catch (const std::exception&) { throw LLMError("incomplete streamed tool arguments"); }
        if (!entry.first.arguments.isObject()) throw LLMError("tool arguments must be an object");
        result_.toolCalls.push_back(std::move(entry.first));
    }
    if (result_.content.empty() && result_.toolCalls.empty()) throw LLMError("LLM stream returned no answer");
    return std::move(result_);
}
}
