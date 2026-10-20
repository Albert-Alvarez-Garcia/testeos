import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/pong/', // Esto le indica a Vite que vivirá en la ruta /pong/
})