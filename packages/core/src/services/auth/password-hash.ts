import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * argon2id at the engineering standards' floor (memory ≥ 19 MiB, iterations ≥ 2, parallelism 1).
 * The PHC string stores them, so raising them later keeps old hashes verifiable.
 */
export const ARGON2_PARAMETERS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;
const SALT_BYTES = 16;
/** Bounds on what a stored hash may ask for, so a corrupted row can't make sign-in hash for minutes. */
const MAX_MEMORY_KIB = 1_048_576;
const MAX_PASSES = 16;

const PHC_PATTERN = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/**
 * A valid hash of a password nobody knows. Verifying against it when an account doesn't exist (or
 * can't sign in) takes as long as a real check, so timing doesn't reveal which usernames exist.
 */
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$BwcHBwcHBwcHBwcHBwcHBw$nbPkTy0UE5g1GOZ2vOUOzAfer1plHPkWMuYajMXFxp8";

interface Argon2Run {
  password: string;
  salt: Buffer;
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: number;
}

const argon2Async = promisify(argon2);

function derive({ password, salt, ...cost }: Argon2Run): Promise<Buffer> {
  return argon2Async("argon2id", { message: password, nonce: salt, ...cost });
}

const encode = (bytes: Buffer) => bytes.toString("base64").replace(/=+$/, "");

/** The PHC string (`$argon2id$v=19$m=…,t=…,p=…$salt$hash`) for a new password, with a fresh salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive({ password, salt, ...ARGON2_PARAMETERS });
  const { memory, passes, parallelism } = ARGON2_PARAMETERS;
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${encode(salt)}$${encode(key)}`;
}

/**
 * Whether `password` matches the PHC string, compared in constant time. Anything malformed, out of
 * bounds or failing to derive counts as no match (fail closed).
 */
export async function verifyPassword(password: string, phc: string): Promise<boolean> {
  const match = PHC_PATTERN.exec(phc);
  if (!match) return false;
  const [memory, passes, parallelism] = match.slice(1, 4).map(Number);
  const salt = Buffer.from(match[4], "base64");
  const expected = Buffer.from(match[5], "base64");
  if (memory > MAX_MEMORY_KIB || passes > MAX_PASSES || parallelism !== 1 || salt.length < 8 || expected.length < 16) {
    return false;
  }
  try {
    const actual = await derive({ password, salt, memory, passes, parallelism, tagLength: expected.length });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Spends the time of a real check and always fails: for unknown or inactive accounts. */
export async function verifyDummy(password: string): Promise<false> {
  await verifyPassword(password, DUMMY_HASH);
  return false;
}
