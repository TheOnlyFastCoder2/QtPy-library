type DeepObject = {
  string?: string;
  number?: number;
  boolean?: boolean;
  null?: null;
  undefined?: undefined;
  array?: any[];
  object?: DeepObject;
  date?: Date;
  symbol?: Symbol;
  bigint?: bigint;
  classInstance?: SampleClass;
  function?: Function;
  arrowFunction?: () => string;
  method?: () => void;
  nestedClassInstance?: NestedClass;
  map?: Map<string, any>;
  set?: Set<any>;
  weakMap?: WeakMap<object, any>;
  weakSet?: WeakSet<object>;
  promise?: Promise<any>;
  buffer?: Buffer;
  uint8Array?: Uint8Array;
  regexp?: RegExp;
  error?: Error;
  [key: string]: any;
};

type ExcludableTypes =
  | keyof Omit<DeepObject, "object" | "nestedClassInstance">
  | "class"
  | "function"
  | "method"
  | "map"
  | "set"
  | "weakMap"
  | "weakSet"
  | "promise"
  | "buffer"
  | "uint8Array"
  | "regexp"
  | "error"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "array"
  | "date"
  | "symbol"
  | "bigint";

type ExcludeBehavior = "exclude" | "include";

class SampleClass {
  id: number;
  name: string;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }

  greet() {
    return `Hello, ${this.name}!`;
  }
}

class NestedClass {
  value: string;
  children: NestedClass[];

  constructor(value: string, children: NestedClass[] = []) {
    this.value = value;
    this.children = children;
  }

  addChild(child: NestedClass) {
    this.children.push(child);
  }
}

export function generateDeepObject(
  depth: number = 3,
  excludeTypes: ExcludableTypes[] = [],
  excludeBehavior: ExcludeBehavior = "exclude"
): DeepObject {
  if (depth < 1) {
    throw new Error("Depth must be at least 1");
  }

  const shouldInclude = (type: ExcludableTypes) => {
    if (excludeBehavior === "include") {
      return excludeTypes.includes(type); // Инверсия: включаем только указанные
    }
    return !excludeTypes.includes(type); // Стандартное поведение: исключаем указанные
  };

  const obj: DeepObject = {};

  // Примитивы
  if (shouldInclude("string")) obj.string = `Depth ${depth}`;
  if (shouldInclude("number")) obj.number = Math.random() * 100;
  if (shouldInclude("boolean")) obj.boolean = Math.random() > 0.5;
  if (shouldInclude("null")) obj.null = null;
  if (shouldInclude("undefined")) obj.undefined = undefined;
  if (shouldInclude("array")) obj.array = [1, "two", false, { key: "value" }];
  if (shouldInclude("date")) obj.date = new Date();
  if (shouldInclude("symbol")) obj.symbol = Symbol(`symbol-depth-${depth}`);
  if (shouldInclude("bigint"))
    obj.bigint = BigInt(2) ** BigInt(100) + BigInt(depth);

  // Классы и функции
  if (shouldInclude("class") && shouldInclude("classInstance")) {
    obj.classInstance = new SampleClass(depth, `Instance-${depth}`);
  }
  if (shouldInclude("function")) {
    obj.function = function (a: number, b: number) {
      return a + b;
    };
  }
  if (shouldInclude("arrowFunction")) {
    obj.arrowFunction = () => `Arrow function at depth ${depth}`;
  }
  if (shouldInclude("method")) {
    obj.method = function () {
      console.log(`Method called at depth ${depth}`);
    };
  }

  // Коллекции
  if (shouldInclude("map")) {
    obj.map = new Map();
    obj.map.set("key1", "value1");
    obj.map.set("key2", 123);
    obj.map.set("key3", { nested: "object" });
  }
  if (shouldInclude("set")) {
    obj.set = new Set([1, "two", false, { key: "value" }]);
  }
  if (shouldInclude("weakMap")) {
    const keyObj = {};
    obj.weakMap = new WeakMap();
    obj.weakMap.set(keyObj, "weakly referenced value");
  }
  if (shouldInclude("weakSet")) {
    const objToAdd = {};
    obj.weakSet = new WeakSet();
    obj.weakSet.add(objToAdd);
  }

  // Другие сложные типы
  if (shouldInclude("promise")) {
    obj.promise = new Promise((resolve) =>
      setTimeout(() => resolve(`Resolved at depth ${depth}`), 100)
    );
  }
  if (shouldInclude("buffer") && typeof Buffer !== "undefined") {
    obj.buffer = Buffer.from("Hello World");
  }
  if (shouldInclude("uint8Array")) {
    obj.uint8Array = new Uint8Array([1, 2, 3, 4, 5]);
  }
  if (shouldInclude("regexp")) {
    obj.regexp = new RegExp(`depth-${depth}`, "gi");
  }
  if (shouldInclude("error")) {
    obj.error = new Error(`Sample error at depth ${depth}`);
  }

  // Рекурсивные структуры
  if (depth > 1) {
    if (shouldInclude("object")) {
      obj.object = generateDeepObject(depth - 1, excludeTypes, excludeBehavior);
    }
    if (shouldInclude("nestedClassInstance")) {
      obj.nestedClassInstance = new NestedClass("root", [
        new NestedClass("child1"),
        new NestedClass("child2", [new NestedClass("grandchild")]),
      ]);
    }
  }

  return obj;
}
