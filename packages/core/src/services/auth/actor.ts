import type { UserRole } from "@cpg/db";

/**
 * Who is making a request, however they authenticated: a browser session (`SessionUser`) or an
 * API token (`ApiActor`). Authorization checks only need this much.
 */
export interface Actor {
  userId: string;
  username: string;
  role: UserRole;
}
