# Mode Handlers Implementation Plan

## Overview
Mode handlers process messages based on classification results, each implementing specific conversation behaviors.

## Base Handler Architecture

### 1. Handler Interface
```typescript
interface IModeHandler {
  mode: ConversationMode;
  priority: number;

  canHandle(classification: ParallelClassificationResult): boolean;
  handle(context: HandlerContext): Promise<HandlerResult>;
  validateTransition(from: ConversationMode, to: ConversationMode): boolean;
}

abstract class BaseModeHandler implements IModeHandler {
  protected llmService: LLMService;
  protected flowService: FlowService;
  protected stateService: StateService;

  abstract get mode(): ConversationMode;
  abstract get priority(): number;

  abstract canHandle(classification: ParallelClassificationResult): boolean;
  abstract handle(context: HandlerContext): Promise<HandlerResult>;

  protected async generateResponse(
    prompt: string,
    context: any
  ): Promise<string> {
    // Common response generation logic
  }

  protected async updateState(
    state: ConversationState,
    updates: Partial<ConversationState>
  ): Promise<ConversationState> {
    // State update with validation
  }
}
```

## Individual Mode Handlers

### 1. Consult Mode Handler
**Purpose**: Handle advice-seeking and problem-solving conversations

```typescript
class ConsultModeHandler extends BaseModeHandler {
  mode = ConversationMode.CONSULT;
  priority = 1;

  canHandle(classification: ParallelClassificationResult): boolean {
    const intent = classification.intent.primaryClass;
    return [
      'seek_advice',
      'share_problem',
      'ask_question',
      'crisis_support'
    ].includes(intent);
  }

  async handle(context: HandlerContext): Promise<HandlerResult> {
    // Check for crisis first
    if (this.isCrisis(context.classification.safety)) {
      return this.handleCrisis(context);
    }

    // Determine consultation type
    const consultType = this.determineConsultType(context);

    // Generate appropriate response
    const response = await this.generateConsultResponse(
      consultType,
      context
    );

    // Check if flow should be initiated
    const flow = this.shouldStartFlow(consultType, context);

    return {
      response,
      updatedState: {
        mode: ConversationMode.CONSULT,
        context: {
          ...context.state.context,
          consultationType: consultType
        }
      },
      startFlow: flow?.type,
      sideEffects: this.generateSideEffects(consultType)
    };
  }

  private determineConsultType(
    context: HandlerContext
  ): ConsultationType {
    // Analyze topic and intent
    // Return specific consultation type
  }

  private async generateConsultResponse(
    type: ConsultationType,
    context: HandlerContext
  ): Promise<string> {
    const prompts = {
      emotional_support: EMOTIONAL_SUPPORT_PROMPT,
      problem_solving: PROBLEM_SOLVING_PROMPT,
      information_seeking: INFORMATION_PROMPT,
      decision_making: DECISION_MAKING_PROMPT
    };

    return this.llmService.generate(
      prompts[type],
      {
        message: context.message.content,
        history: context.state.context.recentMessages,
        userGoals: context.state.context.userGoals
      }
    );
  }

  private handleCrisis(
    context: HandlerContext
  ): Promise<HandlerResult> {
    // Immediate safety response
    // Provide resources
    // Log for human review
    // Trigger notifications
  }
}

enum ConsultationType {
  EMOTIONAL_SUPPORT = 'emotional_support',
  PROBLEM_SOLVING = 'problem_solving',
  INFORMATION_SEEKING = 'information_seeking',
  DECISION_MAKING = 'decision_making',
  CRISIS_SUPPORT = 'crisis_support'
}
```

### 2. Commerce Mode Handler
**Purpose**: Handle shopping and transaction conversations

