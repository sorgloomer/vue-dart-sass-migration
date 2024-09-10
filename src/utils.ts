import * as html from "@vue/compiler-dom";
import { NodeTypes } from "@vue/compiler-dom";
import * as _ from "lodash";
import * as child_process from "node:child_process";

export function getAttributes(node: html.ElementNode): Map<string, string | undefined> {
  return new Map(node.props
    .filter(prop => prop.type === NodeTypes.ATTRIBUTE)
    .map(prop => [prop.name, prop.value?.content])
  );
}

export type StyleSection = {
  content: string;
  tag: string;
  props: Map<string, string | undefined>;
  contentStart: number;
  contentEnd: number;
  index: number;
}

export function parseStyleElements(source: string): StyleSection[] {
  const result: StyleSection[] = [];
  const node = html.parse(source);
  for (let index = 0; index < node.children.length; index++) {
    const section = node.children[index];
    if (section.type === NodeTypes.ELEMENT) {
      const props = getAttributes(section);
      if (section.tag === "style") {
        if (section.children.length >= 1) {
          if (section.children.length > 1) {
            throw new Error("unexpected multiple children of style element");
          }
          const content = section.children[0];
          if (content.type !== NodeTypes.TEXT) {
            throw new Error("expected text node as style element child");
          }
          result.push({
            content: content.content,
            contentStart: content.loc.start.offset,
            contentEnd: content.loc.end.offset,
            tag: section.tag,
            index,
            props: props,
          });
        }
      }
    }
  }
  return result;
}

export function replaceMany(original: string, replacements: Replacement[]): string {
  const sorted = _.sortBy(replacements, x => x.start);
  let result = "";
  let cursor = 0;
  for (const r of sorted) {
    if (r.start < cursor) {
      throw new Error("replacements overlap");
    }
    result += original.substring(cursor, r.start) + r.text;
    cursor = r.end;
  }
  return result + original.substring(cursor);
}

export type Replacement = {
  start: number;
  end: number;
  text: string;
}

export function defined<T>(value: T | null | undefined): T {
  if (value == null) {
    throw new TypeError("expected defined");
  }
  return value;
}

export async function run(command: string[]) {
  const [arg0, ...args] = command;
  const process = child_process.spawn(arg0, args, {
    stdio: "inherit",
    shell: true,
  });
  await new Promise<void>((resolve, reject) => {
    const handleClose = (code: number | null) => {
      if (code !== 0) {
        reject(new ProcessExitCodeError(code ?? 0));
      } else {
        resolve();
      }
    };
    process.on("exit", code => handleClose(code));
    process.on("close", code => handleClose(code));
  });
}

export class ProcessExitCodeError extends Error {
  constructor(public readonly exitCode: number) {
    super(`Process exited with code ${exitCode}`);
  }
}

export function contains<T>(items: T[], predicate: (item: T) => boolean): boolean {
  for (const item of items) {
    if (predicate(item)) {
      return true;
    }
  }
  return false;
}

export function parseIntArg(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  return Number(BigInt(value));
}
