export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface NoteClientOptions {
  cookie: string;
  userAgent?: string;
  fetch?: FetchLike;
}

export interface DraftPayload {
  title: string;
  body: string;
  hashtags?: string[];
  draftId?: string;
  noteKey?: string;
  bodyLength?: number;
  responseFormat?: ResponseFormat;
}

export type ResponseFormat = "summary" | "full";

export interface PublishDraftOptions {
  responseFormat?: ResponseFormat;
}

export interface UploadEyecatchPayload {
  noteId?: string;
  noteKey?: string;
  imagePath?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  targetSize?: "note-eyecatch";
  fit?: "none" | "center-crop" | "contain";
  verify?: boolean;
  responseFormat?: ResponseFormat;
}

export interface ListMyNotesOptions {
  fields?: "full" | "summary";
  includeBody?: boolean | undefined;
  limit?: number | undefined;
}

export interface GetNoteOptions {
  responseFormat?: ResponseFormat;
  fields?: string[];
  includeBody?: boolean | undefined;
  draft?: boolean | undefined;
}

export interface BundleDraftPayload {
  title: string;
  bodyHtml: string;
  hashtags?: string[];
  eyecatchImagePath?: string;
  eyecatchImageUrl?: string;
  verify?: boolean;
  responseFormat?: ResponseFormat;
}

export interface UpdateDraftBundlePayload extends BundleDraftPayload {
  noteKey: string;
}
