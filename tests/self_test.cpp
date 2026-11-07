// Minimal dependency-free test runner for PetCore.
#include <algorithm>
#include <cmath>
#include <limits>
#include <set>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>

#include "petcore/agent.hpp"
#include "petcore/character.hpp"
#include "petcore/config.hpp"
#include "petcore/database.hpp"
#include "petcore/emotion.hpp"
#include "petcore/errors.hpp"
#include "petcore/json.hpp"
#include "petcore/llm.hpp"
#include "petcore/llm_stream.hpp"
#include "petcore/memory.hpp"
#include "petcore/session.hpp"
#include "petcore/tools.hpp"
#include "petcore/util.hpp"

#ifndef PETCORE_TEST_CARDS_DIR
#define PETCORE_TEST_CARDS_DIR "cards"
#endif

namespace {

#define CHECK(condition)                                                                  \
    do {                                                                                  \
        if (!(condition)) {                                                               \
            throw std::runtime_error(std::string(__FILE__) + ":" + std::to_string(__LINE__) + \
                                     ": CHECK failed: " #condition);                      \
        }                                                                                 \
    } while (false)

using namespace petcore;

std::filesystem::path tempDir() {
    // Keep test data inside the working tree: system %TEMP% may be locked down
    // by endpoint security or a sandbox, while the project directory is writable.
    const auto base = std::filesystem::current_path() / "_petcore_test_tmp";
    std::filesystem::create_directories(base);
    const auto dir = base / ("case_" + util::uuid());
    std::filesystem::create_directories(dir);
    return dir;
}

bool hasEvent(const TurnResult& result, const std::string& type) {
    for (const auto& event : result.events) {
        if (event.type == type) return true;
    }
    return false;
}

void testJson() {
    const auto value = json::Value::parse(R"({"a":[1,2,"三"],"b":true,"c":null,"d":{"x":1.5}})");
    CHECK(value.isObject());
    CHECK(value.at("a").isArray());
    CHECK(value.at("a").at(2).asString() == "三");
    CHECK(value.at("b").asBool());
    CHECK(value.at("c").isNull());
    CHECK(value.at("d").at("x").asNumber() == 1.5);

    const auto roundtrip = json::Value::parse(value.dump());
    CHECK(roundtrip.dump() == value.dump());

    const auto unicode = json::Value::parse(R"("你好\n世界\u4F60")");
    CHECK(unicode.asString().find("你好") == 0);
}

void testCharacters() {
    CharacterRegistry registry({PETCORE_TEST_CARDS_DIR});
    CHECK(registry.list().size() >= 3);
    CHECK(registry.errors().empty());
    const auto card = registry.get("reimu");
    CHECK(card->name == "博丽灵梦");
    CHECK(card->emotions.count("happy"));
    CHECK(card->buildSystemPrompt("happy", 0.8, "用户喜欢下雨天", util::nowIso()).find("心情不错") !=
          std::string::npos);
    const auto styled = card->buildSystemPrompt("happy", 0.8, "", "now", "不要使用 Markdown");
    CHECK(styled.find("回复方式") != std::string::npos);
    CHECK(styled.find("不要使用 Markdown") != std::string::npos);

    bool threw = false;
    try {
        registry.get("does-not-exist");
    } catch (const CharacterError&) {
        threw = true;
    }
    CHECK(threw);
}

void testDatabaseAndMemory() {
    const auto dir = tempDir();
    const std::string path = (dir / "db.json").string();
    {
        JsonFileDatabase db(path, true);
        db.initialize();
        auto session = db.createSession("reimu", "测试会话");
        CHECK(!session.id.empty());
        CHECK(db.getSession(session.id).has_value());

        db.appendMessage(session.id, Message{"user", "你好", {}, "", "", util::nowIso()});
        db.appendMessage(session.id, Message{"assistant", "你好呀", {}, "", "", util::nowIso()});
        db.appendMessage(session.id, Message{"user", "再见", {}, "", "", util::nowIso()});
        CHECK(db.countMessages(session.id) == 3);

        const auto tail = db.getMessages(session.id, 2, 0);
        CHECK(tail.size() == 2);
        CHECK(tail.front().seq == 2);

        db.upsertFact(session.id, "用户昵称", "阿岚", {"profile"});
        db.upsertFact(session.id, "用户昵称", "阿岚岚", {"profile"});
        const auto facts = db.listFacts(session.id);
        CHECK(facts.size() == 1);
        CHECK(facts.front().value == "阿岚岚");

        MemoryService memory(db, 20);
        const auto recalled = memory.recall(session.id, "昵称", 5);
        CHECK(!recalled.empty());
        CHECK(recalled.front().key == "用户昵称");
    }
    {
        // Re-open to prove durability.
        JsonFileDatabase db(path, true);
        const auto sessions = db.listSessions(10);
        CHECK(sessions.size() == 1);
        CHECK(db.countMessages(sessions.front().id) == 3);
    }
    std::filesystem::remove_all(dir);
}

void testAgentLoop() {
    const auto dir = tempDir();
    JsonFileDatabase db((dir / "db.json").string(), true);
    CharacterRegistry cards({PETCORE_TEST_CARDS_DIR});
    SessionManager sessions(db, cards);
    auto created = sessions.create("reimu");

    ToolRegistry tools;
    registerBuiltinTools(tools, false, (dir / "workspace").string());
    MemoryService memory(db, 20);
    MockLLM llm;
    AgentPolicy policy;
    AgentLoop agent(llm, tools, memory, db, policy, 6, 6000);

    const auto result = agent.run(created.session, *created.card, "现在几点？");
    CHECK(!result.text.empty());
    CHECK(hasEvent(result, "tool_call"));
    CHECK(hasEvent(result, "tool_result"));
    CHECK(hasEvent(result, "done"));
    CHECK(db.countMessages(created.session.id) >= 4);

    // Deny policy must intercept the tool before execution.
    AgentPolicy denied;
    denied.deny = {"get_time"};
    AgentLoop denyingAgent(llm, tools, memory, db, denied, 6, 6000);
    auto second = sessions.create("reimu");
    const auto deniedResult = denyingAgent.run(second.session, *second.card, "现在几点？");
    CHECK(hasEvent(deniedResult, "policy_denied"));

    auto third = sessions.create("reimu");
    const auto emotionResult = agent.run(third.session, *third.card, "我有点难过");
    CHECK(hasEvent(emotionResult, "emotion"));
    CHECK(emotionResult.emotion.name == "sad");
    std::filesystem::remove_all(dir);
}

void testForgettingCurve() {
    FactRecord fact;
    fact.lastReviewedUnix = 1704067200;
    const auto start = fact.lastReviewedUnix;
    const long long day = 86400;
    CHECK(memoryRetention(fact, start) == 1.0);
    CHECK(std::abs(memoryRetention(fact, start + day) - 0.5) < 1e-9);
    CHECK(memoryRetention(fact, start - day) == 1.0);
    const double earlyLoss = memoryRetention(fact, start) - memoryRetention(fact, start + day);
    const double laterLoss = memoryRetention(fact, start + day) - memoryRetention(fact, start + 2 * day);
    CHECK(earlyLoss > laterLoss);
    CHECK(memoryRetention(fact, start + 30 * day) < 0.05);
    CHECK(reinforceMemory(fact, start + day));
    CHECK(fact.halfLifeHours > 24.0);
    CHECK(memoryRetention(fact, start + 2 * day) > 0.5);
    CHECK(!reinforceMemory(fact, start + day + 3599));
    CHECK(fact.reviewCount == 1);
    for (int i = 2; i < 1000; ++i) reinforceMemory(fact, start + i * day);
    CHECK(fact.halfLifeHours <= 8760.0);
    fact.halfLifeHours = std::numeric_limits<double>::quiet_NaN();
    CHECK(std::isfinite(memoryRetention(fact, start + 1000 * day)));
    fact.lastReviewedUnix = 0;
    fact.updatedAt = "2024-01-01T00:00:00Z";
    CHECK(std::abs(memoryRetention(fact, start + day) - 0.5) < 1e-9);
    fact.updatedAt = "invalid";
    CHECK(memoryRetention(fact, start + day) == 1.0);
}

void testMemoryReviewAndRetrieval() {
    long long now = 1704067200;
    const auto clock = [&] { return now; };
    JsonFileDatabase db("", false, clock);
    MemoryService memory(db, 20, clock);
    const std::string scope = "character:reimu";
    memory.remember(scope, "tea old", "green", {});
    now += 86400;
    memory.remember(scope, "tea new", "black", {});
    memory.remember("character:marisa", "tea other", "secret", {});
    auto results = memory.recall(scope, "tea", 1);
    CHECK(results.size() == 1 && results.front().key == "tea new");
    CHECK(db.listFacts(scope)[1].reviewCount == 0); // unselected old memory
    CHECK(memory.recall(scope, "missing").empty());
    CHECK(memory.recall(scope, "tea", 0).empty());
    now += 86400;
    memory.recall(scope, "tea", 5, false); // prompt preview
    memory.recall(scope, "   "); // browsing is not rehearsal
    CHECK(db.listFacts(scope)[0].reviewCount == 0);
    CHECK(db.listFacts(scope)[1].reviewCount == 0);
    results = memory.recall(scope, "tea", 1);
    CHECK(results.front().key == "tea new");
    CHECK(results.front().reviewCount == 1);
    CHECK(db.listFacts(scope)[0].halfLifeHours > 24.0);
    CHECK(db.listFacts(scope)[1].reviewCount == 0);
    memory.recall(scope, "tea", 1);
    CHECK(db.listFacts(scope)[0].reviewCount == 1);
    auto stale = db.listFacts(scope)[0];
    now += 86400;
    memory.remember(scope, "tea new", "oolong", {});
    CHECK(!db.reviewFact(stale, now));
    auto corrected = db.listFacts(scope)[0];
    CHECK(corrected.reviewCount == 0 && corrected.halfLifeHours == 24.0);
    CHECK(corrected.lastReviewedUnix == now);
    now += 30 * 86400;
    CHECK(memory.recall(scope, "tea").empty());
    CHECK(db.listFacts(scope).empty()); // permanent forgetting removes stored facts
    memory.remember(scope, "tea new", "oolong", {}); // supplied again: a new memory
    results = memory.recall(scope, "tea");
    CHECK(results.size() == 1 && results.front().value == "oolong");
    CHECK(results.front().reviewCount == 0);
    const auto current = results.front();
    now += 86400;
    CHECK(db.reviewFact(current, now));
    CHECK(!db.reviewFact(current, now)); // stale concurrent review is rejected
}

void testMemoryDurabilityAndMigration() {
    const auto dir = tempDir();
    const auto path = (dir / "memory.json").string();
    long long now = 1704153600; // one day after the legacy UTC timestamp
    const auto clock = [&] { return now; };
    util::writeFileAtomic(path, R"({"version":1,"facts":{"character:reimu":{"tea":{
        "id":"old","key":"tea","value":"green","tags":[],
        "created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T00:00:00Z"}}}})");
    double strength = 0;
    {
        JsonFileDatabase db(path, true, clock);
        MemoryService memory(db, 20, clock);
        const auto old = db.listFacts("character:reimu").front();
        CHECK(old.reviewCount == 0);
        CHECK(std::abs(memoryRetention(old, now) - 0.5) < 1e-9);
        const auto recalled = memory.recall("character:reimu", "tea").front();
        CHECK(recalled.reviewCount == 1);
        strength = recalled.halfLifeHours;
    }
    {
        JsonFileDatabase db(path, true, clock);
        const auto fact = db.listFacts("character:reimu").front();
        CHECK(fact.id == "old" && fact.value == "green");
        CHECK(fact.reviewCount == 1 && fact.halfLifeHours == strength);
        CHECK(fact.lastReviewedUnix == now);
        CHECK(fact.updatedAt == "2024-01-01T00:00:00Z");
    }
    std::filesystem::remove_all(dir);
}

