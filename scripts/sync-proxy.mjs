import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(sourceRoot, ".env");
if (!existsSync(envPath)) {
  throw new Error(`Create ${envPath} and add PROXY_REPO_TOKEN. The .env file is ignored by Git.`);
}
const envText = readFileSync(envPath, "utf8");
const tokenLine = envText.split(/\r?\n/).find(line => /^\s*PROXY_REPO_TOKEN\s*=/.test(line));
const token = tokenLine?.slice(tokenLine.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/, "$2");

if (!token) {
  throw new Error(`Set PROXY_REPO_TOKEN in ${envPath}. The .env file is ignored by Git.`);
}

const temporaryDir = mkdtempSync(path.join(os.tmpdir(), "nightshift-proxy-publish-"));
const askpassPath = path.join(temporaryDir, "git-askpass.sh");
const proxyPath = path.join(temporaryDir, "proxy-repo");
const gitEnv = {
  ...process.env,
  GIT_ASKPASS: askpassPath,
  GIT_TERMINAL_PROMPT: "0",
  NIGHTSHIFT_PROXY_TOKEN: token,
};

writeFileSync(askpassPath, "#!/bin/sh\ncase \"$1\" in\n  *Username*) printf '%s\\n' 'x-access-token' ;;\n  *) printf '%s\\n' \"$NIGHTSHIFT_PROXY_TOKEN\" ;;\nesac\n");
chmodSync(askpassPath, 0o700);

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

try {
  run("git", ["clone", "https://github.com/NightShift-Network/NightShift-proxy.git", proxyPath], sourceRoot, gitEnv);
  run(process.execPath, [path.join(sourceRoot, "scripts/publish-proxy.mjs"), proxyPath], sourceRoot);
  run("git", ["checkout", "-B", "main"], proxyPath);
  run("git", ["config", "user.name", "NightShift Publisher"], proxyPath);
  run("git", ["config", "user.email", "nightshift-publisher@users.noreply.github.com"], proxyPath);
  run("git", ["add", "-A"], proxyPath);

  const stagedChanges = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: proxyPath, stdio: "ignore" });
  if (stagedChanges.status === 0) {
    console.log("NightShift-proxy already matches this source commit.");
  } else if (stagedChanges.status === 1) {
    const sourceCommit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: sourceRoot, encoding: "utf8" });
    if (sourceCommit.status !== 0) throw new Error("Could not read the source commit.");
    run("git", ["commit", "-m", `Publish source ${sourceCommit.stdout.trim()}`], proxyPath);
    run("git", ["push", "--set-upstream", "origin", "main"], proxyPath, gitEnv);
  } else {
    throw new Error("Could not inspect staged proxy changes.");
  }
} finally {
  rmSync(temporaryDir, { recursive: true, force: true });
}
