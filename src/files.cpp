#include "petcore/util.hpp"

#if defined(_WIN32)
#define NOMINMAX
#include <windows.h>
#endif

namespace petcore::util {

std::string userEnvironment(const std::string& name) {
    if (const auto value = getEnv(name); !value.empty()) return value;
#if defined(_WIN32)
    const std::wstring wideName(name.begin(), name.end());
    for (const auto root : {HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE}) {
        const wchar_t* subkey = root == HKEY_CURRENT_USER ? L"Environment" :
            L"SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";
        DWORD bytes = 0;
        if (RegGetValueW(root, subkey, wideName.c_str(), RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ,
                        nullptr, nullptr, &bytes) != ERROR_SUCCESS || bytes > 65536) continue;
        std::vector<wchar_t> value(bytes / sizeof(wchar_t) + 1, 0);
        if (RegGetValueW(root, subkey, wideName.c_str(), RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ,
                        nullptr, value.data(), &bytes) != ERROR_SUCCESS) continue;
        const int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), -1, nullptr, 0, nullptr, nullptr);
        if (size <= 1) continue;
        std::string result(static_cast<std::size_t>(size), '\0');
        WideCharToMultiByte(CP_UTF8, 0, value.data(), -1, result.data(), size, nullptr, nullptr);
        result.pop_back();
        return result;
    }
#endif
    return {};
}

std::filesystem::path confinedPath(const std::filesystem::path& root, const std::string& relative) {
    if (relative.empty() || relative.find('\0') != std::string::npos ||
        relative.find(':') != std::string::npos || relative.find('\\') != std::string::npos)
        throw std::runtime_error("invalid asset path");
    const std::filesystem::path name(relative);
    if (name.has_root_path()) throw std::runtime_error("rooted asset path is not allowed");
    for (const auto& part : name) {
        const auto text = part.string();
        if (text.empty() || text == "." || text == ".." || text.back() == '.' || text.back() == ' ')
            throw std::runtime_error("invalid asset path component");
#if defined(_WIN32)
        const auto stem = toLowerAscii(text.substr(0, text.find('.')));
        if (stem == "con" || stem == "nul" || stem == "aux" || stem == "prn" ||
            (stem.size() == 4 && (stem.substr(0, 3) == "com" || stem.substr(0, 3) == "lpt") &&
             stem[3] >= '1' && stem[3] <= '9')) throw std::runtime_error("reserved asset name");
#endif
    }
    const auto base = std::filesystem::weakly_canonical(root);
    const auto target = std::filesystem::weakly_canonical(base / name);
    auto b = base.begin();
    auto t = target.begin();
    for (; b != base.end(); ++b, ++t) {
        if (t == target.end()) throw std::runtime_error("asset path escapes its root");
#if defined(_WIN32)
        if (toLowerAscii(b->string()) != toLowerAscii(t->string()))
#else
        if (*b != *t)
#endif
            throw std::runtime_error("asset path escapes its root");
    }
    if (t == target.end()) throw std::runtime_error("asset must name a file");
    return target;
}

void writeFileAtomic(const std::string& path, const std::string& content) {
    ensureParentDirectory(path);
    const std::filesystem::path target(path);
    const auto temporary = std::filesystem::path(path + "." + uuid() + ".tmp");
#if defined(_WIN32)
    HANDLE file = CreateFileW(temporary.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
                              FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) throw std::runtime_error("cannot create temporary file: " + temporary.string());
    bool success = true;
    for (std::size_t offset = 0; offset < content.size();) {
        const DWORD size = static_cast<DWORD>(std::min<std::size_t>(content.size() - offset, 1024 * 1024));
        DWORD written = 0;
        if (!WriteFile(file, content.data() + offset, size, &written, nullptr) || written != size) {
            success = false;
            break;
        }
        offset += written;
    }
    if (success) success = FlushFileBuffers(file) != FALSE;
    if (!CloseHandle(file)) success = false;
    if (!success) {
        std::error_code ignored;
        std::filesystem::remove(temporary, ignored);
        throw std::runtime_error("failed while writing: " + path);
    }
    if (!MoveFileExW(temporary.c_str(), target.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
        // Leave both the original and the fully written candidate available.
        throw std::runtime_error("cannot replace file; candidate retained at: " + temporary.string());
    }
#else
    {
        std::ofstream stream(temporary, std::ios::binary | std::ios::trunc);
        if (!stream) throw std::runtime_error("cannot create temporary file: " + temporary.string());
        stream.write(content.data(), static_cast<std::streamsize>(content.size()));
        stream.close();
        if (!stream) throw std::runtime_error("failed while writing: " + temporary.string());
    }
    std::error_code error;
    std::filesystem::rename(temporary, target, error);
    if (error) throw std::runtime_error("cannot replace file; candidate retained at: " + temporary.string());
#endif
}
} // namespace petcore::util
