import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { JobsResolver } from "./jobs.resolver";

describe("JobsResolver - authorization", () => {
  let resolver: JobsResolver;
  let jobsService: any;
  let authService: any;
  const ctx = {};

  const asUser = (userId: string, role = "PLAYER") =>
    authService.getUserFromRequest.mockReturnValue({ userId, role });

  beforeEach(() => {
    jobsService = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      applyForJob: jest.fn(),
      withdrawApplication: jest.fn(),
      getApplications: jest.fn(),
      getUserApplications: jest.fn(),
      getApplicationById: jest.fn(),
    };
    authService = { getUserFromRequest: jest.fn() };
    resolver = new JobsResolver(jobsService, authService);
  });

  describe("unauthenticated", () => {
    beforeEach(() => authService.getUserFromRequest.mockReturnValue(null));

    it.each([
      ["updateJobOpportunity", () => resolver.updateJobOpportunity(ctx, "j1", "CLOSED")],
      ["deleteJobOpportunity", () => resolver.deleteJobOpportunity(ctx, "j1")],
      ["applyForJob", () => resolver.applyForJob(ctx, "j1")],
      ["withdrawApplication", () => resolver.withdrawApplication(ctx, "a1")],
      ["jobApplications", () => resolver.jobApplications(ctx, "j1")],
      ["userApplications", () => resolver.userApplications(ctx, "u1")],
      ["jobApplication", () => resolver.jobApplication(ctx, "a1")],
    ])("%s requires authentication", async (_n, call) => {
      await expect(call()).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("applyForJob", () => {
    it("forwards the session role to the service", async () => {
      asUser("ump-1", "UMPIRE");
      await resolver.applyForJob(ctx, "j1");
      expect(jobsService.applyForJob).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "ump-1", role: "UMPIRE" }),
      );
    });

    it("uses the session user, not a client-supplied id", async () => {
      asUser("player-1");
      await resolver.applyForJob(ctx, "j1", undefined, "letter");
      expect(jobsService.applyForJob).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "player-1", jobOpportunityId: "j1" }),
      );
    });

    it("rejects a mismatching legacy userId", async () => {
      asUser("player-1");
      await expect(resolver.applyForJob(ctx, "j1", "victim")).rejects.toThrow(
        ForbiddenException,
      );
      expect(jobsService.applyForJob).not.toHaveBeenCalled();
    });

    it("accepts a matching legacy userId", async () => {
      asUser("player-1");
      await resolver.applyForJob(ctx, "j1", "player-1");
      expect(jobsService.applyForJob).toHaveBeenCalled();
    });
  });

  describe("withdrawApplication", () => {
    it("uses the session user", async () => {
      asUser("player-1");
      await resolver.withdrawApplication(ctx, "a1");
      expect(jobsService.withdrawApplication).toHaveBeenCalledWith("a1", "player-1");
    });

    it("rejects a mismatching legacy userId", async () => {
      asUser("player-1");
      await expect(
        resolver.withdrawApplication(ctx, "a1", "victim"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("userApplications", () => {
    it("rejects reading another user's applications", async () => {
      asUser("attacker");
      await expect(resolver.userApplications(ctx, "victim")).rejects.toThrow(
        ForbiddenException,
      );
      expect(jobsService.getUserApplications).not.toHaveBeenCalled();
    });

    it("allows own applications and super admin", async () => {
      asUser("u1");
      await resolver.userApplications(ctx, "u1");
      asUser("admin", "SUPERADMIN");
      await resolver.userApplications(ctx, "u1");
      expect(jobsService.getUserApplications).toHaveBeenCalledTimes(2);
    });
  });

  describe("ownership is delegated to the service with the session actor", () => {
    it("update / delete / jobApplications / jobApplication", async () => {
      asUser("club-1", "CLUB");
      const actor = { userId: "club-1", role: "CLUB" };

      await resolver.updateJobOpportunity(ctx, "j1", "CLOSED");
      expect(jobsService.update).toHaveBeenCalledWith("j1", { status: "CLOSED" }, actor);

      await resolver.deleteJobOpportunity(ctx, "j1");
      expect(jobsService.delete).toHaveBeenCalledWith("j1", actor);

      await resolver.jobApplications(ctx, "j1", "PENDING");
      expect(jobsService.getApplications).toHaveBeenCalledWith("j1", "PENDING", actor);

      await resolver.jobApplication(ctx, "a1");
      expect(jobsService.getApplicationById).toHaveBeenCalledWith("a1", actor);
    });
  });

  describe("createJobOpportunity", () => {
    const create = () =>
      resolver.createJobOpportunity(
        ctx, "Umpire", "Desc", "UMPIRE", "PROFESSIONAL", "Spain", "Madrid",
      );

    it("lets a CLUB create an UMPIRE opportunity", async () => {
      asUser("club-1", "CLUB");
      await create();
      expect(jobsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ positionType: "UMPIRE", clubId: "club-1" }),
      );
    });

    it.each(["PLAYER", "UMPIRE", "COACH"])("rejects role %s", async (role) => {
      asUser("u-1", role);
      await expect(create()).rejects.toThrow(ForbiddenException);
      expect(jobsService.create).not.toHaveBeenCalled();
    });
  });
});
