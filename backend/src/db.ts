import { PrismaClient } from '@prisma/client';

/**
 * Single shared Prisma client for the whole backend.
 * Importing this everywhere avoids opening a separate connection pool per route file.
 */
export const prisma = new PrismaClient();
