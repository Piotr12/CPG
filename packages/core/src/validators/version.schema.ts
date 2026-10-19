import { z } from "zod";

/** The optimistic-lock version an edit carries back: the record's `version` as it was loaded. */
export const versionSchema = z.number().int().positive();