class MemoryProbeLLM final : public ILLMProvider {
public:
    std::string prompt;
    std::string transcript;
    bool fail = false;
    std::string name() const override { return "memory-probe"; }
    LLMResponse chat(const std::vector<Message>& messages, const json::Value&) override {
        prompt = messages.front().content;
        transcript.clear();
        for (const auto& message : messages) transcript += message.content + "\n";
        if (fail) throw std::runtime_error("test provider failure");
        LLMResponse response;
        response.content = "ok";
        return response;
    }
};

void testAutomaticMemoryContext() {
    long long now = 1704067200;
    const auto clock = [&] { return now; };
    JsonFileDatabase db("", false, clock);
    CharacterRegistry cards({PETCORE_TEST_CARDS_DIR});
    SessionManager sessions(db, cards);
    auto created = sessions.create("reimu");
    MemoryService memory(db, 20, clock);
    memory.remember("character:reimu", "tea", "UNIQUE_GREEN_TEA", {});
    memory.remember("character:marisa", "tea", "OTHER_CHARACTER_SECRET", {});
    now += 86400;
    MemoryProbeLLM llm;
    ToolRegistry tools;
    AgentPolicy policy;
    AgentLoop agent(llm, tools, memory, db, policy, 6, 6000);
    llm.fail = true;
    CHECK(agent.run(created.session, *created.card, "tea").stopReason == "llm_error");
    CHECK(db.listFacts("character:reimu").front().reviewCount == 0);
    llm.fail = false;
    CHECK(agent.run(created.session, *created.card, "tea").stopReason == "completed");
    CHECK(llm.prompt.find("UNIQUE_GREEN_TEA") != std::string::npos);
    CHECK(llm.prompt.find("OTHER_CHARACTER_SECRET") == std::string::npos);
    CHECK(db.listFacts("character:reimu").front().reviewCount == 1);
    now += 86400;
    AgentLoop smallBudget(llm, tools, memory, db, policy, 6, 100);
    smallBudget.run(created.session, *created.card, "tea");
    CHECK(llm.prompt.find("UNIQUE_GREEN_TEA") == std::string::npos);
    CHECK(db.listFacts("character:reimu").front().reviewCount == 1);
    policy.deny = {"recall"};
    AgentLoop denied(llm, tools, memory, db, policy, 6, 6000);
    denied.run(created.session, *created.card, "tea");
    CHECK(llm.prompt.find("UNIQUE_GREEN_TEA") == std::string::npos);
    CHECK(db.listFacts("character:reimu").front().reviewCount == 1);
    auto sessionCard = *created.card;
    sessionCard.memoryScope = "session";
    agent.run(created.session, sessionCard, "tea");
    CHECK(llm.prompt.find("UNIQUE_GREEN_TEA") == std::string::npos);
    now += 60 * 86400;
    agent.run(created.session, *created.card, "tea");
    CHECK(llm.prompt.find("UNIQUE_GREEN_TEA") == std::string::npos);
}

