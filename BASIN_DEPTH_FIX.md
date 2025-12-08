# Basin Depth Extraction Fix

## Issue Summary

**Problem:** Basin dimensions were being extracted incorrectly - specifically the depth dimension was pulling 263mm instead of the correct 157mm for the Victoria Albert Amiata 60 basin (Row 42).

**Root Cause:** The Vision API was confusing horizontal measurements from the SIDE VIEW with the vertical depth/height measurement that should come from the FRONT VIEW.

## Understanding Basin Dimensions

Basin technical drawings show multiple orthographic views:
- **TOP VIEW**: Shows length (longest horizontal) and width (shorter horizontal)
- **FRONT VIEW**: Shows length (horizontal) and **depth/height (vertical)** ← This is key!
- **SIDE VIEW**: Shows width (horizontal) and depth/height (vertical)

### The Confusion

For the Victoria Albert PDF:
- Top view: 600mm (length) × 413mm (width)
- Front view: 429mm (length) × **157mm (HEIGHT - vertical dimension)** ✓ Correct depth!
- Side view: **263mm** (width from side perspective) ← This was incorrectly used as depth!

The AI was extracting the 263mm horizontal measurement from the side view instead of the 157mm vertical measurement from the front view.

## The Fix

Updated both AI prompts to clearly distinguish:

### 1. Vision API Prompt ([ai_extractor.py:1043-1097](core/ai_extractor.py#L1043-L1097))

Added explicit instructions:
```
3. DEPTH/HEIGHT (vertical dimension - MOST COMMONLY CONFUSED):
   ⚠️ CRITICAL: Basin "depth" means the VERTICAL HEIGHT from base to rim!
   - Look ONLY at FRONT VIEW or SECTION VIEW
   - Find the VERTICAL measurement showing basin height
   - This is usually the SMALLEST dimension (typically 100-250mm)
   - DO NOT use measurements from SIDE VIEW - those show width, not depth!
   - Often labeled as height in imperial (e.g., "6 1/8"")

COMMON MISTAKE TO AVOID:
❌ Do NOT confuse the side view width measurement with the depth!
❌ Example: If side view shows "263mm" and front view shows "157mm",
   the depth is 157mm (from front view), NOT 263mm (that's the width from side perspective)
```

### 2. Main Extraction Prompt ([ai_extractor.py:3414-3483](core/ai_extractor.py#L3414-L3483))

Added detailed technical drawing guidance:
```
UNDERSTANDING TECHNICAL DRAWING VIEWS:
Basin spec sheets show multiple views (TOP VIEW, FRONT VIEW, SIDE VIEW, SECTION):
- TOP VIEW shows: length (longest horizontal) and width (shorter horizontal)
- FRONT VIEW shows: length (horizontal) and depth/height (vertical)
- SIDE VIEW shows: width (horizontal) and depth/height (vertical)

⚠️ CRITICAL - DEPTH CONFUSION WARNING:
The most common extraction error is confusing dimensions from different views!
- Basin "depth" or "height" = VERTICAL dimension from base to rim (typically 100-250mm)
- This is shown in FRONT VIEW or SECTION VIEW as the vertical measurement
- DO NOT confuse this with horizontal measurements from SIDE VIEW!
```

## Verification

To verify the fix works for the Victoria Albert basin:

```bash
python3 test_basin_pdf.py
```

Expected output:
```
Length: 600 mm  ✓
Width: 413 mm   ✓
Depth: 157 mm   ✓ (was incorrectly 263mm before fix)
```

## Impact

This fix will improve dimension extraction accuracy for all basins where:
1. The PDF uses technical drawings with multiple views (common)
2. The side view shows a horizontal measurement that differs from the depth
3. The Vision API needs to distinguish between horizontal and vertical dimensions

## Re-processing Row 42

To fix the existing incorrect data in row 42:

1. The next time the basin extraction script runs, it will use the updated prompts
2. Or manually trigger re-extraction for row 42 using the Basins bulk extraction tool
3. The correct depth (157mm) should now be extracted

## Files Modified

- [core/ai_extractor.py](core/ai_extractor.py)
  - Lines 1043-1097: Vision API prompt for basins
  - Lines 3414-3483: Main extraction prompt dimension parsing rules
