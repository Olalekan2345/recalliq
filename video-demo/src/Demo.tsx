import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import cues from "./cues.json";
import timeline from "./timeline.json";
import { Architecture, EndCard, LogoIntro } from "./components/Brand";
import { Footage, type Box, type Cam } from "./components/Footage";
import { Captions, Note, SectionTitle, SourceTag, TimeLapse, type SourceKind } from "./components/Overlays";
import { FPS, sec } from "./theme";

/*
 * Edit decision list. Every Shot is a window of a genuine screen recording
 * (assets/captures, made by scripts/capture.mjs). `from` and `rate` are chosen
 * from the measured motion map (scripts/motion-map.mjs) so each highlight box
 * appears only while the element it frames is on screen and is named by the
 * narration. Box and camera coordinates are recording pixels (1920×1080).
 */

const TOTAL = timeline.total;

function Shot({
  start,
  end,
  clip,
  from,
  rate = 1,
  cams,
  boxes,
  tag,
  tagFrom = 0,
  timelapse,
  fade = 0.3,
  children,
}: {
  start: number;
  end: number;
  clip: string;
  from: number;
  rate?: number;
  cams?: Cam[];
  boxes?: Box[];
  tag: { kind: SourceKind; text: string };
  /** Hold the source tag back while a section title occupies the top of the frame. */
  tagFrom?: number;
  timelapse?: boolean;
  fade?: number;
  children?: React.ReactNode;
}) {
  return (
    <Sequence from={sec(start)} durationInFrames={sec(end - start)}>
      <FadeIn seconds={fade}>
        <Footage clip={clip} from={from} rate={rate} cams={cams} boxes={boxes} />
        <Sequence from={sec(tagFrom)}>
          <SourceTag kind={tag.kind} text={tag.text} until={end - start - tagFrom} />
        </Sequence>
        {timelapse && <TimeLapse from={0.1} to={end - start} />}
        {children}
      </FadeIn>
    </Sequence>
  );
}

