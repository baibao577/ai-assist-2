// Core type definitions for AI Assistant
// MVP v1: Simplified types for basic message processing

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum ConversationStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  tokensUsed?: number;
  processingTimeMs?: number;
  model?: string;
}

export interface Conversation {
  id: string;
  userId: string;
  startedAt: Date;
  lastActivityAt: Date;
  status: ConversationStatus;
  metadata?: Record<string, unknown>;
}

// Pipeline types
export interface PipelineContext {
  conversationId?: string; // Optional - pipeline will find or create
  userId: string;
  message: string;
  timestamp: Date;
  forceNewConversation?: boolean; // If true, ignore existing active conversations and create new
}

export interface PipelineResult {
  response: string;
  processingTime: number;
  messageId: string;
  conversationId: string;
}

// Database DTOs
export interface CreateConversationDto {
  id: string;
  userId: string;
  startedAt: Date;
  lastActivityAt: Date;
  status: ConversationStatus;
}

export interface CreateMessageDto {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}

// Configuration types
export interface AppConfig {
  openai: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
  };
  database: {
    path: string;
  };
  logging: {
    level: string;
    filePath: string;
  };
  context: {
    messageLimit: number;
  };
}

// Error types
export class PipelineError extends Error {
  constructor(
    public stage: string,
    public originalError: Error,
    public context?: unknown
  ) {
    super(`Pipeline error at stage ${stage}: ${originalError.message}`);
    this.name = 'PipelineError';
  }
}

export class DatabaseError extends Error {
  constructor(
    public operation: string,
    public originalError: Error
  ) {
    super(`Database error during ${operation}: ${originalError.message}`);
    this.name = 'DatabaseError';
  }
}

// Re-export mode, state, and classifier types
export * from './modes.js';
export * from './state.js';
export * from './classifiers.js';
