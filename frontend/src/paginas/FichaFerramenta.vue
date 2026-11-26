<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { chamarApi, ErroApi } from '../api';
import FormFerramenta from '../components/FormFerramenta.vue';
import FotoFerramenta from '../components/FotoFerramenta.vue';
import { abrirDevolucao } from '../devolucao';
import { type Ferramenta, situacaoDe } from '../ferramentas';
import {
  type HistoricoFerramenta,
  type Registro,
  registroDaRetirada,
  registroDoProblema,
  tempoFora,
} from '../historico';
import { abrirRetirada, versaoRetiradas } from '../retirada';
import { sessao } from '../sessao';

const props = defineProps<{ numero: string }>();

type Aba = 'resumo' | 'historico' | 'problemas';

const ABAS: { valor: Aba; rotulo: string; vazio: string }[] = [
  { valor: 'resumo', rotulo: 'Resumo', vazio: 'Nenhuma Retirada registrada ainda.' },
  { valor: 'historico', rotulo: 'Histórico', vazio: 'Nenhuma Retirada registrada ainda.' },
  { valor: 'problemas', rotulo: 'Problemas', vazio: 'Nenhum Problema registrado.' },
];

const ficha = ref<Ferramenta | null>(null);
const historico = ref<HistoricoFerramenta | null>(null);
const carregando = ref(true);
const naoEncontrada = ref(false);
const erro = ref('');
const aba = ref<Aba>('resumo');
const editando = ref(false);

const abaAtual = computed(() => ABAS.find((item) => item.valor === aba.value) ?? ABAS[0]);

const podeRetirar = computed(() => sessao.usuario?.papel === 'almoxarife');

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

// Troca de Ficha (pelo histórico do navegador, por exemplo) ou uma Retirada registrada recarrega os dados.
// Ao trocar de Ficha, volta para a primeira aba.
watch(
  () => [props.numero, versaoRetiradas.value] as const,
  async ([numero]) => {
    ficha.value = null;
    historico.value = null;
    naoEncontrada.value = false;
    erro.value = '';
    aba.value = 'resumo';
    carregando.value = true;

    try {
      const caminho = `/ferramentas/${encodeURIComponent(numero)}`;
      ficha.value = await chamarApi<Ferramenta>(caminho);
      // Histórico em falta não derruba a Ficha: a aba mostra o aviso no lugar dos registros.
      historico.value = await chamarApi<HistoricoFerramenta>(`${caminho}/historico`).catch(() => null);
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

// Resumo mostra só os 3 registros mais recentes, de Retiradas e Problemas juntos;
// Histórico e Problemas mostram tudo do seu tipo.
const registros = computed<Registro[]>(() => {
  const dados = historico.value;
  if (!dados) {
    return [];
  }

  if (aba.value === 'problemas') {
    return dados.problemas.map(registroDoProblema);
  }

  const retiradas = dados.retiradas.map(registroDaRetirada);
  if (aba.value === 'historico') {
    return retiradas;
  }

  return [...retiradas, ...dados.problemas.map(registroDoProblema)]
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 3);
});

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

        <p v-if="ficha.responsavel" class="posse small">
          Com <b>{{ ficha.responsavel.nome }}</b> desde {{ dataCurta(ficha.responsavel.retiradaEm) }}
        </p>

        <button
          v-if="podeRetirar && ficha.situacao === 'no_almoxarifado'"
          type="button"
          class="primary retirar"
          @click="abrirRetirada({ numero: ficha.numero })"
        >
          Registrar Retirada
        </button>

        <button
          v-if="podeRetirar && ficha.responsavel"
          type="button"
          class="outline retirar"
          @click="abrirDevolucao({ numero: ficha.numero })"
        >
          Devolver
        </button>

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

      <div class="card-b" role="tabpanel">
        <dl v-if="aba === 'resumo' && historico" class="numeros">
          <div>
            <dt>Retiradas</dt>
            <dd>{{ historico.resumo.totalRetiradas }}</dd>
          </div>
          <div>
            <dt>Problemas</dt>
            <dd>{{ historico.resumo.totalProblemas }}</dd>
          </div>
          <div>
            <dt>Funcionários que usaram</dt>
            <dd>{{ historico.resumo.funcionariosQueUsaram }}</dd>
          </div>
          <div>
            <dt>Tempo total fora</dt>
            <dd>{{ tempoFora(historico.resumo.tempoForaMs) }}</dd>
          </div>
        </dl>

        <p v-if="ficha && !historico" class="err" role="alert">Não foi possível carregar o histórico desta Ferramenta.</p>

        <template v-else-if="historico">
          <h3 v-if="aba === 'resumo'" class="subtitulo">Últimos registros</h3>
          <ul v-if="registros.length" class="registros">
            <li v-for="registro in registros" :key="registro.chave" class="registro">
              <b>{{ registro.titulo }}</b>
              <span class="small muted">{{ registro.detalhe }}</span>
              <span class="badge" :class="registro.classe">{{ registro.situacao }}</span>
            </li>
          </ul>
          <p v-else class="empty">{{ abaAtual.vazio }}</p>
        </template>
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

.posse {
  margin: 10px 0 0;
}

.retirar {
  margin-top: 14px;
  width: 100%;
  justify-content: center;
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

.numeros {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin: 0 0 18px;
}

.numeros div {
  padding: 12px;
  border-radius: 10px;
  background: var(--bg);
}

.numeros dt {
  font-size: 12px;
  color: var(--muted);
}

.numeros dd {
  margin: 4px 0 0;
  font-size: 20px;
  font-weight: 700;
}

.subtitulo {
  margin: 0 0 8px;
  font-size: 14px;
}

.registros {
  list-style: none;
  margin: 0;
  padding: 0;
}

.registro {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}

.registro:last-child {
  border-bottom: 0;
}

.registro .badge {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
}

.registro .small {
  grid-column: 1 / -1;
}

.editar {
  margin-top: 18px;
  width: 100%;
  justify-content: center;
}
</style>
