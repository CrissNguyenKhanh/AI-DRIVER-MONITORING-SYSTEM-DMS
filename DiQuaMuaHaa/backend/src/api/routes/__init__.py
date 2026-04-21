"""Route entrypoints exposed through the structured src package."""

from .api import app, socketio

__all__ = ["app", "socketio"]

