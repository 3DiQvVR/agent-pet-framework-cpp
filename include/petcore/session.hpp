#pragma once

#include <memory>
#include <string>
#include <vector>

#include "petcore/character.hpp"
#include "petcore/database.hpp"
#include "petcore/emotion.hpp"

namespace petcore {

struct CreatedSession {
    SessionRecord session;
    std::shared_ptr<const CharacterCard> card;
    Message greeting;
};

class SessionManager {
public:
    SessionManager(IDatabase& database, CharacterRegistry& characters);

    CreatedSession create(const std::string& characterId, const std::string& title = "");
    SessionRecord get(const std::string& sessionId) const;
    std::vector<SessionRecord> list(std::size_t limit = 20) const;
    std::shared_ptr<const CharacterCard> cardFor(const SessionRecord& session) const;
    void saveEmotion(const std::string& sessionId, const EmotionState& emotion);

private:
    IDatabase& database_;
    CharacterRegistry& characters_;
};

}  // namespace petcore
