#pragma once

#include <functional>
#include <map>
#include <mutex>
#include <string>

#include "petcore/types.hpp"

namespace petcore {

// Thread-safe, allocation-light event bus. Subscribers are invoked
// synchronously on the emitting thread; a throwing subscriber is ignored.
class EventBus {
public:
    using Handler = std::function<void(const AgentEvent&)>;

    int subscribe(const std::string& type, Handler handler);
    void unsubscribe(int id);
    void publish(const AgentEvent& event);

private:
    std::mutex mutex_;
    int nextId_ = 1;
    std::map<std::string, std::map<int, Handler>> handlers_;
};

}  // namespace petcore
