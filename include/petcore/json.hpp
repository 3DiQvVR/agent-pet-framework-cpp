// PetCore — minimal, dependency-free JSON value + parser.
//
// The framework only needs a small subset of JSON, but it is used for
// configuration, character cards, tool arguments, persistence and API
// payloads, so the implementation is intentionally strict and complete.
#pragma once

#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <map>
#include <stdexcept>
#include <string>
#include <variant>
#include <vector>

namespace petcore::json {

class JsonError : public std::runtime_error {
public:
    explicit JsonError(const std::string& message) : std::runtime_error(message) {}
};

class Value {
public:
    using Array = std::vector<Value>;
    using Object = std::map<std::string, Value>;
    using Storage = std::variant<std::nullptr_t, bool, double, std::string, Array, Object>;

    enum class Type { Null, Bool, Number, String, Array, Object };

    Value();
    Value(std::nullptr_t);
    Value(bool value);
    Value(int value);
    Value(long long value);
    Value(double value);
    Value(const char* value);
    Value(std::string value);
    Value(Array value);
    Value(Object value);

    Type type() const;
    const char* typeName() const;

    bool isNull() const;
    bool isBool() const;
    bool isNumber() const;
    bool isString() const;
    bool isArray() const;
    bool isObject() const;

    bool asBool(bool fallback = false) const;
    double asNumber(double fallback = 0.0) const;
    long long asInt(long long fallback = 0) const;
    const std::string& asString() const;
    std::string stringOr(const std::string& fallback) const;

    Array& array();
    const Array& array() const;
    Object& object();
    const Object& object() const;

    std::size_t size() const;
    bool empty() const;
    bool contains(const std::string& key) const;
    const Value* find(const std::string& key) const;
    Value* find(const std::string& key);

    const Value& at(const std::string& key) const;
    Value& at(const std::string& key);
    const Value& at(std::size_t index) const;
    Value& at(std::size_t index);

    Value& operator[](const std::string& key);
    const Value& operator[](const std::string& key) const;
    Value& operator[](std::size_t index);
    const Value& operator[](std::size_t index) const;

    void push_back(Value value);
    void erase(const std::string& key);

    std::string dump(int indent = -1) const;
    static Value parse(const std::string& text);
    static Value object(std::initializer_list<std::pair<const std::string, Value>> items);
    static Value array(std::initializer_list<Value> items);

private:
    Storage data_;
};

std::string escape(const std::string& text);

}  // namespace petcore::json
