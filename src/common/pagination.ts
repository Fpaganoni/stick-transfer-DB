import { BadRequestException } from "@nestjs/common";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new BadRequestException(`${label} must be an integer >= 1`);
  }
}

const MAX_SKIP = 2_147_483_647; // 32-bit signed, the largest offset the database accepts

/**
 * Validates client-supplied page/limit and turns them into Prisma skip/take.
 * Missing limit falls back to DEFAULT_PAGE_SIZE; a limit above MAX_PAGE_SIZE is
 * rejected (not clamped: clamping would shift skip and serve the wrong rows),
 * so no list query can return an unbounded table.
 */
export function normalizePagination(
  page?: number | null,
  limit?: number | null,
): { skip: number | undefined; take: number } {
  if (limit != null) {
    assertPositiveInteger(limit, "limit");
    if (limit > MAX_PAGE_SIZE) {
      throw new BadRequestException(`limit must be <= ${MAX_PAGE_SIZE}`);
    }
  }
  if (page != null) assertPositiveInteger(page, "page");

  const take = limit ?? DEFAULT_PAGE_SIZE;
  const skip = page && page > 1 ? (page - 1) * take : undefined;
  if (skip !== undefined && skip > MAX_SKIP) {
    throw new BadRequestException("page is out of range");
  }
  return { skip, take };
}
