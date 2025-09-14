"""
Configuration Package
Contains all configuration files for the collection-agnostic system
"""
from .settings import get_settings, validate_environment
from .collections import get_collection_config, get_all_collections

__all__ = [
    'get_settings',
    'validate_environment', 
    'get_collection_config',
    'get_all_collections'
]
