import type { Language } from '../types';

const SPANISH = new Set([
  'hola',
  'busco',
  'casa',
  'presupuesto',
  'habitaciones',
  'quiero',
  'comprar',
  'dormitorios',
  'gracias',
  'buenos',
  'necesito',
  'barrio',
  'dias',
  'condominio',
]);

const FRENCH = new Set(['bonjour', 'cherche', 'maison', 'merci', 'voudrais', 'acheter']);

export function detectLanguage(text: string): Language {
  const words = text
    .toLowerCase()
    .split(/[^a-záéíóúüñ]+/i)
    .filter((word) => word.length > 0);
  let spanish = 0;
  let french = 0;
  for (const word of words) {
    if (SPANISH.has(word)) spanish += 1;
    if (FRENCH.has(word)) french += 1;
  }
  if (spanish >= 2) return 'es';
  if (french >= 2) return 'other';
  return 'en';
}
