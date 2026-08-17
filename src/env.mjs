import { installGitHubFetchRetry } from './github-http.mjs';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

installGitHubFetchRetry();
