import { LOCALES, THEMES } from "@cpg/db";
import { z } from "zod";

/**
 * A change to the caller's own language and/or theme. Unknown keys are stripped, so a payload can
 * never name another account or set anything else.
 */
export const userPreferenceUpdateSchema = z
  .object({ locale: z.enum(LOCALES).optional(), theme: z.enum(THEMES).optional() })
  .refine(({ locale, theme }) => locale !== undefined || theme !== undefined, "Choose a language or a theme.");

export type UserPreferenceUpdate = z.infer<typeof userPreferenceUpdateSchema>;
