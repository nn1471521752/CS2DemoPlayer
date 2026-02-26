import sys
import json
import re
import math
from demoparser2 import DemoParser

DEFAULT_TICKRATE = 64.0
TEAM_NUM_T = 2
TEAM_NUM_CT = 3


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


def parse_event_ticks(parser, event_name):
    try:
        events = parser.parse_events([event_name])
    except Exception:
        return []

    if not isinstance(events, list) or len(events) == 0:
        return []

    events_df = None
    for event_tuple in events:
        if isinstance(event_tuple, tuple) and len(event_tuple) >= 2 and event_tuple[0] == event_name:
            events_df = event_tuple[1]
            break

    if events_df is None or events_df.empty or "tick" not in events_df.columns:
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

    if average_equip_value < 2200:
        return "eco"

    if average_equip_value < 3900:
        return "force"

    return "rifle"


def update_team_economy_stats(stats, row):
    tick = _to_int_or_none(row.get("tick"))
    team_num = _to_int_or_none(row.get("team_num"))
    if tick is None or team_num not in (TEAM_NUM_T, TEAM_NUM_CT):
        return

    key = (tick, team_num)
    if key not in stats:
        stats[key] = {"count": 0, "equip_total": 0.0, "equip_count": 0, "balance_total": 0.0}

    stat = stats[key]
    stat["count"] += 1

    equip_value = _to_float_or_none(row.get("round_start_equip_value"))
    if equip_value is not None and equip_value >= 0:
        stat["equip_total"] += equip_value
        stat["equip_count"] += 1

    balance_value = _to_float_or_none(row.get("balance"))
    if balance_value is not None and balance_value >= 0:
        stat["balance_total"] += balance_value


def resolve_team_economy_stat(stats, tick, team_num):
    stat = stats.get((tick, team_num))
    if not stat:
        return 0, 0

    total = stat["equip_total"] if stat["equip_count"] > 0 else stat["balance_total"]
    return int(round(max(total, 0))), max(stat["count"], 0)


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


def build_round_record(index, start_tick, end_tick, first_round_start_tick, tickrate, economy_meta=None):
    record = {
        "number": index + 1,
        "start_tick": int(start_tick),
        "end_tick": int(end_tick),
        "start_seconds": round(max(float(start_tick - first_round_start_tick), 0.0) / tickrate, 3),
        "end_seconds": round(max(float(end_tick - first_round_start_tick), 0.0) / tickrate, 3),
        "duration_seconds": round(max(float(end_tick - start_tick), 0.0) / tickrate, 3),
    }
    if isinstance(economy_meta, dict):
        record["ct_economy"] = str(economy_meta.get("ct_economy") or "unknown")
        record["t_economy"] = str(economy_meta.get("t_economy") or "unknown")
        record["ct_equip_value"] = int(_to_float_or_none(economy_meta.get("ct_equip_value")) or 0)
        record["t_equip_value"] = int(_to_float_or_none(economy_meta.get("t_equip_value")) or 0)

    return record


def build_rounds(parser, tickrate):
    round_start_ticks = get_round_start_ticks(parser)
    if not round_start_ticks:
        return []

    round_end_ticks = parse_event_ticks(parser, "round_end")
    first_round_start_tick = round_start_ticks[0]
    round_economy = build_round_economy_by_start_tick(parser, round_start_ticks)
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
                tickrate,
                round_economy.get(start_tick),
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


def parse_grenades_dataframe(parser):
    try:
        grenades_df = parser.parse_grenades(grenades=False)
    except Exception:
        return None

    if grenades_df is None or grenades_df.empty:
        return None

    return grenades_df


def resolve_grenade_columns(columns):
    return {
        "tick": _find_column(columns, ["tick", "Tick"]),
        "x": _find_column(columns, ["x", "X"]),
        "y": _find_column(columns, ["y", "Y"]),
        "z": _find_column(columns, ["z", "Z"]),
        "entity_id": _find_column(columns, ["grenade_entity_id", "entityid", "entity_id"]),
        "grenade_type": _find_column(columns, ["grenade_type", "grenade_name", "weapon"]),
        "thrower_name": _find_column(columns, ["name", "user_name", "thrower_name"]),
        "thrower_steamid": _find_column(columns, ["steamid", "user_steamid", "thrower_steamid"]),
    }


def has_required_grenade_columns(column_map):
    required_keys = ["tick", "x", "y", "z", "entity_id", "grenade_type"]
    return all(column_map.get(key) is not None for key in required_keys)


def select_grenade_rows(grenades_df, column_map, start_tick, end_tick):
    selected_columns = [
        column_map["tick"],
        column_map["x"],
        column_map["y"],
        column_map["z"],
        column_map["entity_id"],
        column_map["grenade_type"],
    ]

    for optional_key in ["thrower_name", "thrower_steamid"]:
        column_name = column_map.get(optional_key)
        if column_name is not None:
            selected_columns.append(column_name)

    filtered_df = grenades_df[selected_columns]
    tick_column = column_map["tick"]
    return filtered_df[(filtered_df[tick_column] >= start_tick) & (filtered_df[tick_column] <= end_tick)]


def build_grenade_entry(row, column_map):
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

    attach_thrower_fields(entry, row, column_map)
    return tick_value, entity_id_value, entry


def attach_thrower_fields(entry, row, column_map):
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


