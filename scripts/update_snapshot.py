#!/usr/bin/env python3
"""Actualiza las copias locales de respaldo con datos reales de OpenF1."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from f1_data import F1Data  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=datetime.now(timezone.utc).year)
    args = parser.parse_args()
    service = F1Data(cache_ttl=0)
    season = service.get_season(args.year)
    if season.get("snapshot"):
        raise SystemExit("No se pudo actualizar: la fuente sigue sin estar disponible.")
    output = ROOT / "data"
    output.mkdir(exist_ok=True)
    with (output / f"season-{args.year}.json").open("w", encoding="utf-8") as handle:
        json.dump(season, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"Guardado season-{args.year}.json ({len(season['races'])} carreras)")

    now = datetime.now(timezone.utc)
    completed = []
    for race in season["races"]:
        start = datetime.fromisoformat(f"{race['date']}T{race.get('time', '23:59:59Z').replace('Z', '+00:00')}")
        if start < now:
            completed.append(race)
    for race in completed[-1:]:
        race_data = service.get_race(args.year, race["round"])
        if race_data.get("snapshot"):
            continue
        with (output / f"race-{args.year}-{race['round']}.json").open("w", encoding="utf-8") as handle:
            json.dump(race_data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        print(f"Guardado race-{args.year}-{race['round']}.json ({len(race_data['results'])} resultados)")


if __name__ == "__main__":
    main()
