import sys
import json
import re
import math
import os
import csv
import tempfile
from demoparser2 import DemoParser

DEFAULT_TICKRATE = 64.0
FIXED_TICKRATE = 8.0
TEAM_NUM_T = 2
TEAM_NUM_CT = 3
GRENADE_EVENT_DEFINITIONS = (
    ("smokegrenade_detonate", "smoke_start", "smoke"),
    ("smokegrenade_expired", "smoke_end", "smoke"),
    ("hegrenade_detonate", "he_explode", "he"),
    ("flashbang_detonate", "flash_explode", "flash"),
    ("inferno_startburn", "inferno_start", "inferno"),
    ("inferno_expire", "inferno_end", "inferno"),
)
BOMB_EVENT_DEFINITIONS = (
    ("bomb_planted", "bomb_planted"),
    ("bomb_defused", "bomb_defused"),
    ("bomb_exploded", "bomb_exploded"),
)

CSV_PLAYERS_FILE = "player_positions.csv"
CSV_KILLS_FILE = "kills.csv"
CSV_SHOTS_FILE = "shots.csv"
CSV_BLINDS_FILE = "blinds.csv"
CSV_DAMAGES_FILE = "damages.csv"
CSV_GRENADES_FILE = "grenades.csv"
CSV_GRENADE_EVENTS_FILE = "grenade_events.csv"
CSV_BOMB_EVENTS_FILE = "bomb_events.csv"
CSV_ROUND_META_FILE = "round_meta.csv"
CSV_CLOCK_STATES_FILE = "clock_states.csv"

DEFAULT_GAME_ROUND_SECONDS = 115.0
DEFAULT_BOMB_COUNTDOWN_SECONDS = 40.0
DEFAULT_TIMEOUT_COUNTDOWN_SECONDS = 30.0

ROUND_CLOCK_LABELS = {
    "round": "Round",
    "bomb": "Bomb",
    "timeout_t": "T Timeout",
    "timeout_ct": "CT Timeout",
    "technical_pause": "Tech Pause",
    "pause": "Paused",
    "freeze": "Freeze",
}

ROUND_CLOCK_PROPS = [
    "CCSGameRulesProxy.CCSGameRules.m_bFreezePeriod",
    "CCSGameRulesProxy.CCSGameRules.m_bGamePaused",
    "CCSGameRulesProxy.CCSGameRules.m_bCTTimeOutActive",
    "CCSGameRulesProxy.CCSGameRules.m_bTerroristTimeOutActive",
    "CCSGameRulesProxy.CCSGameRules.m_bTechnicalTimeOut",
    "CCSGameRulesProxy.CCSGameRules.m_bMatchWaitingForResume",
    "CCSGameRulesProxy.CCSGameRules.m_bBombPlanted",
    "CCSGameRulesProxy.CCSGameRules.m_iRoundTime",
    "CCSGameRulesProxy.CCSGameRules.m_iFreezeTime",
    "CCSGameRulesProxy.CCSGameRules.m_flCTTimeOutRemaining",
    "CCSGameRulesProxy.CCSGameRules.m_flTerroristTimeOutRemaining",
]


def normalize_map_name(raw_map_name):
    if not isinstance(raw_map_name, str):
        return "Unknown"

    map_name = raw_map_name.strip()
    if not map_name:
        return "Unknown"

    map_name = map_name.replace("_scrimmagemap", "")
    workshop_match = re.match(r"workshop/\d+/(?P<map_name>.*)", map_name)
    if workshop_match:
        map_name = workshop_match.group("map_name") or map_name

    return map_name


def parse_event_dataframe(parser, event_name):
    try:
        events = parser.parse_events([event_name])
    except Exception:
        try:
            events = parser.parse_events(event_name)
        except Exception:
            return None

    if events is None:
        return None

    if hasattr(events, "empty") and hasattr(events, "columns"):
        return events

    if not isinstance(events, list) or len(events) == 0:
        return None

    events_df = None
    for event_tuple in events:
        if isinstance(event_tuple, tuple) and len(event_tuple) >= 2 and event_tuple[0] == event_name:
            events_df = event_tuple[1]
            break

    if events_df is None or events_df.empty:
        return None

    return events_df


def parse_event_ticks(parser, event_name):
    events_df = parse_event_dataframe(parser, event_name)
    if events_df is None or "tick" not in events_df.columns:
        return []

    ticks = []
    for tick in events_df["tick"].dropna().tolist():
        tick_value = _to_int_or_none(tick)
        if tick_value is not None:
            ticks.append(tick_value)

    return sorted(set(ticks))


def resolve_tickrate(header):
    if not isinstance(header, dict):
        return DEFAULT_TICKRATE

    candidates = [
        ("playback_ticks", "playback_time"),
        ("playbackTicks", "playbackTime"),
        ("playbackticks", "playbacktime"),
    ]

    for ticks_key, time_key in candidates:
        ticks_value = _to_float_or_none(header.get(ticks_key))
        time_value = _to_float_or_none(header.get(time_key))
        if ticks_value and time_value and ticks_value > 0 and time_value > 0:
            return ticks_value / time_value

    return DEFAULT_TICKRATE


def get_tick_scale(source_tickrate):
    parsed_tickrate = _to_float_or_none(source_tickrate)
    safe_source_tickrate = parsed_tickrate if parsed_tickrate and parsed_tickrate > 0 else DEFAULT_TICKRATE
    return max(safe_source_tickrate / FIXED_TICKRATE, 0.0001)


def raw_tick_to_fixed(raw_tick, source_tickrate):
    return int(round(float(raw_tick) / get_tick_scale(source_tickrate)))


def fixed_tick_to_raw(fixed_tick, source_tickrate):
    return int(round(float(fixed_tick) * get_tick_scale(source_tickrate)))


def fixed_step_to_raw_step(frame_step, source_tickrate):
    safe_step = max(1, int(frame_step))
    return max(1, int(round(float(safe_step) * get_tick_scale(source_tickrate))))


def get_round_start_ticks(parser):
    round_start_ticks = parse_event_ticks(parser, "round_freeze_end")
    if not round_start_ticks:
        round_start_ticks = parse_event_ticks(parser, "round_start")

    return sorted(set(round_start_ticks))


def compute_round_end_tick(start_tick, next_start_tick, round_end_ticks):
    if next_start_tick is None:
        candidate_end_ticks = [tick for tick in round_end_ticks if tick >= start_tick]
        return max(candidate_end_ticks) if candidate_end_ticks else start_tick

    candidate_end_ticks = [tick for tick in round_end_ticks if start_tick <= tick < next_start_tick]
    if candidate_end_ticks:
        return max(candidate_end_ticks)

    return next_start_tick - 1


def parse_round_economy_dataframe(parser, round_start_ticks):
    if not round_start_ticks:
        return None

    tick_props_candidates = [
        ["team_num", "current_equip_value", "round_start_equip_value", "balance"],
        ["team_num", "current_equip_value", "balance"],
        ["team_num", "round_start_equip_value", "balance"],
        ["team_num", "balance"],
    ]
    for tick_props in tick_props_candidates:
        try:
            return parser.parse_ticks(tick_props, ticks=round_start_ticks)
        except Exception:
            continue

    return None


def classify_round_economy(round_number, average_equip_value):
    if round_number in (1, 13):
        return "pistol"

    if average_equip_value < 1000:
        return "eco"

    if average_equip_value < 2400:
        return "force"

    return "rifle"


def update_team_economy_stats(stats, row):
    tick = _to_int_or_none(row.get("tick"))
    team_num = _to_int_or_none(row.get("team_num"))
    if tick is None or team_num not in (TEAM_NUM_T, TEAM_NUM_CT):
        return

    key = (tick, team_num)
    if key not in stats:
        stats[key] = {
            "count": 0,
            "current_equip_total": 0.0,
            "current_equip_count": 0,
            "round_start_equip_total": 0.0,
            "round_start_equip_count": 0,
            "balance_total": 0.0,
        }

    stat = stats[key]
    stat["count"] += 1

    current_equip_value = _to_float_or_none(row.get("current_equip_value"))
    if current_equip_value is not None and current_equip_value >= 0:
        stat["current_equip_total"] += current_equip_value
        stat["current_equip_count"] += 1

    round_start_equip_value = _to_float_or_none(row.get("round_start_equip_value"))
    if round_start_equip_value is not None and round_start_equip_value >= 0:
        stat["round_start_equip_total"] += round_start_equip_value
        stat["round_start_equip_count"] += 1

    balance_value = _to_float_or_none(row.get("balance"))
    if balance_value is not None and balance_value >= 0:
        stat["balance_total"] += balance_value


def resolve_team_economy_stat(stats, tick, team_num):
    stat = stats.get((tick, team_num))
    if not stat:
        return 0, 0

    if stat["current_equip_count"] > 0:
        total = stat["current_equip_total"]
        count = stat["current_equip_count"]
    elif stat["round_start_equip_count"] > 0:
        total = stat["round_start_equip_total"]
        count = stat["round_start_equip_count"]
    else:
        total = stat["balance_total"]
        count = stat["count"]

    return int(round(max(total, 0))), max(count, 0)


def build_round_economy_by_start_tick(parser, round_start_ticks):
    economy_df = parse_round_economy_dataframe(parser, round_start_ticks)
    if economy_df is None or economy_df.empty:
        return {}

    stats = {}
    for row in economy_df.to_dict(orient="records"):
        update_team_economy_stats(stats, row)

    economy_by_tick = {}
    for index, start_tick in enumerate(round_start_ticks):
        round_number = index + 1
        ct_total, ct_count = resolve_team_economy_stat(stats, start_tick, TEAM_NUM_CT)
        t_total, t_count = resolve_team_economy_stat(stats, start_tick, TEAM_NUM_T)
        ct_average = (ct_total / ct_count) if ct_count > 0 else 0
        t_average = (t_total / t_count) if t_count > 0 else 0
        economy_by_tick[start_tick] = {
            "ct_equip_value": ct_total,
            "t_equip_value": t_total,
            "ct_economy": classify_round_economy(round_number, ct_average),
            "t_economy": classify_round_economy(round_number, t_average),
        }

    return economy_by_tick


def normalize_round_winner(value):
    text = _to_string_or_default(value, "").strip().upper()
    if text in ("CT", "COUNTERTERRORIST", "COUNTER_TERRORIST", "COUNTER-TERRORIST"):
        return "CT"
    if text in ("T", "TERRORIST"):
        return "T"

    numeric_value = _to_int_or_none(value)
    if numeric_value == TEAM_NUM_CT:
        return "CT"
    if numeric_value == TEAM_NUM_T:
        return "T"

    return ""


def build_round_outcome_by_start_tick(parser, round_start_ticks):
    round_end_df = parse_event_dataframe(parser, "round_end")
    if round_end_df is None or round_end_df.empty:
        return {}

    round_end_rows = []
    for row in round_end_df.to_dict(orient="records"):
        tick = _to_int_or_none(row.get("tick"))
        if tick is None or tick < 0:
            continue

        round_end_rows.append(
            {
                "tick": tick,
                "winner_team": normalize_round_winner(row.get("winner")),
                "winner_reason": _to_string_or_default(row.get("reason"), ""),
            }
        )

    if not round_end_rows:
        return {}

    round_end_rows.sort(key=lambda row: row["tick"])
    outcomes_by_tick = {}
    for index, start_tick in enumerate(round_start_ticks):
        next_start_tick = round_start_ticks[index + 1] if index + 1 < len(round_start_ticks) else None
        candidates = [
            row
            for row in round_end_rows
            if row["tick"] >= start_tick and (next_start_tick is None or row["tick"] < next_start_tick)
        ]
        if not candidates:
            continue

        best = candidates[-1]
        outcomes_by_tick[start_tick] = {
            "winner_team": best["winner_team"],
            "winner_reason": best["winner_reason"],
        }

    return outcomes_by_tick


