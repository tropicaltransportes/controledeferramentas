// Estado compartilhado da Devolução: o modal abre pelo topo, pela Ficha, pela lista ou pelo perfil.
import { reactive } from 'vue';

export const devolucao = reactive<{ aberta: boolean; numero: string | null }>({
  aberta: false,
  numero: null,
});

export function abrirDevolucao(inicial: { numero?: string } = {}) {
  devolucao.aberta = true;
  devolucao.numero = inicial.numero ?? null;
}

export function fecharDevolucao() {
  devolucao.aberta = false;
}
