# pgport

A fork of [pgport](https://github.com/mohamedelhefni/pgport) — the lightweight self-hosted PostgreSQL web client — with keyboard-first navigation, inline data editing, tabbed queries, vim mode, and more.

## What's new in pgport

On top of everything pgport already does, pgport adds:

- **Command Palette** (`Cmd/Ctrl+P`) — fuzzy-search across all tables, views, and functions. Keyboard-only navigation, no mouse required.
- **Inline Cell Editing** — double-click any cell in browse mode to edit it. Uses PostgreSQL `ctid` for safe row identity, no primary key assumption.
- **Add New Row** — form-based interface for inserting rows into any table without writing SQL.
- **Query Tabs** — multiple SQL editor tabs in the input panel; switch between queries without losing work.
- **Dark/Light Theme Toggle** — built with CSS custom properties throughout. Instant, no flicker, persisted in `localStorage`.
- **Vim Keybinding Mode** — full vim bindings in the SQL editor via Ace, persisted in `localStorage`.
- **JSON Pretty-Print** — JSON column values are automatically formatted when opened in the content modal.
- **Expandable Schema Rows** — expand any table in the sidebar to preview column names and types inline.

## Original pgport features

- Cross-platform: Mac/Linux/Windows (64bit).
- Simple installation (distributed as a single binary).
- Zero dependencies.
- Works with PostgreSQL 9.6+.
- Supports native SSH tunnels.
- Multiple database sessions.
- Execute and analyze custom SQL queries.
- Table and query data export to CSV/JSON/XML.
- Query history.
- Server bookmarks.

## Installation

```
go install github.com/mohamedelhefni/pgport@latest
```

Or clone and build:

```
git clone https://github.com/mohamedelhefni/pgport
cd pgport
make build
```

## Usage

Start server:

```
pgport
```

With connection flags:

```
pgport --host localhost --user myuser --db mydb
```

Connection URL:

```
pgport --url postgres://user:password@host:port/database?sslmode=[mode]
```

### Multiple database sessions

```
pgport --sessions
```

Or via environment variable:

```
pgport_SESSIONS=1 pgport
```

## Development

```
make dev     # build development binary
make test    # run test suite (requires PostgreSQL on localhost:5432)
make lint    # run golangci-lint
```

Tests require a live PostgreSQL server on `localhost:5432` with a `postgres` superuser. Set `pgport_ASSETS_DEVMODE=1` to serve static files from `./static/` on disk.

## Credits

pgport is a fork of [mohamedelhefni/pgport](https://github.com/mohamedelhefni/pgport). All original work and architecture belong to its author and contributors.

## License

The MIT License (MIT). See [LICENSE](LICENSE) file for more details.