```typescript
class CommerceModeHandler extends BaseModeHandler {
  mode = ConversationMode.COMMERCE;
  priority = 2;

  private catalogService: CatalogService;
  private cartService: CartService;
  private orderService: OrderService;

  canHandle(classification: ParallelClassificationResult): boolean {
    const intent = classification.intent.primaryClass;
    return [
      'browse_products',
      'make_purchase',
      'check_order',
      'product_inquiry',
      'add_to_cart'
    ].includes(intent);
  }

  async handle(context: HandlerContext): Promise<HandlerResult> {
    const commerceAction = this.extractCommerceAction(context);

    switch (commerceAction.type) {
      case 'browse':
        return this.handleBrowse(commerceAction, context);
      case 'search':
        return this.handleSearch(commerceAction, context);
      case 'add_cart':
        return this.handleAddToCart(commerceAction, context);
      case 'checkout':
        return this.handleCheckout(commerceAction, context);
      case 'order_status':
        return this.handleOrderStatus(commerceAction, context);
      default:
        return this.handleGeneralCommerce(context);
    }
  }

  private async handleBrowse(
    action: CommerceAction,
    context: HandlerContext
  ): Promise<HandlerResult> {
    const products = await this.catalogService.getProducts(
      action.category,
      action.filters
    );

    const response = this.formatProductList(products);

    return {
      response,
      updatedState: {
        mode: ConversationMode.COMMERCE,
        context: {
          ...context.state.context,
          browsingCategory: action.category,
          viewedProducts: products.map(p => p.id)
        }
      }
    };
  }

  private async handleCheckout(
    action: CommerceAction,
    context: HandlerContext
  ): Promise<HandlerResult> {
    // Start checkout flow
    return {
      response: "Let's proceed with checkout. First, I need to confirm your items...",
      startFlow: FlowType.COMMERCE_CHECKOUT,
      updatedState: {
        mode: ConversationMode.COMMERCE
      }
    };
  }
}

interface CommerceAction {
  type: 'browse' | 'search' | 'add_cart' | 'checkout' | 'order_status';
  category?: string;
  productId?: string;
  quantity?: number;
  filters?: Record<string, any>;
}
```

### 3. Profile Mode Handler
**Purpose**: Manage user profile and preferences

```typescript
class ProfileModeHandler extends BaseModeHandler {
  mode = ConversationMode.PROFILE;
  priority = 3;

  private profileService: ProfileService;

  canHandle(classification: ParallelClassificationResult): boolean {
    const intent = classification.intent.primaryClass;
    return [
      'update_profile',
      'view_settings',
      'manage_preferences',
      'privacy_settings'
    ].includes(intent);
  }

  async handle(context: HandlerContext): Promise<HandlerResult> {
    const profileAction = this.extractProfileAction(context);

    switch (profileAction.type) {
      case 'view':
        return this.handleViewProfile(context);
      case 'update':
        return this.handleUpdateProfile(profileAction, context);
      case 'preferences':
        return this.handlePreferences(profileAction, context);
      case 'privacy':
        return this.handlePrivacy(profileAction, context);
    }
  }

  private async handleUpdateProfile(
    action: ProfileAction,
    context: HandlerContext
  ): Promise<HandlerResult> {
    // Validate update request
    const validation = this.validateProfileUpdate(action.updates);

    if (!validation.valid) {
      return {
        response: `I couldn't update that: ${validation.error}`,
        updatedState: { mode: ConversationMode.PROFILE }
      };
    }

    // Apply updates
    await this.profileService.updateProfile(
      context.state.userId,
      action.updates
    );

    return {
      response: "Your profile has been updated successfully!",
      updatedState: {
        mode: ConversationMode.PROFILE,
        context: {
          ...context.state.context,
          profileUpdated: true,
          lastUpdate: new Date()
        }
      },
      sideEffects: [{
        type: 'notification',
        data: { message: 'Profile updated' },
        priority: 'low',
        async: true
      }]
    };
  }
}

interface ProfileAction {
  type: 'view' | 'update' | 'preferences' | 'privacy';
  field?: string;
  updates?: Record<string, any>;
}
```

### 4. Track Progress Mode Handler
**Purpose**: Monitor goals and track progress

```typescript
class TrackProgressModeHandler extends BaseModeHandler {
  mode = ConversationMode.TRACK_PROGRESS;
  priority = 4;

  private goalService: GoalService;
  private metricsService: MetricsService;

  canHandle(classification: ParallelClassificationResult): boolean {
    const intent = classification.intent.primaryClass;
    return [
      'log_activity',
      'view_progress',
      'set_goal',
      'update_goal',
      'view_metrics'
    ].includes(intent);
  }

