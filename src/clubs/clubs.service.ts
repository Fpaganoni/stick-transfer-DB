import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Club, NotificationType, Prisma, User, VerificationStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { ownerImageFolder, resolveOwnedImages } from "../uploads/image-url";
import { AppError, FieldError } from "../common/errors/app.error";
import { checkCountry, normalizeCountry } from "../common/geo/countries";
import { normalizeOffsetPagination } from "../common/pagination";
import { BatchLoader, createBatchLoader } from "../common/batch-loader";
import {
  checkOwnedCloudinaryDocumentUrl,
  checkPhone,
  checkPublicHttpUrl,
  throwIfInvalid,
} from "../common/safe-url";
import { checkEmail } from "../users/validation/credentials";
import { checkClubName, hasControlOrFormatChars, normalizeClubNameKey } from "./club-name";

const MANAGER_NAME_MAX_LENGTH = 100;

/** Manager first/last name: required text, bounded, no control or invisible characters. */
export function checkManagerName(field: string, value: string): FieldError | null {
  const text = value.trim();
  if (!text) return { field, code: "FIELD_REQUIRED", message: `${field} cannot be empty` };
  if (text.length > MANAGER_NAME_MAX_LENGTH) {
    return { field, code: "NAME_TOO_LONG", message: `${field} must be at most ${MANAGER_NAME_MAX_LENGTH} characters` };
  }
  if (hasControlOrFormatChars(text)) {
    return { field, code: "NAME_INVALID", message: `${field} cannot contain control or invisible characters` };
  }
  return null;
}

/** Identity fields of a CLUB account. They live on User, not on Club. */
export interface ClubIdentityInput {
  name?: string;
  city?: string | null;
  country?: string | null;
}

/** Validated, normalized subset of ClubIdentityInput, ready for user.update. */
export interface ClubIdentityPatch {
  name?: string;
  city?: string;
  country?: string;
}

export interface UpdateClubInput {
  // identity (User)
  name?: string;
  username?: string;
  bio?: string | null;
  logo?: string | null;
  coverImage?: string | null;
  coverImagePosition?: string;
  city?: string | null;
  country?: string | null;
  // club data (Club)
  managedByFirstName?: string;
  managedByLastName?: string;
  description?: string;
  league?: string;
  foundedYear?: number;
  email?: string;
  phone?: string;
  website?: string;
  instagram?: string;
  twitter?: string;
  facebook?: string;
  tiktok?: string;
  benefits?: string[];
}

@Injectable()
export class ClubsService {
  private readonly membersLoaders = new WeakMap<
    object,
    BatchLoader<string, Awaited<ReturnType<ClubsService["findMembersForClubs"]>>[number]>
  >();
  private readonly ownerLoaders = new WeakMap<object, BatchLoader<string, User | null>>();
  private readonly profileLoaders = new WeakMap<object, BatchLoader<string, Club | null>>();

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * One loader per GraphQL request (keyed by the context object, so nothing is
   * shared across requests). Without a context object the loader is not cached.
   */
  private requestLoader<V>(
    store: WeakMap<object, BatchLoader<string, V>>,
    context: object,
    batchFn: (ids: string[]) => Promise<V[]>,
  ): BatchLoader<string, V> {
    if (typeof context !== "object" || context === null) return createBatchLoader(batchFn);
    let loader = store.get(context);
    if (!loader) {
      loader = createBatchLoader(batchFn);
      store.set(context, loader);
    }
    return loader;
  }

