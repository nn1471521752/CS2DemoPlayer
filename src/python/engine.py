import sys
import json
from demoparser2 import DemoParser


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "Missing demo file path"}))
        return

    demo_path = sys.argv[1]

    try:
        parser = DemoParser(demo_path)
        header = parser.parse_header()

        # Extract tick-level player data.
        df = parser.parse_ticks(["X", "Y", "team_num", "is_alive", "yaw"])

        # Keep only alive T/CT players.
        df = df[(df["is_alive"] == True) & (df["team_num"].isin([2, 3]))]

        # Keep original full tick timeline (no downsampling / no row cap).
        frames = (
            df.groupby("tick")
            .apply(
                lambda x: x[["X", "Y", "team_num", "yaw"]].to_dict(orient="records"),
                include_groups=False,
            )
            .reset_index(name="players")
            .to_dict(orient="records")
        )

        result = {
            "status": "success",
            "map": header.get("map_name", "Unknown"),
            "frames": frames,
        }
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))


if __name__ == "__main__":
    main()
