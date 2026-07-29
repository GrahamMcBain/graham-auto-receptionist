import { describe, expect, it } from 'vitest';
import { SchedulingService } from './scheduling.ts';

describe('SchedulingService', () => {
  it('returns only business-hour slots for a service', () => {
    const scheduler = new SchedulingService();

    expect(scheduler.getBusinessHours('2026-07-28')).toEqual({
      open: '8:00 AM',
      close: '5:00 PM',
      closed: false,
    });
    expect(scheduler.getBusinessHours('2026-08-02')).toEqual({ closed: true });

    const availability = scheduler.checkAvailability({
      date: '2026-07-28',
      service: 'oil_change',
      timeOfDay: 'morning',
    });

    expect(availability.available).toEqual(['9:00 AM', '10:30 AM', '11:00 AM']);
  });

  it('reserves an available slot and prevents a duplicate booking', () => {
    const scheduler = new SchedulingService();
    const request = {
      customerName: 'John Smith',
      email: 'john@example.com',
      service: 'oil_change',
      date: '2026-07-28',
      time: '10:30 AM',
    };

    const appointment = scheduler.bookAppointment(request);

    expect(appointment.status).toBe('confirmed');
    expect(appointment.time).toBe('10:30 AM');
    expect(
      scheduler.checkAvailability({ date: request.date, service: request.service }).available,
    ).not.toContain('10:30 AM');
    expect(() => scheduler.bookAppointment(request)).toThrow('no longer available');
  });

  it('reschedules and cancels an existing appointment', () => {
    const scheduler = new SchedulingService();
    const appointment = scheduler.bookAppointment({
      customerName: 'John Smith',
      email: 'john@example.com',
      service: 'oil_change',
      date: '2026-07-28',
      time: '9:00 AM',
    });

    const rescheduled = scheduler.rescheduleAppointment({
      appointmentId: appointment.id,
      date: '2026-07-28',
      time: '11:00 AM',
    });
    expect(rescheduled.time).toBe('11:00 AM');

    const cancelled = scheduler.cancelAppointment(appointment.id);
    expect(cancelled.status).toBe('cancelled');
  });
});
