import { ClubsResolver } from "./clubs.resolver";
import { ClubsService } from "./clubs.service";
import { SELF_VIEW } from "../common/self-view";

/**
 * Club identity fields are resolved from the owner User. These specs use the
 * real ClubsService (so the per-request batch loaders are exercised) with a
 * mocked Prisma, and count the queries.
 */
describe("ClubsResolver - identity from the owner user", () => {
  let prisma: any;
  let service: ClubsService;
  let resolver: ClubsResolver;
  let authService: any;

  const userFor = (id: string) => ({
    id,
    name: `Club ${id}`,
    avatar: `${id}.png`,
    coverImage: `${id}-cover.png`,
    coverImagePosition: "50% 50%",
    bio: `bio ${id}`,
    city: `City ${id}`,
    country: "ES",
  });
  const clubIds = Array.from({ length: 25 }, (_, i) => `club-${i}`);
  const clubsWithoutUser = () => clubIds.map((id) => ({ id }));

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(async ({ where }: any) => where.id.in.map(userFor)),
      },
      club: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ClubsService(prisma, { emit: jest.fn() } as any);
    authService = { getUserFromRequest: jest.fn().mockReturnValue(null) };
    resolver = new ClubsResolver(service, {} as any, {} as any, authService, {} as any);
  });

  describe("without N+1", () => {
    it("answers name, logo and city of 25 clubs without `user` with ONE user.findMany", async () => {
      const ctx = {};
      const clubs = clubsWithoutUser();

      const resolved = await Promise.all(
        clubs.map(async (club) => ({
          name: await resolver.name(club, ctx),
          logo: await resolver.logo(club, ctx),
          city: await resolver.city(club, ctx),
        })),
      );

      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { id: { in: clubIds } } });
      expect(resolved[3]).toEqual({ name: "Club club-3", logo: "club-3.png", city: "City club-3" });
      expect(resolved[24].name).toBe("Club club-24");
    });

    it("resolves every owner-backed field from the same user", async () => {
      const ctx = {};
      const club = { id: "club-1" };

      expect(await resolver.coverImage(club, ctx)).toBe("club-1-cover.png");
      expect(await resolver.coverImagePosition(club, ctx)).toBe("50% 50%");
      expect(await resolver.bio(club, ctx)).toBe("bio club-1");
      expect(await resolver.country(club, ctx)).toBe("ES");
      expect(await resolver.user(club, ctx)).toEqual(userFor("club-1"));
    });

    it("does not query at all for clubs that already include `user`", async () => {
      const ctx = {};
      const clubs = clubIds.map((id) => ({ id, user: userFor(id) }));

      const names = await Promise.all(clubs.map((club) => resolver.name(club, ctx)));
      await Promise.all(clubs.map((club) => resolver.logo(club, ctx)));
      await Promise.all(clubs.map((club) => resolver.city(club, ctx)));

      expect(names[0]).toBe("Club club-0");
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it("reuses the loader within one context across fields", async () => {
      const ctx = {};

      await Promise.all(clubsWithoutUser().map((club) => resolver.name(club, ctx)));
      await Promise.all(clubsWithoutUser().map((club) => resolver.logo(club, ctx)));

      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    });

    it("does not share the cache between two contexts", async () => {
      await resolver.name({ id: "club-1" }, {});
      await resolver.name({ id: "club-1" }, {});

      expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
    });

    it("queries again after resetLoaders(context)", async () => {
      const ctx = {};

      await resolver.name({ id: "club-1" }, ctx);
      service.resetLoaders(ctx);
      await resolver.name({ id: "club-1" }, ctx);

      expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
    });

    it("falls back to empty values when the owner row is missing", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      const ctx = {};
      const club = { id: "ghost" };

      expect(await resolver.name(club, ctx)).toBe("");
      expect(await resolver.logo(club, ctx)).toBeNull();
      expect(await resolver.city(club, ctx)).toBe("");
      expect(await resolver.country(club, ctx)).toBe("");
      expect(await resolver.bio(club, ctx)).toBeNull();
    });

    it("clubs no longer have a gallery: videos is always empty", () => {
      expect(resolver.videos()).toEqual([]);
    });
  });

  describe("loadClubProfile (User.clubProfile loader)", () => {
    it("answers many users with ONE club.findMany and null for users without a club", async () => {
      prisma.club.findMany.mockResolvedValue([{ id: "u1", league: "A" }, { id: "u3", league: "C" }]);
      const ctx = {};

      const profiles = await Promise.all(
        ["u1", "u2", "u3"].map((id) => service.loadClubProfile(ctx, id)),
      );

      expect(prisma.club.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.club.findMany).toHaveBeenCalledWith({ where: { id: { in: ["u1", "u2", "u3"] } } });
      expect(profiles).toEqual([{ id: "u1", league: "A" }, null, { id: "u3", league: "C" }]);
    });

    it("does not share the cache between contexts and resetLoaders drops it", async () => {
      const ctx = {};

      await service.loadClubProfile(ctx, "u1");
      await service.loadClubProfile({}, "u1");
      service.resetLoaders(ctx);
      await service.loadClubProfile(ctx, "u1");

      expect(prisma.club.findMany).toHaveBeenCalledTimes(3);
    });
  });

  describe("privacy of managedBy and verificationDoc", () => {
    const club = {
      id: "club-1",
      managedByFirstName: "Ana",
      managedByLastName: "Lopez",
      verificationDoc: "https://res.cloudinary.com/doc.pdf",
    };
    const ctx = {};
    const asUser = (userId: string, role: string) =>
      authService.getUserFromRequest.mockReturnValue({ userId, role });

    it.each([
      ["anonymous", () => authService.getUserFromRequest.mockReturnValue(null)],
      ["another user", () => asUser("player-1", "PLAYER")],
      ["a different club", () => asUser("club-2", "CLUB")],
    ])("hides both from %s", async (_label, signIn) => {
      signIn();

      expect(resolver.managedBy(club, ctx)).toBeNull();
      await expect(resolver.verificationDoc(club, ctx)).resolves.toBeNull();
    });

    it("shows both to the owning club", async () => {
      asUser("club-1", "CLUB");

      expect(resolver.managedBy(club, ctx)).toEqual({ firstName: "Ana", lastName: "Lopez" });
      await expect(resolver.verificationDoc(club, ctx)).resolves.toBe(club.verificationDoc);
    });

    it("shows both to a SUPERADMIN", async () => {
      asUser("admin", "SUPERADMIN");

      expect(resolver.managedBy(club, ctx)).toEqual({ firstName: "Ana", lastName: "Lopez" });
      await expect(resolver.verificationDoc(club, ctx)).resolves.toBe(club.verificationDoc);
    });

    it("shows both on an object carrying SELF_VIEW even without a session", async () => {
      const own = { ...club, [SELF_VIEW]: true };

      expect(resolver.managedBy(own, ctx)).toEqual({ firstName: "Ana", lastName: "Lopez" });
      await expect(resolver.verificationDoc(own, ctx)).resolves.toBe(club.verificationDoc);
    });

    it("SELF_VIEW on one object does not leak to a copy without the symbol", () => {
      const own = { ...club, [SELF_VIEW]: true };
      const publicCopy = { ...own };
      delete (publicCopy as any)[SELF_VIEW];

      expect(resolver.managedBy(own, ctx)).not.toBeNull();
      expect(resolver.managedBy(publicCopy, ctx)).toBeNull();
    });
  });
});

