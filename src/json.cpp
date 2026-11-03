#include "petcore/json.hpp"

#include <cmath>
#include <cstdio>
#include <iomanip>
#include <limits>
#include <sstream>

namespace petcore::json {
namespace {

void appendUtf8(std::string& out, std::uint32_t cp) {
    if (cp <= 0x7F) {
        out.push_back(static_cast<char>(cp));
    } else if (cp <= 0x7FF) {
        out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp <= 0xFFFF) {
        out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else {
        out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    }
}

int hexDigit(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

class Parser {
public:
    explicit Parser(const std::string& text) : text_(text) {}

    Value parse() {
        skipWs();
        Value value = parseValue();
        skipWs();
        if (pos_ != text_.size()) {
            fail("trailing characters after JSON value");
        }
        return value;
    }

private:
    const std::string& text_;
    std::size_t pos_ = 0;

    [[noreturn]] void fail(const std::string& message) const {
        std::ostringstream out;
        out << "JSON parse error at byte " << pos_ << ": " << message;
        throw JsonError(out.str());
    }

    void skipWs() {
        while (pos_ < text_.size()) {
            char c = text_[pos_];
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                ++pos_;
            } else {
                break;
            }
        }
    }

    char peek() const {
        if (pos_ >= text_.size()) fail("unexpected end of input");
        return text_[pos_];
    }

    char take() {
        char c = peek();
        ++pos_;
        return c;
    }

    void expect(char expected) {
        if (take() != expected) fail(std::string("expected '") + expected + "'");
    }

    Value parseValue() {
        skipWs();
        char c = peek();
        switch (c) {
            case '{': return parseObject();
            case '[': return parseArray();
            case '"': return Value(parseString());
            case 't': parseLiteral("true"); return Value(true);
            case 'f': parseLiteral("false"); return Value(false);
            case 'n': parseLiteral("null"); return Value(nullptr);
            default:
                if (c == '-' || (c >= '0' && c <= '9')) return parseNumber();
                fail("unexpected character");
        }
    }

    void parseLiteral(const char* literal) {
        std::size_t length = std::char_traits<char>::length(literal);
        if (text_.compare(pos_, length, literal) != 0) fail("invalid literal");
        pos_ += length;
    }

    Value parseNumber() {
        std::size_t start = pos_;
        if (peek() == '-') ++pos_;
        if (pos_ >= text_.size()) fail("truncated number");
        if (text_[pos_] == '0') {
            ++pos_;
        } else if (text_[pos_] >= '1' && text_[pos_] <= '9') {
            while (pos_ < text_.size() && text_[pos_] >= '0' && text_[pos_] <= '9') ++pos_;
        } else {
            fail("invalid number");
        }
        if (pos_ < text_.size() && text_[pos_] == '.') {
            ++pos_;
            if (pos_ >= text_.size() || text_[pos_] < '0' || text_[pos_] > '9') {
                fail("invalid fraction");
            }
            while (pos_ < text_.size() && text_[pos_] >= '0' && text_[pos_] <= '9') ++pos_;
        }
        if (pos_ < text_.size() && (text_[pos_] == 'e' || text_[pos_] == 'E')) {
            ++pos_;
            if (pos_ < text_.size() && (text_[pos_] == '+' || text_[pos_] == '-')) ++pos_;
            if (pos_ >= text_.size() || text_[pos_] < '0' || text_[pos_] > '9') {
                fail("invalid exponent");
            }
            while (pos_ < text_.size() && text_[pos_] >= '0' && text_[pos_] <= '9') ++pos_;
        }
        const std::string slice = text_.substr(start, pos_ - start);
        try {
            return Value(std::stod(slice));
        } catch (const std::exception&) {
            fail("number out of range");
        }
    }

    std::string parseString() {
        expect('"');
        std::string out;
        while (true) {
            if (pos_ >= text_.size()) fail("unterminated string");
            char c = text_[pos_++];
            if (c == '"') break;
            if (static_cast<unsigned char>(c) < 0x20) fail("control character in string");
            if (c != '\\') {
                out.push_back(c);
                continue;
            }
            if (pos_ >= text_.size()) fail("unterminated escape");
            char esc = text_[pos_++];
            switch (esc) {
                case '"': out.push_back('"'); break;
                case '\\': out.push_back('\\'); break;
                case '/': out.push_back('/'); break;
                case 'b': out.push_back('\b'); break;
                case 'f': out.push_back('\f'); break;
                case 'n': out.push_back('\n'); break;
                case 'r': out.push_back('\r'); break;
                case 't': out.push_back('\t'); break;
                case 'u': {
                    std::uint32_t cp = parseHex4();
                    if (cp >= 0xD800 && cp <= 0xDBFF) {
                        if (pos_ + 1 >= text_.size() || text_[pos_] != '\\' || text_[pos_ + 1] != 'u') {
                            fail("unpaired high surrogate");
                        }
                        pos_ += 2;
                        std::uint32_t low = parseHex4();
                        if (low < 0xDC00 || low > 0xDFFF) fail("invalid low surrogate");
                        cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
                    }
                    appendUtf8(out, cp);
                    break;
                }
                default: fail("invalid escape");
            }
        }
        return out;
    }

    std::uint32_t parseHex4() {
        if (pos_ + 4 > text_.size()) fail("truncated unicode escape");
        std::uint32_t value = 0;
        for (int i = 0; i < 4; ++i) {
            int digit = hexDigit(text_[pos_++]);
            if (digit < 0) fail("invalid unicode escape");
            value = (value << 4) | static_cast<std::uint32_t>(digit);
        }
        return value;
    }

    Value parseArray() {
        expect('[');
        Value::Array items;
        skipWs();
        if (peek() == ']') {
            ++pos_;
            return Value(std::move(items));
        }
        while (true) {
            items.push_back(parseValue());
            skipWs();
            char c = take();
            if (c == ']') break;
            if (c != ',') fail("expected ',' or ']' in array");
        }
        return Value(std::move(items));
    }

    Value parseObject() {
        expect('{');
        Value::Object items;
        skipWs();
        if (peek() == '}') {
            ++pos_;
            return Value(std::move(items));
        }
        while (true) {
            skipWs();
            if (peek() != '"') fail("object key must be a string");
            std::string key = parseString();
            skipWs();
            expect(':');
            items.emplace(std::move(key), parseValue());
            skipWs();
            char c = take();
            if (c == '}') break;
            if (c != ',') fail("expected ',' or '}' in object");
        }
        return Value(std::move(items));
    }
};

void dumpValue(const Value& value, std::string& out, int indent, int depth) {
    const std::string pad = indent >= 0 ? std::string(static_cast<std::size_t>(indent) * depth, ' ') : "";
    const std::string padEnd = indent >= 0 ? std::string(static_cast<std::size_t>(indent) * depth, ' ') : "";
    switch (value.type()) {
        case Value::Type::Null: out += "null"; break;
        case Value::Type::Bool: out += value.asBool() ? "true" : "false"; break;
        case Value::Type::Number: {
            double number = value.asNumber();
            if (!std::isfinite(number)) throw JsonError("cannot serialise NaN/Infinity");
            std::ostringstream stream;
            stream << std::setprecision(15) << number;
            std::string text = stream.str();
            // Normalise integral values to avoid "1.00000000000001" style noise.
            if (text.find('.') != std::string::npos && text.find('e') == std::string::npos &&
                text.find('E') == std::string::npos) {
                while (!text.empty() && text.back() == '0') text.pop_back();
                if (!text.empty() && text.back() == '.') text.pop_back();
            }
            out += text.empty() ? "0" : text;
            break;
        }
        case Value::Type::String: out += '"' + escape(value.asString()) + '"'; break;
        case Value::Type::Array: {
            const auto& items = value.array();
            if (items.empty()) { out += "[]"; break; }
            out += '[';
            for (std::size_t i = 0; i < items.size(); ++i) {
                if (i > 0) out += ',';
                if (indent >= 0) out += '\n' + pad + std::string(static_cast<std::size_t>(indent), ' ');
                dumpValue(items[i], out, indent, depth + 1);
            }
            if (indent >= 0) out += '\n' + padEnd;
            out += ']';
            break;
        }
        case Value::Type::Object: {
            const auto& items = value.object();
            if (items.empty()) { out += "{}"; break; }
            out += '{';
            std::size_t index = 0;
            for (const auto& [key, item] : items) {
                if (index++ > 0) out += ',';
                if (indent >= 0) out += '\n' + pad + std::string(static_cast<std::size_t>(indent), ' ');
                out += '"' + escape(key) + '"' + (indent >= 0 ? ": " : ":");
                dumpValue(item, out, indent, depth + 1);
            }
            if (indent >= 0) out += '\n' + padEnd;
            out += '}';
            break;
        }
    }
}

}  // namespace

Value::Value() : data_(nullptr) {}
Value::Value(std::nullptr_t) : data_(nullptr) {}
Value::Value(bool value) : data_(value) {}
Value::Value(int value) : data_(static_cast<double>(value)) {}
Value::Value(long long value) : data_(static_cast<double>(value)) {}
Value::Value(double value) : data_(value) {}
Value::Value(const char* value) : data_(std::string(value ? value : "")) {}
Value::Value(std::string value) : data_(std::move(value)) {}
Value::Value(Array value) : data_(std::move(value)) {}
Value::Value(Object value) : data_(std::move(value)) {}

Value::Type Value::type() const {
    switch (data_.index()) {
        case 0: return Type::Null;
        case 1: return Type::Bool;
        case 2: return Type::Number;
        case 3: return Type::String;
        case 4: return Type::Array;
        default: return Type::Object;
    }
}

const char* Value::typeName() const {
    switch (type()) {
        case Type::Null: return "null";
        case Type::Bool: return "bool";
        case Type::Number: return "number";
        case Type::String: return "string";
        case Type::Array: return "array";
        default: return "object";
    }
}

bool Value::isNull() const { return type() == Type::Null; }
bool Value::isBool() const { return type() == Type::Bool; }
bool Value::isNumber() const { return type() == Type::Number; }
bool Value::isString() const { return type() == Type::String; }
bool Value::isArray() const { return type() == Type::Array; }
bool Value::isObject() const { return type() == Type::Object; }

bool Value::asBool(bool fallback) const {
    if (auto* value = std::get_if<bool>(&data_)) return *value;
    return fallback;
}

double Value::asNumber(double fallback) const {
    if (auto* value = std::get_if<double>(&data_)) return *value;
    return fallback;
}

long long Value::asInt(long long fallback) const {
    if (auto* value = std::get_if<double>(&data_)) return static_cast<long long>(*value);
    return fallback;
}

const std::string& Value::asString() const {
    if (auto* value = std::get_if<std::string>(&data_)) return *value;
    throw JsonError(std::string("expected string, got ") + typeName());
}

std::string Value::stringOr(const std::string& fallback) const {
    if (auto* value = std::get_if<std::string>(&data_)) return *value;
    return fallback;
}

Value::Array& Value::array() {
    if (auto* value = std::get_if<Array>(&data_)) return *value;
    throw JsonError(std::string("expected array, got ") + typeName());
}

const Value::Array& Value::array() const {
    if (auto* value = std::get_if<Array>(&data_)) return *value;
    throw JsonError(std::string("expected array, got ") + typeName());
}

Value::Object& Value::object() {
    if (auto* value = std::get_if<Object>(&data_)) return *value;
    throw JsonError(std::string("expected object, got ") + typeName());
}

const Value::Object& Value::object() const {
    if (auto* value = std::get_if<Object>(&data_)) return *value;
    throw JsonError(std::string("expected object, got ") + typeName());
}

std::size_t Value::size() const {
    if (auto* value = std::get_if<Array>(&data_)) return value->size();
    if (auto* value = std::get_if<Object>(&data_)) return value->size();
    if (auto* value = std::get_if<std::string>(&data_)) return value->size();
    return 0;
}

bool Value::empty() const { return size() == 0; }

bool Value::contains(const std::string& key) const {
    if (auto* value = std::get_if<Object>(&data_)) return value->find(key) != value->end();
    return false;
}

const Value* Value::find(const std::string& key) const {
    if (auto* value = std::get_if<Object>(&data_)) {
        auto it = value->find(key);
        if (it != value->end()) return &it->second;
    }
    return nullptr;
}

Value* Value::find(const std::string& key) {
    if (auto* value = std::get_if<Object>(&data_)) {
        auto it = value->find(key);
        if (it != value->end()) return &it->second;
    }
    return nullptr;
}

const Value& Value::at(const std::string& key) const {
    if (const Value* value = find(key)) return *value;
    throw JsonError("missing key: " + key);
}

Value& Value::at(const std::string& key) {
    if (Value* value = find(key)) return *value;
    throw JsonError("missing key: " + key);
}

const Value& Value::at(std::size_t index) const {
    const auto& items = array();
    if (index >= items.size()) throw JsonError("array index out of range");
    return items[index];
}

Value& Value::at(std::size_t index) {
    auto& items = array();
    if (index >= items.size()) throw JsonError("array index out of range");
    return items[index];
}

Value& Value::operator[](const std::string& key) {
    if (isNull()) data_ = Object{};
    auto& items = object();
    return items[key];
}

const Value& Value::operator[](const std::string& key) const { return at(key); }

Value& Value::operator[](std::size_t index) { return at(index); }
const Value& Value::operator[](std::size_t index) const { return at(index); }

void Value::push_back(Value value) {
    if (isNull()) data_ = Array{};
    array().push_back(std::move(value));
}

void Value::erase(const std::string& key) {
    if (auto* value = std::get_if<Object>(&data_)) value->erase(key);
}

std::string Value::dump(int indent) const {
    std::string out;
    dumpValue(*this, out, indent, 0);
    return out;
}

Value Value::parse(const std::string& text) {
    // Tolerate a UTF-8 BOM produced by Windows editors.
    if (text.size() >= 3 && static_cast<unsigned char>(text[0]) == 0xEF &&
        static_cast<unsigned char>(text[1]) == 0xBB &&
        static_cast<unsigned char>(text[2]) == 0xBF) {
        return Parser(text.substr(3)).parse();
    }
    return Parser(text).parse();
}

Value Value::object(std::initializer_list<std::pair<const std::string, Value>> items) {
    Object object;
    for (const auto& item : items) object.emplace(item.first, item.second);
    return Value(std::move(object));
}

Value Value::array(std::initializer_list<Value> items) {
    Array array;
    for (const auto& item : items) array.push_back(item);
    return Value(std::move(array));
}

std::string escape(const std::string& text) {
    std::string out;
    out.reserve(text.size() + 8);
    static const char* hex = "0123456789abcdef";
    for (unsigned char c : text) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    out += "\\u00";
                    out.push_back(hex[(c >> 4) & 0x0F]);
                    out.push_back(hex[c & 0x0F]);
                } else {
                    out.push_back(static_cast<char>(c));
                }
        }
    }
    return out;
}

}  // namespace petcore::json
