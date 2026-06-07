import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

export interface NewsArticleInput {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  category: string;
  publishedAt?: string;
  readingTimeMinutes?: number;
  authorName?: string;
  authorAvatar?: string;
  relatedSlugs?: string[];
}

export interface NewsArticleUpdateInput {
  title?: string;
  excerpt?: string;
  content?: string;
  coverImage?: string;
  category?: string;
  readingTimeMinutes?: number;
  relatedSlugs?: string[];
}

export interface NewsFilters {
  category?: string;
  search?: string;
}

@Injectable()
export class NewsService {
  constructor(private prisma: PrismaService) {}

  private buildWhere(filters?: NewsFilters, onlyPublished = false) {
    const where: any = {};
    if (onlyPublished) where.isPublished = true;
    if (filters?.category) where.category = filters.category as any;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { excerpt: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    return where;
  }

  private async paginate(where: any, page?: number, limit?: number) {
    const take = limit && limit > 0 ? limit : 20;
    const skip = page && page > 1 ? (page - 1) * take : 0;

    const [items, total] = await Promise.all([
      this.prisma.newsArticle.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip,
        take,
      }),
      this.prisma.newsArticle.count({ where }),
    ]);

    return { items, total, hasMore: skip + items.length < total };
  }

  async findPublished(filters?: NewsFilters, page?: number, limit?: number) {
    return this.paginate(this.buildWhere(filters, true), page, limit);
  }

  async findAllForSuperAdmin(filters?: NewsFilters, page?: number, limit?: number) {
    return this.paginate(this.buildWhere(filters, false), page, limit);
  }

  async findPublishedBySlug(slug: string) {
    const article = await this.prisma.newsArticle.findUnique({ where: { slug } });
    if (!article || !article.isPublished) return null;
    return article;
  }

  async getRelatedArticleSummaries(relatedSlugs: string[], excludeSlug: string) {
    const slugs = relatedSlugs.filter((slug) => slug !== excludeSlug);
    if (!slugs.length) return [];

    return this.prisma.newsArticle.findMany({
      where: { slug: { in: slugs }, isPublished: true },
      select: {
        id: true,
        slug: true,
        title: true,
        coverImage: true,
        category: true,
        publishedAt: true,
      },
    });
  }

  async create(currentUserId: string, input: NewsArticleInput) {
    return this.prisma.newsArticle.create({
      data: {
        slug: input.slug,
        title: input.title,
        excerpt: input.excerpt,
        content: input.content,
        coverImage: input.coverImage,
        category: input.category as any,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        readingTimeMinutes: input.readingTimeMinutes,
        authorName: input.authorName,
        authorAvatar: input.authorAvatar,
        relatedSlugs: input.relatedSlugs ?? [],
        createdById: currentUserId,
      },
    });
  }

  async update(id: string, input: NewsArticleUpdateInput) {
    const article = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException("Article not found");

    return this.prisma.newsArticle.update({
      where: { id },
      data: {
        title: input.title,
        excerpt: input.excerpt,
        content: input.content,
        coverImage: input.coverImage,
        category: input.category as any,
        readingTimeMinutes: input.readingTimeMinutes,
        relatedSlugs: input.relatedSlugs,
      },
    });
  }

  async delete(id: string) {
    const article = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException("Article not found");

    await this.prisma.newsArticle.delete({ where: { id } });
    return true;
  }

  async publish(id: string) {
    const article = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException("Article not found");

    return this.prisma.newsArticle.update({
      where: { id },
      data: { isPublished: true, publishedAt: article.publishedAt ?? new Date() },
    });
  }

  async unpublish(id: string) {
    const article = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException("Article not found");

    return this.prisma.newsArticle.update({
      where: { id },
      data: { isPublished: false },
    });
  }
}
