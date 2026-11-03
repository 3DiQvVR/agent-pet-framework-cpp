#include "petcore/llm.hpp"

#include <algorithm>
#include <chrono>
#include <sstream>
#include <thread>

#include "petcore/errors.hpp"
#include "petcore/util.hpp"

#if defined(_WIN32) && !defined(PETCORE_NO_WINHTTP)
#define PETCORE_HAS_WINHTTP 1
#include <windows.h>
#include <winhttp.h>
#endif

namespace petcore {
namespace {

std::string endpointFor(const std::string& baseUrl) {
    std::string base = baseUrl;
    while (!base.empty() && base.back() == '/') base.pop_back();
    if (base.empty()) throw LLMError("llm.base_url is required for the openai provider");
    if (util::endsWith(base, "/chat/completions")) return base;
    return base + "/chat/completions";
}

bool isLocal(const std::string& url) {
    return url.find("localhost") != std::string::npos ||
           url.find("127.0.0.1") != std::string::npos ||
           url.find("0.0.0.0") != std::string::npos;
}

json::Value buildPayload(const LLMConfig& config, const std::vector<Message>& messages,
                         const json::Value& tools) {
    json::Value wireMessages = json::Value::array({});
    for (const auto& message : messages) wireMessages.push_back(message.toWire());
    json::Value payload = json::Value::object({
        {"model", config.model},
        {"messages", wireMessages},
        {"temperature", config.temperature},
        {"max_tokens", static_cast<double>(config.maxTokens)},
    });
    if (tools.isArray() && !tools.empty()) {
        payload["tools"] = tools;
        payload["tool_choice"] = "auto";
    }
    if (config.extra.isObject()) {
        for (const auto& [key, value] : config.extra.object()) payload[key] = value;
    }
    return payload;
}

ToolCall parseToolCall(const json::Value& item) {
    ToolCall call;
    call.id = util::jstr(item, "id");
    if (call.id.empty()) call.id = "call_" + util::uuid().substr(0, 8);
    if (const auto* fn = item.find("function")) {
        call.name = util::jstr(*fn, "name");
        const std::string raw = util::jstr(*fn, "arguments", "{}");
        try {
            call.arguments = json::Value::parse(raw.empty() ? "{}" : raw);
        } catch (...) {
            call.arguments = json::Value::object({{"__raw__", raw}});
        }
    }
    return call;
}

LLMResponse parseResponse(const std::string& body) {
    json::Value data;
    try {
        data = json::Value::parse(body);
    } catch (const std::exception& error) {
        throw LLMError(std::string("LLM returned non-JSON content: ") + error.what());
    }
    const auto* choices = data.find("choices");
    if (!choices || !choices->isArray() || choices->empty()) {
        throw LLMError("LLM response has no choices: " + body.substr(0, 300));
    }
    const auto* message = choices->at(0).find("message");
    if (!message || !message->isObject()) {
        throw LLMError("LLM response has no message object");
    }
    LLMResponse response;
    response.content = util::jstr(*message, "content");
    if (const auto* calls = message->find("tool_calls"); calls && calls->isArray()) {
        for (const auto& item : calls->array()) response.toolCalls.push_back(parseToolCall(item));
    }
    if (const auto* usage = data.find("usage")) response.usage = *usage;
    response.raw = data;
    return response;
}

#if defined(PETCORE_HAS_WINHTTP)

std::wstring widen(const std::string& text) {
    if (text.empty()) return {};
    const int size = MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0);
    std::wstring result(static_cast<std::size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), result.data(), size);
    return result;
}

class WinHttpHandle {
public:
    WinHttpHandle() = default;
    explicit WinHttpHandle(HINTERNET handle) : handle_(handle) {}
    ~WinHttpHandle() {
        if (handle_) WinHttpCloseHandle(handle_);
    }
    WinHttpHandle(const WinHttpHandle&) = delete;
    WinHttpHandle& operator=(const WinHttpHandle&) = delete;
    WinHttpHandle(WinHttpHandle&& other) noexcept : handle_(other.handle_) { other.handle_ = nullptr; }
    WinHttpHandle& operator=(WinHttpHandle&& other) noexcept {
        if (this != &other) {
            if (handle_) WinHttpCloseHandle(handle_);
            handle_ = other.handle_;
            other.handle_ = nullptr;
        }
        return *this;
    }
    HINTERNET get() const { return handle_; }
    explicit operator bool() const { return handle_ != nullptr; }

private:
    HINTERNET handle_ = nullptr;
};

