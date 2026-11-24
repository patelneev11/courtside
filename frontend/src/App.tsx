import { useMemo, useState } from 'react'

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

function Header({ active, setActive, openProfile, dark, setDark }: { active: Tab; setActive: (t: Tab) => void; openProfile: () => void; dark: boolean; setDark: (v: boolean) => void }) {
  return <header className="site-header">
    <button className="brand" onClick={() => setActive('Home')} aria-label="Courtside home"><img src="/assets/courtside-mark.svg" alt=""/><span>COURTSIDE</span></button>
    <nav className="main-nav" aria-label="Primary">
      {nav.map(item => <button key={item.name} className={active === item.name ? 'active' : ''} onClick={() => setActive(item.name)}>{item.name}</button>)}
    </nav>
    <div className="header-actions">
      <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle color theme"><Icon name="moon" size={18}/></button>
      <button className="profile-chip" onClick={openProfile} aria-label="Open profile"><span>AB</span><i>3.8</i></button>
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

function Home({ go, pay }: { go: (t: Tab) => void; pay: () => void }) {
  const [done, setDone] = useState([true, false, false])
  const drills = ['10 min dynamic warm-up', 'Cross-court backhand ladder', 'Serve + first ball pattern']
  return <main>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">YOUR TENNIS, COMPOSED</p>
        <h1>Play the point.<br/><em>Own the pattern.</em></h1>
        <p className="lede">One intelligent home for your game, training, coaching, courts, and the equipment behind every point.</p>
        <div className="hero-actions"><button className="primary" onClick={() => go('Coach')}>Analyze my game <Icon name="arrow"/></button><button className="secondary" onClick={() => go('Stats')}>View performance</button></div>
        <div className="today-note"><span>WED · 22 MAY</span><strong>Evening hit at Fort Greene</strong><i>6:30 PM</i></div>
      </div>
      <div className="hero-art" aria-label="Tennis player hitting a one-handed backhand">
        <div className="hero-index"><span>01</span><small>THE COMPLETE PLAYER</small></div>
        <img src="/assets/backhand-silhouette.png" alt="Espresso silhouette of a tennis player hitting a one-handed backhand"/>
        <div className="ball-orbit"/>
      </div>
    </section>

    <section className="dashboard section-pad">
      <SectionHead eyebrow="TODAY AT A GLANCE" title="Your game, in motion." action="Open full schedule" onAction={() => go('Book')}/>
      <div className="widget-grid">
        <article className="card match-card clickable" onClick={() => go('Stats')}>
          <div className="card-top"><span className="tag">LAST MATCH</span><span className="muted">May 20 · Clay</span></div>
          <div className="scoreline"><strong>6–4</strong><strong>4–6</strong><strong className="won">10–7</strong></div>
          <h3>Patience won the third.</h3>
          <p>You created 38% more space before changing direction. Keep building around your backhand pattern.</p>
          <div className="metric-row"><span><b>67%</b>1st serve</span><span><b>1.8</b>W/E ratio</span><span><b>12</b>Winners</span></div>
          <button className="text-link">Full analysis <Icon name="arrow" size={17}/></button>
        </article>

        <article className="card training-card">
          <div className="card-top"><span className="tag">TRAINING</span><span className="count">{done.filter(Boolean).length}/3</span></div>
          <h3>Wednesday build</h3>
          <div className="progress"><i style={{ width: `${done.filter(Boolean).length / 3 * 100}%` }}/></div>
          <div className="task-list">{drills.map((d, i) => <button key={d} onClick={() => setDone(x => x.map((v, n) => n === i ? !v : v))} className={done[i] ? 'done' : ''}><span><Icon name="check" size={14}/></span>{d}<small>{[10, 20, 15][i]} min</small></button>)}</div>
          <button className="secondary wide" onClick={() => go('Stats')}>Continue session</button>
        </article>

        <article className="card wardrobe-card">
          <div className="card-top"><span className="tag">MY WARDROBE</span><Icon name="racket"/></div>
          <div className="wardrobe-photo"><img src="/assets/racket-wardrobe.png" alt="Three premium tennis rackets in the wardrobe"/></div>
          <h3>Blade 98 · Primary</h3>
          <p>Solinco Hyper-G · 52 lbs</p>
          <div className="wear"><span>12.5 hours played</span><span>Restring in 7.5h</span></div>
        </article>

        <article className="card insight-card clickable" onClick={() => go('Coach')}>
          <div className="card-top"><span className="tag">AI COACH FINDING</span><span className="spark-box"><Icon name="spark"/></span></div>
          <p className="quote">“Your contact point is drifting 14 cm late under pressure.”</p>
          <div className="mini-court"><i/><i/><i/><b>14 cm</b></div>
          <p>Start the unit turn before the bounce. The change should unlock more cross-court depth.</p>
          <button className="text-link">Review finding <Icon name="arrow" size={17}/></button>
        </article>

        <article className="card court-card">
          <div className="card-top"><span className="tag">FAVORITE COURT</span><span className="live"><i/>LIVE</span></div>
          <h3>Fort Greene Tennis Courts</h3><p><Icon name="pin" size={15}/> 0.8 mi · Hard · Outdoor</p>
          <div className="times"><button>5:30<small>PM</small></button><button className="available">6:30<small>PM</small></button><button>8:00<small>PM</small></button></div>
          <button className="primary wide" onClick={() => go('Book')}>Reserve 6:30 PM</button>
        </article>

        <article className="card payment-card">
          <div className="card-top"><span className="tag">PENDING PAYMENT</span><Icon name="wallet"/></div>
          <p>Private lesson · Coach Elena</p><div className="amount"><strong>$85.00</strong><span>Due May 24</span></div>
          <button className="primary wide" onClick={pay}>Pay securely</button><small className="secure">SECURED CHECKOUT · STRIPE</small>
        </article>
      </div>
    </section>
  </main>
}

function Stats() {
  const [period, setPeriod] = useState('12 weeks')
  const [section, setSection] = useState('Analysis')
  return <main className="page section-pad">
    <SectionHead eyebrow="PERFORMANCE ROOM" title="Know the shape of your game." action="Export report"/>
    <Subnav items={['Analysis','Train','Wearables']} active={section} setActive={setSection}/>
    {section === 'Analysis' && <><div className="segmented">{['4 weeks','12 weeks','Season'].map(x => <button className={period === x ? 'active' : ''} onClick={() => setPeriod(x)} key={x}>{x}</button>)}</div>
    <div className="stats-grid">
      <article className="card chart-card">
        <div className="card-top"><span className="tag">MATCH FORM</span><span className="positive">↑ 8.4%</span></div>
        <h3>Performance is trending upward.</h3><p>Your consistency index across the last {period}.</p>
        <div className="line-chart"><div className="gridlines"/><svg viewBox="0 0 600 170" preserveAspectRatio="none"><path className="area" d="M0 145 C70 110 100 140 170 105S260 125 320 76 410 92 465 48 550 62 600 20 L600 170H0Z"/><path d="M0 145 C70 110 100 140 170 105S260 125 320 76 410 92 465 48 550 62 600 20"/><circle cx="600" cy="20" r="5"/></svg></div>
        <div className="chart-labels"><span>MAR 01</span><span>APR 01</span><span>MAY 01</span><span>TODAY</span></div>
      </article>
      <article className="card style-card">
        <div className="card-top"><span className="tag">PLAYSTYLE DNA</span><button className="tiny-button">Recalibrate</button></div>
        <div className="rings"><Ring value={46} color="#9d2e38" label="POWER"/><Ring value={34} color="#d59e32" label="CONTROL"/><Ring value={20} color="#34735b" label="SPIN"/></div>
        <h3>Aggressive All-Court</h3><p>Early ball striking with a growing instinct to finish at net.</p>
      </article>
      <article className="card serve-card">
        <div className="card-top"><span className="tag">SERVE PLACEMENT</span><span className="muted">Last 5 matches</span></div>
        <div className="court-map"><span className="dot d1"/><span className="dot d2"/><span className="dot d3"/><span className="dot d4"/><span className="dot d5"/></div>
        <div className="metric-row"><span><b>68%</b>Wide</span><span><b>21%</b>Body</span><span><b>11%</b>T</span></div>
      </article>
      <article className="card recovery-card"><span className="tag">RECOVERY · WHOOP</span><strong>82</strong><h3>Ready for high intensity</h3><p>Sleep 8h 02m · HRV 71 ms</p><div className="progress"><i style={{width:'82%'}}/></div></article>
      <article className="card program-card"><span className="tag">AI TRAINING PLAN</span><h3>Explosive first step</h3><p>4-week block designed around your late contact finding and match calendar.</p><div className="week-row">{[1,2,3,4].map((w,i)=><span className={i<2?'complete':''} key={w}>W{w}</span>)}</div><button className="primary">Open this week</button></article>
    </div></>}
    {section === 'Train' && <TrainingHub/>}
    {section === 'Wearables' && <WearablesHub/>}
  </main>
}

function TrainingHub() {
  const [workout, setWorkout] = useState('Footwork & first step')
  const sessions = [
    ['Footwork & first step','32 MIN','HIGH'],
    ['Shoulder resilience','24 MIN','MEDIUM'],
    ['Match-day primer','18 MIN','LOW'],
  ]
  return <div className="subpage-grid">
    <article className="feature-panel">
      <p className="eyebrow">AI-GENERATED FOR TODAY</p><h2>{workout}</h2>
      <p>Built from your late-contact finding, recovery score, and tomorrow’s match schedule.</p>
      <div className="workout-stat"><span><b>6</b>movements</span><span><b>32</b>minutes</span><span><b>8.2</b>load</span></div>
      <button className="primary">Start guided workout <Icon name="arrow"/></button>
    </article>
    <article className="card session-list"><div className="card-top"><span className="tag">THIS WEEK</span><button className="tiny-button">Create with AI</button></div>
      {sessions.map((s,i)=><button className={workout===s[0]?'selected':''} onClick={()=>setWorkout(s[0])} key={s[0]}><span>0{i+1}</span><strong>{s[0]}</strong><small>{s[1]} · {s[2]}</small><Icon name="arrow"/></button>)}
    </article>
    <article className="card drill-library"><span className="tag">ON-COURT DRILLS</span><h3>Backhand depth ladder</h3><p>Three zones · 30-ball progression</p><div className="drill-court"><i/><i/><i/></div><button className="secondary wide">Open drill tracker</button></article>
    <article className="card streak-card"><span className="tag">CONSISTENCY</span><strong>12</strong><h3>day training streak</h3><div className="streak-days">{['M','T','W','T','F','S','S'].map((d,i)=><i className={i<5?'done':''} key={i}>{d}</i>)}</div></article>
  </div>
}

function WearablesHub() {
  const [connected, setConnected] = useState(['Apple Watch','WHOOP 4.0'])
  const devices = ['Apple Watch','WHOOP 4.0','Garmin','Oura Ring']
  return <div className="wearables-layout">
    <article className="recovery-hero"><div><p className="eyebrow">TODAY’S READINESS</p><strong>82</strong><h2>Ready to push.</h2><p>Your recovery supports a high-intensity court session today.</p></div><div className="recovery-ring"><span>82%</span></div></article>
    <div className="biometric-grid"><article className="card"><span className="tag">RESTING HR</span><strong>48</strong><small>BPM · 3 BELOW AVG</small></article><article className="card"><span className="tag">HRV</span><strong>71</strong><small>MS · OPTIMAL</small></article><article className="card"><span className="tag">SLEEP</span><strong>8:02</strong><small>92% EFFICIENCY</small></article></div>
    <article className="card device-list"><div className="card-top"><span className="tag">CONNECTED DEVICES</span><span className="live"><i/>SYNCED</span></div>{devices.map(d=><div key={d}><span className="device-icon"><Icon name="moon"/></span><strong>{d}</strong><small>{connected.includes(d)?'Last sync 6 min ago':'Available to connect'}</small><button onClick={()=>setConnected(x=>x.includes(d)?x.filter(v=>v!==d):[...x,d])}>{connected.includes(d)?'Disconnect':'Connect'}</button></div>)}</article>
  </div>
}

const reelData = [
  { creator: '@atptour', title: 'The one-handed backhand, slowed down.', category: 'STROKE STUDY', accent: '#8d4b39', url: 'https://www.instagram.com/atptour/reels/' },
  { creator: '@wta', title: 'Three patterns to own the forecourt.', category: 'POINT CONSTRUCTION', accent: '#44614a', url: 'https://www.instagram.com/wta/reels/' },
  { creator: '@tennistv', title: 'Watch the split step before the winner.', category: 'FOOTWORK', accent: '#3f5865', url: 'https://www.instagram.com/tennistv/reels/' },
]

function Aces() {
  const [index, setIndex] = useState(0)
  const [section, setSection] = useState('Reels')
  const reel = reelData[index]
  return <main className="page aces-page">
    <div className="aces-head"><div><p className="eyebrow">CURATED FOR YOUR GAME</p><h2>Aces</h2></div><Subnav items={['Reels','Journal','Saved']} active={section} setActive={setSection}/></div>
    {section === 'Reels' && <><section className="reel-stage" style={{'--accent': reel.accent} as React.CSSProperties}>
      <div className="reel-visual">
        <div className="abstract-court"><span/><span/><span className="moving-ball"/></div>
        <div className="reel-number">0{index + 1}</div>
      </div>
      <div className="reel-content"><span className="tag light">{reel.category}</span><h2>{reel.title}</h2><p>{reel.creator}</p><a className="primary cream" href={reel.url} target="_blank" rel="noreferrer">Watch curated reels on Instagram <Icon name="arrow"/></a></div>
      <div className="reel-tools"><button><Icon name="heart"/><small>2.8k</small></button><button><Icon name="bookmark"/><small>Save</small></button><button><Icon name="share"/><small>Share</small></button></div>
      <div className="reel-nav"><button onClick={() => setIndex((index + reelData.length - 1) % reelData.length)}>↑</button><button onClick={() => setIndex((index + 1) % reelData.length)}>↓</button></div>
    </section>
    <p className="source-note">CURATED FROM OFFICIAL TENNIS CHANNELS · OPENS ON INSTAGRAM</p></>}
    {section === 'Journal' && <Journal/>}
    {section === 'Saved' && <SavedLibrary/>}
  </main>
}

function Journal() {
  const [article,setArticle]=useState<string|null>(null)
  const articles=[['The quiet architecture of a match','MENTAL GAME','8 MIN'],['Why tension changes everything','EQUIPMENT','6 MIN'],['Learning to finish at the net','TACTICS','11 MIN']]
  if(article) return <article className="article-reader"><button className="text-link" onClick={()=>setArticle(null)}>← Back to journal</button><p className="eyebrow">COURTSIDE JOURNAL · TACTICS</p><h1>{article}</h1><p className="article-deck">The best players do not simply strike the ball. They manage space, time, and uncertainty with intention.</p><EmptyArt type="court"/><div className="article-copy"><p>Every point begins as an arrangement of possibilities. Before pace or spin, there is geometry: your position, your opponent’s balance, and the open court between you.</p><h2>Build the point before you finish it.</h2><p>Use height and depth to create the shorter ball. The attacking shot is not always the winner; often, it is the ball that makes the winner inevitable.</p></div></article>
  return <section className="journal"><article className="journal-lead"><EmptyArt type="racket"/><div><span className="tag">THE WEEKEND ESSAY · 12 MIN</span><h2>Elegance is efficiency.</h2><p>What the one-handed backhand teaches us about preparation, timing, and playing without excess.</p><button className="text-link" onClick={()=>setArticle('Elegance is efficiency.')}>Read the essay <Icon name="arrow"/></button></div></article><div className="article-grid">{articles.map((a,i)=><button onClick={()=>setArticle(a[0])} key={a[0]}><span>0{i+1}</span><small>{a[1]} · {a[2]}</small><h3>{a[0]}</h3><p>Notes for the thoughtful player, from technique to match craft.</p><Icon name="arrow"/></button>)}</div></section>
}

function SavedLibrary() {
  const folders=[['Serve mechanics',12],['Footwork',8],['Match tactics',16],['Equipment',5]]
  return <section className="saved-library"><div className="library-head"><div><p className="eyebrow">YOUR COURTSIDE LIBRARY</p><h2>Saved for the next session.</h2></div><button className="primary">New collection</button></div><div className="folder-grid">{folders.map((f,i)=><button key={f[0]}><span className={`folder-art f${i}`}><Icon name="bookmark" size={28}/></span><small>{f[1]} ITEMS</small><h3>{f[0]}</h3><p>Updated {i+1} days ago</p><Icon name="arrow"/></button>)}</div></section>
}

function Coach() {
  const [mode, setMode] = useState<'idle'|'analyzing'|'result'>('idle')
  const [section, setSection] = useState('AI Coach')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<{from:'user'|'coach';text:string}[]>([
    { from: 'coach', text: 'I’ve reviewed your latest match and training load. What part of your game should we work through?' }
  ])
  const analyze = () => {
    setMode('analyzing')
    window.setTimeout(() => setMode('result'), 1800)
  }
  const send = () => {
    if (!question.trim()) return
    setMessages(m => [...m, {from:'user',text:question}, {from:'coach',text:'Based on your recent pattern, begin with an earlier unit turn and hold the finish for one full count. I’ve added a 12-minute progression to your next session.'}])
    setQuestion('')
  }
  return <main className="page section-pad coach-page">
    <SectionHead eyebrow="INTELLIGENT COACHING" title="See what the ball can’t tell you." action="Past findings"/>
    <Subnav items={['AI Coach','Classes','Coaches','Messages','Beginner Hub']} active={section} setActive={setSection}/>
    {section === 'AI Coach' && <><div className="coach-grid">
      <article className="analysis-studio">
        {mode === 'idle' && <><div className="studio-icon"><Icon name="camera" size={32}/></div><p className="eyebrow">NEW ANALYSIS</p><h2>Bring your game into focus.</h2><p>Upload a stroke or record live. Your coach will assess timing, spacing, balance, and recovery.</p><div className="upload-actions"><button className="primary" onClick={analyze}><Icon name="upload"/> Upload a video</button><button className="secondary" onClick={analyze}><Icon name="camera"/> Record live</button></div><small>MP4, MOV · UP TO 3 MINUTES</small></>}
        {mode === 'analyzing' && <div className="loading-state"><div className="tennis-loader"><i/></div><p className="eyebrow">READING THE MOVEMENT</p><h2>Tracing your contact point…</h2><div className="scan-lines"><i/><i/><i/></div></div>}
        {mode === 'result' && <div className="result-state"><span className="result-kicker"><Icon name="spark"/> ANALYSIS COMPLETE</span><h2>Your preparation is arriving late.</h2><p>The racket is still moving back as the ball crosses the service line. Begin the shoulder turn 0.3 seconds earlier.</p><div className="finding-metrics"><span><b>14 cm</b>late contact</span><span><b>7°</b>open stance</span><span><b>86%</b>confidence</span></div><button className="primary" onClick={() => setMode('idle')}>Save corrective drill</button></div>}
      </article>
      <article className="coach-chat card">
        <div className="chat-head"><div><span className="ai-dot"/><div><strong>Courtside Coach</strong><small>AI PERFORMANCE AGENT</small></div></div><Icon name="spark"/></div>
        <div className="messages">{messages.map((m,i)=><div key={i} className={`message ${m.from}`}>{m.text}</div>)}</div>
        <div className="chat-input"><input value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Ask about your game…"/><button onClick={send} aria-label="Send"><Icon name="arrow"/></button></div>
        <small className="prototype-note">PROTOTYPE COACH · CLAUDE CONNECTION READY FOR BACKEND</small>
      </article>
    </div>
    <section className="findings"><SectionHead eyebrow="RECENT FINDINGS" title="Your technical thread."/><div className="finding-row"><span>20 MAY</span><strong>Late contact on pressure backhands</strong><i className="severity">HIGH IMPACT</i><Icon name="arrow"/></div><div className="finding-row"><span>08 MAY</span><strong>Serve toss drifting left</strong><i>IMPROVING</i><Icon name="arrow"/></div></section>
    </>}
    {section === 'Classes' && <Classes/>}
    {section === 'Coaches' && <CoachDirectory/>}
    {section === 'Messages' && <CoachMessages/>}
    {section === 'Beginner Hub' && <BeginnerHub/>}
  </main>
}

function Classes() {
  const [level,setLevel]=useState('All levels')
  const classes=[['Live Ball: Patterns','Coach Elena','$32','4 spots','THU · 6:30 PM'],['Serve + Return Lab','Coach Marcus','$28','2 spots','SAT · 9:00 AM'],['Clay Court Movement','Coach Amélie','$36','6 spots','SUN · 11:30 AM']]
  return <section className="directory"><div className="directory-tools"><div className="segmented">{['All levels','Beginner','Intermediate'].map(l=><button className={level===l?'active':''} onClick={()=>setLevel(l)} key={l}>{l}</button>)}</div><button className="secondary">Brooklyn · within 5 mi⌄</button></div><div className="class-grid">{classes.map((c,i)=><article className="card class-card" key={c[0]}><div className={`class-art a${i}`}><EmptyArt type="court"/><span>{c[4]}</span></div><div className="card-top"><span className="tag">GROUP CLINIC · {level.toUpperCase()}</span><span className="live"><i/>{c[3]}</span></div><h3>{c[0]}</h3><p>{c[1]} · Fort Greene Courts</p><div className="class-footer"><strong>{c[2]}</strong><button className="primary">Join class</button></div></article>)}</div></section>
}

function CoachDirectory() {
  const [following,setFollowing]=useState(['Elena Moretti'])
  const coaches=[['Elena Moretti','FORMER WTA · TECHNIQUE','Italian method, patient progressions, and a sharp eye for efficient movement.'],['Marcus Reid','USPTA ELITE · TACTICS','Point construction and match play for ambitious club competitors.'],['Amélie Laurent','PTR · JUNIORS & ADULTS','Confidence-first coaching with a clay-court foundation.']]
  return <section className="coach-directory"><div className="directory-intro"><p className="eyebrow">VERIFIED COURTSIDE COACHES</p><h2>Find the right voice for your game.</h2></div>{coaches.map((c,i)=><article key={c[0]}><span className="coach-monogram">{c[0].split(' ').map(x=>x[0]).join('')}</span><div><small>{c[1]}</small><h3>{c[0]}</h3><p>{c[2]}</p></div><div className="coach-rate"><strong>${[95,80,75][i]}</strong><small>/ HOUR</small><button onClick={()=>setFollowing(x=>x.includes(c[0])?x.filter(v=>v!==c[0]):[...x,c[0]])} className={following.includes(c[0])?'secondary':'primary'}>{following.includes(c[0])?'Following':'Follow'}</button></div></article>)}</section>
}

function CoachMessages() {
  const [selected,setSelected]=useState(0)
  const [draft,setDraft]=useState('')
  const [sent,setSent]=useState<string[]>([])
  const names=['Elena Moretti','Marcus Reid','Courtside Support']
  return <section className="messages-layout"><aside>{names.map((n,i)=><button className={selected===i?'active':''} onClick={()=>setSelected(i)} key={n}><span>{n.split(' ').map(x=>x[0]).join('').slice(0,2)}</span><div><strong>{n}</strong><small>{i===0?'That contact point looks better.':'Tap to open conversation'}</small></div></button>)}</aside><article className="message-thread"><div className="thread-head"><span className="coach-monogram">{names[selected].slice(0,2).toUpperCase()}</span><div><strong>{names[selected]}</strong><small>Usually replies within 2 hours</small></div></div><div className="thread-body"><span>MONDAY</span><p className="theirs">Send me a few backhands from your next hit. I want to check the preparation timing.</p><p className="mine">I’ve attached the clip from this morning’s session.</p><p className="theirs">That contact point looks better. Keep the first move simple and let the shoulder lead.</p>{sent.map((s,i)=><p className="mine" key={i}>{s}</p>)}</div><div className="chat-input"><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Message your coach…"/><button onClick={()=>{if(draft.trim()){setSent(x=>[...x,draft]);setDraft('')}}}><Icon name="arrow"/></button></div></article></section>
}

function BeginnerHub() {
  const steps=[['01','Court & scoring','Complete'],['02','Grip foundations','Complete'],['03','Build a reliable rally','In progress'],['04','Serve with rhythm','Locked'],['05','Play your first match','Locked']]
  return <section className="beginner-hub"><div className="pathway-head"><div><p className="eyebrow">THE COURTSIDE PATHWAY</p><h2>From first swing to first match.</h2><p>A considered, step-by-step introduction to the game—without the noise.</p></div><div className="path-progress"><strong>42%</strong><span>FOUNDATIONS COMPLETE</span></div></div><div className="path-steps">{steps.map((s,i)=><button className={s[2]==='Locked'?'locked':''} key={s[0]}><span>{s[0]}</span><div><small>{s[2]}</small><h3>{s[1]}</h3><p>{i===2?'Rally height, recovery, and finding your natural tempo.':'Four concise lessons and one guided court session.'}</p></div>{s[2]==='Complete'?<Icon name="check"/>:<Icon name="arrow"/>}</button>)}</div></section>
}

function Book({ checkout }: { checkout: (item?: string) => void }) {
  const [day, setDay] = useState(22)
  const [section, setSection] = useState('Rent a court')
  return <main className="page section-pad">
    <SectionHead eyebrow="COURTS & COACHING" title="Your next hour on court." action="My bookings"/>
    <Subnav items={['Rent a court','Book a lesson','Availability tracker']} active={section} setActive={setSection}/>
    {section === 'Rent a court' && <div className="booking-grid">
      <article className="card booking-calendar">
        <div className="month"><button>←</button><strong>May 2025</strong><button>→</button></div>
        <div className="date-strip">{[20,21,22,23,24,25].map((d,i)=><button className={day===d?'active':''} onClick={()=>setDay(d)} key={d}><small>{['TUE','WED','THU','FRI','SAT','SUN'][i]}</small><b>{d}</b></button>)}</div>
        <div className="filter-row"><button>Near Brooklyn⌄</button><button>All surfaces⌄</button><button>Evening⌄</button></div>
      </article>
      <article className="card venue">
        <div className="venue-art"><div className="court-lines"/><span>0.8 MI</span></div>
        <div className="venue-body"><div><span className="tag">PUBLIC · HARD</span><h3>Fort Greene Tennis Courts</h3><p><Icon name="pin" size={15}/> DeKalb Ave & S Portland</p></div><button className="icon-button"><Icon name="heart"/></button></div>
        <div className="slot-row"><button>5:30 PM <small>$18</small></button><button className="selected">6:30 PM <small>$18</small></button><button>8:00 PM <small>$18</small></button></div>
        <button className="primary wide" onClick={()=>checkout('Fort Greene Court · 6:30 PM')}>Reserve court · $18</button>
      </article>
      <article className="card venue compact">
        <div className="venue-art clay"><div className="court-lines"/><span>2.1 MI</span></div>
        <div className="venue-body"><div><span className="tag">CLUB · CLAY</span><h3>Prospect Park Tennis</h3><p><Icon name="pin" size={15}/> Parkside Ave</p></div></div>
        <div className="slot-row"><button>7:00 PM <small>$32</small></button><button>8:30 PM <small>$32</small></button></div>
      </article>
    </div>}
    {section === 'Book a lesson' && <LessonBooking checkout={checkout}/>}
    {section === 'Availability tracker' && <AvailabilityTracker/>}
  </main>
}

function LessonBooking({checkout}:{checkout:(item?:string)=>void}) {
  const [coach,setCoach]=useState('Elena Moretti')
  const [time,setTime]=useState('5:30 PM')
  return <section className="lesson-booking"><div className="lesson-controls card"><p className="eyebrow">PRIVATE COACHING</p><h2>Choose your session.</h2><label>Coach<select value={coach} onChange={e=>setCoach(e.target.value)}><option>Elena Moretti</option><option>Marcus Reid</option><option>Amélie Laurent</option></select></label><label>Session type<select><option>Private lesson · 60 min</option><option>Semi-private hit · 90 min</option><option>Video review · 30 min</option></select></label><label>Court<select><option>Fort Greene Tennis Courts</option><option>Prospect Park Tennis Center</option></select></label></div><div className="lesson-times"><p className="eyebrow">THURSDAY · MAY 22</p><h3>Available times with {coach.split(' ')[0]}</h3><div>{['8:00 AM','10:30 AM','2:00 PM','5:30 PM','7:00 PM'].map(t=><button className={time===t?'selected':''} onClick={()=>setTime(t)} key={t}>{t}</button>)}</div><div className="lesson-total"><span><small>YOUR SESSION</small><strong>{time} · 60 minutes</strong></span><b>$95</b></div><button className="primary wide" onClick={()=>checkout(`Lesson with ${coach} · ${time}`)}>Continue to payment</button></div></section>
}

function AvailabilityTracker() {
  const [alerts,setAlerts]=useState([true,false,true])
  const courts=[['Fort Greene','Weekdays · 5–8 PM','3 openings'],['Prospect Park','Saturday · 8–11 AM','No openings'],['McCarren Park','Weekdays · 6–9 PM','1 opening']]
  return <section className="tracker"><div className="tracker-head"><div><p className="eyebrow">LIVE COURT MONITOR</p><h2>We’ll watch the schedule.</h2><p>Set your preferred windows. Courtside will let you know the moment a court opens.</p></div><button className="primary">Add court alert</button></div><div className="tracker-list">{courts.map((c,i)=><article className="card" key={c[0]}><div className="tracker-court"><div className="court-lines"/></div><div><span className="tag">{c[0].toUpperCase()} TENNIS COURTS</span><h3>{c[1]}</h3><p className={i===1?'muted':'positive'}>{c[2]}</p></div><button onClick={()=>setAlerts(x=>x.map((v,n)=>n===i?!v:v))} className={`switch ${alerts[i]?'on':''}`}><i/></button></article>)}</div></section>
}

function ProfileDrawer({ close, dark, setDark }: { close: () => void; dark: boolean; setDark: (v:boolean)=>void }) {
  const [view,setView]=useState('Profile')
  if(view!=='Profile') return <div className="overlay" onMouseDown={close}><aside className="drawer" onMouseDown={e=>e.stopPropagation()}>
    <div className="drawer-top"><button className="text-link" onClick={()=>setView('Profile')}>← Profile</button><button className="icon-button" onClick={close}><Icon name="close"/></button></div>
    <div className="drawer-detail"><p className="eyebrow">PLAYER ACCOUNT</p><h2>{view}</h2>
      {view==='My wardrobe' && <><div className="drawer-wardrobe"><img src="/assets/racket-wardrobe.png" alt="Three rackets"/></div><h3>Blade 98 · Primary</h3><p>52 lbs · 12.5 hours played</p><button className="primary wide">Add equipment</button></>}
      {view==='My calendar' && <div className="mini-agenda">{[['MAY 22','Fort Greene court','6:30 PM'],['MAY 24','Lesson with Elena','5:30 PM'],['MAY 27','Live Ball clinic','7:00 PM']].map(x=><div key={x[1]}><span>{x[0]}</span><strong>{x[1]}</strong><small>{x[2]}</small></div>)}</div>}
      {view==='Payments' && <><div className="spending"><strong>$263</strong><span>MAY SPEND</span></div><div className="mini-agenda">{[['MAY 18','Prospect Park court','$32'],['MAY 12','Lesson with Elena','$85'],['MAY 04','Live Ball clinic','$28']].map(x=><div key={x[1]}><span>{x[0]}</span><strong>{x[1]}</strong><small>{x[2]}</small></div>)}</div></>}
      {view==='Edit profile' && <div className="profile-form"><label>Display name<input defaultValue="Alex Bennett"/></label><label>Rating<input defaultValue="3.8 NTRP"/></label><label>Backhand<select defaultValue="One-handed"><option>One-handed</option><option>Two-handed</option></select></label><button className="primary wide">Save profile</button></div>}
      {view==='Settings' && <div className="setting-list">{['Booking reminders','Coach messages','Weekly game report','High quality video uploads'].map((x,i)=><div key={x}><strong>{x}</strong><button className={`switch ${i<3?'on':''}`}><i/></button></div>)}</div>}
    </div>
  </aside></div>
  return <div className="overlay" onMouseDown={close}><aside className="drawer" onMouseDown={e=>e.stopPropagation()}>
    <div className="drawer-top"><p className="eyebrow">PLAYER PROFILE</p><button className="icon-button" onClick={close}><Icon name="close"/></button></div>
    <div className="player"><span>AB</span><div><h2>Alex Bennett</h2><p>3.8 NTRP · One-handed backhand</p></div></div>
    <div className="playstyle"><small>MAIN PLAYSTYLE</small><strong>All-Court Player</strong><span>78% match</span></div>
    <div className="drawer-menu">
      <button onClick={()=>setView('My wardrobe')}><Icon name="racket"/>My wardrobe<span>3 rackets</span><Icon name="arrow"/></button>
      <button onClick={()=>setView('My calendar')}><Icon name="calendar"/>My calendar<span>4 upcoming</span><Icon name="arrow"/></button>
      <button onClick={()=>setView('Payments')}><Icon name="wallet"/>Payments<span>$85 due</span><Icon name="arrow"/></button>
      <button onClick={()=>setView('Edit profile')}><Icon name="coach"/>Edit profile<span/><Icon name="arrow"/></button>
      <button onClick={()=>setView('Settings')}><Icon name="settings"/>Settings<span/><Icon name="arrow"/></button>
    </div>
    <div className="theme-row"><Icon name="moon"/><div><strong>Evening mode</strong><small>Low-light court view</small></div><button onClick={()=>setDark(!dark)} className={`switch ${dark?'on':''}`}><i/></button></div>
    <button className="logout">Log out</button>
  </aside></div>
}

function Checkout({ close, item = 'Private lesson · Coach Elena' }: { close:()=>void; item?:string }) {
  const [paid,setPaid]=useState(false)
  return <div className="overlay modal-overlay" onMouseDown={close}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
    <button className="modal-close icon-button" onClick={close}><Icon name="close"/></button>
    {!paid ? <><p className="eyebrow">SECURE CHECKOUT</p><h2>Complete your booking.</h2><div className="invoice"><span>{item}</span><strong>{item.includes('Court')?'$18.00':item.includes('Lesson')?'$95.00':'$85.00'}</strong></div><label>Cardholder name<input placeholder="Alex Bennett"/></label><label>Card details<div className="fake-card"><span>•••• •••• •••• 4242</span><span>05/29</span><span>123</span></div></label><button className="primary wide" onClick={()=>setPaid(true)}>Pay securely</button><small className="secure">STRIPE CHECKOUT UI · BACKEND CONNECTION REQUIRED</small></> : <div className="paid-state"><span><Icon name="check" size={30}/></span><p className="eyebrow">PAYMENT COMPLETE</p><h2>You’re all set.</h2><p>Your receipt and calendar invite are ready.</p><button className="primary" onClick={close}>Return to Courtside</button></div>}
  </div></div>
}

export default function App() {
  const [active, setActive] = useState<Tab>('Home')
  const [profile, setProfile] = useState(false)
  const [dark, setDark] = useState(false)
  const [checkout, setCheckout] = useState<string | null>(null)
  const content = useMemo(() => {
    if (active === 'Home') return <Home go={setActive} pay={()=>setCheckout('Private lesson · Coach Elena')}/>
    if (active === 'Stats') return <Stats/>
    if (active === 'Aces') return <Aces/>
    if (active === 'Coach') return <Coach/>
    return <Book checkout={item=>setCheckout(item || 'Court reservation')}/>
  }, [active])
  return <div className={dark ? 'app dark' : 'app'}>
    <Header active={active} setActive={setActive} openProfile={()=>setProfile(true)} dark={dark} setDark={setDark}/>
    {content}
    <nav className="mobile-nav">{nav.map(item=><button key={item.name} className={active===item.name?'active':''} onClick={()=>setActive(item.name)}><Icon name={item.icon}/><small>{item.name}</small></button>)}</nav>
    {profile && <ProfileDrawer close={()=>setProfile(false)} dark={dark} setDark={setDark}/>}
    {checkout && <Checkout item={checkout} close={()=>setCheckout(null)}/>}
  </div>
}
