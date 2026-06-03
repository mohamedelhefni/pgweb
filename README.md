# pgport

<img src="docs/img/icon.png" alt="pgport" width="48" align="left" style="margin-right: 12px" />

A fork of [pgweb](https://github.com/sosedoff/pgweb) — the lightweight self-hosted PostgreSQL web client — extended with keyboard-first navigation, inline editing, row details sidebar, tabbed queries, vim mode, and more. Thirteen additions, zero new dependencies.

<br clear="left" />

## What's new in pgport

### Major additions

- **Command Palette** (`Cmd/Ctrl+P`) — fuzzy-search across all tables, views, and functions simultaneously. Arrow keys to navigate, Enter to open, Escape to dismiss. No mouse required.
- **Inline Cell Editing** — double-click any cell in browse mode to edit it. Uses PostgreSQL `ctid` for safe row identity; works on any table, primary key or not.
- **Row Details Sidebar** — click any row to open a persistent detail panel. JSON values render formatted, timestamps stay readable, booleans and nulls display clearly. Non-modal: stays open while you browse other rows.
- **Favorites** — star any table to pin it to the top of the connection sidebar for one-click access.
- **Dark/Light Theme Toggle** — built with CSS custom properties throughout. Instant switch, no flicker, persisted in `localStorage`.
- **Vim Keybinding Mode** — full vim bindings in the SQL editor via Ace, persisted in `localStorage`.

### Also included

- **Query Tabs** — multiple SQL editor tabs; switch between queries without losing work.
- **Expandable Schema Browser** — expand any table in the sidebar to see column names and types inline.
- **JSON Pretty-Print** — JSON column values automatically formatted in the content modal.
- **Add New Row** — form-based interface for inserting rows into any table without writing SQL.
- **Ace Editor Content View** — content modal uses Ace with syntax highlighting, SQL formatter, and live validation.
- **SQL Autocomplete** — table and column name completions in the query editor; updates when you switch connections.
- **Connection Sidebar** — persistent sidebar for switching between open connections; favorites appear at the top.
- **History & Shortcuts** — fuzzy-search full query history (`Ctrl+H`); open keyboard shortcuts reference (`?`).

### Docker image size

Switched to a minimal scratch base image — no shell, no extra runtime, just the Go binary and embedded static assets.

```
224 MB → 25 MB   (9× smaller)
```

## Original pgweb features

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

Or via Docker:

```
docker run --rm -p 8081:8081 -it mohamedelhefni/pgport
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

pgport is a fork of [sosedoff/pgweb](https://github.com/sosedoff/pgweb). All original work and architecture belong to its author and contributors.

## License

The MIT License (MIT). See [LICENSE](LICENSE) file for more details.
