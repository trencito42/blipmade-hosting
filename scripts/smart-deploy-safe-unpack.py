#!/usr/bin/env python3
"""Extract an uploaded ZIP or tar archive without links, devices, or traversal."""

from __future__ import annotations

import os
import shutil
import stat
import sys
import tarfile
import zipfile
from pathlib import Path, PurePosixPath

MAX_FILES = 10_000
MAX_UNPACKED = 2 * 1024 * 1024 * 1024


def safe_name(raw: str) -> PurePosixPath:
    name = raw.replace("\\", "/")
    path = PurePosixPath(name)
    if not name or name.startswith("/") or "\x00" in name or ".." in path.parts:
        raise ValueError(f"unsafe archive path: {raw!r}")
    return path


def common_root(names: list[str]) -> str | None:
    paths = [safe_name(name) for name in names]
    files = [path for path in paths if len(path.parts) > 1]
    if not files or len(files) != len([path for path in paths if len(path.parts) > 1 or path.name]):
        return None
    first = files[0].parts[0]
    return first if all(len(path.parts) > 1 and path.parts[0] == first for path in files) else None


def target_for(root: Path, raw: str, strip_root: str | None) -> Path | None:
    relative = safe_name(raw)
    if strip_root and relative.parts[0] == strip_root:
        if len(relative.parts) == 1:
            return None
        relative = PurePosixPath(*relative.parts[1:])
    target = root.joinpath(*relative.parts)
    if not target.resolve(strict=False).is_relative_to(root):
        raise ValueError(f"archive path leaves the workspace: {raw!r}")
    return target


def extract_zip(archive: Path, root: Path) -> None:
    total = 0
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        if len(entries) > MAX_FILES:
            raise ValueError("archive has too many files")
        strip_root = common_root([entry.filename for entry in entries if not entry.is_dir()])
        for entry in entries:
            mode = entry.external_attr >> 16
            if stat.S_ISLNK(mode) or stat.S_ISCHR(mode) or stat.S_ISBLK(mode) or stat.S_ISFIFO(mode):
                raise ValueError(f"archive contains a special file: {entry.filename!r}")
            total += entry.file_size
            if total > MAX_UNPACKED:
                raise ValueError("archive expands beyond the sandbox disk limit")
            target = target_for(root, entry.filename, strip_root)
            if target is None:
                continue
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.open(entry) as incoming, target.open("xb") as outgoing:
                shutil.copyfileobj(incoming, outgoing, length=1024 * 1024)


def extract_tar(archive: Path, root: Path) -> None:
    total = 0
    with tarfile.open(archive, mode="r:*") as source:
        entries = source.getmembers()
        if len(entries) > MAX_FILES:
            raise ValueError("archive has too many files")
        strip_root = common_root([entry.name for entry in entries if entry.isfile()])
        for entry in entries:
            if entry.issym() or entry.islnk() or entry.isdev() or entry.isfifo():
                raise ValueError(f"archive contains a link or special file: {entry.name!r}")
            if not (entry.isfile() or entry.isdir()):
                raise ValueError(f"unsupported archive entry: {entry.name!r}")
            total += entry.size
            if total > MAX_UNPACKED:
                raise ValueError("archive expands beyond the sandbox disk limit")
            target = target_for(root, entry.name, strip_root)
            if target is None:
                continue
            if entry.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            incoming = source.extractfile(entry)
            if incoming is None:
                raise ValueError(f"archive file cannot be read: {entry.name!r}")
            with incoming, target.open("xb") as outgoing:
                shutil.copyfileobj(incoming, outgoing, length=1024 * 1024)


def main() -> int:
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} ARCHIVE DESTINATION", file=sys.stderr)
        return 64
    archive = Path(sys.argv[1]).resolve(strict=True)
    root = Path(sys.argv[2]).resolve(strict=True)
    if any(root.iterdir()):
        raise ValueError("destination must be empty")
    if zipfile.is_zipfile(archive):
        extract_zip(archive, root)
    elif tarfile.is_tarfile(archive):
        extract_tar(archive, root)
    else:
        raise ValueError("uploaded source is not a supported ZIP or tar archive")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, zipfile.BadZipFile, tarfile.TarError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(65)