std::string lastErrorText(const std::string& prefix) {
    return prefix + " (WinHTTP error " + std::to_string(GetLastError()) + ")";
}

std::string winHttpPost(const std::string& endpoint, const std::string& apiKey,
                        const std::string& body, int timeoutSeconds) {
    const std::wstring wideEndpoint = widen(endpoint);
    URL_COMPONENTS components{};
    components.dwStructSize = sizeof(components);
    components.dwSchemeLength = static_cast<DWORD>(-1);
    components.dwHostNameLength = static_cast<DWORD>(-1);
    components.dwUrlPathLength = static_cast<DWORD>(-1);
    components.dwExtraInfoLength = static_cast<DWORD>(-1);
    if (!WinHttpCrackUrl(wideEndpoint.c_str(), static_cast<DWORD>(wideEndpoint.size()), 0, &components)) {
        throw LLMError(lastErrorText("invalid LLM URL"));
    }
    const std::wstring host(components.lpszHostName, components.dwHostNameLength);
    std::wstring path(components.lpszUrlPath, components.dwUrlPathLength);
    if (components.dwExtraInfoLength > 0) {
        path.append(components.lpszExtraInfo, components.dwExtraInfoLength);
    }
    const bool secure = components.nScheme == INTERNET_SCHEME_HTTPS;

    WinHttpHandle session(WinHttpOpen(L"PetCore/0.1", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                      WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0));
    if (!session) throw LLMError(lastErrorText("cannot open WinHTTP session"));
    WinHttpSetTimeouts(session.get(), 10000, 10000, timeoutSeconds * 1000, timeoutSeconds * 1000);

    WinHttpHandle connection(WinHttpConnect(session.get(), host.c_str(), components.nPort, 0));
    if (!connection) throw LLMError(lastErrorText("cannot connect to LLM host"));

    WinHttpHandle request(WinHttpOpenRequest(connection.get(), L"POST", path.c_str(), nullptr,
                                             WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
                                             secure ? WINHTTP_FLAG_SECURE : 0));
    if (!request) throw LLMError(lastErrorText("cannot create HTTP request"));

    std::wstring headers = L"Content-Type: application/json\r\n";
    if (!apiKey.empty()) headers += L"Authorization: Bearer " + widen(apiKey) + L"\r\n";

    if (!WinHttpSendRequest(request.get(), headers.c_str(), static_cast<DWORD>(headers.size()),
                            const_cast<char*>(body.data()), static_cast<DWORD>(body.size()),
                            static_cast<DWORD>(body.size()), 0)) {
        throw LLMError(lastErrorText("failed to send LLM request"));
    }
    if (!WinHttpReceiveResponse(request.get(), nullptr)) {
        throw LLMError(lastErrorText("failed to receive LLM response"));
    }

    DWORD status = 0;
    DWORD statusSize = sizeof(status);
    WinHttpQueryHeaders(request.get(), WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &status, &statusSize, WINHTTP_NO_HEADER_INDEX);

    std::string response;
    char buffer[8192];
    DWORD read = 0;
    while (WinHttpReadData(request.get(), buffer, sizeof(buffer), &read) && read > 0) {
        response.append(buffer, read);
    }

    if (status < 200 || status >= 300) {
        throw LLMError("LLM HTTP " + std::to_string(status) + ": " + response.substr(0, 500));
    }
    return response;
}

