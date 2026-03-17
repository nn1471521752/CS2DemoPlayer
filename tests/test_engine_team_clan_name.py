import pathlib
import sys
import unittest

import pandas as pd


PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
PYTHON_SRC = PROJECT_ROOT / "src" / "python"
if str(PYTHON_SRC) not in sys.path:
    sys.path.insert(0, str(PYTHON_SRC))

from engine import build_players_by_tick, build_round_team_display  # noqa: E402


class BuildPlayersByTickTeamClanNameTests(unittest.TestCase):
    def test_preserves_team_clan_name_for_players(self):
        players_df = pd.DataFrame(
            [
                {
                    "tick": 128,
                    "X": 1.0,
                    "Y": 2.0,
                    "team_num": 2,
                    "yaw": 90.0,
                    "is_alive": True,
                    "health": 100,
                    "balance": 3100,
                    "steamid": "steam-a",
                    "name": "apEX",
                    "team_clan_name": "Team Vitality",
                },
                {
                    "tick": 128,
                    "X": 3.0,
                    "Y": 4.0,
                    "team_num": 3,
                    "yaw": 180.0,
                    "is_alive": True,
                    "health": 100,
                    "balance": 4200,
                    "steamid": "steam-b",
                    "name": "chopper",
                    "team_clan_name": "Team Spirit",
                },
            ]
        )

        players_by_tick = build_players_by_tick(players_df)

        self.assertEqual(players_by_tick[128][0]["team_clan_name"], "Team Vitality")
        self.assertEqual(players_by_tick[128][1]["team_clan_name"], "Team Spirit")

    def test_builds_compact_round_team_display(self):
        frames = [
            {
                "tick": 128,
                "players": [
                    {"team_num": 2, "team_clan_name": "Team Vitality"},
                    {"team_num": 2, "team_clan_name": "Team Vitality"},
                    {"team_num": 3, "team_clan_name": "Team Spirit"},
                ],
            }
        ]

        self.assertEqual(
            build_round_team_display(frames),
            {
                "2": {"name": "Team Vitality"},
                "3": {"name": "Team Spirit"},
            },
        )


if __name__ == "__main__":
    unittest.main()