  /** Newest first, ties broken by id so limit/offset pages never overlap. */
  async findAll(limit?: number | null, offset?: number | null) {
    const { skip, take } = normalizeOffsetPagination(limit, offset);
    // The owning user is joined: identity fields (name, logo, city...) are read
    // from it. Members are resolved lazily (see loadMembers).
    return this.prisma.club.findMany({
      // role CLUB: an account demoted by an admin keeps its Club row but is not a club any more
      where: { user: { isActive: true, role: "CLUB" } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take,
      include: { user: true },
    });
  }

  async findById(id: string) {
    return this.prisma.club.findUnique({
      where: { id },
      include: { user: true },
    });
  }

  /**
   * The User that owns a club (same id) for the Club.name / logo / city...
   * fields. Clubs of one GraphQL operation are answered by ONE query, even
   * when the Club object came without its `user` joined.
   */
  loadOwner(context: object, clubId: string) {
    return this.requestLoader(this.ownerLoaders, context, (ids) => this.findOwners(ids)).load(
      clubId,
    );
  }

  /** The Club profile of a user (null unless role CLUB) for User.clubProfile. */
  loadClubProfile(context: object, userId: string) {
    return this.requestLoader(this.profileLoaders, context, (ids) =>
      this.findProfiles(ids),
    ).load(userId);
  }

  /** Drops this request's cached owners/profiles; call after a mutation that changed them. */
  resetLoaders(context: object) {
    if (typeof context !== "object" || context === null) return;
    this.ownerLoaders.delete(context);
    this.profileLoaders.delete(context);
  }

  /** One query for the owners of every given club; result[i] belongs to clubIds[i]. */
  async findOwners(clubIds: string[]): Promise<(User | null)[]> {
    const users = await this.prisma.user.findMany({ where: { id: { in: clubIds } } });
    const byId = new Map(users.map((user) => [user.id, user]));
    return clubIds.map((id) => byId.get(id) ?? null);
  }

  /** One query for the club profiles of every given user id. */
  async findProfiles(userIds: string[]): Promise<(Club | null)[]> {
    const clubs = await this.prisma.club.findMany({ where: { id: { in: userIds } } });
    const byId = new Map(clubs.map((club) => [club.id, club]));
    return userIds.map((id) => byId.get(id) ?? null);
  }

  /**
   * Members of one club for the `Club.members` field. Requests for several
   * clubs in the same GraphQL operation are answered by ONE query
   * (findMembersForClubs).
   */
  loadMembers(context: object, clubId: string) {
    return this.requestLoader(this.membersLoaders, context, (ids) =>
      this.findMembersForClubs(ids),
    ).load(clubId);
  }

  /** One query for the members of every given club; result[i] belongs to clubIds[i]. */
  async findMembersForClubs(clubIds: string[]) {
    const rows = await this.prisma.clubMember.findMany({
      where: { clubId: { in: clubIds } },
      include: { user: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const byClub = new Map<string, any[]>();
    for (const member of rows) {
      const list = byClub.get(member.clubId) ?? [];
      list.push({
        ...member,
        role: member.roleInClub,
        joinedAt: member.createdAt.toISOString(),
      });
      byClub.set(member.clubId, list);
    }
    return clubIds.map((id) => byClub.get(id) ?? []);
  }

  /**
   * Flat view pairing each club with its account (Club.id === User.id). The
   * club IS the account, so the "admin" is the person in Club.managedBy.
   */
  async getClubAdmins() {
    const users = await this.prisma.user.findMany({
      where: { role: "CLUB", clubProfile: { isNot: null } },
      include: { clubProfile: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return users.map((user) => {
      const club = user.clubProfile!;
      return {
        clubId: user.id,
        clubName: user.name,
        // NOT NULL for role CLUB (DB CHECK User_club_location_check)
        clubCity: user.city ?? "",
        clubCountry: user.country ?? "",
        clubLeague: club.league ?? null,
        clubIsVerified: club.isVerified,
        adminId: user.id,
        adminName: `${club.managedByFirstName} ${club.managedByLastName}`.trim(),
        adminUsername: user.username,
        adminAvatar: user.avatar,
        adminEmail: user.email,
        adminCountry: user.country,
        adminCity: user.city,
      };
    });
  }

  /**
   * THE club-identity rule, shared by updateClub, updateUser (for a CLUB
   * target) and createClub: validates name / city / country and checks the
   * name is not taken by another club. Returns what to write on the User row.
   * `null` city/country is rejected: a club always has both.
   */
  async assertClubIdentityUpdate(
    id: string,
    input: ClubIdentityInput,
  ): Promise<ClubIdentityPatch> {
    const errors: FieldError[] = [];
    const patch: ClubIdentityPatch = {};

    if (input.name !== undefined) {
      const checked = checkClubName(input.name, "name");
      if (checked.error) errors.push(checked.error);
      else patch.name = checked.name;
    }
    if (input.city !== undefined) {
      if (input.city === null || !input.city.trim()) {
        errors.push({ field: "city", code: "FIELD_REQUIRED", message: "A club needs a city" });
      } else {
        patch.city = input.city.trim();
      }
    }
    if (input.country !== undefined) {
      // checkCountry flags blank and unknown values; null would mean "clear"
      const countryError = checkCountry(input.country ?? "");
      if (countryError) errors.push(countryError);
      else patch.country = normalizeCountry(input.country)!;
    }
    if (errors.length) throw AppError.validation(errors);

    if (typeof patch.name === "string") {
      await this.assertClubNameAvailable(patch.name, id, "name");
    }
    return patch;
  }

  /** Pre-check only: the unique index on User.clubNameKey is the real guard (race -> P2002). */
  async assertClubNameAvailable(
    name: string,
    excludeUserId: string | null,
    field: "name" | "clubName" = "name",
  ) {
    const taken = await this.prisma.user.findFirst({
      where: {
        clubNameKey: normalizeClubNameKey(name),
        ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    if (taken) throw AppError.clubNameTaken(field);
  }

  /** `username` must already be normalized + validated (validateUsernameOrThrow). */
  private async assertUsernameAvailable(username: string, excludeUserId: string) {
    const taken = await this.prisma.user.findFirst({
      where: {
        username: { equals: username, mode: "insensitive" },
        NOT: { id: excludeUserId },
      },
      select: { id: true },
    });
    if (taken) throw AppError.usernameTaken();
  }

  /**
   * Fills the Club row of a CLUB user that has none. The identity (name, city,
   * country) is written on the User in the same transaction. The club shares
   * the user's id (1:1).
   */
  async create(data: {
    userId: string;
    name: string;
    city: string;
    country: string;
    managedByFirstName: string;
    managedByLastName: string;
    benefits?: string[];
    instagram?: string;
    twitter?: string;
    facebook?: string;
    tiktok?: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
    });

    if (!user) {
      throw new BadRequestException(`User with id "${data.userId}" not found.`);
    }

    if (user.role !== "CLUB") {
      throw new BadRequestException(
        `User "${user.name}" must have the CLUB role to create a club. ` +
        `Current role: ${user.role}.`
      );
    }

    const existing = await this.prisma.club.findUnique({ where: { id: data.userId } });
    if (existing) {
      throw new BadRequestException("This user already has a club profile.");
    }

    const identity = await this.assertClubIdentityUpdate(user.id, {
      name: data.name,
      city: data.city,
      country: data.country,
    });

    const [, club] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: identity }),
      this.prisma.club.create({
        data: {
          id: data.userId,
          managedByFirstName: data.managedByFirstName,
          managedByLastName: data.managedByLastName,
          benefits: data.benefits || [],
          instagram: data.instagram,
          twitter: data.twitter,
          facebook: data.facebook,
          tiktok: data.tiktok,
        },
        include: { user: true },
      }),
    ]);

    await this.notifyPendingVerification(club.id);
    return club;
  }

  /** Tells every super admin that a new club awaits verification. */
  async notifyPendingVerification(clubId: string) {
    const superadmins = await this.prisma.user.findMany({
      where: { role: "SUPERADMIN" },
      select: { id: true },
    });

    for (const superadmin of superadmins) {
      this.eventEmitter.emit("club.pending_verification", {
        actorId: clubId,
        recipientId: superadmin.id,
        type: NotificationType.CLUB_PENDING_VERIFICATION,
        entityId: clubId,
      });
    }
  }

  /** Super-admin only: marks a club's verification as approved. */
  async verifyClub(clubId: string, superadminId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new BadRequestException(`Club ${clubId} not found`);
    if (club.isVerified) throw new BadRequestException(`Club is already verified`);

    const updated = await this.prisma.club.update({
      where: { id: clubId },
      data: {
        isVerified: true,
        verificationStatus: "VERIFIED",
      },
      include: { user: true },
    });

    this.eventEmitter.emit("club.verified", {
      actorId: superadminId,
      recipientId: clubId,
      type: NotificationType.CLUB_VERIFIED,
      entityId: clubId,
    });

    return updated;
  }

  /** Super-admin only: sets a club's verification status directly. */
  async setVerificationStatus(clubId: string, status: string, superadminId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new BadRequestException(`Club ${clubId} not found`);

    const wasVerified = club.isVerified;

    const updated = await this.prisma.club.update({
      where: { id: clubId },
      data: {
        verificationStatus: status as VerificationStatus,
        isVerified: status === "VERIFIED",
      },
      include: { user: true },
    });

    if (status === "VERIFIED" && !wasVerified) {
      this.eventEmitter.emit("club.verified", {
        actorId: superadminId,
        recipientId: clubId,
        type: NotificationType.CLUB_VERIFIED,
        entityId: clubId,
      });
    }

    return updated;
  }

  async inviteMember(clubId: string, userId: string, invitedById: string) {
    const existing = await this.prisma.clubMember.findFirst({
      where: { clubId, userId },
    });

    if (existing) {
      throw new Error("User is already a member of this club");
    }

    const member = await this.prisma.clubMember.create({
      data: { clubId, userId, invitedById, status: "PENDING" },
    });

    this.eventEmitter.emit('club.invite_sent', {
      actorId: invitedById,
      recipientId: userId,
      type: NotificationType.CLUB_INVITE,
      entityId: clubId,
    });

    return member;
  }

  /** Only the invited user can accept, and only while the invite is PENDING. */
  async acceptMembership(membershipId: string, currentUserId: string) {
    const membership = await this.prisma.clubMember.findUnique({
      where: { id: membershipId },
      select: { id: true, userId: true, status: true },
    });
    if (!membership) throw new NotFoundException("Membership not found");
    if (membership.userId !== currentUserId) {
      throw new ForbiddenException("This invitation is not addressed to you");
    }
    if (membership.status !== "PENDING") {
      throw new BadRequestException("This invitation is no longer pending");
    }

    return this.prisma.clubMember.update({
      where: { id: membershipId },
      data: { status: "ACTIVE" },
    });
  }

  /**
   * Updates the club identity (User row) and the club data (Club row) in ONE
   * transaction: if the Club part fails, nothing of the User part is saved.
   * Authorization (owner or SUPERADMIN) is the caller's job.
   */
  async updateClub(id: string, input: UpdateClubInput) {
    if (
      input.foundedYear != null &&
      (input.foundedYear < 1800 || input.foundedYear > 2100)
    ) {
      throw new BadRequestException("foundedYear must be between 1800 and 2100");
    }

    // Contact data is rendered as links/mailto on the public club page. "" clears a field.
    throwIfInvalid([
      // null (explicit GraphQL null) means "unchanged", like omitting the argument
      input.managedByFirstName != null
        ? checkManagerName("managedByFirstName", input.managedByFirstName)
        : null,
      input.managedByLastName != null
        ? checkManagerName("managedByLastName", input.managedByLastName)
        : null,
      input.website ? checkPublicHttpUrl("website", input.website) : null,
      input.email ? checkEmail(input.email) : null,
      input.phone ? checkPhone("phone", input.phone) : null,
    ]);

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true, avatar: true, coverImage: true },
    });
    if (!target || target.role !== "CLUB") {
      throw new NotFoundException(`Club ${id} not found`);
    }

    const { name, username, bio, logo, coverImage, coverImagePosition, city, country, ...clubData } =
      input;

    // null city/country keeps the stored value (they are required); blank is an error
    const identity = await this.assertClubIdentityUpdate(id, {
      name,
      city: city ?? undefined,
      country: country ?? undefined,
    });
    if (username !== undefined) await this.assertUsernameAvailable(username, id);

    // A club owns users/{id} and clubs/{id} (same id): both folders are valid,
    // and the logo is stored as User.avatar.
    const images = resolveOwnedImages({
      kind: ["users", "clubs"],
      ownerId: id,
      input: { avatar: logo, coverImage },
      current: target,
      errorFields: { avatar: "logo" },
    });

    const userData: Prisma.UserUpdateInput = {
      ...identity,
      ...images,
      ...(username !== undefined && { username }),
      ...(bio !== undefined && { bio }),
      ...(coverImagePosition !== undefined && { coverImagePosition }),
    };

    const [, club] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: userData }),
      this.prisma.club.update({
        where: { id },
        // managedBy* are NOT NULL columns: a null keeps the stored value instead of failing
        data: {
          ...clubData,
          managedByFirstName: clubData.managedByFirstName ?? undefined,
          managedByLastName: clubData.managedByLastName ?? undefined,
        },
        include: { user: true },
      }),
    ]);
    return club;
  }

  /** Legacy base64 upload: the crest is the owner's avatar. */
  async setLogo(clubId: string, url: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new BadRequestException(`Club ${clubId} not found`);
    await this.prisma.user.update({ where: { id: clubId }, data: { avatar: url } });
  }

  async setCoverImage(clubId: string, url: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new BadRequestException(`Club ${clubId} not found`);
    await this.prisma.user.update({ where: { id: clubId }, data: { coverImage: url } });
  }

  async requestVerification(clubId: string, documentUrl: string) {
    // A club can only present a document from its own folder, never another club's
    throwIfInvalid([
      checkOwnedCloudinaryDocumentUrl("documentUrl", documentUrl, ownerImageFolder("clubs", clubId)),
    ]);
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new BadRequestException(`Club ${clubId} not found`);
    if (club.isVerified) throw new BadRequestException(`Club is already verified`);
    if (club.verificationStatus === "PENDING") throw new BadRequestException(`Verification is already pending`);

    return this.prisma.club.update({
      where: { id: clubId },
      data: {
        verificationStatus: "PENDING",
        verificationDoc: documentUrl,
      },
    });
  }
}
