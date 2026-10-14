import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { NewsService } from "./news.service";
import { PrismaService } from "../prisma.service";

const mockPrismaService = {
  newsArticle: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe("NewsService - pagination bounds", () => {
  let service: NewsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get(NewsService);
    jest.clearAllMocks();
    mockPrismaService.newsArticle.findMany.mockResolvedValue([]);
    mockPrismaService.newsArticle.count.mockResolvedValue(0);
  });

  it("defaults to 20 articles from the first page", async () => {
    await service.findPublished();

    expect(mockPrismaService.newsArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });

  it("derives skip from page and limit", async () => {
    await service.findPublished(undefined, 3, 10);

    expect(mockPrismaService.newsArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it.each([
    [1, 101],
    [1, 0],
    [0, 10],
    [1.5, 10],
  ])("rejects page=%p limit=%p without querying", async (page, limit) => {
    await expect(service.findPublished(undefined, page, limit)).rejects.toThrow(
      BadRequestException,
    );
    expect(mockPrismaService.newsArticle.findMany).not.toHaveBeenCalled();
  });
});
