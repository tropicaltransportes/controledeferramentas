/**
 * Expediente da oficina, em horário de São Paulo (o Worker roda em UTC).
 * Segunda a sexta até 19h, sábado até 13h, domingo fechado. Feriados não contam.
 */

const FUSO = 'America/Sao_Paulo';

/** Hora de fechamento por dia da semana (0 = domingo). Null quando não abre. */
const FECHAMENTO_POR_DIA: (number | null)[] = [null, 19, 19, 19, 19, 19, 13];

interface DataLocal {
  ano: number;
  mes: number; // 1 a 12
  dia: number;
  hora: number;
  minuto: number;
}

const formatador = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Data e hora de São Paulo de um instante. */
function dataLocal(instante: Date): DataLocal {
  const partes = Object.fromEntries(formatador.formatToParts(instante).map((p) => [p.type, p.value]));

  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
  };
}

/** Instante em que um dia e hora de São Paulo acontecem. Confere o fuso no próprio dia, sem depender de UTC. */
function instanteDe(ano: number, mes: number, dia: number, hora: number): Date {
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora);
  const local = dataLocal(new Date(comoUtc));
  const deslocamento = Date.UTC(local.ano, local.mes - 1, local.dia, local.hora, local.minuto) - comoUtc;

  return new Date(comoUtc - deslocamento);
}

function diaDaSemana(ano: number, mes: number, dia: number): number {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Feriados nacionais fixos (MM-DD). Carnaval é ponto facultativo, não entra. */
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];

/** Domingo de Páscoa (calendário gregoriano, algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;

  return { mes, dia };
}

/** Feriado nacional: fixo no calendário, ou móvel (Sexta-feira santa e Corpus Christi). */
function ehFeriado(ano: number, mes: number, dia: number): boolean {
  const chave = `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  if (FERIADOS_FIXOS.includes(chave)) {
    return true;
  }

  const domingoDePascoa = pascoa(ano);
  const diasDaPascoa = Math.round(
    (Date.UTC(ano, mes - 1, dia) - Date.UTC(ano, domingoDePascoa.mes - 1, domingoDePascoa.dia)) / 86_400_000,
  );

  return diasDaPascoa === -2 || diasDaPascoa === 60;
}

/** Hora de fechamento do dia, ou null quando a oficina não abre (domingo ou feriado). */
function fechamentoDo(ano: number, mes: number, dia: number): number | null {
  if (ehFeriado(ano, mes, dia)) {
    return null;
  }

  return FECHAMENTO_POR_DIA[diaDaSemana(ano, mes, dia)];
}

/** Prazo da Retirada: o fim do Expediente em que ela deve voltar. */
export function prazoDaRetirada(retiradaEm: string): Date {
  const momento = new Date(retiradaEm);
  const local = dataLocal(momento);
  const fechamentoHoje = fechamentoDo(local.ano, local.mes, local.dia);

  // Dentro do Expediente do próprio dia: vale o fechamento de hoje.
  if (fechamentoHoje !== null && local.hora * 60 + local.minuto < fechamentoHoje * 60) {
    return instanteDe(local.ano, local.mes, local.dia, fechamentoHoje);
  }

  // Fora do Expediente (depois do fechamento, no domingo ou em feriado): vale o fim do próximo Expediente.
  for (let deslocamento = 1; deslocamento <= 14; deslocamento++) {
    const seguinte = new Date(Date.UTC(local.ano, local.mes - 1, local.dia + deslocamento));
    const ano = seguinte.getUTCFullYear();
    const mes = seguinte.getUTCMonth() + 1;
    const dia = seguinte.getUTCDate();
    const fechamento = fechamentoDo(ano, mes, dia);

    if (fechamento !== null) {
      return instanteDe(ano, mes, dia, fechamento);
    }
  }

  throw new Error('Expediente sem nenhum dia de funcionamento');
}

/** Uma Retirada aberta está Atrasada quando o agora passou do seu prazo. */
export function estaAtrasada(retiradaEm: string, agora: Date): boolean {
  return agora.getTime() > prazoDaRetirada(retiradaEm).getTime();
}
