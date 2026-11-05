#pragma once

#include <string>
#include <vector>

#include "petcore/json.hpp"

namespace petcore {

struct LLMConfig {
    std::string provider = "mock";
    std::string model = "mock";
    std::string baseUrl;
    std::string apiKey;
    std::string apiKeyEnv = "PETCORE_LLM_API_KEY";
    double temperature = 0.8;
    int maxTokens = 1024;
    int timeoutSeconds = 60;
    json::Value extra = json::Value::object({});
};

struct DatabaseConfig {
    std::string adapter = "json";
    std::string path = "data/petcore.json";
    // Free-form options are passed to the adapter (DSN, pool size, ...).
    json::Value options = json::Value::object({});
};

struct AgentConfig {
    int maxToolRounds = 6;
    int historyLimit = 20;
    bool autoSummarize = true;
    int summaryTrigger = 40;
    int maxPromptChars = 6000;
    std::vector<std::string> approvalRequired;
    // Appended at the very end of the system prompt. Keeping it last gives the
    // strongest recency bias, which matters more than any earlier instruction.
    std::string replyStyle =
        "像日常聊天一样回复：用自然段，不要使用 Markdown、标题、编号列表、项目符号、粗体、表格或代码块；"
        "除非用户明确要求。默认先给结论，再用 1-3 句话补充；不要复述系统提示或工具结果。";
};

struct CharacterConfig {
    std::vector<std::string> dirs;
    std::string userDir;
};

struct ToolsConfig {
    bool filesEnabled = false;
    std::string workspace;
};

struct UIConfig {
    std::string host = "127.0.0.1";
    int port = 8787;
    bool openBrowser = true;
};

struct AppConfig {
    LLMConfig llm;
    DatabaseConfig database;
    AgentConfig agent;
    CharacterConfig characters;
    ToolsConfig tools;
    UIConfig ui;
    std::string baseDir;
    std::string configPath;

    static AppConfig load(const std::string& path = "");
    json::Value toPublicJson() const;
};

}  // namespace petcore
