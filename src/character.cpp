#include "petcore/character.hpp"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <set>

#include "petcore/database.hpp"
#include "petcore/errors.hpp"
#include "petcore/util.hpp"

namespace petcore {
namespace {

std::vector<std::string> stringList(const json::Value& object, const std::string& key) {
    std::vector<std::string> out;
    if (const auto* value = object.find(key)) {
        if (value->isArray()) {
            for (const auto& item : value->array()) {
                if (item.isString()) out.push_back(item.asString());
            }
        }
    }
    return out;
}

bool validId(const std::string& id) {
    if (id.size() < 2 || id.size() > 64) return false;
    for (unsigned char c : id) {
        if (!(std::islower(c) || std::isdigit(c) || c == '-' || c == '_')) return false;
    }
    return std::islower(static_cast<unsigned char>(id.front()));
}

}  // namespace

CharacterCard CharacterCard::fromJson(const json::Value& value, const std::string& sourcePath) {
    if (!value.isObject()) throw CharacterError(sourcePath + ": card root must be an object");

    CharacterCard card;
    card.sourcePath = sourcePath;
    card.raw = value;
    card.id = util::jstr(value, "id");
    card.name = util::jstr(value, "name");
    card.tagline = util::jstr(value, "tagline");
    card.emoji = util::jstr(value, "emoji", "🐾");
    card.color = util::jstr(value, "color", "#8fa3bf");
    card.greeting = util::jstr(value, "greeting");
    if (const auto* portrait = value.find("portrait"); portrait && !portrait->isNull()) {
        if (!portrait->isString()) throw CharacterError(sourcePath + ": portrait must be a data URL string");
        const auto& data = portrait->asString();
        if (data.size() > 2200000) throw CharacterError(sourcePath + ": portrait exceeds the 1.5 MB upload limit");
        if (!data.empty() && data.rfind("data:image/png;base64,", 0) != 0 &&
            data.rfind("data:image/jpeg;base64,", 0) != 0 &&
            data.rfind("data:image/webp;base64,", 0) != 0)
            throw CharacterError(sourcePath + ": portrait must be PNG, JPEG, or WebP");
    }

    if (card.id.empty()) throw CharacterError(sourcePath + ": missing 'id'");
    if (!validId(card.id)) {
        throw CharacterError(sourcePath + ": id must match [a-z][a-z0-9_-]{1,63}, got '" + card.id + "'");
    }
    if (card.name.empty()) throw CharacterError(sourcePath + ": missing 'name'");

    if (const auto* persona = value.find("persona"); persona && persona->isObject()) {
        card.systemPrompt = util::jstr(*persona, "system");
        card.speakingStyle = util::jstr(*persona, "speaking_style");
        card.boundaries = stringList(*persona, "boundaries");
    }
    if (card.systemPrompt.empty()) {
        throw CharacterError(sourcePath + ": persona.system is required");
    }

    if (const auto* emotions = value.find("emotions"); emotions && emotions->isObject()) {
        for (const auto& [name, spec] : emotions->object()) {
            EmotionSpec emotion;
            if (spec.isObject()) {
                emotion.label = util::jstr(spec, "label", name);
                emotion.color = util::jstr(spec, "color", "#8fa3bf");
            } else {
                emotion.label = name;
            }
            card.emotions[name] = emotion;
        }
    }
    if (card.emotions.empty()) {
        card.emotions["neutral"] = EmotionSpec{"平静", "#8fa3bf"};
    }
    card.defaultEmotion = util::jstr(value, "default_emotion", "neutral");
    if (!card.emotions.count(card.defaultEmotion)) {
        card.emotions[card.defaultEmotion] = EmotionSpec{card.defaultEmotion, "#8fa3bf"};
    }

    if (const auto* tools = value.find("tools"); tools && tools->isObject()) {
        card.toolsAllow = stringList(*tools, "allow");
        card.toolsDeny = stringList(*tools, "deny");
    }
    if (const auto* memory = value.find("memory"); memory && memory->isObject()) {
        card.historyLimit = util::jint(*memory, "history_limit", 20);
        card.memoryScope = util::jstr(*memory, "scope", "character");
    }
    if (card.historyLimit <= 0) card.historyLimit = 20;
    if (card.memoryScope != "session") card.memoryScope = "character";

    if (card.greeting.empty()) {
        card.greeting = "嗨，我是" + card.name + "。";
    }
    return card;
}

json::Value CharacterCard::toPublicJson() const {
    json::Value tools = json::Value::object({
        {"allow", [&] {
            json::Value items = json::Value::array({});
            for (const auto& item : toolsAllow) items.push_back(item);
            return items;
        }()},
        {"deny", [&] {
            json::Value items = json::Value::array({});
            for (const auto& item : toolsDeny) items.push_back(item);
            return items;
        }()},
    });
    json::Value emotionList = json::Value::object({});
    for (const auto& [name, spec] : emotions) {
        emotionList[name] = json::Value::object({{"label", spec.label}, {"color", spec.color}});
    }
    return json::Value::object({
        {"id", id},
        {"name", name},
        {"tagline", tagline},
        {"emoji", emoji},
        {"portrait", raw.find("portrait") ? raw.at("portrait") : json::Value("")},
        {"color", color},
        {"greeting", greeting},
        {"default_emotion", defaultEmotion},
        {"emotions", emotionList},
        {"tools", tools},
        {"source", source},
        {"editable", editable},
        {"voice", raw.find("voice") ? raw.at("voice") : json::Value::object({})},
        {"metadata", raw.find("metadata") ? raw.at("metadata") : json::Value::object({})},
    });
}

std::string CharacterCard::emotionLabel(const std::string& emotionName) const {
    const auto it = emotions.find(emotionName);
    return it == emotions.end() ? emotionName : it->second.label;
}

std::string CharacterCard::buildSystemPrompt(const std::string& emotionName, double intensity,
                                             const std::string& summary,
                                             const std::string& now) const {
    std::string prompt;
    prompt += "你是" + name;
    if (!tagline.empty()) prompt += "，" + tagline;
    prompt += "。\n\n" + systemPrompt + "\n";
    if (!speakingStyle.empty()) prompt += "\n【说话风格】\n" + speakingStyle + "\n";
    if (!boundaries.empty()) {
        prompt += "\n【边界】\n";
        for (const auto& boundary : boundaries) prompt += "- " + boundary + "\n";
    }
    prompt += "\n【当前情绪】\n你现在感到「" + emotionLabel(emotionName) + "」，强度 " +
              std::to_string(static_cast<int>(intensity * 100)) + "%。情绪会影响语气，但不要反复宣告情绪。\n";
    if (!summary.empty()) {
        prompt += "\n【长期记忆摘要】\n" + summary + "\n";
    }
    prompt += "\n【当前时间】\n" + now + "（UTC）\n";
    prompt +=
        "\n【工具使用】\n"
        "你可以调用工具来获得真实信息或改变状态。规则：\n"
        "1. 需要事实（时间、记忆、待办）时先调用工具，不要编造。\n"
        "2. 每轮最多调用 1-2 个工具，拿到结果后立即回答。\n"
        "3. 工具失败时如实说明，不要重复同样的调用。\n"
        "4. 不要声称自己执行了未实际调用的操作。\n";
    return prompt;
}

CharacterRegistry::CharacterRegistry(std::vector<std::string> directories, IDatabase* database)
    : directories_(std::move(directories)), database_(database) {
    reload();
}

void CharacterRegistry::reload() {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::shared_ptr<const CharacterCard>> loaded;
    std::map<std::string, std::size_t> index;
    errors_.clear();

    for (const auto& directory : directories_) {
        std::error_code error;
        if (!std::filesystem::is_directory(directory, error)) continue;

        std::vector<std::filesystem::path> files;
        for (const auto& entry : std::filesystem::directory_iterator(directory, error)) {
            if (entry.is_regular_file() && entry.path().extension() == ".json") {
                files.push_back(entry.path());
            }
        }
        std::sort(files.begin(), files.end());

        for (const auto& file : files) {
            try {
                const json::Value value = json::Value::parse(util::readFile(file.string()));
                auto card = std::make_shared<CharacterCard>(
                    CharacterCard::fromJson(value, file.string()));
                card->source = "file";
                const auto existing = index.find(card->id);
                if (existing != index.end()) {
                    loaded[existing->second] = card;  // later directory wins
                } else {
                    index[card->id] = loaded.size();
                    loaded.push_back(card);
                }
            } catch (const std::exception& error) {
                errors_.push_back(file.string() + ": " + error.what());
            }
        }
    }

    // Database cards are overlays: they may replace a built-in card by id or
    // introduce a completely new character. They are always editable.
    if (database_) {
        for (const auto& record : database_->listCharacters()) {
            try {
                if (record.id.empty() || record.payload.empty()) continue;
                json::Value value = json::Value::parse(record.payload);
                if (!value.isObject()) throw CharacterError("payload must be an object");
                if (!value.find("id")) value["id"] = record.id;
                auto card = std::make_shared<CharacterCard>(
                    CharacterCard::fromJson(value, "database:" + record.id));
                card->source = "database";
                card->editable = true;
                const auto existing = index.find(card->id);
                if (existing != index.end()) {
                    loaded[existing->second] = card;
                } else {
                    index[card->id] = loaded.size();
                    loaded.push_back(card);
                }
            } catch (const std::exception& error) {
                errors_.push_back("database character '" + record.id + "': " + error.what());
            }
        }
    }

    cards_ = std::move(loaded);
    index_ = std::move(index);
}

std::vector<std::shared_ptr<const CharacterCard>> CharacterRegistry::list() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return cards_;
}

std::shared_ptr<const CharacterCard> CharacterRegistry::get(const std::string& id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto it = index_.find(id);
    if (it == index_.end()) throw CharacterError("unknown character: " + id);
    return cards_[it->second];
}

bool CharacterRegistry::exists(const std::string& id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    return index_.count(id) > 0;
}

std::vector<std::string> CharacterRegistry::errors() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return errors_;
}

std::shared_ptr<const CharacterCard> CharacterRegistry::saveCustom(const json::Value& card) {
    if (!database_) {
        throw CharacterError("custom character cards require a database adapter");
    }
    // Validate before touching the database.
    CharacterCard validated = CharacterCard::fromJson(card, "custom");
    CharacterRecord record;
    record.id = validated.id;
    record.payload = card.dump();
    database_->upsertCharacter(record);
    reload();
    return get(validated.id);
}

bool CharacterRegistry::deleteCustom(const std::string& id) {
    if (!database_) return false;
    if (!database_->deleteCharacter(id)) return false;
    reload();
    return true;
}

bool CharacterRegistry::isCustom(const std::string& id) const {
    if (!database_) return false;
    return database_->getCharacter(id).has_value();
}

}  // namespace petcore
