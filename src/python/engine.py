import sys
import json
import re
from demoparser2 import DemoParser
import math

DEFAULT_TICKRATE = 64.0


def normalize_map_name(raw_map_name):
    if not isinstance(raw_map_name, str):
        return "Unknown"

    map_name = raw_map_name.strip()
    if not map_name:
        return "Unknown"

    # Keep naming consistent with radar file names.
    map_name = map_name.replace("_scrimmagemap", "")

    # Remove workshop identifier prefix: workshop/<id>/<map_name>
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
        if (
            isinstance(event_tuple, tuple)
            and len(event_tuple) >= 2
            and event_tuple[0] == event_name
        ):
            events_df = event_tuple[1]
            break

    if events_df is None or events_df.empty or "tick" not in events_df.columns:
        return []

    ticks = []
    for tick in events_df["tick"].dropna().tolist():
        try:
            ticks.append(int(tick))
        except Exception:
            continue

    return sorted(set(ticks))


def resolve_tickrate(header):
    if not isinstance(header, dict):
        return DEFAULT_TICKRATE

    tick_time_key_candidates = [
        ("playback_ticks", "playback_time"),
        ("playbackTicks", "playbackTime"),
        ("playbackticks", "playbacktime"),
    ]

    for ticks_key, time_key in tick_time_key_candidates:
        ticks = header.get(ticks_key)
        playback_time = header.get(time_key)
        try:
            ticks_value = float(ticks)
            time_value = float(playback_time)
            if ticks_value > 0 and time_value > 0:
                return ticks_value / time_value
        except Exception:
            continue

    return DEFAULT_TICKRATE


def build_rounds(parser, tickrate):
    # Prefer freeze end as round "start of action", fallback to round_start.
    round_start_ticks = parse_event_ticks(parser, "round_freeze_end")
    if not round_start_ticks:
        round_start_ticks = parse_event_ticks(parser, "round_start")

    if not round_start_ticks:
        return []

    round_start_ticks = sorted(set(round_start_ticks))
    first_round_start_tick = round_start_ticks[0]
    round_end_ticks = parse_event_ticks(parser, "round_end")
    rounds = []

    for index, start_tick in enumerate(round_start_ticks):
        next_start_tick = (
            round_start_ticks[index + 1]
            if index + 1 < len(round_start_ticks)
            else None
        )
        if next_start_tick is None:
            candidate_end_ticks = [tick for tick in round_end_ticks if tick >= start_tick]
            end_tick = max(candidate_end_ticks) if candidate_end_ticks else start_tick
        else:
            candidate_end_ticks = [
                tick for tick in round_end_ticks if start_tick <= tick < next_start_tick
            ]
            if candidate_end_ticks:
                end_tick = max(candidate_end_ticks)
            else:
                end_tick = next_start_tick - 1

        rounds.append(
            {
                "number": index + 1,
                "start_tick": int(start_tick),
                "end_tick": int(end_tick),
                "start_seconds": round(
                    max(float(start_tick - first_round_start_tick), 0.0) / tickrate, 3
                ),
                "end_seconds": round(
                    max(float(end_tick - first_round_start_tick), 0.0) / tickrate, 3
                ),
                "duration_seconds": round(
                    max(float(end_tick - start_tick), 0.0) / tickrate, 3
                ),
            }
        )

    return rounds

def _is_finite_number(value):
    try:
        number = float(value)
        return math.isfinite(number)
    except Exception:
        return False


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


def _find_column(columns, candidates):
    for candidate in candidates:
        if candidate in columns:
            return candidate
    return None


def build_round_grenades_by_tick(parser, start_tick, end_tick):
    try:
        grenades_df = parser.parse_grenades(grenades=False)
    except Exception:
        return {}

    if grenades_df is None or grenades_df.empty:
        return {}

    columns = list(grenades_df.columns)
    tick_column = _find_column(columns, ["tick", "Tick"])
    x_column = _find_column(columns, ["x", "X"])
    y_column = _find_column(columns, ["y", "Y"])
    z_column = _find_column(columns, ["z", "Z"])
    entity_id_column = _find_column(
        columns,
        ["grenade_entity_id", "entityid", "entity_id"],
    )
    grenade_type_column = _find_column(columns, ["grenade_type", "grenade_name", "weapon"])
    thrower_name_column = _find_column(columns, ["name", "user_name", "thrower_name"])
    thrower_steamid_column = _find_column(columns, ["steamid", "user_steamid", "thrower_steamid"])

    required_columns = [
        tick_column,
        x_column,
        y_column,
        z_column,
        entity_id_column,
        grenade_type_column,
    ]
    if any(column is None for column in required_columns):
        return {}

    selected_columns = [
        tick_column,
        x_column,
        y_column,
        z_column,
        entity_id_column,
        grenade_type_column,
    ]
    if thrower_name_column is not None:
        selected_columns.append(thrower_name_column)
    if thrower_steamid_column is not None:
        selected_columns.append(thrower_steamid_column)

    filtered_df = grenades_df[selected_columns]
    filtered_df = filtered_df[
        (filtered_df[tick_column] >= start_tick) & (filtered_df[tick_column] <= end_tick)
    ]

    grenades_by_tick = {}
    seen_tick_entity = set()

    for row in filtered_df.to_dict(orient="records"):
        tick_value = _to_int_or_none(row.get(tick_column))
        entity_id_value = _to_int_or_none(row.get(entity_id_column))
        x_value = _to_float_or_none(row.get(x_column))
        y_value = _to_float_or_none(row.get(y_column))
        z_value = _to_float_or_none(row.get(z_column))
        grenade_type_value = row.get(grenade_type_column)

        if tick_value is None or entity_id_value is None:
            continue

        if (
            x_value is None
            or y_value is None
            or z_value is None
            or not _is_finite_number(x_value)
            or not _is_finite_number(y_value)
            or not _is_finite_number(z_value)
        ):
            continue

        unique_key = (tick_value, entity_id_value)
        if unique_key in seen_tick_entity:
            continue
        seen_tick_entity.add(unique_key)

        grenade_entry = {
            "entity_id": entity_id_value,
            "grenade_type": str(grenade_type_value or "Unknown"),
            "x": x_value,
            "y": y_value,
            "z": z_value,
        }

        if thrower_name_column is not None:
            thrower_name = row.get(thrower_name_column)
            if isinstance(thrower_name, str) and thrower_name.strip():
                grenade_entry["thrower_name"] = thrower_name

        if thrower_steamid_column is not None:
            thrower_steamid = row.get(thrower_steamid_column)
            if thrower_steamid is not None:
                grenade_entry["thrower_steamid"] = str(thrower_steamid)

        grenades_by_tick.setdefault(tick_value, []).append(grenade_entry)

    return grenades_by_tick


