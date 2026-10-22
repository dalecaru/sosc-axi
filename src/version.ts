import { version } from "../package.json" with { type: "json" };

// Leaf module: imported by the --version fast path, so it must not import the CLI graph.
export const VERSION: string = version;
