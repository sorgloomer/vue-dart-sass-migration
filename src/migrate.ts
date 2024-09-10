import { contains, defined, parseStyleElements, replaceMany, Replacement, run, StyleSection } from "./utils";
import postcss from "postcss";
import * as fs from "fs/promises";
import { UnreachableCaseError } from "./unreachable-case";
import parser from "postcss-selector-parser";
import * as glob from "glob";
import * as _ from "lodash";

export const DEFAULT_SASS_MIGRATOR_MAX_ENTRIES = 20;

export type VueFileMeta = {
  filename: string;
  chunks: {
    filename: string;
    lang: string;
    position: {
      start: number;
      end: number;
    };
  }[];
};

export class VueStyleMigrator {
  vueFiles: VueFileMeta[] = [];
  sassMigratorMaxEntries: number;


  public constructor(
    public directory: string,
    options?: { sassMigratorMaxEntries?: number }
  ) {
    this.sassMigratorMaxEntries = options?.sassMigratorMaxEntries ?? DEFAULT_SASS_MIGRATOR_MAX_ENTRIES;
  }

  async migrate() {
    this.vueFiles = [];
    try {
      const vueFiles = await glob.glob(`${this.directory}/**/*.vue`);
      for (const vueFile of vueFiles) {
        await this.extractVueFile(vueFile);
      }
      await this.processSassFiles();
      await this.writebackVue();
    } finally {
      this.info(`Cleanup started`);
      for (const vuemeta of this.vueFiles) {
        for (const chunk of vuemeta.chunks) {
          this.info(`Cleanup file ${chunk.filename}`);
          await fs.unlink(chunk.filename);
        }
      }
      this.info(`Cleanup finished`);
    }
  }

  private async writebackVue() {
    for (const vuemeta of this.vueFiles) {
      this.info(`Writeback ${vuemeta.filename}`);
      const input = await fs.readFile(vuemeta.filename, "utf8");
      const replacements: Replacement[] = [];
      for (const chunk of vuemeta.chunks) {
        const text = await fs.readFile(chunk.filename, "utf8");
        replacements.push({
          text,
          start: chunk.position.start,
          end: chunk.position.end,
        });
      }
      const output = replaceMany(input, replacements);
      await fs.writeFile(vuemeta.filename, output);
    }
  }

  async processSassFiles() {
    this.info("Running processSassFiles");
    const sassFiles = await glob.glob(`${this.directory}/**/*.{scss,sass}`);
    await this.processSelectors(sassFiles);
    await this.runSassMigrator(sassFiles);
  }

  private async processSelectors(sassFiles: string[]) {
    const processor = postcss([transformStyleAst]);
    for (const file of sassFiles) {
      this.info(`Running processDeepSelectors on ${file}`);
      const lang = /\.([^.]+)$/.exec(file)?.[1];
      assertStyleLang(lang);
      const source = await fs.readFile(file, "utf8");
      const result = await processor.process(
        source,
        {
          from: file,
          syntax: syntaxForLang(lang),
        }
      );
      await fs.writeFile(file, result.css);
    }
  }

  async runSassMigrator(sassFiles: string[]) {
    this.info(`Running sass-migrator started`);
    for (const chunk of _.chunk(sassFiles, this.sassMigratorMaxEntries)) {
      this.info(`Running sass-migrator division chunk`);
      for (const filename of chunk) {
        this.info(`  ${filename}`);
      }
      await run(["npx", "sass-migrator", "division", ...chunk]);
    }
    this.info("Running sass-migrator finished");
  }

  async extractVueFile(filename: string) {
    this.info(`Extract ${filename}`)
    const vuemeta = {
      filename,
      chunks: [],
    };
    this.vueFiles.push(vuemeta);
    await this.extractVue({
      source: await fs.readFile(filename, "utf8"),
      vuemeta,
    });
  }

  info(text: string) {
    console.log(`[i] ${text}`);
  }

  async extractVue({
    source,
    vuemeta,
  }: {
    source: string,
    vuemeta: VueFileMeta,
  }) {
    const styles = parseStyleElements(source);
    for (const node of styles) {
      if (node.tag === "style") {
        await this.extractVueStyle({ node, vuemeta });
      }
    }
  }

  async extractVueStyle({
    node,
    vuemeta,
  }: {
    node: StyleSection,
    vuemeta: VueFileMeta,
  }) {
    const lang = normalizeStyleLang(node.props.get("lang"));
    const filename = `${vuemeta.filename}.vue_sass_migrating.${node.index}.${lang}`;
    this.info(`  Extract ${filename}`);
    await fs.writeFile(filename, node.content);
    vuemeta.chunks.push({
      filename,
      lang,
      position: {
        start: node.contentStart,
        end: node.contentEnd,
      },
    });
  }
}

