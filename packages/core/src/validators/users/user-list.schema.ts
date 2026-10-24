import { listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the users list sorts by (#217). Its default order is the role's, the built-in admin
 * first, then by username, as the list always was.
 */
export const USER_SORTS = ["role", "username", "status", "created"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export const userSortSchema = listSortSchema(USER_SORTS);