def build_round_record(index, start_tick, end_tick, first_round_start_tick, source_tickrate, economy_meta=None, outcome_meta=None):
    fixed_start_tick = raw_tick_to_fixed(start_tick, source_tickrate)
    fixed_end_tick = raw_tick_to_fixed(end_tick, source_tickrate)
    fixed_first_round_start_tick = raw_tick_to_fixed(first_round_start_tick, source_tickrate)
    record = {
        "number": index + 1,
        "raw_start_tick": int(start_tick),
        "raw_end_tick": int(end_tick),
        "start_tick": int(fixed_start_tick),
        "end_tick": int(fixed_end_tick),
        "start_seconds": round(max(float(fixed_start_tick - fixed_first_round_start_tick), 0.0) / FIXED_TICKRATE, 3),
        "end_seconds": round(max(float(fixed_end_tick - fixed_first_round_start_tick), 0.0) / FIXED_TICKRATE, 3),
        "duration_seconds": round(max(float(fixed_end_tick - fixed_start_tick), 0.0) / FIXED_TICKRATE, 3),
    }
    if isinstance(economy_meta, dict):
        record["ct_economy"] = str(economy_meta.get("ct_economy") or "unknown")
        record["t_economy"] = str(economy_meta.get("t_economy") or "unknown")
        record["ct_equip_value"] = int(_to_float_or_none(economy_meta.get("ct_equip_value")) or 0)
        record["t_equip_value"] = int(_to_float_or_none(economy_meta.get("t_equip_value")) or 0)
    if isinstance(outcome_meta, dict):
        record["winner_team"] = normalize_round_winner(outcome_meta.get("winner_team"))
        record["winner_reason"] = _to_string_or_default(outcome_meta.get("winner_reason"), "")

    return record


def build_rounds(parser, source_tickrate):
    round_start_ticks = get_round_start_ticks(parser)
    if not round_start_ticks:
        return []

    round_end_ticks = parse_event_ticks(parser, "round_end")
    first_round_start_tick = round_start_ticks[0]
    round_economy = build_round_economy_by_start_tick(parser, round_start_ticks)
    round_outcomes = build_round_outcome_by_start_tick(parser, round_start_ticks)
    rounds = []

    for index, start_tick in enumerate(round_start_ticks):
        next_start_tick = round_start_ticks[index + 1] if index + 1 < len(round_start_ticks) else None
        end_tick = compute_round_end_tick(start_tick, next_start_tick, round_end_ticks)
        rounds.append(
            build_round_record(
                index,
                start_tick,
                end_tick,
                first_round_start_tick,
                source_tickrate,
                round_economy.get(start_tick),
                round_outcomes.get(start_tick),
            )
        )

    return rounds


def _is_finite_number(value):
    number = _to_float_or_none(value)
    return number is not None and math.isfinite(number)


def _to_int_or_none(value):
    try:
        return int(value)
    except Exception:
        return None


def _to_float_or_none(value):
    try:
        number = float(value)
        if not math.isfinite(number):
            return None
        return number
    except Exception:
        return None


def _to_string_or_default(value, default=""):
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else default

    parsed_number = _to_float_or_none(value)
    if parsed_number is None:
        return default

    return str(parsed_number)


def _to_bool(value):
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return False

    try:
        return int(value) != 0
    except Exception:
        pass

    normalized = str(value).strip().lower()
    if normalized in ("true", "yes", "y"):
        return True
    if normalized in ("false", "no", "n"):
        return False
    return bool(value)


def _to_non_negative_seconds(value, fallback=0.0):
    number = _to_float_or_none(value)
    if number is None or number < 0:
        return float(fallback)
    return float(number)


def build_round_clock_label(phase):
    return ROUND_CLOCK_LABELS.get(phase, ROUND_CLOCK_LABELS["round"])


def parse_round_clock_dataframe(parser, raw_ticks):
    safe_ticks = sorted(
        {
            int(tick)
            for tick in raw_ticks
            if tick is not None and _to_int_or_none(tick) is not None
        }
    )
    if not safe_ticks:
        return None

    try:
        return parser.parse_ticks(ROUND_CLOCK_PROPS, ticks=safe_ticks)
    except Exception:
        return None


def build_round_clock_rules_by_tick(clock_df, source_tickrate):
    if clock_df is None or clock_df.empty:
        return {}

    rules_by_tick = {}
    for row in clock_df.to_dict(orient="records"):
        raw_tick = _to_int_or_none(row.get("tick"))
        if raw_tick is None:
            continue

        fixed_tick = raw_tick_to_fixed(raw_tick, source_tickrate)
        if fixed_tick in rules_by_tick:
            continue

        rules_by_tick[fixed_tick] = {
            "freeze_period": _to_bool(row.get("CCSGameRulesProxy.CCSGameRules.m_bFreezePeriod")),
            "game_paused": _to_bool(row.get("CCSGameRulesProxy.CCSGameRules.m_bGamePaused")),
            "ct_timeout_active": _to_bool(row.get("CCSGameRulesProxy.CCSGameRules.m_bCTTimeOutActive")),
            "t_timeout_active": _to_bool(row.get("CCSGameRulesProxy.CCSGameRules.m_bTerroristTimeOutActive")),
            "technical_timeout": _to_bool(row.get("CCSGameRulesProxy.CCSGameRules.m_bTechnicalTimeOut")),
            "waiting_for_resume": _to_bool(row.get("CCSGameRulesProxy.CCSGameRules.m_bMatchWaitingForResume")),
            "bomb_planted": _to_bool(row.get("CCSGameRulesProxy.CCSGameRules.m_bBombPlanted")),
            "round_time_seconds": _to_non_negative_seconds(
                row.get("CCSGameRulesProxy.CCSGameRules.m_iRoundTime"),
                DEFAULT_GAME_ROUND_SECONDS,
            ),
            "freeze_time_seconds": _to_non_negative_seconds(
                row.get("CCSGameRulesProxy.CCSGameRules.m_iFreezeTime"),
                0.0,
            ),
            "ct_timeout_remaining_seconds": _to_non_negative_seconds(
                row.get("CCSGameRulesProxy.CCSGameRules.m_flCTTimeOutRemaining"),
                0.0,
            ),
            "t_timeout_remaining_seconds": _to_non_negative_seconds(
                row.get("CCSGameRulesProxy.CCSGameRules.m_flTerroristTimeOutRemaining"),
                0.0,
            ),
        }

    return rules_by_tick


def build_round_clock_state_entry(phase, remaining_seconds, total_seconds, is_paused):
    return {
        "phase": str(phase or "round"),
        "label": build_round_clock_label(phase),
        "remaining_seconds": round(max(float(remaining_seconds or 0.0), 0.0), 3),
        "total_seconds": round(max(float(total_seconds or 0.0), 0.0), 3),
        "is_paused": bool(is_paused),
    }


def build_round_clock_states(
    parser,
    start_tick,
    end_tick,
    source_tickrate,
    bomb_planted_tick=None,
    bomb_defused_tick=None,
    bomb_exploded_tick=None,
    frame_step=1,
):
    fixed_ticks = []
    safe_frame_step = max(1, int(frame_step))
    for tick_value in range(int(start_tick), int(end_tick) + 1, safe_frame_step):
        fixed_ticks.append(int(tick_value))
    if not fixed_ticks or fixed_ticks[-1] != int(end_tick):
        fixed_ticks.append(int(end_tick))

    raw_ticks = [fixed_tick_to_raw(tick_value, source_tickrate) for tick_value in fixed_ticks]
    rules_by_tick = build_round_clock_rules_by_tick(
        parse_round_clock_dataframe(parser, raw_ticks),
        source_tickrate,
    )

    states_by_tick = {}
    previous_tick = None
    previous_pause_active = False
    previous_bomb_active = False
    previous_pause_phase = None
    round_elapsed_seconds = 0.0
    bomb_elapsed_seconds = 0.0
    ct_timeout_total_seconds = DEFAULT_TIMEOUT_COUNTDOWN_SECONDS
    t_timeout_total_seconds = DEFAULT_TIMEOUT_COUNTDOWN_SECONDS

    planted_tick = _to_int_or_none(bomb_planted_tick)
    defused_tick = _to_int_or_none(bomb_defused_tick)
    exploded_tick = _to_int_or_none(bomb_exploded_tick)

    for tick_value in fixed_ticks:
        if previous_tick is not None:
            elapsed_ticks = max(int(tick_value) - int(previous_tick), 0)
            elapsed_seconds = float(elapsed_ticks) / FIXED_TICKRATE
            if not previous_pause_active:
                if previous_bomb_active:
                    bomb_elapsed_seconds += elapsed_seconds
                else:
                    round_elapsed_seconds += elapsed_seconds

        rules = rules_by_tick.get(int(tick_value), {})
        round_total_seconds = _to_non_negative_seconds(
            rules.get("round_time_seconds"),
            DEFAULT_GAME_ROUND_SECONDS,
        )
        ct_timeout_remaining_seconds = _to_non_negative_seconds(
            rules.get("ct_timeout_remaining_seconds"),
            0.0,
        )
        t_timeout_remaining_seconds = _to_non_negative_seconds(
            rules.get("t_timeout_remaining_seconds"),
            0.0,
        )
        if rules.get("ct_timeout_active") and ct_timeout_remaining_seconds > 0:
            ct_timeout_total_seconds = max(ct_timeout_total_seconds, ct_timeout_remaining_seconds)
        if rules.get("t_timeout_active") and t_timeout_remaining_seconds > 0:
            t_timeout_total_seconds = max(t_timeout_total_seconds, t_timeout_remaining_seconds)
        if planted_tick is None and rules.get("bomb_planted"):
            planted_tick = int(tick_value)

        bomb_resolved = (
            (defused_tick is not None and int(tick_value) >= defused_tick)
            or (exploded_tick is not None and int(tick_value) >= exploded_tick)
        )
        bomb_visible = planted_tick is not None and int(tick_value) >= planted_tick
        bomb_active = bomb_visible and not bomb_resolved

        if bomb_visible:
            base_phase = "bomb"
            base_total_seconds = DEFAULT_BOMB_COUNTDOWN_SECONDS
            base_remaining_seconds = 0.0 if bomb_resolved else max(
                DEFAULT_BOMB_COUNTDOWN_SECONDS - bomb_elapsed_seconds,
                0.0,
            )
        elif rules.get("freeze_period") and int(tick_value) <= int(start_tick):
            base_phase = "freeze"
            freeze_total_seconds = _to_non_negative_seconds(rules.get("freeze_time_seconds"), 0.0)
            base_total_seconds = freeze_total_seconds
            base_remaining_seconds = freeze_total_seconds
        else:
            base_phase = "round"
            base_total_seconds = round_total_seconds
            base_remaining_seconds = max(round_total_seconds - round_elapsed_seconds, 0.0)

        pause_phase = None
        remaining_seconds = base_remaining_seconds
        total_seconds = base_total_seconds
        if rules.get("ct_timeout_active"):
            pause_phase = "timeout_ct"
            previous_pause_phase = pause_phase
            remaining_seconds = ct_timeout_remaining_seconds
            total_seconds = max(ct_timeout_total_seconds, ct_timeout_remaining_seconds)
        elif rules.get("t_timeout_active"):
            pause_phase = "timeout_t"
            previous_pause_phase = pause_phase
            remaining_seconds = t_timeout_remaining_seconds
            total_seconds = max(t_timeout_total_seconds, t_timeout_remaining_seconds)
        elif rules.get("technical_timeout"):
            pause_phase = "technical_pause"
            previous_pause_phase = pause_phase
        elif rules.get("game_paused"):
            pause_phase = "pause"
            previous_pause_phase = pause_phase
        elif rules.get("waiting_for_resume"):
            pause_phase = previous_pause_phase or "pause"
            if pause_phase == "timeout_ct":
                remaining_seconds = ct_timeout_remaining_seconds
                total_seconds = max(ct_timeout_total_seconds, remaining_seconds)
            elif pause_phase == "timeout_t":
                remaining_seconds = t_timeout_remaining_seconds
                total_seconds = max(t_timeout_total_seconds, remaining_seconds)
        else:
            previous_pause_phase = None

        phase = pause_phase or base_phase
        states_by_tick[int(tick_value)] = build_round_clock_state_entry(
            phase,
            remaining_seconds,
            total_seconds,
            pause_phase is not None,
        )

        previous_tick = int(tick_value)
        previous_pause_active = pause_phase is not None
        previous_bomb_active = bomb_active

    return states_by_tick


