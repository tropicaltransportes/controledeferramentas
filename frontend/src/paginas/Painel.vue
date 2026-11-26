<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { chamarApi, ErroApi } from '../api';
import { versaoRetiradas } from '../retirada';

interface Pessoa {
  id: number;
  nome: string;
}

interface Painel {
  indicadores: {
    foraAgora: number;
    atrasadas: number;
    comProblema: number;
    noAlmoxarifado: number;
    retiradasHoje: number;
    funcionariosComFerramenta: number;
  };
  atrasadas: { ferramenta: { numero: string; nome: string }; responsavel: Pessoa; retiradaEm: string }[];
  atividades: {
    tipo: 'retirada' | 'devolucao_ok' | 'devolucao_com_problema' | 'extraviada';
    em: string;
    funcionario: Pessoa;
    ferramenta: { numero: string; nome: string };
    descricao: string | null;
  }[];
  maisRetiradas: { funcionario: Pessoa; total: number }[];
}

const dados = ref<Painel | null>(null);
const erro = ref('');
// "Agora" da tela: fixado a cada carga, para o "há quanto tempo" não mudar sozinho entre uma atualização e outra.
const agora = ref(Date.now());

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const ROTULOS_ATIVIDADE: Record<Painel['atividades'][number]['tipo'], string> = {
  retirada: 'Retirada',
  devolucao_ok: 'Devolução OK',
  devolucao_com_problema: 'Devolução Com Problema',
  extraviada: 'Extraviada',
};

async function carregar() {
  erro.value = '';
  try {
    dados.value = await chamarApi<Painel>('/painel');
    agora.value = Date.now();
  } catch (falha) {
    erro.value = falha instanceof ErroApi ? falha.message : 'Não foi possível carregar o Painel.';
  }
}

// Uma Retirada, Devolução ou destino muda os números: o Painel recarrega.
watch(versaoRetiradas, carregar);
void carregar();

/** "há 2 h", "há 3 dias" etc., a partir do instante da Retirada. */
function haQuanto(instante: string): string {
  const minutos = Math.max(0, Math.floor((agora.value - Date.parse(instante)) / 60_000));
  if (minutos < 60) {
    return `há ${minutos} min`;
  }

  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    return `há ${horas} h`;
  }

  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

function quando(instante: string): string {
  return FORMATO_DATA.format(new Date(instante)).replace(',', '');
}

const maiorRanking = computed(() => Math.max(1, ...(dados.value?.maisRetiradas.map((item) => item.total) ?? [])));

const indicadores = computed(() => {
  const i = dados.value?.indicadores;
  if (!i) {
    return [];
  }

  return [
    { rotulo: 'Fora agora', valor: i.foraAgora, destino: { path: '/ferramentas', query: { situacao: 'fora' } } },
    { rotulo: 'Retiradas Atrasadas', valor: i.atrasadas, destino: { path: '/ferramentas', query: { situacao: 'atrasada' } }, alerta: i.atrasadas > 0 },
    { rotulo: 'Com Problema', valor: i.comProblema, destino: { path: '/ferramentas', query: { situacao: 'com_problema' } } },
    { rotulo: 'No almoxarifado', valor: i.noAlmoxarifado, destino: { path: '/ferramentas', query: { situacao: 'no_almoxarifado' } } },
    { rotulo: 'Retiradas hoje', valor: i.retiradasHoje, destino: null },
    { rotulo: 'Funcionários com Ferramenta', valor: i.funcionariosComFerramenta, destino: { path: '/funcionarios' } },
  ];
});
</script>

<template>
  <div class="page-head">
    <h1>Painel</h1>
  </div>

  <p v-if="erro" class="err" role="alert">{{ erro }}</p>

  <template v-if="dados">
    <section class="card-b" aria-label="Visão geral">
      <h2>Visão geral</h2>
      <div class="grid">
        <template v-for="indicador in indicadores" :key="indicador.rotulo">
          <RouterLink v-if="indicador.destino" :to="indicador.destino" class="card indicador" :class="{ alerta: indicador.alerta }">
            <span class="muted small">{{ indicador.rotulo }}</span>
            <strong class="num">{{ indicador.valor }}</strong>
          </RouterLink>
          <div v-else class="card indicador">
            <span class="muted small">{{ indicador.rotulo }}</span>
            <strong class="num">{{ indicador.valor }}</strong>
          </div>
        </template>
      </div>
    </section>

    <section class="card-b" aria-label="Retiradas Atrasadas">
      <h2>Retiradas Atrasadas</h2>
      <p v-if="dados.atrasadas.length === 0" class="muted">Nenhuma Retirada atrasada.</p>
      <ul v-else class="lista">
        <li v-for="item in dados.atrasadas" :key="item.ferramenta.numero + item.retiradaEm">
          <RouterLink :to="`/ferramentas/${item.ferramenta.numero}`">{{ item.ferramenta.numero }} · {{ item.ferramenta.nome }}</RouterLink>
          <span>
            <RouterLink :to="`/funcionarios/${item.responsavel.id}`">{{ item.responsavel.nome }}</RouterLink>
            <span class="muted small"> {{ haQuanto(item.retiradaEm) }}</span>
          </span>
        </li>
      </ul>
    </section>

    <section class="card-b" aria-label="Últimas atividades">
      <h2>Últimas atividades</h2>
      <p v-if="dados.atividades.length === 0" class="muted">Nenhuma atividade ainda.</p>
      <ul v-else class="lista">
        <li v-for="(item, indice) in dados.atividades" :key="indice">
          <span>
            <strong>{{ ROTULOS_ATIVIDADE[item.tipo] }}</strong>
            · {{ item.ferramenta.numero }} · {{ item.funcionario.nome }}
            <span v-if="item.descricao" class="muted small"> — {{ item.descricao }}</span>
          </span>
          <span class="muted small">{{ quando(item.em) }}</span>
        </li>
      </ul>
    </section>

    <section class="card-b" aria-label="Mais retiradas">
      <h2>Mais retiradas (30 dias)</h2>
      <p v-if="dados.maisRetiradas.length === 0" class="muted">Nenhuma Retirada nos últimos 30 dias.</p>
      <ul v-else class="lista">
        <li v-for="item in dados.maisRetiradas" :key="item.funcionario.id">
          <RouterLink :to="`/funcionarios/${item.funcionario.id}`">{{ item.funcionario.nome }}</RouterLink>
          <span class="barra" :style="{ width: `${(item.total / maiorRanking) * 100}%` }" aria-hidden="true"></span>
          <strong class="num">{{ item.total }}</strong>
        </li>
      </ul>
    </section>
  </template>
</template>

<style scoped>
.indicador {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-decoration: none;
  color: inherit;
}

.indicador.alerta .num {
  color: var(--red, #c62828);
}

.lista {
  list-style: none;
  margin: 0;
  padding: 0;
}

.lista li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.barra {
  display: inline-block;
  height: 8px;
  background: currentColor;
  opacity: 0.4;
  border-radius: 4px;
  flex: 1;
  margin: 0 12px;
}
</style>