function FadeIn({ seconds, children }: { seconds: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const o = seconds > 0 ? interpolate(frame / FPS, [0, seconds], [0, 1], { extrapolateRight: "clamp" }) : 1;
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

const TITLE_SECONDS = 3.6;
function Section({ at, n, title, sub }: { at: number; n: number; title: string; sub: string }) {
  return (
    <Sequence from={sec(at)} durationInFrames={sec(TITLE_SECONDS)}>
      <SectionTitle n={n} title={title} sub={sub} until={TITLE_SECONDS} />
    </Sequence>
  );
}

const T = TITLE_SECONDS; // tag delay for shots that open a section
const REC_LIVE = { kind: "recorded" as const, text: "Real run · recorded 26 Oct 2026 · local instance · live Sui Mainnet + Walrus Mainnet" };
const REC_A = { kind: "recorded" as const, text: "Earlier session · recorded 23 Oct 2026 · Sui Mainnet" };
const REC_B = { kind: "recorded" as const, text: "Later session · 23 Oct 2026 · a different question" };
const SITE = { kind: "live" as const, text: "Public deployment · recalliq-seven.vercel.app" };

export function Demo() {
  return (
    <AbsoluteFill style={{ backgroundColor: "#f8fbff" }}>
      {/* ── 1 · Hook (0–14.4) ───────────────────────────────────── */}
      <Sequence durationInFrames={sec(4.2)}>
        <LogoIntro />
      </Sequence>
      <Shot
        start={3.9}
        end={7.9}
        clip="run-a"
        from={11.2}
        rate={0.85}
        tag={{ kind: "recorded", text: "Real record · a claim the chain contradicted" }}
        cams={[{ at: 0, scale: 1.2, x: 720, y: 520 }]}
        boxes={[{ from: 0.5, to: 4.0, x: 456, y: 534, w: 330, h: 72 }]}
      />
      <Shot
        start={7.8}
        end={11.0}
        clip="live-memory"
        from={10.25}
        rate={0.9}
        tag={{ kind: "recorded", text: "Real record · that lesson, recalled from Walrus days later" }}
        cams={[{ at: 0, scale: 1.2, x: 1630, y: 640 }]}
        boxes={[{ from: 0.4, to: 3.2, x: 1404, y: 548, w: 452, h: 196 }]}
      />
      <Shot
        start={10.9}
        end={14.5}
        clip="lesson"
        from={12.8}
        tag={{ kind: "recorded", text: "Real record · the decision it changed" }}
        cams={[{ at: 0, scale: 1.2, x: 1590, y: 560 }]}
        boxes={[{ from: 0.5, to: 3.6, x: 1410, y: 624, w: 420, h: 112 }]}
      />

      {/* ── 2 · What we built (14.4–28.1) ───────────────────────── */}
      <Shot start={14.4} end={22.5} clip="prod-home" from={0} tag={SITE} />
      <Shot
        start={22.4}
        end={28.1}
        clip="prod-status"
        from={0}
        rate={0.9}
        tag={{ kind: "live", text: "Public deployment · live integration health" }}
        boxes={[
          { from: 0.3, to: 5.7, x: 1084, y: 628, w: 616, h: 134 },
          { from: 1.4, to: 5.7, x: 1084, y: 491, w: 616, h: 134 },
        ]}
      />

      {/* ── 3 · A new investigation (28.0–61.7) ─────────────────── */}
      <Shot start={28.0} end={33.5} clip="live-run" from={6.0} rate={2.6} tag={REC_LIVE} tagFrom={T} timelapse />
      <Shot
        start={33.4}
        end={39.6}
        clip="live-run"
        from={31.0}
        rate={3}
        tag={REC_LIVE}
        timelapse
        fade={0}
        boxes={[
          { from: 1.5, to: 6.2, x: 430, y: 622, w: 360, h: 62 },
          { from: 2.4, to: 6.2, x: 430, y: 762, w: 430, h: 62 },
        ]}
      />
      <Shot start={39.5} end={47.5} clip="live-run" from={50} rate={12} tag={REC_LIVE} timelapse fade={0} />
      <Shot
        start={47.4}
        end={53.3}
        clip="live-run"
        from={151}
        tag={REC_LIVE}
        fade={0}
        boxes={[{ from: 3.1, to: 5.9, x: 430, y: 44, w: 890, h: 365 }]}
      />
      <Shot
        start={53.2}
        end={55.2}
        clip="live-result"
        from={4.9}
        tag={{ kind: "recorded", text: "Same run · completed · every claim re-checked" }}
        boxes={[{ from: 0.2, to: 2.0, x: 424, y: 156, w: 112, h: 42 }]}
      />
      <Shot
        start={55.1}
        end={58.6}
        clip="live-memory"
        from={5.1}
        tag={{ kind: "recorded", text: "Same run · Memory tab" }}
        cams={[{ at: 0, scale: 1.2, x: 1630, y: 420 }]}
        boxes={[
          { from: 0.4, to: 3.5, x: 1404, y: 392, w: 440, h: 40 },
          { from: 1.4, to: 3.5, x: 1404, y: 434, w: 440, h: 50 },
          { from: 2.0, to: 3.5, x: 1404, y: 664, w: 440, h: 50 },
        ]}
      />
      <Shot
        start={58.5}
        end={61.7}
        clip="live-memory"
        from={10.2}
        rate={0.95}
        tag={{ kind: "recorded", text: "Same run · each lesson recalled from a Walrus blob" }}
        cams={[{ at: 0, scale: 1.2, x: 1630, y: 590 }]}
        boxes={[
          { from: 0.2, to: 3.2, x: 1404, y: 228, w: 440, h: 50 },
          { from: 0.6, to: 3.2, x: 1404, y: 436, w: 440, h: 50 },
          { from: 1.0, to: 3.2, x: 1404, y: 664, w: 440, h: 50 },
        ]}
      />
      <Section at={28.0} n={1} title="A new investigation" sub="Memory, tool choice and verification, as they happen" />

      {/* ── 4 · Where that lesson came from (61.6–91.5) ─────────── */}
      <Shot
        start={61.6}
        end={64.4}
        clip="live-memory"
        from={10.4}
        tag={{ kind: "recorded", text: "Same run · Memory tab" }}
        tagFrom={T}
        cams={[{ at: 0, scale: 1.2, x: 1630, y: 640 }]}
        boxes={[{ from: 0.9, to: 2.8, x: 1404, y: 548, w: 452, h: 196 }]}
      />
      <Shot start={64.3} end={67.6} clip="run-a" from={0} tag={REC_A} />
      <Shot
        start={67.5}
        end={72.0}
        clip="run-a"
        from={11.2}
        rate={0.75}
        tag={REC_A}
        cams={[{ at: 0, scale: 1.2, x: 830, y: 480 }]}
        boxes={[
          { from: 0.1, to: 2.6, x: 446, y: 346, w: 780, h: 150 },
          { from: 2.4, to: 4.5, x: 456, y: 534, w: 330, h: 72 },
        ]}
      />
      <Shot
        start={71.9}
        end={80.9}
        clip="run-a"
        from={16.6}
        rate={0.6}
        tag={REC_A}
        cams={[{ at: 0, scale: 1.2, x: 900, y: 420 }]}
        boxes={[
          { from: 0.3, to: 9.0, x: 470, y: 410, w: 300, h: 52 },
          { from: 5.2, to: 9.0, x: 470, y: 548, w: 890, h: 84 },
        ]}
      />
      <Shot
        start={80.8}
        end={84.6}
        clip="lesson"
        from={0.3}
        tag={{ kind: "recorded", text: "Memory Vault · the lesson the autopsy wrote" }}
        cams={[{ at: 0, scale: 1.15, x: 1150, y: 500 }]}
        boxes={[{ from: 0.8, to: 3.8, x: 1366, y: 380, w: 450, h: 96 }]}
      />
      <Shot
        start={84.5}
        end={86.9}
        clip="lesson"
        from={4.0}
        tag={{ kind: "recorded", text: "Memory Vault · exact text stored on Walrus" }}
        cams={[{ at: 0, scale: 1.2, x: 860, y: 680 }]}
        boxes={[{ from: 0.1, to: 2.4, x: 420, y: 520, w: 880, h: 420 }]}
      />
      <Shot
        start={86.8}
        end={91.5}
        clip="walruscan"
        from={1.9}
        tag={{ kind: "external", text: "walruscan.com · independent Walrus Mainnet explorer" }}
        boxes={[
          { from: 0.4, to: 4.7, x: 70, y: 262, w: 1090, h: 66 },
          { from: 1.6, to: 4.7, x: 84, y: 404, w: 1740, h: 72 },
        ]}
      />
      <Section at={61.6} n={2} title="Where that lesson came from" sub="A real mistake, diagnosed and written to Walrus" />

      {/* ── 5 · The lesson changes behaviour (91.4–111.5) ───────── */}
      <Shot start={91.4} end={94.6} clip="run-b" from={0} rate={0.8} tag={REC_B} tagFrom={T} />
      <Shot
        start={94.5}
        end={99.8}
        clip="run-b"
        from={4.4}
        rate={0.53}
        tag={REC_B}
        cams={[{ at: 0, scale: 1.2, x: 760, y: 420 }]}
        boxes={[{ from: 0.2, to: 5.3, x: 436, y: 288, w: 356, h: 60 }]}
      />
      <Shot
        start={99.7}
        end={103.4}
        clip="run-b"
        from={8.8}
        rate={0.55}
        tag={REC_B}
        cams={[{ at: 0, scale: 1.2, x: 760, y: 420 }]}
        boxes={[{ from: 0.1, to: 3.7, x: 476, y: 346, w: 640, h: 50 }]}
      />
      <Shot
        start={103.3}
        end={106.0}
        clip="lesson"
        from={12.8}
        tag={{ kind: "recorded", text: "Recorded effect · from the lesson's influence trace" }}
        cams={[{ at: 0, scale: 1.2, x: 1590, y: 520 }]}
        boxes={[{ from: 0.2, to: 2.7, x: 1410, y: 624, w: 420, h: 112 }]}
      />
      <Shot
        start={105.9}
        end={109.4}
        clip="run-b"
        from={10.4}
        rate={0.5}
        tag={REC_B}
        cams={[{ at: 0, scale: 1.08, x: 900, y: 1000 }]}
        boxes={[{ from: 0.2, to: 3.5, x: 440, y: 550, w: 910, h: 420 }]}
      />
      <Shot
        start={109.3}
        end={111.5}
        clip="lesson"
        from={15.0}
        rate={0.7}
        tag={{ kind: "recorded", text: "The lesson's trace · 5 later sessions retrieved it" }}
        cams={[{ at: 0, scale: 1.2, x: 1590, y: 400 }]}
        boxes={[
          { from: 0.1, to: 2.2, x: 1410, y: 166, w: 420, h: 50 },
          { from: 0.6, to: 2.2, x: 1410, y: 250, w: 420, h: 340 },
        ]}
      />
      <Section at={91.4} n={3} title="The lesson changes behaviour" sub="Recalled from Walrus and enforced as a policy" />

      {/* ── 6 · WorthIt and payments (111.4–134.6) ──────────────── */}
      <Shot
        start={111.4}
        end={117.6}
        clip="tools"
        from={0.3}
        rate={1.6}
        tag={{ kind: "recorded", text: "Tool Intelligence · reliability measured on real runs" }}
        tagFrom={T}
        boxes={[{ from: 4.1, to: 6.2, x: 430, y: 730, w: 670, h: 126 }]}
      />
      <Shot
        start={117.5}
        end={121.9}
        clip="tools"
        from={6.8}
        rate={0.75}
        tag={{ kind: "recorded", text: "Tool Intelligence · the paid specialist and its real price" }}
        cams={[{ at: 0, scale: 1.2, x: 1500, y: 700 }]}
        boxes={[
          { from: 0.2, to: 4.4, x: 1140, y: 514, w: 716, h: 412 },
          { from: 1.4, to: 4.4, x: 1410, y: 658, w: 214, h: 46 },
        ]}
      />
      <Shot
        start={121.8}
        end={125.1}
        clip="live-memory"
        from={18.6}
        tag={{ kind: "recorded", text: "The new investigation's WorthIt decision" }}
        cams={[{ at: 0, scale: 1.2, x: 1630, y: 560 }]}
        boxes={[{ from: 0.2, to: 3.3, x: 1400, y: 494, w: 458, h: 100 }]}
      />
      <Shot
        start={125.0}
        end={134.6}
        clip="payments"
        from={0.3}
        rate={0.96}
        tag={{ kind: "recorded", text: "Payment Center · x402 on Sui" }}
        boxes={[
          { from: 0.3, to: 9.6, x: 1400, y: 456, w: 430, h: 66 },
          { from: 3.4, to: 9.6, x: 396, y: 238, w: 820, h: 42 },
        ]}
      >
        <Note text="The x402 payment flow is implemented and tested · no paid call was made for this video" from={0.6} to={9.6} />
      </Shot>
      <Section at={111.4} n={4} title="WorthIt: is it worth paying for?" sub="Free Tatum tools first · paid only when it adds value" />

      {/* ── 7 · Learning Lab, architecture, close (134.5–157) ───── */}
      <Shot
        start={134.5}
        end={140.7}
        clip="learning"
        from={1.0}
        rate={1.25}
        tag={{ kind: "recorded", text: "Learning Lab · real records only" }}
        tagFrom={T}
        boxes={[{ from: 3.8, to: 6.2, x: 1150, y: 316, w: 700, h: 100 }]}
      />
      <Section at={134.5} n={5} title="Learning Lab" sub="Every lesson traced from failure to decision" />
      <Sequence from={sec(140.6)} durationInFrames={sec(7.0)}>
        <FadeIn seconds={0.4}>
          <Architecture />
        </FadeIn>
      </Sequence>
      <Sequence from={sec(147.5)} durationInFrames={sec(TOTAL - 147.5)}>
        <FadeIn seconds={0.5}>
          <EndCard />
        </FadeIn>
      </Sequence>

      {/* Sound: narration and ducked music, mixed sample-accurately by scripts/mix-audio.mjs. */}
      <Audio src={staticFile("audio/soundtrack.wav")} />

      <Captions cues={cues} />
    </AbsoluteFill>
  );
}
