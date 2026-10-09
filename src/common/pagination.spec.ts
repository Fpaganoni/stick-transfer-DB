import { BadRequestException } from "@nestjs/common";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, normalizePagination } from "./pagination";

describe("normalizePagination", () => {
  it("defaults to the first page with the default size", () => {
    expect(normalizePagination()).toEqual({ skip: undefined, take: DEFAULT_PAGE_SIZE });
    expect(normalizePagination(null, null)).toEqual({ skip: undefined, take: DEFAULT_PAGE_SIZE });
  });

  it("uses the requested limit and computes skip from page", () => {
    expect(normalizePagination(3, 20)).toEqual({ skip: 40, take: 20 });
  });

  it("does not skip on page 1", () => {
    expect(normalizePagination(1, 10)).toEqual({ skip: undefined, take: 10 });
  });

  it("accepts the maximum page size", () => {
    expect(normalizePagination(2, MAX_PAGE_SIZE)).toEqual({
      skip: MAX_PAGE_SIZE,
      take: MAX_PAGE_SIZE,
    });
  });

  it("rejects a limit above the maximum instead of silently shrinking the page", () => {
    // Clamping would shift skip: page 2 of 200 would silently serve rows 100-199.
    expect(() => normalizePagination(2, MAX_PAGE_SIZE + 1)).toThrow(BadRequestException);
  });

  it("rejects a page whose offset exceeds the database skip range", () => {
    expect(() => normalizePagination(2_147_483_647, 100)).toThrow(BadRequestException);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid limit (%p) with a 400",
    (limit) => {
      expect(() => normalizePagination(1, limit)).toThrow(BadRequestException);
    },
  );

  it.each([0, -3, 2.5, Number.NaN])("rejects an invalid page (%p) with a 400", (page) => {
    expect(() => normalizePagination(page, 10)).toThrow(BadRequestException);
  });
});
