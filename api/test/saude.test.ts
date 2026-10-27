import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { atender } from '../src/app';
import type { Env } from '../src/env';

const ORIGEM_PAGES = 'https://tropicaltransportes.github.io';
const ORIGEM_DEV = 'http://localhost:5173';

describe('GET /saude', () => {
  it('responde ok com o horário fixado pelo teste e o banco acessível', async () => {
    const resposta = await SELF.fetch('https://api.test/saude');

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      status: 'ok',
      agora: '2026-10-27T12:00:00.000Z',
      banco: 'ok',
    });
  });

  it('libera CORS para a origem do GitHub Pages', async () => {
    const resposta = await SELF.fetch('https://api.test/saude', {
      headers: { Origin: ORIGEM_PAGES },
    });

    expect(resposta.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM_PAGES);
  });

  it('libera CORS para o servidor local de desenvolvimento', async () => {
    const resposta = await SELF.fetch('https://api.test/saude', {
      headers: { Origin: ORIGEM_DEV },
    });

    expect(resposta.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM_DEV);
  });

  it('não libera CORS para outras origens', async () => {
    const resposta = await SELF.fetch('https://api.test/saude', {
      headers: { Origin: 'https://outro-site.example' },
    });

    expect(resposta.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it('responde ao preflight de uma origem liberada', async () => {
    const resposta = await SELF.fetch('https://api.test/saude', {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGEM_PAGES,
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(resposta.status).toBe(204);
    expect(resposta.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM_PAGES);
    expect(resposta.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('responde 404 para rotas desconhecidas', async () => {
    const resposta = await SELF.fetch('https://api.test/nao-existe');

    expect(resposta.status).toBe(404);
  });

  it('responde 503 com banco erro quando o D1 falha', async () => {
    const bancoQuebrado = {
      prepare: () => ({
        first: () => Promise.reject(new Error('D1 indisponível')),
      }),
    } as unknown as D1Database;
    const envComBancoQuebrado: Env = { ...env, DB: bancoQuebrado };

    const resposta = await atender(new Request('https://api.test/saude'), envComBancoQuebrado);

    expect(resposta.status).toBe(503);
    expect(await resposta.json()).toMatchObject({ status: 'erro', banco: 'erro' });
  });
});
