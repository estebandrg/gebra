import { describe, expect, test } from "bun:test";
import { listSkills, parseSkill, quoteTag, readSkill, pointedTag } from "../bin/gebra";

describe("skills", () => {
  test("parseSkill splits the frontmatter from the instructions", () => {
    const s = parseSkill("x", "---\nname: x\ntitle: Equis\ndescription: hace x\n---\n\n# Body\ntext\n");
    expect(s).toEqual({ name: "x", title: "Equis", description: "hace x", body: "# Body\ntext" });
  });

  test("a skill without frontmatter falls back to its name", () => {
    expect(parseSkill("y", "solo texto").title).toBe("y");
  });

  test("the didactics skill ships with the project", () => {
    expect(listSkills().map((s) => s.name)).toContain("didactica");
    const s = readSkill("didactica")!;
    expect(s.title).toBe("Didáctica");
    expect(s.body).toContain("Diagnose before explaining");
  });

  test("unknown or path-like names are refused", () => {
    expect(readSkill("nope")).toBeNull();
    expect(readSkill("../skills/didactica")).toBeNull();
  });
});

describe("quoteTag", () => {
  test("a quoted message becomes one line the monitor can carry", () => {
    expect(quoteTag({ from: "profe", text: "a\nb  c" })).toBe(' quote=PROFE:"a b c"');
    expect(quoteTag({ from: "me", text: "x" })).toBe(' quote=VOS:"x"');
    expect(quoteTag(undefined)).toBe("");
  });
});

describe("pointedTag fragment", () => {
  test("a marked fragment rides as equation + parts + marked", () => {
    const tag = pointedTag([{ text: "$x+4$", ids: ["m3"], equation: "5-\\frac{x+4}{0.5}", parts: ["x+4"], marked: "5-\\frac{«x+4»}{0.5}" }]);
    expect(tag).toContain('"equation":"5-\\\\frac{x+4}{0.5}"');
    expect(tag).toContain('"parts":["x+4"]');
    expect(tag).toContain('"marked":"5-\\\\frac{«x+4»}{0.5}"');
  });
  test("without parts the equation is not sent", () => {
    expect(pointedTag([{ text: "t", equation: "2x" }])).not.toContain("equation");
  });
});

describe("pointedTag detail", () => {
  test("the computed report of a zone rides on the same line, its lines joined with ¶", () => {
    const tag = pointedTag([{ text: "$2x=4$", ids: ["m1"], detail: "Zona: 1 elemento\n1. [m1] ecuación: $2x=4$" }]);
    expect(tag).not.toContain("\n");
    expect(tag).toContain('"detail":"Zona: 1 elemento ¶ 1. [m1] ecuación: $2x=4$"');
  });
});

describe("pointedTag", () => {
  test("the pointed things become one JSON token with their ids", () => {
    expect(pointedTag([{ text: "x $2x$\ny", ids: ["m1"] }, { text: "otra" }])).toBe(' selection=[{"text":"x $2x$ y","ids":["m1"]},{"text":"otra"}]');
    expect(pointedTag(undefined)).toBe("");
    expect(pointedTag([])).toBe("");
  });
});