describe("ClubsResolver - mutations that touch the identity", () => {
  let clubsService: any;
  let authService: any;
  let resolver: ClubsResolver;
  const ctx = {};

  // updateClub positional args after (ctx, id): name..benefits (16), logo, coverImage, city, country, username
  const USERNAME_ARG = 20;
  const updateClub = (overrides: Record<number, unknown> = {}) => {
    const args: unknown[] = new Array(21).fill(undefined);
    for (const [index, value] of Object.entries(overrides)) args[Number(index)] = value;
    return (resolver as any).updateClub(ctx, "club-1", ...args);
  };
  const NAME_ARG = 0;

  beforeEach(() => {
    clubsService = {
      updateClub: jest.fn().mockResolvedValue({ id: "club-1" }),
      create: jest.fn().mockResolvedValue({ id: "club-1" }),
      resetLoaders: jest.fn(),
    };
    authService = { getUserFromRequest: jest.fn().mockReturnValue({ userId: "club-1", role: "CLUB" }) };
    resolver = new ClubsResolver(clubsService, {} as any, {} as any, authService, {} as any);
  });

  describe("updateClub", () => {
    it("normalizes the username before calling the service", async () => {
      await updateClub({ [USERNAME_ARG]: "  Club_One " });

      expect(clubsService.updateClub).toHaveBeenCalledWith(
        "club-1",
        expect.objectContaining({ username: "club_one" }),
      );
    });

    it("leaves the username undefined when it is not sent", async () => {
      await updateClub({ [NAME_ARG]: "New" });

      expect(clubsService.updateClub.mock.calls[0][1].username).toBeUndefined();
    });

    it("rejects an invalid username with VALIDATION_ERROR before the service", async () => {
      await expect(updateClub({ [USERNAME_ARG]: "x" })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        fields: [expect.objectContaining({ field: "username" })],
      });
      expect(clubsService.updateClub).not.toHaveBeenCalled();
    });

    it("drops this request's cached owners after a successful update", async () => {
      await updateClub({ [NAME_ARG]: "New" });

      expect(clubsService.resetLoaders).toHaveBeenCalledWith(ctx);
    });

    it("maps a clubNameKey unique race to CLUB_NAME_TAKEN on field name", async () => {
      clubsService.updateClub.mockRejectedValue({ code: "P2002", meta: { target: ["clubNameKey"] } });

      await expect(updateClub({ [NAME_ARG]: "Taken" })).rejects.toMatchObject({
        code: "CLUB_NAME_TAKEN",
        field: "name",
      });
      expect(clubsService.resetLoaders).not.toHaveBeenCalled();
    });

    it("maps a username unique race to USERNAME_TAKEN and rethrows other errors untouched", async () => {
      clubsService.updateClub.mockRejectedValueOnce({ code: "P2002", meta: { target: ["username"] } });
      await expect(updateClub({ [USERNAME_ARG]: "club_one" })).rejects.toMatchObject({
        code: "USERNAME_TAKEN",
      });

      const failure = new Error("unexpected");
      clubsService.updateClub.mockRejectedValueOnce(failure);
      await expect(updateClub()).rejects.toBe(failure);
    });
  });

  describe("createClub", () => {
    const createClub = () =>
      (resolver as any).createClub(ctx, "Club Nuevo", "Madrid", "ES", "Ana", "Lopez");

    it("creates the club for the session user and resets the loaders", async () => {
      await createClub();

      expect(clubsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "club-1", name: "Club Nuevo", city: "Madrid", country: "ES" }),
      );
      expect(clubsService.resetLoaders).toHaveBeenCalledWith(ctx);
    });

    it("propagates CLUB_NAME_TAKEN from the service pre-check", async () => {
      const taken = Object.assign(new Error("taken"), { code: "CLUB_NAME_TAKEN" });
      clubsService.create.mockRejectedValue(taken);

      await expect(createClub()).rejects.toBe(taken);
    });

    it("maps a clubNameKey unique race to CLUB_NAME_TAKEN", async () => {
      clubsService.create.mockRejectedValue({ code: "P2002", meta: { target: "User_clubNameKey_key" } });

      await expect(createClub()).rejects.toMatchObject({ code: "CLUB_NAME_TAKEN", field: "name" });
    });
  });
});