  async handle(context: HandlerContext): Promise<HandlerResult> {
    const progressAction = this.extractProgressAction(context);

    switch (progressAction.type) {
      case 'set_goal':
        return this.handleSetGoal(progressAction, context);
      case 'log_activity':
        return this.handleLogActivity(progressAction, context);
      case 'view_progress':
        return this.handleViewProgress(progressAction, context);
      case 'view_metrics':
        return this.handleViewMetrics(progressAction, context);
    }
  }

  private async handleSetGoal(
    action: ProgressAction,
    context: HandlerContext
  ): Promise<HandlerResult> {
    // Extract goal details
    const goalDetails = await this.extractGoalDetails(
      context.message.content
    );

    // Validate goal
    if (!this.isValidGoal(goalDetails)) {
      return {
        response: "Let me help you set a more specific goal...",
        startFlow: FlowType.GOAL_SETTING
      };
    }

    // Save goal
    const goal = await this.goalService.createGoal({
      userId: context.state.userId,
      ...goalDetails
    });

    return {
      response: `Great! I've set your goal: "${goal.description}". Let's track your progress!`,
      updatedState: {
        mode: ConversationMode.TRACK_PROGRESS,
        context: {
          ...context.state.context,
          userGoals: [...context.state.context.userGoals, goal.id],
          activeGoal: goal.id
        }
      }
    };
  }

  private async handleViewProgress(
    action: ProgressAction,
    context: HandlerContext
  ): Promise<HandlerResult> {
    const goals = await this.goalService.getUserGoals(
      context.state.userId,
      { status: 'active' }
    );

    const progress = await this.metricsService.getProgress(
      goals.map(g => g.id)
    );

    const response = this.formatProgressReport(goals, progress);

    return {
      response,
      updatedState: {
        mode: ConversationMode.TRACK_PROGRESS,
        context: {
          ...context.state.context,
          lastProgressCheck: new Date()
        }
      }
    };
  }
}

interface ProgressAction {
  type: 'set_goal' | 'log_activity' | 'view_progress' | 'view_metrics';
  goalId?: string;
  activity?: any;
  timeRange?: { start: Date; end: Date };
}
```

### 5. Meta Mode Handler
**Purpose**: Handle questions about the system itself

```typescript
class MetaModeHandler extends BaseModeHandler {
  mode = ConversationMode.META;
  priority = 5;

  private documentationService: DocumentationService;

  canHandle(classification: ParallelClassificationResult): boolean {
    const intent = classification.intent.primaryClass;
    return [
      'how_works',
      'about_system',
      'help',
      'capabilities',
      'privacy_policy'
    ].includes(intent);
  }

  async handle(context: HandlerContext): Promise<HandlerResult> {
    const metaQuery = this.extractMetaQuery(context);

    const documentation = await this.documentationService.getRelevant(
      metaQuery
    );

    const response = await this.generateMetaResponse(
      metaQuery,
      documentation
    );

    return {
      response,
      updatedState: {
        mode: ConversationMode.META,
        context: {
          ...context.state.context,
          helpTopics: [...(context.state.context.helpTopics || []), metaQuery]
        }
      }
    };
  }

  private async generateMetaResponse(
    query: string,
    docs: string[]
  ): Promise<string> {
    const prompt = `
User is asking about the system: ${query}

Relevant documentation:
${docs.join('\n')}

Provide a helpful, accurate response about how the system works.
Keep it conversational but informative.
    `;

    return this.llmService.generate(prompt);
  }
}
```

### 6. Smalltalk Mode Handler
**Purpose**: Handle casual conversation

```typescript
class SmalltalkModeHandler extends BaseModeHandler {
  mode = ConversationMode.SMALLTALK;
  priority = 6; // Lowest priority

  canHandle(classification: ParallelClassificationResult): boolean {
    const intent = classification.intent.primaryClass;
    return [
      'greeting',
      'casual_chat',
      'farewell',
      'weather',
      'joke'
    ].includes(intent);
  }

