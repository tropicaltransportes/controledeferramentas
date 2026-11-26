<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { chamarApi } from '../api';
import FormFuncionario from '../components/FormFuncionario.vue';
import { type Funcionario, iniciaisDe } from '../funcionarios';
import { versaoRetiradas } from '../retirada';

const router = useRouter();

const texto = ref('');
const lista = ref<Funcionario[] | null>(null);
const carregando = ref(false);
const erro = ref('');
const formAberto = ref(false);

// Só a resposta da última busca vale: digitar depressa não deixa um resultado antigo sobrescrever o novo.
let ultimaBusca = 0;

async function carregar() {
  const busca = ++ultimaBusca;
  const params = new URLSearchParams({ texto: texto.value.trim() });

  carregando.value = true;
  erro.value = '';
  try {
    const resposta = await chamarApi<{ itens: Funcionario[] }>(`/funcionarios?${params}`);
    if (busca === ultimaBusca) {
      lista.value = resposta.itens;
    }
  } catch {
    if (busca === ultimaBusca) {
      erro.value = 'Não foi possível carregar os Funcionários.';
    }
  } finally {
    if (busca === ultimaBusca) {
      carregando.value = false;
    }
  }
}

watch(texto, () => {
  clearTimeout(esperaBusca);
  esperaBusca = setTimeout(carregar, 300);
});

let esperaBusca: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(esperaBusca));

// Uma Retirada registrada muda a contagem em posse: a lista recarrega.
watch(versaoRetiradas, carregar);

void carregar();

function aoSalvar(funcionario: Funcionario) {
  formAberto.value = false;
  void router.push({ path: `/funcionarios/${funcionario.id}` });
}
</script>

<template>
  <div class="page-head">
    <h1>Funcionários</h1>
    <button type="button" class="primary nova" @click="formAberto = true">
      <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
      Novo Funcionário
    </button>
  </div>

  <div class="search-local">
    <input v-model="texto" type="search" aria-label="Buscar funcionário por nome" placeholder="Buscar funcionário por nome" />
  </div>

  <p v-if="erro" class="err" role="alert">{{ erro }}</p>

  <div v-if="lista && lista.length === 0 && !carregando" class="card empty">
    Nenhum Funcionário encontrado.
  </div>

  <div v-else-if="lista" class="grid">
    <RouterLink
      v-for="funcionario in lista"
      :key="funcionario.id"
      :to="`/funcionarios/${funcionario.id}`"
      class="tcard funcionario"
      :class="{ inativo: !funcionario.ativo }"
    >
      <span class="avatar" aria-hidden="true">{{ iniciaisDe(funcionario.nome) }}</span>
      <div class="bd">
        <b>{{ funcionario.nome }}</b>
        <span class="small muted">{{ funcionario.funcao ?? 'Sem função' }}</span>
        <span class="small">
          {{ funcionario.retiradasAbertas === 1 ? '1 Ferramenta em posse' : `${funcionario.retiradasAbertas} Ferramentas em posse` }}
        </span>
        <span v-if="funcionario.retiradasAtrasadas > 0" class="badge b-atr">
          {{ funcionario.retiradasAtrasadas === 1 ? '1 Atrasada' : `${funcionario.retiradasAtrasadas} Atrasadas` }}
        </span>
      </div>
      <span v-if="!funcionario.ativo" class="badge b-off">Inativo</span>
    </RouterLink>
  </div>

  <div v-else-if="carregando" class="card vazio">Carregando…</div>

  <FormFuncionario v-if="formAberto" @fechar="formAberto = false" @salvo="aoSalvar" />
</template>

<style scoped>
.nova {
  margin-left: auto;
}

.search-local {
  margin: 0 0 16px;
  max-width: 420px;
}

.funcionario {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
}

.funcionario.inativo {
  opacity: 0.7;
}

.funcionario .bd {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
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
  flex-shrink: 0;
}

@media (max-width: 760px) {
  .nova {
    margin-left: 0;
  }
}
</style>
