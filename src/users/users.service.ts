import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import * as bcrypt from "bcrypt";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createUser(data: {
    email: string;
    name: string; // REQUIRED
    username?: string;
    password?: string;
    role?: string;
    country?: string;
    city?: string;
    position?: string;
    dateOfBirth?: string;
  }) {
    const hashed = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;
    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        username: data.username,
        password: hashed,
        role: data.role as any,
        country: data.country,
        city: data.city,
        position: data.position as any,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      },
    });
  }

  /** Throws unless the user has an ACTIVE membership in the given club. */
  async assertActiveClubMember(userId: string, clubId: string) {
    const membership = await this.prisma.clubMember.findFirst({
      where: { userId, clubId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException(
        "You can only set a club you are an active member of",
      );
    }
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** `email` must already be normalized (lowercase, trimmed). */
  async isEmailTaken(email: string): Promise<boolean> {
    const found = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return !!found;
  }

  /** Case-insensitive so it also catches legacy mixed-case usernames. */
  async isUsernameTaken(username: string): Promise<boolean> {
    const found = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { id: true },
    });
    return !!found;
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async setAvatar(userId: string, url: string) {
    // Update directly on User now (no more Profile table)
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: url },
    });
  }

  async setCoverImage(userId: string, url: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { coverImage: url },
    });
  }

  async setCv(userId: string, url: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { cvUrl: url },
    });
  }

  async deleteCv(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { cvUrl: null },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async findByRole(role: string) {
    return this.prisma.user.findMany({
      where: { role: role as any },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async updateUser(
    id: string,
    data: {
      name?: string;
      bio?: string;
      avatar?: string;
      coverImage?: string;
      coverImagePosition?: string;
      position?: string;
      country?: string;
      city?: string;
      clubId?: string;
      yearsOfExperience?: number;
      cvUrl?: string;
      multimedia?: string[];
      username?: string;
      dateOfBirth?: string;
      level?: string;
      trajectories?: any[];
      licenseLevel?: string;
      certifyingBody?: string;
      licenseNumber?: string;
      certificationYear?: number;
      matchesOfficiated?: number;
      travelAvailability?: string;
      languages?: string[];
      modalities?: string[];
      umpireCategories?: string[];
      umpireCertifications?: any[];
    },
  ) {
    const {
      trajectories,
      dateOfBirth,
      level,
      licenseLevel,
      travelAvailability,
      modalities,
      umpireCategories,
      umpireCertifications,
      ...userUpdateData
    } = data;

    const { certifyingBody, licenseNumber } = userUpdateData;

    // Mirror the DB CHECK constraints so clients get a clear 400, not a masked 500
    if (userUpdateData.yearsOfExperience != null && userUpdateData.yearsOfExperience < 0) {
      throw new BadRequestException("yearsOfExperience cannot be negative");
    }
    if (userUpdateData.matchesOfficiated != null && userUpdateData.matchesOfficiated < 0) {
      throw new BadRequestException("matchesOfficiated cannot be negative");
    }
    const certYear = userUpdateData.certificationYear;
    if (certYear != null && (certYear < 1950 || certYear > 2100)) {
      throw new BadRequestException("certificationYear must be between 1950 and 2100");
    }
    for (const t of trajectories ?? []) {
      if (t.startDate && t.endDate && new Date(t.endDate) < new Date(t.startDate)) {
        throw new BadRequestException("A trajectory cannot end before it starts");
      }
    }

    const hasUmpireData = [
      licenseLevel,
      certifyingBody,
      licenseNumber,
      userUpdateData.certificationYear,
      userUpdateData.matchesOfficiated,
      travelAvailability,
      userUpdateData.languages,
      modalities,
      umpireCategories,
      umpireCertifications,
    ].some((v) => v !== undefined);

    // License identity changed -> verification must be redone by an admin
    let resetVerification = false;
    if (hasUmpireData) {
      const existing = await this.prisma.user.findUnique({
        where: { id },
        select: {
          role: true,
          isVerified: true,
          licenseLevel: true,
          certifyingBody: true,
          licenseNumber: true,
        },
      });
      if (!existing) throw new BadRequestException("User not found");
      if (existing.role !== "UMPIRE") {
        throw new BadRequestException(
          "Umpire fields are only available for the UMPIRE role",
        );
      }
      resetVerification =
        existing.isVerified &&
        ((licenseLevel !== undefined && licenseLevel !== existing.licenseLevel) ||
          (certifyingBody !== undefined &&
            certifyingBody !== existing.certifyingBody) ||
          (licenseNumber !== undefined &&
            licenseNumber !== existing.licenseNumber));
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...userUpdateData,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        level: level as any,
        licenseLevel: licenseLevel as any,
        travelAvailability: travelAvailability as any,
        modalities: modalities as any,
        umpireCategories: umpireCategories as any,
        ...(resetVerification ? { isVerified: false } : {}),
      },
    });

    if (umpireCertifications) {
      // Full replacement, same strategy as trajectories
      await this.prisma.umpireCertification.deleteMany({ where: { userId: id } });
      if (umpireCertifications.length > 0) {
        await this.prisma.umpireCertification.createMany({
          data: umpireCertifications.map((c, i) => ({
            userId: id,
            name: c.name,
            issuer: c.issuer,
            issuedAt: c.issuedAt ? new Date(c.issuedAt) : null,
            fileUrl: c.fileUrl || null,
            order: c.order ?? i,
          })),
        });
      }
    }

    if (trajectories) {
      // Logic to sync trajectories: Full replacement for profile sync
      await this.prisma.trajectory.deleteMany({ where: { userId: id } });
      if (trajectories.length > 0) {
        await this.prisma.trajectory.createMany({
          data: trajectories.map((t) => ({
            clubId: t.clubId || null,
            title: t.title,
            organization: t.organization,
            period: t.period,
            description: t.description || null,
            startDate: t.startDate ? new Date(t.startDate) : null,
            endDate: t.endDate ? new Date(t.endDate) : null,
            isCurrent: t.isCurrent || false,
            order: t.order || 0,
            userId: id,
          })),
        });
      }
    }

    return updatedUser;
  }
}
