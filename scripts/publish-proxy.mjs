import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "html-minifier-terser";
import JavaScriptObfuscator from "javascript-obfuscator";

const require = createRequire(import.meta.url);
const CleanCSS = require("clean-css");
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(process.argv[2] || path.join(sourceRoot, "dist/proxy"));

const defaultOutputDir = path.join(sourceRoot, "dist/proxy");
if (outputDir === sourceRoot || outputDir.startsWith(`${sourceRoot}${path.sep}`) && outputDir !== defaultOutputDir) {
  throw new Error("Choose a separate output directory or the proxy repository checkout.");
}

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: sourceRoot, encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter(file => file !== "AGENTS.md" && file !== "scripts/publish-proxy.mjs" && !file.startsWith(".github/"));
const desiredFiles = new Set([...trackedFiles, "README.md", "SOURCE_COMMIT.txt"]);
mkdirSync(outputDir, { recursive: true });
let existingFiles = [];
if (existsSync(path.join(outputDir, ".git"))) {
  existingFiles = execFileSync("git", ["ls-files", "-z"], { cwd: outputDir, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

for (const file of existingFiles) {
  if (file.startsWith(".github/") || desiredFiles.has(file)) continue;
  rmSync(path.join(outputDir, file), { force: true });
}

const obfuscate = code => {
  const output = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    identifierNamesGenerator: "hexadecimal",
    numbersToExpressions: true,
    renameGlobals: false,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 1,
    stringArrayEncoding: ["base64"],
    stringArrayThreshold: 1,
  }).getObfuscatedCode();

  // The obfuscator does not have to emit hexadecimal identifiers for every
  // valid input (for example, scripts containing only literals or operators).
  // Treat an unchanged non-empty result as a failure, but do not infer failure
  // from the shape of the generated identifiers.
  if (code.trim() && output === code) {
    throw new Error("JavaScript obfuscation did not run; refusing to publish readable frontend code.");
  }

  return output;
};

for (const file of trackedFiles) {
  const sourcePath = path.join(sourceRoot, file);
  const outputPath = path.join(outputDir, file);
  mkdirSync(path.dirname(outputPath), { recursive: true });

  if (file.startsWith("public/") && file.endsWith(".js")) {
    writeFileSync(outputPath, obfuscate(readFileSync(sourcePath, "utf8")));
  } else if (file.startsWith("public/") && file.endsWith(".css")) {
    writeFileSync(outputPath, new CleanCSS().minify(readFileSync(sourcePath, "utf8")).styles);
  } else if (file.startsWith("public/") && file.endsWith(".html")) {
    const html = await minify(readFileSync(sourcePath, "utf8"), {
      collapseWhitespace: true,
      minifyCSS: css => new CleanCSS().minify(css).styles,
      minifyJS: obfuscate,
      removeComments: true,
    });
    writeFileSync(outputPath, html);
  } else {
    cpSync(sourcePath, outputPath);
  }
}

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).trim();
writeFileSync(path.join(outputDir, "SOURCE_COMMIT.txt"), `${sourceCommit}\n`);
writeFileSync(path.join(outputDir, "README.md"), `# NightShift Proxy

NightShift is a self-hosted web proxy with a tabbed dark-mode interface. This repository contains the generated distribution. The readable source code is maintained in [NightShift-source](https://github.com/NightShift-Network/NightShift-source).

## Easy VPS setup

For a Debian or Ubuntu VPS with a public domain pointed at its IP address, allow inbound TCP ports 80 and 443, then run:

\`\`\`sh
git clone https://github.com/NightShift-Network/NightShift-proxy.git
cd NightShift-proxy
sudo ./setup.sh --domain proxy.example.com --email you@example.com
\`\`\`

The setup script installs Docker, Nginx, and Certbot as needed, starts NightShift, configures HTTPS, and enables certificate renewal. Replace the example domain and email with your own values.

For management after setup, use \`sudo ./setup.sh --start\`, \`--stop\`, \`--restart\`, or \`--logs\`. To update the running installation after pulling new repository changes, run \`sudo ./setup.sh --update\`.

## Run with Node.js

Requirements: Node.js and npm, plus network access for package installation and outbound Wisp connections.

\`\`\`sh
git clone https://github.com/NightShift-Network/NightShift-proxy.git
cd NightShift-proxy
npm install
npm start
\`\`\`

Open http://localhost:3000. To use another port, set \`PORT\`, for example \`PORT=8080 npm start\`.

## Keep it running with PM2

From the NightShift-proxy directory, install PM2 and start NightShift as a managed process:

\`\`\`sh
npm install -g pm2
PORT=3000 pm2 start server.js --name nightshift
pm2 save
pm2 startup
\`\`\`

Run the platform-specific command printed by \`pm2 startup\` (it may require \`sudo\`), then run \`pm2 save\` again. Check the process with \`pm2 status\`, view logs with \`pm2 logs nightshift\`, and restart after server changes with \`pm2 restart nightshift\`.

## Using NightShift

Open the NightShift page in your browser, enter a website address or search term, and press Enter. Use the sidebar to open Games or quick cloaking. Proxy preferences and bookmarks are stored in that browser.

## Run with Docker Compose

\`\`\`sh
git clone https://github.com/NightShift-Network/NightShift-proxy.git
cd NightShift-proxy
docker compose up -d --build
\`\`\`

By default, Compose binds the app to \`127.0.0.1:3005\`. Open http://127.0.0.1:3005 to use it locally. For remote access, put it behind HTTPS and configure the reverse proxy to support WebSocket upgrades on \`/wisp/\`; service workers require HTTPS outside localhost. Restrict public access or add authentication before exposing an instance, since anyone who can reach it can use it.

## Updating

For a Node.js install, pull the latest proxy repository changes, run \`npm install\`, and restart NightShift. For Docker Compose, pull the changes and rebuild with \`docker compose up -d --build\`.

## Source code

Browse the readable code, report issues, or contribute at [NightShift-source](https://github.com/NightShift-Network/NightShift-source). The frontend in \`public/\` is generated from that repository. This release was built from source commit \`${sourceCommit}\`.
`);
console.log(`Built NightShift Proxy from ${sourceCommit} into ${outputDir}`);