void testCustomCharacters() {
    const auto dir = tempDir();
    const std::string path = (dir / "db.json").string();
    JsonFileDatabase db(path, true);
    CharacterRegistry registry({PETCORE_TEST_CARDS_DIR}, &db);
    CHECK(registry.list().size() >= 3);
    CHECK(!registry.isCustom("reimu"));

    const auto card = json::Value::parse(R"JSON({
        "id": "custom_cat",
        "name": "自定义猫",
        "tagline": "测试用角色",
        "emoji": "C",
        "greeting": "喵",
        "persona": {"system": "你是一只测试猫。"},
        "emotions": {"neutral": {"label": "平静", "color": "#888888"}},
        "tools": {"allow": ["get_time"], "deny": []},
        "memory": {"history_limit": 10, "scope": "character"}
    })JSON");
    const auto saved = registry.saveCustom(card);
    CHECK(saved->id == "custom_cat");
    CHECK(saved->source == "database");
    CHECK(saved->editable);
    CHECK(registry.exists("custom_cat"));
    CHECK(registry.isCustom("custom_cat"));
    CHECK(registry.list().size() >= 4);

    // Re-open: the card must survive a process restart via the database.
    {
        CharacterRegistry reopened({PETCORE_TEST_CARDS_DIR}, &db);
        CHECK(reopened.get("custom_cat")->name == "自定义猫");
    }

    json::Value updated = card;
    updated["name"] = "改名后的猫";
    registry.saveCustom(updated);
    CHECK(registry.get("custom_cat")->name == "改名后的猫");

    CHECK(registry.deleteCustom("custom_cat"));
    CHECK(!registry.exists("custom_cat"));
    CHECK(!registry.deleteCustom("custom_cat"));
    std::filesystem::remove_all(dir);
}

