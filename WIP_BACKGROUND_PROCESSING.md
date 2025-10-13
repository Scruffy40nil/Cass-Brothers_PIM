# WIP Background Processing System

## Overview

The WIP (Work-In-Progress) background processing system allows you to process large batches of products for AI extraction without timeouts or blocking the UI.

## Key Features

- **Asynchronous Processing**: Products are processed in the background, so you can continue working
- **Real-time Progress Updates**: Socket.IO events provide live progress updates
- **Job Status Tracking**: Query job status at any time via API
- **Error Recovery**: Failed products are tracked; successful products continue processing
- **Rate Limit Management**: Automatic 20-second delays between products to respect Google Sheets API limits
- **Scalable**: Process up to 100 products per batch (vs previous 30 limit with timeouts)

## How It Works

### 1. Starting a Background Job

**Endpoint**: `POST /api/<collection_name>/wip/process`

**Request Body**:
```json
{
  "wip_ids": [1, 2, 3, 4, 5]
}
```

**Response**:
```json
{
  "success": true,
  "job_id": "ce672290-f093-4801-b4a1-078f10ab0801",
  "total_products": 5,
  "message": "Background processing started for 5 products. Use the job_id to track progress.",
  "status_url": "/api/sinks/wip/jobs/ce672290-f093-4801-b4a1-078f10ab0801"
}
```

The API returns immediately with a `job_id` that you can use to track progress.

### 2. Checking Job Status

**Endpoint**: `GET /api/<collection_name>/wip/jobs/<job_id>`

**Response**:
```json
{
  "success": true,
  "job": {
    "job_id": "ce672290-f093-4801-b4a1-078f10ab0801",
    "collection_name": "sinks",
    "status": "running",
    "total_products": 5,
    "processed_products": 2,
    "successful_products": 2,
    "failed_products": 0,
    "results": [
      {
        "wip_id": 1,
        "sku": "ABC123",
        "row_num": 150,
        "success": true,
        "extracted_fields": ["title", "price", "description"],
        "duration": 45.2
      }
    ],
    "error": null,
    "created_at": "2025-10-13T23:43:55.526819",
    "started_at": "2025-10-13T23:44:00.123456",
    "completed_at": null
  }
}
```

### 3. Listing Recent Jobs

**Endpoint**: `GET /api/<collection_name>/wip/jobs?limit=10`

Returns a list of recent jobs for the collection.

### 4. Cancelling a Job

**Endpoint**: `POST /api/<collection_name>/wip/jobs/<job_id>/cancel`

Attempts to cancel a running job. Note: Products already being processed will complete.

## Socket.IO Real-Time Updates

If Socket.IO is enabled, you'll receive real-time progress updates:

**Event**: `wip_job_progress`

**Event Data**:
```javascript
{
  job_id: "ce672290-f093-4801-b4a1-078f10ab0801",
  status: "processing", // or "started", "completed", "failed"
  total: 5,
  processed: 2,
  successful: 2,
  failed: 0,
  current_product: {
    wip_id: 2,
    sku: "XYZ789",
    success: true,
    row_num: 151
  }
}
```

**Example Frontend Code**:
```javascript
socket.on('wip_job_progress', (data) => {
  console.log(`Job ${data.job_id}: ${data.processed}/${data.total} products processed`);

  if (data.status === 'completed') {
    console.log(`Job completed! ${data.successful} successful, ${data.failed} failed`);
  }

  if (data.current_product) {
    console.log(`Just processed: ${data.current_product.sku}`);
  }
});
```

## Job Statuses

- **queued**: Job created but not yet started
- **running**: Job is currently processing products
- **completed**: Job finished successfully
- **failed**: Job encountered a fatal error
- **cancelled**: Job was cancelled by user

## Processing Steps Per Product

For each WIP product, the system:

