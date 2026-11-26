<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { chamarApi, ErroApi } from '../api';
import { fecharDevolucao } from '../devolucao';
import { darDestino, type Ferramenta, situacaoDe } from '../ferramentas';
import { dataCurta, type Resultado } from '../historico';
import { destinoRegistrado, mostrarAviso, retiradaRegistrada } from '../retirada';
import FotoFerramenta from './FotoFerramenta.vue';

// O Número pode chegar já preenchido (atalho pela Ficha, pela lista ou pelo perfil).
const props = defineProps<{ numero: string | null }>();

const escolhida = ref<Ferramenta | null>(null);
const busca = ref('');
const sugestoes = ref<Ferramenta[]>([]);
const resultado = ref<Resultado | null>(null);
const descricao = ref('');
const erro = ref('');
const enviando = ref(false);

const pronto = computed(() => {
  if (!escolhida.value || !resultado.value) {
    return false;
  }

  return resultado.value === 'ok' || descricao.value.trim().length > 0;
});

onMounted(async () => {
  if (!props.numero) {
    return;
  }

  try {
    const ferramenta = await chamarApi<Ferramenta>(`/ferramentas/${encodeURIComponent(props.numero)}`);
    if (ferramenta.responsavel) {
      escolhida.value = ferramenta;
    } else {
      erro.value = `${ferramenta.numero} não está fora, então não há Devolução a registrar.`;
    }
  } catch {
    erro.value = 'Não foi possível abrir a Ferramenta escolhida.';
  }
});

// Sugestões só trazem Ferramentas que estão fora (inclusive Atrasadas): só essas podem voltar.
// A busca vem em "todas" para incluir as Atrasadas, que têm situação própria; o filtro abaixo deixa só Fora e Atrasada.
let esperaBusca: ReturnType<typeof setTimeout> | undefined;
watch(busca, () => {
  clearTimeout(esperaBusca);
  esperaBusca = setTimeout(async () => {
    const texto = busca.value.trim();
    if (!texto) {
      sugestoes.value = [];
      return;
    }

    const params = new URLSearchParams({ situacao: 'todas', texto });
    const resposta = await chamarApi<{ itens: Ferramenta[] }>(`/ferramentas?${params}`).catch(() => null);
    sugestoes.value = (resposta?.itens ?? []).filter(
      (ferramenta) => ferramenta.situacao === 'fora' || ferramenta.situacao === 'atrasada',
    );
  }, 300);
});

/** Quem está com a Ferramenta e desde quando, como aparece nas sugestões e no cartão. */
function comQuemDesde(ferramenta: Ferramenta): string {
  if (!ferramenta.responsavel) {
    return '';
  }

  return `Com ${ferramenta.responsavel.nome} desde ${dataCurta(ferramenta.responsavel.retiradaEm)}`;
}

function escolher(ferramenta: Ferramenta) {
  escolhida.value = ferramenta;
  busca.value = '';
  sugestoes.value = [];
  erro.value = '';
}

// Enter com um Número digitado ("23" vira F-023): consulta essa Ferramenta direto, sem esperar a busca com pausa.
async function aoEnter() {
  const texto = busca.value.trim();
  const digitos = /^f?-?(\d+)$/i.exec(texto);

  if (digitos) {
    const numero = `F-${digitos[1].padStart(3, '0')}`;
    const ferramenta = await chamarApi<Ferramenta>(`/ferramentas/${encodeURIComponent(numero)}`).catch(() => null);
    if (ferramenta?.responsavel) {
      escolher(ferramenta);
    } else {
      erro.value = `${numero} não está fora no momento.`;
    }
    return;
  }

  if (sugestoes.value[0]) {
    escolher(sugestoes.value[0]);
  }
}

// A Ferramenta não voltou: encerra a Retirada como Extraviada. Só o Almoxarife faz isso, por aqui ou pela Ficha.
async function extraviar() {
  if (!escolhida.value) {
    return;
  }

  const numero = escolhida.value.numero;
  if (!confirm(`Marcar ${numero} como Extraviada? A Retirada é encerrada sem Devolução e o Responsável fica registrado.`)) {
    return;
  }

  erro.value = '';
  enviando.value = true;
  try {
    await darDestino(numero, 'extraviar');
    mostrarAviso(`${numero} marcada como Extraviada`);
    destinoRegistrado();
    fecharDevolucao();
  } catch (falha) {
    erro.value = falha instanceof ErroApi ? falha.message : 'Não foi possível marcar como Extraviada.';
  } finally {
    enviando.value = false;
  }
}

function trocar() {
  escolhida.value = null;
  resultado.value = null;
  descricao.value = '';
  erro.value = '';
}

