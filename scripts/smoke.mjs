import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = 32179;
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    DEV30_STORAGE_BACKEND: 'local',
    GITHUB_TOKEN: '',
    GITHUB_APP_CLIENT_ID: '',
    GITHUB_APP_CLIENT_SECRET: '',
    SUPABASE_URL: '',
    SUPABASE_SECRET_KEY: '',
    REVENUECAT_API_KEY: '',
    REVENUECAT_PURCHASE_LINK_URL: '',
    REVENUECAT_WEBHOOK_AUTH: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_PRO_PRICE_ID: '',
    RESEND_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Dev30 exited before smoke test:\n${output}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Dev30:\n${output}`);
}

async function main() {
  const health = await waitForServer();
  if (health.productVersion !== '1.1.0') throw new Error(`Expected productVersion 1.1.0, received ${health.productVersion}`);
  if (health.storage?.backend !== 'local') throw new Error(`Expected local storage, received ${health.storage?.backend}`);
  if (health.runtime?.billingProvider !== 'revenuecat') throw new Error(`Expected RevenueCat billing provider, received ${health.runtime?.billingProvider}`);

  const readyResponse = await fetch(`${origin}/api/ready`);
  const ready = await readyResponse.json();
  if (!readyResponse.ok || ready.ok !== true) throw new Error(`Readiness failed: ${JSON.stringify(ready)}`);

  const homepage = await fetch(`${origin}/`);
  const html = await homepage.text();
  if (!homepage.ok || !html.includes('Dev30') || !html.includes('/monetization-preload.js')) throw new Error('Homepage monetization smoke check failed.');

  console.log(`smoke ok · product=${health.productVersion} · storage=${health.storage.backend} · billing=${health.runtime.billingProvider}`);
}

try {
  await main();
} finally {
  if (child.exitCode === null) child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 2000))]).catch(() => {});
  if (child.exitCode === null) child.kill('SIGKILL');
}
