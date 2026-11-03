#include "petcore/session.hpp"

#include "petcore/errors.hpp"
#include "petcore/util.hpp"

namespace petcore {

SessionManager::SessionManager(IDatabase& database, CharacterRegistry& characters)
    : database_(database), characters_(characters) {}

CreatedSession SessionManager::create(const std::string& characterId, const std::string& title) {
    CreatedSession created;
    created.card = characters_.get(characterId);
    created.session = database_.createSession(characterId, title.empty() ? created.card->name : title);

    EmotionState emotion;
    emotion.name = created.card->defaultEmotion;
    emotion.intensity = 0.5;
    emotion.updatedUnix = util::nowUnix();
    created.session.state["emotion"] = emotion.toSessionState();
    database_.updateSession(created.session);

    created.greeting = Message{"assistant", created.card->greeting, {}, "", created.card->name,
                               util::nowIso()};
    database_.appendMessage(created.session.id, created.greeting);
    return created;
}

SessionRecord SessionManager::get(const std::string& sessionId) const {
    const auto session = database_.getSession(sessionId);
    if (!session) throw DatabaseError("session not found: " + sessionId);
    return *session;
}

std::vector<SessionRecord> SessionManager::list(std::size_t limit) const {
    return database_.listSessions(limit);
}

std::shared_ptr<const CharacterCard> SessionManager::cardFor(const SessionRecord& session) const {
    return characters_.get(session.characterId);
}

void SessionManager::saveEmotion(const std::string& sessionId, const EmotionState& emotion) {
    auto session = database_.getSession(sessionId);
    if (!session) return;
    session->state["emotion"] = emotion.toSessionState();
    database_.updateSession(*session);
}

}  // namespace petcore
