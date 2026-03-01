var Co = Object.defineProperty;
var Bo = (r, e, t) => e in r ? Co(r, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : r[e] = t;
var o = (r, e, t) => Bo(r, typeof e != "symbol" ? e + "" : e, t);
import { app as ne, ipcMain as Y, BrowserWindow as xo } from "electron";
import R from "node:path";
import { fileURLToPath as Io } from "node:url";
import qo from "electron-squirrel-startup";
import Ce from "better-sqlite3";
import Ze from "node:crypto";
import I from "node:fs";
import _o from "node:dgram";
import x from "sodium-native";
import Qo from "node:os";
import { exec as pt, spawn as Eo } from "node:child_process";
import Lo from "@vscode/sudo-prompt";
const m = Symbol.for("drizzle:entityKind");
function f(r, e) {
  if (!r || typeof r != "object")
    return !1;
  if (r instanceof e)
    return !0;
  if (!Object.prototype.hasOwnProperty.call(e, m))
    throw new Error(
      `Class "${e.name ?? "<unknown>"}" doesn't look like a Drizzle entity. If this is incorrect and the class is provided by Drizzle, please report this as a bug.`
    );
  let t = Object.getPrototypeOf(r).constructor;
  if (t)
    for (; t; ) {
      if (m in t && t[m] === e[m])
        return !0;
      t = Object.getPrototypeOf(t);
    }
  return !1;
}
var ls;
ls = m;
class hi {
  write(e) {
    console.log(e);
  }
}
o(hi, ls, "ConsoleLogWriter");
var cs;
cs = m;
class fi {
  constructor(e) {
    o(this, "writer");
    this.writer = (e == null ? void 0 : e.writer) ?? new hi();
  }
  logQuery(e, t) {
    const s = t.map((i) => {
      try {
        return JSON.stringify(i);
      } catch {
        return String(i);
      }
    }), n = s.length ? ` -- params: [${s.join(", ")}]` : "";
    this.writer.write(`Query: ${e}${n}`);
  }
}
o(fi, cs, "DefaultLogger");
var us;
us = m;
class mi {
  logQuery() {
  }
}
o(mi, us, "NoopLogger");
const le = Symbol.for("drizzle:Name"), Ke = Symbol.for("drizzle:Schema"), gt = Symbol.for("drizzle:Columns"), Gt = Symbol.for("drizzle:ExtraConfigColumns"), ht = Symbol.for("drizzle:OriginalName"), ft = Symbol.for("drizzle:BaseName"), Fe = Symbol.for("drizzle:IsAlias"), Xt = Symbol.for("drizzle:ExtraConfigBuilder"), Po = Symbol.for("drizzle:IsDrizzleTable");
var ds, hs, fs, ms, ps, gs, ys, bs, Ss, ws;
ws = m, Ss = le, bs = ht, ys = Ke, gs = gt, ps = Gt, ms = ft, fs = Fe, hs = Po, ds = Xt;
class p {
  constructor(e, t, s) {
    /**
     * @internal
     * Can be changed if the table is aliased.
     */
    o(this, Ss);
    /**
     * @internal
     * Used to store the original name of the table, before any aliasing.
     */
    o(this, bs);
    /** @internal */
    o(this, ys);
    /** @internal */
    o(this, gs);
    /** @internal */
    o(this, ps);
    /**
     *  @internal
     * Used to store the table name before the transformation via the `tableCreator` functions.
     */
    o(this, ms);
    /** @internal */
    o(this, fs, !1);
    /** @internal */
    o(this, hs, !0);
    /** @internal */
    o(this, ds);
    this[le] = this[ht] = e, this[Ke] = t, this[ft] = s;
  }
}
o(p, ws, "Table"), /** @internal */
o(p, "Symbol", {
  Name: le,
  Schema: Ke,
  OriginalName: ht,
  Columns: gt,
  ExtraConfigColumns: Gt,
  BaseName: ft,
  IsAlias: Fe,
  ExtraConfigBuilder: Xt
});
function Te(r) {
  return r[le];
}
function _e(r) {
  return `${r[Ke] ?? "public"}.${r[le]}`;
}
var vs;
vs = m;
class E {
  constructor(e, t) {
    o(this, "name");
    o(this, "keyAsName");
    o(this, "primary");
    o(this, "notNull");
    o(this, "default");
    o(this, "defaultFn");
    o(this, "onUpdateFn");
    o(this, "hasDefault");
    o(this, "isUnique");
    o(this, "uniqueName");
    o(this, "uniqueType");
    o(this, "dataType");
    o(this, "columnType");
    o(this, "enumValues");
    o(this, "generated");
    o(this, "generatedIdentity");
    o(this, "config");
    this.table = e, this.config = t, this.name = t.name, this.keyAsName = t.keyAsName, this.notNull = t.notNull, this.default = t.default, this.defaultFn = t.defaultFn, this.onUpdateFn = t.onUpdateFn, this.hasDefault = t.hasDefault, this.primary = t.primaryKey, this.isUnique = t.isUnique, this.uniqueName = t.uniqueName, this.uniqueType = t.uniqueType, this.dataType = t.dataType, this.columnType = t.columnType, this.generated = t.generated, this.generatedIdentity = t.generatedIdentity;
  }
  mapFromDriverValue(e) {
    return e;
  }
  mapToDriverValue(e) {
    return e;
  }
  // ** @internal */
  shouldDisableInsert() {
    return this.config.generated !== void 0 && this.config.generated.type !== "byDefault";
  }
}
o(E, vs, "Column");
var Ns;
Ns = m;
class pi {
  constructor(e, t, s) {
    o(this, "config");
    /**
     * Alias for {@link $defaultFn}.
     */
    o(this, "$default", this.$defaultFn);
    /**
     * Alias for {@link $onUpdateFn}.
     */
    o(this, "$onUpdate", this.$onUpdateFn);
    this.config = {
      name: e,
      keyAsName: e === "",
      notNull: !1,
      default: void 0,
      hasDefault: !1,
      primaryKey: !1,
      isUnique: !1,
      uniqueName: void 0,
      uniqueType: void 0,
      dataType: t,
      columnType: s,
      generated: void 0
    };
  }
  /**
   * Changes the data type of the column. Commonly used with `json` columns. Also, useful for branded types.
   *
   * @example
   * ```ts
   * const users = pgTable('users', {
   * 	id: integer('id').$type<UserId>().primaryKey(),
   * 	details: json('details').$type<UserDetails>().notNull(),
   * });
   * ```
   */
  $type() {
    return this;
  }
  /**
   * Adds a `not null` clause to the column definition.
   *
   * Affects the `select` model of the table - columns *without* `not null` will be nullable on select.
   */
  notNull() {
    return this.config.notNull = !0, this;
  }
  /**
   * Adds a `default <value>` clause to the column definition.
   *
   * Affects the `insert` model of the table - columns *with* `default` are optional on insert.
   *
   * If you need to set a dynamic default value, use {@link $defaultFn} instead.
   */
  default(e) {
    return this.config.default = e, this.config.hasDefault = !0, this;
  }
  /**
   * Adds a dynamic default value to the column.
   * The function will be called when the row is inserted, and the returned value will be used as the column value.
   *
   * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
   */
  $defaultFn(e) {
    return this.config.defaultFn = e, this.config.hasDefault = !0, this;
  }
  /**
   * Adds a dynamic update value to the column.
   * The function will be called when the row is updated, and the returned value will be used as the column value if none is provided.
   * If no `default` (or `$defaultFn`) value is provided, the function will be called when the row is inserted as well, and the returned value will be used as the column value.
   *
   * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
   */
  $onUpdateFn(e) {
    return this.config.onUpdateFn = e, this.config.hasDefault = !0, this;
  }
  /**
   * Adds a `primary key` clause to the column definition. This implicitly makes the column `not null`.
   *
   * In SQLite, `integer primary key` implicitly makes the column auto-incrementing.
   */
  primaryKey() {
    return this.config.primaryKey = !0, this.config.notNull = !0, this;
  }
  /** @internal Sets the name of the column to the key within the table definition if a name was not given. */
  setName(e) {
    this.config.name === "" && (this.config.name = e);
  }
}
o(pi, Ns, "ColumnBuilder");
const Zt = Symbol.for("drizzle:isPgEnum");
function Do(r) {
  return !!r && typeof r == "function" && Zt in r && r[Zt] === !0;
}
var Ts;
Ts = m;
class F {
  constructor(e, t, s, n = !1, i = []) {
    this._ = {
      brand: "Subquery",
      sql: e,
      selectedFields: t,
      alias: s,
      isWith: n,
      usedTables: i
    };
  }
  // getSQL(): SQL<unknown> {
  // 	return new SQL([this]);
  // }
}
o(F, Ts, "Subquery");
var $s, Cs;
class Qt extends (Cs = F, $s = m, Cs) {
}
o(Qt, $s, "WithSubquery");
const Ao = {
  startActiveSpan(r, e) {
    return e();
  }
}, K = Symbol.for("drizzle:ViewBaseConfig");
function gi(r) {
  return r != null && typeof r.getSQL == "function";
}
function Oo(r) {
  var t;
  const e = { sql: "", params: [] };
  for (const s of r)
    e.sql += s.sql, e.params.push(...s.params), (t = s.typings) != null && t.length && (e.typings || (e.typings = []), e.typings.push(...s.typings));
  return e;
}
var Bs;
Bs = m;
class O {
  constructor(e) {
    o(this, "value");
    this.value = Array.isArray(e) ? e : [e];
  }
  getSQL() {
    return new b([this]);
  }
}
o(O, Bs, "StringChunk");
var xs;
xs = m;
const de = class de {
  constructor(e) {
    /** @internal */
    o(this, "decoder", yi);
    o(this, "shouldInlineParams", !1);
    /** @internal */
    o(this, "usedTables", []);
    this.queryChunks = e;
    for (const t of e)
      if (f(t, p)) {
        const s = t[p.Symbol.Schema];
        this.usedTables.push(
          s === void 0 ? t[p.Symbol.Name] : s + "." + t[p.Symbol.Name]
        );
      }
  }
  append(e) {
    return this.queryChunks.push(...e.queryChunks), this;
  }
  toQuery(e) {
    return Ao.startActiveSpan("drizzle.buildSQL", (t) => {
      const s = this.buildQueryFromSourceParams(this.queryChunks, e);
      return t == null || t.setAttributes({
        "drizzle.query.text": s.sql,
        "drizzle.query.params": JSON.stringify(s.params)
      }), s;
    });
  }
  buildQueryFromSourceParams(e, t) {
    const s = Object.assign({}, t, {
      inlineParams: t.inlineParams || this.shouldInlineParams,
      paramStartIndex: t.paramStartIndex || { value: 0 }
    }), {
      casing: n,
      escapeName: i,
      escapeParam: l,
      prepareTyping: a,
      inlineParams: c,
      paramStartIndex: d
    } = s;
    return Oo(e.map((h) => {
      var y;
      if (f(h, O))
        return { sql: h.value.join(""), params: [] };
      if (f(h, Me))
        return { sql: i(h.value), params: [] };
      if (h === void 0)
        return { sql: "", params: [] };
      if (Array.isArray(h)) {
        const g = [new O("(")];
        for (const [v, T] of h.entries())
          g.push(T), v < h.length - 1 && g.push(new O(", "));
        return g.push(new O(")")), this.buildQueryFromSourceParams(g, s);
      }
      if (f(h, de))
        return this.buildQueryFromSourceParams(h.queryChunks, {
          ...s,
          inlineParams: c || h.shouldInlineParams
        });
      if (f(h, p)) {
        const g = h[p.Symbol.Schema], v = h[p.Symbol.Name];
        return {
          sql: g === void 0 || h[Fe] ? i(v) : i(g) + "." + i(v),
          params: []
        };
      }
      if (f(h, E)) {
        const g = n.getColumnCasing(h);
        if (t.invokeSource === "indexes")
          return { sql: i(g), params: [] };
        const v = h.table[p.Symbol.Schema];
        return {
          sql: h.table[Fe] || v === void 0 ? i(h.table[p.Symbol.Name]) + "." + i(g) : i(v) + "." + i(h.table[p.Symbol.Name]) + "." + i(g),
          params: []
        };
      }
      if (f(h, be)) {
        const g = h[K].schema, v = h[K].name;
        return {
          sql: g === void 0 || h[K].isAlias ? i(v) : i(g) + "." + i(v),
          params: []
        };
      }
      if (f(h, ie)) {
        if (f(h.value, pe))
          return { sql: l(d.value++, h), params: [h], typings: ["none"] };
        const g = h.value === null ? null : h.encoder.mapToDriverValue(h.value);
        if (f(g, de))
          return this.buildQueryFromSourceParams([g], s);
        if (c)
          return { sql: this.mapInlineParam(g, s), params: [] };
        let v = ["none"];
        return a && (v = [a(h.encoder)]), { sql: l(d.value++, g), params: [g], typings: v };
      }
      return f(h, pe) ? { sql: l(d.value++, h), params: [h], typings: ["none"] } : f(h, de.Aliased) && h.fieldAlias !== void 0 ? { sql: i(h.fieldAlias), params: [] } : f(h, F) ? h._.isWith ? { sql: i(h._.alias), params: [] } : this.buildQueryFromSourceParams([
        new O("("),
        h._.sql,
        new O(") "),
        new Me(h._.alias)
      ], s) : Do(h) ? h.schema ? { sql: i(h.schema) + "." + i(h.enumName), params: [] } : { sql: i(h.enumName), params: [] } : gi(h) ? (y = h.shouldOmitSQLParens) != null && y.call(h) ? this.buildQueryFromSourceParams([h.getSQL()], s) : this.buildQueryFromSourceParams([
        new O("("),
        h.getSQL(),
        new O(")")
      ], s) : c ? { sql: this.mapInlineParam(h, s), params: [] } : { sql: l(d.value++, h), params: [h], typings: ["none"] };
    }));
  }
  mapInlineParam(e, { escapeString: t }) {
    if (e === null)
      return "null";
    if (typeof e == "number" || typeof e == "boolean")
      return e.toString();
    if (typeof e == "string")
      return t(e);
    if (typeof e == "object") {
      const s = e.toString();
      return t(s === "[object Object]" ? JSON.stringify(e) : s);
    }
    throw new Error("Unexpected param value: " + e);
  }
  getSQL() {
    return this;
  }
  as(e) {
    return e === void 0 ? this : new de.Aliased(this, e);
  }
  mapWith(e) {
    return this.decoder = typeof e == "function" ? { mapFromDriverValue: e } : e, this;
  }
  inlineParams() {
    return this.shouldInlineParams = !0, this;
  }
  /**
   * This method is used to conditionally include a part of the query.
   *
   * @param condition - Condition to check
   * @returns itself if the condition is `true`, otherwise `undefined`
   */
  if(e) {
    return e ? this : void 0;
  }
};
o(de, xs, "SQL");
let b = de;
var Is;
Is = m;
class Me {
  constructor(e) {
    o(this, "brand");
    this.value = e;
  }
  getSQL() {
    return new b([this]);
  }
}
o(Me, Is, "Name");
function Ro(r) {
  return typeof r == "object" && r !== null && "mapToDriverValue" in r && typeof r.mapToDriverValue == "function";
}
const yi = {
  mapFromDriverValue: (r) => r
}, bi = {
  mapToDriverValue: (r) => r
};
({
  ...yi,
  ...bi
});
var qs;
qs = m;
class ie {
  /**
   * @param value - Parameter value
   * @param encoder - Encoder to convert the value to a driver parameter
   */
  constructor(e, t = bi) {
    o(this, "brand");
    this.value = e, this.encoder = t;
  }
  getSQL() {
    return new b([this]);
  }
}
o(ie, qs, "Param");
function u(r, ...e) {
  const t = [];
  (e.length > 0 || r.length > 0 && r[0] !== "") && t.push(new O(r[0]));
  for (const [s, n] of e.entries())
    t.push(n, new O(r[s + 1]));
  return new b(t);
}
((r) => {
  function e() {
    return new b([]);
  }
  r.empty = e;
  function t(c) {
    return new b(c);
  }
  r.fromList = t;
  function s(c) {
    return new b([new O(c)]);
  }
  r.raw = s;
  function n(c, d) {
    const h = [];
    for (const [y, g] of c.entries())
      y > 0 && d !== void 0 && h.push(d), h.push(g);
    return new b(h);
  }
  r.join = n;
  function i(c) {
    return new Me(c);
  }
  r.identifier = i;
  function l(c) {
    return new pe(c);
  }
  r.placeholder = l;
  function a(c, d) {
    return new ie(c, d);
  }
  r.param = a;
})(u || (u = {}));
((r) => {
  var t;
  t = m;
  const s = class s {
    constructor(i, l) {
      /** @internal */
      o(this, "isSelectionField", !1);
      this.sql = i, this.fieldAlias = l;
    }
    getSQL() {
      return this.sql;
    }
    /** @internal */
    clone() {
      return new s(this.sql, this.fieldAlias);
    }
  };
  o(s, t, "SQL.Aliased");
  let e = s;
  r.Aliased = e;
})(b || (b = {}));
var _s;
_s = m;
class pe {
  constructor(e) {
    this.name = e;
  }
  getSQL() {
    return new b([this]);
  }
}
o(pe, _s, "Placeholder");
function je(r, e) {
  return r.map((t) => {
    if (f(t, pe)) {
      if (!(t.name in e))
        throw new Error(`No value for placeholder "${t.name}" was provided`);
      return e[t.name];
    }
    if (f(t, ie) && f(t.value, pe)) {
      if (!(t.value.name in e))
        throw new Error(`No value for placeholder "${t.value.name}" was provided`);
      return t.encoder.mapToDriverValue(e[t.value.name]);
    }
    return t;
  });
}
const jo = Symbol.for("drizzle:IsDrizzleView");
var Qs, Es, Ls;
Ls = m, Es = K, Qs = jo;
class be {
  constructor({ name: e, schema: t, selectedFields: s, query: n }) {
    /** @internal */
    o(this, Es);
    /** @internal */
    o(this, Qs, !0);
    this[K] = {
      name: e,
      originalName: e,
      schema: t,
      selectedFields: s,
      query: n,
      isExisting: !n,
      isAlias: !1
    };
  }
  getSQL() {
    return new b([this]);
  }
}
o(be, Ls, "View");
E.prototype.getSQL = function() {
  return new b([this]);
};
p.prototype.getSQL = function() {
  return new b([this]);
};
F.prototype.getSQL = function() {
  return new b([this]);
};
function es(r, e, t) {
  const s = {}, n = r.reduce(
    (i, { path: l, field: a }, c) => {
      let d;
      f(a, E) ? d = a : f(a, b) ? d = a.decoder : f(a, F) ? d = a._.sql.decoder : d = a.sql.decoder;
      let h = i;
      for (const [y, g] of l.entries())
        if (y < l.length - 1)
          g in h || (h[g] = {}), h = h[g];
        else {
          const v = e[c], T = h[g] = v === null ? null : d.mapFromDriverValue(v);
          if (t && f(a, E) && l.length === 2) {
            const S = l[0];
            S in s ? typeof s[S] == "string" && s[S] !== Te(a.table) && (s[S] = !1) : s[S] = T === null ? Te(a.table) : !1;
          }
        }
      return i;
    },
    {}
  );
  if (t && Object.keys(s).length > 0)
    for (const [i, l] of Object.entries(s))
      typeof l == "string" && !t[l] && (n[i] = null);
  return n;
}
function ge(r, e) {
  return Object.entries(r).reduce((t, [s, n]) => {
    if (typeof s != "string")
      return t;
    const i = e ? [...e, s] : [s];
    return f(n, E) || f(n, b) || f(n, b.Aliased) || f(n, F) ? t.push({ path: i, field: n }) : f(n, p) ? t.push(...ge(n[p.Symbol.Columns], i)) : t.push(...ge(n, i)), t;
  }, []);
}
function Et(r, e) {
  const t = Object.keys(r), s = Object.keys(e);
  if (t.length !== s.length)
    return !1;
  for (const [n, i] of t.entries())
    if (i !== s[n])
      return !1;
  return !0;
}
function Si(r, e) {
  const t = Object.entries(e).filter(([, s]) => s !== void 0).map(([s, n]) => f(n, b) || f(n, E) ? [s, n] : [s, new ie(n, r[p.Symbol.Columns][s])]);
  if (t.length === 0)
    throw new Error("No values to set");
  return Object.fromEntries(t);
}
function Ko(r, e) {
  for (const t of e)
    for (const s of Object.getOwnPropertyNames(t.prototype))
      s !== "constructor" && Object.defineProperty(
        r.prototype,
        s,
        Object.getOwnPropertyDescriptor(t.prototype, s) || /* @__PURE__ */ Object.create(null)
      );
}
function Fo(r) {
  return r[p.Symbol.Columns];
}
function yt(r) {
  return f(r, F) ? r._.alias : f(r, be) ? r[K].name : f(r, b) ? void 0 : r[p.Symbol.IsAlias] ? r[p.Symbol.Name] : r[p.Symbol.BaseName];
}
function Pe(r, e) {
  return {
    name: typeof r == "string" && r.length > 0 ? r : "",
    config: typeof r == "object" ? r : e
  };
}
function Mo(r) {
  if (typeof r != "object" || r === null || r.constructor.name !== "Object") return !1;
  if ("logger" in r) {
    const e = typeof r.logger;
    return !(e !== "boolean" && (e !== "object" || typeof r.logger.logQuery != "function") && e !== "undefined");
  }
  if ("schema" in r) {
    const e = typeof r.schema;
    return !(e !== "object" && e !== "undefined");
  }
  if ("casing" in r) {
    const e = typeof r.casing;
    return !(e !== "string" && e !== "undefined");
  }
  if ("mode" in r)
    return !(r.mode !== "default" || r.mode !== "planetscale" || r.mode !== void 0);
  if ("connection" in r) {
    const e = typeof r.connection;
    return !(e !== "string" && e !== "object" && e !== "undefined");
  }
  if ("client" in r) {
    const e = typeof r.client;
    return !(e !== "object" && e !== "function" && e !== "undefined");
  }
  return Object.keys(r).length === 0;
}
const wi = typeof TextDecoder > "u" ? null : new TextDecoder(), ts = Symbol.for("drizzle:PgInlineForeignKeys"), ss = Symbol.for("drizzle:EnableRLS");
var Ps, Ds, As, Os, Rs, js;
class bt extends (js = p, Rs = m, Os = ts, As = ss, Ds = p.Symbol.ExtraConfigBuilder, Ps = p.Symbol.ExtraConfigColumns, js) {
  constructor() {
    super(...arguments);
    /**@internal */
    o(this, Os, []);
    /** @internal */
    o(this, As, !1);
    /** @internal */
    o(this, Ds);
    /** @internal */
    o(this, Ps, {});
  }
}
o(bt, Rs, "PgTable"), /** @internal */
o(bt, "Symbol", Object.assign({}, p.Symbol, {
  InlineForeignKeys: ts,
  EnableRLS: ss
}));
var Ks;
Ks = m;
class vi {
  constructor(e, t) {
    /** @internal */
    o(this, "columns");
    /** @internal */
    o(this, "name");
    this.columns = e, this.name = t;
  }
  /** @internal */
  build(e) {
    return new Ni(e, this.columns, this.name);
  }
}
o(vi, Ks, "PgPrimaryKeyBuilder");
var Fs;
Fs = m;
class Ni {
  constructor(e, t, s) {
    o(this, "columns");
    o(this, "name");
    this.table = e, this.columns = t, this.name = s;
  }
  getName() {
    return this.name ?? `${this.table[bt.Symbol.Name]}_${this.columns.map((e) => e.name).join("_")}_pk`;
  }
}
o(Ni, Fs, "PgPrimaryKey");
function V(r, e) {
  return Ro(e) && !gi(r) && !f(r, ie) && !f(r, pe) && !f(r, E) && !f(r, p) && !f(r, be) ? new ie(r, e) : r;
}
const _ = (r, e) => u`${r} = ${V(e, r)}`, zo = (r, e) => u`${r} <> ${V(e, r)}`;
function Qe(...r) {
  const e = r.filter(
    (t) => t !== void 0
  );
  if (e.length !== 0)
    return e.length === 1 ? new b(e) : new b([
      new O("("),
      u.join(e, new O(" and ")),
      new O(")")
    ]);
}
function Uo(...r) {
  const e = r.filter(
    (t) => t !== void 0
  );
  if (e.length !== 0)
    return e.length === 1 ? new b(e) : new b([
      new O("("),
      u.join(e, new O(" or ")),
      new O(")")
    ]);
}
function ko(r) {
  return u`not ${r}`;
}
const Vo = (r, e) => u`${r} > ${V(e, r)}`, Yo = (r, e) => u`${r} >= ${V(e, r)}`, Ho = (r, e) => u`${r} < ${V(e, r)}`, Jo = (r, e) => u`${r} <= ${V(e, r)}`;
function Wo(r, e) {
  return Array.isArray(e) ? e.length === 0 ? u`false` : u`${r} in ${e.map((t) => V(t, r))}` : u`${r} in ${V(e, r)}`;
}
function Go(r, e) {
  return Array.isArray(e) ? e.length === 0 ? u`true` : u`${r} not in ${e.map((t) => V(t, r))}` : u`${r} not in ${V(e, r)}`;
}
function Xo(r) {
  return u`${r} is null`;
}
function Zo(r) {
  return u`${r} is not null`;
}
function ea(r) {
  return u`exists ${r}`;
}
function ta(r) {
  return u`not exists ${r}`;
}
function sa(r, e, t) {
  return u`${r} between ${V(e, r)} and ${V(
    t,
    r
  )}`;
}
function ra(r, e, t) {
  return u`${r} not between ${V(
    e,
    r
  )} and ${V(t, r)}`;
}
function na(r, e) {
  return u`${r} like ${e}`;
}
function ia(r, e) {
  return u`${r} not like ${e}`;
}
function oa(r, e) {
  return u`${r} ilike ${e}`;
}
function aa(r, e) {
  return u`${r} not ilike ${e}`;
}
function la(r) {
  return u`${r} asc`;
}
function Lt(r) {
  return u`${r} desc`;
}
var Ms;
Ms = m;
class Pt {
  constructor(e, t, s) {
    o(this, "referencedTableName");
    o(this, "fieldName");
    this.sourceTable = e, this.referencedTable = t, this.relationName = s, this.referencedTableName = t[p.Symbol.Name];
  }
}
o(Pt, Ms, "Relation");
var zs;
zs = m;
class Ti {
  constructor(e, t) {
    this.table = e, this.config = t;
  }
}
o(Ti, zs, "Relations");
var Us, ks;
const Je = class Je extends (ks = Pt, Us = m, ks) {
  constructor(e, t, s, n) {
    super(e, t, s == null ? void 0 : s.relationName), this.config = s, this.isNullable = n;
  }
  withFieldName(e) {
    const t = new Je(
      this.sourceTable,
      this.referencedTable,
      this.config,
      this.isNullable
    );
    return t.fieldName = e, t;
  }
};
o(Je, Us, "One");
let ye = Je;
var Vs, Ys;
const We = class We extends (Ys = Pt, Vs = m, Ys) {
  constructor(e, t, s) {
    super(e, t, s == null ? void 0 : s.relationName), this.config = s;
  }
  withFieldName(e) {
    const t = new We(
      this.sourceTable,
      this.referencedTable,
      this.config
    );
    return t.fieldName = e, t;
  }
};
o(We, Vs, "Many");
let ze = We;
function ca() {
  return {
    and: Qe,
    between: sa,
    eq: _,
    exists: ea,
    gt: Vo,
    gte: Yo,
    ilike: oa,
    inArray: Wo,
    isNull: Xo,
    isNotNull: Zo,
    like: na,
    lt: Ho,
    lte: Jo,
    ne: zo,
    not: ko,
    notBetween: ra,
    notExists: ta,
    notLike: ia,
    notIlike: aa,
    notInArray: Go,
    or: Uo,
    sql: u
  };
}
function ua() {
  return {
    sql: u,
    asc: la,
    desc: Lt
  };
}
function da(r, e) {
  var i;
  Object.keys(r).length === 1 && "default" in r && !f(r.default, p) && (r = r.default);
  const t = {}, s = {}, n = {};
  for (const [l, a] of Object.entries(r))
    if (f(a, p)) {
      const c = _e(a), d = s[c];
      t[c] = l, n[l] = {
        tsName: l,
        dbName: a[p.Symbol.Name],
        schema: a[p.Symbol.Schema],
        columns: a[p.Symbol.Columns],
        relations: (d == null ? void 0 : d.relations) ?? {},
        primaryKey: (d == null ? void 0 : d.primaryKey) ?? []
      };
      for (const y of Object.values(
        a[p.Symbol.Columns]
      ))
        y.primary && n[l].primaryKey.push(y);
      const h = (i = a[p.Symbol.ExtraConfigBuilder]) == null ? void 0 : i.call(a, a[p.Symbol.ExtraConfigColumns]);
      if (h)
        for (const y of Object.values(h))
          f(y, vi) && n[l].primaryKey.push(...y.columns);
    } else if (f(a, Ti)) {
      const c = _e(a.table), d = t[c], h = a.config(
        e(a.table)
      );
      let y;
      for (const [g, v] of Object.entries(h))
        if (d) {
          const T = n[d];
          T.relations[g] = v;
        } else
          c in s || (s[c] = {
            relations: {},
            primaryKey: y
          }), s[c].relations[g] = v;
    }
  return { tables: n, tableNamesMap: t };
}
function ha(r) {
  return function(t, s) {
    return new ye(
      r,
      t,
      s,
      (s == null ? void 0 : s.fields.reduce((n, i) => n && i.notNull, !0)) ?? !1
    );
  };
}
function fa(r) {
  return function(t, s) {
    return new ze(r, t, s);
  };
}
function ma(r, e, t) {
  if (f(t, ye) && t.config)
    return {
      fields: t.config.fields,
      references: t.config.references
    };
  const s = e[_e(t.referencedTable)];
  if (!s)
    throw new Error(
      `Table "${t.referencedTable[p.Symbol.Name]}" not found in schema`
    );
  const n = r[s];
  if (!n)
    throw new Error(`Table "${s}" not found in schema`);
  const i = t.sourceTable, l = e[_e(i)];
  if (!l)
    throw new Error(
      `Table "${i[p.Symbol.Name]}" not found in schema`
    );
  const a = [];
  for (const c of Object.values(
    n.relations
  ))
    (t.relationName && t !== c && c.relationName === t.relationName || !t.relationName && c.referencedTable === t.sourceTable) && a.push(c);
  if (a.length > 1)
    throw t.relationName ? new Error(
      `There are multiple relations with name "${t.relationName}" in table "${s}"`
    ) : new Error(
      `There are multiple relations between "${s}" and "${t.sourceTable[p.Symbol.Name]}". Please specify relation name`
    );
  if (a[0] && f(a[0], ye) && a[0].config)
    return {
      fields: a[0].config.references,
      references: a[0].config.fields
    };
  throw new Error(
    `There is not enough information to infer relation "${l}.${t.fieldName}"`
  );
}
function pa(r) {
  return {
    one: ha(r),
    many: fa(r)
  };
}
function St(r, e, t, s, n = (i) => i) {
  const i = {};
  for (const [
    l,
    a
  ] of s.entries())
    if (a.isJson) {
      const c = e.relations[a.tsKey], d = t[l], h = typeof d == "string" ? JSON.parse(d) : d;
      i[a.tsKey] = f(c, ye) ? h && St(
        r,
        r[a.relationTableTsKey],
        h,
        a.selection,
        n
      ) : h.map(
        (y) => St(
          r,
          r[a.relationTableTsKey],
          y,
          a.selection,
          n
        )
      );
    } else {
      const c = n(t[l]), d = a.field;
      let h;
      f(d, E) ? h = d : f(d, b) ? h = d.decoder : h = d.sql.decoder, i[a.tsKey] = c === null ? null : h.mapFromDriverValue(c);
    }
  return i;
}
var Hs;
Hs = m;
class Ee {
  constructor(e) {
    this.table = e;
  }
  get(e, t) {
    return t === "table" ? this.table : e[t];
  }
}
o(Ee, Hs, "ColumnAliasProxyHandler");
var Js;
Js = m;
class et {
  constructor(e, t) {
    this.alias = e, this.replaceOriginalName = t;
  }
  get(e, t) {
    if (t === p.Symbol.IsAlias)
      return !0;
    if (t === p.Symbol.Name)
      return this.alias;
    if (this.replaceOriginalName && t === p.Symbol.OriginalName)
      return this.alias;
    if (t === K)
      return {
        ...e[K],
        name: this.alias,
        isAlias: !0
      };
    if (t === p.Symbol.Columns) {
      const n = e[p.Symbol.Columns];
      if (!n)
        return n;
      const i = {};
      return Object.keys(n).map((l) => {
        i[l] = new Proxy(
          n[l],
          new Ee(new Proxy(e, this))
        );
      }), i;
    }
    const s = e[t];
    return f(s, E) ? new Proxy(s, new Ee(new Proxy(e, this))) : s;
  }
}
o(et, Js, "TableAliasProxyHandler");
function mt(r, e) {
  return new Proxy(r, new et(e, !1));
}
function se(r, e) {
  return new Proxy(
    r,
    new Ee(new Proxy(r.table, new et(e, !1)))
  );
}
function $i(r, e) {
  return new b.Aliased(Ue(r.sql, e), r.fieldAlias);
}
function Ue(r, e) {
  return u.join(r.queryChunks.map((t) => f(t, E) ? se(t, e) : f(t, b) ? Ue(t, e) : f(t, b.Aliased) ? $i(t, e) : t));
}
var Ws;
Ws = m;
const Ge = class Ge {
  constructor(e) {
    o(this, "config");
    this.config = { ...e };
  }
  get(e, t) {
    if (t === "_")
      return {
        ...e._,
        selectedFields: new Proxy(
          e._.selectedFields,
          this
        )
      };
    if (t === K)
      return {
        ...e[K],
        selectedFields: new Proxy(
          e[K].selectedFields,
          this
        )
      };
    if (typeof t == "symbol")
      return e[t];
    const n = (f(e, F) ? e._.selectedFields : f(e, be) ? e[K].selectedFields : e)[t];
    if (f(n, b.Aliased)) {
      if (this.config.sqlAliasedBehavior === "sql" && !n.isSelectionField)
        return n.sql;
      const i = n.clone();
      return i.isSelectionField = !0, i;
    }
    if (f(n, b)) {
      if (this.config.sqlBehavior === "sql")
        return n;
      throw new Error(
        `You tried to reference "${t}" field from a subquery, which is a raw SQL field, but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.`
      );
    }
    return f(n, E) ? this.config.alias ? new Proxy(
      n,
      new Ee(
        new Proxy(
          n.table,
          new et(this.config.alias, this.config.replaceOriginalName ?? !1)
        )
      )
    ) : n : typeof n != "object" || n === null ? n : new Proxy(n, new Ge(this.config));
  }
};
o(Ge, Ws, "SelectionProxyHandler");
let U = Ge;
var Gs, Xs;
Xs = m, Gs = Symbol.toStringTag;
class ue {
  constructor() {
    o(this, Gs, "QueryPromise");
  }
  catch(e) {
    return this.then(void 0, e);
  }
  finally(e) {
    return this.then(
      (t) => (e == null || e(), t),
      (t) => {
        throw e == null || e(), t;
      }
    );
  }
  then(e, t) {
    return this.execute().then(e, t);
  }
}
o(ue, Xs, "QueryPromise");
var Zs;
Zs = m;
class Ci {
  constructor(e, t) {
    /** @internal */
    o(this, "reference");
    /** @internal */
    o(this, "_onUpdate");
    /** @internal */
    o(this, "_onDelete");
    this.reference = () => {
      const { name: s, columns: n, foreignColumns: i } = e();
      return { name: s, columns: n, foreignTable: i[0].table, foreignColumns: i };
    }, t && (this._onUpdate = t.onUpdate, this._onDelete = t.onDelete);
  }
  onUpdate(e) {
    return this._onUpdate = e, this;
  }
  onDelete(e) {
    return this._onDelete = e, this;
  }
  /** @internal */
  build(e) {
    return new Bi(e, this);
  }
}
o(Ci, Zs, "SQLiteForeignKeyBuilder");
var er;
er = m;
class Bi {
  constructor(e, t) {
    o(this, "reference");
    o(this, "onUpdate");
    o(this, "onDelete");
    this.table = e, this.reference = t.reference, this.onUpdate = t._onUpdate, this.onDelete = t._onDelete;
  }
  getName() {
    const { name: e, columns: t, foreignColumns: s } = this.reference(), n = t.map((a) => a.name), i = s.map((a) => a.name), l = [
      this.table[le],
      ...n,
      s[0].table[le],
      ...i
    ];
    return e ?? `${l.join("_")}_fk`;
  }
}
o(Bi, er, "SQLiteForeignKey");
function ga(r, e) {
  return `${r[le]}_${e.join("_")}_unique`;
}
var tr, sr;
class Z extends (sr = pi, tr = m, sr) {
  constructor() {
    super(...arguments);
    o(this, "foreignKeyConfigs", []);
  }
  references(t, s = {}) {
    return this.foreignKeyConfigs.push({ ref: t, actions: s }), this;
  }
  unique(t) {
    return this.config.isUnique = !0, this.config.uniqueName = t, this;
  }
  generatedAlwaysAs(t, s) {
    return this.config.generated = {
      as: t,
      type: "always",
      mode: (s == null ? void 0 : s.mode) ?? "virtual"
    }, this;
  }
  /** @internal */
  buildForeignKeys(t, s) {
    return this.foreignKeyConfigs.map(({ ref: n, actions: i }) => ((l, a) => {
      const c = new Ci(() => {
        const d = l();
        return { columns: [t], foreignColumns: [d] };
      });
      return a.onUpdate && c.onUpdate(a.onUpdate), a.onDelete && c.onDelete(a.onDelete), c.build(s);
    })(n, i));
  }
}
o(Z, tr, "SQLiteColumnBuilder");
var rr, nr;
class k extends (nr = E, rr = m, nr) {
  constructor(e, t) {
    t.uniqueName || (t.uniqueName = ga(e, [t.name])), super(e, t), this.table = e;
  }
}
o(k, rr, "SQLiteColumn");
var ir, or;
class xi extends (or = Z, ir = m, or) {
  constructor(e) {
    super(e, "bigint", "SQLiteBigInt");
  }
  /** @internal */
  build(e) {
    return new Ii(e, this.config);
  }
}
o(xi, ir, "SQLiteBigIntBuilder");
var ar, lr;
class Ii extends (lr = k, ar = m, lr) {
  getSQLType() {
    return "blob";
  }
  mapFromDriverValue(e) {
    if (typeof Buffer < "u" && Buffer.from) {
      const t = Buffer.isBuffer(e) ? e : e instanceof ArrayBuffer ? Buffer.from(e) : e.buffer ? Buffer.from(e.buffer, e.byteOffset, e.byteLength) : Buffer.from(e);
      return BigInt(t.toString("utf8"));
    }
    return BigInt(wi.decode(e));
  }
  mapToDriverValue(e) {
    return Buffer.from(e.toString());
  }
}
o(Ii, ar, "SQLiteBigInt");
var cr, ur;
class qi extends (ur = Z, cr = m, ur) {
  constructor(e) {
    super(e, "json", "SQLiteBlobJson");
  }
  /** @internal */
  build(e) {
    return new _i(
      e,
      this.config
    );
  }
}
o(qi, cr, "SQLiteBlobJsonBuilder");
var dr, hr;
class _i extends (hr = k, dr = m, hr) {
  getSQLType() {
    return "blob";
  }
  mapFromDriverValue(e) {
    if (typeof Buffer < "u" && Buffer.from) {
      const t = Buffer.isBuffer(e) ? e : e instanceof ArrayBuffer ? Buffer.from(e) : e.buffer ? Buffer.from(e.buffer, e.byteOffset, e.byteLength) : Buffer.from(e);
      return JSON.parse(t.toString("utf8"));
    }
    return JSON.parse(wi.decode(e));
  }
  mapToDriverValue(e) {
    return Buffer.from(JSON.stringify(e));
  }
}
o(_i, dr, "SQLiteBlobJson");
var fr, mr;
class Qi extends (mr = Z, fr = m, mr) {
  constructor(e) {
    super(e, "buffer", "SQLiteBlobBuffer");
  }
  /** @internal */
  build(e) {
    return new Ei(e, this.config);
  }
}
o(Qi, fr, "SQLiteBlobBufferBuilder");
var pr, gr;
class Ei extends (gr = k, pr = m, gr) {
  mapFromDriverValue(e) {
    return Buffer.isBuffer(e) ? e : Buffer.from(e);
  }
  getSQLType() {
    return "blob";
  }
}
o(Ei, pr, "SQLiteBlobBuffer");
function ya(r, e) {
  const { name: t, config: s } = Pe(r, e);
  return (s == null ? void 0 : s.mode) === "json" ? new qi(t) : (s == null ? void 0 : s.mode) === "bigint" ? new xi(t) : new Qi(t);
}
var yr, br;
class Li extends (br = Z, yr = m, br) {
  constructor(e, t, s) {
    super(e, "custom", "SQLiteCustomColumn"), this.config.fieldConfig = t, this.config.customTypeParams = s;
  }
  /** @internal */
  build(e) {
    return new Pi(
      e,
      this.config
    );
  }
}
o(Li, yr, "SQLiteCustomColumnBuilder");
var Sr, wr;
class Pi extends (wr = k, Sr = m, wr) {
  constructor(t, s) {
    super(t, s);
    o(this, "sqlName");
    o(this, "mapTo");
    o(this, "mapFrom");
    this.sqlName = s.customTypeParams.dataType(s.fieldConfig), this.mapTo = s.customTypeParams.toDriver, this.mapFrom = s.customTypeParams.fromDriver;
  }
  getSQLType() {
    return this.sqlName;
  }
  mapFromDriverValue(t) {
    return typeof this.mapFrom == "function" ? this.mapFrom(t) : t;
  }
  mapToDriverValue(t) {
    return typeof this.mapTo == "function" ? this.mapTo(t) : t;
  }
}
o(Pi, Sr, "SQLiteCustomColumn");
function ba(r) {
  return (e, t) => {
    const { name: s, config: n } = Pe(e, t);
    return new Li(
      s,
      n,
      r
    );
  };
}
var vr, Nr;
class tt extends (Nr = Z, vr = m, Nr) {
  constructor(e, t, s) {
    super(e, t, s), this.config.autoIncrement = !1;
  }
  primaryKey(e) {
    return e != null && e.autoIncrement && (this.config.autoIncrement = !0), this.config.hasDefault = !0, super.primaryKey();
  }
}
o(tt, vr, "SQLiteBaseIntegerBuilder");
var Tr, $r;
class st extends ($r = k, Tr = m, $r) {
  constructor() {
    super(...arguments);
    o(this, "autoIncrement", this.config.autoIncrement);
  }
  getSQLType() {
    return "integer";
  }
}
o(st, Tr, "SQLiteBaseInteger");
var Cr, Br;
class Di extends (Br = tt, Cr = m, Br) {
  constructor(e) {
    super(e, "number", "SQLiteInteger");
  }
  build(e) {
    return new Ai(
      e,
      this.config
    );
  }
}
o(Di, Cr, "SQLiteIntegerBuilder");
var xr, Ir;
class Ai extends (Ir = st, xr = m, Ir) {
}
o(Ai, xr, "SQLiteInteger");
var qr, _r;
class Oi extends (_r = tt, qr = m, _r) {
  constructor(e, t) {
    super(e, "date", "SQLiteTimestamp"), this.config.mode = t;
  }
  /**
   * @deprecated Use `default()` with your own expression instead.
   *
   * Adds `DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))` to the column, which is the current epoch timestamp in milliseconds.
   */
  defaultNow() {
    return this.default(u`(cast((julianday('now') - 2440587.5)*86400000 as integer))`);
  }
  build(e) {
    return new Ri(
      e,
      this.config
    );
  }
}
o(Oi, qr, "SQLiteTimestampBuilder");
var Qr, Er;
class Ri extends (Er = st, Qr = m, Er) {
  constructor() {
    super(...arguments);
    o(this, "mode", this.config.mode);
  }
  mapFromDriverValue(t) {
    return this.config.mode === "timestamp" ? new Date(t * 1e3) : new Date(t);
  }
  mapToDriverValue(t) {
    const s = t.getTime();
    return this.config.mode === "timestamp" ? Math.floor(s / 1e3) : s;
  }
}
o(Ri, Qr, "SQLiteTimestamp");
var Lr, Pr;
class ji extends (Pr = tt, Lr = m, Pr) {
  constructor(e, t) {
    super(e, "boolean", "SQLiteBoolean"), this.config.mode = t;
  }
  build(e) {
    return new Ki(
      e,
      this.config
    );
  }
}
o(ji, Lr, "SQLiteBooleanBuilder");
var Dr, Ar;
class Ki extends (Ar = st, Dr = m, Ar) {
  constructor() {
    super(...arguments);
    o(this, "mode", this.config.mode);
  }
  mapFromDriverValue(t) {
    return Number(t) === 1;
  }
  mapToDriverValue(t) {
    return t ? 1 : 0;
  }
}
o(Ki, Dr, "SQLiteBoolean");
function me(r, e) {
  const { name: t, config: s } = Pe(r, e);
  return (s == null ? void 0 : s.mode) === "timestamp" || (s == null ? void 0 : s.mode) === "timestamp_ms" ? new Oi(t, s.mode) : (s == null ? void 0 : s.mode) === "boolean" ? new ji(t, s.mode) : new Di(t);
}
var Or, Rr;
class Fi extends (Rr = Z, Or = m, Rr) {
  constructor(e) {
    super(e, "string", "SQLiteNumeric");
  }
  /** @internal */
  build(e) {
    return new Mi(
      e,
      this.config
    );
  }
}
o(Fi, Or, "SQLiteNumericBuilder");
var jr, Kr;
class Mi extends (Kr = k, jr = m, Kr) {
  mapFromDriverValue(e) {
    return typeof e == "string" ? e : String(e);
  }
  getSQLType() {
    return "numeric";
  }
}
o(Mi, jr, "SQLiteNumeric");
var Fr, Mr;
class zi extends (Mr = Z, Fr = m, Mr) {
  constructor(e) {
    super(e, "number", "SQLiteNumericNumber");
  }
  /** @internal */
  build(e) {
    return new Ui(
      e,
      this.config
    );
  }
}
o(zi, Fr, "SQLiteNumericNumberBuilder");
var zr, Ur;
class Ui extends (Ur = k, zr = m, Ur) {
  constructor() {
    super(...arguments);
    o(this, "mapToDriverValue", String);
  }
  mapFromDriverValue(t) {
    return typeof t == "number" ? t : Number(t);
  }
  getSQLType() {
    return "numeric";
  }
}
o(Ui, zr, "SQLiteNumericNumber");
var kr, Vr;
class ki extends (Vr = Z, kr = m, Vr) {
  constructor(e) {
    super(e, "bigint", "SQLiteNumericBigInt");
  }
  /** @internal */
  build(e) {
    return new Vi(
      e,
      this.config
    );
  }
}
o(ki, kr, "SQLiteNumericBigIntBuilder");
var Yr, Hr;
class Vi extends (Hr = k, Yr = m, Hr) {
  constructor() {
    super(...arguments);
    o(this, "mapFromDriverValue", BigInt);
    o(this, "mapToDriverValue", String);
  }
  getSQLType() {
    return "numeric";
  }
}
o(Vi, Yr, "SQLiteNumericBigInt");
function Sa(r, e) {
  const { name: t, config: s } = Pe(r, e), n = s == null ? void 0 : s.mode;
  return n === "number" ? new zi(t) : n === "bigint" ? new ki(t) : new Fi(t);
}
var Jr, Wr;
class Yi extends (Wr = Z, Jr = m, Wr) {
  constructor(e) {
    super(e, "number", "SQLiteReal");
  }
  /** @internal */
  build(e) {
    return new Hi(e, this.config);
  }
}
o(Yi, Jr, "SQLiteRealBuilder");
var Gr, Xr;
class Hi extends (Xr = k, Gr = m, Xr) {
  getSQLType() {
    return "real";
  }
}
o(Hi, Gr, "SQLiteReal");
function wa(r) {
  return new Yi(r ?? "");
}
var Zr, en;
class Ji extends (en = Z, Zr = m, en) {
  constructor(e, t) {
    super(e, "string", "SQLiteText"), this.config.enumValues = t.enum, this.config.length = t.length;
  }
  /** @internal */
  build(e) {
    return new Wi(
      e,
      this.config
    );
  }
}
o(Ji, Zr, "SQLiteTextBuilder");
var tn, sn;
class Wi extends (sn = k, tn = m, sn) {
  constructor(t, s) {
    super(t, s);
    o(this, "enumValues", this.config.enumValues);
    o(this, "length", this.config.length);
  }
  getSQLType() {
    return `text${this.config.length ? `(${this.config.length})` : ""}`;
  }
}
o(Wi, tn, "SQLiteText");
var rn, nn;
class Gi extends (nn = Z, rn = m, nn) {
  constructor(e) {
    super(e, "json", "SQLiteTextJson");
  }
  /** @internal */
  build(e) {
    return new Xi(
      e,
      this.config
    );
  }
}
o(Gi, rn, "SQLiteTextJsonBuilder");
var on, an;
class Xi extends (an = k, on = m, an) {
  getSQLType() {
    return "text";
  }
  mapFromDriverValue(e) {
    return JSON.parse(e);
  }
  mapToDriverValue(e) {
    return JSON.stringify(e);
  }
}
o(Xi, on, "SQLiteTextJson");
function L(r, e = {}) {
  const { name: t, config: s } = Pe(r, e);
  return s.mode === "json" ? new Gi(t) : new Ji(t, s);
}
function va() {
  return {
    blob: ya,
    customType: ba,
    integer: me,
    numeric: Sa,
    real: wa,
    text: L
  };
}
const wt = Symbol.for("drizzle:SQLiteInlineForeignKeys");
var ln, cn, un, dn, hn;
class H extends (hn = p, dn = m, un = p.Symbol.Columns, cn = wt, ln = p.Symbol.ExtraConfigBuilder, hn) {
  constructor() {
    super(...arguments);
    /** @internal */
    o(this, un);
    /** @internal */
    o(this, cn, []);
    /** @internal */
    o(this, ln);
  }
}
o(H, dn, "SQLiteTable"), /** @internal */
o(H, "Symbol", Object.assign({}, p.Symbol, {
  InlineForeignKeys: wt
}));
function Na(r, e, t, s, n = r) {
  const i = new H(r, s, n), l = typeof e == "function" ? e(va()) : e, a = Object.fromEntries(
    Object.entries(l).map(([d, h]) => {
      const y = h;
      y.setName(d);
      const g = y.build(i);
      return i[wt].push(...y.buildForeignKeys(g, i)), [d, g];
    })
  ), c = Object.assign(i, a);
  return c[p.Symbol.Columns] = a, c[p.Symbol.ExtraConfigColumns] = a, c;
}
const Dt = (r, e, t) => Na(r, e);
function he(r) {
  return f(r, H) ? [`${r[p.Symbol.BaseName]}`] : f(r, F) ? r._.usedTables ?? [] : f(r, b) ? r.usedTables ?? [] : [];
}
var fn, mn;
class vt extends (mn = ue, fn = m, mn) {
  constructor(t, s, n, i) {
    super();
    /** @internal */
    o(this, "config");
    o(this, "run", (t) => this._prepare().run(t));
    o(this, "all", (t) => this._prepare().all(t));
    o(this, "get", (t) => this._prepare().get(t));
    o(this, "values", (t) => this._prepare().values(t));
    this.table = t, this.session = s, this.dialect = n, this.config = { table: t, withList: i };
  }
  /**
   * Adds a `where` clause to the query.
   *
   * Calling this method will delete only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/delete}
   *
   * @param where the `where` clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be deleted.
   *
   * ```ts
   * // Delete all cars with green color
   * db.delete(cars).where(eq(cars.color, 'green'));
   * // or
   * db.delete(cars).where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Delete all BMW cars with a green color
   * db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Delete all cars with the green or blue color
   * db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(t) {
    return this.config.where = t, this;
  }
  orderBy(...t) {
    if (typeof t[0] == "function") {
      const s = t[0](
        new Proxy(
          this.config.table[p.Symbol.Columns],
          new U({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      ), n = Array.isArray(s) ? s : [s];
      this.config.orderBy = n;
    } else {
      const s = t;
      this.config.orderBy = s;
    }
    return this;
  }
  limit(t) {
    return this.config.limit = t, this;
  }
  returning(t = this.table[H.Symbol.Columns]) {
    return this.config.returning = ge(t), this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildDeleteQuery(this.config);
  }
  toSQL() {
    const { typings: t, ...s } = this.dialect.sqlToQuery(this.getSQL());
    return s;
  }
  /** @internal */
  _prepare(t = !0) {
    return this.session[t ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      !0,
      void 0,
      {
        type: "delete",
        tables: he(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(!1);
  }
  async execute(t) {
    return this._prepare().execute(t);
  }
  $dynamic() {
    return this;
  }
}
o(vt, fn, "SQLiteDelete");
function Ta(r) {
  return (r.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? []).map((t) => t.toLowerCase()).join("_");
}
function $a(r) {
  return (r.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? []).reduce((t, s, n) => {
    const i = n === 0 ? s.toLowerCase() : `${s[0].toUpperCase()}${s.slice(1)}`;
    return t + i;
  }, "");
}
function Ca(r) {
  return r;
}
var pn;
pn = m;
class Zi {
  constructor(e) {
    /** @internal */
    o(this, "cache", {});
    o(this, "cachedTables", {});
    o(this, "convert");
    this.convert = e === "snake_case" ? Ta : e === "camelCase" ? $a : Ca;
  }
  getColumnCasing(e) {
    if (!e.keyAsName) return e.name;
    const t = e.table[p.Symbol.Schema] ?? "public", s = e.table[p.Symbol.OriginalName], n = `${t}.${s}.${e.name}`;
    return this.cache[n] || this.cacheTable(e.table), this.cache[n];
  }
  cacheTable(e) {
    const t = e[p.Symbol.Schema] ?? "public", s = e[p.Symbol.OriginalName], n = `${t}.${s}`;
    if (!this.cachedTables[n]) {
      for (const i of Object.values(e[p.Symbol.Columns])) {
        const l = `${n}.${i.name}`;
        this.cache[l] = this.convert(i.name);
      }
      this.cachedTables[n] = !0;
    }
  }
  clearCache() {
    this.cache = {}, this.cachedTables = {};
  }
}
o(Zi, pn, "CasingCache");
var gn, yn;
class rt extends (yn = Error, gn = m, yn) {
  constructor({ message: e, cause: t }) {
    super(e), this.name = "DrizzleError", this.cause = t;
  }
}
o(rt, gn, "DrizzleError");
class ae extends Error {
  constructor(e, t, s) {
    super(`Failed query: ${e}
params: ${t}`), this.query = e, this.params = t, this.cause = s, Error.captureStackTrace(this, ae), s && (this.cause = s);
  }
}
var bn, Sn;
class eo extends (Sn = rt, bn = m, Sn) {
  constructor() {
    super({ message: "Rollback" });
  }
}
o(eo, bn, "TransactionRollbackError");
var wn, vn;
class nt extends (vn = be, wn = m, vn) {
}
o(nt, wn, "SQLiteViewBase");
var Nn;
Nn = m;
class ke {
  constructor(e) {
    /** @internal */
    o(this, "casing");
    this.casing = new Zi(e == null ? void 0 : e.casing);
  }
  escapeName(e) {
    return `"${e}"`;
  }
  escapeParam(e) {
    return "?";
  }
  escapeString(e) {
    return `'${e.replace(/'/g, "''")}'`;
  }
  buildWithCTE(e) {
    if (!(e != null && e.length)) return;
    const t = [u`with `];
    for (const [s, n] of e.entries())
      t.push(u`${u.identifier(n._.alias)} as (${n._.sql})`), s < e.length - 1 && t.push(u`, `);
    return t.push(u` `), u.join(t);
  }
  buildDeleteQuery({ table: e, where: t, returning: s, withList: n, limit: i, orderBy: l }) {
    const a = this.buildWithCTE(n), c = s ? u` returning ${this.buildSelection(s, { isSingleTable: !0 })}` : void 0, d = t ? u` where ${t}` : void 0, h = this.buildOrderBy(l), y = this.buildLimit(i);
    return u`${a}delete from ${e}${d}${c}${h}${y}`;
  }
  buildUpdateSet(e, t) {
    const s = e[p.Symbol.Columns], n = Object.keys(s).filter(
      (l) => {
        var a;
        return t[l] !== void 0 || ((a = s[l]) == null ? void 0 : a.onUpdateFn) !== void 0;
      }
    ), i = n.length;
    return u.join(n.flatMap((l, a) => {
      var g;
      const c = s[l], d = (g = c.onUpdateFn) == null ? void 0 : g.call(c), h = t[l] ?? (f(d, b) ? d : u.param(d, c)), y = u`${u.identifier(this.casing.getColumnCasing(c))} = ${h}`;
      return a < i - 1 ? [y, u.raw(", ")] : [y];
    }));
  }
  buildUpdateQuery({ table: e, set: t, where: s, returning: n, withList: i, joins: l, from: a, limit: c, orderBy: d }) {
    const h = this.buildWithCTE(i), y = this.buildUpdateSet(e, t), g = a && u.join([u.raw(" from "), this.buildFromTable(a)]), v = this.buildJoins(l), T = n ? u` returning ${this.buildSelection(n, { isSingleTable: !0 })}` : void 0, S = s ? u` where ${s}` : void 0, $ = this.buildOrderBy(d), B = this.buildLimit(c);
    return u`${h}update ${e} set ${y}${g}${v}${S}${T}${$}${B}`;
  }
  /**
   * Builds selection SQL with provided fields/expressions
   *
   * Examples:
   *
   * `select <selection> from`
   *
   * `insert ... returning <selection>`
   *
   * If `isSingleTable` is true, then columns won't be prefixed with table name
   */
  buildSelection(e, { isSingleTable: t = !1 } = {}) {
    const s = e.length, n = e.flatMap(({ field: i }, l) => {
      const a = [];
      if (f(i, b.Aliased) && i.isSelectionField)
        a.push(u.identifier(i.fieldAlias));
      else if (f(i, b.Aliased) || f(i, b)) {
        const c = f(i, b.Aliased) ? i.sql : i;
        t ? a.push(
          new b(
            c.queryChunks.map((d) => f(d, E) ? u.identifier(this.casing.getColumnCasing(d)) : d)
          )
        ) : a.push(c), f(i, b.Aliased) && a.push(u` as ${u.identifier(i.fieldAlias)}`);
      } else if (f(i, E)) {
        const c = i.table[p.Symbol.Name];
        i.columnType === "SQLiteNumericBigInt" ? t ? a.push(u`cast(${u.identifier(this.casing.getColumnCasing(i))} as text)`) : a.push(
          u`cast(${u.identifier(c)}.${u.identifier(this.casing.getColumnCasing(i))} as text)`
        ) : t ? a.push(u.identifier(this.casing.getColumnCasing(i))) : a.push(u`${u.identifier(c)}.${u.identifier(this.casing.getColumnCasing(i))}`);
      } else if (f(i, F)) {
        const c = Object.entries(i._.selectedFields);
        if (c.length === 1) {
          const d = c[0][1], h = f(d, b) ? d.decoder : f(d, E) ? { mapFromDriverValue: (y) => d.mapFromDriverValue(y) } : d.sql.decoder;
          h && (i._.sql.decoder = h);
        }
        a.push(i);
      }
      return l < s - 1 && a.push(u`, `), a;
    });
    return u.join(n);
  }
  buildJoins(e) {
    if (!e || e.length === 0)
      return;
    const t = [];
    if (e)
      for (const [s, n] of e.entries()) {
        s === 0 && t.push(u` `);
        const i = n.table, l = n.on ? u` on ${n.on}` : void 0;
        if (f(i, H)) {
          const a = i[H.Symbol.Name], c = i[H.Symbol.Schema], d = i[H.Symbol.OriginalName], h = a === d ? void 0 : n.alias;
          t.push(
            u`${u.raw(n.joinType)} join ${c ? u`${u.identifier(c)}.` : void 0}${u.identifier(d)}${h && u` ${u.identifier(h)}`}${l}`
          );
        } else
          t.push(
            u`${u.raw(n.joinType)} join ${i}${l}`
          );
        s < e.length - 1 && t.push(u` `);
      }
    return u.join(t);
  }
  buildLimit(e) {
    return typeof e == "object" || typeof e == "number" && e >= 0 ? u` limit ${e}` : void 0;
  }
  buildOrderBy(e) {
    const t = [];
    if (e)
      for (const [s, n] of e.entries())
        t.push(n), s < e.length - 1 && t.push(u`, `);
    return t.length > 0 ? u` order by ${u.join(t)}` : void 0;
  }
  buildFromTable(e) {
    return f(e, p) && e[p.Symbol.IsAlias] ? u`${u`${u.identifier(e[p.Symbol.Schema] ?? "")}.`.if(e[p.Symbol.Schema])}${u.identifier(e[p.Symbol.OriginalName])} ${u.identifier(e[p.Symbol.Name])}` : e;
  }
  buildSelectQuery({
    withList: e,
    fields: t,
    fieldsFlat: s,
    where: n,
    having: i,
    table: l,
    joins: a,
    orderBy: c,
    groupBy: d,
    limit: h,
    offset: y,
    distinct: g,
    setOperators: v
  }) {
    const T = s ?? ge(t);
    for (const ee of T)
      if (f(ee.field, E) && Te(ee.field.table) !== (f(l, F) ? l._.alias : f(l, nt) ? l[K].name : f(l, b) ? void 0 : Te(l)) && !((te) => a == null ? void 0 : a.some(
        ({ alias: Re }) => Re === (te[p.Symbol.IsAlias] ? Te(te) : te[p.Symbol.BaseName])
      ))(ee.field.table)) {
        const te = Te(ee.field.table);
        throw new Error(
          `Your "${ee.path.join("->")}" field references a column "${te}"."${ee.field.name}", but the table "${te}" is not part of the query! Did you forget to join it?`
        );
      }
    const S = !a || a.length === 0, $ = this.buildWithCTE(e), B = g ? u` distinct` : void 0, q = this.buildSelection(T, { isSingleTable: S }), D = this.buildFromTable(l), N = this.buildJoins(a), A = n ? u` where ${n}` : void 0, z = i ? u` having ${i}` : void 0, w = [];
    if (d)
      for (const [ee, te] of d.entries())
        w.push(te), ee < d.length - 1 && w.push(u`, `);
    const C = w.length > 0 ? u` group by ${u.join(w)}` : void 0, J = this.buildOrderBy(c), Oe = this.buildLimit(h), dt = y ? u` offset ${y}` : void 0, ve = u`${$}select${B} ${q} from ${D}${N}${A}${C}${z}${J}${Oe}${dt}`;
    return v.length > 0 ? this.buildSetOperations(ve, v) : ve;
  }
  buildSetOperations(e, t) {
    const [s, ...n] = t;
    if (!s)
      throw new Error("Cannot pass undefined values to any set operator");
    return n.length === 0 ? this.buildSetOperationQuery({ leftSelect: e, setOperator: s }) : this.buildSetOperations(
      this.buildSetOperationQuery({ leftSelect: e, setOperator: s }),
      n
    );
  }
  buildSetOperationQuery({
    leftSelect: e,
    setOperator: { type: t, isAll: s, rightSelect: n, limit: i, orderBy: l, offset: a }
  }) {
    const c = u`${e.getSQL()} `, d = u`${n.getSQL()}`;
    let h;
    if (l && l.length > 0) {
      const T = [];
      for (const S of l)
        if (f(S, k))
          T.push(u.identifier(S.name));
        else if (f(S, b)) {
          for (let $ = 0; $ < S.queryChunks.length; $++) {
            const B = S.queryChunks[$];
            f(B, k) && (S.queryChunks[$] = u.identifier(this.casing.getColumnCasing(B)));
          }
          T.push(u`${S}`);
        } else
          T.push(u`${S}`);
      h = u` order by ${u.join(T, u`, `)}`;
    }
    const y = typeof i == "object" || typeof i == "number" && i >= 0 ? u` limit ${i}` : void 0, g = u.raw(`${t} ${s ? "all " : ""}`), v = a ? u` offset ${a}` : void 0;
    return u`${c}${g}${d}${h}${y}${v}`;
  }
  buildInsertQuery({ table: e, values: t, onConflict: s, returning: n, withList: i, select: l }) {
    const a = [], c = e[p.Symbol.Columns], d = Object.entries(c).filter(
      ([S, $]) => !$.shouldDisableInsert()
    ), h = d.map(([, S]) => u.identifier(this.casing.getColumnCasing(S)));
    if (l) {
      const S = t;
      f(S, b) ? a.push(S) : a.push(S.getSQL());
    } else {
      const S = t;
      a.push(u.raw("values "));
      for (const [$, B] of S.entries()) {
        const q = [];
        for (const [D, N] of d) {
          const A = B[D];
          if (A === void 0 || f(A, ie) && A.value === void 0) {
            let z;
            if (N.default !== null && N.default !== void 0)
              z = f(N.default, b) ? N.default : u.param(N.default, N);
            else if (N.defaultFn !== void 0) {
              const w = N.defaultFn();
              z = f(w, b) ? w : u.param(w, N);
            } else if (!N.default && N.onUpdateFn !== void 0) {
              const w = N.onUpdateFn();
              z = f(w, b) ? w : u.param(w, N);
            } else
              z = u`null`;
            q.push(z);
          } else
            q.push(A);
        }
        a.push(q), $ < S.length - 1 && a.push(u`, `);
      }
    }
    const y = this.buildWithCTE(i), g = u.join(a), v = n ? u` returning ${this.buildSelection(n, { isSingleTable: !0 })}` : void 0, T = s != null && s.length ? u.join(s) : void 0;
    return u`${y}insert into ${e} ${h} ${g}${T}${v}`;
  }
  sqlToQuery(e, t) {
    return e.toQuery({
      casing: this.casing,
      escapeName: this.escapeName,
      escapeParam: this.escapeParam,
      escapeString: this.escapeString,
      invokeSource: t
    });
  }
  buildRelationalQuery({
    fullSchema: e,
    schema: t,
    tableNamesMap: s,
    table: n,
    tableConfig: i,
    queryConfig: l,
    tableAlias: a,
    nestedQueryRelation: c,
    joinOn: d
  }) {
    let h = [], y, g, v = [], T;
    const S = [];
    if (l === !0)
      h = Object.entries(i.columns).map(([q, D]) => ({
        dbKey: D.name,
        tsKey: q,
        field: se(D, a),
        relationTableTsKey: void 0,
        isJson: !1,
        selection: []
      }));
    else {
      const B = Object.fromEntries(
        Object.entries(i.columns).map(([w, C]) => [w, se(C, a)])
      );
      if (l.where) {
        const w = typeof l.where == "function" ? l.where(B, ca()) : l.where;
        T = w && Ue(w, a);
      }
      const q = [];
      let D = [];
      if (l.columns) {
        let w = !1;
        for (const [C, J] of Object.entries(l.columns))
          J !== void 0 && C in i.columns && (!w && J === !0 && (w = !0), D.push(C));
        D.length > 0 && (D = w ? D.filter((C) => {
          var J;
          return ((J = l.columns) == null ? void 0 : J[C]) === !0;
        }) : Object.keys(i.columns).filter((C) => !D.includes(C)));
      } else
        D = Object.keys(i.columns);
      for (const w of D) {
        const C = i.columns[w];
        q.push({ tsKey: w, value: C });
      }
      let N = [];
      l.with && (N = Object.entries(l.with).filter((w) => !!w[1]).map(([w, C]) => ({ tsKey: w, queryConfig: C, relation: i.relations[w] })));
      let A;
      if (l.extras) {
        A = typeof l.extras == "function" ? l.extras(B, { sql: u }) : l.extras;
        for (const [w, C] of Object.entries(A))
          q.push({
            tsKey: w,
            value: $i(C, a)
          });
      }
      for (const { tsKey: w, value: C } of q)
        h.push({
          dbKey: f(C, b.Aliased) ? C.fieldAlias : i.columns[w].name,
          tsKey: w,
          field: f(C, E) ? se(C, a) : C,
          relationTableTsKey: void 0,
          isJson: !1,
          selection: []
        });
      let z = typeof l.orderBy == "function" ? l.orderBy(B, ua()) : l.orderBy ?? [];
      Array.isArray(z) || (z = [z]), v = z.map((w) => f(w, E) ? se(w, a) : Ue(w, a)), y = l.limit, g = l.offset;
      for (const {
        tsKey: w,
        queryConfig: C,
        relation: J
      } of N) {
        const Oe = ma(t, s, J), dt = _e(J.referencedTable), ve = s[dt], ee = `${a}_${w}`, te = Qe(
          ...Oe.fields.map(
            (To, $o) => _(
              se(Oe.references[$o], ee),
              se(To, a)
            )
          )
        ), Re = this.buildRelationalQuery({
          fullSchema: e,
          schema: t,
          tableNamesMap: s,
          table: e[ve],
          tableConfig: t[ve],
          queryConfig: f(J, ye) ? C === !0 ? { limit: 1 } : { ...C, limit: 1 } : C,
          tableAlias: ee,
          joinOn: te,
          nestedQueryRelation: J
        }), No = u`(${Re.sql})`.as(w);
        h.push({
          dbKey: w,
          tsKey: w,
          field: No,
          relationTableTsKey: ve,
          isJson: !0,
          selection: Re.selection
        });
      }
    }
    if (h.length === 0)
      throw new rt({
        message: `No fields selected for table "${i.tsName}" ("${a}"). You need to have at least one item in "columns", "with" or "extras". If you need to select all columns, omit the "columns" key or set it to undefined.`
      });
    let $;
    if (T = Qe(d, T), c) {
      let B = u`json_array(${u.join(
        h.map(
          ({ field: N }) => f(N, k) ? u.identifier(this.casing.getColumnCasing(N)) : f(N, b.Aliased) ? N.sql : N
        ),
        u`, `
      )})`;
      f(c, ze) && (B = u`coalesce(json_group_array(${B}), json_array())`);
      const q = [{
        dbKey: "data",
        tsKey: "data",
        field: B.as("data"),
        isJson: !0,
        relationTableTsKey: i.tsName,
        selection: h
      }];
      y !== void 0 || g !== void 0 || v.length > 0 ? ($ = this.buildSelectQuery({
        table: mt(n, a),
        fields: {},
        fieldsFlat: [
          {
            path: [],
            field: u.raw("*")
          }
        ],
        where: T,
        limit: y,
        offset: g,
        orderBy: v,
        setOperators: []
      }), T = void 0, y = void 0, g = void 0, v = void 0) : $ = mt(n, a), $ = this.buildSelectQuery({
        table: f($, H) ? $ : new F($, {}, a),
        fields: {},
        fieldsFlat: q.map(({ field: N }) => ({
          path: [],
          field: f(N, E) ? se(N, a) : N
        })),
        joins: S,
        where: T,
        limit: y,
        offset: g,
        orderBy: v,
        setOperators: []
      });
    } else
      $ = this.buildSelectQuery({
        table: mt(n, a),
        fields: {},
        fieldsFlat: h.map(({ field: B }) => ({
          path: [],
          field: f(B, E) ? se(B, a) : B
        })),
        joins: S,
        where: T,
        limit: y,
        offset: g,
        orderBy: v,
        setOperators: []
      });
    return {
      tableTsKey: i.tsName,
      sql: $,
      selection: h
    };
  }
}
o(ke, Nn, "SQLiteDialect");
var Tn, $n;
class At extends ($n = ke, Tn = m, $n) {
  migrate(e, t, s) {
    const n = s === void 0 || typeof s == "string" ? "__drizzle_migrations" : s.migrationsTable ?? "__drizzle_migrations", i = u`
			CREATE TABLE IF NOT EXISTS ${u.identifier(n)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
    t.run(i);
    const a = t.values(
      u`SELECT id, hash, created_at FROM ${u.identifier(n)} ORDER BY created_at DESC LIMIT 1`
    )[0] ?? void 0;
    t.run(u`BEGIN`);
    try {
      for (const c of e)
        if (!a || Number(a[2]) < c.folderMillis) {
          for (const d of c.sql)
            t.run(u.raw(d));
          t.run(
            u`INSERT INTO ${u.identifier(n)} ("hash", "created_at") VALUES(${c.hash}, ${c.folderMillis})`
          );
        }
      t.run(u`COMMIT`);
    } catch (c) {
      throw t.run(u`ROLLBACK`), c;
    }
  }
}
o(At, Tn, "SQLiteSyncDialect");
var Cn;
Cn = m;
class to {
  /** @internal */
  getSelectedFields() {
    return this._.selectedFields;
  }
}
o(to, Cn, "TypedQueryBuilder");
var Bn;
Bn = m;
class re {
  constructor(e) {
    o(this, "fields");
    o(this, "session");
    o(this, "dialect");
    o(this, "withList");
    o(this, "distinct");
    this.fields = e.fields, this.session = e.session, this.dialect = e.dialect, this.withList = e.withList, this.distinct = e.distinct;
  }
  from(e) {
    const t = !!this.fields;
    let s;
    return this.fields ? s = this.fields : f(e, F) ? s = Object.fromEntries(
      Object.keys(e._.selectedFields).map((n) => [n, e[n]])
    ) : f(e, nt) ? s = e[K].selectedFields : f(e, b) ? s = {} : s = Fo(e), new Ot({
      table: e,
      fields: s,
      isPartialSelect: t,
      session: this.session,
      dialect: this.dialect,
      withList: this.withList,
      distinct: this.distinct
    });
  }
}
o(re, Bn, "SQLiteSelectBuilder");
var xn, In;
class so extends (In = to, xn = m, In) {
  constructor({ table: t, fields: s, isPartialSelect: n, session: i, dialect: l, withList: a, distinct: c }) {
    super();
    o(this, "_");
    /** @internal */
    o(this, "config");
    o(this, "joinsNotNullableMap");
    o(this, "tableName");
    o(this, "isPartialSelect");
    o(this, "session");
    o(this, "dialect");
    o(this, "cacheConfig");
    o(this, "usedTables", /* @__PURE__ */ new Set());
    /**
     * Executes a `left join` operation by adding another table to the current query.
     *
     * Calling this method associates each row of the table with the corresponding row from the joined table, if a match is found. If no matching row exists, it sets all columns of the joined table to null.
     *
     * See docs: {@link https://orm.drizzle.team/docs/joins#left-join}
     *
     * @param table the table to join.
     * @param on the `on` clause.
     *
     * @example
     *
     * ```ts
     * // Select all users and their pets
     * const usersWithPets: { user: User; pets: Pet | null; }[] = await db.select()
     *   .from(users)
     *   .leftJoin(pets, eq(users.id, pets.ownerId))
     *
     * // Select userId and petId
     * const usersIdsAndPetIds: { userId: number; petId: number | null; }[] = await db.select({
     *   userId: users.id,
     *   petId: pets.id,
     * })
     *   .from(users)
     *   .leftJoin(pets, eq(users.id, pets.ownerId))
     * ```
     */
    o(this, "leftJoin", this.createJoin("left"));
    /**
     * Executes a `right join` operation by adding another table to the current query.
     *
     * Calling this method associates each row of the joined table with the corresponding row from the main table, if a match is found. If no matching row exists, it sets all columns of the main table to null.
     *
     * See docs: {@link https://orm.drizzle.team/docs/joins#right-join}
     *
     * @param table the table to join.
     * @param on the `on` clause.
     *
     * @example
     *
     * ```ts
     * // Select all users and their pets
     * const usersWithPets: { user: User | null; pets: Pet; }[] = await db.select()
     *   .from(users)
     *   .rightJoin(pets, eq(users.id, pets.ownerId))
     *
     * // Select userId and petId
     * const usersIdsAndPetIds: { userId: number | null; petId: number; }[] = await db.select({
     *   userId: users.id,
     *   petId: pets.id,
     * })
     *   .from(users)
     *   .rightJoin(pets, eq(users.id, pets.ownerId))
     * ```
     */
    o(this, "rightJoin", this.createJoin("right"));
    /**
     * Executes an `inner join` operation, creating a new table by combining rows from two tables that have matching values.
     *
     * Calling this method retrieves rows that have corresponding entries in both joined tables. Rows without matching entries in either table are excluded, resulting in a table that includes only matching pairs.
     *
     * See docs: {@link https://orm.drizzle.team/docs/joins#inner-join}
     *
     * @param table the table to join.
     * @param on the `on` clause.
     *
     * @example
     *
     * ```ts
     * // Select all users and their pets
     * const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
     *   .from(users)
     *   .innerJoin(pets, eq(users.id, pets.ownerId))
     *
     * // Select userId and petId
     * const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
     *   userId: users.id,
     *   petId: pets.id,
     * })
     *   .from(users)
     *   .innerJoin(pets, eq(users.id, pets.ownerId))
     * ```
     */
    o(this, "innerJoin", this.createJoin("inner"));
    /**
     * Executes a `full join` operation by combining rows from two tables into a new table.
     *
     * Calling this method retrieves all rows from both main and joined tables, merging rows with matching values and filling in `null` for non-matching columns.
     *
     * See docs: {@link https://orm.drizzle.team/docs/joins#full-join}
     *
     * @param table the table to join.
     * @param on the `on` clause.
     *
     * @example
     *
     * ```ts
     * // Select all users and their pets
     * const usersWithPets: { user: User | null; pets: Pet | null; }[] = await db.select()
     *   .from(users)
     *   .fullJoin(pets, eq(users.id, pets.ownerId))
     *
     * // Select userId and petId
     * const usersIdsAndPetIds: { userId: number | null; petId: number | null; }[] = await db.select({
     *   userId: users.id,
     *   petId: pets.id,
     * })
     *   .from(users)
     *   .fullJoin(pets, eq(users.id, pets.ownerId))
     * ```
     */
    o(this, "fullJoin", this.createJoin("full"));
    /**
     * Executes a `cross join` operation by combining rows from two tables into a new table.
     *
     * Calling this method retrieves all rows from both main and joined tables, merging all rows from each table.
     *
     * See docs: {@link https://orm.drizzle.team/docs/joins#cross-join}
     *
     * @param table the table to join.
     *
     * @example
     *
     * ```ts
     * // Select all users, each user with every pet
     * const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
     *   .from(users)
     *   .crossJoin(pets)
     *
     * // Select userId and petId
     * const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
     *   userId: users.id,
     *   petId: pets.id,
     * })
     *   .from(users)
     *   .crossJoin(pets)
     * ```
     */
    o(this, "crossJoin", this.createJoin("cross"));
    /**
     * Adds `union` set operator to the query.
     *
     * Calling this method will combine the result sets of the `select` statements and remove any duplicate rows that appear across them.
     *
     * See docs: {@link https://orm.drizzle.team/docs/set-operations#union}
     *
     * @example
     *
     * ```ts
     * // Select all unique names from customers and users tables
     * await db.select({ name: users.name })
     *   .from(users)
     *   .union(
     *     db.select({ name: customers.name }).from(customers)
     *   );
     * // or
     * import { union } from 'drizzle-orm/sqlite-core'
     *
     * await union(
     *   db.select({ name: users.name }).from(users),
     *   db.select({ name: customers.name }).from(customers)
     * );
     * ```
     */
    o(this, "union", this.createSetOperator("union", !1));
    /**
     * Adds `union all` set operator to the query.
     *
     * Calling this method will combine the result-set of the `select` statements and keep all duplicate rows that appear across them.
     *
     * See docs: {@link https://orm.drizzle.team/docs/set-operations#union-all}
     *
     * @example
     *
     * ```ts
     * // Select all transaction ids from both online and in-store sales
     * await db.select({ transaction: onlineSales.transactionId })
     *   .from(onlineSales)
     *   .unionAll(
     *     db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
     *   );
     * // or
     * import { unionAll } from 'drizzle-orm/sqlite-core'
     *
     * await unionAll(
     *   db.select({ transaction: onlineSales.transactionId }).from(onlineSales),
     *   db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
     * );
     * ```
     */
    o(this, "unionAll", this.createSetOperator("union", !0));
    /**
     * Adds `intersect` set operator to the query.
     *
     * Calling this method will retain only the rows that are present in both result sets and eliminate duplicates.
     *
     * See docs: {@link https://orm.drizzle.team/docs/set-operations#intersect}
     *
     * @example
     *
     * ```ts
     * // Select course names that are offered in both departments A and B
     * await db.select({ courseName: depA.courseName })
     *   .from(depA)
     *   .intersect(
     *     db.select({ courseName: depB.courseName }).from(depB)
     *   );
     * // or
     * import { intersect } from 'drizzle-orm/sqlite-core'
     *
     * await intersect(
     *   db.select({ courseName: depA.courseName }).from(depA),
     *   db.select({ courseName: depB.courseName }).from(depB)
     * );
     * ```
     */
    o(this, "intersect", this.createSetOperator("intersect", !1));
    /**
     * Adds `except` set operator to the query.
     *
     * Calling this method will retrieve all unique rows from the left query, except for the rows that are present in the result set of the right query.
     *
     * See docs: {@link https://orm.drizzle.team/docs/set-operations#except}
     *
     * @example
     *
     * ```ts
     * // Select all courses offered in department A but not in department B
     * await db.select({ courseName: depA.courseName })
     *   .from(depA)
     *   .except(
     *     db.select({ courseName: depB.courseName }).from(depB)
     *   );
     * // or
     * import { except } from 'drizzle-orm/sqlite-core'
     *
     * await except(
     *   db.select({ courseName: depA.courseName }).from(depA),
     *   db.select({ courseName: depB.courseName }).from(depB)
     * );
     * ```
     */
    o(this, "except", this.createSetOperator("except", !1));
    this.config = {
      withList: a,
      table: t,
      fields: { ...s },
      distinct: c,
      setOperators: []
    }, this.isPartialSelect = n, this.session = i, this.dialect = l, this._ = {
      selectedFields: s,
      config: this.config
    }, this.tableName = yt(t), this.joinsNotNullableMap = typeof this.tableName == "string" ? { [this.tableName]: !0 } : {};
    for (const d of he(t)) this.usedTables.add(d);
  }
  /** @internal */
  getUsedTables() {
    return [...this.usedTables];
  }
  createJoin(t) {
    return (s, n) => {
      var a;
      const i = this.tableName, l = yt(s);
      for (const c of he(s)) this.usedTables.add(c);
      if (typeof l == "string" && ((a = this.config.joins) != null && a.some((c) => c.alias === l)))
        throw new Error(`Alias "${l}" is already used in this query`);
      if (!this.isPartialSelect && (Object.keys(this.joinsNotNullableMap).length === 1 && typeof i == "string" && (this.config.fields = {
        [i]: this.config.fields
      }), typeof l == "string" && !f(s, b))) {
        const c = f(s, F) ? s._.selectedFields : f(s, be) ? s[K].selectedFields : s[p.Symbol.Columns];
        this.config.fields[l] = c;
      }
      if (typeof n == "function" && (n = n(
        new Proxy(
          this.config.fields,
          new U({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
        )
      )), this.config.joins || (this.config.joins = []), this.config.joins.push({ on: n, table: s, joinType: t, alias: l }), typeof l == "string")
        switch (t) {
          case "left": {
            this.joinsNotNullableMap[l] = !1;
            break;
          }
          case "right": {
            this.joinsNotNullableMap = Object.fromEntries(
              Object.entries(this.joinsNotNullableMap).map(([c]) => [c, !1])
            ), this.joinsNotNullableMap[l] = !0;
            break;
          }
          case "cross":
          case "inner": {
            this.joinsNotNullableMap[l] = !0;
            break;
          }
          case "full": {
            this.joinsNotNullableMap = Object.fromEntries(
              Object.entries(this.joinsNotNullableMap).map(([c]) => [c, !1])
            ), this.joinsNotNullableMap[l] = !1;
            break;
          }
        }
      return this;
    };
  }
  createSetOperator(t, s) {
    return (n) => {
      const i = typeof n == "function" ? n(Ba()) : n;
      if (!Et(this.getSelectedFields(), i.getSelectedFields()))
        throw new Error(
          "Set operator error (union / intersect / except): selected fields are not the same or are in a different order"
        );
      return this.config.setOperators.push({ type: t, isAll: s, rightSelect: i }), this;
    };
  }
  /** @internal */
  addSetOperators(t) {
    return this.config.setOperators.push(...t), this;
  }
  /**
   * Adds a `where` clause to the query.
   *
   * Calling this method will select only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#filtering}
   *
   * @param where the `where` clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be selected.
   *
   * ```ts
   * // Select all cars with green color
   * await db.select().from(cars).where(eq(cars.color, 'green'));
   * // or
   * await db.select().from(cars).where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Select all BMW cars with a green color
   * await db.select().from(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Select all cars with the green or blue color
   * await db.select().from(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(t) {
    return typeof t == "function" && (t = t(
      new Proxy(
        this.config.fields,
        new U({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
      )
    )), this.config.where = t, this;
  }
  /**
   * Adds a `having` clause to the query.
   *
   * Calling this method will select only those rows that fulfill a specified condition. It is typically used with aggregate functions to filter the aggregated data based on a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#aggregations}
   *
   * @param having the `having` clause.
   *
   * @example
   *
   * ```ts
   * // Select all brands with more than one car
   * await db.select({
   * 	brand: cars.brand,
   * 	count: sql<number>`cast(count(${cars.id}) as int)`,
   * })
   *   .from(cars)
   *   .groupBy(cars.brand)
   *   .having(({ count }) => gt(count, 1));
   * ```
   */
  having(t) {
    return typeof t == "function" && (t = t(
      new Proxy(
        this.config.fields,
        new U({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
      )
    )), this.config.having = t, this;
  }
  groupBy(...t) {
    if (typeof t[0] == "function") {
      const s = t[0](
        new Proxy(
          this.config.fields,
          new U({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      this.config.groupBy = Array.isArray(s) ? s : [s];
    } else
      this.config.groupBy = t;
    return this;
  }
  orderBy(...t) {
    if (typeof t[0] == "function") {
      const s = t[0](
        new Proxy(
          this.config.fields,
          new U({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      ), n = Array.isArray(s) ? s : [s];
      this.config.setOperators.length > 0 ? this.config.setOperators.at(-1).orderBy = n : this.config.orderBy = n;
    } else {
      const s = t;
      this.config.setOperators.length > 0 ? this.config.setOperators.at(-1).orderBy = s : this.config.orderBy = s;
    }
    return this;
  }
  /**
   * Adds a `limit` clause to the query.
   *
   * Calling this method will set the maximum number of rows that will be returned by this query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
   *
   * @param limit the `limit` clause.
   *
   * @example
   *
   * ```ts
   * // Get the first 10 people from this query.
   * await db.select().from(people).limit(10);
   * ```
   */
  limit(t) {
    return this.config.setOperators.length > 0 ? this.config.setOperators.at(-1).limit = t : this.config.limit = t, this;
  }
  /**
   * Adds an `offset` clause to the query.
   *
   * Calling this method will skip a number of rows when returning results from this query.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
   *
   * @param offset the `offset` clause.
   *
   * @example
   *
   * ```ts
   * // Get the 10th-20th people from this query.
   * await db.select().from(people).offset(10).limit(10);
   * ```
   */
  offset(t) {
    return this.config.setOperators.length > 0 ? this.config.setOperators.at(-1).offset = t : this.config.offset = t, this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildSelectQuery(this.config);
  }
  toSQL() {
    const { typings: t, ...s } = this.dialect.sqlToQuery(this.getSQL());
    return s;
  }
  as(t) {
    const s = [];
    if (s.push(...he(this.config.table)), this.config.joins)
      for (const n of this.config.joins) s.push(...he(n.table));
    return new Proxy(
      new F(this.getSQL(), this.config.fields, t, !1, [...new Set(s)]),
      new U({ alias: t, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
    );
  }
  /** @internal */
  getSelectedFields() {
    return new Proxy(
      this.config.fields,
      new U({ alias: this.tableName, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
    );
  }
  $dynamic() {
    return this;
  }
}
o(so, xn, "SQLiteSelectQueryBuilder");
var qn, _n;
class Ot extends (_n = so, qn = m, _n) {
  constructor() {
    super(...arguments);
    o(this, "run", (t) => this._prepare().run(t));
    o(this, "all", (t) => this._prepare().all(t));
    o(this, "get", (t) => this._prepare().get(t));
    o(this, "values", (t) => this._prepare().values(t));
  }
  /** @internal */
  _prepare(t = !0) {
    if (!this.session)
      throw new Error("Cannot execute a query on a query builder. Please use a database instance instead.");
    const s = ge(this.config.fields), n = this.session[t ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      s,
      "all",
      !0,
      void 0,
      {
        type: "select",
        tables: [...this.usedTables]
      },
      this.cacheConfig
    );
    return n.joinsNotNullableMap = this.joinsNotNullableMap, n;
  }
  $withCache(t) {
    return this.cacheConfig = t === void 0 ? { config: {}, enable: !0, autoInvalidate: !0 } : t === !1 ? { enable: !1 } : { enable: !0, autoInvalidate: !0, ...t }, this;
  }
  prepare() {
    return this._prepare(!1);
  }
  async execute() {
    return this.all();
  }
}
o(Ot, qn, "SQLiteSelect");
Ko(Ot, [ue]);
function it(r, e) {
  return (t, s, ...n) => {
    const i = [s, ...n].map((l) => ({
      type: r,
      isAll: e,
      rightSelect: l
    }));
    for (const l of i)
      if (!Et(t.getSelectedFields(), l.rightSelect.getSelectedFields()))
        throw new Error(
          "Set operator error (union / intersect / except): selected fields are not the same or are in a different order"
        );
    return t.addSetOperators(i);
  };
}
const Ba = () => ({
  union: xa,
  unionAll: Ia,
  intersect: qa,
  except: _a
}), xa = it("union", !1), Ia = it("union", !0), qa = it("intersect", !1), _a = it("except", !1);
var Qn;
Qn = m;
class Rt {
  constructor(e) {
    o(this, "dialect");
    o(this, "dialectConfig");
    o(this, "$with", (e, t) => {
      const s = this;
      return { as: (i) => (typeof i == "function" && (i = i(s)), new Proxy(
        new Qt(
          i.getSQL(),
          t ?? ("getSelectedFields" in i ? i.getSelectedFields() ?? {} : {}),
          e,
          !0
        ),
        new U({ alias: e, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
      )) };
    });
    this.dialect = f(e, ke) ? e : void 0, this.dialectConfig = f(e, ke) ? void 0 : e;
  }
  with(...e) {
    const t = this;
    function s(i) {
      return new re({
        fields: i ?? void 0,
        session: void 0,
        dialect: t.getDialect(),
        withList: e
      });
    }
    function n(i) {
      return new re({
        fields: i ?? void 0,
        session: void 0,
        dialect: t.getDialect(),
        withList: e,
        distinct: !0
      });
    }
    return { select: s, selectDistinct: n };
  }
  select(e) {
    return new re({ fields: e ?? void 0, session: void 0, dialect: this.getDialect() });
  }
  selectDistinct(e) {
    return new re({
      fields: e ?? void 0,
      session: void 0,
      dialect: this.getDialect(),
      distinct: !0
    });
  }
  // Lazy load dialect to avoid circular dependency
  getDialect() {
    return this.dialect || (this.dialect = new At(this.dialectConfig)), this.dialect;
  }
}
o(Rt, Qn, "SQLiteQueryBuilder");
var En;
En = m;
class Nt {
  constructor(e, t, s, n) {
    this.table = e, this.session = t, this.dialect = s, this.withList = n;
  }
  values(e) {
    if (e = Array.isArray(e) ? e : [e], e.length === 0)
      throw new Error("values() must be called with at least one value");
    const t = e.map((s) => {
      const n = {}, i = this.table[p.Symbol.Columns];
      for (const l of Object.keys(s)) {
        const a = s[l];
        n[l] = f(a, b) ? a : new ie(a, i[l]);
      }
      return n;
    });
    return new Tt(this.table, t, this.session, this.dialect, this.withList);
  }
  select(e) {
    const t = typeof e == "function" ? e(new Rt()) : e;
    if (!f(t, b) && !Et(this.table[gt], t._.selectedFields))
      throw new Error(
        "Insert select error: selected fields are not the same or are in a different order compared to the table definition"
      );
    return new Tt(this.table, t, this.session, this.dialect, this.withList, !0);
  }
}
o(Nt, En, "SQLiteInsertBuilder");
var Ln, Pn;
class Tt extends (Pn = ue, Ln = m, Pn) {
  constructor(t, s, n, i, l, a) {
    super();
    /** @internal */
    o(this, "config");
    o(this, "run", (t) => this._prepare().run(t));
    o(this, "all", (t) => this._prepare().all(t));
    o(this, "get", (t) => this._prepare().get(t));
    o(this, "values", (t) => this._prepare().values(t));
    this.session = n, this.dialect = i, this.config = { table: t, values: s, withList: l, select: a };
  }
  returning(t = this.config.table[H.Symbol.Columns]) {
    return this.config.returning = ge(t), this;
  }
  /**
   * Adds an `on conflict do nothing` clause to the query.
   *
   * Calling this method simply avoids inserting a row as its alternative action.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert#on-conflict-do-nothing}
   *
   * @param config The `target` and `where` clauses.
   *
   * @example
   * ```ts
   * // Insert one row and cancel the insert if there's a conflict
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoNothing();
   *
   * // Explicitly specify conflict target
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoNothing({ target: cars.id });
   * ```
   */
  onConflictDoNothing(t = {}) {
    if (this.config.onConflict || (this.config.onConflict = []), t.target === void 0)
      this.config.onConflict.push(u` on conflict do nothing`);
    else {
      const s = Array.isArray(t.target) ? u`${t.target}` : u`${[t.target]}`, n = t.where ? u` where ${t.where}` : u``;
      this.config.onConflict.push(u` on conflict ${s} do nothing${n}`);
    }
    return this;
  }
  /**
   * Adds an `on conflict do update` clause to the query.
   *
   * Calling this method will update the existing row that conflicts with the row proposed for insertion as its alternative action.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert#upserts-and-conflicts}
   *
   * @param config The `target`, `set` and `where` clauses.
   *
   * @example
   * ```ts
   * // Update the row if there's a conflict
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoUpdate({
   *     target: cars.id,
   *     set: { brand: 'Porsche' }
   *   });
   *
   * // Upsert with 'where' clause
   * await db.insert(cars)
   *   .values({ id: 1, brand: 'BMW' })
   *   .onConflictDoUpdate({
   *     target: cars.id,
   *     set: { brand: 'newBMW' },
   *     where: sql`${cars.createdAt} > '2023-01-01'::date`,
   *   });
   * ```
   */
  onConflictDoUpdate(t) {
    if (t.where && (t.targetWhere || t.setWhere))
      throw new Error(
        'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.'
      );
    this.config.onConflict || (this.config.onConflict = []);
    const s = t.where ? u` where ${t.where}` : void 0, n = t.targetWhere ? u` where ${t.targetWhere}` : void 0, i = t.setWhere ? u` where ${t.setWhere}` : void 0, l = Array.isArray(t.target) ? u`${t.target}` : u`${[t.target]}`, a = this.dialect.buildUpdateSet(this.config.table, Si(this.config.table, t.set));
    return this.config.onConflict.push(
      u` on conflict ${l}${n} do update set ${a}${s}${i}`
    ), this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildInsertQuery(this.config);
  }
  toSQL() {
    const { typings: t, ...s } = this.dialect.sqlToQuery(this.getSQL());
    return s;
  }
  /** @internal */
  _prepare(t = !0) {
    return this.session[t ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      !0,
      void 0,
      {
        type: "insert",
        tables: he(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(!1);
  }
  async execute() {
    return this.config.returning ? this.all() : this.run();
  }
  $dynamic() {
    return this;
  }
}
o(Tt, Ln, "SQLiteInsert");
var Dn;
Dn = m;
class $t {
  constructor(e, t, s, n) {
    this.table = e, this.session = t, this.dialect = s, this.withList = n;
  }
  set(e) {
    return new ro(
      this.table,
      Si(this.table, e),
      this.session,
      this.dialect,
      this.withList
    );
  }
}
o($t, Dn, "SQLiteUpdateBuilder");
var An, On;
class ro extends (On = ue, An = m, On) {
  constructor(t, s, n, i, l) {
    super();
    /** @internal */
    o(this, "config");
    o(this, "leftJoin", this.createJoin("left"));
    o(this, "rightJoin", this.createJoin("right"));
    o(this, "innerJoin", this.createJoin("inner"));
    o(this, "fullJoin", this.createJoin("full"));
    o(this, "run", (t) => this._prepare().run(t));
    o(this, "all", (t) => this._prepare().all(t));
    o(this, "get", (t) => this._prepare().get(t));
    o(this, "values", (t) => this._prepare().values(t));
    this.session = n, this.dialect = i, this.config = { set: s, table: t, withList: l, joins: [] };
  }
  from(t) {
    return this.config.from = t, this;
  }
  createJoin(t) {
    return (s, n) => {
      const i = yt(s);
      if (typeof i == "string" && this.config.joins.some((l) => l.alias === i))
        throw new Error(`Alias "${i}" is already used in this query`);
      if (typeof n == "function") {
        const l = this.config.from ? f(s, H) ? s[p.Symbol.Columns] : f(s, F) ? s._.selectedFields : f(s, nt) ? s[K].selectedFields : void 0 : void 0;
        n = n(
          new Proxy(
            this.config.table[p.Symbol.Columns],
            new U({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          ),
          l && new Proxy(
            l,
            new U({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          )
        );
      }
      return this.config.joins.push({ on: n, table: s, joinType: t, alias: i }), this;
    };
  }
  /**
   * Adds a 'where' clause to the query.
   *
   * Calling this method will update only those rows that fulfill a specified condition.
   *
   * See docs: {@link https://orm.drizzle.team/docs/update}
   *
   * @param where the 'where' clause.
   *
   * @example
   * You can use conditional operators and `sql function` to filter the rows to be updated.
   *
   * ```ts
   * // Update all cars with green color
   * db.update(cars).set({ color: 'red' })
   *   .where(eq(cars.color, 'green'));
   * // or
   * db.update(cars).set({ color: 'red' })
   *   .where(sql`${cars.color} = 'green'`)
   * ```
   *
   * You can logically combine conditional operators with `and()` and `or()` operators:
   *
   * ```ts
   * // Update all BMW cars with a green color
   * db.update(cars).set({ color: 'red' })
   *   .where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
   *
   * // Update all cars with the green or blue color
   * db.update(cars).set({ color: 'red' })
   *   .where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
   * ```
   */
  where(t) {
    return this.config.where = t, this;
  }
  orderBy(...t) {
    if (typeof t[0] == "function") {
      const s = t[0](
        new Proxy(
          this.config.table[p.Symbol.Columns],
          new U({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      ), n = Array.isArray(s) ? s : [s];
      this.config.orderBy = n;
    } else {
      const s = t;
      this.config.orderBy = s;
    }
    return this;
  }
  limit(t) {
    return this.config.limit = t, this;
  }
  returning(t = this.config.table[H.Symbol.Columns]) {
    return this.config.returning = ge(t), this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildUpdateQuery(this.config);
  }
  toSQL() {
    const { typings: t, ...s } = this.dialect.sqlToQuery(this.getSQL());
    return s;
  }
  /** @internal */
  _prepare(t = !0) {
    return this.session[t ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      !0,
      void 0,
      {
        type: "insert",
        tables: he(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(!1);
  }
  async execute() {
    return this.config.returning ? this.all() : this.run();
  }
  $dynamic() {
    return this;
  }
}
o(ro, An, "SQLiteUpdate");
var Rn, jn, Kn;
const qe = class qe extends (Kn = b, jn = m, Rn = Symbol.toStringTag, Kn) {
  constructor(t) {
    super(qe.buildEmbeddedCount(t.source, t.filters).queryChunks);
    o(this, "sql");
    o(this, Rn, "SQLiteCountBuilderAsync");
    o(this, "session");
    this.params = t, this.session = t.session, this.sql = qe.buildCount(
      t.source,
      t.filters
    );
  }
  static buildEmbeddedCount(t, s) {
    return u`(select count(*) from ${t}${u.raw(" where ").if(s)}${s})`;
  }
  static buildCount(t, s) {
    return u`select count(*) from ${t}${u.raw(" where ").if(s)}${s}`;
  }
  then(t, s) {
    return Promise.resolve(this.session.count(this.sql)).then(
      t,
      s
    );
  }
  catch(t) {
    return this.then(void 0, t);
  }
  finally(t) {
    return this.then(
      (s) => (t == null || t(), s),
      (s) => {
        throw t == null || t(), s;
      }
    );
  }
};
o(qe, jn, "SQLiteCountBuilderAsync");
let Ct = qe;
var Fn;
Fn = m;
class no {
  constructor(e, t, s, n, i, l, a, c) {
    this.mode = e, this.fullSchema = t, this.schema = s, this.tableNamesMap = n, this.table = i, this.tableConfig = l, this.dialect = a, this.session = c;
  }
  findMany(e) {
    return this.mode === "sync" ? new Bt(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      e || {},
      "many"
    ) : new Ve(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      e || {},
      "many"
    );
  }
  findFirst(e) {
    return this.mode === "sync" ? new Bt(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      e ? { ...e, limit: 1 } : { limit: 1 },
      "first"
    ) : new Ve(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      e ? { ...e, limit: 1 } : { limit: 1 },
      "first"
    );
  }
}
o(no, Fn, "SQLiteAsyncRelationalQueryBuilder");
var Mn, zn;
class Ve extends (zn = ue, Mn = m, zn) {
  constructor(t, s, n, i, l, a, c, d, h) {
    super();
    /** @internal */
    o(this, "mode");
    this.fullSchema = t, this.schema = s, this.tableNamesMap = n, this.table = i, this.tableConfig = l, this.dialect = a, this.session = c, this.config = d, this.mode = h;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildRelationalQuery({
      fullSchema: this.fullSchema,
      schema: this.schema,
      tableNamesMap: this.tableNamesMap,
      table: this.table,
      tableConfig: this.tableConfig,
      queryConfig: this.config,
      tableAlias: this.tableConfig.tsName
    }).sql;
  }
  /** @internal */
  _prepare(t = !1) {
    const { query: s, builtQuery: n } = this._toSQL();
    return this.session[t ? "prepareOneTimeQuery" : "prepareQuery"](
      n,
      void 0,
      this.mode === "first" ? "get" : "all",
      !0,
      (i, l) => {
        const a = i.map(
          (c) => St(this.schema, this.tableConfig, c, s.selection, l)
        );
        return this.mode === "first" ? a[0] : a;
      }
    );
  }
  prepare() {
    return this._prepare(!1);
  }
  _toSQL() {
    const t = this.dialect.buildRelationalQuery({
      fullSchema: this.fullSchema,
      schema: this.schema,
      tableNamesMap: this.tableNamesMap,
      table: this.table,
      tableConfig: this.tableConfig,
      queryConfig: this.config,
      tableAlias: this.tableConfig.tsName
    }), s = this.dialect.sqlToQuery(t.sql);
    return { query: t, builtQuery: s };
  }
  toSQL() {
    return this._toSQL().builtQuery;
  }
  /** @internal */
  executeRaw() {
    return this.mode === "first" ? this._prepare(!1).get() : this._prepare(!1).all();
  }
  async execute() {
    return this.executeRaw();
  }
}
o(Ve, Mn, "SQLiteAsyncRelationalQuery");
var Un, kn;
class Bt extends (kn = Ve, Un = m, kn) {
  sync() {
    return this.executeRaw();
  }
}
o(Bt, Un, "SQLiteSyncRelationalQuery");
var Vn, Yn;
class Be extends (Yn = ue, Vn = m, Yn) {
  constructor(t, s, n, i, l) {
    super();
    /** @internal */
    o(this, "config");
    this.execute = t, this.getSQL = s, this.dialect = i, this.mapBatchResult = l, this.config = { action: n };
  }
  getQuery() {
    return { ...this.dialect.sqlToQuery(this.getSQL()), method: this.config.action };
  }
  mapResult(t, s) {
    return s ? this.mapBatchResult(t) : t;
  }
  _prepare() {
    return this;
  }
  /** @internal */
  isResponseInArrayMode() {
    return !1;
  }
}
o(Be, Vn, "SQLiteRaw");
var Hn;
Hn = m;
class jt {
  constructor(e, t, s, n) {
    o(this, "query");
    /**
     * Creates a subquery that defines a temporary named result set as a CTE.
     *
     * It is useful for breaking down complex queries into simpler parts and for reusing the result set in subsequent parts of the query.
     *
     * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
     *
     * @param alias The alias for the subquery.
     *
     * Failure to provide an alias will result in a DrizzleTypeError, preventing the subquery from being referenced in other queries.
     *
     * @example
     *
     * ```ts
     * // Create a subquery with alias 'sq' and use it in the select query
     * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
     *
     * const result = await db.with(sq).select().from(sq);
     * ```
     *
     * To select arbitrary SQL values as fields in a CTE and reference them in other CTEs or in the main query, you need to add aliases to them:
     *
     * ```ts
     * // Select an arbitrary SQL value as a field in a CTE and reference it in the main query
     * const sq = db.$with('sq').as(db.select({
     *   name: sql<string>`upper(${users.name})`.as('name'),
     * })
     * .from(users));
     *
     * const result = await db.with(sq).select({ name: sq.name }).from(sq);
     * ```
     */
    o(this, "$with", (e, t) => {
      const s = this;
      return { as: (i) => (typeof i == "function" && (i = i(new Rt(s.dialect))), new Proxy(
        new Qt(
          i.getSQL(),
          t ?? ("getSelectedFields" in i ? i.getSelectedFields() ?? {} : {}),
          e,
          !0
        ),
        new U({ alias: e, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
      )) };
    });
    o(this, "$cache");
    this.resultKind = e, this.dialect = t, this.session = s, this._ = n ? {
      schema: n.schema,
      fullSchema: n.fullSchema,
      tableNamesMap: n.tableNamesMap
    } : {
      schema: void 0,
      fullSchema: {},
      tableNamesMap: {}
    }, this.query = {};
    const i = this.query;
    if (this._.schema)
      for (const [l, a] of Object.entries(this._.schema))
        i[l] = new no(
          e,
          n.fullSchema,
          this._.schema,
          this._.tableNamesMap,
          n.fullSchema[l],
          a,
          t,
          s
        );
    this.$cache = { invalidate: async (l) => {
    } };
  }
  $count(e, t) {
    return new Ct({ source: e, filters: t, session: this.session });
  }
  /**
   * Incorporates a previously defined CTE (using `$with`) into the main query.
   *
   * This method allows the main query to reference a temporary named result set.
   *
   * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
   *
   * @param queries The CTEs to incorporate into the main query.
   *
   * @example
   *
   * ```ts
   * // Define a subquery 'sq' as a CTE using $with
   * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
   *
   * // Incorporate the CTE 'sq' into the main query and select from it
   * const result = await db.with(sq).select().from(sq);
   * ```
   */
  with(...e) {
    const t = this;
    function s(c) {
      return new re({
        fields: c ?? void 0,
        session: t.session,
        dialect: t.dialect,
        withList: e
      });
    }
    function n(c) {
      return new re({
        fields: c ?? void 0,
        session: t.session,
        dialect: t.dialect,
        withList: e,
        distinct: !0
      });
    }
    function i(c) {
      return new $t(c, t.session, t.dialect, e);
    }
    function l(c) {
      return new Nt(c, t.session, t.dialect, e);
    }
    function a(c) {
      return new vt(c, t.session, t.dialect, e);
    }
    return { select: s, selectDistinct: n, update: i, insert: l, delete: a };
  }
  select(e) {
    return new re({ fields: e ?? void 0, session: this.session, dialect: this.dialect });
  }
  selectDistinct(e) {
    return new re({
      fields: e ?? void 0,
      session: this.session,
      dialect: this.dialect,
      distinct: !0
    });
  }
  /**
   * Creates an update query.
   *
   * Calling this method without `.where()` clause will update all rows in a table. The `.where()` clause specifies which rows should be updated.
   *
   * Use `.set()` method to specify which values to update.
   *
   * See docs: {@link https://orm.drizzle.team/docs/update}
   *
   * @param table The table to update.
   *
   * @example
   *
   * ```ts
   * // Update all rows in the 'cars' table
   * await db.update(cars).set({ color: 'red' });
   *
   * // Update rows with filters and conditions
   * await db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
   *
   * // Update with returning clause
   * const updatedCar: Car[] = await db.update(cars)
   *   .set({ color: 'red' })
   *   .where(eq(cars.id, 1))
   *   .returning();
   * ```
   */
  update(e) {
    return new $t(e, this.session, this.dialect);
  }
  /**
   * Creates an insert query.
   *
   * Calling this method will create new rows in a table. Use `.values()` method to specify which values to insert.
   *
   * See docs: {@link https://orm.drizzle.team/docs/insert}
   *
   * @param table The table to insert into.
   *
   * @example
   *
   * ```ts
   * // Insert one row
   * await db.insert(cars).values({ brand: 'BMW' });
   *
   * // Insert multiple rows
   * await db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
   *
   * // Insert with returning clause
   * const insertedCar: Car[] = await db.insert(cars)
   *   .values({ brand: 'BMW' })
   *   .returning();
   * ```
   */
  insert(e) {
    return new Nt(e, this.session, this.dialect);
  }
  /**
   * Creates a delete query.
   *
   * Calling this method without `.where()` clause will delete all rows in a table. The `.where()` clause specifies which rows should be deleted.
   *
   * See docs: {@link https://orm.drizzle.team/docs/delete}
   *
   * @param table The table to delete from.
   *
   * @example
   *
   * ```ts
   * // Delete all rows in the 'cars' table
   * await db.delete(cars);
   *
   * // Delete rows with filters and conditions
   * await db.delete(cars).where(eq(cars.color, 'green'));
   *
   * // Delete with returning clause
   * const deletedCar: Car[] = await db.delete(cars)
   *   .where(eq(cars.id, 1))
   *   .returning();
   * ```
   */
  delete(e) {
    return new vt(e, this.session, this.dialect);
  }
  run(e) {
    const t = typeof e == "string" ? u.raw(e) : e.getSQL();
    return this.resultKind === "async" ? new Be(
      async () => this.session.run(t),
      () => t,
      "run",
      this.dialect,
      this.session.extractRawRunValueFromBatchResult.bind(this.session)
    ) : this.session.run(t);
  }
  all(e) {
    const t = typeof e == "string" ? u.raw(e) : e.getSQL();
    return this.resultKind === "async" ? new Be(
      async () => this.session.all(t),
      () => t,
      "all",
      this.dialect,
      this.session.extractRawAllValueFromBatchResult.bind(this.session)
    ) : this.session.all(t);
  }
  get(e) {
    const t = typeof e == "string" ? u.raw(e) : e.getSQL();
    return this.resultKind === "async" ? new Be(
      async () => this.session.get(t),
      () => t,
      "get",
      this.dialect,
      this.session.extractRawGetValueFromBatchResult.bind(this.session)
    ) : this.session.get(t);
  }
  values(e) {
    const t = typeof e == "string" ? u.raw(e) : e.getSQL();
    return this.resultKind === "async" ? new Be(
      async () => this.session.values(t),
      () => t,
      "values",
      this.dialect,
      this.session.extractRawValuesValueFromBatchResult.bind(this.session)
    ) : this.session.values(t);
  }
  transaction(e, t) {
    return this.session.transaction(e, t);
  }
}
o(jt, Hn, "BaseSQLiteDatabase");
var Jn;
Jn = m;
class io {
}
o(io, Jn, "Cache");
var Wn, Gn;
class Kt extends (Gn = io, Wn = m, Gn) {
  strategy() {
    return "all";
  }
  async get(e) {
  }
  async put(e, t, s, n) {
  }
  async onMutate(e) {
  }
}
o(Kt, Wn, "NoopCache");
async function rs(r, e) {
  const t = `${r}-${JSON.stringify(e)}`, n = new TextEncoder().encode(t), i = await crypto.subtle.digest("SHA-256", n);
  return [...new Uint8Array(i)].map((c) => c.toString(16).padStart(2, "0")).join("");
}
var Xn, Zn;
class oo extends (Zn = ue, Xn = m, Zn) {
  constructor(e) {
    super(), this.resultCb = e;
  }
  async execute() {
    return this.resultCb();
  }
  sync() {
    return this.resultCb();
  }
}
o(oo, Xn, "ExecuteResultSync");
var ei;
ei = m;
class ao {
  constructor(e, t, s, n, i, l) {
    /** @internal */
    o(this, "joinsNotNullableMap");
    var a;
    this.mode = e, this.executeMethod = t, this.query = s, this.cache = n, this.queryMetadata = i, this.cacheConfig = l, n && n.strategy() === "all" && l === void 0 && (this.cacheConfig = { enable: !0, autoInvalidate: !0 }), (a = this.cacheConfig) != null && a.enable || (this.cacheConfig = void 0);
  }
  /** @internal */
  async queryWithCache(e, t, s) {
    if (this.cache === void 0 || f(this.cache, Kt) || this.queryMetadata === void 0)
      try {
        return await s();
      } catch (n) {
        throw new ae(e, t, n);
      }
    if (this.cacheConfig && !this.cacheConfig.enable)
      try {
        return await s();
      } catch (n) {
        throw new ae(e, t, n);
      }
    if ((this.queryMetadata.type === "insert" || this.queryMetadata.type === "update" || this.queryMetadata.type === "delete") && this.queryMetadata.tables.length > 0)
      try {
        const [n] = await Promise.all([
          s(),
          this.cache.onMutate({ tables: this.queryMetadata.tables })
        ]);
        return n;
      } catch (n) {
        throw new ae(e, t, n);
      }
    if (!this.cacheConfig)
      try {
        return await s();
      } catch (n) {
        throw new ae(e, t, n);
      }
    if (this.queryMetadata.type === "select") {
      const n = await this.cache.get(
        this.cacheConfig.tag ?? await rs(e, t),
        this.queryMetadata.tables,
        this.cacheConfig.tag !== void 0,
        this.cacheConfig.autoInvalidate
      );
      if (n === void 0) {
        let i;
        try {
          i = await s();
        } catch (l) {
          throw new ae(e, t, l);
        }
        return await this.cache.put(
          this.cacheConfig.tag ?? await rs(e, t),
          i,
          // make sure we send tables that were used in a query only if user wants to invalidate it on each write
          this.cacheConfig.autoInvalidate ? this.queryMetadata.tables : [],
          this.cacheConfig.tag !== void 0,
          this.cacheConfig.config
        ), i;
      }
      return n;
    }
    try {
      return await s();
    } catch (n) {
      throw new ae(e, t, n);
    }
  }
  getQuery() {
    return this.query;
  }
  mapRunResult(e, t) {
    return e;
  }
  mapAllResult(e, t) {
    throw new Error("Not implemented");
  }
  mapGetResult(e, t) {
    throw new Error("Not implemented");
  }
  execute(e) {
    return this.mode === "async" ? this[this.executeMethod](e) : new oo(() => this[this.executeMethod](e));
  }
  mapResult(e, t) {
    switch (this.executeMethod) {
      case "run":
        return this.mapRunResult(e, t);
      case "all":
        return this.mapAllResult(e, t);
      case "get":
        return this.mapGetResult(e, t);
    }
  }
}
o(ao, ei, "PreparedQuery");
var ti;
ti = m;
class lo {
  constructor(e) {
    this.dialect = e;
  }
  prepareOneTimeQuery(e, t, s, n, i, l, a) {
    return this.prepareQuery(
      e,
      t,
      s,
      n,
      i,
      l,
      a
    );
  }
  run(e) {
    const t = this.dialect.sqlToQuery(e);
    try {
      return this.prepareOneTimeQuery(t, void 0, "run", !1).run();
    } catch (s) {
      throw new rt({ cause: s, message: `Failed to run the query '${t.sql}'` });
    }
  }
  /** @internal */
  extractRawRunValueFromBatchResult(e) {
    return e;
  }
  all(e) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(e), void 0, "run", !1).all();
  }
  /** @internal */
  extractRawAllValueFromBatchResult(e) {
    throw new Error("Not implemented");
  }
  get(e) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(e), void 0, "run", !1).get();
  }
  /** @internal */
  extractRawGetValueFromBatchResult(e) {
    throw new Error("Not implemented");
  }
  values(e) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(e), void 0, "run", !1).values();
  }
  async count(e) {
    return (await this.values(e))[0][0];
  }
  /** @internal */
  extractRawValuesValueFromBatchResult(e) {
    throw new Error("Not implemented");
  }
}
o(lo, ti, "SQLiteSession");
var si, ri;
class co extends (ri = jt, si = m, ri) {
  constructor(e, t, s, n, i = 0) {
    super(e, t, s, n), this.schema = n, this.nestedIndex = i;
  }
  rollback() {
    throw new eo();
  }
}
o(co, si, "SQLiteTransaction");
var ni, ii;
class uo extends (ii = lo, ni = m, ii) {
  constructor(t, s, n, i = {}) {
    super(s);
    o(this, "logger");
    o(this, "cache");
    this.client = t, this.schema = n, this.logger = i.logger ?? new mi(), this.cache = i.cache ?? new Kt();
  }
  prepareQuery(t, s, n, i, l, a, c) {
    const d = this.client.prepare(t.sql);
    return new ho(
      d,
      t,
      this.logger,
      this.cache,
      a,
      c,
      s,
      n,
      i,
      l
    );
  }
  transaction(t, s = {}) {
    const n = new xt("sync", this.dialect, this, this.schema);
    return this.client.transaction(t)[s.behavior ?? "deferred"](n);
  }
}
o(uo, ni, "BetterSQLiteSession");
var oi, ai;
const Xe = class Xe extends (ai = co, oi = m, ai) {
  transaction(e) {
    const t = `sp${this.nestedIndex}`, s = new Xe("sync", this.dialect, this.session, this.schema, this.nestedIndex + 1);
    this.session.run(u.raw(`savepoint ${t}`));
    try {
      const n = e(s);
      return this.session.run(u.raw(`release savepoint ${t}`)), n;
    } catch (n) {
      throw this.session.run(u.raw(`rollback to savepoint ${t}`)), n;
    }
  }
};
o(Xe, oi, "BetterSQLiteTransaction");
let xt = Xe;
var li, ci;
class ho extends (ci = ao, li = m, ci) {
  constructor(e, t, s, n, i, l, a, c, d, h) {
    super("sync", c, t, n, i, l), this.stmt = e, this.logger = s, this.fields = a, this._isResponseInArrayMode = d, this.customResultMapper = h;
  }
  run(e) {
    const t = je(this.query.params, e ?? {});
    return this.logger.logQuery(this.query.sql, t), this.stmt.run(...t);
  }
  all(e) {
    const { fields: t, joinsNotNullableMap: s, query: n, logger: i, stmt: l, customResultMapper: a } = this;
    if (!t && !a) {
      const d = je(n.params, e ?? {});
      return i.logQuery(n.sql, d), l.all(...d);
    }
    const c = this.values(e);
    return a ? a(c) : c.map((d) => es(t, d, s));
  }
  get(e) {
    const t = je(this.query.params, e ?? {});
    this.logger.logQuery(this.query.sql, t);
    const { fields: s, stmt: n, joinsNotNullableMap: i, customResultMapper: l } = this;
    if (!s && !l)
      return n.get(...t);
    const a = n.raw().get(...t);
    if (a)
      return l ? l([a]) : es(s, a, i);
  }
  values(e) {
    const t = je(this.query.params, e ?? {});
    return this.logger.logQuery(this.query.sql, t), this.stmt.raw().all(...t);
  }
  /** @internal */
  isResponseInArrayMode() {
    return this._isResponseInArrayMode;
  }
}
o(ho, li, "BetterSQLitePreparedQuery");
var ui, di;
class fo extends (di = jt, ui = m, di) {
}
o(fo, ui, "BetterSQLite3Database");
function Ne(r, e = {}) {
  const t = new At({ casing: e.casing });
  let s;
  e.logger === !0 ? s = new fi() : e.logger !== !1 && (s = e.logger);
  let n;
  if (e.schema) {
    const a = da(
      e.schema,
      pa
    );
    n = {
      fullSchema: e.schema,
      schema: a.tables,
      tableNamesMap: a.tableNamesMap
    };
  }
  const i = new uo(r, t, n, { logger: s }), l = new fo("sync", t, i, n);
  return l.$client = r, l;
}
function It(...r) {
  if (r[0] === void 0 || typeof r[0] == "string") {
    const e = r[0] === void 0 ? new Ce() : new Ce(r[0]);
    return Ne(e, r[1]);
  }
  if (Mo(r[0])) {
    const { connection: e, client: t, ...s } = r[0];
    if (t) return Ne(t, s);
    if (typeof e == "object") {
      const { source: i, ...l } = e, a = new Ce(i, l);
      return Ne(a, s);
    }
    const n = new Ce(e);
    return Ne(n, s);
  }
  return Ne(r[0], r[1]);
}
((r) => {
  function e(t) {
    return Ne({}, t);
  }
  r.mock = e;
})(It || (It = {}));
const j = Dt("messages", {
  id: L("id").primaryKey(),
  chatRevelnestId: L("chat_revelnest_id").notNull(),
  isMine: me("is_mine", { mode: "boolean" }).notNull(),
  message: L("message").notNull(),
  replyTo: L("reply_to"),
  signature: L("signature"),
  status: L("status").notNull().default("sent"),
  isDeleted: me("is_deleted", { mode: "boolean" }).notNull().default(!1),
  isEdited: me("is_edited", { mode: "boolean" }).notNull().default(!1),
  timestamp: L("timestamp").default(u`CURRENT_TIMESTAMP`)
}), W = Dt("reactions", {
  id: me("id").primaryKey({ autoIncrement: !0 }),
  messageId: L("message_id").notNull(),
  revelnestId: L("revelnest_id").notNull(),
  emoji: L("emoji").notNull(),
  timestamp: L("timestamp").default(u`CURRENT_TIMESTAMP`)
}), P = Dt("contacts", {
  id: me("id").primaryKey({ autoIncrement: !0 }),
  revelnestId: L("revelnest_id").unique(),
  address: L("address").notNull(),
  name: L("name").notNull(),
  publicKey: L("public_key"),
  ephemeralPublicKey: L("ephemeral_public_key"),
  dhtSeq: me("dht_seq").notNull().default(0),
  dhtSignature: L("dht_signature"),
  status: L("status").notNull().default("connected"),
  lastSeen: L("last_seen").default(u`CURRENT_TIMESTAMP`)
}), Qa = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  contacts: P,
  messages: j,
  reactions: W
}, Symbol.toStringTag, { value: "Module" }));
function Ea(r) {
  const e = r.migrationsFolder, t = [], s = `${e}/meta/_journal.json`;
  if (!I.existsSync(s))
    throw new Error("Can't find meta/_journal.json file");
  const n = I.readFileSync(`${e}/meta/_journal.json`).toString(), i = JSON.parse(n);
  for (const l of i.entries) {
    const a = `${e}/${l.tag}.sql`;
    try {
      const c = I.readFileSync(`${e}/${l.tag}.sql`).toString(), d = c.split("--> statement-breakpoint").map((h) => h);
      t.push({
        sql: d,
        bps: l.breakpoints,
        folderMillis: l.when,
        hash: Ze.createHash("sha256").update(c).digest("hex")
      });
    } catch {
      throw new Error(`No file ${a} found in ${e} folder`);
    }
  }
  return t;
}
function La(r, e) {
  const t = Ea(e);
  r.dialect.migrate(t, r.session, e);
}
let Ye, Q;
async function mo(r) {
  const e = R.join(r, "p2p-chat.db");
  Ye = new Ce(e), Q = It(Ye, { schema: Qa });
  try {
    let t = R.join(process.cwd(), "drizzle");
    try {
      const { app: s } = await import("electron");
      s != null && s.isPackaged && (t = R.join(process.resourcesPath, "drizzle"));
    } catch {
    }
    La(Q, { migrationsFolder: t }), console.log("[DB] Migraciones aplicadas correctamente.");
  } catch (t) {
    console.error("[DB] Error en migraciones:", t);
  }
}
function ot(r, e, t, s, n, i) {
  return Q.insert(j).values({
    id: r,
    chatRevelnestId: e,
    isMine: t,
    message: s,
    replyTo: n,
    signature: i
  }).run();
}
function po(r) {
  return Q.select().from(j).where(_(j.chatRevelnestId, r)).orderBy(Lt(j.timestamp)).limit(100).all().map((t) => {
    const s = Q.select().from(W).where(_(W.messageId, t.id)).all();
    return { ...t, reactions: s };
  });
}
function Ft(r, e, t) {
  if (!Q.select().from(W).where(Qe(
    _(W.messageId, r),
    _(W.revelnestId, e),
    _(W.emoji, t)
  )).get())
    return Q.insert(W).values({
      messageId: r,
      revelnestId: e,
      emoji: t
    }).run();
}
function Mt(r, e, t) {
  return Q.delete(W).where(Qe(
    _(W.messageId, r),
    _(W.revelnestId, e),
    _(W.emoji, t)
  )).run();
}
function zt(r, e, t) {
  return Q.update(j).set({
    message: e,
    isEdited: !0,
    signature: t
  }).where(_(j.id, r)).run();
}
function Ut(r) {
  return Q.update(j).set({
    message: "Mensaje eliminado",
    isDeleted: !0
  }).where(_(j.id, r)).run();
}
function M(r) {
  return Q.select().from(P).where(_(P.revelnestId, r)).get();
}
function kt(r) {
  return Q.select().from(P).where(_(P.address, r)).get();
}
function go(r, e) {
  return Q.update(P).set({ address: e, lastSeen: (/* @__PURE__ */ new Date()).toISOString() }).where(_(P.revelnestId, r)).run();
}
function Le(r, e, t, s) {
  return Q.update(P).set({ address: e, dhtSeq: t, dhtSignature: s, lastSeen: (/* @__PURE__ */ new Date()).toISOString() }).where(_(P.revelnestId, r)).run();
}
function Vt(r, e) {
  return Q.update(P).set({ publicKey: e, status: "connected" }).where(_(P.revelnestId, r)).run();
}
function Yt(r, e) {
  return Q.update(P).set({ ephemeralPublicKey: e }).where(_(P.revelnestId, r)).run();
}
function at(r, e) {
  return Q.update(j).set({ status: e }).where(_(j.id, r)).run();
}
function Pa(r) {
  const e = Q.select({ status: j.status }).from(j).where(_(j.id, r)).get();
  return e ? e.status : null;
}
function Se() {
  const e = Q.select().from(P).all().map((t) => {
    const s = Q.select().from(j).where(_(j.chatRevelnestId, t.revelnestId || "")).orderBy(Lt(j.timestamp)).limit(1).get();
    return {
      ...t,
      lastMessage: s == null ? void 0 : s.message,
      lastMessageTime: s == null ? void 0 : s.timestamp,
      lastMessageIsMine: s == null ? void 0 : s.isMine,
      lastMessageStatus: s == null ? void 0 : s.status
    };
  });
  return e.sort((t, s) => {
    const n = t.lastMessageTime ? new Date(t.lastMessageTime).getTime() : 0;
    return (s.lastMessageTime ? new Date(s.lastMessageTime).getTime() : 0) - n;
  }), e;
}
function Ht(r, e, t, s, n = "connected", i) {
  return Q.insert(P).values({
    revelnestId: r,
    address: e,
    name: t,
    publicKey: s,
    ephemeralPublicKey: i,
    status: n
  }).onConflictDoUpdate({
    target: P.revelnestId,
    set: { address: e, name: t, publicKey: s, status: n, ephemeralPublicKey: i }
  }).run();
}
function lt(r) {
  return Q.delete(P).where(_(P.revelnestId, r)).run();
}
function yo(r) {
  return Q.update(P).set({ lastSeen: (/* @__PURE__ */ new Date()).toISOString() }).where(_(P.revelnestId, r)).run();
}
function bo() {
  Ye && Ye.close();
}
const Da = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  addOrUpdateContact: Ht,
  closeDB: bo,
  deleteContact: lt,
  deleteMessageLocally: Ut,
  deleteReaction: Mt,
  getContactByAddress: kt,
  getContactByRevelnestId: M,
  getContacts: Se,
  getMessageStatus: Pa,
  getMessages: po,
  initDB: mo,
  saveMessage: ot,
  saveReaction: Ft,
  updateContactDhtLocation: Le,
  updateContactEphemeralPublicKey: Yt,
  updateContactLocation: go,
  updateContactPublicKey: Vt,
  updateLastSeen: yo,
  updateMessageContent: zt,
  updateMessageStatus: at
}, Symbol.toStringTag, { value: "Module" }));
let $e, ce, qt, _t, He, fe = 0, xe;
function Aa(r) {
  const e = R.join(r, "identity.key");
  if (I.existsSync(e)) {
    const s = I.readFileSync(e);
    s.length === x.crypto_sign_SECRETKEYBYTES ? (ce = s, $e = Buffer.alloc(x.crypto_sign_PUBLICKEYBYTES), $e = ce.subarray(32)) : ns(e);
  } else
    ns(e);
  const t = Buffer.alloc(16);
  if (x.crypto_generichash(t, $e), qt = t.toString("hex"), _t = Buffer.alloc(x.crypto_box_PUBLICKEYBYTES), He = Buffer.alloc(x.crypto_box_SECRETKEYBYTES), x.crypto_box_keypair(_t, He), xe = R.join(r, "dht_state.json"), I.existsSync(xe))
    try {
      const s = JSON.parse(I.readFileSync(xe, "utf8"));
      typeof s.seq == "number" && (fe = s.seq);
    } catch (s) {
      console.error("Error reading DHT state:", s);
    }
  else
    fe = Date.now(), I.writeFileSync(xe, JSON.stringify({ seq: fe }));
  console.log("--- Identidad RevelNest Inicializada ---"), console.log("RevelNest ID:", qt), console.log("DHT Sequence:", fe);
}
function ns(r) {
  $e = Buffer.alloc(x.crypto_sign_PUBLICKEYBYTES), ce = Buffer.alloc(x.crypto_sign_SECRETKEYBYTES), x.crypto_sign_keypair($e, ce), I.writeFileSync(r, ce);
}
function Jt() {
  return $e.toString("hex");
}
function oe() {
  return qt;
}
function De(r) {
  const e = Buffer.allocUnsafe(x.crypto_sign_BYTES);
  return x.crypto_sign_detached(e, r, ce), e;
}
function So(r, e, t) {
  return x.crypto_sign_verify_detached(e, r, t);
}
function ct() {
  return _t.toString("hex");
}
function Oa() {
  fe++;
  try {
    I.writeFileSync(xe, JSON.stringify({ seq: fe }));
  } catch (r) {
    console.error("Failed to save DHT state", r);
  }
  return fe;
}
function wo(r, e, t = !1) {
  let s, n;
  t ? (s = e, n = He) : (s = Buffer.alloc(x.crypto_box_PUBLICKEYBYTES), x.crypto_sign_ed25519_pk_to_curve25519(s, e), n = Buffer.alloc(x.crypto_box_SECRETKEYBYTES), x.crypto_sign_ed25519_sk_to_curve25519(n, ce));
  const i = Buffer.allocUnsafe(x.crypto_box_NONCEBYTES);
  x.randombytes_buf(i);
  const l = Buffer.alloc(r.length + x.crypto_box_MACBYTES);
  return x.crypto_box_easy(l, r, i, s, n), { ciphertext: l, nonce: i };
}
function vo(r, e, t, s = !1) {
  let n, i;
  s ? (n = t, i = He) : (n = Buffer.alloc(x.crypto_box_PUBLICKEYBYTES), x.crypto_sign_ed25519_pk_to_curve25519(n, t), i = Buffer.alloc(x.crypto_box_SECRETKEYBYTES), x.crypto_sign_ed25519_sk_to_curve25519(i, ce));
  const l = Buffer.alloc(r.length - x.crypto_box_MACBYTES);
  return x.crypto_box_open_easy(l, r, e, n, i) ? l : null;
}
function we(r) {
  const e = Object.keys(r).sort();
  return JSON.stringify(r, e);
}
function Ra(r, e) {
  const t = { revelnestId: oe(), address: r, dhtSeq: e }, s = De(Buffer.from(we(t))).toString("hex");
  return { address: r, dhtSeq: e, signature: s };
}
function Wt(r, e, t) {
  const s = { revelnestId: r, address: e.address, dhtSeq: e.dhtSeq };
  return So(
    Buffer.from(we(s)),
    Buffer.from(e.signature, "hex"),
    Buffer.from(t, "hex")
  );
}
function Ae() {
  const r = Qo.networkInterfaces();
  for (const e of Object.keys(r))
    if (e.includes("ygg") || e === "utun2" || e === "tun0")
      for (const t of r[e] || []) {
        const s = t.family;
        if ((s === "IPv6" || s === 6) && (t.address.startsWith("200:") || t.address.startsWith("201:")))
          return t.address;
      }
  return null;
}
async function ja(r, e, t, s, n) {
  try {
    const i = JSON.parse(r.toString()), { signature: l, senderRevelnestId: a, ...c } = i;
    if (c.type === "HANDSHAKE_REQ") {
      console.log(`[Handshake] Solicitud de ${e.address}: ${c.revelnestId}`), Ht(c.revelnestId, e.address, c.alias || `Peer ${c.revelnestId.slice(0, 4)}`, c.publicKey, "incoming", c.ephemeralPublicKey), t == null || t.webContents.send("contact-request-received", {
        revelnestId: c.revelnestId,
        address: e.address,
        alias: c.alias,
        publicKey: c.publicKey,
        ephemeralPublicKey: c.ephemeralPublicKey
      });
      return;
    }
    if (c.type === "HANDSHAKE_ACCEPT") {
      console.log(`[Handshake] ACEPTADA de ${e.address}: ${c.revelnestId}`);
      const v = await kt(e.address);
      v && v.revelnestId.startsWith("pending-") && lt(v.revelnestId);
      const T = await M(c.revelnestId);
      T && T.status === "pending" && (Vt(c.revelnestId, c.publicKey), c.ephemeralPublicKey && Yt(c.revelnestId, c.ephemeralPublicKey), t == null || t.webContents.send("contact-handshake-finished", { revelnestId: c.revelnestId }));
      return;
    }
    const d = a;
    if (!d) return;
    const h = await M(d);
    if (!h || h.status !== "connected" || !h.publicKey) {
      console.warn(`[Security] Origen no conectado o sin llave: ${d}`);
      return;
    }
    if (!So(
      Buffer.from(we(c)),
      Buffer.from(l, "hex"),
      Buffer.from(h.publicKey, "hex")
    )) {
      console.error(`[Security] Firma INVÁLIDA de ${d}.`);
      return;
    }
    h.address !== e.address && go(d, e.address);
    const g = (/* @__PURE__ */ new Date()).toISOString();
    switch (yo(d), t == null || t.webContents.send("contact-presence", { revelnestId: d, lastSeen: g }), c.type) {
      case "DHT_UPDATE":
        Ka(d, h, c);
        break;
      case "DHT_EXCHANGE":
        Fa(d, c);
        break;
      case "DHT_QUERY":
        Ma(d, c, e.address, s);
        break;
      case "DHT_RESPONSE":
        za(d, c, s);
        break;
      case "PING":
        s(e.address, { type: "PONG" });
        break;
      case "CHAT":
        Ua(d, h, c, t, l, e.address, s);
        break;
      case "ACK":
        ka(d, c, t);
        break;
      case "READ":
        Va(d, c, t);
        break;
      case "TYPING":
        t == null || t.webContents.send("peer-typing", { revelnestId: d });
        break;
      case "CHAT_REACTION":
        Ya(d, c, t);
        break;
      case "CHAT_UPDATE":
        Ha(d, h, c, t, l);
        break;
      case "CHAT_DELETE":
        Ja(d, c, t);
        break;
      default:
        console.warn(`[Network] Paquete desconocido de ${d}: ${c.type}`);
    }
  } catch (i) {
    console.error("UDP Packet Error:", i);
  }
}
async function Ka(r, e, t) {
  const s = t.locationBlock;
  if (!s || typeof s.dhtSeq != "number" || !s.address || !s.signature) return;
  if (!Wt(r, s, e.publicKey)) {
    console.error(`[DHT Security] Invalid DHT_UPDATE signature from ${r}`);
    return;
  }
  s.dhtSeq > (e.dhtSeq || 0) && (console.log(`[DHT] Actualizando ubicación de ${r} a ${s.address} (Seq: ${s.dhtSeq})`), Le(r, s.address, s.dhtSeq, s.signature));
}
async function Fa(r, e) {
  if (Array.isArray(e.peers)) {
    console.log(`[DHT PEEREX] Recibiendo ${e.peers.length} ubicaciones de ${r}`);
    for (const t of e.peers) {
      if (!t.revelnestId || !t.publicKey || !t.locationBlock || t.revelnestId === oe()) continue;
      const s = await M(t.revelnestId);
      if (!s) continue;
      const n = t.locationBlock;
      if (typeof n.dhtSeq != "number" || !n.address || !n.signature) continue;
      if (!Wt(t.revelnestId, n, s.publicKey)) {
        console.error(`[DHT Security] Invalid PEEREX signature for ${t.revelnestId}`);
        continue;
      }
      n.dhtSeq > (s.dhtSeq || 0) && Le(t.revelnestId, n.address, n.dhtSeq, n.signature);
    }
  }
}
async function Ma(r, e, t, s) {
  console.log(`[DHT Query] Buscando ${e.targetId} a petición de ${r}`);
  const n = await M(e.targetId);
  let i = { type: "DHT_RESPONSE", targetId: e.targetId };
  if (n && n.status === "connected" && n.dhtSignature)
    i.locationBlock = {
      address: n.address,
      dhtSeq: n.dhtSeq,
      signature: n.dhtSignature
    }, i.publicKey = n.publicKey;
  else {
    const l = Se(), a = (d, h) => {
      try {
        return BigInt("0x" + d) ^ BigInt("0x" + h);
      } catch {
        return BigInt(0);
      }
    }, c = l.filter((d) => d.status === "connected" && d.revelnestId !== r).map((d) => ({
      revelnestId: d.revelnestId,
      publicKey: d.publicKey,
      locationBlock: { address: d.address, dhtSeq: d.dhtSeq, signature: d.dhtSignature },
      dist: a(d.revelnestId, e.targetId)
    })).sort((d, h) => d.dist < h.dist ? -1 : d.dist > h.dist ? 1 : 0).slice(0, 5).map(({ dist: d, ...h }) => h);
    i.neighbors = c;
  }
  s(t, i);
}
async function za(r, e, t) {
  var s, n;
  if (e.locationBlock) {
    const i = e.locationBlock, l = await M(e.targetId);
    if (!l) return;
    Wt(e.targetId, i, l.publicKey || e.publicKey) && i.dhtSeq > (l.dhtSeq || 0) && (console.log(`[DHT Search] ¡ENCONTRADO! Nueva IP para ${e.targetId}: ${i.address}`), Le(e.targetId, i.address, i.dhtSeq, i.signature));
  } else if (e.neighbors) {
    console.log(`[DHT Search] Recibidos ${e.neighbors.length} referidos de ${r} para buscar a ${e.targetId}`);
    for (const i of e.neighbors) {
      if (i.revelnestId === oe()) continue;
      const l = await M(i.revelnestId);
      l ? ((n = i.locationBlock) == null ? void 0 : n.dhtSeq) > (l.dhtSeq || 0) && (Le(i.revelnestId, i.locationBlock.address, i.locationBlock.dhtSeq, i.locationBlock.signature), t(i.locationBlock.address, { type: "DHT_QUERY", targetId: e.targetId })) : (s = i.locationBlock) != null && s.address && t(i.locationBlock.address, { type: "DHT_QUERY", targetId: e.targetId });
    }
  }
}
async function Ua(r, e, t, s, n, i, l) {
  const a = t.id || Ze.randomUUID();
  t.ephemeralPublicKey && Yt(r, t.ephemeralPublicKey);
  let c = t.content;
  if (t.nonce)
    try {
      const d = t.useRecipientEphemeral ? t.ephemeralPublicKey : e.publicKey, h = !!t.useRecipientEphemeral;
      if (!d) throw new Error("La llave pública del remitente no está disponible para descifrar");
      const y = vo(
        Buffer.from(t.content, "hex"),
        Buffer.from(t.nonce, "hex"),
        Buffer.from(d, "hex"),
        h
      );
      y ? c = y.toString("utf-8") : c = "🔒 [Error de descifrado]";
    } catch (d) {
      c = "🔒 [Error crítico de seguridad]", console.error("Decryption failed:", d);
    }
  ot(a, r, !1, c, t.replyTo, n), s == null || s.webContents.send("receive-p2p-message", {
    id: a,
    revelnestId: r,
    isMine: !1,
    message: c,
    replyTo: t.replyTo,
    status: "received",
    encrypted: !!t.nonce
  }), l(i, { type: "ACK", id: a });
}
function ka(r, e, t) {
  e.id && (at(e.id, "delivered"), t == null || t.webContents.send("message-delivered", { id: e.id, revelnestId: r }));
}
function Va(r, e, t) {
  e.id && (at(e.id, "read"), t == null || t.webContents.send("message-read", { id: e.id, revelnestId: r }));
}
async function Ya(r, e, t) {
  const { msgId: s, emoji: n, remove: i } = e;
  i ? Mt(s, r, n) : Ft(s, r, n), t == null || t.webContents.send("message-reaction-updated", { msgId: s, revelnestId: r, emoji: n, remove: i });
}
async function Ha(r, e, t, s, n) {
  const { msgId: i, content: l, nonce: a, ephemeralPublicKey: c, useRecipientEphemeral: d } = t;
  let h = l;
  if (a) {
    const y = d ? c : e.publicKey, g = vo(
      Buffer.from(l, "hex"),
      Buffer.from(a, "hex"),
      Buffer.from(y, "hex"),
      !!d
    );
    g && (h = g.toString("utf-8"));
  }
  zt(i, h, n), s == null || s.webContents.send("message-updated", { id: i, revelnestId: r, content: h });
}
async function Ja(r, e, t) {
  const { msgId: s } = e;
  Ut(s), t == null || t.webContents.send("message-deleted", { id: s, revelnestId: r });
}
let is = null;
function Wa(r) {
  const e = Ae();
  if (e && e !== is) {
    is = e;
    const t = Oa();
    console.log(`[DHT] IP propia detectada/cambiada a ${e}. Propagando DHT_UPDATE (Seq: ${t})...`);
    const s = Ra(e, t), n = Se();
    for (const i of n)
      i.status === "connected" && r(i.address, {
        type: "DHT_UPDATE",
        locationBlock: s
      });
  }
}
async function Ga(r, e) {
  const t = await M(r);
  if (!t || t.status !== "connected") return;
  const s = Se(), n = (a, c) => {
    try {
      return BigInt("0x" + a) ^ BigInt("0x" + c);
    } catch {
      return BigInt(0);
    }
  }, l = s.filter((a) => a.status === "connected" && a.dhtSignature && a.revelnestId !== r).map((a) => ({
    revelnestId: a.revelnestId,
    publicKey: a.publicKey,
    locationBlock: {
      address: a.address,
      dhtSeq: a.dhtSeq,
      signature: a.dhtSignature
    },
    dist: n(a.revelnestId, r)
  })).sort((a, c) => a.dist < c.dist ? -1 : a.dist > c.dist ? 1 : 0).map(({ dist: a, ...c }) => c).slice(0, 5);
  l.length > 0 && e(t.address, {
    type: "DHT_EXCHANGE",
    peers: l
  });
}
async function Xa(r, e) {
  console.log(`[DHT Search] Iniciando búsqueda activa para: ${r}`);
  const t = Se(), s = (i, l) => {
    try {
      return BigInt("0x" + i) ^ BigInt("0x" + l);
    } catch {
      return BigInt(0);
    }
  }, n = t.filter((i) => i.status === "connected" && i.revelnestId !== r).map((i) => ({
    revelnestId: i.revelnestId,
    address: i.address,
    dist: s(i.revelnestId, r)
  })).sort((i, l) => i.dist < l.dist ? -1 : i.dist > l.dist ? 1 : 0).slice(0, 3);
  for (const i of n)
    e(i.address, {
      type: "DHT_QUERY",
      targetId: r
    });
}
const ut = 50005;
let G = null, os = null;
function Za(r) {
  os = r;
  const e = Ae();
  if (e) {
    G = _o.createSocket({ type: "udp6", reuseAddr: !0 }), G.on("message", async (t, s) => {
      await ja(
        t,
        s,
        os,
        X
      );
    }), G.on("error", (t) => {
      console.error("UDP Error:", t);
    });
    try {
      G.bind(ut, e);
    } catch (t) {
      console.error("Failed to bind socket:", t);
    }
  }
}
function X(r, e) {
  if (!G) return;
  const t = oe(), s = De(Buffer.from(we(e))), n = {
    ...e,
    senderRevelnestId: t,
    signature: s.toString("hex")
  }, i = Buffer.from(JSON.stringify(n));
  G.send(i, ut, r);
}
async function el(r, e) {
  const t = {
    type: "HANDSHAKE_REQ",
    revelnestId: oe(),
    publicKey: Jt(),
    ephemeralPublicKey: ct(),
    alias: e
  }, s = Buffer.from(JSON.stringify(t));
  G && G.send(s, ut, r);
}
async function tl(r, e) {
  const t = await M(r);
  if (!t) return;
  Vt(r, e);
  const s = {
    type: "HANDSHAKE_ACCEPT",
    revelnestId: oe(),
    publicKey: Jt(),
    ephemeralPublicKey: ct()
  }, n = Buffer.from(JSON.stringify(s));
  G && G.send(n, ut, t.address);
}
async function sl(r, e, t) {
  const s = Ze.randomUUID(), n = typeof e == "string" ? e : e.content, i = await M(r);
  if (!i || i.status !== "connected" || !i.publicKey) return;
  const l = !!i.ephemeralPublicKey, a = l ? i.ephemeralPublicKey : i.publicKey, { ciphertext: c, nonce: d } = wo(
    Buffer.from(n, "utf-8"),
    Buffer.from(a, "hex"),
    l
  ), h = {
    type: "CHAT",
    id: s,
    content: c.toString("hex"),
    nonce: d.toString("hex"),
    ephemeralPublicKey: ct(),
    useRecipientEphemeral: l,
    replyTo: t
  }, y = De(Buffer.from(we(h)));
  return ot(s, r, !0, n, t, y.toString("hex")), X(i.address, h), setTimeout(async () => {
    const { getMessageStatus: g } = await Promise.resolve().then(() => Da);
    await g(s) === "sent" && (console.warn(`[Network] Mensaje ${s} no entregado a ${r}. Iniciando búsqueda reactiva...`), Xa(r, X));
  }, 5e3), s;
}
function rl(r) {
  for (const e of r)
    e.status === "connected" && (X(e.address, { type: "PING" }), Ga(e.revelnestId, X));
}
function nl() {
  Wa(X);
}
function il(r) {
  const e = M(r);
  e && e.status === "connected" && X(e.address, { type: "TYPING" });
}
function ol(r, e) {
  at(e, "read");
  const t = M(r);
  t && t.status === "connected" && X(t.address, { type: "READ", id: e });
}
function al(r, e) {
  const t = M(r);
  if (!t || t.status !== "connected") return;
  const s = Ze.randomUUID(), n = {
    type: "CHAT_CONTACT",
    id: s,
    contactName: e.name,
    contactAddress: e.address,
    revelnestId: e.revelnestId,
    contactPublicKey: e.publicKey
  }, i = De(Buffer.from(we(n)));
  return ot(s, r, !0, `CONTACT_CARD|${e.name}`, void 0, i.toString("hex")), X(t.address, n), s;
}
async function ll(r, e, t, s) {
  const n = await M(r);
  if (!n || n.status !== "connected") return;
  s ? Mt(e, oe(), t) : Ft(e, oe(), t);
  const i = { type: "CHAT_REACTION", msgId: e, emoji: t, remove: s };
  X(n.address, i);
}
async function cl(r, e, t) {
  const s = await M(r);
  if (!s || s.status !== "connected" || !s.publicKey) return;
  const n = !!s.ephemeralPublicKey, i = n ? s.ephemeralPublicKey : s.publicKey, { ciphertext: l, nonce: a } = wo(
    Buffer.from(t, "utf-8"),
    Buffer.from(i, "hex"),
    n
  ), c = {
    type: "CHAT_UPDATE",
    msgId: e,
    content: l.toString("hex"),
    nonce: a.toString("hex"),
    ephemeralPublicKey: ct(),
    useRecipientEphemeral: n
  }, d = De(Buffer.from(we(c)));
  zt(e, t, d.toString("hex")), X(s.address, c);
}
async function ul(r, e) {
  const t = await M(r);
  if (!t || t.status !== "connected") return;
  Ut(e);
  const s = { type: "CHAT_DELETE", msgId: e };
  X(t.address, s);
}
function dl() {
  G && G.close();
}
async function hl() {
  const r = Ae();
  if (r) {
    console.log(`[Yggdrasil] Instancia global detectada con IPv6: ${r}. Omitiendo lanzamiento del Sidecar interno.`);
    return;
  }
  const e = ne.getPath("userData"), t = R.join(e, "yggdrasil.conf"), s = R.join(e, "ygg.pid"), n = `${process.platform}-${process.arch}`, i = process.platform === "win32" ? "yggdrasil.exe" : "yggdrasil", l = ne.isPackaged ? R.join(process.resourcesPath, "bin") : R.join(ne.getAppPath(), "resources", "bin");
  let a = R.join(l, n, i);
  if (!I.existsSync(a))
    throw new Error(`[Yggdrasil] Archivo de sidecar no encontrado en el paquete: ${a}. Por favor compila/ubica los binarios en resources/bin.`);
  if (console.log(`[Yggdrasil] Usando ejecutable empaquetado Sidecar: ${a}`), !I.existsSync(t)) {
    console.log("[Yggdrasil] Generando configuración...");
    let y = (await new Promise((g, v) => {
      pt(`"${a}" -genconf`, { encoding: "utf8" }, (T, S) => {
        T ? v(T) : g(S);
      });
    })).replace(
      /(Peers: \[)(.*?)(\])/s,
      `$1
    "tls://ygg.mkg20001.io:443",
    "tcp://ygg.tomasgl.ru:10526"
  $3`
    );
    y = y.replace(/AdminListen: .*/, "AdminListen: none"), y = y.replace(/IfName: .*/, "IfName: ygg0"), I.writeFileSync(t, y), console.log("[Yggdrasil] Configuración generada.");
  }
  let c = I.readFileSync(t, "utf8"), d = c;
  if (d.includes("AdminListen:"))
    d = d.replace(/AdminListen: .*/, "AdminListen: none");
  else {
    const y = /IfName: ygg0/.exec(d);
    if (y) {
      const g = y.index + y[0].length;
      d = d.slice(0, g) + `
  AdminListen: none` + d.slice(g);
    }
  }
  return d = d.replace(/IfName: .*/, "IfName: ygg0"), d !== c && (I.writeFileSync(t, d), console.log("[Yggdrasil] Configuración actualizada.")), console.log("[Yggdrasil] Preparando conexión a la red descentralizada RevelNest..."), console.log("[Yggdrasil] Nota: Se requieren permisos de administrador para crear una red privada segura."), new Promise((h, y) => {
    const g = () => {
      try {
        const S = I.statSync(s);
        S && (S.uid === 0 || !(S.mode & 128)) && (console.log("[Yggdrasil] Eliminando archivo PID de root..."), I.unlinkSync(s));
      } catch {
      }
      try {
        const S = I.statSync(R.join(e, "ygg.log"));
        S && (S.uid === 0 || !(S.mode & 128)) && (console.log("[Yggdrasil] Eliminando archivo log de root..."), I.unlinkSync(R.join(e, "ygg.log")));
      } catch {
      }
    }, v = () => new Promise((S, $) => {
      var B, q, D;
      if (console.log("[Yggdrasil] Intentando conexión con permisos estándar..."), g(), process.platform === "win32") {
        const N = `cd "${e}" && start /B "${a}" -useconffile "${t}"`;
        pt(N, { cwd: e }, (A) => {
          A ? $(A) : (console.log("[Yggdrasil] Lanzado en background (modo estándar)."), setTimeout(S, 3e3));
        });
      } else {
        const N = Eo(a, ["-useconffile", t], {
          cwd: e,
          detached: !0,
          stdio: ["ignore", "pipe", "pipe"]
        });
        if (!(N != null && N.pid)) {
          $(new Error("No se pudo crear el proceso Yggdrasil"));
          return;
        }
        I.writeFileSync(s, N.pid.toString()), N.unref();
        let A = "";
        (B = N.stderr) == null || B.on("data", (w) => {
          if (A += w.toString(), A.includes("operation not permitted") || A.includes("failed to create TUN") || A.includes("panic:")) {
            console.error("[Yggdrasil] Error crítico detectado:", A);
            try {
              process.kill(N.pid, "SIGKILL");
            } catch {
            }
            $(new Error("Yggdrasil falló al crear la interfaz de red"));
          }
        });
        const z = I.createWriteStream(R.join(e, "ygg.log"), { flags: "a" });
        (q = N.stdout) == null || q.pipe(z), (D = N.stderr) == null || D.pipe(z), console.log("[Yggdrasil] Lanzado en background (PID: %d).", N.pid), setTimeout(() => {
          try {
            process.kill(N.pid, 0), S();
          } catch {
            $(new Error("El proceso Yggdrasil terminó prematuramente"));
          }
        }, 2e3);
      }
    }), T = () => new Promise((S, $) => {
      console.log("[Yggdrasil] Se requieren permisos de administrador para la red privada."), console.log("[Yggdrasil] Se mostrará un diálogo para ingresar su contraseña.");
      const B = process.platform === "win32" ? `cd "${e}" && "${a}" -useconffile "${t}"` : `sh -c '"${a}" -useconffile "${t}" > "${e}/ygg.log" 2>&1 & echo $! > "${s}"'`;
      try {
        Lo.exec(B, { name: "RevelNest Secure Network" }, (q, D, N) => {
          q ? (console.error("[Yggdrasil] Error con permisos elevados:", q), $(q)) : (console.log("[Yggdrasil] Lanzado con permisos elevados."), setTimeout(S, 3e3));
        });
      } catch (q) {
        console.error("[Yggdrasil] Error síncrono en sudo.exec:", q), $(q);
      }
    });
    v().then(() => {
      console.log("[Yggdrasil] Red descentralizada lista."), h();
    }).catch((S) => {
      console.log("[Yggdrasil] Falló el modo estándar:", S.message), console.log("[Yggdrasil] Intentando con permisos elevados..."), T().then(() => {
        console.log("[Yggdrasil] Red descentralizada lista (con permisos elevados)."), h();
      }).catch(($) => {
        console.error("[Yggdrasil] No se pudo iniciar Yggdrasil:", $.message), y(new Error(`No se pudo establecer la red descentralizada: ${$.message}`));
      });
    });
  });
}
function fl() {
  const r = R.join(ne.getPath("userData"), "ygg.pid");
  if (I.existsSync(r)) {
    const e = I.readFileSync(r, "utf8").trim();
    if (!e) return;
    console.log(`[Yggdrasil] Deteniendo proceso ${e}...`);
    const t = process.platform === "win32" ? `taskkill /PID ${e} /F` : `kill -9 ${e} 2>/dev/null || sudo kill -9 ${e}`;
    pt(t, (s) => {
      if (s) {
        console.error("[Yggdrasil] Error al detener:", s.message);
        try {
          process.kill(parseInt(e), 9);
        } catch {
        }
      } else
        console.log("[Yggdrasil] Proceso detenido con éxito.");
      try {
        I.unlinkSync(r);
      } catch {
      }
    });
  }
}
qo && ne.quit();
const ml = Io(import.meta.url), as = R.dirname(ml);
let Ie = null;
const pl = () => {
  Ie = new xo({
    width: 1e3,
    height: 800,
    webPreferences: {
      preload: R.join(as, "preload.cjs")
    }
  }), MAIN_WINDOW_VITE_DEV_SERVER_URL ? Ie.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL) : Ie.loadFile(R.join(as, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
};
ne.on("ready", async () => {
  try {
    await hl();
  } catch (e) {
    console.error("[Yggdrasil] Error inicializando sidecar:", e);
  }
  const r = ne.getPath("userData");
  Aa(r), await mo(r), pl(), Ie && Za(Ie), setInterval(() => {
    nl();
    const e = Se();
    rl(e.map((t) => ({ address: t.address, status: t.status })));
  }, 3e4);
});
Y.handle("get-ygg-ip", () => Ae() || "No detectado");
Y.handle("get-messages", (r, e) => po(e));
Y.handle("get-contacts", () => Se());
Y.handle("add-contact", async (r, { address: e, name: t }) => {
  if (!e.includes("@"))
    return { success: !1, error: "Formato RevelNestID@IP requerido" };
  const [s, n] = e.split("@"), i = await kt(n);
  return i && i.revelnestId.startsWith("pending-") && await lt(i.revelnestId), Ht(s, n, t, void 0, "pending"), await el(n, t), { success: !0, revelnestId: s };
});
Y.handle("accept-contact-request", async (r, { revelnestId: e, publicKey: t }) => (await tl(e, t), { success: !0 }));
Y.handle("delete-contact", (r, { revelnestId: e }) => lt(e));
Y.handle("send-p2p-message", async (r, { revelnestId: e, message: t, replyTo: s }) => await sl(e, t, s));
Y.handle("send-typing-indicator", (r, { revelnestId: e }) => il(e));
Y.handle("send-read-receipt", (r, { revelnestId: e, id: t }) => ol(e, t));
Y.handle("send-contact-card", (r, { targetRevelnestId: e, contact: t }) => al(e, t));
Y.handle("send-chat-reaction", (r, { revelnestId: e, msgId: t, emoji: s, remove: n }) => ll(e, t, s, n));
Y.handle("send-chat-update", (r, { revelnestId: e, msgId: t, newContent: s }) => cl(e, t, s));
Y.handle("send-chat-delete", (r, { revelnestId: e, msgId: t }) => ul(e, t));
Y.handle("get-my-identity", () => ({
  address: Ae(),
  revelnestId: oe(),
  publicKey: Jt()
}));
ne.on("window-all-closed", () => {
  bo(), dl(), fl(), process.platform !== "darwin" && ne.quit();
});
