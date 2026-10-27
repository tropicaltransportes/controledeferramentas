<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { chamarApi, ErroApi } from '../api';
import FormFerramenta from '../components/FormFerramenta.vue';
import FotoFerramenta from '../components/FotoFerramenta.vue';
import { type Ferramenta, situacaoDe } from '../ferramentas';

const props = defineProps<{ numero: string }>();

type Aba = 'resumo' | 'historico' | 'problemas';

const ABAS: { valor: Aba; rotulo: string; vazio: string }[] = [
  { valor: 'resumo', rotulo: 'Resumo', vazio: 'Nenhuma Retirada registrada ainda.' },
  { valor: 'historico', rotulo: 'Histórico', vazio: 'Nenhuma Retirada registrada ainda.' },
  { valor: 'problemas', rotulo: 'Problemas', vazio: 'Nenhum Problema registrado.' },
];

const ficha = ref<Ferramenta | null>(null);
const carregando = ref(true);
const naoEncontrada = ref(false);
const erro = ref('');
const aba = ref<Aba>('resumo');
const editando = ref(false);

const abaAtual = computed(() => ABAS.find((item) => item.valor === aba.value) ?? ABAS[0]);

// Troca de Ficha (pelo histórico do navegador, por exemplo) recarrega os dados e volta para a primeira aba.
watch(
  () => props.numero,
  async (numero) => {
    ficha.value = null;
    naoEncontrada.value = false;
    erro.value = '';
    aba.value = 'resumo';
    carregando.value = true;

    try {
      ficha.value = await chamarApi<Ferramenta>(`/ferramentas/${encodeURIComponent(numero)}`);
    } catch (falha) {
      if (falha instanceof ErroApi && falha.status === 404) {
        naoEncontrada.value = true;
      } else {
        erro.value = 'Não foi possível abrir a Ficha.';
      }
    } finally {
      carregando.value = false;
    }
  },
  { immediate: true },
);

function aoSalvar(salva: Ferramenta) {
  ficha.value = salva;
  editando.value = false;
}

const itensTecnicos = computed<[string, string | null][]>(() => {
  const f = ficha.value;
  if (!f) {
    return [];
  }

  return [
    ['Categoria', f.categoria],
    ['Marca', f.marca],
    ['Modelo', f.modelo],
    ['Especificação', f.especificacao],
    ['Nº de série', f.numeroSerie],
    ['Aquisição', f.aquisicao],
    ['Observações', f.observacoes],
  ];
});
</script>

<template>
  <p class="crumb"><RouterLink to="/ferramentas">← Ferramentas</RouterLink></p>

  <div v-if="carregando" class="card vazio">Carregando…</div>

  <div v-else-if="naoEncontrada" class="card vazio">
    Ferramenta não encontrada. <RouterLink to="/ferramentas" class="link">Voltar ao catálogo</RouterLink>
  </div>

  <p v-else-if="erro" class="err" role="alert">{{ erro }}</p>

  <div v-else-if="ficha" class="detail">
    <section class="card">
      <div class="card-b">
        <div class="ph-grande">
          <FotoFerramenta
            :numero="ficha.numero"
            :tem-foto="ficha.temFoto"
            :atualizado-em="ficha.atualizadoEm"
            :alt="`Foto de ${ficha.nome}`"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
            </svg>
          </FotoFerramenta>
        </div>

        <h2 class="nome-ficha">{{ ficha.nome }}</h2>
        <span class="num">{{ ficha.numero }}</span>
        <div class="situacao">
          <span class="badge" :class="situacaoDe(ficha.situacao).classe">
            {{ situacaoDe(ficha.situacao).rotulo }}
          </span>
        </div>

        <dl class="specs">
          <template v-for="[rotulo, valor] in itensTecnicos" :key="rotulo">
            <dt>{{ rotulo }}</dt>
            <dd>{{ valor || '—' }}</dd>
          </template>
        </dl>

        <button type="button" class="outline editar" @click="editando = true">Editar ficha</button>
      </div>
    </section>

    <section class="card">
      <div class="tabs" role="tablist">
        <button
          v-for="item in ABAS"
          :key="item.valor"
          type="button"
          role="tab"
          class="tab"
          :class="{ on: aba === item.valor }"
          :aria-selected="aba === item.valor"
          @click="aba = item.valor"
        >
          {{ item.rotulo }}
        </button>
      </div>

      <div class="card-b">
        <p class="empty" role="tabpanel">{{ abaAtual.vazio }}</p>
      </div>
    </section>
  </div>

  <FormFerramenta v-if="editando && ficha" :ferramenta="ficha" @fechar="editando = false" @salvo="aoSalvar" />
</template>

<style scoped>
.crumb {
  margin: 0 0 12px;
  font-size: 13px;
}

.crumb a:hover,
.link {
  color: var(--brand);
}

.nome-ficha {
  margin: 14px 0 4px;
  font-size: 18px;
}

.situacao {
  margin: 8px 0 0;
}

.ph-grande {
  height: 140px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  background: var(--brand-soft);
  color: var(--brand);
}

.ph-grande svg {
  width: 56px;
  height: 56px;
}

.editar {
  margin-top: 18px;
  width: 100%;
  justify-content: center;
}
</style>
