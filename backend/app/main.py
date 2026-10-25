from datetime import date

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app import analysis

app = FastAPI(title="Wind Forecast Desk API")

# the React dev server runs on a different port, so allow it to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# "HH:MM" in 24 hour format, e.g. 09:00 or 17:45
TIME_PATTERN = r"^([01][0-9]|2[0-3]):[0-5][0-9]$"


def check_decision_date(decision_date):
    if decision_date < analysis.FIRST_DECISION_DATE or decision_date > analysis.LAST_DECISION_DATE:
        raise HTTPException(
            status_code=400,
            detail=f"decision_date must be between {analysis.FIRST_DECISION_DATE} and {analysis.LAST_DECISION_DATE}",
        )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/info")
def info():
    return analysis.get_data_info()


@app.get("/api/forecast")
def forecast(
    decision_date: date = Query(..., description="Day the purchase decision is made, e.g. 2026-01-10"),
    decision_time: str = Query(analysis.DEFAULT_DECISION_TIME, pattern=TIME_PATTERN, description="UK time, HH:MM"),
):
    check_decision_date(decision_date)
    return analysis.get_decision_view(decision_date, decision_time)


@app.get("/api/accuracy")
def accuracy(
    decision_time: str = Query(analysis.DEFAULT_DECISION_TIME, pattern=TIME_PATTERN, description="UK time, HH:MM"),
):
    return analysis.get_accuracy(decision_time)
