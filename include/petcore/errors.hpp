#pragma once

#include <stdexcept>
#include <string>

namespace petcore {

struct PetCoreError : std::runtime_error {
    explicit PetCoreError(const std::string& message) : std::runtime_error(message) {}
};

struct ConfigError : PetCoreError {
    explicit ConfigError(const std::string& message) : PetCoreError(message) {}
};

struct CharacterError : PetCoreError {
    explicit CharacterError(const std::string& message) : PetCoreError(message) {}
};

struct LLMError : PetCoreError {
    explicit LLMError(const std::string& message) : PetCoreError(message) {}
};

struct ToolError : PetCoreError {
    explicit ToolError(const std::string& message) : PetCoreError(message) {}
};

struct DatabaseError : PetCoreError {
    explicit DatabaseError(const std::string& message) : PetCoreError(message) {}
};

struct PolicyError : PetCoreError {
    explicit PolicyError(const std::string& message) : PetCoreError(message) {}
};

}  // namespace petcore
