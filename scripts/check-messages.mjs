// Translation key checker.
//
// Builds a map of which namespace each component/module resolves its `t`
// against, then verifies every t("...") key exists in BOTH locale files.
//
// Run: node scripts/check-messages.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const MESSAGES = join(ROOT, "messages");

/** Recursively collect .ts/.tsx files under src/. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * Determine the namespace a file's `t` refers to:
 *  - useTranslations("X") / getTranslations({..., namespace: "X"}) -> X
 *  - a `t` received as a prop is namespaced by the CALLER, so we resolve
 *    that via the explicit PROP_NAMESPACE map below.
 */
const PROP_NAMESPACE = {
  // Components that receive `t` as a prop, and the namespace callers pass.
  "components/UploadArea/index.tsx": "CropPage|HomePage",
  "components/ConversionControls/index.tsx": "HomePage",
  "components/ImagePreview/index.tsx": "HomePage",
  "components/CropEditor/index.tsx": "CropPage",
  "components/Header/index.tsx": "Nav",
};

const locales = ["zh", "en"];
const messages = {};
for (const loc of locales) {
  messages[loc] = JSON.parse(readFileSync(join(MESSAGES, `${loc}.json`), "utf8"));
}

const hasKey = (obj, namespace, key) => {
  const ns = obj[namespace];
  return Boolean(ns && Object.prototype.hasOwnProperty.call(ns, key));
};

const problems = [];
const tKeyRe = /\bt\(\s*"([^"$`]+)"\s*\)/g;

for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split(sep).join("/");
  const code = readFileSync(file, "utf8");

  // Explicit namespace from useTranslations / getTranslations.
  let namespaces = [];
  const useRe = /(?:useTranslations|getTranslations)\(\s*"([^"]+)"/g;
  let m;
  while ((m = useRe.exec(code))) namespaces.push(m[1]);

  // Namespace passed into getTranslations({ namespace: "X" }).
  const nsOptRe = /namespace:\s*"([^"]+)"/g;
  while ((m = nsOptRe.exec(code))) namespaces.push(m[1]);

  if (namespaces.length === 0 && PROP_NAMESPACE[rel]) {
    namespaces = PROP_NAMESPACE[rel].split("|");
  }
  if (namespaces.length === 0) continue;

  let k;
  tKeyRe.lastIndex = 0;
  while ((k = tKeyRe.exec(code))) {
    const key = k[1];
    for (const ns of namespaces) {
      for (const loc of locales) {
        if (!hasKey(messages[loc], ns, key)) {
          problems.push(`${rel}: t("${key}") missing in ${loc}.json under "${ns}"`);
        }
      }
    }
  }
}

// Also flag namespace-level drift between locales.
for (const ns of new Set(Object.keys(messages.zh).concat(Object.keys(messages.en)))) {
  const zh = Object.keys(messages.zh[ns] ?? {});
  const en = Object.keys(messages.en[ns] ?? {});
  for (const key of zh) {
    if (!en.includes(key)) problems.push(`key "${ns}.${key}" exists in zh.json but not en.json`);
  }
  for (const key of en) {
    if (!zh.includes(key)) problems.push(`key "${ns}.${key}" exists in en.json but not zh.json`);
  }
}

if (problems.length) {
  console.error("Translation problems found:\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log("All translation keys resolve in both locales.");
