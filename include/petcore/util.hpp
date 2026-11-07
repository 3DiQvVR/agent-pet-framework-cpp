#pragma once

#include <algorithm>
#include <chrono>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <random>
#include <sstream>
#include <string>
#include <vector>

#include "petcore/json.hpp"

namespace petcore::util {

inline std::string nowIso() {
    const auto now = std::chrono::system_clock::now();
    const std::time_t time = std::chrono::system_clock::to_time_t(now);
    std::tm tm{};
#if defined(_WIN32)
    gmtime_s(&tm, &time);
#else
    gmtime_r(&time, &tm);
#endif
    char buffer[32];
    std::strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &tm);
    return buffer;
}

inline long long nowUnix() {
    return static_cast<long long>(std::chrono::duration_cast<std::chrono::seconds>(
                                      std::chrono::system_clock::now().time_since_epoch())
                                      .count());
}

inline std::string uuid() {
    static thread_local std::mt19937_64 rng{std::random_device{}()};
    std::uniform_int_distribution<std::uint64_t> dist;
    const std::uint64_t a = dist(rng);
    const std::uint64_t b = dist(rng);
    char buffer[37];
    std::snprintf(buffer, sizeof(buffer), "%08x-%04x-%04x-%04x-%012llx",
                  static_cast<unsigned>(a >> 32), static_cast<unsigned>((a >> 16) & 0xFFFF),
                  static_cast<unsigned>(a & 0xFFFF), static_cast<unsigned>((b >> 48) & 0xFFFF),
                  static_cast<unsigned long long>(b & 0xFFFFFFFFFFFFULL));
    return buffer;
}

inline std::string trim(const std::string& input) {
    std::size_t begin = 0;
    while (begin < input.size() && std::isspace(static_cast<unsigned char>(input[begin]))) ++begin;
    std::size_t end = input.size();
    while (end > begin && std::isspace(static_cast<unsigned char>(input[end - 1]))) --end;
    return input.substr(begin, end - begin);
}

inline std::string toLowerAscii(std::string input) {
    std::transform(input.begin(), input.end(), input.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return input;
}

inline bool startsWith(const std::string& text, const std::string& prefix) {
    return text.size() >= prefix.size() && text.compare(0, prefix.size(), prefix) == 0;
}

inline bool endsWith(const std::string& text, const std::string& suffix) {
    return text.size() >= suffix.size() &&
           text.compare(text.size() - suffix.size(), suffix.size(), suffix) == 0;
}

inline std::string replaceAll(std::string text, const std::string& from, const std::string& to) {
    if (from.empty()) return text;
    std::size_t pos = 0;
    while ((pos = text.find(from, pos)) != std::string::npos) {
        text.replace(pos, from.size(), to);
        pos += to.size();
    }
    return text;
}

// Lightweight glob matcher supporting only '*' (enough for tool allow lists).
inline bool globMatch(const std::string& pattern, const std::string& text) {
    std::size_t p = 0, t = 0, star = std::string::npos, mark = 0;
    while (t < text.size()) {
        if (p < pattern.size() && (pattern[p] == text[t])) {
            ++p;
            ++t;
        } else if (p < pattern.size() && pattern[p] == '*') {
            star = p++;
            mark = t;
        } else if (star != std::string::npos) {
            p = star + 1;
            t = ++mark;
        } else {
            return false;
        }
    }
    while (p < pattern.size() && pattern[p] == '*') ++p;
    return p == pattern.size();
}

inline bool matchesAny(const std::vector<std::string>& patterns, const std::string& text) {
    for (const auto& pattern : patterns) {
        if (globMatch(pattern, text)) return true;
    }
    return false;
}

inline std::string getEnv(const std::string& name, const std::string& fallback = "") {
    const char* value = std::getenv(name.c_str());
    return value ? std::string(value) : fallback;
}

inline std::string readFile(const std::string& path) {
    std::ifstream stream(path, std::ios::binary);
    if (!stream) throw std::runtime_error("cannot open file for reading: " + path);
    std::ostringstream buffer;
    buffer << stream.rdbuf();
    return buffer.str();
}

inline void ensureParentDirectory(const std::string& path) {
    std::filesystem::path file(path);
    if (file.has_parent_path()) {
        std::filesystem::create_directories(file.parent_path());
    }
}

void writeFileAtomic(const std::string& path, const std::string& content);

// Resolve an untrusted relative asset name, rejecting rooted paths and escapes
// through existing symlinks/junctions. Throws on invalid or inaccessible paths.
std::filesystem::path confinedPath(const std::filesystem::path& root, const std::string& relative);

// Limit UTF-8 text by bytes without splitting a code point. Marker fits inside
// the same budget. Input is expected to be valid UTF-8.
inline std::string truncateUtf8(const std::string& text, std::size_t budget,
                                const std::string& marker = "") {
    if (text.size() <= budget) return text;
    const std::string suffix = marker.size() <= budget ? marker : "";
    std::size_t end = budget - suffix.size();
    while (end > 0 && (static_cast<unsigned char>(text[end]) & 0xC0) == 0x80) --end;
    return text.substr(0, end) + suffix;
}

inline std::string resolvePath(const std::string& base, const std::string& value) {
    std::filesystem::path path(value);
    if (path.is_absolute()) return path.lexically_normal().string();
    return (std::filesystem::path(base) / path).lexically_normal().string();
}

inline std::string join(const std::vector<std::string>& items, const std::string& separator) {
    std::string out;
    for (std::size_t i = 0; i < items.size(); ++i) {
        if (i) out += separator;
        out += items[i];
    }
    return out;
}

// Small JSON accessors used by config/card parsers.
inline std::string jstr(const json::Value& object, const std::string& key,
                        const std::string& fallback = "") {
    if (const auto* value = object.find(key)) {
        if (value->isString()) return value->asString();
    }
    return fallback;
}

inline int jint(const json::Value& object, const std::string& key, int fallback = 0) {
    if (const auto* value = object.find(key)) {
        if (value->isNumber()) return static_cast<int>(value->asNumber());
    }
    return fallback;
}

inline double jdouble(const json::Value& object, const std::string& key, double fallback = 0.0) {
    if (const auto* value = object.find(key)) {
        if (value->isNumber()) return value->asNumber();
    }
    return fallback;
}

inline bool jbool(const json::Value& object, const std::string& key, bool fallback = false) {
    if (const auto* value = object.find(key)) {
        if (value->isBool()) return value->asBool();
    }
    return fallback;
}

inline std::vector<std::string> jstrings(const json::Value& object, const std::string& key) {
    std::vector<std::string> out;
    if (const auto* value = object.find(key)) {
        if (value->isArray()) {
            for (const auto& item : value->array()) {
                if (item.isString()) out.push_back(item.asString());
            }
        } else if (value->isString()) {
            out.push_back(value->asString());
        }
    }
    return out;
}

}  // namespace petcore::util
