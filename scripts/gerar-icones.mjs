import sharp from 'sharp';
import path from 'node:path';

const origem = path.join(process.cwd(), 'public', 'brand', 'logo-source.png');

// Recorte do símbolo (o "4" estilizado com o triângulo laranja, sem o "nexus"
// nem a tag "CONTEÚDO PRA VOCÊ"). Calculado varrendo o canal alfa de
// public/brand/logo-source.png (320x132px) coluna a coluna: a tinta do "4"
// ocupa as colunas 36-76 e linhas 34-91; este retângulo é essa bounding box
// com ~6px de folga nas bordas que não colam no "n" (só 1px de vão real).
// Se o arquivo-fonte for trocado por um em resolução/proporção diferente,
// este retângulo precisa ser recalculado.
const RECORTE_SIMBOLO = { left: 30, top: 28, width: 47, height: 69 };

async function main() {
  const simbolo = (tamanho) =>
    sharp(origem).extract(RECORTE_SIMBOLO)
      .resize(tamanho, tamanho, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });

  await simbolo(64).png().toFile(path.join(process.cwd(), 'app', 'icon.png'));
  await simbolo(180).png().toFile(path.join(process.cwd(), 'app', 'apple-icon.png'));
  await simbolo(192).png().toFile(path.join(process.cwd(), 'public', 'icon-192.png'));
  await simbolo(512).png().toFile(path.join(process.cwd(), 'public', 'icon-512.png'));

  // Logo completa (símbolo + wordmark + tagline), redimensionada pro sidebar
  // — altura fixa, largura proporcional (sem distorção). O wordmark/tagline
  // originais são índigo escuro (#271E5D), ilegível sobre o fundo escuro do
  // app — repinta esses pixels de branco, preservando o triângulo laranja
  // (que tem R > B, ao contrário do índigo onde B > R) e o canal alfa
  // original (mantém o anti-aliasing das bordas).
  const { data, info } = await sharp(origem)
    .resize({ height: 80 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const b = data[i + 2];
    const alpha = data[i + info.channels - 1];
    if (alpha > 0 && b > r) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }

  await sharp(data, { raw: info }).png()
    .toFile(path.join(process.cwd(), 'public', 'brand', 'logo-sidebar.png'));

  console.log('Ícones gerados a partir de', origem);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
