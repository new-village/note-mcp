import { NoteApiError } from './errors.js';
import type { DraftPayload, FetchLike, JsonValue, NoteClientOptions } from './types.js';

const BASE_URL = 'https://note.com/api';
const DEFAULT_USER_AGENT =
  'note-mcp/0.0.0 (+https://github.com/new-village/note-mcp)';

export class NoteClient {
  private readonly cookie: string;
  private readonly userAgent: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: NoteClientOptions) {
    this.cookie = options.cookie;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async authCheck(): Promise<JsonValue> {
    return this.request('/v3/notice_counts');
  }

  async listMyNotes(page = 1): Promise<JsonValue> {
    return this.request(`/v2/creators/info/contents?kind=note&page=${page}`);
  }

  async listDrafts(page = 1): Promise<JsonValue> {
    // note.com uses internal APIs; this endpoint shape follows the creator contents API.
    return this.request(`/v2/creators/info/contents?kind=draft&page=${page}`);
  }

  async getNote(noteKey: string): Promise<JsonValue> {
    return this.request(`/v3/notes/${encodeURIComponent(noteKey)}`);
  }

  async createDraft(payload: Omit<DraftPayload, 'draftId'>): Promise<JsonValue> {
    return this.saveDraft(payload);
  }

  async updateDraft(payload: DraftPayload & { draftId: string }): Promise<JsonValue> {
    return this.saveDraft(payload);
  }

  private async saveDraft(payload: DraftPayload): Promise<JsonValue> {
    const query = payload.draftId ? `?id=${encodeURIComponent(payload.draftId)}` : '';
    return this.request(`/v1/text_notes/draft_save${query}`, {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        body: payload.body,
        hashtags: payload.hashtags ?? [],
      }),
    });
  }

  private async request(path: string, init: RequestInit = {}): Promise<JsonValue> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('cookie', this.cookie);
    headers.set('user-agent', this.userAgent);
    headers.set('x-requested-with', 'XMLHttpRequest');

    if (init.body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const response = await this.fetchImpl(`${BASE_URL}${path}`, {
      ...init,
      headers,
    });

    const body = await parseBody(response);
    if (!response.ok) {
      throw new NoteApiError(
        `note.com API request failed: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    return body;
  }
}

async function parseBody(response: Response): Promise<JsonValue> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}
