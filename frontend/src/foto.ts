// Redução da foto no navegador antes do envio. A API recusa acima de TAMANHO_MAXIMO.

export const TAMANHO_ALVO = 80 * 1024;
export const TAMANHO_MAXIMO = 200 * 1024;

// Tenta primeiro a melhor qualidade e reduz só o necessário para caber no alvo.
const LADOS = [800, 640, 480];
const QUALIDADES = [0.8, 0.65, 0.5];

/** JPEG com o lado maior no tamanho pedido (ou menos, se a imagem já for menor). */
export async function reduzirFoto(arquivo: File): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo).catch(() => {
    throw new Error('Não foi possível ler esta imagem. Escolha outro arquivo.');
  });

  try {
    let menor: Blob | null = null;

    for (const lado of LADOS) {
      for (const qualidade of QUALIDADES) {
        const blob = await codificar(imagem, lado, qualidade);
        if (blob.size <= TAMANHO_ALVO) {
          return blob;
        }

        if (!menor || blob.size < menor.size) {
          menor = blob;
        }
      }
    }

    if (menor && menor.size <= TAMANHO_MAXIMO) {
      return menor;
    }

    throw new Error('Esta foto continua grande demais mesmo reduzida. Tente outra.');
  } finally {
    imagem.close();
  }
}

async function codificar(imagem: ImageBitmap, lado: number, qualidade: number): Promise<Blob> {
  const escala = Math.min(1, lado / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);

  const contexto = canvas.getContext('2d');
  if (!contexto) {
    throw new Error('Este navegador não consegue reduzir a foto.');
  }

  // Fundo branco: PNG com transparência não vira preto ao sair como JPEG.
  contexto.fillStyle = '#fff';
  contexto.fillRect(0, 0, canvas.width, canvas.height);
  contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);

  return new Promise((resolver, rejeitar) => {
    canvas.toBlob(
      (blob) => (blob ? resolver(blob) : rejeitar(new Error('Não foi possível reduzir a foto.'))),
      'image/jpeg',
      qualidade,
    );
  });
}
