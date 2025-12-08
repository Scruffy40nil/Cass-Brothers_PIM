# Sinks Collection - Technical Documentation

This document provides comprehensive documentation for the Sinks collection in the Cass Brothers PIM system.

---

## Table of Contents

1. [Overview](#overview)
2. [Configuration](#configuration)
3. [Field Mappings](#field-mappings)
4. [AI Extraction](#ai-extraction)
5. [Data Cleaning Rules](#data-cleaning-rules)
6. [Quality Fields](#quality-fields)
7. [Templates & UI](#templates--ui)
8. [JavaScript Functionality](#javascript-functionality)
9. [API Endpoints](#api-endpoints)
10. [Data Flow](#data-flow)
11. [Common Workflows](#common-workflows)

---

## Overview

The Sinks collection manages kitchen and laundry sink products with:

- **62 field mappings** (Columns A-BJ in Google Sheets)
- **45 AI-extractable fields** via Vision API and Claude
- **27 quality fields** for completeness tracking
- **Dual-source extraction** (PDF spec sheets + supplier URLs)
- **Automatic boolean field calculation** from installation type
- **Rule-based data standardization** before saving

### Key Features

| Feature | Status |
|---------|--------|
| AI Image Extraction | Enabled |
| Pricing Comparison | Disabled |
| Dual-Source Extraction | Enabled (PDF + URL) |
| Data Cleaning Rules | Enabled |

---

## Configuration

**File:** `config/collections.py` - `SinksCollection` class

```python
class SinksCollection(BaseCollectionConfig):
    name = 'sinks'
    display_name = 'Sinks'
    spreadsheet_id = '...'  # Google Sheets ID
    worksheet_name = 'Raw_Data'
    extract_images = True
    pricing_enabled = False
```

---

## Field Mappings

### System Fields (A-E)

| Column | Field Name | Description |
|--------|------------|-------------|
| A | `url` | Supplier product URL (primary source) |
| B | `variant_sku` | Product SKU for lookup |
| C | `key` | System key |
| D | `id` | System ID |
| E | `handle` | URL handle |

### Basic Product Info (F-H)

| Column | Field Name | Description |
|--------|------------|-------------|
| F | `title` | Product name |
| G | `vendor` | Vendor/supplier (synced with brand_name) |
| H | `colour` | Color/finish |

### Product Specifications (I-N)

| Column | Field Name | Description | Values |
|--------|------------|-------------|--------|
| I | `installation_type` | Mount type | Topmount, Undermount, Flushmount, Topmount & Undermount, etc. |
| J | `product_material` | Primary material | Stainless Steel, Granite, Ceramic, Fireclay, Composite |
| K | `grade_of_material` | Material quality grade | Text |
| L | `style` | Design style | Modern, Traditional, Farmhouse, Contemporary, etc. |
| M | `warranty_years` | Warranty period | Numeric (years) |
| N | `waste_outlet_dimensions` | Outlet size | e.g., "90mm" |

### Installation Type Booleans (O-Q)

These are **automatically calculated** from `installation_type`:

| Column | Field Name | Description |
|--------|------------|-------------|
| O | `is_undermount` | TRUE if undermount installation |
| P | `is_topmount` | TRUE if topmount installation |
| Q | `is_flushmount` | TRUE if flushmount installation |

**Calculation Logic:**
- Parses `installation_type` string for keywords
- Handles compound types: "Topmount & Undermount" sets both to TRUE
- Keyword synonyms:
  - Topmount: TOP MOUNT, TOP-MOUNT, SURFACE MOUNT, DROP-IN
  - Undermount: UNDER MOUNT, UNDER-MOUNT
  - Flushmount: FLUSH MOUNT, FLUSH-MOUNT, INSET

### Features (R-T)

| Column | Field Name | Description | Values |
|--------|------------|-------------|--------|
| R | `has_overflow` | Overflow drain | Yes/No (stored as TRUE/FALSE) |
| S | `tap_holes_number` | Number of tap holes | Numeric |
| T | `bowls_number` | Number of bowls | 1 or 2 |

### Overall Dimensions (U-X)

| Column | Field Name | Description |
|--------|------------|-------------|
| U | `length_mm` | Overall length in mm |
| V | `overall_width_mm` | Overall width in mm |
| W | `overall_depth_mm` | Overall depth in mm |
| X | `min_cabinet_size_mm` | Minimum cabinet size (calculated) |

**Min Cabinet Size Calculation:**
```
min_cabinet_size_mm = ceil((overall_width_mm + 50) / 100) * 100
```
Example: 450mm width → (450+50)/100 = 5 → 500mm cabinet

### Bowl Dimensions (Y-AE)

**Primary Bowl (Z-AB):**

| Column | Field Name | Description |
|--------|------------|-------------|
| Z | `bowl_width_mm` | Bowl width |
| AA | `bowl_depth_mm` | Bowl depth |
| AB | `bowl_height_mm` | Bowl height |

**Secondary Bowl (AC-AE):**

Only visible/applicable when `bowls_number = 2`:

| Column | Field Name | Description |
|--------|------------|-------------|
| AC | `second_bowl_width_mm` | Second bowl width |
| AD | `second_bowl_depth_mm` | Second bowl depth |
| AE | `second_bowl_height_mm` | Second bowl height |

### Brand & Location (AF-AH)

| Column | Field Name | Description |
|--------|------------|-------------|
| AF | `brand_name` | Brand/manufacturer |
| AG | `application_location` | Multi-select: Kitchen, Laundry, Bar |
| AH | `drain_position` | Center, Left, Right, Rear |

### Content & SEO (AI-AS)

| Column | Field Name | Description |
|--------|------------|-------------|
| AI | `body_html` | HTML product description |
| AJ | `features` | Bullet-point features |
| AK | `care_instructions` | Maintenance instructions |
| AL | `quality_score` | Auto-calculated (0-100%) |
| AM | `shopify_status` | Active/Draft |
| AN | `shopify_price` | RRP price (read-only) |
| AO | `shopify_compare_price` | Sale price (read-only) |
| AP | `shopify_weight` | Product weight |
| AQ | `shopify_tags` | Comma-separated tags |
| AR | `seo_title` | SEO page title |
| AS | `seo_description` | SEO meta description |

### Media Assets (AT-AX)

| Column | Field Name | Description |
|--------|------------|-------------|
| AT | `shopify_images` | Comma-separated image URLs |
| AU | `shopify_spec_sheet` | PDF spec sheet URL (used for Vision API extraction) |
| AV | `shopify_collections` | Shopify collection assignments |
| AW | `shopify_url` | Shopify product URL |
| AX | `last_shopify_sync` | Last sync timestamp |

### System & Generated (BE-BJ)

| Column | Field Name | Description |
|--------|------------|-------------|
| BE | `clean_data` | Clean data checkbox |
| BF | `faqs` | AI-generated FAQs |

---

## AI Extraction

### Extraction Fields (45 total)

The AI extracts the following fields using Claude Vision API:

**Basic Info:**
- `sku`, `title`, `brand_name`, `vendor`

**Specifications:**
- `installation_type`, `product_material`, `grade_of_material`, `style`
- `is_undermount`, `is_topmount`, `is_flushmount` (calculated)

**Features:**
- `has_overflow`, `bowls_number`, `tap_holes_number`, `range`

**Dimensions (from PDF spec sheets):**
- `length_mm`, `overall_width_mm`, `overall_depth_mm`
- `min_cabinet_size_mm`, `cutout_size_mm`
- `bowl_width_mm`, `bowl_depth_mm`, `bowl_height_mm`
- `second_bowl_width_mm`, `second_bowl_depth_mm`, `second_bowl_height_mm`
- `waste_outlet_dimensions`, `drain_position`

**Other:**
- `application_location`, `warranty_years`, `cubic_weight`
- `shopify_images`

### Dual-Source Extraction Strategy

Sinks uses a **PDF-first extraction strategy**:

```
1. Check for spec sheet URL (shopify_spec_sheet field)
   ↓
2. If found: Extract dimensions via Vision API from PDF
   - Dimensions are more accurate from technical drawings
   ↓
3. Extract from supplier URL (url field)
   - Brand, style, features, descriptions
   ↓
4. Merge results:
   - PDF dimensions ALWAYS take priority
   - URL fills in missing non-dimension fields
```

**Dimension Priority Fields:**
```python
dimension_fields = [
    'length_mm', 'overall_width_mm', 'overall_depth_mm',
    'bowl_width_mm', 'bowl_depth_mm', 'bowl_height_mm',
    'second_bowl_width_mm', 'second_bowl_depth_mm', 'second_bowl_height_mm',
    'min_cabinet_size_mm', 'cutout_size_mm', 'waste_outlet_dimensions'
]
```

---

## Data Cleaning Rules

**File:** `core/data_cleaner.py`

Rules are loaded from Google Sheets tabs in the sinks spreadsheet:

| Rule Sheet | Field Cleaned |
|------------|---------------|
| `Warranty_Rules` | `warranty_years` |
| `Material_Rules` | `product_material` |
| `Installation_Rules` | `installation_type` |
| `Style_Rules` | `style` |
| `Grade_Rules` | `grade_of_material` |
| `Location_Rules` | `application_location` |
| `Drain_Rules` | `drain_position` |

### Rule Format

Each rule sheet has two columns:
- **Column A:** Search term (case-insensitive)
- **Column B:** Standard value (blank = delete the field)

Example `Installation_Rules`:
```
| Search Term    | Standard Value        |
|----------------|----------------------|
| UNDER MOUNT    | Undermount           |
| TOP MOUNT      | Topmount             |
| DROP-IN        | Topmount             |
| FLUSH          | Flushmount           |
```

### Cleaning Pipeline

Applied automatically during AI extraction:

1. **Apply field-specific rules** (installation, material, grade, style, location, drain, warranty)
2. **Calculate boolean fields** (`is_undermount`, `is_topmount`, `is_flushmount`)
3. **Calculate derived fields** (`min_cabinet_size_mm`, `cubic_weight`)
4. **Sync brand/vendor** (copy `brand_name` to `vendor`)
5. **Extract bowls number** from title if not set

### Cubic Weight Calculation

```python
cubic_weight = (length × width × (depth + 100)) / 5,000,000
```
- Adds 100mm for pallet/packaging allowance
- Result in kg

---

## Quality Fields

**27 fields** tracked for data completeness:

### Brand & Basic
- `brand_name`, `vendor`, `colour`

### Specifications
- `installation_type`, `product_material`, `grade_of_material`, `style`
- `warranty_years`, `waste_outlet_dimensions`

### Installation Types
- `is_undermount`, `is_topmount`, `is_flushmount`

### Features
- `has_overflow`, `tap_holes_number`, `bowls_number`

### Dimensions
- `length_mm`, `overall_width_mm`, `overall_depth_mm`
- `min_cabinet_size_mm`, `cutout_size_mm`
- `bowl_width_mm`, `bowl_depth_mm`, `bowl_height_mm`

### Location & Drain
- `application_location`, `drain_position`

### Content
- `body_html`, `features`, `care_instructions`, `faqs`

### Assets
- `shopify_spec_sheet`

### Quality Score Calculation

```
quality_score = (fields_filled / 27) * 100
```

Products are marked **incomplete** if any quality field is missing.

---

## Templates & UI

### Main Template

**File:** `templates/collection/sinks.html`

Extends the base collection template with:
- Sinks-specific styling for dimension sections
- Action buttons: Sync, Export, Bulk Extract
- Includes: Edit modal, Add modal, Bulk upload modal

### Edit Modal

**File:** `templates/collection/modals/sinks_modal.html`

#### Modal Sections

1. **Header**
   - Quality progress bar
   - Action buttons: Save, AI Extract, Extract Images, Compare

2. **Spec Sheet Verification**
   - URL input with validate/extract buttons
   - Status badge (match/mismatch)

3. **Product Images Gallery**
   - Main image with navigation
   - Draggable thumbnail gallery
   - Image counter

4. **Form Field Groups:**

   | Group | Fields |
   |-------|--------|
   | Basic Information | SKU, Title, Status, Vendor |
   | Sink Specifications | Installation, Material, Grade, Brand, Colour, Style, Bowls, Tap Holes, Overflow, Warranty |
   | Overall Dimensions | Length, Width, Depth, Min Cabinet Size |
   | Bowl Dimensions | Primary bowl (3 fields), Secondary bowl (3 fields - conditional) |
   | Pricing | RRP, Sale Price (read-only) |
   | Additional Info | Weight, Application Location, Tags |
   | SEO | Title, Description |

5. **Content Tabs:**
   - Description (HTML)
   - Features (bullet points)
   - Care Instructions
   - FAQs
   - Asterisk Info (auto-injected into content)

---

## JavaScript Functionality

**File:** `static/js/collection/sinks.js`

### Field Mappings

```javascript
SINKS_FIELD_MAPPINGS = {
    'editSku': 'variant_sku',
    'editTitle': 'title',
    'editInstallationType': 'installation_type',
    'editMaterial': 'product_material',
    'editGradeOfMaterial': 'grade_of_material',
    'editBrandName': 'brand_name',
    'editColour': 'colour',
    'editStyle': 'style',
    'editBowlsNumber': 'bowls_number',
    // ... 46 total mappings
}
```

### Key Functions

| Function | Description |
|----------|-------------|
| `renderProductSpecs(product)` | Displays sink specs as badges in list view |
| `collectFormData(collectionName)` | Gathers form values, converts Yes/No to TRUE/FALSE |
| `saveSinksProduct()` | Instant save with background processing |
| `populateCollectionSpecificFields(data)` | Loads product data into modal form |
| `handleBowlsNumberChange()` | Shows/hides secondary bowl fields |
| `autoVerifySpecSheet()` | Validates SKU in spec sheet URL |
| `refreshModalAfterExtraction(rowNum)` | Updates modal after AI extraction |
| `extractCurrentProductImages(event)` | Triggers AI image extraction |
| `generateAIDescription(event)` | Generates description from specs |
| `extractDimensionsFromPDF(rowNum)` | Vision API extraction from spec sheet |

### Save Process

```
1. User clicks "Save Changes"
   ↓
2. collectFormData() gathers all field values
   ↓
3. Boolean conversion: Yes → TRUE, No → FALSE
   ↓
4. Immediate UI feedback: "Saved!" message
   ↓
5. Local productsData updated instantly
   ↓
6. Save queued for background processing
   ↓
7. PUT /api/sinks/products/{row}/batch
   ↓
8. Google Sheets updated
```

---

## API Endpoints

### Product Read

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sinks/products/{row_num}` | Get single product |
| GET | `/api/sinks/products/paginated` | Get paginated products |
| GET | `/api/sinks/products/missing-info` | Get products with missing fields |

### Product Update

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/sinks/products/{row_num}/batch` | Batch update multiple fields |
| PUT | `/api/sinks/products/{row_num}` | Update single field |

### AI Extraction

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sinks/process/extract` | Bulk extraction |
| POST | `/api/sinks/products/{row_num}/extract` | Single product extraction (dual-source) |
| POST | `/api/sinks/products/{row_num}/extract-images` | Extract images from URL |
| POST | `/api/sinks/products/{row_num}/extract-dimensions` | Extract dimensions from PDF |

### Content Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sinks/products/{row_num}/generate-description` | Generate HTML description |
| POST | `/api/sinks/products/{row_num}/generate-title` | Generate product title |
| POST | `/api/sinks/products/{row_num}/generate-faqs` | Generate FAQs |

---

## Data Flow

### Edit Flow

```
Google Sheets (Sinks Raw_Data)
    ↓
GET /api/sinks/products/{row}
    ↓
populateCollectionSpecificFields(data)
    ↓
[User edits form fields]
    ↓
collectFormData() + Boolean conversion
    ↓
PUT /api/sinks/products/{row}/batch
    ↓
sheets_manager.update_product_row()
    ↓
Google Sheets (updated)
```

### AI Extraction Flow

```
[Click "AI Extract"]
    ↓
POST /api/sinks/products/{row}/extract
    ↓
DUAL-SOURCE EXTRACTION:
├── Fetch shopify_spec_sheet (PDF)
├── Vision API → dimensions
├── Fetch supplier URL
├── Claude API → brand/style/features
└── Merge (PDF dimensions priority)
    ↓
data_cleaner.clean_extracted_data()
├── Apply rule standardization
├── Calculate booleans
└── Calculate derived fields
    ↓
sheets_manager.update_product_row()
    ↓
SocketIO: product_updated
    ↓
refreshModalAfterExtraction()
    ↓
[Modal shows updated values with highlight]
```

---

## Common Workflows

### 1. Add New Sink Product

1. Click "Add Product" button
2. Enter SKU and supplier URL
3. Click "Save" to create row
4. Open edit modal
5. Click "AI Extract" for automatic data population
6. Review and adjust extracted values
7. Add spec sheet URL if available
8. Click "Extract Dimensions" for accurate measurements
9. Save changes

### 2. Fix Missing Dimensions

1. Go to "Missing Information" filter
2. Select `length_mm`, `overall_width_mm`, `overall_depth_mm`
3. For each product:
   - Open edit modal
   - Add spec sheet PDF URL
   - Click "Extract Dimensions"
   - Verify values
   - Save

### 3. Bulk Spec Sheet Extraction

1. Click "Bulk Spec Extract" button
2. Select products with spec sheet URLs
3. Choose "Overwrite existing" if needed
4. Start extraction
5. Monitor progress via SocketIO updates
6. Review results in product list

### 4. Generate Product Content

1. Open product edit modal
2. Ensure specifications are filled
3. Go to each content tab:
   - Description: Click "Generate" for HTML description
   - Features: Click "Generate" for bullet points
   - Care: Click "Generate" for maintenance guide
   - FAQs: Click "Generate" for Q&A
4. Review and edit generated content
5. Save changes

---

## Troubleshooting

### Missing Information Filter Shows Wrong Results

**Cause:** Browser cache holding old data

**Solution:**
1. Hard refresh: `Ctrl+Shift+R`
2. Or add `?force_refresh=true` to URL

### Dimensions Not Extracting from PDF

**Possible causes:**
1. PDF URL is invalid or inaccessible
2. PDF is image-based without text layer
3. Dimensions not clearly labeled in PDF

**Solutions:**
1. Verify PDF URL is accessible
2. Try manual dimension entry
3. Use a different spec sheet source

### Boolean Fields Not Updating

**Cause:** Installation type not matching expected keywords

**Solution:**
1. Check `Installation_Rules` in Google Sheets
2. Ensure installation type uses standard values
3. Re-run AI extraction after fixing rules

### Save Not Persisting

**Cause:** Background save queue failed

**Solution:**
1. Check browser console for errors
2. Verify network connectivity
3. Check PythonAnywhere error logs
4. Try saving again

---

## File References

| File | Purpose |
|------|---------|
| `config/collections.py` | SinksCollection configuration |
| `core/data_processor.py` | Dual-source extraction logic |
| `core/data_cleaner.py` | Rule-based data standardization |
| `core/ai_extractor.py` | Vision API extraction |
| `core/sheets_manager.py` | Google Sheets operations |
| `flask_app.py` | API endpoints |
| `templates/collection/sinks.html` | Main template |
| `templates/collection/modals/sinks_modal.html` | Edit modal |
| `static/js/collection/sinks.js` | Frontend JavaScript |
| `static/js/collection/base.js` | Shared collection functions |
