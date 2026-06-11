import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

export interface ExploreFilters {
  role?: string;
  country?: string;
  position?: string;
  level?: string;
  league?: string;
  /** Generic search across name, username, city, bio */
  search?: string;
  /** Focused search across name and username only */
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ExploreService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get filtered users for explore page
   * Returns active users with role filtering, search, and pagination
   */
  async getExploreUsers(filters: ExploreFilters) {
    const {
      role,
      country,
      position,
      level,
      search,
      searchQuery,
      limit = 50,
      offset = 0,
    } = filters;

    const where: any = {
      isActive: true, // Only show active users
    };

    // Role filter — normalize to uppercase, validate against allowed enum values
    if (role) {
      const normalizedRole = role.toUpperCase();
      if (!["PLAYER", "COACH", "CLUB"].includes(normalizedRole)) {
        throw new Error("Invalid role. Allowed: PLAYER, COACH, CLUB");
      }
      where.role = normalizedRole;
    } else {
      // No role filter provided — explore page only shows players and coaches
      where.role = { in: ["PLAYER", "COACH"] };
    }

    // Country filter (exact match — 2-letter ISO code e.g. 'AR', 'US')
    if (country) {
      where.country = country;
    }

    // Position filter (free-text, case-insensitive partial match)
    if (position) {
      where.position = { contains: position, mode: "insensitive" };
    }

    // Level filter — `level` is computed, not stored. Map to yearsOfExperience:
    // AMATEUR  → yearsOfExperience < 5 (or null)
    // PROFESSIONAL → yearsOfExperience >= 5
    if (level) {
      const normalizedLevel = level.toUpperCase();
      if (!["PROFESSIONAL", "AMATEUR"].includes(normalizedLevel)) {
        throw new Error("Invalid level. Allowed: PROFESSIONAL, AMATEUR");
      }
      if (normalizedLevel === "PROFESSIONAL") {
        where.yearsOfExperience = { gte: 5 };
      } else {
        // AMATEUR: null or < 5 years — use AND to not collide with search OR clause
        where.AND = [
          ...(where.AND ?? []),
          {
            OR: [
              { yearsOfExperience: null },
              { yearsOfExperience: { lt: 5 } },
            ],
          },
        ];
      }
    }

    // searchQuery: targeted search on name and username only (from Explore search bar)
    if (searchQuery) {
      where.OR = [
        { name: { contains: searchQuery, mode: "insensitive" } },
        { username: { contains: searchQuery, mode: "insensitive" } },
      ];
    } else if (search) {
      // Legacy broader search: name, username, city, bio
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { bio: { contains: search, mode: "insensitive" } },
      ];
    }

    return this.prisma.user.findMany({
      where,
      orderBy: [
        { isVerified: "desc" }, // Verified users first
        { createdAt: "desc" }, // Then newest first
      ],
      take: limit,
      skip: offset,
      include: {
        club: true, // Include current club info
      },
    });
  }

  /**
   * Get filtered clubs for explore page
   * Returns clubs with league/country filtering and search
   */
  async getExploreClubs(filters: ExploreFilters) {
    const { country, league, search, limit = 50, offset = 0 } = filters;

    const where: any = {};

    // Country filter
    if (country) {
      where.country = country;
    }

    // League filter
    if (league) {
      where.league = league;
    }

    // Search filter (searches name, city, description, bio)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { bio: { contains: search, mode: "insensitive" } },
      ];
    }

    return this.prisma.club.findMany({
      where,
      orderBy: [
        { isVerified: "desc" }, // Verified clubs first
        { createdAt: "desc" }, // Then newest first
      ],
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get all available positions (for filter dropdown)
   */
  async getAvailablePositions() {
    const positions = await this.prisma.user.findMany({
      where: {
        position: { not: null },
        isActive: true,
      },
      select: {
        position: true,
      },
      distinct: ["position"],
    });

    return positions
      .map((p) => p.position)
      .filter((p) => p !== null)
      .sort();
  }

  /**
   * Get all available leagues (for filter dropdown)
   */
  async getAvailableLeagues() {
    const leagues = await this.prisma.club.findMany({
      where: {
        league: { not: null },
      },
      select: {
        league: true,
      },
      distinct: ["league"],
    });

    return leagues
      .map((l) => l.league)
      .filter((l) => l !== null)
      .sort();
  }

  /**
   * Get all available countries (for filter dropdown)
   */
  async getAvailableCountries() {
    // Get countries from both users and clubs
    const userCountries = await this.prisma.user.findMany({
      where: {
        country: { not: null },
        isActive: true,
      },
      select: {
        country: true,
      },
      distinct: ["country"],
    });

    const clubCountries = await this.prisma.club.findMany({
      where: {
        country: { not: null },
      },
      select: {
        country: true,
      },
      distinct: ["country"],
    });

    const allCountries = new Set([
      ...userCountries.map((c) => c.country),
      ...clubCountries.map((c) => c.country),
    ]);

    return Array.from(allCountries)
      .filter((c) => c !== null)
      .sort();
  }
}
