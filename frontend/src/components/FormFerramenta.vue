<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { chamarApi, ErroApi } from '../api';
import { camposDe, carregarCategorias, type CamposFerramenta, enviarFoto, type Ferramenta } from '../ferramentas';
import { reduzirFoto } from '../foto';
import FotoFerramenta from './FotoFerramenta.vue';

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

// Ficha já gravada neste formulário. Se só a foto falhar, a próxima tentativa edita em vez de cadastrar de novo.
const fichaSalva = ref<Ferramenta | null>(null);
const fichaFoto = computed(() => fichaSalva.value ?? props.ferramenta ?? null);

// Foto escolhida e já reduzida, ainda não enviada. Só vai para a API ao salvar.
const fotoNova = ref<Blob | null>(null);
const previaFoto = ref<string | null>(null);
const reduzindo = ref(false);
const entradaArquivo = ref<HTMLInputElement | null>(null);
const entradaCamera = ref<HTMLInputElement | null>(null);

const ocupado = computed(() => enviando.value || reduzindo.value);
const temFoto = computed(() => previaFoto.value !== null || Boolean(fichaFoto.value?.temFoto));

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

onBeforeUnmount(() => {
  if (previaFoto.value) {
    URL.revokeObjectURL(previaFoto.value);
  }
});

async function escolherFoto(evento: Event) {
  const entrada = evento.target as HTMLInputElement;
  const arquivo = entrada.files?.[0];
  // Zera o campo para o mesmo arquivo poder ser escolhido de novo.
  entrada.value = '';
  if (!arquivo) {
    return;
  }

  erro.value = '';
  reduzindo.value = true;
  try {
    const reduzida = await reduzirFoto(arquivo);
    if (previaFoto.value) {
      URL.revokeObjectURL(previaFoto.value);
    }

    fotoNova.value = reduzida;
    previaFoto.value = URL.createObjectURL(reduzida);
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : 'Não foi possível usar esta foto.';
  } finally {
    reduzindo.value = false;
  }
}

async function salvar() {
  erro.value = '';
  enviando.value = true;

  try {
    let salva: Ferramenta;
    if (edicao || fichaSalva.value) {
      salva = await chamarApi<Ferramenta>(`/ferramentas/${encodeURIComponent(campos.numero)}`, {
        metodo: 'PUT',
        corpo: campos,
      });
    } else {
      salva = await chamarApi<Ferramenta>('/ferramentas', { metodo: 'POST', corpo: campos });
      fichaSalva.value = salva;
    }

    if (fotoNova.value) {
      salva = await enviarFoto(salva.numero, fotoNova.value);
    }

    emit('salvo', salva);
  } catch (falha) {
    const mensagem = falha instanceof ErroApi ? falha.message : 'Não foi possível salvar. Tente de novo.';
    erro.value = fichaSalva.value
      ? `A Ficha foi salva, mas a foto não: ${mensagem}`
      : mensagem;
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
        <div class="foto-campo full">
          <div class="foto-quadro">
            <img v-if="previaFoto" :src="previaFoto" alt="Pré-visualização da foto" class="foto-ferramenta" />
            <FotoFerramenta
              v-else-if="fichaFoto"
              :numero="fichaFoto.numero"
              :tem-foto="fichaFoto.temFoto"
              :atualizado-em="fichaFoto.atualizadoEm"
              alt="Foto da Ferramenta"
            >
              <svg class="icone" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
              </svg>
            </FotoFerramenta>
            <svg v-else class="icone" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
            </svg>
          </div>

          <div class="foto-acoes">
            <button type="button" class="outline" :disabled="ocupado" @click="entradaArquivo?.click()">
              {{ temFoto ? 'Trocar foto' : 'Adicionar foto' }}
            </button>
            <button type="button" class="ghost" :disabled="ocupado" @click="entradaCamera?.click()">Tirar foto</button>
            <span v-if="reduzindo" class="small muted">Reduzindo a foto…</span>
          </div>

          <input ref="entradaArquivo" type="file" accept="image/*" hidden @change="escolherFoto" />
          <input ref="entradaCamera" type="file" accept="image/*" capture="environment" hidden @change="escolherFoto" />
        </div>

        <label>
          <span>Número</span>
          <input v-model="campos.numero" :readonly="edicao || fichaSalva !== null" required placeholder="F-000" />
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
        <button type="submit" class="primary" :disabled="ocupado">
          {{ enviando ? 'Salvando…' : 'Salvar' }}
        </button>
      </div>
    </form>
  </div>
</template>
