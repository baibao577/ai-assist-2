/**
 * Goal Repository
 *
 * Manages CRUD operations for goals table following the existing repository pattern.
 * Uses Drizzle ORM for type-safe queries and singleton export pattern.
 *
 * MVP v4 - Track Progress feature
 */

import { getDatabase } from '../client.js';
import { goals, type Goal, type NewGoal } from '../schema.js';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { DatabaseError } from '@/types/index.js';
import { logger } from '@/core/logger.js';
import crypto from 'crypto';

export class GoalRepository {
  private db = getDatabase(); // Singleton database instance

  /**
   * Create a new goal for a user
   * @param data - Goal data without ID and creation timestamp
   * @returns Created goal with generated ID
   */
  async create(data: Omit<NewGoal, 'id' | 'createdAt'>): Promise<Goal> {
    try {
      const goalData: NewGoal = {
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date(),
      };

      const [goal] = await this.db.insert(goals).values(goalData).returning();

      logger.info(
        { goalId: goal.id, userId: goal.userId, title: goal.title },
        'Goal created successfully'
      );

      return goal;
    } catch (error) {
      logger.error({ error, data }, 'Failed to create goal');
      throw new DatabaseError('create goal', error as Error);
    }
  }

  /**
   * Find a goal by ID
   * @param id - Goal ID
   * @returns Goal if found, null otherwise
   */
  async findById(id: string): Promise<Goal | null> {
    try {
      const result = await this.db.select().from(goals).where(eq(goals.id, id)).limit(1);

      return result[0] || null;
    } catch (error) {
      logger.error({ error, goalId: id }, 'Failed to find goal by ID');
      throw new DatabaseError('find goal', error as Error);
    }
  }

  /**
   * Get all active goals for a user
   * @param userId - User ID
   * @returns Array of active goals sorted by creation date
   */
  async getActiveGoals(userId: string): Promise<Goal[]> {
    try {
      const activeGoals = await this.db
        .select()
        .from(goals)
        .where(and(eq(goals.userId, userId), eq(goals.status, 'active')))
        .orderBy(desc(goals.createdAt));

      logger.debug({ userId, count: activeGoals.length }, 'Retrieved active goals');

      return activeGoals;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get active goals');
      throw new DatabaseError('get active goals', error as Error);
    }
  }

