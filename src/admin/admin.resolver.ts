import { Resolver, Query, Mutation, Args, Context } from "@nestjs/graphql";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AdminService } from "./admin.service";
import { AuthService } from "../auth/auth.service";

@Resolver("AdminDashboardStats")
export class AdminResolver {
  constructor(
    private adminService: AdminService,
    private authService: AuthService,
  ) {}

  private requireUser(context: any): { userId: string; role: string } {
    const user = this.authService.getUserFromAuthHeader(
      context?.req?.headers?.authorization,
    );
    if (!user) throw new UnauthorizedException("Authentication required");
    return user;
  }

  private requireSuperAdmin(context: any): { userId: string; role: string } {
    const user = this.requireUser(context);
    if (user.role !== "SUPERADMIN") {
      throw new ForbiddenException("Super admin access required");
    }
    return user;
  }

  @Query()
  async adminDashboardStats(@Context() context: any) {
    this.requireSuperAdmin(context);
    return this.adminService.getDashboardStats();
  }

  @Mutation()
  async adminChangeUserRole(
    @Context() context: any,
    @Args("userId") userId: string,
    @Args("role") role: Role,
  ) {
    this.requireSuperAdmin(context);
    return this.adminService.changeUserRole(userId, role);
  }

  @Mutation()
  async adminSetUserVerified(
    @Context() context: any,
    @Args("userId") userId: string,
    @Args("verified") verified: boolean,
  ) {
    this.requireSuperAdmin(context);
    return this.adminService.setUserVerified(userId, verified);
  }
}
