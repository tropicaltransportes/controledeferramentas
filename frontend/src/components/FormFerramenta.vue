<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { chamarApi, ErroApi } from '../api';
import { camposDe, carregarCategorias, type CamposFerramenta, type Ferramenta } from '../ferramentas';

// Sem `ferramenta` o formulário cadastra e sugere o próximo Número; com ela, edita a Ficha (o Número fica travado).
const props = defineProps<{ ferramenta?: Ferramenta }>();
const emit = defineEmits<{
  fechar: [];
  salvo: [ferramenta: Ferramenta];
}>();

const edicao = Boolean(props.ferramenta);
const campos = reactive<CamposFerramenta>(
  props.ferramenta
    ? camposDe(props.ferramenta)
    : {
        numero: '',
        nome: '',
        categoria: 'Geral',
        marca: '',
        modelo: '',
        especificacao: '',
        numeroSerie: '',
        aquisicao: '',
        observacoes: '',
      },
);
const erro = ref('');
const enviando = ref(false);
const categorias = ref<string[]>([]);

onMounted(async () => {
  try {
    categorias.value = await carregarCategorias();
    if (!edicao) {
      campos.numero = (await chamarApi<{ numero: string }>('/ferramentas/proximo-numero')).numero;
    }
  } catch {
    erro.value = 'Não foi possível carregar o formulário. Tente de novo.';
  }
});

async function salvar() {
  erro.value = '';
  enviando.value = true;

  try {
    const salva = edicao
      ? await chamarApi<Ferramenta>(`/ferramentas/${encodeURIComponent(campos.numero)}`, {
          metodo: 'PUT',
          corpo: campos,
        })
      : await chamarApi<Ferramenta>('/ferramentas', { metodo: 'POST', corpo: campos });
    emit('salvo', salva);
  } catch (falha) {
    erro.value = falha instanceof ErroApi ? falha.message : 'Não foi possível salvar. Tente de novo.';
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div class="modal-bg" @click.self="emit('fechar')">
    <form class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-form" @submit.prevent="salvar">
      <div class="mh">
        <span class="ico" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" /></svg>
        </span>
        <h2 id="titulo-form">{{ edicao ? 'Editar ficha' : 'Nova Ferramenta' }}</h2>
        <button type="button" class="x" aria-label="Fechar" @click="emit('fechar')">×</button>
      </div>

      <div class="mb form">
        <label>
          <span>Número</span>
          <input v-model="campos.numero" :readonly="edicao" required placeholder="F-000" />
        </label>

        <label>
          <span>Categoria</span>
          <select v-model="campos.categoria" required>
            <option v-for="categoria in categorias" :key="categoria" :value="categoria">{{ categoria }}</option>
          </select>
        </label>

        <label class="full">
          <span>Nome</span>
          <input v-model="campos.nome" required />
        </label>

        <label>
          <span>Marca</span>
          <input v-model="campos.marca" />
        </label>

        <label>
          <span>Modelo</span>
          <input v-model="campos.modelo" />
        </label>

        <label class="full">
          <span>Especificação</span>
          <input v-model="campos.especificacao" />
        </label>

        <label>
          <span>Nº de série</span>
          <input v-model="campos.numeroSerie" />
        </label>

        <label>
          <span>Aquisição</span>
          <input v-model="campos.aquisicao" placeholder="mês/ano" />
        </label>

        <label class="full">
          <span>Observações</span>
          <textarea v-model="campos.observacoes" rows="3" />
        </label>

        <p v-if="erro" class="err full" role="alert">{{ erro }}</p>
      </div>

      <div class="mf">
        <button type="button" class="ghost" @click="emit('fechar')">Cancelar</button>
        <button type="submit" class="primary" :disabled="enviando">
          {{ enviando ? 'Salvando…' : 'Salvar' }}
        </button>
      </div>
    </form>
  </div>
</template>
