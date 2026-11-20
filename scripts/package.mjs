import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const dist = new URL("../dist/", import.meta.url);
const archive = new URL("../margin-extension.zip", import.meta.url);
const files = Object.create(null);

async function addFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = prefix + entry.name;
    const url = new URL(path + (entry.isDirectory() ? "/" : ""), dist);
    if (entry.isDirectory()) await addFiles(url, path + "/");
    else if (entry.isFile()) files[path] = await readFile(url);
  }
}

await addFiles(dist);
if (!files["manifest.json"]) throw new Error("dist is missing manifest.json.");
await writeFile(archive, zipSync(files, { level: 6 }));
console.log(`Packaged ${Object.keys(files).length} files in ${fileURLToPath(archive)}`);
