cmake_minimum_required(VERSION 3.16)
project(petcore VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(MSVC)
    add_compile_options(/utf-8 /W4)
else()
    add_compile_options(-Wall -Wextra)
endif()

set(PETCORE_SOURCES
    src/json.cpp
    src/files.cpp
    src/events.cpp
    src/config.cpp
    src/character.cpp
    src/emotion.cpp
    src/database_json.cpp
    src/memory.cpp
    src/tools.cpp
    src/builtin_tools.cpp
    src/llm_mock.cpp
    src/llm_openai.cpp
    src/llm_stream.cpp
    src/agent.cpp
    src/session.cpp
    src/runtime.cpp
    src/http_server.cpp
)

add_library(petcore_core STATIC ${PETCORE_SOURCES})
target_include_directories(petcore_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

if(WIN32)
    target_link_libraries(petcore_core PUBLIC winhttp ws2_32 dwmapi)
endif()

add_executable(petcore src/main.cpp)
target_link_libraries(petcore PRIVATE petcore_core)
if(WIN32)
    target_link_libraries(petcore PRIVATE shell32)
endif()

enable_testing()
add_executable(petcore_tests tests/self_test.cpp)
target_link_libraries(petcore_tests PRIVATE petcore_core)
target_compile_definitions(petcore_tests PRIVATE
    PETCORE_TEST_CARDS_DIR="${CMAKE_CURRENT_SOURCE_DIR}/cards")
add_test(NAME petcore_self_test COMMAND petcore_tests)
