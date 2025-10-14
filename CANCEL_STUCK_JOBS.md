# Cancel Stuck Jobs - Emergency Fix

## Your 3 Stuck Jobs:

All have been running for 11+ hours with ZERO progress. They need to be cancelled.

##  Quick Cancel (Run in Browser Console - F12):

```javascript
// Cancel all 3 stuck jobs
const stuckJobs = [
  'ff83887f-0dfa-432d-a23e-029e326a8f8a',  // 1 product, 11h running
  '5f597315-6bf7-449e-8661-9e936d7b639b',  // 4 products, 11h 13m running
  '6fa5ead4-3956-4aee-b993-1d2ef7375316'   // 11 products, 11h 25m running
];

// Cancel them all
Promise.all(stuckJobs.map(jobId =>
  fetch(`/api/sinks/wip/jobs/${jobId}/cancel`, {method: 'POST'})
    .then(r => r.json())
    .then(d => console.log(`✅ Cancelled ${jobId}`, d))
    .catch(e => console.error(`❌ Failed to cancel ${jobId}`, e))
)).then(() => {
  console.log('🎉 All jobs cancelled! Refresh /wip-jobs page');
});
```

## Alternative: Cancel via URLs

Open these URLs in your browser (one at a time):

1. https://cassbrothers.pythonanywhere.com/api/sinks/wip/jobs/ff83887f-0dfa-432d-a23e-029e326a8f8a/cancel (POST)
2. https://cassbrothers.pythonanywhere.com/api/sinks/wip/jobs/5f597315-6bf7-449e-8661-9e936d7b639b/cancel (POST)
3. https://cassbrothers.pythonanywhere.com/api/sinks/wip/jobs/6fa5ead4-3956-4aee-b993-1d2ef7375316/cancel (POST)

Note: These are POST requests, so you need to use the JavaScript method above or a tool like Postman.

## Why Are They Stuck?

The jobs started but the background processing thread either:
1. **Crashed immediately** - Import error or missing dependency
2. **Database locked** - SQLite can't handle concurrent writes from threads
3. **PythonAnywhere threading limits** - Free tier may not support threading
4. **Silent failure** - Error not being caught/logged

## Next Steps After Cancelling:

1. Check PythonAnywhere logs for errors
2. Try processing 1 product manually to see the error
3. Use the OLD synchronous endpoint temporarily

## Emergency Workaround - Old Synchronous Processing:

Instead of the new background system, temporarily revert to the old endpoint that processes synchronously (blocks but works):

I'll create a fallback endpoint that doesn't use threading.
