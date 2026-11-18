import type { NextConfig } from "next";

// Do not enable `cacheComponents`. Every page depends on the session, and a
// cached render could outlive a deactivation (rule 5).
const nextConfig: NextConfig = {
  // `next dev` would otherwise write a generic AGENTS.md. This repo keeps a
  // hand-written one with rules specific to this codebase.
  agentRules: false,
};

export default nextConfig;
