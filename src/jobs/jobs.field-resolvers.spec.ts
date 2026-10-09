import { JobsLoaders } from "./jobs.loaders";
import { JobsResolver } from "./jobs.resolver";
import { JobsService } from "./jobs.service";

const JOB_COUNT = 20;
const jobs = Array.from({ length: JOB_COUNT }, (_, i) => ({ id: `job-${i}` }));

/** Only the batched queries exist: any per-job findUnique would throw. */
const buildPrisma = () => ({
  savedJob: {
    findMany: jest.fn().mockResolvedValue([
      { jobOpportunityId: "job-0" },
      { jobOpportunityId: "job-5" },
    ]),
  },
  jobApplication: {
    findMany: jest.fn().mockResolvedValue([{ jobOpportunityId: "job-3" }]),
  },
});

describe("JobsResolver - per-request batching of current-user fields", () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let authService: { getUserFromRequest: jest.Mock };
  let resolver: JobsResolver;

  const asUser = (userId = "user-1") =>
    authService.getUserFromRequest.mockReturnValue({ userId, role: "PLAYER" });

  const resolveAll = (
    field: "isSavedByCurrentUser" | "hasAppliedByCurrentUser",
    context: object,
  ) => Promise.all(jobs.map((job) => resolver[field](job, context)));

  beforeEach(() => {
    prisma = buildPrisma();
    authService = { getUserFromRequest: jest.fn() };
    const service = new JobsService(prisma as any, { emit: jest.fn() } as any);
    resolver = new JobsResolver(service, authService as any, new JobsLoaders(service));
  });

  describe("isSavedByCurrentUser", () => {
    it("resolves a list of 20 jobs with ONE savedJob query, not 20", async () => {
      asUser();

      const result = await resolveAll("isSavedByCurrentUser", {});

      expect(prisma.savedJob.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.savedJob.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          jobOpportunityId: { in: jobs.map((j) => j.id) },
        },
        select: { jobOpportunityId: true },
      });
      expect(result.filter(Boolean)).toHaveLength(2);
      expect(result[0]).toBe(true);
      expect(result[5]).toBe(true);
      expect(result[1]).toBe(false);
    });

    it("returns false without touching the database when anonymous", async () => {
      authService.getUserFromRequest.mockReturnValue(null);

      const result = await resolveAll("isSavedByCurrentUser", {});

      expect(result.every((value) => value === false)).toBe(true);
      expect(prisma.savedJob.findMany).not.toHaveBeenCalled();
    });

    it("does not share results across requests (one batch per context)", async () => {
      asUser();

      await resolveAll("isSavedByCurrentUser", {});
      await resolveAll("isSavedByCurrentUser", {});

      expect(prisma.savedJob.findMany).toHaveBeenCalledTimes(2);
    });

    it("deduplicates the same job appearing several times in one request", async () => {
      asUser();
      const context = {};

      await Promise.all([
        resolver.isSavedByCurrentUser({ id: "job-0" }, context),
        resolver.isSavedByCurrentUser({ id: "job-0" }, context),
      ]);

      expect(prisma.savedJob.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.savedJob.findMany.mock.calls[0][0].where.jobOpportunityId.in).toEqual([
        "job-0",
      ]);
    });
  });

  describe("mutations invalidate the per-request loaders", () => {
    let service: JobsService;

    beforeEach(() => {
      service = new JobsService(prisma as any, { emit: jest.fn() } as any);
      resolver = new JobsResolver(service, authService as any, new JobsLoaders(service));
      asUser();
    });

    it.each([
      ["saveJobOpportunity", "saveJob", (ctx: object) => resolver.saveJobOpportunity(ctx, "job-0")],
      ["unsaveJobOpportunity", "unsaveJob", (ctx: object) => resolver.unsaveJobOpportunity(ctx, "job-0")],
      ["applyForJob", "applyForJob", (ctx: object) => resolver.applyForJob(ctx, "job-0")],
      ["withdrawApplication", "withdrawApplication", (ctx: object) => resolver.withdrawApplication(ctx, "app-1")],
    ])("%s makes later reads in the same request hit the database again", async (_name, method, call) => {
      jest.spyOn(service, method as any).mockResolvedValue({} as never);
      const context = {};
      const job = { id: "job-0" };

      await resolver.isSavedByCurrentUser(job, context);
      await resolver.hasAppliedByCurrentUser(job, context);
      await call(context);
      await resolver.isSavedByCurrentUser(job, context);
      await resolver.hasAppliedByCurrentUser(job, context);

      expect(prisma.savedJob.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.jobApplication.findMany).toHaveBeenCalledTimes(2);
    });

    it("also invalidates when the mutation fails", async () => {
      jest.spyOn(service, "saveJob").mockRejectedValue(new Error("boom"));
      const context = {};

      await resolver.isSavedByCurrentUser({ id: "job-0" }, context);
      await expect(resolver.saveJobOpportunity(context, "job-0")).rejects.toThrow("boom");
      await resolver.isSavedByCurrentUser({ id: "job-0" }, context);

      expect(prisma.savedJob.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("hasAppliedByCurrentUser", () => {
    it("resolves a list of 20 jobs with ONE jobApplication query, not 20", async () => {
      asUser();

      const result = await resolveAll("hasAppliedByCurrentUser", {});

      expect(prisma.jobApplication.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.jobApplication.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          jobOpportunityId: { in: jobs.map((j) => j.id) },
          status: { not: "WITHDRAWN" },
        },
        select: { jobOpportunityId: true },
      });
      expect(result.filter(Boolean)).toHaveLength(1);
      expect(result[3]).toBe(true);
    });

    it("returns false without touching the database when anonymous", async () => {
      authService.getUserFromRequest.mockReturnValue(null);

      const result = await resolveAll("hasAppliedByCurrentUser", {});

      expect(result.every((value) => value === false)).toBe(true);
      expect(prisma.jobApplication.findMany).not.toHaveBeenCalled();
    });

    it("keeps saved and applied batches independent (one query each)", async () => {
      asUser();
      const context = {};

      await Promise.all([
        resolveAll("isSavedByCurrentUser", context),
        resolveAll("hasAppliedByCurrentUser", context),
      ]);

      expect(prisma.savedJob.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.jobApplication.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