void testPermanentForgettingPolicy() {
    FactRecord fact;
    fact.lastReviewedUnix = 1704067200;
    const auto start = fact.lastReviewedUnix;
    constexpr long long day = 86400;
    CHECK(!memoryExpired(fact, start + 30 * day - 1));
    CHECK(memoryExpired(fact, start + 30 * day));
    fact.halfLifeHours = 48;
    CHECK(!memoryExpired(fact, start + 30 * day));
    CHECK(memoryExpired(fact, start + 39 * day));
    fact.halfLifeHours = 8760;
    CHECK(!memoryExpired(fact, start + 180 * day - 1));
    CHECK(memoryExpired(fact, start + 180 * day));
    CHECK(!memoryExpired(fact, start - day));
    fact.tags = {"todo"};
    CHECK(!memoryExpired(fact, start + 1000 * day));
    fact.tags.clear();
    fact.key = "todo:123";
    CHECK(!memoryExpired(fact, start + 1000 * day));
    fact.key = "tea";
    fact.lastReviewedUnix = 0;
    fact.updatedAt = "2024-01-01T00:00:00Z";
    CHECK(memoryExpired(fact, start + 180 * day));
    fact.updatedAt = "broken-date";
    CHECK(!memoryExpired(fact, start + 180 * day));
}

