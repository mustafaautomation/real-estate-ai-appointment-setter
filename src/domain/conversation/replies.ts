import { formatMoney, formatWhen } from '../booking/time';
import { propertyLabel, timelineLabel } from '../qualification/slots';
import type {
  Appointment,
  GuardrailKind,
  Listing,
  Session,
  SlotKey,
  Slots,
  TimeSlot,
} from '../types';

export type ReplyKind =
  | 'opt_out_confirm'
  | 'opt_out_hold'
  | 'opt_in'
  | 'guardrail'
  | 'handoff'
  | 'handoff_hold'
  | 'need_slots'
  | 'listings'
  | 'no_match'
  | 'booked'
  | 'rescheduled'
  | 'out_of_hours'
  | 'no_slot'
  | 'objection_price'
  | 'summary';

export type ReplyInput = {
  session: Session;
  kind: ReplyKind;
  listings: readonly Listing[];
  appointment?: Appointment;
  nextSlot?: TimeSlot;
  guardrail?: GuardrailKind;
  timeZone: string;
};

const ASK_ORDER: readonly SlotKey[] = ['propertyType', 'beds', 'area', 'budget', 'timeline'];

export function composeReply(input: ReplyInput): string {
  const body = render(input);
  if (
    input.session.language === 'other' &&
    input.kind !== 'opt_out_confirm' &&
    input.kind !== 'opt_out_hold'
  ) {
    return `I can continue in English. ${body}`;
  }
  return body;
}

function render(input: ReplyInput): string {
  const { session, kind } = input;
  const spanish = session.language === 'es';
  switch (kind) {
    case 'opt_out_confirm':
      return 'You are opted out. I will not send more texts. Reply START to resume.';
    case 'opt_out_hold':
      return 'This number is opted out. Reply START to resume.';
    case 'opt_in':
      return spanish
        ? 'Listo, volviste a entrar. Que tipo de vivienda buscas?'
        : 'You are opted back in. What kind of home are you looking for?';
    case 'guardrail':
      return guardrailReply(input.guardrail ?? 'fair_housing', spanish);
    case 'handoff':
      return spanish
        ? 'Paso esta conversacion a una persona del escritorio.'
        : 'I will hand this to a person on the desk.';
    case 'handoff_hold':
      return spanish
        ? 'Una persona del escritorio ya tiene esta conversacion.'
        : 'A person on the desk has this conversation. I will not keep qualifying or booking here.';
    case 'objection_price':
      return spanish
        ? `Puedo bajar el techo. ${knownPrefix(session, true)}Cual es tu presupuesto maximo?`
        : `I can lower the ceiling. ${knownPrefix(session, false)}What budget should I stay under?`;
    case 'summary':
      return spanish
        ? `Esto es lo que tengo: ${portrait(session.slots, true) || 'todavia poco'}. ${ask(session, true)}`
        : `Here is what I have so far: ${portrait(session.slots, false) || 'not much yet'}. ${ask(session, false)}`;
    case 'out_of_hours': {
      const next = input.nextSlot
        ? ` Next open slot: ${formatWhen(input.nextSlot.start, input.timeZone)}.`
        : '';
      return spanish
        ? `Las visitas son en dias de semana, de 9:00 a 17:00 America/Chicago.${next}`
        : `Tours are on weekdays, 9:00–17:00 America/Chicago.${next}`;
    }
    case 'no_slot':
      return spanish
        ? 'Ese horario no esta abierto. Puedo ofrecer el siguiente turno libre.'
        : 'That slot is not open. I can offer the next open slot on a weekday.';
    case 'no_match':
      return spanish
        ? `Nada en la lista encaja con ${portrait(session.slots, true)}. Cual condicion aflojo?`
        : `Nothing on the list fits ${portrait(session.slots, false)}. Which constraint should I relax?`;
    case 'listings':
      return listingReply(session, input.listings, spanish);
    case 'booked':
      return bookingReply(session, input, spanish, false);
    case 'rescheduled':
      return bookingReply(session, input, spanish, true);
    case 'need_slots':
      return spanish
        ? `${knownPrefix(session, true)}${ask(session, true)}`
        : `${knownPrefix(session, false)}${ask(session, false)}`;
    default:
      return ask(session, spanish);
  }
}