def _sanitize_json_value(value):
    if isinstance(value, dict):
        return {key: _sanitize_json_value(item) for key, item in value.items()}

    if isinstance(value, list):
        return [_sanitize_json_value(item) for item in value]

    if isinstance(value, float):
        return value if math.isfinite(value) else None

    return value


def _dumps_json_safe(payload):
    sanitized = _sanitize_json_value(payload)
    return json.dumps(sanitized, allow_nan=False)


def _find_column(columns, candidates):
    for candidate in candidates:
        if candidate in columns:
            return candidate
    return None


def _pick_first_value(row, candidates):
    if not isinstance(row, dict):
        return None

    for candidate in candidates:
        if candidate in row and row.get(candidate) is not None:
            return row.get(candidate)

    return None


def parse_grenades_dataframe(parser):
    parse_attempts = [
        lambda: parser.parse_grenades(grenades=True),
        lambda: parser.parse_grenades(),
    ]
    for parse_attempt in parse_attempts:
        try:
            grenades_df = parse_attempt()
        except Exception:
            continue

        if grenades_df is not None and not grenades_df.empty:
            return grenades_df

    return None


def build_thrower_team_resolver(players_by_tick):
    tick_to_name_team = {}
    tick_to_steam_team = {}
    latest_name_team = {}
    latest_steam_team = {}

    for tick in sorted(players_by_tick.keys()):
        players = players_by_tick.get(tick) or []
        name_map = {}
        steam_map = {}
        for player in players:
            team_num = _to_int_or_none(player.get("team_num"))
            if team_num not in (TEAM_NUM_T, TEAM_NUM_CT):
                continue

            player_name = _to_string_or_default(player.get("name"), "")
            if player_name:
                name_map[player_name] = team_num
                latest_name_team[player_name] = team_num

            steamid_text = _to_string_or_default(player.get("steamid"), "")
            if steamid_text:
                steam_map[steamid_text] = team_num
                latest_steam_team[steamid_text] = team_num

        tick_to_name_team[tick] = name_map
        tick_to_steam_team[tick] = steam_map

    def resolve_team_num(tick_value, thrower_name="", thrower_steamid=""):
        tick_name_map = tick_to_name_team.get(tick_value, {})
        tick_steam_map = tick_to_steam_team.get(tick_value, {})
        if thrower_steamid and thrower_steamid in tick_steam_map:
            return tick_steam_map[thrower_steamid]
        if thrower_name and thrower_name in tick_name_map:
            return tick_name_map[thrower_name]
        if thrower_steamid and thrower_steamid in latest_steam_team:
            return latest_steam_team[thrower_steamid]
        if thrower_name and thrower_name in latest_name_team:
            return latest_name_team[thrower_name]
        return None

    return resolve_team_num


def resolve_thrower_team_num(row, column_map, tick_value, team_resolver=None):
    team_column = column_map.get("thrower_team_num")
    team_num = _to_int_or_none(row.get(team_column)) if team_column is not None else None
    if team_num in (TEAM_NUM_T, TEAM_NUM_CT):
        return team_num

    thrower_name_column = column_map.get("thrower_name")
    thrower_steamid_column = column_map.get("thrower_steamid")
    thrower_name = _to_string_or_default(row.get(thrower_name_column), "") if thrower_name_column is not None else ""
    thrower_steamid = (
        _to_string_or_default(row.get(thrower_steamid_column), "") if thrower_steamid_column is not None else ""
    )

    if callable(team_resolver):
        resolved = team_resolver(tick_value, thrower_name, thrower_steamid)
        if resolved in (TEAM_NUM_T, TEAM_NUM_CT):
            return resolved

    return None


def tick_matches_range(tick_value, start_tick=None, end_tick=None):
    if tick_value is None:
        return False

    if start_tick is not None and tick_value < start_tick:
        return False

    if end_tick is not None and tick_value > end_tick:
        return False

    return True


def resolve_grenade_columns(columns):
    return {
        "tick": _find_column(columns, ["tick", "Tick"]),
        "x": _find_column(columns, ["x", "X"]),
        "y": _find_column(columns, ["y", "Y"]),
        "z": _find_column(columns, ["z", "Z"]),
        "entity_id": _find_column(columns, ["grenade_entity_id", "projectile_id", "entityid", "entity_id"]),
        "grenade_type": _find_column(columns, ["grenade_type", "grenade_name", "weapon"]),
        "thrower_name": _find_column(columns, ["name", "user_name", "thrower_name"]),
        "thrower_steamid": _find_column(columns, ["steamid", "user_steamid", "thrower_steamid"]),
        "thrower_team_num": _find_column(columns, ["thrower_team_num", "user_team_num", "team_num", "side"]),
    }


def has_required_grenade_columns(column_map):
    required_keys = ["tick", "x", "y", "z", "entity_id", "grenade_type"]
    return all(column_map.get(key) is not None for key in required_keys)


def select_grenade_rows(grenades_df, column_map, start_tick=None, end_tick=None):
    selected_columns = [
        column_map["tick"],
        column_map["x"],
        column_map["y"],
        column_map["z"],
        column_map["entity_id"],
        column_map["grenade_type"],
    ]

    for optional_key in ["thrower_name", "thrower_steamid", "thrower_team_num"]:
        column_name = column_map.get(optional_key)
        if column_name is not None:
            selected_columns.append(column_name)

    filtered_df = grenades_df[selected_columns]
    tick_column = column_map["tick"]
    if start_tick is not None:
        filtered_df = filtered_df[filtered_df[tick_column] >= start_tick]
    if end_tick is not None:
        filtered_df = filtered_df[filtered_df[tick_column] <= end_tick]
    return filtered_df


def build_grenade_entry(row, column_map, team_resolver=None):
    tick_value = _to_int_or_none(row.get(column_map["tick"]))
    entity_id_value = _to_int_or_none(row.get(column_map["entity_id"]))
    x_value = _to_float_or_none(row.get(column_map["x"]))
    y_value = _to_float_or_none(row.get(column_map["y"]))
    z_value = _to_float_or_none(row.get(column_map["z"]))

    if tick_value is None or entity_id_value is None:
        return None

    if not (_is_finite_number(x_value) and _is_finite_number(y_value) and _is_finite_number(z_value)):
        return None

    entry = {
        "entity_id": entity_id_value,
        "grenade_type": str(row.get(column_map["grenade_type"]) or "Unknown"),
        "x": x_value,
        "y": y_value,
        "z": z_value,
    }

    attach_thrower_fields(entry, row, column_map, tick_value, team_resolver)
    return tick_value, entity_id_value, entry


def attach_thrower_fields(entry, row, column_map, tick_value, team_resolver=None):
    thrower_name_column = column_map.get("thrower_name")
    if thrower_name_column is not None:
        thrower_name = row.get(thrower_name_column)
        if isinstance(thrower_name, str) and thrower_name.strip():
            entry["thrower_name"] = thrower_name

    thrower_steamid_column = column_map.get("thrower_steamid")
    if thrower_steamid_column is not None:
        thrower_steamid = row.get(thrower_steamid_column)
        if thrower_steamid is not None:
            entry["thrower_steamid"] = str(thrower_steamid)

    thrower_team_num = resolve_thrower_team_num(row, column_map, tick_value, team_resolver)
    if thrower_team_num in (TEAM_NUM_T, TEAM_NUM_CT):
        entry["thrower_team_num"] = thrower_team_num


def build_grenades_by_tick_from_dataframe(grenades_df, start_tick=None, end_tick=None, team_resolver=None):
    if grenades_df is None:
        return {}

    column_map = resolve_grenade_columns(list(grenades_df.columns))
    if not has_required_grenade_columns(column_map):
        return {}

    filtered_df = select_grenade_rows(grenades_df, column_map, start_tick, end_tick)
    grenades_by_tick = {}
    seen_tick_entity = set()

    for row in filtered_df.to_dict(orient="records"):
        parsed_entry = build_grenade_entry(row, column_map, team_resolver)
        if parsed_entry is None:
            continue

        tick_value, entity_id_value, grenade_entry = parsed_entry
        dedupe_key = (tick_value, entity_id_value)
        if dedupe_key in seen_tick_entity:
            continue

        seen_tick_entity.add(dedupe_key)
        grenades_by_tick.setdefault(tick_value, []).append(grenade_entry)

    return grenades_by_tick


def build_round_grenades_by_tick(parser, start_tick, end_tick, team_resolver=None):
    grenades_df = parse_grenades_dataframe(parser)
    return build_grenades_by_tick_from_dataframe(grenades_df, start_tick, end_tick, team_resolver)


def resolve_grenade_event_columns(columns):
    return {
        "tick": _find_column(columns, ["tick", "Tick"]),
        "x": _find_column(columns, ["x", "X"]),
        "y": _find_column(columns, ["y", "Y"]),
        "z": _find_column(columns, ["z", "Z"]),
        "entity_id": _find_column(columns, ["projectileid", "projectile_id", "entityid", "entity_id"]),
        "grenade_type": _find_column(columns, ["grenade_type", "grenade_name", "weapon"]),
        "thrower_name": _find_column(columns, ["user_name", "thrower_name", "name"]),
        "thrower_steamid": _find_column(columns, ["user_steamid", "thrower_steamid", "steamid"]),
        "thrower_team_num": _find_column(columns, ["user_team_num", "thrower_team_num", "team_num", "side"]),
    }


def select_grenade_event_rows(events_df, column_map, start_tick=None, end_tick=None):
    tick_column = column_map.get("tick")
    if tick_column is None:
        return None

    selected_columns = [tick_column]
    for optional_key in [
        "x",
        "y",
        "z",
        "entity_id",
        "grenade_type",
        "thrower_name",
        "thrower_steamid",
        "thrower_team_num",
    ]:
        column_name = column_map.get(optional_key)
        if column_name is not None:
            selected_columns.append(column_name)

    filtered_df = events_df[selected_columns]
    if start_tick is not None:
        filtered_df = filtered_df[filtered_df[tick_column] >= start_tick]
    if end_tick is not None:
        filtered_df = filtered_df[filtered_df[tick_column] <= end_tick]
    return filtered_df


def build_grenade_event_entry(row, event_type, default_grenade_type, column_map, team_resolver=None):
    tick_column = column_map.get("tick")
    tick_value = _to_int_or_none(row.get(tick_column)) if tick_column is not None else None
    if tick_value is None:
        return None

    entity_column = column_map.get("entity_id")
    entity_value = _to_int_or_none(row.get(entity_column)) if entity_column is not None else None
    grenade_type_column = column_map.get("grenade_type")
    grenade_type_value = (
        _to_string_or_default(row.get(grenade_type_column), default_grenade_type) if grenade_type_column is not None else default_grenade_type
    )
    grenade_type_value = grenade_type_value or default_grenade_type

    event_entry = {
        "event_type": event_type,
        "grenade_type": grenade_type_value,
        "tick": tick_value,
    }
    if entity_value is not None:
        event_entry["entity_id"] = entity_value
        event_entry["projectile_id"] = entity_value

    for axis in ["x", "y", "z"]:
        axis_column = column_map.get(axis)
        if axis_column is None:
            continue
        axis_value = _to_float_or_none(row.get(axis_column))
        if axis_value is not None and math.isfinite(axis_value):
            event_entry[axis] = axis_value

    thrower_name_column = column_map.get("thrower_name")
    if thrower_name_column is not None:
        thrower_name = _to_string_or_default(row.get(thrower_name_column), "")
        if thrower_name:
            event_entry["thrower_name"] = thrower_name

    thrower_steamid_column = column_map.get("thrower_steamid")
    if thrower_steamid_column is not None:
        thrower_steamid = _to_string_or_default(row.get(thrower_steamid_column), "")
        if thrower_steamid:
            event_entry["thrower_steamid"] = thrower_steamid

    thrower_team_num = resolve_thrower_team_num(row, column_map, tick_value, team_resolver)
    if thrower_team_num in (TEAM_NUM_T, TEAM_NUM_CT):
        event_entry["thrower_team_num"] = thrower_team_num

    return tick_value, event_entry


