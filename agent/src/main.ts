import { ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
import { audioEnhancement } from '@livekit/plugins-ai-coustics';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createAgent } from './agent.ts';
import { SchedulingService } from './scheduling.ts';

// Load environment variables from a local file.
// Make sure to set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET
// when running locally or self-hosting your agent server.
dotenv.config({ path: '.env.local' });

// This is the demo scheduling store. Replace it with a shared database-backed
// implementation before handling real customer appointments in production.
const scheduler = new SchedulingService();

export default defineAgent({
  entry: async (ctx) => {
    // Set up a voice AI pipeline using OpenAI, Cartesia, Deepgram, and the LiveKit turn detector
    const session = new voice.AgentSession({
      // Speech-to-text (STT) is your agent's ears, turning the user's speech into text that the LLM can understand
      // See all available models at https://docs.livekit.io/agents/models/stt/
      stt: new inference.STT({
        model: 'deepgram/nova-3',
        language: 'en-US',
      }),

      // Text-to-speech (TTS) is your agent's voice, turning the LLM's text into speech that the user can hear
      // See all available models as well as voice selections at https://docs.livekit.io/agents/models/tts/
      tts: new inference.TTS({
        model: 'cartesia/sonic-3',
        voice: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
      }),

      // Turn detection determines when the user is speaking and when the agent should respond.
      // The LiveKit audio turn detector is a multimodal model that encodes the user's audio
      // directly to predict end of turn. It's built into the SDK (no extra plugin) and
      // AgentSession supplies the required VAD automatically.
      // See more at https://docs.livekit.io/agents/logic/turns/turn-detector/
      turnHandling: {
        turnDetection: new inference.TurnDetector(),
        // A receptionist needs complete details (service, date, and time), so avoid
        // answering based on a partial transcript while the caller is still talking.
        preemptiveGeneration: { enabled: false },
        endpointing: {
          minDelay: 800,
          maxDelay: 3500,
        },
      },
    });

    // Start the session, which initializes the voice pipeline and warms up the models
    await session.start({
      agent: createAgent(scheduler, async (event) => {
        const participant = ctx.room.localParticipant;
        if (!participant) return;
        await participant.publishData(new TextEncoder().encode(JSON.stringify(event)), {
          reliable: true,
          topic: 'graham-auto.reception',
        });
      }),
      room: ctx.room,
      inputOptions: {
        // ai-coustics QUAIL audio enhancement for noise cancellation
        // Works for both WebRTC and telephony (SIP) participants
        noiseCancellation: audioEnhancement({ model: 'quailVfS' }),
      },
    });

    // // Add a virtual avatar to the session, if desired
    // // For other providers, see https://docs.livekit.io/agents/models/avatar/
    // const avatar = new anam.AvatarSession({
    //   personaConfig: {
    //     name: '...',
    //     avatarId: '...', // See https://docs.livekit.io/agents/models/avatar/plugins/anam
    //   },
    // });
    // // Start the avatar and wait for it to join
    // await avatar.start(session, ctx.room);

    // Join the room and connect to the user
    await ctx.connect();

    // Greet the user on joining
    session.generateReply({
      instructions:
        'Greet the caller as Graham Auto Repair’s receptionist and ask how you can help.',
    });
  },
});

// Run the agent server
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'graham-auto-receptionist-agent',
  }),
);
