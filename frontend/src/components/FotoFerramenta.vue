<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { buscarFoto } from '../ferramentas';

// Mostra a foto da Ferramenta. Sem foto, ou se ela não carregar, aparece o conteúdo do slot (o ícone da categoria).
const props = defineProps<{ numero: string; temFoto: boolean; atualizadoEm: string; alt: string }>();

const url = ref<string | null>(null);
// Cada troca de Ferramenta ou de foto invalida o carregamento anterior, que pode chegar depois.
let versao = 0;

function soltarUrl() {
  if (url.value) {
    URL.revokeObjectURL(url.value);
    url.value = null;
  }
}

watch(
  () => [props.numero, props.temFoto, props.atualizadoEm] as const,
  async ([numero, temFoto]) => {
    const atual = ++versao;
    soltarUrl();

    if (!temFoto) {
      return;
    }

    try {
      const foto = await buscarFoto(numero);
      if (atual === versao) {
        url.value = URL.createObjectURL(foto);
      }
    } catch {
      // Sem foto na tela: o slot com o ícone da categoria continua aparecendo.
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  versao++;
  soltarUrl();
});
</script>

<template>
  <img v-if="url" :src="url" :alt="alt" class="foto-ferramenta" />
  <slot v-else />
</template>