void testPermanentForgettingStorage() {
    const auto dir = tempDir();
    const auto path = (dir / "forgetting.json").string();
    long long now = 1704067200;
    const auto clock = [&] { return now; };
    std::string sessionId;
    std::string otherId;
    std::string renewedId;
    {
        JsonFileDatabase db(path, true, clock);
        auto session = db.createSession("reimu", "forgetting");
        sessionId = session.id;
        auto other = db.createSession("marisa", "unrelated");
        otherId = other.id;
        other.summary = "UNRELATED_SUMMARY";
        db.updateSession(other);
        session.summary = "STALE_SUMMARY";
        db.updateSession(session);
        db.upsertFact(session.id, "old", "EXPIRED_VALUE", {});
        db.upsertFact(session.id, "todo:task", "keep this task", {"todo"});
        db.upsertFact(session.id, "renewed", "recently reinforced", {});
        auto renewed = db.listFacts(session.id).back();
        // Find by key instead of depending on adapter ordering.
        for (const auto& fact : db.listFacts(session.id)) if (fact.key == "renewed") renewed = fact;
        now += 29 * 86400;
        CHECK(db.reviewFact(renewed, now));
        now += 86400;
        CHECK(db.pruneExpiredFacts(now) == 1);
        CHECK(db.pruneExpiredFacts(now) == 0);
        CHECK(db.listFacts(session.id).size() == 2);
        CHECK(db.getSession(session.id)->summary.empty());
        CHECK(db.getSession(other.id)->summary == "UNRELATED_SUMMARY");
        // Even without message history (boundary == 0), stale snapshots cannot
        // restore a summary that was invalidated by garbage collection.
        db.updateSession(session);
        CHECK(db.getSession(session.id)->summary.empty());
        CHECK(db.getSession(session.id)->memoryContextVersion == 1);
        const auto disk = json::Value::parse(util::readFile(path));
        CHECK(!disk.at("facts").at(session.id).contains("old"));
        db.upsertFact(session.id, "old", "newly supplied", {});
        const auto relearned = db.listFacts(session.id).front();
        CHECK(relearned.key == "old" && relearned.reviewCount == 0);
        CHECK(relearned.halfLifeHours == 24 && relearned.lastReviewedUnix == now);
        renewedId = relearned.id;
    }
    {
        JsonFileDatabase db(path, true, clock);
        db.initialize();
        CHECK(db.listFacts(sessionId).front().id == renewedId);
        CHECK(db.getSession(sessionId)->summary.empty());
        CHECK(db.getSession(otherId)->summary == "UNRELATED_SUMMARY");
        now += 180 * 86400;
    }
    {
        // Startup cleanup persists even without a recall or a chat request.
        JsonFileDatabase db(path, true, clock);
        db.initialize();
        const auto disk = json::Value::parse(util::readFile(path));
        CHECK(disk.at("facts").at(sessionId).size() == 1);
        CHECK(disk.at("facts").at(sessionId).contains("todo:task"));
    }
    std::filesystem::remove_all(dir);
}

void testForgottenContextDoesNotReturn() {
    const auto dir = tempDir();
    const auto path = (dir / "context.json").string();
    long long now = 1704067200;
    const auto clock = [&] { return now; };
    std::string sessionId;
    {
        JsonFileDatabase db(path, true, clock);
        CharacterRegistry cards({PETCORE_TEST_CARDS_DIR});
        SessionManager sessions(db, cards);
        auto created = sessions.create("reimu");
        sessionId = created.session.id;
        const auto sibling = sessions.create("reimu");
        const auto unrelated = sessions.create("marisa");
        MemoryService memory(db, 20, clock);
        memory.remember("character:reimu", "tea", "FORGOTTEN_SECRET", {});
        memory.record(sessionId, Message{"user", "FORGOTTEN_SECRET"});
        memory.record(sibling.session.id, Message{"assistant", "FORGOTTEN_SECRET"});
        auto staleSession = *db.getSession(sessionId);
        staleSession.summary = "FORGOTTEN_SECRET";
        db.updateSession(staleSession);
        now += 30 * 86400;
        MemoryProbeLLM llm;
        ToolRegistry tools;
        AgentPolicy policy;
        AgentLoop agent(llm, tools, memory, db, policy, 6, 6000);
        // Deliberately pass a pre-cleanup session snapshot.
        agent.run(staleSession, *created.card, "NEW_CURRENT_QUESTION");
        CHECK(llm.transcript.find("FORGOTTEN_SECRET") == std::string::npos);
        CHECK(llm.transcript.find("NEW_CURRENT_QUESTION") != std::string::npos);
        CHECK(db.listFacts("character:reimu").empty());
        CHECK(db.getSession(sessionId)->memoryContextAfterSeq == 2);
        CHECK(db.getSession(sibling.session.id)->memoryContextAfterSeq == 2);
        CHECK(db.getSession(unrelated.session.id)->memoryContextAfterSeq == 0);
        CHECK(memory.history(sibling.session.id).empty());
        // The UI archive is still readable, but no longer used by the model.
        CHECK(db.getMessages(sessionId, 0, 0)[1].message.content == "FORGOTTEN_SECRET");
        db.updateSession(staleSession);
        CHECK(memory.summary(sessionId).empty());
        for (int i = 0; i < 6; ++i) memory.record(sessionId, Message{"user", "NEW_CONTEXT"});
        CHECK(memory.maybeSummarize(sessionId, llm, 4, 2));
        CHECK(llm.transcript.find("FORGOTTEN_SECRET") == std::string::npos);
        CHECK(llm.transcript.find("NEW_CONTEXT") != std::string::npos);
    }
    {
        JsonFileDatabase db(path, true, clock);
        MemoryService memory(db, 20, clock);
        CHECK(db.getSession(sessionId)->memoryContextAfterSeq == 2);
        for (const auto& message : memory.history(sessionId)) {
            CHECK(message.content.find("FORGOTTEN_SECRET") == std::string::npos);
        }
    }
    std::filesystem::remove_all(dir);
}

