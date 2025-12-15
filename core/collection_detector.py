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

    'radiators': [
        # Towel rails and radiators
        (r'\bradiator\b', 1.2, []),
        (r'\btowel\s*rail\b', 1.3, []),
        (r'\btowel\s*ladder\b', 1.3, []),
        (r'\bheated\s*towel\s*rail\b', 1.4, []),
        (r'\bcolumn\s*radiator\b', 1.2, []),
        (r'\bpanel\s*radiator\b', 1.1, []),
        (r'\bvertical\s*radiator\b', 1.1, []),
        (r'\bhorizontal\s*radiator\b', 1.1, []),
        (r'\btowel\s*warmer\b', 1.3, []),

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

    # Exclusion list - these are NOT main products, they're accessories/parts/supplies
    # Keep this minimal to avoid excluding valid products
    exclusion_patterns = [
        r'\baccessor(y|ies)\b',           # accessories
        r'\bspare\s*part\b',              # spare parts
        r'\breplacement\s*part\b',        # replacement parts
        r'\bwaste\s*(kit|fitting)\b',     # waste fittings
        r'\bplug\s*(kit|fitting)\b',      # plug fittings
        r'\bconnector\s*kit\b',           # connector kits
        r'\binstallation\s*kit\b',        # installation kits
        r'\brepair\s*kit\b',              # repair kits
        r'\bservice\s*kit\b',             # service kits
        r'\bdispenser\b',                 # paper/soap dispensers
        r'\bsoap\s*(dish|holder)\b',      # soap holders
        r'\bpaper\s*towel\b',             # paper towel dispensers
        r'\bexhaust\s*fan\b',             # exhaust fans
        r'\bventilation\b',               # ventilation products
        r'\b3\s*in\s*1\b(?!.*tap)',       # 3 in 1 units (lights) but not taps
        r'\bheat.*light.*exhaust\b',      # 3 in 1 bathroom units
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

    # Lower threshold - return match even at lower confidence
    # Let the UI decide how to display low-confidence matches
    threshold = 0.4  # Lower threshold to catch more products

    # Only return if confidence is above threshold
    if best_score >= threshold:
        if best_score >= 0.6:
            logger.debug(f"✅ Detected '{best_collection}' with {best_score:.1%} confidence")
        else:
            logger.debug(f"⚠️ Low confidence detection: '{best_collection}' ({best_score:.1%})")
        return best_collection, best_score
    else:
        logger.debug(f"❌ No confident match ({best_score:.1%})")
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
