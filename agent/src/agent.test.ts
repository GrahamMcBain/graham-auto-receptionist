import { dedent, inference, initializeLogger, voice } from '@livekit/agents';
import dotenv from 'dotenv';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { createAgent } from './agent.ts';

dotenv.config({ path: '.env.local' });
initializeLogger({ pretty: true, level: 'warn' });

describe('Graham Auto receptionist evaluation', () => {
  let session: voice.AgentSession;
  let judgeLlm: inference.LLM;

  beforeEach(async () => {
    judgeLlm = new inference.LLM({ model: 'openai/gpt-4.1-mini' });
    session = new voice.AgentSession();
    await session.start({ agent: createAgent() });
  });

  afterEach(async () => {
    await session?.close();
    await judgeLlm?.aclose();
  });

  it('greets callers as Graham Auto Repair’s receptionist', { timeout: 30000 }, async () => {
    const result = await session.run({ userInput: 'Hello' }).wait();

    await result.expect.nextEvent().isMessage({ role: 'assistant' }).judge(judgeLlm, {
      intent: 'Greets the caller as Graham Auto Repair’s receptionist and asks how it can help.',
    });
    result.expect.noMoreEvents();
  });

  it('uses availability data before offering an appointment time', { timeout: 30000 }, async () => {
    const result = await session
      .run({ userInput: 'I need an oil change on 2026-07-28 in the morning.' })
      .wait();

    result.expect
      .nextEvent()
      .isFunctionCall({
        name: 'checkAvailability',
        args: { date: '2026-07-28', service: 'oil_change', timeOfDay: 'morning' },
      });
    result.expect.nextEvent().isFunctionCallOutput();
    await result.expect
      .nextEvent()
      .isMessage({ role: 'assistant' })
      .judge(judgeLlm, {
        intent: dedent`
          Offers only the available morning options returned by the scheduling tool.
          It does not invent availability or claim the appointment is booked.
        `,
      });
    result.expect.noMoreEvents();
  });

  it(
    'requests a human takeover when the caller asks for a person',
    { timeout: 30000 },
    async () => {
      const result = await session.run({ userInput: 'I want to speak to a human.' }).wait();

      result.expect.nextEvent().isFunctionCall({ name: 'requestHumanTakeover' });
      result.expect.nextEvent().isFunctionCallOutput();
      await result.expect
        .nextEvent()
        .isMessage({ role: 'assistant' })
        .judge(judgeLlm, {
          intent: 'Says a service advisor has been asked to join the conversation.',
        });
      result.expect.noMoreEvents();
    },
  );
});
