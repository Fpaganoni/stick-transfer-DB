import { UsersService } from "./users.service";

describe("UsersService - club identity support", () => {
  const originalCloudinaryUrl = process.env.CLOUDINARY_URL;
  const CLUB_FOLDER_IMAGE =
    "https://res.cloudinary.com/demo/image/upload/v1/stick-transfer/clubs/u1/logo.png";
  const USER_FOLDER_IMAGE =
    "https://res.cloudinary.com/demo/image/upload/v1/stick-transfer/users/u1/avatar.png";

  let prisma: any;
  let service: UsersService;

  beforeEach(() => {
    process.env.CLOUDINARY_URL = "cloudinary://k:s@demo";
    prisma = {
      user: {
        create: jest.fn().mockResolvedValue({ id: "u1" }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ role: "CLUB", avatar: null, coverImage: null }),
        update: jest.fn().mockResolvedValue({ id: "u1" }),
      },
    };
    service = new UsersService(prisma);
  });

  afterEach(() => {
    if (originalCloudinaryUrl === undefined) delete process.env.CLOUDINARY_URL;
    else process.env.CLOUDINARY_URL = originalCloudinaryUrl;
  });

  describe("isUsernameTaken", () => {
    it("adds NOT {id} only when excludeUserId is given", async () => {
      await service.isUsernameTaken("club_one", "u1");
      await service.isUsernameTaken("club_one");

      expect(prisma.user.findFirst).toHaveBeenNthCalledWith(1, {
        where: { username: { equals: "club_one", mode: "insensitive" }, NOT: { id: "u1" } },
        select: { id: true },
      });
      expect(prisma.user.findFirst).toHaveBeenNthCalledWith(2, {
        where: { username: { equals: "club_one", mode: "insensitive" } },
        select: { id: true },
      });
    });

    it("is false when no other user has it and true when one does", async () => {
      await expect(service.isUsernameTaken("free_one", "u1")).resolves.toBe(false);

      prisma.user.findFirst.mockResolvedValue({ id: "other" });
      await expect(service.isUsernameTaken("taken_one", "u1")).resolves.toBe(true);
    });

    it("treats an empty excludeUserId like no exclusion", async () => {
      await service.isUsernameTaken("club_one", "");

      expect(prisma.user.findFirst.mock.calls[0][0].where).not.toHaveProperty("NOT");
    });
  });

  describe("createUser with clubProfile", () => {
    const base = { email: "a@b.com", name: "Club Uno", role: "CLUB" };

    it("creates the Club row in the same write (nested create)", async () => {
      await service.createUser({
        ...base,
        clubProfile: { managedByFirstName: "Ana", managedByLastName: "Lopez" },
      });

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(prisma.user.create.mock.calls[0][0].data.clubProfile).toEqual({
        create: { managedByFirstName: "Ana", managedByLastName: "Lopez" },
      });
    });

    it("sends no clubProfile for other roles", async () => {
      await service.createUser({ email: "a@b.com", name: "Ana", role: "PLAYER" });

      expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty("clubProfile");
    });
  });

  describe("updateUser - images of a CLUB account", () => {
    it.each([
      ["clubs", CLUB_FOLDER_IMAGE],
      ["users", USER_FOLDER_IMAGE],
    ])("accepts an avatar from the %s folder for a CLUB target", async (_folder, url) => {
      await service.updateUser("u1", { avatar: url });

      expect(prisma.user.update.mock.calls[0][0].data.avatar).toBe(url);
    });

    it("accepts a coverImage from the clubs folder for a CLUB target", async () => {
      const cover = CLUB_FOLDER_IMAGE.replace("logo.png", "club-cover.png");

      await service.updateUser("u1", { coverImage: cover });

      expect(prisma.user.update.mock.calls[0][0].data.coverImage).toBe(cover);
    });

    it("rejects an avatar from the clubs folder for a PLAYER target", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "PLAYER", avatar: null, coverImage: null });

      await expect(service.updateUser("u1", { avatar: CLUB_FOLDER_IMAGE })).rejects.toMatchObject({
        fields: [expect.objectContaining({ field: "avatar", code: "IMAGE_URL_INVALID" })],
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("still accepts the PLAYER's own users folder", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "PLAYER", avatar: null, coverImage: null });

      await service.updateUser("u1", { avatar: USER_FOLDER_IMAGE });

      expect(prisma.user.update.mock.calls[0][0].data.avatar).toBe(USER_FOLDER_IMAGE);
    });

    it("rejects another owner's clubs folder even for a CLUB target", async () => {
      const foreign = CLUB_FOLDER_IMAGE.replace("/u1/", "/u2/");

      await expect(service.updateUser("u1", { avatar: foreign })).rejects.toMatchObject({
        fields: [expect.objectContaining({ code: "IMAGE_URL_INVALID" })],
      });
    });

    it("does not read the user for images when none is sent", async () => {
      await service.updateUser("u1", { bio: "hello" });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
