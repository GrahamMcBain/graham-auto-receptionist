import { llm } from '@livekit/agents';
import { z } from 'zod';
import { SchedulingService, type ServiceId, services } from './scheduling.ts';

const serviceSchema = z.enum(['oil_change', 'tire_rotation', 'brake_inspection', 'diagnostic']);
const phoneSchema = z.string().min(7).describe('Customer phone number, including area code.');

export type ReceptionistEvent =
  | {
      type: 'availability_checked';
      availability: {
        date: string;
        service: string;
        available: string[];
        closed: boolean;
      };
    }
  | { type: 'appointment_booked'; appointment: ReturnType<typeof appointmentSummary> }
  | { type: 'appointment_rescheduled'; appointment: ReturnType<typeof appointmentSummary> }
  | { type: 'appointment_cancelled'; appointment: ReturnType<typeof appointmentSummary> }
  | { type: 'human_takeover_requested'; reason: string };

type ReceptionistToolOptions = {
  onEvent?: ((event: ReceptionistEvent) => Promise<void> | void) | undefined;
};

function appointmentSummary(appointment: {
  id: string;
  customerName: string;
  service: ServiceId;
  date: string;
  time: string;
  status: string;
}) {
  return {
    id: appointment.id,
    customerName: appointment.customerName,
    service: services[appointment.service].name,
    date: appointment.date,
    time: appointment.time,
    status: appointment.status,
  };
}

export function createReceptionistTools(
  scheduler: SchedulingService,
  options: ReceptionistToolOptions = {},
) {
  return [
    llm.tool({
      name: 'getBusinessHours',
      description:
        'Get Graham Auto Repair business hours for a specific date. Use this for any question about whether the shop is open.',
      parameters: z.object({
        date: z.string().describe('Date in YYYY-MM-DD format.'),
      }),
      execute: async ({ date }) => ({ date, ...scheduler.getBusinessHours(date) }),
    }),
    llm.tool({
      name: 'checkAvailability',
      description:
        'Check real appointment availability before offering or promising any time. Never state availability without calling this tool.',
      parameters: z.object({
        date: z.string().describe('Appointment date in YYYY-MM-DD format.'),
        service: serviceSchema.describe('Requested service.'),
        timeOfDay: z
          .enum(['morning', 'afternoon', 'any'])
          .optional()
          .describe('Requested part of day, if known.'),
      }),
      execute: async ({ date, service, timeOfDay }) => {
        const availability = scheduler.checkAvailability({ date, service, timeOfDay });
        await options.onEvent?.({
          type: 'availability_checked',
          availability: {
            date: availability.date,
            service: services[service].name,
            available: availability.available,
            closed: availability.closed,
          },
        });
        return availability;
      },
    }),
    llm.tool({
      name: 'bookAppointment',
      description:
        'Create a confirmed appointment. Call only after the customer has heard and explicitly confirmed the service, date, time, and contact details.',
      parameters: z.object({
        customerName: z.string().min(2).describe('Customer full name.'),
        phone: phoneSchema,
        service: serviceSchema.describe('Service to book.'),
        date: z.string().describe('Appointment date in YYYY-MM-DD format.'),
        time: z.string().describe('Exact time returned by checkAvailability.'),
        customerConfirmed: z
          .boolean()
          .describe('True only after the customer explicitly confirms the appointment details.'),
      }),
      execute: async ({ customerConfirmed, ...request }) => {
        if (!customerConfirmed) {
          return {
            booked: false,
            reason: 'The customer has not confirmed the appointment details yet.',
          };
        }
        const appointment = scheduler.bookAppointment(request);
        const summary = appointmentSummary(appointment);
        await options.onEvent?.({ type: 'appointment_booked', appointment: summary });
        return { booked: true, appointment: summary };
      },
    }),
    llm.tool({
      name: 'lookupCustomerAppointments',
      description:
        'Find a customer’s active appointments by phone number before a cancellation or reschedule.',
      parameters: z.object({ phone: phoneSchema }),
      execute: async ({ phone }) => ({
        appointments: scheduler.findAppointments(phone).map(appointmentSummary),
      }),
    }),
    llm.tool({
      name: 'rescheduleAppointment',
      description:
        'Move an existing appointment after checking the new time is available and the customer explicitly confirms the new date and time.',
      parameters: z.object({
        appointmentId: z
          .string()
          .describe('Appointment identifier returned by lookupCustomerAppointments.'),
        date: z.string().describe('New appointment date in YYYY-MM-DD format.'),
        time: z.string().describe('New exact appointment time.'),
        customerConfirmed: z
          .boolean()
          .describe(
            'True only after the customer explicitly confirms the new appointment details.',
          ),
      }),
      execute: async ({ appointmentId, date, time, customerConfirmed }) => {
        if (!customerConfirmed) {
          return {
            rescheduled: false,
            reason: 'The customer has not confirmed the new appointment details yet.',
          };
        }
        const summary = appointmentSummary(
          scheduler.rescheduleAppointment({ appointmentId, date, time }),
        );
        await options.onEvent?.({ type: 'appointment_rescheduled', appointment: summary });
        return { rescheduled: true, appointment: summary };
      },
    }),
    llm.tool({
      name: 'cancelAppointment',
      description:
        'Cancel an existing appointment only after the customer explicitly confirms that they want it cancelled.',
      parameters: z.object({
        appointmentId: z
          .string()
          .describe('Appointment identifier returned by lookupCustomerAppointments.'),
        customerConfirmed: z
          .boolean()
          .describe('True only after the customer explicitly confirms cancellation.'),
      }),
      execute: async ({ appointmentId, customerConfirmed }) => {
        if (!customerConfirmed) {
          return { cancelled: false, reason: 'The customer has not confirmed cancellation yet.' };
        }
        const summary = appointmentSummary(scheduler.cancelAppointment(appointmentId));
        await options.onEvent?.({ type: 'appointment_cancelled', appointment: summary });
        return { cancelled: true, appointment: summary };
      },
    }),
    llm.tool({
      name: 'requestHumanTakeover',
      description:
        'Request staff assistance when a customer asks for a human, is upset, has a safety concern, or needs a service the receptionist cannot handle.',
      parameters: z.object({
        reason: z.string().describe('Brief reason staff should join the call.'),
      }),
      execute: async ({ reason }) => {
        console.info('Human takeover requested', { reason });
        await options.onEvent?.({ type: 'human_takeover_requested', reason });
        return {
          handoffRequested: true,
          message: 'A service advisor has been asked to join the conversation.',
        };
      },
    }),
  ];
}
