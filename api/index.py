# Entry point for Vercel. Vercel runs every Python file in /api as a
# serverless function, so this file just loads the FastAPI app from /backend.
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from app.main import app  # noqa: E402,F401
