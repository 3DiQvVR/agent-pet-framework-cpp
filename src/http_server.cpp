#include "petcore/http_server.hpp"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <filesystem>
#include <map>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <thread>
#include <vector>

#include "petcore/runtime.hpp"
#include "petcore/errors.hpp"
#include "petcore/util.hpp"

#if defined(_WIN32)
#include <winsock2.h>
#include <ws2tcpip.h>
#define NOMINMAX
#include <windows.h>
#include <dwmapi.h>
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
using SOCKET = int;
static constexpr int INVALID_SOCKET = -1;
#endif

namespace petcore {
namespace {

struct HttpRequest {
    std::string method;
    std::string path;
    std::map<std::string, std::string> headers;
    std::string body;
};

std::string urlDecode(const std::string& text, bool plusAsSpace = true) {
    std::string out;
    for (std::size_t i = 0; i < text.size(); ++i) {
        if (text[i] == '%' && i + 2 < text.size()) {
            auto hex = [](char c) -> int {
                if (c >= '0' && c <= '9') return c - '0';
                if (c >= 'a' && c <= 'f') return c - 'a' + 10;
                if (c >= 'A' && c <= 'F') return c - 'A' + 10;
                return -1;
            };
            const int hi = hex(text[i + 1]);
            const int lo = hex(text[i + 2]);
            if (hi >= 0 && lo >= 0) {
                out.push_back(static_cast<char>((hi << 4) | lo));
                i += 2;
                continue;
            }
        }
        out.push_back(plusAsSpace && text[i] == '+' ? ' ' : text[i]);
    }
    return out;
}

std::map<std::string, std::string> parseQuery(const std::string& path, std::string& route) {
    std::map<std::string, std::string> query;
    const auto mark = path.find('?');
    route = mark == std::string::npos ? path : path.substr(0, mark);
    if (mark == std::string::npos) return query;
    std::string raw = path.substr(mark + 1);
    std::size_t start = 0;
    while (start <= raw.size()) {
        const auto amp = raw.find('&', start);
        const std::string pair = raw.substr(start, amp == std::string::npos ? std::string::npos : amp - start);
        const auto eq = pair.find('=');
        if (eq != std::string::npos) {
            query[urlDecode(pair.substr(0, eq))] = urlDecode(pair.substr(eq + 1));
        }
        if (amp == std::string::npos) break;
        start = amp + 1;
    }
    return query;
}

json::Value sessionToJson(const SessionRecord& session, bool includeState = false) {
    json::Value value = json::Value::object({
        {"id", session.id},
        {"character_id", session.characterId},
        {"title", session.title},
        {"summary", session.summary},
        {"created_at", session.createdAt},
        {"updated_at", session.updatedAt},
    });
    if (includeState) value["state"] = session.state;
    return value;
}

json::Value factsToJson(const std::vector<FactRecord>& facts) {
    json::Value items = json::Value::array({});
    for (const auto& fact : facts) {
        json::Value tags = json::Value::array({});
        for (const auto& tag : fact.tags) tags.push_back(tag);
        items.push_back(json::Value::object({
            {"key", fact.key},
            {"value", fact.value},
            {"tags", tags},
            {"updated_at", fact.updatedAt},
        }));
    }
    return items;
}

std::string contentTypeFor(const std::string& path) {
    const auto dot = path.find_last_of('.');
    const std::string ext = dot == std::string::npos ? "" : util::toLowerAscii(path.substr(dot));
    if (ext == ".html") return "text/html; charset=utf-8";
    if (ext == ".css") return "text/css; charset=utf-8";
    if (ext == ".js") return "application/javascript; charset=utf-8";
    if (ext == ".svg") return "image/svg+xml";
    if (ext == ".png") return "image/png";
    if (ext == ".webp") return "image/webp";
    if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
    if (ext == ".moc3") return "application/octet-stream";
    if (ext == ".ico") return "image/x-icon";
    if (ext == ".json") return "application/json; charset=utf-8";
    return "text/plain; charset=utf-8";
}

}  // namespace

struct HttpServer::Impl {
    Runtime& runtime;
    std::string host;
    int port;
    std::string webRoot;
    std::atomic<bool> running{false};
    SOCKET listener = INVALID_SOCKET;
    std::thread acceptThread;
    std::mutex workersMutex;
    std::vector<std::thread> workers;
    std::mutex chatMutex;
    int actualPort = 0;

