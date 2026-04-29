import pathlib
import sys
import unittest

import pandas as pd


PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
PYTHON_SRC = PROJECT_ROOT / "src" / "python"
if str(PYTHON_SRC) not in sys.path:
    sys.path.insert(0, str(PYTHON_SRC))

import engine  # noqa: E402


class ExportClockPreparseTests(unittest.TestCase):
    def test_builds_round_clock_states_from_preparsed_rules(self):
        self.assertTrue(
            hasattr(engine, "build_round_clock_states_from_rules"),
            "engine should expose a pure helper for reusing pre-parsed clock rules",
        )

        states_by_tick = engine.build_round_clock_states_from_rules(
            0,
            4,
            {
                0: {"round_time_seconds": 115},
                2: {"game_paused": True, "round_time_seconds": 115},
                4: {"bomb_planted": True, "round_time_seconds": 115},
            },
            bomb_planted_tick=4,
            frame_step=2,
        )

        self.assertEqual(list(states_by_tick.keys()), [0, 2, 4])
        self.assertEqual(states_by_tick[2]["phase"], "pause")
        self.assertTrue(states_by_tick[2]["is_paused"])
        self.assertEqual(states_by_tick[4]["phase"], "bomb")

    def test_round_clock_counts_down_when_not_paused(self):
        states_by_tick = engine.build_round_clock_states_from_rules(
            0,
            16,
            {
                0: {"round_time_seconds": 10},
                8: {"round_time_seconds": 10},
                16: {"round_time_seconds": 10},
            },
            frame_step=8,
        )

        self.assertEqual(states_by_tick[0]["remaining_seconds"], 10.0)
        self.assertEqual(states_by_tick[8]["remaining_seconds"], 9.0)
        self.assertEqual(states_by_tick[16]["remaining_seconds"], 8.0)

    def test_round_clock_does_not_count_down_during_pause(self):
        states_by_tick = engine.build_round_clock_states_from_rules(
            0,
            16,
            {
                0: {"round_time_seconds": 10},
                8: {"game_paused": True, "round_time_seconds": 10},
                16: {"game_paused": True, "round_time_seconds": 10},
            },
            frame_step=8,
        )

        self.assertEqual(states_by_tick[8]["phase"], "pause")
        self.assertEqual(states_by_tick[8]["remaining_seconds"], 9.0)
        self.assertEqual(states_by_tick[16]["phase"], "pause")
        self.assertEqual(states_by_tick[16]["remaining_seconds"], 9.0)

    def test_builds_export_clock_rules_with_one_parser_call(self):
        self.assertTrue(
            hasattr(engine, "build_export_clock_rules_by_tick"),
            "engine should expose a helper that pre-parses export clock rules once",
        )

        class FakeParser:
            def __init__(self):
                self.calls = []

            def parse_ticks(self, _props, ticks):
                self.calls.append(list(ticks))
                return pd.DataFrame(
                    [
                        {
                            "tick": tick,
                            "CCSGameRulesProxy.CCSGameRules.m_bFreezePeriod": False,
                            "CCSGameRulesProxy.CCSGameRules.m_bGamePaused": False,
                            "CCSGameRulesProxy.CCSGameRules.m_bCTTimeOutActive": False,
                            "CCSGameRulesProxy.CCSGameRules.m_bTerroristTimeOutActive": False,
                            "CCSGameRulesProxy.CCSGameRules.m_bTechnicalTimeOut": False,
                            "CCSGameRulesProxy.CCSGameRules.m_bMatchWaitingForResume": False,
                            "CCSGameRulesProxy.CCSGameRules.m_bBombPlanted": False,
                            "CCSGameRulesProxy.CCSGameRules.m_iRoundTime": 115,
                            "CCSGameRulesProxy.CCSGameRules.m_iFreezeTime": 0,
                            "CCSGameRulesProxy.CCSGameRules.m_flCTTimeOutRemaining": 0,
                            "CCSGameRulesProxy.CCSGameRules.m_flTerroristTimeOutRemaining": 0,
                        }
                        for tick in ticks
                    ]
                )

        parser = FakeParser()
        rules = engine.build_export_clock_rules_by_tick(
            parser,
            [
                {"start_tick": 0, "end_tick": 2},
                {"start_tick": 4, "end_tick": 5},
            ],
            source_tickrate=16,
            frame_step=1,
        )

        self.assertEqual(parser.calls, [[0, 2, 4, 8, 10]])
        self.assertEqual(sorted(rules.keys()), [0, 1, 2, 4, 5])


if __name__ == "__main__":
    unittest.main()
