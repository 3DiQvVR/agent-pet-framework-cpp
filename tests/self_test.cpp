// Minimal dependency-free test runner for PetCore.
#include <algorithm>
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
