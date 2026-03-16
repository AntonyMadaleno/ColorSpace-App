from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock
from typing import Any


@dataclass
class CacheEntry:
    value: Any


class LRUCache:
    def __init__(self, max_size: int = 8) -> None:
        self.max_size = max_size
        self._store: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            self._store.move_to_end(key)
            return entry.value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._store[key] = CacheEntry(value=value)
            self._store.move_to_end(key)
            while len(self._store) > self.max_size:
                self._store.popitem(last=False)

