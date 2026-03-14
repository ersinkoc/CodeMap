"""Utility functions for data processing."""

from typing import List, Optional


def process_data(raw: str, strip_whitespace: bool = True) -> str:
    """Process a raw data string and return the cleaned result."""
    if strip_whitespace:
        raw = raw.strip()
    return raw.lower().replace('\n', ' ')


def batch_process(items: List[str], limit: Optional[int] = None) -> List[str]:
    """Process a batch of items, optionally limiting the count."""
    if limit is not None:
        items = items[:limit]
    return [process_data(item) for item in items]
