"""
Downloads the wind data we need from the Elexon BMRS API and saves it as JSON
files in backend/data. Run this once (or again if you want fresh data):

    python scripts/fetch_data.py

Window used in the app:
  - purchase decisions are made on 1 Jan 2026 to 31 Jan 2026
  - so delivery days are 2 Jan 2026 to 1 Feb 2026
"""

import json
import os
from datetime import datetime, timedelta

import requests

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"

# forecasts: we take a few extra days before the first decision so that
# early January decisions always have a forecast to pick from
FORECAST_PUBLISH_FROM = datetime(2025, 12, 30)
FORECAST_PUBLISH_TO = datetime(2026, 2, 2)

# actuals: settlement dates around the delivery window (we filter exact times later)
ACTUAL_DATE_FROM = "2026-01-01"
ACTUAL_DATE_TO = "2026-02-02"

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def get_json(url, params):
    # small retry loop because the API sometimes gives a timeout
    for attempt in range(3):
        try:
            response = requests.get(url, params=params, timeout=60)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as error:
            print(f"  request failed (attempt {attempt + 1}): {error}")
    raise RuntimeError(f"Could not download data from {url}")


def fetch_forecasts():
    print("Downloading WINDFOR forecasts...")
    rows = []
    start = FORECAST_PUBLISH_FROM
    # download one week at a time so each response stays small
    while start < FORECAST_PUBLISH_TO:
        end = min(start + timedelta(days=7), FORECAST_PUBLISH_TO)
        params = {
            "publishDateTimeFrom": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publishDateTimeTo": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        data = get_json(f"{BASE_URL}/WINDFOR/stream", params)
        print(f"  {params['publishDateTimeFrom']} -> {params['publishDateTimeTo']}: {len(data)} rows")
        for item in data:
            rows.append({
                "publishTime": item["publishTime"],
                "startTime": item["startTime"],
                "generation": item["generation"],
            })
        start = end

    # the weekly chunks touch at the edges, so remove any duplicates
    unique = {}
    for row in rows:
        unique[(row["publishTime"], row["startTime"])] = row
    rows = sorted(unique.values(), key=lambda r: (r["publishTime"], r["startTime"]))
    return rows


def fetch_actuals():
    print("Downloading FUELHH actual wind generation...")
    params = {
        "settlementDateFrom": ACTUAL_DATE_FROM,
        "settlementDateTo": ACTUAL_DATE_TO,
        "fuelType": "WIND",
    }
    data = get_json(f"{BASE_URL}/FUELHH/stream", params)

    # keep only WIND (the filter should already do this) and, if a period
    # was published more than once, keep the latest version
    latest = {}
    for item in data:
        if item.get("fuelType") != "WIND":
            continue
        key = item["startTime"]
        if key not in latest or item["publishTime"] > latest[key]["publishTime"]:
            latest[key] = item

    rows = []
    for item in latest.values():
        rows.append({
            "startTime": item["startTime"],
            "generation": item["generation"],
        })
    rows.sort(key=lambda r: r["startTime"])
    print(f"  {len(rows)} rows")
    return rows


def save(rows, file_name):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, file_name)
    with open(path, "w") as f:
        json.dump(rows, f)
    print(f"Saved {len(rows)} rows to {path}")


if __name__ == "__main__":
    save(fetch_forecasts(), "forecasts.json")
    save(fetch_actuals(), "actuals.json")
