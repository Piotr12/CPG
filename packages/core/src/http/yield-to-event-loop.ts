/**
 * Lets the event loop read its sockets before a long write's next unit of work. Every statement is a
 * synchronous better-sqlite3 call and the awaits between them resolve as microtasks, so without this a
 * long write keeps the whole server, `/up` included, silent until it commits (#185). Other requests
 * on the same connection still wait for the commit, on Kysely's connection mutex, and complete
 * afterwards; a transaction that yields holds the write gate (`holdWriteGate` in `@cpg/db`) so the
 * other bundles' connections wait too. Used by the Test reset's seed and by MRP runs.
 */
export const yieldToEventLoop = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve));