def build_grenade_events_by_tick_from_dataframes(event_dataframes, start_tick=None, end_tick=None, team_resolver=None):
    events_by_tick = {}
    seen_event_keys = set()
    for event_type, default_grenade_type, events_df in event_dataframes:
        if events_df is None or events_df.empty:
            continue

        column_map = resolve_grenade_event_columns(list(events_df.columns))
        filtered_df = select_grenade_event_rows(events_df, column_map, start_tick, end_tick)
        if filtered_df is None or filtered_df.empty:
            continue

        for row in filtered_df.to_dict(orient="records"):
            parsed_event = build_grenade_event_entry(row, event_type, default_grenade_type, column_map, team_resolver)
            if parsed_event is None:
                continue

            tick_value, event_entry = parsed_event
            event_entity = event_entry.get("entity_id")
            event_key = (tick_value, event_type, event_entity)
            if event_key in seen_event_keys:
                continue
            seen_event_keys.add(event_key)
            events_by_tick.setdefault(tick_value, []).append(event_entry)

    return events_by_tick


def build_round_grenade_events_by_tick(parser, start_tick, end_tick, team_resolver=None):
    event_dataframes = []
    for event_name, event_type, default_grenade_type in GRENADE_EVENT_DEFINITIONS:
        event_dataframes.append(
            (event_type, default_grenade_type, parse_event_dataframe(parser, event_name))
        )
    return build_grenade_events_by_tick_from_dataframes(
        event_dataframes,
        start_tick,
        end_tick,
        team_resolver,
    )


def build_round_bomb_events_by_tick(parser, start_tick, end_tick):
    event_dataframes = []
    for event_name, event_type in BOMB_EVENT_DEFINITIONS:
        event_dataframes.append((event_type, parse_event_dataframe(parser, event_name)))
    return build_bomb_events_by_tick_from_dataframes(event_dataframes, start_tick, end_tick)


def build_bomb_events_by_tick_from_dataframes(event_dataframes, start_tick=None, end_tick=None):
    events_by_tick = {}
    seen_event_keys = set()
    for event_type, events_df in event_dataframes:
        if events_df is None or events_df.empty or "tick" not in list(events_df.columns):
            continue

        selected_columns = ["tick"]
        for optional_column in ["site", "user_name", "user_steamid", "user_team_num", "team_num"]:
            if optional_column in events_df.columns:
                selected_columns.append(optional_column)

        filtered_df = events_df[selected_columns]
        if start_tick is not None:
            filtered_df = filtered_df[filtered_df["tick"] >= start_tick]
        if end_tick is not None:
            filtered_df = filtered_df[filtered_df["tick"] <= end_tick]
        if filtered_df.empty:
            continue

        for row in filtered_df.to_dict(orient="records"):
            tick_value = _to_int_or_none(row.get("tick"))
            if tick_value is None:
                continue

            event_key = (tick_value, event_type)
            if event_key in seen_event_keys:
                continue
            seen_event_keys.add(event_key)

            event_entry = {"event_type": event_type, "tick": tick_value}
            if "site" in row:
                site_value = _to_int_or_none(row.get("site"))
                if site_value is not None:
                    event_entry["site"] = site_value
            if "user_name" in row:
                user_name = _to_string_or_default(row.get("user_name"), "")
                if user_name:
                    event_entry["user_name"] = user_name
            if "user_steamid" in row:
                steamid = _to_string_or_default(row.get("user_steamid"), "")
                if steamid:
                    event_entry["user_steamid"] = steamid
            if "user_team_num" in row:
                team_num = _to_int_or_none(row.get("user_team_num"))
                if team_num in (TEAM_NUM_T, TEAM_NUM_CT):
                    event_entry["team_num"] = team_num
            if "team_num" not in event_entry and "team_num" in row:
                team_num = _to_int_or_none(row.get("team_num"))
                if team_num in (TEAM_NUM_T, TEAM_NUM_CT):
                    event_entry["team_num"] = team_num

            events_by_tick.setdefault(tick_value, []).append(event_entry)

    return events_by_tick


def parse_tick_dataframe_for_ticks(parser, ticks):
    safe_ticks = sorted(
        {
            int(tick)
            for tick in ticks
            if tick is not None and _to_int_or_none(tick) is not None
        }
    )
    if not safe_ticks:
        raise ValueError("No ticks provided for tick parsing")

    tick_prop_sets = [
        [
            "X",
            "Y",
            "team_num",
            "is_alive",
            "yaw",
            "health",
            "balance",
            "user_id",
            "steamid",
            "name",
            "active_weapon_name",
            "weapon_name",
            "inventory",
        ],
        ["X", "Y", "team_num", "is_alive", "yaw", "health", "balance", "steamid", "name", "active_weapon_name", "weapon_name"],
        ["X", "Y", "team_num", "is_alive", "yaw", "health", "balance", "steamid", "name"],
        ["X", "Y", "team_num", "is_alive", "yaw", "health", "balance", "name"],
        ["X", "Y", "team_num", "is_alive", "yaw"],
    ]

    for tick_props in tick_prop_sets:
        try:
            return parser.parse_ticks(tick_props, ticks=safe_ticks)
        except Exception:
            continue

    raise RuntimeError("Unable to parse tick data for selected range")


def parse_tick_dataframe(parser, start_tick, end_tick, tick_step=1):
    safe_step = max(1, int(tick_step))
    tick_range = range(start_tick, end_tick + 1, safe_step)
    return parse_tick_dataframe_for_ticks(parser, tick_range)


def normalize_inventory_items(inventory_value):
    if inventory_value is None:
        return []

    if isinstance(inventory_value, (list, tuple, set)):
        items = []
        for item in inventory_value:
            label = _to_string_or_default(item, "")
            if label:
                items.append(label)
        return items

    if isinstance(inventory_value, str):
        raw_text = inventory_value.strip()
        if not raw_text:
            return []

        if raw_text.startswith("["):
            try:
                parsed = json.loads(raw_text)
                if isinstance(parsed, list):
                    return normalize_inventory_items(parsed)
            except Exception:
                pass

        return [raw_text]

    return []


def normalize_player_record(player):
    x_value = _to_float_or_none(player.get("X"))
    y_value = _to_float_or_none(player.get("Y"))
    if x_value is None or y_value is None:
        return False
    player["X"] = x_value
    player["Y"] = y_value

    yaw_value = _to_float_or_none(player.get("yaw"))
    player["yaw"] = yaw_value if yaw_value is not None else 0.0

    team_num = _to_int_or_none(player.get("team_num"))
    if team_num is not None:
        player["team_num"] = team_num

    player["name"] = _to_string_or_default(player.get("name"), "")

    if "active_weapon_name" not in player and "weapon_name" in player:
        player["active_weapon_name"] = player.get("weapon_name")
    player["active_weapon_name"] = _to_string_or_default(player.get("active_weapon_name"), "")
    player["weapon_name"] = _to_string_or_default(player.get("weapon_name"), player["active_weapon_name"])
    player["inventory"] = normalize_inventory_items(player.get("inventory"))

    if "user_id" in player:
        parsed_user_id = _to_int_or_none(player.get("user_id"))
        if parsed_user_id is not None:
            player["user_id"] = parsed_user_id
        else:
            player["user_id"] = 0

    if "steamid" in player:
        player["steamid"] = _to_string_or_default(player.get("steamid"), "")

    if "health" in player:
        parsed_health = _to_int_or_none(player.get("health"))
        if parsed_health is not None:
            player["health"] = max(0, parsed_health)
        else:
            player["health"] = 0
    else:
        player["health"] = 0

    if "balance" in player:
        parsed_balance = _to_int_or_none(player.get("balance"))
        if parsed_balance is not None:
            player["balance"] = max(0, parsed_balance)
        else:
            player["balance"] = 0
    else:
        player["balance"] = 0

    if "is_alive" in player:
        player["is_alive"] = bool(player.get("is_alive"))
    else:
        player["is_alive"] = False

    return True


def build_players_by_tick(players_df):
    if players_df.empty:
        return {}

    player_columns = ["X", "Y", "team_num", "yaw", "is_alive"]
    for optional_column in [
        "health",
        "balance",
        "user_id",
        "steamid",
        "name",
        "active_weapon_name",
        "weapon_name",
        "inventory",
    ]:
        if optional_column in players_df.columns:
            player_columns.append(optional_column)

    players_by_tick = {}
    grouped = players_df.groupby("tick", sort=True)
    for tick, tick_df in grouped:
        raw_players = tick_df[player_columns].to_dict(orient="records")
        normalized_players = []
        for player in raw_players:
            if normalize_player_record(player):
                normalized_players.append(player)
        players_by_tick[int(tick)] = normalized_players

    return players_by_tick


def compress_players_by_tick(players_by_tick, source_tickrate):
    fixed_players_by_tick = {}
    for raw_tick in sorted(players_by_tick.keys()):
        fixed_tick = raw_tick_to_fixed(raw_tick, source_tickrate)
        fixed_players_by_tick[fixed_tick] = players_by_tick.get(raw_tick) or []

    return fixed_players_by_tick


def compress_grenades_by_tick(grenades_by_tick, source_tickrate):
    fixed_grenades_by_tick = {}
    for raw_tick in sorted(grenades_by_tick.keys()):
        fixed_tick = raw_tick_to_fixed(raw_tick, source_tickrate)
        fixed_grenades_by_tick.setdefault(fixed_tick, [])
        fixed_grenades_by_tick[fixed_tick].extend(grenades_by_tick.get(raw_tick) or [])

    return fixed_grenades_by_tick


def compress_grenade_events_by_tick(events_by_tick, source_tickrate):
    fixed_events_by_tick = {}
    for raw_tick in sorted(events_by_tick.keys()):
        fixed_tick = raw_tick_to_fixed(raw_tick, source_tickrate)
        fixed_events_by_tick.setdefault(fixed_tick, [])
        for event in events_by_tick.get(raw_tick) or []:
            normalized_event = dict(event)
            normalized_event["tick"] = fixed_tick
            fixed_events_by_tick[fixed_tick].append(normalized_event)

    return fixed_events_by_tick


def compress_kills_by_tick(kills_by_tick, source_tickrate):
    fixed_kills_by_tick = {}
    for raw_tick in sorted(kills_by_tick.keys()):
        fixed_tick = raw_tick_to_fixed(raw_tick, source_tickrate)
        fixed_kills_by_tick.setdefault(fixed_tick, [])
        for kill in kills_by_tick.get(raw_tick) or []:
            normalized_kill = dict(kill)
            normalized_kill["tick"] = fixed_tick
            fixed_kills_by_tick[fixed_tick].append(normalized_kill)

    return fixed_kills_by_tick


def compress_shots_by_tick(shots_by_tick, source_tickrate):
    fixed_shots_by_tick = {}
    for raw_tick in sorted(shots_by_tick.keys()):
        fixed_tick = raw_tick_to_fixed(raw_tick, source_tickrate)
        fixed_shots_by_tick.setdefault(fixed_tick, [])
        for shot in shots_by_tick.get(raw_tick) or []:
            normalized_shot = dict(shot)
            normalized_shot["tick"] = fixed_tick
            fixed_shots_by_tick[fixed_tick].append(normalized_shot)

    return fixed_shots_by_tick