1. **Add to Google Sheets** (SKU + URL)
2. **Run AI Extraction** (scrape URL, extract product data)
3. **Generate Descriptions** (body_html, features, care_instructions)
4. **Run Google Apps Script Cleaning** (post-processing)
5. **Mark as Complete** (status = 'ready')

Each step includes error handling, so partial failures don't stop the entire batch.

## Rate Limiting

- 20-second delay between products to stay under Google Sheets API limits (60 requests/minute)
- Each product uses approximately 15-20 API calls
- Estimated time: ~40-60 seconds per product

**Example**: 20 products = ~13-20 minutes total

## Database Schema

### wip_jobs table

```sql
CREATE TABLE wip_jobs (
    job_id TEXT PRIMARY KEY,
    collection_name TEXT NOT NULL,
    wip_ids TEXT NOT NULL,  -- JSON array
    status TEXT NOT NULL,
    total_products INTEGER NOT NULL,
    processed_products INTEGER DEFAULT 0,
    successful_products INTEGER DEFAULT 0,
    failed_products INTEGER DEFAULT 0,
    results TEXT,  -- JSON array
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
)
```

## Architecture

### Components

1. **WIPJobManager** (`core/wip_job_manager.py`)
   - Creates and tracks jobs
   - Manages background threads
   - Emits Socket.IO events
   - Persists job state to database

2. **Background Processor** (`core/wip_background_processor.py`)
   - Executes the actual product processing
   - Handles rate limiting
   - Reports progress back to job manager
   - Manages errors per product

3. **Flask Routes** (`flask_app.py`)
   - `/api/<collection>/wip/process` - Start job
   - `/api/<collection>/wip/jobs/<job_id>` - Get status
   - `/api/<collection>/wip/jobs` - List jobs
   - `/api/<collection>/wip/jobs/<job_id>/cancel` - Cancel job

## Migration from Old System

### Before (Synchronous)
- Maximum 30 products per batch
- Request timeout after ~2-5 minutes
- UI blocked during processing
- No progress visibility
- All-or-nothing: one failure could stop everything

### After (Asynchronous)
- Maximum 100 products per batch
- No request timeout (returns immediately)
- UI remains responsive
- Real-time progress updates
- Resilient: failures tracked but processing continues

### Breaking Changes

**None!** The API endpoint remains the same (`/api/<collection>/wip/process`), but the response format changed:

**Old Response**:
```json
{
  "success": true,
  "total": 20,
  "successful": 8,
  "failed": 12,
  "results": [...]
}
```

**New Response**:
```json
{
  "success": true,
  "job_id": "...",
  "total_products": 20,
  "message": "...",
  "status_url": "..."
}
```

Frontend code should be updated to:
1. Store the `job_id`
2. Poll the status URL or listen to Socket.IO events
3. Display progress to user
4. Show final results when job completes

## Troubleshooting

### Job stuck in "running" status
- Check logs for errors
- Jobs persist across server restarts
- Use cancel endpoint to mark as cancelled

### Products showing as "extracting" or "generating" forever
- These are WIP product statuses, separate from job status
- Use reset endpoint: `POST /api/<collection>/wip/<wip_id>/reset`

### Socket.IO events not received
- Verify Socket.IO is enabled in settings
- Check browser console for connection errors
- Job status API still works without Socket.IO

### Rate limit errors (429)
- System includes 20s delays, but if errors persist:
- Reduce batch size
- Wait before starting new jobs
- Check for other processes using Google Sheets API

## Performance Tips

1. **Batch Size**: 20-50 products is optimal balance
2. **Parallel Jobs**: Only run one job at a time per collection
3. **Monitoring**: Use Socket.IO for best user experience
4. **Retry Failed**: Use job results to identify and retry failed products

## Future Enhancements

- [ ] Email notification when job completes
- [ ] Retry failed products automatically
- [ ] Priority queue for urgent products
- [ ] Multiple parallel workers (with careful rate limiting)
- [ ] Job scheduling (process at specific times)
- [ ] Better progress estimation (time remaining)