    Impl(Runtime& runtime_, std::string host_, int port_, std::string webRoot_)
        : runtime(runtime_), host(std::move(host_)), port(port_), webRoot(std::move(webRoot_)) {}

    ~Impl() { stop(); }

    bool sendAll(SOCKET socket, const char* data, std::size_t length) {
        std::size_t sent = 0;
        while (sent < length) {
            const int chunk = static_cast<int>(std::min<std::size_t>(length - sent, 1 << 20));
            const int result = ::send(socket, data + sent, chunk, 0);
            if (result <= 0) return false;
            sent += static_cast<std::size_t>(result);
        }
        return true;
    }

    bool sendAll(SOCKET socket, const std::string& data) {
        return sendAll(socket, data.data(), data.size());
    }

    void sendResponse(SOCKET socket, int status, const std::string& contentType,
                      const std::string& body, bool includeBody = true) {
        std::ostringstream head;
        head << "HTTP/1.1 " << status << " "
             << (status == 200 ? "OK" : status == 204 ? "No Content" : status == 400 ? "Bad Request"
                     : status == 404 ? "Not Found" : status == 500 ? "Internal Server Error"
                                                                   : "Error")
             << "\r\n";
        head << "Content-Type: " << contentType << "\r\n";
        head << "Content-Length: " << body.size() << "\r\n";
        head << "Cache-Control: no-store\r\n";
        head << "Connection: close\r\n\r\n";
        if (!sendAll(socket, head.str())) return;
        if (includeBody) sendAll(socket, body);
    }

    void sendJson(SOCKET socket, int status, const json::Value& value) {
        sendResponse(socket, status, "application/json; charset=utf-8", value.dump());
    }

    void sendError(SOCKET socket, int status, const std::string& message) {
        sendJson(socket, status, json::Value::object({{"error", message}}));
    }

#if defined(_WIN32)
    static HWND findPetWindow() {
        struct Search { HWND window = nullptr; } search;
        EnumWindows([](HWND window, LPARAM parameter) -> BOOL {
            auto* result = reinterpret_cast<Search*>(parameter);
            if (!IsWindowVisible(window)) return TRUE;
            wchar_t title[512]{};
            GetWindowTextW(window, title, static_cast<int>(std::size(title)));
            if (std::wstring(title).find(L"PetCore -") != std::wstring::npos) {
                result->window = window;
                return FALSE;
            }
            return TRUE;
        }, reinterpret_cast<LPARAM>(&search));
        return search.window;
    }

    static void closeDesktopPet() {
        if (HWND window = findPetWindow()) PostMessageW(window, WM_CLOSE, 0, 0);
    }

    bool launchDesktopPet(const std::string& characterId) {
        closeDesktopPet();
        Sleep(250);
        wchar_t programFiles[MAX_PATH]{};
        DWORD length = GetEnvironmentVariableW(L"ProgramFiles(x86)", programFiles, MAX_PATH);
        if (!length || length >= MAX_PATH) {
            length = GetEnvironmentVariableW(L"ProgramFiles", programFiles, MAX_PATH);
            if (!length || length >= MAX_PATH) return false;
        }
        std::wstring edge = std::wstring(programFiles) + L"\\Microsoft\\Edge\\Application\\msedge.exe";
        if (GetFileAttributesW(edge.c_str()) == INVALID_FILE_ATTRIBUTES) return false;

        wchar_t localAppData[MAX_PATH]{};
        length = GetEnvironmentVariableW(L"LOCALAPPDATA", localAppData, MAX_PATH);
        if (!length || length >= MAX_PATH) return false;
        const std::wstring profile = std::wstring(localAppData) + L"\\PetCore\\Live2DProfile";
        std::error_code profileError;
        std::filesystem::create_directories(profile, profileError);
        if (profileError) return false;

        const std::string url = "http://127.0.0.1:" + std::to_string(actualPort) +
                                "/live2d.html?character=" + characterId;
        std::wstring command = L"\"" + edge + L"\" --app=" + std::wstring(url.begin(), url.end()) +
                               L" --new-window --no-first-run --disable-sync --user-data-dir=\"" + profile +
                               L"\" --window-size=440,720";
        STARTUPINFOW startup{};
        startup.cb = sizeof(startup);
        PROCESS_INFORMATION process{};
        if (!CreateProcessW(edge.c_str(), command.data(), nullptr, nullptr, FALSE,
                            CREATE_NEW_PROCESS_GROUP, nullptr, nullptr, &startup, &process)) return false;
        CloseHandle(process.hThread);
        CloseHandle(process.hProcess);

        for (int attempt = 0; attempt < 40; ++attempt) {
            if (HWND window = findPetWindow()) {
                const LONG_PTR style = GetWindowLongPtrW(window, GWL_STYLE);
                SetWindowLongPtrW(window, GWL_STYLE,
                                  (style & ~(WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX |
                                             WS_MAXIMIZEBOX | WS_SYSMENU)) | WS_POPUP);
                const MARGINS glass{-1, -1, -1, -1};
                DwmExtendFrameIntoClientArea(window, &glass);
                SetWindowPos(window, HWND_TOPMOST, 0, 0, 440, 720,
                             SWP_NOMOVE | SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_FRAMECHANGED);
                return true;
            }
            Sleep(250);
        }
        return false;
    }
#endif