export function normalizeStyleLang(lang: string | undefined): StyleLang {
  switch (lang) {
    case undefined:
    case "css":
    case "scss":
    case "sass":
      return lang ?? "css";
  }
  throw new TypeError(`unknown lang: ${lang}`);
}

const styleLangs = ["css", "scss", "sass"] as const;
export type StyleLang = (typeof styleLangs)[number];

export function assertStyleLang(lang: string | undefined): asserts lang is StyleLang {
  if (!styleLangs.includes(lang as any)) {
    throw new TypeError(`expected StyleLang, got '${lang}'`);
  }
}

export function syntaxForLang(lang: StyleLang): postcss.Syntax | undefined {
  switch (lang) {
    case "sass":
      return require("postcss-sass");
    case "scss":
      return require("postcss-scss");
    case "css":
      return undefined;
    default:
      throw new UnreachableCaseError(lang);
  }
}

export const transformStyleAst: postcss.Plugin = {
  postcssPlugin: "migrate-vue2-deep",
  Rule(rule) {
    rule.selector = transformSelector(rule.selector, rule);
  }
};

type SelectorFixingAttemptResult = "original-valid" | "fixed" | "invalid-unfixable";

function attemptFixingPseudoSelectorNesting(
  parent: parser.Selector,
): SelectorFixingAttemptResult {
  const node = parent.last;
  if (node.type !== "pseudo") {
    return "original-valid";
  }
  if (node.value === ":deep") {
    return attemptFixingDeepSelectorNesting(node);
  }
  return "invalid-unfixable";
}
function attemptFixingDeepSelectorNesting(
  node: parser.Pseudo,
): SelectorFixingAttemptResult {
  if (node.nodes.length !== 1) {
    return "invalid-unfixable";
  }
  const parent = defined(node.parent);
  const index = parent.index(node);
  setNodes(parent, [
    ...parent.nodes.slice(0, index),
    newPseudoDeep(),
    newCombinatorDescendant(),
    ...node.nodes[0].nodes,
    ...parent.nodes.slice(index + 1),
  ]);
  return "fixed";
}

const newPseudoDeep = () => parser.pseudo({ value: ":deep" });
const newCombinatorDescendant = () => parser.combinator({ value: " " });

function removeNestedRulesWithNestingSelector(rule: postcss.Rule) {
  setNodes(rule, rule.nodes.filter(childNode => childNode.type !== "rule" || !hasConcatenatingNestingSelector(childNode)));
}

export function setNodes<
  P extends { nodes: T[] | undefined },
  T
>(parent: P, nodes: (T & { parent: P | undefined })[]) {
  parent.nodes = nodes;
  for (const node of nodes) {
    node.parent = parent;
  }
}

export function transformSelector(selector: string, rule: postcss.Rule): string {
  const hasConcatenatingChild = hasChildWithConcatenatingNestingSelector(rule);
  selector = parser(selectors => {
    selectors.walkCombinators(combinator => {
      if (["/deep/", ">>>"].includes(combinator.value)) {
        const parent = defined(combinator.parent);
        const index = parent.index(combinator);
        setNodes(parent, [
          ...parent.nodes.slice(0, index),
          ...(parent.first !== combinator ? [newPseudoDeep()] : []),
          newPseudoDeep(),
          ...(parent.last !== combinator ? [newCombinatorDescendant()] : []),
          ...parent.nodes.slice(index + 1),
        ]);
      }
    });
    if (hasConcatenatingChild) {
      let invalidNestingCount = 0;
      for (const parent of selectors.nodes) {
        const result = attemptFixingPseudoSelectorNesting(parent);
        if (result === "invalid-unfixable") {
          invalidNestingCount++;
        }
      }
      if (invalidNestingCount > 0 && invalidNestingCount < selectors.nodes.length) {
        throw new Error(`Some but not all selectors end on pseudo item, cannot fix automatically: ${selectors.toString()}`);
      }
      if (invalidNestingCount > 0) {
        removeNestedRulesWithNestingSelector(rule);
      }
    }
  }).processSync(selector, { lossless: true });
  return selector;
}

export function getNestedRules(node: postcss.Rule): postcss.Rule[] {
  const result: postcss.Rule[] = [];
  for (const child of node.nodes) {
    if (child.type === "rule") {
      result.push(child);
    }
  }
  return result;
}

export function hasChildWithConcatenatingNestingSelector(node: postcss.Rule) {
  return contains(getNestedRules(node), hasConcatenatingNestingSelector);
}

export function hasConcatenatingNestingSelector(rule: postcss.Rule) {
  let hasNesting = false;
  parser(selector => {
    selector.walkNesting(nesting => {
      if (nesting.next()?.type === "tag") {
        hasNesting = true;
      }
    });
  }).processSync(rule.selector);
  return hasNesting;
}
