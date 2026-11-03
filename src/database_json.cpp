#include "petcore/database.hpp"

#include <algorithm>
#include <filesystem>
#include <map>
#include <mutex>

#include "petcore/errors.hpp"
#include "petcore/util.hpp"

namespace petcore {
namespace {

json::Value tagsToJson(const std::vector<std::string>& tags) {
    json::Value value = json::Value::array({});
    for (const auto& tag : tags) value.push_back(tag);
    return value;
}

std::vector<std::string> tagsFromJson(const json::Value& value) {
    std::vector<std::string> tags;
    if (value.isArray()) {
        for (const auto& item : value.array()) {
            if (item.isString()) tags.push_back(item.asString());
        }
    }
    return tags;
}

}  // namespace

json::Value SessionRecord::toJson() const {
    return json::Value::object({
        {"id", id},
        {"character_id", characterId},
        {"title", title},
        {"summary", summary},
        {"summary_upto", static_cast<double>(summaryUpto)},
        {"state", state},
        {"created_at", createdAt},
        {"updated_at", updatedAt},
    });
}

SessionRecord SessionRecord::fromJson(const json::Value& value) {
    SessionRecord session;
    session.id = util::jstr(value, "id");
    session.characterId = util::jstr(value, "character_id");
    session.title = util::jstr(value, "title");
    session.summary = util::jstr(value, "summary");
    session.summaryUpto = util::jint(value, "summary_upto", 0);
    if (const auto* state = value.find("state")) session.state = *state;
    session.createdAt = util::jstr(value, "created_at");
    session.updatedAt = util::jstr(value, "updated_at");
    return session;
}

struct JsonFileDatabase::Impl {
    std::string path;
    bool persist = true;
    mutable std::mutex mutex;
    json::Value root = json::Value::object({
        {"version", 1},
        {"sessions", json::Value::object({})},
        {"messages", json::Value::object({})},
        {"facts", json::Value::object({})},
        {"characters", json::Value::object({})},
    });

    json::Value& sessions() { return root["sessions"]; }
    json::Value& messages() { return root["messages"]; }
    json::Value& facts() { return root["facts"]; }
    json::Value& characters() { return root["characters"]; }

    void load() {
        if (!persist || path.empty() || !std::filesystem::exists(path)) return;
        try {
            json::Value parsed = json::Value::parse(util::readFile(path));
            if (!parsed.isObject()) throw DatabaseError("database root must be an object");
            root = std::move(parsed);
            if (!root.contains("sessions")) root["sessions"] = json::Value::object({});
            if (!root.contains("messages")) root["messages"] = json::Value::object({});
            if (!root.contains("facts")) root["facts"] = json::Value::object({});
            if (!root.contains("characters")) root["characters"] = json::Value::object({});
        } catch (const std::exception& error) {
            throw DatabaseError("cannot load database " + path + ": " + error.what());
        }
    }

    void save() {
        if (!persist || path.empty()) return;
        util::writeFileAtomic(path, root.dump(2));
    }
};

JsonFileDatabase::JsonFileDatabase(std::string path, bool persist)
    : impl_(std::make_unique<Impl>()) {
    impl_->path = std::move(path);
    impl_->persist = persist;
    impl_->load();
}

JsonFileDatabase::~JsonFileDatabase() {
    try {
        close();
    } catch (...) {
    }
}

void JsonFileDatabase::initialize() {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    if (impl_->persist && !impl_->path.empty()) util::ensureParentDirectory(impl_->path);
    impl_->save();
}

void JsonFileDatabase::close() {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    impl_->save();
}

SessionRecord JsonFileDatabase::createSession(const std::string& characterId,
                                              const std::string& title) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    SessionRecord session;
    session.id = util::uuid();
    session.characterId = characterId;
    session.title = title.empty() ? characterId : title;
    session.createdAt = util::nowIso();
    session.updatedAt = session.createdAt;
    session.state = json::Value::object({});
    impl_->sessions()[session.id] = session.toJson();
    impl_->save();
    return session;
}