LLMResponse winHttpPostStream(const std::string& endpoint, const std::string& apiKey,
                              const std::string& body, int timeoutSeconds,
                              const std::function<void(const std::string&)>& onDelta) {
    const auto wide = widen(endpoint);
    URL_COMPONENTS c{}; c.dwStructSize = sizeof(c);
    c.dwSchemeLength = c.dwHostNameLength = c.dwUrlPathLength = c.dwExtraInfoLength = static_cast<DWORD>(-1);
    if (!WinHttpCrackUrl(wide.c_str(), static_cast<DWORD>(wide.size()), 0, &c))
        throw LLMError(lastErrorText("invalid LLM URL"));
    const std::wstring host(c.lpszHostName, c.dwHostNameLength);
    std::wstring path(c.lpszUrlPath, c.dwUrlPathLength);
    if (c.dwExtraInfoLength) path.append(c.lpszExtraInfo, c.dwExtraInfoLength);
    WinHttpHandle session(WinHttpOpen(L"PetCore/0.1", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                      WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0));
    if (!session) throw LLMError(lastErrorText("cannot open WinHTTP session"));
    WinHttpSetTimeouts(session.get(), 10000, 10000, timeoutSeconds * 1000, timeoutSeconds * 1000);
    WinHttpHandle connection(WinHttpConnect(session.get(), host.c_str(), c.nPort, 0));
    if (!connection) throw LLMError(lastErrorText("cannot connect to LLM host"));
    WinHttpHandle request(WinHttpOpenRequest(connection.get(), L"POST", path.c_str(), nullptr,
        WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, c.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0));
    if (!request) throw LLMError(lastErrorText("cannot create HTTP request"));
    std::wstring headers = L"Content-Type: application/json\r\nAccept: text/event-stream\r\n";
    if (!apiKey.empty()) headers += L"Authorization: Bearer " + widen(apiKey) + L"\r\n";
    if (!WinHttpSendRequest(request.get(), headers.c_str(), static_cast<DWORD>(headers.size()),
        const_cast<char*>(body.data()), static_cast<DWORD>(body.size()), static_cast<DWORD>(body.size()), 0) ||
        !WinHttpReceiveResponse(request.get(), nullptr)) throw LLMError(lastErrorText("LLM stream request failed"));
    DWORD status=0, statusSize=sizeof(status);
    WinHttpQueryHeaders(request.get(), WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,
        WINHTTP_HEADER_NAME_BY_INDEX, &status, &statusSize, WINHTTP_NO_HEADER_INDEX);
    if (status < 200 || status >= 300) {
        std::string errorBody; char errorChunk[2048]; DWORD errorRead=0;
        while (WinHttpReadData(request.get(), errorChunk, sizeof(errorChunk), &errorRead) && errorRead && errorBody.size()<4096)
            errorBody.append(errorChunk, std::min<std::size_t>(errorRead, 4096-errorBody.size()));
        throw LLMError("LLM HTTP " + std::to_string(status) + ": " + errorBody);
    }
    LLMResponse result;
    std::map<int, std::pair<ToolCall,std::string>> calls;
    std::string pending; char chunk[4096]; DWORD got=0;
    auto consumeLine = [&](std::string line) {
        if (!line.empty() && line.back()=='\r') line.pop_back();
        if (line.rfind("data:",0)!=0) return;
        std::string data=util::trim(line.substr(5));
        if (data.empty() || data=="[DONE]") return;
        json::Value root;
        try { root=json::Value::parse(data); } catch (...) { return; }
        const auto* choices=root.find("choices"); if (!choices || !choices->isArray() || choices->empty()) return;
        const auto* delta=choices->at(0).find("delta"); if (!delta) return;
        const auto text=util::jstr(*delta,"content");
        if (!text.empty()) { result.content+=text; if (onDelta) onDelta(text); }
        const auto* toolChunks=delta->find("tool_calls");
        if (toolChunks && toolChunks->isArray()) for (const auto& part:toolChunks->array()) {
            const int index=static_cast<int>(util::jint(part,"index",0)); auto& entry=calls[index];
            entry.first.id+=util::jstr(part,"id");
            if (const auto* fn=part.find("function")) { entry.first.name+=util::jstr(*fn,"name"); entry.second+=util::jstr(*fn,"arguments"); }
        }
        if (const auto* usage=root.find("usage")) result.usage=*usage;
    };
    while (WinHttpReadData(request.get(),chunk,sizeof(chunk),&got) && got) {
        pending.append(chunk,got); std::size_t nl;
        while ((nl=pending.find('\n'))!=std::string::npos) { consumeLine(pending.substr(0,nl)); pending.erase(0,nl+1); }
    }
    if (!pending.empty()) consumeLine(pending);
    for (auto& item:calls) { try { item.second.first.arguments=json::Value::parse(item.second.second); } catch (...) { item.second.first.arguments=json::Value::object({{"__raw__",item.second.second}}); } result.toolCalls.push_back(std::move(item.second.first)); }
    return result;
}

#else

std::string winHttpPost(const std::string&, const std::string&, const std::string&, int) {
    throw LLMError(
        "the built-in OpenAI transport requires Windows/WinHTTP. "
        "Use provider = \"mock\" or provide a custom ILLMProvider.");
}
LLMResponse winHttpPostStream(const std::string&, const std::string&, const std::string&, int,
                              const std::function<void(const std::string&)>&) {
    throw LLMError("streaming transport requires Windows/WinHTTP");
}

#endif

}  // namespace

