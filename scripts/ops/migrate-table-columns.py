#!/usr/bin/env python3
"""One-off migration: adds the column attributes to the tables of the app.

The script is not part of the application. It writes the attributes of the
columns of the tables, so the numeric and the state columns stay on one line
and the long values are cut instead of being wrapped.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'web' / 'src'

TRUNCATE = 'truncate: true,'
NOWRAP = 'nowrap: true,'
RIGHT = "align: 'right',"
CENTER = "align: 'center',"

SPEC = {
    'app/Tickets.tsx': [
        ('subject', 0, [TRUNCATE]),
        ('number', 0, [NOWRAP]),
        ('category', 0, [NOWRAP]),
        ('status', 0, [NOWRAP]),
        ('last', 0, [NOWRAP]),
        ('open', 0, [CENTER, NOWRAP]),
    ],
    'app/Instances.tsx': [
        ('instance', 0, [TRUNCATE]),
        ('status', 0, [NOWRAP]),
        ('limits', 0, [NOWRAP]),
        ('price', 0, [RIGHT, NOWRAP]),
        ('node', 0, [NOWRAP]),
    ],
    'app/Billing.tsx': [
        ('number', 0, [NOWRAP]),
        ('date', 0, [NOWRAP]),
        ('amount', 0, [RIGHT, NOWRAP]),
        ('status', 0, [NOWRAP]),
        ('link', 0, [NOWRAP]),
    ],
    'app/instance/SchedulesTab.tsx': [
        ('name', 0, [TRUNCATE]),
        ('cron', 0, [NOWRAP]),
        ('action', 0, [NOWRAP]),
        ('next', 0, [NOWRAP]),
        ('state', 0, [NOWRAP]),
        ('actions', 0, [RIGHT]),
    ],
    'app/instance/BackupsTab.tsx': [
        ('name', 0, [TRUNCATE]),
        ('size', 0, [RIGHT, NOWRAP]),
        ('created', 0, [NOWRAP]),
        ('state', 0, [NOWRAP]),
        ('actions', 0, [RIGHT]),
    ],
    'app/instance/DatabasesTab.tsx': [
        ('name', 0, [NOWRAP]),
        ('user', 0, [NOWRAP]),
        ('host', 0, [TRUNCATE]),
        ('actions', 0, [RIGHT]),
    ],
    'app/instance/NetworkTab.tsx': [
        ('address', 0, [NOWRAP]),
        ('alias', 0, [TRUNCATE]),
        ('state', 0, [NOWRAP]),
        ('actions', 0, [RIGHT]),
    ],
    'admin/Audit.tsx': [
        ('createdAt', 0, [NOWRAP]),
        ('actor', 0, [TRUNCATE]),
        ('action', 0, [NOWRAP]),
        ('target', 0, [TRUNCATE]),
    ],
    'admin/Customers.tsx': [
        ('customer', 0, [TRUNCATE]),
        ('instances', 0, [RIGHT, NOWRAP]),
        ('orders', 0, [RIGHT, NOWRAP]),
        ('tickets', 0, [RIGHT, NOWRAP]),
        ('value', 0, [RIGHT, NOWRAP]),
        ('verified', 0, [NOWRAP]),
        ('created', 0, [NOWRAP]),
    ],
    'admin/Orders.tsx': [
        ('number', 0, [NOWRAP]),
        ('customer', 0, [TRUNCATE]),
        ('items', 0, [NOWRAP]),
        ('total', 0, [RIGHT, NOWRAP]),
        ('status', 0, [NOWRAP]),
        ('created', 0, [NOWRAP]),
    ],
    'admin/Services.tsx': [
        ('name', 0, [TRUNCATE]),
        ('customer', 0, [TRUNCATE]),
        ('resources', 0, [NOWRAP]),
        ('price', 0, [RIGHT, NOWRAP]),
        ('status', 0, [NOWRAP]),
        ('server', 0, [NOWRAP]),
        ('retry', 0, [RIGHT, NOWRAP]),
    ],
    'admin/Products.tsx': [
        ('product', 0, [TRUNCATE]),
        ('category', 0, [NOWRAP]),
        ('price', 0, [RIGHT, NOWRAP]),
        ('resources', 0, [NOWRAP]),
        ('visible', 0, [NOWRAP]),
        ('deployable', 0, [NOWRAP]),
        ('actions', 0, [RIGHT]),
    ],
    'admin/Promotions.tsx': [
        ('code', 0, [NOWRAP]),
        ('type', 0, [NOWRAP]),
        ('value', 0, [RIGHT, NOWRAP]),
        ('used', 0, [RIGHT, NOWRAP]),
        ('active', 0, [NOWRAP]),
        ('window', 0, [NOWRAP]),
    ],
    'admin/Staff.tsx': [
        ('member', 0, [TRUNCATE]),
        ('role', 0, [NOWRAP]),
        ('title', 0, [TRUNCATE]),
        ('permissions', 0, [TRUNCATE]),
    ],
    'admin/Tickets.tsx': [
        ('subject', 0, [TRUNCATE]),
        ('status', 0, [NOWRAP]),
        ('assigned', 0, [TRUNCATE]),
    ],
    'admin/Infrastructure.tsx': [
        ('name', 0, [TRUNCATE]),
        ('memory', 0, [RIGHT, NOWRAP]),
        ('disk', 0, [RIGHT, NOWRAP]),
        ('maintenance', 0, [NOWRAP]),
        ('panel', 0, [NOWRAP]),
        ('name', 1, [TRUNCATE]),
        ('image', 0, [TRUNCATE]),
        ('startup', 0, [TRUNCATE]),
        ('panel', 1, [NOWRAP]),
    ],
    'admin/CustomerDetail.tsx': [
        ('name', 0, [TRUNCATE]),
        ('status', 0, [NOWRAP]),
        ('price', 0, [RIGHT, NOWRAP]),
        ('subscription', 0, [NOWRAP]),
        ('node', 0, [NOWRAP]),
        ('created', 0, [NOWRAP]),
        ('number', 0, [NOWRAP]),
        ('status', 1, [NOWRAP]),
        ('total', 0, [RIGHT, NOWRAP]),
        ('created', 1, [NOWRAP]),
        ('number', 1, [NOWRAP]),
        ('subject', 0, [TRUNCATE]),
        ('status', 2, [NOWRAP]),
        ('created', 2, [NOWRAP]),
        ('number', 2, [NOWRAP]),
        ('status', 3, [NOWRAP]),
        ('total', 1, [RIGHT, NOWRAP]),
        ('created', 3, [NOWRAP]),
    ],
}

KEY = re.compile(r"^\s*\{?\s*key: '([^']*)',\s*(.*)$")
HEADER = re.compile(r"^(\s*)header: '([^']*)',\s*$")


def find_header(lines, index):
    """The line of the header of a column, and its text."""
    same = re.search(r"header: '([^']*)',\s*", lines[index])
    if same:
        return index, same
    for offset in range(index + 1, min(index + 10, len(lines))):
        found = HEADER.match(lines[offset])
        if found:
            return offset, found
    return None, None


def attribute_name(attr):
    return attr.split(':')[0].strip()


def apply(path: Path, entries):
    problems = []
    for key, occurrence, attrs in entries:
        lines = path.read_text().split('\n')
        # The candidates are the "key" lines that really are a column, so a
        # list of filters with the same word is never touched.
        candidates = []
        for index, line in enumerate(lines):
            found = KEY.match(line)
            if not found or found.group(1) != key:
                continue
            if find_header(lines, index)[0] is None:
                continue
            candidates.append(index)
        if occurrence >= len(candidates):
            problems.append(f'{path.name}: key {key} #{occurrence} not found ({len(candidates)} candidates)')
            continue
        index = candidates[occurrence]
        header_line, header = find_header(lines, index)
        # An attribute that is already there is left alone, so the script can
        # be run again without writing it twice.
        present = '\n'.join(lines[index : header_line + 1])
        pending = [attr for attr in attrs if f'{attribute_name(attr)}:' not in present]
        if not pending:
            continue
        if header_line == index:
            # The column is written on one line: the attributes go in it.
            text = lines[index]
            match = re.search(r"header: '[^']*',\s*", text)
            lines[index] = text[: match.end()] + ' '.join(pending) + ' ' + text[match.end() :]
        else:
            indent = header.group(1)
            lines[header_line + 1 : header_line + 1] = [f'{indent}{attr}' for attr in pending]
        path.write_text('\n'.join(lines))
    return problems


def main():
    failed = False
    for name, entries in SPEC.items():
        path = ROOT / name
        problems = apply(path, entries)
        for problem in problems:
            print(f'  PROBLEM {problem}')
            failed = True
        print(f'== {name}: {"ok" if not problems else "incomplete"}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
