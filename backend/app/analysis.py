"""
All the forecast logic and error calculations live here.

Terms used in this file:
  decision time  - the moment the team places its day-ahead order
                   (default 09:00 UK time, before the 09:20 / 09:50 auctions close)
  delivery day   - the day after the decision day
  error          - forecast minus actual (MW)
                   positive error = wind came in LOWER than forecast (shortfall)
                   negative error = wind came in HIGHER than forecast (surplus)
"""

import math
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.data_loader import load_actuals, load_forecasts

UK_TZ = ZoneInfo("Europe/London")

FIRST_DECISION_DATE = date(2026, 1, 1)
LAST_DECISION_DATE = date(2026, 1, 31)
DEFAULT_DECISION_TIME = "09:00"

HISTOGRAM_BIN_MW = 500
HORIZON_BUCKET_HOURS = 6

# load the data once when the server starts
ACTUALS = load_actuals()
FORECASTS = load_forecasts()
PUBLISH_TIMES = sorted(FORECASTS.keys())


# ---------- small helpers ----------

def round1(value):
    if value is None:
        return None
    return round(value, 1)


def to_iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def uk_time_label(dt):
    return dt.astimezone(UK_TZ).strftime("%H:%M")


def uk_datetime_label(dt):
    return dt.astimezone(UK_TZ).strftime("%d %b %Y %H:%M")


def get_decision_dates():
    dates = []
    day = FIRST_DECISION_DATE
    while day <= LAST_DECISION_DATE:
        dates.append(day)
        day += timedelta(days=1)
    return dates


def decision_time_to_utc(decision_date, decision_time):
    """decision_time is a "HH:MM" string in UK local time"""
    hour, minute = decision_time.split(":")
    local_time = datetime.combine(decision_date, time(int(hour), int(minute)), tzinfo=UK_TZ)
    return local_time.astimezone(timezone.utc)


def get_delivery_hours(delivery_date):
    """All hourly start times (UTC) of a UK delivery day.
    Normally 24 hours, but this also works for clock-change days."""
    start = datetime.combine(delivery_date, time(0, 0), tzinfo=UK_TZ).astimezone(timezone.utc)
    end = datetime.combine(delivery_date + timedelta(days=1), time(0, 0), tzinfo=UK_TZ).astimezone(timezone.utc)
    hours = []
    current = start
    while current < end:
        hours.append(current)
        current += timedelta(hours=1)
    return hours


def get_latest_forecast(target_time, decision_utc):
    """Latest forecast for target_time that was already published at decision_utc.
    Returns (publish_time, generation) or (None, None) if nothing is available."""
    for publish_time in reversed(PUBLISH_TIMES):
        if publish_time > decision_utc:
            continue
        if target_time in FORECASTS[publish_time]:
            return publish_time, FORECASTS[publish_time][target_time]
    return None, None


def get_next_publish_after(decision_utc):
    for publish_time in PUBLISH_TIMES:
        if publish_time > decision_utc:
            return publish_time
    return None


def percentile(values, p):
    """Linear interpolation percentile (same as numpy's default)"""
    if not values:
        return None
    values = sorted(values)
    position = (len(values) - 1) * p / 100
    lower = math.floor(position)
    upper = min(lower + 1, len(values) - 1)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


def calculate_error_metrics(forecasts, actuals):
    """forecasts and actuals are lists of MW values (same length, same order)"""
    errors = [f - a for f, a in zip(forecasts, actuals)]
    count = len(errors)
    if count == 0:
        return None

    total_actual = sum(actuals)
    abs_errors = [abs(e) for e in errors]

    return {
        "count": count,
        "mae": round1(sum(abs_errors) / count),
        "rmse": round1(math.sqrt(sum(e * e for e in errors) / count)),
        "bias": round1(sum(errors) / count),
        # WAPE = total absolute error / total actual. Better than MAPE here
        # because MAPE blows up when actual wind is close to zero.
        "wape": round1(sum(abs_errors) / total_actual * 100) if total_actual > 0 else None,
        "p10": round1(percentile(errors, 10)),
        "p50": round1(percentile(errors, 50)),
        "p90": round1(percentile(errors, 90)),
        "max_shortfall": round1(max(errors)),
        "max_surplus": round1(min(errors)),
    }


# ---------- forecasts used for each decision ----------

@lru_cache(maxsize=64)
def build_decision_rows(decision_time):
    """One row per delivery hour for every January decision:
    which forecast the team would have seen and what actually happened."""
    rows = []
    for decision_date in get_decision_dates():
        decision_utc = decision_time_to_utc(decision_date, decision_time)
        delivery_date = decision_date + timedelta(days=1)

        for hour in get_delivery_hours(delivery_date):
            publish_time, forecast = get_latest_forecast(hour, decision_utc)
            actual = ACTUALS.get(hour)
            horizon = None
            if publish_time is not None:
                horizon = (hour - publish_time).total_seconds() / 3600

            rows.append({
                "decision_date": decision_date,
                "delivery_date": delivery_date,
                "time": hour,
                "publish_time": publish_time,
                "forecast": forecast,
                "actual": actual,
                "horizon": horizon,
            })
    return rows