function guardrailReply(kind: GuardrailKind, spanish: boolean): string {
  if (kind === 'legal') {
    return spanish
      ? 'No puedo dar asesoramiento legal. Un abogado local es el lugar correcto.'
      : 'I can not give legal advice. A local attorney is the right stop for that.';
  }
  if (kind === 'financial') {
    return spanish
      ? 'No puedo dar asesoramiento financiero ni hipotecario. Si puedo ajustar el presupuesto.'
      : 'I can not give financial or mortgage advice. I can keep the search inside your budget.';
  }
  return spanish
    ? 'No puedo filtrar viviendas por raza, religion, origen nacional, sexo, discapacidad o situacion familiar. Si puedo usar presupuesto, zona, recamaras, tipo y plazo.'
    : 'I can not use race, religion, national origin, sex, disability, or familial status to screen homes. I can filter by budget, area, beds, property type, and timeline.';
}

function listingReply(session: Session, _listings: readonly Listing[], spanish: boolean): string {
  const described = portrait(session.slots, spanish);
  const lead = spanish
    ? `Tengo estas opciones para ${described}.`
    : `${variant(session.turnCount, [
        `I found homes for ${described}.`,
        `Here is what matches ${described}.`,
        `A few places fit ${described}.`,
      ])}`;
  const close = spanish
    ? ' Las fichas de abajo tienen el detalle. Si quieres una visita, dime que reserve el primer horario.'
    : ' The cards below have the details. If you want a tour, say book the earliest slot, or name a weekday time.';
  return `${lead}${close}`.replace(/\s+/g, ' ').trim();
}

function bookingReply(
  session: Session,
  input: ReplyInput,
  spanish: boolean,
  moved: boolean,
): string {
  const when = input.appointment
    ? formatWhen(input.appointment.start, input.timeZone)
    : 'the open slot';
  const verb = moved
    ? spanish
      ? 'Reagende la visita. Quedo reservada'
      : 'I moved the tour. It is booked'
    : spanish
      ? 'La visita quedo reservada'
      : 'The tour is booked';
  const home = input.listings[0];
  const place = home ? ` at ${home.address}, ${home.neighborhood}` : '';
  return `${verb} for ${when}${place}.`.replace(/\s+/g, ' ').trim();
}

function knownPrefix(session: Session, spanish: boolean): string {
  const text = portrait(session.slots, spanish);
  if (!text) return '';
  return spanish ? `Anotado: ${text}. ` : `${opener(session.turnCount, text)} `;
}

function opener(turn: number, text: string): string {
  return variant(turn, [
    `Thanks, I have ${text}.`,
    `Okay. I have ${text}.`,
    `I will stay with ${text}.`,
  ]);
}

function portrait(slots: Slots, spanish: boolean): string {
  const type = slots.propertyType ? propertyLabel(slots.propertyType) : undefined;
  let home = '';
  if (slots.beds !== undefined && type) {
    home = spanish ? `${slots.beds} recamaras en un ${type}` : `a ${slots.beds}-bedroom ${type}`;
  } else if (type) {
    home = spanish ? `un ${type}` : `a ${type}`;
  } else if (slots.beds !== undefined) {
    home = spanish ? `${slots.beds} recamaras` : `${slots.beds} bedrooms`;
  }
  const bits = [
    home,
    slots.area ? (spanish ? `en ${slots.area}` : `in ${slots.area}`) : '',
    budgetPhrase(slots, spanish),
    slots.timeline ? timelineLabel(slots.timeline) : '',
  ].filter((bit) => bit.length > 0);
  return bits.join(', ');
}

