# Flow System Implementation Plan

## Overview
Multi-step conversation flows for structured interactions like goal setting, onboarding, and checkouts.

## Core Flow Architecture

### 1. Flow Engine
```typescript
class FlowEngine {
  private flows: Map<FlowType, FlowDefinition>;
  private activeFlows: Map<string, FlowInstance>;
  private flowRepository: FlowRepository;

  async startFlow(
    type: FlowType,
    conversationId: string,
    initialData?: any
  ): Promise<FlowInstance> {
    // 1. Load flow definition
    // 2. Create flow instance
    // 3. Initialize state
    // 4. Execute first step
  }

  async continueFlow(
    flowId: string,
    input: any
  ): Promise<FlowStepResult> {
    // 1. Load flow instance
    // 2. Validate input
    // 3. Execute current step
    // 4. Determine next step
    // 5. Update flow state
  }

  async abandonFlow(flowId: string): Promise<void> {
    // Mark flow as abandoned
    // Clean up resources
    // Log analytics
  }
}
```

### 2. Flow Definition Structure
```typescript
interface FlowDefinition {
  type: FlowType;
  name: string;
  description: string;
  steps: FlowStep[];
  transitions: FlowTransition[];
  validators: FlowValidator[];
  metadata: FlowMetadata;
}

interface FlowStep {
  id: string;
  name: string;
  type: StepType;
  prompt: StepPrompt;
  validation: StepValidation;
  actions: StepAction[];
  timeout?: number;
  retryable: boolean;
}

enum StepType {
  INPUT = 'input',
  CHOICE = 'choice',
  CONFIRMATION = 'confirmation',
  INFORMATION = 'information',
  COMPUTATION = 'computation'
}

interface StepPrompt {
  template: string;
  variables: string[];
  examples?: string[];
  helpText?: string;
}

interface StepValidation {
  required: boolean;
  type: ValidationType;
  rules: ValidationRule[];
  errorMessages: Record<string, string>;
}

interface FlowTransition {
  from: string;
  to: string;
  condition?: TransitionCondition;
  priority: number;
}
```

## Flow Definitions

### 1. Goal Setting Flow
```typescript
const GOAL_SETTING_FLOW: FlowDefinition = {
  type: FlowType.GOAL_SETTING,
  name: 'Goal Setting',
  description: 'Help user set SMART goals',
  steps: [
    {
      id: 'goal_type',
      name: 'Goal Type Selection',
      type: StepType.CHOICE,
      prompt: {
        template: 'What type of goal would you like to set?',
        variables: []
      },
      validation: {
        required: true,
        type: ValidationType.ENUM,
        rules: [{
          type: 'in_list',
          values: ['health', 'career', 'finance', 'relationship', 'personal']
        }],
        errorMessages: {
          invalid: 'Please choose from the available goal types'
        }
      },
      actions: [],
      retryable: true
    },
    {
      id: 'goal_description',
      name: 'Goal Description',
      type: StepType.INPUT,
      prompt: {
        template: 'Describe your {goalType} goal in your own words:',
        variables: ['goalType'],
        examples: [
          'I want to lose 10 pounds',
          'I want to get promoted',
          'I want to save $5000'
        ]
      },
      validation: {
        required: true,
        type: ValidationType.TEXT,
        rules: [
          { type: 'min_length', value: 10 },
          { type: 'max_length', value: 500 }
        ],
        errorMessages: {
          min_length: 'Please provide more detail about your goal',
          max_length: 'Please keep your description under 500 characters'
        }
      },
      actions: [
        { type: 'extract_entities', target: 'goalEntities' }
      ],
      retryable: true
    },
    {
      id: 'goal_specific',
      name: 'Make Goal Specific',
      type: StepType.INPUT,
      prompt: {
        template: 'Let\'s make your goal more specific. What exactly will you achieve?',
        variables: ['currentGoal'],
        helpText: 'A specific goal clearly defines what you want to accomplish'
      },
      validation: {
        required: true,
        type: ValidationType.CUSTOM,
        rules: [
          { type: 'custom', validator: 'isSpecificGoal' }
        ],
        errorMessages: {
          custom: 'Try to be more specific about what you\'ll achieve'
        }
      },
      actions: [],
      retryable: true
    },
    {
      id: 'goal_measurable',
      name: 'Make Goal Measurable',
      type: StepType.INPUT,
      prompt: {
        template: 'How will you measure progress? What metrics or milestones?',
        variables: ['specificGoal']
      },
      validation: {
        required: true,
        type: ValidationType.CUSTOM,
        rules: [
          { type: 'custom', validator: 'hasMeasurableMetrics' }
        ],
        errorMessages: {
          custom: 'Please include specific numbers or milestones'
        }
      },
      actions: [
        { type: 'extract_metrics', target: 'goalMetrics' }
      ],
      retryable: true
    },
    {
      id: 'goal_timeframe',
      name: 'Set Timeframe',
      type: StepType.INPUT,
      prompt: {
        template: 'When do you want to achieve this goal?',
        variables: [],
        examples: ['In 3 months', 'By end of year', 'Within 6 weeks']
      },
      validation: {
        required: true,
        type: ValidationType.DATE_RANGE,
        rules: [
          { type: 'future_date' },
          { type: 'max_range', value: '1_year' }
        ],
        errorMessages: {
          future_date: 'Please set a future date',
          max_range: 'Consider setting a goal within 1 year'
        }
      },
      actions: [
        { type: 'parse_date', target: 'targetDate' }
      ],
      retryable: true
    },
    {
      id: 'goal_confirmation',
      name: 'Confirm Goal',
      type: StepType.CONFIRMATION,
      prompt: {
        template: 'Here\'s your SMART goal:\n\n{formattedGoal}\n\nDoes this look good?',
        variables: ['formattedGoal']
      },
      validation: {
        required: true,
        type: ValidationType.BOOLEAN,
        rules: [],
        errorMessages: {}
      },
      actions: [
        { type: 'save_goal', target: 'database' },
        { type: 'schedule_reminders' }
      ],
      retryable: false
    }
  ],
  transitions: [
    { from: 'goal_type', to: 'goal_description', priority: 1 },
    { from: 'goal_description', to: 'goal_specific', priority: 1 },
    { from: 'goal_specific', to: 'goal_measurable', priority: 1 },
    { from: 'goal_measurable', to: 'goal_timeframe', priority: 1 },
    { from: 'goal_timeframe', to: 'goal_confirmation', priority: 1 },
    {
      from: 'goal_confirmation',
      to: 'goal_type',
      condition: { type: 'response_equals', value: 'no' },
      priority: 2
    }
  ],
  validators: [],
  metadata: {
    estimatedTime: 5,
    category: 'goal_management',
    tags: ['goals', 'smart', 'planning']
  }
};
```

