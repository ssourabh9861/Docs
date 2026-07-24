#!/usr/bin/env python3
"""
Sync the LeetCode revision site's progress data from the DSA tracker sheet.

Two data sources, in priority order:

1. LIVE  – if the env var TRACKER_GID is set (and the sheet is link-shared as
           "Anyone with the link: Viewer"), the script downloads the tracker
           tab as CSV from Google Sheets and rebuilds progress data from it.
2. LOCAL – otherwise it falls back to scripts/tracker_snapshot.tsv, a committed
           snapshot of the 3rd tab (Topic | Subtopic | Problem | Difficulty |
           Status | Notes).

Outputs (consumed by the static site under docs/):
    docs/data/progress.json  – one record per problem, incl. a stable slug
    docs/data/meta.json      – totals, per-topic rollups, lastSynced timestamp

Run:
    python scripts/sync_tracker.py            # uses snapshot unless TRACKER_GID set
    TRACKER_GID=123456789 python scripts/sync_tracker.py   # live fetch

Config via env:
    SPREADSHEET_ID   default: the DSA tracker id
    TRACKER_GID      the numeric gid of the 3rd tab (from its URL: ...#gid=NNN)
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "scripts" / "tracker_snapshot.tsv"
DATA_DIR = ROOT / "docs" / "data"

SPREADSHEET_ID = os.environ.get(
    "SPREADSHEET_ID", "1EzPE3ub0GH540iiVbf1rKBf1-BMp4tnon_WZem5eBH0"
)
TRACKER_GID = os.environ.get("TRACKER_GID", "").strip()

# Column headers we expect after normalising. The live sheet's 3rd tab uses:
# Topic | Subtopic | Problem | Difficulty | Status | Notes
DIFFICULTY_ORDER = {"Medium": 0, "Hard": 1, "Very Hard": 2}


def slugify(text: str) -> str:
    """Stable, filesystem- and URL-safe slug. MUST match app.js slug rules."""
    text = text.strip().lower()
    text = text.replace("+", " plus ")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def truthy(value: str) -> bool:
    return str(value).strip().upper() in {"TRUE", "YES", "1", "DONE", "SOLVED"}


def rows_from_snapshot():
    with SNAPSHOT.open(encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for r in reader:
            yield r


def rows_from_live():
    url = (
        f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}"
        f"/export?format=csv&gid={TRACKER_GID}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "dsa-tracker-sync"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    reader = csv.reader(io.StringIO(raw))
    rows = list(reader)
    # Find the header row of the tracker table (has "Problem" + "Status").
    header_idx = None
    for i, row in enumerate(rows):
        norm = [c.strip().lower() for c in row]
        if "problem" in norm and ("status" in norm or "solved" in norm):
            header_idx = i
            break
    if header_idx is None:
        raise ValueError("Could not locate the tracker header row in the live CSV.")
    header = [c.strip() for c in rows[header_idx]]
    idx = {name.lower(): j for j, name in enumerate(header)}

    def get(row, *names):
        for n in names:
            j = idx.get(n)
            if j is not None and j < len(row):
                return row[j].strip()
        return ""

    for row in rows[header_idx + 1 :]:
        if not any(c.strip() for c in row):
            continue
        problem = get(row, "problem")
        if not problem:
            continue
        yield {
            "topic": get(row, "topic"),
            "subtopic": get(row, "subtopic") or get(row, "topic"),
            "problem": problem,
            "difficulty": get(row, "difficulty"),
            "status": get(row, "status", "solved"),
            "notes": get(row, "notes"),
        }


def build(records_source, source_label):
    problems = []
    seen_slugs = {}
    for r in records_source:
        topic = (r.get("topic") or "").strip()
        problem = (r.get("problem") or "").strip()
        if not topic or not problem:
            continue
        subtopic = (r.get("subtopic") or topic).strip()
        difficulty = (r.get("difficulty") or "").strip()
        solved = truthy(r.get("status", ""))
        notes = (r.get("notes") or "").strip()

        topic_slug = slugify(topic)
        base = slugify(problem)
        slug = base
        # Disambiguate identical problem names that appear under multiple topics.
        key = (topic_slug, base)
        if key in seen_slugs:
            n = seen_slugs[key] + 1
            seen_slugs[key] = n
            slug = f"{base}-{n}"
        else:
            seen_slugs[key] = 1

        problems.append(
            {
                "topic": topic,
                "topicSlug": topic_slug,
                "subtopic": subtopic,
                "problem": problem,
                "slug": slug,
                "difficulty": difficulty,
                "solved": solved,
                "notes": notes,
            }
        )

    # Per-topic and overall rollups (preserve first-seen topic order).
    topics = []
    topic_index = {}
    for p in problems:
        t = p["topic"]
        if t not in topic_index:
            topic_index[t] = {
                "topic": t,
                "topicSlug": p["topicSlug"],
                "total": 0,
                "solved": 0,
                "subtopics": [],
            }
            topics.append(topic_index[t])
        bucket = topic_index[t]
        bucket["total"] += 1
        bucket["solved"] += 1 if p["solved"] else 0
        if p["subtopic"] not in bucket["subtopics"]:
            bucket["subtopics"].append(p["subtopic"])

    total = len(problems)
    solved = sum(1 for p in problems if p["solved"])
    meta = {
        "lastSynced": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": source_label,
        "total": total,
        "solved": solved,
        "percent": round(100 * solved / total) if total else 0,
        "topics": topics,
        "byDifficulty": _by_difficulty(problems),
    }
    return problems, meta


def _by_difficulty(problems):
    out = {}
    for p in problems:
        d = p["difficulty"] or "Unknown"
        out.setdefault(d, {"solved": 0, "total": 0})
        out[d]["total"] += 1
        out[d]["solved"] += 1 if p["solved"] else 0
    return out


def main():
    if TRACKER_GID:
        try:
            print(f"Fetching live tracker (gid={TRACKER_GID})...", file=sys.stderr)
            problems, meta = build(rows_from_live(), "live")
        except Exception as e:  # noqa: BLE001 - fall back gracefully
            print(f"Live fetch failed ({e}); using committed snapshot.", file=sys.stderr)
            problems, meta = build(rows_from_snapshot(), "snapshot")
    else:
        print("TRACKER_GID not set; using committed snapshot.", file=sys.stderr)
        problems, meta = build(rows_from_snapshot(), "snapshot")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "progress.json").write_text(
        json.dumps(problems, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (DATA_DIR / "meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        f"Wrote {len(problems)} problems "
        f"({meta['solved']} solved / {meta['total']} total, {meta['percent']}%) "
        f"from {meta['source']}.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
