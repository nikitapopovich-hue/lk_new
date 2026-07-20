"""Обратная совместимость: используйте app.integrations.geocoding."""

from app.integrations.geocoding import GeoPoint, geocode_address

__all__ = ["GeoPoint", "geocode_address"]