### 2. Crisis Support Flow
```typescript
const CRISIS_SUPPORT_FLOW: FlowDefinition = {
  type: FlowType.CRISIS_SUPPORT,
  name: 'Crisis Support',
  description: 'Immediate support for crisis situations',
  steps: [
    {
      id: 'crisis_assessment',
      name: 'Assess Immediate Danger',
      type: StepType.CHOICE,
      prompt: {
        template: 'I\'m here to help. Are you in immediate danger?',
        variables: []
      },
      validation: {
        required: true,
        type: ValidationType.ENUM,
        rules: [{ type: 'in_list', values: ['yes', 'no', 'not_sure'] }],
        errorMessages: {}
      },
      actions: [
        { type: 'log_crisis_event' },
        { type: 'notify_support_team' }
      ],
      timeout: 30000, // 30 seconds
      retryable: false
    },
    {
      id: 'emergency_resources',
      name: 'Provide Emergency Resources',
      type: StepType.INFORMATION,
      prompt: {
        template: 'Here are immediate resources:\n\n{emergencyResources}\n\nWould you like me to stay with you?',
        variables: ['emergencyResources']
      },
      validation: {
        required: false,
        type: ValidationType.ANY,
        rules: [],
        errorMessages: {}
      },
      actions: [
        { type: 'send_resources' }
      ],
      retryable: false
    },
    {
      id: 'safety_plan',
      name: 'Create Safety Plan',
      type: StepType.INPUT,
      prompt: {
        template: 'Let\'s create a safety plan. Who can you reach out to right now?',
        variables: []
      },
      validation: {
        required: false,
        type: ValidationType.TEXT,
        rules: [],
        errorMessages: {}
      },
      actions: [
        { type: 'save_safety_plan' }
      ],
      retryable: true
    }
  ],
  transitions: [
    {
      from: 'crisis_assessment',
      to: 'emergency_resources',
      condition: { type: 'response_equals', value: 'yes' },
      priority: 1
    },
    {
      from: 'crisis_assessment',
      to: 'safety_plan',
      condition: { type: 'response_in', values: ['no', 'not_sure'] },
      priority: 2
    },
    {
      from: 'emergency_resources',
      to: 'safety_plan',
      priority: 1
    }
  ],
  validators: [],
  metadata: {
    estimatedTime: 10,
    category: 'crisis',
    tags: ['urgent', 'safety', 'support'],
    priority: 'critical'
  }
};
```