def get_complete_rows(rows):
    return [r for r in rows if r["forecast"] is not None and r["actual"] is not None]


# ---------- API: day-ahead view ----------

def get_decision_view(decision_date, decision_time):
    decision_utc = decision_time_to_utc(decision_date, decision_time)
    delivery_date = decision_date + timedelta(days=1)

    # January error spread is used to draw a "likely range" around the forecast
    overall = get_accuracy(decision_time)["overall"]
    p10 = overall["p10"] if overall else 0
    p90 = overall["p90"] if overall else 0

    points = []
    publish_times_used = set()
    for hour in get_delivery_hours(delivery_date):
        publish_time, forecast = get_latest_forecast(hour, decision_utc)
        actual = ACTUALS.get(hour)

        point = {
            "time": to_iso(hour),
            "label": uk_time_label(hour),
            "forecast": forecast,
            "actual": actual,
            "low": None,
            "high": None,
            "error": None,
        }
        if forecast is not None:
            publish_times_used.add(publish_time)
            # actual = forecast - error, so the P10..P90 error range
            # becomes the range below (wind cannot be negative)
            point["low"] = round1(max(0, forecast - p90))
            point["high"] = round1(max(0, forecast - p10))
            if actual is not None:
                point["error"] = forecast - actual
        points.append(point)

    forecast_values = [p["forecast"] for p in points if p["forecast"] is not None]
    actual_values = [p["actual"] for p in points if p["actual"] is not None]
    complete = [p for p in points if p["forecast"] is not None and p["actual"] is not None]

    summary = None
    if forecast_values:
        min_point = min((p for p in points if p["forecast"] is not None), key=lambda p: p["forecast"])
        max_point = max((p for p in points if p["forecast"] is not None), key=lambda p: p["forecast"])
        summary = {
            "forecast_avg": round1(sum(forecast_values) / len(forecast_values)),
            "forecast_min": min_point["forecast"],
            "forecast_min_time": min_point["label"],
            "forecast_max": max_point["forecast"],
            "forecast_max_time": max_point["label"],
            # hourly values in MW, so each one is MWh for that hour
            "forecast_energy_mwh": round1(sum(forecast_values)),
            "actual_avg": round1(sum(actual_values) / len(actual_values)) if actual_values else None,
            "actual_energy_mwh": round1(sum(p["actual"] for p in complete)) if complete else None,
            "hours_with_forecast": len(forecast_values),
            "hours_total": len(points),
        }

    next_publish = get_next_publish_after(decision_utc)

    return {
        "decision_date": decision_date.isoformat(),
        "decision_time": decision_time,
        "decision_time_utc": to_iso(decision_utc),
        "delivery_date": delivery_date.isoformat(),
        "forecast_publish_times": [to_iso(t) for t in sorted(publish_times_used)],
        "forecast_publish_labels": [uk_datetime_label(t) for t in sorted(publish_times_used)],
        "next_publish_label": uk_datetime_label(next_publish) if next_publish else None,
        "range_note": {"p10": p10, "p90": p90},
        "summary": summary,
        "day_metrics": calculate_error_metrics(
            [p["forecast"] for p in complete], [p["actual"] for p in complete]
        ),
        "points": points,
    }


# ---------- API: accuracy view ----------

def make_histogram(errors):
    if not errors:
        return []
    width = HISTOGRAM_BIN_MW
    low = math.floor(min(errors) / width) * width
    high = math.floor(max(errors) / width) * width + width

    bins = []
    start = low
    while start < high:
        count = len([e for e in errors if start <= e < start + width])
        bins.append({"from": start, "to": start + width, "label": f"{start} to {start + width}", "count": count})
        start += width
    return bins