def compress_blinds_by_tick(blinds_by_tick, source_tickrate):
    fixed_blinds_by_tick = {}
    for raw_tick in sorted(blinds_by_tick.keys()):
        fixed_tick = raw_tick_to_fixed(raw_tick, source_tickrate)
        fixed_blinds_by_tick.setdefault(fixed_tick, [])
        for blind in blinds_by_tick.get(raw_tick) or []:
            normalized_blind = dict(blind)
            normalized_blind["tick"] = fixed_tick
            fixed_blinds_by_tick[fixed_tick].append(normalized_blind)

    return fixed_blinds_by_tick


def compress_damages_by_tick(damages_by_tick, source_tickrate):
    fixed_damages_by_tick = {}
    for raw_tick in sorted(damages_by_tick.keys()):
        fixed_tick = raw_tick_to_fixed(raw_tick, source_tickrate)
        fixed_damages_by_tick.setdefault(fixed_tick, [])
        for damage in damages_by_tick.get(raw_tick) or []:
            normalized_damage = dict(damage)
            normalized_damage["tick"] = fixed_tick
            fixed_damages_by_tick[fixed_tick].append(normalized_damage)

    return fixed_damages_by_tick


def compress_bomb_events_by_tick(events_by_tick, source_tickrate):
    fixed_events_by_tick = {}
    for raw_tick in sorted(events_by_tick.keys()):
        fixed_tick = raw_tick_to_fixed(raw_tick, source_tickrate)
        fixed_events_by_tick.setdefault(fixed_tick, [])
        for event in events_by_tick.get(raw_tick) or []:
            normalized_event = dict(event)
            normalized_event["tick"] = fixed_tick
            fixed_events_by_tick[fixed_tick].append(normalized_event)

    return fixed_events_by_tick


def build_frames_sequence(
    start_tick,
    end_tick,
    frame_step,
    players_by_tick,
    grenades_by_tick,
    grenade_events_by_tick,
    bomb_events_by_tick,
    kills_by_tick,
    shots_by_tick,
    blinds_by_tick,
    damages_by_tick,
    include_grenades,
    clock_states_by_tick=None,
):
    frames = []
    safe_frame_step = max(1, int(frame_step))
    for tick in range(start_tick, end_tick + 1, safe_frame_step):
        frame = {"tick": int(tick), "players": players_by_tick.get(int(tick), [])}
        frame["bomb_events"] = bomb_events_by_tick.get(int(tick), [])
        if include_grenades:
            frame["grenades"] = grenades_by_tick.get(int(tick), [])
            frame["grenade_events"] = grenade_events_by_tick.get(int(tick), [])
        frame["kills"] = kills_by_tick.get(int(tick), [])
        frame["shots"] = shots_by_tick.get(int(tick), [])
        frame["blinds"] = blinds_by_tick.get(int(tick), [])
        frame["damages"] = damages_by_tick.get(int(tick), [])
        if clock_states_by_tick and int(tick) in clock_states_by_tick:
            frame["clock"] = clock_states_by_tick[int(tick)]
        frames.append(frame)

    if frames and frames[-1]["tick"] != end_tick:
        frame = {
            "tick": int(end_tick),
            "players": players_by_tick.get(int(end_tick), []),
            "bomb_events": bomb_events_by_tick.get(int(end_tick), []),
            "kills": kills_by_tick.get(int(end_tick), []),
            "shots": shots_by_tick.get(int(end_tick), []),
            "blinds": blinds_by_tick.get(int(end_tick), []),
            "damages": damages_by_tick.get(int(end_tick), []),
        }
        if clock_states_by_tick and int(end_tick) in clock_states_by_tick:
            frame["clock"] = clock_states_by_tick[int(end_tick)]
        if include_grenades:
            frame["grenades"] = grenades_by_tick.get(int(end_tick), [])
            frame["grenade_events"] = grenade_events_by_tick.get(int(end_tick), [])
        frames.append(frame)

    return frames


def attach_clock_states_to_frames(frames, clock_states_by_tick):
    if not isinstance(clock_states_by_tick, dict) or not clock_states_by_tick:
        return frames

    for frame in frames:
        if not isinstance(frame, dict):
            continue
        tick_value = _to_int_or_none(frame.get("tick"))
        if tick_value is None:
            continue
        clock_state = clock_states_by_tick.get(int(tick_value))
        if clock_state is not None:
            frame["clock"] = clock_state

    return frames


def parse_player_death_events_dataframe(parser):
    return parse_event_dataframe(parser, "player_death")


def build_kills_by_tick_from_dataframe(deaths_df, start_tick=None, end_tick=None):
    if deaths_df is None or deaths_df.empty:
        return {}

    kills_by_tick = {}
    for row in deaths_df.to_dict(orient="records"):
        parsed_entry = build_kill_entry(row)
        if parsed_entry is None:
            continue

        tick_value, kill_entry = parsed_entry
        if not tick_matches_range(tick_value, start_tick, end_tick):
            continue
        kills_by_tick.setdefault(tick_value, []).append(kill_entry)

    return kills_by_tick


def build_kill_entry(row):
    tick_value = _to_int_or_none(row.get("tick"))
    if tick_value is None:
        return None

    return tick_value, {
        "tick": tick_value,
        "attacker_name": str(row.get("attacker_name") or "Unknown"),
        "victim_name": str(row.get("user_name") or "Unknown"),
        "weapon": str(row.get("weapon") or "Unknown"),
        "headshot": bool(row.get("headshot")),
        "assister_name": str(row.get("assister_name") or "") if row.get("assister_name") else "",
        "attacker_team_num": _to_int_or_none(row.get("attacker_team_num")),
    }


def build_round_kills_by_tick(parser, start_tick, end_tick):
    deaths_df = parse_player_death_events_dataframe(parser)
    return build_kills_by_tick_from_dataframe(deaths_df, start_tick, end_tick)


def parse_weapon_fire_events_dataframe(parser):
    return parse_event_dataframe(parser, "weapon_fire")


def parse_player_blind_events_dataframe(parser):
    return parse_event_dataframe(parser, "player_blind")


def parse_player_hurt_events_dataframe(parser):
    return parse_event_dataframe(parser, "player_hurt")


def build_shot_entry(row):
    tick_value = _to_int_or_none(_pick_first_value(row, ["tick", "Tick"]))
    if tick_value is None:
        return None

    shooter_team_num = _to_int_or_none(
        _pick_first_value(row, ["user_team_num", "attacker_team_num", "team_num"])
    )
    return tick_value, {
        "tick": tick_value,
        "shooter_name": _to_string_or_default(
            _pick_first_value(row, ["user_name", "attacker_name", "name", "player_name"]),
            "Unknown",
        ),
        "shooter_steamid": _to_string_or_default(
            _pick_first_value(row, ["user_steamid", "attacker_steamid", "steamid"]),
            "",
        ),
        "shooter_team_num": shooter_team_num if shooter_team_num in (TEAM_NUM_T, TEAM_NUM_CT) else None,
        "weapon": _to_string_or_default(_pick_first_value(row, ["weapon", "weapon_name"]), "Unknown"),
    }


def build_blind_entry(row):
    tick_value = _to_int_or_none(_pick_first_value(row, ["tick", "Tick"]))
    if tick_value is None:
        return None

    attacker_team_num = _to_int_or_none(_pick_first_value(row, ["attacker_team_num", "team_num"]))
    victim_team_num = _to_int_or_none(_pick_first_value(row, ["user_team_num", "victim_team_num"]))
    blind_duration = _to_float_or_none(
        _pick_first_value(row, ["blind_duration", "flash_duration", "duration"])
    )

    return tick_value, {
        "tick": tick_value,
        "attacker_name": _to_string_or_default(_pick_first_value(row, ["attacker_name"]), ""),
        "attacker_steamid": _to_string_or_default(_pick_first_value(row, ["attacker_steamid"]), ""),
        "attacker_team_num": attacker_team_num if attacker_team_num in (TEAM_NUM_T, TEAM_NUM_CT) else None,
        "victim_name": _to_string_or_default(
            _pick_first_value(row, ["user_name", "victim_name", "player_name"]),
            "Unknown",
        ),
        "victim_steamid": _to_string_or_default(
            _pick_first_value(row, ["user_steamid", "victim_steamid"]),
            "",
        ),
        "victim_team_num": victim_team_num if victim_team_num in (TEAM_NUM_T, TEAM_NUM_CT) else None,
        "blind_duration": max(0.0, blind_duration) if blind_duration is not None else 0.0,
    }


def build_damage_entry(row):
    tick_value = _to_int_or_none(_pick_first_value(row, ["tick", "Tick"]))
    if tick_value is None:
        return None

    attacker_team_num = _to_int_or_none(_pick_first_value(row, ["attacker_team_num", "team_num"]))
    victim_team_num = _to_int_or_none(_pick_first_value(row, ["user_team_num", "victim_team_num"]))
    hitgroup_value = _pick_first_value(row, ["hitgroup", "hit_group"])

    return tick_value, {
        "tick": tick_value,
        "attacker_name": _to_string_or_default(_pick_first_value(row, ["attacker_name"]), ""),
        "attacker_steamid": _to_string_or_default(_pick_first_value(row, ["attacker_steamid"]), ""),
        "attacker_team_num": attacker_team_num if attacker_team_num in (TEAM_NUM_T, TEAM_NUM_CT) else None,
        "victim_name": _to_string_or_default(
            _pick_first_value(row, ["user_name", "victim_name", "player_name"]),
            "Unknown",
        ),
        "victim_steamid": _to_string_or_default(
            _pick_first_value(row, ["user_steamid", "victim_steamid"]),
            "",
        ),
        "victim_team_num": victim_team_num if victim_team_num in (TEAM_NUM_T, TEAM_NUM_CT) else None,
        "weapon": _to_string_or_default(_pick_first_value(row, ["weapon", "weapon_name"]), "Unknown"),
        "hitgroup": _to_string_or_default(hitgroup_value, ""),
        "dmg_health": max(0, _to_int_or_none(_pick_first_value(row, ["dmg_health", "health_damage"])) or 0),
        "dmg_armor": max(0, _to_int_or_none(_pick_first_value(row, ["dmg_armor", "armor_damage"])) or 0),
        "health": max(0, _to_int_or_none(_pick_first_value(row, ["health", "health_remaining"])) or 0),
        "armor": max(0, _to_int_or_none(_pick_first_value(row, ["armor", "armor_remaining"])) or 0),
    }


def build_round_shots_by_tick(parser, start_tick, end_tick):
    shots_df = parse_weapon_fire_events_dataframe(parser)
    return build_shots_by_tick_from_dataframe(shots_df, start_tick, end_tick)


def build_shots_by_tick_from_dataframe(shots_df, start_tick=None, end_tick=None):
    if shots_df is None or shots_df.empty:
        return {}

    shots_by_tick = {}
    for row in shots_df.to_dict(orient="records"):
        parsed_entry = build_shot_entry(row)
        if parsed_entry is None:
            continue

        tick_value, shot_entry = parsed_entry
        if not tick_matches_range(tick_value, start_tick, end_tick):
            continue
        shots_by_tick.setdefault(tick_value, []).append(shot_entry)

    return shots_by_tick


def build_round_blinds_by_tick(parser, start_tick, end_tick):
    blinds_df = parse_player_blind_events_dataframe(parser)
    return build_blinds_by_tick_from_dataframe(blinds_df, start_tick, end_tick)


def build_blinds_by_tick_from_dataframe(blinds_df, start_tick=None, end_tick=None):
    if blinds_df is None or blinds_df.empty:
        return {}

    blinds_by_tick = {}
    for row in blinds_df.to_dict(orient="records"):
        parsed_entry = build_blind_entry(row)
        if parsed_entry is None:
            continue

        tick_value, blind_entry = parsed_entry
        if not tick_matches_range(tick_value, start_tick, end_tick):
            continue
        blinds_by_tick.setdefault(tick_value, []).append(blind_entry)

    return blinds_by_tick


