-- Tipo MIME da foto guardada em `foto` (ex.: image/jpeg). NULL quando a Ferramenta não tem foto.
ALTER TABLE ferramentas ADD COLUMN foto_tipo TEXT;
