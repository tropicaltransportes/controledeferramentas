<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { chamarApi, ErroApi } from '../api';
import { esquecerSessao } from '../sessao';

const TAMANHO_MINIMO = 8;

const router = useRouter();

const senhaAtual = ref('');
const novaSenha = ref('');
const confirmacao = ref('');
const erro = ref('');
const enviando = ref(false);

async function trocar() {
  erro.value = '';

  if (novaSenha.value.length < TAMANHO_MINIMO) {
    erro.value = `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.`;
    return;
  }
  if (novaSenha.value !== confirmacao.value) {
    erro.value = 'A confirmação não é igual à nova senha.';
    return;
  }

  enviando.value = true;
  try {
    await chamarApi<void>('/trocar-senha', {
      metodo: 'POST',
      corpo: { senhaAtual: senhaAtual.value, novaSenha: novaSenha.value },
    });

    // A troca derruba todas as sessões, inclusive esta: volta ao login com aviso.
    esquecerSessao();
    await router.push({ path: '/entrar', query: { aviso: 'senha-trocada' } });
  } catch (falha) {
    erro.value = falha instanceof ErroApi ? falha.message : 'Não foi possível trocar a senha.';
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div class="page-head">
    <h1>Trocar senha</h1>
  </div>

  <form class="card formulario" @submit.prevent="trocar">
    <p class="apoio">
      Ao trocar a senha, você sai de todos os aparelhos onde está logado e precisa entrar de novo.
    </p>

    <label>
      <span>Senha atual</span>
      <input v-model="senhaAtual" type="password" autocomplete="current-password" required />
    </label>

    <label>
      <span>Nova senha</span>
      <input v-model="novaSenha" type="password" autocomplete="new-password" required />
    </label>

    <label>
      <span>Confirmar nova senha</span>
      <input v-model="confirmacao" type="password" autocomplete="new-password" required />
    </label>

    <p v-if="erro" class="erro" role="alert">{{ erro }}</p>

    <div class="acoes">
      <button type="submit" class="primary" :disabled="enviando">
        {{ enviando ? 'Trocando…' : 'Trocar senha' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.formulario {
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
}

.apoio {
  margin: 0;
  color: var(--muted);
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 500;
}

.erro {
  margin: 0;
  color: #b42318;
}

.acoes {
  display: flex;
  justify-content: flex-end;
}
</style>
