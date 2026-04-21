"""Shared backend exception types for the structured package."""


class DMSException(Exception):
    """Base exception for DMS-related failures."""


class ModelNotLoadedException(DMSException):
    """Raised when an ML artifact is unavailable."""


class ValidationException(DMSException):
    """Raised when request input is invalid."""