### 3. Commerce Checkout Flow
```typescript
const CHECKOUT_FLOW: FlowDefinition = {
  type: FlowType.COMMERCE_CHECKOUT,
  name: 'Checkout',
  description: 'Complete purchase checkout',
  steps: [
    {
      id: 'review_cart',
      name: 'Review Cart',
      type: StepType.CONFIRMATION,
      prompt: {
        template: 'Your cart:\n{cartItems}\n\nTotal: {total}\n\nProceed to checkout?',
        variables: ['cartItems', 'total']
      },
      validation: {
        required: true,
        type: ValidationType.BOOLEAN,
        rules: [],
        errorMessages: {}
      },
      actions: [
        { type: 'lock_cart_prices' }
      ],
      retryable: true
    },
    {
      id: 'shipping_address',
      name: 'Shipping Address',
      type: StepType.INPUT,
      prompt: {
        template: 'Please provide your shipping address:',
        variables: [],
        helpText: 'Format: Street, City, State ZIP'
      },
      validation: {
        required: true,
        type: ValidationType.ADDRESS,
        rules: [
          { type: 'valid_address' },
          { type: 'deliverable_location' }
        ],
        errorMessages: {
          valid_address: 'Please enter a valid address',
          deliverable_location: 'We don\'t deliver to this location yet'
        }
      },
      actions: [
        { type: 'validate_address' },
        { type: 'calculate_shipping' }
      ],
      retryable: true
    },
    {
      id: 'payment_method',
      name: 'Payment Method',
      type: StepType.CHOICE,
      prompt: {
        template: 'Select payment method:',
        variables: []
      },
      validation: {
        required: true,
        type: ValidationType.ENUM,
        rules: [
          { type: 'in_list', values: ['card', 'paypal', 'applepay'] }
        ],
        errorMessages: {}
      },
      actions: [
        { type: 'initialize_payment' }
      ],
      retryable: true
    },
    {
      id: 'order_confirmation',
      name: 'Confirm Order',
      type: StepType.CONFIRMATION,
      prompt: {
        template: 'Order Summary:\n{orderSummary}\n\nPlace order?',
        variables: ['orderSummary']
      },
      validation: {
        required: true,
        type: ValidationType.BOOLEAN,
        rules: [],
        errorMessages: {}
      },
      actions: [
        { type: 'process_payment' },
        { type: 'create_order' },
        { type: 'send_confirmation_email' }
      ],
      retryable: false
    }
  ],
  transitions: [
    { from: 'review_cart', to: 'shipping_address', priority: 1 },
    { from: 'shipping_address', to: 'payment_method', priority: 1 },
    { from: 'payment_method', to: 'order_confirmation', priority: 1 }
  ],
  validators: [
    { type: 'cart_not_empty' },
    { type: 'user_authenticated' }
  ],
  metadata: {
    estimatedTime: 5,
    category: 'commerce',
    tags: ['purchase', 'transaction'],
    requiresAuth: true
  }
};
```

## Flow State Management

### 1. Flow Instance
```typescript
class FlowInstance {
  id: string;
  flowType: FlowType;
  conversationId: string;
  currentStepId: string;
  state: FlowState;
  startedAt: Date;
  lastActivityAt: Date;

  constructor(
    definition: FlowDefinition,
    conversationId: string
  ) {
    this.id = generateId();
    this.flowType = definition.type;
    this.conversationId = conversationId;
    this.currentStepId = definition.steps[0].id;
    this.state = {
      started: true,
      completed: false,
      abandoned: false,
      data: {},
      history: []
    };
    this.startedAt = new Date();
    this.lastActivityAt = new Date();
  }

  async executeStep(input: any): Promise<FlowStepResult> {
    const step = this.getCurrentStep();

    // Validate input
    const validation = await this.validateInput(step, input);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        retry: step.retryable
      };
    }

    // Execute step actions
    const actionResults = await this.executeActions(step.actions, input);

    // Update state
    this.updateState(step, input, actionResults);

    // Determine next step
    const nextStep = this.determineNextStep(step, input);

    return {
      success: true,
      nextStep,
      output: this.formatOutput(step, actionResults),
      completed: nextStep === null
    };
  }
}
```