    bool readRequest(SOCKET socket, HttpRequest& request) {
#if defined(_WIN32)
        DWORD timeout = 10000;
        setsockopt(socket, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char*>(&timeout), sizeof(timeout));
        setsockopt(socket, SOL_SOCKET, SO_SNDTIMEO, reinterpret_cast<const char*>(&timeout), sizeof(timeout));
#endif
        std::string buffer;
        char chunk[4096];
        while (buffer.find("\r\n\r\n") == std::string::npos) {
            const int received = ::recv(socket, chunk, sizeof(chunk), 0);
            if (received <= 0) return false;
            buffer.append(chunk, static_cast<std::size_t>(received));
            if (buffer.size() > 65536) return false;
        }
        const auto headerEnd = buffer.find("\r\n\r\n");
        const std::string head = buffer.substr(0, headerEnd);
        std::string body = buffer.substr(headerEnd + 4);

        std::istringstream lines(head);
        std::string line;
        std::getline(lines, line);
        if (!line.empty() && line.back() == '\r') line.pop_back();
        std::istringstream first(line);
        first >> request.method >> request.path;
        if (request.method.empty() || request.path.empty()) return false;

        std::size_t contentLength = 0;
        while (std::getline(lines, line)) {
            if (!line.empty() && line.back() == '\r') line.pop_back();
            const auto colon = line.find(':');
            if (colon == std::string::npos) continue;
            std::string key = util::toLowerAscii(util::trim(line.substr(0, colon)));
            std::string value = util::trim(line.substr(colon + 1));
            request.headers[key] = value;
            if (key == "content-length") {
                try {
                    contentLength = static_cast<std::size_t>(std::stoull(value));
                } catch (...) {
                    return false;
                }
            }
        }
        if (contentLength > 16 * 1024 * 1024) return false;
        while (body.size() < contentLength) {
            const int received = ::recv(socket, chunk, sizeof(chunk), 0);
            if (received <= 0) return false;
            body.append(chunk, static_cast<std::size_t>(received));
        }
        body.resize(contentLength);
        request.body = std::move(body);
        return true;
    }

    void handleClient(SOCKET socket) {
        HttpRequest request;
        if (!readRequest(socket, request)) {
            closeSocket(socket);
            return;
        }
        try {
            route(socket, request);
        } catch (const std::exception& error) {
            sendError(socket, 500, error.what());
        } catch (...) {
            sendError(socket, 500, "unknown server error");
        }
        closeSocket(socket);
    }

    static void closeSocket(SOCKET socket) {
#if defined(_WIN32)
        ::closesocket(socket);
#else
        ::close(socket);
#endif
    }

