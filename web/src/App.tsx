import { useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track } from 'livekit-client'
import {
  Bell, CalendarDays, ChevronDown, Clock3, Ellipsis, Headphones,
  LayoutDashboard, Menu, Mic, MoreHorizontal, Phone, PhoneCall,
  PhoneOff, Plus, Search, Settings, Sparkles, Users, Wrench,
} from 'lucide-react'
import { createReceptionCall } from './livekit'

type CallState = 'connected' | 'waiting' | 'ended'

type Transcript = {
  speaker: 'Customer' | 'Receptionist'
  time: string
  text: string
}

const initialTranscript: Transcript[] = [
  { speaker: 'Receptionist', time: '10:06 AM', text: 'Thanks for calling Graham Auto Repair. This is Graham’s virtual receptionist. How can I help?' },
  { speaker: 'Customer', time: '10:06 AM', text: 'Hi, I need to schedule an oil change this Thursday morning.' },
  { speaker: 'Receptionist', time: '10:06 AM', text: 'Of course. Let me check our Thursday-morning availability for an oil change.' },
]

const availability = ['9:00 AM', '10:30 AM', '11:00 AM']

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
  const [callState, setCallState] = useState<CallState>('connected')
  const [takeover, setTakeover] = useState(false)
  const [booked, setBooked] = useState<string | null>(null)
  const [transcript, setTranscript] = useState(initialTranscript)
  const [mobileNav, setMobileNav] = useState(false)
  const [duration, setDuration] = useState(382)
  const [browserRoom, setBrowserRoom] = useState<Room | null>(null)
  const [browserCallError, setBrowserCallError] = useState<string | null>(null)
  const [isStartingBrowserCall, setIsStartingBrowserCall] = useState(false)
  const audioElements = useRef<HTMLAudioElement[]>([])

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

  const addDemoTurn = () => {
    if (booked) return
    setTranscript((items) => [...items,
      { speaker: 'Receptionist', time: '10:07 AM', text: 'We have appointments at 9:00, 10:30, or 11:00. Which works best for you?' },
      { speaker: 'Customer', time: '10:07 AM', text: '10:30 would be great.' },
    ])
  }

  const bookAppointment = (time: string) => {
    setBooked(time)
    setTranscript((items) => [...items, {
      speaker: 'Receptionist', time: '10:08 AM', text: `Perfect — you’re booked for an oil change this Thursday at ${time}. We’ll see you then!`,
    }])
  }

  const startBrowserCall = async () => {
    setIsStartingBrowserCall(true)
    setBrowserCallError(null)
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

    try {
      const credentials = await createReceptionCall('Website customer')
      await room.connect(credentials.url, credentials.token)
      await room.localParticipant.setMicrophoneEnabled(true)
      setBrowserRoom(room)
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
          <a className="nav-item active" href="#dashboard"><LayoutDashboard size={19} />Overview</a>
          <a className="nav-item" href="#calls"><PhoneCall size={19} />Calls <span className="nav-count">1</span></a>
          <a className="nav-item" href="#calendar"><CalendarDays size={19} />Appointments</a>
          <a className="nav-item" href="#customers"><Users size={19} />Customers</a>
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="#settings"><Settings size={19} />Settings</a>
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

        <div className="content" id="dashboard">
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
              <button className="new-appointment"><Plus size={19} />New appointment</button>
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
                <div><div className="live-label"><span />LIVE CALL</div><h2>John Smith</h2><p><Phone size={14} />(415) 555-0142 <b>•</b> {displayDuration}</p></div>
                <button className="more"><MoreHorizontal size={21} /></button>
              </div>
              <div className="call-participants">
                <div className="participant customer"><Avatar initials="JS" tone="navy" /><div><strong>John Smith</strong><span>Customer</span></div><Waveform active={callState === 'connected'} /></div>
                <div className="connection-line"><i /><i /><i /></div>
                <div className="participant agent"><div className="agent-avatar"><Sparkles size={22} /></div><div><strong>Graham's Receptionist</strong><span>AI assistant</span></div><div className="listening"><span />Listening</div></div>
              </div>
              <div className="call-action-row">
                <button className="takeover-button" onClick={() => setTakeover(!takeover)}><Headphones size={18} />{takeover ? 'You’re on the call' : 'Join & take over'}</button>
                <button className={`hangup ${callState === 'ended' ? 'ended' : ''}`} onClick={() => setCallState(callState === 'ended' ? 'connected' : 'ended')}><PhoneOff size={18} />{callState === 'ended' ? 'Reconnect' : 'End call'}</button>
              </div>
              {takeover && <div className="takeover-note"><Mic size={16} />Your microphone is ready. The AI will continue to assist quietly.</div>}
            </article>

            <article className="panel transcript-panel">
              <div className="panel-heading compact"><div><h2>Live transcript</h2><p><span className="online-dot" /> Updating in real time</p></div><button className="view-all">View full call</button></div>
              <div className="transcript" aria-live="polite">
                {transcript.map((line, index) => <div className={`transcript-line ${line.speaker === 'Receptionist' ? 'agent-line' : ''}`} key={`${line.time}-${index}`}><span><b>{line.speaker}</b><small>{line.time}</small></span><p>{line.text}</p></div>)}
              </div>
              {!booked && <button className="demo-turn" onClick={addDemoTurn}>Play next conversation turn <span>→</span></button>}
            </article>
          </section>

          <section className="lower-grid" id="calendar">
            <article className="panel appointment-panel">
              <div className="panel-heading compact"><div><h2>Appointment in progress</h2><p>AI is checking availability</p></div><span className="status-pill">In progress</span></div>
              <div className="appointment-summary"><div className="service-icon"><Wrench size={19} /></div><div><strong>Oil change</strong><span>Thursday, May 23 <b>•</b> Morning</span></div><button className="more"><MoreHorizontal size={20} /></button></div>
              <div className="availability-label"><Clock3 size={16} />Available times</div>
              <div className="time-options">
                {availability.map((time) => <button className={booked === time ? 'selected' : ''} onClick={() => bookAppointment(time)} disabled={Boolean(booked) && booked !== time} key={time}>{time}{booked === time && <span>Booked</span>}</button>)}
              </div>
              {booked && <p className="confirmation"><span>✓</span>Appointment confirmed for Thursday at {booked}.</p>}
            </article>

            <article className="panel schedule-panel">
              <div className="panel-heading compact"><div><h2>Today’s schedule</h2><p>Tuesday, May 21</p></div><button className="view-all">View calendar</button></div>
              <div className="schedule-list">
                <div><time>9:00<span>AM</span></time><i className="teal" /><p><strong>Maria Rodriguez</strong><span>Tire rotation</span></p></div>
                <div><time>10:30<span>AM</span></time><i className="orange" /><p><strong>David Wilson</strong><span>Brake inspection</span></p></div>
                <div><time>1:00<span>PM</span></time><i className="purple" /><p><strong>Sarah Kim</strong><span>Oil change</span></p></div>
              </div>
            </article>
          </section>
        </div>
      </main>
    </div>
  )
}

export default App
