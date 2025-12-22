"""
Collection Detection Module
Detects which collection a product belongs to based on keywords and patterns
"""

import re
from typing import Tuple, Optional, Dict
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

# Simple in-memory cache for detection results (title+url -> result)
_detection_result_cache: Dict[str, Tuple[Optional[str], float]] = {}
_MAX_DETECTION_CACHE_SIZE = 5000


# Collection keywords with weighted patterns
# Format: collection_name: [(pattern, weight, required_words)]
COLLECTION_PATTERNS = {
    'sinks': [
        # High confidence patterns - Kitchen, Laundry, Bar sinks only
        (r'\bkitchen\s*sink\b', 1.5, []),
        (r'\blaundry\s*sink\b', 1.5, []),
        (r'\blaundry\s*tub\b', 1.5, []),
        (r'\bbar\s*sink\b', 1.5, []),
        (r'\butility\s*sink\b', 1.3, []),
        (r'\bprep\s*sink\b', 1.3, []),
        (r'\btrough\s*sink\b', 1.3, []),

        # Sink types
        (r'\bundermount\s*sink\b', 1.2, []),
        (r'\btop\s*mount\s*sink\b', 1.2, []),
        (r'\binset\s*sink\b', 1.2, []),
        (r'\bflush\s*mount\s*sink\b', 1.2, []),
        (r'\bdrop.*in\s*sink\b', 1.2, []),
        (r'\bsingle\s*bowl\s*sink\b', 1.3, []),
        (r'\bdouble\s*bowl\s*sink\b', 1.3, []),
        (r'\b1\.5\s*bowl\s*sink\b', 1.3, []),
        (r'\b1\s*3/4\s*bowl\b', 1.2, []),
        (r'\bsink\s*&\s*drainer\b', 1.4, []),
        (r'\bsink\s*with\s*drainer\b', 1.4, []),
        (r'\bend\s*bowl\s*sink\b', 1.3, []),

        # Generic sink - but excludes mixer/tap
        (r'\bsink\b(?!.*mixer)(?!.*tap)', 1.0, []),
    ],

    'basins': [
        # Bathroom basins (NOT kitchen/laundry sinks)
        (r'\bbasin\b(?!.*mixer)(?!.*tap)', 1.2, []),
        (r'\bwash\s*basin\b', 1.4, []),
        (r'\bbathroom\s*basin\b', 1.5, []),
        (r'\bvessel\s*basin\b', 1.3, []),
        (r'\bpedestal\s*basin\b', 1.4, []),
        (r'\bwall\s*hung\s*basin\b', 1.3, []),
        (r'\bwall\s*basin\b', 1.2, []),
        (r'\bcountertop\s*basin\b', 1.2, []),
        (r'\bsemi\s*recessed\s*basin\b', 1.2, []),
        (r'\bunder.*counter\s*basin\b', 1.2, []),
        (r'\binset\s*basin\b', 1.2, []),
        (r'\babove\s*counter\s*basin\b', 1.2, []),
    ],

    'taps': [
        # Sink mixers and taps - HIGH priority
        (r'\bsink\s*mixer\b', 1.5, []),
        (r'\bbasin\s*mixer\b', 1.5, []),
        (r'\bkitchen\s*mixer\b', 1.4, []),
        (r'\bpull\s*out\s*(sink\s*)?mixer\b', 1.4, []),
        (r'\bpull\s*out\s*spray\b', 1.3, []),

        # High confidence patterns
        (r'\btap\b', 1.0, []),
        (r'\bfaucet\b', 1.0, []),
        (r'\bkitchen\s*tap\b', 1.2, []),
        (r'\bbath\s*tap\b', 1.2, []),
        (r'\bbasin\s*tap\b', 1.2, []),
        (r'\bshower\s*tap\b', 1.1, []),
        (r'\bmixer\s*tap\b', 1.2, []),
        (r'\bmonobloc\b', 1.1, []),
        (r'\bpillar\s*tap\b', 1.2, []),
        (r'\bwall\s*mounted\s*tap\b', 1.1, []),
        (r'\bdeck\s*mounted\b', 0.9, ['tap', 'mixer']),

        # Medium confidence
        (r'\bspout\b', 0.7, ['tap', 'bath', 'kitchen', 'mixer']),
        (r'\b3\s*hole\b', 0.8, ['tap', 'mixer']),
        (r'\bsingle\s*lever\b', 0.9, []),
    ],

    'showers': [
        # High confidence patterns
        (r'\bshower\b(?!.*seat)', 1.0, []),
        (r'\bshower\s*head\b', 1.2, []),
        (r'\brain\s*shower\b', 1.2, []),
        (r'\bhand\s*shower\b', 1.1, []),
        (r'\bshower\s*rail\b', 1.2, []),
        (r'\bshower\s*arm\b', 1.1, []),
        (r'\bshower\s*rose\b', 1.2, []),
        (r'\bshower\s*set\b', 1.2, []),
        (r'\bshower\s*kit\b', 1.2, []),
        (r'\bthermostatic\s*shower\b', 1.2, []),
        (r'\belectric\s*shower\b', 1.2, []),
        (r'\bmixer\s*shower\b', 1.2, []),
        (r'\bshower\s*valve\b', 1.1, []),
        (r'\bshower\s*panel\b', 1.1, []),
        (r'\bshower\s*column\b', 1.1, []),
        (r'\bshower\s*mixer\b', 1.2, []),

        # Medium confidence
        (r'\boverhead\s*shower\b', 1.0, []),
        (r'\bceiling\s*shower\b', 1.0, []),
    ],

    'baths': [
        # High confidence patterns
        (r'\bbath\b(?!\s*tap)(?!\s*mixer)(?!\s*room)(?!\s*screen)', 1.0, []),
        (r'\bbathtub\b', 1.2, []),
        (r'\bfreestanding\s*bath\b', 1.2, []),
        (r'\bbuilt\s*in\s*bath\b', 1.1, []),
        (r'\bcorner\s*bath\b', 1.2, []),
        (r'\bstraight\s*bath\b', 1.1, []),
        (r'\bp\s*shaped\s*bath\b', 1.2, []),
        (r'\bl\s*shaped\s*bath\b', 1.2, []),
        (r'\bdouble\s*ended\s*bath\b', 1.1, []),
        (r'\broll\s*top\s*bath\b', 1.2, []),
        (r'\bslipper\s*bath\b', 1.2, []),
        (r'\bback\s*to\s*wall\s*bath\b', 1.2, []),
        (r'\binset\s*bath\b', 1.1, []),
        (r'\bdrop\s*in\s*bath\b', 1.1, []),

        # Medium confidence
        (r'\bacrylic\s*bath\b', 1.0, []),
        (r'\bcast\s*iron\s*bath\b', 1.1, []),
    ],

    'toilets': [
        # High confidence patterns
        (r'\btoilet\b', 1.2, []),
        (r'\btoilet\s*suite\b', 1.4, []),
        (r'\bWC\b', 1.1, []),
        (r'\bw\.c\.\b', 1.1, []),
        (r'\bclose\s*coupled\b', 1.1, []),
        (r'\bback\s*to\s*wall\b(?!.*bath)', 1.0, []),
        (r'\bwall\s*hung\s*toilet\b', 1.2, []),
        (r'\bwall\s*faced\b', 1.0, []),
        (r'\bpan\b', 0.8, ['toilet', 'wc', 'close', 'suite']),
        (r'\bcistern\b', 1.0, []),
        (r'\bconcealed\s*cistern\b', 1.2, []),
        (r'\bin-wall\s*cistern\b', 1.2, []),
        (r'\bundercounter.*cistern\b', 1.2, []),

        # Medium confidence
        (r'\brim\s*less\b', 0.8, ['toilet', 'wc', 'pan']),
        (r'\bsoft\s*close\b', 0.6, ['toilet', 'seat']),
        (r'\btoilet\s*seat\b', 1.0, []),
        (r'\bbidet\b(?!.*toilet)', 1.0, []),
    ],

    'smart_toilets': [
        # Smart/electronic toilets with bidet functions
        (r'\bsmart\s*toilet\b', 1.5, []),
        (r'\belectric\s*toilet\b', 1.4, []),
        (r'\belectronic\s*bidet\b', 1.4, []),
        (r'\bbidet\s*toilet\b', 1.4, []),
        (r'\bwashlet\b', 1.5, []),
        (r'\bshower\s*toilet\b', 1.4, []),
        (r'\bheated\s*seat\b', 1.0, ['toilet', 'bidet']),
        (r'\bair\s*dry(er)?\b', 0.8, ['toilet', 'bidet']),
        (r'\bremote\s*control\b', 0.7, ['toilet', 'bidet']),
    ],

    'filter_taps': [
        # Filter/boiling/chilled water taps
        (r'\bfilter\s*tap\b', 1.5, []),
        (r'\bboiling\s*water\s*tap\b', 1.5, []),
        (r'\binstant\s*boiling\b', 1.4, []),
        (r'\bboiling\s*tap\b', 1.5, []),
        (r'\bchilled\s*water\b', 1.3, []),
        (r'\bsparkling\s*water\b', 1.3, []),
        (r'\bfiltered\s*water\b', 1.3, []),
        (r'\b3\s*in\s*1\b', 1.0, ['tap', 'boiling']),
        (r'\b4\s*in\s*1\b', 1.0, ['tap', 'boiling']),
        (r'\bquooker\b', 1.5, []),
        (r'\bzip\s*hydrotap\b', 1.5, []),
        (r'\bgrohe\s*blue\b', 1.4, []),
        (r'\bgrohe\s*red\b', 1.4, []),
    ],

    'hot_water': [
        # Hot water systems
        (r'\bhot\s*water\s*system\b', 1.5, []),
        (r'\bhot\s*water\s*unit\b', 1.4, []),
        (r'\bwater\s*heater\b', 1.4, []),
        (r'\bgas\s*hot\s*water\b', 1.5, []),
        (r'\belectric\s*hot\s*water\b', 1.5, []),
        (r'\bsolar\s*hot\s*water\b', 1.5, []),
        (r'\bheat\s*pump\s*hot\s*water\b', 1.5, []),
        (r'\bcontinuous\s*flow\b', 1.2, ['hot water', 'gas']),
        (r'\binstantaneous\s*hot\s*water\b', 1.4, []),
        (r'\bstorage\s*hot\s*water\b', 1.3, []),
        (r'\btankless\s*water\s*heater\b', 1.3, []),
        (r'\brinnai\b', 1.0, ['hot water', 'continuous']),
        (r'\brheem\b', 1.0, ['hot water', 'heater']),
        (r'\bdux\b', 0.8, ['hot water']),
    ],

    'towel_rails': [
        # Towel rails and heated rails
        (r'\btowel\s*rail\b', 1.5, []),
        (r'\btowel\s*ladder\b', 1.5, []),
        (r'\bheated\s*towel\s*rail\b', 1.5, []),
        (r'\btowel\s*warmer\b', 1.4, []),
        (r'\bheated\s*rail\b', 1.3, []),
        (r'\bradiator\b', 1.0, []),
        (r'\bcolumn\s*radiator\b', 1.1, []),
        (r'\bpanel\s*radiator\b', 1.0, []),
        (r'\bvertical\s*radiator\b', 1.0, []),
        (r'\bhorizontal\s*radiator\b', 1.0, []),

        # Medium confidence
        (r'\bheating\b', 0.6, ['radiator', 'towel']),
    ],

    'furniture': [
        # Vanities and bathroom furniture
        (r'\bvanity\b', 1.2, []),
        (r'\bvanity\s*unit\b', 1.3, []),
        (r'\bvanity\s*cabinet\b', 1.3, []),
        (r'\bwall\s*hung\s*vanity\b', 1.3, []),
        (r'\bbathroom\s*cabinet\b', 1.1, []),
        (r'\bmirror\s*cabinet\b', 1.1, []),
        (r'\btall\s*unit\b', 1.0, []),
        (r'\bwall\s*unit\b', 0.9, ['bathroom']),
        (r'\bfloor\s*unit\b', 0.9, ['bathroom']),
        (r'\bstorage\s*unit\b', 0.7, ['bathroom', 'vanity']),
        (r'\bside\s*storage\b', 0.9, ['vanity', 'bathroom']),
    ],
}

