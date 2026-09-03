import React, { useState } from 'react';
import { Mail, MessageSquare, Send, Sparkles, Check, Bot, Code } from 'lucide-react';

export const ContactCustomRequests: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    requestType: 'custom_endpoint',
    description: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="mt-12 border-t border-slate-800 pt-10 pb-16">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Developer Support & Custom Builds</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Need a Custom Solana Tool, Feature, or Private RPC?
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-xl mx-auto">
            Have product feedback, need a specific DeFi endpoint built, or want custom microtransaction pricing for your AI agent fleet? Reach out directly!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Direct Channels */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                Direct Channels
              </h3>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <Mail className="w-4 h-4 text-cyan-400" />
                  <div>
                    <div className="font-medium text-white">Email Support</div>
                    <div className="text-slate-400">dev@solanapulse.io</div>
                  </div>
                </li>
                <li className="flex items-center gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <Bot className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="font-medium text-white">Telegram / X</div>
                    <div className="text-slate-400">@SolanaPulseGateway</div>
                  </div>
                </li>
                <li className="flex items-center gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  <Code className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="font-medium text-white">Custom SLA</div>
                    <div className="text-slate-400">Dedicated instance & private RPCs</div>
                  </div>
                </li>
              </ul>
            </div>
            <div className="mt-4 text-[11px] text-slate-500">
              ⚡ Typical response time: Under 2 hours.
            </div>
          </div>

          {/* Request Form */}
          <div className="md:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            {submitted ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-semibold text-white">Request Received!</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Thank you for reaching out. We will review your custom endpoint requirements and get back to you promptly.
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-4 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Your Name / Project</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Trading Bot Lead"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Contact (Email or Telegram/X)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. you@domain.com or @handle"
                      value={formData.contact}
                      onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Request Type</label>
                  <select
                    value={formData.requestType}
                    onChange={(e) => setFormData({ ...formData, requestType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="custom_endpoint">Request New Solana / MCP Endpoint</option>
                    <option value="high_volume">High-Volume Microtransaction Discount</option>
                    <option value="bug_report">Bug Report / Integration Issue</option>
                    <option value="partnership">Partnership & Distribution</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Description / Endpoint Requirements</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Describe the data you need (e.g., 'Need an endpoint that returns Raydium pool depth and token tax authority')..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2.5 rounded-lg text-xs transition-colors shadow-md shadow-indigo-600/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Custom Request / Feedback</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
