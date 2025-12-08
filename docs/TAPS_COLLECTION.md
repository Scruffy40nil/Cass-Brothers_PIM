# Taps Collection - Technical Documentation

This document provides comprehensive documentation for the Taps (Faucets/Mixers) collection in the Cass Brothers PIM system.

---

## Table of Contents

1. [Overview](#overview)
2. [Configuration](#configuration)
3. [Field Mappings](#field-mappings)
4. [AI Extraction](#ai-extraction)
5. [WELS Lookup](#wels-lookup)
6. [Quality Fields](#quality-fields)
7. [Templates & UI](#templates--ui)
8. [JavaScript Functionality](#javascript-functionality)
9. [API Endpoints](#api-endpoints)
10. [Data Flow](#data-flow)
11. [Common Workflows](#common-workflows)

---

## Overview

The Taps collection manages tap, faucet, and mixer products with:

- **48 field mappings** (Columns A-AV in Google Sheets)
- **13 AI-extractable fields** via Vision API and Claude
- **3 WELS lookup fields** (populated from reference database, NOT AI)
- **22 quality fields** for completeness tracking
- **Dual-source extraction** (PDF spec sheets + supplier URLs)

### Key Features

| Feature | Status |
|---------|--------|
| AI Image Extraction | Enabled |
| Pricing Comparison | Disabled (no pricing columns) |
| Dual-Source Extraction | Enabled (PDF + URL) |
| WELS Lookup | Enabled (via reference database) |
| Data Cleaning Rules | Enabled |

---

## Configuration

**File:** `config/collections.py` - `TapsCollection` class

```python
class TapsCollection(CollectionConfig):
    name = 'taps'
    display_name = 'Taps'
    spreadsheet_id = '...'  # Google Sheets ID
    worksheet_name = 'Raw_Data'
    extract_images = True
    pricing_enabled = False  # No pricing columns in current sheet
```

---

## Field Mappings

### System Fields (A-G)

| Column | Field Name | Description |
|--------|------------|-------------|
| A | `url` | Supplier product URL (primary source) |
| B | `variant_sku` | Product SKU for lookup |
| C | `key` | System key |
| D | `id` | System ID |
| E | `handle` | URL handle |
| F | `title` | Product name |
| G | `vendor` | Vendor/supplier (synced with brand_name) |

### Product Specifications - Metafields (H-Y)

| Column | Field Name | Sheet Header | Description |
|--------|------------|--------------|-------------|
| H | `brand_name` | Metafield: brand_name | Brand/manufacturer |
| I | `range` | Metafield: range | Product range/collection |
| J | `style` | Metafield: style | Design style (Kitchen Mixer, etc.) |
| K | `mounting_type` | Metafield: installation_type | Mount type (Hob Mounting, Wall Mounted) |
| L | `colour_finish` | Metafield: product_colours_finishes | Color/finish |
| M | `material` | Metafield: product_material | Primary material |
| N | `warranty_years` | Metafield: warranty_years | Warranty period (years) |
| O | `spout_height_mm` | Metafield: spout_height_mm | Spout height in mm |
| P | `spout_reach_mm` | Metafield: spout_reach_mm | Spout reach in mm |
| Q | `handle_type` | Metafield: handle_type | Handle style |
| R | `handle_count` | Metafield: handle_count | Number of handles |
| S | `swivel_spout` | Metafield: swivel [boolean] | Swivel capability (TRUE/FALSE) |
| T | `cartridge_type` | Metafield: cartridge_size | Valve cartridge type |
| U | `flow_rate` | Metafield: flow_rate_L_per_min | **WELS Lookup** - NOT AI extracted |
| V | `wels_rating` | Metafield: wels_rating | **WELS Lookup** - NOT AI extracted |
| W | `wels_registration_number` | Metafield: wels_product_registration_number | **WELS Lookup** - NOT AI extracted |
| X | `lead_free_compliance` | Metafield: lead_free_compliance [boolean] | Lead-free compliance (TRUE/FALSE) |
| Y | `application_location` | Metafield: application_location | Installation location |

### Content (Z-AB)

| Column | Field Name | Description |
|--------|------------|-------------|
| Z | `body_html` | HTML product description |
| AA | `features` | Bullet-point features |
| AB | `care_instructions` | Maintenance instructions |

### System/Shopify Fields (AC-AO)

| Column | Field Name | Description |
|--------|------------|-------------|
| AC | `quality_score` | Auto-calculated (0-100%) |
| AD | `shopify_status` | Active/Draft |
| AE | `shopify_price` | Selling price |
| AF | `shopify_compare_price` | RRP/Compare price |
| AG | `shopify_weight` | Product weight |
| AH | `shopify_tags` | Comma-separated tags |
| AI | `seo_title` | SEO page title |
| AJ | `seo_description` | SEO meta description |
| AK | `shopify_images` | Comma-separated image URLs (AI-extracted) |
| AL | `shopify_spec_sheet` | PDF spec sheet URL |
| AM | `shopify_collections` | Shopify collection assignments |
| AN | `shopify_url` | Shopify product URL |
| AO | `last_shopify_sync` | Last sync timestamp |

### VLOOK Reference Fields (AP-AT)

| Column | Field Name | Description |
|--------|------------|-------------|
| AP | `height_vlook` | Height reference lookup |
| AQ | `reach_vlook` | Reach reference lookup |
| AR | `flow_rate_vlook` | Flow rate reference lookup |
| AS | `ai_tap_type` | AI-detected tap type |
| AT | `scraped_tap_type` | Scraped tap type |

### System & Content (AU-AV)

| Column | Field Name | Description |
|--------|------------|-------------|
| AU | `clean_data` | 🧹 Clean data checkbox |
| AV | `faqs` | AI-generated FAQs |

---

## AI Extraction

### Extraction Fields (13 total)

The AI extracts the following fields using Claude Vision API:

**Basic Info:**
- `brand_name`, `range`, `style`

**Specifications:**
- `mounting_type`, `colour_finish`, `material`

**Handle & Operation:**
- `handle_type`, `handle_count`, `swivel_spout`, `cartridge_type`

**Certifications:**
- `lead_free_compliance`

**Other:**
- `application_location`, `shopify_images`

### Fields NOT Extracted by AI

The following fields are populated via **WELS Lookup** (reference database), NOT AI:

- `flow_rate`
- `wels_rating`
- `wels_registration_number`

This ensures accurate WELS data from the official database rather than potentially inaccurate AI extraction.

### Dual-Source Extraction Strategy

Taps uses a **PDF-first extraction strategy** (same as sinks):

1. **PDF Spec Sheet First** - Extract from spec sheet PDF (Column AL)
   - Best for: dimensions, technical specs

2. **Supplier URL Second** - Extract from product page URL (Column A)
   - Best for: brand info, style, images, descriptions

3. **Merge Results** - PDF data takes priority for dimensions

```python
# In data_processor.py
dual_source_collections = ['sinks', 'basins', 'filter_taps', 'taps']
```

---

## WELS Lookup

### How WELS Lookup Works

WELS (Water Efficiency Labelling and Standards) data is populated via reference lookup, NOT AI extraction:

1. User enters **brand_name** for a product
2. System looks up brand in WELS reference sheet
3. Matching WELS data auto-populates:
   - `flow_rate` (Column U)
   - `wels_rating` (Column V)
   - `wels_registration_number` (Column W)

### Why Not AI Extraction?

WELS data must be accurate for regulatory compliance. AI extraction could:
- Misread star ratings from images
- Confuse registration numbers
- Provide inaccurate flow rates

The reference database ensures accuracy.

---

## Quality Fields

The following 22 fields are tracked for quality scoring:

```python
quality_fields = [
    'brand_name', 'range', 'style', 'mounting_type', 'colour_finish',
    'material', 'warranty_years', 'spout_height_mm', 'spout_reach_mm',
    'handle_type', 'handle_count', 'swivel_spout', 'cartridge_type',
    'flow_rate', 'wels_rating', 'wels_registration_number', 'lead_free_compliance',
    'application_location', 'body_html', 'features', 'care_instructions',
    'faqs', 'shopify_spec_sheet'
]
```

Quality score = (filled fields / total quality fields) × 100

---

## Templates & UI

### Key Files

| File | Purpose |
|------|---------|
| `templates/collection/collection_detail.html` | Main collection view |
| `templates/collection/modals/taps_modal.html` | Product edit modal |
| `static/js/collection/taps.js` | Taps-specific JavaScript |

### Modal Sections

The taps edit modal includes these sections:
- Basic Product Info
- Tap Specifications (mounting, material, etc.)
- Dimensions (spout height/reach)
- Handle & Operation
- Water Performance & Certifications
- Content (body_html, features, care)
- SEO Information
- Media & Images

---

## JavaScript Functionality

**File:** `static/js/collection/taps.js`

### Key Functions

| Function | Purpose |
|----------|---------|
| `saveTapsProduct()` | Save with instant feedback + background sync |
| `collectFormData()` | Gather all modal form data |
| `lookupWELSData()` | Lookup WELS data by brand |
| `bulkLookupWELS()` | Bulk WELS lookup for selected products |
| `renderProductSpecs()` | Render tap specs on product cards |

### Field Mappings

```javascript
const TAPS_FIELD_MAPPINGS = {
    // Basic fields (A-G)
    'editSku': 'variant_sku',
    'editTitle': 'title',
    'editVendor': 'vendor',
    'editBrandName': 'brand_name',
    'editRange': 'range',
    'editStyle': 'style',

    // Tap specifications (H-Y)
    'editMountingType': 'mounting_type',
    'editColourFinish': 'colour_finish',
    'editMaterial': 'material',
    'editWarrantyYears': 'warranty_years',
    // ... etc
};
```

### Background Save Queue

Like sinks, taps uses instant save with background processing:

1. User clicks Save → Instant "Saved!" feedback
2. Changes added to background queue
3. Background worker syncs to Google Sheets
4. Status indicator shows sync progress

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/taps/products` | List all products |
| GET | `/api/taps/products/{row}` | Get single product |
| PUT | `/api/taps/products/{row}/batch` | Batch update fields |
| POST | `/api/taps/extract/{row}` | Trigger AI extraction |
| POST | `/api/taps/wels-lookup` | WELS data lookup |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TAPS DATA FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │  PDF Spec   │     │  Supplier   │     │    WELS     │       │
│  │   Sheet     │     │    URL      │     │  Reference  │       │
│  │  (Col AL)   │     │  (Col A)    │     │  Database   │       │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘       │
│         │                   │                   │               │
│         ▼                   ▼                   │               │
│  ┌─────────────────────────────────────┐       │               │
│  │       AI Extractor (Claude)         │       │               │
│  │  - PDF first for dimensions         │       │               │
│  │  - URL for brand, style, images     │       │               │
│  └──────────────────┬──────────────────┘       │               │
│                     │                           │               │
│                     ▼                           ▼               │
│  ┌─────────────────────────────────────────────────────┐       │
│  │               DATA MERGER                            │       │
│  │   PDF data + URL data + WELS lookup = Final data    │       │
│  └─────────────────────────┬───────────────────────────┘       │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              DATA CLEANER                            │       │
│  │   - Applies rule-based standardization              │       │
│  │   - Normalizes mounting types, materials, etc.      │       │
│  └─────────────────────────┬───────────────────────────┘       │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────┐       │
│  │            GOOGLE SHEETS (48 columns)               │       │
│  │              Columns A-AV                           │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Common Workflows

### 1. Edit a Tap Product

1. Click product card → Modal opens
2. Edit fields in modal
3. Click Save → Instant feedback
4. Background sync to Google Sheets

### 2. WELS Lookup

1. Enter/select brand name
2. Click "Lookup WELS" button
3. System fetches WELS data from reference sheet
4. Auto-populates: flow_rate, wels_rating, wels_registration_number

### 3. Bulk AI Extraction

1. Select products with checkboxes
2. Click "Bulk Extract" button
3. System processes each product:
   - Fetches PDF spec sheet (if available)
   - Fetches supplier URL
   - Merges extracted data
   - Saves to Google Sheets

### 4. Filter by Missing Information

1. Use "Missing Information" filter dropdown
2. Select field (e.g., "Missing Spec Sheet")
3. View products missing that data
4. Work through list to complete data

---

## Differences from Sinks Collection

| Aspect | Sinks | Taps |
|--------|-------|------|
| Total Columns | 62 (A-BJ) | 48 (A-AV) |
| Pricing Columns | Yes | No |
| WELS Lookup | No | Yes |
| Dimensions | Bowl dimensions | Spout height/reach |
| Boolean Fields | has_overflow, etc. | swivel_spout, lead_free |

---

## Troubleshooting

### Data Not Saving

1. Check browser console for errors
2. Verify background save indicator completes
3. Check Google Sheets API quota

### WELS Lookup Not Working

1. Verify brand_name matches reference sheet
2. Check WELS reference sheet is accessible
3. Review lookup logs for errors

### Missing Quality Score

1. Ensure quality_fields are populated
2. Score auto-calculates on save
3. Check for empty required fields

---

*Last Updated: December 2024*
