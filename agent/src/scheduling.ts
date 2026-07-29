export const services = {
  oil_change: { name: 'Oil change', durationMinutes: 30, price: '$59.95' },
  tire_rotation: { name: 'Tire rotation', durationMinutes: 45, price: '$34.95' },
  brake_inspection: { name: 'Brake inspection', durationMinutes: 60, price: '$89.95' },
  diagnostic: { name: 'Diagnostic inspection', durationMinutes: 60, price: '$129.95' },
} as const;

export type ServiceId = keyof typeof services;
export type AppointmentStatus = 'confirmed' | 'cancelled';

export type Appointment = {
  id: string;
  customerName: string;
  email: string;
  service: ServiceId;
  date: string;
  time: string;
  status: AppointmentStatus;
};

type AvailabilityRequest = {
  date: string;
  service: ServiceId;
  timeOfDay?: 'morning' | 'afternoon' | 'any' | undefined;
  excludeAppointmentId?: string;
};

type BookingRequest = Omit<Appointment, 'id' | 'status'>;

const serviceSlots: Record<ServiceId, string[]> = {
  oil_change: ['9:00 AM', '10:30 AM', '11:00 AM', '1:00 PM', '2:30 PM', '3:30 PM'],
  tire_rotation: ['8:30 AM', '10:00 AM', '11:30 AM', '1:30 PM', '3:00 PM'],
  brake_inspection: ['8:30 AM', '10:00 AM', '1:00 PM', '2:30 PM', '4:00 PM'],
  diagnostic: ['9:00 AM', '10:30 AM', '1:30 PM', '3:00 PM'],
};

function validDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Please provide the appointment date in YYYY-MM-DD format.');
  }
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.valueOf())) throw new Error('That appointment date is not valid.');
  return parsed;
}

function isMorning(time: string) {
  return time.endsWith('AM');
}

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

export class SchedulingService {
  private appointments: Appointment[] = [];
  private nextId = 1;

  getBusinessHours(date: string) {
    const day = validDate(date).getDay();
    if (day === 0) return { closed: true };
    if (day === 6) return { open: '9:00 AM', close: '1:00 PM', closed: false };
    return { open: '8:00 AM', close: '5:00 PM', closed: false };
  }

  checkAvailability({
    date,
    service,
    timeOfDay = 'any',
    excludeAppointmentId,
  }: AvailabilityRequest) {
    const hours = this.getBusinessHours(date);
    if (hours.closed) return { date, service, available: [], closed: true };

    const bookedTimes = new Set(
      this.appointments
        .filter(
          (appointment) =>
            appointment.date === date &&
            appointment.status === 'confirmed' &&
            appointment.id !== excludeAppointmentId,
        )
        .map((appointment) => appointment.time),
    );
    const available = serviceSlots[service].filter((time) => {
      if (bookedTimes.has(time)) return false;
      if (timeOfDay === 'morning') return isMorning(time);
      if (timeOfDay === 'afternoon') return !isMorning(time);
      return true;
    });

    return { date, service, available, closed: false };
  }

  bookAppointment(request: BookingRequest): Appointment {
    const available = this.checkAvailability({
      date: request.date,
      service: request.service,
    }).available;
    if (!available.includes(request.time)) {
      throw new Error(`The ${request.time} appointment is no longer available.`);
    }
    const appointment: Appointment = {
      ...request,
      email: normalizedEmail(request.email),
      id: `apt_${this.nextId++}`,
      status: 'confirmed',
    };
    this.appointments.push(appointment);
    return appointment;
  }

  findAppointments(email: string) {
    const customerEmail = normalizedEmail(email);
    return this.appointments.filter(
      (appointment) => appointment.email === customerEmail && appointment.status === 'confirmed',
    );
  }

  rescheduleAppointment({
    appointmentId,
    date,
    time,
  }: {
    appointmentId: string;
    date: string;
    time: string;
  }) {
    const appointment = this.getActiveAppointment(appointmentId);
    const available = this.checkAvailability({
      date,
      service: appointment.service,
      excludeAppointmentId: appointment.id,
    }).available;
    if (!available.includes(time))
      throw new Error(`The ${time} appointment is no longer available.`);
    appointment.date = date;
    appointment.time = time;
    return appointment;
  }

  cancelAppointment(appointmentId: string) {
    const appointment = this.getActiveAppointment(appointmentId);
    appointment.status = 'cancelled';
    return appointment;
  }

  private getActiveAppointment(appointmentId: string) {
    const appointment = this.appointments.find(
      (item) => item.id === appointmentId && item.status === 'confirmed',
    );
    if (!appointment) throw new Error('I could not find an active appointment with those details.');
    return appointment;
  }
}
