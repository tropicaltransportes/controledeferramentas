<script setup lang="ts">
import { ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { chamarApi } from '../api';
import FormFerramenta from '../components/FormFerramenta.vue';
import {
  CATEGORIAS,
  FILTROS,
  type Filtro,
  type Ferramenta,
  type ListaFerramentas,
  situacaoDe,
} from '../ferramentas';

const router = useRouter();

const situacao = ref<Filtro>('todas');
const categoria = ref('');
const texto = ref('');
const modo = ref<'cartoes' | 'lista'>('cartoes');
const dados = ref<ListaFerramentas | null>(null);
const carregando = ref(false);
const erro = ref('');
const formAberto = ref(false);

// Só a resposta da última busca vale: digitar depressa não deixa um resultado antigo sobrescrever o novo.
let ultimaBusca = 0;

async function carregar() {
  const busca = ++ultimaBusca;
  const params = new URLSearchParams({ situacao: situacao.value, texto: texto.value.trim() });
  if (categoria.value) {
    params.set('categoria', categoria.value);
  }

  carregando.value = true;
  erro.value = '';
  try {
    const resposta = await chamarApi<ListaFerramentas>(`/ferramentas?${params}`);
    if (busca === ultimaBusca) {
      dados.value = resposta;
    }
  } catch {
    if (busca === ultimaBusca) {
      erro.value = 'Não foi possível carregar as Ferramentas.';
    }
  } finally {
    if (busca === ultimaBusca) {
      carregando.value = false;
    }
  }
}

watch([situacao, categoria, texto], carregar, { immediate: true });

function aoSalvar(ferramenta: Ferramenta) {
  formAberto.value = false;
  void carregar();
  void router.push({ path: `/ferramentas/${encodeURIComponent(ferramenta.numero)}` });
}
</script>

<template>
  <div class="page-head">
    <h1>Ferramentas</h1>
    <button type="button" class="primary nova" @click="formAberto = true">
      <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
      Nova Ferramenta
    </button>
  </div>

  <div class="toolbar">
    <div class="pills" role="group" aria-label="Filtrar por situação">
      <button
        v-for="filtro in FILTROS"
        :key="filtro.valor"
        type="button"
        class="pill"
        :class="{ on: situacao === filtro.valor }"
        :aria-pressed="situacao === filtro.valor"
        @click="situacao = filtro.valor"
      >
        {{ filtro.rotulo }}
        <b>{{ dados?.contagens[filtro.valor] ?? 0 }}</b>
      </button>
    </div>

    <div class="right">
      <select v-model="categoria" aria-label="Categoria">
        <option value="">Todas as categorias</option>
        <option v-for="item in CATEGORIAS" :key="item" :value="item">{{ item }}</option>
      </select>

      <div class="seg" role="group" aria-label="Modo de exibição">
        <button type="button" :class="{ on: modo === 'cartoes' }" :aria-pressed="modo === 'cartoes'" @click="modo = 'cartoes'">
          Cartões
        </button>
        <button type="button" :class="{ on: modo === 'lista' }" :aria-pressed="modo === 'lista'" @click="modo = 'lista'">
          Lista
        </button>
      </div>
    </div>
  </div>

  <div class="search-local">
    <input v-model="texto" type="search" aria-label="Buscar por número, nome, marca ou modelo" placeholder="Buscar por número, nome, marca ou modelo" />
  </div>

  <p v-if="erro" class="err" role="alert">{{ erro }}</p>

  <div v-if="dados && dados.itens.length === 0 && !carregando" class="card empty">
    Nenhuma Ferramenta encontrada com estes filtros.
  </div>

  <div v-else-if="dados && modo === 'cartoes'" class="grid">
    <RouterLink
      v-for="ferramenta in dados.itens"
      :key="ferramenta.numero"
      :to="`/ferramentas/${encodeURIComponent(ferramenta.numero)}`"
      class="tcard"
      :class="{ atr: ferramenta.situacao === 'atrasada' }"
    >
      <div class="ph">
        <svg class="icone" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
        </svg>
        <span class="badge" :class="situacaoDe(ferramenta.situacao).classe">
          {{ situacaoDe(ferramenta.situacao).rotulo }}
        </span>
      </div>
      <div class="bd">
        <span class="num">{{ ferramenta.numero }}</span>
        <b>{{ ferramenta.nome }}</b>
        <span class="small muted">{{ ferramenta.categoria }}<template v-if="ferramenta.marca"> · {{ ferramenta.marca }}</template></span>
      </div>
    </RouterLink>
  </div>

  <div v-else-if="dados" class="card lista">
    <RouterLink
      v-for="ferramenta in dados.itens"
      :key="ferramenta.numero"
      :to="`/ferramentas/${encodeURIComponent(ferramenta.numero)}`"
      class="linha"
    >
      <span class="num">{{ ferramenta.numero }}</span>
      <b class="nome">{{ ferramenta.nome }}</b>
      <span class="small muted">{{ ferramenta.categoria }}</span>
      <span class="badge" :class="situacaoDe(ferramenta.situacao).classe">
        {{ situacaoDe(ferramenta.situacao).rotulo }}
      </span>
    </RouterLink>
  </div>

  <div v-else-if="carregando" class="card vazio">Carregando…</div>

  <FormFerramenta v-if="formAberto" @fechar="formAberto = false" @salvo="aoSalvar" />
</template>

<style scoped>
.nova {
  margin-left: auto;
}

.search-local {
  margin: 0 0 16px;
  max-width: 420px;
}

.icone {
  width: 40px;
  height: 40px;
  color: var(--brand);
}

.lista {
  overflow: hidden;
}

.linha {
  display: grid;
  grid-template-columns: 90px 1fr auto auto;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
}

.linha:last-child {
  border-bottom: 0;
}

.linha:hover {
  background: var(--bg);
}

.linha .nome {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .nova {
    margin-left: 0;
  }

  .linha {
    grid-template-columns: 70px 1fr;
  }

  .linha .small {
    display: none;
  }

  .linha .badge {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
