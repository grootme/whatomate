# Backend Directory

This directory contains a duplicate of the root-level Go source code.
The canonical source of truth is at the project root: `/internal/`, `/pkg/`, `/cmd/`.

## Why this exists
This directory was created during development as a separate module but now duplicates the root-level code.

## Recommendation
- Use root-level directories for all development
- This directory should be removed once the Go module structure is consolidated
- See `PROJECT_STRUCTURE.md` for the canonical directory layout
