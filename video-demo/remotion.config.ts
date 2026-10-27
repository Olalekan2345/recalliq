import { Config } from "@remotion/cli/config";

// Recordings, narration, music and brand art live in ./assets (served as static files).
Config.setPublicDir("./assets");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