### 2. Flow Persistence
```typescript
class FlowStateManager {
  private flowRepository: FlowRepository;
  private cache: Map<string, FlowInstance>;

  async saveFlowState(flow: FlowInstance): Promise<void> {
    // Save to database
    await this.flowRepository.updateFlow(flow.id, {
      currentStep: flow.currentStepId,
      state: flow.state,
      lastActivityAt: flow.lastActivityAt
    });

    // Update cache
    this.cache.set(flow.id, flow);
  }

  async loadFlowState(flowId: string): Promise<FlowInstance | null> {
    // Check cache first
    if (this.cache.has(flowId)) {
      return this.cache.get(flowId)!;
    }

    // Load from database
    const flowData = await this.flowRepository.findById(flowId);
    if (!flowData) return null;

    // Reconstruct instance
    const instance = this.reconstructFlowInstance(flowData);
    this.cache.set(flowId, instance);

    return instance;
  }

  async cleanupInactiveFlows(): Promise<void> {
    const threshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hour
    const inactiveFlows = await this.flowRepository.findInactive(threshold);

    for (const flow of inactiveFlows) {
      await this.flowRepository.markAbandoned(flow.id);
      this.cache.delete(flow.id);
    }
  }
}
```

## Flow Validators

### 1. Input Validators
```typescript
interface IValidator {
  validate(value: any, context: any): ValidationResult;
}

class TextValidator implements IValidator {
  constructor(private rules: ValidationRule[]) {}

  validate(value: string, context: any): ValidationResult {
    for (const rule of this.rules) {
      if (!this.checkRule(rule, value)) {
        return {
          valid: false,
          error: rule.errorMessage
        };
      }
    }
    return { valid: true };
  }

  private checkRule(rule: ValidationRule, value: string): boolean {
    switch (rule.type) {
      case 'min_length':
        return value.length >= rule.value;
      case 'max_length':
        return value.length <= rule.value;
      case 'pattern':
        return new RegExp(rule.value).test(value);
      default:
        return true;
    }
  }
}

class DateRangeValidator implements IValidator {
  validate(value: string, context: any): ValidationResult {
    const date = new Date(value);

    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Invalid date format' };
    }

    if (date < new Date()) {
      return { valid: false, error: 'Date must be in the future' };
    }

    return { valid: true };
  }
}

class CustomValidator implements IValidator {
  constructor(private validatorName: string) {}

  validate(value: any, context: any): ValidationResult {
    const validator = this.getCustomValidator(this.validatorName);
    return validator(value, context);
  }

  private getCustomValidator(name: string): (value: any, context: any) => ValidationResult {
    const validators: Record<string, any> = {
      'isSpecificGoal': (value: string) => {
        // Check if goal is specific enough
        const hasAction = /\b(achieve|complete|learn|build|create|improve)\b/i.test(value);
        const hasObject = value.split(' ').length > 5;
        return {
          valid: hasAction && hasObject,
          error: 'Please be more specific about what you\'ll do'
        };
      },
      'hasMeasurableMetrics': (value: string) => {
        // Check for measurable elements
        const hasNumber = /\d+/.test(value);
        const hasMetric = /\b(pounds|dollars|minutes|hours|days|weeks|percent|times)\b/i.test(value);
        return {
          valid: hasNumber || hasMetric,
          error: 'Include specific numbers or measurements'
        };
      }
    };

    return validators[name] || (() => ({ valid: true }));
  }
}
```

## Flow Actions

### 1. Action Executors
```typescript
interface IActionExecutor {
  execute(data: any, context: FlowContext): Promise<any>;
}

class ExtractEntitiesAction implements IActionExecutor {
  async execute(data: string, context: FlowContext): Promise<any> {
    // Use NLP to extract entities
    const entities = await this.nlpService.extractEntities(data);
    return entities;
  }
}

class SaveGoalAction implements IActionExecutor {
  async execute(data: any, context: FlowContext): Promise<any> {
    const goal = {
      userId: context.userId,
      description: data.description,
      metrics: data.metrics,
      targetDate: data.targetDate,
      category: data.category
    };

    return await this.goalService.create(goal);
  }
}

class SendNotificationAction implements IActionExecutor {
  async execute(data: any, context: FlowContext): Promise<any> {
    await this.notificationService.send({
      userId: context.userId,
      type: 'flow_completed',
      data
    });
  }
}
```

## CLI Commands for Flow Testing

```bash
# Start a flow
npm run cli flow:start --type=goal_setting

# Continue a flow
npm run cli flow:continue --id=xxx --input="response"

# List active flows
npm run cli flow:list --active

# Debug flow execution
npm run cli flow:debug --id=xxx

# Test flow definition
npm run cli flow:validate --file=flow.json

# Simulate flow
npm run cli flow:simulate --type=goal_setting --mock-responses
```

## Implementation Timeline
1. **Week 1**: Core flow engine and state management
2. **Week 2**: Flow definitions and validators
3. **Week 3**: Action executors and transitions
4. **Week 4**: Goal setting and habit flows
5. **Week 5**: Crisis and commerce flows
6. **Week 6**: Testing and optimization