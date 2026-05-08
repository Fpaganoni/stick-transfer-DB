import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Injectable()
export class ClubsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.club.findMany({
      include: {
        teams: true,
        admin: true,
      },
    });
  }

  async findById(id: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
      include: {
        admin: true,
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
   * Returns a flat view pairing each Club with its CLUB_ADMIN user.
   * Clubs without an admin are still included (adminId / admin fields will be null).
   */
  async getClubAdmins() {
    const clubs = await this.prisma.club.findMany({
      include: { admin: true },
      orderBy: { name: "asc" },
    });

    return clubs.map((club) => ({
      clubId: club.id,
      clubName: club.name,
      clubCity: club.city,
      clubCountry: club.country,
      clubLeague: club.league ?? null,
      clubIsVerified: club.isVerified,
      adminId: club.admin?.id ?? null,
      adminName: club.admin?.name ?? null,
      adminUsername: club.admin?.username ?? null,
      adminAvatar: club.admin?.avatar ?? null,
      adminEmail: club.admin?.email ?? null,
      adminCountry: club.admin?.country ?? null,
      adminCity: club.admin?.city ?? null,
    }));
  }

  async create(data: {
    name: string;
    city: string;
    country: string;
    adminId: string;
    location?: string;
    benefits?: string[];
    instagram?: string;
    twitter?: string;
    facebook?: string;
    tiktok?: string;
  }) {
    // Validate that the adminId corresponds to a CLUB_ADMIN user
    const adminUser = await this.prisma.user.findUnique({
      where: { id: data.adminId },
    });

    if (!adminUser) {
      throw new BadRequestException(`User with id "${data.adminId}" not found.`);
    }

    if (adminUser.role !== "CLUB_ADMIN") {
      throw new BadRequestException(
        `User "${adminUser.name}" must have the CLUB_ADMIN role to create a club. ` +
        `Current role: ${adminUser.role}.`
      );
    }

    return this.prisma.club.create({
      data: {
        name: data.name,
        city: data.city,
        country: data.country,
        adminId: data.adminId,
        benefits: data.benefits || [],
        instagram: data.instagram,
        twitter: data.twitter,
        facebook: data.facebook,
        tiktok: data.tiktok,
      },
      include: {
        admin: true,
      },
    });
  }

  async inviteMember(clubId: string, userId: string, invitedById: string) {
    const existing = await this.prisma.clubMember.findFirst({
      where: { clubId, userId },
    });

    if (existing) {
      throw new Error("User is already a member of this club");
    }

    return this.prisma.clubMember.create({
      data: { clubId, userId, invitedById, status: "PENDING" },
    });
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
      include: { admin: true },
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
