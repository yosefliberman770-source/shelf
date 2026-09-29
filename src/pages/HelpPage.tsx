// "How Shelf works": plain-language answers to how the app organizes books,
// where its numbers come from and how connections are found.
import { Link } from 'react-router-dom';
import { Icon, type IconName, TONES, type Tone } from '../components/icons';

interface Topic { id: string; icon: IconName; tone: Tone; title: string; body: React.ReactNode }

const TOPICS: Topic[] = [
  {
    id: 'map', icon: 'home', tone: 'terracotta', title: 'The big picture',
    body: (
      <>
        <p><b>Today</b> is what to do now. <b>Library</b> is everything you have. <b>Reading</b> is what you’re reading and what’s next. The <b>✦ button</b> in the middle asks the AI about whatever you’re looking at.</p>
        <p><b>More</b> holds the deeper parts: <b>Plan</b> (what you’re working towards), <b>Insights</b> (what’s happening), <b>Knowledge</b> (what you’ve learned) and <b>Explore</b> (what to discover). You never have to use them — they’re there when you want them.</p>
      </>
    ),
  },
  {
    id: 'organize', icon: 'folder', tone: 'green', title: 'Organizing your books',
    body: (
      <>
        <p>Every book is stored once. You can place it in as many places as you like — it’s always the same book, with the same progress and notes.</p>
        <ul>
          <li><b>Folders</b> — subjects and topics. They can sit inside each other: <i>History → Ancient → Rome</i>. A book about Caesar can be in both <i>Rome</i> and <i>Biographies</i>.</li>
          <li><b>Shelves</b> — your own lists, like <i>Favorites</i> or <i>Summer reading</i>. The main shelves (Want to read, Reading, Read…) are automatic.</li>
          <li><b>Tags</b> — quick labels you can filter by, like <i>gift idea</i> or <i>reread</i>.</li>
          <li><b>Projects</b> — a goal with a list of books from anywhere, like <i>“Finish 5 books on the Roman Republic by June”</i>. Shelf tracks the pace you need.</li>
          <li><b>Smart collections</b> — lists that fill themselves using rules, like <i>“unread books under 300 pages”</i>.</li>
        </ul>
        <p>On any book, tap <b>Organize</b> to choose all of these in one place. A good start: make 3–6 folders for the subjects you read most, and let everything else grow over time.</p>
      </>
    ),
  },
  {
    id: 'numbers', icon: 'chart', tone: 'gold', title: 'Where the numbers come from',
    body: (
      <>
        <p>Every time you log pages, use the timer or turn pages in the ebook reader, Shelf saves a <b>reading session</b>. All numbers are calculated from those sessions — never guessed, and never made up by AI.</p>
        <ul>
          <li><b>Pace</b> is your average over the last couple of weeks (you can change this in Settings).</li>
          <li><b>Time left</b> uses your real reading speed from timed sessions and the ebook reader.</li>
          <li><b>Finish dates</b> skip the days you’ve told Shelf you don’t read.</li>
          <li>When there isn’t enough data yet, Shelf says so instead of inventing a number.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'connections', icon: 'compass', tone: 'blue', title: 'How connections are found',
    body: (
      <>
        <p>In <b>Explore → Connections</b>, two books are connected when they share something <i>you</i> recorded:</p>
        <ul>
          <li>the same <b>author</b>,</li>
          <li>the same <b>folder</b>, <b>genre</b> or <b>tag</b>,</li>
          <li>a <b>topic</b> you linked to both (a person, place, event or idea in Knowledge),</li>
          <li>or <b>overlapping history</b> — their subject periods cover some of the same years.</li>
        </ul>
        <p>Each connection shows its reasons, like “same author · in Rome · overlapping period 49–44 BC”. So the more you organize, the richer the connections get. The AI can suggest <i>wider</i> connections too — those are always marked <span className="ai-badge">✦ AI</span> and never mixed up with your own data.</p>
      </>
    ),
  },
  {
    id: 'history', icon: 'calendar', tone: 'brown', title: 'The history timeline',
    body: (
      <>
        <p>The timeline places books by <b>when their subject happened</b>, not when they were written. You set this on a book under <b>Edit → Subject period</b> — for example <i>−509 to −27</i> for the Roman Republic (negative years are BC).</p>
        <p>People, events and periods you add in <b>Knowledge</b> appear as dots and bars above your books. You can also switch on publication dates to see how far a book was written from the events it describes.</p>
      </>
    ),
  },
  {
    id: 'readingmap', icon: 'map', tone: 'teal', title: 'The reading map',
    body: (
      <p>The reading map draws your folders as regions. The darker a region, the more pages you’ve read in that subject. “Unexplored” regions are subjects with books waiting or no reading yet — a gentle way to see where you’ve been and where you haven’t.</p>
    ),
  },
  {
    id: 'knowledge', icon: 'bulb', tone: 'plum', title: 'Quotes, notes and topics',
    body: (
      <>
        <p>Highlight text in the ebook reader and tap <b>Save quote</b>, or add quotes and notes by hand. They all collect in <b>Knowledge</b>, and a different quote greets you on Today each day.</p>
        <p><b>Topics</b> (people, places, events, ideas) tie books and notes together. They power connections, the timeline and the knowledge map.</p>
      </>
    ),
  },
  {
    id: 'ai', icon: 'sparkle', tone: 'ai', title: 'AI and your privacy',
    body: (
      <>
        <p>AI is optional. When it’s on, it only receives what a feature needs, and every AI screen can show you exactly what will be shared. You choose whether notes, reviews, ratings and reading history may be included (Settings → AI & privacy).</p>
        <p>The AI explains, suggests and answers — it never changes your books, progress or statistics by itself.</p>
      </>
    ),
  },
  {
    id: 'data', icon: 'lock', tone: 'green', title: 'Your data',
    body: (
      <p>Your library is stored on this device. Make a backup any time in <b>Settings → Data</b>. Ebook files stay on the device that opened them and aren’t part of backups.</p>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1>How Shelf works</h1>
          <div className="sub">Short answers to the questions people ask most.</div>
        </div>
      </div>
      <div className="col gap-12">
        {TOPICS.map((t, i) => (
          <details key={t.id} className="card" open={i === 0} style={{ padding: 0 }}>
            <summary className="row gap-12" style={{ padding: '16px 18px', cursor: 'pointer', listStyle: 'none' }}>
              <span className="brand-mark" style={{ background: TONES[t.tone], color: '#fff', width: 38, height: 38 }}><Icon name={t.icon} /></span>
              <span className="grow" style={{ fontFamily: 'var(--serif)', fontVariationSettings: "'SOFT' 100", fontSize: 18, fontWeight: 600 }}>{t.title}</span>
              <Icon name="chevronDown" className="faint" />
            </summary>
            <div className="md" style={{ padding: '0 18px 18px', color: 'var(--text-2)', lineHeight: 1.6 }}>{t.body}</div>
          </details>
        ))}
      </div>
      <div className="row wrap mt-24" style={{ justifyContent: 'center' }}>
        <Link className="btn" to="/explore/connections">See connections</Link>
        <Link className="btn" to="/explore/timeline">Open the timeline</Link>
        <Link className="btn primary" to="/library">Go to your library</Link>
      </div>
    </div>
  );
}
