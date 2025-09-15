"""
AI Performance Configuration Settings
Optimizes AI processing for maximum speed and efficiency
"""

# Performance Optimization Settings
AI_PERFORMANCE_CONFIG = {
    # Concurrent Processing
    'MAX_CONCURRENT_AI_REQUESTS': 8,  # Increased from 1 (single-threaded)
    'AI_REQUEST_TIMEOUT': 20,  # Reduced from 30s
    'AI_MIN_REQUEST_INTERVAL': 0.1,  # Reduced from 1.0s (10x faster)

    # Caching
    'AI_CACHE_TTL': 3600,  # Cache results for 1 hour
    'ENABLE_AI_CACHING': True,
    'CACHE_URL_CONTENT': True,
    'CACHE_PROMPTS': True,

    # Model Selection for Speed
    'CHATGPT_MODEL_FAST': 'gpt-4o-mini',  # Faster, cheaper model
    'CHATGPT_MODEL_QUALITY': 'gpt-4o',  # Higher quality but slower
    'USE_FAST_MODEL_BY_DEFAULT': True,

    # Content Generation Optimization
    'MAX_TOKENS_FAST': 800,  # Reduced for speed
    'MAX_TOKENS_QUALITY': 1500,  # Higher for quality
    'TEMPERATURE_FAST': 0.3,  # Lower for speed and consistency
    'TEMPERATURE_QUALITY': 0.7,  # Higher for creativity

    # Batch Processing
    'BATCH_SIZE': 10,  # Process 10 products at once
    'MAX_BATCH_SIZE': 20,  # Maximum batch size
    'ENABLE_BATCH_PROCESSING': True,

    # Rate Limiting Optimization
    'OPENAI_RATE_LIMIT_BUFFER': 0.1,  # Minimal buffer
    'RETRY_ATTEMPTS': 2,  # Reduced retry attempts
    'RETRY_BACKOFF_FACTOR': 1.5,  # Faster backoff

    # Content Length Optimization
    'MAX_CONTEXT_LENGTH': 1500,  # Reduced context for speed
    'MAX_DESCRIPTION_LENGTH': 300,  # Shorter descriptions
    'MAX_FEATURES_LENGTH': 200,  # Shorter features
    'MAX_CARE_INSTRUCTIONS_LENGTH': 150,  # Shorter care instructions

    # Connection Pool Settings
    'HTTP_POOL_CONNECTIONS': 20,
    'HTTP_POOL_MAXSIZE': 20,
    'HTTP_MAX_RETRIES': 1,
    'HTTP_TIMEOUT': 15,

    # Quality vs Speed Trade-offs
    'PRIORITIZE_SPEED': True,  # Set to False for higher quality
    'SKIP_URL_CONTENT_FOR_SPEED': False,  # Set to True to skip URL fetching
    'PARALLEL_FIELD_GENERATION': True,  # Generate fields in parallel
}

# Speed Mode Configuration
SPEED_MODE_CONFIG = {
    'model': 'gpt-4o-mini',
    'max_tokens': 500,
    'temperature': 0.2,
    'timeout': 15,
    'min_interval': 0.05,  # 50ms between requests
    'skip_url_content': True,
    'short_prompts': True,
}

# Quality Mode Configuration
QUALITY_MODE_CONFIG = {
    'model': 'gpt-4o',
    'max_tokens': 1200,
    'temperature': 0.6,
    'timeout': 30,
    'min_interval': 0.5,
    'skip_url_content': False,
    'short_prompts': False,
}

# Balanced Mode Configuration
BALANCED_MODE_CONFIG = {
    'model': 'gpt-4o-mini',
    'max_tokens': 800,
    'temperature': 0.4,
    'timeout': 20,
    'min_interval': 0.2,
    'skip_url_content': False,
    'short_prompts': False,
}

def get_ai_config(mode: str = 'balanced'):
    """Get AI configuration based on mode"""
    configs = {
        'speed': SPEED_MODE_CONFIG,
        'quality': QUALITY_MODE_CONFIG,
        'balanced': BALANCED_MODE_CONFIG
    }

    base_config = AI_PERFORMANCE_CONFIG.copy()
    mode_config = configs.get(mode, BALANCED_MODE_CONFIG)

    # Merge configurations
    base_config.update(mode_config)
    return base_config

# Environment Variables for Performance Tuning
PERFORMANCE_ENV_VARS = {
    'AI_PERFORMANCE_MODE': 'balanced',  # speed, balanced, quality
    'AI_ENABLE_CONCURRENT': 'true',
    'AI_CACHE_ENABLED': 'true',
    'AI_BATCH_ENABLED': 'true',
    'AI_MAX_WORKERS': '8',
    'AI_TIMEOUT': '20',
}