/**
 * Test script for multi-domain pending states
 *
 * Simulates a scenario where both goal and finance domains have pending states
 * to verify that the system can disambiguate user responses correctly
 */

import { agentStateService } from './src/services/agent-state.service.js';
import { GoalExtractor } from './src/domains/goal/extractors/GoalExtractor.js';
import { FinanceExtractor } from './src/domains/finance/extractors/FinanceExtractor.js';
import { logger } from './src/core/logger.js';
import type { ExtractionContext } from './src/core/domains/types.js';
import { conversationRepository } from './src/database/repositories/conversation.repository.js';
import { ConversationStatus } from './src/types/index.js';
import { v4 as uuidv4 } from 'uuid';

async function testMultiDomainPendingStates() {
  const userId = 'test-user-456';

  console.log('🧪 Starting multi-domain pending states test...\n');

  // Create a conversation for testing
  const conversation = await conversationRepository.create({
    id: uuidv4(),
    userId,
    startedAt: new Date(),
    lastActivityAt: new Date(),
    status: ConversationStatus.ACTIVE
  });
  const conversationId = conversation.id;
  console.log(`📋 Created test conversation: ${conversationId}`);

  // 1. Set up pending states for both domains
  console.log('📝 Setting up pending states...');

  // Goal domain pending state
  await agentStateService.saveState(
    conversationId,
    'goal',
    'selection_pending',
    {
      goals: [
        { index: 1, id: 'goal_001', title: 'Read 12 books this year', currentValue: 5, targetValue: 12, unit: 'books' },
        { index: 2, id: 'goal_002', title: 'Exercise 150 minutes per week', currentValue: 60, targetValue: 150, unit: 'minutes' }
      ],
      pendingValue: 3,
      originalMessage: "I've read 3 more books",
      userId
    },
    300
  );
  console.log('  ✅ Goal domain: Pending selection for 2 goals');

  // Finance domain pending state
  await agentStateService.saveState(
    conversationId,
    'finance',
    'account_selection_pending',
    {
      accounts: [
        { index: 1, id: 'acc_checking_001', name: 'Checking Account', balance: 5000 },
        { index: 2, id: 'acc_savings_001', name: 'Savings Account', balance: 10000 },
        { index: 3, id: 'acc_credit_001', name: 'Credit Card', balance: -1500 }
      ],
      pendingAmount: 500,
      pendingDescription: 'Transfer for bills',
      userId
    },
    300
  );
  console.log('  ✅ Finance domain: Pending selection for 3 accounts\n');

  // 2. Create extraction context
  const context: ExtractionContext = {
    recentMessages: [
      { role: 'assistant', content: '📊 **Goal Selection Required**\nWhich goal is this progress for?\n1. Read 12 books this year\n2. Exercise 150 minutes per week' },
      { role: 'assistant', content: '💰 **Account Selection Required**\nWhich account is this transaction for?\n1. Checking Account (Balance: $5000)\n2. Savings Account (Balance: $10000)\n3. Credit Card (Balance: $-1500)' }
    ],
    domainContext: {},
    conversationId,
    userId
  };

  // 3. Test various user responses
  const testResponses = [
    { message: '1', expected: 'ambiguous - could be either domain' },
    { message: '2', expected: 'ambiguous - could be either domain' },
    { message: 'first one', expected: 'ambiguous - could be either domain' },
    { message: 'books', expected: 'goal domain - keyword match' },
    { message: 'checking', expected: 'finance domain - keyword match' },
    { message: 'the reading goal', expected: 'goal domain - description match' },
    { message: 'my savings account', expected: 'finance domain - description match' },
  ];

  console.log('🔍 Testing user responses with both domains having pending states:\n');

  const goalExtractor = new GoalExtractor();
  const financeExtractor = new FinanceExtractor();

  for (const test of testResponses) {
    console.log(`\n📥 User response: "${test.message}"`);
    console.log(`   Expected: ${test.expected}`);

    // Test goal extractor
    const goalResult = await goalExtractor.extract(test.message, context);
    if (goalResult) {
      console.log(`   ✓ Goal domain extracted: action=${goalResult.data.action}, confidence=${goalResult.confidence}`);
    } else {
      console.log(`   - Goal domain: no extraction`);
    }

    // Test finance extractor
    const financeResult = await financeExtractor.extract(test.message, context);
    if (financeResult) {
      console.log(`   ✓ Finance domain extracted: confidence=${financeResult.confidence}`);
    } else {
      console.log(`   - Finance domain: no extraction`);
    }

    // Analysis
    if (goalResult && financeResult) {
      console.log(`   ⚠️  CONFLICT: Both domains extracted data!`);
      console.log(`      Resolution: Use highest confidence (Goal: ${goalResult.confidence} vs Finance: ${financeResult.confidence})`);
    } else if (!goalResult && !financeResult) {
      console.log(`   ℹ️  Neither domain extracted - response may be for a different purpose`);
    }
  }

  // 4. Clean up
  console.log('\n\n🧹 Cleaning up test states...');
  await agentStateService.resolveState(conversationId, 'goal', 'selection_pending');
  await agentStateService.resolveState(conversationId, 'finance', 'account_selection_pending');
  console.log('✅ Test complete!\n');
}

// Run the test
testMultiDomainPendingStates().catch(error => {
  logger.error({ error }, 'Test failed');
  process.exit(1);
});