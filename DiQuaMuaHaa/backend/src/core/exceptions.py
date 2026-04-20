"""Custom exceptions for the DMS backend."""


class DMSException(Exception):
    """Base exception for all DMS errors."""
    pass


class ModelNotLoadedException(DMSException):
    """Raised when a required ML model is not loaded."""
    pass


class DatabaseException(DMSException):
    """Raised when database operations fail."""
    pass


class TelegramAPIException(DMSException):
    """Raised when Telegram API calls fail."""
    pass


class IdentityVerificationException(DMSException):
    """Raised during identity verification errors."""
    pass


class ImageProcessingException(DMSException):
    """Raised when image processing fails."""
    pass


class ValidationException(DMSException):
    """Raised when input validation fails."""
    pass