    void route(SOCKET socket, const HttpRequest& request) {
        // This server is intended for the bundled same-origin UI only. Do not
        // grant browser pages on other origins access to its state-changing API.
        const auto origin = request.headers.find("origin");
        if (origin != request.headers.end()) {
            const std::string expected = "http://127.0.0.1:" + std::to_string(actualPort);
            const std::string localhost = "http://localhost:" + std::to_string(actualPort);
            if (origin->second != expected && origin->second != localhost) {
                sendError(socket, 403, "cross-origin request denied");
                return;
            }
        }
        if (request.method == "OPTIONS") {
            sendError(socket, 403, "cross-origin preflight denied");
            return;
        }

        std::string path;
        const auto query = parseQuery(request.path, path);

        // User supplied Cubism assets are stored separately from character JSON.
        // Keep paths confined to one custom character's model directory.
        const std::string uploadPrefix = "/api/live2d/";
        if (request.method == "PUT" && util::startsWith(path, uploadPrefix)) {
            const std::string tail = path.substr(uploadPrefix.size());
            const auto slash = tail.find('/');
            if (slash == std::string::npos || slash == 0 || slash + 1 >= tail.size()) {
                sendError(socket, 400, "character id and model file path are required");
                return;
            }
            const std::string id = urlDecode(tail.substr(0, slash));
            const std::string relative = urlDecode(tail.substr(slash + 1), false);
            if (!runtime.characters().isCustom(id)) {
                sendError(socket, 403, "Live2D assets can only be attached to custom characters");
                return;
            }
            const std::filesystem::path relPath(relative);
            if (relPath.is_absolute() || relative.find("..") != std::string::npos ||
                relative.find(':') != std::string::npos || relative.size() > 512 ||
                request.body.size() > 16 * 1024 * 1024) {
                sendError(socket, 400, "invalid Live2D asset path or file size");
                return;
            }
            const auto target = std::filesystem::path(runtime.config().baseDir) / "data" / "live2d" / id / relPath;
            const std::string lowerName = util::toLowerAscii(relPath.filename().string());
            const std::string modelSuffix = ".model3.json";
            if (lowerName.size() >= modelSuffix.size() &&
                lowerName.compare(lowerName.size() - modelSuffix.size(), modelSuffix.size(), modelSuffix) == 0) {
                json::Value model;
                try { model = json::Value::parse(request.body); }
                catch (const std::exception&) {
                    sendError(socket, 400, "model3.json is not valid JSON");
                    return;
                }
                const auto* references = model.find("FileReferences");
                if (!model.isObject() || !references || !references->isObject() ||
                    !references->find("Moc") || !references->at("Moc").isString()) {
                    sendError(socket, 400, "model3.json must contain FileReferences.Moc");
                    return;
                }
                auto raw = runtime.characters().get(id)->raw;
                raw["live2d_model"] = "/live2d/" + id + "/" + relative;
                runtime.characters().saveCustom(raw);
            }
            util::writeFileAtomic(target.string(), request.body);
            sendJson(socket, 200, json::Value::object({{"ok", true}}));
            return;
        }

        if (request.method == "GET" && path == "/api/health") {
            sendJson(socket, 200, json::Value::object({
                                      {"ok", true},
                                      {"name", "PetCore"},
                                      {"version", "0.1.0"},
                                  }));
            return;
        }
        if (request.method == "GET" && path == "/api/config") {
            sendJson(socket, 200, runtime.config().toPublicJson());
            return;
        }
        if (request.method == "GET" && path == "/api/tools") {
            json::Value tools = json::Value::array({});
            for (const auto& name : runtime.tools().names()) {
                const ITool* tool = runtime.tools().get(name);
                if (!tool) continue;
                const ToolSpec spec = tool->spec();
                tools.push_back(json::Value::object({
                    {"name", spec.name},
                    {"description", spec.description},
                    {"risk", spec.risk},
                }));
            }
            sendJson(socket, 200, json::Value::object({{"tools", tools}}));
            return;
        }
        if (request.method == "POST" && path == "/api/desktop/live2d/close") {
#if defined(_WIN32)
            closeDesktopPet();
            sendJson(socket, 200, json::Value::object({{"ok", true}}));
#else
            sendError(socket, 501, "desktop Live2D window is currently supported on Windows only");
#endif
            return;
        }
        if (request.method == "POST" && path == "/api/desktop/live2d") {
            const json::Value body = json::Value::parse(request.body.empty() ? "{}" : request.body);
            const std::string id = util::jstr(body, "character_id");
            if (!runtime.characters().exists(id)) {
                sendError(socket, 404, "character not found");
                return;
            }
            const auto card = runtime.characters().get(id);
            if (!card || util::jstr(card->raw, "live2d_model").empty()) {
#if defined(_WIN32)
                closeDesktopPet();
                sendJson(socket, 200, json::Value::object({{"ok", true}, {"closed", true}}));
#else
                sendError(socket, 501, "desktop Live2D window is currently supported on Windows only");
#endif
                return;
            }
            if (!runtime.characters().isCustom(id)) {
                sendError(socket, 403, "Live2D models can only be attached to custom characters");
                return;
            }
#if defined(_WIN32)
            if (!launchDesktopPet(id)) {
                sendError(socket, 500, "could not launch Microsoft Edge app window");
                return;
            }
            sendJson(socket, 200, json::Value::object({{"ok", true}, {"character_id", id}}));
#else
            sendError(socket, 501, "desktop Live2D window is currently supported on Windows only");
#endif
            return;
        }
        if (request.method == "GET" && path == "/api/characters") {
            json::Value cards = json::Value::array({});
            for (const auto& card : runtime.characters().list()) cards.push_back(card->toPublicJson());
            json::Value errors = json::Value::array({});
            for (const auto& error : runtime.characters().errors()) errors.push_back(error);
            sendJson(socket, 200, json::Value::object({{"characters", cards}, {"errors", errors}}));
            return;
        }
        if (request.method == "POST" && path == "/api/characters") {
            try {
                const json::Value body = json::Value::parse(request.body.empty() ? "{}" : request.body);
                if (!body.isObject()) {
                    sendError(socket, 400, "character card must be a JSON object");
                    return;
                }
                const std::string id = util::jstr(body, "id");
                if (id.empty()) {
                    sendError(socket, 400, "character id is required");
                    return;
                }
                if (!std::all_of(id.begin(), id.end(), [](unsigned char c) {
                        return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_';
                    }) || id.size() < 2 || id.size() > 64 || id.front() < 'a' || id.front() > 'z') {
                    sendError(socket, 400, "character id must be 2-64 lowercase letters, digits, '-' or '_', and start with a letter");
                    return;
                }
                if (runtime.characters().exists(id)) {
                    sendError(socket, 409, "character already exists: " + id);
                    return;
                }
                const auto card = runtime.characters().saveCustom(body);
                sendJson(socket, 200, json::Value::object({{"character", card->toPublicJson()}}));
            } catch (const CharacterError& error) {
                sendError(socket, 400, error.what());
            }
            return;
        }
        if (request.method == "PUT" && util::startsWith(path, "/api/characters/")) {
            const std::string id = urlDecode(path.substr(std::string("/api/characters/").size()));
            try {
                json::Value body = json::Value::parse(request.body.empty() ? "{}" : request.body);
                if (!body.isObject()) {
                    sendError(socket, 400, "character card must be a JSON object");
                    return;
                }
                body["id"] = id;
                const auto card = runtime.characters().saveCustom(body);
                sendJson(socket, 200, json::Value::object({{"character", card->toPublicJson()}}));
            } catch (const CharacterError& error) {
                sendError(socket, 400, error.what());
            }
            return;
        }
        if (request.method == "DELETE" && util::startsWith(path, "/api/characters/")) {
            const std::string id = urlDecode(path.substr(std::string("/api/characters/").size()));
            if (!runtime.characters().isCustom(id)) {
                sendError(socket, 403, "built-in characters cannot be deleted");
                return;
            }
            runtime.characters().deleteCustom(id);
            std::error_code assetError;
            std::filesystem::remove_all(std::filesystem::path(runtime.config().baseDir) / "data" / "live2d" / id,
                                        assetError);
#if defined(_WIN32)
            closeDesktopPet();
#endif
            sendJson(socket, 200, json::Value::object({{"ok", true}, {"id", id}}));
            return;
        }
        if (request.method == "GET" && util::startsWith(path, "/api/characters/")) {
            const std::string id = urlDecode(path.substr(std::string("/api/characters/").size()));
            try {
                sendJson(socket, 200, json::Value::object(
                                          {{"character", runtime.characters().get(id)->toPublicJson()}}));
            } catch (const CharacterError& error) {
                sendError(socket, 404, error.what());
            }
            return;
        }
        if (path == "/api/sessions" && request.method == "GET") {
            std::size_t limit = 20;
            if (query.count("limit")) {
                try { limit = static_cast<std::size_t>(std::stoul(query.at("limit"))); } catch (...) {}
            }
            json::Value sessions = json::Value::array({});
            for (const auto& session : runtime.sessions().list(limit)) {
                sessions.push_back(sessionToJson(session));
            }
            sendJson(socket, 200, json::Value::object({{"sessions", sessions}}));
            return;
        }
        if (path == "/api/sessions" && request.method == "POST") {
            const json::Value body = json::Value::parse(request.body.empty() ? "{}" : request.body);
            const std::string characterId = util::jstr(body, "character_id");
            if (characterId.empty()) {
                sendError(socket, 400, "character_id is required");
                return;
            }
            try {
                const auto created = runtime.sessions().create(characterId);
                sendJson(socket, 200, json::Value::object({
                                          {"session", sessionToJson(created.session, true)},
                                          {"character", created.card->toPublicJson()},
                                          {"greeting", created.greeting.content},
                                      }));
            } catch (const CharacterError& error) {
                sendError(socket, 404, error.what());
            }
            return;
        }
        if (request.method == "GET" && util::startsWith(path, "/api/sessions/")) {
            const std::string id = urlDecode(path.substr(std::string("/api/sessions/").size()));
            try {
                const auto session = runtime.sessions().get(id);
                const auto card = runtime.sessions().cardFor(session);
                json::Value messages = json::Value::array({});
                for (const auto& record : runtime.database().getMessages(id, 200, 0)) {
                    messages.push_back(record.message.toJson());
                }
                sendJson(socket, 200, json::Value::object({
                                          {"session", sessionToJson(session, true)},
                                          {"character", card->toPublicJson()},
                                          {"messages", messages},
                                      }));
            } catch (const std::exception& error) {
                sendError(socket, 404, error.what());
            }
            return;
        }
        if (request.method == "GET" && path == "/api/memory") {
            std::string scope;
            if (query.count("scope")) {
                scope = query.at("scope");
            } else if (query.count("character_id")) {
                scope = "character:" + query.at("character_id");
            } else if (query.count("session_id")) {
                scope = query.at("session_id");
            }
            if (scope.empty()) {
                sendError(socket, 400, "scope, character_id or session_id is required");
                return;
            }
            sendJson(socket, 200, json::Value::object({{"facts", factsToJson(runtime.database().listFacts(scope))}}));
            return;
        }
        if (request.method == "POST" && path == "/api/chat") {
            handleChat(socket, request);
            return;
        }

        serveStatic(socket, request);
    }

