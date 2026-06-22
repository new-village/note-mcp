#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  AuthRequiredError,
  authStatus,
  clearStoredCookie,
  readCookie,
  saveCookie,
} from "./note/auth.js";
import { runBrowserLogin } from "./note/browser-login.js";
import { NoteClient } from "./note/client.js";
import { NoteApiError, toErrorMessage } from "./note/errors.js";
import type { JsonValue } from "./note/types.js";
import { getPackageVersion } from "./version.js";

const NOTE_BODY_DESCRIPTION =
  "Article body as note-compatible HTML. Markdown is not rendered automatically by note.com; callers should convert Markdown to HTML before passing it.";
const RESPONSE_FORMAT_SCHEMA = z.enum(["summary", "full"]).default("summary");
const FIELDS_SCHEMA = z.array(z.string().min(1)).optional();

if (process.argv[2] === "auth") {
  await runAuthCli(process.argv.slice(3));
} else {
  await runMcpServer();
}

async function runAuthCli(args: string[]): Promise<void> {
  try {
    if (args.includes("--status")) {
      console.log(jsonText(await authStatus()));
      return;
    }

    if (args.includes("--clear")) {
      console.log(jsonText(await clearStoredCookie()));
      return;
    }

    const headless = args.includes("--headless")
      ? true
      : args.includes("--headed")
        ? false
        : undefined;
    console.error(
      "Opening note.com login in a browser. Complete login there; note-mcp-community will save cookies locally.",
    );
    console.log(
      jsonText(
        await runBrowserLogin(headless === undefined ? {} : { headless }),
      ),
    );
  } catch (error) {
    console.error(jsonText(errorDetail(error)));
    process.exitCode = 1;
  }
}

