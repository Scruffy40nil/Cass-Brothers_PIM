# Deploy WIP Background Processing to PythonAnywhere

## Quick Deployment Steps

### 1. SSH into PythonAnywhere

```bash
ssh <your-username>@ssh.pythonanywhere.com
```

### 2. Navigate to Your Project Directory

```bash
cd ~/Cass-Brothers_PIM
# or wherever your project is located
```

### 3. Pull Latest Changes

```bash
git pull origin main
```

This will pull the new background processing system including:
- `core/wip_job_manager.py`
- `core/wip_background_processor.py`
- Updated `flask_app.py`
- `WIP_BACKGROUND_PROCESSING.md`

### 4. Create Database Migration (if needed)

The new system creates a `wip_jobs` table automatically on first run, but you can verify it:

```bash
python3 -c "
from core.wip_job_manager import get_wip_job_manager
job_manager = get_wip_job_manager()
print('✅ WIP job manager initialized and database table created')
"
```

### 5. Reload Your Web App

**Option A: Via PythonAnywhere Dashboard**
1. Go to https://www.pythonanywhere.com/user/<your-username>/webapps/
2. Find your web app
3. Click the **"Reload"** button

**Option B: Via Console**
```bash
# Use the PythonAnywhere API
curl -X POST https://www.pythonanywhere.com/api/v0/user/<your-username>/webapps/<your-domain>/reload/ \
  -H "Authorization: Token <your-api-token>"
```

### 6. Verify Deployment

Test the new endpoints:

```bash
# Check if the app started successfully
curl https://<your-domain>/api/collections

# Test job creation (replace with actual collection and wip_ids)
curl -X POST https://<your-domain>/api/sinks/wip/process \
  -H "Content-Type: application/json" \
  -d '{"wip_ids": [1, 2, 3]}'
```

You should get a response with a `job_id`:
```json
{
  "success": true,
  "job_id": "ce672290-f093-4801-b4a1-078f10ab0801",
  "total_products": 3,
  "message": "Background processing started for 3 products...",
  "status_url": "/api/sinks/wip/jobs/ce672290-f093-4801-b4a1-078f10ab0801"
}
```

## Important Notes

### Threading on PythonAnywhere

PythonAnywhere supports Python threading, which is what the background processing system uses. However, be aware:

1. **Free tier limitations**: Background threads may be limited on free accounts
2. **Worker threads**: Each job runs in a separate daemon thread
3. **Resource limits**: Monitor your CPU usage if processing many jobs simultaneously

### Database Location

The system uses the same `supplier_products.db` SQLite database. The new `wip_jobs` table will be created automatically in the same database.

### Socket.IO

Socket.IO should work on PythonAnywhere if it's enabled in your configuration. If you're having issues:

1. Check that `SOCKETIO_ENABLED` is `True` in your settings
2. Verify Socket.IO is installed: `pip install flask-socketio`
3. Check logs for Socket.IO connection errors

### Logs

Monitor the logs during deployment:

```bash
# View Flask app logs
tail -f ~/Cass-Brothers_PIM/logs/app.log

# Look for these success messages:
# ✅ WIP Job Manager initialized with Socket.IO support
```

## Troubleshooting

### Error: "Module not found"

If you get import errors, ensure the new files were pulled:

```bash
ls -la ~/Cass-Brothers_PIM/core/wip_*.py
```

You should see:
- `core/wip_job_manager.py`
- `core/wip_background_processor.py`

### Error: "Database is locked"

SQLite can have issues with concurrent writes. The system handles this, but if you see persistent errors:

1. Check file permissions on `supplier_products.db`
2. Ensure no other processes are holding locks
3. Consider adding a retry mechanism (already built-in to the system)

### Jobs Not Starting

If jobs are created but don't start:

1. Check the logs for errors
2. Verify background threads are allowed on your PythonAnywhere tier
3. Check database for job status:
   ```bash
   sqlite3 supplier_products.db "SELECT * FROM wip_jobs ORDER BY created_at DESC LIMIT 5;"
   ```

### Frontend Not Updating

If your frontend isn't receiving updates:

1. **Socket.IO**: Check browser console for connection errors
2. **Polling**: Use the status API endpoint instead
3. **CORS**: Verify CORS settings allow requests from your frontend

## Testing the Deployment

### 1. Create a Test Job

```python
# In PythonAnywhere console
python3 << 'EOF'
from core.wip_job_manager import get_wip_job_manager
from core.supplier_db import get_supplier_db

# Create test WIP products first
supplier_db = get_supplier_db()
# (Assuming you have some WIP products already)

# Create a job
job_manager = get_wip_job_manager()
job_id = job_manager.create_job('sinks', [1, 2])
print(f"Created job: {job_id}")

# Check status
import time
time.sleep(5)
status = job_manager.get_job_status(job_id)
print(f"Job status: {status['status']}")
print(f"Processed: {status['processed_products']}/{status['total_products']}")
EOF
```

### 2. Test via cURL

```bash
# Create a job
JOB_ID=$(curl -s -X POST https://<your-domain>/api/sinks/wip/process \
  -H "Content-Type: application/json" \
  -d '{"wip_ids": [1, 2, 3]}' | jq -r '.job_id')

echo "Created job: $JOB_ID"

# Check status
sleep 5
curl -s https://<your-domain>/api/sinks/wip/jobs/$JOB_ID | jq
```

## Rollback Plan

If something goes wrong and you need to rollback:

```bash
cd ~/Cass-Brothers_PIM
git log --oneline -5  # Find the previous commit
git revert HEAD  # Revert the latest commit
# Or restore to specific commit:
# git reset --hard <previous-commit-hash>
git push origin main
```

Then reload the web app on PythonAnywhere.

## Performance Optimization

For better performance on PythonAnywhere:

1. **Process smaller batches**: 10-20 products at a time
2. **Monitor resource usage**: Check CPU and database usage
3. **Off-peak processing**: Schedule large batches during low-traffic times
4. **Upgrade tier**: Consider upgrading if you need more resources

## Success Criteria

✅ Git pull completed without errors
✅ Web app reloaded successfully
✅ New API endpoints responding
✅ Jobs being created with job_id
✅ Background processing completing
✅ Socket.IO or polling working
✅ WIP products being processed to completion

## Support

If you encounter issues:

1. Check logs: `~/Cass-Brothers_PIM/logs/app.log`
2. Check PythonAnywhere error logs
3. Test locally first if possible
4. Review the commit: `git show db84479`

## Next Steps After Deployment

1. **Update Frontend**: Modify your UI to handle job-based processing
2. **Test with Real Products**: Try processing your backlog of products
3. **Monitor Performance**: Watch for any issues or bottlenecks
4. **User Training**: Update documentation for users

Happy deploying! 🚀