OpenAICompatibleLLM::OpenAICompatibleLLM(LLMConfig config)
    : config_(std::move(config)), endpoint_(endpointFor(config_.baseUrl)) {
    if (config_.apiKey.empty() && !isLocal(config_.baseUrl)) {
        throw LLMError(
            "LLM API key is missing. Set PETCORE_LLM_API_KEY (or llm.api_key), "
            "or use provider = \"mock\" to try the framework offline.");
    }
}

std::string OpenAICompatibleLLM::post(const std::string& body) {
    std::string lastError;
    for (int attempt = 0; attempt < 3; ++attempt) {
        try {
            return winHttpPost(endpoint_, config_.apiKey, body, config_.timeoutSeconds);
        } catch (const LLMError& error) {
            lastError = error.what();
            const bool retryable = lastError.find("HTTP 429") != std::string::npos ||
                                   lastError.find("HTTP 5") != std::string::npos ||
                                   lastError.find("WinHTTP error 12002") != std::string::npos ||
                                   lastError.find("WinHTTP error 12029") != std::string::npos ||
                                   lastError.find("WinHTTP error 12030") != std::string::npos ||
                                   lastError.find("WinHTTP error 12031") != std::string::npos;
            if (!retryable || attempt == 2) break;
            std::this_thread::sleep_for(std::chrono::milliseconds(300 * (1 << attempt)));
        }
    }
    throw LLMError(lastError);
}

LLMResponse OpenAICompatibleLLM::chat(const std::vector<Message>& messages,
                                      const json::Value& tools) {
    const json::Value payload = buildPayload(config_, messages, tools);
    const std::string body = payload.dump();
    return parseResponse(post(body));
}

LLMResponse OpenAICompatibleLLM::chatStream(
    const std::vector<Message>& messages, const json::Value& tools,
    const std::function<void(const std::string&)>& onDelta) {
    json::Value payload = buildPayload(config_, messages, tools);
    payload["stream"] = true;
    const std::string body = payload.dump();
    std::string lastError;
    for (int attempt=0; attempt<3; ++attempt) {
        bool emitted = false;
        try {
            return winHttpPostStream(endpoint_, config_.apiKey, body, config_.timeoutSeconds,
                [&](const std::string& delta) { emitted = true; if (onDelta) onDelta(delta); });
        } catch (const LLMError& error) {
            lastError = error.what();
            const bool retryable = lastError.find("HTTP 429") != std::string::npos ||
                lastError.find("HTTP 5") != std::string::npos ||
                lastError.find("WinHTTP error 12002") != std::string::npos ||
                lastError.find("WinHTTP error 12029") != std::string::npos ||
                lastError.find("WinHTTP error 12030") != std::string::npos ||
                lastError.find("WinHTTP error 12031") != std::string::npos;
            if (!retryable || emitted || attempt==2) break;
            std::this_thread::sleep_for(std::chrono::milliseconds(300 * (1 << attempt)));
        }
    }
    throw LLMError(lastError);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

namespace {
std::map<std::string, LLMFactory>& factories() {
    static std::map<std::string, LLMFactory> registry;
    return registry;
}

bool builtinsReady = false;

void registerBuiltins() {
    if (builtinsReady) return;
    builtinsReady = true;
    LLMRegistry::registerFactory("mock", [](const LLMConfig& config) {
        return std::make_unique<MockLLM>(config);
    });
    LLMRegistry::registerFactory("openai", [](const LLMConfig& config) {
        return std::make_unique<OpenAICompatibleLLM>(config);
    });
    for (const char* alias : {"deepseek", "ollama", "openrouter", "siliconflow", "qwen", "lmstudio"}) {
        LLMRegistry::registerFactory(alias, [](const LLMConfig& config) {
            return std::make_unique<OpenAICompatibleLLM>(config);
        });
    }
}
}  // namespace

void LLMRegistry::registerFactory(const std::string& name, LLMFactory factory) {
    factories()[util::toLowerAscii(name)] = std::move(factory);
}

std::unique_ptr<ILLMProvider> LLMRegistry::create(const LLMConfig& config) {
    registerBuiltins();
    const auto it = factories().find(util::toLowerAscii(config.provider));
    if (it == factories().end()) {
        throw LLMError("unknown LLM provider '" + config.provider + "'. Available: " +
                       util::join(available(), ", "));
    }
    return it->second(config);
}

std::vector<std::string> LLMRegistry::available() {
    registerBuiltins();
    std::vector<std::string> names;
    for (const auto& [name, factory] : factories()) names.push_back(name);
    return names;
}

}  // namespace petcore
