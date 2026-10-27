import { createRouter, createWebHashHistory } from 'vue-router';
import PaginaVazia from './components/PaginaVazia.vue';

// Hash na URL: o GitHub Pages não precisa de regra de reescrita, então recarregar não dá 404.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/painel' },
    {
      path: '/painel',
      component: PaginaVazia,
      props: { titulo: 'Painel' },
      meta: { titulo: 'Painel' },
    },
    {
      path: '/ferramentas',
      component: PaginaVazia,
      props: { titulo: 'Ferramentas' },
      meta: { titulo: 'Ferramentas' },
    },
    {
      path: '/funcionarios',
      component: PaginaVazia,
      props: { titulo: 'Funcionários' },
      meta: { titulo: 'Funcionários' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/painel' },
  ],
});

router.afterEach((to) => {
  document.title = `${to.meta.titulo} · Controle de Ferramentas`;
});
