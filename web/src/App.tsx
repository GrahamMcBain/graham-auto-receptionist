import { useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track } from 'livekit-client'
import {
  Bell, CalendarDays, ChevronDown, Clock3, Ellipsis, Headphones,
  LayoutDashboard, Menu, Mic, MoreHorizontal, Phone, PhoneCall,
  PhoneOff, Plus, Search, Settings, Sparkles, Users, Wrench,
} from 'lucide-react'
import { createReceptionCall } from './livekit'

type CallState = 'connected' | 'waiting' | 'ended'
type WorkspaceView = 'overview' | 'calls' | 'appointments' | 'customers' | 'settings'

type Transcript = {
  id: string
  speaker: 'Customer' | 'Receptionist'
  time: string
  text: string
}

type LiveAppointment = {
  service: string
  date: string
  available: string[]
  bookedTime?: string
  status: 'idle' | 'checking' | 'confirmed' | 'cancelled'
}

type ReceptionistEvent =
  | { type: 'availability_checked'; availability: Pick<LiveAppointment, 'service' | 'date' | 'available'> & { closed: boolean } }
  | { type: 'appointment_booked'; appointment: { service: string; date: string; time: string } }
  | { type: 'appointment_rescheduled'; appointment: { service: string; date: string; time: string } }
  | { type: 'appointment_cancelled'; appointment: { service: string; date: string; time: string } }
  | { type: 'human_takeover_requested'; reason: string }

const initialAppointment: LiveAppointment = {
  service: 'No appointment selected',
  date: 'Start a call to check availability',
  available: [],
  status: 'idle',
}

function Avatar({ initials, tone = 'blue' }: { initials: string; tone?: string }) {
  return <div className={`avatar ${tone}`}>{initials}</div>
}

function Waveform({ active }: { active: boolean }) {
  return <div className={`waveform ${active ? 'active' : ''}`} aria-label="Live audio level">
    {[7, 14, 22, 34, 19, 39, 52, 68, 43, 61, 34, 46, 26, 38, 18, 25, 12, 9].map((height, index) => (
      <span key={index} style={{ height }} />
    ))}
  </div>
}

