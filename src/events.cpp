#include "petcore/events.hpp"

#include <utility>

namespace petcore {

int EventBus::subscribe(const std::string& type, Handler handler) {
    std::lock_guard<std::mutex> lock(mutex_);
    const int id = nextId_++;
    handlers_[type].emplace(id, std::move(handler));
    return id;
}

void EventBus::unsubscribe(int id) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& [type, handlers] : handlers_) {
        handlers.erase(id);
    }
}

void EventBus::publish(const AgentEvent& event) {
    std::map<int, Handler> snapshot;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (auto it = handlers_.find(event.type); it != handlers_.end()) snapshot = it->second;
        if (auto it = handlers_.find("*"); it != handlers_.end()) {
            snapshot.insert(it->second.begin(), it->second.end());
        }
    }
    for (const auto& [id, handler] : snapshot) {
        try {
            handler(event);
        } catch (...) {
            // Events are best-effort; never break a turn because a UI
            // subscriber or plugin failed.
        }
    }
}

}  // namespace petcore