def build_round_frames(parser, start_tick, end_tick, include_grenades=True):
    # Extract tick-level player data (include Z for lower/upper floor logic).
    # Prefer richer player props for overlay (id + active weapon), fallback to core props.
    tick_props = [
        "X",
        "Y",
        "Z",
        "team_num",
        "is_alive",
        "yaw",
        "user_id",
        "name",
        "active_weapon_name",
        "weapon_name",
    ]
    try:
        df = parser.parse_ticks(
            tick_props,
            ticks=range(start_tick, end_tick + 1),
        )
    except Exception:
        df = parser.parse_ticks(
            ["X", "Y", "Z", "team_num", "is_alive", "yaw"],
            ticks=range(start_tick, end_tick + 1),
        )

    # Keep only alive T/CT players for rendering.
    alive_df = df[(df["is_alive"] == True) & (df["team_num"].isin([2, 3]))]
    players_by_tick = {}

    if not alive_df.empty:
        player_columns = ["X", "Y", "Z", "team_num", "yaw"]
        optional_columns = ["user_id", "name", "active_weapon_name", "weapon_name"]
        for column in optional_columns:
            if column in alive_df.columns:
                player_columns.append(column)

        grouped = alive_df.groupby("tick", sort=True)
        for tick, tick_df in grouped:
            players = tick_df[player_columns].to_dict(orient="records")
            for player in players:
                if "active_weapon_name" not in player and "weapon_name" in player:
                    player["active_weapon_name"] = player.get("weapon_name")
                if "user_id" in player:
                    try:
                        player["user_id"] = int(player["user_id"])
                    except Exception:
                        pass
            players_by_tick[int(tick)] = players

    grenades_by_tick = {}
    if include_grenades:
        grenades_by_tick = build_round_grenades_by_tick(parser, start_tick, end_tick)

    # Keep every tick to preserve real-time playback even when no alive players exist.
    frames = []
    for tick in range(start_tick, end_tick + 1):
        frame = {
            "tick": int(tick),
            "players": players_by_tick.get(int(tick), []),
        }
        if include_grenades:
            frame["grenades"] = grenades_by_tick.get(int(tick), [])
        frames.append(frame)

    return frames


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "Missing demo file path"}))
        return

    demo_path = sys.argv[1]

    mode = "index"
    if len(sys.argv) >= 3:
        mode = sys.argv[2]

    try:
        parser = DemoParser(demo_path)
        header = parser.parse_header()
        raw_map_name = header.get("map_name", "Unknown")
        normalized_map_name = normalize_map_name(raw_map_name)
        tickrate = resolve_tickrate(header)

        if mode == "index":
            rounds = build_rounds(parser, tickrate)
            result = {
                "status": "success",
                "mode": "index",
                "map": normalized_map_name,
                "map_raw": raw_map_name,
                "tickrate": tickrate,
                "rounds": rounds,
            }
            print(json.dumps(result))
            return

        if mode == "round":
            if len(sys.argv) < 5:
                print(
                    json.dumps(
                        {
                            "status": "error",
                            "message": "Missing round range arguments: start_tick end_tick",
                        }
                    )
                )
                return

            start_tick = int(sys.argv[3])
            end_tick = int(sys.argv[4])
            include_grenades = True
            if len(sys.argv) >= 6:
                include_grenades_text = str(sys.argv[5]).strip().lower()
                include_grenades = include_grenades_text not in ("0", "false", "no")
            if end_tick < start_tick:
                print(
                    json.dumps(
                        {
                            "status": "error",
                            "message": "Invalid round range: end_tick < start_tick",
                        }
                    )
                )
                return

            frames = build_round_frames(
                parser,
                start_tick,
                end_tick,
                include_grenades=include_grenades,
            )
            result = {
                "status": "success",
                "mode": "round",
                "map": normalized_map_name,
                "map_raw": raw_map_name,
                "tickrate": tickrate,
                "start_tick": start_tick,
                "end_tick": end_tick,
                "includes_grenades": include_grenades,
                "frames": frames,
            }
            print(json.dumps(result))
            return

        print(json.dumps({"status": "error", "message": f"Unsupported mode: {mode}"}))

    except Exception as error:
        print(json.dumps({"status": "error", "message": str(error)}))


if __name__ == "__main__":
    main()
