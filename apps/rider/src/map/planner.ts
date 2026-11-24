import type { Coordinate } from '@thirrem/types';

export type PinSlot = 'pickup' | 'dropoff';

export interface PlanPoint extends Coordinate {
  origin?: 'device';
}

export interface Plan {
  pickup: PlanPoint | null;
  dropoff: PlanPoint | null;
  active: PinSlot;
}

export type PlanAction =
  | { type: 'place'; point: PlanPoint }
  | { type: 'choose'; slot: PinSlot; point: PlanPoint }
  | { type: 'move'; slot: PinSlot; point: Coordinate }
  | { type: 'select'; slot: PinSlot }
  | { type: 'remove'; slot: PinSlot };

export const initialPlan: Plan = { pickup: null, dropoff: null, active: 'pickup' };

export function planReducer(plan: Plan, action: PlanAction): Plan {
  switch (action.type) {
    case 'place': {
      const next = { ...plan, [plan.active]: action.point };
      if (plan.active === 'pickup' && !plan.dropoff) return { ...next, active: 'dropoff' };
      return next;
    }
    case 'choose': {
      const next = { ...plan, [action.slot]: action.point };
      const other: PinSlot = action.slot === 'pickup' ? 'dropoff' : 'pickup';
      return plan[other] ? next : { ...next, active: other };
    }
    case 'move':
      return { ...plan, [action.slot]: action.point };
    case 'select':
      return { ...plan, active: action.slot };
    case 'remove':
      return { ...plan, [action.slot]: null, active: action.slot };
  }
}
