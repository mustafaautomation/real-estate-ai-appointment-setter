import type { GuardrailKind } from '../types';

const FAIR_HOUSING: readonly RegExp[] = [
  /\b(white|black|asian|hispanic|latino|latina|caucasian|african american)\s+(neighborhood|neighbourhood|area|community|block|people|buyers|families|tenants)\b/i,
  /\b(no|without|only|just)\s+(black|white|asian|hispanic|jewish|muslim|christian|hindu|catholic)\s+(people|neighbors|neighbours|buyers|families|tenants|neighborhood|neighbourhood|area|community)?\b/i,
  /\b(christian|muslim|jewish|hindu|catholic|mosque|synagogue)\s+(neighborhood|neighbourhood|area|community)\b/i,
  /\b(no|without)\s+(kids|children|families|pregnant)\b/i,
  /\b(child[-\s]?free|adults only|families only)\b/i,
  /\b(no|without)\s+(disabled|handicapped)\s+(people|neighbors|neighbours|tenants)\b/i,
  /\b(immigrant|foreign)[-\s]?free\b/i,
  /\b(no|not)\b.{0,24}\bimmigrants\b/i,
  /\b(men|women|females|males)\s+only\s+(building|neighborhood|neighbourhood|area|community)\b/i,
  /\b(skin colou?r|people of colou?r|filter (buyers|people|tenants) by colou?r)\b/i,
  /\b(barrio|vecindario)\s+blanco\b/i,
  /\bsin\s+niños\b/i,
  /\bsolo\s+cristianos\b/i,
];

const LEGAL: readonly RegExp[] = [
  /\b(waive (the )?(inspection|contingency)|legal advice|sue the seller|contract clause)\b/i,
  /\bshould i (sign|waive|sue)\b/i,
  /\battorney\b/i,
];

const FINANCIAL: readonly RegExp[] = [
  /\b(mortgage interest|tax deductible|interest rate|\bapr\b|good investment|cap rate|1031|financial advice)\b/i,
  /\b(what|which)\s+(mortgage|loan)\b/i,
  /\bshould i invest\b/i,
  /\bhow much should i offer\b/i,
];

export function classifyGuardrail(text: string): GuardrailKind | null {
  if (FAIR_HOUSING.some((pattern) => pattern.test(text))) return 'fair_housing';
  if (LEGAL.some((pattern) => pattern.test(text))) return 'legal';
  if (FINANCIAL.some((pattern) => pattern.test(text))) return 'financial';
  return null;
}
