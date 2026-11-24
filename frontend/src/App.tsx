import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  addAlert, analyzeSwing, askCoach, bookLesson, createFolder, disconnectWearable, dollars, joinClass, likeReel, live, loadAlerts,
  loadArticles, loadClasses, loadCoaches, loadConversations, loadCourtDay, loadDrawer, loadFindings, loadFolders, loadHome, loadLessonOptions,
  loadMessages, loadPathway, loadProfile, loadReels, loadStats, loadTraining, loadWearables, payInvoice, reserveSlot, runAgent, saveItem,
  saveProfile, saveSettings, sendMessage, setAlertActive, setFollow, signIn, signOut, subscribeMessages, toggleChecklist, useData, useSession,
  type CheckoutItem, type Profile,
} from './lib/api'

type Tab = 'Home' | 'Stats' | 'Aces' | 'Coach' | 'Book'
type IconName =
  | 'home'
  | 'chart'
  | 'play'
  | 'coach'
  | 'calendar'
  | 'arrow'
  | 'check'
  | 'racket'
  | 'wallet'
  | 'spark'
  | 'pin'
  | 'heart'
  | 'bookmark'
  | 'share'
  | 'upload'
  | 'camera'
  | 'message'
  | 'settings'
  | 'moon'
  | 'close'

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9.5 20v-6h5v6"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  play: <><path d="M8 5v14l11-7Z"/></>,
  coach: <><path d="M5 19c1.4-3.3 3.7-5 7-5s5.6 1.7 7 5"/><circle cx="12" cy="7" r="4"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
  check: <><path d="m5 12 4 4L19 6"/></>,
  racket: <><ellipse cx="15" cy="8" rx="5" ry="7" transform="rotate(35 15 8)"/><path d="m11.4 13.5-6.9 7M7 18l2 2"/></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/></>,
  spark: <><path d="m12 2 1.4 5.1L18 9l-4.6 1.9L12 16l-1.4-5.1L6 9l4.6-1.9ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7Z"/></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  heart: <><path d="M20.8 5.7c-2.2-2.2-5.8-1.9-7.8.5l-1 1.2-1-1.2C9 3.8 5.4 3.5 3.2 5.7.7 8.2 1 12.4 3.8 14.8L12 22l8.2-7.2c2.8-2.4 3.1-6.6.6-9.1Z"/></>,
  bookmark: <><path d="M6 3h12v18l-6-4-6 4Z"/></>,
  share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></>,
  upload: <><path d="M12 16V3M7 8l5-5 5 5M4 15v6h16v-6"/></>,
  camera: <><rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 6 1.5-3h5L16 6"/><circle cx="12" cy="13" r="4"/></>,
  message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  moon: <><path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/></>,
  close: <><path d="m5 5 14 14M19 5 5 19"/></>,
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const nav: { name: Tab; icon: IconName }[] = [
  { name: 'Home', icon: 'home' },
  { name: 'Stats', icon: 'chart' },
  { name: 'Aces', icon: 'play' },
  { name: 'Coach', icon: 'coach' },
  { name: 'Book', icon: 'calendar' },
]

function Ring({ value, color, label }: { value: number; color: string; label: string }) {
  return <div className="ring-wrap">
    <div className="ring" style={{ background: `conic-gradient(${color} ${value}%, var(--line) 0)` }}><span>{value}%</span></div>
    <small>{label}</small>
  </div>
}

function Header({ active, setActive, openProfile, dark, setDark, me }: { active: Tab; setActive: (t: Tab) => void; openProfile: () => void; dark: boolean; setDark: (v: boolean) => void; me?: Profile }) {
  return <header className="site-header">
    <button className="brand" onClick={() => setActive('Home')} aria-label="Courtside home"><img src="/assets/courtside-mark.svg" alt=""/><span>COURTSIDE</span></button>
    <nav className="main-nav" aria-label="Primary">
      {nav.map(item => <button key={item.name} className={active === item.name ? 'active' : ''} onClick={() => setActive(item.name)}>{item.name}</button>)}
    </nav>
    <div className="header-actions">
      <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle color theme"><Icon name="moon" size={18}/></button>
      <button className="profile-chip" onClick={openProfile} aria-label="Open profile"><span>{me?.initials ?? 'AB'}</span><i>{me?.ntrp ?? '3.8'}</i></button>
    </div>
  </header>
}

function Subnav({ items, active, setActive }: { items: string[]; active: string; setActive: (value: string) => void }) {
  return <nav className="subnav" aria-label="Section navigation">{items.map(item => <button key={item} className={active === item ? 'active' : ''} onClick={() => setActive(item)}>{item}</button>)}</nav>
}

function EmptyArt({ type = 'court' }: { type?: 'court' | 'racket' | 'pulse' }) {
  return <div className={`empty-art ${type}`} aria-hidden="true"><i/><i/><i/></div>
}

