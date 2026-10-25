from datetime import date, datetime, timezone

from app import analysis


def test_percentile_matches_simple_cases():
    values = [1, 2, 3, 4, 5]
    assert analysis.percentile(values, 0) == 1
    assert analysis.percentile(values, 50) == 3
    assert analysis.percentile(values, 100) == 5
    assert analysis.percentile(values, 25) == 2
    assert analysis.percentile([], 50) is None


def test_error_metrics():
    forecasts = [110, 90, 100]
    actuals = [100, 100, 100]
    metrics = analysis.calculate_error_metrics(forecasts, actuals)

    assert metrics["count"] == 3
    assert metrics["mae"] == round(20 / 3, 1)
    assert metrics["bias"] == 0
    assert metrics["max_shortfall"] == 10
    assert metrics["max_surplus"] == -10
    assert metrics["wape"] == round(20 / 300 * 100, 1)


def test_error_metrics_empty():
    assert analysis.calculate_error_metrics([], []) is None


def test_decision_time_is_uk_time():
    # January is GMT, so UK time is the same as UTC
    assert analysis.decision_time_to_utc(date(2026, 1, 10), "09:00") == datetime(2026, 1, 10, 9, 0, tzinfo=timezone.utc)
    # in summer UK is one hour ahead of UTC
    assert analysis.decision_time_to_utc(date(2026, 7, 10), "09:00") == datetime(2026, 7, 10, 8, 0, tzinfo=timezone.utc)


def test_delivery_day_has_24_hours():
    hours = analysis.get_delivery_hours(date(2026, 1, 11))
    assert len(hours) == 24
    assert hours[0] == datetime(2026, 1, 11, 0, 0, tzinfo=timezone.utc)
    assert hours[-1] == datetime(2026, 1, 11, 23, 0, tzinfo=timezone.utc)


def test_clock_change_days():
    # UK clocks go forward on 29 Mar 2026 (23 hours) and back on 25 Oct 2026 (25 hours)
    assert len(analysis.get_delivery_hours(date(2026, 3, 29))) == 23
    assert len(analysis.get_delivery_hours(date(2026, 10, 25))) == 25


def test_latest_forecast_never_uses_future_forecast():
    decision_utc = analysis.decision_time_to_utc(date(2026, 1, 10), "09:00")
    for hour in analysis.get_delivery_hours(date(2026, 1, 11)):
        publish_time, forecast = analysis.get_latest_forecast(hour, decision_utc)
        assert publish_time is not None
        assert publish_time <= decision_utc
        assert forecast is not None


def test_latest_forecast_picks_newest_one():
    # forecasts are published at 07:30 and 09:30 UTC, so at 09:00 we must get 07:30
    target = datetime(2026, 1, 11, 12, 0, tzinfo=timezone.utc)
    decision_utc = analysis.decision_time_to_utc(date(2026, 1, 10), "09:00")
    publish_time, _ = analysis.get_latest_forecast(target, decision_utc)
    assert publish_time == datetime(2026, 1, 10, 7, 30, tzinfo=timezone.utc)

    # one hour later the 09:30 forecast is available
    decision_utc = analysis.decision_time_to_utc(date(2026, 1, 10), "10:00")
    publish_time, _ = analysis.get_latest_forecast(target, decision_utc)
    assert publish_time == datetime(2026, 1, 10, 9, 30, tzinfo=timezone.utc)


def test_accuracy_covers_whole_january():
    result = analysis.get_accuracy("09:00")
    # 31 decisions x 24 delivery hours
    assert result["hours_total"] == 31 * 24
    assert len(result["daily"]) == 31
    assert result["first_delivery_date"] == "2026-01-02"
    assert result["last_delivery_date"] == "2026-02-01"
    assert sum(b["count"] for b in result["histogram"]) == result["hours_used"]
