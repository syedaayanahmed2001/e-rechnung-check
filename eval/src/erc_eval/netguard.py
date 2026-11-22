"""Blocks network access while replaying recordings (EVAL-05): CI must never call a model."""

from __future__ import annotations

import socket
from collections.abc import Iterator
from contextlib import contextmanager


class NetworkBlockedError(RuntimeError):
    pass


@contextmanager
def no_network() -> Iterator[None]:
    original_connect = socket.socket.connect
    original_create = socket.create_connection

    def refuse(*_args: object, **_kwargs: object) -> None:
        raise NetworkBlockedError("network access is disabled in recorded mode")

    socket.socket.connect = refuse  # type: ignore[method-assign]
    socket.create_connection = refuse  # type: ignore[assignment]
    try:
        yield
    finally:
        socket.socket.connect = original_connect  # type: ignore[method-assign]
        socket.create_connection = original_create
