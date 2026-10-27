<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { chamarApi, ErroApi } from '../api';
import { type Ferramenta } from '../ferramentas';
import { type Funcionario } from '../funcionarios';
import { fecharRetirada, mostrarAviso, retiradaRegistrada } from '../retirada';
import FotoFerramenta from './FotoFerramenta.vue';

// Funcionário e Número podem chegar já preenchidos (atalhos pelo perfil e pela Ficha).
const props = defineProps<{ funcionarioId: number | null; numero: string | null }>();

interface Escolhida {
  numero: string;
  nome: string;
}

const funcionario = ref<Funcionario | null>(null);
const buscaFuncionario = ref('');
const funcionarios = ref<Funcionario[]>([]);

const escolhidas = ref<Escolhida[]>(props.numero ? [{ numero: props.numero, nome: '' }] : []);
const buscaFerramenta = ref('');
const sugestoes = ref<Ferramenta[]>([]);

const erro = ref('');
const enviando = ref(false);

const passo = computed(() => (funcionario.value ? 2 : 1));

onMounted(async () => {
  if (props.funcionarioId !== null) {
    try {
      funcionario.value = await chamarApi<Funcionario>(`/funcionarios/${props.funcionarioId}`);
    } catch {
      erro.value = 'Não foi possível abrir o Funcionário escolhido.';
    }
  }

  if (props.numero) {
    void preencherNomeDaFerramenta(props.numero);
  }
});

async function preencherNomeDaFerramenta(numero: string) {
  try {
    const ferramenta = await chamarApi<Ferramenta>(`/ferramentas/${encodeURIComponent(numero)}`);
    escolhidas.value = escolhidas.value.map((item) =>
      item.numero === numero ? { numero, nome: ferramenta.nome } : item,
    );
  } catch {
    // Sem o nome, a lista mostra só o Número. A API valida a Ferramenta ao registrar.
  }
}

// Busca de Funcionário: só os ativos aparecem, porque Inativo não faz Retirada.
let esperaFuncionario: ReturnType<typeof setTimeout> | undefined;
watch(buscaFuncionario, () => {
  clearTimeout(esperaFuncionario);
  esperaFuncionario = setTimeout(async () => {
    const params = new URLSearchParams({ texto: buscaFuncionario.value.trim() });
    const resposta = await chamarApi<{ itens: Funcionario[] }>(`/funcionarios?${params}`).catch(() => null);
    funcionarios.value = resposta ? resposta.itens.filter((item) => item.ativo) : [];
  }, 300);
});
chamarApi<{ itens: Funcionario[] }>('/funcionarios')
  .then((resposta) => {
    funcionarios.value = resposta.itens.filter((item) => item.ativo);
  })
  .catch(() => {
    erro.value = 'Não foi possível carregar os Funcionários.';
  });

function escolherFuncionario(escolhido: Funcionario) {
  funcionario.value = escolhido;
  erro.value = '';
}

// Sugestões só trazem Ferramentas disponíveis: as que estão fora ou com problema não podem sair.
let esperaFerramenta: ReturnType<typeof setTimeout> | undefined;
watch(buscaFerramenta, () => {
  clearTimeout(esperaFerramenta);
  esperaFerramenta = setTimeout(async () => {
    const texto = buscaFerramenta.value.trim();
    if (!texto) {
      sugestoes.value = [];
      return;
    }

    const params = new URLSearchParams({ situacao: 'no_almoxarifado', texto });
    const resposta = await chamarApi<{ itens: Ferramenta[] }>(`/ferramentas?${params}`).catch(() => null);
    sugestoes.value = resposta ? resposta.itens.filter((item) => !escolhidas.value.some((e) => e.numero === item.numero)) : [];
  }, 300);
});

function adicionar(numero: string, nome: string) {
  if (!escolhidas.value.some((item) => item.numero === numero)) {
    escolhidas.value = [...escolhidas.value, { numero, nome }];
  }

  buscaFerramenta.value = '';
  sugestoes.value = [];
}

// Enter: "23" vira F-023; sem Número, adiciona a primeira sugestão.
function aoEnter() {
  const texto = buscaFerramenta.value.trim();
  const digitos = /^f?-?(\d+)$/i.exec(texto);

  if (digitos) {
    adicionar(`F-${digitos[1].padStart(3, '0')}`, '');
    return;
  }

  const primeira = sugestoes.value[0];
  if (primeira) {
    adicionar(primeira.numero, primeira.nome);
  }
}

function remover(numero: string) {
  escolhidas.value = escolhidas.value.filter((item) => item.numero !== numero);
}

