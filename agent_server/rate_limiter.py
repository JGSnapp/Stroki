import queue
import random
import threading
import time
from typing import Any, Callable, Optional, TypeVar

T = TypeVar("T")


class _Task:
    def __init__(self, func: Callable[..., T], args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
        self.func = func
        self.args = args
        self.kwargs = kwargs
        self.event = threading.Event()
        self.result: Optional[T] = None
        self.error: Optional[BaseException] = None


class RateLimitedWorker:
    def __init__(self, name: str, delay_base: float, delay_jitter: float) -> None:
        self._name = name
        self._delay_base = max(0.0, delay_base)
        self._delay_jitter = max(0.0, delay_jitter)
        self._queue: queue.Queue[_Task] = queue.Queue()
        self._thread = threading.Thread(target=self._run, name=f"worker-{name}", daemon=True)
        self._next_allowed = 0.0
        self._thread.start()

    def submit(self, func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        task = _Task(func, args, kwargs)
        self._queue.put(task)
        task.event.wait()
        if task.error:
            raise task.error
        return task.result  # type: ignore[return-value]

    def _run(self) -> None:
        while True:
            task = self._queue.get()
            now = time.monotonic()
            if self._next_allowed > now:
                time.sleep(self._next_allowed - now)
            try:
                task.result = task.func(*task.args, **task.kwargs)
            except BaseException as exc:
                task.error = exc
            finally:
                task.event.set()
                delay = self._delay_base + random.uniform(0.0, self._delay_jitter)
                self._next_allowed = time.monotonic() + delay
