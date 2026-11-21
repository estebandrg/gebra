// Production/dev entry: serves the board page (Bun bundles TS/CSS from the HTML import),
// MathLive fonts, and the API.
import { join, resolve } from "node:path";
import page from "../web/index.html";
import { startServer } from "./app";

const root = resolve(import.meta.dir, "../..");
const fontsDir = join(root, "node_modules/mathlive/fonts");
const port = Number(process.env.PORT ?? 5179);

const server = startServer({
  port,
  dataDir: process.env.GEBRA_DATA ?? join(root, ".gebra"),
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": page,
    "/vendor/mathlive/fonts/:file": (req: Bun.BunRequest<"/vendor/mathlive/fonts/:file">) => {
      const name = req.params.file.replace(/[^\w.-]/g, "");
      return new Response(Bun.file(join(fontsDir, name)));
    },
  },
});

console.log(`gebra → http://localhost:${server.port}`);