def build_round_damages_by_tick(parser, start_tick, end_tick):
    damages_df = parse_player_hurt_events_dataframe(parser)
    return build_damages_by_tick_from_dataframe(damages_df, start_tick, end_tick)


def build_damages_by_tick_from_dataframe(damages_df, start_tick=None, end_tick=None):
    if damages_df is None or damages_df.empty:
        return {}

    damages_by_tick = {}
    for row in damages_df.to_dict(orient="records"):
        parsed_entry = build_damage_entry(row)
        if parsed_entry is None:
            continue

        tick_value, damage_entry = parsed_entry
        if not tick_matches_range(tick_value, start_tick, end_tick):
            continue
        damages_by_tick.setdefault(tick_value, []).append(damage_entry)

    return damages_by_tick


def build_round_frames(parser, start_tick, end_tick, source_tickrate, include_grenades=True, frame_step=1):
    raw_start_tick = fixed_tick_to_raw(start_tick, source_tickrate)
    raw_end_tick = fixed_tick_to_raw(end_tick, source_tickrate)
    if raw_end_tick < raw_start_tick:
        raw_end_tick = raw_start_tick

    raw_frame_step = fixed_step_to_raw_step(frame_step, source_tickrate)
    tick_df = parse_tick_dataframe(parser, raw_start_tick, raw_end_tick, tick_step=raw_frame_step)
    players_df = tick_df[tick_df["team_num"].isin([TEAM_NUM_T, TEAM_NUM_CT])]
    raw_players_by_tick = build_players_by_tick(players_df)
    players_by_tick = compress_players_by_tick(raw_players_by_tick, source_tickrate)
    thrower_team_resolver = build_thrower_team_resolver(raw_players_by_tick)

    grenades_by_tick = {}
    grenade_events_by_tick = {}
    if include_grenades:
        raw_grenades_by_tick = build_round_grenades_by_tick(
            parser,
            raw_start_tick,
            raw_end_tick,
            thrower_team_resolver,
        )
        grenades_by_tick = compress_grenades_by_tick(raw_grenades_by_tick, source_tickrate)
        raw_grenade_events_by_tick = build_round_grenade_events_by_tick(
            parser,
            raw_start_tick,
            raw_end_tick,
            thrower_team_resolver,
        )
        grenade_events_by_tick = compress_grenade_events_by_tick(raw_grenade_events_by_tick, source_tickrate)

    raw_kills_by_tick = build_round_kills_by_tick(parser, raw_start_tick, raw_end_tick)
    kills_by_tick = compress_kills_by_tick(raw_kills_by_tick, source_tickrate)
    raw_shots_by_tick = build_round_shots_by_tick(parser, raw_start_tick, raw_end_tick)
    shots_by_tick = compress_shots_by_tick(raw_shots_by_tick, source_tickrate)
    raw_blinds_by_tick = build_round_blinds_by_tick(parser, raw_start_tick, raw_end_tick)
    blinds_by_tick = compress_blinds_by_tick(raw_blinds_by_tick, source_tickrate)
    raw_damages_by_tick = build_round_damages_by_tick(parser, raw_start_tick, raw_end_tick)
    damages_by_tick = compress_damages_by_tick(raw_damages_by_tick, source_tickrate)
    raw_bomb_events_by_tick = build_round_bomb_events_by_tick(parser, raw_start_tick, raw_end_tick)
    bomb_events_by_tick = compress_bomb_events_by_tick(raw_bomb_events_by_tick, source_tickrate)
    bomb_planted_tick, bomb_defused_tick, bomb_exploded_tick = extract_bomb_timing_from_tick_map(
        bomb_events_by_tick,
        start_tick,
        end_tick,
    )
    clock_states_by_tick = build_round_clock_states(
        parser,
        start_tick,
        end_tick,
        source_tickrate,
        bomb_planted_tick=bomb_planted_tick,
        bomb_defused_tick=bomb_defused_tick,
        bomb_exploded_tick=bomb_exploded_tick,
        frame_step=frame_step,
    )

    return build_frames_sequence(
        start_tick,
        end_tick,
        frame_step,
        players_by_tick,
        grenades_by_tick,
        grenade_events_by_tick,
        bomb_events_by_tick,
        kills_by_tick,
        shots_by_tick,
        blinds_by_tick,
        damages_by_tick,
        include_grenades,
        clock_states_by_tick=clock_states_by_tick,
    )


def csv_bool(value):
    return "1" if bool(value) else "0"


def csv_paths_for_output(output_dir):
    return {
        "players": os.path.join(output_dir, CSV_PLAYERS_FILE),
        "kills": os.path.join(output_dir, CSV_KILLS_FILE),
        "shots": os.path.join(output_dir, CSV_SHOTS_FILE),
        "blinds": os.path.join(output_dir, CSV_BLINDS_FILE),
        "damages": os.path.join(output_dir, CSV_DAMAGES_FILE),
        "grenades": os.path.join(output_dir, CSV_GRENADES_FILE),
        "grenade_events": os.path.join(output_dir, CSV_GRENADE_EVENTS_FILE),
        "bomb_events": os.path.join(output_dir, CSV_BOMB_EVENTS_FILE),
        "round_meta": os.path.join(output_dir, CSV_ROUND_META_FILE),
        "clock_states": os.path.join(output_dir, CSV_CLOCK_STATES_FILE),
    }


def create_csv_writer(file_path, fieldnames):
    csv_file = open(file_path, "w", newline="", encoding="utf-8")
    writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
    writer.writeheader()
    return csv_file, writer


def create_export_csv_writers(csv_paths):
    writers = {}
    writers["players_file"], writers["players"] = create_csv_writer(
        csv_paths["players"],
        [
            "round_number",
            "tick",
            "player_key",
            "user_id",
            "player_name",
            "team_num",
            "x",
            "y",
            "yaw",
            "is_alive",
            "health",
            "balance",
            "active_weapon_name",
            "inventory_json",
        ],
    )
    writers["kills_file"], writers["kills"] = create_csv_writer(
        csv_paths["kills"],
        [
            "round_number",
            "tick",
            "attacker_name",
            "victim_name",
            "weapon",
            "headshot",
            "assister_name",
            "attacker_team_num",
        ],
    )
    writers["shots_file"], writers["shots"] = create_csv_writer(
        csv_paths["shots"],
        [
            "round_number",
            "tick",
            "shooter_name",
            "shooter_steamid",
            "shooter_team_num",
            "weapon",
        ],
    )
    writers["blinds_file"], writers["blinds"] = create_csv_writer(
        csv_paths["blinds"],
        [
            "round_number",
            "tick",
            "attacker_name",
            "attacker_steamid",
            "attacker_team_num",
            "victim_name",
            "victim_steamid",
            "victim_team_num",
            "blind_duration",
        ],
    )
    writers["damages_file"], writers["damages"] = create_csv_writer(
        csv_paths["damages"],
        [
            "round_number",
            "tick",
            "attacker_name",
            "attacker_steamid",
            "attacker_team_num",
            "victim_name",
            "victim_steamid",
            "victim_team_num",
            "weapon",
            "hitgroup",
            "dmg_health",
            "dmg_armor",
            "health",
            "armor",
        ],
    )
    writers["grenades_file"], writers["grenades"] = create_csv_writer(
        csv_paths["grenades"],
        [
            "round_number",
            "tick",
            "entity_id",
            "grenade_type",
            "x",
            "y",
            "z",
            "thrower_name",
            "thrower_steamid",
            "thrower_team_num",
        ],
    )
    writers["grenade_events_file"], writers["grenade_events"] = create_csv_writer(
        csv_paths["grenade_events"],
        [
            "round_number",
            "tick",
            "event_type",
            "grenade_type",
            "entity_id",
            "x",
            "y",
            "z",
            "thrower_name",
            "thrower_steamid",
            "thrower_team_num",
        ],
    )
    writers["bomb_events_file"], writers["bomb_events"] = create_csv_writer(
        csv_paths["bomb_events"],
        [
            "round_number",
            "tick",
            "event_type",
            "site",
            "user_name",
            "user_steamid",
            "team_num",
        ],
    )
    writers["clock_states_file"], writers["clock_states"] = create_csv_writer(
        csv_paths["clock_states"],
        [
            "round_number",
            "tick",
            "phase",
            "label",
            "remaining_seconds",
            "total_seconds",
            "is_paused",
        ],
    )
    writers["round_meta_file"], writers["round_meta"] = create_csv_writer(
        csv_paths["round_meta"],
        [
            "round_number",
            "start_tick",
            "end_tick",
            "tickrate",
            "has_grenades",
            "frames_count",
            "bomb_planted_tick",
            "bomb_defused_tick",
            "bomb_exploded_tick",
        ],
    )
    return writers


def close_export_csv_writers(writers):
    for key in [
        "players_file",
        "kills_file",
        "shots_file",
        "blinds_file",
        "damages_file",
        "grenades_file",
        "grenade_events_file",
        "bomb_events_file",
        "clock_states_file",
        "round_meta_file",
    ]:
        csv_file = writers.get(key)
        if csv_file is None:
            continue
        try:
            csv_file.close()
        except Exception:
            continue


def parse_export_csv_args(argv):
    include_grenades = True
    output_dir = None

    if len(argv) >= 4:
        include_grenades_text = str(argv[3]).strip().lower()
        include_grenades = include_grenades_text not in ("0", "false", "no")

    if len(argv) >= 5:
        output_dir = str(argv[4]).strip() or None

    return include_grenades, output_dir


def build_round_fixed_ticks(round_meta, frame_step=1):
    start_tick = _to_int_or_none(round_meta.get("start_tick")) or 0
    end_tick = _to_int_or_none(round_meta.get("end_tick")) or start_tick
    safe_frame_step = max(1, int(frame_step))
    fixed_ticks = list(range(start_tick, end_tick + 1, safe_frame_step))
    if not fixed_ticks or fixed_ticks[-1] != end_tick:
        fixed_ticks.append(end_tick)
    return fixed_ticks


def build_round_raw_ticks(round_meta, source_tickrate, frame_step=1):
    start_tick = _to_int_or_none(round_meta.get("start_tick")) or 0
    end_tick = _to_int_or_none(round_meta.get("end_tick")) or start_tick
    raw_start_tick = _to_int_or_none(round_meta.get("raw_start_tick"))
    raw_end_tick = _to_int_or_none(round_meta.get("raw_end_tick"))
    if raw_start_tick is None:
        raw_start_tick = fixed_tick_to_raw(start_tick, source_tickrate)
    if raw_end_tick is None:
        raw_end_tick = fixed_tick_to_raw(end_tick, source_tickrate)

    raw_frame_step = fixed_step_to_raw_step(frame_step, source_tickrate)
    raw_ticks = list(range(raw_start_tick, raw_end_tick + 1, raw_frame_step))
    if not raw_ticks or raw_ticks[-1] != raw_end_tick:
        raw_ticks.append(raw_end_tick)
    return raw_ticks


def collect_export_raw_ticks(rounds, source_tickrate, frame_step=1):
    raw_ticks = []
    seen_ticks = set()
    for round_meta in rounds:
        for raw_tick in build_round_raw_ticks(round_meta, source_tickrate, frame_step):
            if raw_tick in seen_ticks:
                continue
            seen_ticks.add(raw_tick)
            raw_ticks.append(raw_tick)
    raw_ticks.sort()
    return raw_ticks


def slice_tick_map_by_range(tick_map, start_tick, end_tick):
    if not tick_map:
        return {}

    sliced = {}
    for tick_value, entries in tick_map.items():
        if tick_matches_range(tick_value, start_tick, end_tick):
            sliced[tick_value] = entries
    return sliced


