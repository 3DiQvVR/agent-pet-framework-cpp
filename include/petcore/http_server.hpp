#pragma once

#include <memory>
#include <string>

namespace petcore {

class Runtime;

// Small local HTTP server that exposes the runtime as JSON + SSE and serves
// the bundled web UI. Binds to 127.0.0.1 by default; no external assets.
class HttpServer {
public:
    HttpServer(Runtime& runtime, std::string host, int port, std::string webRoot);
    ~HttpServer();

    HttpServer(const HttpServer&) = delete;
    HttpServer& operator=(const HttpServer&) = delete;

    void start();
    void stop();
    std::string url() const;
    int port() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace petcore
