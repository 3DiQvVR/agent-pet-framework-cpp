#pragma once

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "petcore/character.hpp"
#include "petcore/database.hpp"
#include "petcore/emotion.hpp"
#include "petcore/json.hpp"
#include "petcore/memory.hpp"
#include "petcore/types.hpp"

namespace petcore {

struct ToolSpec {
    std::string name;
    std::string description;
    json::Value parameters = json::Value::object({{"type", "object"}, {"properties", json::Value::object({})}});
    std::string risk = "read";  // read | write | execute
};

struct ToolContext {
    std::string sessionId;
    // Where remember/recall write: "character:<id>" or the session id.
    std::string memoryScope;
    std::shared_ptr<const CharacterCard> character;
    IDatabase* database = nullptr;
    MemoryService* memory = nullptr;
    EmotionState* emotion = nullptr;
    std::function<void(const AgentEvent&)> emit;
    json::Value config = json::Value::object({});
};

class ITool {
public:
    virtual ~ITool() = default;
    virtual ToolSpec spec() const = 0;
    virtual ToolResult run(const json::Value& arguments, ToolContext& context) = 0;
};

class ToolRegistry {
public:
    void registerTool(std::shared_ptr<ITool> tool, bool replace = false);
    bool has(const std::string& name) const;
    ITool* get(const std::string& name);
    const ITool* get(const std::string& name) const;
    std::vector<std::string> names() const;

    // Returns OpenAI-style function schemas filtered by allow/deny glob lists.
    json::Value schemas(const std::vector<std::string>& allow,
                        const std::vector<std::string>& deny) const;

    ToolResult call(const std::string& name, const json::Value& arguments, ToolContext& context);

private:
    std::map<std::string, std::shared_ptr<ITool>> tools_;
};

void registerBuiltinTools(ToolRegistry& registry, bool includeFileTools, const std::string& workspace);

}  // namespace petcore