def build_export_tick_and_event_maps(parser, rounds, source_tickrate, include_grenades):
    raw_players_by_tick = {}
    raw_range_start = None
    raw_range_end = None
    for round_meta in rounds:
        round_start_tick = _to_int_or_none(round_meta.get("raw_start_tick"))
        round_end_tick = _to_int_or_none(round_meta.get("raw_end_tick"))
        if round_start_tick is None or round_end_tick is None:
            continue
        if raw_range_start is None or round_start_tick < raw_range_start:
            raw_range_start = round_start_tick
        if raw_range_end is None or round_end_tick > raw_range_end:
            raw_range_end = round_end_tick

    if raw_range_start is not None and raw_range_end is not None:
        tick_df = parse_tick_dataframe(
            parser,
            raw_range_start,
            raw_range_end,
            tick_step=fixed_step_to_raw_step(1, source_tickrate),
        )
        players_df = tick_df[tick_df["team_num"].isin([TEAM_NUM_T, TEAM_NUM_CT])]
        raw_players_by_tick = build_players_by_tick(players_df)

    thrower_team_resolver = build_thrower_team_resolver(raw_players_by_tick)

    kills_by_tick = build_kills_by_tick_from_dataframe(parse_player_death_events_dataframe(parser))
    shots_by_tick = build_shots_by_tick_from_dataframe(parse_weapon_fire_events_dataframe(parser))
    blinds_by_tick = build_blinds_by_tick_from_dataframe(parse_player_blind_events_dataframe(parser))
    damages_by_tick = build_damages_by_tick_from_dataframe(parse_player_hurt_events_dataframe(parser))

    bomb_event_dataframes = []
    for event_name, event_type in BOMB_EVENT_DEFINITIONS:
        bomb_event_dataframes.append((event_type, parse_event_dataframe(parser, event_name)))
    bomb_events_by_tick = build_bomb_events_by_tick_from_dataframes(bomb_event_dataframes)

    grenades_by_tick = {}
    grenade_events_by_tick = {}
    if include_grenades:
        grenades_by_tick = build_grenades_by_tick_from_dataframe(
            parse_grenades_dataframe(parser),
            team_resolver=thrower_team_resolver,
        )

        grenade_event_dataframes = []
        for event_name, event_type, default_grenade_type in GRENADE_EVENT_DEFINITIONS:
            grenade_event_dataframes.append(
                (
                    event_type,
                    default_grenade_type,
                    parse_event_dataframe(parser, event_name),
                )
            )
        grenade_events_by_tick = build_grenade_events_by_tick_from_dataframes(
            grenade_event_dataframes,
            team_resolver=thrower_team_resolver,
        )

    return {
        "players": raw_players_by_tick,
        "grenades": grenades_by_tick,
        "grenade_events": grenade_events_by_tick,
        "bomb_events": bomb_events_by_tick,
        "kills": kills_by_tick,
        "shots": shots_by_tick,
        "blinds": blinds_by_tick,
        "damages": damages_by_tick,
    }


def emit_csv_progress(current, total, message):
    try:
        safe_current = max(0, int(current))
        safe_total = max(0, int(total))
        safe_message = str(message or "")
        sys.stderr.write(f"PROGRESS|{safe_current}|{safe_total}|{safe_message}\n")
        sys.stderr.flush()
    except Exception:
        return


def build_player_key_from_entry(player, player_index):
    user_id = _to_int_or_none(player.get("user_id"))
    if user_id is not None and user_id > 0:
        return f"uid:{user_id}"

    name = _to_string_or_default(player.get("name"), "")
    if name:
        return f"name:{name}"

    return f"slot:{player_index}"


def build_player_position_row(round_number, tick_value, player, player_index):
    return {
        "round_number": int(round_number),
        "tick": int(tick_value),
        "player_key": build_player_key_from_entry(player, player_index),
        "user_id": _to_int_or_none(player.get("user_id")) or 0,
        "player_name": _to_string_or_default(player.get("name"), ""),
        "team_num": _to_int_or_none(player.get("team_num")) or 0,
        "x": _to_float_or_none(player.get("X")) or 0.0,
        "y": _to_float_or_none(player.get("Y")) or 0.0,
        "yaw": _to_float_or_none(player.get("yaw")) or 0.0,
        "is_alive": csv_bool(player.get("is_alive")),
        "health": max(0, _to_int_or_none(player.get("health")) or 0),
        "balance": max(0, _to_int_or_none(player.get("balance")) or 0),
        "active_weapon_name": _to_string_or_default(
            player.get("active_weapon_name"),
            _to_string_or_default(player.get("weapon_name"), ""),
        ),
        "inventory_json": _dumps_json_safe(normalize_inventory_items(player.get("inventory"))),
    }


def write_round_frame_rows(round_number, frames, include_grenades, writers):
    counts = {
        "players": 0,
        "kills": 0,
        "shots": 0,
        "blinds": 0,
        "damages": 0,
        "grenades": 0,
        "grenade_events": 0,
        "bomb_events": 0,
        "clock_states": 0,
    }
    dedupe_players = set()

    for frame in frames:
        tick_value = _to_int_or_none(frame.get("tick")) if isinstance(frame, dict) else None
        if tick_value is None:
            continue

        players = frame.get("players") or []
        for player_index, player in enumerate(players):
            row = build_player_position_row(round_number, tick_value, player, player_index)
            dedupe_key = (row["tick"], row["player_key"])
            if dedupe_key in dedupe_players:
                continue
            dedupe_players.add(dedupe_key)
            writers["players"].writerow(row)
            counts["players"] += 1

        for kill in frame.get("kills") or []:
            writers["kills"].writerow(
                {
                    "round_number": int(round_number),
                    "tick": int(tick_value),
                    "attacker_name": _to_string_or_default(kill.get("attacker_name"), "Unknown"),
                    "victim_name": _to_string_or_default(kill.get("victim_name"), "Unknown"),
                    "weapon": _to_string_or_default(kill.get("weapon"), "Unknown"),
                    "headshot": csv_bool(kill.get("headshot")),
                    "assister_name": _to_string_or_default(kill.get("assister_name"), ""),
                    "attacker_team_num": _to_int_or_none(kill.get("attacker_team_num")) or 0,
                }
            )
            counts["kills"] += 1

        for shot in frame.get("shots") or []:
            writers["shots"].writerow(
                {
                    "round_number": int(round_number),
                    "tick": int(tick_value),
                    "shooter_name": _to_string_or_default(shot.get("shooter_name"), "Unknown"),
                    "shooter_steamid": _to_string_or_default(shot.get("shooter_steamid"), ""),
                    "shooter_team_num": _to_int_or_none(shot.get("shooter_team_num")) or 0,
                    "weapon": _to_string_or_default(shot.get("weapon"), "Unknown"),
                }
            )
            counts["shots"] += 1

        for blind in frame.get("blinds") or []:
            writers["blinds"].writerow(
                {
                    "round_number": int(round_number),
                    "tick": int(tick_value),
                    "attacker_name": _to_string_or_default(blind.get("attacker_name"), ""),
                    "attacker_steamid": _to_string_or_default(blind.get("attacker_steamid"), ""),
                    "attacker_team_num": _to_int_or_none(blind.get("attacker_team_num")) or 0,
                    "victim_name": _to_string_or_default(blind.get("victim_name"), "Unknown"),
                    "victim_steamid": _to_string_or_default(blind.get("victim_steamid"), ""),
                    "victim_team_num": _to_int_or_none(blind.get("victim_team_num")) or 0,
                    "blind_duration": _to_float_or_none(blind.get("blind_duration")) or 0.0,
                }
            )
            counts["blinds"] += 1

        for damage in frame.get("damages") or []:
            writers["damages"].writerow(
                {
                    "round_number": int(round_number),
                    "tick": int(tick_value),
                    "attacker_name": _to_string_or_default(damage.get("attacker_name"), ""),
                    "attacker_steamid": _to_string_or_default(damage.get("attacker_steamid"), ""),
                    "attacker_team_num": _to_int_or_none(damage.get("attacker_team_num")) or 0,
                    "victim_name": _to_string_or_default(damage.get("victim_name"), "Unknown"),
                    "victim_steamid": _to_string_or_default(damage.get("victim_steamid"), ""),
                    "victim_team_num": _to_int_or_none(damage.get("victim_team_num")) or 0,
                    "weapon": _to_string_or_default(damage.get("weapon"), "Unknown"),
                    "hitgroup": _to_string_or_default(damage.get("hitgroup"), ""),
                    "dmg_health": max(0, _to_int_or_none(damage.get("dmg_health")) or 0),
                    "dmg_armor": max(0, _to_int_or_none(damage.get("dmg_armor")) or 0),
                    "health": max(0, _to_int_or_none(damage.get("health")) or 0),
                    "armor": max(0, _to_int_or_none(damage.get("armor")) or 0),
                }
            )
            counts["damages"] += 1

        for event in frame.get("bomb_events") or []:
            writers["bomb_events"].writerow(
                {
                    "round_number": int(round_number),
                    "tick": int(tick_value),
                    "event_type": _to_string_or_default(event.get("event_type"), ""),
                    "site": _to_int_or_none(event.get("site")) or 0,
                    "user_name": _to_string_or_default(event.get("user_name"), ""),
                    "user_steamid": _to_string_or_default(event.get("user_steamid"), ""),
                    "team_num": _to_int_or_none(event.get("team_num")) or 0,
                }
            )
            counts["bomb_events"] += 1

        clock_state = frame.get("clock") if isinstance(frame, dict) else None
        if isinstance(clock_state, dict):
            writers["clock_states"].writerow(
                {
                    "round_number": int(round_number),
                    "tick": int(tick_value),
                    "phase": _to_string_or_default(clock_state.get("phase"), "round"),
                    "label": _to_string_or_default(clock_state.get("label"), build_round_clock_label("round")),
                    "remaining_seconds": _to_non_negative_seconds(clock_state.get("remaining_seconds"), 0.0),
                    "total_seconds": _to_non_negative_seconds(clock_state.get("total_seconds"), 0.0),
                    "is_paused": csv_bool(clock_state.get("is_paused")),
                }
            )
            counts["clock_states"] += 1

        if not include_grenades:
            continue

        for grenade in frame.get("grenades") or []:
            writers["grenades"].writerow(
                {
                    "round_number": int(round_number),
                    "tick": int(tick_value),
                    "entity_id": _to_int_or_none(grenade.get("entity_id")) or 0,
                    "grenade_type": _to_string_or_default(grenade.get("grenade_type"), "Unknown"),
                    "x": _to_float_or_none(grenade.get("x")) or 0.0,
                    "y": _to_float_or_none(grenade.get("y")) or 0.0,
                    "z": _to_float_or_none(grenade.get("z")) or 0.0,
                    "thrower_name": _to_string_or_default(grenade.get("thrower_name"), ""),
                    "thrower_steamid": _to_string_or_default(grenade.get("thrower_steamid"), ""),
                    "thrower_team_num": _to_int_or_none(grenade.get("thrower_team_num")) or 0,
                }
            )
            counts["grenades"] += 1

        for event in frame.get("grenade_events") or []:
            writers["grenade_events"].writerow(
                {
                    "round_number": int(round_number),
                    "tick": int(tick_value),
                    "event_type": _to_string_or_default(event.get("event_type"), ""),
                    "grenade_type": _to_string_or_default(event.get("grenade_type"), "Unknown"),
                    "entity_id": _to_int_or_none(event.get("entity_id")) or 0,
                    "x": _to_float_or_none(event.get("x")) or 0.0,
                    "y": _to_float_or_none(event.get("y")) or 0.0,
                    "z": _to_float_or_none(event.get("z")) or 0.0,
                    "thrower_name": _to_string_or_default(event.get("thrower_name"), ""),
                    "thrower_steamid": _to_string_or_default(event.get("thrower_steamid"), ""),
                    "thrower_team_num": _to_int_or_none(event.get("thrower_team_num")) or 0,
                }
            )
            counts["grenade_events"] += 1

    return counts


