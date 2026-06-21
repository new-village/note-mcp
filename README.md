# note-mcp

Unofficial stdio MCP server for note.com. It uses cookie-based access to note.com's internal APIs.

> [!WARNING]
> This project is unofficial and not affiliated with note.com. Internal APIs can change without notice. Keep cookies local and never commit them to GitHub, npm, logs, or issue reports.

## Install / run

```bash
NOTE_COOKIE='your note.com cookie string' npx note-mcp
```

For local development:

```bash
npm install
npm run build
NOTE_COOKIE='your note.com cookie string' node dist/index.js
```

## MCP client configuration

Example:

```json
{
  "mcpServers": {
    "note": {
      "command": "npx",
      "args": ["-y", "note-mcp"],
      "env": {
        "NOTE_COOKIE": "your note.com cookie string"
      }
    }
  }
}
```

## Tools

- `note_auth_check` — verify cookie-based access to note.com internal APIs
- `note_list_my_notes` — list notes for the authenticated account
- `note_list_drafts` — list drafts for the authenticated account
- `note_get_note` — fetch a note by note key, e.g. `n1a0b26f944f4`
- `note_create_draft` — create a draft
- `note_update_draft` — update a draft by draft id

## API basis

The initial endpoints are based on public, unofficial note API references, including:

- <https://note.com/ego_station/n/n1a0b26f944f4>

Known endpoint basis:

- Base URL: `https://note.com/api`
- Note detail: `GET /v3/notes/{noteKey}`
- Own contents: `GET /v2/creators/info/contents?kind=note&page=1`
- Draft save: `POST /v1/text_notes/draft_save?id={draftId}`
- Auth smoke test: `GET /v3/notice_counts`

## Authentication

Set one of these environment variables before launching the server:

- `NOTE_COOKIE`
- `NOTE_SESSION_COOKIE`

Use the full Cookie header value from an authenticated browser session.

## Release

Releases are handled by GitHub Actions + semantic-release.

- Push or merge Conventional Commits into `main`.
- GitHub Actions runs CI.
- The release workflow creates GitHub tags/releases and publishes to npm.

Required repository secret for npm publishing unless npm Trusted Publishing is configured:

- `NPM_TOKEN`

## Development

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

## License

MIT
