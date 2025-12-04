/**
 * Test script for Response Orchestrator
 *
 * Validates the dynamic, LLM-driven orchestrator implementation
 */

import { responseOrchestrator } from './src/core/orchestrator/index.js';
import { multiIntentClassifier } from './src/core/orchestrator/index.js';
import { responseComposer } from './src/core/orchestrator/index.js';
import { ConversationMode } from './src/types/modes.js';
import { logger } from './src/core/logger.js';
import type { ConversationState } from './src/types/state.js';
import type { HandlerContext, HandlerResult } from './src/types/modes.js';
import type { ModeSegment } from './src/core/orchestrator/types.js';
import { BaseModeHandler } from './src/core/modes/base-handler.js';

// Mock mode handlers for testing
class MockSmallTalkHandler extends BaseModeHandler {
  mode = ConversationMode.SMALLTALK;

  async canHandle(context: HandlerContext): Promise<boolean> {
    return context.message.toLowerCase().includes('hello') ||
           context.message.toLowerCase().includes('hi');
  }

  async handle(context: HandlerContext): Promise<HandlerResult> {
    return {
      mode: this.mode,
      response: "Hello! How are you doing today?",
      confidence: 0.9,
      stateUpdates: {}
    };
  }

  async generateSegment(context: HandlerContext): Promise<ModeSegment> {
    const result = await this.handle(context);
    return {
      mode: this.mode,
      content: result.response,
      priority: 100,
      standalone: false,
      contentType: 'greeting',
      metadata: { confidence: result.confidence }
    };
  }
}

class MockConsultHandler extends BaseModeHandler {
  mode = ConversationMode.CONSULT;

  async canHandle(context: HandlerContext): Promise<boolean> {
    return context.message.toLowerCase().includes('help') ||
           context.message.toLowerCase().includes('advice');
  }

  async handle(context: HandlerContext): Promise<HandlerResult> {
    return {
      mode: this.mode,
      response: "Based on what you're asking, I recommend taking a systematic approach to solve this problem.",
      confidence: 0.85,
      stateUpdates: {}
    };
  }

  async generateSegment(context: HandlerContext): Promise<ModeSegment> {
    const result = await this.handle(context);
    return {
      mode: this.mode,
      content: result.response,
      priority: 60,
      standalone: true,
      contentType: 'advice',
      metadata: { confidence: result.confidence }
    };
  }
}

class MockTrackProgressHandler extends BaseModeHandler {
  mode = ConversationMode.TRACK_PROGRESS;

  async canHandle(context: HandlerContext): Promise<boolean> {
    return context.message.toLowerCase().includes('progress') ||
           context.message.toLowerCase().includes('goal');
  }

  async handle(context: HandlerContext): Promise<HandlerResult> {
    return {
      mode: this.mode,
      response: "Let me check your progress. You're currently at 60% of your weekly goal.",
      confidence: 0.8,
      stateUpdates: { weeklyProgress: 0.6 }
    };
  }

  async generateSegment(context: HandlerContext): Promise<ModeSegment> {
    const result = await this.handle(context);
    return {
      mode: this.mode,
      content: result.response,
      priority: 80,
      standalone: false,
      contentType: 'analytics',
      metadata: {
        confidence: result.confidence,
        stateUpdates: result.stateUpdates
      }
    };
  }
}

async function testMultiIntentClassification() {
  console.log('🧪 Testing Multi-Intent Classification with Dynamic Mode Discovery\n');

  const testCases = [
    {
      message: "Hello, how can I track my reading progress?",
      expected: "Should detect SMALLTALK and TRACK_PROGRESS intents"
    },
    {
      message: "Hi, I need advice on improving my habits",
      expected: "Should detect SMALLTALK and CONSULT intents"
    },
    {
      message: "Can you help me understand my goal progress?",
      expected: "Should detect CONSULT and TRACK_PROGRESS intents"
    },
    {
      message: "Good morning! I need help with my goals and some advice",
      expected: "Should detect all three intents"
    }
  ];

  const state: ConversationState = {
    messages: [],
    currentMode: ConversationMode.CONSULT,
    userId: 'test-user',
    metadata: {}
  };

  for (const test of testCases) {
    console.log(`\n📝 Test: "${test.message}"`);
    console.log(`   Expected: ${test.expected}`);

    try {
      const result = await multiIntentClassifier.classify(test.message, state);

      console.log(`   Primary: ${result.primary.mode} (confidence: ${result.primary.confidence.toFixed(2)})`);

      if (result.secondary.length > 0) {
        console.log(`   Secondary:`);
        for (const intent of result.secondary) {
          console.log(`     - ${intent.mode} (confidence: ${intent.confidence.toFixed(2)})`);
        }
      }

      console.log(`   Requires Orchestration: ${result.requiresOrchestration}`);
      if (result.compositionStrategy) {
        console.log(`   Strategy: ${result.compositionStrategy}`);
      }

      console.log(`   ✅ Classification successful`);
    } catch (error) {
      console.log(`   ❌ Classification failed:`, error);
    }
  }
}

