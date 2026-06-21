#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { readCookieFromEnv } from './note/auth.js';
import { NoteClient } from './note/client.js';
import { NoteApiError, toErrorMessage } from './note/errors.js';
import type { JsonValue } from './note/types.js';

const server = new McpServer({
  name: 'note-mcp',
  version: '0.0.0-development',
});

function createClient(): NoteClient {
  return new NoteClient({ cookie: readCookieFromEnv() });
}

function jsonText(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

function result(value: JsonValue) {
  return {
    content: [
      {
        type: 'text' as const,
        text: jsonText(value),
      },
    ],
  };
}

function errorResult(error: unknown) {
  const detail =
    error instanceof NoteApiError
      ? { message: error.message, status: error.status, body: error.body }
      : { message: toErrorMessage(error) };

  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: jsonText(detail as JsonValue),
      },
    ],
  };
}

server.registerTool(
  'note_auth_check',
  {
    title: 'Check note.com authentication',
    description:
      'Checks whether NOTE_COOKIE / NOTE_SESSION_COOKIE can access note.com internal APIs.',
    inputSchema: {},
  },
  async () => {
    try {
      return result(await createClient().authCheck());
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  'note_list_my_notes',
  {
    title: 'List my note.com notes',
    description: 'Lists notes for the authenticated note.com account.',
    inputSchema: {
      page: z.number().int().positive().default(1),
    },
  },
  async ({ page }) => {
    try {
      return result(await createClient().listMyNotes(page));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  'note_list_drafts',
  {
    title: 'List note.com drafts',
    description:
      'Lists drafts for the authenticated note.com account. This uses an unofficial internal API and may need adjustment if note.com changes endpoints.',
    inputSchema: {
      page: z.number().int().positive().default(1),
    },
  },
  async ({ page }) => {
    try {
      return result(await createClient().listDrafts(page));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  'note_get_note',
  {
    title: 'Get note.com note',
    description: 'Fetches a note by note key, e.g. n1a0b26f944f4.',
    inputSchema: {
      noteKey: z.string().min(1),
    },
  },
  async ({ noteKey }) => {
    try {
      return result(await createClient().getNote(noteKey));
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  'note_create_draft',
  {
    title: 'Create note.com draft',
    description:
      'Creates a note.com draft with title/body/hashtags using an unofficial internal API.',
    inputSchema: {
      title: z.string().min(1),
      body: z.string().min(1),
      hashtags: z.array(z.string().min(1)).optional(),
    },
  },
  async ({ title, body, hashtags }) => {
    try {
      return result(
        await createClient().createDraft({
          title,
          body,
          ...(hashtags ? { hashtags } : {}),
        }),
      );
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  'note_update_draft',
  {
    title: 'Update note.com draft',
    description:
      'Updates a note.com draft by draft id using an unofficial internal API.',
    inputSchema: {
      draftId: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
      hashtags: z.array(z.string().min(1)).optional(),
    },
  },
  async ({ draftId, title, body, hashtags }) => {
    try {
      return result(
        await createClient().updateDraft({
          draftId,
          title,
          body,
          ...(hashtags ? { hashtags } : {}),
        }),
      );
    } catch (error) {
      return errorResult(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
