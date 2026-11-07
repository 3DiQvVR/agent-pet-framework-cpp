#pragma once

#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "petcore/config.hpp"
#include "petcore/json.hpp"
#include "petcore/types.hpp"

namespace petcore {

struct SessionRecord {
    std::string id;
    std::string characterId;
    std::string title;
    std::string summary;
    int summaryUpto = 0;
    json::Value state = json::Value::object({});
    std::string createdAt;
    std::string updatedAt;

    json::Value toJson() const;
    static SessionRecord fromJson(const json::Value& value);
};

struct MessageRecord {
    std::string id;
    int seq = 0;
    Message message;
};

struct FactRecord {
    std::string id;
    std::string sessionId;
    std::string key;
    std::string value;
    std::vector<std::string> tags;
    std::string createdAt;
    std::string updatedAt;
    long long lastReviewedUnix = 0;
    double halfLifeHours = 24.0;
    int reviewCount = 0;
};

// A user-authored character card stored as JSON. Keeping the payload opaque
// means adapters do not need to know the card schema.
struct CharacterRecord {
    std::string id;
    std::string payload;
    std::string createdAt;
    std::string updatedAt;
};

// The single persistence contract of the framework. Implement this interface
// to plug in PostgreSQL, MySQL, Redis, MongoDB or a remote service.
class IDatabase {
public:
    virtual ~IDatabase() = default;

    virtual void initialize() = 0;
    virtual void close() = 0;

    virtual SessionRecord createSession(const std::string& characterId,
                                        const std::string& title) = 0;
    virtual std::optional<SessionRecord> getSession(const std::string& id) = 0;
    virtual std::vector<SessionRecord> listSessions(std::size_t limit) = 0;
    virtual void updateSession(const SessionRecord& session) = 0;

    virtual MessageRecord appendMessage(const std::string& sessionId, const Message& message) = 0;
    virtual std::vector<MessageRecord> getMessages(const std::string& sessionId,
                                                   std::size_t limit = 0,
                                                   int afterSeq = 0) = 0;
    virtual int countMessages(const std::string& sessionId) = 0;

    virtual void upsertFact(const std::string& sessionId, const std::string& key,
                            const std::string& value,
                            const std::vector<std::string>& tags) = 0;
    virtual std::vector<FactRecord> listFacts(const std::string& sessionId) = 0;
    // Optional for external adapters: atomically reinforce an unchanged fact.
    // Legacy adapters still support time-based retrieval via updatedAt.
    virtual bool reviewFact(const FactRecord&, long long) { return false; }

    // User-authored character cards. Built-in cards remain on disk; these
    // records are overlays/additions and can live in PostgreSQL/MySQL/etc.
    virtual void upsertCharacter(const CharacterRecord& character) = 0;
    virtual std::optional<CharacterRecord> getCharacter(const std::string& id) = 0;
    virtual std::vector<CharacterRecord> listCharacters() = 0;
    virtual bool deleteCharacter(const std::string& id) = 0;
};

using DatabaseFactory = std::function<std::unique_ptr<IDatabase>(const DatabaseConfig&)>;

class DatabaseRegistry {
public:
    static void registerFactory(const std::string& name, DatabaseFactory factory);
    static std::unique_ptr<IDatabase> create(const DatabaseConfig& config);
    static std::vector<std::string> available();
};

// Portable default adapter: all data lives in one JSON document and is written
// atomically (temp file + rename) after every mutation.
class JsonFileDatabase final : public IDatabase {
public:
    explicit JsonFileDatabase(std::string path, bool persist = true,
                              std::function<long long()> clock = {});
    ~JsonFileDatabase() override;

    void initialize() override;
    void close() override;

    SessionRecord createSession(const std::string& characterId, const std::string& title) override;
    std::optional<SessionRecord> getSession(const std::string& id) override;
    std::vector<SessionRecord> listSessions(std::size_t limit) override;
    void updateSession(const SessionRecord& session) override;

    MessageRecord appendMessage(const std::string& sessionId, const Message& message) override;
    std::vector<MessageRecord> getMessages(const std::string& sessionId, std::size_t limit,
                                           int afterSeq) override;
    int countMessages(const std::string& sessionId) override;

    void upsertFact(const std::string& sessionId, const std::string& key,
                    const std::string& value, const std::vector<std::string>& tags) override;
    std::vector<FactRecord> listFacts(const std::string& sessionId) override;
    bool reviewFact(const FactRecord& fact, long long now) override;

    void upsertCharacter(const CharacterRecord& character) override;
    std::optional<CharacterRecord> getCharacter(const std::string& id) override;
    std::vector<CharacterRecord> listCharacters() override;
    bool deleteCharacter(const std::string& id) override;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace petcore