# Pre-compile all patterns for faster matching
_COMPILED_PATTERNS = {}
_COMPILED_EXCLUSIONS = []
_BASIN_PATTERN = re.compile(r'\bbasin\b', re.IGNORECASE)


def _compile_patterns():
    """Pre-compile all regex patterns for faster matching."""
    global _COMPILED_PATTERNS, _COMPILED_EXCLUSIONS

    if _COMPILED_PATTERNS:
        return  # Already compiled

    # Compile collection patterns
    for collection, patterns in COLLECTION_PATTERNS.items():
        _COMPILED_PATTERNS[collection] = [
            (re.compile(pattern, re.IGNORECASE), weight, required_words)
            for pattern, weight, required_words in patterns
        ]

    # Compile exclusion patterns
    exclusion_patterns = [
        r'\baccessor(y|ies)\b',
        r'\bspare\s*part\b',
        r'\breplacement\s*part\b',
        r'\bwaste\s*(kit|fitting)\b',
        r'\bplug\s*(kit|fitting)\b',
        r'\bconnector\s*kit\b',
        r'\binstallation\s*kit\b',
        r'\brepair\s*kit\b',
        r'\bservice\s*kit\b',
        r'\bdispenser\b',
        r'\bsoap\s*(dish|holder)\b',
        r'\bpaper\s*towel\b',
        r'\bexhaust\s*fan\b',
        r'\bventilation\b',
        r'\b3\s*in\s*1\b(?!.*tap)',
        r'\bheat.*light.*exhaust\b',
    ]
    _COMPILED_EXCLUSIONS = [re.compile(p, re.IGNORECASE) for p in exclusion_patterns]


