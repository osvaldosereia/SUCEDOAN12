import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
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