@lru_cache(maxsize=1)
def get_horizon_accuracy():
    """Error vs forecast horizon (hours between publish time and target time),
    using every forecast for the delivery window, not just the 09:00 ones."""
    first_hour = get_delivery_hours(FIRST_DECISION_DATE + timedelta(days=1))[0]
    last_hour = get_delivery_hours(LAST_DECISION_DATE + timedelta(days=1))[-1]

    buckets = {}
    for publish_time in PUBLISH_TIMES:
        for start_time, forecast in FORECASTS[publish_time].items():
            if start_time < first_hour or start_time > last_hour:
                continue
            actual = ACTUALS.get(start_time)
            if actual is None:
                continue
            horizon = (start_time - publish_time).total_seconds() / 3600
            if horizon < 0:
                # values for times already in the past, not a real forecast
                continue
            bucket = int(horizon // HORIZON_BUCKET_HOURS)
            if bucket not in buckets:
                buckets[bucket] = {"forecasts": [], "actuals": []}
            buckets[bucket]["forecasts"].append(forecast)
            buckets[bucket]["actuals"].append(actual)

    result = []
    for bucket in sorted(buckets):
        start = bucket * HORIZON_BUCKET_HOURS
        metrics = calculate_error_metrics(buckets[bucket]["forecasts"], buckets[bucket]["actuals"])
        result.append({
            "label": f"{start}-{start + HORIZON_BUCKET_HOURS}h",
            "from_hours": start,
            "to_hours": start + HORIZON_BUCKET_HOURS,
            "mae": metrics["mae"],
            "rmse": metrics["rmse"],
            "bias": metrics["bias"],
            "count": metrics["count"],
        })
    return result


@lru_cache(maxsize=64)
def get_accuracy(decision_time):
    rows = build_decision_rows(decision_time)
    complete = get_complete_rows(rows)

    overall = calculate_error_metrics([r["forecast"] for r in complete], [r["actual"] for r in complete])
    if overall:
        overall["actual_avg"] = round1(sum(r["actual"] for r in complete) / len(complete))

    # per delivery day
    daily = []
    for decision_date in get_decision_dates():
        day_rows = [r for r in complete if r["decision_date"] == decision_date]
        metrics = calculate_error_metrics([r["forecast"] for r in day_rows], [r["actual"] for r in day_rows])
        if metrics is None:
            continue
        daily.append({
            "decision_date": decision_date.isoformat(),
            "delivery_date": (decision_date + timedelta(days=1)).isoformat(),
            "label": (decision_date + timedelta(days=1)).strftime("%d %b"),
            "mae": metrics["mae"],
            "bias": metrics["bias"],
            "forecast_avg": round1(sum(r["forecast"] for r in day_rows) / len(day_rows)),
            "actual_avg": round1(sum(r["actual"] for r in day_rows) / len(day_rows)),
        })

    # per hour of the delivery day (UK time)
    by_hour = []
    hour_labels = sorted(set(uk_time_label(r["time"]) for r in complete))
    for label in hour_labels:
        hour_rows = [r for r in complete if uk_time_label(r["time"]) == label]
        metrics = calculate_error_metrics([r["forecast"] for r in hour_rows], [r["actual"] for r in hour_rows])
        by_hour.append({"label": label, "mae": metrics["mae"], "bias": metrics["bias"], "count": metrics["count"]})

    errors = [r["forecast"] - r["actual"] for r in complete]
    horizons = [r["horizon"] for r in complete]

    return {
        "decision_time": decision_time,
        "first_delivery_date": (FIRST_DECISION_DATE + timedelta(days=1)).isoformat(),
        "last_delivery_date": (LAST_DECISION_DATE + timedelta(days=1)).isoformat(),
        "hours_total": len(rows),
        "hours_used": len(complete),
        "hours_missing": len(rows) - len(complete),
        "day_ahead_horizon": {
            "min": round1(min(horizons)) if horizons else None,
            "max": round1(max(horizons)) if horizons else None,
        },
        "overall": overall,
        "daily": daily,
        "by_hour": by_hour,
        "histogram": make_histogram(errors),
        "horizon": get_horizon_accuracy(),
        "scatter": [{"forecast": r["forecast"], "actual": r["actual"]} for r in complete],
    }


# ---------- API: data info ----------

def get_data_info():
    actual_times = sorted(ACTUALS.keys())

    # count how often each publish time of day happens, so we can show the
    # regular schedule separately from one-off extra runs
    counts = {}
    for t in PUBLISH_TIMES:
        label = uk_time_label(t)
        counts[label] = counts.get(label, 0) + 1
    publish_hours = sorted(label for label in counts if counts[label] >= 5)
    extra_runs = [uk_datetime_label(t) for t in PUBLISH_TIMES if uk_time_label(t) not in publish_hours]
    return {
        "first_decision_date": FIRST_DECISION_DATE.isoformat(),
        "last_decision_date": LAST_DECISION_DATE.isoformat(),
        "default_decision_time": DEFAULT_DECISION_TIME,
        "decision_dates": [d.isoformat() for d in get_decision_dates()],
        "forecast_runs": len(PUBLISH_TIMES),
        "forecast_rows": sum(len(v) for v in FORECASTS.values()),
        "first_publish": to_iso(PUBLISH_TIMES[0]) if PUBLISH_TIMES else None,
        "last_publish": to_iso(PUBLISH_TIMES[-1]) if PUBLISH_TIMES else None,
        "publish_times_uk": publish_hours,
        "extra_publish_runs": extra_runs,
        "actual_rows": len(actual_times),
        "first_actual": to_iso(actual_times[0]) if actual_times else None,
        "last_actual": to_iso(actual_times[-1]) if actual_times else None,
    }
