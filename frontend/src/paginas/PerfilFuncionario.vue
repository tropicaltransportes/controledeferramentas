<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { chamarApi, ErroApi } from '../api';
import { abrirDevolucao } from '../devolucao';
import { classeResultado, dataHora, type RetiradaHistorico, rotuloResultado } from '../historico';
import { type Funcionario, iniciaisDe } from '../funcionarios';
import { abrirRetirada, versaoRetiradas } from '../retirada';
import { sessao } from '../sessao';

const props = defineProps<{ id: number }>();

interface FerramentaEmPosse {
  numero: string;
  nome: string;
  categoria: string;
  retiradaEm: string;
  /** Retirada já depois do prazo do Expediente. Vêm primeiro na lista. */
  atrasada: boolean;
}

interface PerfilDoFuncionario extends Funcionario {
  ferramentasEmPosse: FerramentaEmPosse[];
  historico: RetiradaHistorico[];
}

type Aba = 'ferramentas' | 'historico';

const ABAS: { valor: Aba; rotulo: string; vazio: string }[] = [
  { valor: 'ferramentas', rotulo: 'Ferramentas em posse', vazio: 'Nenhuma Ferramenta em posse no momento.' },
  { valor: 'historico', rotulo: 'Histórico', vazio: 'Nenhuma Retirada registrada ainda.' },
];

const perfil = ref<PerfilDoFuncionario | null>(null);
const carregando = ref(true);
const naoEncontrado = ref(false);
const erro = ref('');
const aviso = ref('');
const aba = ref<Aba>('ferramentas');
const salvando = ref(false);

const abaAtual = computed(() => ABAS.find((item) => item.valor === aba.value) ?? ABAS[0]);
const podeRetirar = computed(() => sessao.usuario?.papel === 'almoxarife');

// Problemas e Extravios do Funcionário, contados sobre as Retiradas dele (o histórico já traz o resultado).
const contagens = computed(() => {
  const historico = perfil.value?.historico ?? [];
  return {
    problemas: historico.filter((item) => item.resultado === 'com_problema').length,
    extravios: historico.filter((item) => item.resultado === 'extraviada').length,
  };
});

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

async function carregarPerfil(id: number) {
  try {
    perfil.value = await chamarApi<PerfilDoFuncionario>(`/funcionarios/${id}`);
  } catch (falha) {
    if (falha instanceof ErroApi && falha.status === 404) {
      naoEncontrado.value = true;
    } else if (!(falha instanceof ErroApi && falha.status === 401)) {
      erro.value = 'Não foi possível carregar o Funcionário.';
    }
  }
}

// Troca de perfil (pelo histórico do navegador, por exemplo) ou uma Retirada registrada recarrega os dados.
// Ao trocar de perfil, volta para a primeira aba.
watch(
  () => [props.id, versaoRetiradas.value] as const,
  async ([id], anterior) => {
    if (anterior && anterior[0] !== id) {
      aba.value = 'ferramentas';
    }

    if (!anterior || anterior[0] !== id) {
      perfil.value = null;
      naoEncontrado.value = false;
      erro.value = '';
      aviso.value = '';
      carregando.value = true;
    }

    await carregarPerfil(id);
    carregando.value = false;
  },
  { immediate: true },
);

