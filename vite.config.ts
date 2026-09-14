import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset URLs let the same build work at either:
  // https://username.github.io/ or https://username.github.io/repository-name/
  base: './',
  plugins: [react()],
})
