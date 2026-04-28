from __future__ import annotations


def resolve_runtime_version(requested: str) -> str:
    if requested == "0.1.x":
        return "0.1.0"
    return requested