    void handleChat(SOCKET socket, const HttpRequest& request) {
        json::Value body;
        try {
            body = json::Value::parse(request.body.empty() ? "{}" : request.body);
        } catch (const std::exception& error) {
            sendError(socket, 400, std::string("invalid JSON: ") + error.what());
            return;
        }
        const std::string sessionId = util::jstr(body, "session_id");
        const std::string message = util::jstr(body, "message");
        if (sessionId.empty() || message.empty()) {
            sendError(socket, 400, "session_id and message are required");
            return;
        }
        // Validate before switching to SSE so 404 can be a normal JSON response.
        try {
            runtime.sessions().get(sessionId);
        } catch (const std::exception& error) {
            sendError(socket, 404, error.what());
            return;
        }

        const std::string headers =
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/event-stream; charset=utf-8\r\n"
            "Cache-Control: no-cache\r\n"
            "Connection: close\r\n"
            "X-Accel-Buffering: no\r\n\r\n";
        if (!sendAll(socket, headers)) return;

        std::lock_guard<std::mutex> lock(chatMutex);
        auto emit = [&](const AgentEvent& event) {
            const std::string payload = "data: " + event.toJson().dump() + "\n\n";
            sendAll(socket, payload);
        };
        try {
            runtime.chat(sessionId, message, emit);
        } catch (const std::exception& error) {
            emit(AgentEvent{"error", json::Value::object({{"message", error.what()}})});
            emit(AgentEvent{"done", json::Value::object({{"text", ""}, {"stop_reason", "error"}})});
        }
    }