async function alterarSituacao() {
  if (!perfil.value) {
    return;
  }

  const novaSituacao = !perfil.value.ativo;
  salvando.value = true;
  erro.value = '';
  aviso.value = '';
  try {
    const atualizado = await chamarApi<Funcionario>(`/funcionarios/${props.id}`, {
      metodo: 'PUT',
      corpo: { ativo: novaSituacao },
    });

    await carregarPerfil(props.id);
    if (!novaSituacao && atualizado.retiradasAbertas > 0) {
      aviso.value = `${atualizado.retiradasAbertas} Retirada(s) continuam abertas com este Funcionário.`;
    }
  } catch {
    erro.value = 'Não foi possível alterar a situação do Funcionário.';
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <div v-if="carregando" class="card vazio">Carregando…</div>

  <div v-else-if="naoEncontrado" class="card empty">Funcionário não encontrado.</div>

  <p v-else-if="erro && !perfil" class="err" role="alert">{{ erro }}</p>

  <div v-else-if="perfil" class="detail">
    <aside class="card coluna">
      <span class="avatar grande" aria-hidden="true">{{ iniciaisDe(perfil.nome) }}</span>
      <h1>{{ perfil.nome }}</h1>
      <p class="muted">{{ perfil.funcao ?? 'Sem função' }}</p>
      <span class="badge" :class="perfil.ativo ? 'b-disp' : 'b-off'">
        {{ perfil.ativo ? 'Ativo' : 'Inativo' }}
      </span>
      <span v-if="perfil.retiradasAtrasadas > 0" class="badge b-atr">
        {{ perfil.retiradasAtrasadas === 1 ? '1 Atrasada' : `${perfil.retiradasAtrasadas} Atrasadas` }}
      </span>
      <span v-if="contagens.problemas > 0" class="badge b-prob">
        {{ contagens.problemas === 1 ? '1 Problema' : `${contagens.problemas} Problemas` }}
      </span>
      <span v-if="contagens.extravios > 0" class="badge b-off">
        {{ contagens.extravios === 1 ? '1 Extravio' : `${contagens.extravios} Extravios` }}
      </span>

      <button
        v-if="podeRetirar && perfil.ativo"
        type="button"
        class="primary"
        @click="abrirRetirada({ funcionarioId: perfil.id })"
      >
        Registrar Retirada
      </button>

      <button type="button" :class="perfil.ativo ? 'outline' : 'primary'" :disabled="salvando" @click="alterarSituacao">
        {{ perfil.ativo ? 'Marcar como Inativo' : 'Reativar' }}
      </button>

      <p v-if="aviso" class="small" role="status">{{ aviso }}</p>
      <p v-if="erro" class="err" role="alert">{{ erro }}</p>
    </aside>

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
        <ul v-if="aba === 'ferramentas' && perfil.ferramentasEmPosse.length" class="posse-lista">
          <li v-for="ferramenta in perfil.ferramentasEmPosse" :key="ferramenta.numero" class="posse-linha">
            <RouterLink :to="`/ferramentas/${encodeURIComponent(ferramenta.numero)}`" class="posse-item">
              <span class="num">{{ ferramenta.numero }}</span>
              <b>{{ ferramenta.nome }}</b>
              <span v-if="ferramenta.atrasada" class="badge b-atr">Atrasada</span>
              <span class="small muted">desde {{ dataCurta(ferramenta.retiradaEm) }}</span>
            </RouterLink>
            <button
              v-if="podeRetirar"
              type="button"
              class="outline"
              @click="abrirDevolucao({ numero: ferramenta.numero })"
            >
              Devolver
            </button>
          </li>
        </ul>
        <ul v-else-if="aba === 'historico' && perfil.historico.length" class="posse-lista">
          <li v-for="item in perfil.historico" :key="item.id" class="posse-linha">
            <div class="posse-item">
              <span class="num">{{ item.ferramenta.numero }}</span>
              <b>{{ item.ferramenta.nome }}</b>
              <span class="small muted">
                retirada em {{ dataHora(item.retiradaEm) }}<template v-if="item.devolvidaEm"> · devolvida em {{ dataHora(item.devolvidaEm) }}</template>
              </span>
            </div>
            <span class="badge" :class="classeResultado(item.resultado)">{{ rotuloResultado(item.resultado) }}</span>
          </li>
        </ul>
        <p v-else class="muted">{{ abaAtual.vazio }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.coluna {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
}

.coluna h1 {
  font-size: 20px;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 700;
}

.avatar.grande {
  width: 96px;
  height: 96px;
  font-size: 32px;
}

.posse-lista {
  list-style: none;
  margin: 0;
  padding: 0;
}

.posse-linha {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--line);
}

.posse-item {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 0;
}
</style>
