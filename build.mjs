import { build } from "esbuild";
import { copyFile, cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, "dist");
const pages = ["sidepanel", "popup", "review", "options", "library"];

const config = await readFile(join(root, "firebase.config.local.json"), "utf8").then(JSON.parse, (error) => {
  if (error.code === "ENOENT") return {};
  throw error;
});
if (!config || typeof config !== "object" || Array.isArray(config)) {
  throw new Error("firebase.config.local.json must contain a Firebase web config object.");
}
const firebaseConfig = Object.fromEntries(
  ["apiKey", "appId", "projectId", "authDomain", "databaseURL", "storageBucket", "messagingSenderId", "measurementId"]
    .filter((key) => typeof config[key] === "string")
    .map((key) => [key, config[key]]),
);


await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await Promise.all([
  build({
    absWorkingDir: root,
    entryPoints: {
      background: "src/background.ts",
      ...Object.fromEntries(pages.map((page) => [page, `src/ui/${page}.ts`])),
    },
    outdir: output,
    bundle: true,
    splitting: true,
    alias: {
      "sql.js": "sql.js/dist/sql-wasm-browser.js",
    },
    format: "esm",
    platform: "browser",
    target: "chrome116",
    define: {
      __MARGIN_MOCK__: JSON.stringify(process.env.MOCK === "1"),
      __MARGIN_FIREBASE_CONFIG__: JSON.stringify(firebaseConfig),
    },
    logLevel: "info",
  }),
  ...[
    ["manifest.json", "manifest.json"],
    ["LICENSE", "LICENSE"],
    ["src/ui/styles.css", "styles.css"],
    ...pages.map((page) => [`src/ui/${page}.html`, `${page}.html`]),
    ["node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
    ["node_modules/sql.js/dist/sql-wasm-browser.wasm", "sql-wasm-browser.wasm"],
  ].map(([source, destination]) => copyFile(join(root, source), join(output, destination))),
  copyFile(join(root, "assets/icon.svg"), join(output, "icon.svg")),
  ...["cmaps", "standard_fonts"].map((directory) =>
    cp(join(root, "node_modules/pdfjs-dist", directory), join(output, directory), { recursive: true })),
  mkdir(join(output, "icons"), { recursive: true }).then(() =>
    Promise.all([16, 32, 48, 128, 512].map((size) =>
      copyFile(join(root, `assets/icon-${size}.png`), join(output, `icons/icon-${size}.png`))))),
]);

const scripts = (await readdir(output)).filter((file) => file.endsWith(".js"));
const bundles = await Promise.all(scripts.map((file) => readFile(join(output, file), "utf8")));
const calls = {
  getGenerativeModel: /(?:=|return)\s*getGenerativeModel(?:\d+)?\(/u,
  generateContent: /await model\.generateContent\(/u,
  initializeDeviceModel: /await model\.initializeDeviceModel\(/u,
};
for (const [name, call] of Object.entries(calls)) {
  if (!bundles.some((bundle) => call.test(bundle))) {
    throw new Error(`Firebase AI Logic call missing from dist/: ${name}`);
  }
}