# Compile patterns on module load
_compile_patterns()


def detect_collection(product_name: str, product_url: str = '') -> Tuple[Optional[str], float]:
    """
    Detect which collection a product belongs to

    Args:
        product_name: Product name/title
        product_url: Product URL (optional, can provide additional context)

    Returns:
        Tuple of (collection_name, confidence_score)
        Returns (None, 0.0) if no confident match found
    """
    global _detection_result_cache

    # Allow detection with URL only if product_name is empty
    if not product_name and not product_url:
        return None, 0.0

    # Check cache first
    cache_key = f"{product_name}|{product_url}"
    if cache_key in _detection_result_cache:
        return _detection_result_cache[cache_key]

    # Combine name and URL for better matching
    search_text = f"{product_name} {product_url}".lower()

    # Check exclusions using pre-compiled patterns
    for exclusion_pattern in _COMPILED_EXCLUSIONS:
        if exclusion_pattern.search(search_text):
            result = (None, 0.0)
            _cache_result(cache_key, result)
            return result

    # Check if contains basin (for sinks exclusion)
    has_basin = _BASIN_PATTERN.search(search_text) is not None

    # Calculate scores for each collection using pre-compiled patterns
    collection_scores = {}

    for collection, compiled_patterns in _COMPILED_PATTERNS.items():
        score = 0.0
        matches = 0

        # Skip sinks if product contains "basin"
        if collection == 'sinks' and has_basin:
            continue

        for compiled_pattern, weight, required_words in compiled_patterns:
            # Check if pattern matches
            if compiled_pattern.search(search_text):
                # If required words specified, check they exist
                if required_words:
                    if any(word in search_text for word in required_words):
                        score += weight
                        matches += 1
                else:
                    score += weight
                    matches += 1

        # Normalize score based on number of matches
        if matches > 0:
            confidence = min(score / 2.0, 1.0)
            if matches > 2:
                confidence = min(confidence * 1.2, 1.0)
            collection_scores[collection] = confidence

    # Get best match
    if not collection_scores:
        result = (None, 0.0)
        _cache_result(cache_key, result)
        return result

    best_collection = max(collection_scores, key=collection_scores.get)
    best_score = collection_scores[best_collection]

    # Lower threshold
    threshold = 0.4

    if best_score >= threshold:
        result = (best_collection, best_score)
    else:
        result = (None, best_score)

    _cache_result(cache_key, result)
    return result


