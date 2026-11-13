cmake_minimum_required(VERSION 3.18)
project(katago_ladder_oracle LANGUAGES CXX)

if(NOT DEFINED KATAGO_CPP_DIR OR NOT EXISTS "${KATAGO_CPP_DIR}/game/board.cpp")
  message(FATAL_ERROR "Set KATAGO_CPP_DIR to the cpp/ directory of the pinned KataGo checkout")
endif()

# Board::initHash uses Rand; Rand in turn uses these core utility modules.
# Keep this dependency list minimal so the test oracle does not pull in
# unrelated optional dependencies such as ghc/filesystem or neural backends.
set(KATAGO_BOARD_CORE_SOURCES
  "${KATAGO_CPP_DIR}/core/global.cpp"
  "${KATAGO_CPP_DIR}/core/hash.cpp"
  "${KATAGO_CPP_DIR}/core/rand.cpp"
  "${KATAGO_CPP_DIR}/core/md5.cpp"
  "${KATAGO_CPP_DIR}/core/sha2.cpp"
  "${KATAGO_CPP_DIR}/core/timer.cpp"
  "${KATAGO_CPP_DIR}/core/bsearch.cpp"
)

find_package(Threads REQUIRED)
add_executable(katago-ladder-oracle
  main.cpp
  "${KATAGO_CPP_DIR}/game/board.cpp"
  ${KATAGO_BOARD_CORE_SOURCES}
)
target_include_directories(katago-ladder-oracle PRIVATE "${KATAGO_CPP_DIR}")
target_compile_features(katago-ladder-oracle PRIVATE cxx_std_17)
target_compile_definitions(katago-ladder-oracle PRIVATE COMPILE_MAX_BOARD_LEN=19)
target_link_libraries(katago-ladder-oracle PRIVATE Threads::Threads)
