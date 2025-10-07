"""
Collection Detection Module
Detects which collection a product belongs to based on keywords and patterns
"""

import re
from typing import Tuple, Optional
import logging

logger = logging.getLogger(__name__)


# Collection keywords with weighted patterns
# Format: collection_name: [(pattern, weight, required_words)]
COLLECTION_PATTERNS = {
    'sinks': [
        # High confidence patterns - Kitchen, Laundry, Bar sinks only
        (r'\bkitchen\s*sink\b', 1.5, []),
        (r'\blaundry\s*sink\b', 1.5, []),
        (r'\bbar\s*sink\b', 1.5, []),
        (r'\butility\s*sink\b', 1.3, []),
        (r'\bprep\s*sink\b', 1.3, []),
        (r'\btrough\s*sink\b', 1.3, []),

        # Sink types (only if NOT accessories)
        (r'\bundermount\s*sink\b', 1.2, []),
        (r'\btop\s*mount\s*sink\b', 1.2, []),
        (r'\binset\s*sink\b', 1.2, []),
        (r'\bflush\s*mount\s*sink\b', 1.2, []),
        (r'\bdrop.*in\s*sink\b', 1.2, []),

        # Generic sink - but will be excluded if "accessory" or "basin" found
        (r'\bsink\b(?!.*accessor)', 1.0, []),

        # Exclude these - bathroom basins are NOT sinks
        # Basins go in bathrooms, sinks go in kitchens/laundries/bars
    ],

    'basins': [
        # Bathroom basins (NOT kitchen/laundry sinks)
        (r'\bbasin\b', 1.2, []),
        (r'\bwash\s*basin\b', 1.4, []),
        (r'\bbathroom\s*basin\b', 1.5, []),
        (r'\bvessel\s*basin\b', 1.3, []),
        (r'\bpedestal\s*basin\b', 1.4, []),
        (r'\bwall\s*hung\s*basin\b', 1.3, []),
        (r'\bcountertop\s*basin\b', 1.2, []),
        (r'\bsemi\s*recessed\s*basin\b', 1.2, []),
        (r'\bunder.*counter\s*basin\b', 1.2, []),
        (r'\binset\s*basin\b', 1.2, []),
    ],

    'taps': [
        # High confidence patterns
        (r'\btap\b', 1.0, []),
        (r'\bfaucet\b', 1.0, []),
        (r'\bmixer\b', 0.9, ['tap', 'bath', 'kitchen', 'basin']),
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
        (r'\bspout\b', 0.7, ['tap', 'bath', 'kitchen']),
        (r'\b3\s*hole\b', 0.8, ['tap', 'mixer']),
        (r'\bsingle\s*lever\b', 0.9, []),
    ],

    'showers': [
        # High confidence patterns
        (r'\bshower\b', 1.0, []),
        (r'\bshower\s*head\b', 1.2, []),
        (r'\brain\s*shower\b', 1.2, []),
        (r'\bhand\s*shower\b', 1.1, []),
        (r'\bshower\s*kit\b', 1.2, []),
        (r'\bthermostatic\s*shower\b', 1.2, []),
        (r'\belectric\s*shower\b', 1.2, []),
        (r'\bmixer\s*shower\b', 1.2, []),
        (r'\bshower\s*valve\b', 1.1, []),
        (r'\bshower\s*panel\b', 1.1, []),
        (r'\bshower\s*column\b', 1.1, []),

        # Medium confidence
        (r'\boverhead\s*shower\b', 1.0, []),
        (r'\bceiling\s*shower\b', 1.0, []),
    ],

    'baths': [
        # High confidence patterns
        (r'\bbath\b(?!\s*tap)(?!\s*mixer)', 1.0, []),
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

        # Medium confidence
        (r'\bacrylic\s*bath\b', 1.0, []),
        (r'\bcast\s*iron\s*bath\b', 1.1, []),
    ],

    'toilets': [
        # High confidence patterns
        (r'\btoilet\b', 1.2, []),
        (r'\bWC\b', 1.1, []),
        (r'\bw\.c\.\b', 1.1, []),
        (r'\bclose\s*coupled\b', 1.1, ['toilet', 'wc']),
        (r'\bback\s*to\s*wall\b', 1.0, ['toilet', 'wc']),
        (r'\bwall\s*hung\s*toilet\b', 1.2, []),
        (r'\bpan\b', 0.8, ['toilet', 'wc', 'close']),
        (r'\bcistern\b', 0.9, ['toilet', 'wc']),

        # Medium confidence
        (r'\brim\s*less\b', 0.8, ['toilet', 'wc']),
        (r'\bsoft\s*close\b', 0.6, ['toilet', 'seat']),
    ],

    'radiators': [
        # High confidence patterns
        (r'\bradiator\b', 1.2, []),
        (r'\btowel\s*rail\b', 1.1, []),
        (r'\bheated\s*towel\s*rail\b', 1.2, []),
        (r'\bcolumn\s*radiator\b', 1.2, []),
        (r'\bpanel\s*radiator\b', 1.1, []),
        (r'\bvertical\s*radiator\b', 1.1, []),
        (r'\bhorizontal\s*radiator\b', 1.1, []),

        # Medium confidence
        (r'\bheating\b', 0.6, ['radiator', 'towel']),
    ],

    'furniture': [
        # High confidence patterns
        (r'\bvanity\s*unit\b(?!.*sink)', 1.0, []),
        (r'\bbathroom\s*cabinet\b', 1.1, []),
        (r'\bmirror\s*cabinet\b', 1.1, []),
        (r'\btall\s*unit\b', 1.0, []),
        (r'\bwall\s*unit\b', 0.9, ['bathroom']),
        (r'\bfloor\s*unit\b', 0.9, ['bathroom']),

        # Medium confidence
        (r'\bstorage\s*unit\b', 0.7, ['bathroom']),
    ],
}


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
    # Allow detection with URL only if product_name is empty
    if not product_name and not product_url:
        return None, 0.0

    # Combine name and URL for better matching
    search_text = f"{product_name} {product_url}".lower()

    # Exclusion rules for sinks: basins and accessories are NOT sinks
    if re.search(r'\bbasin\b', search_text, re.IGNORECASE):
        # If it contains "basin", exclude from sinks detection
        # Basins are bathroom products, sinks are kitchen/laundry/bar
        search_text_no_basin = search_text  # Keep for other collections

    # Expanded exclusion list - these are NOT products, they're parts/accessories/components
    exclusion_patterns = [
        r'\baccessor',      # accessories
        r'\bassembly\b',    # assembly parts
        r'\boutlet\b',      # outlets/drains
        r'\b(?<!sink\s)set\b',  # sets (but allow "sink set")
        r'\bmixer\b',       # mixers (taps, not sinks)
        r'\bwaste\b',       # waste fittings
        r'\bplug\b',        # plugs
        r'\bstrainer\b',    # strainers
        r'\bdish\s*rack\b', # dish racks
        r'\bbasket\b',      # baskets
        r'\borganis',       # organisers
        r'\bcaddy\b',       # caddies
        r'\bholder\b',      # holders
        r'\brack\b',        # racks
        r'\btray\b',        # trays
        r'\bmat\b',         # mats
        r'\bspray\b',       # sprays/spray heads
        r'\bconnector\b',   # connectors
        r'\bkit\b',         # kits
        r'\bclip\b',        # clips
    ]

    for pattern in exclusion_patterns:
        if re.search(pattern, search_text, re.IGNORECASE):
            # Exclude from all collections
            return None, 0.0

    # Calculate scores for each collection
    collection_scores = {}

    for collection, patterns in COLLECTION_PATTERNS.items():
        score = 0.0
        matches = 0

        # Skip sinks if product contains "basin"
        if collection == 'sinks' and re.search(r'\bbasin\b', search_text, re.IGNORECASE):
            continue

        for pattern, weight, required_words in patterns:
            # Check if pattern matches
            if re.search(pattern, search_text, re.IGNORECASE):
                # If required words specified, check they exist
                if required_words:
                    if any(re.search(rf'\b{word}\b', search_text, re.IGNORECASE) for word in required_words):
                        score += weight
                        matches += 1
                else:
                    score += weight
                    matches += 1

        # Normalize score based on number of matches
        if matches > 0:
            # Use lower normalization divisor for better confidence with fewer matches
            # This allows strong single keywords (like "sink", "tap") to score higher
            confidence = min(score / 2.0, 1.0)  # Normalize to 0-1 range
            if matches > 2:
                confidence = min(confidence * 1.2, 1.0)  # Boost for multiple matches

            collection_scores[collection] = confidence

    # Get best match
    if not collection_scores:
        return None, 0.0

    best_collection = max(collection_scores, key=collection_scores.get)
    best_score = collection_scores[best_collection]

    # Lower threshold for URL-only detection (when product_name is empty)
    # This helps with imported products that only have URLs
    threshold = 0.5 if not product_name else 0.9

    # Only return if confidence is above threshold
    if best_score >= threshold:
        logger.info(f"✅ Detected '{best_collection}' with {best_score:.1%} confidence")
        return best_collection, best_score
    else:
        logger.info(f"⚠️ Low confidence detection ({best_score:.1%})")
        return None, best_score


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
