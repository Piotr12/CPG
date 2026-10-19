import { z } from "zod";

/** Revoke one of your own tokens from the tokens screen. */
export const revokeApiTokenSchema = z.object({ tokenId: z.uuid() });

export type RevokeApiTokenInput = z.infer<typeof revokeApiTokenSchema>;
