try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
