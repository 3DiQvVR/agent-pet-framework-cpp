#include "petcore/tools.hpp"

#include <algorithm>
#include <filesystem>

#include "petcore/errors.hpp"
#include "petcore/util.hpp"

namespace petcore {

void ToolRegistry::registerTool(std::shared_ptr<ITool> tool, bool replace) {
    if (!tool) throw ToolError("cannot register a null tool");
    const std::string name = tool->spec().name;
    if (name.empty()) throw ToolError("tool name cannot be empty");
    if (!replace && tools_.count(name)) throw ToolError("tool already registered: " + name);
    tools_[name] = std::move(tool);
}

bool ToolRegistry::has(const std::string& name) const { return tools_.count(name) > 0; }

ITool* ToolRegistry::get(const std::string& name) {
    const auto it = tools_.find(name);
    return it == tools_.end() ? nullptr : it->second.get();
}

const ITool* ToolRegistry::get(const std::string& name) const {
    const auto it = tools_.find(name);
    return it == tools_.end() ? nullptr : it->second.get();
}

std::vector<std::string> ToolRegistry::names() const {
    std::vector<std::string> result;
    for (const auto& [name, tool] : tools_) result.push_back(name);
    return result;
}

json::Value ToolRegistry::schemas(const std::vector<std::string>& allow,
                                  const std::vector<std::string>& deny) const {
    json::Value result = json::Value::array({});
    for (const auto& [name, tool] : tools_) {
        if (!allow.empty() && !util::matchesAny(allow, name)) continue;
        if (util::matchesAny(deny, name)) continue;
        const ToolSpec spec = tool->spec();
        result.push_back(json::Value::object({
            {"type", "function"},
            {"function", json::Value::object({
                {"name", spec.name},
                {"description", spec.description},
                {"parameters", spec.parameters},
            })},
        }));
    }
    return result;
}

ToolResult ToolRegistry::call(const std::string& name, const json::Value& arguments,
                              ToolContext& context) {
    ITool* tool = get(name);
    if (!tool) return ToolResult::failure("unknown tool: " + name);
    try {
        return tool->run(arguments, context);
    } catch (const std::exception& error) {
        return ToolResult::failure(std::string("tool '") + name + "' failed: " + error.what());
    } catch (...) {
        return ToolResult::failure("tool '" + name + "' failed with an unknown error");
    }
}

}  // namespace petcore
