import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Injectable()
export class StoriesService {
  constructor(private prisma: PrismaService) {}

  // Get active stories from users that the current user follows
  async getActiveStoriesFromFollowing(userId: string) {
    // Get users that the current user is following
    const following = await this.prisma.follow.findMany({
      where: {
        followerType: "USER",
        followerId: userId,
        followingType: "USER",
      },
      select: {
        followingId: true,
      },
    });

    const followingIds = following.map((f) => f.followingId);

    // Get active stories (not expired) from followed users
    const now = new Date();
    const stories = await this.prisma.story.findMany({
      where: {
        userId: {
          in: followingIds,
        },
        expiresAt: {
          gte: now,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
          },
        },
        views: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return stories;
  }

  // Get all active stories from a specific user
  async getUserStories(userId: string) {
    const now = new Date();
    const stories = await this.prisma.story.findMany({
      where: {
        userId,
        expiresAt: {
          gte: now,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
          },
        },
        views: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return stories;
  }

  // Create a new story
  async createStory(data: {
    userId: string;
    imageUrl?: string;
    videoUrl?: string;
    text?: string;
  }) {
    // Calculate expiration time (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const story = await this.prisma.story.create({
      data: {
        userId: data.userId,
        imageUrl: data.imageUrl,
        videoUrl: data.videoUrl,
        text: data.text,
        expiresAt,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
          },
        },
        views: true,
      },
    });

    return story;
  }

  // Mark a story as viewed by a user
  async viewStory(storyId: string, userId: string) {
    const includeUser = {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
        },
      },
    };

    try {
      return await this.prisma.storyView.create({
        data: { storyId, userId },
        include: includeUser,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        return this.prisma.storyView.findUnique({
          where: { storyId_userId: { storyId, userId } },
          include: includeUser,
        });
      }
      throw error;
    }
  }

  // Get viewers of a story
  async getStoryViewers(storyId: string) {
    const views = await this.prisma.storyView.findMany({
      where: {
        storyId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        viewedAt: "desc",
      },
    });

    return views;
  }

  // Get views count for a story
  async getViewsCount(storyId: string): Promise<number> {
    return this.prisma.storyView.count({
      where: {
        storyId,
      },
    });
  }

  // Check if a user has viewed a story
  async hasUserViewedStory(storyId: string, userId: string): Promise<boolean> {
    const view = await this.prisma.storyView.findUnique({
      where: {
        storyId_userId: {
          storyId,
          userId,
        },
      },
    });

    return !!view;
  }

  // Delete a story
  async deleteStory(id: string): Promise<boolean> {
    await this.prisma.story.delete({
      where: { id },
    });
    return true;
  }

  // Get story by ID
  async getStoryById(id: string) {
    return this.prisma.story.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
          },
        },
        views: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
      },
    });
  }
}
