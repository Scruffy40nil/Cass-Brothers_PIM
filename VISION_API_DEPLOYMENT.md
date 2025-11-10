# Vision API Deployment Guide

## Overview
The Vision API fallback has been implemented to handle technical drawing PDFs where text extraction fails (like the Alix K011 spec sheet). This guide covers deployment to PythonAnywhere.

## Problem Solved
**Issue**: PDFs that are CAD/technical drawings (vector graphics) have minimal selectable text, causing AI extraction to fail.

**Example**: Alix K011 spec sheet only yields 132 characters: `615 385 433 591 FOOTPRINT … FRONT VIEW 485 PAN & SEAT`

**Solution**: When text extraction returns < 500 characters, automatically convert PDF to image and use GPT-4o Vision API to "read" the technical drawing.

## Files Modified
- `core/ai_extractor.py` (lines 906-999):
  - Added sparse text detection (500 char threshold)
  - Added `_extract_from_pdf_with_vision()` method
  - Automatic fallback to Vision API when text is sparse

## Deployment Steps

### 1. Pull Latest Code on PythonAnywhere

**IMPORTANT**: Make sure to pull the very latest code which includes the Vision API bug fix!

```bash
cd ~/mysite  # or wherever your repo is located
git pull origin main
```

You should see the fix commit: `Fix Vision API to use requests instead of non-existent client`

### 2. Install Required Python Package

```bash
pip install --user pdf2image
```

### 3. Check Poppler Utils (System Dependency)

The `pdf2image` library requires `poppler-utils` to be installed on the system.

**Check if available**:
```bash
which pdftoppm
```

**If not available**, you have two options:

#### Option A: Contact PythonAnywhere Support
Ask them to install `poppler-utils` on your account/server.

#### Option B: Use Alternative Approach (if poppler not available)
If poppler cannot be installed, we can modify the code to use an alternative PDF→image conversion method that doesn't require system dependencies. Let me know if this is needed.

### 4. Verify Environment Variables

Ensure OpenAI API key is configured:
```bash
echo $OPENAI_API_KEY
```

If not set, add to `.env` file or configure in PythonAnywhere dashboard.

### 5. Reload Web App

From PythonAnywhere dashboard:
- Go to "Web" tab
- Click "Reload" button for your web app

### 6. Test the Implementation

#### Method 1: Using the Test Script

```bash
cd ~/mysite
python test_vision_extraction.py
```

**Expected output**:
```
✅ Fetched X characters
⚠️  Sparse text detected (132 chars < 500 threshold)
✅ Vision API fallback should have been triggered
✅ AI extraction succeeded
✅ Successfully extracted 8/11 key fields
```

#### Method 2: Test via Web Interface

1. Open your PIM web interface
2. Navigate to Toilets collection
3. Find the Alix K011 product (row with this spec sheet URL):
   ```
   https://cdn.shopify.com/s/files/1/0552/5808/7468/files/Alix_K011_SpecSheet.pdf
   ```
4. Click "AI Extract" button
5. Check browser console for logs

**Expected browser console logs**:
- "⚠️ PDF has minimal text (132 chars) - likely a technical drawing"
- "⚠️ Attempting Vision-based extraction"
- "✅ Vision extraction succeeded with X chars"

#### Method 3: Check PythonAnywhere Error Logs

View logs for Vision API activity:
```bash
tail -f ~/mysite/logs/*.log
# or wherever your app logs are located
```

Look for these log messages:
- `⚠️ PDF has minimal text`
- `🔍 Converting PDF to images for Vision API extraction`
- `✅ Vision extraction succeeded`

## How It Works

### Automatic Detection
```python
MIN_TEXT_THRESHOLD = 500  # Minimum characters for meaningful text extraction

if len(extracted_text) < MIN_TEXT_THRESHOLD:
    # Trigger Vision API fallback
    vision_result = _extract_from_pdf_with_vision(pdf_content, url)
```

### Vision API Process
1. Convert PDF to PNG image (200 DPI)
2. Convert image to base64
3. Send to GPT-4o Vision API with prompt:
   ```
   Extract ALL visible text and specifications from this technical drawing/spec sheet.
   Include:
   - Product dimensions (width, depth, height in mm)
   - All labeled measurements
   - Product features and specifications
   - Installation details
   - Any text visible in the drawing
   ```
4. Return extracted text (replaces sparse text extraction)
5. Continue with normal AI extraction workflow

### Graceful Degradation
- If Vision API fails, falls back to sparse text extraction
- Logs all failures for debugging
- No breaking changes to existing functionality

## Cost Considerations

**GPT-4o Vision API Pricing** (as of January 2025):
- ~$0.01 per image (varies by image size)
- Only triggered for sparse-text PDFs (< 500 chars)
- Most PARISI PDFs have sufficient text and won't trigger Vision API

**Estimated Impact**:
- Technical drawing PDFs: ~10-20% of total spec sheets
- Cost per Vision extraction: ~$0.01
- For 100 technical drawing PDFs: ~$1.00

## Troubleshooting

### Issue: "pdf2image not installed"
**Solution**: Run `pip install --user pdf2image`

### Issue: "poppler not found" or "pdftoppm not found"
**Solution**: Contact PythonAnywhere support to install `poppler-utils`

**Alternative**: Use cloud-based PDF→image conversion (requires code modification)

### Issue: Vision API timeout
**Solution**: Increase timeout in `core/ai_extractor.py` or reduce image DPI from 200 to 150

### Issue: Still getting 132 characters from Alix PDF
**Possible causes**:
1. Code not pulled: `git pull origin main`
2. Dependencies not installed: `pip install --user pdf2image`
3. Web app not reloaded: Click "Reload" in PythonAnywhere dashboard
4. Poppler not available: Check `which pdftoppm`

### Issue: "AI extraction failed" in browser console
**Check logs for**:
- Vision API errors
- OpenAI API key issues
- Timeout errors

## Verification Checklist

- [ ] Latest code pulled from GitHub
- [ ] `pdf2image` installed (`pip list | grep pdf2image`)
- [ ] `poppler-utils` available (`which pdftoppm`)
- [ ] OpenAI API key configured (`echo $OPENAI_API_KEY`)
- [ ] Web app reloaded
- [ ] Test script runs successfully (`python test_vision_extraction.py`)
- [ ] Alix K011 extraction works in web interface
- [ ] Browser console shows Vision API logs
- [ ] Extracted data includes pan dimensions, trap type, etc.

## Files to Review

1. **[core/ai_extractor.py](core/ai_extractor.py#L906-L999)** - Vision API implementation
2. **[test_vision_extraction.py](test_vision_extraction.py)** - Test script
3. **PythonAnywhere error logs** - Check for Vision API activity

## Support

If issues persist after following this guide:
1. Run test script and share output
2. Check PythonAnywhere error logs
3. Share browser console logs
4. Verify `which pdftoppm` output
