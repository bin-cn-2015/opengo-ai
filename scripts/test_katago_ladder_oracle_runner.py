#!/usr/bin/env python3
"""Self-tests for the external KataGo oracle comparison runner."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts" / "compare_katago_ladder_oracle.py"


class OracleRunnerTests(unittest.TestCase):
    def run_runner(self, status: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            fixture = temp / "cases.json"
            fixture.write_text(json.dumps([{
                "id": "runner-smoke",
                "size": 9,
                "stones": [],
                "target": [0, 0],
                "attacker": "black",
                "firstPlayer": "attacker",
                "expected": "captured",
            }]), encoding="utf-8")
            adapter = temp / "adapter.py"
            adapter.write_text(
                "import json, sys\n"
                "case = json.loads(sys.stdin.readline())\n"
                f"print(json.dumps({{'id': case['id'], 'status': {status!r}}}))\n",
                encoding="utf-8",
            )
            return subprocess.run(
                [sys.executable, str(RUNNER), "--fixtures", str(fixture),
                 "--oracle", sys.executable, str(adapter)],
                text=True, capture_output=True, check=False,
            )

    def test_matching_oracle_result_passes(self) -> None:
        result = self.run_runner("captured")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("1/1 oracle cases matched", result.stdout)

    def test_mismatching_oracle_result_fails(self) -> None:
        result = self.run_runner("escaped")
        self.assertEqual(result.returncode, 1)
        self.assertIn("status mismatch", result.stderr)


if __name__ == "__main__":
    unittest.main()