def _cache_result(cache_key: str, result: Tuple[Optional[str], float]):
    """Cache a detection result, maintaining max cache size."""
    global _detection_result_cache

    # Simple size limit - clear half the cache if too large
    if len(_detection_result_cache) >= _MAX_DETECTION_CACHE_SIZE:
        # Clear oldest half (simple approach)
        keys_to_remove = list(_detection_result_cache.keys())[:_MAX_DETECTION_CACHE_SIZE // 2]
        for key in keys_to_remove:
            del _detection_result_cache[key]

    _detection_result_cache[cache_key] = result


def detect_collection_batch(products: list) -> list:
    """
    Detect collections for multiple products

    Args:
        products: List of dicts with 'product_name' and optionally 'product_url'

    Returns:
        List of dicts with added 'detected_collection' and 'confidence_score'
    """
    results = []

    for product in products:
        product_name = product.get('product_name', '')
        product_url = product.get('product_url', '')

        collection, confidence = detect_collection(product_name, product_url)

        result = product.copy()
        result['detected_collection'] = collection
        result['confidence_score'] = confidence
        results.append(result)

    return results


# For testing
if __name__ == '__main__':
    # Test cases
    test_products = [
        "Kitchen Sink Stainless Steel Undermount",
        "Chrome Basin Mixer Tap",
        "Thermostatic Shower Valve",
        "Freestanding Bath 1700mm",
        "Wall Hung Toilet WC",
        "Heated Towel Rail Radiator",
        "Bathroom Vanity Unit 600mm",
        "Some Random Product",
    ]

    for name in test_products:
        collection, confidence = detect_collection(name)
        print(f"{name[:40]:40} → {collection or 'None':15} ({confidence:.1%})")
