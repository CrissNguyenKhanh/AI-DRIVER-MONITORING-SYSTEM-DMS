from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass


@dataclass(frozen=True)
class PerclosResult:
    value: float | None
    observed_seconds: float
    closed_seconds: float


class TimestampPerclos:
    """Time-weighted PERCLOS with gaps excluded instead of guessed open/closed."""

    def __init__(self, window_seconds: float, min_observation_seconds: float, max_gap_seconds: float):
        if window_seconds <= 0 or min_observation_seconds < 0 or max_gap_seconds <= 0:
            raise ValueError("invalid PERCLOS timing configuration")
        self.window_seconds = window_seconds
        self.min_observation_seconds = min_observation_seconds
        self.max_gap_seconds = max_gap_seconds
        self._intervals: deque[tuple[float, float, bool]] = deque()
        self._last_timestamp: float | None = None
        self._last_closed: bool | None = None

    def reset(self) -> None:
        self._intervals.clear()
        self._last_timestamp = None
        self._last_closed = None

    def mark_missing(self, timestamp: float) -> PerclosResult:
        self._validate_timestamp(timestamp)
        self._append_previous_interval(timestamp)
        self._last_timestamp = None
        self._last_closed = None
        return self.value(timestamp)

    def update(self, timestamp: float, closed: bool) -> PerclosResult:
        self._validate_timestamp(timestamp)
        self._append_previous_interval(timestamp)
        self._last_timestamp = timestamp
        self._last_closed = bool(closed)
        return self.value(timestamp)

    def value(self, timestamp: float) -> PerclosResult:
        self._validate_timestamp(timestamp)
        window_start = timestamp - self.window_seconds
        while self._intervals and self._intervals[0][1] <= window_start:
            self._intervals.popleft()

        observed = 0.0
        closed = 0.0
        for start, end, is_closed in self._intervals:
            duration = max(0.0, end - max(start, window_start))
            observed += duration
            if is_closed:
                closed += duration
        ratio = closed / observed if observed >= self.min_observation_seconds and observed > 0 else None
        return PerclosResult(value=ratio, observed_seconds=observed, closed_seconds=closed)

    @staticmethod
    def _validate_timestamp(timestamp: float) -> None:
        if not math.isfinite(timestamp) or timestamp < 0:
            raise ValueError("timestamp must be a non-negative finite number")

    def _append_previous_interval(self, timestamp: float) -> None:
        if self._last_timestamp is None or self._last_closed is None:
            return
        delta = timestamp - self._last_timestamp
        if delta < 0:
            self.reset()
            return
        if 0 < delta <= self.max_gap_seconds:
            self._intervals.append((self._last_timestamp, timestamp, self._last_closed))
