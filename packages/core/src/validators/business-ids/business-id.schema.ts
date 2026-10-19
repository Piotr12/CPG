import { z } from "zod";

/**
 * A business ID assigned in sequence (materials, locations, customers, suppliers) in a path or a
 * reference: eight digits (R01, spec `2026-10-19--2014UTC-locations-customers-suppliers` Q2).
 */
export const businessIdSchema = z.string().regex(/^\d{8}$/);
