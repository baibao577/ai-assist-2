/**
 * Progress Repository
 *
 * Manages CRUD operations for progress_entries and goal_milestones tables.
 * Handles progress tracking, analytics, and milestone management.
 *
 * MVP v4 - Track Progress feature
 */

import { getDatabase } from '../client.js';
import {
  progressEntries,
  goalMilestones,
  goals,
  type ProgressEntry,
  type NewProgressEntry,
  type GoalMilestone,
  type NewGoalMilestone,
  type Goal,
} from '../schema.js';
import { eq, and, desc, asc, sql, between, gte, lte } from 'drizzle-orm';
import { DatabaseError } from '@/types/index.js';
import { logger } from '@/core/logger.js';
import crypto from 'crypto';

export interface ProgressStats {
  totalEntries: number;
  averageValue: number;
  minValue: number;
  maxValue: number;
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  percentageComplete: number;
}

export class ProgressRepository {
  private db = getDatabase(); // Singleton database instance

  // ============================================================
  // Progress Entry Methods
  // ============================================================

  /**
   * Log a progress entry for a goal
   * @param data - Progress entry data
   * @returns Created progress entry
   */
  async logProgress(data: Omit<NewProgressEntry, 'id' | 'loggedAt'>): Promise<ProgressEntry> {
    try {
      const entryData: NewProgressEntry = {
        id: crypto.randomUUID(),
        ...data,
        loggedAt: new Date(),
      };

      const [entry] = await this.db.insert(progressEntries).values(entryData).returning();

      logger.info(
        { entryId: entry.id, goalId: entry.goalId, value: entry.value },
        'Progress entry logged'
      );

      // Update goal's current value and last progress timestamp
      await this.updateGoalProgress(entry.goalId, entry.value);

      return entry;
    } catch (error) {
      logger.error({ error, data }, 'Failed to log progress');
      throw new DatabaseError('log progress', error as Error);
    }
  }

