// Theory sheet content: short, correct reminders for equations and polynomials.
// `check` is a concrete instance of the rule that the CAS verifies in the tests.
import type { Topic } from "./types";

export interface TheoryEntry {
  id: string;
  title: string;
  /** One or two sentences; `$...$` renders as math. */
  text: string;
  /** The formula or rule (KaTeX). */
  latex: string;
  /** Worked mini example (KaTeX). */
  example?: string;
  /** Concrete instance [before, after] that must be CAS-equivalent. */
  check?: [string, string];
}

export interface TheorySection {
  id: string;
  title: string;
  topic: Topic;
  entries: TheoryEntry[];
}

export const THEORY: TheorySection[] = [
  {
    id: "lineales",
    title: "Ecuaciones lineales",
    topic: "lineal",
    entries: [
      {
        id: "pasaje",
        title: "Pasaje de términos",
        text: "Lo que suma en un miembro pasa restando al otro, y lo que resta pasa sumando. En realidad hacés lo mismo en los dos miembros: la igualdad se mantiene.",
        latex: "x+a=b\\;\\Rightarrow\\;x=b-a",
        example: "2x+3=7\\;\\Rightarrow\\;2x=7-3\\;\\Rightarrow\\;2x=4",
        check: ["2x+3=7", "2x=4"],
      },
      {
        id: "inversas",
        title: "Operaciones inversas",
        text: "Lo que multiplica pasa dividiendo (y al revés). Nunca se puede dividir por 0.",
        latex: "a\\,x=b\\;\\Rightarrow\\;x=\\frac{b}{a}\\quad(a\\neq 0)",
        example: "2x=4\\;\\Rightarrow\\;x=\\frac{4}{2}=2",
        check: ["2x=4", "x=2"],
      },
      {
        id: "distributiva",
        title: "Distributiva primero",
        text: "Si hay paréntesis, distribuí antes de pasar términos: el número de afuera multiplica a cada término de adentro.",
        latex: "a\\,(b+c)=ab+ac",
        example: "3(x-2)=x+4\\;\\Rightarrow\\;3x-6=x+4",
        check: ["3(x-2)=x+4", "3x-6=x+4"],
      },
    ],
  },
  {
    id: "cuadraticas",
    title: "Cuadráticas",
    topic: "cuadratica",
    entries: [
      {
        id: "forma-general",
        title: "Forma general",
        text: "Antes de usar la resolvente, pasá todo a un miembro e igualá a 0. Así leés $a$, $b$ y $c$ con sus signos.",
        latex: "ax^{2}+bx+c=0\\qquad(a\\neq 0)",
        example: "2x^{2}-3=x\\;\\Rightarrow\\;2x^{2}-x-3=0",
        check: ["2x^2-3=x", "2x^2-x-3=0"],
      },
      {
        id: "resolvente",
        title: "Fórmula resolvente",
        text: "Da las raíces de cualquier cuadrática. El $\\pm$ produce las dos soluciones: una con $+$ y otra con $-$.",
        latex: "x_{1,2}=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}",
        example: "x^{2}-5x+6=0:\\ x=\\frac{5\\pm\\sqrt{25-24}}{2}=\\frac{5\\pm1}{2}",
        check: ["x^2-5x+6=0", "x=2,\\ x=3"],
      },
      {
        id: "discriminante",
        title: "Discriminante",
        text: "Lo de adentro de la raíz decide cuántas raíces reales hay, sin terminar la cuenta.",
        latex: "\\Delta=b^{2}-4ac:\\quad \\Delta>0\\ \\text{dos raíces},\\ \\Delta=0\\ \\text{una doble},\\ \\Delta<0\\ \\text{ninguna real}",
        example: "x^{2}-6x+9=0:\\ \\Delta=36-36=0\\ \\Rightarrow\\ x=3\\ \\text{(doble)}",
        check: ["x^2-6x+9=0", "x=3"],
      },
      {
        id: "forma-factorizada",
        title: "Forma factorizada",
        text: "Si conocés las raíces, el polinomio se escribe como producto. No te olvides del coeficiente principal $a$.",
        latex: "ax^{2}+bx+c=a\\,(x-x_{1})(x-x_{2})",
        example: "2x^{2}-3x-2=2\\,(x-2)\\left(x+\\tfrac{1}{2}\\right)",
        check: ["2x^2-3x-2", "2(x-2)(x+\\frac{1}{2})"],
      },
      {
        id: "vieta",
        title: "Suma y producto de raíces",
        text: "Sirve para controlar el resultado o para encontrar raíces mentalmente: dos números que sumen $-\\frac{b}{a}$ y multipliquen $\\frac{c}{a}$.",
        latex: "x_{1}+x_{2}=-\\frac{b}{a}\\qquad x_{1}\\cdot x_{2}=\\frac{c}{a}",
        example: "x^{2}-5x+6:\\ 2+3=5,\\ 2\\cdot3=6",
        check: ["x^2-5x+6", "(x-2)(x-3)"],
      },
    ],
  },
  {
    id: "productos",
    title: "Productos notables",
    topic: "operaciones",
    entries: [
      {
        id: "cuadrado-binomio",
        title: "Cuadrado de un binomio",
        text: "No es la suma de los cuadrados: falta el doble producto.",
        latex: "(a\\pm b)^{2}=a^{2}\\pm 2ab+b^{2}",
        example: "(x+3)^{2}=x^{2}+6x+9",
        check: ["(x+3)^2", "x^2+6x+9"],
      },
      {
        id: "producto-conjugados",
        title: "Diferencia de cuadrados (suma por diferencia)",
        text: "La suma por la diferencia de los mismos términos da la diferencia de sus cuadrados: los términos del medio se cancelan.",
        latex: "(a+b)(a-b)=a^{2}-b^{2}",
        example: "(x+5)(x-5)=x^{2}-25",
        check: ["(x+5)(x-5)", "x^2-25"],
      },
      {
        id: "cubo-binomio",
        title: "Cubo de un binomio",
        text: "Los coeficientes son 1, 3, 3, 1 (fila del triángulo de Pascal).",
        latex: "(a+b)^{3}=a^{3}+3a^{2}b+3ab^{2}+b^{3}",
        example: "(x+2)^{3}=x^{3}+6x^{2}+12x+8",
        check: ["(x+2)^3", "x^3+6x^2+12x+8"],
      },
    ],
  },
  {
    id: "factoreo",
    title: "Casos de factoreo",
    topic: "factorizar",
    entries: [
      {
        id: "factor-comun",
        title: "Factor común",
        text: "Primer paso de toda factorización: sacá lo que se repite en todos los términos (número y letra con el menor exponente).",
        latex: "ax+ay=a\\,(x+y)",
        example: "3x^{2}+6x=3x\\,(x+2)",
        check: ["3x^2+6x", "3x(x+2)"],
      },
      {
        id: "grupos",
        title: "Factor común por grupos",
        text: "Agrupá de a dos términos, sacá factor común en cada grupo y después sacá el paréntesis que se repite.",
        latex: "ax+ay+bx+by=(a+b)(x+y)",
        example: "x^{3}+2x^{2}+3x+6=x^{2}(x+2)+3(x+2)=(x+2)(x^{2}+3)",
        check: ["x^3+2x^2+3x+6", "(x+2)(x^2+3)"],
      },
      {
        id: "tcp",
        title: "Trinomio cuadrado perfecto",
        text: "Dos términos son cuadrados y el otro es el doble producto de sus bases: es el cuadrado de un binomio al revés.",
        latex: "a^{2}\\pm 2ab+b^{2}=(a\\pm b)^{2}",
        example: "x^{2}-10x+25=(x-5)^{2}",
        check: ["x^2-10x+25", "(x-5)^2"],
      },
      {
        id: "dif-cuadrados",
        title: "Diferencia de cuadrados",
        text: "Una resta de dos cuadrados se factoriza como suma por diferencia de sus bases.",
        latex: "a^{2}-b^{2}=(a+b)(a-b)",
        example: "4x^{2}-9=(2x+3)(2x-3)",
        check: ["4x^2-9", "(2x+3)(2x-3)"],
      },
      {
        id: "gauss",
        title: "Gauss (raíces racionales)",
        text: "Si un polinomio con coeficientes enteros tiene raíces racionales $\\frac{p}{q}$, $p$ divide al término independiente y $q$ al coeficiente principal. Probás candidatos y dividís por Ruffini.",
        latex: "\\frac{p}{q}\\ \\text{con}\\ p\\mid a_{0},\\ q\\mid a_{n}",
        example: "x^{3}-7x+6:\\ \\pm1,\\pm2,\\pm3,\\pm6;\\ P(2)=0\\Rightarrow(x-2)\\mid P",
        check: ["x^3-7x+6", "(x-2)(x^2+2x-3)"],
      },
    ],
  },
  {
    id: "division",
    title: "División de polinomios",
    topic: "division",
    entries: [
      {
        id: "algoritmo",
        title: "Dividendo = divisor · cociente + resto",
        text: "Toda división cumple esta igualdad; el resto tiene grado menor que el divisor. Sirve para verificar la cuenta.",
        latex: "P(x)=D(x)\\cdot C(x)+R(x)",
        example: "x^{3}-7x+6=(x+2)(x^{2}-2x-3)+12",
        check: ["x^3-7x+6", "(x+2)(x^2-2x-3)+12"],
      },
      {
        id: "ruffini",
        title: "Regla de Ruffini",
        text: "Para dividir por $(x-a)$: escribí todos los coeficientes (0 si falta un término), bajá el primero, multiplicá por $a$, sumá la columna y repetí. El último número es el resto.",
        latex: "\\begin{array}{c|cccc} & 1 & 0 & -7 & 6\\\\ -2 & & -2 & 4 & 6\\\\ \\hline & 1 & -2 & -3 & \\boxed{12}\\end{array}",
        example: "C(x)=x^{2}-2x-3,\\quad R=12",
      },
      {
        id: "teorema-resto",
        title: "Teorema del resto",
        text: "El resto de dividir $P(x)$ por $(x-a)$ es $P(a)$. Si da 0, $a$ es raíz y $(x-a)$ es factor.",
        latex: "R=P(a)",
        example: "P(x)=x^{3}-7x+6:\\ P(-2)=-8+14+6=12",
      },
      {
        id: "grado-cociente",
        title: "Grado del cociente",
        text: "Al dividir por un polinomio de grado 1, el cociente tiene un grado menos que el dividendo.",
        latex: "\\operatorname{gr}(C)=\\operatorname{gr}(P)-\\operatorname{gr}(D)",
        example: "\\operatorname{gr}(x^{3}-7x+6)=3\\Rightarrow\\operatorname{gr}(C)=2",
      },
    ],
  },
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Entries whose title, text or section contain every word of the query (accent-insensitive). */
export function searchTheory(query: string): (TheoryEntry & { section: string })[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return THEORY.flatMap((s) =>
    s.entries
      .filter((e) => {
        const hay = norm(`${s.title} ${e.title} ${e.text}`);
        return words.every((w) => hay.includes(w));
      })
      .map((e) => ({ ...e, section: s.id })),
  );
}