    void serveStatic(SOCKET socket, const HttpRequest& request) {
        if (request.method != "GET" && request.method != "HEAD") {
            sendError(socket, 404, "not found");
            return;
        }
        std::string path = request.path;
        const auto queryMark = path.find('?');
        if (queryMark != std::string::npos) path.resize(queryMark);
        path = urlDecode(path, false);
        if (path == "/") path = "/index.html";
        if (path.find("..") != std::string::npos || path.find('\\') != std::string::npos ||
            path.find(':') != std::string::npos) {
            sendError(socket, 400, "invalid path");
            return;
        }
        const std::filesystem::path file = util::startsWith(path, "/live2d/")
            ? std::filesystem::path(runtime.config().baseDir) / "data" / path.substr(1)
            : std::filesystem::path(webRoot) / path.substr(path.empty() ? 0 : 1);
        std::error_code error;
        if (!std::filesystem::is_regular_file(file, error)) {
            sendError(socket, 404, "not found: " + path);
            return;
        }
        const std::string content = util::readFile(file.string());
        sendResponse(socket, 200, contentTypeFor(path), content, request.method != "HEAD");
        return;
    }

    void acceptLoop() {
#if defined(_WIN32)
        while (running) {
            sockaddr_in address{};
            int length = sizeof(address);
            const SOCKET client = ::accept(listener, reinterpret_cast<sockaddr*>(&address), &length);
            if (client == INVALID_SOCKET) {
                if (!running) break;
                continue;
            }
            std::lock_guard<std::mutex> lock(workersMutex);
            workers.emplace_back([this, client] {
                try { handleClient(client); } catch (...) { closeSocket(client); }
            });
        }
#endif
    }

