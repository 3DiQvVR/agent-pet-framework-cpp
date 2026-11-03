#pragma once

#include <string>

#include "petcore/json.hpp"

namespace petcore {

struct EmotionState {
    std::string name = "neutral";
    double intensity = 0.5;
    long long updatedUnix = 0;

    static EmotionState fromSessionState(const json::Value& state);
    json::Value toSessionState() const;
    void set(const std::string& emotion, double value);
    void decay(long long nowUnix, long long halfLifeSeconds = 900);
    bool isNeutral() const;
};

}  // namespace petcore