def build_export_csv_result(
    normalized_map_name,
    raw_map_name,
    output_dir,
    csv_paths,
    include_grenades,
    rounds_count,
    row_counts,
):
    return {
        "status": "success",
        "mode": "export_csv",
        "map": normalized_map_name,
        "map_raw": raw_map_name,
        "tickrate": FIXED_TICKRATE,
        "output_dir": output_dir,
        "include_grenades": include_grenades,
        "rounds_count": rounds_count,
        "csv_files": csv_paths,
        "row_counts": row_counts,
    }


def run_export_csv_mode(parser, argv, normalized_map_name, raw_map_name, source_tickrate):
    include_grenades, output_dir = parse_export_csv_args(argv)
    if not output_dir:
        output_dir = tempfile.mkdtemp(prefix="cs2-parse-")
    os.makedirs(output_dir, exist_ok=True)

    rounds = build_rounds(parser, source_tickrate)
    total_rounds = len(rounds)
    csv_paths = csv_paths_for_output(output_dir)
    writers = create_export_csv_writers(csv_paths)
    row_counts = {
        "players": 0,
        "kills": 0,
        "shots": 0,
        "blinds": 0,
        "damages": 0,
        "grenades": 0,
        "grenade_events": 0,
        "bomb_events": 0,
        "clock_states": 0,
        "round_meta": 0,
    }

    try:
        emit_csv_progress(0, total_rounds, "Preparing global tick/event maps")
        export_maps = build_export_tick_and_event_maps(parser, rounds, source_tickrate, include_grenades)
        for round_index, round_meta in enumerate(rounds):
            round_number = _to_int_or_none(round_meta.get("number")) or (round_index + 1)
            start_tick = _to_int_or_none(round_meta.get("start_tick")) or 0
            end_tick = _to_int_or_none(round_meta.get("end_tick")) or start_tick
            raw_start_tick = _to_int_or_none(round_meta.get("raw_start_tick"))
            raw_end_tick = _to_int_or_none(round_meta.get("raw_end_tick"))
            if raw_start_tick is None:
                raw_start_tick = fixed_tick_to_raw(start_tick, source_tickrate)
            if raw_end_tick is None:
                raw_end_tick = fixed_tick_to_raw(end_tick, source_tickrate)

            players_by_tick = compress_players_by_tick(
                slice_tick_map_by_range(export_maps["players"], raw_start_tick, raw_end_tick),
                source_tickrate,
            )
            kills_by_tick = compress_kills_by_tick(
                slice_tick_map_by_range(export_maps["kills"], raw_start_tick, raw_end_tick),
                source_tickrate,
            )
            shots_by_tick = compress_shots_by_tick(
                slice_tick_map_by_range(export_maps["shots"], raw_start_tick, raw_end_tick),
                source_tickrate,
            )
            blinds_by_tick = compress_blinds_by_tick(
                slice_tick_map_by_range(export_maps["blinds"], raw_start_tick, raw_end_tick),
                source_tickrate,
            )
            damages_by_tick = compress_damages_by_tick(
                slice_tick_map_by_range(export_maps["damages"], raw_start_tick, raw_end_tick),
                source_tickrate,
            )
            bomb_events_by_tick = compress_bomb_events_by_tick(
                slice_tick_map_by_range(export_maps["bomb_events"], raw_start_tick, raw_end_tick),
                source_tickrate,
            )
            grenades_by_tick = {}
            grenade_events_by_tick = {}
            if include_grenades:
                grenades_by_tick = compress_grenades_by_tick(
                    slice_tick_map_by_range(export_maps["grenades"], raw_start_tick, raw_end_tick),
                    source_tickrate,
                )
                grenade_events_by_tick = compress_grenade_events_by_tick(
                    slice_tick_map_by_range(export_maps["grenade_events"], raw_start_tick, raw_end_tick),
                    source_tickrate,
                )

            frames = build_frames_sequence(
                start_tick,
                end_tick,
                1,
                players_by_tick,
                grenades_by_tick,
                grenade_events_by_tick,
                bomb_events_by_tick,
                kills_by_tick,
                shots_by_tick,
                blinds_by_tick,
                damages_by_tick,
                include_grenades,
            )
            bomb_ticks = extract_bomb_timing_from_frames(frames)
            clock_states_by_tick = build_round_clock_states(
                parser,
                start_tick,
                end_tick,
                source_tickrate,
                bomb_planted_tick=bomb_ticks[0],
                bomb_defused_tick=bomb_ticks[1],
                bomb_exploded_tick=bomb_ticks[2],
                frame_step=1,
            )
            attach_clock_states_to_frames(frames, clock_states_by_tick)
            round_counts = write_round_frame_rows(round_number, frames, include_grenades, writers)
            for key in round_counts:
                row_counts[key] += round_counts[key]
            writers["round_meta"].writerow(
                {
                    "round_number": round_number,
                    "start_tick": start_tick,
                    "end_tick": end_tick,
                    "tickrate": FIXED_TICKRATE,
                    "has_grenades": csv_bool(include_grenades),
                    "frames_count": len(frames),
                    "bomb_planted_tick": bomb_ticks[0] if bomb_ticks[0] is not None else "",
                    "bomb_defused_tick": bomb_ticks[1] if bomb_ticks[1] is not None else "",
                    "bomb_exploded_tick": bomb_ticks[2] if bomb_ticks[2] is not None else "",
                }
            )
            row_counts["round_meta"] += 1
            emit_csv_progress(round_index + 1, total_rounds, f"Round {round_number} exported")
    finally:
        close_export_csv_writers(writers)

    print(
        _dumps_json_safe(
            build_export_csv_result(
                normalized_map_name,
                raw_map_name,
                output_dir,
                csv_paths,
                include_grenades,
                total_rounds,
                row_counts,
            )
        )
    )


def parse_mode(argv):
    if len(argv) >= 3:
        return argv[2]
    return "index"


def parse_round_args(argv):
    if len(argv) < 5:
        raise ValueError("Missing round range arguments: start_tick end_tick")

    start_tick = int(argv[3])
    end_tick = int(argv[4])
    include_grenades = True
    frame_step = 1

    if len(argv) >= 6:
        include_grenades_text = str(argv[5]).strip().lower()
        include_grenades = include_grenades_text not in ("0", "false", "no")

    if len(argv) >= 7:
        parsed_frame_step = _to_int_or_none(argv[6])
        if parsed_frame_step is None or parsed_frame_step <= 0:
            raise ValueError("Invalid round frame_step")
        frame_step = min(max(parsed_frame_step, 1), 16)

    if end_tick < start_tick:
        raise ValueError("Invalid round range: end_tick < start_tick")

    return start_tick, end_tick, include_grenades, frame_step


def extract_bomb_timing_from_tick_map(events_by_tick, start_tick=None, end_tick=None):
    if not isinstance(events_by_tick, dict) or not events_by_tick:
        return None, None, None

    frames = []
    for tick_value in sorted(events_by_tick.keys()):
        if start_tick is not None and tick_value < start_tick:
            continue
        if end_tick is not None and tick_value > end_tick:
            continue
        frames.append(
            {
                "tick": int(tick_value),
                "bomb_events": events_by_tick.get(tick_value) or [],
            }
        )

    return extract_bomb_timing_from_frames(frames)


def extract_bomb_timing_from_frames(frames):
    bomb_planted_tick = None
    bomb_defused_tick = None
    bomb_exploded_tick = None

    if not isinstance(frames, list):
        return bomb_planted_tick, bomb_defused_tick, bomb_exploded_tick

    for frame in frames:
        frame_tick = _to_int_or_none(frame.get("tick")) if isinstance(frame, dict) else None
        if not isinstance(frame, dict):
            continue

        for event in frame.get("bomb_events") or []:
            if not isinstance(event, dict):
                continue
            event_type = _to_string_or_default(event.get("event_type"), "").lower()
            event_tick = _to_int_or_none(event.get("tick"))
            if event_tick is None:
                event_tick = frame_tick
            if event_tick is None:
                continue

            if event_type == "bomb_planted":
                if bomb_planted_tick is None or event_tick < bomb_planted_tick:
                    bomb_planted_tick = event_tick
            elif event_type == "bomb_defused":
                if bomb_defused_tick is None or event_tick < bomb_defused_tick:
                    bomb_defused_tick = event_tick
            elif event_type == "bomb_exploded":
                if bomb_exploded_tick is None or event_tick < bomb_exploded_tick:
                    bomb_exploded_tick = event_tick

    return bomb_planted_tick, bomb_defused_tick, bomb_exploded_tick


def build_index_result(normalized_map_name, raw_map_name, tickrate, rounds):
    return {
        "status": "success",
        "mode": "index",
        "map": normalized_map_name,
        "map_raw": raw_map_name,
        "tickrate": FIXED_TICKRATE,
        "rounds": rounds,
    }


def build_round_result(
    normalized_map_name,
    raw_map_name,
    tickrate,
    start_tick,
    end_tick,
    include_grenades,
    frame_step,
    frames,
    bomb_planted_tick=None,
    bomb_defused_tick=None,
    bomb_exploded_tick=None,
):
    return {
        "status": "success",
        "mode": "round",
        "map": normalized_map_name,
        "map_raw": raw_map_name,
        "tickrate": FIXED_TICKRATE,
        "start_tick": start_tick,
        "end_tick": end_tick,
        "includes_grenades": include_grenades,
        "frame_step": frame_step,
        "frames": frames,
        "bomb_planted_tick": bomb_planted_tick,
        "bomb_defused_tick": bomb_defused_tick,
        "bomb_exploded_tick": bomb_exploded_tick,
    }


def run_index_mode(parser, normalized_map_name, raw_map_name, source_tickrate):
    rounds = build_rounds(parser, source_tickrate)
    print(_dumps_json_safe(build_index_result(normalized_map_name, raw_map_name, FIXED_TICKRATE, rounds)))


def run_round_mode(parser, argv, normalized_map_name, raw_map_name, source_tickrate):
    start_tick, end_tick, include_grenades, frame_step = parse_round_args(argv)
    frames = build_round_frames(
        parser,
        start_tick,
        end_tick,
        source_tickrate,
        include_grenades=include_grenades,
        frame_step=frame_step,
    )
    bomb_planted_tick, bomb_defused_tick, bomb_exploded_tick = extract_bomb_timing_from_frames(frames)
    print(
        _dumps_json_safe(
            build_round_result(
                normalized_map_name,
                raw_map_name,
                FIXED_TICKRATE,
                start_tick,
                end_tick,
                include_grenades,
                frame_step,
                frames,
                bomb_planted_tick=bomb_planted_tick,
                bomb_defused_tick=bomb_defused_tick,
                bomb_exploded_tick=bomb_exploded_tick,
            )
        )
    )


def main():
    if len(sys.argv) < 2:
        print(_dumps_json_safe({"status": "error", "message": "Missing demo file path"}))
        return

    demo_path = sys.argv[1]
    mode = parse_mode(sys.argv)

    try:
        parser = DemoParser(demo_path)
        header = parser.parse_header()
        raw_map_name = header.get("map_name", "Unknown")
        normalized_map_name = normalize_map_name(raw_map_name)
        source_tickrate = resolve_tickrate(header)

        if mode == "index":
            run_index_mode(parser, normalized_map_name, raw_map_name, source_tickrate)
            return

        if mode == "round":
            run_round_mode(parser, sys.argv, normalized_map_name, raw_map_name, source_tickrate)
            return

        if mode == "export_csv":
            run_export_csv_mode(parser, sys.argv, normalized_map_name, raw_map_name, source_tickrate)
            return

        print(_dumps_json_safe({"status": "error", "message": f"Unsupported mode: {mode}"}))
    except Exception as error:
        print(_dumps_json_safe({"status": "error", "message": str(error)}))


if __name__ == "__main__":
    main()
