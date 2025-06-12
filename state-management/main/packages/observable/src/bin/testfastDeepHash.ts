function safeStringify(obj: any): string {
  const seen = new WeakSet();

  return JSON.stringify(obj, function replacer(key, value) {
    const t = typeof value;

    if (t === "function") return "__func__";
    if (t === "symbol") return `__sym__:${value.description}`;
    if (t === "undefined") return "__undef__";

    if (value instanceof Date) return `__date__:${value.toISOString()}`;

    if (value instanceof Set) {
      const arr = [];
      for (const v of value) arr.push(v);
      return { __set__: arr };
    }

    if (value instanceof Map) {
      const entries = [];
      for (const [k, v] of value) entries.push([k, v]);
      return { __map__: entries };
    }

    if (t === "object" && value !== null) {
      if (seen.has(value)) return "__cycle__";
      seen.add(value);
    }

    return value;
  });
}

export function fastDeepHash(obj: any): string | false {
  try {
    const input = safeStringify(obj);
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  } catch {
    return false;
  }
}
