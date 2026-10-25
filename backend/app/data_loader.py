"""
Loads the saved Elexon data (see scripts/fetch_data.py) into simple
Python dictionaries so the analysis code can look values up quickly.
"""

import json
import os
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def parse_time(text):
    # Elexon times look like "2026-01-05T11:30:00Z" (always UTC)
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def load_actuals():
    """Returns {startTime (UTC datetime): generation in MW}"""
    with open(os.path.join(DATA_DIR, "actuals.json")) as f:
        rows = json.load(f)

    actuals = {}
    for row in rows:
        actuals[parse_time(row["startTime"])] = row["generation"]
    return actuals


def load_forecasts():
    """Returns {publishTime: {startTime: generation in MW}}, all UTC datetimes"""
    with open(os.path.join(DATA_DIR, "forecasts.json")) as f:
        rows = json.load(f)

    forecasts = {}
    for row in rows:
        publish_time = parse_time(row["publishTime"])
        start_time = parse_time(row["startTime"])
        if publish_time not in forecasts:
            forecasts[publish_time] = {}
        forecasts[publish_time][start_time] = row["generation"]
    return forecasts
