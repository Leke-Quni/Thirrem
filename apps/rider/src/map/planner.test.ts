import { describe, expect, it } from 'vitest';
import { initialPlan, planReducer } from './planner';

const a = { lat: 42.38, lon: 20.43 };
const b = { lat: 42.37, lon: 20.42 };
const c = { lat: 42.39, lon: 20.44 };

describe('planReducer', () => {
  it('starts by asking for the Pickup Point', () => {
    expect(initialPlan).toEqual({ pickup: null, dropoff: null, active: 'pickup' });
  });

  it('puts the first map click on the Pickup Point and then asks for the Drop-off Point', () => {
    const plan = planReducer(initialPlan, { type: 'place', point: a });

    expect(plan).toEqual({ pickup: a, dropoff: null, active: 'dropoff' });
  });

  it('puts the second map click on the Drop-off Point', () => {
    const plan = planReducer(planReducer(initialPlan, { type: 'place', point: a }), { type: 'place', point: b });

    expect(plan.pickup).toEqual(a);
    expect(plan.dropoff).toEqual(b);
  });

  it('moves a pin that is already placed when the Rider drags it', () => {
    const placed = planReducer(planReducer(initialPlan, { type: 'place', point: a }), { type: 'place', point: b });

    const moved = planReducer(placed, { type: 'move', slot: 'pickup', point: c });

    expect(moved.pickup).toEqual(c);
    expect(moved.dropoff).toEqual(b);
  });

  it('lets the Rider choose which pin the next map click sets', () => {
    const placed = planReducer(planReducer(initialPlan, { type: 'place', point: a }), { type: 'place', point: b });

    const plan = planReducer(planReducer(placed, { type: 'select', slot: 'pickup' }), { type: 'place', point: c });

    expect(plan.pickup).toEqual(c);
    expect(plan.dropoff).toEqual(b);
  });

  it('removes one pin and asks for it again', () => {
    const placed = planReducer(planReducer(initialPlan, { type: 'place', point: a }), { type: 'place', point: b });

    const plan = planReducer(placed, { type: 'remove', slot: 'dropoff' });

    expect(plan).toEqual({ pickup: a, dropoff: null, active: 'dropoff' });
  });

  it('keeps the pin a click set, even when it lands where no street name exists', () => {
    const plan = planReducer(initialPlan, { type: 'place', point: { lat: 42.4, lon: 20.5 } });

    expect(plan.pickup).toEqual({ lat: 42.4, lon: 20.5 });
  });

  it('keeps the name of a place the Rider searched for, and drops it once the pin is dragged', () => {
    const named = planReducer(initialPlan, { type: 'choose', slot: 'pickup', point: { ...a, label: 'Rruga Bajram Curri' } });
    expect(named.pickup).toEqual({ ...a, label: 'Rruga Bajram Curri' });

    const dragged = planReducer(named, { type: 'move', slot: 'pickup', point: c });

    expect(dragged.pickup).toEqual(c);
  });

  it('chooses the Drop-off Point from a search without touching the Pickup Point', () => {
    const withPickup = planReducer(initialPlan, { type: 'place', point: a });

    const plan = planReducer(withPickup, { type: 'choose', slot: 'dropoff', point: { ...b, label: 'Hospital' } });

    expect(plan.pickup).toEqual(a);
    expect(plan.dropoff).toEqual({ ...b, label: 'Hospital' });
  });

  it('asks for the Drop-off Point next after the Pickup Point is chosen from a search', () => {
    const plan = planReducer(initialPlan, { type: 'choose', slot: 'pickup', point: a });

    expect(plan.active).toBe('dropoff');
  });

  it('keeps asking for the Pickup Point when only the Drop-off Point is chosen first', () => {
    const plan = planReducer(initialPlan, { type: 'choose', slot: 'dropoff', point: b });

    expect(plan.active).toBe('pickup');
  });
});