void testFileSandbox() {
    const auto dir = tempDir();
    ToolRegistry tools;
    registerBuiltinTools(tools, true, (dir / "workspace").string());
    ToolContext context;
    context.sessionId = "s";
    context.emit = nullptr;

    const auto write = tools.call("fs_write",
                                  json::Value::object({{"path", "notes/a.txt"}, {"content", "hello"}}),
                                  context);
    CHECK(write.ok);
    const auto read = tools.call("fs_read", json::Value::object({{"path", "notes/a.txt"}}), context);
    CHECK(read.ok);
    CHECK(read.content == "hello");

    const auto escape = tools.call("fs_read", json::Value::object({{"path", "../secret.txt"}}), context);
    CHECK(!escape.ok);
    std::filesystem::remove_all(dir);
}

void testEmotion() {
    EmotionState emotion;
    emotion.set("happy", 0.8);
    const auto before = emotion.intensity;
    emotion.updatedUnix = util::nowUnix() - 900;
    emotion.decay(util::nowUnix(), 900);
    CHECK(emotion.intensity < before);
    CHECK(emotion.intensity > 0.0);
}

void testRegistries() {
    const auto dbs = DatabaseRegistry::available();
    CHECK(std::find(dbs.begin(), dbs.end(), "json") != dbs.end());
    const auto providers = LLMRegistry::available();
    CHECK(std::find(providers.begin(), providers.end(), "mock") != providers.end());
}

template<class Action> bool fails(Action action) {
    try { action(); } catch (const std::exception&) { return true; }
    return false;
}

bool validUtf8(const std::string& text) {
    for (std::size_t i = 0; i < text.size();) {
        const auto c = static_cast<unsigned char>(text[i]);
        const std::size_t count = c < 128 ? 1 : (c & 224) == 192 ? 2 : (c & 240) == 224 ? 3 : (c & 248) == 240 ? 4 : 0;
        if (!count || i + count > text.size()) return false;
        for (std::size_t j = 1; j < count; ++j)
            if ((static_cast<unsigned char>(text[i + j]) & 192) != 128) return false;
        i += count;
    }
    return true;
}

void testAssetConfinement() {
    const auto dir = tempDir();
    const auto root = dir / "assets";
    std::filesystem::create_directories(root);
    for (const auto& name : {"/outside.txt", "//server/share/file", "C:/outside.txt", "C:outside.txt",
                             "\\outside.txt", "../outside.txt", "nested/../../outside.txt", "x:stream", "file. "})
        CHECK(fails([&] { util::confinedPath(root, name); }));
    CHECK(fails([&] { util::confinedPath(root, std::string("x\0y", 3)); }));
    CHECK(util::confinedPath(root, "model/textures/图片.png") == std::filesystem::weakly_canonical(root / "model/textures/图片.png"));
    std::filesystem::create_directories(dir / "outside");
    std::error_code error;
    std::filesystem::create_directory_symlink(dir / "outside", root / "link", error);
    if (!error) CHECK(fails([&] { util::confinedPath(root, "link/file.txt"); }));
    else std::cout << "[INFO] symlink setup unavailable: " << error.message() << "\n";
    std::filesystem::remove_all(dir);
}