def build_round_grenades_by_tick(parser, start_tick, end_tick):
    grenades_df = parse_grenades_dataframe(parser)
    if grenades_df is None:
        return {}

    column_map = resolve_grenade_columns(list(grenades_df.columns))
    if not has_required_grenade_columns(column_map):
        return {}

    filtered_df = select_grenade_rows(grenades_df, column_map, start_tick, end_tick)
    grenades_by_tick = {}
    seen_tick_entity = set()

    for row in filtered_df.to_dict(orient="records"):
        parsed_entry = build_grenade_entry(row, column_map)
        if parsed_entry is None:
            continue

        tick_value, entity_id_value, grenade_entry = parsed_entry
        dedupe_key = (tick_value, entity_id_value)
        if dedupe_key in seen_tick_entity:
            continue

        seen_tick_entity.add(dedupe_key)
        grenades_by_tick.setdefault(tick_value, []).append(grenade_entry)

    return grenades_by_tick


def parse_tick_dataframe(parser, start_tick, end_tick):
    tick_range = range(start_tick, end_tick + 1)
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
            "name",
            "active_weapon_name",
            "weapon_name",
        ],
        ["X", "Y", "team_num", "is_alive", "yaw", "health", "balance", "name"],
        ["X", "Y", "team_num", "is_alive", "yaw"],
    ]

    for tick_props in tick_prop_sets:
        try:
            return parser.parse_ticks(tick_props, ticks=tick_range)
        except Exception:
            continue

    raise RuntimeError("Unable to parse tick data for selected range")


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

    if "user_id" in player:
        parsed_user_id = _to_int_or_none(player.get("user_id"))
        if parsed_user_id is not None:
            player["user_id"] = parsed_user_id
        else:
            player["user_id"] = 0

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
        "name",
        "active_weapon_name",
        "weapon_name",
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


def build_frames_sequence(
    start_tick,
    end_tick,
    frame_step,
    players_by_tick,
    grenades_by_tick,
    kills_by_tick,
    include_grenades,
):
    frames = []
    safe_frame_step = max(1, int(frame_step))
    for tick in range(start_tick, end_tick + 1, safe_frame_step):
        frame = {"tick": int(tick), "players": players_by_tick.get(int(tick), [])}
        if include_grenades:
            frame["grenades"] = grenades_by_tick.get(int(tick), [])
        frame["kills"] = kills_by_tick.get(int(tick), [])
        frames.append(frame)

    if frames and frames[-1]["tick"] != end_tick:
        frame = {"tick": int(end_tick), "players": players_by_tick.get(int(end_tick), []), "kills": kills_by_tick.get(int(end_tick), [])}
        if include_grenades:
            frame["grenades"] = grenades_by_tick.get(int(end_tick), [])
        frames.append(frame)

    return frames


def parse_player_death_events_dataframe(parser):
    try:
        events = parser.parse_events(["player_death"])
    except Exception:
        return None

    if not isinstance(events, list) or len(events) == 0:
        return None

    for event_tuple in events:
        if isinstance(event_tuple, tuple) and len(event_tuple) >= 2 and event_tuple[0] == "player_death":
            return event_tuple[1]

    return None


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
    if deaths_df is None or deaths_df.empty:
        return {}

    kills_by_tick = {}
    for row in deaths_df.to_dict(orient="records"):
        parsed_entry = build_kill_entry(row)
        if parsed_entry is None:
            continue

        tick_value, kill_entry = parsed_entry
        if tick_value < start_tick or tick_value > end_tick:
            continue
        kills_by_tick.setdefault(tick_value, []).append(kill_entry)

    return kills_by_tick


def build_round_frames(parser, start_tick, end_tick, include_grenades=True, frame_step=1):
    tick_df = parse_tick_dataframe(parser, start_tick, end_tick)
    players_df = tick_df[tick_df["team_num"].isin([TEAM_NUM_T, TEAM_NUM_CT])]
    players_by_tick = build_players_by_tick(players_df)

    grenades_by_tick = {}
    if include_grenades:
        grenades_by_tick = build_round_grenades_by_tick(parser, start_tick, end_tick)

    kills_by_tick = build_round_kills_by_tick(parser, start_tick, end_tick)

    return build_frames_sequence(
        start_tick,
        end_tick,
        frame_step,
        players_by_tick,
        grenades_by_tick,
        kills_by_tick,
        include_grenades,
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


def build_index_result(normalized_map_name, raw_map_name, tickrate, rounds):
    return {
        "status": "success",
        "mode": "index",
        "map": normalized_map_name,
        "map_raw": raw_map_name,
        "tickrate": tickrate,
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
):
    return {
        "status": "success",
        "mode": "round",
        "map": normalized_map_name,
        "map_raw": raw_map_name,
        "tickrate": tickrate,
        "start_tick": start_tick,
        "end_tick": end_tick,
        "includes_grenades": include_grenades,
        "frame_step": frame_step,
        "frames": frames,
    }


def run_index_mode(parser, normalized_map_name, raw_map_name, tickrate):
    rounds = build_rounds(parser, tickrate)
    print(_dumps_json_safe(build_index_result(normalized_map_name, raw_map_name, tickrate, rounds)))


def run_round_mode(parser, argv, normalized_map_name, raw_map_name, tickrate):
    start_tick, end_tick, include_grenades, frame_step = parse_round_args(argv)
    frames = build_round_frames(parser, start_tick, end_tick, include_grenades=include_grenades, frame_step=frame_step)
    print(
        _dumps_json_safe(
            build_round_result(
                normalized_map_name,
                raw_map_name,
                tickrate,
                start_tick,
                end_tick,
                include_grenades,
                frame_step,
                frames,
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
        tickrate = resolve_tickrate(header)

        if mode == "index":
            run_index_mode(parser, normalized_map_name, raw_map_name, tickrate)
            return

        if mode == "round":
            run_round_mode(parser, sys.argv, normalized_map_name, raw_map_name, tickrate)
            return

        print(_dumps_json_safe({"status": "error", "message": f"Unsupported mode: {mode}"}))
    except Exception as error:
        print(_dumps_json_safe({"status": "error", "message": str(error)}))


if __name__ == "__main__":
    main()
