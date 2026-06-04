"""In-process event broadcaster for the head satellite.

Routes emit() events when the mesh library changes (mesh added/removed,
active mesh switched, lip/eye calibration saved). /events WS subscribers
receive them via per-connection asyncio queues.

Note: the avatar's lipsync drive (tts_level / audio_level / mode) does NOT
flow through here — those arrive from JarvYZ core over the host WS bus and
the UI subscribes to them directly. This channel is only the satellite's own
library-mutation events.
"""
from __future__ import annotations

import asyncio
from typing import Any


_subscribers: set[asyncio.Queue] = set()


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def emit(kind: str, **payload: Any) -> None:
    """Fan out one event to every connected WS subscriber."""
    msg = {"event": "head", "kind": kind, **payload}
    for q in list(_subscribers):
        try:
            q.put_nowait(msg)
        except Exception:
            pass


def num_subscribers() -> int:
    return len(_subscribers)
