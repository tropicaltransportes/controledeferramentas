<script setup lang="ts">
import { ref } from 'vue';
import { chamarApi, ErroApi } from '../api';
import type { Funcionario } from '../funcionarios';

const emit = defineEmits<{
  fechar: [];
  salvo: [funcionario: Funcionario];
}>();

const nome = ref('');
const funcao = ref('');
const erro = ref('');
const enviando = ref(false);

async function salvar() {
  erro.value = '';
  enviando.value = true;
  try {
    const criado = await chamarApi<Funcionario>('/funcionarios', {
      metodo: 'POST',
      corpo: { nome: nome.value, funcao: funcao.value },
    });
    emit('salvo', criado);
  } catch (falha) {
    erro.value = falha instanceof ErroApi ? falha.message : 'Não foi possível salvar o Funcionário.';
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div class="modal-bg" @click.self="emit('fechar')">
    <form class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-funcionario" @submit.prevent="salvar">
      <div class="mh">
        <h2 id="titulo-funcionario">Novo Funcionário</h2>
        <button type="button" class="x" aria-label="Fechar" @click="emit('fechar')">×</button>
      </div>

      <div class="mb form">
        <label class="full">
          Nome
          <input v-model="nome" required autofocus />
        </label>
        <label class="full">
          Função <span class="muted">(opcional)</span>
          <input v-model="funcao" placeholder="Ex.: Mecânico" />
        </label>
        <p v-if="erro" class="err full" role="alert">{{ erro }}</p>
      </div>

      <div class="mf">
        <button type="button" class="outline" @click="emit('fechar')">Cancelar</button>
        <button type="submit" class="primary" :disabled="enviando">Salvar</button>
      </div>
    </form>
  </div>
</template>
