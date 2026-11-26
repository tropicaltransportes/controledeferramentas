<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { chamarApi, ErroApi } from '../api';
import { guardarToken, sessao, type UsuarioSessao } from '../sessao';

const router = useRouter();
const route = useRoute();

const email = ref('');
const senha = ref('');
const erro = ref('');
const enviando = ref(false);

const logo = `${import.meta.env.BASE_URL}logo.png`;
const aviso = computed(() =>
  route.query.aviso === 'senha-trocada' ? 'Senha trocada. Entre com a nova senha.' : '',
);

async function entrar() {
  erro.value = '';
  enviando.value = true;

  try {
    const dados = await chamarApi<{ token: string; usuario: UsuarioSessao }>('/entrar', {
      metodo: 'POST',
      corpo: { email: email.value, senha: senha.value },
      autenticado: false,
    });
    guardarToken(dados.token);
    sessao.usuario = dados.usuario;

    const destino = typeof route.query.para === 'string' ? route.query.para : '/painel';
    await router.push(destino.startsWith('/') && !destino.startsWith('//') ? destino : '/painel');
  } catch (falha) {
    erro.value = falha instanceof ErroApi ? falha.message : 'Não foi possível entrar. Tente de novo.';
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div class="entrar">
    <form class="caixa" @submit.prevent="entrar">
      <img :src="logo" alt="Tropical Transportes" class="marca" />
      <h1>Entrar</h1>
      <p class="apoio">Controle de Ferramentas do almoxarifado</p>

      <p v-if="aviso" class="aviso" role="status">{{ aviso }}</p>

      <label>
        <span>E-mail</span>
        <input v-model="email" type="email" autocomplete="username" required />
      </label>

      <label>
        <span>Senha</span>
        <input v-model="senha" type="password" autocomplete="current-password" required />
      </label>

      <p v-if="erro" class="erro" role="alert">{{ erro }}</p>

      <button type="submit" class="primary entrar-botao" :disabled="enviando">
        {{ enviando ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.entrar {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--bg);
}

.caixa {
  width: min(380px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow);
}

.marca {
  width: 56px;
  height: 56px;
  object-fit: contain;
}

h1 {
  margin-top: 4px;
}

.apoio {
  margin: -8px 0 0;
  color: var(--muted);
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 500;
}

.aviso {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--brand-soft);
  color: var(--brand-600);
}

.erro {
  margin: 0;
  color: #b42318;
}

.entrar-botao {
  justify-content: center;
  padding: 10px 14px;
}

.entrar-botao:disabled {
  opacity: 0.7;
  cursor: progress;
}
</style>
