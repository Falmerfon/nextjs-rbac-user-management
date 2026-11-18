import type { NextConfig } from "next";

// Do not enable `cacheComponents`. Every page depends on the session, and a
// cached render could outlive a deactivation (rule 5).
const nextConfig: NextConfig = {};

export default nextConfig;
