-- Ferramentas do almoxarifado. O Número (F-NNN) é a chave e nunca muda depois do cadastro.
-- A foto fica no próprio D1 e entra na fatia de Fotos; a coluna já existe para não exigir nova migração.
CREATE TABLE ferramentas (
  numero TEXT PRIMARY KEY CHECK (numero GLOB 'F-[0-9][0-9][0-9]*'),
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  categoria TEXT NOT NULL,
  marca TEXT,
  modelo TEXT,
  especificacao TEXT,
  numero_serie TEXT,
  aquisicao TEXT,
  observacoes TEXT,
  foto BLOB,
  estado TEXT NOT NULL DEFAULT 'disponivel' CHECK (estado IN ('disponivel', 'com_problema', 'baixada', 'extraviada')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE INDEX ferramentas_estado ON ferramentas (estado);
