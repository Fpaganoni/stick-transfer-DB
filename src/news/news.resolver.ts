import {
  Resolver,
  Query,
  Mutation,
  Args,
  Context,
  ResolveField,
  Parent,
  ID,
} from "@nestjs/graphql";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { NewsService } from "./news.service";
import { AuthService } from "../auth/auth.service";

@Resolver("NewsArticle")
export class NewsResolver {
  constructor(
    private newsService: NewsService,
    private authService: AuthService,
  ) {}

  private async requireSuperAdmin(context: any): Promise<{ userId: string; role: string }> {
    const currentUser = this.authService.getUserFromAuthHeader(
      context?.req?.headers?.authorization,
    );
    if (!currentUser) throw new UnauthorizedException("Authentication required");
    if (currentUser.role !== "SUPERADMIN") {
      throw new ForbiddenException("Super admin access required");
    }
    return currentUser;
  }

  // ─── Public queries ────────────────────────────────────────────────────

  @Query(() => Object)
  async news(
    @Args("filters", { nullable: true }) filters?: any,
    @Args("page", { nullable: true }) page?: number,
    @Args("limit", { nullable: true }) limit?: number,
  ) {
    return this.newsService.findPublished(filters, page, limit);
  }

  @Query(() => Object, { nullable: true })
  async newsArticle(@Args("slug") slug: string) {
    return this.newsService.findPublishedBySlug(slug);
  }

  // ─── Super admin queries ───────────────────────────────────────────────

  @Query(() => Object)
  async superAdminNewsArticles(
    @Context() context: any,
    @Args("filters", { nullable: true }) filters?: any,
    @Args("page", { nullable: true }) page?: number,
    @Args("limit", { nullable: true }) limit?: number,
  ) {
    await this.requireSuperAdmin(context);
    return this.newsService.findAllForSuperAdmin(filters, page, limit);
  }

  // ─── Super admin mutations (CRUD) ──────────────────────────────────────

  @Mutation(() => Object)
  async createNewsArticle(@Context() context: any, @Args("input") input: any) {
    const currentUser = await this.requireSuperAdmin(context);
    return this.newsService.create(currentUser.userId, input);
  }

  @Mutation(() => Object)
  async updateNewsArticle(
    @Context() context: any,
    @Args("id", { type: () => ID }) id: string,
    @Args("input") input: any,
  ) {
    await this.requireSuperAdmin(context);
    return this.newsService.update(id, input);
  }

  @Mutation(() => Boolean)
  async deleteNewsArticle(
    @Context() context: any,
    @Args("id", { type: () => ID }) id: string,
  ) {
    await this.requireSuperAdmin(context);
    return this.newsService.delete(id);
  }

  @Mutation(() => Object)
  async publishNewsArticle(
    @Context() context: any,
    @Args("id", { type: () => ID }) id: string,
  ) {
    await this.requireSuperAdmin(context);
    return this.newsService.publish(id);
  }

  @Mutation(() => Object)
  async unpublishNewsArticle(
    @Context() context: any,
    @Args("id", { type: () => ID }) id: string,
  ) {
    await this.requireSuperAdmin(context);
    return this.newsService.unpublish(id);
  }

  // ─── Field resolvers ───────────────────────────────────────────────────

  @ResolveField()
  async author(@Parent() article: any) {
    return {
      name: article.authorName || "Hockey Connect",
      avatar: article.authorAvatar || null,
    };
  }

  @ResolveField()
  async relatedArticles(@Parent() article: any) {
    return this.newsService.getRelatedArticleSummaries(
      article.relatedSlugs || [],
      article.slug,
    );
  }
}
