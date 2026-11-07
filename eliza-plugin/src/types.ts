// The parts of elizaOS's plugin shape this plugin uses, written out so the package needs no runtime dependency on
// @elizaos/core. They match @elizaos/core 1.x (checked against 1.7.2): an object of this shape can be passed wherever
// elizaOS takes a Plugin. Methods are written as methods so elizaOS's own, wider types are accepted.

// No index signatures here: elizaOS's own IAgentRuntime and Memory don't have one, so adding it would refuse them.
export interface MessageLike {
  content: { text?: string; source?: string };
}

export interface RuntimeLike {
  getSetting?(key: string): unknown;
}

export type Callback = (response: { text: string; actions?: string[]; source?: string; [key: string]: unknown }) => Promise<unknown>;

export interface ActionResult {
  success: boolean;
  text?: string;
  values?: Record<string, unknown>;
  data?: Record<string, unknown>;
  error?: string;
}

export interface ActionExample {
  name: string;
  content: { text: string; actions?: string[] };
}

export interface Action {
  name: string;
  similes: string[];
  description: string;
  examples: ActionExample[][];
  validate(runtime: RuntimeLike, message: MessageLike, state?: unknown): Promise<boolean>;
  handler(runtime: RuntimeLike, message: MessageLike, state?: unknown, options?: Record<string, unknown>, callback?: Callback): Promise<ActionResult>;
  [key: string]: unknown; // elizaOS's Action allows extra fields, so it requires this
}

export interface Plugin {
  name: string;
  description: string;
  actions: Action[];
}