async function registrar() {
  if (!funcionario.value || escolhidas.value.length === 0) {
    return;
  }

  erro.value = '';
  enviando.value = true;
  try {
    await chamarApi('/retiradas', {
      metodo: 'POST',
      corpo: { funcionarioId: funcionario.value.id, numeros: escolhidas.value.map((item) => item.numero) },
    });

    const quantas = escolhidas.value.length;
    mostrarAviso(`${quantas === 1 ? 'Retirada registrada' : `${quantas} Retiradas registradas`} com ${funcionario.value.nome}`);
    retiradaRegistrada();
    fecharRetirada();
  } catch (falha) {
    erro.value = falha instanceof ErroApi ? falha.message : 'Não foi possível registrar a Retirada.';
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div class="modal-bg" @click.self="fecharRetirada">
    <form class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-retirada" @submit.prevent="registrar">
      <div class="mh">
        <h2 id="titulo-retirada">Retirada</h2>
        <span class="small muted">Passo {{ passo }} de 2</span>
        <button type="button" class="x" aria-label="Fechar" @click="fecharRetirada">×</button>
      </div>

      <div v-if="passo === 1" class="mb">
        <p class="small muted">Quem vai retirar?</p>
        <input v-model="buscaFuncionario" type="search" aria-label="Buscar funcionário" placeholder="Buscar funcionário pelo nome" />
        <ul class="opcoes">
          <li v-for="item in funcionarios" :key="item.id">
            <button type="button" class="opcao" @click="escolherFuncionario(item)">
              <b>{{ item.nome }}</b>
              <span class="small muted">{{ item.funcao ?? 'Sem função' }}</span>
            </button>
          </li>
        </ul>
        <p v-if="funcionarios.length === 0" class="small muted">Nenhum Funcionário ativo encontrado.</p>
      </div>

      <div v-else class="mb">
        <div class="escolhido">
          <span>Funcionário: <b>{{ funcionario?.nome }}</b></span>
          <button type="button" class="link-botao" @click="funcionario = null">Trocar</button>
        </div>

        <label class="campo">
          Ferramentas
          <input
            v-model="buscaFerramenta"
            type="search"
            aria-label="Adicionar Ferramenta pelo Número ou pelo nome"
            placeholder="Digite o Número (ex.: 23) ou parte do nome"
            @keydown.enter.prevent="aoEnter"
          />
        </label>

        <ul v-if="sugestoes.length" class="opcoes">
          <li v-for="item in sugestoes" :key="item.numero">
            <button type="button" class="opcao com-foto" @click="adicionar(item.numero, item.nome)">
              <FotoFerramenta :numero="item.numero" :tem-foto="item.temFoto" :atualizado-em="item.atualizadoEm" :alt="`Foto de ${item.nome}`" class="miniatura-retirada">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
                </svg>
              </FotoFerramenta>
              <span>
                <span class="num">{{ item.numero }}</span> <b>{{ item.nome }}</b>
              </span>
            </button>
          </li>
        </ul>

        <ul class="escolhidas" aria-label="Ferramentas escolhidas">
          <li v-for="item in escolhidas" :key="item.numero">
            <span class="num">{{ item.numero }}</span>
            <span class="nome">{{ item.nome || 'Ferramenta' }}</span>
            <button type="button" class="link-botao" :aria-label="`Remover ${item.numero}`" @click="remover(item.numero)">Remover</button>
          </li>
        </ul>
        <p v-if="escolhidas.length === 0" class="small muted">Nenhuma Ferramenta escolhida ainda.</p>
      </div>

      <p v-if="erro" class="err" role="alert">{{ erro }}</p>

      <div class="mf">
        <button type="button" class="outline" @click="fecharRetirada">Cancelar</button>
        <button type="submit" class="primary" :disabled="passo === 1 || escolhidas.length === 0 || enviando">
          Registrar Retirada ({{ escolhidas.length }})
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.mh .small {
  margin-left: auto;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
  font-size: 13px;
}

.opcoes,
.escolhidas {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.opcao {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  background: #fff;
  color: inherit;
  border: 1px solid var(--line);
}

.opcao:hover {
  background: var(--bg);
}

.opcao.com-foto {
  justify-content: flex-start;
}

.miniatura-retirada {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.escolhidas li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.escolhidas .nome {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.escolhido {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--brand-soft);
}

.link-botao {
  border: 0;
  background: transparent;
  color: var(--brand);
  font-weight: 600;
  padding: 4px 6px;
}
</style>
