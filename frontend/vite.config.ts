import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Publicado em https://tropicaltransportes.github.io/controledeferramentas/
export default defineConfig({
  base: '/controledeferramentas/',
  plugins: [vue()],
});
