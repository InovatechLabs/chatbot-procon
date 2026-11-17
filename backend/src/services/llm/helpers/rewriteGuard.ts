import { charLength } from '../../whatsapp/messagePolicy.js';

// Defesa conservadora: não substitui revisão jurídica; qualquer divergência usa a fonte.
export function factSignature(text: string): string[] {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const numbers = [...normalized.matchAll(/\d+(?:[.,]\d+)*|\b(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|trinta|noventa)\b|\b(?:dias?|mes(?:es)?|anos?|horas?|semanas?|dobro|triplo|metade)\b|%|r\$/g)].map(match => match[0]);
  const quantities = [...normalized.matchAll(/(?:r\$\s*)?\d+(?:[.,]\d+)*(?:\s*%|\s+(?:dias?|mes(?:es)?|anos?|horas?|semanas?))?/g)].map(match => `quantidade:${match[0].replace(/\s+/g, ' ')}`);
  return [...numbers, ...quantities].sort();
}

export function isSafeRewrite(source: string, rewritten: string): boolean {
  if (!rewritten.trim() || charLength(rewritten) > charLength(source) || charLength(rewritten) > 900) return false;
  if (/^(?:ola|oi|entendi que|voce escolheu|questao\s*\d)/i.test(rewritten.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) return false;
  if (/garantimos|resultado garantido|vai receber|cometeu (?:um )?crime/i.test(rewritten)) return false;
  if (JSON.stringify(factSignature(source)) !== JSON.stringify(factSignature(rewritten))) return false;
  // Também conserva as referências legais (não basta manter os mesmos números).
  const references = (text: string) => [...text.matchAll(/art(?:igo)?\.?\s*\d+(?:\s*-\s*[a-z])?/gi)]
    .map(match => match[0].toLowerCase().replace(/artigo|art\./g, 'art').replace(/\s/g, '')).sort();
  if (JSON.stringify(references(source)) !== JSON.stringify(references(rewritten))) return false;
  // Evita que uma ressalva seja eliminada ou que a polaridade seja trocada.
  const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const qualifiers = ['nao', 'pode', 'caso', 'se', 'salvo', 'porem', 'apenas', 'ate'];
  return qualifiers.every(word => !new RegExp(`\\b${word}\\b`).test(normalize(source)) || new RegExp(`\\b${word}\\b`).test(normalize(rewritten)));
}