void testAtomicReplacement() {
    const auto dir = tempDir();
    const auto path = (dir / "db.json").string();
    util::writeFileAtomic(path, "original");
    util::writeFileAtomic(path, "replacement");
    CHECK(util::readFile(path) == "replacement");
    std::filesystem::create_directory(dir / "directory");
    CHECK(fails([&] { util::writeFileAtomic((dir / "directory").string(), "must not replace directory"); }));
    CHECK(std::filesystem::is_directory(dir / "directory"));
#if defined(_WIN32)
    {
        std::ifstream held(path); // CRT handles do not share deletion on Windows
        CHECK(fails([&] { util::writeFileAtomic(path, "candidate"); }));
        CHECK(util::readFile(path) == "replacement");
        bool candidateRetained = false;
        for (const auto& entry : std::filesystem::directory_iterator(dir)) {
            if (entry.path().extension() == ".tmp" && util::readFile(entry.path().string()) == "candidate")
                candidateRetained = true;
        }
        CHECK(candidateRetained);
    }
#endif
    std::filesystem::remove_all(dir);
}

void testStreamCompletion() {
    const std::string chunk = "data: {\"choices\":[{\"delta\":{\"content\":\"你好🌱\"}}]}\r\n\r\n";
    const std::string ending = "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n";
    std::string emitted;
    detail::LLMStreamDecoder decoder([&](const auto& delta) { emitted += delta; });
    const auto stream = chunk + ending + "data: {\"choices\":[],\"usage\":{\"total_tokens\":9}}\n\ndata: [DONE]\n\n";
    for (const auto byte : stream) decoder.feed(std::string(1, byte));
    const auto result = decoder.finish();
    CHECK(result.content == "你好🌱" && emitted == result.content);
    CHECK(util::jint(result.usage, "total_tokens") == 9);
    detail::LLMStreamDecoder truncated({});
    truncated.feed(chunk);
    CHECK(fails([&] { truncated.finish(); }));
    detail::LLMStreamDecoder noDone({});
    noDone.feed(chunk + ending); // Some providers close after finish_reason.
    CHECK(noDone.finish().content == "你好🌱");
    detail::LLMStreamDecoder malformed({});
    CHECK(fails([&] { malformed.feed("data: {bad}\n\n"); }));
    detail::LLMStreamDecoder serverError({});
    CHECK(fails([&] { serverError.feed("data: {\"error\":{\"message\":\"failed\"}}\n\n"); }));
    const std::string tool = "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"function\":{\"name\":\"echo\",\"arguments\":\"{\"}}]}}]}\n\n";
    detail::LLMStreamDecoder incompleteTool({});
    incompleteTool.feed(tool + "data: [DONE]\n\n");
    CHECK(fails([&] { incompleteTool.finish(); }));
    detail::LLMStreamDecoder completeTool({});
    completeTool.feed(tool + "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\ndata: [DONE]\n\n");
    CHECK(completeTool.finish().toolCalls.front().arguments.isObject());
}

class BudgetProbe final : public ILLMProvider {
public:
    std::vector<std::vector<Message>> requests;
    bool requestTool = false;
    std::string name() const override { return "budget-probe"; }
    LLMResponse chat(const std::vector<Message>& messages, const json::Value&) override {
        requests.push_back(messages);
        if (requestTool && requests.size() == 1)
            return LLMResponse{"", {ToolCall{"big_call", "large_output", json::Value::object({})}}};
        return LLMResponse{"ok"};
    }
};

class LargeOutput final : public ITool {
public:
    ToolSpec spec() const override { return {"large_output", "test", json::Value::object({}), "read"}; }
    ToolResult run(const json::Value&, ToolContext&) override {
        std::string text;
        for (int i = 0; i < 6000; ++i) text += "中";
        return ToolResult::success(text);
    }
};

void checkRequest(const std::vector<Message>& messages, std::size_t maximum) {
    std::size_t cost = 0;
    std::set<std::string> pending;
    for (const auto& m : messages) {
        CHECK(validUtf8(m.content));
        cost += m.content.size() + 16 + m.name.size() + m.toolCallId.size();
        if (m.role == "tool") CHECK(pending.erase(m.toolCallId) == 1);
        else {
            CHECK(pending.empty());
            for (const auto& call : m.toolCalls) {
                CHECK(pending.insert(call.id).second);
                cost += call.arguments.dump().size() + call.name.size() + call.id.size();
            }
        }
    }
    CHECK(pending.empty());
    CHECK(cost <= maximum);
}

