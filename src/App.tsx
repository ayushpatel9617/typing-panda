import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { auth, db, firebaseConfigured, signInWithGoogle, signOutUser } from './firebase';
import { ArrowDownRight, ArrowRight, AudioLines, BarChart3, Check, ChevronDown, CircleHelp, Clock3, Crown, Flame, Gauge, Github, Keyboard, LogIn, Menu, RotateCcw, Settings2, Sparkles, Trophy, UserRound, X, Zap } from 'lucide-react';

type Result = { wpm: number; accuracy: number; correct: number; errors: number; seconds: number; createdAt?: unknown };
const WORDS = 'the quick brown fox jumps over the lazy dog and every small step makes a little progress when you practice with patience your fingers learn the rhythm of each sentence typing is a skill that grows stronger one focused minute at a time stay curious keep moving and find your flow'.split(' ');
const SAMPLE_TEXTS = [
  'the quick brown fox jumps over the lazy dog and every small step makes a little progress',
  'great things are built one keystroke at a time stay focused trust your practice and enjoy the process',
  'find your rhythm breathe in and let your fingers dance across the keys with confidence',
  'practice does not make perfect practice makes progress and progress is worth celebrating',
];
const DURATIONS = [15, 30, 60, 120];

function getWords(seed: number, count = 65) {
  const words: string[] = [];
  for (let i = 0; i < count; i++) words.push(WORDS[(i * 7 + seed * 11 + Math.floor(i / WORDS.length)) % WORDS.length]);
  return words.join(' ');
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [duration, setDuration] = useState(30);
  const [mode, setMode] = useState<'time' | 'words'>('time');
  const [text, setText] = useState(() => getWords(0));
  const [typed, setTyped] = useState('');
  const [remaining, setRemaining] = useState(30);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [best, setBest] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [notice, setNotice] = useState('');
  const [leaderboard, setLeaderboard] = useState<{name: string; wpm: number; accuracy: number}[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const startedAt = useRef<number | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem('tp-results');
    if (saved) {
      try { const parsed: Result[] = JSON.parse(saved); setResults(parsed); setBest(Math.max(0, ...parsed.map(r => r.wpm))); } catch { /* ignore invalid local data */ }
    }
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    setRemaining(duration);
  }, [duration]);

  useEffect(() => {
    if (!started || finished) return;
    const id = window.setInterval(() => {
      if (startedAt.current === null) return;
      const elapsed = (Date.now() - startedAt.current) / 1000;
      const next = Math.max(0, duration - elapsed);
      setRemaining(next);
      if (next <= 0) completeTest();
    }, 100);
    return () => window.clearInterval(id);
    // completeTest intentionally uses current values through the current render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished, duration, typed]);

  useEffect(() => {
    if (!user || !db) return;
    const loadBoard = async () => {
      try {
        const q = query(collection(db!, 'typingResults'), orderBy('wpm', 'desc'), limit(5));
        const snap = await getDocs(q);
        setLeaderboard(snap.docs.map(d => ({ name: String(d.data().displayName || 'Panda player'), wpm: Number(d.data().wpm || 0), accuracy: Number(d.data().accuracy || 0) })));
      } catch { /* Firestore rules may not be deployed yet. */ }
    };
    void loadBoard();
  }, [user]);

  const elapsed = duration - remaining;
  const correctChars = useMemo(() => typed.split('').filter((char, i) => char === text[i]).length, [typed, text]);
  const errorCount = useMemo(() => typed.split('').filter((char, i) => char !== text[i]).length, [typed, text]);
  const liveWpm = elapsed > 0 ? Math.round((correctChars / 5) / (elapsed / 60)) : 0;
  const liveAccuracy = typed.length ? Math.round((correctChars / typed.length) * 100) : 100;

  function resetTest(nextText?: string) {
    setTyped(''); setStarted(false); setFinished(false); finishedRef.current = false;
    startedAt.current = null; setRemaining(duration);
    if (nextText) setText(nextText);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }

  async function completeTest() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const elapsedSeconds = Math.max(1, Math.min(duration, (Date.now() - (startedAt.current ?? Date.now())) / 1000));
    const correct = typed.split('').filter((char, i) => char === text[i]).length;
    const errors = typed.split('').filter((char, i) => char !== text[i]).length;
    const wpm = Math.round((correct / 5) / (elapsedSeconds / 60));
    const accuracy = typed.length ? Math.round((correct / typed.length) * 100) : 100;
    const result: Result = { wpm, accuracy, correct, errors, seconds: Math.round(elapsedSeconds), createdAt: new Date().toISOString() };
    setFinished(true); setStarted(false); setRemaining(0);
    setResults(prev => { const next = [result, ...prev].slice(0, 100); localStorage.setItem('tp-results', JSON.stringify(next)); return next; });
    setBest(prev => Math.max(prev, wpm));
    if (user && db) {
      try {
        await addDoc(collection(db, 'typingResults'), { uid: user.uid, displayName: user.displayName || 'Panda player', wpm, accuracy, correct, errors, seconds: Math.round(elapsedSeconds), mode, createdAt: serverTimestamp(), dayKey: new Date().toISOString().slice(0, 10) });
        setNotice('Result saved to your account!');
      } catch { setNotice('Result saved on this device. Check your Firestore security rules to sync it online.'); }
    } else setNotice('Nice run! Sign in with Google to sync your results across devices.');
  }

  function handleTyping(value: string) {
    if (finished) return;
    if (!started && value.length > 0) { setStarted(true); startedAt.current = Date.now(); }
    setTyped(value);
    if (mode === 'words' && value.trim().split(/\s+/).filter(Boolean).length >= 25) window.setTimeout(() => completeTest(), 0);
    else if (value.length >= text.length) window.setTimeout(() => completeTest(), 0);
  }

  async function handleLogin() {
    try { await signInWithGoogle(); setNotice('Signed in successfully. Your future results can sync to your account.'); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Sign-in was unsuccessful. Please try again.'); }
  }

  const textDisplay = useMemo(() => text.split('').map((char, i) => {
    let cls = 'char';
    if (i < typed.length) cls += typed[i] === char ? ' correct' : ' incorrect';
    if (i === typed.length) cls += ' current';
    return <span className={cls} key={i}>{char}</span>;
  }), [text, typed]);

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Typing Panda home"><span className="brand-mark">🐼</span><span>typing<span className="brand-accent">panda</span><small>BETA</small></span></a>
      <nav className="main-nav"><a className="nav-active" href="#practice">Practice</a><a href="#games">Games <span className="soon-pill">SOON</span></a><a href="#leaderboard">Leaderboard</a><a href="#progress">Progress</a></nav>
      <div className="top-actions"><button className="icon-btn settings-trigger" aria-label="Settings" onClick={() => setShowSettings(!showSettings)}><Settings2 size={18}/></button>{user ? <button className="user-pill" onClick={() => setShowProfile(!showProfile)}><span className="avatar">{user.displayName?.slice(0,1) || 'P'}</span><span className="user-name">{user.displayName?.split(' ')[0] || 'Panda'}</span><ChevronDown size={14}/></button> : <button className="login-btn" onClick={handleLogin}><LogIn size={16}/> <span>Sign in</span></button>}</div>
    </header>

    <main id="top">
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> YOUR DAILY DOSE OF KEYBOARD ZEN</div><h1>Find your<br/><span>typing flow.</span></h1><p>A little practice. A lot of progress. Build your speed, find your rhythm, and have fun along the way.</p><div className="hero-ctas"><button className="primary-btn" onClick={() => { document.getElementById('practice')?.scrollIntoView({behavior:'smooth'}); inputRef.current?.focus(); }}>Start typing <ArrowRight size={17}/></button><div className="social-proof"><div className="mini-avatars"><span>🐼</span><span>🐸</span><span>🦊</span></div><span><b>One keystroke</b> at a time</span></div></div></div>
        <div className="hero-art" aria-label="A friendly panda mascot with floating keyboard keys"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="float-key key-one">W</div><div className="float-key key-two">⌘</div><div className="float-key key-three">A</div><div className="float-key key-four">↵</div><div className="sparkle sparkle-one">✦</div><div className="sparkle sparkle-two">✧</div><div className="panda-platform"><div className="platform-ring"/><div className="panda-figure"><div className="panda-ear ear-left"/><div className="panda-ear ear-right"/><div className="panda-head"><div className="eye-patch patch-left"><span className="eye-shine"/></div><div className="eye-patch patch-right"><span className="eye-shine"/></div><div className="panda-blush blush-left"/><div className="panda-blush blush-right"/><div className="panda-nose"/><div className="panda-mouth"/></div><div className="panda-body"><div className="panda-belly"/><div className="panda-arm arm-left"/><div className="panda-arm arm-right"/></div><div className="panda-foot foot-left"/><div className="panda-foot foot-right"/></div></div><div className="art-caption"><span className="caption-icon"><Sparkles size={14}/></span><span><b>Small steps, big wins</b><small>Your progress starts here</small></span></div></div>
        <div className="hero-bottom-note"><span className="tiny-spark">✳</span> MADE FOR CURIOUS FINGERS <span className="note-line"/></div>
      </section>

      <section className="practice-section" id="practice">
        <div className="section-heading"><div><div className="eyebrow muted"><span className="eyebrow-dot"/> THE DAILY PRACTICE</div><h2>Ready, set, <span>type.</span></h2></div><div className="practice-caption">No pressure. Just progress <span>♡</span></div></div>
        <div className="test-card">
          <div className="test-toolbar"><div className="mode-switch"><button className={mode==='time'?'selected':''} onClick={() => {setMode('time'); resetTest();}}> <Clock3 size={15}/> Time</button><button className={mode==='words'?'selected':''} onClick={() => {setMode('words'); resetTest();}}><Keyboard size={15}/> Words</button></div><div className="duration-switch">{DURATIONS.map(d => <button key={d} className={duration===d?'duration-active':''} onClick={() => {setDuration(d); resetTest();}}>{d}<span>{mode==='time'?'s':'s'}</span></button>)}</div><button className="icon-btn restart-btn" aria-label="Restart test" onClick={() => resetTest(getWords(Math.floor(Math.random()*SAMPLE_TEXTS.length)))}><RotateCcw size={16}/></button></div>
          <div className="test-stats"><div className="live-stat"><span>TIME LEFT</span><b className={remaining<=5?'urgent':''}>{Math.ceil(remaining)}<small>s</small></b></div><div className="live-stat"><span>YOUR SPEED</span><b>{liveWpm}<small> wpm</small></b></div><div className="live-stat"><span>ACCURACY</span><b>{liveAccuracy}<small>%</small></b></div><div className="live-stat"><span>ERRORS</span><b>{errorCount}</b></div></div>
          {finished ? <div className="result-panel"><div className="result-confetti">✦　✧　✦</div><div className="result-label">LOOK AT YOU GO!</div><h3>{results[0]?.wpm ?? liveWpm} <small>WPM</small></h3><p>You typed with {results[0]?.accuracy ?? liveAccuracy}% accuracy. Every round makes you a little better.</p><div className="result-actions"><button className="primary-btn" onClick={() => resetTest(getWords(Math.floor(Math.random()*5)))}>Try again <RotateCcw size={15}/></button><button className="soft-btn" onClick={handleLogin}>Save my progress <ArrowRight size={15}/></button></div></div> : <div className="typing-area" onClick={() => inputRef.current?.focus()}><div className="typing-text" aria-hidden="true">{textDisplay}</div><textarea ref={inputRef} className="typing-input" value={typed} onChange={e => handleTyping(e.target.value)} onPaste={e => e.preventDefault()} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off" aria-label="Type the displayed text here" placeholder="Click here and start typing…" disabled={finished}/><div className="typing-hint"><span><kbd>tab</kbd> + <kbd>enter</kbd> restart <span className="hint-divider">·</span> <kbd>esc</kbd> pause</span><span>{typed.length} characters typed <AudioLines size={14}/></span></div></div>}
          <div className="test-footer"><span><span className="green-dot"/> {started ? 'You’re in the zone. Keep going!' : 'Your space to practice, at your pace.'}</span><button onClick={() => resetTest(getWords(Math.floor(Math.random()*7)))}>New text <ArrowDownRight size={14}/></button></div>
        </div>
      </section>

      <section className="quick-stats" id="progress"><div className="quick-stat-intro"><span className="stat-illustration">🌱</span><div><h3>Little by little.</h3><p>Look how far you’ve come.</p></div></div><div className="quick-stat"><span className="quick-stat-label"><Gauge size={15}/> PERSONAL BEST</span><strong>{best}<small> WPM</small></strong><span className="stat-sub">Your fastest run so far</span></div><div className="quick-stat"><span className="quick-stat-label"><Flame size={15}/> TESTS COMPLETED</span><strong>{results.length}<small> runs</small></strong><span className="stat-sub">Every practice counts</span></div><div className="quick-stat"><span className="quick-stat-label"><Zap size={15}/> AVG. ACCURACY</span><strong>{results.length ? Math.round(results.reduce((sum, r) => sum + r.accuracy, 0) / results.length) : 0}<small>%</small></strong><span className="stat-sub">Steady hands, sharp mind</span></div><button className="stat-arrow" onClick={() => setShowProfile(true)} aria-label="View profile"><ArrowRight size={20}/></button></section>

      <section className="bottom-grid"><article className="leaderboard-card" id="leaderboard"><div className="card-heading"><div><span className="card-kicker"><Crown size={14}/> THE FRIENDLY RACE</span><h3>Top pandas <span>🏆</span></h3></div><button className="text-link" onClick={() => setNotice('The public leaderboard will appear after online score saving and security rules are configured.')}>View all <ArrowRight size={14}/></button></div><p className="card-description">A little friendly competition never hurt.</p>{leaderboard.length ? leaderboard.map((p, i) => <div className="leader-row" key={`${p.name}-${i}`}><span className={`rank rank-${i+1}`}>{String(i+1).padStart(2,'0')}</span><span className="leader-avatar">{['🐼','🦊','🐨','🐸','🐯'][i%5]}</span><span className="leader-name">{p.name}</span><span className="leader-score">{p.wpm} <small>wpm</small></span></div>) : <div className="empty-board"><div className="empty-trophy"><Trophy size={22}/></div><div><b>The podium is waiting.</b><span>Sign in and complete a test to join the race.</span></div><button className="round-arrow" onClick={handleLogin}><ArrowRight size={16}/></button></div>}<div className="leaderboard-foot"><span><span className="green-dot"/> Daily leaderboard refreshes at midnight</span><span>ALL-TIME ↗</span></div></article>
      <article className="challenge-card" id="games"><div className="challenge-top"><span className="challenge-label"><Sparkles size={14}/> YOUR MINI CHALLENGE</span><span className="challenge-number">01 / 03</span></div><div className="challenge-emoji">🎯</div><h3>Accuracy over<br/><span>everything.</span></h3><p>Try to finish a round with 98% accuracy. Slow down, breathe, and let the rhythm find you.</p><div className="challenge-progress"><span style={{width:`${Math.min(100, liveAccuracy)}%`}}/></div><div className="challenge-bottom"><span>{liveAccuracy}% accuracy this round</span><button onClick={() => {setDuration(60); setMode('time'); resetTest(); document.getElementById('practice')?.scrollIntoView({behavior:'smooth'});}}>Take the challenge <ArrowRight size={14}/></button></div><div className="challenge-decoration deco-one">✳</div><div className="challenge-decoration deco-two">✦</div></article></section>

      <section className="bottom-banner"><div className="banner-mascot">🐼</div><div><h3>Good things take practice.</h3><p>Make a tiny bit of progress today. Tomorrow-you will be glad you did.</p></div><button className="banner-btn" onClick={() => {resetTest();document.getElementById('practice')?.scrollIntoView({behavior:'smooth'});}}>One more round <ArrowRight size={16}/></button><span className="banner-star">✳</span></section>
    </main>

    <footer className="footer"><a className="brand footer-brand" href="#top"><span className="brand-mark">🐼</span><span>typing<span className="brand-accent">panda</span></span></a><span>Made with a little patience and a lot of keystrokes.</span><div className="footer-links"><a href="#practice">Practice</a><a href="#leaderboard">Leaderboard</a><a href="https://github.com/Ujjwalpratap001/typing-panda" target="_blank" rel="noreferrer"><Github size={14}/> GitHub</a></div></footer>

    {showSettings && <div className="popover-panel settings-panel"><div className="popover-title"><b><Settings2 size={16}/> Preferences</b><button onClick={() => setShowSettings(false)}><X size={15}/></button></div><label className="setting-row"><span>Test duration</span><select value={duration} onChange={e => {setDuration(Number(e.target.value));resetTest();}}>{DURATIONS.map(d => <option key={d} value={d}>{d} seconds</option>)}</select></label><label className="setting-row"><span>Test mode</span><select value={mode} onChange={e => {setMode(e.target.value as 'time'|'words');resetTest();}}><option value="time">Time</option><option value="words">Words</option></select></label><p className="settings-note"><CircleHelp size={14}/> Preferences are local to this device for now.</p></div>}
    {showProfile && <div className="modal-backdrop" onClick={() => setShowProfile(false)}><div className="profile-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowProfile(false)}><X size={18}/></button><div className="profile-mascot">🐼</div><h3>{user ? `Hey, ${user.displayName?.split(' ')[0] || 'Panda'}!` : 'Your panda den'}</h3><p>{user ? user.email : 'Sign in to keep your typing journey safe in the cloud.'}</p><div className="profile-mini-stats"><div><b>{best}</b><span>Best WPM</span></div><div><b>{results.length}</b><span>Tests</span></div><div><b>{results.length ? Math.round(results.reduce((sum,r)=>sum+r.accuracy,0)/results.length) : 0}%</b><span>Accuracy</span></div></div>{user ? <button className="soft-btn modal-action" onClick={async()=>{await signOutUser();setShowProfile(false);}}>Sign out</button> : <button className="primary-btn modal-action" onClick={handleLogin}><LogIn size={16}/> Continue with Google</button>}<span className="modal-footnote">{firebaseConfigured ? 'Your account is connected through Firebase.' : 'Google sign-in will work after Firebase web app settings are added.'}</span></div></div>}
    {notice && <div className="toast" role="status"><span><Check size={16}/></span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15}/></button></div>}
  </div>;
}
