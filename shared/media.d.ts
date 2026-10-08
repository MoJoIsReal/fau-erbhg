export type MediaKind = "image" | "video" | "audio";

export type MediaMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "video/mp4"
  | "video/quicktime"
  | "audio/mpeg"
  | "audio/mp4"
  | "audio/wav";

export declare const MEDIA_MIME_TYPES: Readonly<Record<MediaMimeType, MediaKind>>;
export declare const MEDIA_ACCEPT: string;
export declare function normalizeMediaMime(type: string | null | undefined, filename?: string): MediaMimeType | null;
export declare function mediaKind(mimeType: string): MediaKind | null;

export declare const MEDIA_DEFAULT_LIFETIME_DAYS: number;
export declare const MEDIA_MAX_INITIAL_DAYS: number;
export declare const MEDIA_MAX_EXTENSION_DAYS: number;
export declare const MEDIA_MAX_LIFETIME_DAYS: number;

export declare const MEDIA_TITLE_MAX: number;
export declare const MEDIA_DESCRIPTION_MAX: number;
export declare const MEDIA_MAX_FILES_PER_SHARE: number;
export declare const MEDIA_PIN_PATTERN: RegExp;
export declare const MEDIA_NEW_PIN_PATTERN: RegExp;

export type MediaErrorCode =
  | "SHARE_UNAVAILABLE"
  | "PIN_REQUIRED"
  | "PIN_INVALID"
  | "PIN_LOCKED"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "UNSUPPORTED_TYPE"
  | "FILE_TOO_LARGE"
  | "STORAGE_QUOTA"
  | "TOO_MANY_FILES"
  | "UPLOAD_MISMATCH"
  | "NOT_DRAFT"
  | "EMPTY_SHARE"
  | "MAX_LIFETIME";

export declare const MEDIA_ERROR_CODES: readonly MediaErrorCode[];