function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('overview')
  const [callState, setCallState] = useState<CallState>('waiting')
  const [takeover, setTakeover] = useState(false)
  const [booked, setBooked] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<Transcript[]>([])
  const [appointment, setAppointment] = useState<LiveAppointment>(initialAppointment)
  const [mobileNav, setMobileNav] = useState(false)
  const [duration, setDuration] = useState(382)
  const [browserRoom, setBrowserRoom] = useState<Room | null>(null)
  const [browserCallError, setBrowserCallError] = useState<string | null>(null)
  const [isStartingBrowserCall, setIsStartingBrowserCall] = useState(false)
  const audioElements = useRef<HTMLAudioElement[]>([])
  const receivedTranscriptIds = useRef(new Set<string>())

  useEffect(() => {
    if (callState !== 'connected') return
    const interval = window.setInterval(() => setDuration((current) => current + 1), 1000)
    return () => window.clearInterval(interval)
  }, [callState])

  useEffect(() => () => {
    browserRoom?.disconnect()
    audioElements.current.forEach((element) => element.remove())
  }, [browserRoom])

  const displayDuration = `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`

  const addTranscript = (speaker: Transcript['speaker'], text: string, id: string) => {
    if (!text.trim() || receivedTranscriptIds.current.has(id)) return
    receivedTranscriptIds.current.add(id)
    setTranscript((items) => [...items, {
      id,
      speaker,
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      text,
    }])
  }

  const applyReceptionistEvent = (event: ReceptionistEvent) => {
    if (event.type === 'availability_checked') {
      setBooked(null)
      setAppointment({
        service: event.availability.service,
        date: event.availability.date,
        available: event.availability.available,
        status: 'checking',
      })
      return
    }

    if (event.type === 'appointment_booked' || event.type === 'appointment_rescheduled') {
      setBooked(event.appointment.time)
      setAppointment({
        service: event.appointment.service,
        date: event.appointment.date,
        available: [event.appointment.time],
        bookedTime: event.appointment.time,
        status: 'confirmed',
      })
      return
    }

    if (event.type === 'appointment_cancelled') {
      setBooked(null)
      setAppointment((current) => ({
        ...current,
        service: event.appointment.service,
        date: event.appointment.date,
        bookedTime: undefined,
        status: 'cancelled',
      }))
    }
  }

  const startBrowserCall = async () => {
    setIsStartingBrowserCall(true)
    setBrowserCallError(null)
    setTranscript([])
    receivedTranscriptIds.current.clear()
    const room = new Room()
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== Track.Kind.Audio) return
      const element = track.attach()
      if (element instanceof HTMLAudioElement) {
        element.autoplay = true
        element.dataset.receptionAudio = 'true'
        document.body.append(element)
        audioElements.current.push(element)
      }
    })
    room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
      if (topic !== 'graham-auto.reception') return
      try {
        applyReceptionistEvent(JSON.parse(new TextDecoder().decode(payload)) as ReceptionistEvent)
      } catch {
        // Ignore malformed data from other room participants.
      }
    })
    room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
      const speaker = participant?.identity.startsWith('customer-') ? 'Customer' : 'Receptionist'
      segments.filter((segment) => segment.final).forEach((segment) => {
        addTranscript(speaker, segment.text, segment.id)
      })
    })

    try {
      const credentials = await createReceptionCall('Website customer')
      await room.connect(credentials.url, credentials.token)
      await room.localParticipant.setMicrophoneEnabled(true)
      setBrowserRoom(room)
      setCallState('connected')
    } catch {
      room.disconnect()
      setBrowserCallError('We could not start the voice call. Check that the token API and agent worker are running.')
    } finally {
      setIsStartingBrowserCall(false)
    }
  }

  const endBrowserCall = () => {
    browserRoom?.disconnect()
    audioElements.current.forEach((element) => element.remove())
    audioElements.current = []
    setBrowserRoom(null)
    setCallState('ended')
  }

  const navigate = (view: WorkspaceView) => {
    setActiveView(view)
    setMobileNav(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Wrench size={20} strokeWidth={2.5} /></div>
          <span>Graham <b>Auto</b></span>
        </div>
        <p className="workspace-label">RECEPTION DESK</p>
        <nav>
          <button className={`nav-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => navigate('overview')}><LayoutDashboard size={19} />Overview</button>
          <button className={`nav-item ${activeView === 'calls' ? 'active' : ''}`} onClick={() => navigate('calls')}><PhoneCall size={19} />Calls {browserRoom && <span className="nav-count">1</span>}</button>
          <button className={`nav-item ${activeView === 'appointments' ? 'active' : ''}`} onClick={() => navigate('appointments')}><CalendarDays size={19} />Appointments</button>
          <button className={`nav-item ${activeView === 'customers' ? 'active' : ''}`} onClick={() => navigate('customers')}><Users size={19} />Customers</button>
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings size={19} />Settings</button>
          <div className="profile">
            <Avatar initials="GM" tone="peach" />
            <div><strong>Graham McBain</strong><small>Shop manager</small></div>
            <MoreHorizontal size={17} />
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={21} /></button>
          <div className="location"><span className="online-dot" /> Graham Auto Repair <ChevronDown size={15} /></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Search"><Search size={20} /></button>
            <button className="icon-button notification" aria-label="Notifications"><Bell size={20} /><i /></button>
            <div className="tiny-avatar">GM</div>
          </div>
        </header>

        <div className="content">
          {activeView === 'overview' && <>
          <section className="welcome-row">
            <div>
              <p className="eyebrow">TUESDAY, MAY 21</p>
              <h1>Good morning, Graham <span>👋</span></h1>
              <p className="subcopy">Here’s what’s happening at the shop today.</p>
            </div>
            <div className="welcome-actions">
              <button className={`browser-call ${browserRoom ? 'active' : ''}`} onClick={browserRoom ? endBrowserCall : startBrowserCall} disabled={isStartingBrowserCall}>
                {browserRoom ? <PhoneOff size={19} /> : <Phone size={19} />}
                {isStartingBrowserCall ? 'Connecting…' : browserRoom ? 'End browser call' : 'Call receptionist'}
              </button>
              <button className="new-appointment" onClick={() => navigate('appointments')}><Plus size={19} />New appointment</button>
            </div>
          </section>
          {browserCallError && <p className="browser-call-error">{browserCallError}</p>}

          <section className="metrics" aria-label="Today’s metrics">
            <article className="metric-card"><div className="metric-icon mint"><Phone size={20} /></div><div><span>Calls today</span><strong>18</strong><small className="positive">↗ 12% <em>vs. last Tuesday</em></small></div><button><Ellipsis size={20} /></button></article>
            <article className="metric-card"><div className="metric-icon violet"><CalendarDays size={20} /></div><div><span>Appointments</span><strong>12</strong><small className="positive">↗ 3 new <em>today</em></small></div><button><Ellipsis size={20} /></button></article>
            <article className="metric-card"><div className="metric-icon peach"><Users size={20} /></div><div><span>Customer satisfaction</span><strong>4.9 <b>/5</b></strong><small className="muted">From 47 conversations</small></div><button><Ellipsis size={20} /></button></article>
          </section>

          <section className="dashboard-grid" id="calls">
            <article className="panel live-call-panel">
              <div className="panel-heading">
                <div><div className="live-label"><span />{browserRoom ? 'LIVE CALL' : 'CALL STATUS'}</div><h2>{browserRoom ? 'Website customer' : 'No active caller'}</h2><p><Phone size={14} />{browserRoom ? `Browser voice call • ${displayDuration}` : 'Start a browser call to connect'}</p></div>
                <button className="more"><MoreHorizontal size={21} /></button>
              </div>
              <div className="call-participants">
                <div className="participant customer"><Avatar initials={browserRoom ? 'WC' : '--'} tone="navy" /><div><strong>{browserRoom ? 'Website customer' : 'Waiting for a caller'}</strong><span>Customer</span></div><Waveform active={callState === 'connected'} /></div>
                <div className="connection-line"><i /><i /><i /></div>
                <div className="participant agent"><div className="agent-avatar"><Sparkles size={22} /></div><div><strong>Graham's Receptionist</strong><span>AI assistant</span></div><div className="listening"><span />Listening</div></div>
              </div>
              <div className="call-action-row">
                <button className="takeover-button" onClick={() => setTakeover(!takeover)} disabled={!browserRoom}><Headphones size={18} />{takeover ? 'You’re on the call' : 'Join & take over'}</button>
                <button className={`hangup ${callState === 'ended' ? 'ended' : ''}`} onClick={endBrowserCall} disabled={!browserRoom}><PhoneOff size={18} />End call</button>
              </div>
              {takeover && <div className="takeover-note"><Mic size={16} />Your microphone is ready. The AI will continue to assist quietly.</div>}
            </article>

            <article className="panel transcript-panel">
              <div className="panel-heading compact"><div><h2>Live transcript</h2><p><span className="online-dot" /> Updating in real time</p></div><button className="view-all" onClick={() => navigate('calls')}>View full call</button></div>
              <div className="transcript" aria-live="polite">
                {transcript.map((line, index) => <div className={`transcript-line ${line.speaker === 'Receptionist' ? 'agent-line' : ''}`} key={`${line.time}-${index}`}><span><b>{line.speaker}</b><small>{line.time}</small></span><p>{line.text}</p></div>)}
                {!transcript.length && <p className="muted">Start a browser call to see the live conversation.</p>}
              </div>
            </article>
          </section>

          <section className="lower-grid" id="calendar">
            <article className="panel appointment-panel">
              <div className="panel-heading compact"><div><h2>Appointment status</h2><p>{appointment.status === 'confirmed' ? 'Voice booking confirmed' : appointment.status === 'checking' ? 'AI checked live availability' : 'Waiting for a voice request'}</p></div><span className="status-pill">{appointment.status === 'confirmed' ? 'Confirmed' : appointment.status === 'checking' ? 'In progress' : 'Ready'}</span></div>
              <div className="appointment-summary"><div className="service-icon"><Wrench size={19} /></div><div><strong>{appointment.service}</strong><span>{appointment.date}{appointment.status === 'checking' && ' • Available times below'}</span></div><button className="more"><MoreHorizontal size={20} /></button></div>
              <div className="availability-label"><Clock3 size={16} />Available times</div>
              <div className="time-options">
                {appointment.available.map((time) => <button className={booked === time ? 'selected' : ''} disabled key={time}>{time}{booked === time && <span>Booked</span>}</button>)}
                {!appointment.available.length && <span className="muted">Availability will appear after the receptionist checks it.</span>}
              </div>
              {booked && <p className="confirmation"><span>✓</span>Appointment confirmed for {appointment.date} at {booked}.</p>}
            </article>

            <article className="panel schedule-panel">
              <div className="panel-heading compact"><div><h2>Today’s schedule</h2><p>Tuesday, May 21</p></div><button className="view-all" onClick={() => navigate('appointments')}>View calendar</button></div>
              <div className="schedule-list">
                <div><time>9:00<span>AM</span></time><i className="teal" /><p><strong>Maria Rodriguez</strong><span>Tire rotation</span></p></div>
                <div><time>10:30<span>AM</span></time><i className="orange" /><p><strong>David Wilson</strong><span>Brake inspection</span></p></div>
                <div><time>1:00<span>PM</span></time><i className="purple" /><p><strong>Sarah Kim</strong><span>Oil change</span></p></div>
              </div>
            </article>
          </section>
          </>}

          {activeView === 'calls' && <>
            <section className="welcome-row workspace-header">
              <div><p className="eyebrow">CALL ACTIVITY</p><h1>Calls</h1><p className="subcopy">Monitor the live receptionist and review the conversation.</p></div>
              <button className={`browser-call ${browserRoom ? 'active' : ''}`} onClick={browserRoom ? endBrowserCall : startBrowserCall} disabled={isStartingBrowserCall}>
                {browserRoom ? <PhoneOff size={19} /> : <Phone size={19} />}
                {isStartingBrowserCall ? 'Connecting…' : browserRoom ? 'End browser call' : 'Start a call'}
              </button>
            </section>
            {browserCallError && <p className="browser-call-error">{browserCallError}</p>}
            <section className="page-grid">
              <article className="panel live-call-panel">
                <div className="panel-heading"><div><div className="live-label"><span />{browserRoom ? 'LIVE CALL' : 'NO ACTIVE CALL'}</div><h2>{browserRoom ? 'Website customer' : 'Receptionist standing by'}</h2><p><Phone size={14} />{browserRoom ? `Browser voice call • ${displayDuration}` : 'Start a call from this page or Overview'}</p></div></div>
                <div className="call-participants"><div className="participant customer"><Avatar initials={browserRoom ? 'WC' : '--'} tone="navy" /><div><strong>{browserRoom ? 'Website customer' : 'Waiting for a caller'}</strong><span>Customer</span></div><Waveform active={callState === 'connected'} /></div><div className="connection-line"><i /><i /><i /></div><div className="participant agent"><div className="agent-avatar"><Sparkles size={22} /></div><div><strong>Graham's Receptionist</strong><span>AI assistant</span></div><div className="listening"><span />{browserRoom ? 'Listening' : 'Ready'}</div></div></div>
                <div className="call-action-row"><button className="takeover-button" onClick={() => setTakeover(!takeover)} disabled={!browserRoom}><Headphones size={18} />{takeover ? 'You’re on the call' : 'Join & take over'}</button><button className="hangup" onClick={endBrowserCall} disabled={!browserRoom}><PhoneOff size={18} />End call</button></div>
              </article>
              <article className="panel transcript-panel full-transcript-panel"><div className="panel-heading compact"><div><h2>Call transcript</h2><p><span className="online-dot" /> Live from LiveKit</p></div></div><div className="transcript" aria-live="polite">{transcript.map((line) => <div className={`transcript-line ${line.speaker === 'Receptionist' ? 'agent-line' : ''}`} key={line.id}><span><b>{line.speaker}</b><small>{line.time}</small></span><p>{line.text}</p></div>)}{!transcript.length && <p className="muted">The transcript will appear as soon as the call begins.</p>}</div></article>
            </section>
          </>}

          {activeView === 'appointments' && <>
            <section className="welcome-row workspace-header"><div><p className="eyebrow">SCHEDULING</p><h1>Appointments</h1><p className="subcopy">Voice bookings appear here as soon as the receptionist confirms them.</p></div><button className="browser-call" onClick={browserRoom ? endBrowserCall : startBrowserCall}>{browserRoom ? <PhoneOff size={19} /> : <Phone size={19} />}{browserRoom ? 'End browser call' : 'Book by voice'}</button></section>
            <article className="panel appointment-list-panel">
              <div className="appointment-list-heading"><div><h2>{appointment.status === 'confirmed' ? 'Confirmed appointment' : 'Appointment status'}</h2><p>{appointment.status === 'confirmed' ? 'Created from the LiveKit voice call' : 'No confirmed voice appointment yet'}</p></div><span className={`status-pill ${appointment.status === 'confirmed' ? 'confirmed-pill' : ''}`}>{appointment.status === 'confirmed' ? 'Confirmed' : 'Waiting'}</span></div>
              {appointment.status === 'confirmed' ? <div className="appointment-list-row"><div className="service-icon"><Wrench size={19} /></div><div><strong>{appointment.service}</strong><span>{appointment.date} <b>•</b> {appointment.bookedTime}</span></div><div className="appointment-source"><Sparkles size={15} /> Booked by receptionist</div></div> : <div className="empty-state"><CalendarDays size={28} /><strong>No appointment selected</strong><span>Start a voice call and complete a booking to see it here.</span></div>}
            </article>
          </>}

          {activeView === 'customers' && <section className="workspace-header empty-workspace"><Users size={30} /><h1>Customers</h1><p className="subcopy">Customer records will be available when the scheduling demo is connected to a persistent database.</p></section>}
          {activeView === 'settings' && <section className="workspace-header empty-workspace"><Settings size={30} /><h1>Settings</h1><p className="subcopy">LiveKit voice configuration is active and managed by the deployed receptionist agent.</p></section>}
        </div>
      </main>
    </div>
  )
}

export default App