function SectionHead({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="section-head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action && <button className="text-link" onClick={onAction}>{action}<Icon name="arrow" size={17}/></button>}</div>
}

function Loading({ label = 'LOADING YOUR GAME' }: { label?: string }) {
  return <div className="loading-state"><div className="tennis-loader"><i/></div><p className="eyebrow">{label}</p></div>
}

function SignIn() {
  const [email, setEmail] = useState('student@courtside.dev')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); setError(null)
    try { await signIn(email, password) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="overlay modal-overlay"><div className="modal">
    <p className="eyebrow">MEMBER SIGN IN</p><h2>Welcome back to Courtside.</h2>
    <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"/></label>
    <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="current-password"/></label>
    <button className="primary wide" onClick={submit} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <small className="secure">{error ?? 'SECURED BY SUPABASE AUTH'}</small>
  </div></div>
}

const HOME_SAMPLE = {
  next: { day: 'WED · 22 MAY', title: 'Evening hit at Fort Greene', time: '6:30 PM' },
  match: { meta: 'May 20 · Clay', sets: [{ text: '6–4', won: false }, { text: '4–6', won: false }, { text: '10–7', won: true }], headline: 'Patience won the third.', text: 'You created 38% more space before changing direction. Keep building around your backhand pattern.', firstServe: '67%', ratio: '1.8', winners: '12' },
  training: { title: 'Wednesday build', items: [{ id: '0', title: '10 min dynamic warm-up', done: true, note: '10 min' }, { id: '1', title: 'Cross-court backhand ladder', done: false, note: '20 min' }, { id: '2', title: 'Serve + first ball pattern', done: false, note: '15 min' }] },
  racket: { name: 'Blade 98 · Primary', strings: 'Solinco Hyper-G · 52 lbs', hours: '12.5 hours played', restring: 'Restring in 7.5h' },
  finding: { quote: '“Your contact point is drifting 14 cm late under pressure.”', badge: '14 cm', text: 'Start the unit turn before the bounce. The change should unlock more cross-court depth.' },
  court: { name: 'Fort Greene Tennis Courts', meta: '0.8 mi · Hard · Outdoor', slots: [{ id: 'a', time: '5:30 PM', open: true }, { id: 'b', time: '6:30 PM', open: true }, { id: 'c', time: '8:00 PM', open: true }] },
  invoice: { label: 'Private lesson · Coach Elena', amount: '$85.00', due: 'Due May 24', invoiceId: undefined as string | undefined },
}

function Home({ go, pay }: { go: (t: Tab) => void; pay: (item: CheckoutItem) => void }) {
  const { data, reload } = useData(loadHome)
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [slot, setSlot] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (live && !data) return <main><Loading/></main>
  const h = live ? data! : HOME_SAMPLE
  const items = h.training.items.map(t => ({ ...t, done: toggled[t.id] ?? t.done }))
  const doneCount = items.filter(t => t.done).length
  const toggle = (id: string, done: boolean) => {
    setToggled(x => ({ ...x, [id]: done }))
    if (live) toggleChecklist(id, done).then(reload, e => { setError(e.message); setToggled(x => { const { [id]: _, ...rest } = x; return rest }) })
  }
  const slots = h.court?.slots ?? []
  const chosen = slots.find(s => s.id === slot) ?? slots.find(s => s.open) ?? slots[1] ?? slots[0]
  const reserve = () => {
    if (!live || !chosen) return go('Book')
    reserveSlot(chosen.id).then(item => { pay(item); reload() }, e => setError(e.message))
  }
  return <main>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">YOUR TENNIS, COMPOSED</p>
        <h1>Play the point.<br/><em>Own the pattern.</em></h1>
        <p className="lede">One intelligent home for your game, training, coaching, courts, and the equipment behind every point.</p>
        <div className="hero-actions"><button className="primary" onClick={() => go('Coach')}>Analyze my game <Icon name="arrow"/></button><button className="secondary" onClick={() => go('Stats')}>View performance</button></div>
        {h.next && <div className="today-note"><span>{h.next.day}</span><strong>{h.next.title}</strong><i>{h.next.time}</i></div>}
      </div>
      <div className="hero-art" aria-label="Tennis player hitting a one-handed backhand">
        <div className="hero-index"><span>01</span><small>THE COMPLETE PLAYER</small></div>
        <img src="/assets/backhand-silhouette.png" alt="Espresso silhouette of a tennis player hitting a one-handed backhand"/>
        <div className="ball-orbit"/>
      </div>
    </section>

    <section className="dashboard section-pad">
      <SectionHead eyebrow="TODAY AT A GLANCE" title="Your game, in motion." action="Open full schedule" onAction={() => go('Book')}/>
      {error && <p className="source-note">{error}</p>}
      <div className="widget-grid">
        <article className="card match-card clickable" onClick={() => go('Stats')}>
          <div className="card-top"><span className="tag">LAST MATCH</span><span className="muted">{h.match?.meta ?? 'No matches yet'}</span></div>
          <div className="scoreline">{(h.match?.sets ?? []).map((s, i) => <strong key={i} className={s.won ? 'won' : undefined}>{s.text}</strong>)}</div>
          <h3>{h.match?.headline ?? 'Log your first match.'}</h3>
          <p>{h.match?.text ?? 'Record a match to unlock your analysis.'}</p>
          <div className="metric-row"><span><b>{h.match?.firstServe ?? '–'}</b>1st serve</span><span><b>{h.match?.ratio ?? '–'}</b>W/E ratio</span><span><b>{h.match?.winners ?? '–'}</b>Winners</span></div>
          <button className="text-link">Full analysis <Icon name="arrow" size={17}/></button>
        </article>

        <article className="card training-card">
          <div className="card-top"><span className="tag">TRAINING</span><span className="count">{doneCount}/{items.length}</span></div>
          <h3>{h.training.title}</h3>
          <div className="progress"><i style={{ width: `${items.length ? doneCount / items.length * 100 : 0}%` }}/></div>
          <div className="task-list">{items.map(d => <button key={d.id} onClick={() => toggle(d.id, !d.done)} className={d.done ? 'done' : ''}><span><Icon name="check" size={14}/></span>{d.title}<small>{d.note}</small></button>)}</div>
          <button className="secondary wide" onClick={() => go('Stats')}>Continue session</button>
        </article>

        <article className="card wardrobe-card">
          <div className="card-top"><span className="tag">MY WARDROBE</span><Icon name="racket"/></div>
          <div className="wardrobe-photo"><img src="/assets/racket-wardrobe.png" alt="Three premium tennis rackets in the wardrobe"/></div>
          <h3>{h.racket?.name ?? 'No racket yet'}</h3>
          <p>{h.racket?.strings ?? 'Add your racket to track string wear.'}</p>
          <div className="wear"><span>{h.racket?.hours ?? ''}</span><span>{h.racket?.restring ?? ''}</span></div>
        </article>

        <article className="card insight-card clickable" onClick={() => go('Coach')}>
          <div className="card-top"><span className="tag">AI COACH FINDING</span><span className="spark-box"><Icon name="spark"/></span></div>
          <p className="quote">{h.finding?.quote ?? '“Upload a stroke to get your first finding.”'}</p>
          <div className="mini-court"><i/><i/><i/><b>{h.finding?.badge ?? ''}</b></div>
          <p>{h.finding?.text ?? ''}</p>
          <button className="text-link">Review finding <Icon name="arrow" size={17}/></button>
        </article>

        <article className="card court-card">
          <div className="card-top"><span className="tag">FAVORITE COURT</span><span className="live"><i/>LIVE</span></div>
          <h3>{h.court?.name ?? 'Pick a favorite court'}</h3><p><Icon name="pin" size={15}/> {h.court?.meta ?? 'Book a court to set your favorite'}</p>
          <div className="times">{slots.map(s => { const [t, ap] = s.time.split(' '); return <button key={s.id} className={s.id === chosen?.id ? 'available' : undefined} onClick={() => setSlot(s.id)}>{t}<small>{ap}</small></button> })}</div>
          <button className="primary wide" onClick={reserve}>{chosen ? `Reserve ${chosen.time}` : 'Find a court'}</button>
        </article>

        <article className="card payment-card">
          <div className="card-top"><span className="tag">PENDING PAYMENT</span><Icon name="wallet"/></div>
          <p>{h.invoice?.label ?? 'Nothing due'}</p><div className="amount"><strong>{h.invoice?.amount ?? '$0.00'}</strong><span>{h.invoice?.due ?? 'All settled'}</span></div>
          <button className="primary wide" disabled={!h.invoice} onClick={() => h.invoice && pay(h.invoice)}>Pay securely</button><small className="secure">SECURED CHECKOUT · STRIPE</small>
        </article>
      </div>
    </section>
  </main>
}

const readiness = (n: number) => n >= 70 ? 'Ready for high intensity' : n >= 40 ? 'Train at moderate intensity' : 'Prioritise recovery today'

function Stats() {
  const [period, setPeriod] = useState('12 weeks')
  const [section, setSection] = useState('Analysis')
  const { data, reload } = useData(loadStats)
  const [busy, setBusy] = useState(false)
  const recalibrate = () => {
    if (!live) return
    setBusy(true)
    runAgent('playstyle').then(reload).finally(() => setBusy(false))
  }
  const rings = live ? data?.rings ?? { power: 0, control: 0, spin: 0 } : { power: 46, control: 34, spin: 20 }
  const style = live ? data?.style ?? { name: 'Not calibrated', rationale: 'Recalibrate to score your playstyle.' } : { name: 'Aggressive All-Court', rationale: 'Early ball striking with a growing instinct to finish at net.' }
  const serve = live ? data?.serve ?? { wide: '–', body: '–', t: '–', matches: 0 } : { wide: '68%', body: '21%', t: '11%', matches: 5 }
  const recovery = live ? data?.recovery ?? null : { score: 82, provider: 'WHOOP', detail: 'Sleep 8h 02m · HRV 71 ms' }
  const plan = live ? data?.plan ?? { title: 'No plan yet', text: 'Create a workout with AI in the Train tab.' } : { title: 'Explosive first step', text: '4-week block designed around your late contact finding and match calendar.' }
  return <main className="page section-pad">
    <SectionHead eyebrow="PERFORMANCE ROOM" title="Know the shape of your game." action="Export report"/>
    <Subnav items={['Analysis','Train','Wearables']} active={section} setActive={setSection}/>
    {section === 'Analysis' && (live && !data ? <Loading/> : <><div className="segmented">{['4 weeks','12 weeks','Season'].map(x => <button className={period === x ? 'active' : ''} onClick={() => setPeriod(x)} key={x}>{x}</button>)}</div>
    <div className="stats-grid">
      <article className="card chart-card">
        <div className="card-top"><span className="tag">MATCH FORM</span><span className="positive">↑ 8.4%</span></div>
        <h3>Performance is trending upward.</h3><p>Your consistency index across the last {period}.</p>
        <div className="line-chart"><div className="gridlines"/><svg viewBox="0 0 600 170" preserveAspectRatio="none"><path className="area" d="M0 145 C70 110 100 140 170 105S260 125 320 76 410 92 465 48 550 62 600 20 L600 170H0Z"/><path d="M0 145 C70 110 100 140 170 105S260 125 320 76 410 92 465 48 550 62 600 20"/><circle cx="600" cy="20" r="5"/></svg></div>
        <div className="chart-labels"><span>MAR 01</span><span>APR 01</span><span>MAY 01</span><span>TODAY</span></div>
      </article>
      <article className="card style-card">
        <div className="card-top"><span className="tag">PLAYSTYLE DNA</span><button className="tiny-button" onClick={recalibrate} disabled={busy}>{busy ? 'Scoring…' : 'Recalibrate'}</button></div>
        <div className="rings"><Ring value={rings.power} color="#9d2e38" label="POWER"/><Ring value={rings.control} color="#d59e32" label="CONTROL"/><Ring value={rings.spin} color="#34735b" label="SPIN"/></div>
        <h3>{style.name}</h3><p>{style.rationale}</p>
      </article>
      <article className="card serve-card">
        <div className="card-top"><span className="tag">SERVE PLACEMENT</span><span className="muted">Last {serve.matches} matches</span></div>
        <div className="court-map"><span className="dot d1"/><span className="dot d2"/><span className="dot d3"/><span className="dot d4"/><span className="dot d5"/></div>
        <div className="metric-row"><span><b>{serve.wide}</b>Wide</span><span><b>{serve.body}</b>Body</span><span><b>{serve.t}</b>T</span></div>
      </article>
      <article className="card recovery-card"><span className="tag">RECOVERY · {recovery?.provider ?? 'NO DEVICE'}</span><strong>{recovery?.score ?? '–'}</strong><h3>{recovery ? readiness(recovery.score) : 'Connect a wearable'}</h3><p>{recovery?.detail ?? 'Recovery appears after your first synced session.'}</p><div className="progress"><i style={{width:`${recovery?.score ?? 0}%`}}/></div></article>
      <article className="card program-card"><span className="tag">AI TRAINING PLAN</span><h3>{plan.title}</h3><p>{plan.text}</p><div className="week-row">{[1,2,3,4].map((w,i)=><span className={i<2?'complete':''} key={w}>W{w}</span>)}</div><button className="primary" onClick={()=>setSection('Train')}>Open this week</button></article>
    </div></>)}
    {section === 'Train' && <TrainingHub/>}
    {section === 'Wearables' && <WearablesHub/>}
  </main>
}

const TRAINING_SAMPLE = {
  sessions: [
    { id: '1', title: 'Footwork & first step', focus: 'Built from your late-contact finding, recovery score, and tomorrow’s match schedule.', minutes: '32 MIN', intensity: 'HIGH', movements: 6, duration: 32 },
    { id: '2', title: 'Shoulder resilience', focus: 'Built from your late-contact finding, recovery score, and tomorrow’s match schedule.', minutes: '24 MIN', intensity: 'MEDIUM', movements: 5, duration: 24 },
    { id: '3', title: 'Match-day primer', focus: 'Built from your late-contact finding, recovery score, and tomorrow’s match schedule.', minutes: '18 MIN', intensity: 'LOW', movements: 4, duration: 18 },
  ],
  drill: { title: 'Backhand depth ladder', text: 'Three zones · 30-ball progression' },
  streak: 12,
  week: [true, true, true, true, true, false, false],
}

function TrainingHub() {
  const { data, reload } = useData(loadTraining)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (live && !data) return <Loading/>
  const t = live ? data! : TRAINING_SAMPLE
  const workout = t.sessions.find(s => s.id === selected) ?? t.sessions[0]
  const create = () => {
    if (!live) return
    setBusy(true); setError(null)
    runAgent('workout', { focus: 'footwork and first step', duration_min: 30, intensity: 'high', equipment: ['cones', 'ball basket'], location: 'court' })
      .then(() => { setSelected(null); reload() }, e => setError(e.message)).finally(() => setBusy(false))
  }
  return <div className="subpage-grid">
    <article className="feature-panel">
      <p className="eyebrow">AI-GENERATED FOR TODAY</p><h2>{workout?.title ?? 'No workout yet'}</h2>
      <p>{error ?? workout?.focus ?? 'Create a workout with AI to get started.'}</p>
      <div className="workout-stat"><span><b>{workout?.movements ?? 0}</b>movements</span><span><b>{workout?.duration ?? 0}</b>minutes</span><span><b>{workout?.intensity || '–'}</b>load</span></div>
      <button className="primary">Start guided workout <Icon name="arrow"/></button>
    </article>
    <article className="card session-list"><div className="card-top"><span className="tag">THIS WEEK</span><button className="tiny-button" onClick={create} disabled={busy}>{busy ? 'Building…' : 'Create with AI'}</button></div>
      {t.sessions.map((s,i)=><button className={workout?.id===s.id?'selected':''} onClick={()=>setSelected(s.id)} key={s.id}><span>0{i+1}</span><strong>{s.title}</strong><small>{s.minutes} · {s.intensity}</small><Icon name="arrow"/></button>)}
    </article>
    <article className="card drill-library"><span className="tag">ON-COURT DRILLS</span><h3>{t.drill?.title ?? 'No active drills'}</h3><p>{t.drill?.text ?? 'Your AI Coach adds drills after each analysis.'}</p><div className="drill-court"><i/><i/><i/></div><button className="secondary wide">Open drill tracker</button></article>
    <article className="card streak-card"><span className="tag">CONSISTENCY</span><strong>{t.streak}</strong><h3>day training streak</h3><div className="streak-days">{['M','T','W','T','F','S','S'].map((d,i)=><i className={t.week[i]?'done':''} key={i}>{d}</i>)}</div></article>
  </div>
}

const PROVIDERS: [string, string][] = [['apple_watch', 'Apple Watch'], ['whoop', 'WHOOP 4.0'], ['garmin', 'Garmin'], ['oura', 'Oura Ring']]

function WearablesHub() {
  const { data, reload } = useData(loadWearables)
  const [connected, setConnected] = useState(['Apple Watch','WHOOP 4.0'])
  if (live && !data) return <Loading/>
  const score = live ? data!.recovery : 82
  const metrics = live ? data!.metrics : [['RESTING HR','48','BPM · 3 BELOW AVG'],['HRV','71','MS · OPTIMAL'],['SLEEP','8:02','92% EFFICIENCY']]
  const devices = PROVIDERS.map(([key, label]) => {
    const conn = live ? data!.devices.find(d => d.provider === key) : undefined
    const on = live ? !!conn : connected.includes(label)
    return { key, label, on, status: on ? conn?.status ?? 'Last sync 6 min ago' : 'Available to connect', id: conn?.id }
  })
  const toggle = (d: typeof devices[number]) => {
    if (!live) return setConnected(x=>x.includes(d.label)?x.filter(v=>v!==d.label):[...x,d.label])
    if (d.on && d.id) disconnectWearable(d.id).then(reload)
  }
  return <div className="wearables-layout">
    <article className="recovery-hero"><div><p className="eyebrow">TODAY’S READINESS</p><strong>{score ?? '–'}</strong><h2>{score == null ? 'No data yet.' : score >= 70 ? 'Ready to push.' : score >= 40 ? 'Steady today.' : 'Time to recover.'}</h2><p>{score == null ? 'Connect a device to see your readiness.' : `${readiness(score)}.`}</p></div><div className="recovery-ring"><span>{score ?? 0}%</span></div></article>
    {metrics && <div className="biometric-grid">{metrics.map(m=><article className="card" key={m[0]}><span className="tag">{m[0]}</span><strong>{m[1]}</strong><small>{m[2]}</small></article>)}</div>}
    <article className="card device-list"><div className="card-top"><span className="tag">CONNECTED DEVICES</span><span className="live"><i/>SYNCED</span></div>{devices.map(d=><div key={d.key}><span className="device-icon"><Icon name="moon"/></span><strong>{d.label}</strong><small>{d.status}</small><button onClick={()=>toggle(d)} title={live && !d.on ? 'Device sign-in is not available yet' : undefined}>{d.on?'Disconnect':'Connect'}</button></div>)}</article>
  </div>
}

const reelData = [
  { creator: '@atptour', title: 'The one-handed backhand, slowed down.', category: 'STROKE STUDY', accent: '#8d4b39', url: 'https://www.instagram.com/atptour/reels/' },
  { creator: '@wta', title: 'Three patterns to own the forecourt.', category: 'POINT CONSTRUCTION', accent: '#44614a', url: 'https://www.instagram.com/wta/reels/' },
  { creator: '@tennistv', title: 'Watch the split step before the winner.', category: 'FOOTWORK', accent: '#3f5865', url: 'https://www.instagram.com/tennistv/reels/' },
]

const ACCENTS = ['#8d4b39', '#44614a', '#3f5865']

function Aces() {
  const [index, setIndex] = useState(0)
  const [section, setSection] = useState('Reels')
  const { data, reload } = useData(loadReels)
  const [note, setNote] = useState<string | null>(null)
  const reels = live ? data ?? [] : reelData.map((r, i) => ({ ...r, id: String(i), likes: 2800, liked: false, saved: false }))
  const reel = reels[index % Math.max(reels.length, 1)]
  const like = () => { if (live && reel) likeReel(reel.id, !reel.liked).then(reload) }
  const save = () => { if (live && reel && !reel.saved) saveItem('reel', reel.id).then(reload) }
  const share = async () => {
    if (!reel) return
    if (navigator.share) return navigator.share({ title: reel.title, url: reel.url }).catch(() => {})
    await navigator.clipboard?.writeText(reel.url); setNote('LINK COPIED')
  }
  const likes = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  return <main className="page aces-page">
    <div className="aces-head"><div><p className="eyebrow">CURATED FOR YOUR GAME</p><h2>Aces</h2></div><Subnav items={['Reels','Journal','Saved']} active={section} setActive={setSection}/></div>
    {section === 'Reels' && (live && !data ? <Loading/> : !reel ? <p className="source-note">NO REELS PUBLISHED YET</p> : <><section className="reel-stage" style={{'--accent': ACCENTS[index % ACCENTS.length]} as React.CSSProperties}>
      <div className="reel-visual">
        <div className="abstract-court"><span/><span/><span className="moving-ball"/></div>
        <div className="reel-number">{String(index + 1).padStart(2, '0')}</div>
      </div>
      <div className="reel-content"><span className="tag light">{reel.category}</span><h2>{reel.title}</h2><p>{reel.creator}</p><a className="primary cream" href={reel.url} target="_blank" rel="noreferrer">Watch curated reels on Instagram <Icon name="arrow"/></a></div>
      <div className="reel-tools"><button onClick={like}><Icon name="heart"/><small>{reel.liked ? 'Liked' : likes(reel.likes)}</small></button><button onClick={save}><Icon name="bookmark"/><small>{reel.saved ? 'Saved' : 'Save'}</small></button><button onClick={share}><Icon name="share"/><small>Share</small></button></div>
      <div className="reel-nav"><button onClick={() => setIndex((index + reels.length - 1) % reels.length)}>↑</button><button onClick={() => setIndex((index + 1) % reels.length)}>↓</button></div>
    </section>
    <p className="source-note">{note ?? 'CURATED FROM OFFICIAL TENNIS CHANNELS · OPENS ON INSTAGRAM'}</p></>)}
    {section === 'Journal' && <Journal/>}
    {section === 'Saved' && <SavedLibrary/>}
  </main>
}

const JOURNAL_SAMPLE = [
  { id: 'lead', title: 'Elegance is efficiency.', dek: 'What the one-handed backhand teaches us about preparation, timing, and playing without excess.', category: 'THE WEEKEND ESSAY', minutes: '12 MIN', body: '' },
  ...[['The quiet architecture of a match','MENTAL GAME','8 MIN'],['Why tension changes everything','EQUIPMENT','6 MIN'],['Learning to finish at the net','TACTICS','11 MIN']].map(([title, category, minutes]) => ({ id: title, title, dek: 'Notes for the thoughtful player, from technique to match craft.', category, minutes, body: '' })),
]
const SAMPLE_BODY = <><p>Every point begins as an arrangement of possibilities. Before pace or spin, there is geometry: your position, your opponent’s balance, and the open court between you.</p><h2>Build the point before you finish it.</h2><p>Use height and depth to create the shorter ball. The attacking shot is not always the winner; often, it is the ball that makes the winner inevitable.</p></>

function Journal() {
  const [articleId,setArticle]=useState<string|null>(null)
  const { data } = useData(loadArticles)
  if (live && !data) return <Loading/>
  const articles = live ? data! : JOURNAL_SAMPLE
  const [lead, ...rest] = articles
  const article = articles.find(a => a.id === articleId)
  if(article) return <article className="article-reader"><button className="text-link" onClick={()=>setArticle(null)}>← Back to journal</button><p className="eyebrow">COURTSIDE JOURNAL · {article.category || 'TACTICS'}</p><h1>{article.title}</h1><p className="article-deck">{live ? article.dek : 'The best players do not simply strike the ball. They manage space, time, and uncertainty with intention.'}</p><EmptyArt type="court"/><div className="article-copy">{live ? article.body.split(/\n{2,}/).map((b, i) => b.startsWith('## ') ? <h2 key={i}>{b.slice(3)}</h2> : <p key={i}>{b.replace(/^#+\s*/, '')}</p>) : SAMPLE_BODY}</div></article>
  if (!lead) return <p className="source-note">NO ARTICLES PUBLISHED YET</p>
  return <section className="journal"><article className="journal-lead"><EmptyArt type="racket"/><div><span className="tag">{lead.category} · {lead.minutes}</span><h2>{lead.title}</h2><p>{lead.dek}</p><button className="text-link" onClick={()=>setArticle(lead.id)}>Read the essay <Icon name="arrow"/></button></div></article><div className="article-grid">{rest.map((a,i)=><button onClick={()=>setArticle(a.id)} key={a.id}><span>0{i+1}</span><small>{a.category} · {a.minutes}</small><h3>{a.title}</h3><p>{a.dek || 'Notes for the thoughtful player, from technique to match craft.'}</p><Icon name="arrow"/></button>)}</div></section>
}

function SavedLibrary() {
  const { data, reload } = useData(loadFolders)
  if (live && !data) return <Loading/>
  const sample=[['Serve mechanics',12],['Footwork',8],['Match tactics',16],['Equipment',5]] as const
  const folders = live ? data!.map(f => ({ id: f.id, name: f.name, count: f.count, updated: `Updated ${new Date(f.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` })) : sample.map((f, i) => ({ id: f[0], name: f[0], count: f[1], updated: `Updated ${i + 1} days ago` }))
  const create = () => {
    const name = live ? window.prompt('Collection name')?.trim() : null
    if (name) createFolder(name).then(reload)
  }
  return <section className="saved-library"><div className="library-head"><div><p className="eyebrow">YOUR COURTSIDE LIBRARY</p><h2>Saved for the next session.</h2></div><button className="primary" onClick={create}>New collection</button></div><div className="folder-grid">{folders.map((f,i)=><button key={f.id}><span className={`folder-art f${i % 4}`}><Icon name="bookmark" size={28}/></span><small>{f.count} ITEMS</small><h3>{f.name}</h3><p>{f.updated}</p><Icon name="arrow"/></button>)}</div></section>
}

const SAMPLE_RESULT = { headline: 'Your preparation is arriving late.', text: 'The racket is still moving back as the ball crosses the service line. Begin the shoulder turn 0.3 seconds earlier.', metrics: [['14 cm', 'late contact'], ['7°', 'open stance'], ['86%', 'confidence']] }

function Coach({ checkout }: { checkout: (item: CheckoutItem) => void }) {
  const [mode, setMode] = useState<'idle'|'analyzing'|'result'>('idle')
  const [section, setSection] = useState('AI Coach')
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(SAMPLE_RESULT)
  const [error, setError] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const findings = useData(loadFindings)
  const uploadRef = useRef<HTMLInputElement>(null)
  const recordRef = useRef<HTMLInputElement>(null)
  const [messages, setMessages] = useState<{from:'user'|'coach';text:string}[]>([
    { from: 'coach', text: 'I’ve reviewed your latest match and training load. What part of your game should we work through?' }
  ])
  const analyze = (source: 'upload' | 'live') => {
    if (live) return (source === 'upload' ? uploadRef : recordRef).current?.click()
    setMode('analyzing')
    window.setTimeout(() => setMode('result'), 1800)
  }
  const onFile = (source: 'upload' | 'live') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMode('analyzing'); setError(null)
    analyzeSwing(file, source).then(r => { setResult(r); setMode('result'); findings.reload() }, err => { setError(err.message); setMode('idle') })
  }
  const send = () => {
    if (!question.trim() || thinking) return
    const q = question
    setMessages(m => [...m, {from:'user',text:q}])
    setQuestion('')
    if (!live) return setMessages(m => [...m, {from:'coach',text:'Based on your recent pattern, begin with an earlier unit turn and hold the finish for one full count. I’ve added a 12-minute progression to your next session.'}])
    setThinking(true)
    askCoach(q, messages).then(reply => setMessages(m => [...m, {from:'coach',text:reply}]), err => setMessages(m => [...m, {from:'coach',text:`Sorry, I couldn’t answer that: ${err.message}`}])).finally(() => setThinking(false))
  }
  const rows = live ? findings.data ?? [] : [{ id: '1', date: '20 MAY', title: 'Late contact on pressure backhands', high: true }, { id: '2', date: '08 MAY', title: 'Serve toss drifting left', high: false }]
  return <main className="page section-pad coach-page">
    <SectionHead eyebrow="INTELLIGENT COACHING" title="See what the ball can’t tell you." action="Past findings"/>
    <Subnav items={['AI Coach','Classes','Coaches','Messages','Beginner Hub']} active={section} setActive={setSection}/>
    {section === 'AI Coach' && <><div className="coach-grid">
      <article className="analysis-studio">
        <input ref={uploadRef} type="file" accept="video/mp4,video/quicktime,video/*" hidden onChange={onFile('upload')}/>
        <input ref={recordRef} type="file" accept="video/*" capture="environment" hidden onChange={onFile('live')}/>
        {mode === 'idle' && <><div className="studio-icon"><Icon name="camera" size={32}/></div><p className="eyebrow">NEW ANALYSIS</p><h2>Bring your game into focus.</h2><p>{error ?? 'Upload a stroke or record live. Your coach will assess timing, spacing, balance, and recovery.'}</p><div className="upload-actions"><button className="primary" onClick={() => analyze('upload')}><Icon name="upload"/> Upload a video</button><button className="secondary" onClick={() => analyze('live')}><Icon name="camera"/> Record live</button></div><small>MP4, MOV · UP TO 3 MINUTES</small></>}
        {mode === 'analyzing' && <div className="loading-state"><div className="tennis-loader"><i/></div><p className="eyebrow">READING THE MOVEMENT</p><h2>Tracing your contact point…</h2><div className="scan-lines"><i/><i/><i/></div></div>}
        {mode === 'result' && <div className="result-state"><span className="result-kicker"><Icon name="spark"/> ANALYSIS COMPLETE</span><h2>{result.headline}</h2><p>{result.text}</p><div className="finding-metrics">{result.metrics.map(m => <span key={m[1]}><b>{m[0]}</b>{m[1]}</span>)}</div><button className="primary" onClick={() => setMode('idle')}>Save corrective drill</button></div>}
      </article>
      <article className="coach-chat card">
        <div className="chat-head"><div><span className="ai-dot"/><div><strong>Courtside Coach</strong><small>AI PERFORMANCE AGENT</small></div></div><Icon name="spark"/></div>
        <div className="messages">{messages.map((m,i)=><div key={i} className={`message ${m.from}`}>{m.text}</div>)}{thinking && <div className="message coach">…</div>}</div>
        <div className="chat-input"><input value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Ask about your game…"/><button onClick={send} aria-label="Send"><Icon name="arrow"/></button></div>
        <small className="prototype-note">{live ? 'COURTSIDE COACH · POWERED BY CLAUDE' : 'PROTOTYPE COACH · CLAUDE CONNECTION READY FOR BACKEND'}</small>
      </article>
    </div>
    <section className="findings"><SectionHead eyebrow="RECENT FINDINGS" title="Your technical thread."/>{rows.map(f => <div className="finding-row" key={f.id}><span>{f.date}</span><strong>{f.title}</strong><i className={f.high ? 'severity' : undefined}>{f.high ? 'HIGH IMPACT' : 'IMPROVING'}</i><Icon name="arrow"/></div>)}</section>
    </>}
    {section === 'Classes' && <Classes checkout={checkout}/>}
    {section === 'Coaches' && <CoachDirectory/>}
    {section === 'Messages' && <CoachMessages/>}
    {section === 'Beginner Hub' && <BeginnerHub/>}
  </main>
}

function Classes({ checkout }: { checkout: (item: CheckoutItem) => void }) {
  const [level,setLevel]=useState('All levels')
  const [error,setError]=useState<string|null>(null)
  const { data } = useData(loadClasses)
  if (live && !data) return <Loading/>
  const sample=[['Live Ball: Patterns','Coach Elena','$32','4 spots','THU · 6:30 PM'],['Serve + Return Lab','Coach Marcus','$28','2 spots','SAT · 9:00 AM'],['Clay Court Movement','Coach Amélie','$36','6 spots','SUN · 11:30 AM']]
  const classes = (live ? data! : sample.map(c => ({ id: c[0], title: c[0], coach: c[1], venue: 'Fort Greene Courts', price: c[2], spots: c[3], when: c[4], level: 'All levels' })))
    .filter(c => !live || level === 'All levels' || c.level === level)
  const join = (id: string) => {
    if (!live) return
    setError(null)
    joinClass(id).then(checkout, e => setError(e.message))
  }
  return <section className="directory"><div className="directory-tools"><div className="segmented">{['All levels','Beginner','Intermediate'].map(l=><button className={level===l?'active':''} onClick={()=>setLevel(l)} key={l}>{l}</button>)}</div><button className="secondary">Brooklyn · within 5 mi⌄</button></div>{error && <p className="source-note">{error}</p>}<div className="class-grid">{classes.map((c,i)=><article className="card class-card" key={c.id}><div className={`class-art a${i % 3}`}><EmptyArt type="court"/><span>{c.when}</span></div><div className="card-top"><span className="tag">GROUP CLINIC · {level.toUpperCase()}</span><span className="live"><i/>{c.spots}</span></div><h3>{c.title}</h3><p>{c.coach} · {c.venue}</p><div className="class-footer"><strong>{c.price}</strong><button className="primary" onClick={()=>join(c.id)}>Join class</button></div></article>)}</div></section>
}

function CoachDirectory() {
  const [following,setFollowing]=useState(['Elena Moretti'])
  const { data, reload } = useData(loadCoaches)
  if (live && !data) return <Loading/>
  const sample=[['Elena Moretti','FORMER WTA · TECHNIQUE','Italian method, patient progressions, and a sharp eye for efficient movement.'],['Marcus Reid','USPTA ELITE · TACTICS','Point construction and match play for ambitious club competitors.'],['Amélie Laurent','PTR · JUNIORS & ADULTS','Confidence-first coaching with a clay-court foundation.']]
  const coaches = live ? data!.coaches : sample.map((c,i) => ({ id: c[0], name: c[0], headline: c[1], bio: c[2], rate: `$${[95,80,75][i]}` }))
  const isFollowing = (id: string) => live ? data!.following.includes(id) : following.includes(id)
  const toggle = (id: string) => {
    if (!live) return setFollowing(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id])
    setFollow(id, !isFollowing(id)).then(reload)
  }
  return <section className="coach-directory"><div className="directory-intro"><p className="eyebrow">VERIFIED COURTSIDE COACHES</p><h2>Find the right voice for your game.</h2></div>{coaches.map(c=><article key={c.id}><span className="coach-monogram">{c.name.split(' ').map(x=>x[0]).join('')}</span><div><small>{c.headline}</small><h3>{c.name}</h3><p>{c.bio}</p></div><div className="coach-rate"><strong>{c.rate}</strong><small>/ HOUR</small><button onClick={()=>toggle(c.id)} className={isFollowing(c.id)?'secondary':'primary'}>{isFollowing(c.id)?'Following':'Follow'}</button></div></article>)}</section>
}

function CoachMessages() {
  const [selected,setSelected]=useState(0)
  const [draft,setDraft]=useState('')
  const [sent,setSent]=useState<string[]>([])
  const convos = useData(loadConversations)
  const current = convos.data?.[selected]
  const thread = useData(() => current ? loadMessages(current.id) : Promise.resolve([]), [current?.id])
  const reloadThread = thread.reload
  useEffect(() => current ? subscribeMessages(current.id, reloadThread) : undefined, [current?.id, reloadThread])
  if (live && !convos.data) return <Loading/>
  const names = live ? convos.data!.map(c => c.name) : ['Elena Moretti','Marcus Reid','Courtside Support']
  const previews = live ? convos.data!.map(c => c.preview) : names.map((_, i) => i===0?'That contact point looks better.':'Tap to open conversation')
  if (!names.length) return <p className="source-note">FOLLOW A COACH TO START A CONVERSATION</p>
  const send = () => {
    if (!draft.trim()) return
    if (!live) { setSent(x=>[...x,draft]); setDraft(''); return }
    if (current) sendMessage(current.id, draft.trim()).then(() => { setDraft(''); reloadThread() })
  }
  const msgs = thread.data ?? []
  return <section className="messages-layout"><aside>{names.map((n,i)=><button className={selected===i?'active':''} onClick={()=>setSelected(i)} key={n+i}><span>{n.split(' ').map(x=>x[0]).join('').slice(0,2)}</span><div><strong>{n}</strong><small>{previews[i]}</small></div></button>)}</aside><article className="message-thread"><div className="thread-head"><span className="coach-monogram">{names[selected].slice(0,2).toUpperCase()}</span><div><strong>{names[selected]}</strong><small>Usually replies within 2 hours</small></div></div><div className="thread-body">{live ? msgs.map((m,i)=><Fragment key={m.id}>{(i===0||msgs[i-1].day!==m.day)&&<span>{m.day}</span>}<p className={m.mine?'mine':'theirs'}>{m.body}</p></Fragment>) : <><span>MONDAY</span><p className="theirs">Send me a few backhands from your next hit. I want to check the preparation timing.</p><p className="mine">I’ve attached the clip from this morning’s session.</p><p className="theirs">That contact point looks better. Keep the first move simple and let the shoulder lead.</p>{sent.map((s,i)=><p className="mine" key={i}>{s}</p>)}</>}</div><div className="chat-input"><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Message your coach…"/><button onClick={send}><Icon name="arrow"/></button></div></article></section>
}

function BeginnerHub() {
  const { data } = useData(loadPathway)
  if (live && !data) return <Loading/>
  const sample=[['01','Court & scoring','Complete'],['02','Grip foundations','Complete'],['03','Build a reliable rally','In progress'],['04','Serve with rhythm','Locked'],['05','Play your first match','Locked']]
  const steps = live ? data!.steps : sample.map((s,i) => ({ id: s[0], num: s[0], title: s[1], status: s[2], text: i===2?'Rally height, recovery, and finding your natural tempo.':'Four concise lessons and one guided court session.' }))
  return <section className="beginner-hub"><div className="pathway-head"><div><p className="eyebrow">THE COURTSIDE PATHWAY</p><h2>From first swing to first match.</h2><p>A considered, step-by-step introduction to the game—without the noise.</p></div><div className="path-progress"><strong>{live ? data!.pct : '42%'}</strong><span>FOUNDATIONS COMPLETE</span></div></div><div className="path-steps">{steps.map(s=><button className={s.status==='Locked'?'locked':''} key={s.id}><span>{s.num}</span><div><small>{s.status}</small><h3>{s.title}</h3><p>{s.text}</p></div>{s.status==='Complete'?<Icon name="check"/>:<Icon name="arrow"/>}</button>)}</div></section>
}

function Book({ checkout }: { checkout: (item: CheckoutItem) => void }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const [offset, setOffset] = useState(0)
  const [day, setDay] = useState(live ? 0 : 22)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState('Rent a court')
  const date = new Date(today.getTime() + day * 86_400_000)
  const venues = useData(() => loadCourtDay(date), [day])
  const strip = Array.from({ length: 6 }, (_, i) => new Date(today.getTime() + (offset + i) * 86_400_000))
  const reserve = (id: string | undefined) => {
    if (!id) return
    setError(null)
    reserveSlot(id).then(item => { checkout(item); venues.reload() }, e => setError(e.message))
  }
  const list = venues.data ?? []
  const first = list[0]
  const chosen = list.flatMap(v => v.slots).find(s => s.id === slotId) ?? first?.slots[0]
  return <main className="page section-pad">
    <SectionHead eyebrow="COURTS & COACHING" title="Your next hour on court." action="My bookings"/>
    <Subnav items={['Rent a court','Book a lesson','Availability tracker']} active={section} setActive={setSection}/>
    {section === 'Rent a court' && (!live ? <div className="booking-grid">
      <article className="card booking-calendar">
        <div className="month"><button>←</button><strong>May 2025</strong><button>→</button></div>
        <div className="date-strip">{[20,21,22,23,24,25].map((d,i)=><button className={day===d?'active':''} onClick={()=>setDay(d)} key={d}><small>{['TUE','WED','THU','FRI','SAT','SUN'][i]}</small><b>{d}</b></button>)}</div>
        <div className="filter-row"><button>Near Brooklyn⌄</button><button>All surfaces⌄</button><button>Evening⌄</button></div>
      </article>
      <article className="card venue">
        <div className="venue-art"><div className="court-lines"/><span>0.8 MI</span></div>
        <div className="venue-body"><div><span className="tag">PUBLIC · HARD</span><h3>Fort Greene Tennis Courts</h3><p><Icon name="pin" size={15}/> DeKalb Ave & S Portland</p></div><button className="icon-button"><Icon name="heart"/></button></div>
        <div className="slot-row"><button>5:30 PM <small>$18</small></button><button className="selected">6:30 PM <small>$18</small></button><button>8:00 PM <small>$18</small></button></div>
        <button className="primary wide" onClick={()=>checkout({ label: 'Fort Greene Court · 6:30 PM', amount: '$18.00' })}>Reserve court · $18</button>
      </article>
      <article className="card venue compact">
        <div className="venue-art clay"><div className="court-lines"/><span>2.1 MI</span></div>
        <div className="venue-body"><div><span className="tag">CLUB · CLAY</span><h3>Prospect Park Tennis</h3><p><Icon name="pin" size={15}/> Parkside Ave</p></div></div>
        <div className="slot-row"><button>7:00 PM <small>$32</small></button><button>8:30 PM <small>$32</small></button></div>
      </article>
    </div> : <div className="booking-grid">
      <article className="card booking-calendar">
        <div className="month"><button onClick={()=>setOffset(o=>Math.max(0,o-6))}>←</button><strong>{strip[0].toLocaleDateString('en-US',{month:'long',year:'numeric'})}</strong><button onClick={()=>setOffset(o=>o+6)}>→</button></div>
        <div className="date-strip">{strip.map((d,i)=><button className={day===offset+i?'active':''} onClick={()=>{setDay(offset+i);setSlotId(null)}} key={d.toISOString()}><small>{d.toLocaleDateString('en-US',{weekday:'short'}).toUpperCase()}</small><b>{d.getDate()}</b></button>)}</div>
        <div className="filter-row"><button>Near you⌄</button><button>All surfaces⌄</button><button>All day⌄</button></div>
        {error && <p className="source-note">{error}</p>}
      </article>
      {!venues.data ? <Loading/> : !list.length ? <p className="source-note">NO OPEN COURTS ON THIS DAY</p> : list.map((v,i)=><article className={i===0?'card venue':'card venue compact'} key={v.id}>
        <div className={v.clay?'venue-art clay':'venue-art'}><div className="court-lines"/><span>{v.slots.length} OPEN</span></div>
        <div className="venue-body"><div><span className="tag">{v.tag}</span><h3>{v.name}</h3><p><Icon name="pin" size={15}/> {v.address}</p></div>{i===0&&<button className="icon-button"><Icon name="heart"/></button>}</div>
        <div className="slot-row">{v.slots.map(s=><button key={s.id} className={chosen?.id===s.id?'selected':undefined} onClick={()=>setSlotId(s.id)}>{s.time} <small>{s.price}</small></button>)}</div>
        {v.slots.some(s=>s.id===chosen?.id) && <button className="primary wide" onClick={()=>reserve(chosen?.id)}>Reserve court · {chosen?.price}</button>}
      </article>)}
    </div>)}
    {section === 'Book a lesson' && <LessonBooking checkout={checkout}/>}
    {section === 'Availability tracker' && <AvailabilityTracker/>}
  </main>
}

function LessonBooking({checkout}:{checkout:(item:CheckoutItem)=>void}) {
  const [coach,setCoach]=useState(live ? '' : 'Elena Moretti')
  const [kind,setKind]=useState('private')
  const [court,setCourt]=useState('')
  const [time,setTime]=useState(live ? '' : '5:30 PM')
  const [error,setError]=useState<string|null>(null)
  const opts = useData(() => loadLessonOptions(coach || null, kind), [coach, kind])
  if (!live) return <section className="lesson-booking"><div className="lesson-controls card"><p className="eyebrow">PRIVATE COACHING</p><h2>Choose your session.</h2><label>Coach<select value={coach} onChange={e=>setCoach(e.target.value)}><option>Elena Moretti</option><option>Marcus Reid</option><option>Amélie Laurent</option></select></label><label>Session type<select><option>Private lesson · 60 min</option><option>Semi-private hit · 90 min</option><option>Video review · 30 min</option></select></label><label>Court<select><option>Fort Greene Tennis Courts</option><option>Prospect Park Tennis Center</option></select></label></div><div className="lesson-times"><p className="eyebrow">THURSDAY · MAY 22</p><h3>Available times with {coach.split(' ')[0]}</h3><div>{['8:00 AM','10:30 AM','2:00 PM','5:30 PM','7:00 PM'].map(t=><button className={time===t?'selected':''} onClick={()=>setTime(t)} key={t}>{t}</button>)}</div><div className="lesson-total"><span><small>YOUR SESSION</small><strong>{time} · 60 minutes</strong></span><b>$95</b></div><button className="primary wide" onClick={()=>checkout({ label: `Lesson with ${coach} · ${time}`, amount: '$95.00' })}>Continue to payment</button></div></section>
  if (!opts.data) return <Loading/>
  const o = opts.data
  const slot = o.times.find(t => t.id === time) ?? o.times[0]
  const price = o.coach ? dollars(kind === 'semi_private' ? o.coach.semiCents : o.coach.rateCents) : '$0'
  const book = () => {
    if (!slot) return
    setError(null)
    bookLesson(slot.id, kind, court || null).then(item => { checkout(item); opts.reload() }, e => setError(e.message))
  }
  return <section className="lesson-booking"><div className="lesson-controls card"><p className="eyebrow">PRIVATE COACHING</p><h2>Choose your session.</h2><label>Coach<select value={o.coach?.id ?? ''} onChange={e=>{setCoach(e.target.value);setTime('')}}>{o.coaches.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Session type<select value={kind} onChange={e=>{setKind(e.target.value);setTime('')}}><option value="private">Private lesson · 60 min</option><option value="semi_private">Semi-private hit · 60 min</option></select></label><label>Court<select value={court} onChange={e=>setCourt(e.target.value)}><option value="">Coach’s usual court</option>{o.courts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><div className="lesson-times"><p className="eyebrow">{o.day}</p><h3>Available times with {o.coach?.name.split(' ')[0] ?? 'your coach'}</h3><div>{o.times.map(t=><button className={slot?.id===t.id?'selected':''} onClick={()=>setTime(t.id)} key={t.id}>{t.time}</button>)}</div><div className="lesson-total"><span><small>YOUR SESSION</small><strong>{slot ? `${slot.time} · ${slot.minutes} minutes` : 'No open times'}</strong></span><b>{price}</b></div><button className="primary wide" onClick={book} disabled={!slot}>Continue to payment</button>{error && <small className="secure">{error}</small>}</div></section>
}

function AvailabilityTracker() {
  const [alerts,setAlerts]=useState([true,false,true])
  const { data, reload } = useData(loadAlerts)
  if (live && !data) return <Loading/>
  const sample=[['Fort Greene','Weekdays · 5–8 PM','3 openings'],['Prospect Park','Saturday · 8–11 AM','No openings'],['McCarren Park','Weekdays · 6–9 PM','1 opening']]
  const courts = live ? data!.map(a => ({ id: a.id, name: a.name, window: a.window, openings: a.openings ? `${a.openings} opening${a.openings === 1 ? '' : 's'}` : 'No openings', none: !a.openings, active: a.active }))
    : sample.map((c,i) => ({ id: c[0], name: `${c[0].toUpperCase()} TENNIS COURTS`, window: c[1], openings: c[2], none: i===1, active: alerts[i] }))
  const toggle = (i: number) => {
    if (!live) return setAlerts(x=>x.map((v,n)=>n===i?!v:v))
    setAlertActive(courts[i].id, !courts[i].active).then(reload)
  }
  return <section className="tracker"><div className="tracker-head"><div><p className="eyebrow">LIVE COURT MONITOR</p><h2>We’ll watch the schedule.</h2><p>Set your preferred windows. Courtside will let you know the moment a court opens.</p></div><button className="primary" onClick={()=>live&&addAlert().then(reload)}>Add court alert</button></div><div className="tracker-list">{courts.map((c,i)=><article className="card" key={c.id}><div className="tracker-court"><div className="court-lines"/></div><div><span className="tag">{c.name}</span><h3>{c.window}</h3><p className={c.none?'muted':'positive'}>{c.openings}</p></div><button onClick={()=>toggle(i)} className={`switch ${c.active?'on':''}`}><i/></button></article>)}</div></section>
}

function ProfileDrawer({ close, dark, setDark, me, onSaved }: { close: () => void; dark: boolean; setDark: (v:boolean)=>void; me?: Profile; onSaved: () => void }) {
  const [view,setView]=useState('Profile')
  const { data } = useData(loadDrawer)
  const [name,setName]=useState(me?.name ?? 'Alex Bennett')
  const [rating,setRating]=useState(me ? `${me.ntrp} NTRP` : '3.8 NTRP')
  const [backhand,setBackhand]=useState(me?.backhand ?? 'One-handed')
  const [status,setStatus]=useState<string|null>(null)
  const settingKeys: [string, (s: Record<string, any>) => boolean, (s: Record<string, any>, v: boolean) => Record<string, any>][] = [
    ['Booking reminders', s => s.notifications?.lessons !== false, (s, v) => ({ ...s, notifications: { ...s.notifications, lessons: v } })],
    ['Coach messages', s => s.notifications?.coach_posts !== false, (s, v) => ({ ...s, notifications: { ...s.notifications, coach_posts: v } })],
    ['Weekly game report', s => s.notifications?.weekly_report !== false, (s, v) => ({ ...s, notifications: { ...s.notifications, weekly_report: v } })],
    ['High quality video uploads', s => s.upload_quality === 'high', (s, v) => ({ ...s, upload_quality: v ? 'high' : 'standard' })],
  ]
  const [settings,setLocalSettings]=useState<Record<string, any>>(me?.settings ?? {})
  const save = () => {
    if (!live) return
    const ntrp = parseFloat(rating)
    saveProfile({ full_name: name.trim(), ntrp: Number.isFinite(ntrp) ? ntrp : null, backhand_style: backhand === 'Two-handed' ? 'two_handed' : 'one_handed' })
      .then(() => { setStatus('Saved'); onSaved() }, e => setStatus(e.message))
  }
  const toggleSetting = (i: number) => {
    const next = settingKeys[i][2](settings, !settingKeys[i][1](settings))
    setLocalSettings(next)
    if (live) saveSettings(next).catch(e => setStatus(e.message))
  }
  const logout = () => { if (live) signOut().then(close) }
  const racket = live ? data?.racket : { name: 'Blade 98 · Primary', detail: '52 lbs · 12.5 hours played' }
  const events = live ? data?.events ?? [] : [['MAY 22','Fort Greene court','6:30 PM'],['MAY 24','Lesson with Elena','5:30 PM'],['MAY 27','Live Ball clinic','7:00 PM']]
  const payments = live ? data?.payments ?? [] : [['MAY 18','Prospect Park court','$32'],['MAY 12','Lesson with Elena','$85'],['MAY 04','Live Ball clinic','$28']]
  if(view!=='Profile') return <div className="overlay" onMouseDown={close}><aside className="drawer" onMouseDown={e=>e.stopPropagation()}>
    <div className="drawer-top"><button className="text-link" onClick={()=>setView('Profile')}>← Profile</button><button className="icon-button" onClick={close}><Icon name="close"/></button></div>
    <div className="drawer-detail"><p className="eyebrow">PLAYER ACCOUNT</p><h2>{view}</h2>
      {view==='My wardrobe' && <><div className="drawer-wardrobe"><img src="/assets/racket-wardrobe.png" alt="Three rackets"/></div><h3>{racket?.name ?? 'No racket yet'}</h3><p>{racket?.detail ?? ''}</p><button className="primary wide">Add equipment</button></>}
      {view==='My calendar' && <div className="mini-agenda">{events.map((x,i)=><div key={i}><span>{x[0]}</span><strong>{x[1]}</strong><small>{x[2]}</small></div>)}</div>}
      {view==='Payments' && <><div className="spending"><strong>{live ? data?.spend ?? '$0' : '$263'}</strong><span>{live ? data?.month ?? 'SPEND' : 'MAY SPEND'}</span></div><div className="mini-agenda">{payments.map((x,i)=><div key={i}><span>{x[0]}</span><strong>{x[1]}</strong><small>{x[2]}</small></div>)}</div></>}
      {view==='Edit profile' && <div className="profile-form"><label>Display name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Rating<input value={rating} onChange={e=>setRating(e.target.value)}/></label><label>Backhand<select value={backhand} onChange={e=>setBackhand(e.target.value)}><option>One-handed</option><option>Two-handed</option></select></label><button className="primary wide" onClick={save}>{status ?? 'Save profile'}</button></div>}
      {view==='Settings' && <div className="setting-list">{settingKeys.map(([x, get],i)=><div key={x}><strong>{x}</strong><button onClick={()=>toggleSetting(i)} className={`switch ${(live ? get(settings) : i<3)?'on':''}`}><i/></button></div>)}</div>}
    </div>
  </aside></div>
  return <div className="overlay" onMouseDown={close}><aside className="drawer" onMouseDown={e=>e.stopPropagation()}>
    <div className="drawer-top"><p className="eyebrow">PLAYER PROFILE</p><button className="icon-button" onClick={close}><Icon name="close"/></button></div>
    <div className="player"><span>{me?.initials ?? 'AB'}</span><div><h2>{me?.name ?? 'Alex Bennett'}</h2><p>{me ? `${me.ntrp} NTRP · ${me.backhand} backhand` : '3.8 NTRP · One-handed backhand'}</p></div></div>
    <div className="playstyle"><small>MAIN PLAYSTYLE</small><strong>{me?.playstyle ?? 'All-Court Player'}</strong><span>{me ? me.playstyleMatch : '78% match'}</span></div>
    <div className="drawer-menu">
      <button onClick={()=>setView('My wardrobe')}><Icon name="racket"/>My wardrobe<span>{me ? `${me.rackets} racket${me.rackets===1?'':'s'}` : '3 rackets'}</span><Icon name="arrow"/></button>
      <button onClick={()=>setView('My calendar')}><Icon name="calendar"/>My calendar<span>{me ? `${me.upcoming} upcoming` : '4 upcoming'}</span><Icon name="arrow"/></button>
      <button onClick={()=>setView('Payments')}><Icon name="wallet"/>Payments<span>{me ? `${me.due} due` : '$85 due'}</span><Icon name="arrow"/></button>
      <button onClick={()=>setView('Edit profile')}><Icon name="coach"/>Edit profile<span/><Icon name="arrow"/></button>
      <button onClick={()=>setView('Settings')}><Icon name="settings"/>Settings<span/><Icon name="arrow"/></button>
    </div>
    <div className="theme-row"><Icon name="moon"/><div><strong>Evening mode</strong><small>Low-light court view</small></div><button onClick={()=>setDark(!dark)} className={`switch ${dark?'on':''}`}><i/></button></div>
    <button className="logout" onClick={logout}>Log out</button>
  </aside></div>
}

function Checkout({ close, item, onPaid }: { close:()=>void; item: CheckoutItem; onPaid?: () => void }) {
  const [paid,setPaid]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const pay = async () => {
    if (!item.invoiceId) return setPaid(true)
    setBusy(true); setError(null)
    try { if (await payInvoice(item.invoiceId)) { setPaid(true); onPaid?.() } } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="overlay modal-overlay" onMouseDown={close}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
    <button className="modal-close icon-button" onClick={close}><Icon name="close"/></button>
    {!paid ? <><p className="eyebrow">SECURE CHECKOUT</p><h2>Complete your booking.</h2><div className="invoice"><span>{item.label}</span><strong>{item.amount}</strong></div>{!item.invoiceId && <><label>Cardholder name<input placeholder="Alex Bennett"/></label><label>Card details<div className="fake-card"><span>•••• •••• •••• 4242</span><span>05/29</span><span>123</span></div></label></>}<button className="primary wide" onClick={pay} disabled={busy}>{busy ? 'Processing…' : 'Pay securely'}</button><small className="secure">{error ?? (item.invoiceId ? 'SECURED CHECKOUT · STRIPE' : 'STRIPE CHECKOUT UI · BACKEND CONNECTION REQUIRED')}</small></> : <div className="paid-state"><span><Icon name="check" size={30}/></span><p className="eyebrow">PAYMENT COMPLETE</p><h2>You’re all set.</h2><p>Your receipt and calendar invite are ready.</p><button className="primary" onClick={close}>Return to Courtside</button></div>}
  </div></div>
}

export default function App() {
  const [active, setActive] = useState<Tab>('Home')
  const [profile, setProfile] = useState(false)
  const [dark, setDark] = useState(false)
  const [checkout, setCheckout] = useState<CheckoutItem | null>(null)
  const [version, setVersion] = useState(0)
  const { session, ready } = useSession()
  const userId = session?.user.id
  const me = useData(loadProfile, [userId, version])
  const content = useMemo(() => {
    if (active === 'Home') return <Home key={version} go={setActive} pay={setCheckout}/>
    if (active === 'Stats') return <Stats/>
    if (active === 'Aces') return <Aces/>
    if (active === 'Coach') return <Coach checkout={setCheckout}/>
    return <Book key={version} checkout={setCheckout}/>
  }, [active, version, userId])
  if (live && !ready) return <div className="app"><Loading/></div>
  if (live && !session) return <div className={dark ? 'app dark' : 'app'}><SignIn/></div>
  return <div className={dark ? 'app dark' : 'app'}>
    <Header active={active} setActive={setActive} openProfile={()=>setProfile(true)} dark={dark} setDark={setDark} me={me.data}/>
    {content}
    <nav className="mobile-nav">{nav.map(item=><button key={item.name} className={active===item.name?'active':''} onClick={()=>setActive(item.name)}><Icon name={item.icon}/><small>{item.name}</small></button>)}</nav>
    {profile && <ProfileDrawer close={()=>setProfile(false)} dark={dark} setDark={setDark} me={me.data} onSaved={()=>setVersion(v=>v+1)}/>}
    {checkout && <Checkout item={checkout} close={()=>setCheckout(null)} onPaid={()=>setVersion(v=>v+1)}/>}
  </div>
}

