#include <dlfcn.h>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <string>
#include <string_view>
#include <vector>

/**
 * Mirror the SDK's diagnostic message layout when reading its exported tables.
 *
 * ---
 *
 * 读取 SDK 导出的诊断表时，复用其诊断消息的数据布局。
 */
struct ErrorData {
    std::string message;
    std::string mainHint;
    std::vector<std::string> otherHints;
};

/**
 * Read an exported SDK table and stop if its symbol is unavailable.
 *
 * ---
 *
 * 读取 SDK 导出的数据表，符号不存在时停止执行。
 */
template <typename Value>
const Value& loadSymbol(void* library, const char* name) {
    auto* value = static_cast<const Value*>(dlsym(library, name));
    if (!value) {
        std::cerr << dlerror() << "\n";
        std::exit(1);
    }
    return *value;
}

/**
 * Write a diagnostic template as a JSON string without interpreting placeholders.
 *
 * ---
 *
 * 将诊断模板写为 JSON 字符串，不解释其中的占位符。
 */
void writeString(std::string_view value) {
    std::cout << '"';
    for (const unsigned char character : value) {
        switch (character) {
            case '"': std::cout << "\\\""; break;
            case '\\': std::cout << "\\\\"; break;
            case '\n': std::cout << "\\n"; break;
            case '\r': std::cout << "\\r"; break;
            case '\t': std::cout << "\\t"; break;
            default:
                if (character < 0x20) {
                    char escaped[7];
                    std::snprintf(escaped, sizeof(escaped), "\\u%04x", character);
                    std::cout << escaped;
                } else {
                    std::cout << character;
                }
        }
    }
    std::cout << '"';
}

/**
 * Extract the original and refactored diagnostic tables from a macOS SDK library.
 *
 * ---
 *
 * 从 macOS SDK 动态库提取原始诊断表和重构诊断表。
 */
int main(int count, char** arguments) {
    if (count != 2) return 1;
    void* library = dlopen(arguments[1], RTLD_NOW | RTLD_LOCAL);
    if (!library) {
        std::cerr << dlerror() << "\n";
        return 1;
    }
    const auto& names = loadSymbol<std::vector<std::string_view>>(library, "_ZN7Cangjie13DIAG_KIND_STRE");
    const auto& messages = loadSymbol<std::vector<std::string_view>>(library, "_ZN7Cangjie12DiagMessagesE");
    const auto& levels = loadSymbol<std::vector<uint8_t>>(library, "_ZN7Cangjie13DiagSeveritysE");
    const auto& refactoredNames = loadSymbol<std::vector<std::string_view>>(library, "_ZN7Cangjie16RE_DIAG_KIND_STRE");
    const auto& refactoredMessages = loadSymbol<std::vector<ErrorData>>(library, "_ZN7Cangjie9errorDataE");
    const auto& refactoredLevels = loadSymbol<std::vector<uint8_t>>(library, "_ZN7Cangjie14rDiagSeveritysE");
    if (names.empty() || refactoredNames.empty() || names.size() > 10000 || refactoredNames.size() > 10000
        || names.size() != messages.size() || names.size() != levels.size()
        || refactoredNames.size() != refactoredMessages.size() || refactoredNames.size() != refactoredLevels.size()) {
        std::cerr << "The SDK diagnostic table layout is unsupported.\n";
        return 2;
    }
    size_t offset = names.size();
    for (size_t index = 0; index < names.size(); ++index) {
        if (names[index] == "sema_diag_end") offset = index;
    }
    if (offset == names.size()) {
        std::cerr << "Cannot find the SDK diagnostic code offset.\n";
        return 3;
    }
    std::cout << "[\n";
    bool first = true;
    for (size_t table = 0; table < 2; ++table) {
        const auto& tableNames = table ? refactoredNames : names;
        const auto& tableLevels = table ? refactoredLevels : levels;
        for (size_t index = 0; index < tableNames.size(); ++index) {
            if (!first) std::cout << ",\n";
            first = false;
            std::cout << "  {\"code\":" << (table ? offset + index : index) << ",\"name\":";
            writeString(tableNames[index]);
            std::cout << ",\"severity\":" << static_cast<unsigned>(tableLevels[index]) << ",\"message\":";
            writeString(table ? refactoredMessages[index].message : messages[index]);
            std::cout << ",\"mainHint\":";
            writeString(table ? refactoredMessages[index].mainHint : "");
            std::cout << ",\"otherHints\":[";
            if (table) {
                bool firstHint = true;
                for (const auto& hint : refactoredMessages[index].otherHints) {
                    if (!firstHint) std::cout << ',';
                    firstHint = false;
                    writeString(hint);
                }
            }
            std::cout << "],\"table\":";
            writeString(table ? "refactored" : "original");
            std::cout << "}";
        }
    }
    std::cout << "\n]\n";
    dlclose(library);
    return 0;
}
