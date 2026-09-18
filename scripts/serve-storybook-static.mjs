import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("storybook-static");
const host = process.env.STORYBOOK_HOST ?? "127.0.0.1";
const port = Number(process.env.STORYBOOK_PORT ?? "6017");

if (!existsSync(join(root, "index.html"))) {
  throw new Error("storybook-static is missing. Run npm run build:storybook first.");
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url ?? "/", `http://${host}`).pathname);
  const relative = normalize(requestPath).replace(/^[/\\]+/u, "");
  let path = join(root, relative || "index.html");

  if (!path.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
  if (!existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentTypes.get(extname(path)) ?? "application/octet-stream",
  });
  createReadStream(path).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(`Storybook static server listening on http://${host}:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
