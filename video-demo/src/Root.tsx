import { Composition, Still } from "remotion";
import timeline from "./timeline.json";
import { Demo } from "./Demo";
import { Thumbnail } from "./Thumbnail";
import { FPS } from "./theme";

export function RemotionRoot() {
  return (
    <>
      <Composition id="RecallIQDemo" component={Demo} durationInFrames={Math.round(timeline.total * FPS)} fps={FPS} width={1920} height={1080} />
      <Still id="Thumbnail" component={Thumbnail} width={1920} height={1080} />
    </>
  );
}