  /**
   * Get all progress entries for a goal
   * @param goalId - Goal ID
   * @param options - Query options
   * @returns Array of progress entries sorted by date
   */
  async getProgressEntries(
    goalId: string,
    options: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<ProgressEntry[]> {
    try {
      const conditions = [eq(progressEntries.goalId, goalId)];

      // Add date range filters if provided
      if (options.startDate && options.endDate) {
        conditions.push(between(progressEntries.loggedAt, options.startDate, options.endDate));
      } else if (options.startDate) {
        conditions.push(gte(progressEntries.loggedAt, options.startDate));
      } else if (options.endDate) {
        conditions.push(lte(progressEntries.loggedAt, options.endDate));
      }

      const entries = await this.db
        .select()
        .from(progressEntries)
        .where(and(...conditions))
        .orderBy(desc(progressEntries.loggedAt))
        .limit(options.limit || 100)
        .offset(options.offset || 0);

      return entries;
    } catch (error) {
      logger.error({ error, goalId, options }, 'Failed to get progress entries');
      throw new DatabaseError(' get progress entries', error as Error);
    }
  }

  /**
   * Get the latest progress entry for a goal
   * @param goalId - Goal ID
   * @returns Latest progress entry or null
   */
  async getLatestProgress(goalId: string): Promise<ProgressEntry | null> {
    try {
      const result = await this.db
        .select()
        .from(progressEntries)
        .where(eq(progressEntries.goalId, goalId))
        .orderBy(desc(progressEntries.loggedAt))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      logger.error({ error, goalId }, 'Failed to get latest progress');
      throw new DatabaseError(' get latest progress', error as Error);
    }
  }

  /**
   * Update a progress entry
   * @param id - Progress entry ID
   * @param updates - Fields to update
   * @returns Updated progress entry
   */
  async updateProgressEntry(
    id: string,
    updates: Partial<Pick<ProgressEntry, 'value' | 'notes'>>
  ): Promise<ProgressEntry> {
    try {
      const [updated] = await this.db
        .update(progressEntries)
        .set(updates)
        .where(eq(progressEntries.id, id))
        .returning();

      if (!updated) {
        throw new DatabaseError('update progress entry', new Error('Progress entry not found'));
      }

      logger.info({ entryId: id, updates }, 'Progress entry updated');
      return updated;
    } catch (error) {
      logger.error({ error, entryId: id, updates }, 'Failed to update progress entry');
      throw error instanceof DatabaseError ? error : new DatabaseError(' update progress entry', error as Error);
    }
  }

  /**
   * Delete a progress entry
   * @param id - Progress entry ID
   */
  async deleteProgressEntry(id: string): Promise<void> {
    try {
      await this.db.delete(progressEntries).where(eq(progressEntries.id, id));
      logger.info({ entryId: id }, 'Progress entry deleted');
    } catch (error) {
      logger.error({ error, entryId: id }, 'Failed to delete progress entry');
      throw new DatabaseError(' delete progress entry', error as Error);
    }
  }

  // ============================================================
  // Milestone Methods
  // ============================================================

  /**
   * Create a milestone for a goal
   * @param data - Milestone data
   * @returns Created milestone
   */
  async createMilestone(data: Omit<NewGoalMilestone, 'id'>): Promise<GoalMilestone> {
    try {
      const milestoneData: NewGoalMilestone = {
        id: crypto.randomUUID(),
        ...data,
      };

      const [milestone] = await this.db.insert(goalMilestones).values(milestoneData).returning();

      logger.info(
        { milestoneId: milestone.id, goalId: milestone.goalId, title: milestone.title },
        'Milestone created'
      );

      return milestone;
    } catch (error) {
      logger.error({ error, data }, 'Failed to create milestone');
      throw new DatabaseError(' create milestone', error as Error);
    }
  }

  /**
   * Get all milestones for a goal
   * @param goalId - Goal ID
   * @returns Array of milestones sorted by sequence
   */
  async getMilestones(goalId: string): Promise<GoalMilestone[]> {
    try {
      const milestones = await this.db
        .select()
        .from(goalMilestones)
        .where(eq(goalMilestones.goalId, goalId))
        .orderBy(asc(goalMilestones.sequence));

      return milestones;
    } catch (error) {
      logger.error({ error, goalId }, 'Failed to get milestones');
      throw new DatabaseError(' get milestones', error as Error);
    }
  }

  /**
   * Mark a milestone as achieved
   * @param id - Milestone ID
   * @returns Updated milestone
   */
  async achieveMilestone(id: string): Promise<GoalMilestone> {
    try {
      const [achieved] = await this.db
        .update(goalMilestones)
        .set({
          achieved: 1, // 1 = true in SQLite
          achievedAt: new Date(),
        })
        .where(eq(goalMilestones.id, id))
        .returning();

      if (!achieved) {
        throw new DatabaseError('achieve milestone', new Error('Milestone not found'));
      }

      logger.info({ milestoneId: id }, 'Milestone achieved');
      return achieved;
    } catch (error) {
      logger.error({ error, milestoneId: id }, 'Failed to achieve milestone');
      throw error instanceof DatabaseError ? error : new DatabaseError(' achieve milestone', error as Error);
    }
  }

  /**
   * Check and update milestones based on current progress
   * @param goalId - Goal ID
   * @param currentValue - Current progress value
   */
  async checkMilestones(goalId: string, currentValue: number): Promise<GoalMilestone[]> {
    try {
      const milestones = await this.getMilestones(goalId);
      const newlyAchieved: GoalMilestone[] = [];

      for (const milestone of milestones) {
        if (!milestone.achieved && currentValue >= milestone.targetValue) {
          const achieved = await this.achieveMilestone(milestone.id);
          newlyAchieved.push(achieved);
        }
      }

      if (newlyAchieved.length > 0) {
        logger.info(
          { goalId, count: newlyAchieved.length, milestones: newlyAchieved.map(m => m.title) },
          'Milestones achieved'
        );
      }

      return newlyAchieved;
    } catch (error) {
      logger.error({ error, goalId, currentValue }, 'Failed to check milestones');
      throw new DatabaseError(' check milestones', error as Error);
    }
  }

  // ============================================================
  // Analytics Methods
  // ============================================================

  /**
   * Calculate progress statistics for a goal
   * @param goalId - Goal ID
   * @param goal - Goal object (optional, will fetch if not provided)
   * @returns Progress statistics
   */
  async calculateStats(goalId: string, goal?: Goal): Promise<ProgressStats> {
    try {
      // Fetch goal if not provided
      if (!goal) {
        const goalResult = await this.db
          .select()
          .from(goals)
          .where(eq(goals.id, goalId))
          .limit(1);

        if (!goalResult[0]) {
          throw new DatabaseError('calculate stats', new Error('Goal not found'));
        }
        goal = goalResult[0];
      }

      // Get all progress entries
      const entries = await this.getProgressEntries(goalId);

      if (entries.length === 0) {
        return {
          totalEntries: 0,
          averageValue: 0,
          minValue: 0,
          maxValue: 0,
          trend: 'insufficient_data',
          percentageComplete: 0,
        };
      }

      // Calculate basic statistics
      const values = entries.map(e => e.value);
      const totalEntries = entries.length;
      const averageValue = values.reduce((a, b) => a + b, 0) / totalEntries;
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);

      // Calculate trend (compare recent average to older average)
      const trend = this.calculateTrend(entries);

      // Calculate percentage complete
      const percentageComplete = goal.targetValue
        ? Math.min(100, Math.round(((goal.currentValue || 0) / goal.targetValue) * 100))
        : 0;

      return {
        totalEntries,
        averageValue,
        minValue,
        maxValue,
        trend,
        percentageComplete,
      };
    } catch (error) {
      logger.error({ error, goalId }, 'Failed to calculate progress stats');
      throw error instanceof DatabaseError ? error : new DatabaseError(' calculate stats', error as Error);
    }
  }

