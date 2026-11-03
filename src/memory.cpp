#include "petcore/memory.hpp"

#include <algorithm>
#include <cctype>
#include <set>
#include <sstream>

#include "petcore/llm.hpp"
#include "petcore/util.hpp"

namespace petcore {
namespace {

std::vector<std::string> queryTokens(const std::string& query) {
    std::vector<std::string> tokens;
    std::string ascii;
    std::string previousCjk;
    const std::string lower = util::toLowerAscii(query);

    for (std::size_t i = 0; i < lower.size();) {
        const unsigned char c = static_cast<unsigned char>(lower[i]);
        if (c < 0x80) {
            if (std::isalnum(c)) {
                ascii.push_back(static_cast<char>(c));
            } else if (!ascii.empty()) {
                if (ascii.size() >= 2) tokens.push_back(ascii);
                ascii.clear();
            }
            previousCjk.clear();
            ++i;
            continue;
        }
        if (!ascii.empty()) {
            if (ascii.size() >= 2) tokens.push_back(ascii);
            ascii.clear();
        }
        std::size_t length = 1;
        if ((c & 0xE0) == 0xC0) length = 2;
        else if ((c & 0xF0) == 0xE0) length = 3;
        else if ((c & 0xF8) == 0xF0) length = 4;
        const std::string character = lower.substr(i, length);
        // CJK Unified Ideographs — bigrams work well enough for Chinese recall.
        const bool cjk = length == 3 && c >= 0xE4 && c <= 0xE9;
        if (cjk) {
            if (!previousCjk.empty()) tokens.push_back(previousCjk + character);
            previousCjk = character;
        } else {
            previousCjk.clear();
        }
        i += length;
    }
    if (!ascii.empty() && ascii.size() >= 2) tokens.push_back(ascii);
    return tokens;
}

std::string joinTags(const std::vector<std::string>& tags) {
    return util::join(tags, " ");
}

}  // namespace

int relevanceScore(const std::string& query, const FactRecord& fact) {
    if (query.empty()) return 1;
    const std::string haystack = util::toLowerAscii(fact.key + " " + fact.value + " " + joinTags(fact.tags));
    int score = 0;
    if (haystack.find(util::toLowerAscii(query)) != std::string::npos) score += 6;
    for (const auto& token : queryTokens(query)) {
        if (token.size() >= 2 && haystack.find(token) != std::string::npos) score += 2;
    }
    return score;
}

MemoryService::MemoryService(IDatabase& database, int historyLimit)
    : database_(database), historyLimit_(historyLimit > 0 ? historyLimit : 20) {}

MessageRecord MemoryService::record(const std::string& sessionId, Message message) {
    if (message.createdAt.empty()) message.createdAt = util::nowIso();
    return database_.appendMessage(sessionId, message);
}

std::vector<Message> MemoryService::history(const std::string& sessionId, int limit) const {
    const int effective = limit > 0 ? limit : historyLimit_;
    std::vector<Message> messages;
    for (const auto& record : database_.getMessages(sessionId, static_cast<std::size_t>(effective), 0)) {
        messages.push_back(record.message);
    }
    return messages;
}

void MemoryService::remember(const std::string& sessionId, const std::string& key,
                             const std::string& value, const std::vector<std::string>& tags) {
    database_.upsertFact(sessionId, key, value, tags);
}

std::vector<FactRecord> MemoryService::recall(const std::string& sessionId,
                                              const std::string& query,
                                              std::size_t limit) const {
    std::vector<FactRecord> facts = database_.listFacts(sessionId);
    std::vector<std::pair<int, FactRecord>> scored;
    for (auto& fact : facts) {
        const int score = relevanceScore(query, fact);
        if (score > 0) scored.emplace_back(score, std::move(fact));
    }
    std::sort(scored.begin(), scored.end(), [](const auto& a, const auto& b) {
        if (a.first != b.first) return a.first > b.first;
        return a.second.updatedAt > b.second.updatedAt;
    });
    std::vector<FactRecord> results;
    for (std::size_t i = 0; i < scored.size() && i < limit; ++i) {
        results.push_back(std::move(scored[i].second));
    }
    return results;
}

std::string MemoryService::summary(const std::string& sessionId) const {
    const auto session = database_.getSession(sessionId);
    return session ? session->summary : "";
}

bool MemoryService::maybeSummarize(const std::string& sessionId, ILLMProvider& llm,
                                   int trigger, int keepRecent) {
    const auto session = database_.getSession(sessionId);
    if (!session) return false;
    const int total = database_.countMessages(sessionId);
    if (total <= trigger || keepRecent < 0) return false;

    const int cutoff = total - keepRecent;
    if (cutoff <= session->summaryUpto) return false;

    auto records = database_.getMessages(sessionId, 0, session->summaryUpto);
    std::ostringstream transcript;
    int lastSeq = session->summaryUpto;
    for (const auto& record : records) {
        if (record.seq > cutoff) break;
        lastSeq = record.seq;
        const std::string role = record.message.role == "user" ? "用户" : "桌宠";
        transcript << role << "：" << record.message.content << "\n";
    }
    if (lastSeq <= session->summaryUpto) return false;

    std::vector<Message> messages;
    messages.push_back(Message{"system",
                               "你是一个记忆压缩器。只输出简洁的中文摘要，保留用户偏好、事实、承诺和未完成事项。",
                               {}, "", "", util::nowIso()});
    messages.push_back(Message{"user",
                               "【记忆压缩】请把下面的对话与旧摘要合并成一段不超过 300 字的长期记忆：\n\n旧摘要：\n" +
                                   (session->summary.empty() ? "（无）" : session->summary) +
                                   "\n\n新增对话：\n" + transcript.str(),
                               {}, "", "", util::nowIso()});
    try {
        LLMResponse response = llm.chat(messages, json::Value::array({}));
        const std::string text = util::trim(response.content);
        if (text.empty()) return false;
        SessionRecord updated = *session;
        updated.summary = text;
        updated.summaryUpto = lastSeq;
        database_.updateSession(updated);
        return true;
    } catch (...) {
        return false;  // summarisation is best-effort and must never break a turn
    }
}

}  // namespace petcore
