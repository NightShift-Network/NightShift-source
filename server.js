import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import express from "express";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const require = createRequire(import.meta.url);
const packageDist = (name) => path.dirname(require.resolve(name));
const app = express();
const pluginsPath = path.resolve(process.env.NIGHTSHIFT_PLUGINS_DIR || path.join(process.cwd(), "..", "plugins"));

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
});

app.use("/scram", express.static(scramjetPath));
app.use("/controller", express.static(packageDist("@mercuryworkshop/scramjet-controller")));
app.use("/epoxy", express.static(packageDist("@mercuryworkshop/epoxy-transport")));
app.use("/libcurl", express.static(packageDist("@mercuryworkshop/libcurl-transport")));
app.get("/api/plugins", async (req, res) => {
  try {
    const stores = await fs.readdir(pluginsPath, { withFileTypes: true });
    const plugins = [];
    for (const store of stores.filter(entry => entry.isDirectory())) {
      const pluginDirectories = [""];
      try {
        const children = await fs.readdir(path.join(pluginsPath, store.name), { withFileTypes: true });
        pluginDirectories.push(...children.filter(entry => entry.isDirectory() && !entry.name.startsWith(".")).map(entry => entry.name));
      } catch {}
      for (const relativeDirectory of pluginDirectories) {
        try {
          const directory = path.join(pluginsPath, store.name, relativeDirectory);
          const manifest = JSON.parse(await fs.readFile(path.join(directory, "plugin.json"), "utf8"));
          if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(manifest.id || "") || typeof manifest.name !== "string") continue;
          const basePath = [store.name, relativeDirectory].filter(Boolean);
          const assetUrl = file => {
            if (typeof file !== "string" || !/^[A-Za-z0-9._/-]+$/.test(file) || file.startsWith("/") || file.split("/").some(part => !part || part === "." || part === "..")) return null;
            return `/plugins/${[...basePath, ...file.split("/")].map(encodeURIComponent).join("/")}`;
          };
          plugins.push({
            id: manifest.id,
            name: manifest.name.slice(0, 100),
            description: typeof manifest.description === "string" ? manifest.description.slice(0, 300) : "",
            version: typeof manifest.version === "string" ? manifest.version.slice(0, 40) : "",
            script: assetUrl(manifest.script),
            styles: Array.isArray(manifest.styles) ? manifest.styles.map(assetUrl).filter(Boolean) : [],
          });
        } catch {}
      }
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(plugins);
  } catch (error) {
    if (error.code === "ENOENT") return res.json([]);
    res.status(500).json({ error: "Could not read installed plugins" });
  }
});
app.use("/plugins", express.static(pluginsPath, { dotfiles: "deny", index: false }));
app.use(express.static("public"));

// Unmatched routes: serve the styled 404 page to browsers and a plain 404 to
// asset and API-like requests so missing scripts fail like scripts.
app.use((req, res) => {
  res.status(404);
  if (req.accepts("html")) {
    res.sendFile(path.join(process.cwd(), "public", "404.html"));
    return;
  }
  if (req.accepts("json")) {
    res.json({ error: "Not found" });
    return;
  }
  res.type("txt").send("Not found");
});

const server = http.createServer(app);
server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (pathname !== "/wisp/") {
    socket.destroy();
    return;
  }
  wisp.routeRequest(req, socket, head);
});

// Destination connections use public DNS so local resolver issues and
// filtering cannot break sites, prefer IPv4 answers for reachability, and
// cache lookups longer.
const wispDnsServers = (process.env.WISP_DNS_SERVERS || "1.1.1.1,1.0.0.1")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
wisp.options.dns_method = "resolve";
if (wispDnsServers.length > 0) wisp.options.dns_servers = wispDnsServers;
wisp.options.dns_result_order = "ipv4first";
wisp.options.dns_ttl = 3600;

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Nightshift is ready at http://localhost:${port}`));
