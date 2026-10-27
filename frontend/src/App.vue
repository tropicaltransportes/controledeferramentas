<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { chamarApi } from './api';
import { esquecerSessao, rotuloPapel, sessao } from './sessao';

const logo = `${import.meta.env.BASE_URL}logo.png`;
const route = useRoute();
const router = useRouter();

async function sair() {
  // Mesmo que a API não responda, o usuário sai daqui: a sessão local some de qualquer jeito.
  await chamarApi<void>('/sair', { metodo: 'POST' }).catch(() => undefined);
  esquecerSessao();
  await router.push({ path: '/entrar' });
}
</script>

<template>
  <RouterView v-if="route.meta.semCasca" />

  <div v-else class="shell">
    <aside class="side">
      <div class="logo">
        <img :src="logo" alt="Tropical Transportes" />
      </div>

      <RouterLink to="/painel" class="nav" active-class="on" aria-label="Painel">
        <svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" /></svg>
        <span class="tip">Painel</span>
      </RouterLink>
      <RouterLink to="/ferramentas" class="nav" active-class="on" aria-label="Ferramentas">
        <svg viewBox="0 0 24 24">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
        </svg>
        <span class="tip">Ferramentas</span>
      </RouterLink>
      <RouterLink to="/funcionarios" class="nav" active-class="on" aria-label="Funcionários">
        <svg viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-5-5.5" />
        </svg>
        <span class="tip">Funcionários</span>
      </RouterLink>
    </aside>

    <div class="main">
      <header class="top">
        <div class="search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input
            type="search"
            aria-label="Buscar ferramenta ou funcionário"
            placeholder="Buscar ferramenta ou funcionário…"
          />
        </div>
        <div class="acts">
          <button type="button" class="primary" aria-label="Retirada">
            <svg viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9" /></svg>
            <span class="lbl">Retirada</span>
          </button>
          <button type="button" class="outline" aria-label="Devolução">
            <svg viewBox="0 0 24 24"><path d="M17 7 7 17M16 17H7V8" /></svg>
            <span class="lbl">Devolução</span>
          </button>
        </div>
        <div v-if="sessao.usuario" class="conta">
          <div class="quem">
            <strong>{{ sessao.usuario.nome }}</strong>
            <span>{{ rotuloPapel(sessao.usuario.papel) }}</span>
          </div>
          <RouterLink to="/conta/senha" class="link">Trocar senha</RouterLink>
          <button type="button" class="sair" @click="sair">Sair</button>
        </div>
      </header>

      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.conta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 12px;
  border-left: 1px solid var(--line);
}

.quem {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.quem span {
  color: var(--muted);
  font-size: 12px;
}

.link {
  color: var(--brand);
  font-weight: 500;
  white-space: nowrap;
}

.sair {
  white-space: nowrap;
}

@media (max-width: 760px) {
  .quem span {
    display: none;
  }

  .conta {
    padding-left: 0;
    border-left: 0;
  }
}
</style>