std::optional<SessionRecord> JsonFileDatabase::getSession(const std::string& id) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    const auto* value = impl_->sessions().find(id);
    if (!value) return std::nullopt;
    return SessionRecord::fromJson(*value);
}

std::vector<SessionRecord> JsonFileDatabase::listSessions(std::size_t limit) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    std::vector<SessionRecord> sessions;
    for (const auto& [id, value] : impl_->sessions().object()) {
        sessions.push_back(SessionRecord::fromJson(value));
    }
    std::sort(sessions.begin(), sessions.end(), [](const SessionRecord& a, const SessionRecord& b) {
        return a.updatedAt > b.updatedAt;
    });
    if (limit > 0 && sessions.size() > limit) sessions.resize(limit);
    return sessions;
}

void JsonFileDatabase::updateSession(const SessionRecord& session) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    if (!impl_->sessions().contains(session.id)) {
        throw DatabaseError("session not found: " + session.id);
    }
    SessionRecord updated = session;
    updated.updatedAt = util::nowIso();
    impl_->sessions()[updated.id] = updated.toJson();
    impl_->save();
}

MessageRecord JsonFileDatabase::appendMessage(const std::string& sessionId,
                                              const Message& message) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    if (!impl_->sessions().contains(sessionId)) {
        throw DatabaseError("session not found: " + sessionId);
    }
    json::Value& list = impl_->messages()[sessionId];
    if (!list.isArray()) list = json::Value::array({});

    MessageRecord record;
    record.id = util::uuid();
    record.seq = 1;
    for (const auto& item : list.array()) {
        record.seq = std::max(record.seq, util::jint(item, "seq", 0) + 1);
    }
    record.message = message;
    if (record.message.createdAt.empty()) record.message.createdAt = util::nowIso();

    json::Value item = record.message.toJson();
    item["id"] = record.id;
    item["seq"] = static_cast<double>(record.seq);
    list.push_back(item);
    impl_->save();
    return record;
}

std::vector<MessageRecord> JsonFileDatabase::getMessages(const std::string& sessionId,
                                                         std::size_t limit, int afterSeq) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    std::vector<MessageRecord> records;
    const auto* list = impl_->messages().find(sessionId);
    if (!list || !list->isArray()) return records;

    for (const auto& item : list->array()) {
        const int seq = util::jint(item, "seq", 0);
        if (seq <= afterSeq) continue;
        MessageRecord record;
        record.id = util::jstr(item, "id");
        record.seq = seq;
        record.message = Message::fromJson(item);
        records.push_back(std::move(record));
    }
    std::sort(records.begin(), records.end(), [](const MessageRecord& a, const MessageRecord& b) {
        return a.seq < b.seq;
    });
    if (limit > 0 && records.size() > limit) {
        records.erase(records.begin(), records.end() - static_cast<std::ptrdiff_t>(limit));
    }
    return records;
}

int JsonFileDatabase::countMessages(const std::string& sessionId) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    const auto* list = impl_->messages().find(sessionId);
    return list && list->isArray() ? static_cast<int>(list->array().size()) : 0;
}

void JsonFileDatabase::upsertFact(const std::string& sessionId, const std::string& key,
                                  const std::string& value,
                                  const std::vector<std::string>& tags) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    const bool knownSession = impl_->sessions().contains(sessionId);
    const bool characterScope = sessionId.rfind("character:", 0) == 0;
    if (!knownSession && !characterScope) {
        throw DatabaseError("session not found: " + sessionId);
    }
    json::Value& bucket = impl_->facts()[sessionId];
    if (!bucket.isObject()) bucket = json::Value::object({});

    const std::string now = util::nowIso();
    if (const auto* existing = bucket.find(key)) {
        json::Value updated = *existing;
        updated["value"] = value;
        updated["tags"] = tagsToJson(tags);
        updated["updated_at"] = now;
        bucket[key] = updated;
    } else {
        bucket[key] = json::Value::object({
            {"id", util::uuid()},
            {"key", key},
            {"value", value},
            {"tags", tagsToJson(tags)},
            {"created_at", now},
            {"updated_at", now},
        });
    }
    impl_->save();
}

