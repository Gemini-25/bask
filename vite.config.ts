/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 빌드 결과는 dist/index.html 파일 하나. 더블클릭으로 열 수 있게 모든 코드·폰트를 안에 넣는다.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 5000 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
});