  /**
   * Get all goals for a user (including completed/abandoned)
   * @param userId - User ID
   * @param options - Query options for filtering and pagination
   */
  async getAllGoals(
    userId: string,
    options: {
      status?: string;
      category?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Goal[]> {
    try {
      // Apply filters
      const conditions = [eq(goals.userId, userId)];
      if (options.status) {
        conditions.push(eq(goals.status, options.status));
      }
      if (options.category) {
        conditions.push(eq(goals.category, options.category));
      }

      const result = await this.db
        .select()
        .from(goals)
        .where(and(...conditions))
        .orderBy(desc(goals.createdAt))
        .limit(options.limit || 50)
        .offset(options.offset || 0);

      return result;
    } catch (error) {
      logger.error({ error, userId, options }, 'Failed to get all goals');
      throw new DatabaseError('get all goals', error as Error);
    }
  }

  /**
   * Update goal progress value
   * @param goalId - Goal ID
   * @param value - New progress value
   * @returns Updated goal
   */
  async updateProgress(goalId: string, value: number): Promise<Goal> {
    try {
      const [updated] = await this.db
        .update(goals)
        .set({
          currentValue: value,
          lastProgressAt: new Date(),
        })
        .where(eq(goals.id, goalId))
        .returning();

      if (!updated) {
        throw new DatabaseError('update goal', new Error('Goal not found'));
      }

      // Check if goal is completed
      if (updated.targetValue && value >= updated.targetValue && updated.status === 'active') {
        return this.completeGoal(goalId);
      }

      logger.info({ goalId, value }, 'Goal progress updated');
      return updated;
    } catch (error) {
      logger.error({ error, goalId, value }, 'Failed to update goal progress');
      throw error instanceof DatabaseError ? error : new DatabaseError('update progress', error as Error);
    }
  }

  /**
   * Update goal details
   * @param id - Goal ID
   * @param updates - Fields to update
   * @returns Updated goal
   */
  async update(id: string, updates: Partial<Omit<Goal, 'id' | 'userId' | 'createdAt'>>): Promise<Goal> {
    try {
      const [updated] = await this.db
        .update(goals)
        .set(updates)
        .where(eq(goals.id, id))
        .returning();

      if (!updated) {
        throw new DatabaseError('update goal', new Error('Goal not found'));
      }

      logger.info({ goalId: id, updates: Object.keys(updates) }, 'Goal updated');
      return updated;
    } catch (error) {
      logger.error({ error, goalId: id, updates }, 'Failed to update goal');
      throw error instanceof DatabaseError ? error : new DatabaseError('update goal', error as Error);
    }
  }

  /**
   * Mark a goal as completed
   * @param id - Goal ID
   * @returns Updated goal with completed status
   */
  async completeGoal(id: string): Promise<Goal> {
    try {
      const [completed] = await this.db
        .update(goals)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(goals.id, id))
        .returning();

      if (!completed) {
        throw new DatabaseError('update goal', new Error('Goal not found'));
      }

      logger.info({ goalId: id }, 'Goal marked as completed');
      return completed;
    } catch (error) {
      logger.error({ error, goalId: id }, 'Failed to complete goal');
      throw error instanceof DatabaseError ? error : new DatabaseError('complete goal', error as Error);
    }
  }

  /**
   * Pause a goal
   * @param id - Goal ID
   * @returns Updated goal with paused status
   */
  async pauseGoal(id: string): Promise<Goal> {
    try {
      const [paused] = await this.db
        .update(goals)
        .set({
          status: 'paused',
        })
        .where(eq(goals.id, id))
        .returning();

      if (!paused) {
        throw new DatabaseError('update goal', new Error('Goal not found'));
      }

      logger.info({ goalId: id }, 'Goal paused');
      return paused;
    } catch (error) {
      logger.error({ error, goalId: id }, 'Failed to pause goal');
      throw error instanceof DatabaseError ? error : new DatabaseError('pause goal', error as Error);
    }
  }

  /**
   * Abandon a goal
   * @param id - Goal ID
   * @returns Updated goal with abandoned status
   */
  async abandonGoal(id: string): Promise<Goal> {
    try {
      const [abandoned] = await this.db
        .update(goals)
        .set({
          status: 'abandoned',
        })
        .where(eq(goals.id, id))
        .returning();

      if (!abandoned) {
        throw new DatabaseError('update goal', new Error('Goal not found'));
      }

      logger.info({ goalId: id }, 'Goal abandoned');
      return abandoned;
    } catch (error) {
      logger.error({ error, goalId: id }, 'Failed to abandon goal');
      throw error instanceof DatabaseError ? error : new DatabaseError('abandon goal', error as Error);
    }
  }

  /**
   * Resume a paused goal
   * @param id - Goal ID
   * @returns Updated goal with active status
   */
  async resumeGoal(id: string): Promise<Goal> {
    try {
      const [resumed] = await this.db
        .update(goals)
        .set({
          status: 'active',
        })
        .where(eq(goals.id, id))
        .returning();

      if (!resumed) {
        throw new DatabaseError('update goal', new Error('Goal not found'));
      }

      logger.info({ goalId: id }, 'Goal resumed');
      return resumed;
    } catch (error) {
      logger.error({ error, goalId: id }, 'Failed to resume goal');
      throw error instanceof DatabaseError ? error : new DatabaseError('resume goal', error as Error);
    }
  }

  /**
   * Delete a goal and all its associated data
   * @param id - Goal ID
   */
  async delete(id: string): Promise<void> {
    try {
      await this.db.delete(goals).where(eq(goals.id, id));
      logger.info({ goalId: id }, 'Goal deleted');
    } catch (error) {
      logger.error({ error, goalId: id }, 'Failed to delete goal');
      throw new DatabaseError('delete goal', error as Error);
    }
  }

  /**
   * Get goals by category
   * @param userId - User ID
   * @param category - Goal category
   * @returns Goals in the specified category
   */
  async getGoalsByCategory(userId: string, category: string): Promise<Goal[]> {
    try {
      const categoryGoals = await this.db
        .select()
        .from(goals)
        .where(and(eq(goals.userId, userId), eq(goals.category, category)))
        .orderBy(desc(goals.createdAt));

      return categoryGoals;
    } catch (error) {
      logger.error({ error, userId, category }, 'Failed to get goals by category');
      throw new DatabaseError('get goals by category', error as Error);
    }
  }

  /**
   * Get goals that are due soon
   * @param userId - User ID
   * @param daysAhead - Number of days to look ahead
   * @returns Goals with target dates within the specified range
   */
  async getUpcomingGoals(userId: string, daysAhead: number = 7): Promise<Goal[]> {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      const upcomingGoals = await this.db
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.userId, userId),
            eq(goals.status, 'active'),
            sql`${goals.targetDate} IS NOT NULL`,
            sql`${goals.targetDate} <= ${futureDate.getTime()}`
          )
        )
        .orderBy(asc(goals.targetDate));

      return upcomingGoals;
    } catch (error) {
      logger.error({ error, userId, daysAhead }, 'Failed to get upcoming goals');
      throw new DatabaseError('get upcoming goals', error as Error);
    }
  }
}

// Singleton export following existing pattern
export const goalRepository = new GoalRepository();