// The YouTube videos on the Start here page (/start), in the order a newcomer should watch them. IDs are the channel's
// own uploads (youtube.com/@timothymycompc1205). A tool without a video still gets its card and live example.
export const STORY_VIDEO = { id: 'LmX4NSpCmas', title: 'The Solana Pulse story so far', note: 'Why it was built, what worked, what didn’t, and where it’s heading. Narrated with an AI voice (Google Chirp 3 HD); a version in Tim’s own voice is coming.' };
export const BUILT_VIDEO = { id: '_Ok4DskNtN0', title: 'Built with Pulse: how Drain Check and Rug Check chain the tools' };
export const INTRO_VIDEOS = [
  { id: 'Ie3SSEEmQXE', title: 'Solana Pulse in 90 seconds', note: 'Three live calls on mainnet: a drainer-style transaction blocked, a plain transfer passed, a wrong amount caught.' },
  { id: 'MnMH6ChDHVE', title: 'Full walkthrough', note: 'Every kind of tool, what it answers, and how agents call it.' },
  { id: 'WxaqVlhjIyU', title: 'Solana Pulse in Claude Code', note: 'A real Claude Code session asking Pulse in plain English.' },
];
// Safety checks first, then the tools people reach for most, then the rest.
export const TOOL_ORDER = ['check_tx', 'tx_matches', 'token_safety', 'trace', 'explain_tx', 'why_failed', 'find_token', 'wallet', 'token_traders',
  'whats_this', 'history', 'tokens', 'token_account', 'balance', 'fee', 'convert', 'blockhash', 'tx_version', 'build_tx'];
export const TOOL_VIDEOS: Record<string, string> = {
  check_tx: 'dXhUzna9Txg', tx_matches: 'rcxo8HLV0g4', token_safety: 'JOCb26AZlrg', trace: 'imORBgFhzO0', explain_tx: 'RNfHMv2-PC8',
  why_failed: '8eamu-iA5MQ', find_token: 'dDTnRdbGtdM', wallet: '71z_iZUdWRs', fee: 'Loc2btdo-zI', history: 'iwrYLeU_9Ng',
  tokens: 'sXynJ6xIi_4', whats_this: '_JUdY9exHJM', token_account: 'fazBU9vcgZs', balance: 'Mz7Vx8mU9Jc', convert: 'aWromM8hniU',
  blockhash: 'D2fN5K0o9o4',
};
export const SETUP_VIDEOS = [
  { id: 'NMBLXYZp1No', app: 'ChatGPT' }, { id: '8H2YPpWQP8w', app: 'Claude' }, { id: 'qeKfpJ_CLdw', app: 'Cursor' },
  { id: 'Cwj6jwc-2YE', app: 'VS Code (Copilot)' }, { id: 's0Pd2QW1N28', app: 'Gemini CLI' }, { id: 'nM4VdqEFWNA', app: 'OpenAI Codex CLI' },
  { id: 'aZgHdqi8Xg4', app: 'elizaOS' }, { id: 'qjpXYO9rvhg', app: 'OpenCode' }, { id: 'ssypZpBRPIA', app: 'Zed' },
  { id: 'rFRUa19cxbI', app: 'Cline' }, { id: 'nw_-XSPBVAw', app: 'Windsurf' },
];
