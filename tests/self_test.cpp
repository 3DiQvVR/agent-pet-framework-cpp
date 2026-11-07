// Minimal dependency-free test runner for PetCore.
#include <algorithm>
#include <cmath>
#include <limits>
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
    CHECK(db.listFacts(scope).size() == 2); // forgetting does not erase data
    memory.remember(scope, "tea new", "oolong", {}); // explicit reminder revives it
    results = memory.recall(scope, "tea");
    CHECK(results.size() == 1 && results.front().value == "oolong");
    CHECK(results.front().reviewCount == 1);
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
    bool fail = false;
    std::string name() const override { return "memory-probe"; }
    LLMResponse chat(const std::vector<Message>& messages, const json::Value&) override {
        prompt = messages.front().content;
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
        {"custom-characters", testCustomCharacters},
        {"agent-loop", testAgentLoop},
        {"file-sandbox", testFileSandbox},
        {"emotion", testEmotion},
        {"registries", testRegistries},
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
