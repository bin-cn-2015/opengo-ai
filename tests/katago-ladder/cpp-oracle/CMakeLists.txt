cmake_minimum_required(VERSION 3.18)
project(katago_ladder_oracle LANGUAGES CXX)

if(NOT DEFINED KATAGO_CPP_DIR OR NOT EXISTS "${KATAGO_CPP_DIR}/game/board.cpp")
  message(FATAL_ERROR "Set KATAGO_CPP_DIR to the cpp/ directory of the pinned KataGo checkout")
endif()

# Board's implementation uses a small set of core utilities. Compiling the
# upstream core sources avoids copying or reimplementing KataGo internals.
file(GLOB KATAGO_CORE_SOURCES CONFIGURE_DEPENDS "${KATAGO_CPP_DIR}/core/*.cpp")
list(FILTER KATAGO_CORE_SOURCES EXCLUDE REGEX "/win_rocm_sse_shim\\.cpp$")

find_package(Threads REQUIRED)
add_executable(katago-ladder-oracle
  main.cpp
  "${KATAGO_CPP_DIR}/game/board.cpp"
  ${KATAGO_CORE_SOURCES}
)
target_include_directories(katago-ladder-oracle PRIVATE "${KATAGO_CPP_DIR}")
target_compile_features(katago-ladder-oracle PRIVATE cxx_std_17)
target_compile_definitions(katago-ladder-oracle PRIVATE COMPILE_MAX_BOARD_LEN=19)
target_link_libraries(katago-ladder-oracle PRIVATE Threads::Threads)
