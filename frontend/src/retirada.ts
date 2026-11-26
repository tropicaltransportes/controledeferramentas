// Estado compartilhado da Retirada: o modal abre pelo topo, pela Ficha ou pelo perfil, e as telas recarregam quando uma Retirada é registrada.
import { reactive, ref } from 'vue';

export const retirada = reactive<{ aberta: boolean; funcionarioId: number | null; numero: string | null }>({
  aberta: false,
  funcionarioId: null,
  numero: null,
});

/** Sobe a cada Retirada, Devolução ou destino (extravio, liberação, baixa). As telas que mostram posse observam este número e recarregam. */
export const versaoRetiradas = ref(0);

/** Aviso curto depois de uma ação (toast). Some sozinho. */
export const aviso = ref('');
let temporizadorAviso: ReturnType<typeof setTimeout> | undefined;

export function abrirRetirada(inicial: { funcionarioId?: number; numero?: string } = {}) {
  retirada.aberta = true;
  retirada.funcionarioId = inicial.funcionarioId ?? null;
  retirada.numero = inicial.numero ?? null;
}

export function fecharRetirada() {
  retirada.aberta = false;
}

export function retiradaRegistrada() {
  versaoRetiradas.value++;
}

export function mostrarAviso(texto: string) {
  aviso.value = texto;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => {
    aviso.value = '';
  }, 4000);
}