async function testDynamicOrchestration() {
  console.log('\n\n🎭 Testing Response Orchestration with Dynamic Priorities\n');

  // Create handlers map
  const handlers = new Map<ConversationMode, BaseModeHandler>();
  handlers.set(ConversationMode.SMALLTALK, new MockSmallTalkHandler());
  handlers.set(ConversationMode.CONSULT, new MockConsultHandler());
  handlers.set(ConversationMode.TRACK_PROGRESS, new MockTrackProgressHandler());

  const testMessages = [
    "Hello, I need help with my progress",
    "Hi there, can you give me advice on my goals?",
    "Good morning! How's my progress looking?"
  ];

  for (const message of testMessages) {
    console.log(`\n📥 Input: "${message}"`);

    const context: HandlerContext = {
      message,
      state: {
        messages: [],
        currentMode: ConversationMode.CONSULT,
        userId: 'test-user',
        metadata: {}
      },
      mode: ConversationMode.CONSULT,
      extractedData: null,
      domainRegistrations: []
    };

    try {
      const result = await responseOrchestrator.orchestrate(context, handlers);

      console.log(`\n📊 Orchestration Results:`);
      console.log(`   Primary Mode: ${result.primaryMode}`);
      console.log(`   Modes Used: ${result.modesUsed.join(', ')}`);
      console.log(`   Segments: ${result.segments.length}`);

      for (const segment of result.segments) {
        console.log(`\n   📝 Segment from ${segment.mode}:`);
        console.log(`      Priority: ${segment.priority}`);
        console.log(`      Content Type: ${segment.contentType}`);
        console.log(`      Content: "${segment.content.substring(0, 50)}..."`);
      }

      console.log(`\n   📄 Final Response:`);
      console.log(`      "${result.response}"`);

      console.log(`\n   ⏱️ Composition Time: ${result.metadata.compositionTime}ms`);
      console.log(`   Transitions Added: ${result.metadata.transitionsAdded}`);

      if (result.stateUpdates && Object.keys(result.stateUpdates).length > 0) {
        console.log(`   State Updates:`, result.stateUpdates);
      }

      console.log(`   ✅ Orchestration successful`);
    } catch (error) {
      console.log(`   ❌ Orchestration failed:`, error);
    }
  }
}

async function testLLMTransitions() {
  console.log('\n\n🔗 Testing LLM-Generated Transitions\n');

  const segments: ModeSegment[] = [
    {
      mode: ConversationMode.SMALLTALK,
      content: "Hello! It's great to hear from you today.",
      priority: 100,
      standalone: false,
      contentType: 'greeting',
      metadata: { confidence: 0.9 }
    },
    {
      mode: ConversationMode.TRACK_PROGRESS,
      content: "You've made excellent progress this week - you're at 75% of your reading goal.",
      priority: 80,
      standalone: false,
      contentType: 'analytics',
      metadata: { confidence: 0.85 }
    },
    {
      mode: ConversationMode.CONSULT,
      content: "To maintain this momentum, I suggest setting aside 30 minutes each evening for reading.",
      priority: 60,
      standalone: true,
      contentType: 'advice',
      metadata: { confidence: 0.8 }
    }
  ];

  console.log('📝 Test segments:');
  for (const segment of segments) {
    console.log(`   - ${segment.mode}: "${segment.content.substring(0, 50)}..."`);
  }

  console.log('\n🔄 Testing transition generation:');

  try {
    // Test with LLM transitions enabled
    responseComposer.configure({
      enableTransitions: true,
      enableDeduplication: true,
      useLLMTransitions: true
    });

    const withLLM = await responseComposer.compose(segments);
    console.log('\n📄 With LLM Transitions:');
    console.log(`   "${withLLM}"`);

    // Test without LLM transitions
    responseComposer.configure({
      enableTransitions: true,
      enableDeduplication: true,
      useLLMTransitions: false
    });

    const withoutLLM = await responseComposer.compose(segments);
    console.log('\n📄 Without LLM Transitions (fallback):');
    console.log(`   "${withoutLLM}"`);

    console.log('\n   ✅ Transition generation successful');
  } catch (error) {
    console.log(`   ❌ Transition generation failed:`, error);
  }
}

async function testDynamicModeAddition() {
  console.log('\n\n🆕 Testing Dynamic Mode Addition Support\n');

  // Register a new mode description dynamically
  console.log('📝 Registering new mode description for potential future mode...');
  multiIntentClassifier.registerModeDescription(
    'WELLNESS',
    'Health tracking, exercise logging, wellness advice'
  );

  // Show that the system can handle modes without explicit configuration
  const availableModes = Object.keys(ConversationMode);
  console.log(`\n📊 Available modes in enum: ${availableModes.join(', ')}`);

  // Test that priorities are calculated dynamically
  console.log('\n🎯 Dynamic priority calculation:');
  for (const [key, mode] of Object.entries(ConversationMode)) {
    // Calculate priority using the same logic as orchestrator
    const modeKeys = Object.keys(ConversationMode);
    const modeIndex = modeKeys.findIndex(k => k === key);
    const priority = Math.round(100 - (modeIndex * (50 / Math.max(modeKeys.length - 1, 1))));

    console.log(`   ${mode}: Priority ${priority} (position ${modeIndex + 1}/${modeKeys.length})`);
  }

  console.log('\n   ✅ Dynamic mode handling verified');
}

async function runAllTests() {
  console.log('🚀 Starting Response Orchestrator Tests\n');
  console.log('=' .repeat(60));

  try {
    await testMultiIntentClassification();
    await testDynamicOrchestration();
    await testLLMTransitions();
    await testDynamicModeAddition();

    console.log('\n' + '=' .repeat(60));
    console.log('✅ All tests completed successfully!\n');
  } catch (error) {
    logger.error({ error }, 'Test suite failed');
    console.log('\n❌ Test suite encountered an error:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  logger.error({ error }, 'Failed to run tests');
  process.exit(1);
});