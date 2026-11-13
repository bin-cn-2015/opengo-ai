#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "game/board.h"
#include "external/nlohmann_json/json.hpp"

using nlohmann::json;

namespace {
Player parsePlayer(const std::string& color) {
  if(color == "black") return P_BLACK;
  if(color == "white") return P_WHITE;
  throw std::invalid_argument("color must be black or white");
}

json handle(const json& request) {
  const std::string id = request.at("id").get<std::string>();
  const int size = request.at("size").get<int>();
  if(size < 1 || size > Board::MAX_LEN)
    throw std::invalid_argument("board size is outside KataGo's supported range");

  const Player attacker = parsePlayer(request.at("attacker").get<std::string>());
  const std::string firstPlayer = request.at("firstPlayer").get<std::string>();
  if(firstPlayer != "attacker" && firstPlayer != "defender")
    throw std::invalid_argument("firstPlayer must be attacker or defender");

  const json& targetArray = request.at("target");
  if(!targetArray.is_array() || targetArray.size() != 2)
    throw std::invalid_argument("target must be [row, col]");
  const int targetRow = targetArray.at(0).get<int>();
  const int targetCol = targetArray.at(1).get<int>();
  if(targetRow < 0 || targetRow >= size || targetCol < 0 || targetCol >= size)
    throw std::invalid_argument("target is outside the board");

  std::vector<Move> placements;
  const json& stones = request.at("stones");
  if(!stones.is_array())
    throw std::invalid_argument("stones must be an array");
  placements.reserve(stones.size());
  for(const json& stone : stones) {
    if(!stone.is_array() || stone.size() != 3)
      throw std::invalid_argument("each stone must be [color, row, col]");
    const Player color = parsePlayer(stone.at(0).get<std::string>());
    const int row = stone.at(1).get<int>();
    const int col = stone.at(2).get<int>();
    if(row < 0 || row >= size || col < 0 || col >= size)
      throw std::invalid_argument("stone is outside the board");
    placements.emplace_back(Location::getLoc(col, row, size), color);
  }

  Board board(size, size);
  const int removed = board.setStonesTolerant(placements);
  if(removed != 0)
    throw std::invalid_argument("fixture contains a zero-liberty group");
  const Loc target = Location::getLoc(targetCol, targetRow, size);
  if(board.colors[target] != getOpp(attacker))
    throw std::invalid_argument("target must contain a stone of the defender color");

  std::vector<Loc> working;
  const bool captured = board.searchIsLadderCaptured(
    target, firstPlayer == "defender", working
  );
  json response{
    {"id", id},
    {"status", captured ? "captured" : "escaped"},
    {"oracle", "KataGo Board::searchIsLadderCaptured"},
    {"unknownStatusAvailable", false}
  };
  if(id == "double-ko-death") {
    const Loc a = Location::getLoc(4, 3, size);
    const Loc b = Location::getLoc(4, 5, size);
    response["debug"] = {
      {"targetLiberties", board.getNumLiberties(target)},
      {"aImmediate", board.getNumImmediateLiberties(a)},
      {"bImmediate", board.getNumImmediateLiberties(b)},
      {"aKoMouth", board.wouldBeKoCapture(a, attacker)},
      {"bKoMouth", board.wouldBeKoCapture(b, attacker)},
      {"aPostLiberties", board.getNumLibertiesAfterPlay(a, getOpp(attacker), 3)},
      {"bPostLiberties", board.getNumLibertiesAfterPlay(b, getOpp(attacker), 3)}
    };
  }
  return response;
}
}

int main() {
  Board::initHash();
  std::string line;
  if(!std::getline(std::cin, line)) {
    std::cerr << "expected one JSON request on stdin\n";
    return 2;
  }
  try {
    const json request = json::parse(line);
    const json response = handle(request);
    std::cout << response.dump() << std::endl;
    return 0;
  }
  catch(const std::exception& error) {
    std::cerr << error.what() << std::endl;
    return 2;
  }
}
