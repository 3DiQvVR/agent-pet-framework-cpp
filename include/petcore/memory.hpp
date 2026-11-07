#pragma once

#include <string>
#include <vector>

#include "petcore/database.hpp"
#include "petcore/types.hpp"

namespace petcore {

class ILLMProvider;

// Conversation history + long-term facts live in IDatabase; this service adds
// retrieval, summarisation and convenience methods on top.
class MemoryService {
public:
    explicit MemoryService(IDatabase& database, int historyLimit = 20,
                           std::function<long long()> clock = {});

    MessageRecord record(const std::string& sessionId, Message message);
    std::vector<Message> history(const std::string& sessionId, int limit = 0) const;

    void remember(const std::string& sessionId, const std::string& key,
                  const std::string& value, const std::vector<std::string>& tags);
    std::vector<FactRecord> recall(const std::string& sessionId, const std::string& query,
                                   std::size_t limit = 5, bool reinforce = true) const;
    void review(const FactRecord& fact) const;

    std::string summary(const std::string& sessionId) const;

    // Compress older turns into session.summary once the threshold is crossed.
    // Returns true when a new summary was stored.
    bool maybeSummarize(const std::string& sessionId, ILLMProvider& llm, int trigger,
                        int keepRecent);

private:
    IDatabase& database_;
    int historyLimit_;
    std::function<long long()> clock_;
};

// Exposed for tests: simple keyword + CJK bigram relevance score.
int relevanceScore(const std::string& query, const FactRecord& fact);

// Engineering approximation of forgetting: R(t) = 1 / (1 + t / halfLife).
// Strength is bounded to 24 hours .. 365 days; reviews have a one-hour cooldown.
double memoryRetention(const FactRecord& fact, long long now);
bool reinforceMemory(FactRecord& fact, long long now);

}  // namespace petcore