async function runMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "note-mcp-community",
    version: getPackageVersion(),
  });

  server.registerTool(
    "note_auth_status",
    {
      title: "Get note.com authentication status",
      description:
        "Checks whether note-mcp-community has a note.com cookie from env or config file.",
      inputSchema: {},
    },
    async () => result(await authStatus()),
  );

  server.registerTool(
    "note_auth_login",
    {
      title: "Log in to note.com with a browser",
      description:
        "Opens a local Playwright browser login flow and saves note.com cookies to the note-mcp-community config file. Intended for desktop/local agents; remote/headless servers should use env or note_set_cookie.",
      inputSchema: {
        headless: z.boolean().optional(),
      },
    },
    async ({ headless }) => {
      try {
        return result(
          await runBrowserLogin({
            ...(headless === undefined ? {} : { headless }),
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "note_set_cookie",
    {
      title: "Set note.com cookie",
      description:
        "Stores a note.com Cookie header in the local note-mcp-community config file. By default, verifies the cookie before saving.",
      inputSchema: {
        cookie: z.string().min(1),
        verify: z.boolean().default(true),
      },
    },
    async ({ cookie, verify }) => {
      try {
        if (verify) {
          await new NoteClient({ cookie }).authCheck();
        }
        return result(await saveCookie(cookie));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "note_clear_cookie",
    {
      title: "Clear stored note.com cookie",
      description:
        "Deletes the note-mcp-community config file cookie. Environment cookies are not modified.",
      inputSchema: {},
    },
    async () => {
      try {
        return result(await clearStoredCookie());
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "note_login_help",
    {
      title: "Get note-mcp-community login help",
      description:
        "Explains the supported note-mcp-community authentication setup paths.",
      inputSchema: {},
    },
    async () =>
      result({
        recommended:
          "For local/desktop agents, call note_auth_login to open a browser login flow.",
        advanced:
          "For servers/CI, provide NOTE_COOKIE / NOTE_SESSION_COOKIE or call note_set_cookie with a Cookie header obtained by a trusted operator.",
        configFile: (await authStatus()).configPath,
        cli: [
          "npx note-mcp-community auth",
          "npx note-mcp-community auth --status",
          "npx note-mcp-community auth --clear",
        ],
      }),
  );

  server.registerTool(
    "note_auth_check",
    {
      title: "Check note.com authentication",
      description:
        "Checks whether configured note.com cookies can access note.com internal APIs.",
      inputSchema: {},
    },
    async () => withClient((client) => client.authCheck()),
  );

  server.registerTool(
    "note_list_my_notes",
    {
      title: "List my note.com notes",
      description:
        'Lists notes for the authenticated note.com account via GET /v2/note_list/contents?limit=20&page=1. Defaults to lightweight summary output; pass fields: "full" for the raw internal API payload.',
      inputSchema: {
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().default(20),
        fields: z.enum(["full", "summary"]).default("summary"),
        includeBody: z.boolean().optional(),
      },
    },
    async ({ page, limit, fields, includeBody }) =>
      withClient((client) =>
        client.listMyNotes(page, { limit, fields, includeBody }),
      ),
  );

  server.registerTool(
    "note_list_drafts",
    {
      title: "List note.com drafts",
      description:
        'Lists drafts for the authenticated note.com account via GET /v2/note_list/contents?limit=20&page=1&status=draft&without_magazines=true. Defaults to lightweight summary output; pass fields: "full" for the raw internal API payload.',
      inputSchema: {
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().default(20),
        fields: z.enum(["full", "summary"]).default("summary"),
        includeBody: z.boolean().optional(),
      },
    },
    async ({ page, limit, fields, includeBody }) =>
      withClient((client) =>
        client.listDrafts(page, { limit, fields, includeBody }),
      ),
  );

  server.registerTool(
    "note_get_note",
    {
      title: "Get note.com note",
      description:
        'Fetches a note by note key, e.g. n1a0b26f944f4. Defaults to compact summary fields; pass responseFormat: "full" or includeBody: true when the full body/internal payload is needed.',
      inputSchema: {
        noteKey: z.string().min(1),
        responseFormat: RESPONSE_FORMAT_SCHEMA,
        fields: FIELDS_SCHEMA,
        includeBody: z.boolean().optional(),
      },
    },
    async ({ noteKey, responseFormat, fields, includeBody }) =>
      withClient((client) =>
        client.getNote(noteKey, {
          responseFormat,
          ...(fields ? { fields } : {}),
          ...(includeBody === undefined ? {} : { includeBody }),
        }),
      ),
  );

  server.registerTool(
    "note_get_draft",
    {
      title: "Get note.com draft detail",
      description:
        "Fetches an authenticated draft detail by note key via GET /v3/notes/{noteKey}?draft=true&draft_reedit=false. Use note_list_drafts to find the draft key first.",
      inputSchema: {
        noteKey: z.string().min(1),
      },
    },
    async ({ noteKey }) => withClient((client) => client.getDraft(noteKey)),
  );

  server.registerTool(
    "note_create_draft",
    {
      title: "Create note.com draft",
      description:
        'Creates a note.com draft with title/body/hashtags using an unofficial internal API. The body should be HTML compatible with note.com editor content. Do not pass Markdown if visual formatting is expected; convert Markdown to HTML before calling this tool. By default returns an LLM-friendly summary with id/noteId/key/noteKey/editUrl/publicUrl/nextActions; pass responseFormat: "full" for the raw API payload.',
      inputSchema: {
        title: z.string().min(1),
        body: z.string().min(1).describe(NOTE_BODY_DESCRIPTION),
        hashtags: z.array(z.string().min(1)).optional(),
        responseFormat: RESPONSE_FORMAT_SCHEMA,
      },
    },
    async ({ title, body, hashtags, responseFormat }) =>
      withClient((client) =>
        client.createDraft({
          title,
          body,
          ...(hashtags ? { hashtags } : {}),
          responseFormat,
        }),
      ),
  );

  server.registerTool(
    "note_update_draft",
    {
      title: "Update note.com draft",
      description:
        'Updates a note.com draft by numeric draft/note id via POST /v1/text_notes/draft_save?id={draftId}&is_temp_saved=true. The body should be HTML compatible with note.com editor content. Do not pass Markdown if visual formatting is expected; convert Markdown to HTML before calling this tool. By default returns a compact summary; pass responseFormat: "full" for the raw API payload.',
      inputSchema: {
        draftId: z.string().min(1).optional(),
        noteKey: z.string().min(1).optional(),
        title: z.string().min(1),
        body: z.string().min(1).describe(NOTE_BODY_DESCRIPTION),
        hashtags: z.array(z.string().min(1)).optional(),
        responseFormat: RESPONSE_FORMAT_SCHEMA,
      },
    },
    async ({ draftId, noteKey, title, body, hashtags, responseFormat }) => {
      if (!draftId && !noteKey) {
        return errorResult(new Error("draftId or noteKey is required"));
      }
      return withClient((client) =>
        noteKey && !draftId
          ? client.updateDraftByNoteKey({
              noteKey,
              title,
              body,
              ...(hashtags ? { hashtags } : {}),
              responseFormat,
            })
          : client.updateDraft({
              draftId: draftId as string,
              title,
              body,
              ...(hashtags ? { hashtags } : {}),
              responseFormat,
            }),
      );
    },
  );

  server.registerTool(
    "note_publish_draft",
    {
      title: "Publish note.com draft",
      description:
        'Publicly publishes a draft by note key. Internally fetches draft detail via /v3/notes/{noteKey}?draft=true, then publishes with PUT /v1/text_notes/{id}. The saved draft body is sent to note.com as editor HTML; Markdown is not converted during publish. By default returns an LLM-friendly summary with status/key/noteUrl/eyecatch/publishedAt; pass responseFormat: "full" for the raw API payload.',
      inputSchema: {
        noteKey: z.string().min(1),
        responseFormat: RESPONSE_FORMAT_SCHEMA,
      },
    },
    async ({ noteKey, responseFormat }) =>
      withClient((client) => client.publishDraft(noteKey, { responseFormat })),
  );

  server.registerTool(
    "note_upload_eyecatch",
    {
      title: "Upload note.com eyecatch image",
      description:
        "Uploads an eyecatch/cover image for a note via POST /v1/image_upload/note_eyecatch. Provide numeric noteId or noteKey; noteKey is resolved internally through draft detail. Provide imagePath or imageUrl. note.com recommends 1280x670px; width/height default to 1280/670. Set verify: true with noteKey to read back compact note state after upload.",
      inputSchema: {
        noteId: z.string().min(1).optional(),
        noteKey: z.string().min(1).optional(),
        imagePath: z.string().min(1).optional(),
        imageUrl: z.string().url().optional(),
        width: z.number().int().positive().default(1280),
        height: z.number().int().positive().default(670),
        targetSize: z.enum(["note-eyecatch"]).optional(),
        fit: z.enum(["none", "center-crop", "contain"]).default("none"),
        verify: z.boolean().default(false),
        responseFormat: RESPONSE_FORMAT_SCHEMA,
      },
    },
    async ({
      noteId,
      noteKey,
      imagePath,
      imageUrl,
      width,
      height,
      targetSize,
      fit,
      verify,
      responseFormat,
    }) => {
      if (!noteId && !noteKey) {
        return errorResult(new Error("noteId or noteKey is required"));
      }
      if (!imagePath && !imageUrl) {
        return errorResult(new Error("imagePath or imageUrl is required"));
      }
      return withClient((client) =>
        client.uploadEyecatch({
          ...(noteId ? { noteId } : {}),
          ...(noteKey ? { noteKey } : {}),
          ...(imagePath ? { imagePath } : {}),
          ...(imageUrl ? { imageUrl } : {}),
          width,
          height,
          ...(targetSize ? { targetSize } : {}),
          fit,
          verify,
          responseFormat,
        }),
      );
    },
  );

  server.registerTool(
    "note_prepare_draft",
    {
      title: "Prepare note.com draft bundle",
      description:
        "Creates a draft, optionally uploads an eyecatch, and returns compact ids/URLs for AI agents.",
      inputSchema: {
        title: z.string().min(1),
        bodyHtml: z.string().min(1).describe(NOTE_BODY_DESCRIPTION),
        hashtags: z.array(z.string().min(1)).optional(),
        eyecatchImagePath: z.string().min(1).optional(),
        eyecatchImageUrl: z.string().url().optional(),
        verify: z.boolean().default(true),
        responseFormat: RESPONSE_FORMAT_SCHEMA,
      },
    },
    async ({
      title,
      bodyHtml,
      hashtags,
      eyecatchImagePath,
      eyecatchImageUrl,
      verify,
    }) =>
      withClient((client) =>
        client.prepareDraftBundle({
          title,
          bodyHtml,
          ...(hashtags ? { hashtags } : {}),
          ...(eyecatchImagePath ? { eyecatchImagePath } : {}),
          ...(eyecatchImageUrl ? { eyecatchImageUrl } : {}),
          verify,
        }),
      ),
  );

  server.registerTool(
    "note_update_draft_bundle",
    {
      title: "Update note.com draft bundle",
      description:
        "Updates a draft by noteKey, optionally uploads an eyecatch, and returns compact ids/URLs for AI agents.",
      inputSchema: {
        noteKey: z.string().min(1),
        title: z.string().min(1),
        bodyHtml: z.string().min(1).describe(NOTE_BODY_DESCRIPTION),
        hashtags: z.array(z.string().min(1)).optional(),
        eyecatchImagePath: z.string().min(1).optional(),
        eyecatchImageUrl: z.string().url().optional(),
        verify: z.boolean().default(true),
        responseFormat: RESPONSE_FORMAT_SCHEMA,
      },
    },
    async ({
      noteKey,
      title,
      bodyHtml,
      hashtags,
      eyecatchImagePath,
      eyecatchImageUrl,
      verify,
    }) =>
      withClient((client) =>
        client.updateDraftBundle({
          noteKey,
          title,
          bodyHtml,
          ...(hashtags ? { hashtags } : {}),
          ...(eyecatchImagePath ? { eyecatchImagePath } : {}),
          ...(eyecatchImageUrl ? { eyecatchImageUrl } : {}),
          verify,
        }),
      ),
  );

  server.registerTool(
    "note_markdown_to_note_html",
    {
      title: "Convert Markdown to simple note.com HTML",
      description:
        "Converts common Markdown headings, paragraphs, lists, emphasis, and links to conservative note-compatible HTML. This is a helper, not a full Markdown engine.",
      inputSchema: { markdown: z.string().min(1) },
    },
    async ({ markdown }) => result({ html: markdownToNoteHtml(markdown) }),
  );

  server.registerTool(
    "note_delete_draft",
    {
      title: "Delete note.com draft",
      description:
        "Deletes a note.com draft by numeric draft/note id via DELETE /v1/text_notes/draft_delete?id={draftId}. note keys like n... are not accepted by this endpoint; use the id field from note_create_draft, note_list_drafts full output, or note_get_draft.",
      inputSchema: {
        draftId: z.string().min(1),
      },
    },
    async ({ draftId }) => withClient((client) => client.deleteDraft(draftId)),
  );

  server.registerTool(
    "note_delete_note",
    {
      title: "Delete note.com note",
      description:
        "Deletes a published or deleted-capable note by note key via DELETE /v1/notes/n/{noteKey}. This is destructive; use only when the caller explicitly wants deletion.",
      inputSchema: {
        noteKey: z.string().min(1),
      },
    },
    async ({ noteKey }) => withClient((client) => client.deleteNote(noteKey)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function withClient(fn: (client: NoteClient) => Promise<JsonValue>) {
  try {
    const client = new NoteClient({ cookie: await readCookie() });
    return result(await fn(client));
  } catch (error) {
    return errorResult(error);
  }
}

function markdownToNoteHtml(markdown: string): string {
  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (text: string) =>
    escapeHtml(text)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  const blocks: string[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(`<ul>${listItems.join("")}</ul>`);
      listItems = [];
    }
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = (rawLine ?? "").trim();
    if (!line) {
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushList();
      const level = (heading[1] ?? "#").length + 1;
      blocks.push(`<h${level}>${inline(heading[2] ?? "")}</h${level}>`);
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      listItems.push(`<li>${inline(bullet[1] ?? "")}</li>`);
      continue;
    }
    flushList();
    blocks.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  return blocks.join("\n");
}

function jsonText(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

function result(value: JsonValue) {
  return {
    content: [
      {
        type: "text" as const,
        text: jsonText(value),
      },
    ],
  };
}

function errorResult(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: jsonText(errorDetail(error)),
      },
    ],
  };
}

function errorDetail(error: unknown): JsonValue {
  if (error instanceof AuthRequiredError) {
    return {
      error: "auth_required",
      message: error.message,
      suggestedTools: ["note_auth_login", "note_set_cookie"],
    };
  }

  if (error instanceof NoteApiError) {
    return {
      error: "note_api_error",
      message: error.message,
      status: error.status,
      body: error.body as JsonValue,
    };
  }

  return { error: "error", message: toErrorMessage(error) };
}
