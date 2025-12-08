# Basins Collection - Technical Documentation

This document provides comprehensive documentation for the Basins (Washbasins/Vanity Basins) collection in the Cass Brothers PIM system.

**Last Verified:** December 2024 (against actual Google Sheet headers)

---

## Table of Contents

1. [Overview](#overview)
2. [Configuration](#configuration)
3. [Field Mappings](#field-mappings)
4. [AI Extraction](#ai-extraction)
5. [Quality Fields](#quality-fields)
6. [Templates & UI](#templates--ui)
7. [JavaScript Functionality](#javascript-functionality)
8. [API Endpoints](#api-endpoints)
9. [Data Flow](#data-flow)
10. [Common Workflows](#common-workflows)

---

## Overview

The Basins collection manages washbasin, bathroom basin, and vanity basin products with:

- **46 field mappings** (Columns A-AT in Google Sheets)
- **14 AI-extractable fields** via Vision API and Claude
- **19 quality fields** for completeness tracking
- **Dual-source extraction** (PDF spec sheets + supplier URLs)
- **1 boolean field** (has_overflow)

### Key Features

| Feature | Status |
|---------|--------|
| AI Image Extraction | Enabled |
| Pricing Comparison | Disabled (fields defined but not active) |
| Dual-Source Extraction | Enabled (PDF + URL) |
| Data Cleaning Rules | Enabled |

---

## Configuration

**File:** `config/collections.py` - `BasinsCollection` class

```python
class BasinsCollection(CollectionConfig):
    """Configuration for Basins collection - washbasins, bathroom basins, and vanity basins"""

    name = 'basins'
    display_name = 'Basins'
    spreadsheet_id = '1fJ44P_mCfVQ7_D6bcm_smbB2coaMGTe1Vj8_RrtH2Pc'
    worksheet_name = 'Raw_Data'
    extract_images = True
    pricing_enabled = False
    url_field_for_extraction = 'shopify_spec_sheet'  # Extracts from PDF spec sheets
```

---

## Field Mappings

**Verified against actual Google Sheet headers on 2024-12-08**

### System Fields (A-E)

| Column | # | Field Name | Actual Header |
|--------|---|------------|---------------|
| A | 1 | `url` | URL |
| B | 2 | `variant_sku` | Variant SKU |
| C | 3 | `key` | Key |
| D | 4 | `id` | ID |
| E | 5 | `handle` | Handle |

### Basic Product Info (F-G)

| Column | # | Field Name | Actual Header |
|--------|---|------------|---------------|
| F | 6 | `title` | Title |
| G | 7 | `vendor` | Vendor |

### Basin Specifications (H-O)

| Column | # | Field Name | Actual Header | Description |
|--------|---|------------|---------------|-------------|
| H | 8 | `colour_finish` | Metafield: product_colours_finishes | Color/finish (e.g., "Gloss Alpine White") |
| I | 9 | `installation_type` | Metafield: installation_type | Countertop, Undermount, Wall-hung, etc. |
| J | 10 | `product_material` | Metafield: product_material | Ceramic, Vitreous China, Stone, etc. |
| K | 11 | `grade_of_material` | Metafield: grade_of_material | Grade/quality of material |
| L | 12 | `style` | Metafield: style | Design style |
| M | 13 | `warranty_years` | Metafield: warranty_years | Warranty period (number) |
| N | 14 | `waste_outlet_dimensions` | Metafield: ldswaste_outlet_dimensions | Waste outlet size (e.g., "32mm") |
| O | 15 | `has_overflow` | Metafield: has_overflow [boolean] | TRUE/FALSE |

### Dimensions (P-R)

| Column | # | Field Name | Actual Header |
|--------|---|------------|---------------|
| P | 16 | `overall_length_mm` | Metafield: overall_length_mm |
| Q | 17 | `overall_width_mm` | Metafield: overall_width_mm |
| R | 18 | `overall_depth_mm` | Metafield: overall_depth_mm |

### Additional Specs (S-U)

| Column | # | Field Name | Actual Header | Description |
|--------|---|------------|---------------|-------------|
| S | 19 | `brand_name` | Metafield: brand_name | Brand/manufacturer (e.g., "Duravit") |
| T | 20 | `application_location` | Metafield: application_location | Where basin is used (e.g., "Bathroom") |
| U | 21 | `drain_position` | Metafield: drain_position | Centre, Rear Centre, Left, Right, etc. |

### Content (V-X)

| Column | # | Field Name | Actual Header |
|--------|---|------------|---------------|
| V | 22 | `body_html` | Body HTML |
| W | 23 | `features` | Features |
| X | 24 | `care_instructions` | Care Instructions |

### System/Shopify Fields (Y-AL)

| Column | # | Field Name | Actual Header |
|--------|---|------------|---------------|
| Y | 25 | `quality_score` | Quality score |
| Z | 26 | `shopify_status` | Shopify Status |
| AA | 27 | `shopify_price` | Variant Price |
| AB | 28 | `shopify_compare_price` | Variant Compare At Price |
| AC | 29 | `shopify_weight` | Shopify Weight |
| AD | 30 | `shopify_tags` | Tags |
| AE | 31 | `seo_title` | Search Engine Page Title |
| AF | 32 | `seo_description` | Search Engine Meta Description |
| AG | 33 | (empty) | (empty column) |
| AH | 34 | `shopify_images` | Shopify Images |
| AI | 35 | `shopify_spec_sheet` | shopify_spec_sheet |
| AJ | 36 | `shopify_collections` | Shopify Collections |
| AK | 37 | `shopify_url` | Shopify URL |
| AL | 38 | `last_shopify_sync` | Last Shopify Sync |

### VLOOK Reference Fields (AM-AR)

| Column | # | Field Name | Actual Header |
|--------|---|------------|---------------|
| AM | 39 | `length_vlook` | length vlook |
| AN | 40 | `width_vlook` | width vlook |
| AO | 41 | `depth_vlook` | depth vlook |
| AP | 42 | `height_vlook` | height vlook |
| AQ | 43 | `ai_installation_type` | ai installation type |
| AR | 44 | `scraped_installation_type` | scraped installation type |

### System & Content (AS-AT)

| Column | # | Field Name | Actual Header |
|--------|---|------------|---------------|
| AS | 45 | `clean_data` | Clean Data |
| AT | 46 | `faqs` | FAQ's |

---

## AI Extraction

### Extraction Fields (14 total)

The AI extracts the following fields using Claude Vision API:

**Basic Info:**
- `colour_finish`, `style`

**Specifications:**
- `installation_type`, `product_material`, `grade_of_material`, `warranty_years`
- `waste_outlet_dimensions`, `has_overflow`

**Dimensions:**
- `overall_length_mm`, `overall_width_mm`, `overall_depth_mm`

**Configuration:**
- `application_location`, `drain_position`

### Dual-Source Extraction Strategy

Basins uses a **PDF-first extraction strategy**:

1. **PDF Spec Sheet First** - Extract from spec sheet PDF (Column AI)
   - Best for: dimensions, technical specs, material info

2. **Supplier URL Second** - Extract from product page URL (Column A)
   - Best for: style, images, descriptions

3. **Merge Results** - PDF data takes priority for dimensions

```python
# In data_processor.py
dual_source_collections = ['sinks', 'basins', 'filter_taps', 'taps']
```

---

## Quality Fields

The following 19 fields are tracked for quality scoring:

```python
quality_fields = [
    'vendor', 'brand_name', 'colour_finish', 'style', 'installation_type', 'product_material',
    'grade_of_material', 'warranty_years', 'overall_length_mm', 'overall_width_mm',
    'overall_depth_mm', 'waste_outlet_dimensions', 'has_overflow',
    'application_location', 'drain_position', 'body_html', 'features', 'care_instructions', 'faqs'
]
```

Quality score = (filled fields / total quality fields) x 100

---

## Templates & UI

### Key Files

| File | Purpose |
|------|---------|
| `templates/collection/collection_detail.html` | Main collection view |
| `templates/collection/modals/basins_modal.html` | Product edit modal |
| `static/js/collection/basins.js` | Basins-specific JavaScript |

### Modal Sections

The basins edit modal includes these sections:

1. **Spec Sheet Verification** - PDF spec sheet URL validation
2. **Additional Images** - Image management with drag-drop reordering
3. **Product Images** - Main image gallery with navigation
4. **Basic Information** - Title, SKU, Vendor, Brand Name, Style, Colour/Finish
5. **Basin Specifications** - Installation Type, Material, Grade, Warranty, Waste Outlet, Has Overflow
6. **Dimensions** - Overall Length, Overall Width, Overall Depth (all in mm)
7. **Application & Configuration** - Application Location, Drain Position
8. **Product Content** - Tabbed content (Description, Features, Care, FAQs, Asterisk Info)
9. **Shopify Data** - Status, Price, Compare Price, Weight, Tags
10. **SEO** - SEO Title, SEO Description

### Installation Type Options

Basin-specific installation types:
- Countertop
- Undermount
- Wall-hung
- Pedestal
- Semi-recessed
- Inset
- Vessel

### Application Location Options

- Bathroom
- Ensuite
- Powder Room
- Laundry
- Kitchen
- Commercial

### Drain Position Options

- Centre
- Rear Centre
- Left
- Right
- Rear Left
- Rear Right

---

## JavaScript Functionality

**File:** `static/js/collection/basins.js`

### Key Functions

| Function | Purpose |
|----------|---------|
| `saveBasinsProduct()` | Save with instant feedback + background sync |
| `collectFormData()` | Gather all modal form data |
| `populateCollectionSpecificFields()` | Populate modal with basin-specific data |
| `renderProductSpecs()` | Render basin specs on product cards |
| `addNewImage()` | Add image URL to gallery |
| `removeImage()` | Remove image from gallery |
| `initializeAdditionalImages()` | Initialize image gallery from data |

### Field Mappings (Verified)

```javascript
const BASINS_FIELD_MAPPINGS = {
    // System fields (A-E)
    'editUrl': 'url',                                  // A
    'editSku': 'variant_sku',                          // B

    // Basic product info (F-G)
    'editTitle': 'title',                              // F
    'editVendor': 'vendor',                            // G

    // Basin specifications (H-O)
    'editColourFinish': 'colour_finish',               // H
    'editInstallationType': 'installation_type',       // I
    'editProductMaterial': 'product_material',         // J
    'editGradeOfMaterial': 'grade_of_material',        // K
    'editStyle': 'style',                              // L
    'editWarrantyYears': 'warranty_years',             // M
    'editWasteOutletDimensions': 'waste_outlet_dimensions', // N
    'editHasOverflow': 'has_overflow',                 // O [boolean]

    // Dimensions (P-R)
    'editOverallLengthMm': 'overall_length_mm',        // P
    'editOverallWidthMm': 'overall_width_mm',          // Q
    'editOverallDepthMm': 'overall_depth_mm',          // R

    // Additional specs (S-U)
    'editBrandName': 'brand_name',                     // S
    'editApplicationLocation': 'application_location', // T
    'editDrainPosition': 'drain_position',             // U

    // Content, Shopify, SEO fields continue...
};
```

### Boolean Field Conversion

The `has_overflow` field uses boolean conversion:

```javascript
// Display: TRUE/FALSE -> Yes/No
// Save: Yes/No -> TRUE/FALSE
```

### Background Save Queue

Basins uses instant save with background processing:

1. User clicks Save -> Instant "Saved!" feedback
2. Changes added to background queue
3. Background worker syncs to Google Sheets
4. Status indicator shows sync progress

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/basins/products` | List all products |
| GET | `/api/basins/products/{row}` | Get single product |
| PUT | `/api/basins/products/{row}/batch` | Batch update fields |
| POST | `/api/basins/extract/{row}` | Trigger AI extraction |

---

## Data Flow

```
+---------------------------------------------------------------+
|                    BASINS DATA FLOW                            |
+---------------------------------------------------------------+
|                                                                |
|  +-------------+     +-------------+                           |
|  |  PDF Spec   |     |  Supplier   |                           |
|  |   Sheet     |     |    URL      |                           |
|  |  (Col AI)   |     |  (Col A)    |                           |
|  +------+------+     +------+------+                           |
|         |                   |                                  |
|         v                   v                                  |
|  +-------------------------------------+                       |
|  |       AI Extractor (Claude)         |                       |
|  |  - PDF first for dimensions         |                       |
|  |  - URL for style, images            |                       |
|  +------------------+------------------+                       |
|                     |                                          |
|                     v                                          |
|  +-------------------------------------+                       |
|  |            DATA MERGER              |                       |
|  |   PDF data + URL data = Final data  |                       |
|  +------------------+------------------+                       |
|                     |                                          |
|                     v                                          |
|  +-------------------------------------+                       |
|  |           DATA CLEANER              |                       |
|  |  - Normalizes installation types    |                       |
|  |  - Standardizes materials           |                       |
|  +------------------+------------------+                       |
|                     |                                          |
|                     v                                          |
|  +-------------------------------------+                       |
|  |       GOOGLE SHEETS (46 columns)    |                       |
|  |            Columns A-AT             |                       |
|  +-------------------------------------+                       |
|                                                                |
+---------------------------------------------------------------+
```

---

## Common Workflows

### 1. Edit a Basin Product

1. Click product card -> Modal opens
2. Edit fields in modal
3. Click Save -> Instant feedback
4. Background sync to Google Sheets

### 2. Bulk AI Extraction

1. Select products with checkboxes
2. Click "Bulk Extract" button
3. System processes each product:
   - Fetches PDF spec sheet (if available)
   - Fetches supplier URL
   - Merges extracted data
   - Saves to Google Sheets

### 3. Manage Product Images

1. Open product modal
2. Add new images via URL input
3. Drag thumbnails to reorder (first = main image)
4. Remove unwanted images
5. Save changes

### 4. Filter by Missing Information

1. Use "Missing Information" filter dropdown
2. Select field (e.g., "Missing Dimensions")
3. View products missing that data
4. Work through list to complete data

---

## Differences from Other Collections

| Aspect | Basins | Sinks | Taps |
|--------|--------|-------|------|
| Total Columns | 46 (A-AT) | 62 (A-BJ) | 48 (A-AV) |
| Pricing | Disabled | Enabled | Disabled |
| Boolean Fields | has_overflow | has_overflow, etc. | swivel_spout, lead_free |
| Dimensions | overall_length, overall_width, overall_depth | bowl dimensions | spout height/reach |
| WELS Lookup | No | No | Yes |
| Installation Types | 7 basin types | N/A | mounting types |

---

## Troubleshooting

### Data Not Saving

1. Check browser console for errors
2. Verify background save indicator completes
3. Check Google Sheets API quota

### Installation Type Not Showing

1. Verify value matches one of the predefined options
2. If custom value, it will be added dynamically to dropdown
3. Check for case sensitivity issues

### Dimensions Not Extracting

1. Verify PDF spec sheet URL is accessible
2. Check PDF contains dimension information
3. Review extraction logs for errors

### Missing Quality Score

1. Ensure quality_fields are populated
2. Score auto-calculates on save
3. Check for empty required fields

---

*Last Updated: December 2024*
*Verified against actual Google Sheet: 1fJ44P_mCfVQ7_D6bcm_smbB2coaMGTe1Vj8_RrtH2Pc*
