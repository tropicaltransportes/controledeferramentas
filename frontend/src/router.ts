import { createRouter, createWebHashHistory } from 'vue-router';
import { chamarApi } from './api';
import PaginaVazia from './components/PaginaVazia.vue';
import Entrar from './paginas/Entrar.vue';
import TrocarSenha from './paginas/TrocarSenha.vue';
import { definirAoPerderSessao, lerToken, sessao, type UsuarioSessao } from './sessao';

// Hash na URL: o GitHub Pages não precisa de regra de reescrita, então recarregar não dá 404.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/painel' },
    {
      path: '/entrar',
      component: Entrar,
      meta: { titulo: 'Entrar', publica: true, semCasca: true },
    },
    {
      path: '/conta/senha',
      component: TrocarSenha,
      meta: { titulo: 'Trocar senha' },
    },
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

definirAoPerderSessao(() => {
  void router.push({ path: '/entrar', query: { para: router.currentRoute.value.fullPath } });
});

// Guarda de rotas: sem sessão válida, só a tela de login é acessível.
router.beforeEach(async (para) => {
  const publica = Boolean(para.meta.publica);

  if (!sessao.usuario && lerToken()) {
    try {
      sessao.usuario = (await chamarApi<{ usuario: UsuarioSessao }>('/eu')).usuario;
    } catch {
      // Token recusado: chamarApi já esqueceu a sessão; a checagem abaixo manda para o login.
    }
  }

  if (!sessao.usuario && !publica) {
    return { path: '/entrar', query: { para: para.fullPath } };
  }

  if (sessao.usuario && para.path === '/entrar') {
    return '/painel';
  }

  return true;
});

router.afterEach((to) => {
  document.title = `${to.meta.titulo} · Controle de Ferramentas`;
});
