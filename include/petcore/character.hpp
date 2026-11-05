#pragma once

#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "petcore/json.hpp"

namespace petcore {

class IDatabase;

struct EmotionSpec {
    std::string label;
    std::string color = "#8fa3bf";
};

struct CharacterCard {
    std::string id;
    std::string name;
    std::string tagline;
    std::string emoji = "🐾";
    std::string color = "#8fa3bf";
    std::string systemPrompt;
    std::string speakingStyle;
    std::vector<std::string> boundaries;
    std::string greeting;
    std::map<std::string, EmotionSpec> emotions;
    std::string defaultEmotion = "neutral";
    std::vector<std::string> toolsAllow;
    std::vector<std::string> toolsDeny;
    int historyLimit = 20;
    // "character" = long-term facts are shared by every chat with this card;
    // "session"   = facts live only inside one conversation.
    std::string memoryScope = "character";
    std::string sourcePath;
    std::string source = "file";  // file | database
    bool editable = false;
    json::Value raw = json::Value::object({});

    static CharacterCard fromJson(const json::Value& value, const std::string& sourcePath);
    json::Value toPublicJson() const;
    std::string buildSystemPrompt(const std::string& emotionName, double intensity,
                                  const std::string& summary, const std::string& now,
                                  const std::string& replyStyle = "") const;
    std::string emotionLabel(const std::string& emotionName) const;
};

// Loads cards from one or more directories. Later directories override earlier
// ones by id, which lets users drop a modified card into `characters/` without
// touching the built-in cards. If a database is supplied, user-authored cards
// are loaded last, so they can override built-in cards and survive restarts.
class CharacterRegistry {
public:
    explicit CharacterRegistry(std::vector<std::string> directories, IDatabase* database = nullptr);

    void reload();
    std::vector<std::shared_ptr<const CharacterCard>> list() const;
    std::shared_ptr<const CharacterCard> get(const std::string& id) const;
    bool exists(const std::string& id) const;

    // Database-backed custom cards. saveCustom validates the card, persists the
    // raw JSON payload and reloads the registry.
    std::shared_ptr<const CharacterCard> saveCustom(const json::Value& card);
    bool deleteCustom(const std::string& id);
    bool isCustom(const std::string& id) const;

    std::vector<std::string> errors() const;

private:
    std::vector<std::string> directories_;
    IDatabase* database_ = nullptr;
    mutable std::mutex mutex_;
    std::vector<std::shared_ptr<const CharacterCard>> cards_;
    std::map<std::string, std::size_t> index_;
    std::vector<std::string> errors_;
};

}  // namespace petcore
