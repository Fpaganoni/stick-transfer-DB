import { Injectable, BadRequestException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NotificationType } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class ClubsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  findAll() {
    return this.prisma.club.findMany({
      include: {
        teams: true,
        user: true,
      },
    });
  }

  async findById(id: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
      include: {
        user: true,
        clubMembers: {
          include: { user: true },
        },
      },
    });

    if (!club) return null;

    return {
      ...club,
      members: club.clubMembers.map((member) => ({
        ...member,
        role: member.roleInClub,
        joinedAt: member.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Returns a flat view pairing each Club with the User it belongs to
   * (Club.id === User.id, so "admin" fields below describe that same user).
   */
  async getClubAdmins() {
    const clubs = await this.prisma.club.findMany({
      include: { user: true },
      orderBy: { name: "asc" },
    });

    return clubs.map((club) => ({
      clubId: club.id,
      clubName: club.name,
      clubCity: club.city,
      clubCountry: club.country,
      clubLeague: club.league ?? null,
      clubIsVerified: club.isVerified,
      adminId: club.user.id,
      adminName: club.user.name,
      adminUsername: club.user.username,
      adminAvatar: club.user.avatar,
      adminEmail: club.user.email,
      adminCountry: club.user.country,
      adminCity: club.user.city,
    }));
  }

  /**
   * Creates the club profile for a User with role CLUB. The club shares the
   * same id as its owning user (1:1) — there is no separate admin concept.
   */
  async create(data: {
    userId: string;
    name: string;
    city: string;
    country: string;
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

    const club = await this.prisma.club.create({
      data: {
        id: data.userId,
        name: data.name,
        city: data.city,
        country: data.country,
        benefits: data.benefits || [],
        instagram: data.instagram,
        twitter: data.twitter,
        facebook: data.facebook,
        tiktok: data.tiktok,
      },
      include: {
        user: true,
      },
    });

    const superadmins = await this.prisma.user.findMany({
      where: { role: "SUPERADMIN" },
      select: { id: true },
    });

    for (const superadmin of superadmins) {
      this.eventEmitter.emit("club.pending_verification", {
        actorId: club.id,
        recipientId: superadmin.id,
        type: NotificationType.CLUB_PENDING_VERIFICATION,
        entityId: club.id,
      });
    }

    return club;
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

  async acceptMembership(membershipId: string) {
    return this.prisma.clubMember.update({
      where: { id: membershipId },
      data: { status: "ACTIVE" },
    });
  }

  async updateClub(
    id: string,
    data: {
      name?: string;
      description?: string;
      bio?: string;
      coverImagePosition?: string;
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
    },
  ) {
    return this.prisma.club.update({
      where: { id },
      data,
      include: { user: true },
    });
  }

  async setLogo(clubId: string, url: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new BadRequestException(`Club ${clubId} not found`);
    await this.prisma.club.update({ where: { id: clubId }, data: { logo: url } });
  }

  async setCoverImage(clubId: string, url: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new BadRequestException(`Club ${clubId} not found`);
    await this.prisma.club.update({ where: { id: clubId }, data: { coverImage: url } });
  }

  async requestVerification(clubId: string, documentUrl: string) {
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
