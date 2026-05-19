/**
 * E2E flow: Create job opportunity → Apply → View candidates
 *
 * Uses mocked PrismaService to avoid requiring a live DB in CI.
 * Swap mocks for a real test DB to run as true integration tests.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JobsService } from '../src/jobs/jobs.service';
import { PrismaService } from '../src/prisma.service';

const mockClub = { id: 'club-1', name: 'HC Barcelona', city: 'Barcelona', country: 'Spain' };
const mockUser = { id: 'user-1', name: 'Lucas Pérez', email: 'lucas@test.com', role: 'PLAYER' };

const mockPrisma = {
  jobOpportunity: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  jobApplication: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

describe('Jobs E2E Flow', () => {
  let jobsService: JobsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    jobsService = module.get<JobsService>(JobsService);
    jest.clearAllMocks();
  });

  // ── Step 1: Club creates a job opportunity ──────────────────────────────────
  describe('Step 1 — Create job opportunity', () => {
    it('should create a job opportunity with required fields', async () => {
      const jobInput = {
        title: 'Forward Player Wanted',
        description: 'Looking for an experienced forward for our first division team.',
        positionType: 'PLAYER',
        clubId: mockClub.id,
        country: 'Spain',
        city: 'Barcelona',
        salary: 2500,
        currency: 'EUR',
        benefits: 'Housing, travel allowance',
      };

      const createdJob = {
        id: 'job-1',
        ...jobInput,
        status: 'OPEN',
        level: 'PROFESSIONAL',
        club: mockClub,
        createdAt: new Date(),
      };

      mockPrisma.jobOpportunity.create.mockResolvedValue(createdJob);

      const result = await jobsService.create(jobInput);

      expect(mockPrisma.jobOpportunity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Forward Player Wanted',
            clubId: 'club-1',
            country: 'Spain',
          }),
          include: { club: true },
        }),
      );
      expect(result.id).toBe('job-1');
      expect(result.status).toBe('OPEN');
    });
  });

  // ── Step 2: Player applies to the job ──────────────────────────────────────
  describe('Step 2 — Player applies for job', () => {
    it('should submit a job application with cover letter', async () => {
      const applicationInput = {
        jobOpportunityId: 'job-1',
        userId: mockUser.id,
        coverLetter: 'I am a passionate forward with 8 years of professional experience.',
        resumeUrl: 'https://cdn.example.com/cv/lucas-perez.pdf',
      };

      const createdApplication = {
        id: 'app-1',
        ...applicationInput,
        status: 'PENDING',
        appliedAt: new Date(),
        user: mockUser,
        jobOpportunity: { id: 'job-1', title: 'Forward Player Wanted', club: mockClub },
      };

      mockPrisma.jobApplication.create.mockResolvedValue(createdApplication);

      const result = await jobsService.applyForJob(applicationInput);

      expect(mockPrisma.jobApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            jobOpportunityId: 'job-1',
            userId: 'user-1',
            coverLetter: expect.stringContaining('passionate forward'),
          }),
        }),
      );
      expect(result.status).toBe('PENDING');
      expect(result.user.id).toBe('user-1');
    });

    it('should reject duplicate applications (P2002)', async () => {
      mockPrisma.jobApplication.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        jobsService.applyForJob({ jobOpportunityId: 'job-1', userId: 'user-1' }),
      ).rejects.toThrow('You have already applied for this job');
    });
  });

  // ── Step 3: Club admin views candidates ────────────────────────────────────
  describe('Step 3 — View candidates for job', () => {
    it('should return all applications for a job', async () => {
      const applications = [
        {
          id: 'app-1',
          jobOpportunityId: 'job-1',
          userId: 'user-1',
          status: 'PENDING',
          user: mockUser,
        },
        {
          id: 'app-2',
          jobOpportunityId: 'job-1',
          userId: 'user-2',
          status: 'PENDING',
          user: { id: 'user-2', name: 'Ana García' },
        },
      ];

      mockPrisma.jobApplication.findMany.mockResolvedValue(applications);

      const result = await jobsService.getApplications('job-1');

      expect(mockPrisma.jobApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobOpportunityId: 'job-1', status: undefined },
          include: { user: true },
          orderBy: { appliedAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('should filter candidates by status', async () => {
      mockPrisma.jobApplication.findMany.mockResolvedValue([]);

      await jobsService.getApplications('job-1', 'PENDING');

      expect(mockPrisma.jobApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobOpportunityId: 'job-1', status: 'PENDING' },
        }),
      );
    });
  });

  // ── Step 4: Club admin reviews and accepts application ─────────────────────
  describe('Step 4 — Review application', () => {
    it('should accept an application and record reviewer info', async () => {
      const updatedApp = {
        id: 'app-1',
        status: 'ACCEPTED',
        reviewedAt: new Date(),
        reviewedBy: 'admin-1',
        notes: 'Excellent profile, strong match.',
      };

      mockPrisma.jobApplication.update.mockResolvedValue(updatedApp);

      const result = await jobsService.updateApplicationStatus(
        'app-1',
        'ACCEPTED',
        'admin-1',
        'Excellent profile, strong match.',
      );

      const callData = mockPrisma.jobApplication.update.mock.calls[0][0].data;
      expect(callData.status).toBe('ACCEPTED');
      expect(callData.reviewedAt).toBeInstanceOf(Date);
      expect(callData.reviewedBy).toBe('admin-1');
      expect(result.status).toBe('ACCEPTED');
    });
  });

  // ── Step 5: Player withdraws application ───────────────────────────────────
  describe('Step 5 — Withdraw application', () => {
    it('should allow the owner to withdraw their application', async () => {
      mockPrisma.jobApplication.findFirst.mockResolvedValue({ id: 'app-1', userId: 'user-1' });
      mockPrisma.jobApplication.update.mockResolvedValue({ id: 'app-1', status: 'WITHDRAWN' });

      await jobsService.withdrawApplication('app-1', 'user-1');

      expect(mockPrisma.jobApplication.update).toHaveBeenCalledWith({
        where: { id: 'app-1' },
        data: { status: 'WITHDRAWN' },
      });
    });

    it('should prevent unauthorized withdrawal', async () => {
      mockPrisma.jobApplication.findFirst.mockResolvedValue(null);

      await expect(
        jobsService.withdrawApplication('app-1', 'attacker-user'),
      ).rejects.toThrow('Application not found or not authorized');

      expect(mockPrisma.jobApplication.update).not.toHaveBeenCalled();
    });
  });
});
