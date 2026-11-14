import { describe, expect, it } from 'vitest';

import { classifyGuardrail } from '@/domain/guardrails/policy';

describe('guardrails', () => {
  it.each([
    ['I only want a white neighborhood', 'fair_housing'],
    ['Show me a Christian neighborhood only', 'fair_housing'],
    ['I want a child-free building, no kids', 'fair_housing'],
    ['I do not want immigrants in the neighborhood', 'fair_housing'],
    ['women only building', 'fair_housing'],
    ['no disabled neighbors', 'fair_housing'],
    ['I want to filter buyers by color', 'fair_housing'],
    ['solo un vecindario blanco', 'fair_housing'],
    ['Should I waive the inspection contingency?', 'legal'],
    ['Is the mortgage interest tax deductible?', 'financial'],
    ['Is this a good investment?', 'financial'],
  ])('classifies %s', (text, kind) => {
    expect(classifyGuardrail(text)).toBe(kind);
  });

  it('allows property features that are not steering', () => {
    expect(classifyGuardrail('3 bedroom condo in Glassmarket with a white kitchen')).toBeNull();
    expect(classifyGuardrail('a family room for my kids')).toBeNull();
    expect(classifyGuardrail('budget 700k')).toBeNull();
  });
});
