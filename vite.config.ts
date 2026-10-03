import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

const demoEnvironment = fileURLToPath(new URL('./src/environments/environment.demo.ts', import.meta.url));

export default defineConfig({
  plugins: [angular()],
  resolve: {
    // Domain specs run against the offline backend, so every import of the
    // environment resolves to the `demo` target during a test run. Nothing else
    // in the suite depends on a Supabase project.
    alias: [{ find: /(.*)environments\/environment$/, replacement: demoEnvironment }]
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts']
  }
});