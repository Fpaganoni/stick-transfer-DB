import { Injectable } from "@nestjs/common";
import { JobsService } from "./jobs.service";

import { BatchLoader, createBatchLoader } from "../common/batch-loader";

// Re-exported so existing imports (and the loaders spec) keep working.
export { createBatchLoader };
export type { BatchLoader };

export interface CurrentUserJobLoaders {
  isSaved: BatchLoader<string, boolean>;
  hasApplied: BatchLoader<string, boolean>;
}

/**
 * Per-request loaders for the `*ByCurrentUser` fields of JobOpportunity.
 * Loaders live in a WeakMap keyed by the GraphQL context object (one per
 * request) and then by userId, so nothing is cached across requests or users.
 */
@Injectable()
export class JobsLoaders {
  private readonly byContext = new WeakMap<object, Map<string, CurrentUserJobLoaders>>();

  constructor(private readonly jobsService: JobsService) {}

  forContext(context: object, userId: string): CurrentUserJobLoaders {
    if (typeof context !== "object" || context === null) {
      return this.build(userId);
    }
    const perUser = this.byContext.get(context) ?? new Map<string, CurrentUserJobLoaders>();
    this.byContext.set(context, perUser);

    const existing = perUser.get(userId);
    if (existing) return existing;

    const loaders = this.build(userId);
    perUser.set(userId, loaders);
    return loaders;
  }

  /**
   * Drops the request's cached answers. Mutations that change saved/applied
   * state call this so later fields of the same operation (mutations run in
   * sequence) do not read pre-mutation values.
   */
  reset(context: object): void {
    if (typeof context === "object" && context !== null) {
      this.byContext.delete(context);
    }
  }

  private build(userId: string): CurrentUserJobLoaders {
    return {
      isSaved: createBatchLoader(async (jobIds: string[]) => {
        const saved = await this.jobsService.findSavedJobIds(userId, jobIds);
        return jobIds.map((id) => saved.has(id));
      }),
      hasApplied: createBatchLoader(async (jobIds: string[]) => {
        const applied = await this.jobsService.findAppliedJobIds(userId, jobIds);
        return jobIds.map((id) => applied.has(id));
      }),
    };
  }
}