    void start() {
#if defined(_WIN32)
        WSADATA data{};
        if (WSAStartup(MAKEWORD(2, 2), &data) != 0) {
            throw std::runtime_error("WSAStartup failed");
        }
        listener = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (listener == INVALID_SOCKET) {
            WSACleanup();
            throw std::runtime_error("cannot create server socket");
        }
        BOOL reuse = TRUE;
        setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&reuse), sizeof(reuse));

        sockaddr_in address{};
        address.sin_family = AF_INET;
        address.sin_port = htons(static_cast<u_short>(port));
        if (host.empty() || host == "localhost") {
            address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        } else if (host == "0.0.0.0") {
            address.sin_addr.s_addr = htonl(INADDR_ANY);
        } else {
            if (InetPtonA(AF_INET, host.c_str(), &address.sin_addr) != 1) {
                ::closesocket(listener);
                WSACleanup();
                throw std::runtime_error("invalid UI host: " + host);
            }
        }
        if (::bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof(address)) == SOCKET_ERROR) {
            const int code = WSAGetLastError();
            ::closesocket(listener);
            WSACleanup();
            throw std::runtime_error("cannot bind UI port " + std::to_string(port) + " (WSA error " +
                                     std::to_string(code) + ")");
        }
        if (::listen(listener, 16) == SOCKET_ERROR) {
            ::closesocket(listener);
            WSACleanup();
            throw std::runtime_error("cannot listen on UI port");
        }
        int actualLength = sizeof(address);
        if (::getsockname(listener, reinterpret_cast<sockaddr*>(&address), &actualLength) == 0) {
            actualPort = ntohs(address.sin_port);
        } else {
            actualPort = port;
        }
        running = true;
        acceptThread = std::thread([this] { acceptLoop(); });
#else
        throw std::runtime_error("the built-in UI server currently supports Windows only");
#endif
    }

    void stop() {
        if (!running.exchange(false)) {
            if (listener != INVALID_SOCKET) {
#if defined(_WIN32)
                ::closesocket(listener);
#endif
                listener = INVALID_SOCKET;
            }
            return;
        }
        if (listener != INVALID_SOCKET) {
#if defined(_WIN32)
            ::closesocket(listener);
#endif
            listener = INVALID_SOCKET;
        }
        if (acceptThread.joinable()) acceptThread.join();
        std::vector<std::thread> pending;
        {
            std::lock_guard<std::mutex> lock(workersMutex);
            pending.swap(workers);
        }
        for (auto& worker : pending) {
            if (worker.joinable()) worker.join();
        }
#if defined(_WIN32)
        WSACleanup();
#endif
    }
};

HttpServer::HttpServer(Runtime& runtime, std::string host, int port, std::string webRoot)
    : impl_(std::make_unique<Impl>(runtime, std::move(host), port, std::move(webRoot))) {}

HttpServer::~HttpServer() = default;

void HttpServer::start() { impl_->start(); }
void HttpServer::stop() { impl_->stop(); }

std::string HttpServer::url() const {
    return "http://" + (impl_->host.empty() || impl_->host == "0.0.0.0" ? "127.0.0.1" : impl_->host) +
           ":" + std::to_string(impl_->actualPort ? impl_->actualPort : impl_->port);
}

int HttpServer::port() const { return impl_->actualPort ? impl_->actualPort : impl_->port; }

}  // namespace petcore
