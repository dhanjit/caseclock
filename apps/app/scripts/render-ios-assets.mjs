// Renders public/icon-square.svg into the PNGs @capacitor/assets consumes.
// Run once per icon change: node scripts/render-ios-assets.mjs && pnpm exec capacitor-assets generate --ios
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const SRC = "public/icon-square.svg";
const BG = "#0b1120";
mkdirSync("assets", { recursive: true });

// App Store icon: 1024², opaque (Apple rejects alpha).
await sharp(SRC).resize(1024, 1024).flatten({ background: BG }).png().toFile("assets/icon-only.png");

// Splash: 2732² dark field with the logo centered (~20%).
const logo = await sharp(SRC).resize(560, 560).png().toBuffer();
const splash = sharp({ create: { width: 2732, height: 2732, channels: 4, background: BG } })
  .composite([{ input: logo, gravity: "center" }])
  .png();
await splash.clone().toFile("assets/splash.png");
await splash.clone().toFile("assets/splash-dark.png");
console.log("assets/: icon-only.png, splash.png, splash-dark.png rendered");