void testChatContextBoundaries() {
    JsonFileDatabase db("", false);
    MemoryService memory(db);
    ToolRegistry tools;
    tools.registerTool(std::make_shared<LargeOutput>());
    auto session = db.createSession("test", "test");
    CharacterCard card;
    card.id = "test"; card.name = "test"; card.historyLimit = 3;
    memory.record(session.id, Message{"assistant", "", {ToolCall{"old", "echo"}}});
    memory.record(session.id, Message{"tool", "result", {}, "old", "echo"});
    memory.record(session.id, Message{"assistant", "previous reply"});
    BudgetProbe probe;
    AgentLoop agent(probe, tools, memory, db, AgentPolicy{}, 6, 6000);
    CHECK(agent.run(session, card, "next question").stopReason == "completed");
    checkRequest(probe.requests.back(), 6000);
    CHECK(probe.requests.back()[1].role != "tool");
    const auto before = probe.requests.size();
    CHECK(agent.run(session, card, std::string(10000, 'x')).stopReason == "context_limit");
    CHECK(probe.requests.size() == before);
    // Complete multi-tool groups survive, but incomplete groups are omitted.
    card.historyLimit = 20;
    auto paired = db.createSession("test", "paired");
    memory.record(paired.id, Message{"assistant", "", {ToolCall{"a", "echo"}, ToolCall{"b", "echo"}}});
    memory.record(paired.id, Message{"tool", "a", {}, "a"});
    memory.record(paired.id, Message{"tool", "b", {}, "b"});
    agent.run(paired, card, "question");
    checkRequest(probe.requests.back(), 6000);
    CHECK(probe.requests.back()[1].toolCalls.size() == 2);
    auto partial = db.createSession("test", "partial");
    memory.record(partial.id, Message{"assistant", "", {ToolCall{"a", "echo"}, ToolCall{"b", "echo"}}});
    memory.record(partial.id, Message{"tool", "a", {}, "a"});
    agent.run(partial, card, "question");
    checkRequest(probe.requests.back(), 6000);
    CHECK(probe.requests.back().size() == 2);
    auto large = db.createSession("test", "large");
    BudgetProbe largeProbe; largeProbe.requestTool = true;
    AgentLoop toolAgent(largeProbe, tools, memory, db, AgentPolicy{}, 6, 1300);
    CHECK(toolAgent.run(large, card, "use tool").stopReason == "completed");
    CHECK(largeProbe.requests.size() == 2);
    for (const auto& request : largeProbe.requests) checkRequest(request, 1300);
    for (int i = 0; i < 1000; ++i) card.systemPrompt += "中";
    for (int budget = 100; budget <= 103; ++budget) {
        AgentLoop tiny(probe, tools, memory, db, AgentPolicy{}, 6, budget);
        CHECK(tiny.run(session, card, "q").stopReason == "completed");
        checkRequest(probe.requests.back(), budget);
    }
    const std::string unicode = "a中文🌱z";
    for (std::size_t i = 0; i <= unicode.size(); ++i) {
        const auto text = util::truncateUtf8(unicode, i, "…");
        CHECK(text.size() <= i && validUtf8(text));
    }
}

}  // namespace

int main() {
    struct Test {
        const char* name;
        void (*fn)();
    };
    const Test tests[] = {
        {"json", testJson},
        {"characters", testCharacters},
        {"database+memory", testDatabaseAndMemory},
        {"forgetting-curve", testForgettingCurve},
        {"memory-retrieval+review", testMemoryReviewAndRetrieval},
        {"memory-durability+migration", testMemoryDurabilityAndMigration},
        {"automatic-memory-context", testAutomaticMemoryContext},
        {"permanent-forgetting-policy", testPermanentForgettingPolicy},
        {"permanent-forgetting-storage", testPermanentForgettingStorage},
        {"forgotten-context-does-not-return", testForgottenContextDoesNotReturn},
        {"custom-characters", testCustomCharacters},
        {"agent-loop", testAgentLoop},
        {"file-sandbox", testFileSandbox},
        {"emotion", testEmotion},
        {"registries", testRegistries},
        {"asset-confinement", testAssetConfinement},
        {"atomic-replacement", testAtomicReplacement},
        {"stream-completion", testStreamCompletion},
        {"chat-context-boundaries", testChatContextBoundaries},
    };

    int failed = 0;
    for (const auto& test : tests) {
        try {
            test.fn();
            std::cout << "[PASS] " << test.name << "\n";
        } catch (const std::exception& error) {
            std::cout << "[FAIL] " << test.name << ": " << error.what() << "\n";
            ++failed;
        }
    }
    std::cout << (failed == 0 ? "ALL TESTS PASSED\n" : "TESTS FAILED\n");
    return failed == 0 ? 0 : 1;
}
