import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],

  server: {
    port: 6173
  },

  test: {
    expect: { requireAssertions: true },

    projects: [
      {
        extends: './vite.config.js',
        plugins: [svelteTesting()],
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/**/*.svelte.test.js']
        }
      },
      {
        extends: './vite.config.js',

        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.{test,spec}.{js,ts}'],
          exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
        }
      }
    ]
  }
});