function budgetPhrase(slots: Slots, spanish: boolean): string {
  if (slots.budget?.max !== undefined && slots.budget.min !== undefined) {
    return `${formatMoney(slots.budget.min)}–${formatMoney(slots.budget.max)}`;
  }
  if (slots.budget?.max !== undefined) {
    return spanish
      ? `hasta ${formatMoney(slots.budget.max)}`
      : `under ${formatMoney(slots.budget.max)}`;
  }
  if (slots.budget?.min !== undefined) {
    return spanish
      ? `desde ${formatMoney(slots.budget.min)}`
      : `from ${formatMoney(slots.budget.min)}`;
  }
  return '';
}

export function summary(slots: Slots, spanish: boolean): string {
  const bits: string[] = [];
  if (slots.beds !== undefined)
    bits.push(spanish ? `${slots.beds} recamaras` : `${slots.beds}-bed`);
  if (slots.propertyType) bits.push(propertyLabel(slots.propertyType));
  if (slots.area) bits.push(spanish ? `en ${slots.area}` : `in ${slots.area}`);
  if (slots.budget?.max !== undefined && slots.budget.min !== undefined) {
    bits.push(`${formatMoney(slots.budget.min)}–${formatMoney(slots.budget.max)}`);
  } else if (slots.budget?.max !== undefined) {
    bits.push(
      spanish ? `hasta ${formatMoney(slots.budget.max)}` : `under ${formatMoney(slots.budget.max)}`,
    );
  } else if (slots.budget?.min !== undefined) {
    bits.push(
      spanish ? `desde ${formatMoney(slots.budget.min)}` : `from ${formatMoney(slots.budget.min)}`,
    );
  }
  if (slots.timeline) bits.push(timelineLabel(slots.timeline));
  return bits.join(', ');
}

function ask(session: Session, spanish: boolean): string {
  const missing = ASK_ORDER.find((key) => !hasSlot(session.slots, key));
  const questions = spanish ? QUESTIONS_ES : QUESTIONS_EN;
  if (!missing) {
    return spanish
      ? 'Si quieres una visita, dime que reserve el primer horario.'
      : 'If you want a tour, say book the earliest slot.';
  }
  const options = questions[missing];
  return variant(session.turnCount, options);
}

function hasSlot(slots: Slots, key: SlotKey): boolean {
  if (key === 'budget') return slots.budget?.max !== undefined;
  return slots[key] !== undefined;
}

function variant(turn: number, options: readonly string[]): string {
  const index = ((turn % options.length) + options.length) % options.length;
  return options[index] ?? options[0] ?? '';
}

const QUESTIONS_EN: Record<SlotKey, readonly string[]> = {
  propertyType: [
    'What kind of home are you looking for: condo, townhouse, house, or multi-family?',
    'Condo, townhouse, house, or multi-family?',
    'Which property type should I use?',
  ],
  beds: ['How many bedrooms do you want?', 'What bedroom count should I use?', 'How many beds?'],
  area: [
    'Which area should I use: Lantern Hill, North Wharf, Old Keel, Glassmarket, Reed Shores, or Millcross?',
    'Which of those neighborhoods should I search?',
    'What area are you headed toward?',
  ],
  budget: [
    'What budget should I stay under?',
    'What price ceiling should I use?',
    'How much are you looking to spend?',
  ],
  timeline: [
    'What is your timeline?',
    'When do you want to be in the home?',
    'How soon are you looking to move?',
  ],
};

const QUESTIONS_ES: Record<SlotKey, readonly string[]> = {
  propertyType: ['Buscas condominio, adosado, casa o multifamiliar?'],
  beds: ['Cuantas recamaras quieres?'],
  area: [
    'Que zona uso: Lantern Hill, North Wharf, Old Keel, Glassmarket, Reed Shores o Millcross?',
  ],
  budget: ['Cual es tu presupuesto maximo?'],
  timeline: ['En que plazo quieres mudarte?'],
};
