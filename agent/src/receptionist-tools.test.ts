import { describe, expect, it } from 'vitest';
import { createReceptionistTools } from './receptionist-tools.ts';
import { SchedulingService } from './scheduling.ts';
import type { TemporalBookingClient } from './temporal-booking-client.ts';

type Tool = {
  name: string;
  execute: (arguments_: Record<string, unknown>, context: unknown) => Promise<unknown>;
};

function toolNamed(name: string, scheduler = new SchedulingService()) {
  const tools = createReceptionistTools(scheduler) as unknown as Tool[];
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing ${name} tool`);
  return tool;
}

describe('receptionist tools', () => {
  it('returns real availability for an appointment request', async () => {
    const events: unknown[] = [];
    const tools = createReceptionistTools(new SchedulingService(), {
      onEvent: (event) => events.push(event),
    }) as unknown as Tool[];
    const availability = tools.find((candidate) => candidate.name === 'checkAvailability');
    if (!availability) throw new Error('Missing checkAvailability tool');

    const result = await availability.execute(
      { date: '2026-07-28', service: 'oil_change', timeOfDay: 'morning' },
      {},
    );

    expect(result).toMatchObject({ available: ['9:00 AM', '10:30 AM', '11:00 AM'] });
    expect(events).toEqual([
      {
        type: 'availability_checked',
        availability: {
          date: '2026-07-28',
          service: 'Oil change',
          available: ['9:00 AM', '10:30 AM', '11:00 AM'],
          closed: false,
        },
      },
    ]);
  });

  it('does not create an appointment before the customer confirms', async () => {
    const scheduler = new SchedulingService();
    const bookAppointment = toolNamed('bookAppointment', scheduler);
    const request = {
      customerName: 'John Smith',
      email: 'john@example.com',
      service: 'oil_change',
      date: '2026-07-28',
      time: '10:30 AM',
    };

    const result = await bookAppointment.execute({ ...request, customerConfirmed: false }, {});
    expect(result).toMatchObject({ booked: false });
    expect(scheduler.findAppointments(request.email)).toHaveLength(0);

    const confirmed = await bookAppointment.execute({ ...request, customerConfirmed: true }, {});
    expect(confirmed).toMatchObject({ booked: true, appointment: { time: '10:30 AM' } });
  });

  it('starts a durable booking, then signals confirmation only after the caller says yes', async () => {
    const calls: unknown[] = [];
    const events: unknown[] = [];
    const workflowClient: TemporalBookingClient = {
      start: async (request) => {
        calls.push({ type: 'start', request });
        return { workflowId: 'appointment-demo', status: 'pending' };
      },
      signal: async (workflowId, action) => {
        calls.push({ type: 'signal', workflowId, action });
      },
    };
    const tools = createReceptionistTools(new SchedulingService(), {
      workflowClient,
      onEvent: (event) => events.push(event),
    }) as unknown as Tool[];
    const start = tools.find((candidate) => candidate.name === 'startAppointmentBooking');
    const confirm = tools.find((candidate) => candidate.name === 'confirmAppointmentBooking');
    if (!start || !confirm) throw new Error('Missing Temporal booking tools');

    const request = {
      customerName: 'John Smith',
      email: 'john@example.com',
      service: 'oil_change',
      date: '2026-07-28',
      time: '10:30 AM',
    };
    await confirm.execute({ workflowId: 'appointment-demo', customerConfirmed: false }, {});
    expect(calls).toContainEqual({ type: 'signal', workflowId: 'appointment-demo', action: 'cancel' });

    const pending = await start.execute(request, {});
    expect(pending).toMatchObject({ workflowId: 'appointment-demo', status: 'pending' });

    const confirmed = await confirm.execute(
      { workflowId: 'appointment-demo', customerConfirmed: true },
      {},
    );
    expect(confirmed).toMatchObject({ confirmed: true });
    expect(calls).toContainEqual({ type: 'signal', workflowId: 'appointment-demo', action: 'confirm' });
    expect(events).toContainEqual({
      type: 'appointment_booked',
      appointment: expect.objectContaining({ status: 'confirmed', time: '10:30 AM' }),
    });
  });

  it('marks a human handoff request for the staff dashboard', async () => {
    const events: unknown[] = [];
    const tools = createReceptionistTools(new SchedulingService(), {
      onEvent: (event) => events.push(event),
    }) as unknown as Tool[];
    const handoff = tools.find((candidate) => candidate.name === 'requestHumanTakeover');
    if (!handoff) throw new Error('Missing requestHumanTakeover tool');

    const result = await handoff.execute(
      { reason: 'The customer requested a service advisor.' },
      {},
    );

    expect(result).toMatchObject({ handoffRequested: true });
    expect(events).toEqual([
      { type: 'human_takeover_requested', reason: 'The customer requested a service advisor.' },
    ]);
  });
});
