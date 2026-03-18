import asyncio
import uuid
from typing import AsyncGenerator, Callable, Any


class JobManager:
    """Manages background jobs with SSE log streaming."""

    def __init__(self):
        self.jobs: dict[str, asyncio.Queue] = {}
        self.status: dict[str, str] = {}  # job_id -> "running" | "completed" | "failed"

    def create_job(self, job_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self.jobs[job_id] = q
        self.status[job_id] = "running"
        return q

    async def stream_job(self, job_id: str) -> AsyncGenerator[str, None]:
        """Yields SSE-formatted lines: 'data: {line}\\n\\n'"""
        q = self.jobs.get(job_id)
        if q is None:
            yield "data: Job not found\n\n"
            yield "data: __DONE__\n\n"
            return

        while True:
            try:
                line = await asyncio.wait_for(q.get(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send a keep-alive comment
                yield ": keepalive\n\n"
                continue

            if line == "__DONE__":
                yield "data: __DONE__\n\n"
                break
            elif line == "__FAILED__":
                self.status[job_id] = "failed"
                yield "data: __FAILED__\n\n"
                break
            else:
                yield f"data: {line}\n\n"

    async def mark_done(self, job_id: str, failed: bool = False) -> None:
        q = self.jobs.get(job_id)
        if q is not None:
            if failed:
                self.status[job_id] = "failed"
                await q.put("__FAILED__")
            else:
                self.status[job_id] = "completed"
                await q.put("__DONE__")

    async def run_in_batches(
        self,
        items: list,
        batch_size: int,
        task_fn: Callable,
        log_queue: asyncio.Queue,
    ) -> None:
        """Run task_fn for each item in batches of batch_size, processing batches sequentially."""
        for i in range(0, len(items), batch_size):
            batch = items[i : i + batch_size]
            await log_queue.put(
                f"Processing batch {i // batch_size + 1} "
                f"({len(batch)} items: {batch})"
            )
            tasks = [task_fn(item) for item in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for item, result in zip(batch, results):
                if isinstance(result, Exception):
                    await log_queue.put(f"ERROR processing {item}: {result}")
                else:
                    await log_queue.put(f"Completed: {item}")


job_manager = JobManager()