  /**
   * Calculate trend from progress entries
   * @param entries - Progress entries sorted by date (newest first)
   * @returns Trend direction
   */
  private calculateTrend(entries: ProgressEntry[]): ProgressStats['trend'] {
    if (entries.length < 3) {
      return 'insufficient_data';
    }

    // Split entries into recent and older halves
    const midpoint = Math.floor(entries.length / 2);
    const recentEntries = entries.slice(0, midpoint);
    const olderEntries = entries.slice(midpoint);

    // Calculate averages
    const recentAvg = recentEntries.reduce((sum, e) => sum + e.value, 0) / recentEntries.length;
    const olderAvg = olderEntries.reduce((sum, e) => sum + e.value, 0) / olderEntries.length;

    // Determine trend
    const difference = recentAvg - olderAvg;
    const percentChange = Math.abs(difference / olderAvg) * 100;

    if (percentChange < 5) {
      return 'stable';
    } else if (difference > 0) {
      return 'improving';
    } else {
      return 'declining';
    }
  }

  /**
   * Get progress entries for multiple goals
   * @param goalIds - Array of goal IDs
   * @returns Map of goal ID to progress entries
   */
  async getBulkProgressEntries(goalIds: string[]): Promise<Map<string, ProgressEntry[]>> {
    try {
      const entries = await this.db
        .select()
        .from(progressEntries)
        .where(sql`${progressEntries.goalId} IN ${goalIds}`)
        .orderBy(desc(progressEntries.loggedAt));

      // Group by goal ID
      const entriesByGoal = new Map<string, ProgressEntry[]>();
      for (const entry of entries) {
        const goalEntries = entriesByGoal.get(entry.goalId) || [];
        goalEntries.push(entry);
        entriesByGoal.set(entry.goalId, goalEntries);
      }

      return entriesByGoal;
    } catch (error) {
      logger.error({ error, goalIds }, 'Failed to get bulk progress entries');
      throw new DatabaseError(' get bulk progress entries', error as Error);
    }
  }

  // ============================================================
  // Private Helper Methods
  // ============================================================

  /**
   * Update goal's current value and last progress timestamp
   * @param goalId - Goal ID
   * @param value - New progress value
   */
  private async updateGoalProgress(goalId: string, value: number): Promise<void> {
    try {
      await this.db
        .update(goals)
        .set({
          currentValue: value,
          lastProgressAt: new Date(),
        })
        .where(eq(goals.id, goalId));

      // Check for milestone achievements
      await this.checkMilestones(goalId, value);
    } catch (error) {
      logger.error({ error, goalId, value }, 'Failed to update goal progress');
      // Don't throw here - this is a side effect, not the main operation
    }
  }
}

// Singleton export following existing pattern
export const progressRepository = new ProgressRepository();