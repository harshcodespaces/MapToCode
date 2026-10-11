import Link from "next/link";
import FlowchartDiagram from "./components/FlowchartDiagram";
import styles from "./page.module.css";

const blocks = [
  { number: "01", title: "Start with the idea", text: "Describe the steps in the order they happen. A flowchart makes the logic easier to see." },
  { number: "02", title: "Add a decision", text: "Show where your program needs to choose a path, like checking whether someone is an adult." },
  { number: "03", title: "Get the Python", text: "Read the matching code as you build. Take the finished program with you as a .py file." },
];

export default function Home() {
  return (
    <main className={styles.page} id="top">
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="MapToCode home">
          <span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>
          MapToCode
        </Link>
        <nav className={styles.nav} aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#example">Example</a>
          <Link className={styles.navButton} href="/workspace">Open Workspace <span>↗</span></Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><span className={styles.eyebrowDot} /> A clearer way to learn code</div>
          <h1>See your logic.<br />Then <em>write the code.</em></h1>
          <p className={styles.heroText}>Turn a flowchart into readable Python. MapToCode helps you see how each step and decision becomes a real program.</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/workspace">Open Workspace <span>↗</span></Link>
            <a className={styles.secondaryButton} href="#example">Explore the example <span>↓</span></a>
          </div>
          <div className={styles.heroFootnote}><span className={styles.localIcon}>⌘</span><span>Runs in your browser&nbsp; · &nbsp;No account needed</span></div>
        </div>

        <div className={styles.heroPreview} aria-label="Flowchart and generated Python preview">
          <div className={styles.previewTop}><span><i /> EXAMPLE FLOWCHART</span><span>AGE CHECK&nbsp; / &nbsp;PYTHON</span></div>
          <FlowchartDiagram compact />
          <div className={styles.previewCode}>
            <div className={styles.previewCodeTop}><span><i /> PYTHON PREVIEW</span><span>age_check.py</span></div>
            <pre><code><span className={styles.codeVar}>age</span> = <span className={styles.codeFunction}>int</span>(input(<span className={styles.codeString}>&quot;Enter your age: &quot;</span>))<br /><br /><span className={styles.codeKeyword}>if</span> age &gt;= <span className={styles.codeNumber}>18</span>:<br />&nbsp;&nbsp;&nbsp;&nbsp;print(<span className={styles.codeString}>&quot;Adult&quot;</span>)<br /><span className={styles.codeKeyword}>else</span>:<br />&nbsp;&nbsp;&nbsp;&nbsp;print(<span className={styles.codeString}>&quot;Minor&quot;</span>)</code></pre>
            <div className={styles.previewCodeFoot}><span><i /> Example preview</span><span>Readable Python&nbsp; ↗</span></div>
          </div>
          <div className={styles.previewCaption}>A visual idea, translated one step at a time.</div>
        </div>
        <div className={styles.heroBottom}><span>DESIGNED FOR YOUR FIRST STEPS IN PROGRAMMING</span><a href="#how-it-works">SCROLL TO LEARN&nbsp; ↓</a></div>
      </section>

      <section className={styles.valueBar} aria-label="MapToCode benefits">
        <span><i>01</i> Visual first</span><span><i>02</i> Python you can read</span><span><i>03</i> Private by default</span>
      </section>

      <section className={styles.howSection} id="how-it-works">
        <div className={styles.sectionIntro}>
          <div className={styles.eyebrow}>FROM FIRST IDEA TO FIRST PROGRAM</div>
          <h2>Logic you can see.<br /><em>Code you can follow.</em></h2>
          <p>Start with the shape of your idea. The diagram and Python preview sit together, so it’s easier to understand how they connect.</p>
          <Link className={styles.inlineLink} href="/workspace">Take a look inside the workspace <span>↗</span></Link>
        </div>
        <div className={styles.steps}>
          {blocks.map((block) => (
            <article className={styles.step} key={block.number}>
              <span className={styles.stepNumber}>{block.number}</span>
              <span className={styles.stepGlyph} aria-hidden="true">{block.number === "01" ? "⌁" : block.number === "02" ? "◇" : "{ }"}</span>
              <h3>{block.title}</h3>
              <p>{block.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.exampleSection} id="example">
        <div className={styles.exampleHeader}><div><div className={styles.eyebrow}>A SMALL PROGRAM, MADE VISIBLE</div><h2>Meet the age check.</h2></div><span>START&nbsp; → &nbsp;INPUT&nbsp; → &nbsp;DECISION&nbsp; → &nbsp;OUTPUT</span></div>
        <div className={styles.exampleCard}>
          <div className={styles.exampleCanvas}><div className={styles.exampleCanvasLabel}><span>FLOWCHART</span><span>6 BLOCKS</span></div><FlowchartDiagram /></div>
          <div className={styles.exampleDescription}><span className={styles.exampleIcon}>✳</span><div><h3>One familiar question.</h3><p>Ask for a person’s age, then show a different message depending on whether they’re 18 or older.</p><Link href="/workspace">Open this example <span>↗</span></Link></div></div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div><div className={styles.eyebrow}>YOUR IDEA CAN START HERE</div><h2>Make your first flowchart.</h2><p>Explore the age-check example in a workspace built for learning.</p></div>
        <Link className={styles.primaryButton} href="/workspace">Open Workspace <span>↗</span></Link>
      </section>

      <footer className={styles.footer}>
        <Link className={styles.brand} href="/"><span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>MapToCode</Link>
        <span>Make the logic visible.</span><span>LOCAL-FIRST&nbsp; · &nbsp;BUILT FOR LEARNING</span>
      </footer>
    </main>
  );
}
