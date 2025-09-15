"""
Asynchronous AI Processing System - Makes AI operations lightning fast
Features: Queue management, parallel processing, smart batching
"""
import asyncio
import logging
import time
import json
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum
import uuid
from concurrent.futures import ThreadPoolExecutor
import threading

logger = logging.getLogger(__name__)

class TaskStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class AITask:
    id: str
    type: str  # 'description', 'features', 'images', 'extraction'
    collection: str
    row_num: int
    data: Dict[str, Any]
    status: TaskStatus = TaskStatus.PENDING
    created_at: float = None
    started_at: float = None
    completed_at: float = None
    result: Any = None
    error: str = None
    progress: float = 0.0

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = time.time()

class AsyncProcessor:
    """
    High-performance asynchronous AI processor
    """

    def __init__(self, max_workers: int = 3, max_queue_size: int = 100):
        self.max_workers = max_workers
        self.max_queue_size = max_queue_size
        self.task_queue = asyncio.Queue(maxsize=max_queue_size)
        self.active_tasks: Dict[str, AITask] = {}
        self.completed_tasks: Dict[str, AITask] = {}
        self.workers = []
        self.is_running = False
        self.stats = {
            'total_processed': 0,
            'total_failed': 0,
            'average_processing_time': 0.0,
            'queue_size': 0
        }

        # Thread pool for CPU-intensive operations
        self.thread_pool = ThreadPoolExecutor(max_workers=max_workers)

        # Task callbacks
        self.callbacks: Dict[str, List[Callable]] = {
            'on_start': [],
            'on_complete': [],
            'on_error': [],
            'on_progress': []
        }

    async def start(self):
        """Start the async processor"""
        if self.is_running:
            return

        self.is_running = True
        logger.info(f"🚀 Starting async processor with {self.max_workers} workers")

        # Create worker tasks
        for i in range(self.max_workers):
            worker = asyncio.create_task(self._worker(f"worker-{i}"))
            self.workers.append(worker)

        logger.info("✅ Async processor started")

    async def stop(self):
        """Stop the async processor"""
        self.is_running = False

        # Cancel all worker tasks
        for worker in self.workers:
            worker.cancel()

        # Wait for workers to finish
        await asyncio.gather(*self.workers, return_exceptions=True)

        # Shutdown thread pool
        self.thread_pool.shutdown(wait=True)

        logger.info("🛑 Async processor stopped")

    async def submit_task(self, task_type: str, collection: str, row_num: int, data: Dict[str, Any]) -> str:
        """Submit a new AI task"""
        task_id = str(uuid.uuid4())

        task = AITask(
            id=task_id,
            type=task_type,
            collection=collection,
            row_num=row_num,
            data=data
        )

        try:
            # Add to queue (non-blocking)
            self.task_queue.put_nowait(task)
            self.active_tasks[task_id] = task

            logger.info(f"📝 Task submitted: {task_type} for {collection}:{row_num} (ID: {task_id[:8]})")

            # Trigger callbacks
            await self._trigger_callbacks('on_start', task)

            return task_id

        except asyncio.QueueFull:
            logger.error("❌ Task queue is full, rejecting task")
            raise Exception("Task queue is full, please try again later")

    async def submit_batch(self, tasks: List[Dict[str, Any]]) -> List[str]:
        """Submit multiple tasks as a batch"""
        task_ids = []

        for task_data in tasks:
            task_id = await self.submit_task(
                task_data['type'],
                task_data['collection'],
                task_data['row_num'],
                task_data['data']
            )
            task_ids.append(task_id)

        logger.info(f"📦 Batch submitted: {len(task_ids)} tasks")
        return task_ids

    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a specific task"""
        # Check active tasks
        if task_id in self.active_tasks:
            task = self.active_tasks[task_id]
        elif task_id in self.completed_tasks:
            task = self.completed_tasks[task_id]
        else:
            return None

        return {
            'id': task.id,
            'type': task.type,
            'status': task.status.value,
            'progress': task.progress,
            'created_at': task.created_at,
            'started_at': task.started_at,
            'completed_at': task.completed_at,
            'result': task.result,
            'error': task.error
        }

    async def get_queue_status(self) -> Dict[str, Any]:
        """Get overall queue status"""
        return {
            'queue_size': self.task_queue.qsize(),
            'active_tasks': len(self.active_tasks),
            'completed_tasks': len(self.completed_tasks),
            'is_running': self.is_running,
            'stats': self.stats
        }

    async def _worker(self, worker_name: str):
        """Worker coroutine that processes tasks"""
        logger.info(f"👷 Worker {worker_name} started")

        while self.is_running:
            try:
                # Get next task (with timeout)
                task = await asyncio.wait_for(self.task_queue.get(), timeout=1.0)

                # Process the task
                await self._process_task(task, worker_name)

                # Mark task as done
                self.task_queue.task_done()

            except asyncio.TimeoutError:
                # No task available, continue loop
                continue
            except Exception as e:
                logger.error(f"❌ Worker {worker_name} error: {e}")

        logger.info(f"👷 Worker {worker_name} stopped")

    async def _process_task(self, task: AITask, worker_name: str):
        """Process a single AI task"""
        start_time = time.time()

        try:
            task.status = TaskStatus.PROCESSING
            task.started_at = start_time

            logger.info(f"⚡ {worker_name} processing {task.type} for {task.collection}:{task.row_num}")

            # Update progress
            task.progress = 0.1
            await self._trigger_callbacks('on_progress', task)

            # Route to appropriate processor
            if task.type == 'description':
                result = await self._process_description(task)
            elif task.type == 'features':
                result = await self._process_features(task)
            elif task.type == 'images':
                result = await self._process_images(task)
            elif task.type == 'extraction':
                result = await self._process_extraction(task)
            else:
                raise ValueError(f"Unknown task type: {task.type}")

            # Mark as completed
            task.status = TaskStatus.COMPLETED
            task.completed_at = time.time()
            task.result = result
            task.progress = 1.0

            # Move to completed tasks
            self.active_tasks.pop(task.id, None)
            self.completed_tasks[task.id] = task

            # Update stats
            processing_time = task.completed_at - task.started_at
            self.stats['total_processed'] += 1
            self.stats['average_processing_time'] = (
                (self.stats['average_processing_time'] * (self.stats['total_processed'] - 1) + processing_time) /
                self.stats['total_processed']
            )

            logger.info(f"✅ {worker_name} completed {task.type} in {processing_time:.2f}s")

            # Trigger callbacks
            await self._trigger_callbacks('on_complete', task)

        except Exception as e:
            # Mark as failed
            task.status = TaskStatus.FAILED
            task.completed_at = time.time()
            task.error = str(e)

            # Move to completed tasks
            self.active_tasks.pop(task.id, None)
            self.completed_tasks[task.id] = task

            # Update stats
            self.stats['total_failed'] += 1

            logger.error(f"❌ {worker_name} failed {task.type}: {e}")

            # Trigger callbacks
            await self._trigger_callbacks('on_error', task)

    async def _process_description(self, task: AITask) -> Dict[str, Any]:
        """Process AI description generation"""
        # Import here to avoid circular dependencies
        from core.ai_extractor import AIExtractor

        task.progress = 0.3
        await self._trigger_callbacks('on_progress', task)

        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()

        def generate_description():
            extractor = AIExtractor()
            return extractor.generate_product_description(
                task.collection,
                task.data,
                task.row_num
            )

        task.progress = 0.7
        await self._trigger_callbacks('on_progress', task)

        result = await loop.run_in_executor(self.thread_pool, generate_description)

        task.progress = 0.9
        await self._trigger_callbacks('on_progress', task)

        return result

    async def _process_features(self, task: AITask) -> Dict[str, Any]:
        """Process AI features generation"""
        from core.ai_extractor import AIExtractor

        task.progress = 0.3
        await self._trigger_callbacks('on_progress', task)

        loop = asyncio.get_event_loop()

        def generate_features():
            extractor = AIExtractor()
            return extractor.generate_product_features(
                task.collection,
                task.data,
                task.row_num
            )

        task.progress = 0.7
        await self._trigger_callbacks('on_progress', task)

        result = await loop.run_in_executor(self.thread_pool, generate_features)

        task.progress = 0.9
        await self._trigger_callbacks('on_progress', task)

        return result

    async def _process_images(self, task: AITask) -> Dict[str, Any]:
        """Process AI image extraction"""
        from core.ai_extractor import AIExtractor

        task.progress = 0.2
        await self._trigger_callbacks('on_progress', task)

        loop = asyncio.get_event_loop()

        def extract_images():
            extractor = AIExtractor()
            return extractor.extract_images_from_url(
                task.data.get('product_url'),
                task.collection,
                task.row_num
            )

        task.progress = 0.5
        await self._trigger_callbacks('on_progress', task)

        result = await loop.run_in_executor(self.thread_pool, extract_images)

        task.progress = 0.9
        await self._trigger_callbacks('on_progress', task)

        return result

    async def _process_extraction(self, task: AITask) -> Dict[str, Any]:
        """Process full AI extraction"""
        from core.ai_extractor import AIExtractor

        task.progress = 0.1
        await self._trigger_callbacks('on_progress', task)

        loop = asyncio.get_event_loop()

        def extract_product():
            extractor = AIExtractor()
            return extractor.extract_product_from_url(
                task.data.get('product_url'),
                task.collection
            )

        task.progress = 0.3
        await self._trigger_callbacks('on_progress', task)

        result = await loop.run_in_executor(self.thread_pool, extract_product)

        task.progress = 0.9
        await self._trigger_callbacks('on_progress', task)

        return result

    async def _trigger_callbacks(self, event: str, task: AITask):
        """Trigger registered callbacks"""
        for callback in self.callbacks.get(event, []):
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(task)
                else:
                    callback(task)
            except Exception as e:
                logger.error(f"Callback error: {e}")

    def add_callback(self, event: str, callback: Callable):
        """Add event callback"""
        if event not in self.callbacks:
            self.callbacks[event] = []
        self.callbacks[event].append(callback)

# Global async processor instance
async_processor = AsyncProcessor()