std::vector<FactRecord> JsonFileDatabase::listFacts(const std::string& sessionId) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    std::vector<FactRecord> facts;
    const auto* bucket = impl_->facts().find(sessionId);
    if (!bucket || !bucket->isObject()) return facts;
    for (const auto& [key, value] : bucket->object()) {
        FactRecord fact;
        fact.id = util::jstr(value, "id");
        fact.sessionId = sessionId;
        fact.key = key;
        fact.value = util::jstr(value, "value");
        if (const auto* tags = value.find("tags")) fact.tags = tagsFromJson(*tags);
        fact.createdAt = util::jstr(value, "created_at");
        fact.updatedAt = util::jstr(value, "updated_at");
        facts.push_back(std::move(fact));
    }
    return facts;
}

void JsonFileDatabase::upsertCharacter(const CharacterRecord& character) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    if (character.id.empty()) throw DatabaseError("character id cannot be empty");
    const std::string now = util::nowIso();
    std::string createdAt = now;
    if (const auto* existing = impl_->characters().find(character.id)) {
        const std::string previous = util::jstr(*existing, "created_at");
        if (!previous.empty()) createdAt = previous;
    }
    impl_->characters()[character.id] = json::Value::object({
        {"id", character.id},
        {"payload", character.payload},
        {"created_at", createdAt},
        {"updated_at", now},
    });
    impl_->save();
}

std::optional<CharacterRecord> JsonFileDatabase::getCharacter(const std::string& id) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    const auto* value = impl_->characters().find(id);
    if (!value) return std::nullopt;
    CharacterRecord record;
    record.id = id;
    record.payload = util::jstr(*value, "payload");
    record.createdAt = util::jstr(*value, "created_at");
    record.updatedAt = util::jstr(*value, "updated_at");
    return record;
}

std::vector<CharacterRecord> JsonFileDatabase::listCharacters() {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    std::vector<CharacterRecord> characters;
    for (const auto& [id, value] : impl_->characters().object()) {
        CharacterRecord record;
        record.id = id;
        record.payload = util::jstr(value, "payload");
        record.createdAt = util::jstr(value, "created_at");
        record.updatedAt = util::jstr(value, "updated_at");
        characters.push_back(std::move(record));
    }
    std::sort(characters.begin(), characters.end(), [](const CharacterRecord& a, const CharacterRecord& b) {
        return a.updatedAt > b.updatedAt;
    });
    return characters;
}

bool JsonFileDatabase::deleteCharacter(const std::string& id) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    if (!impl_->characters().contains(id)) return false;
    impl_->characters().erase(id);
    impl_->save();
    return true;
}

// ---------------------------------------------------------------------------
// Factory registry
// ---------------------------------------------------------------------------

namespace {
std::map<std::string, DatabaseFactory>& factoryMap() {
    static std::map<std::string, DatabaseFactory> factories;
    return factories;
}

bool builtinsRegistered = false;

void registerBuiltins() {
    if (builtinsRegistered) return;
    builtinsRegistered = true;
    DatabaseRegistry::registerFactory("json", [](const DatabaseConfig& config) {
        return std::make_unique<JsonFileDatabase>(config.path, true);
    });
    DatabaseRegistry::registerFactory("memory", [](const DatabaseConfig&) {
        return std::make_unique<JsonFileDatabase>("", false);
    });
}
}  // namespace

void DatabaseRegistry::registerFactory(const std::string& name, DatabaseFactory factory) {
    factoryMap()[util::toLowerAscii(name)] = std::move(factory);
}

std::unique_ptr<IDatabase> DatabaseRegistry::create(const DatabaseConfig& config) {
    registerBuiltins();
    const auto it = factoryMap().find(util::toLowerAscii(config.adapter));
    if (it == factoryMap().end()) {
        throw DatabaseError("unknown database adapter '" + config.adapter +
                            "'. Available: " + util::join(available(), ", "));
    }
    auto database = it->second(config);
    database->initialize();
    return database;
}

std::vector<std::string> DatabaseRegistry::available() {
    registerBuiltins();
    std::vector<std::string> names;
    for (const auto& [name, factory] : factoryMap()) names.push_back(name);
    return names;
}

}  // namespace petcore
