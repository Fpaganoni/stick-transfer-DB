import { BadRequestException, Injectable } from "@nestjs/common";
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

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
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
