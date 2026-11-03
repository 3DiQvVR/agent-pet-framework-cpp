#include "petcore/emotion.hpp"

#include <algorithm>
#include <cmath>

#include "petcore/util.hpp"

namespace petcore {

EmotionState EmotionState::fromSessionState(const json::Value& state) {
    EmotionState emotion;
    if (const auto* value = state.find("emotion"); value && value->isObject()) {
        emotion.name = util::jstr(*value, "name", "neutral");
        emotion.intensity = util::jdouble(*value, "intensity", 0.5);
        emotion.updatedUnix = static_cast<long long>(util::jdouble(*value, "updated_unix", 0.0));
    }
    if (emotion.name.empty()) emotion.name = "neutral";
    emotion.intensity = std::clamp(emotion.intensity, 0.0, 1.0);
    return emotion;
}

json::Value EmotionState::toSessionState() const {
    return json::Value::object({
        {"name", name},
        {"intensity", intensity},
        {"updated_unix", static_cast<double>(updatedUnix)},
    });
}

void EmotionState::set(const std::string& emotion, double value) {
    name = emotion.empty() ? "neutral" : emotion;
    intensity = std::clamp(value, 0.0, 1.0);
    updatedUnix = util::nowUnix();
}

void EmotionState::decay(long long nowUnix, long long halfLifeSeconds) {
    if (updatedUnix <= 0 || halfLifeSeconds <= 0) {
        updatedUnix = nowUnix;
        return;
    }
    const long long elapsed = std::max(0LL, nowUnix - updatedUnix);
    if (elapsed == 0) return;
    const double factor = std::pow(0.5, static_cast<double>(elapsed) / static_cast<double>(halfLifeSeconds));
    intensity *= factor;
    if (intensity < 0.15) {
        name = "neutral";
        intensity = 0.4;
    }
    updatedUnix = nowUnix;
}

bool EmotionState::isNeutral() const { return name == "neutral"; }

}  // namespace petcore
