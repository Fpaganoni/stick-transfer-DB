import { NotFoundException } from "@nestjs/common";
import { ClubsService } from "./clubs.service";

/**
 * Club identity (name, logo, city, country...) lives on the owner User. These
 * specs cover the club-name uniqueness pre-check, the all-or-nothing
 * updateClub transaction and the User/Club split in create, getClubAdmins and
 * the legacy upload setters. Prisma is mocked; there is no database.
 */
describe("ClubsService - club identity", () => {
  const OWN_LOGO =
    "https://res.cloudinary.com/demo/image/upload/v1/stick-transfer/clubs/club-1/logo.png";
  const OWN_USER_AVATAR =
    "https://res.cloudinary.com/demo/image/upload/v1/stick-transfer/users/club-1/avatar.png";

  // Stand-ins for the lazy Prisma operations handed to $transaction([...])
  const USER_OP = { op: "user.update" };
  const CLUB_OP = { op: "club.update" };

  let prisma: any;
  let eventEmitter: { emit: jest.Mock };
  let service: ClubsService;
  const originalCloudinaryUrl = process.env.CLOUDINARY_URL;

  beforeEach(() => {
    process.env.CLOUDINARY_URL = "cloudinary://k:s@demo";
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: "CLUB", avatar: null, coverImage: null }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockReturnValue(USER_OP),
      },
      club: {
        findUnique: jest.fn().mockResolvedValue({ id: "club-1" }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockReturnValue(CLUB_OP),
        update: jest.fn().mockReturnValue(CLUB_OP),
      },
      $transaction: jest.fn().mockResolvedValue([{ id: "club-1" }, { id: "club-1", name: "Saved" }]),
    };
    eventEmitter = { emit: jest.fn() };
    service = new ClubsService(prisma, eventEmitter as any);
  });

  afterEach(() => {
    if (originalCloudinaryUrl === undefined) delete process.env.CLOUDINARY_URL;
    else process.env.CLOUDINARY_URL = originalCloudinaryUrl;
  });

  const rejectionOf = async (promise: Promise<unknown>): Promise<any> => {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    throw new Error("expected rejection");
  };

  describe("assertClubNameAvailable", () => {
    it("resolves when no other user has the same name key", async () => {
      await expect(service.assertClubNameAvailable("Club X", null)).resolves.toBeUndefined();
    });

    it.each([
      ["different case", "CLUB X"],
      ["extra spaces", "  Club    X  "],
      ["a non-breaking space", "Club X"],
      ["accents", "Clúb X"],
    ])("throws CLUB_NAME_TAKEN (409) for a variant with %s", async (_label, variant) => {
      prisma.user.findFirst.mockResolvedValue({ id: "other" });

      const error = await rejectionOf(service.assertClubNameAvailable(variant, null));

      expect(error).toMatchObject({ code: "CLUB_NAME_TAKEN", field: "name" });
      expect(error.getStatus()).toBe(409);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { clubNameKey: "club x" },
        select: { id: true },
      });
    });

    it("excludes the caller so a club can rename 'Club X' to 'club x'", async () => {
      await service.assertClubNameAvailable("club x", "club-1");

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { clubNameKey: "club x", NOT: { id: "club-1" } },
        select: { id: true },
      });
    });

    it("reports the requested field (clubName during register)", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "other" });

      await expect(
        service.assertClubNameAvailable("Club X", null, "clubName"),
      ).rejects.toMatchObject({ code: "CLUB_NAME_TAKEN", field: "clubName" });
    });
  });

  describe("assertClubIdentityUpdate", () => {
    it("returns the normalized name, trimmed city and uppercase country", async () => {
      const patch = await service.assertClubIdentityUpdate("club-1", {
        name: "  Club   de  Campo ",
        city: " Madrid ",
        country: "es",
      });

      expect(patch).toEqual({ name: "Club de Campo", city: "Madrid", country: "ES" });
    });

    it("returns an empty patch and runs no query when nothing is sent", async () => {
      await expect(service.assertClubIdentityUpdate("club-1", {})).resolves.toEqual({});
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it("checks the new name against other clubs only (NOT the club itself)", async () => {
      await service.assertClubIdentityUpdate("club-1", { name: "Club X" });

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clubNameKey: "club x", NOT: { id: "club-1" } },
        }),
      );
    });

    it("propagates CLUB_NAME_TAKEN with field name", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "other" });

      await expect(
        service.assertClubIdentityUpdate("club-1", { name: "Taken" }),
      ).rejects.toMatchObject({ code: "CLUB_NAME_TAKEN", field: "name" });
    });

    it("rejects blank and over-long names without querying", async () => {
      const blank = await rejectionOf(service.assertClubIdentityUpdate("club-1", { name: "  " }));
      const long = await rejectionOf(
        service.assertClubIdentityUpdate("club-1", { name: "x".repeat(101) }),
      );

      expect(blank.fields).toEqual([expect.objectContaining({ field: "name", code: "NAME_REQUIRED" })]);
      expect(long.fields).toEqual([expect.objectContaining({ field: "name", code: "NAME_TOO_LONG" })]);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it("rejects a null or blank city and a null country with a validation error", async () => {
      const nullCity = await rejectionOf(service.assertClubIdentityUpdate("club-1", { city: null }));
      const blankCity = await rejectionOf(service.assertClubIdentityUpdate("club-1", { city: " " }));
      const nullCountry = await rejectionOf(
        service.assertClubIdentityUpdate("club-1", { country: null }),
      );

      expect(nullCity.fields[0]).toMatchObject({ field: "city", code: "FIELD_REQUIRED" });
      expect(blankCity.fields[0]).toMatchObject({ field: "city", code: "FIELD_REQUIRED" });
      expect(nullCountry.fields[0]).toMatchObject({ field: "country", code: "COUNTRY_INVALID" });
    });

    it("reports every invalid field at once", async () => {
      const error = await rejectionOf(
        service.assertClubIdentityUpdate("club-1", { name: "", city: "", country: "Spain" }),
      );

      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.fields.map((f: any) => f.field)).toEqual(["name", "city", "country"]);
    });
  });

  describe("updateClub - one transaction for User and Club", () => {
    it("passes the user update and the club update together to ONE array $transaction", async () => {
      const result = await service.updateClub("club-1", {
        name: "New Name",
        bio: "About us",
        coverImagePosition: "10% 20%",
        description: "Club description",
        league: "Primera",
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith([USER_OP, CLUB_OP]);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "club-1" },
        data: { name: "New Name", bio: "About us", coverImagePosition: "10% 20%" },
      });
      expect(prisma.club.update).toHaveBeenCalledWith({
        where: { id: "club-1" },
        data: { description: "Club description", league: "Primera" },
        include: { user: true },
      });
      expect(result).toEqual({ id: "club-1", name: "Saved" });
    });

    it("rejects when the transaction rejects (Club part failed) and writes nothing on its own", async () => {
      const failure = new Error("club update failed");
      prisma.$transaction.mockRejectedValue(failure);

      await expect(service.updateClub("club-1", { name: "New Name", league: "X" })).rejects.toBe(
        failure,
      );

      // The only way the operations can run is through the (rejected) transaction
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction.mock.calls[0][0]).toEqual([USER_OP, CLUB_OP]);
    });

    it("keeps User-only and Club-only fields on their own row", async () => {
      await service.updateClub("club-1", { city: "Madrid", description: "d" });

      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ city: "Madrid" });
      expect(prisma.club.update.mock.calls[0][0].data).toEqual({ description: "d" });
    });

    it("writes the logo as user.avatar and the cover image as user.coverImage", async () => {
      await service.updateClub("club-1", {
        logo: OWN_LOGO,
        coverImage: "",
      });

      expect(prisma.user.update.mock.calls[0][0].data).toEqual({
        avatar: OWN_LOGO,
        coverImage: null,
      });
      expect(prisma.club.update.mock.calls[0][0].data).toEqual({});
    });

    it("accepts urls from both stick-transfer/users/{id} and stick-transfer/clubs/{id}", async () => {
      await service.updateClub("club-1", { logo: OWN_USER_AVATAR });
      await service.updateClub("club-1", { logo: OWN_LOGO });

      expect(prisma.user.update.mock.calls[0][0].data.avatar).toBe(OWN_USER_AVATAR);
      expect(prisma.user.update.mock.calls[1][0].data.avatar).toBe(OWN_LOGO);
    });

    it("pre-checks a new username case-insensitively, excluding the club itself", async () => {
      await service.updateClub("club-1", { username: "club_one" });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { username: { equals: "club_one", mode: "insensitive" }, NOT: { id: "club-1" } },
        select: { id: true },
      });
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ username: "club_one" });
    });

    it("does not look up usernames when none is sent", async () => {
      await service.updateClub("club-1", { name: "Only Name" });

      expect(prisma.user.findFirst).toHaveBeenCalledTimes(1); // the club name pre-check
    });

    describe("failures that happen BEFORE the transaction", () => {
      const expectNothingWritten = () => {
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(prisma.club.update).not.toHaveBeenCalled();
      };

      it.each([
        ["different case", "CLUB X"],
        ["extra spaces", " Club   X "],
        ["accents", "Clúb X"],
      ])("CLUB_NAME_TAKEN for a name that only differs in %s", async (_label, name) => {
        prisma.user.findFirst.mockResolvedValue({ id: "other" });

        await expect(service.updateClub("club-1", { name })).rejects.toMatchObject({
          code: "CLUB_NAME_TAKEN",
          field: "name",
        });
        expectNothingWritten();
      });

      it("USERNAME_TAKEN when another account has the username", async () => {
        prisma.user.findFirst.mockImplementation(async ({ where }: any) =>
          where.username ? { id: "other" } : null,
        );

        await expect(
          service.updateClub("club-1", { name: "Free Name", username: "taken_one" }),
        ).rejects.toMatchObject({ code: "USERNAME_TAKEN", field: "username" });
        expectNothingWritten();
      });

      it("IMAGE_URL_INVALID reported under field logo for a bad logo", async () => {
        await expect(
          service.updateClub("club-1", { logo: "https://evil.example.com/x.png" }),
        ).rejects.toMatchObject({
          fields: [expect.objectContaining({ field: "logo", code: "IMAGE_URL_INVALID" })],
        });
        expectNothingWritten();
      });

      it("COUNTRY_INVALID for an unknown country", async () => {
        await expect(service.updateClub("club-1", { country: "Atlantis" })).rejects.toMatchObject({
          fields: [expect.objectContaining({ field: "country", code: "COUNTRY_INVALID" })],
        });
        expectNothingWritten();
      });

      it("a blank city", async () => {
        await expect(service.updateClub("club-1", { city: "   " })).rejects.toMatchObject({
          fields: [expect.objectContaining({ field: "city" })],
        });
        expectNothingWritten();
      });

      it("a target that is not a CLUB is NotFound", async () => {
        prisma.user.findUnique.mockResolvedValue({ role: "PLAYER", avatar: null, coverImage: null });

        await expect(service.updateClub("player-1", { name: "Hijack" })).rejects.toThrow(
          NotFoundException,
        );
        expectNothingWritten();
      });
    });
  });

  describe("create", () => {
    const input = {
      userId: "club-1",
      name: "  Club   Nuevo ",
      city: "Madrid",
      country: "es",
      managedByFirstName: "Ana",
      managedByLastName: "Lopez",
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ id: "club-1", name: "tmp", role: "CLUB" });
      prisma.club.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{ id: "club-1" }, { id: "club-1" }]);
    });

    it("writes the identity on the user and the club row in ONE $transaction", async () => {
      await service.create(input);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "club-1" },
        data: { name: "Club Nuevo", city: "Madrid", country: "ES" },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith([USER_OP, CLUB_OP]);
    });

    it("throws CLUB_NAME_TAKEN for a name variant used by another club, before writing", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "other" });

      await expect(service.create({ ...input, name: "CLUB NUEVO" })).rejects.toMatchObject({
        code: "CLUB_NAME_TAKEN",
        field: "name",
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.club.create).not.toHaveBeenCalled();
    });

    it("notifies the super admins after the transaction commits", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);

      await service.create(input);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "club.pending_verification",
        expect.objectContaining({ actorId: "club-1", recipientId: "admin-1" }),
      );
    });

    it("does not notify when the transaction fails", async () => {
      prisma.$transaction.mockRejectedValue(new Error("db down"));

      await expect(service.create(input)).rejects.toThrow("db down");
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe("getClubAdmins", () => {
    it("lists CLUB users with a club profile sorted by user name", async () => {
      await service.getClubAdmins();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: "CLUB", clubProfile: { isNot: null } },
        include: { clubProfile: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
    });

    it("builds each row from the user and builds adminName from managedBy", async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: "club-1",
          name: "Club Uno",
          city: "Madrid",
          country: "ES",
          username: "clubuno",
          avatar: "crest.png",
          email: "uno@club.test",
          clubProfile: {
            league: "Primera",
            isVerified: true,
            managedByFirstName: "Ana",
            managedByLastName: "Lopez",
          },
        },
      ]);

      const [row] = await service.getClubAdmins();

      expect(row).toEqual({
        clubId: "club-1",
        clubName: "Club Uno",
        clubCity: "Madrid",
        clubCountry: "ES",
        clubLeague: "Primera",
        clubIsVerified: true,
        adminId: "club-1",
        adminName: "Ana Lopez",
        adminUsername: "clubuno",
        adminAvatar: "crest.png",
        adminEmail: "uno@club.test",
        adminCountry: "ES",
        adminCity: "Madrid",
      });
    });

    it("falls back to empty strings for a missing city/country and null league", async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: "club-2",
          name: "B",
          city: null,
          country: null,
          clubProfile: {
            league: undefined,
            isVerified: false,
            managedByFirstName: "Ana",
            managedByLastName: "",
          },
        },
      ]);

      const [row] = await service.getClubAdmins();

      expect(row).toMatchObject({
        clubCity: "",
        clubCountry: "",
        clubLeague: null,
        adminName: "Ana",
      });
    });
  });

  describe("legacy base64 upload setters", () => {
    it("setLogo writes the crest as user.avatar", async () => {
      await service.setLogo("club-1", "https://img/logo.png");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "club-1" },
        data: { avatar: "https://img/logo.png" },
      });
      expect(prisma.club.update).not.toHaveBeenCalled();
    });

    it("setCoverImage writes user.coverImage", async () => {
      await service.setCoverImage("club-1", "https://img/cover.png");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "club-1" },
        data: { coverImage: "https://img/cover.png" },
      });
    });

    it.each(["setLogo", "setCoverImage"] as const)(
      "%s rejects an unknown club without writing",
      async (method) => {
        prisma.club.findUnique.mockResolvedValue(null);

        await expect(service[method]("ghost", "https://img")).rejects.toThrow("not found");
        expect(prisma.user.update).not.toHaveBeenCalled();
      },
    );
  });
});
