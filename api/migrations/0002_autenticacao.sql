-- Usuários do Almoxarife e do Gestor. Não há cadastro público: contas são criadas pelo comando administrativo.
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('almoxarife', 'gestor')),
  senha_hash TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

-- Sessões guardam só o hash SHA-256 do token; o token em si fica apenas no navegador.
CREATE TABLE sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL
);

CREATE INDEX sessoes_usuario ON sessoes (usuario_id);
