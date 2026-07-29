import { describe, expect, it } from 'vitest';
import { createReceptionistTools } from './receptionist-tools.ts';
import { SchedulingService } from './scheduling.ts';

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
    const result = await toolNamed('checkAvailability').execute(
      { date: '2026-07-28', service: 'oil_change', timeOfDay: 'morning' },
      {},
    );

    expect(result).toMatchObject({ available: ['9:00 AM', '10:30 AM', '11:00 AM'] });
  });

  it('does not create an appointment before the customer confirms', async () => {
    const scheduler = new SchedulingService();
    const bookAppointment = toolNamed('bookAppointment', scheduler);
    const request = {
      customerName: 'John Smith',
      phone: '4155550142',
      service: 'oil_change',
      date: '2026-07-28',
      time: '10:30 AM',
    };

    const result = await bookAppointment.execute({ ...request, customerConfirmed: false }, {});
    expect(result).toMatchObject({ booked: false });
    expect(scheduler.findAppointments(request.phone)).toHaveLength(0);

    const confirmed = await bookAppointment.execute({ ...request, customerConfirmed: true }, {});
    expect(confirmed).toMatchObject({ booked: true, appointment: { time: '10:30 AM' } });
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