async function registrar() {
  if (!escolhida.value || !resultado.value) {
    return;
  }

  if (resultado.value === 'com_problema' && !descricao.value.trim()) {
    erro.value = 'Descreva o problema da Ferramenta.';
    return;
  }

  const numero = escolhida.value.numero;
  erro.value = '';
  enviando.value = true;
  try {
    await chamarApi('/devolucoes', {
      metodo: 'POST',
      corpo: { numero, resultado: resultado.value, descricao: descricao.value.trim() },
    });

    mostrarAviso(
      resultado.value === 'ok'
        ? `${numero} devolvida ao almoxarifado`
        : `${numero} devolvida com problema. O Problema aguarda destino`,
    );
    retiradaRegistrada();
    fecharDevolucao();
  } catch (falha) {
    erro.value = falha instanceof ErroApi ? falha.message : 'Não foi possível registrar a Devolução.';
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div class="modal-bg" @click.self="fecharDevolucao">
    <form class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-devolucao" @submit.prevent="registrar">
      <div class="mh">
        <h2 id="titulo-devolucao">Devolução</h2>
        <button type="button" class="x" aria-label="Fechar" @click="fecharDevolucao">×</button>
      </div>

      <div v-if="!escolhida" class="mb">
        <label class="campo">
          Ferramenta
          <input
            v-model="busca"
            type="search"
            aria-label="Localizar Ferramenta fora pelo Número ou pelo nome"
            placeholder="Digite o Número (ex.: 23) ou parte do nome"
            @keydown.enter.prevent="aoEnter"
          />
        </label>

        <ul v-if="sugestoes.length" class="opcoes">
          <li v-for="item in sugestoes" :key="item.numero">
            <button type="button" class="opcao" @click="escolher(item)">
              <span class="num">{{ item.numero }}</span>
              <span class="nome"><b>{{ item.nome }}</b></span>
              <span v-if="item.situacao === 'atrasada'" class="badge" :class="situacaoDe(item.situacao).classe">
                {{ situacaoDe(item.situacao).rotulo }}
              </span>
              <span class="small muted">{{ comQuemDesde(item) }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="busca.trim()" class="small muted">Nenhuma Ferramenta fora com esse texto.</p>
        <p v-else class="small muted">Só as Ferramentas que estão fora aparecem aqui.</p>
      </div>

      <div v-else class="mb">
        <div class="cartao">
          <FotoFerramenta
            :numero="escolhida.numero"
            :tem-foto="escolhida.temFoto"
            :atualizado-em="escolhida.atualizadoEm"
            :alt="`Foto de ${escolhida.nome}`"
            class="miniatura"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
            </svg>
          </FotoFerramenta>
          <div class="texto">
            <span class="num">{{ escolhida.numero }}</span>
            <b>{{ escolhida.nome }}</b>
            <span v-if="escolhida.situacao === 'atrasada'" class="badge" :class="situacaoDe(escolhida.situacao).classe">
              {{ situacaoDe(escolhida.situacao).rotulo }}
            </span>
            <span class="small muted">{{ comQuemDesde(escolhida) }}</span>
          </div>
          <button type="button" class="link-botao" @click="trocar">Trocar</button>
        </div>

        <fieldset class="resultado">
          <legend class="small muted">A Ferramenta voltou como?</legend>
          <label class="pill-opcao" :class="{ on: resultado === 'ok' }">
            <input v-model="resultado" type="radio" name="resultado" value="ok" />
            OK
          </label>
          <label class="pill-opcao com-problema" :class="{ on: resultado === 'com_problema' }">
            <input v-model="resultado" type="radio" name="resultado" value="com_problema" />
            Com Problema
          </label>
        </fieldset>

        <label v-if="resultado === 'com_problema'" class="campo">
          Descreva o problema (obrigatório)
          <textarea v-model="descricao" rows="3" aria-required="true" placeholder="O que está errado com a Ferramenta"></textarea>
        </label>

        <button type="button" class="link-botao extravio" :disabled="enviando" @click="extraviar">
          Não voltou – marcar como Extraviada
        </button>
      </div>

      <p v-if="erro" class="err" role="alert">{{ erro }}</p>

      <div class="mf">
        <button type="button" class="outline" @click="fecharDevolucao">Cancelar</button>
        <button type="submit" class="primary" :disabled="!pronto || enviando">Registrar Devolução</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
  font-size: 13px;
}

.opcoes {
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
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  text-align: left;
  background: #fff;
  color: inherit;
  border: 1px solid var(--line);
}

.opcao:hover {
  background: var(--bg);
}

.opcao .nome {
  flex: 1;
  min-width: 0;
}

.cartao {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--brand-soft);
}

.cartao .texto {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.miniatura {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.resultado {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0 0;
  padding: 0;
  border: 0;
}

.resultado legend {
  width: 100%;
  padding: 0;
  margin-bottom: 6px;
}

.pill-opcao {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
}

.pill-opcao input {
  margin: 0;
}

.pill-opcao.on {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand);
}

.pill-opcao.com-problema.on {
  border-color: #b45309;
  background: #fef3c7;
  color: #92400e;
}

.link-botao {
  border: 0;
  background: transparent;
  color: var(--brand);
  font-weight: 600;
  padding: 4px 6px;
}
</style>
