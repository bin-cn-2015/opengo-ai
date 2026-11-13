import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import generate_katago_ladder_corpus as generator


class GeneratedLadderCorpusTests(unittest.TestCase):
    def test_generation_is_reproducible(self):
        first = generator.generate_candidates(16, seed=12345)
        second = generator.generate_candidates(16, seed=12345)
        self.assertEqual(first, second)

    def test_candidates_have_live_groups_and_threatened_targets(self):
        cases = generator.generate_candidates(24, seed=67890)
        self.assertEqual(len(cases), 24)
        for case in cases:
            board = [[None] * case["size"] for _ in range(case["size"])]
            for color, row, col in case["stones"]:
                board[row][col] = color
            self.assertTrue(generator.has_only_live_groups(board), case["id"])
            stones, liberties = generator.group_and_liberties(board, tuple(case["target"]))
            self.assertGreater(len(stones), 0, case["id"])
            self.assertIn(len(liberties), (1, 2, 3), case["id"])
            self.assertEqual(len(liberties), case["targetLibertiesAtRoot"])


if __name__ == "__main__":
    unittest.main()