  async handle(context: HandlerContext): Promise<HandlerResult> {
    const smalltalkType = this.extractSmalltalkType(context);

    const response = await this.generateSmalltalkResponse(
      smalltalkType,
      context
    );

    // Check if we should transition to another mode
    const suggestedMode = this.suggestModeTransition(context);

    return {
      response,
      updatedState: {
        mode: ConversationMode.SMALLTALK,
        context: {
          ...context.state.context,
          smalltalkCount: (context.state.context.smalltalkCount || 0) + 1
        }
      },
      sideEffects: suggestedMode ? [{
        type: 'log',
        data: { message: `Consider transitioning to ${suggestedMode}` },
        priority: 'low',
        async: true
      }] : []
    };
  }

  private suggestModeTransition(
    context: HandlerContext
  ): ConversationMode | null {
    // After 3+ smalltalk exchanges, suggest helpful actions
    if (context.state.context.smalltalkCount >= 3) {
      return ConversationMode.CONSULT;
    }
    return null;
  }
}
```

## Mode Transition Management

### 1. Transition Validator
```typescript
class ModeTransitionValidator {
  private transitionRules: TransitionRule[];

  canTransition(
    from: ConversationMode,
    to: ConversationMode,
    context: ConversationContext
  ): boolean {
    // Check if transition is allowed
    const rule = this.findRule(from, to);
    if (!rule) return false;

    // Validate conditions
    return rule.condition(context);
  }

  getTransitionPrompt(
    from: ConversationMode,
    to: ConversationMode
  ): string | null {
    // Return confirmation prompt if needed
    const rule = this.findRule(from, to);
    return rule?.confirmationPrompt || null;
  }
}

interface TransitionRule {
  from: ConversationMode;
  to: ConversationMode;
  condition: (context: ConversationContext) => boolean;
  confirmationPrompt?: string;
}

const TRANSITION_RULES: TransitionRule[] = [
  {
    from: ConversationMode.SMALLTALK,
    to: ConversationMode.CONSULT,
    condition: () => true, // Always allowed
  },
  {
    from: ConversationMode.COMMERCE,
    to: ConversationMode.PROFILE,
    condition: (ctx) => !ctx.currentFlow, // Not during checkout
    confirmationPrompt: "Before we update your profile, would you like to complete your shopping first?"
  }
];
```

## Handler Selection Strategy

### 1. Handler Router
```typescript
class HandlerRouter {
  private handlers: Map<ConversationMode, IModeHandler>;

  selectHandler(
    classification: ParallelClassificationResult,
    currentMode: ConversationMode
  ): IModeHandler {
    // 1. Check if current mode handler can continue
    const currentHandler = this.handlers.get(currentMode);
    if (currentHandler?.canHandle(classification)) {
      return currentHandler;
    }

    // 2. Find all eligible handlers
    const eligible = Array.from(this.handlers.values())
      .filter(h => h.canHandle(classification))
      .sort((a, b) => a.priority - b.priority);

    // 3. Return highest priority handler
    if (eligible.length > 0) {
      return eligible[0];
    }

    // 4. Fallback to smalltalk
    return this.handlers.get(ConversationMode.SMALLTALK)!;
  }
}
```

## Testing Strategy

### 1. Handler Test Cases
```typescript
const HANDLER_TEST_CASES = {
  consult: [
    {
      input: "I'm feeling anxious about my job interview",
      expectedMode: ConversationMode.CONSULT,
      expectedType: ConsultationType.EMOTIONAL_SUPPORT
    }
  ],
  commerce: [
    {
      input: "Show me your fitness products",
      expectedMode: ConversationMode.COMMERCE,
      expectedAction: 'browse'
    }
  ],
  profile: [
    {
      input: "Update my email address",
      expectedMode: ConversationMode.PROFILE,
      expectedAction: 'update'
    }
  ]
};
```

## CLI Commands

```bash
# Test individual handlers
npm run cli handler:test --mode=consult --message="..."
npm run cli handler:test --mode=commerce --message="..."

# Test mode transitions
npm run cli handler:transition --from=smalltalk --to=consult

# View handler metrics
npm run cli handler:metrics

# Debug handler selection
npm run cli handler:debug --message="..." --verbose
```

## Implementation Timeline
1. **Week 1**: Base handler architecture
2. **Week 2**: Consult and Safety handlers
3. **Week 3**: Commerce and Profile handlers
4. **Week 4**: Progress and Meta handlers
5. **Week 5**: Mode transitions and routing
6. **Week 6**: Testing and optimization