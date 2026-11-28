import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: process.env.NEXT_OUTPUT_EXPORT === "1" ? "export" : undefined,
	basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
	trailingSlash: process.env.NEXT_OUTPUT_EXPORT === "1" ? true : undefined,
	images:
		process.env.NEXT_OUTPUT_EXPORT === "1" ? { unoptimized: true } : undefined,
	turbopack: {
		rules: {
			"*.css": {
				loaders: ["@tailwindcss/turbopack"],
				as: "*.css",
			},
		},
	},
};

export default nextConfig;
