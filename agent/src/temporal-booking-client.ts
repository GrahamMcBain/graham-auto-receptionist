export type TemporalBookingRequest = {
  customerName: string;
  email: string;
  service: 'oil_change' | 'tire_rotation' | 'brake_inspection' | 'diagnostic';
  date: string;
  requestedTime: string;
};

export type TemporalBookingClient = {
  start(request: TemporalBookingRequest): Promise<{ workflowId: string; status: 'pending' }>;
  signal(workflowId: string, action: 'confirm' | 'cancel'): Promise<void>;
};

function required(name: 'TEMPORAL_BOOKING_API_URL' | 'TEMPORAL_BOOKING_API_SECRET') {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to use durable appointment booking.`);
  return value;
}

/**
 * Calls the small Vercel API that owns Temporal Cloud credentials. The agent
 * never needs direct access to the Temporal API key.
 */
export class HttpTemporalBookingClient implements TemporalBookingClient {
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(
    baseUrl = required('TEMPORAL_BOOKING_API_URL'),
    secret = required('TEMPORAL_BOOKING_API_SECRET'),
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secret = secret;
  }

  async start(request: TemporalBookingRequest) {
    const response = await this.request('/api/appointments', request);
    const body = (await response.json()) as { workflowId?: string; status?: 'pending'; error?: string };
    if (!response.ok || !body.workflowId || body.status !== 'pending') {
      throw new Error(body.error ?? 'Unable to start durable appointment booking.');
    }
    return { workflowId: body.workflowId, status: body.status };
  }

  async signal(workflowId: string, action: 'confirm' | 'cancel') {
    const response = await this.request('/api/appointment-action', { workflowId, action });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? 'Unable to update durable appointment booking.');
    }
  }

  private request(path: string, body: unknown) {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }
}
