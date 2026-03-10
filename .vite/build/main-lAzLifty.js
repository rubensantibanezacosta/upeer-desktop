var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V, _W, _X, _Y, _Z, __, _$, _aa, _ba, _ca, _da, _ea, _fa, _ga, _ha, _ia, _ja, _ka, _la, _ma, _na, _oa, _pa, _qa, _ra, _sa, _ta, _ua, _va, _wa, _xa, _ya, _za, _Aa, _Ba, _Ca, _Da, _Ea, _Fa, _Ga, _Ha, _Ia, _Ja, _Ka, _La, _Ma, _Na, _Oa, _Pa, _Qa, _Ra, _Sa, _Ta, _Ua, _Va, _Wa, _Xa, _Ya, _Za, __a, _$a, _ab, _bb, _cb, _db, _eb, _fb, _gb, _hb, _ib, _jb, _kb, _lb, _mb, _nb, _ob, _pb, _qb, _rb, _sb, _tb, _ub, _vb, _wb, _xb, _yb, _zb, _Ab, _Bb, _Cb, _Db, _Eb, _Fb, _Gb, _Hb, _Ib, _Jb, _Kb, _Lb, _Mb, _Nb, _Ob, _Pb, _Qb, _Rb, _Sb, _Tb, _Ub, _Vb, _Wb, _Xb, _Yb, _Zb, __b, _$b, _ac, _bc, _cc;
import { app, session, ipcMain, BrowserWindow, dialog, shell } from "electron";
import path from "node:path";
import fs$1 from "node:fs/promises";
import { fileURLToPath } from "node:url";
import started from "electron-squirrel-startup";
import Client from "better-sqlite3";
import fs from "node:fs";
import sodium from "sodium-native";
import crypto$1 from "node:crypto";
import net from "node:net";
import os from "node:os";
import { spawn, exec } from "node:child_process";
import https from "node:https";
import dns from "node:dns";
import dgram from "node:dgram";
const entityKind = Symbol.for("drizzle:entityKind");
function is(value, type) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (value instanceof type) {
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(type, entityKind)) {
    throw new Error(
      `Class "${type.name ?? "<unknown>"}" doesn't look like a Drizzle entity. If this is incorrect and the class is provided by Drizzle, please report this as a bug.`
    );
  }
  let cls = Object.getPrototypeOf(value).constructor;
  if (cls) {
    while (cls) {
      if (entityKind in cls && cls[entityKind] === type[entityKind]) {
        return true;
      }
      cls = Object.getPrototypeOf(cls);
    }
  }
  return false;
}
_a = entityKind;
class ConsoleLogWriter {
  write(message) {
    console.log(message);
  }
}
__publicField(ConsoleLogWriter, _a, "ConsoleLogWriter");
_b = entityKind;
class DefaultLogger {
  constructor(config) {
    __publicField(this, "writer");
    this.writer = (config == null ? void 0 : config.writer) ?? new ConsoleLogWriter();
  }
  logQuery(query, params) {
    const stringifiedParams = params.map((p) => {
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    });
    const paramsStr = stringifiedParams.length ? ` -- params: [${stringifiedParams.join(", ")}]` : "";
    this.writer.write(`Query: ${query}${paramsStr}`);
  }
}
__publicField(DefaultLogger, _b, "DefaultLogger");
_c = entityKind;
class NoopLogger {
  logQuery() {
  }
}
__publicField(NoopLogger, _c, "NoopLogger");
const TableName = Symbol.for("drizzle:Name");
const Schema = Symbol.for("drizzle:Schema");
const Columns = Symbol.for("drizzle:Columns");
const ExtraConfigColumns = Symbol.for("drizzle:ExtraConfigColumns");
const OriginalName = Symbol.for("drizzle:OriginalName");
const BaseName = Symbol.for("drizzle:BaseName");
const IsAlias = Symbol.for("drizzle:IsAlias");
const ExtraConfigBuilder = Symbol.for("drizzle:ExtraConfigBuilder");
const IsDrizzleTable = Symbol.for("drizzle:IsDrizzleTable");
_m = entityKind, _l = TableName, _k = OriginalName, _j = Schema, _i = Columns, _h = ExtraConfigColumns, _g = BaseName, _f = IsAlias, _e = IsDrizzleTable, _d = ExtraConfigBuilder;
class Table {
  constructor(name, schema2, baseName) {
    /**
     * @internal
     * Can be changed if the table is aliased.
     */
    __publicField(this, _l);
    /**
     * @internal
     * Used to store the original name of the table, before any aliasing.
     */
    __publicField(this, _k);
    /** @internal */
    __publicField(this, _j);
    /** @internal */
    __publicField(this, _i);
    /** @internal */
    __publicField(this, _h);
    /**
     *  @internal
     * Used to store the table name before the transformation via the `tableCreator` functions.
     */
    __publicField(this, _g);
    /** @internal */
    __publicField(this, _f, false);
    /** @internal */
    __publicField(this, _e, true);
    /** @internal */
    __publicField(this, _d);
    this[TableName] = this[OriginalName] = name;
    this[Schema] = schema2;
    this[BaseName] = baseName;
  }
}
__publicField(Table, _m, "Table");
/** @internal */
__publicField(Table, "Symbol", {
  Name: TableName,
  Schema,
  OriginalName,
  Columns,
  ExtraConfigColumns,
  BaseName,
  IsAlias,
  ExtraConfigBuilder
});
function getTableName(table) {
  return table[TableName];
}
function getTableUniqueName(table) {
  return `${table[Schema] ?? "public"}.${table[TableName]}`;
}
_n = entityKind;
class Column {
  constructor(table, config) {
    __publicField(this, "name");
    __publicField(this, "keyAsName");
    __publicField(this, "primary");
    __publicField(this, "notNull");
    __publicField(this, "default");
    __publicField(this, "defaultFn");
    __publicField(this, "onUpdateFn");
    __publicField(this, "hasDefault");
    __publicField(this, "isUnique");
    __publicField(this, "uniqueName");
    __publicField(this, "uniqueType");
    __publicField(this, "dataType");
    __publicField(this, "columnType");
    __publicField(this, "enumValues");
    __publicField(this, "generated");
    __publicField(this, "generatedIdentity");
    __publicField(this, "config");
    this.table = table;
    this.config = config;
    this.name = config.name;
    this.keyAsName = config.keyAsName;
    this.notNull = config.notNull;
    this.default = config.default;
    this.defaultFn = config.defaultFn;
    this.onUpdateFn = config.onUpdateFn;
    this.hasDefault = config.hasDefault;
    this.primary = config.primaryKey;
    this.isUnique = config.isUnique;
    this.uniqueName = config.uniqueName;
    this.uniqueType = config.uniqueType;
    this.dataType = config.dataType;
    this.columnType = config.columnType;
    this.generated = config.generated;
    this.generatedIdentity = config.generatedIdentity;
  }
  mapFromDriverValue(value) {
    return value;
  }
  mapToDriverValue(value) {
    return value;
  }
  // ** @internal */
  shouldDisableInsert() {
    return this.config.generated !== void 0 && this.config.generated.type !== "byDefault";
  }
}
__publicField(Column, _n, "Column");
_o = entityKind;
class ColumnBuilder {
  constructor(name, dataType, columnType) {
    __publicField(this, "config");
    /**
     * Alias for {@link $defaultFn}.
     */
    __publicField(this, "$default", this.$defaultFn);
    /**
     * Alias for {@link $onUpdateFn}.
     */
    __publicField(this, "$onUpdate", this.$onUpdateFn);
    this.config = {
      name,
      keyAsName: name === "",
      notNull: false,
      default: void 0,
      hasDefault: false,
      primaryKey: false,
      isUnique: false,
      uniqueName: void 0,
      uniqueType: void 0,
      dataType,
      columnType,
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
    this.config.notNull = true;
    return this;
  }
  /**
   * Adds a `default <value>` clause to the column definition.
   *
   * Affects the `insert` model of the table - columns *with* `default` are optional on insert.
   *
   * If you need to set a dynamic default value, use {@link $defaultFn} instead.
   */
  default(value) {
    this.config.default = value;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Adds a dynamic default value to the column.
   * The function will be called when the row is inserted, and the returned value will be used as the column value.
   *
   * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
   */
  $defaultFn(fn) {
    this.config.defaultFn = fn;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Adds a dynamic update value to the column.
   * The function will be called when the row is updated, and the returned value will be used as the column value if none is provided.
   * If no `default` (or `$defaultFn`) value is provided, the function will be called when the row is inserted as well, and the returned value will be used as the column value.
   *
   * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
   */
  $onUpdateFn(fn) {
    this.config.onUpdateFn = fn;
    this.config.hasDefault = true;
    return this;
  }
  /**
   * Adds a `primary key` clause to the column definition. This implicitly makes the column `not null`.
   *
   * In SQLite, `integer primary key` implicitly makes the column auto-incrementing.
   */
  primaryKey() {
    this.config.primaryKey = true;
    this.config.notNull = true;
    return this;
  }
  /** @internal Sets the name of the column to the key within the table definition if a name was not given. */
  setName(name) {
    if (this.config.name !== "") return;
    this.config.name = name;
  }
}
__publicField(ColumnBuilder, _o, "ColumnBuilder");
const isPgEnumSym = Symbol.for("drizzle:isPgEnum");
function isPgEnum(obj) {
  return !!obj && typeof obj === "function" && isPgEnumSym in obj && obj[isPgEnumSym] === true;
}
_p = entityKind;
class Subquery {
  constructor(sql2, fields, alias, isWith = false, usedTables = []) {
    this._ = {
      brand: "Subquery",
      sql: sql2,
      selectedFields: fields,
      alias,
      isWith,
      usedTables
    };
  }
  // getSQL(): SQL<unknown> {
  // 	return new SQL([this]);
  // }
}
__publicField(Subquery, _p, "Subquery");
class WithSubquery extends (_r = Subquery, _q = entityKind, _r) {
}
__publicField(WithSubquery, _q, "WithSubquery");
const tracer = {
  startActiveSpan(name, fn) {
    {
      return fn();
    }
  }
};
const ViewBaseConfig = Symbol.for("drizzle:ViewBaseConfig");
function isSQLWrapper(value) {
  return value !== null && value !== void 0 && typeof value.getSQL === "function";
}
function mergeQueries(queries) {
  var _a2;
  const result = { sql: "", params: [] };
  for (const query of queries) {
    result.sql += query.sql;
    result.params.push(...query.params);
    if ((_a2 = query.typings) == null ? void 0 : _a2.length) {
      if (!result.typings) {
        result.typings = [];
      }
      result.typings.push(...query.typings);
    }
  }
  return result;
}
_s = entityKind;
class StringChunk {
  constructor(value) {
    __publicField(this, "value");
    this.value = Array.isArray(value) ? value : [value];
  }
  getSQL() {
    return new SQL([this]);
  }
}
__publicField(StringChunk, _s, "StringChunk");
_t = entityKind;
const _SQL = class _SQL {
  constructor(queryChunks) {
    /** @internal */
    __publicField(this, "decoder", noopDecoder);
    __publicField(this, "shouldInlineParams", false);
    /** @internal */
    __publicField(this, "usedTables", []);
    this.queryChunks = queryChunks;
    for (const chunk of queryChunks) {
      if (is(chunk, Table)) {
        const schemaName = chunk[Table.Symbol.Schema];
        this.usedTables.push(
          schemaName === void 0 ? chunk[Table.Symbol.Name] : schemaName + "." + chunk[Table.Symbol.Name]
        );
      }
    }
  }
  append(query) {
    this.queryChunks.push(...query.queryChunks);
    return this;
  }
  toQuery(config) {
    return tracer.startActiveSpan("drizzle.buildSQL", (span) => {
      const query = this.buildQueryFromSourceParams(this.queryChunks, config);
      span == null ? void 0 : span.setAttributes({
        "drizzle.query.text": query.sql,
        "drizzle.query.params": JSON.stringify(query.params)
      });
      return query;
    });
  }
  buildQueryFromSourceParams(chunks, _config) {
    const config = Object.assign({}, _config, {
      inlineParams: _config.inlineParams || this.shouldInlineParams,
      paramStartIndex: _config.paramStartIndex || { value: 0 }
    });
    const {
      casing,
      escapeName,
      escapeParam,
      prepareTyping,
      inlineParams,
      paramStartIndex
    } = config;
    return mergeQueries(chunks.map((chunk) => {
      var _a2;
      if (is(chunk, StringChunk)) {
        return { sql: chunk.value.join(""), params: [] };
      }
      if (is(chunk, Name)) {
        return { sql: escapeName(chunk.value), params: [] };
      }
      if (chunk === void 0) {
        return { sql: "", params: [] };
      }
      if (Array.isArray(chunk)) {
        const result = [new StringChunk("(")];
        for (const [i, p] of chunk.entries()) {
          result.push(p);
          if (i < chunk.length - 1) {
            result.push(new StringChunk(", "));
          }
        }
        result.push(new StringChunk(")"));
        return this.buildQueryFromSourceParams(result, config);
      }
      if (is(chunk, _SQL)) {
        return this.buildQueryFromSourceParams(chunk.queryChunks, {
          ...config,
          inlineParams: inlineParams || chunk.shouldInlineParams
        });
      }
      if (is(chunk, Table)) {
        const schemaName = chunk[Table.Symbol.Schema];
        const tableName = chunk[Table.Symbol.Name];
        return {
          sql: schemaName === void 0 || chunk[IsAlias] ? escapeName(tableName) : escapeName(schemaName) + "." + escapeName(tableName),
          params: []
        };
      }
      if (is(chunk, Column)) {
        const columnName = casing.getColumnCasing(chunk);
        if (_config.invokeSource === "indexes") {
          return { sql: escapeName(columnName), params: [] };
        }
        const schemaName = chunk.table[Table.Symbol.Schema];
        return {
          sql: chunk.table[IsAlias] || schemaName === void 0 ? escapeName(chunk.table[Table.Symbol.Name]) + "." + escapeName(columnName) : escapeName(schemaName) + "." + escapeName(chunk.table[Table.Symbol.Name]) + "." + escapeName(columnName),
          params: []
        };
      }
      if (is(chunk, View)) {
        const schemaName = chunk[ViewBaseConfig].schema;
        const viewName = chunk[ViewBaseConfig].name;
        return {
          sql: schemaName === void 0 || chunk[ViewBaseConfig].isAlias ? escapeName(viewName) : escapeName(schemaName) + "." + escapeName(viewName),
          params: []
        };
      }
      if (is(chunk, Param)) {
        if (is(chunk.value, Placeholder)) {
          return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
        }
        const mappedValue = chunk.value === null ? null : chunk.encoder.mapToDriverValue(chunk.value);
        if (is(mappedValue, _SQL)) {
          return this.buildQueryFromSourceParams([mappedValue], config);
        }
        if (inlineParams) {
          return { sql: this.mapInlineParam(mappedValue, config), params: [] };
        }
        let typings = ["none"];
        if (prepareTyping) {
          typings = [prepareTyping(chunk.encoder)];
        }
        return { sql: escapeParam(paramStartIndex.value++, mappedValue), params: [mappedValue], typings };
      }
      if (is(chunk, Placeholder)) {
        return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
      }
      if (is(chunk, _SQL.Aliased) && chunk.fieldAlias !== void 0) {
        return { sql: escapeName(chunk.fieldAlias), params: [] };
      }
      if (is(chunk, Subquery)) {
        if (chunk._.isWith) {
          return { sql: escapeName(chunk._.alias), params: [] };
        }
        return this.buildQueryFromSourceParams([
          new StringChunk("("),
          chunk._.sql,
          new StringChunk(") "),
          new Name(chunk._.alias)
        ], config);
      }
      if (isPgEnum(chunk)) {
        if (chunk.schema) {
          return { sql: escapeName(chunk.schema) + "." + escapeName(chunk.enumName), params: [] };
        }
        return { sql: escapeName(chunk.enumName), params: [] };
      }
      if (isSQLWrapper(chunk)) {
        if ((_a2 = chunk.shouldOmitSQLParens) == null ? void 0 : _a2.call(chunk)) {
          return this.buildQueryFromSourceParams([chunk.getSQL()], config);
        }
        return this.buildQueryFromSourceParams([
          new StringChunk("("),
          chunk.getSQL(),
          new StringChunk(")")
        ], config);
      }
      if (inlineParams) {
        return { sql: this.mapInlineParam(chunk, config), params: [] };
      }
      return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk], typings: ["none"] };
    }));
  }
  mapInlineParam(chunk, { escapeString }) {
    if (chunk === null) {
      return "null";
    }
    if (typeof chunk === "number" || typeof chunk === "boolean") {
      return chunk.toString();
    }
    if (typeof chunk === "string") {
      return escapeString(chunk);
    }
    if (typeof chunk === "object") {
      const mappedValueAsString = chunk.toString();
      if (mappedValueAsString === "[object Object]") {
        return escapeString(JSON.stringify(chunk));
      }
      return escapeString(mappedValueAsString);
    }
    throw new Error("Unexpected param value: " + chunk);
  }
  getSQL() {
    return this;
  }
  as(alias) {
    if (alias === void 0) {
      return this;
    }
    return new _SQL.Aliased(this, alias);
  }
  mapWith(decoder) {
    this.decoder = typeof decoder === "function" ? { mapFromDriverValue: decoder } : decoder;
    return this;
  }
  inlineParams() {
    this.shouldInlineParams = true;
    return this;
  }
  /**
   * This method is used to conditionally include a part of the query.
   *
   * @param condition - Condition to check
   * @returns itself if the condition is `true`, otherwise `undefined`
   */
  if(condition) {
    return condition ? this : void 0;
  }
};
__publicField(_SQL, _t, "SQL");
let SQL = _SQL;
_u = entityKind;
class Name {
  constructor(value) {
    __publicField(this, "brand");
    this.value = value;
  }
  getSQL() {
    return new SQL([this]);
  }
}
__publicField(Name, _u, "Name");
function isDriverValueEncoder(value) {
  return typeof value === "object" && value !== null && "mapToDriverValue" in value && typeof value.mapToDriverValue === "function";
}
const noopDecoder = {
  mapFromDriverValue: (value) => value
};
const noopEncoder = {
  mapToDriverValue: (value) => value
};
({
  ...noopDecoder,
  ...noopEncoder
});
_v = entityKind;
class Param {
  /**
   * @param value - Parameter value
   * @param encoder - Encoder to convert the value to a driver parameter
   */
  constructor(value, encoder = noopEncoder) {
    __publicField(this, "brand");
    this.value = value;
    this.encoder = encoder;
  }
  getSQL() {
    return new SQL([this]);
  }
}
__publicField(Param, _v, "Param");
function sql(strings, ...params) {
  const queryChunks = [];
  if (params.length > 0 || strings.length > 0 && strings[0] !== "") {
    queryChunks.push(new StringChunk(strings[0]));
  }
  for (const [paramIndex, param2] of params.entries()) {
    queryChunks.push(param2, new StringChunk(strings[paramIndex + 1]));
  }
  return new SQL(queryChunks);
}
((sql2) => {
  function empty() {
    return new SQL([]);
  }
  sql2.empty = empty;
  function fromList(list) {
    return new SQL(list);
  }
  sql2.fromList = fromList;
  function raw(str) {
    return new SQL([new StringChunk(str)]);
  }
  sql2.raw = raw;
  function join(chunks, separator) {
    const result = [];
    for (const [i, chunk] of chunks.entries()) {
      if (i > 0 && separator !== void 0) {
        result.push(separator);
      }
      result.push(chunk);
    }
    return new SQL(result);
  }
  sql2.join = join;
  function identifier(value) {
    return new Name(value);
  }
  sql2.identifier = identifier;
  function placeholder2(name2) {
    return new Placeholder(name2);
  }
  sql2.placeholder = placeholder2;
  function param2(value, encoder) {
    return new Param(value, encoder);
  }
  sql2.param = param2;
})(sql || (sql = {}));
((SQL2) => {
  var _a2;
  _a2 = entityKind;
  const _Aliased = class _Aliased {
    constructor(sql2, fieldAlias) {
      /** @internal */
      __publicField(this, "isSelectionField", false);
      this.sql = sql2;
      this.fieldAlias = fieldAlias;
    }
    getSQL() {
      return this.sql;
    }
    /** @internal */
    clone() {
      return new _Aliased(this.sql, this.fieldAlias);
    }
  };
  __publicField(_Aliased, _a2, "SQL.Aliased");
  let Aliased = _Aliased;
  SQL2.Aliased = Aliased;
})(SQL || (SQL = {}));
_w = entityKind;
class Placeholder {
  constructor(name2) {
    this.name = name2;
  }
  getSQL() {
    return new SQL([this]);
  }
}
__publicField(Placeholder, _w, "Placeholder");
function fillPlaceholders(params, values) {
  return params.map((p) => {
    if (is(p, Placeholder)) {
      if (!(p.name in values)) {
        throw new Error(`No value for placeholder "${p.name}" was provided`);
      }
      return values[p.name];
    }
    if (is(p, Param) && is(p.value, Placeholder)) {
      if (!(p.value.name in values)) {
        throw new Error(`No value for placeholder "${p.value.name}" was provided`);
      }
      return p.encoder.mapToDriverValue(values[p.value.name]);
    }
    return p;
  });
}
const IsDrizzleView = Symbol.for("drizzle:IsDrizzleView");
_z = entityKind, _y = ViewBaseConfig, _x = IsDrizzleView;
class View {
  constructor({ name: name2, schema: schema2, selectedFields, query }) {
    /** @internal */
    __publicField(this, _y);
    /** @internal */
    __publicField(this, _x, true);
    this[ViewBaseConfig] = {
      name: name2,
      originalName: name2,
      schema: schema2,
      selectedFields,
      query,
      isExisting: !query,
      isAlias: false
    };
  }
  getSQL() {
    return new SQL([this]);
  }
}
__publicField(View, _z, "View");
Column.prototype.getSQL = function() {
  return new SQL([this]);
};
Table.prototype.getSQL = function() {
  return new SQL([this]);
};
Subquery.prototype.getSQL = function() {
  return new SQL([this]);
};
function mapResultRow(columns, row, joinsNotNullableMap) {
  const nullifyMap = {};
  const result = columns.reduce(
    (result2, { path: path2, field }, columnIndex) => {
      let decoder;
      if (is(field, Column)) {
        decoder = field;
      } else if (is(field, SQL)) {
        decoder = field.decoder;
      } else if (is(field, Subquery)) {
        decoder = field._.sql.decoder;
      } else {
        decoder = field.sql.decoder;
      }
      let node = result2;
      for (const [pathChunkIndex, pathChunk] of path2.entries()) {
        if (pathChunkIndex < path2.length - 1) {
          if (!(pathChunk in node)) {
            node[pathChunk] = {};
          }
          node = node[pathChunk];
        } else {
          const rawValue = row[columnIndex];
          const value = node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
          if (joinsNotNullableMap && is(field, Column) && path2.length === 2) {
            const objectName = path2[0];
            if (!(objectName in nullifyMap)) {
              nullifyMap[objectName] = value === null ? getTableName(field.table) : false;
            } else if (typeof nullifyMap[objectName] === "string" && nullifyMap[objectName] !== getTableName(field.table)) {
              nullifyMap[objectName] = false;
            }
          }
        }
      }
      return result2;
    },
    {}
  );
  if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
    for (const [objectName, tableName] of Object.entries(nullifyMap)) {
      if (typeof tableName === "string" && !joinsNotNullableMap[tableName]) {
        result[objectName] = null;
      }
    }
  }
  return result;
}
function orderSelectedFields(fields, pathPrefix) {
  return Object.entries(fields).reduce((result, [name, field]) => {
    if (typeof name !== "string") {
      return result;
    }
    const newPath = pathPrefix ? [...pathPrefix, name] : [name];
    if (is(field, Column) || is(field, SQL) || is(field, SQL.Aliased) || is(field, Subquery)) {
      result.push({ path: newPath, field });
    } else if (is(field, Table)) {
      result.push(...orderSelectedFields(field[Table.Symbol.Columns], newPath));
    } else {
      result.push(...orderSelectedFields(field, newPath));
    }
    return result;
  }, []);
}
function haveSameKeys(left, right) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const [index, key] of leftKeys.entries()) {
    if (key !== rightKeys[index]) {
      return false;
    }
  }
  return true;
}
function mapUpdateSet(table, values) {
  const entries = Object.entries(values).filter(([, value]) => value !== void 0).map(([key, value]) => {
    if (is(value, SQL) || is(value, Column)) {
      return [key, value];
    } else {
      return [key, new Param(value, table[Table.Symbol.Columns][key])];
    }
  });
  if (entries.length === 0) {
    throw new Error("No values to set");
  }
  return Object.fromEntries(entries);
}
function applyMixins(baseClass, extendedClasses) {
  for (const extendedClass of extendedClasses) {
    for (const name of Object.getOwnPropertyNames(extendedClass.prototype)) {
      if (name === "constructor") continue;
      Object.defineProperty(
        baseClass.prototype,
        name,
        Object.getOwnPropertyDescriptor(extendedClass.prototype, name) || /* @__PURE__ */ Object.create(null)
      );
    }
  }
}
function getTableColumns(table) {
  return table[Table.Symbol.Columns];
}
function getTableLikeName(table) {
  return is(table, Subquery) ? table._.alias : is(table, View) ? table[ViewBaseConfig].name : is(table, SQL) ? void 0 : table[Table.Symbol.IsAlias] ? table[Table.Symbol.Name] : table[Table.Symbol.BaseName];
}
function getColumnNameAndConfig(a, b) {
  return {
    name: typeof a === "string" && a.length > 0 ? a : "",
    config: typeof a === "object" ? a : b
  };
}
function isConfig(data) {
  if (typeof data !== "object" || data === null) return false;
  if (data.constructor.name !== "Object") return false;
  if ("logger" in data) {
    const type = typeof data["logger"];
    if (type !== "boolean" && (type !== "object" || typeof data["logger"]["logQuery"] !== "function") && type !== "undefined") return false;
    return true;
  }
  if ("schema" in data) {
    const type = typeof data["schema"];
    if (type !== "object" && type !== "undefined") return false;
    return true;
  }
  if ("casing" in data) {
    const type = typeof data["casing"];
    if (type !== "string" && type !== "undefined") return false;
    return true;
  }
  if ("mode" in data) {
    if (data["mode"] !== "default" || data["mode"] !== "planetscale" || data["mode"] !== void 0) return false;
    return true;
  }
  if ("connection" in data) {
    const type = typeof data["connection"];
    if (type !== "string" && type !== "object" && type !== "undefined") return false;
    return true;
  }
  if ("client" in data) {
    const type = typeof data["client"];
    if (type !== "object" && type !== "function" && type !== "undefined") return false;
    return true;
  }
  if (Object.keys(data).length === 0) return true;
  return false;
}
const textDecoder = typeof TextDecoder === "undefined" ? null : new TextDecoder();
const InlineForeignKeys$1 = Symbol.for("drizzle:PgInlineForeignKeys");
const EnableRLS = Symbol.for("drizzle:EnableRLS");
class PgTable extends (_F = Table, _E = entityKind, _D = InlineForeignKeys$1, _C = EnableRLS, _B = Table.Symbol.ExtraConfigBuilder, _A = Table.Symbol.ExtraConfigColumns, _F) {
  constructor() {
    super(...arguments);
    /**@internal */
    __publicField(this, _D, []);
    /** @internal */
    __publicField(this, _C, false);
    /** @internal */
    __publicField(this, _B);
    /** @internal */
    __publicField(this, _A, {});
  }
}
__publicField(PgTable, _E, "PgTable");
/** @internal */
__publicField(PgTable, "Symbol", Object.assign({}, Table.Symbol, {
  InlineForeignKeys: InlineForeignKeys$1,
  EnableRLS
}));
_G = entityKind;
class PrimaryKeyBuilder {
  constructor(columns, name) {
    /** @internal */
    __publicField(this, "columns");
    /** @internal */
    __publicField(this, "name");
    this.columns = columns;
    this.name = name;
  }
  /** @internal */
  build(table) {
    return new PrimaryKey(table, this.columns, this.name);
  }
}
__publicField(PrimaryKeyBuilder, _G, "PgPrimaryKeyBuilder");
_H = entityKind;
class PrimaryKey {
  constructor(table, columns, name) {
    __publicField(this, "columns");
    __publicField(this, "name");
    this.table = table;
    this.columns = columns;
    this.name = name;
  }
  getName() {
    return this.name ?? `${this.table[PgTable.Symbol.Name]}_${this.columns.map((column) => column.name).join("_")}_pk`;
  }
}
__publicField(PrimaryKey, _H, "PgPrimaryKey");
function bindIfParam(value, column) {
  if (isDriverValueEncoder(column) && !isSQLWrapper(value) && !is(value, Param) && !is(value, Placeholder) && !is(value, Column) && !is(value, Table) && !is(value, View)) {
    return new Param(value, column);
  }
  return value;
}
const eq = (left, right) => {
  return sql`${left} = ${bindIfParam(right, left)}`;
};
const ne = (left, right) => {
  return sql`${left} <> ${bindIfParam(right, left)}`;
};
function and(...unfilteredConditions) {
  const conditions = unfilteredConditions.filter(
    (c) => c !== void 0
  );
  if (conditions.length === 0) {
    return void 0;
  }
  if (conditions.length === 1) {
    return new SQL(conditions);
  }
  return new SQL([
    new StringChunk("("),
    sql.join(conditions, new StringChunk(" and ")),
    new StringChunk(")")
  ]);
}
function or(...unfilteredConditions) {
  const conditions = unfilteredConditions.filter(
    (c) => c !== void 0
  );
  if (conditions.length === 0) {
    return void 0;
  }
  if (conditions.length === 1) {
    return new SQL(conditions);
  }
  return new SQL([
    new StringChunk("("),
    sql.join(conditions, new StringChunk(" or ")),
    new StringChunk(")")
  ]);
}
function not(condition) {
  return sql`not ${condition}`;
}
const gt = (left, right) => {
  return sql`${left} > ${bindIfParam(right, left)}`;
};
const gte = (left, right) => {
  return sql`${left} >= ${bindIfParam(right, left)}`;
};
const lt = (left, right) => {
  return sql`${left} < ${bindIfParam(right, left)}`;
};
const lte = (left, right) => {
  return sql`${left} <= ${bindIfParam(right, left)}`;
};
function inArray(column, values) {
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return sql`false`;
    }
    return sql`${column} in ${values.map((v) => bindIfParam(v, column))}`;
  }
  return sql`${column} in ${bindIfParam(values, column)}`;
}
function notInArray(column, values) {
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return sql`true`;
    }
    return sql`${column} not in ${values.map((v) => bindIfParam(v, column))}`;
  }
  return sql`${column} not in ${bindIfParam(values, column)}`;
}
function isNull(value) {
  return sql`${value} is null`;
}
function isNotNull(value) {
  return sql`${value} is not null`;
}
function exists(subquery) {
  return sql`exists ${subquery}`;
}
function notExists(subquery) {
  return sql`not exists ${subquery}`;
}
function between(column, min, max) {
  return sql`${column} between ${bindIfParam(min, column)} and ${bindIfParam(
    max,
    column
  )}`;
}
function notBetween(column, min, max) {
  return sql`${column} not between ${bindIfParam(
    min,
    column
  )} and ${bindIfParam(max, column)}`;
}
function like(column, value) {
  return sql`${column} like ${value}`;
}
function notLike(column, value) {
  return sql`${column} not like ${value}`;
}
function ilike(column, value) {
  return sql`${column} ilike ${value}`;
}
function notIlike(column, value) {
  return sql`${column} not ilike ${value}`;
}
function asc(column) {
  return sql`${column} asc`;
}
function desc(column) {
  return sql`${column} desc`;
}
_I = entityKind;
class Relation {
  constructor(sourceTable, referencedTable, relationName) {
    __publicField(this, "referencedTableName");
    __publicField(this, "fieldName");
    this.sourceTable = sourceTable;
    this.referencedTable = referencedTable;
    this.relationName = relationName;
    this.referencedTableName = referencedTable[Table.Symbol.Name];
  }
}
__publicField(Relation, _I, "Relation");
_J = entityKind;
class Relations {
  constructor(table, config) {
    this.table = table;
    this.config = config;
  }
}
__publicField(Relations, _J, "Relations");
const _One = class _One extends (_L = Relation, _K = entityKind, _L) {
  constructor(sourceTable, referencedTable, config, isNullable) {
    super(sourceTable, referencedTable, config == null ? void 0 : config.relationName);
    this.config = config;
    this.isNullable = isNullable;
  }
  withFieldName(fieldName) {
    const relation = new _One(
      this.sourceTable,
      this.referencedTable,
      this.config,
      this.isNullable
    );
    relation.fieldName = fieldName;
    return relation;
  }
};
__publicField(_One, _K, "One");
let One = _One;
const _Many = class _Many extends (_N = Relation, _M = entityKind, _N) {
  constructor(sourceTable, referencedTable, config) {
    super(sourceTable, referencedTable, config == null ? void 0 : config.relationName);
    this.config = config;
  }
  withFieldName(fieldName) {
    const relation = new _Many(
      this.sourceTable,
      this.referencedTable,
      this.config
    );
    relation.fieldName = fieldName;
    return relation;
  }
};
__publicField(_Many, _M, "Many");
let Many = _Many;
function getOperators() {
  return {
    and,
    between,
    eq,
    exists,
    gt,
    gte,
    ilike,
    inArray,
    isNull,
    isNotNull,
    like,
    lt,
    lte,
    ne,
    not,
    notBetween,
    notExists,
    notLike,
    notIlike,
    notInArray,
    or,
    sql
  };
}
function getOrderByOperators() {
  return {
    sql,
    asc,
    desc
  };
}
function extractTablesRelationalConfig(schema2, configHelpers) {
  var _a2;
  if (Object.keys(schema2).length === 1 && "default" in schema2 && !is(schema2["default"], Table)) {
    schema2 = schema2["default"];
  }
  const tableNamesMap = {};
  const relationsBuffer = {};
  const tablesConfig = {};
  for (const [key, value] of Object.entries(schema2)) {
    if (is(value, Table)) {
      const dbName = getTableUniqueName(value);
      const bufferedRelations = relationsBuffer[dbName];
      tableNamesMap[dbName] = key;
      tablesConfig[key] = {
        tsName: key,
        dbName: value[Table.Symbol.Name],
        schema: value[Table.Symbol.Schema],
        columns: value[Table.Symbol.Columns],
        relations: (bufferedRelations == null ? void 0 : bufferedRelations.relations) ?? {},
        primaryKey: (bufferedRelations == null ? void 0 : bufferedRelations.primaryKey) ?? []
      };
      for (const column of Object.values(
        value[Table.Symbol.Columns]
      )) {
        if (column.primary) {
          tablesConfig[key].primaryKey.push(column);
        }
      }
      const extraConfig = (_a2 = value[Table.Symbol.ExtraConfigBuilder]) == null ? void 0 : _a2.call(value, value[Table.Symbol.ExtraConfigColumns]);
      if (extraConfig) {
        for (const configEntry of Object.values(extraConfig)) {
          if (is(configEntry, PrimaryKeyBuilder)) {
            tablesConfig[key].primaryKey.push(...configEntry.columns);
          }
        }
      }
    } else if (is(value, Relations)) {
      const dbName = getTableUniqueName(value.table);
      const tableName = tableNamesMap[dbName];
      const relations2 = value.config(
        configHelpers(value.table)
      );
      let primaryKey;
      for (const [relationName, relation] of Object.entries(relations2)) {
        if (tableName) {
          const tableConfig = tablesConfig[tableName];
          tableConfig.relations[relationName] = relation;
        } else {
          if (!(dbName in relationsBuffer)) {
            relationsBuffer[dbName] = {
              relations: {},
              primaryKey
            };
          }
          relationsBuffer[dbName].relations[relationName] = relation;
        }
      }
    }
  }
  return { tables: tablesConfig, tableNamesMap };
}
function createOne(sourceTable) {
  return function one(table, config) {
    return new One(
      sourceTable,
      table,
      config,
      (config == null ? void 0 : config.fields.reduce((res, f) => res && f.notNull, true)) ?? false
    );
  };
}
function createMany(sourceTable) {
  return function many(referencedTable, config) {
    return new Many(sourceTable, referencedTable, config);
  };
}
function normalizeRelation(schema2, tableNamesMap, relation) {
  if (is(relation, One) && relation.config) {
    return {
      fields: relation.config.fields,
      references: relation.config.references
    };
  }
  const referencedTableTsName = tableNamesMap[getTableUniqueName(relation.referencedTable)];
  if (!referencedTableTsName) {
    throw new Error(
      `Table "${relation.referencedTable[Table.Symbol.Name]}" not found in schema`
    );
  }
  const referencedTableConfig = schema2[referencedTableTsName];
  if (!referencedTableConfig) {
    throw new Error(`Table "${referencedTableTsName}" not found in schema`);
  }
  const sourceTable = relation.sourceTable;
  const sourceTableTsName = tableNamesMap[getTableUniqueName(sourceTable)];
  if (!sourceTableTsName) {
    throw new Error(
      `Table "${sourceTable[Table.Symbol.Name]}" not found in schema`
    );
  }
  const reverseRelations = [];
  for (const referencedTableRelation of Object.values(
    referencedTableConfig.relations
  )) {
    if (relation.relationName && relation !== referencedTableRelation && referencedTableRelation.relationName === relation.relationName || !relation.relationName && referencedTableRelation.referencedTable === relation.sourceTable) {
      reverseRelations.push(referencedTableRelation);
    }
  }
  if (reverseRelations.length > 1) {
    throw relation.relationName ? new Error(
      `There are multiple relations with name "${relation.relationName}" in table "${referencedTableTsName}"`
    ) : new Error(
      `There are multiple relations between "${referencedTableTsName}" and "${relation.sourceTable[Table.Symbol.Name]}". Please specify relation name`
    );
  }
  if (reverseRelations[0] && is(reverseRelations[0], One) && reverseRelations[0].config) {
    return {
      fields: reverseRelations[0].config.references,
      references: reverseRelations[0].config.fields
    };
  }
  throw new Error(
    `There is not enough information to infer relation "${sourceTableTsName}.${relation.fieldName}"`
  );
}
function createTableRelationsHelpers(sourceTable) {
  return {
    one: createOne(sourceTable),
    many: createMany(sourceTable)
  };
}
function mapRelationalRow(tablesConfig, tableConfig, row, buildQueryResultSelection, mapColumnValue = (value) => value) {
  const result = {};
  for (const [
    selectionItemIndex,
    selectionItem
  ] of buildQueryResultSelection.entries()) {
    if (selectionItem.isJson) {
      const relation = tableConfig.relations[selectionItem.tsKey];
      const rawSubRows = row[selectionItemIndex];
      const subRows = typeof rawSubRows === "string" ? JSON.parse(rawSubRows) : rawSubRows;
      result[selectionItem.tsKey] = is(relation, One) ? subRows && mapRelationalRow(
        tablesConfig,
        tablesConfig[selectionItem.relationTableTsKey],
        subRows,
        selectionItem.selection,
        mapColumnValue
      ) : subRows.map(
        (subRow) => mapRelationalRow(
          tablesConfig,
          tablesConfig[selectionItem.relationTableTsKey],
          subRow,
          selectionItem.selection,
          mapColumnValue
        )
      );
    } else {
      const value = mapColumnValue(row[selectionItemIndex]);
      const field = selectionItem.field;
      let decoder;
      if (is(field, Column)) {
        decoder = field;
      } else if (is(field, SQL)) {
        decoder = field.decoder;
      } else {
        decoder = field.sql.decoder;
      }
      result[selectionItem.tsKey] = value === null ? null : decoder.mapFromDriverValue(value);
    }
  }
  return result;
}
_O = entityKind;
class ColumnAliasProxyHandler {
  constructor(table) {
    this.table = table;
  }
  get(columnObj, prop) {
    if (prop === "table") {
      return this.table;
    }
    return columnObj[prop];
  }
}
__publicField(ColumnAliasProxyHandler, _O, "ColumnAliasProxyHandler");
_P = entityKind;
class TableAliasProxyHandler {
  constructor(alias, replaceOriginalName) {
    this.alias = alias;
    this.replaceOriginalName = replaceOriginalName;
  }
  get(target, prop) {
    if (prop === Table.Symbol.IsAlias) {
      return true;
    }
    if (prop === Table.Symbol.Name) {
      return this.alias;
    }
    if (this.replaceOriginalName && prop === Table.Symbol.OriginalName) {
      return this.alias;
    }
    if (prop === ViewBaseConfig) {
      return {
        ...target[ViewBaseConfig],
        name: this.alias,
        isAlias: true
      };
    }
    if (prop === Table.Symbol.Columns) {
      const columns = target[Table.Symbol.Columns];
      if (!columns) {
        return columns;
      }
      const proxiedColumns = {};
      Object.keys(columns).map((key) => {
        proxiedColumns[key] = new Proxy(
          columns[key],
          new ColumnAliasProxyHandler(new Proxy(target, this))
        );
      });
      return proxiedColumns;
    }
    const value = target[prop];
    if (is(value, Column)) {
      return new Proxy(value, new ColumnAliasProxyHandler(new Proxy(target, this)));
    }
    return value;
  }
}
__publicField(TableAliasProxyHandler, _P, "TableAliasProxyHandler");
function aliasedTable(table, tableAlias) {
  return new Proxy(table, new TableAliasProxyHandler(tableAlias, false));
}
function aliasedTableColumn(column, tableAlias) {
  return new Proxy(
    column,
    new ColumnAliasProxyHandler(new Proxy(column.table, new TableAliasProxyHandler(tableAlias, false)))
  );
}
function mapColumnsInAliasedSQLToAlias(query, alias) {
  return new SQL.Aliased(mapColumnsInSQLToAlias(query.sql, alias), query.fieldAlias);
}
function mapColumnsInSQLToAlias(query, alias) {
  return sql.join(query.queryChunks.map((c) => {
    if (is(c, Column)) {
      return aliasedTableColumn(c, alias);
    }
    if (is(c, SQL)) {
      return mapColumnsInSQLToAlias(c, alias);
    }
    if (is(c, SQL.Aliased)) {
      return mapColumnsInAliasedSQLToAlias(c, alias);
    }
    return c;
  }));
}
_Q = entityKind;
const _SelectionProxyHandler = class _SelectionProxyHandler {
  constructor(config) {
    __publicField(this, "config");
    this.config = { ...config };
  }
  get(subquery, prop) {
    if (prop === "_") {
      return {
        ...subquery["_"],
        selectedFields: new Proxy(
          subquery._.selectedFields,
          this
        )
      };
    }
    if (prop === ViewBaseConfig) {
      return {
        ...subquery[ViewBaseConfig],
        selectedFields: new Proxy(
          subquery[ViewBaseConfig].selectedFields,
          this
        )
      };
    }
    if (typeof prop === "symbol") {
      return subquery[prop];
    }
    const columns = is(subquery, Subquery) ? subquery._.selectedFields : is(subquery, View) ? subquery[ViewBaseConfig].selectedFields : subquery;
    const value = columns[prop];
    if (is(value, SQL.Aliased)) {
      if (this.config.sqlAliasedBehavior === "sql" && !value.isSelectionField) {
        return value.sql;
      }
      const newValue = value.clone();
      newValue.isSelectionField = true;
      return newValue;
    }
    if (is(value, SQL)) {
      if (this.config.sqlBehavior === "sql") {
        return value;
      }
      throw new Error(
        `You tried to reference "${prop}" field from a subquery, which is a raw SQL field, but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.`
      );
    }
    if (is(value, Column)) {
      if (this.config.alias) {
        return new Proxy(
          value,
          new ColumnAliasProxyHandler(
            new Proxy(
              value.table,
              new TableAliasProxyHandler(this.config.alias, this.config.replaceOriginalName ?? false)
            )
          )
        );
      }
      return value;
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    return new Proxy(value, new _SelectionProxyHandler(this.config));
  }
};
__publicField(_SelectionProxyHandler, _Q, "SelectionProxyHandler");
let SelectionProxyHandler = _SelectionProxyHandler;
_S = entityKind, _R = Symbol.toStringTag;
class QueryPromise {
  constructor() {
    __publicField(this, _R, "QueryPromise");
  }
  catch(onRejected) {
    return this.then(void 0, onRejected);
  }
  finally(onFinally) {
    return this.then(
      (value) => {
        onFinally == null ? void 0 : onFinally();
        return value;
      },
      (reason) => {
        onFinally == null ? void 0 : onFinally();
        throw reason;
      }
    );
  }
  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }
}
__publicField(QueryPromise, _S, "QueryPromise");
_T = entityKind;
class ForeignKeyBuilder {
  constructor(config, actions) {
    /** @internal */
    __publicField(this, "reference");
    /** @internal */
    __publicField(this, "_onUpdate");
    /** @internal */
    __publicField(this, "_onDelete");
    this.reference = () => {
      const { name, columns, foreignColumns } = config();
      return { name, columns, foreignTable: foreignColumns[0].table, foreignColumns };
    };
    if (actions) {
      this._onUpdate = actions.onUpdate;
      this._onDelete = actions.onDelete;
    }
  }
  onUpdate(action) {
    this._onUpdate = action;
    return this;
  }
  onDelete(action) {
    this._onDelete = action;
    return this;
  }
  /** @internal */
  build(table) {
    return new ForeignKey(table, this);
  }
}
__publicField(ForeignKeyBuilder, _T, "SQLiteForeignKeyBuilder");
_U = entityKind;
class ForeignKey {
  constructor(table, builder) {
    __publicField(this, "reference");
    __publicField(this, "onUpdate");
    __publicField(this, "onDelete");
    this.table = table;
    this.reference = builder.reference;
    this.onUpdate = builder._onUpdate;
    this.onDelete = builder._onDelete;
  }
  getName() {
    const { name, columns, foreignColumns } = this.reference();
    const columnNames = columns.map((column) => column.name);
    const foreignColumnNames = foreignColumns.map((column) => column.name);
    const chunks = [
      this.table[TableName],
      ...columnNames,
      foreignColumns[0].table[TableName],
      ...foreignColumnNames
    ];
    return name ?? `${chunks.join("_")}_fk`;
  }
}
__publicField(ForeignKey, _U, "SQLiteForeignKey");
function uniqueKeyName(table, columns) {
  return `${table[TableName]}_${columns.join("_")}_unique`;
}
class SQLiteColumnBuilder extends (_W = ColumnBuilder, _V = entityKind, _W) {
  constructor() {
    super(...arguments);
    __publicField(this, "foreignKeyConfigs", []);
  }
  references(ref, actions = {}) {
    this.foreignKeyConfigs.push({ ref, actions });
    return this;
  }
  unique(name) {
    this.config.isUnique = true;
    this.config.uniqueName = name;
    return this;
  }
  generatedAlwaysAs(as, config) {
    this.config.generated = {
      as,
      type: "always",
      mode: (config == null ? void 0 : config.mode) ?? "virtual"
    };
    return this;
  }
  /** @internal */
  buildForeignKeys(column, table) {
    return this.foreignKeyConfigs.map(({ ref, actions }) => {
      return ((ref2, actions2) => {
        const builder = new ForeignKeyBuilder(() => {
          const foreignColumn = ref2();
          return { columns: [column], foreignColumns: [foreignColumn] };
        });
        if (actions2.onUpdate) {
          builder.onUpdate(actions2.onUpdate);
        }
        if (actions2.onDelete) {
          builder.onDelete(actions2.onDelete);
        }
        return builder.build(table);
      })(ref, actions);
    });
  }
}
__publicField(SQLiteColumnBuilder, _V, "SQLiteColumnBuilder");
class SQLiteColumn extends (_Y = Column, _X = entityKind, _Y) {
  constructor(table, config) {
    if (!config.uniqueName) {
      config.uniqueName = uniqueKeyName(table, [config.name]);
    }
    super(table, config);
    this.table = table;
  }
}
__publicField(SQLiteColumn, _X, "SQLiteColumn");
class SQLiteBigIntBuilder extends (__ = SQLiteColumnBuilder, _Z = entityKind, __) {
  constructor(name) {
    super(name, "bigint", "SQLiteBigInt");
  }
  /** @internal */
  build(table) {
    return new SQLiteBigInt(table, this.config);
  }
}
__publicField(SQLiteBigIntBuilder, _Z, "SQLiteBigIntBuilder");
class SQLiteBigInt extends (_aa = SQLiteColumn, _$ = entityKind, _aa) {
  getSQLType() {
    return "blob";
  }
  mapFromDriverValue(value) {
    if (typeof Buffer !== "undefined" && Buffer.from) {
      const buf = Buffer.isBuffer(value) ? value : value instanceof ArrayBuffer ? Buffer.from(value) : value.buffer ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : Buffer.from(value);
      return BigInt(buf.toString("utf8"));
    }
    return BigInt(textDecoder.decode(value));
  }
  mapToDriverValue(value) {
    return Buffer.from(value.toString());
  }
}
__publicField(SQLiteBigInt, _$, "SQLiteBigInt");
class SQLiteBlobJsonBuilder extends (_ca = SQLiteColumnBuilder, _ba = entityKind, _ca) {
  constructor(name) {
    super(name, "json", "SQLiteBlobJson");
  }
  /** @internal */
  build(table) {
    return new SQLiteBlobJson(
      table,
      this.config
    );
  }
}
__publicField(SQLiteBlobJsonBuilder, _ba, "SQLiteBlobJsonBuilder");
class SQLiteBlobJson extends (_ea = SQLiteColumn, _da = entityKind, _ea) {
  getSQLType() {
    return "blob";
  }
  mapFromDriverValue(value) {
    if (typeof Buffer !== "undefined" && Buffer.from) {
      const buf = Buffer.isBuffer(value) ? value : value instanceof ArrayBuffer ? Buffer.from(value) : value.buffer ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : Buffer.from(value);
      return JSON.parse(buf.toString("utf8"));
    }
    return JSON.parse(textDecoder.decode(value));
  }
  mapToDriverValue(value) {
    return Buffer.from(JSON.stringify(value));
  }
}
__publicField(SQLiteBlobJson, _da, "SQLiteBlobJson");
class SQLiteBlobBufferBuilder extends (_ga = SQLiteColumnBuilder, _fa = entityKind, _ga) {
  constructor(name) {
    super(name, "buffer", "SQLiteBlobBuffer");
  }
  /** @internal */
  build(table) {
    return new SQLiteBlobBuffer(table, this.config);
  }
}
__publicField(SQLiteBlobBufferBuilder, _fa, "SQLiteBlobBufferBuilder");
class SQLiteBlobBuffer extends (_ia = SQLiteColumn, _ha = entityKind, _ia) {
  mapFromDriverValue(value) {
    if (Buffer.isBuffer(value)) {
      return value;
    }
    return Buffer.from(value);
  }
  getSQLType() {
    return "blob";
  }
}
__publicField(SQLiteBlobBuffer, _ha, "SQLiteBlobBuffer");
function blob(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if ((config == null ? void 0 : config.mode) === "json") {
    return new SQLiteBlobJsonBuilder(name);
  }
  if ((config == null ? void 0 : config.mode) === "bigint") {
    return new SQLiteBigIntBuilder(name);
  }
  return new SQLiteBlobBufferBuilder(name);
}
class SQLiteCustomColumnBuilder extends (_ka = SQLiteColumnBuilder, _ja = entityKind, _ka) {
  constructor(name, fieldConfig, customTypeParams) {
    super(name, "custom", "SQLiteCustomColumn");
    this.config.fieldConfig = fieldConfig;
    this.config.customTypeParams = customTypeParams;
  }
  /** @internal */
  build(table) {
    return new SQLiteCustomColumn(
      table,
      this.config
    );
  }
}
__publicField(SQLiteCustomColumnBuilder, _ja, "SQLiteCustomColumnBuilder");
class SQLiteCustomColumn extends (_ma = SQLiteColumn, _la = entityKind, _ma) {
  constructor(table, config) {
    super(table, config);
    __publicField(this, "sqlName");
    __publicField(this, "mapTo");
    __publicField(this, "mapFrom");
    this.sqlName = config.customTypeParams.dataType(config.fieldConfig);
    this.mapTo = config.customTypeParams.toDriver;
    this.mapFrom = config.customTypeParams.fromDriver;
  }
  getSQLType() {
    return this.sqlName;
  }
  mapFromDriverValue(value) {
    return typeof this.mapFrom === "function" ? this.mapFrom(value) : value;
  }
  mapToDriverValue(value) {
    return typeof this.mapTo === "function" ? this.mapTo(value) : value;
  }
}
__publicField(SQLiteCustomColumn, _la, "SQLiteCustomColumn");
function customType(customTypeParams) {
  return (a, b) => {
    const { name, config } = getColumnNameAndConfig(a, b);
    return new SQLiteCustomColumnBuilder(
      name,
      config,
      customTypeParams
    );
  };
}
class SQLiteBaseIntegerBuilder extends (_oa = SQLiteColumnBuilder, _na = entityKind, _oa) {
  constructor(name, dataType, columnType) {
    super(name, dataType, columnType);
    this.config.autoIncrement = false;
  }
  primaryKey(config) {
    if (config == null ? void 0 : config.autoIncrement) {
      this.config.autoIncrement = true;
    }
    this.config.hasDefault = true;
    return super.primaryKey();
  }
}
__publicField(SQLiteBaseIntegerBuilder, _na, "SQLiteBaseIntegerBuilder");
class SQLiteBaseInteger extends (_qa = SQLiteColumn, _pa = entityKind, _qa) {
  constructor() {
    super(...arguments);
    __publicField(this, "autoIncrement", this.config.autoIncrement);
  }
  getSQLType() {
    return "integer";
  }
}
__publicField(SQLiteBaseInteger, _pa, "SQLiteBaseInteger");
class SQLiteIntegerBuilder extends (_sa = SQLiteBaseIntegerBuilder, _ra = entityKind, _sa) {
  constructor(name) {
    super(name, "number", "SQLiteInteger");
  }
  build(table) {
    return new SQLiteInteger(
      table,
      this.config
    );
  }
}
__publicField(SQLiteIntegerBuilder, _ra, "SQLiteIntegerBuilder");
class SQLiteInteger extends (_ua = SQLiteBaseInteger, _ta = entityKind, _ua) {
}
__publicField(SQLiteInteger, _ta, "SQLiteInteger");
class SQLiteTimestampBuilder extends (_wa = SQLiteBaseIntegerBuilder, _va = entityKind, _wa) {
  constructor(name, mode) {
    super(name, "date", "SQLiteTimestamp");
    this.config.mode = mode;
  }
  /**
   * @deprecated Use `default()` with your own expression instead.
   *
   * Adds `DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))` to the column, which is the current epoch timestamp in milliseconds.
   */
  defaultNow() {
    return this.default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`);
  }
  build(table) {
    return new SQLiteTimestamp(
      table,
      this.config
    );
  }
}
__publicField(SQLiteTimestampBuilder, _va, "SQLiteTimestampBuilder");
class SQLiteTimestamp extends (_ya = SQLiteBaseInteger, _xa = entityKind, _ya) {
  constructor() {
    super(...arguments);
    __publicField(this, "mode", this.config.mode);
  }
  mapFromDriverValue(value) {
    if (this.config.mode === "timestamp") {
      return new Date(value * 1e3);
    }
    return new Date(value);
  }
  mapToDriverValue(value) {
    const unix = value.getTime();
    if (this.config.mode === "timestamp") {
      return Math.floor(unix / 1e3);
    }
    return unix;
  }
}
__publicField(SQLiteTimestamp, _xa, "SQLiteTimestamp");
class SQLiteBooleanBuilder extends (_Aa = SQLiteBaseIntegerBuilder, _za = entityKind, _Aa) {
  constructor(name, mode) {
    super(name, "boolean", "SQLiteBoolean");
    this.config.mode = mode;
  }
  build(table) {
    return new SQLiteBoolean(
      table,
      this.config
    );
  }
}
__publicField(SQLiteBooleanBuilder, _za, "SQLiteBooleanBuilder");
class SQLiteBoolean extends (_Ca = SQLiteBaseInteger, _Ba = entityKind, _Ca) {
  constructor() {
    super(...arguments);
    __publicField(this, "mode", this.config.mode);
  }
  mapFromDriverValue(value) {
    return Number(value) === 1;
  }
  mapToDriverValue(value) {
    return value ? 1 : 0;
  }
}
__publicField(SQLiteBoolean, _Ba, "SQLiteBoolean");
function integer(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if ((config == null ? void 0 : config.mode) === "timestamp" || (config == null ? void 0 : config.mode) === "timestamp_ms") {
    return new SQLiteTimestampBuilder(name, config.mode);
  }
  if ((config == null ? void 0 : config.mode) === "boolean") {
    return new SQLiteBooleanBuilder(name, config.mode);
  }
  return new SQLiteIntegerBuilder(name);
}
class SQLiteNumericBuilder extends (_Ea = SQLiteColumnBuilder, _Da = entityKind, _Ea) {
  constructor(name) {
    super(name, "string", "SQLiteNumeric");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumeric(
      table,
      this.config
    );
  }
}
__publicField(SQLiteNumericBuilder, _Da, "SQLiteNumericBuilder");
class SQLiteNumeric extends (_Ga = SQLiteColumn, _Fa = entityKind, _Ga) {
  mapFromDriverValue(value) {
    if (typeof value === "string") return value;
    return String(value);
  }
  getSQLType() {
    return "numeric";
  }
}
__publicField(SQLiteNumeric, _Fa, "SQLiteNumeric");
class SQLiteNumericNumberBuilder extends (_Ia = SQLiteColumnBuilder, _Ha = entityKind, _Ia) {
  constructor(name) {
    super(name, "number", "SQLiteNumericNumber");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumericNumber(
      table,
      this.config
    );
  }
}
__publicField(SQLiteNumericNumberBuilder, _Ha, "SQLiteNumericNumberBuilder");
class SQLiteNumericNumber extends (_Ka = SQLiteColumn, _Ja = entityKind, _Ka) {
  constructor() {
    super(...arguments);
    __publicField(this, "mapToDriverValue", String);
  }
  mapFromDriverValue(value) {
    if (typeof value === "number") return value;
    return Number(value);
  }
  getSQLType() {
    return "numeric";
  }
}
__publicField(SQLiteNumericNumber, _Ja, "SQLiteNumericNumber");
class SQLiteNumericBigIntBuilder extends (_Ma = SQLiteColumnBuilder, _La = entityKind, _Ma) {
  constructor(name) {
    super(name, "bigint", "SQLiteNumericBigInt");
  }
  /** @internal */
  build(table) {
    return new SQLiteNumericBigInt(
      table,
      this.config
    );
  }
}
__publicField(SQLiteNumericBigIntBuilder, _La, "SQLiteNumericBigIntBuilder");
class SQLiteNumericBigInt extends (_Oa = SQLiteColumn, _Na = entityKind, _Oa) {
  constructor() {
    super(...arguments);
    __publicField(this, "mapFromDriverValue", BigInt);
    __publicField(this, "mapToDriverValue", String);
  }
  getSQLType() {
    return "numeric";
  }
}
__publicField(SQLiteNumericBigInt, _Na, "SQLiteNumericBigInt");
function numeric(a, b) {
  const { name, config } = getColumnNameAndConfig(a, b);
  const mode = config == null ? void 0 : config.mode;
  return mode === "number" ? new SQLiteNumericNumberBuilder(name) : mode === "bigint" ? new SQLiteNumericBigIntBuilder(name) : new SQLiteNumericBuilder(name);
}
class SQLiteRealBuilder extends (_Qa = SQLiteColumnBuilder, _Pa = entityKind, _Qa) {
  constructor(name) {
    super(name, "number", "SQLiteReal");
  }
  /** @internal */
  build(table) {
    return new SQLiteReal(table, this.config);
  }
}
__publicField(SQLiteRealBuilder, _Pa, "SQLiteRealBuilder");
class SQLiteReal extends (_Sa = SQLiteColumn, _Ra = entityKind, _Sa) {
  getSQLType() {
    return "real";
  }
}
__publicField(SQLiteReal, _Ra, "SQLiteReal");
function real(name) {
  return new SQLiteRealBuilder(name ?? "");
}
class SQLiteTextBuilder extends (_Ua = SQLiteColumnBuilder, _Ta = entityKind, _Ua) {
  constructor(name, config) {
    super(name, "string", "SQLiteText");
    this.config.enumValues = config.enum;
    this.config.length = config.length;
  }
  /** @internal */
  build(table) {
    return new SQLiteText(
      table,
      this.config
    );
  }
}
__publicField(SQLiteTextBuilder, _Ta, "SQLiteTextBuilder");
class SQLiteText extends (_Wa = SQLiteColumn, _Va = entityKind, _Wa) {
  constructor(table, config) {
    super(table, config);
    __publicField(this, "enumValues", this.config.enumValues);
    __publicField(this, "length", this.config.length);
  }
  getSQLType() {
    return `text${this.config.length ? `(${this.config.length})` : ""}`;
  }
}
__publicField(SQLiteText, _Va, "SQLiteText");
class SQLiteTextJsonBuilder extends (_Ya = SQLiteColumnBuilder, _Xa = entityKind, _Ya) {
  constructor(name) {
    super(name, "json", "SQLiteTextJson");
  }
  /** @internal */
  build(table) {
    return new SQLiteTextJson(
      table,
      this.config
    );
  }
}
__publicField(SQLiteTextJsonBuilder, _Xa, "SQLiteTextJsonBuilder");
class SQLiteTextJson extends (__a = SQLiteColumn, _Za = entityKind, __a) {
  getSQLType() {
    return "text";
  }
  mapFromDriverValue(value) {
    return JSON.parse(value);
  }
  mapToDriverValue(value) {
    return JSON.stringify(value);
  }
}
__publicField(SQLiteTextJson, _Za, "SQLiteTextJson");
function text(a, b = {}) {
  const { name, config } = getColumnNameAndConfig(a, b);
  if (config.mode === "json") {
    return new SQLiteTextJsonBuilder(name);
  }
  return new SQLiteTextBuilder(name, config);
}
function getSQLiteColumnBuilders() {
  return {
    blob,
    customType,
    integer,
    numeric,
    real,
    text
  };
}
const InlineForeignKeys = Symbol.for("drizzle:SQLiteInlineForeignKeys");
class SQLiteTable extends (_db = Table, _cb = entityKind, _bb = Table.Symbol.Columns, _ab = InlineForeignKeys, _$a = Table.Symbol.ExtraConfigBuilder, _db) {
  constructor() {
    super(...arguments);
    /** @internal */
    __publicField(this, _bb);
    /** @internal */
    __publicField(this, _ab, []);
    /** @internal */
    __publicField(this, _$a);
  }
}
__publicField(SQLiteTable, _cb, "SQLiteTable");
/** @internal */
__publicField(SQLiteTable, "Symbol", Object.assign({}, Table.Symbol, {
  InlineForeignKeys
}));
function sqliteTableBase(name, columns, extraConfig, schema2, baseName = name) {
  const rawTable = new SQLiteTable(name, schema2, baseName);
  const parsedColumns = typeof columns === "function" ? columns(getSQLiteColumnBuilders()) : columns;
  const builtColumns = Object.fromEntries(
    Object.entries(parsedColumns).map(([name2, colBuilderBase]) => {
      const colBuilder = colBuilderBase;
      colBuilder.setName(name2);
      const column = colBuilder.build(rawTable);
      rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
      return [name2, column];
    })
  );
  const table = Object.assign(rawTable, builtColumns);
  table[Table.Symbol.Columns] = builtColumns;
  table[Table.Symbol.ExtraConfigColumns] = builtColumns;
  return table;
}
const sqliteTable = (name, columns, extraConfig) => {
  return sqliteTableBase(name, columns);
};
function extractUsedTable(table) {
  if (is(table, SQLiteTable)) {
    return [`${table[Table.Symbol.BaseName]}`];
  }
  if (is(table, Subquery)) {
    return table._.usedTables ?? [];
  }
  if (is(table, SQL)) {
    return table.usedTables ?? [];
  }
  return [];
}
class SQLiteDeleteBase extends (_fb = QueryPromise, _eb = entityKind, _fb) {
  constructor(table, session2, dialect, withList) {
    super();
    /** @internal */
    __publicField(this, "config");
    __publicField(this, "run", (placeholderValues) => {
      return this._prepare().run(placeholderValues);
    });
    __publicField(this, "all", (placeholderValues) => {
      return this._prepare().all(placeholderValues);
    });
    __publicField(this, "get", (placeholderValues) => {
      return this._prepare().get(placeholderValues);
    });
    __publicField(this, "values", (placeholderValues) => {
      return this._prepare().values(placeholderValues);
    });
    this.table = table;
    this.session = session2;
    this.dialect = dialect;
    this.config = { table, withList };
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
  where(where) {
    this.config.where = where;
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.table[Table.Symbol.Columns],
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      this.config.orderBy = orderByArray;
    } else {
      const orderByArray = columns;
      this.config.orderBy = orderByArray;
    }
    return this;
  }
  limit(limit) {
    this.config.limit = limit;
    return this;
  }
  returning(fields = this.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildDeleteQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "delete",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  async execute(placeholderValues) {
    return this._prepare().execute(placeholderValues);
  }
  $dynamic() {
    return this;
  }
}
__publicField(SQLiteDeleteBase, _eb, "SQLiteDelete");
function toSnakeCase(input) {
  const words = input.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];
  return words.map((word) => word.toLowerCase()).join("_");
}
function toCamelCase(input) {
  const words = input.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];
  return words.reduce((acc, word, i) => {
    const formattedWord = i === 0 ? word.toLowerCase() : `${word[0].toUpperCase()}${word.slice(1)}`;
    return acc + formattedWord;
  }, "");
}
function noopCase(input) {
  return input;
}
_gb = entityKind;
class CasingCache {
  constructor(casing) {
    /** @internal */
    __publicField(this, "cache", {});
    __publicField(this, "cachedTables", {});
    __publicField(this, "convert");
    this.convert = casing === "snake_case" ? toSnakeCase : casing === "camelCase" ? toCamelCase : noopCase;
  }
  getColumnCasing(column) {
    if (!column.keyAsName) return column.name;
    const schema2 = column.table[Table.Symbol.Schema] ?? "public";
    const tableName = column.table[Table.Symbol.OriginalName];
    const key = `${schema2}.${tableName}.${column.name}`;
    if (!this.cache[key]) {
      this.cacheTable(column.table);
    }
    return this.cache[key];
  }
  cacheTable(table) {
    const schema2 = table[Table.Symbol.Schema] ?? "public";
    const tableName = table[Table.Symbol.OriginalName];
    const tableKey = `${schema2}.${tableName}`;
    if (!this.cachedTables[tableKey]) {
      for (const column of Object.values(table[Table.Symbol.Columns])) {
        const columnKey = `${tableKey}.${column.name}`;
        this.cache[columnKey] = this.convert(column.name);
      }
      this.cachedTables[tableKey] = true;
    }
  }
  clearCache() {
    this.cache = {};
    this.cachedTables = {};
  }
}
__publicField(CasingCache, _gb, "CasingCache");
class DrizzleError extends (_ib = Error, _hb = entityKind, _ib) {
  constructor({ message, cause }) {
    super(message);
    this.name = "DrizzleError";
    this.cause = cause;
  }
}
__publicField(DrizzleError, _hb, "DrizzleError");
class DrizzleQueryError extends Error {
  constructor(query, params, cause) {
    super(`Failed query: ${query}
params: ${params}`);
    this.query = query;
    this.params = params;
    this.cause = cause;
    Error.captureStackTrace(this, DrizzleQueryError);
    if (cause) this.cause = cause;
  }
}
class TransactionRollbackError extends (_kb = DrizzleError, _jb = entityKind, _kb) {
  constructor() {
    super({ message: "Rollback" });
  }
}
__publicField(TransactionRollbackError, _jb, "TransactionRollbackError");
class SQLiteViewBase extends (_mb = View, _lb = entityKind, _mb) {
}
__publicField(SQLiteViewBase, _lb, "SQLiteViewBase");
_nb = entityKind;
class SQLiteDialect {
  constructor(config) {
    /** @internal */
    __publicField(this, "casing");
    this.casing = new CasingCache(config == null ? void 0 : config.casing);
  }
  escapeName(name) {
    return `"${name}"`;
  }
  escapeParam(_num) {
    return "?";
  }
  escapeString(str) {
    return `'${str.replace(/'/g, "''")}'`;
  }
  buildWithCTE(queries) {
    if (!(queries == null ? void 0 : queries.length)) return void 0;
    const withSqlChunks = [sql`with `];
    for (const [i, w] of queries.entries()) {
      withSqlChunks.push(sql`${sql.identifier(w._.alias)} as (${w._.sql})`);
      if (i < queries.length - 1) {
        withSqlChunks.push(sql`, `);
      }
    }
    withSqlChunks.push(sql` `);
    return sql.join(withSqlChunks);
  }
  buildDeleteQuery({ table, where, returning, withList, limit, orderBy }) {
    const withSql = this.buildWithCTE(withList);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const whereSql = where ? sql` where ${where}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    return sql`${withSql}delete from ${table}${whereSql}${returningSql}${orderBySql}${limitSql}`;
  }
  buildUpdateSet(table, set) {
    const tableColumns = table[Table.Symbol.Columns];
    const columnNames = Object.keys(tableColumns).filter(
      (colName) => {
        var _a2;
        return set[colName] !== void 0 || ((_a2 = tableColumns[colName]) == null ? void 0 : _a2.onUpdateFn) !== void 0;
      }
    );
    const setSize = columnNames.length;
    return sql.join(columnNames.flatMap((colName, i) => {
      var _a2;
      const col = tableColumns[colName];
      const onUpdateFnResult = (_a2 = col.onUpdateFn) == null ? void 0 : _a2.call(col);
      const value = set[colName] ?? (is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col));
      const res = sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`;
      if (i < setSize - 1) {
        return [res, sql.raw(", ")];
      }
      return [res];
    }));
  }
  buildUpdateQuery({ table, set, where, returning, withList, joins, from, limit, orderBy }) {
    const withSql = this.buildWithCTE(withList);
    const setSql = this.buildUpdateSet(table, set);
    const fromSql = from && sql.join([sql.raw(" from "), this.buildFromTable(from)]);
    const joinsSql = this.buildJoins(joins);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const whereSql = where ? sql` where ${where}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    return sql`${withSql}update ${table} set ${setSql}${fromSql}${joinsSql}${whereSql}${returningSql}${orderBySql}${limitSql}`;
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
  buildSelection(fields, { isSingleTable = false } = {}) {
    const columnsLen = fields.length;
    const chunks = fields.flatMap(({ field }, i) => {
      const chunk = [];
      if (is(field, SQL.Aliased) && field.isSelectionField) {
        chunk.push(sql.identifier(field.fieldAlias));
      } else if (is(field, SQL.Aliased) || is(field, SQL)) {
        const query = is(field, SQL.Aliased) ? field.sql : field;
        if (isSingleTable) {
          chunk.push(
            new SQL(
              query.queryChunks.map((c) => {
                if (is(c, Column)) {
                  return sql.identifier(this.casing.getColumnCasing(c));
                }
                return c;
              })
            )
          );
        } else {
          chunk.push(query);
        }
        if (is(field, SQL.Aliased)) {
          chunk.push(sql` as ${sql.identifier(field.fieldAlias)}`);
        }
      } else if (is(field, Column)) {
        const tableName = field.table[Table.Symbol.Name];
        if (field.columnType === "SQLiteNumericBigInt") {
          if (isSingleTable) {
            chunk.push(sql`cast(${sql.identifier(this.casing.getColumnCasing(field))} as text)`);
          } else {
            chunk.push(
              sql`cast(${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))} as text)`
            );
          }
        } else {
          if (isSingleTable) {
            chunk.push(sql.identifier(this.casing.getColumnCasing(field)));
          } else {
            chunk.push(sql`${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))}`);
          }
        }
      } else if (is(field, Subquery)) {
        const entries = Object.entries(field._.selectedFields);
        if (entries.length === 1) {
          const entry = entries[0][1];
          const fieldDecoder = is(entry, SQL) ? entry.decoder : is(entry, Column) ? { mapFromDriverValue: (v) => entry.mapFromDriverValue(v) } : entry.sql.decoder;
          if (fieldDecoder) field._.sql.decoder = fieldDecoder;
        }
        chunk.push(field);
      }
      if (i < columnsLen - 1) {
        chunk.push(sql`, `);
      }
      return chunk;
    });
    return sql.join(chunks);
  }
  buildJoins(joins) {
    if (!joins || joins.length === 0) {
      return void 0;
    }
    const joinsArray = [];
    if (joins) {
      for (const [index, joinMeta] of joins.entries()) {
        if (index === 0) {
          joinsArray.push(sql` `);
        }
        const table = joinMeta.table;
        const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : void 0;
        if (is(table, SQLiteTable)) {
          const tableName = table[SQLiteTable.Symbol.Name];
          const tableSchema = table[SQLiteTable.Symbol.Schema];
          const origTableName = table[SQLiteTable.Symbol.OriginalName];
          const alias = tableName === origTableName ? void 0 : joinMeta.alias;
          joinsArray.push(
            sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? sql`${sql.identifier(tableSchema)}.` : void 0}${sql.identifier(origTableName)}${alias && sql` ${sql.identifier(alias)}`}${onSql}`
          );
        } else {
          joinsArray.push(
            sql`${sql.raw(joinMeta.joinType)} join ${table}${onSql}`
          );
        }
        if (index < joins.length - 1) {
          joinsArray.push(sql` `);
        }
      }
    }
    return sql.join(joinsArray);
  }
  buildLimit(limit) {
    return typeof limit === "object" || typeof limit === "number" && limit >= 0 ? sql` limit ${limit}` : void 0;
  }
  buildOrderBy(orderBy) {
    const orderByList = [];
    if (orderBy) {
      for (const [index, orderByValue] of orderBy.entries()) {
        orderByList.push(orderByValue);
        if (index < orderBy.length - 1) {
          orderByList.push(sql`, `);
        }
      }
    }
    return orderByList.length > 0 ? sql` order by ${sql.join(orderByList)}` : void 0;
  }
  buildFromTable(table) {
    if (is(table, Table) && table[Table.Symbol.IsAlias]) {
      return sql`${sql`${sql.identifier(table[Table.Symbol.Schema] ?? "")}.`.if(table[Table.Symbol.Schema])}${sql.identifier(table[Table.Symbol.OriginalName])} ${sql.identifier(table[Table.Symbol.Name])}`;
    }
    return table;
  }
  buildSelectQuery({
    withList,
    fields,
    fieldsFlat,
    where,
    having,
    table,
    joins,
    orderBy,
    groupBy,
    limit,
    offset,
    distinct,
    setOperators
  }) {
    const fieldsList = fieldsFlat ?? orderSelectedFields(fields);
    for (const f of fieldsList) {
      if (is(f.field, Column) && getTableName(f.field.table) !== (is(table, Subquery) ? table._.alias : is(table, SQLiteViewBase) ? table[ViewBaseConfig].name : is(table, SQL) ? void 0 : getTableName(table)) && !((table2) => joins == null ? void 0 : joins.some(
        ({ alias }) => alias === (table2[Table.Symbol.IsAlias] ? getTableName(table2) : table2[Table.Symbol.BaseName])
      ))(f.field.table)) {
        const tableName = getTableName(f.field.table);
        throw new Error(
          `Your "${f.path.join("->")}" field references a column "${tableName}"."${f.field.name}", but the table "${tableName}" is not part of the query! Did you forget to join it?`
        );
      }
    }
    const isSingleTable = !joins || joins.length === 0;
    const withSql = this.buildWithCTE(withList);
    const distinctSql = distinct ? sql` distinct` : void 0;
    const selection = this.buildSelection(fieldsList, { isSingleTable });
    const tableSql = this.buildFromTable(table);
    const joinsSql = this.buildJoins(joins);
    const whereSql = where ? sql` where ${where}` : void 0;
    const havingSql = having ? sql` having ${having}` : void 0;
    const groupByList = [];
    if (groupBy) {
      for (const [index, groupByValue] of groupBy.entries()) {
        groupByList.push(groupByValue);
        if (index < groupBy.length - 1) {
          groupByList.push(sql`, `);
        }
      }
    }
    const groupBySql = groupByList.length > 0 ? sql` group by ${sql.join(groupByList)}` : void 0;
    const orderBySql = this.buildOrderBy(orderBy);
    const limitSql = this.buildLimit(limit);
    const offsetSql = offset ? sql` offset ${offset}` : void 0;
    const finalQuery = sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}${offsetSql}`;
    if (setOperators.length > 0) {
      return this.buildSetOperations(finalQuery, setOperators);
    }
    return finalQuery;
  }
  buildSetOperations(leftSelect, setOperators) {
    const [setOperator, ...rest] = setOperators;
    if (!setOperator) {
      throw new Error("Cannot pass undefined values to any set operator");
    }
    if (rest.length === 0) {
      return this.buildSetOperationQuery({ leftSelect, setOperator });
    }
    return this.buildSetOperations(
      this.buildSetOperationQuery({ leftSelect, setOperator }),
      rest
    );
  }
  buildSetOperationQuery({
    leftSelect,
    setOperator: { type, isAll, rightSelect, limit, orderBy, offset }
  }) {
    const leftChunk = sql`${leftSelect.getSQL()} `;
    const rightChunk = sql`${rightSelect.getSQL()}`;
    let orderBySql;
    if (orderBy && orderBy.length > 0) {
      const orderByValues = [];
      for (const singleOrderBy of orderBy) {
        if (is(singleOrderBy, SQLiteColumn)) {
          orderByValues.push(sql.identifier(singleOrderBy.name));
        } else if (is(singleOrderBy, SQL)) {
          for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
            const chunk = singleOrderBy.queryChunks[i];
            if (is(chunk, SQLiteColumn)) {
              singleOrderBy.queryChunks[i] = sql.identifier(this.casing.getColumnCasing(chunk));
            }
          }
          orderByValues.push(sql`${singleOrderBy}`);
        } else {
          orderByValues.push(sql`${singleOrderBy}`);
        }
      }
      orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)}`;
    }
    const limitSql = typeof limit === "object" || typeof limit === "number" && limit >= 0 ? sql` limit ${limit}` : void 0;
    const operatorChunk = sql.raw(`${type} ${isAll ? "all " : ""}`);
    const offsetSql = offset ? sql` offset ${offset}` : void 0;
    return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
  }
  buildInsertQuery({ table, values: valuesOrSelect, onConflict, returning, withList, select }) {
    const valuesSqlList = [];
    const columns = table[Table.Symbol.Columns];
    const colEntries = Object.entries(columns).filter(
      ([_, col]) => !col.shouldDisableInsert()
    );
    const insertOrder = colEntries.map(([, column]) => sql.identifier(this.casing.getColumnCasing(column)));
    if (select) {
      const select2 = valuesOrSelect;
      if (is(select2, SQL)) {
        valuesSqlList.push(select2);
      } else {
        valuesSqlList.push(select2.getSQL());
      }
    } else {
      const values = valuesOrSelect;
      valuesSqlList.push(sql.raw("values "));
      for (const [valueIndex, value] of values.entries()) {
        const valueList = [];
        for (const [fieldName, col] of colEntries) {
          const colValue = value[fieldName];
          if (colValue === void 0 || is(colValue, Param) && colValue.value === void 0) {
            let defaultValue;
            if (col.default !== null && col.default !== void 0) {
              defaultValue = is(col.default, SQL) ? col.default : sql.param(col.default, col);
            } else if (col.defaultFn !== void 0) {
              const defaultFnResult = col.defaultFn();
              defaultValue = is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col);
            } else if (!col.default && col.onUpdateFn !== void 0) {
              const onUpdateFnResult = col.onUpdateFn();
              defaultValue = is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col);
            } else {
              defaultValue = sql`null`;
            }
            valueList.push(defaultValue);
          } else {
            valueList.push(colValue);
          }
        }
        valuesSqlList.push(valueList);
        if (valueIndex < values.length - 1) {
          valuesSqlList.push(sql`, `);
        }
      }
    }
    const withSql = this.buildWithCTE(withList);
    const valuesSql = sql.join(valuesSqlList);
    const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
    const onConflictSql = (onConflict == null ? void 0 : onConflict.length) ? sql.join(onConflict) : void 0;
    return sql`${withSql}insert into ${table} ${insertOrder} ${valuesSql}${onConflictSql}${returningSql}`;
  }
  sqlToQuery(sql2, invokeSource) {
    return sql2.toQuery({
      casing: this.casing,
      escapeName: this.escapeName,
      escapeParam: this.escapeParam,
      escapeString: this.escapeString,
      invokeSource
    });
  }
  buildRelationalQuery({
    fullSchema,
    schema: schema2,
    tableNamesMap,
    table,
    tableConfig,
    queryConfig: config,
    tableAlias,
    nestedQueryRelation,
    joinOn
  }) {
    let selection = [];
    let limit, offset, orderBy = [], where;
    const joins = [];
    if (config === true) {
      const selectionEntries = Object.entries(tableConfig.columns);
      selection = selectionEntries.map(([key, value]) => ({
        dbKey: value.name,
        tsKey: key,
        field: aliasedTableColumn(value, tableAlias),
        relationTableTsKey: void 0,
        isJson: false,
        selection: []
      }));
    } else {
      const aliasedColumns = Object.fromEntries(
        Object.entries(tableConfig.columns).map(([key, value]) => [key, aliasedTableColumn(value, tableAlias)])
      );
      if (config.where) {
        const whereSql = typeof config.where === "function" ? config.where(aliasedColumns, getOperators()) : config.where;
        where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
      }
      const fieldsSelection = [];
      let selectedColumns = [];
      if (config.columns) {
        let isIncludeMode = false;
        for (const [field, value] of Object.entries(config.columns)) {
          if (value === void 0) {
            continue;
          }
          if (field in tableConfig.columns) {
            if (!isIncludeMode && value === true) {
              isIncludeMode = true;
            }
            selectedColumns.push(field);
          }
        }
        if (selectedColumns.length > 0) {
          selectedColumns = isIncludeMode ? selectedColumns.filter((c) => {
            var _a2;
            return ((_a2 = config.columns) == null ? void 0 : _a2[c]) === true;
          }) : Object.keys(tableConfig.columns).filter((key) => !selectedColumns.includes(key));
        }
      } else {
        selectedColumns = Object.keys(tableConfig.columns);
      }
      for (const field of selectedColumns) {
        const column = tableConfig.columns[field];
        fieldsSelection.push({ tsKey: field, value: column });
      }
      let selectedRelations = [];
      if (config.with) {
        selectedRelations = Object.entries(config.with).filter((entry) => !!entry[1]).map(([tsKey, queryConfig]) => ({ tsKey, queryConfig, relation: tableConfig.relations[tsKey] }));
      }
      let extras;
      if (config.extras) {
        extras = typeof config.extras === "function" ? config.extras(aliasedColumns, { sql }) : config.extras;
        for (const [tsKey, value] of Object.entries(extras)) {
          fieldsSelection.push({
            tsKey,
            value: mapColumnsInAliasedSQLToAlias(value, tableAlias)
          });
        }
      }
      for (const { tsKey, value } of fieldsSelection) {
        selection.push({
          dbKey: is(value, SQL.Aliased) ? value.fieldAlias : tableConfig.columns[tsKey].name,
          tsKey,
          field: is(value, Column) ? aliasedTableColumn(value, tableAlias) : value,
          relationTableTsKey: void 0,
          isJson: false,
          selection: []
        });
      }
      let orderByOrig = typeof config.orderBy === "function" ? config.orderBy(aliasedColumns, getOrderByOperators()) : config.orderBy ?? [];
      if (!Array.isArray(orderByOrig)) {
        orderByOrig = [orderByOrig];
      }
      orderBy = orderByOrig.map((orderByValue) => {
        if (is(orderByValue, Column)) {
          return aliasedTableColumn(orderByValue, tableAlias);
        }
        return mapColumnsInSQLToAlias(orderByValue, tableAlias);
      });
      limit = config.limit;
      offset = config.offset;
      for (const {
        tsKey: selectedRelationTsKey,
        queryConfig: selectedRelationConfigValue,
        relation
      } of selectedRelations) {
        const normalizedRelation = normalizeRelation(schema2, tableNamesMap, relation);
        const relationTableName = getTableUniqueName(relation.referencedTable);
        const relationTableTsName = tableNamesMap[relationTableName];
        const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
        const joinOn2 = and(
          ...normalizedRelation.fields.map(
            (field2, i) => eq(
              aliasedTableColumn(normalizedRelation.references[i], relationTableAlias),
              aliasedTableColumn(field2, tableAlias)
            )
          )
        );
        const builtRelation = this.buildRelationalQuery({
          fullSchema,
          schema: schema2,
          tableNamesMap,
          table: fullSchema[relationTableTsName],
          tableConfig: schema2[relationTableTsName],
          queryConfig: is(relation, One) ? selectedRelationConfigValue === true ? { limit: 1 } : { ...selectedRelationConfigValue, limit: 1 } : selectedRelationConfigValue,
          tableAlias: relationTableAlias,
          joinOn: joinOn2,
          nestedQueryRelation: relation
        });
        const field = sql`(${builtRelation.sql})`.as(selectedRelationTsKey);
        selection.push({
          dbKey: selectedRelationTsKey,
          tsKey: selectedRelationTsKey,
          field,
          relationTableTsKey: relationTableTsName,
          isJson: true,
          selection: builtRelation.selection
        });
      }
    }
    if (selection.length === 0) {
      throw new DrizzleError({
        message: `No fields selected for table "${tableConfig.tsName}" ("${tableAlias}"). You need to have at least one item in "columns", "with" or "extras". If you need to select all columns, omit the "columns" key or set it to undefined.`
      });
    }
    let result;
    where = and(joinOn, where);
    if (nestedQueryRelation) {
      let field = sql`json_array(${sql.join(
        selection.map(
          ({ field: field2 }) => is(field2, SQLiteColumn) ? sql.identifier(this.casing.getColumnCasing(field2)) : is(field2, SQL.Aliased) ? field2.sql : field2
        ),
        sql`, `
      )})`;
      if (is(nestedQueryRelation, Many)) {
        field = sql`coalesce(json_group_array(${field}), json_array())`;
      }
      const nestedSelection = [{
        dbKey: "data",
        tsKey: "data",
        field: field.as("data"),
        isJson: true,
        relationTableTsKey: tableConfig.tsName,
        selection
      }];
      const needsSubquery = limit !== void 0 || offset !== void 0 || orderBy.length > 0;
      if (needsSubquery) {
        result = this.buildSelectQuery({
          table: aliasedTable(table, tableAlias),
          fields: {},
          fieldsFlat: [
            {
              path: [],
              field: sql.raw("*")
            }
          ],
          where,
          limit,
          offset,
          orderBy,
          setOperators: []
        });
        where = void 0;
        limit = void 0;
        offset = void 0;
        orderBy = void 0;
      } else {
        result = aliasedTable(table, tableAlias);
      }
      result = this.buildSelectQuery({
        table: is(result, SQLiteTable) ? result : new Subquery(result, {}, tableAlias),
        fields: {},
        fieldsFlat: nestedSelection.map(({ field: field2 }) => ({
          path: [],
          field: is(field2, Column) ? aliasedTableColumn(field2, tableAlias) : field2
        })),
        joins,
        where,
        limit,
        offset,
        orderBy,
        setOperators: []
      });
    } else {
      result = this.buildSelectQuery({
        table: aliasedTable(table, tableAlias),
        fields: {},
        fieldsFlat: selection.map(({ field }) => ({
          path: [],
          field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field
        })),
        joins,
        where,
        limit,
        offset,
        orderBy,
        setOperators: []
      });
    }
    return {
      tableTsKey: tableConfig.tsName,
      sql: result,
      selection
    };
  }
}
__publicField(SQLiteDialect, _nb, "SQLiteDialect");
class SQLiteSyncDialect extends (_pb = SQLiteDialect, _ob = entityKind, _pb) {
  migrate(migrations, session2, config) {
    const migrationsTable = config === void 0 ? "__drizzle_migrations" : typeof config === "string" ? "__drizzle_migrations" : config.migrationsTable ?? "__drizzle_migrations";
    const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
    session2.run(migrationTableCreate);
    const dbMigrations = session2.values(
      sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`
    );
    const lastDbMigration = dbMigrations[0] ?? void 0;
    session2.run(sql`BEGIN`);
    try {
      for (const migration of migrations) {
        if (!lastDbMigration || Number(lastDbMigration[2]) < migration.folderMillis) {
          for (const stmt of migration.sql) {
            session2.run(sql.raw(stmt));
          }
          session2.run(
            sql`INSERT INTO ${sql.identifier(migrationsTable)} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`
          );
        }
      }
      session2.run(sql`COMMIT`);
    } catch (e) {
      session2.run(sql`ROLLBACK`);
      throw e;
    }
  }
}
__publicField(SQLiteSyncDialect, _ob, "SQLiteSyncDialect");
_qb = entityKind;
class TypedQueryBuilder {
  /** @internal */
  getSelectedFields() {
    return this._.selectedFields;
  }
}
__publicField(TypedQueryBuilder, _qb, "TypedQueryBuilder");
_rb = entityKind;
class SQLiteSelectBuilder {
  constructor(config) {
    __publicField(this, "fields");
    __publicField(this, "session");
    __publicField(this, "dialect");
    __publicField(this, "withList");
    __publicField(this, "distinct");
    this.fields = config.fields;
    this.session = config.session;
    this.dialect = config.dialect;
    this.withList = config.withList;
    this.distinct = config.distinct;
  }
  from(source) {
    const isPartialSelect = !!this.fields;
    let fields;
    if (this.fields) {
      fields = this.fields;
    } else if (is(source, Subquery)) {
      fields = Object.fromEntries(
        Object.keys(source._.selectedFields).map((key) => [key, source[key]])
      );
    } else if (is(source, SQLiteViewBase)) {
      fields = source[ViewBaseConfig].selectedFields;
    } else if (is(source, SQL)) {
      fields = {};
    } else {
      fields = getTableColumns(source);
    }
    return new SQLiteSelectBase({
      table: source,
      fields,
      isPartialSelect,
      session: this.session,
      dialect: this.dialect,
      withList: this.withList,
      distinct: this.distinct
    });
  }
}
__publicField(SQLiteSelectBuilder, _rb, "SQLiteSelectBuilder");
class SQLiteSelectQueryBuilderBase extends (_tb = TypedQueryBuilder, _sb = entityKind, _tb) {
  constructor({ table, fields, isPartialSelect, session: session2, dialect, withList, distinct }) {
    super();
    __publicField(this, "_");
    /** @internal */
    __publicField(this, "config");
    __publicField(this, "joinsNotNullableMap");
    __publicField(this, "tableName");
    __publicField(this, "isPartialSelect");
    __publicField(this, "session");
    __publicField(this, "dialect");
    __publicField(this, "cacheConfig");
    __publicField(this, "usedTables", /* @__PURE__ */ new Set());
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
    __publicField(this, "leftJoin", this.createJoin("left"));
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
    __publicField(this, "rightJoin", this.createJoin("right"));
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
    __publicField(this, "innerJoin", this.createJoin("inner"));
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
    __publicField(this, "fullJoin", this.createJoin("full"));
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
    __publicField(this, "crossJoin", this.createJoin("cross"));
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
    __publicField(this, "union", this.createSetOperator("union", false));
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
    __publicField(this, "unionAll", this.createSetOperator("union", true));
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
    __publicField(this, "intersect", this.createSetOperator("intersect", false));
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
    __publicField(this, "except", this.createSetOperator("except", false));
    this.config = {
      withList,
      table,
      fields: { ...fields },
      distinct,
      setOperators: []
    };
    this.isPartialSelect = isPartialSelect;
    this.session = session2;
    this.dialect = dialect;
    this._ = {
      selectedFields: fields,
      config: this.config
    };
    this.tableName = getTableLikeName(table);
    this.joinsNotNullableMap = typeof this.tableName === "string" ? { [this.tableName]: true } : {};
    for (const item of extractUsedTable(table)) this.usedTables.add(item);
  }
  /** @internal */
  getUsedTables() {
    return [...this.usedTables];
  }
  createJoin(joinType) {
    return (table, on) => {
      var _a2;
      const baseTableName = this.tableName;
      const tableName = getTableLikeName(table);
      for (const item of extractUsedTable(table)) this.usedTables.add(item);
      if (typeof tableName === "string" && ((_a2 = this.config.joins) == null ? void 0 : _a2.some((join) => join.alias === tableName))) {
        throw new Error(`Alias "${tableName}" is already used in this query`);
      }
      if (!this.isPartialSelect) {
        if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === "string") {
          this.config.fields = {
            [baseTableName]: this.config.fields
          };
        }
        if (typeof tableName === "string" && !is(table, SQL)) {
          const selection = is(table, Subquery) ? table._.selectedFields : is(table, View) ? table[ViewBaseConfig].selectedFields : table[Table.Symbol.Columns];
          this.config.fields[tableName] = selection;
        }
      }
      if (typeof on === "function") {
        on = on(
          new Proxy(
            this.config.fields,
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          )
        );
      }
      if (!this.config.joins) {
        this.config.joins = [];
      }
      this.config.joins.push({ on, table, joinType, alias: tableName });
      if (typeof tableName === "string") {
        switch (joinType) {
          case "left": {
            this.joinsNotNullableMap[tableName] = false;
            break;
          }
          case "right": {
            this.joinsNotNullableMap = Object.fromEntries(
              Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false])
            );
            this.joinsNotNullableMap[tableName] = true;
            break;
          }
          case "cross":
          case "inner": {
            this.joinsNotNullableMap[tableName] = true;
            break;
          }
          case "full": {
            this.joinsNotNullableMap = Object.fromEntries(
              Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false])
            );
            this.joinsNotNullableMap[tableName] = false;
            break;
          }
        }
      }
      return this;
    };
  }
  createSetOperator(type, isAll) {
    return (rightSelection) => {
      const rightSelect = typeof rightSelection === "function" ? rightSelection(getSQLiteSetOperators()) : rightSelection;
      if (!haveSameKeys(this.getSelectedFields(), rightSelect.getSelectedFields())) {
        throw new Error(
          "Set operator error (union / intersect / except): selected fields are not the same or are in a different order"
        );
      }
      this.config.setOperators.push({ type, isAll, rightSelect });
      return this;
    };
  }
  /** @internal */
  addSetOperators(setOperators) {
    this.config.setOperators.push(...setOperators);
    return this;
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
  where(where) {
    if (typeof where === "function") {
      where = where(
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
        )
      );
    }
    this.config.where = where;
    return this;
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
  having(having) {
    if (typeof having === "function") {
      having = having(
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
        )
      );
    }
    this.config.having = having;
    return this;
  }
  groupBy(...columns) {
    if (typeof columns[0] === "function") {
      const groupBy = columns[0](
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
    } else {
      this.config.groupBy = columns;
    }
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.fields,
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      if (this.config.setOperators.length > 0) {
        this.config.setOperators.at(-1).orderBy = orderByArray;
      } else {
        this.config.orderBy = orderByArray;
      }
    } else {
      const orderByArray = columns;
      if (this.config.setOperators.length > 0) {
        this.config.setOperators.at(-1).orderBy = orderByArray;
      } else {
        this.config.orderBy = orderByArray;
      }
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
  limit(limit) {
    if (this.config.setOperators.length > 0) {
      this.config.setOperators.at(-1).limit = limit;
    } else {
      this.config.limit = limit;
    }
    return this;
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
  offset(offset) {
    if (this.config.setOperators.length > 0) {
      this.config.setOperators.at(-1).offset = offset;
    } else {
      this.config.offset = offset;
    }
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildSelectQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  as(alias) {
    const usedTables = [];
    usedTables.push(...extractUsedTable(this.config.table));
    if (this.config.joins) {
      for (const it of this.config.joins) usedTables.push(...extractUsedTable(it.table));
    }
    return new Proxy(
      new Subquery(this.getSQL(), this.config.fields, alias, false, [...new Set(usedTables)]),
      new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
    );
  }
  /** @internal */
  getSelectedFields() {
    return new Proxy(
      this.config.fields,
      new SelectionProxyHandler({ alias: this.tableName, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
    );
  }
  $dynamic() {
    return this;
  }
}
__publicField(SQLiteSelectQueryBuilderBase, _sb, "SQLiteSelectQueryBuilder");
class SQLiteSelectBase extends (_vb = SQLiteSelectQueryBuilderBase, _ub = entityKind, _vb) {
  constructor() {
    super(...arguments);
    __publicField(this, "run", (placeholderValues) => {
      return this._prepare().run(placeholderValues);
    });
    __publicField(this, "all", (placeholderValues) => {
      return this._prepare().all(placeholderValues);
    });
    __publicField(this, "get", (placeholderValues) => {
      return this._prepare().get(placeholderValues);
    });
    __publicField(this, "values", (placeholderValues) => {
      return this._prepare().values(placeholderValues);
    });
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    if (!this.session) {
      throw new Error("Cannot execute a query on a query builder. Please use a database instance instead.");
    }
    const fieldsList = orderSelectedFields(this.config.fields);
    const query = this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      fieldsList,
      "all",
      true,
      void 0,
      {
        type: "select",
        tables: [...this.usedTables]
      },
      this.cacheConfig
    );
    query.joinsNotNullableMap = this.joinsNotNullableMap;
    return query;
  }
  $withCache(config) {
    this.cacheConfig = config === void 0 ? { config: {}, enable: true, autoInvalidate: true } : config === false ? { enable: false } : { enable: true, autoInvalidate: true, ...config };
    return this;
  }
  prepare() {
    return this._prepare(false);
  }
  async execute() {
    return this.all();
  }
}
__publicField(SQLiteSelectBase, _ub, "SQLiteSelect");
applyMixins(SQLiteSelectBase, [QueryPromise]);
function createSetOperator(type, isAll) {
  return (leftSelect, rightSelect, ...restSelects) => {
    const setOperators = [rightSelect, ...restSelects].map((select) => ({
      type,
      isAll,
      rightSelect: select
    }));
    for (const setOperator of setOperators) {
      if (!haveSameKeys(leftSelect.getSelectedFields(), setOperator.rightSelect.getSelectedFields())) {
        throw new Error(
          "Set operator error (union / intersect / except): selected fields are not the same or are in a different order"
        );
      }
    }
    return leftSelect.addSetOperators(setOperators);
  };
}
const getSQLiteSetOperators = () => ({
  union,
  unionAll,
  intersect,
  except
});
const union = createSetOperator("union", false);
const unionAll = createSetOperator("union", true);
const intersect = createSetOperator("intersect", false);
const except = createSetOperator("except", false);
_wb = entityKind;
class QueryBuilder {
  constructor(dialect) {
    __publicField(this, "dialect");
    __publicField(this, "dialectConfig");
    __publicField(this, "$with", (alias, selection) => {
      const queryBuilder = this;
      const as = (qb) => {
        if (typeof qb === "function") {
          qb = qb(queryBuilder);
        }
        return new Proxy(
          new WithSubquery(
            qb.getSQL(),
            selection ?? ("getSelectedFields" in qb ? qb.getSelectedFields() ?? {} : {}),
            alias,
            true
          ),
          new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
        );
      };
      return { as };
    });
    this.dialect = is(dialect, SQLiteDialect) ? dialect : void 0;
    this.dialectConfig = is(dialect, SQLiteDialect) ? void 0 : dialect;
  }
  with(...queries) {
    const self = this;
    function select(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: void 0,
        dialect: self.getDialect(),
        withList: queries
      });
    }
    function selectDistinct(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: void 0,
        dialect: self.getDialect(),
        withList: queries,
        distinct: true
      });
    }
    return { select, selectDistinct };
  }
  select(fields) {
    return new SQLiteSelectBuilder({ fields: fields ?? void 0, session: void 0, dialect: this.getDialect() });
  }
  selectDistinct(fields) {
    return new SQLiteSelectBuilder({
      fields: fields ?? void 0,
      session: void 0,
      dialect: this.getDialect(),
      distinct: true
    });
  }
  // Lazy load dialect to avoid circular dependency
  getDialect() {
    if (!this.dialect) {
      this.dialect = new SQLiteSyncDialect(this.dialectConfig);
    }
    return this.dialect;
  }
}
__publicField(QueryBuilder, _wb, "SQLiteQueryBuilder");
_xb = entityKind;
class SQLiteInsertBuilder {
  constructor(table, session2, dialect, withList) {
    this.table = table;
    this.session = session2;
    this.dialect = dialect;
    this.withList = withList;
  }
  values(values) {
    values = Array.isArray(values) ? values : [values];
    if (values.length === 0) {
      throw new Error("values() must be called with at least one value");
    }
    const mappedValues = values.map((entry) => {
      const result = {};
      const cols = this.table[Table.Symbol.Columns];
      for (const colKey of Object.keys(entry)) {
        const colValue = entry[colKey];
        result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue, cols[colKey]);
      }
      return result;
    });
    return new SQLiteInsertBase(this.table, mappedValues, this.session, this.dialect, this.withList);
  }
  select(selectQuery) {
    const select = typeof selectQuery === "function" ? selectQuery(new QueryBuilder()) : selectQuery;
    if (!is(select, SQL) && !haveSameKeys(this.table[Columns], select._.selectedFields)) {
      throw new Error(
        "Insert select error: selected fields are not the same or are in a different order compared to the table definition"
      );
    }
    return new SQLiteInsertBase(this.table, select, this.session, this.dialect, this.withList, true);
  }
}
__publicField(SQLiteInsertBuilder, _xb, "SQLiteInsertBuilder");
class SQLiteInsertBase extends (_zb = QueryPromise, _yb = entityKind, _zb) {
  constructor(table, values, session2, dialect, withList, select) {
    super();
    /** @internal */
    __publicField(this, "config");
    __publicField(this, "run", (placeholderValues) => {
      return this._prepare().run(placeholderValues);
    });
    __publicField(this, "all", (placeholderValues) => {
      return this._prepare().all(placeholderValues);
    });
    __publicField(this, "get", (placeholderValues) => {
      return this._prepare().get(placeholderValues);
    });
    __publicField(this, "values", (placeholderValues) => {
      return this._prepare().values(placeholderValues);
    });
    this.session = session2;
    this.dialect = dialect;
    this.config = { table, values, withList, select };
  }
  returning(fields = this.config.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
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
  onConflictDoNothing(config = {}) {
    if (!this.config.onConflict) this.config.onConflict = [];
    if (config.target === void 0) {
      this.config.onConflict.push(sql` on conflict do nothing`);
    } else {
      const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
      const whereSql = config.where ? sql` where ${config.where}` : sql``;
      this.config.onConflict.push(sql` on conflict ${targetSql} do nothing${whereSql}`);
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
  onConflictDoUpdate(config) {
    if (config.where && (config.targetWhere || config.setWhere)) {
      throw new Error(
        'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.'
      );
    }
    if (!this.config.onConflict) this.config.onConflict = [];
    const whereSql = config.where ? sql` where ${config.where}` : void 0;
    const targetWhereSql = config.targetWhere ? sql` where ${config.targetWhere}` : void 0;
    const setWhereSql = config.setWhere ? sql` where ${config.setWhere}` : void 0;
    const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
    const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
    this.config.onConflict.push(
      sql` on conflict ${targetSql}${targetWhereSql} do update set ${setSql}${whereSql}${setWhereSql}`
    );
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildInsertQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "insert",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  async execute() {
    return this.config.returning ? this.all() : this.run();
  }
  $dynamic() {
    return this;
  }
}
__publicField(SQLiteInsertBase, _yb, "SQLiteInsert");
_Ab = entityKind;
class SQLiteUpdateBuilder {
  constructor(table, session2, dialect, withList) {
    this.table = table;
    this.session = session2;
    this.dialect = dialect;
    this.withList = withList;
  }
  set(values) {
    return new SQLiteUpdateBase(
      this.table,
      mapUpdateSet(this.table, values),
      this.session,
      this.dialect,
      this.withList
    );
  }
}
__publicField(SQLiteUpdateBuilder, _Ab, "SQLiteUpdateBuilder");
class SQLiteUpdateBase extends (_Cb = QueryPromise, _Bb = entityKind, _Cb) {
  constructor(table, set, session2, dialect, withList) {
    super();
    /** @internal */
    __publicField(this, "config");
    __publicField(this, "leftJoin", this.createJoin("left"));
    __publicField(this, "rightJoin", this.createJoin("right"));
    __publicField(this, "innerJoin", this.createJoin("inner"));
    __publicField(this, "fullJoin", this.createJoin("full"));
    __publicField(this, "run", (placeholderValues) => {
      return this._prepare().run(placeholderValues);
    });
    __publicField(this, "all", (placeholderValues) => {
      return this._prepare().all(placeholderValues);
    });
    __publicField(this, "get", (placeholderValues) => {
      return this._prepare().get(placeholderValues);
    });
    __publicField(this, "values", (placeholderValues) => {
      return this._prepare().values(placeholderValues);
    });
    this.session = session2;
    this.dialect = dialect;
    this.config = { set, table, withList, joins: [] };
  }
  from(source) {
    this.config.from = source;
    return this;
  }
  createJoin(joinType) {
    return (table, on) => {
      const tableName = getTableLikeName(table);
      if (typeof tableName === "string" && this.config.joins.some((join) => join.alias === tableName)) {
        throw new Error(`Alias "${tableName}" is already used in this query`);
      }
      if (typeof on === "function") {
        const from = this.config.from ? is(table, SQLiteTable) ? table[Table.Symbol.Columns] : is(table, Subquery) ? table._.selectedFields : is(table, SQLiteViewBase) ? table[ViewBaseConfig].selectedFields : void 0 : void 0;
        on = on(
          new Proxy(
            this.config.table[Table.Symbol.Columns],
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          ),
          from && new Proxy(
            from,
            new SelectionProxyHandler({ sqlAliasedBehavior: "sql", sqlBehavior: "sql" })
          )
        );
      }
      this.config.joins.push({ on, table, joinType, alias: tableName });
      return this;
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
  where(where) {
    this.config.where = where;
    return this;
  }
  orderBy(...columns) {
    if (typeof columns[0] === "function") {
      const orderBy = columns[0](
        new Proxy(
          this.config.table[Table.Symbol.Columns],
          new SelectionProxyHandler({ sqlAliasedBehavior: "alias", sqlBehavior: "sql" })
        )
      );
      const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
      this.config.orderBy = orderByArray;
    } else {
      const orderByArray = columns;
      this.config.orderBy = orderByArray;
    }
    return this;
  }
  limit(limit) {
    this.config.limit = limit;
    return this;
  }
  returning(fields = this.config.table[SQLiteTable.Symbol.Columns]) {
    this.config.returning = orderSelectedFields(fields);
    return this;
  }
  /** @internal */
  getSQL() {
    return this.dialect.buildUpdateQuery(this.config);
  }
  toSQL() {
    const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
    return rest;
  }
  /** @internal */
  _prepare(isOneTimeQuery = true) {
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      this.dialect.sqlToQuery(this.getSQL()),
      this.config.returning,
      this.config.returning ? "all" : "run",
      true,
      void 0,
      {
        type: "insert",
        tables: extractUsedTable(this.config.table)
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  async execute() {
    return this.config.returning ? this.all() : this.run();
  }
  $dynamic() {
    return this;
  }
}
__publicField(SQLiteUpdateBase, _Bb, "SQLiteUpdate");
const _SQLiteCountBuilder = class _SQLiteCountBuilder extends (_Fb = SQL, _Eb = entityKind, _Db = Symbol.toStringTag, _Fb) {
  constructor(params) {
    super(_SQLiteCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);
    __publicField(this, "sql");
    __publicField(this, _Db, "SQLiteCountBuilderAsync");
    __publicField(this, "session");
    this.params = params;
    this.session = params.session;
    this.sql = _SQLiteCountBuilder.buildCount(
      params.source,
      params.filters
    );
  }
  static buildEmbeddedCount(source, filters) {
    return sql`(select count(*) from ${source}${sql.raw(" where ").if(filters)}${filters})`;
  }
  static buildCount(source, filters) {
    return sql`select count(*) from ${source}${sql.raw(" where ").if(filters)}${filters}`;
  }
  then(onfulfilled, onrejected) {
    return Promise.resolve(this.session.count(this.sql)).then(
      onfulfilled,
      onrejected
    );
  }
  catch(onRejected) {
    return this.then(void 0, onRejected);
  }
  finally(onFinally) {
    return this.then(
      (value) => {
        onFinally == null ? void 0 : onFinally();
        return value;
      },
      (reason) => {
        onFinally == null ? void 0 : onFinally();
        throw reason;
      }
    );
  }
};
__publicField(_SQLiteCountBuilder, _Eb, "SQLiteCountBuilderAsync");
let SQLiteCountBuilder = _SQLiteCountBuilder;
_Gb = entityKind;
class RelationalQueryBuilder {
  constructor(mode, fullSchema, schema2, tableNamesMap, table, tableConfig, dialect, session2) {
    this.mode = mode;
    this.fullSchema = fullSchema;
    this.schema = schema2;
    this.tableNamesMap = tableNamesMap;
    this.table = table;
    this.tableConfig = tableConfig;
    this.dialect = dialect;
    this.session = session2;
  }
  findMany(config) {
    return this.mode === "sync" ? new SQLiteSyncRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? config : {},
      "many"
    ) : new SQLiteRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? config : {},
      "many"
    );
  }
  findFirst(config) {
    return this.mode === "sync" ? new SQLiteSyncRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? { ...config, limit: 1 } : { limit: 1 },
      "first"
    ) : new SQLiteRelationalQuery(
      this.fullSchema,
      this.schema,
      this.tableNamesMap,
      this.table,
      this.tableConfig,
      this.dialect,
      this.session,
      config ? { ...config, limit: 1 } : { limit: 1 },
      "first"
    );
  }
}
__publicField(RelationalQueryBuilder, _Gb, "SQLiteAsyncRelationalQueryBuilder");
class SQLiteRelationalQuery extends (_Ib = QueryPromise, _Hb = entityKind, _Ib) {
  constructor(fullSchema, schema2, tableNamesMap, table, tableConfig, dialect, session2, config, mode) {
    super();
    /** @internal */
    __publicField(this, "mode");
    this.fullSchema = fullSchema;
    this.schema = schema2;
    this.tableNamesMap = tableNamesMap;
    this.table = table;
    this.tableConfig = tableConfig;
    this.dialect = dialect;
    this.session = session2;
    this.config = config;
    this.mode = mode;
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
  _prepare(isOneTimeQuery = false) {
    const { query, builtQuery } = this._toSQL();
    return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](
      builtQuery,
      void 0,
      this.mode === "first" ? "get" : "all",
      true,
      (rawRows, mapColumnValue) => {
        const rows = rawRows.map(
          (row) => mapRelationalRow(this.schema, this.tableConfig, row, query.selection, mapColumnValue)
        );
        if (this.mode === "first") {
          return rows[0];
        }
        return rows;
      }
    );
  }
  prepare() {
    return this._prepare(false);
  }
  _toSQL() {
    const query = this.dialect.buildRelationalQuery({
      fullSchema: this.fullSchema,
      schema: this.schema,
      tableNamesMap: this.tableNamesMap,
      table: this.table,
      tableConfig: this.tableConfig,
      queryConfig: this.config,
      tableAlias: this.tableConfig.tsName
    });
    const builtQuery = this.dialect.sqlToQuery(query.sql);
    return { query, builtQuery };
  }
  toSQL() {
    return this._toSQL().builtQuery;
  }
  /** @internal */
  executeRaw() {
    if (this.mode === "first") {
      return this._prepare(false).get();
    }
    return this._prepare(false).all();
  }
  async execute() {
    return this.executeRaw();
  }
}
__publicField(SQLiteRelationalQuery, _Hb, "SQLiteAsyncRelationalQuery");
class SQLiteSyncRelationalQuery extends (_Kb = SQLiteRelationalQuery, _Jb = entityKind, _Kb) {
  sync() {
    return this.executeRaw();
  }
}
__publicField(SQLiteSyncRelationalQuery, _Jb, "SQLiteSyncRelationalQuery");
class SQLiteRaw extends (_Mb = QueryPromise, _Lb = entityKind, _Mb) {
  constructor(execute, getSQL, action, dialect, mapBatchResult) {
    super();
    /** @internal */
    __publicField(this, "config");
    this.execute = execute;
    this.getSQL = getSQL;
    this.dialect = dialect;
    this.mapBatchResult = mapBatchResult;
    this.config = { action };
  }
  getQuery() {
    return { ...this.dialect.sqlToQuery(this.getSQL()), method: this.config.action };
  }
  mapResult(result, isFromBatch) {
    return isFromBatch ? this.mapBatchResult(result) : result;
  }
  _prepare() {
    return this;
  }
  /** @internal */
  isResponseInArrayMode() {
    return false;
  }
}
__publicField(SQLiteRaw, _Lb, "SQLiteRaw");
_Nb = entityKind;
class BaseSQLiteDatabase {
  constructor(resultKind, dialect, session2, schema2) {
    __publicField(this, "query");
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
    __publicField(this, "$with", (alias, selection) => {
      const self = this;
      const as = (qb) => {
        if (typeof qb === "function") {
          qb = qb(new QueryBuilder(self.dialect));
        }
        return new Proxy(
          new WithSubquery(
            qb.getSQL(),
            selection ?? ("getSelectedFields" in qb ? qb.getSelectedFields() ?? {} : {}),
            alias,
            true
          ),
          new SelectionProxyHandler({ alias, sqlAliasedBehavior: "alias", sqlBehavior: "error" })
        );
      };
      return { as };
    });
    __publicField(this, "$cache");
    this.resultKind = resultKind;
    this.dialect = dialect;
    this.session = session2;
    this._ = schema2 ? {
      schema: schema2.schema,
      fullSchema: schema2.fullSchema,
      tableNamesMap: schema2.tableNamesMap
    } : {
      schema: void 0,
      fullSchema: {},
      tableNamesMap: {}
    };
    this.query = {};
    const query = this.query;
    if (this._.schema) {
      for (const [tableName, columns] of Object.entries(this._.schema)) {
        query[tableName] = new RelationalQueryBuilder(
          resultKind,
          schema2.fullSchema,
          this._.schema,
          this._.tableNamesMap,
          schema2.fullSchema[tableName],
          columns,
          dialect,
          session2
        );
      }
    }
    this.$cache = { invalidate: async (_params) => {
    } };
  }
  $count(source, filters) {
    return new SQLiteCountBuilder({ source, filters, session: this.session });
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
  with(...queries) {
    const self = this;
    function select(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: self.session,
        dialect: self.dialect,
        withList: queries
      });
    }
    function selectDistinct(fields) {
      return new SQLiteSelectBuilder({
        fields: fields ?? void 0,
        session: self.session,
        dialect: self.dialect,
        withList: queries,
        distinct: true
      });
    }
    function update(table) {
      return new SQLiteUpdateBuilder(table, self.session, self.dialect, queries);
    }
    function insert(into) {
      return new SQLiteInsertBuilder(into, self.session, self.dialect, queries);
    }
    function delete_(from) {
      return new SQLiteDeleteBase(from, self.session, self.dialect, queries);
    }
    return { select, selectDistinct, update, insert, delete: delete_ };
  }
  select(fields) {
    return new SQLiteSelectBuilder({ fields: fields ?? void 0, session: this.session, dialect: this.dialect });
  }
  selectDistinct(fields) {
    return new SQLiteSelectBuilder({
      fields: fields ?? void 0,
      session: this.session,
      dialect: this.dialect,
      distinct: true
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
  update(table) {
    return new SQLiteUpdateBuilder(table, this.session, this.dialect);
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
  insert(into) {
    return new SQLiteInsertBuilder(into, this.session, this.dialect);
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
  delete(from) {
    return new SQLiteDeleteBase(from, this.session, this.dialect);
  }
  run(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.run(sequel),
        () => sequel,
        "run",
        this.dialect,
        this.session.extractRawRunValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.run(sequel);
  }
  all(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.all(sequel),
        () => sequel,
        "all",
        this.dialect,
        this.session.extractRawAllValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.all(sequel);
  }
  get(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.get(sequel),
        () => sequel,
        "get",
        this.dialect,
        this.session.extractRawGetValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.get(sequel);
  }
  values(query) {
    const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
    if (this.resultKind === "async") {
      return new SQLiteRaw(
        async () => this.session.values(sequel),
        () => sequel,
        "values",
        this.dialect,
        this.session.extractRawValuesValueFromBatchResult.bind(this.session)
      );
    }
    return this.session.values(sequel);
  }
  transaction(transaction, config) {
    return this.session.transaction(transaction, config);
  }
}
__publicField(BaseSQLiteDatabase, _Nb, "BaseSQLiteDatabase");
_Ob = entityKind;
class Cache {
}
__publicField(Cache, _Ob, "Cache");
class NoopCache extends (_Qb = Cache, _Pb = entityKind, _Qb) {
  strategy() {
    return "all";
  }
  async get(_key) {
    return void 0;
  }
  async put(_hashedQuery, _response, _tables, _config) {
  }
  async onMutate(_params) {
  }
}
__publicField(NoopCache, _Pb, "NoopCache");
async function hashQuery(sql2, params) {
  const dataToHash = `${sql2}-${JSON.stringify(params)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(dataToHash);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
class ExecuteResultSync extends (_Sb = QueryPromise, _Rb = entityKind, _Sb) {
  constructor(resultCb) {
    super();
    this.resultCb = resultCb;
  }
  async execute() {
    return this.resultCb();
  }
  sync() {
    return this.resultCb();
  }
}
__publicField(ExecuteResultSync, _Rb, "ExecuteResultSync");
_Tb = entityKind;
class SQLitePreparedQuery {
  constructor(mode, executeMethod, query, cache, queryMetadata, cacheConfig) {
    /** @internal */
    __publicField(this, "joinsNotNullableMap");
    var _a2;
    this.mode = mode;
    this.executeMethod = executeMethod;
    this.query = query;
    this.cache = cache;
    this.queryMetadata = queryMetadata;
    this.cacheConfig = cacheConfig;
    if (cache && cache.strategy() === "all" && cacheConfig === void 0) {
      this.cacheConfig = { enable: true, autoInvalidate: true };
    }
    if (!((_a2 = this.cacheConfig) == null ? void 0 : _a2.enable)) {
      this.cacheConfig = void 0;
    }
  }
  /** @internal */
  async queryWithCache(queryString, params, query) {
    if (this.cache === void 0 || is(this.cache, NoopCache) || this.queryMetadata === void 0) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (this.cacheConfig && !this.cacheConfig.enable) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if ((this.queryMetadata.type === "insert" || this.queryMetadata.type === "update" || this.queryMetadata.type === "delete") && this.queryMetadata.tables.length > 0) {
      try {
        const [res] = await Promise.all([
          query(),
          this.cache.onMutate({ tables: this.queryMetadata.tables })
        ]);
        return res;
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (!this.cacheConfig) {
      try {
        return await query();
      } catch (e) {
        throw new DrizzleQueryError(queryString, params, e);
      }
    }
    if (this.queryMetadata.type === "select") {
      const fromCache = await this.cache.get(
        this.cacheConfig.tag ?? await hashQuery(queryString, params),
        this.queryMetadata.tables,
        this.cacheConfig.tag !== void 0,
        this.cacheConfig.autoInvalidate
      );
      if (fromCache === void 0) {
        let result;
        try {
          result = await query();
        } catch (e) {
          throw new DrizzleQueryError(queryString, params, e);
        }
        await this.cache.put(
          this.cacheConfig.tag ?? await hashQuery(queryString, params),
          result,
          // make sure we send tables that were used in a query only if user wants to invalidate it on each write
          this.cacheConfig.autoInvalidate ? this.queryMetadata.tables : [],
          this.cacheConfig.tag !== void 0,
          this.cacheConfig.config
        );
        return result;
      }
      return fromCache;
    }
    try {
      return await query();
    } catch (e) {
      throw new DrizzleQueryError(queryString, params, e);
    }
  }
  getQuery() {
    return this.query;
  }
  mapRunResult(result, _isFromBatch) {
    return result;
  }
  mapAllResult(_result, _isFromBatch) {
    throw new Error("Not implemented");
  }
  mapGetResult(_result, _isFromBatch) {
    throw new Error("Not implemented");
  }
  execute(placeholderValues) {
    if (this.mode === "async") {
      return this[this.executeMethod](placeholderValues);
    }
    return new ExecuteResultSync(() => this[this.executeMethod](placeholderValues));
  }
  mapResult(response, isFromBatch) {
    switch (this.executeMethod) {
      case "run": {
        return this.mapRunResult(response, isFromBatch);
      }
      case "all": {
        return this.mapAllResult(response, isFromBatch);
      }
      case "get": {
        return this.mapGetResult(response, isFromBatch);
      }
    }
  }
}
__publicField(SQLitePreparedQuery, _Tb, "PreparedQuery");
_Ub = entityKind;
class SQLiteSession {
  constructor(dialect) {
    this.dialect = dialect;
  }
  prepareOneTimeQuery(query, fields, executeMethod, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    return this.prepareQuery(
      query,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper,
      queryMetadata,
      cacheConfig
    );
  }
  run(query) {
    const staticQuery = this.dialect.sqlToQuery(query);
    try {
      return this.prepareOneTimeQuery(staticQuery, void 0, "run", false).run();
    } catch (err) {
      throw new DrizzleError({ cause: err, message: `Failed to run the query '${staticQuery.sql}'` });
    }
  }
  /** @internal */
  extractRawRunValueFromBatchResult(result) {
    return result;
  }
  all(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).all();
  }
  /** @internal */
  extractRawAllValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
  get(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).get();
  }
  /** @internal */
  extractRawGetValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
  values(query) {
    return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).values();
  }
  async count(sql2) {
    const result = await this.values(sql2);
    return result[0][0];
  }
  /** @internal */
  extractRawValuesValueFromBatchResult(_result) {
    throw new Error("Not implemented");
  }
}
__publicField(SQLiteSession, _Ub, "SQLiteSession");
class SQLiteTransaction extends (_Wb = BaseSQLiteDatabase, _Vb = entityKind, _Wb) {
  constructor(resultType, dialect, session2, schema2, nestedIndex = 0) {
    super(resultType, dialect, session2, schema2);
    this.schema = schema2;
    this.nestedIndex = nestedIndex;
  }
  rollback() {
    throw new TransactionRollbackError();
  }
}
__publicField(SQLiteTransaction, _Vb, "SQLiteTransaction");
class BetterSQLiteSession extends (_Yb = SQLiteSession, _Xb = entityKind, _Yb) {
  constructor(client, dialect, schema2, options = {}) {
    super(dialect);
    __publicField(this, "logger");
    __publicField(this, "cache");
    this.client = client;
    this.schema = schema2;
    this.logger = options.logger ?? new NoopLogger();
    this.cache = options.cache ?? new NoopCache();
  }
  prepareQuery(query, fields, executeMethod, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    const stmt = this.client.prepare(query.sql);
    return new PreparedQuery(
      stmt,
      query,
      this.logger,
      this.cache,
      queryMetadata,
      cacheConfig,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper
    );
  }
  transaction(transaction, config = {}) {
    const tx = new BetterSQLiteTransaction("sync", this.dialect, this, this.schema);
    const nativeTx = this.client.transaction(transaction);
    return nativeTx[config.behavior ?? "deferred"](tx);
  }
}
__publicField(BetterSQLiteSession, _Xb, "BetterSQLiteSession");
const _BetterSQLiteTransaction = class _BetterSQLiteTransaction extends (__b = SQLiteTransaction, _Zb = entityKind, __b) {
  transaction(transaction) {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new _BetterSQLiteTransaction("sync", this.dialect, this.session, this.schema, this.nestedIndex + 1);
    this.session.run(sql.raw(`savepoint ${savepointName}`));
    try {
      const result = transaction(tx);
      this.session.run(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (err) {
      this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
      throw err;
    }
  }
};
__publicField(_BetterSQLiteTransaction, _Zb, "BetterSQLiteTransaction");
let BetterSQLiteTransaction = _BetterSQLiteTransaction;
class PreparedQuery extends (_ac = SQLitePreparedQuery, _$b = entityKind, _ac) {
  constructor(stmt, query, logger2, cache, queryMetadata, cacheConfig, fields, executeMethod, _isResponseInArrayMode, customResultMapper) {
    super("sync", executeMethod, query, cache, queryMetadata, cacheConfig);
    this.stmt = stmt;
    this.logger = logger2;
    this.fields = fields;
    this._isResponseInArrayMode = _isResponseInArrayMode;
    this.customResultMapper = customResultMapper;
  }
  run(placeholderValues) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return this.stmt.run(...params);
  }
  all(placeholderValues) {
    const { fields, joinsNotNullableMap, query, logger: logger2, stmt, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      const params = fillPlaceholders(query.params, placeholderValues ?? {});
      logger2.logQuery(query.sql, params);
      return stmt.all(...params);
    }
    const rows = this.values(placeholderValues);
    if (customResultMapper) {
      return customResultMapper(rows);
    }
    return rows.map((row) => mapResultRow(fields, row, joinsNotNullableMap));
  }
  get(placeholderValues) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    const { fields, stmt, joinsNotNullableMap, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      return stmt.get(...params);
    }
    const row = stmt.raw().get(...params);
    if (!row) {
      return void 0;
    }
    if (customResultMapper) {
      return customResultMapper([row]);
    }
    return mapResultRow(fields, row, joinsNotNullableMap);
  }
  values(placeholderValues) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return this.stmt.raw().all(...params);
  }
  /** @internal */
  isResponseInArrayMode() {
    return this._isResponseInArrayMode;
  }
}
__publicField(PreparedQuery, _$b, "BetterSQLitePreparedQuery");
class BetterSQLite3Database extends (_cc = BaseSQLiteDatabase, _bc = entityKind, _cc) {
}
__publicField(BetterSQLite3Database, _bc, "BetterSQLite3Database");
function construct(client, config = {}) {
  const dialect = new SQLiteSyncDialect({ casing: config.casing });
  let logger2;
  if (config.logger === true) {
    logger2 = new DefaultLogger();
  } else if (config.logger !== false) {
    logger2 = config.logger;
  }
  let schema2;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(
      config.schema,
      createTableRelationsHelpers
    );
    schema2 = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap
    };
  }
  const session2 = new BetterSQLiteSession(client, dialect, schema2, { logger: logger2 });
  const db2 = new BetterSQLite3Database("sync", dialect, session2, schema2);
  db2.$client = client;
  return db2;
}
function drizzle(...params) {
  if (params[0] === void 0 || typeof params[0] === "string") {
    const instance = params[0] === void 0 ? new Client() : new Client(params[0]);
    return construct(instance, params[1]);
  }
  if (isConfig(params[0])) {
    const { connection, client, ...drizzleConfig } = params[0];
    if (client) return construct(client, drizzleConfig);
    if (typeof connection === "object") {
      const { source, ...options } = connection;
      const instance2 = new Client(source, options);
      return construct(instance2, drizzleConfig);
    }
    const instance = new Client(connection);
    return construct(instance, drizzleConfig);
  }
  return construct(params[0], params[1]);
}
((drizzle2) => {
  function mock(config) {
    return construct({}, config);
  }
  drizzle2.mock = mock;
})(drizzle || (drizzle = {}));
const groups = sqliteTable("groups", {
  groupId: text("group_id").primaryKey(),
  name: text("name").notNull(),
  adminRevelnestId: text("admin_upeer_id").notNull(),
  members: text("members").notNull().default("[]"),
  // JSON array of upeerIds
  status: text("status").notNull().default("active"),
  // 'active' | 'invited'
  avatar: text("avatar"),
  // base64 data URL, local only
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`)
});
const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  chatRevelnestId: text("chat_upeer_id").notNull(),
  isMine: integer("is_mine", { mode: "boolean" }).notNull(),
  message: text("message").notNull(),
  replyTo: text("reply_to"),
  signature: text("signature"),
  status: text("status").notNull().default("sent"),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
  isEdited: integer("is_edited", { mode: "boolean" }).notNull().default(false),
  timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`)
});
const reactions = sqliteTable("reactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: text("message_id").notNull(),
  upeerId: text("upeer_id").notNull(),
  emoji: text("emoji").notNull(),
  timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`)
});
const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  upeerId: text("upeer_id").unique(),
  address: text("address").notNull(),
  name: text("name").notNull(),
  publicKey: text("public_key"),
  ephemeralPublicKey: text("ephemeral_public_key"),
  ephemeralPublicKeyUpdatedAt: text("ephemeral_public_key_updated_at"),
  // ISO timestamp of last eph key update
  // ── Double Ratchet: Signed PreKey del contacto (X25519) ──────────────────
  // Se recibe en el HANDSHAKE y se usa para X3DH al enviar el primer mensaje ratchet.
  signedPreKey: text("signed_pre_key"),
  // hex X25519 public key
  signedPreKeySignature: text("signed_pre_key_sig"),
  // hex Ed25519 signature de SPK por IK
  signedPreKeyId: integer("signed_pre_key_id"),
  // ID correlativo del SPK
  dhtSeq: integer("dht_seq").notNull().default(0),
  dhtSignature: text("dht_signature"),
  dhtExpiresAt: integer("dht_expires_at"),
  renewalToken: text("renewal_token"),
  knownAddresses: text("known_addresses").notNull().default("[]"),
  // JSON: string[] — one IP per device
  avatar: text("avatar"),
  // Base64 data URL del avatar, nullable
  status: text("status").notNull().default("connected"),
  // 'pending'|'incoming'|'connected'|'offline'|'blocked'
  blockedAt: text("blocked_at"),
  // ISO timestamp cuando fue bloqueado
  lastSeen: text("last_seen").default(sql`CURRENT_TIMESTAMP`)
});
const backupSurvivalKit = sqliteTable("backup_survival_kit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kitId: text("kit_id").unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  data: text("data").notNull(),
  // JSON string with contacts and location blocks
  created: text("created").default(sql`CURRENT_TIMESTAMP`),
  expires: integer("expires"),
  // Timestamp when kit expires
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true)
});
const vaultStorage = sqliteTable("vault_storage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payloadHash: text("payload_hash").unique().notNull(),
  recipientSid: text("recipient_sid").notNull(),
  // Social ID del destinatario
  senderSid: text("sender_sid").notNull(),
  // Social ID del emisor original
  priority: integer("priority").notNull().default(1),
  // 1: msg, 2: meta, 3: chunk
  data: text("data").notNull(),
  // BLOB/Encrypted data (as hex)
  expiresAt: integer("expires_at").notNull(),
  // TTL (Timestamp)
  timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`)
});
const distributedAssets = sqliteTable("distributed_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileHash: text("file_hash").notNull(),
  cid: text("cid").unique().notNull(),
  // Content ID del fragmento
  shardIndex: integer("shard_index").notNull(),
  totalShards: integer("total_shards").notNull(),
  custodianSid: text("custodian_sid").notNull(),
  // Amigo que lo tiene
  status: text("status").notNull().default("active"),
  // 'active' | 'lost'
  lastVerified: integer("last_verified")
});
const redundancyHealth = sqliteTable("redundancy_health", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetHash: text("asset_hash").unique().notNull(),
  availableShards: integer("available_shards").notNull(),
  requiredShards: integer("required_shards").notNull(),
  // k (datos)
  healthStatus: text("health_status").notNull(),
  // 'perfect' | 'degraded' | 'critical' | 'lost'
  lastCheck: integer("last_check")
});
const reputationVouches = sqliteTable("reputation_vouches", {
  id: text("id").primaryKey(),
  // sha256 determinista
  fromId: text("from_id").notNull(),
  // upeerId emisor
  toId: text("to_id").notNull(),
  // upeerId sujeto
  type: text("type").notNull(),
  // VouchType
  positive: integer("positive", { mode: "boolean" }).notNull(),
  timestamp: integer("timestamp").notNull(),
  // ms epoch
  signature: text("signature").notNull(),
  // hex Ed25519
  receivedAt: integer("received_at").notNull()
  // cuando lo recibimos
});
const ratchetSessions = sqliteTable("ratchet_sessions", {
  upeerId: text("upeer_id").primaryKey(),
  // un estado por contacto
  state: text("state").notNull(),
  // JSON SerializedRatchetState
  // Nuestro SPK que se usó para establecer esta sesión (para poder rotar)
  spkIdUsed: integer("spk_id_used"),
  establishedAt: integer("established_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});
const pendingOutbox = sqliteTable("pending_outbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  msgId: text("msg_id").notNull(),
  // UUID original de saveMessage() — evita duplicados
  recipientSid: text("recipient_sid").notNull(),
  // upeerId del destinatario
  plaintext: text("plaintext").notNull(),
  // contenido del mensaje (SQLCipher lo protege)
  replyTo: text("reply_to"),
  // id del mensaje al que se responde (opcional)
  createdAt: integer("created_at").notNull()
  // epoch ms
});
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  backupSurvivalKit,
  contacts,
  distributedAssets,
  groups,
  messages,
  pendingOutbox,
  ratchetSessions,
  reactions,
  redundancyHealth,
  reputationVouches,
  vaultStorage
}, Symbol.toStringTag, { value: "Module" }));
function readMigrationFiles(config) {
  const migrationFolderTo = config.migrationsFolder;
  const migrationQueries = [];
  const journalPath = `${migrationFolderTo}/meta/_journal.json`;
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Can't find meta/_journal.json file`);
  }
  const journalAsString = fs.readFileSync(`${migrationFolderTo}/meta/_journal.json`).toString();
  const journal = JSON.parse(journalAsString);
  for (const journalEntry of journal.entries) {
    const migrationPath = `${migrationFolderTo}/${journalEntry.tag}.sql`;
    try {
      const query = fs.readFileSync(`${migrationFolderTo}/${journalEntry.tag}.sql`).toString();
      const result = query.split("--> statement-breakpoint").map((it) => {
        return it;
      });
      migrationQueries.push({
        sql: result,
        bps: journalEntry.breakpoints,
        folderMillis: journalEntry.when,
        hash: crypto$1.createHash("sha256").update(query).digest("hex")
      });
    } catch {
      throw new Error(`No file ${migrationPath} found in ${migrationFolderTo} folder`);
    }
  }
  return migrationQueries;
}
function migrate(db2, config) {
  const migrations = readMigrationFiles(config);
  db2.dialect.migrate(migrations, db2.session, config);
}
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
  return LogLevel2;
})(LogLevel || {});
class SecureLogger {
  constructor() {
    this.level = process.env.NODE_ENV === "production" ? 1 : 0;
    this.isProduction = process.env.NODE_ENV === "production";
    this.redactedFields = /* @__PURE__ */ new Set([
      "privateKey",
      "secretKey",
      "signature",
      "publicKey",
      "ephemeralPublicKey",
      "nonce",
      "ciphertext",
      "content",
      "powProof",
      "address",
      "ip",
      "senderRevelnestId",
      "upeerId",
      "targetId"
    ]);
  }
  static getInstance() {
    if (!SecureLogger.instance) {
      SecureLogger.instance = new SecureLogger();
    }
    return SecureLogger.instance;
  }
  setLevel(level) {
    this.level = level;
  }
  shouldLog(level) {
    return level >= this.level;
  }
  redactSensitiveData(data) {
    if (!data || typeof data !== "object") {
      return data;
    }
    if (data instanceof Error) {
      return {
        name: data.name,
        message: data.message,
        stack: data.stack
      };
    }
    const redacted = Array.isArray(data) ? [...data] : { ...data };
    for (const key in redacted) {
      if (this.redactedFields.has(key)) {
        if (typeof redacted[key] === "string" && redacted[key].length > 0) {
          redacted[key] = `[REDACTED:${key} (${redacted[key].length} chars)]`;
        } else if (redacted[key] !== null && redacted[key] !== void 0) {
          redacted[key] = `[REDACTED:${key}]`;
        }
      } else if (typeof redacted[key] === "object" && redacted[key] !== null) {
        redacted[key] = this.redactSensitiveData(redacted[key]);
      }
    }
    return redacted;
  }
  formatMessage(level, message, data, source) {
    const redactedData = data ? this.redactSensitiveData(data) : void 0;
    return {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      message,
      data: redactedData,
      source: source || "upeer"
    };
  }
  logToConsole(entry) {
    const timestamp = entry.timestamp.slice(11, 23);
    const levelStr = LogLevel[entry.level];
    const source = entry.source ? `[${entry.source}]` : "";
    const logLine = `${timestamp} ${levelStr} ${source} ${entry.message}`;
    switch (entry.level) {
      case 3:
        console.error(logLine, entry.data || "");
        break;
      case 2:
        console.warn(logLine, entry.data || "");
        break;
      case 1:
        console.info(logLine, entry.data || "");
        break;
      case 0:
        if (!this.isProduction) {
          console.debug(logLine, entry.data || "");
        }
        break;
    }
  }
  debug(message, data, source) {
    if (!this.shouldLog(
      0
      /* DEBUG */
    )) return;
    const entry = this.formatMessage(0, message, data, source);
    this.logToConsole(entry);
  }
  info(message, data, source) {
    if (!this.shouldLog(
      1
      /* INFO */
    )) return;
    const entry = this.formatMessage(1, message, data, source);
    this.logToConsole(entry);
  }
  warn(message, data, source) {
    if (!this.shouldLog(
      2
      /* WARN */
    )) return;
    const entry = this.formatMessage(2, message, data, source);
    this.logToConsole(entry);
  }
  error(message, data, source) {
    if (!this.shouldLog(
      3
      /* ERROR */
    )) return;
    const entry = this.formatMessage(3, message, data, source);
    this.logToConsole(entry);
  }
  /**
   * Special logger for network events that might need IP addresses
   * but should still redact other sensitive data.
   *
   * BUG BO fix: el orden anterior era incorrecto — se asignaba safeData.ip
   * y luego redactSensitiveData() la borraba de nuevo (porque 'ip' está en
   * redactedFields). Ahora se redacta primero el `data` genérico y sólo
   * después se añade la IP procesada, evitando la doble redacción.
   */
  network(message, ip, data, source) {
    if (!this.shouldLog(
      1
      /* INFO */
    )) return;
    const safeData = data ? this.redactSensitiveData({ ...data }) : {};
    if (ip) {
      safeData.ip = this.isProduction ? ip.split(":")[0] + ":[REDACTED]" : ip;
    }
    const entry = this.formatMessage(1, message, safeData, source);
    this.logToConsole(entry);
  }
  /**
   * Log security events (always logged regardless of level)
   */
  security(message, data, source) {
    const entry = this.formatMessage(2, `[SECURITY] ${message}`, data, source);
    this.logToConsole(entry);
  }
  /**
   * Get current logs in structured format (for debugging/monitoring)
   */
  getLogs() {
    return [];
  }
}
const logger = SecureLogger.getInstance();
function debug(message, data, source) {
  logger.debug(message, data, source);
}
function info(message, data, source) {
  logger.info(message, data, source);
}
function warn(message, data, source) {
  logger.warn(message, data, source);
}
function error(message, data, source) {
  logger.error(message, data, source);
}
function network(message, ip, data, source) {
  logger.network(message, ip, data, source);
}
function security(message, data, source) {
  logger.security(message, data, source);
}
let sqlite = null;
let db = null;
function setDatabase(instance, sqliteInstance) {
  db = instance;
  sqlite = sqliteInstance;
}
function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initDB first.");
  }
  return db;
}
function getSchema() {
  return schema;
}
function closeDatabase() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}
function clearUserData() {
  if (!sqlite) return;
  sqlite.exec("DELETE FROM messages");
  sqlite.exec("DELETE FROM reactions");
  sqlite.exec("DELETE FROM contacts");
  sqlite.exec("DELETE FROM groups");
  sqlite.exec("DELETE FROM distributed_assets");
  sqlite.exec("DELETE FROM redundancy_health");
}
const DEVICE_KEY_FILE$1 = "device.key";
function _getOrCreateDeviceKey$1(userDataPath) {
  const p = path.join(userDataPath, DEVICE_KEY_FILE$1);
  if (fs.existsSync(p)) {
    const k2 = fs.readFileSync(p);
    if (k2.length === sodium.crypto_secretbox_KEYBYTES) return k2;
  }
  const k = Buffer.allocUnsafe(sodium.crypto_secretbox_KEYBYTES);
  sodium.randombytes_buf(k);
  fs.writeFileSync(p, k, { mode: 384 });
  return k;
}
function _deriveDbKey(deviceKey) {
  const dbKey = Buffer.alloc(32);
  sodium.crypto_generichash(dbKey, Buffer.from("upeer-db-sqlcipher-v1"), deviceKey);
  return dbKey;
}
async function initDB(userDataPath) {
  const dbPath = path.join(userDataPath, "p2p-chat.db");
  const deviceKey = _getOrCreateDeviceKey$1(userDataPath);
  const dbKey = _deriveDbKey(deviceKey);
  const dbKeyHex = dbKey.toString("hex");
  sodium.sodium_memzero(deviceKey);
  const sqlite2 = new Client(dbPath);
  try {
    sqlite2.pragma(`key = "x'${dbKeyHex}'"`);
  } catch {
  }
  sodium.sodium_memzero(dbKey);
  const db2 = drizzle(sqlite2, { schema });
  try {
    sqlite2.pragma("cipher_version");
    info("SQLCipher BD cifrada correctamente", {}, "db");
  } catch {
    info("BD abierta sin cifrado SQLCipher (better-sqlite3 estándar)", {}, "db");
  }
  try {
    let migrationsPath = path.join(process.cwd(), "drizzle");
    try {
      const { app: electronApp } = await import("electron");
      if (electronApp == null ? void 0 : electronApp.isPackaged) {
        migrationsPath = path.join(process.resourcesPath, "drizzle");
      }
    } catch (e) {
    }
    migrate(db2, { migrationsFolder: migrationsPath });
    info("Migraciones aplicadas correctamente", {}, "db");
  } catch (err) {
    error("Error en migraciones", err, "db");
  }
  try {
    const cols = sqlite2.prepare("PRAGMA table_info(contacts)").all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("known_addresses")) {
      sqlite2.exec("ALTER TABLE contacts ADD COLUMN known_addresses TEXT NOT NULL DEFAULT '[]'");
      info("Columna known_addresses añadida por migración de emergencia", {}, "db");
    }
    if (!names.has("avatar")) {
      sqlite2.exec("ALTER TABLE contacts ADD COLUMN avatar TEXT");
      info("Columna avatar añadida por migración de emergencia", {}, "db");
    }
    if (!names.has("renewal_token")) {
      sqlite2.exec("ALTER TABLE contacts ADD COLUMN renewal_token TEXT");
    }
    if (!names.has("blocked_at")) {
      sqlite2.exec("ALTER TABLE contacts ADD COLUMN blocked_at TEXT");
      info("Columna blocked_at añadida por migración de emergencia", {}, "db");
    }
    if (!names.has("ephemeral_public_key_updated_at")) {
      sqlite2.exec("ALTER TABLE contacts ADD COLUMN ephemeral_public_key_updated_at TEXT");
      info("Columna ephemeral_public_key_updated_at añadida por migración de emergencia", {}, "db");
    }
    if (!names.has("signed_pre_key")) {
      sqlite2.exec("ALTER TABLE contacts ADD COLUMN signed_pre_key TEXT");
      info("Columna signed_pre_key añadida por migración de emergencia", {}, "db");
    }
    if (!names.has("signed_pre_key_sig")) {
      sqlite2.exec("ALTER TABLE contacts ADD COLUMN signed_pre_key_sig TEXT");
    }
    if (!names.has("signed_pre_key_id")) {
      sqlite2.exec("ALTER TABLE contacts ADD COLUMN signed_pre_key_id INTEGER");
    }
  } catch (e) {
    error("Error en migración de emergencia de columnas", e, "db");
  }
  try {
    const gcols = sqlite2.prepare("PRAGMA table_info(groups)").all();
    const gnames = new Set(gcols.map((c) => c.name));
    if (!gnames.has("avatar")) {
      sqlite2.exec("ALTER TABLE groups ADD COLUMN avatar TEXT");
      info("Columna avatar añadida a groups por migración de emergencia", {}, "db");
    }
  } catch (e) {
    error("Error en migración de emergencia de columnas de groups", e, "db");
  }
  try {
    sqlite2.exec(`
            CREATE TABLE IF NOT EXISTS ratchet_sessions (
                upeer_id TEXT PRIMARY KEY NOT NULL,
                state TEXT NOT NULL,
                spk_id_used INTEGER,
                established_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);
    info("Tabla ratchet_sessions asegurada", {}, "db");
  } catch (e) {
    error("Error asegurando tabla ratchet_sessions", e, "db");
  }
  try {
    sqlite2.exec(`
            CREATE TABLE IF NOT EXISTS reputation_vouches (
                id TEXT PRIMARY KEY NOT NULL,
                from_id TEXT NOT NULL,
                to_id TEXT NOT NULL,
                type TEXT NOT NULL,
                positive INTEGER NOT NULL,
                timestamp INTEGER NOT NULL,
                signature TEXT NOT NULL,
                received_at INTEGER NOT NULL
            )
        `);
    sqlite2.exec("CREATE INDEX IF NOT EXISTS rep_vouches_to_idx ON reputation_vouches (to_id)");
    sqlite2.exec("CREATE INDEX IF NOT EXISTS rep_vouches_from_idx ON reputation_vouches (from_id)");
    sqlite2.exec("CREATE INDEX IF NOT EXISTS rep_vouches_ts_idx ON reputation_vouches (timestamp)");
    info("Tabla reputation_vouches asegurada", {}, "db");
  } catch (e) {
    error("Error asegurando tabla reputation_vouches", e, "db");
  }
  try {
    sqlite2.exec(`
            CREATE TABLE IF NOT EXISTS pending_outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                msg_id TEXT NOT NULL DEFAULT '',
                recipient_sid TEXT NOT NULL,
                plaintext TEXT NOT NULL,
                reply_to TEXT,
                created_at INTEGER NOT NULL
            )
        `);
    sqlite2.exec("CREATE INDEX IF NOT EXISTS pending_outbox_recipient_idx ON pending_outbox (recipient_sid)");
    info("Tabla pending_outbox asegurada", {}, "db");
  } catch (e) {
    error("Error asegurando tabla pending_outbox", e, "db");
  }
  try {
    const pocols = sqlite2.prepare("PRAGMA table_info(pending_outbox)").all();
    const ponames = new Set(pocols.map((c) => c.name));
    if (!ponames.has("msg_id")) {
      sqlite2.exec("ALTER TABLE pending_outbox ADD COLUMN msg_id TEXT NOT NULL DEFAULT ''");
      info("Columna msg_id añadida a pending_outbox por migración de emergencia", {}, "db");
    }
  } catch (e) {
    error("Error en migración de emergencia de pending_outbox.msg_id", e, "db");
  }
  setDatabase(db2, sqlite2);
  return { db: db2, sqlite: sqlite2 };
}
function closeDB() {
  closeDatabase();
}
function saveMessage(id, chatRevelnestId, isMine, message, replyTo, signature, status = "sent") {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.insert(schema2.messages).values({
    id,
    chatRevelnestId,
    isMine,
    message,
    replyTo,
    signature,
    status
  }).onConflictDoNothing().run();
}
function getMessages(chatRevelnestId) {
  const db2 = getDb();
  const schema2 = getSchema();
  const msgs = db2.select().from(schema2.messages).where(eq(schema2.messages.chatRevelnestId, chatRevelnestId)).orderBy(desc(schema2.messages.timestamp)).limit(100).all();
  return msgs.map((m) => {
    const msgReactions = db2.select().from(schema2.reactions).where(eq(schema2.reactions.messageId, m.id)).all();
    return { ...m, reactions: msgReactions };
  });
}
function updateMessageContent(id, newMessage, signature) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.messages).set({
    message: newMessage,
    isEdited: true,
    signature
  }).where(eq(schema2.messages.id, id)).run();
}
function deleteMessageLocally(id) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.messages).set({
    message: "Mensaje eliminado",
    isDeleted: true
  }).where(eq(schema2.messages.id, id)).run();
}
function deleteMessagesByChatId(chatRevelnestId) {
  const db2 = getDb();
  const schema2 = getSchema();
  const msgIds = db2.select({ id: schema2.messages.id }).from(schema2.messages).where(eq(schema2.messages.chatRevelnestId, chatRevelnestId)).all().map((m) => m.id);
  for (const id of msgIds) {
    db2.delete(schema2.reactions).where(eq(schema2.reactions.messageId, id)).run();
  }
  db2.delete(schema2.messages).where(eq(schema2.messages.chatRevelnestId, chatRevelnestId)).run();
}
function getMessageById(id) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.select().from(schema2.messages).where(eq(schema2.messages.id, id)).get();
}
function saveFileMessage(id, chatRevelnestId, isMine, fileInfo, signature, status = "sent") {
  const db2 = getDb();
  const schema2 = getSchema();
  const fileMessage = {
    type: "file",
    ...fileInfo
  };
  return db2.insert(schema2.messages).values({
    id,
    chatRevelnestId,
    isMine,
    message: JSON.stringify(fileMessage),
    replyTo: void 0,
    signature,
    status
  }).onConflictDoUpdate({
    target: schema2.messages.id,
    set: {
      message: JSON.stringify(fileMessage),
      status
    }
  }).run();
}
function updateMessageStatus(id, status) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.messages).set({ status }).where(eq(schema2.messages.id, id)).run();
}
function getMessageStatus(id) {
  const db2 = getDb();
  const schema2 = getSchema();
  const msg = db2.select({ status: schema2.messages.status }).from(schema2.messages).where(eq(schema2.messages.id, id)).get();
  return msg ? msg.status : null;
}
function saveReaction(messageId, upeerId2, emoji) {
  const db2 = getDb();
  const schema2 = getSchema();
  const existing = db2.select().from(schema2.reactions).where(and(
    eq(schema2.reactions.messageId, messageId),
    eq(schema2.reactions.upeerId, upeerId2),
    eq(schema2.reactions.emoji, emoji)
  )).get();
  if (!existing) {
    return db2.insert(schema2.reactions).values({
      messageId,
      upeerId: upeerId2,
      emoji
    }).run();
  }
}
function deleteReaction(messageId, upeerId2, emoji) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.delete(schema2.reactions).where(and(
    eq(schema2.reactions.messageId, messageId),
    eq(schema2.reactions.upeerId, upeerId2),
    eq(schema2.reactions.emoji, emoji)
  )).run();
}
function getContactByRevelnestId(upeerId2) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.select().from(schema2.contacts).where(eq(schema2.contacts.upeerId, upeerId2)).get();
}
function getContactByAddress(address) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.select().from(schema2.contacts).where(eq(schema2.contacts.address, address)).get();
}
function getContacts() {
  const db2 = getDb();
  const schema2 = getSchema();
  const contactsList = db2.select().from(schema2.contacts).all();
  const result = contactsList.map((c) => {
    const lastMsgObj = db2.select().from(schema2.messages).where(eq(schema2.messages.chatRevelnestId, c.upeerId || "")).orderBy(desc(schema2.messages.timestamp)).limit(1).get();
    return {
      ...c,
      lastMessage: lastMsgObj == null ? void 0 : lastMsgObj.message,
      lastMessageTime: lastMsgObj == null ? void 0 : lastMsgObj.timestamp,
      lastMessageIsMine: lastMsgObj == null ? void 0 : lastMsgObj.isMine,
      lastMessageStatus: lastMsgObj == null ? void 0 : lastMsgObj.status
    };
  });
  result.sort((a, b) => {
    const tA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
    const tB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
    return tB - tA;
  });
  return result;
}
function addOrUpdateContact(upeerId2, address, name, publicKey2, status = "connected", ephemeralPublicKey2, dhtSeq2, dhtSignature, dhtExpiresAt) {
  const db2 = getDb();
  const schema2 = getSchema();
  const existing = db2.select({ knownAddresses: schema2.contacts.knownAddresses }).from(schema2.contacts).where(eq(schema2.contacts.upeerId, upeerId2)).get();
  let known = [];
  try {
    known = JSON.parse((existing == null ? void 0 : existing.knownAddresses) ?? "[]");
  } catch {
    known = [];
  }
  if (!known.includes(address)) {
    known.unshift(address);
    if (known.length > 20) known = known.slice(0, 20);
  }
  const knownAddresses = JSON.stringify(known);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const ephemeralPublicKeyUpdatedAt = ephemeralPublicKey2 ? now : void 0;
  return db2.insert(schema2.contacts).values({
    upeerId: upeerId2,
    address,
    name,
    publicKey: publicKey2,
    ephemeralPublicKey: ephemeralPublicKey2,
    ephemeralPublicKeyUpdatedAt,
    dhtSeq: dhtSeq2,
    dhtSignature,
    dhtExpiresAt,
    knownAddresses,
    status
  }).onConflictDoUpdate({
    target: schema2.contacts.upeerId,
    set: {
      address,
      name,
      publicKey: publicKey2,
      ...ephemeralPublicKey2 ? { ephemeralPublicKey: ephemeralPublicKey2, ephemeralPublicKeyUpdatedAt: now } : {},
      dhtSeq: dhtSeq2,
      dhtSignature,
      dhtExpiresAt,
      knownAddresses,
      status
    }
  }).run();
}
function deleteContact(upeerId2) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.delete(schema2.contacts).where(eq(schema2.contacts.upeerId, upeerId2)).run();
}
function updateContactName(upeerId2, name) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ name }).where(eq(schema2.contacts.upeerId, upeerId2)).run();
}
function updateContactAvatar(upeerId2, avatar) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ avatar }).where(eq(schema2.contacts.upeerId, upeerId2)).run();
}
function blockContact(upeerId2) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ status: "blocked", blockedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(schema2.contacts.upeerId, upeerId2)).run();
}
function unblockContact(upeerId2) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ status: "incoming", blockedAt: null }).where(eq(schema2.contacts.upeerId, upeerId2)).run();
}
function getBlockedContacts() {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.select().from(schema2.contacts).where(eq(schema2.contacts.status, "blocked")).all();
}
function isContactBlocked(upeerId2) {
  const db2 = getDb();
  const schema2 = getSchema();
  const contact = db2.select({ status: schema2.contacts.status }).from(schema2.contacts).where(eq(schema2.contacts.upeerId, upeerId2)).get();
  return (contact == null ? void 0 : contact.status) === "blocked";
}
function updateContactLocation(upeerId2, address) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ address, lastSeen: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(schema2.contacts.upeerId, upeerId2)).run();
}
function updateContactDhtLocation(upeerId2, address, dhtSeq2, dhtSignature, dhtExpiresAt, renewalToken) {
  const db2 = getDb();
  const schema2 = getSchema();
  const existing = db2.select({ knownAddresses: schema2.contacts.knownAddresses }).from(schema2.contacts).where(eq(schema2.contacts.upeerId, upeerId2)).get();
  let known = [];
  try {
    known = JSON.parse((existing == null ? void 0 : existing.knownAddresses) ?? "[]");
  } catch {
    known = [];
  }
  if (!known.includes(address)) {
    known.unshift(address);
    if (known.length > 20) known = known.slice(0, 20);
  }
  const updateData = {
    address,
    // primary (most recent)
    dhtSeq: dhtSeq2,
    dhtSignature,
    knownAddresses: JSON.stringify(known),
    lastSeen: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (dhtExpiresAt !== void 0) updateData.dhtExpiresAt = dhtExpiresAt;
  if (renewalToken !== void 0) updateData.renewalToken = JSON.stringify(renewalToken);
  return db2.update(schema2.contacts).set(updateData).where(eq(schema2.contacts.upeerId, upeerId2)).run();
}
function updateContactStatus(upeerId2, status) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ status }).where(eq(schema2.contacts.upeerId, upeerId2)).run();
}
function updateLastSeen(upeerId2) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ lastSeen: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(schema2.contacts.upeerId, upeerId2)).run();
}
function computeKeyFingerprint(pubKeyHex) {
  const hash = Buffer.alloc(16);
  sodium.crypto_generichash(hash, Buffer.from(pubKeyHex, "hex"));
  const hex = hash.toString("hex");
  return hex.match(/.{4}/g).join(" ").toUpperCase();
}
function updateContactPublicKey(upeerId2, publicKey2) {
  const db2 = getDb();
  const schema2 = getSchema();
  const existing = db2.select({ publicKey: schema2.contacts.publicKey }).from(schema2.contacts).where(eq(schema2.contacts.upeerId, upeerId2)).get();
  const oldKey = (existing == null ? void 0 : existing.publicKey) ?? void 0;
  const changed = !!oldKey && oldKey !== publicKey2;
  db2.update(schema2.contacts).set({ publicKey: publicKey2, status: "connected" }).where(eq(schema2.contacts.upeerId, upeerId2)).run();
  return { changed, oldKey, newKey: publicKey2 };
}
function updateContactEphemeralPublicKey(upeerId2, ephemeralPublicKey2) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ ephemeralPublicKey: ephemeralPublicKey2, ephemeralPublicKeyUpdatedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(schema2.contacts.upeerId, upeerId2)).run();
}
function updateContactSignedPreKey(upeerId2, spkPub, spkSig, spkId2) {
  const db2 = getDb();
  const schema2 = getSchema();
  db2.update(schema2.contacts).set({ signedPreKey: spkPub, signedPreKeySignature: spkSig, signedPreKeyId: spkId2 }).where(eq(schema2.contacts.upeerId, upeerId2)).run();
}
const keys = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  computeKeyFingerprint,
  updateContactEphemeralPublicKey,
  updateContactPublicKey,
  updateContactSignedPreKey
}, Symbol.toStringTag, { value: "Module" }));
function parseGroup(raw) {
  let members = [];
  try {
    members = JSON.parse(raw.members || "[]");
  } catch {
    members = [];
  }
  return {
    ...raw,
    members
  };
}
function saveGroup(groupId, name, adminRevelnestId, members, status = "active", avatar) {
  const db2 = getDb();
  const schema2 = getSchema();
  db2.insert(schema2.groups).values({
    groupId,
    name,
    adminRevelnestId,
    members: JSON.stringify(members),
    status,
    ...avatar ? { avatar } : {}
  }).onConflictDoUpdate({
    target: schema2.groups.groupId,
    set: {
      name,
      adminRevelnestId,
      members: JSON.stringify(members),
      status,
      ...avatar !== void 0 ? { avatar } : {}
    }
  }).run();
}
function updateGroupAvatar(groupId, avatar) {
  const db2 = getDb();
  const schema2 = getSchema();
  db2.update(schema2.groups).set({ avatar }).where(eq(schema2.groups.groupId, groupId)).run();
}
function updateGroupInfo(groupId, fields) {
  const db2 = getDb();
  const schema2 = getSchema();
  const set = {};
  if (fields.name !== void 0) set.name = fields.name;
  if (fields.avatar !== void 0) set.avatar = fields.avatar;
  if (Object.keys(set).length === 0) return;
  db2.update(schema2.groups).set(set).where(eq(schema2.groups.groupId, groupId)).run();
}
function getGroups() {
  const db2 = getDb();
  const schema2 = getSchema();
  const rawGroups = db2.select().from(schema2.groups).all().map(parseGroup);
  const result = rawGroups.map((g) => {
    const lastMsgObj = db2.select().from(schema2.messages).where(eq(schema2.messages.chatRevelnestId, g.groupId)).orderBy(desc(schema2.messages.timestamp)).limit(1).get();
    return {
      ...g,
      lastMessage: lastMsgObj == null ? void 0 : lastMsgObj.message,
      lastMessageTime: lastMsgObj == null ? void 0 : lastMsgObj.timestamp
    };
  });
  result.sort((a, b) => {
    const tA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
    const tB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
    return tB - tA;
  });
  return result;
}
function getGroupById(groupId) {
  const db2 = getDb();
  const schema2 = getSchema();
  const result = db2.select().from(schema2.groups).where(eq(schema2.groups.groupId, groupId)).get();
  return result ? parseGroup(result) : null;
}
function updateGroupMembers(groupId, members) {
  const db2 = getDb();
  const schema2 = getSchema();
  db2.update(schema2.groups).set({ members: JSON.stringify(members) }).where(eq(schema2.groups.groupId, groupId)).run();
}
function updateGroupStatus(groupId, status) {
  const db2 = getDb();
  const schema2 = getSchema();
  db2.update(schema2.groups).set({ status }).where(eq(schema2.groups.groupId, groupId)).run();
}
function deleteGroup(groupId) {
  const db2 = getDb();
  const schema2 = getSchema();
  db2.delete(schema2.groups).where(eq(schema2.groups.groupId, groupId)).run();
}
function insertVouch(vouch) {
  try {
    const db2 = getDb();
    const schema2 = getSchema();
    db2.insert(schema2.reputationVouches).values({
      id: vouch.id,
      fromId: vouch.fromId,
      toId: vouch.toId,
      type: vouch.type,
      positive: vouch.positive,
      timestamp: vouch.timestamp,
      signature: vouch.signature,
      receivedAt: vouch.receivedAt
    }).onConflictDoNothing().run();
    return true;
  } catch {
    return false;
  }
}
function vouchExists(id) {
  try {
    const db2 = getDb();
    const schema2 = getSchema();
    return !!db2.select({ id: schema2.reputationVouches.id }).from(schema2.reputationVouches).where(eq(schema2.reputationVouches.id, id)).get();
  } catch {
    return false;
  }
}
function getVouchIds(since = 0) {
  try {
    const db2 = getDb();
    const schema2 = getSchema();
    return db2.select({ id: schema2.reputationVouches.id }).from(schema2.reputationVouches).where(gte(schema2.reputationVouches.timestamp, since)).all().map((r) => r.id);
  } catch {
    return [];
  }
}
function getVouchesByIds(ids) {
  if (ids.length === 0) return [];
  try {
    const db2 = getDb();
    const schema2 = getSchema();
    return db2.select().from(schema2.reputationVouches).where(inArray(schema2.reputationVouches.id, ids)).all();
  } catch {
    return [];
  }
}
function getVouchesForNode(toId, since = 0) {
  try {
    const db2 = getDb();
    const schema2 = getSchema();
    return db2.select().from(schema2.reputationVouches).where(and(
      eq(schema2.reputationVouches.toId, toId),
      gte(schema2.reputationVouches.timestamp, since)
    )).all();
  } catch {
    return [];
  }
}
function countRecentVouchesByFrom(fromId, since) {
  try {
    const db2 = getDb();
    const schema2 = getSchema();
    return db2.select({ id: schema2.reputationVouches.id }).from(schema2.reputationVouches).where(and(
      eq(schema2.reputationVouches.fromId, fromId),
      gte(schema2.reputationVouches.timestamp, since)
    )).all().length;
  } catch {
    return 0;
  }
}
var src = {};
var sha256 = {};
var sha2 = {};
var _md = {};
var utils$1 = {};
var cryptoNode = {};
Object.defineProperty(cryptoNode, "__esModule", { value: true });
cryptoNode.crypto = void 0;
const nc = crypto$1;
cryptoNode.crypto = nc && typeof nc === "object" && "webcrypto" in nc ? nc.webcrypto : nc && typeof nc === "object" && "randomBytes" in nc ? nc : void 0;
(function(exports$1) {
  /*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
  Object.defineProperty(exports$1, "__esModule", { value: true });
  exports$1.wrapXOFConstructorWithOpts = exports$1.wrapConstructorWithOpts = exports$1.wrapConstructor = exports$1.Hash = exports$1.nextTick = exports$1.swap32IfBE = exports$1.byteSwapIfBE = exports$1.swap8IfBE = exports$1.isLE = void 0;
  exports$1.isBytes = isBytes;
  exports$1.anumber = anumber;
  exports$1.abytes = abytes;
  exports$1.ahash = ahash;
  exports$1.aexists = aexists;
  exports$1.aoutput = aoutput;
  exports$1.u8 = u8;
  exports$1.u32 = u32;
  exports$1.clean = clean;
  exports$1.createView = createView;
  exports$1.rotr = rotr;
  exports$1.rotl = rotl;
  exports$1.byteSwap = byteSwap;
  exports$1.byteSwap32 = byteSwap32;
  exports$1.bytesToHex = bytesToHex;
  exports$1.hexToBytes = hexToBytes;
  exports$1.asyncLoop = asyncLoop;
  exports$1.utf8ToBytes = utf8ToBytes;
  exports$1.bytesToUtf8 = bytesToUtf8;
  exports$1.toBytes = toBytes;
  exports$1.kdfInputToBytes = kdfInputToBytes;
  exports$1.concatBytes = concatBytes;
  exports$1.checkOpts = checkOpts;
  exports$1.createHasher = createHasher;
  exports$1.createOptHasher = createOptHasher;
  exports$1.createXOFer = createXOFer;
  exports$1.randomBytes = randomBytes;
  const crypto_1 = cryptoNode;
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
  }
  function anumber(n) {
    if (!Number.isSafeInteger(n) || n < 0)
      throw new Error("positive integer expected, got " + n);
  }
  function abytes(b, ...lengths) {
    if (!isBytes(b))
      throw new Error("Uint8Array expected");
    if (lengths.length > 0 && !lengths.includes(b.length))
      throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
  }
  function ahash(h) {
    if (typeof h !== "function" || typeof h.create !== "function")
      throw new Error("Hash should be wrapped by utils.createHasher");
    anumber(h.outputLen);
    anumber(h.blockLen);
  }
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("Hash instance has been destroyed");
    if (checkFinished && instance.finished)
      throw new Error("Hash#digest() has already been called");
  }
  function aoutput(out, instance) {
    abytes(out);
    const min = instance.outputLen;
    if (out.length < min) {
      throw new Error("digestInto() expects output buffer of length at least " + min);
    }
  }
  function u8(arr) {
    return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function rotr(word, shift) {
    return word << 32 - shift | word >>> shift;
  }
  function rotl(word, shift) {
    return word << shift | word >>> 32 - shift >>> 0;
  }
  exports$1.isLE = (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
  function byteSwap(word) {
    return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
  }
  exports$1.swap8IfBE = exports$1.isLE ? (n) => n : (n) => byteSwap(n);
  exports$1.byteSwapIfBE = exports$1.swap8IfBE;
  function byteSwap32(arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = byteSwap(arr[i]);
    }
    return arr;
  }
  exports$1.swap32IfBE = exports$1.isLE ? (u) => u : byteSwap32;
  const hasHexBuiltin = /* @__PURE__ */ (() => (
    // @ts-ignore
    typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
  ))();
  const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
  function bytesToHex(bytes) {
    abytes(bytes);
    if (hasHexBuiltin)
      return bytes.toHex();
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += hexes[bytes[i]];
    }
    return hex;
  }
  const asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
  function asciiToBase16(ch) {
    if (ch >= asciis._0 && ch <= asciis._9)
      return ch - asciis._0;
    if (ch >= asciis.A && ch <= asciis.F)
      return ch - (asciis.A - 10);
    if (ch >= asciis.a && ch <= asciis.f)
      return ch - (asciis.a - 10);
    return;
  }
  function hexToBytes(hex) {
    if (typeof hex !== "string")
      throw new Error("hex string expected, got " + typeof hex);
    if (hasHexBuiltin)
      return Uint8Array.fromHex(hex);
    const hl = hex.length;
    const al = hl / 2;
    if (hl % 2)
      throw new Error("hex string expected, got unpadded hex of length " + hl);
    const array = new Uint8Array(al);
    for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
      const n1 = asciiToBase16(hex.charCodeAt(hi));
      const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
      if (n1 === void 0 || n2 === void 0) {
        const char = hex[hi] + hex[hi + 1];
        throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
      }
      array[ai] = n1 * 16 + n2;
    }
    return array;
  }
  const nextTick = async () => {
  };
  exports$1.nextTick = nextTick;
  async function asyncLoop(iters, tick, cb) {
    let ts = Date.now();
    for (let i = 0; i < iters; i++) {
      cb(i);
      const diff = Date.now() - ts;
      if (diff >= 0 && diff < tick)
        continue;
      await (0, exports$1.nextTick)();
      ts += diff;
    }
  }
  function utf8ToBytes(str) {
    if (typeof str !== "string")
      throw new Error("string expected");
    return new Uint8Array(new TextEncoder().encode(str));
  }
  function bytesToUtf8(bytes) {
    return new TextDecoder().decode(bytes);
  }
  function toBytes(data) {
    if (typeof data === "string")
      data = utf8ToBytes(data);
    abytes(data);
    return data;
  }
  function kdfInputToBytes(data) {
    if (typeof data === "string")
      data = utf8ToBytes(data);
    abytes(data);
    return data;
  }
  function concatBytes(...arrays) {
    let sum = 0;
    for (let i = 0; i < arrays.length; i++) {
      const a = arrays[i];
      abytes(a);
      sum += a.length;
    }
    const res = new Uint8Array(sum);
    for (let i = 0, pad = 0; i < arrays.length; i++) {
      const a = arrays[i];
      res.set(a, pad);
      pad += a.length;
    }
    return res;
  }
  function checkOpts(defaults, opts) {
    if (opts !== void 0 && {}.toString.call(opts) !== "[object Object]")
      throw new Error("options should be object or undefined");
    const merged = Object.assign(defaults, opts);
    return merged;
  }
  class Hash {
  }
  exports$1.Hash = Hash;
  function createHasher(hashCons) {
    const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
    const tmp = hashCons();
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = () => hashCons();
    return hashC;
  }
  function createOptHasher(hashCons) {
    const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
    const tmp = hashCons({});
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    return hashC;
  }
  function createXOFer(hashCons) {
    const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
    const tmp = hashCons({});
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    return hashC;
  }
  exports$1.wrapConstructor = createHasher;
  exports$1.wrapConstructorWithOpts = createOptHasher;
  exports$1.wrapXOFConstructorWithOpts = createXOFer;
  function randomBytes(bytesLength = 32) {
    if (crypto_1.crypto && typeof crypto_1.crypto.getRandomValues === "function") {
      return crypto_1.crypto.getRandomValues(new Uint8Array(bytesLength));
    }
    if (crypto_1.crypto && typeof crypto_1.crypto.randomBytes === "function") {
      return Uint8Array.from(crypto_1.crypto.randomBytes(bytesLength));
    }
    throw new Error("crypto.getRandomValues must be defined");
  }
})(utils$1);
Object.defineProperty(_md, "__esModule", { value: true });
_md.SHA512_IV = _md.SHA384_IV = _md.SHA224_IV = _md.SHA256_IV = _md.HashMD = void 0;
_md.setBigUint64 = setBigUint64;
_md.Chi = Chi;
_md.Maj = Maj;
const utils_ts_1$2 = utils$1;
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n2 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n2 & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
class HashMD extends utils_ts_1$2.Hash {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = (0, utils_ts_1$2.createView)(this.buffer);
  }
  update(data) {
    (0, utils_ts_1$2.aexists)(this);
    data = (0, utils_ts_1$2.toBytes)(data);
    (0, utils_ts_1$2.abytes)(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = (0, utils_ts_1$2.createView)(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    (0, utils_ts_1$2.aexists)(this);
    (0, utils_ts_1$2.aoutput)(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    (0, utils_ts_1$2.clean)(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = (0, utils_ts_1$2.createView)(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
}
_md.HashMD = HashMD;
_md.SHA256_IV = Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
_md.SHA224_IV = Uint32Array.from([
  3238371032,
  914150663,
  812702999,
  4144912697,
  4290775857,
  1750603025,
  1694076839,
  3204075428
]);
_md.SHA384_IV = Uint32Array.from([
  3418070365,
  3238371032,
  1654270250,
  914150663,
  2438529370,
  812702999,
  355462360,
  4144912697,
  1731405415,
  4290775857,
  2394180231,
  1750603025,
  3675008525,
  1694076839,
  1203062813,
  3204075428
]);
_md.SHA512_IV = Uint32Array.from([
  1779033703,
  4089235720,
  3144134277,
  2227873595,
  1013904242,
  4271175723,
  2773480762,
  1595750129,
  1359893119,
  2917565137,
  2600822924,
  725511199,
  528734635,
  4215389547,
  1541459225,
  327033209
]);
var _u64 = {};
Object.defineProperty(_u64, "__esModule", { value: true });
_u64.toBig = _u64.shrSL = _u64.shrSH = _u64.rotrSL = _u64.rotrSH = _u64.rotrBL = _u64.rotrBH = _u64.rotr32L = _u64.rotr32H = _u64.rotlSL = _u64.rotlSH = _u64.rotlBL = _u64.rotlBH = _u64.add5L = _u64.add5H = _u64.add4L = _u64.add4H = _u64.add3L = _u64.add3H = void 0;
_u64.add = add;
_u64.fromBig = fromBig;
_u64.split = split;
const U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
const _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
const toBig = (h, l) => BigInt(h >>> 0) << _32n | BigInt(l >>> 0);
_u64.toBig = toBig;
const shrSH = (h, _l2, s) => h >>> s;
_u64.shrSH = shrSH;
const shrSL = (h, l, s) => h << 32 - s | l >>> s;
_u64.shrSL = shrSL;
const rotrSH = (h, l, s) => h >>> s | l << 32 - s;
_u64.rotrSH = rotrSH;
const rotrSL = (h, l, s) => h << 32 - s | l >>> s;
_u64.rotrSL = rotrSL;
const rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
_u64.rotrBH = rotrBH;
const rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
_u64.rotrBL = rotrBL;
const rotr32H = (_h2, l) => l;
_u64.rotr32H = rotr32H;
const rotr32L = (h, _l2) => h;
_u64.rotr32L = rotr32L;
const rotlSH = (h, l, s) => h << s | l >>> 32 - s;
_u64.rotlSH = rotlSH;
const rotlSL = (h, l, s) => l << s | h >>> 32 - s;
_u64.rotlSL = rotlSL;
const rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
_u64.rotlBH = rotlBH;
const rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;
_u64.rotlBL = rotlBL;
function add(Ah, Al, Bh, Bl) {
  const l = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
}
const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
_u64.add3L = add3L;
const add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
_u64.add3H = add3H;
const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
_u64.add4L = add4L;
const add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
_u64.add4H = add4H;
const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
_u64.add5L = add5L;
const add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;
_u64.add5H = add5H;
const u64$1 = {
  fromBig,
  split,
  toBig,
  shrSH,
  shrSL,
  rotrSH,
  rotrSL,
  rotrBH,
  rotrBL,
  rotr32H,
  rotr32L,
  rotlSH,
  rotlSL,
  rotlBH,
  rotlBL,
  add,
  add3L,
  add3H,
  add4L,
  add4H,
  add5H,
  add5L
};
_u64.default = u64$1;
Object.defineProperty(sha2, "__esModule", { value: true });
sha2.sha512_224 = sha2.sha512_256 = sha2.sha384 = sha2.sha512 = sha2.sha224 = sha2.sha256 = sha2.SHA512_256 = sha2.SHA512_224 = sha2.SHA384 = sha2.SHA512 = sha2.SHA224 = sha2.SHA256 = void 0;
const _md_ts_1 = _md;
const u64 = _u64;
const utils_ts_1$1 = utils$1;
const SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
class SHA256 extends _md_ts_1.HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = _md_ts_1.SHA256_IV[0] | 0;
    this.B = _md_ts_1.SHA256_IV[1] | 0;
    this.C = _md_ts_1.SHA256_IV[2] | 0;
    this.D = _md_ts_1.SHA256_IV[3] | 0;
    this.E = _md_ts_1.SHA256_IV[4] | 0;
    this.F = _md_ts_1.SHA256_IV[5] | 0;
    this.G = _md_ts_1.SHA256_IV[6] | 0;
    this.H = _md_ts_1.SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = (0, utils_ts_1$1.rotr)(W15, 7) ^ (0, utils_ts_1$1.rotr)(W15, 18) ^ W15 >>> 3;
      const s1 = (0, utils_ts_1$1.rotr)(W2, 17) ^ (0, utils_ts_1$1.rotr)(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = (0, utils_ts_1$1.rotr)(E, 6) ^ (0, utils_ts_1$1.rotr)(E, 11) ^ (0, utils_ts_1$1.rotr)(E, 25);
      const T1 = H + sigma1 + (0, _md_ts_1.Chi)(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = (0, utils_ts_1$1.rotr)(A, 2) ^ (0, utils_ts_1$1.rotr)(A, 13) ^ (0, utils_ts_1$1.rotr)(A, 22);
      const T2 = sigma0 + (0, _md_ts_1.Maj)(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    (0, utils_ts_1$1.clean)(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    (0, utils_ts_1$1.clean)(this.buffer);
  }
}
sha2.SHA256 = SHA256;
class SHA224 extends SHA256 {
  constructor() {
    super(28);
    this.A = _md_ts_1.SHA224_IV[0] | 0;
    this.B = _md_ts_1.SHA224_IV[1] | 0;
    this.C = _md_ts_1.SHA224_IV[2] | 0;
    this.D = _md_ts_1.SHA224_IV[3] | 0;
    this.E = _md_ts_1.SHA224_IV[4] | 0;
    this.F = _md_ts_1.SHA224_IV[5] | 0;
    this.G = _md_ts_1.SHA224_IV[6] | 0;
    this.H = _md_ts_1.SHA224_IV[7] | 0;
  }
}
sha2.SHA224 = SHA224;
const K512 = /* @__PURE__ */ (() => u64.split([
  "0x428a2f98d728ae22",
  "0x7137449123ef65cd",
  "0xb5c0fbcfec4d3b2f",
  "0xe9b5dba58189dbbc",
  "0x3956c25bf348b538",
  "0x59f111f1b605d019",
  "0x923f82a4af194f9b",
  "0xab1c5ed5da6d8118",
  "0xd807aa98a3030242",
  "0x12835b0145706fbe",
  "0x243185be4ee4b28c",
  "0x550c7dc3d5ffb4e2",
  "0x72be5d74f27b896f",
  "0x80deb1fe3b1696b1",
  "0x9bdc06a725c71235",
  "0xc19bf174cf692694",
  "0xe49b69c19ef14ad2",
  "0xefbe4786384f25e3",
  "0x0fc19dc68b8cd5b5",
  "0x240ca1cc77ac9c65",
  "0x2de92c6f592b0275",
  "0x4a7484aa6ea6e483",
  "0x5cb0a9dcbd41fbd4",
  "0x76f988da831153b5",
  "0x983e5152ee66dfab",
  "0xa831c66d2db43210",
  "0xb00327c898fb213f",
  "0xbf597fc7beef0ee4",
  "0xc6e00bf33da88fc2",
  "0xd5a79147930aa725",
  "0x06ca6351e003826f",
  "0x142929670a0e6e70",
  "0x27b70a8546d22ffc",
  "0x2e1b21385c26c926",
  "0x4d2c6dfc5ac42aed",
  "0x53380d139d95b3df",
  "0x650a73548baf63de",
  "0x766a0abb3c77b2a8",
  "0x81c2c92e47edaee6",
  "0x92722c851482353b",
  "0xa2bfe8a14cf10364",
  "0xa81a664bbc423001",
  "0xc24b8b70d0f89791",
  "0xc76c51a30654be30",
  "0xd192e819d6ef5218",
  "0xd69906245565a910",
  "0xf40e35855771202a",
  "0x106aa07032bbd1b8",
  "0x19a4c116b8d2d0c8",
  "0x1e376c085141ab53",
  "0x2748774cdf8eeb99",
  "0x34b0bcb5e19b48a8",
  "0x391c0cb3c5c95a63",
  "0x4ed8aa4ae3418acb",
  "0x5b9cca4f7763e373",
  "0x682e6ff3d6b2b8a3",
  "0x748f82ee5defb2fc",
  "0x78a5636f43172f60",
  "0x84c87814a1f0ab72",
  "0x8cc702081a6439ec",
  "0x90befffa23631e28",
  "0xa4506cebde82bde9",
  "0xbef9a3f7b2c67915",
  "0xc67178f2e372532b",
  "0xca273eceea26619c",
  "0xd186b8c721c0c207",
  "0xeada7dd6cde0eb1e",
  "0xf57d4f7fee6ed178",
  "0x06f067aa72176fba",
  "0x0a637dc5a2c898a6",
  "0x113f9804bef90dae",
  "0x1b710b35131c471b",
  "0x28db77f523047d84",
  "0x32caab7b40c72493",
  "0x3c9ebe0a15c9bebc",
  "0x431d67c49c100d4c",
  "0x4cc5d4becb3e42b6",
  "0x597f299cfc657e2a",
  "0x5fcb6fab3ad6faec",
  "0x6c44198c4a475817"
].map((n) => BigInt(n))))();
const SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
const SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
const SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
const SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
class SHA512 extends _md_ts_1.HashMD {
  constructor(outputLen = 64) {
    super(128, outputLen, 16, false);
    this.Ah = _md_ts_1.SHA512_IV[0] | 0;
    this.Al = _md_ts_1.SHA512_IV[1] | 0;
    this.Bh = _md_ts_1.SHA512_IV[2] | 0;
    this.Bl = _md_ts_1.SHA512_IV[3] | 0;
    this.Ch = _md_ts_1.SHA512_IV[4] | 0;
    this.Cl = _md_ts_1.SHA512_IV[5] | 0;
    this.Dh = _md_ts_1.SHA512_IV[6] | 0;
    this.Dl = _md_ts_1.SHA512_IV[7] | 0;
    this.Eh = _md_ts_1.SHA512_IV[8] | 0;
    this.El = _md_ts_1.SHA512_IV[9] | 0;
    this.Fh = _md_ts_1.SHA512_IV[10] | 0;
    this.Fl = _md_ts_1.SHA512_IV[11] | 0;
    this.Gh = _md_ts_1.SHA512_IV[12] | 0;
    this.Gl = _md_ts_1.SHA512_IV[13] | 0;
    this.Hh = _md_ts_1.SHA512_IV[14] | 0;
    this.Hl = _md_ts_1.SHA512_IV[15] | 0;
  }
  // prettier-ignore
  get() {
    const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
  }
  // prettier-ignore
  set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
    this.Ah = Ah | 0;
    this.Al = Al | 0;
    this.Bh = Bh | 0;
    this.Bl = Bl | 0;
    this.Ch = Ch | 0;
    this.Cl = Cl | 0;
    this.Dh = Dh | 0;
    this.Dl = Dl | 0;
    this.Eh = Eh | 0;
    this.El = El | 0;
    this.Fh = Fh | 0;
    this.Fl = Fl | 0;
    this.Gh = Gh | 0;
    this.Gl = Gl | 0;
    this.Hh = Hh | 0;
    this.Hl = Hl | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4) {
      SHA512_W_H[i] = view.getUint32(offset);
      SHA512_W_L[i] = view.getUint32(offset += 4);
    }
    for (let i = 16; i < 80; i++) {
      const W15h = SHA512_W_H[i - 15] | 0;
      const W15l = SHA512_W_L[i - 15] | 0;
      const s0h = u64.rotrSH(W15h, W15l, 1) ^ u64.rotrSH(W15h, W15l, 8) ^ u64.shrSH(W15h, W15l, 7);
      const s0l = u64.rotrSL(W15h, W15l, 1) ^ u64.rotrSL(W15h, W15l, 8) ^ u64.shrSL(W15h, W15l, 7);
      const W2h = SHA512_W_H[i - 2] | 0;
      const W2l = SHA512_W_L[i - 2] | 0;
      const s1h = u64.rotrSH(W2h, W2l, 19) ^ u64.rotrBH(W2h, W2l, 61) ^ u64.shrSH(W2h, W2l, 6);
      const s1l = u64.rotrSL(W2h, W2l, 19) ^ u64.rotrBL(W2h, W2l, 61) ^ u64.shrSL(W2h, W2l, 6);
      const SUMl = u64.add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
      const SUMh = u64.add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
      SHA512_W_H[i] = SUMh | 0;
      SHA512_W_L[i] = SUMl | 0;
    }
    let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    for (let i = 0; i < 80; i++) {
      const sigma1h = u64.rotrSH(Eh, El, 14) ^ u64.rotrSH(Eh, El, 18) ^ u64.rotrBH(Eh, El, 41);
      const sigma1l = u64.rotrSL(Eh, El, 14) ^ u64.rotrSL(Eh, El, 18) ^ u64.rotrBL(Eh, El, 41);
      const CHIh = Eh & Fh ^ ~Eh & Gh;
      const CHIl = El & Fl ^ ~El & Gl;
      const T1ll = u64.add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
      const T1h = u64.add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
      const T1l = T1ll | 0;
      const sigma0h = u64.rotrSH(Ah, Al, 28) ^ u64.rotrBH(Ah, Al, 34) ^ u64.rotrBH(Ah, Al, 39);
      const sigma0l = u64.rotrSL(Ah, Al, 28) ^ u64.rotrBL(Ah, Al, 34) ^ u64.rotrBL(Ah, Al, 39);
      const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
      const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
      Hh = Gh | 0;
      Hl = Gl | 0;
      Gh = Fh | 0;
      Gl = Fl | 0;
      Fh = Eh | 0;
      Fl = El | 0;
      ({ h: Eh, l: El } = u64.add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
      Dh = Ch | 0;
      Dl = Cl | 0;
      Ch = Bh | 0;
      Cl = Bl | 0;
      Bh = Ah | 0;
      Bl = Al | 0;
      const All = u64.add3L(T1l, sigma0l, MAJl);
      Ah = u64.add3H(All, T1h, sigma0h, MAJh);
      Al = All | 0;
    }
    ({ h: Ah, l: Al } = u64.add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
    ({ h: Bh, l: Bl } = u64.add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
    ({ h: Ch, l: Cl } = u64.add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
    ({ h: Dh, l: Dl } = u64.add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
    ({ h: Eh, l: El } = u64.add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
    ({ h: Fh, l: Fl } = u64.add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
    ({ h: Gh, l: Gl } = u64.add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
    ({ h: Hh, l: Hl } = u64.add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
    this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
  }
  roundClean() {
    (0, utils_ts_1$1.clean)(SHA512_W_H, SHA512_W_L);
  }
  destroy() {
    (0, utils_ts_1$1.clean)(this.buffer);
    this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
sha2.SHA512 = SHA512;
class SHA384 extends SHA512 {
  constructor() {
    super(48);
    this.Ah = _md_ts_1.SHA384_IV[0] | 0;
    this.Al = _md_ts_1.SHA384_IV[1] | 0;
    this.Bh = _md_ts_1.SHA384_IV[2] | 0;
    this.Bl = _md_ts_1.SHA384_IV[3] | 0;
    this.Ch = _md_ts_1.SHA384_IV[4] | 0;
    this.Cl = _md_ts_1.SHA384_IV[5] | 0;
    this.Dh = _md_ts_1.SHA384_IV[6] | 0;
    this.Dl = _md_ts_1.SHA384_IV[7] | 0;
    this.Eh = _md_ts_1.SHA384_IV[8] | 0;
    this.El = _md_ts_1.SHA384_IV[9] | 0;
    this.Fh = _md_ts_1.SHA384_IV[10] | 0;
    this.Fl = _md_ts_1.SHA384_IV[11] | 0;
    this.Gh = _md_ts_1.SHA384_IV[12] | 0;
    this.Gl = _md_ts_1.SHA384_IV[13] | 0;
    this.Hh = _md_ts_1.SHA384_IV[14] | 0;
    this.Hl = _md_ts_1.SHA384_IV[15] | 0;
  }
}
sha2.SHA384 = SHA384;
const T224_IV = /* @__PURE__ */ Uint32Array.from([
  2352822216,
  424955298,
  1944164710,
  2312950998,
  502970286,
  855612546,
  1738396948,
  1479516111,
  258812777,
  2077511080,
  2011393907,
  79989058,
  1067287976,
  1780299464,
  286451373,
  2446758561
]);
const T256_IV = /* @__PURE__ */ Uint32Array.from([
  573645204,
  4230739756,
  2673172387,
  3360449730,
  596883563,
  1867755857,
  2520282905,
  1497426621,
  2519219938,
  2827943907,
  3193839141,
  1401305490,
  721525244,
  746961066,
  246885852,
  2177182882
]);
class SHA512_224 extends SHA512 {
  constructor() {
    super(28);
    this.Ah = T224_IV[0] | 0;
    this.Al = T224_IV[1] | 0;
    this.Bh = T224_IV[2] | 0;
    this.Bl = T224_IV[3] | 0;
    this.Ch = T224_IV[4] | 0;
    this.Cl = T224_IV[5] | 0;
    this.Dh = T224_IV[6] | 0;
    this.Dl = T224_IV[7] | 0;
    this.Eh = T224_IV[8] | 0;
    this.El = T224_IV[9] | 0;
    this.Fh = T224_IV[10] | 0;
    this.Fl = T224_IV[11] | 0;
    this.Gh = T224_IV[12] | 0;
    this.Gl = T224_IV[13] | 0;
    this.Hh = T224_IV[14] | 0;
    this.Hl = T224_IV[15] | 0;
  }
}
sha2.SHA512_224 = SHA512_224;
class SHA512_256 extends SHA512 {
  constructor() {
    super(32);
    this.Ah = T256_IV[0] | 0;
    this.Al = T256_IV[1] | 0;
    this.Bh = T256_IV[2] | 0;
    this.Bl = T256_IV[3] | 0;
    this.Ch = T256_IV[4] | 0;
    this.Cl = T256_IV[5] | 0;
    this.Dh = T256_IV[6] | 0;
    this.Dl = T256_IV[7] | 0;
    this.Eh = T256_IV[8] | 0;
    this.El = T256_IV[9] | 0;
    this.Fh = T256_IV[10] | 0;
    this.Fl = T256_IV[11] | 0;
    this.Gh = T256_IV[12] | 0;
    this.Gl = T256_IV[13] | 0;
    this.Hh = T256_IV[14] | 0;
    this.Hl = T256_IV[15] | 0;
  }
}
sha2.SHA512_256 = SHA512_256;
sha2.sha256 = (0, utils_ts_1$1.createHasher)(() => new SHA256());
sha2.sha224 = (0, utils_ts_1$1.createHasher)(() => new SHA224());
sha2.sha512 = (0, utils_ts_1$1.createHasher)(() => new SHA512());
sha2.sha384 = (0, utils_ts_1$1.createHasher)(() => new SHA384());
sha2.sha512_256 = (0, utils_ts_1$1.createHasher)(() => new SHA512_256());
sha2.sha512_224 = (0, utils_ts_1$1.createHasher)(() => new SHA512_224());
Object.defineProperty(sha256, "__esModule", { value: true });
sha256.sha224 = sha256.SHA224 = sha256.sha256 = sha256.SHA256 = void 0;
const sha2_ts_1$1 = sha2;
sha256.SHA256 = sha2_ts_1$1.SHA256;
sha256.sha256 = sha2_ts_1$1.sha256;
sha256.SHA224 = sha2_ts_1$1.SHA224;
sha256.sha224 = sha2_ts_1$1.sha224;
var sha512 = {};
Object.defineProperty(sha512, "__esModule", { value: true });
sha512.sha512_256 = sha512.SHA512_256 = sha512.sha512_224 = sha512.SHA512_224 = sha512.sha384 = sha512.SHA384 = sha512.sha512 = sha512.SHA512 = void 0;
const sha2_ts_1 = sha2;
sha512.SHA512 = sha2_ts_1.SHA512;
sha512.sha512 = sha2_ts_1.sha512;
sha512.SHA384 = sha2_ts_1.SHA384;
sha512.sha384 = sha2_ts_1.sha384;
sha512.SHA512_224 = sha2_ts_1.SHA512_224;
sha512.sha512_224 = sha2_ts_1.sha512_224;
sha512.SHA512_256 = sha2_ts_1.SHA512_256;
sha512.sha512_256 = sha2_ts_1.sha512_256;
var pbkdf2$1 = {};
var hmac = {};
(function(exports$1) {
  Object.defineProperty(exports$1, "__esModule", { value: true });
  exports$1.hmac = exports$1.HMAC = void 0;
  const utils_ts_12 = utils$1;
  class HMAC extends utils_ts_12.Hash {
    constructor(hash, _key) {
      super();
      this.finished = false;
      this.destroyed = false;
      (0, utils_ts_12.ahash)(hash);
      const key = (0, utils_ts_12.toBytes)(_key);
      this.iHash = hash.create();
      if (typeof this.iHash.update !== "function")
        throw new Error("Expected instance of class which extends utils.Hash");
      this.blockLen = this.iHash.blockLen;
      this.outputLen = this.iHash.outputLen;
      const blockLen = this.blockLen;
      const pad = new Uint8Array(blockLen);
      pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54;
      this.iHash.update(pad);
      this.oHash = hash.create();
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54 ^ 92;
      this.oHash.update(pad);
      (0, utils_ts_12.clean)(pad);
    }
    update(buf) {
      (0, utils_ts_12.aexists)(this);
      this.iHash.update(buf);
      return this;
    }
    digestInto(out) {
      (0, utils_ts_12.aexists)(this);
      (0, utils_ts_12.abytes)(out, this.outputLen);
      this.finished = true;
      this.iHash.digestInto(out);
      this.oHash.update(out);
      this.oHash.digestInto(out);
      this.destroy();
    }
    digest() {
      const out = new Uint8Array(this.oHash.outputLen);
      this.digestInto(out);
      return out;
    }
    _cloneInto(to) {
      to || (to = Object.create(Object.getPrototypeOf(this), {}));
      const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
      to = to;
      to.finished = finished;
      to.destroyed = destroyed;
      to.blockLen = blockLen;
      to.outputLen = outputLen;
      to.oHash = oHash._cloneInto(to.oHash);
      to.iHash = iHash._cloneInto(to.iHash);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
    destroy() {
      this.destroyed = true;
      this.oHash.destroy();
      this.iHash.destroy();
    }
  }
  exports$1.HMAC = HMAC;
  const hmac2 = (hash, key, message) => new HMAC(hash, key).update(message).digest();
  exports$1.hmac = hmac2;
  exports$1.hmac.create = (hash, key) => new HMAC(hash, key);
})(hmac);
Object.defineProperty(pbkdf2$1, "__esModule", { value: true });
pbkdf2$1.pbkdf2 = pbkdf2;
pbkdf2$1.pbkdf2Async = pbkdf2Async;
const hmac_ts_1 = hmac;
const utils_ts_1 = utils$1;
function pbkdf2Init(hash, _password, _salt, _opts) {
  (0, utils_ts_1.ahash)(hash);
  const opts = (0, utils_ts_1.checkOpts)({ dkLen: 32, asyncTick: 10 }, _opts);
  const { c, dkLen, asyncTick } = opts;
  (0, utils_ts_1.anumber)(c);
  (0, utils_ts_1.anumber)(dkLen);
  (0, utils_ts_1.anumber)(asyncTick);
  if (c < 1)
    throw new Error("iterations (c) should be >= 1");
  const password = (0, utils_ts_1.kdfInputToBytes)(_password);
  const salt2 = (0, utils_ts_1.kdfInputToBytes)(_salt);
  const DK = new Uint8Array(dkLen);
  const PRF = hmac_ts_1.hmac.create(hash, password);
  const PRFSalt = PRF._cloneInto().update(salt2);
  return { c, dkLen, asyncTick, DK, PRF, PRFSalt };
}
function pbkdf2Output(PRF, PRFSalt, DK, prfW, u) {
  PRF.destroy();
  PRFSalt.destroy();
  if (prfW)
    prfW.destroy();
  (0, utils_ts_1.clean)(u);
  return DK;
}
function pbkdf2(hash, password, salt2, opts) {
  const { c, dkLen, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt2, opts);
  let prfW;
  const arr = new Uint8Array(4);
  const view = (0, utils_ts_1.createView)(arr);
  const u = new Uint8Array(PRF.outputLen);
  for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
    const Ti = DK.subarray(pos, pos + PRF.outputLen);
    view.setInt32(0, ti, false);
    (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
    Ti.set(u.subarray(0, Ti.length));
    for (let ui = 1; ui < c; ui++) {
      PRF._cloneInto(prfW).update(u).digestInto(u);
      for (let i = 0; i < Ti.length; i++)
        Ti[i] ^= u[i];
    }
  }
  return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
}
async function pbkdf2Async(hash, password, salt2, opts) {
  const { c, dkLen, asyncTick, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt2, opts);
  let prfW;
  const arr = new Uint8Array(4);
  const view = (0, utils_ts_1.createView)(arr);
  const u = new Uint8Array(PRF.outputLen);
  for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
    const Ti = DK.subarray(pos, pos + PRF.outputLen);
    view.setInt32(0, ti, false);
    (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
    Ti.set(u.subarray(0, Ti.length));
    await (0, utils_ts_1.asyncLoop)(c - 1, asyncTick, () => {
      PRF._cloneInto(prfW).update(u).digestInto(u);
      for (let i = 0; i < Ti.length; i++)
        Ti[i] ^= u[i];
    });
  }
  return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
}
var _wordlists = {};
const require$$0 = [
  "abdikace",
  "abeceda",
  "adresa",
  "agrese",
  "akce",
  "aktovka",
  "alej",
  "alkohol",
  "amputace",
  "ananas",
  "andulka",
  "anekdota",
  "anketa",
  "antika",
  "anulovat",
  "archa",
  "arogance",
  "asfalt",
  "asistent",
  "aspirace",
  "astma",
  "astronom",
  "atlas",
  "atletika",
  "atol",
  "autobus",
  "azyl",
  "babka",
  "bachor",
  "bacil",
  "baculka",
  "badatel",
  "bageta",
  "bagr",
  "bahno",
  "bakterie",
  "balada",
  "baletka",
  "balkon",
  "balonek",
  "balvan",
  "balza",
  "bambus",
  "bankomat",
  "barbar",
  "baret",
  "barman",
  "baroko",
  "barva",
  "baterka",
  "batoh",
  "bavlna",
  "bazalka",
  "bazilika",
  "bazuka",
  "bedna",
  "beran",
  "beseda",
  "bestie",
  "beton",
  "bezinka",
  "bezmoc",
  "beztak",
  "bicykl",
  "bidlo",
  "biftek",
  "bikiny",
  "bilance",
  "biograf",
  "biolog",
  "bitva",
  "bizon",
  "blahobyt",
  "blatouch",
  "blecha",
  "bledule",
  "blesk",
  "blikat",
  "blizna",
  "blokovat",
  "bloudit",
  "blud",
  "bobek",
  "bobr",
  "bodlina",
  "bodnout",
  "bohatost",
  "bojkot",
  "bojovat",
  "bokorys",
  "bolest",
  "borec",
  "borovice",
  "bota",
  "boubel",
  "bouchat",
  "bouda",
  "boule",
  "bourat",
  "boxer",
  "bradavka",
  "brambora",
  "branka",
  "bratr",
  "brepta",
  "briketa",
  "brko",
  "brloh",
  "bronz",
  "broskev",
  "brunetka",
  "brusinka",
  "brzda",
  "brzy",
  "bublina",
  "bubnovat",
  "buchta",
  "buditel",
  "budka",
  "budova",
  "bufet",
  "bujarost",
  "bukvice",
  "buldok",
  "bulva",
  "bunda",
  "bunkr",
  "burza",
  "butik",
  "buvol",
  "buzola",
  "bydlet",
  "bylina",
  "bytovka",
  "bzukot",
  "capart",
  "carevna",
  "cedr",
  "cedule",
  "cejch",
  "cejn",
  "cela",
  "celer",
  "celkem",
  "celnice",
  "cenina",
  "cennost",
  "cenovka",
  "centrum",
  "cenzor",
  "cestopis",
  "cetka",
  "chalupa",
  "chapadlo",
  "charita",
  "chata",
  "chechtat",
  "chemie",
  "chichot",
  "chirurg",
  "chlad",
  "chleba",
  "chlubit",
  "chmel",
  "chmura",
  "chobot",
  "chochol",
  "chodba",
  "cholera",
  "chomout",
  "chopit",
  "choroba",
  "chov",
  "chrapot",
  "chrlit",
  "chrt",
  "chrup",
  "chtivost",
  "chudina",
  "chutnat",
  "chvat",
  "chvilka",
  "chvost",
  "chyba",
  "chystat",
  "chytit",
  "cibule",
  "cigareta",
  "cihelna",
  "cihla",
  "cinkot",
  "cirkus",
  "cisterna",
  "citace",
  "citrus",
  "cizinec",
  "cizost",
  "clona",
  "cokoliv",
  "couvat",
  "ctitel",
  "ctnost",
  "cudnost",
  "cuketa",
  "cukr",
  "cupot",
  "cvaknout",
  "cval",
  "cvik",
  "cvrkot",
  "cyklista",
  "daleko",
  "dareba",
  "datel",
  "datum",
  "dcera",
  "debata",
  "dechovka",
  "decibel",
  "deficit",
  "deflace",
  "dekl",
  "dekret",
  "demokrat",
  "deprese",
  "derby",
  "deska",
  "detektiv",
  "dikobraz",
  "diktovat",
  "dioda",
  "diplom",
  "disk",
  "displej",
  "divadlo",
  "divoch",
  "dlaha",
  "dlouho",
  "dluhopis",
  "dnes",
  "dobro",
  "dobytek",
  "docent",
  "dochutit",
  "dodnes",
  "dohled",
  "dohoda",
  "dohra",
  "dojem",
  "dojnice",
  "doklad",
  "dokola",
  "doktor",
  "dokument",
  "dolar",
  "doleva",
  "dolina",
  "doma",
  "dominant",
  "domluvit",
  "domov",
  "donutit",
  "dopad",
  "dopis",
  "doplnit",
  "doposud",
  "doprovod",
  "dopustit",
  "dorazit",
  "dorost",
  "dort",
  "dosah",
  "doslov",
  "dostatek",
  "dosud",
  "dosyta",
  "dotaz",
  "dotek",
  "dotknout",
  "doufat",
  "doutnat",
  "dovozce",
  "dozadu",
  "doznat",
  "dozorce",
  "drahota",
  "drak",
  "dramatik",
  "dravec",
  "draze",
  "drdol",
  "drobnost",
  "drogerie",
  "drozd",
  "drsnost",
  "drtit",
  "drzost",
  "duben",
  "duchovno",
  "dudek",
  "duha",
  "duhovka",
  "dusit",
  "dusno",
  "dutost",
  "dvojice",
  "dvorec",
  "dynamit",
  "ekolog",
  "ekonomie",
  "elektron",
  "elipsa",
  "email",
  "emise",
  "emoce",
  "empatie",
  "epizoda",
  "epocha",
  "epopej",
  "epos",
  "esej",
  "esence",
  "eskorta",
  "eskymo",
  "etiketa",
  "euforie",
  "evoluce",
  "exekuce",
  "exkurze",
  "expedice",
  "exploze",
  "export",
  "extrakt",
  "facka",
  "fajfka",
  "fakulta",
  "fanatik",
  "fantazie",
  "farmacie",
  "favorit",
  "fazole",
  "federace",
  "fejeton",
  "fenka",
  "fialka",
  "figurant",
  "filozof",
  "filtr",
  "finance",
  "finta",
  "fixace",
  "fjord",
  "flanel",
  "flirt",
  "flotila",
  "fond",
  "fosfor",
  "fotbal",
  "fotka",
  "foton",
  "frakce",
  "freska",
  "fronta",
  "fukar",
  "funkce",
  "fyzika",
  "galeje",
  "garant",
  "genetika",
  "geolog",
  "gilotina",
  "glazura",
  "glejt",
  "golem",
  "golfista",
  "gotika",
  "graf",
  "gramofon",
  "granule",
  "grep",
  "gril",
  "grog",
  "groteska",
  "guma",
  "hadice",
  "hadr",
  "hala",
  "halenka",
  "hanba",
  "hanopis",
  "harfa",
  "harpuna",
  "havran",
  "hebkost",
  "hejkal",
  "hejno",
  "hejtman",
  "hektar",
  "helma",
  "hematom",
  "herec",
  "herna",
  "heslo",
  "hezky",
  "historik",
  "hladovka",
  "hlasivky",
  "hlava",
  "hledat",
  "hlen",
  "hlodavec",
  "hloh",
  "hloupost",
  "hltat",
  "hlubina",
  "hluchota",
  "hmat",
  "hmota",
  "hmyz",
  "hnis",
  "hnojivo",
  "hnout",
  "hoblina",
  "hoboj",
  "hoch",
  "hodiny",
  "hodlat",
  "hodnota",
  "hodovat",
  "hojnost",
  "hokej",
  "holinka",
  "holka",
  "holub",
  "homole",
  "honitba",
  "honorace",
  "horal",
  "horda",
  "horizont",
  "horko",
  "horlivec",
  "hormon",
  "hornina",
  "horoskop",
  "horstvo",
  "hospoda",
  "hostina",
  "hotovost",
  "houba",
  "houf",
  "houpat",
  "houska",
  "hovor",
  "hradba",
  "hranice",
  "hravost",
  "hrazda",
  "hrbolek",
  "hrdina",
  "hrdlo",
  "hrdost",
  "hrnek",
  "hrobka",
  "hromada",
  "hrot",
  "hrouda",
  "hrozen",
  "hrstka",
  "hrubost",
  "hryzat",
  "hubenost",
  "hubnout",
  "hudba",
  "hukot",
  "humr",
  "husita",
  "hustota",
  "hvozd",
  "hybnost",
  "hydrant",
  "hygiena",
  "hymna",
  "hysterik",
  "idylka",
  "ihned",
  "ikona",
  "iluze",
  "imunita",
  "infekce",
  "inflace",
  "inkaso",
  "inovace",
  "inspekce",
  "internet",
  "invalida",
  "investor",
  "inzerce",
  "ironie",
  "jablko",
  "jachta",
  "jahoda",
  "jakmile",
  "jakost",
  "jalovec",
  "jantar",
  "jarmark",
  "jaro",
  "jasan",
  "jasno",
  "jatka",
  "javor",
  "jazyk",
  "jedinec",
  "jedle",
  "jednatel",
  "jehlan",
  "jekot",
  "jelen",
  "jelito",
  "jemnost",
  "jenom",
  "jepice",
  "jeseter",
  "jevit",
  "jezdec",
  "jezero",
  "jinak",
  "jindy",
  "jinoch",
  "jiskra",
  "jistota",
  "jitrnice",
  "jizva",
  "jmenovat",
  "jogurt",
  "jurta",
  "kabaret",
  "kabel",
  "kabinet",
  "kachna",
  "kadet",
  "kadidlo",
  "kahan",
  "kajak",
  "kajuta",
  "kakao",
  "kaktus",
  "kalamita",
  "kalhoty",
  "kalibr",
  "kalnost",
  "kamera",
  "kamkoliv",
  "kamna",
  "kanibal",
  "kanoe",
  "kantor",
  "kapalina",
  "kapela",
  "kapitola",
  "kapka",
  "kaple",
  "kapota",
  "kapr",
  "kapusta",
  "kapybara",
  "karamel",
  "karotka",
  "karton",
  "kasa",
  "katalog",
  "katedra",
  "kauce",
  "kauza",
  "kavalec",
  "kazajka",
  "kazeta",
  "kazivost",
  "kdekoliv",
  "kdesi",
  "kedluben",
  "kemp",
  "keramika",
  "kino",
  "klacek",
  "kladivo",
  "klam",
  "klapot",
  "klasika",
  "klaun",
  "klec",
  "klenba",
  "klepat",
  "klesnout",
  "klid",
  "klima",
  "klisna",
  "klobouk",
  "klokan",
  "klopa",
  "kloub",
  "klubovna",
  "klusat",
  "kluzkost",
  "kmen",
  "kmitat",
  "kmotr",
  "kniha",
  "knot",
  "koalice",
  "koberec",
  "kobka",
  "kobliha",
  "kobyla",
  "kocour",
  "kohout",
  "kojenec",
  "kokos",
  "koktejl",
  "kolaps",
  "koleda",
  "kolize",
  "kolo",
  "komando",
  "kometa",
  "komik",
  "komnata",
  "komora",
  "kompas",
  "komunita",
  "konat",
  "koncept",
  "kondice",
  "konec",
  "konfese",
  "kongres",
  "konina",
  "konkurs",
  "kontakt",
  "konzerva",
  "kopanec",
  "kopie",
  "kopnout",
  "koprovka",
  "korbel",
  "korektor",
  "kormidlo",
  "koroptev",
  "korpus",
  "koruna",
  "koryto",
  "korzet",
  "kosatec",
  "kostka",
  "kotel",
  "kotleta",
  "kotoul",
  "koukat",
  "koupelna",
  "kousek",
  "kouzlo",
  "kovboj",
  "koza",
  "kozoroh",
  "krabice",
  "krach",
  "krajina",
  "kralovat",
  "krasopis",
  "kravata",
  "kredit",
  "krejcar",
  "kresba",
  "kreveta",
  "kriket",
  "kritik",
  "krize",
  "krkavec",
  "krmelec",
  "krmivo",
  "krocan",
  "krok",
  "kronika",
  "kropit",
  "kroupa",
  "krovka",
  "krtek",
  "kruhadlo",
  "krupice",
  "krutost",
  "krvinka",
  "krychle",
  "krypta",
  "krystal",
  "kryt",
  "kudlanka",
  "kufr",
  "kujnost",
  "kukla",
  "kulajda",
  "kulich",
  "kulka",
  "kulomet",
  "kultura",
  "kuna",
  "kupodivu",
  "kurt",
  "kurzor",
  "kutil",
  "kvalita",
  "kvasinka",
  "kvestor",
  "kynolog",
  "kyselina",
  "kytara",
  "kytice",
  "kytka",
  "kytovec",
  "kyvadlo",
  "labrador",
  "lachtan",
  "ladnost",
  "laik",
  "lakomec",
  "lamela",
  "lampa",
  "lanovka",
  "lasice",
  "laso",
  "lastura",
  "latinka",
  "lavina",
  "lebka",
  "leckdy",
  "leden",
  "lednice",
  "ledovka",
  "ledvina",
  "legenda",
  "legie",
  "legrace",
  "lehce",
  "lehkost",
  "lehnout",
  "lektvar",
  "lenochod",
  "lentilka",
  "lepenka",
  "lepidlo",
  "letadlo",
  "letec",
  "letmo",
  "letokruh",
  "levhart",
  "levitace",
  "levobok",
  "libra",
  "lichotka",
  "lidojed",
  "lidskost",
  "lihovina",
  "lijavec",
  "lilek",
  "limetka",
  "linie",
  "linka",
  "linoleum",
  "listopad",
  "litina",
  "litovat",
  "lobista",
  "lodivod",
  "logika",
  "logoped",
  "lokalita",
  "loket",
  "lomcovat",
  "lopata",
  "lopuch",
  "lord",
  "losos",
  "lotr",
  "loudal",
  "louh",
  "louka",
  "louskat",
  "lovec",
  "lstivost",
  "lucerna",
  "lucifer",
  "lump",
  "lusk",
  "lustrace",
  "lvice",
  "lyra",
  "lyrika",
  "lysina",
  "madam",
  "madlo",
  "magistr",
  "mahagon",
  "majetek",
  "majitel",
  "majorita",
  "makak",
  "makovice",
  "makrela",
  "malba",
  "malina",
  "malovat",
  "malvice",
  "maminka",
  "mandle",
  "manko",
  "marnost",
  "masakr",
  "maskot",
  "masopust",
  "matice",
  "matrika",
  "maturita",
  "mazanec",
  "mazivo",
  "mazlit",
  "mazurka",
  "mdloba",
  "mechanik",
  "meditace",
  "medovina",
  "melasa",
  "meloun",
  "mentolka",
  "metla",
  "metoda",
  "metr",
  "mezera",
  "migrace",
  "mihnout",
  "mihule",
  "mikina",
  "mikrofon",
  "milenec",
  "milimetr",
  "milost",
  "mimika",
  "mincovna",
  "minibar",
  "minomet",
  "minulost",
  "miska",
  "mistr",
  "mixovat",
  "mladost",
  "mlha",
  "mlhovina",
  "mlok",
  "mlsat",
  "mluvit",
  "mnich",
  "mnohem",
  "mobil",
  "mocnost",
  "modelka",
  "modlitba",
  "mohyla",
  "mokro",
  "molekula",
  "momentka",
  "monarcha",
  "monokl",
  "monstrum",
  "montovat",
  "monzun",
  "mosaz",
  "moskyt",
  "most",
  "motivace",
  "motorka",
  "motyka",
  "moucha",
  "moudrost",
  "mozaika",
  "mozek",
  "mozol",
  "mramor",
  "mravenec",
  "mrkev",
  "mrtvola",
  "mrzet",
  "mrzutost",
  "mstitel",
  "mudrc",
  "muflon",
  "mulat",
  "mumie",
  "munice",
  "muset",
  "mutace",
  "muzeum",
  "muzikant",
  "myslivec",
  "mzda",
  "nabourat",
  "nachytat",
  "nadace",
  "nadbytek",
  "nadhoz",
  "nadobro",
  "nadpis",
  "nahlas",
  "nahnat",
  "nahodile",
  "nahradit",
  "naivita",
  "najednou",
  "najisto",
  "najmout",
  "naklonit",
  "nakonec",
  "nakrmit",
  "nalevo",
  "namazat",
  "namluvit",
  "nanometr",
  "naoko",
  "naopak",
  "naostro",
  "napadat",
  "napevno",
  "naplnit",
  "napnout",
  "naposled",
  "naprosto",
  "narodit",
  "naruby",
  "narychlo",
  "nasadit",
  "nasekat",
  "naslepo",
  "nastat",
  "natolik",
  "navenek",
  "navrch",
  "navzdory",
  "nazvat",
  "nebe",
  "nechat",
  "necky",
  "nedaleko",
  "nedbat",
  "neduh",
  "negace",
  "nehet",
  "nehoda",
  "nejen",
  "nejprve",
  "neklid",
  "nelibost",
  "nemilost",
  "nemoc",
  "neochota",
  "neonka",
  "nepokoj",
  "nerost",
  "nerv",
  "nesmysl",
  "nesoulad",
  "netvor",
  "neuron",
  "nevina",
  "nezvykle",
  "nicota",
  "nijak",
  "nikam",
  "nikdy",
  "nikl",
  "nikterak",
  "nitro",
  "nocleh",
  "nohavice",
  "nominace",
  "nora",
  "norek",
  "nositel",
  "nosnost",
  "nouze",
  "noviny",
  "novota",
  "nozdra",
  "nuda",
  "nudle",
  "nuget",
  "nutit",
  "nutnost",
  "nutrie",
  "nymfa",
  "obal",
  "obarvit",
  "obava",
  "obdiv",
  "obec",
  "obehnat",
  "obejmout",
  "obezita",
  "obhajoba",
  "obilnice",
  "objasnit",
  "objekt",
  "obklopit",
  "oblast",
  "oblek",
  "obliba",
  "obloha",
  "obluda",
  "obnos",
  "obohatit",
  "obojek",
  "obout",
  "obrazec",
  "obrna",
  "obruba",
  "obrys",
  "obsah",
  "obsluha",
  "obstarat",
  "obuv",
  "obvaz",
  "obvinit",
  "obvod",
  "obvykle",
  "obyvatel",
  "obzor",
  "ocas",
  "ocel",
  "ocenit",
  "ochladit",
  "ochota",
  "ochrana",
  "ocitnout",
  "odboj",
  "odbyt",
  "odchod",
  "odcizit",
  "odebrat",
  "odeslat",
  "odevzdat",
  "odezva",
  "odhadce",
  "odhodit",
  "odjet",
  "odjinud",
  "odkaz",
  "odkoupit",
  "odliv",
  "odluka",
  "odmlka",
  "odolnost",
  "odpad",
  "odpis",
  "odplout",
  "odpor",
  "odpustit",
  "odpykat",
  "odrazka",
  "odsoudit",
  "odstup",
  "odsun",
  "odtok",
  "odtud",
  "odvaha",
  "odveta",
  "odvolat",
  "odvracet",
  "odznak",
  "ofina",
  "ofsajd",
  "ohlas",
  "ohnisko",
  "ohrada",
  "ohrozit",
  "ohryzek",
  "okap",
  "okenice",
  "oklika",
  "okno",
  "okouzlit",
  "okovy",
  "okrasa",
  "okres",
  "okrsek",
  "okruh",
  "okupant",
  "okurka",
  "okusit",
  "olejnina",
  "olizovat",
  "omak",
  "omeleta",
  "omezit",
  "omladina",
  "omlouvat",
  "omluva",
  "omyl",
  "onehdy",
  "opakovat",
  "opasek",
  "operace",
  "opice",
  "opilost",
  "opisovat",
  "opora",
  "opozice",
  "opravdu",
  "oproti",
  "orbital",
  "orchestr",
  "orgie",
  "orlice",
  "orloj",
  "ortel",
  "osada",
  "oschnout",
  "osika",
  "osivo",
  "oslava",
  "oslepit",
  "oslnit",
  "oslovit",
  "osnova",
  "osoba",
  "osolit",
  "ospalec",
  "osten",
  "ostraha",
  "ostuda",
  "ostych",
  "osvojit",
  "oteplit",
  "otisk",
  "otop",
  "otrhat",
  "otrlost",
  "otrok",
  "otruby",
  "otvor",
  "ovanout",
  "ovar",
  "oves",
  "ovlivnit",
  "ovoce",
  "oxid",
  "ozdoba",
  "pachatel",
  "pacient",
  "padouch",
  "pahorek",
  "pakt",
  "palanda",
  "palec",
  "palivo",
  "paluba",
  "pamflet",
  "pamlsek",
  "panenka",
  "panika",
  "panna",
  "panovat",
  "panstvo",
  "pantofle",
  "paprika",
  "parketa",
  "parodie",
  "parta",
  "paruka",
  "paryba",
  "paseka",
  "pasivita",
  "pastelka",
  "patent",
  "patrona",
  "pavouk",
  "pazneht",
  "pazourek",
  "pecka",
  "pedagog",
  "pejsek",
  "peklo",
  "peloton",
  "penalta",
  "pendrek",
  "penze",
  "periskop",
  "pero",
  "pestrost",
  "petarda",
  "petice",
  "petrolej",
  "pevnina",
  "pexeso",
  "pianista",
  "piha",
  "pijavice",
  "pikle",
  "piknik",
  "pilina",
  "pilnost",
  "pilulka",
  "pinzeta",
  "pipeta",
  "pisatel",
  "pistole",
  "pitevna",
  "pivnice",
  "pivovar",
  "placenta",
  "plakat",
  "plamen",
  "planeta",
  "plastika",
  "platit",
  "plavidlo",
  "plaz",
  "plech",
  "plemeno",
  "plenta",
  "ples",
  "pletivo",
  "plevel",
  "plivat",
  "plnit",
  "plno",
  "plocha",
  "plodina",
  "plomba",
  "plout",
  "pluk",
  "plyn",
  "pobavit",
  "pobyt",
  "pochod",
  "pocit",
  "poctivec",
  "podat",
  "podcenit",
  "podepsat",
  "podhled",
  "podivit",
  "podklad",
  "podmanit",
  "podnik",
  "podoba",
  "podpora",
  "podraz",
  "podstata",
  "podvod",
  "podzim",
  "poezie",
  "pohanka",
  "pohnutka",
  "pohovor",
  "pohroma",
  "pohyb",
  "pointa",
  "pojistka",
  "pojmout",
  "pokazit",
  "pokles",
  "pokoj",
  "pokrok",
  "pokuta",
  "pokyn",
  "poledne",
  "polibek",
  "polknout",
  "poloha",
  "polynom",
  "pomalu",
  "pominout",
  "pomlka",
  "pomoc",
  "pomsta",
  "pomyslet",
  "ponechat",
  "ponorka",
  "ponurost",
  "popadat",
  "popel",
  "popisek",
  "poplach",
  "poprosit",
  "popsat",
  "popud",
  "poradce",
  "porce",
  "porod",
  "porucha",
  "poryv",
  "posadit",
  "posed",
  "posila",
  "poskok",
  "poslanec",
  "posoudit",
  "pospolu",
  "postava",
  "posudek",
  "posyp",
  "potah",
  "potkan",
  "potlesk",
  "potomek",
  "potrava",
  "potupa",
  "potvora",
  "poukaz",
  "pouto",
  "pouzdro",
  "povaha",
  "povidla",
  "povlak",
  "povoz",
  "povrch",
  "povstat",
  "povyk",
  "povzdech",
  "pozdrav",
  "pozemek",
  "poznatek",
  "pozor",
  "pozvat",
  "pracovat",
  "prahory",
  "praktika",
  "prales",
  "praotec",
  "praporek",
  "prase",
  "pravda",
  "princip",
  "prkno",
  "probudit",
  "procento",
  "prodej",
  "profese",
  "prohra",
  "projekt",
  "prolomit",
  "promile",
  "pronikat",
  "propad",
  "prorok",
  "prosba",
  "proton",
  "proutek",
  "provaz",
  "prskavka",
  "prsten",
  "prudkost",
  "prut",
  "prvek",
  "prvohory",
  "psanec",
  "psovod",
  "pstruh",
  "ptactvo",
  "puberta",
  "puch",
  "pudl",
  "pukavec",
  "puklina",
  "pukrle",
  "pult",
  "pumpa",
  "punc",
  "pupen",
  "pusa",
  "pusinka",
  "pustina",
  "putovat",
  "putyka",
  "pyramida",
  "pysk",
  "pytel",
  "racek",
  "rachot",
  "radiace",
  "radnice",
  "radon",
  "raft",
  "ragby",
  "raketa",
  "rakovina",
  "rameno",
  "rampouch",
  "rande",
  "rarach",
  "rarita",
  "rasovna",
  "rastr",
  "ratolest",
  "razance",
  "razidlo",
  "reagovat",
  "reakce",
  "recept",
  "redaktor",
  "referent",
  "reflex",
  "rejnok",
  "reklama",
  "rekord",
  "rekrut",
  "rektor",
  "reputace",
  "revize",
  "revma",
  "revolver",
  "rezerva",
  "riskovat",
  "riziko",
  "robotika",
  "rodokmen",
  "rohovka",
  "rokle",
  "rokoko",
  "romaneto",
  "ropovod",
  "ropucha",
  "rorejs",
  "rosol",
  "rostlina",
  "rotmistr",
  "rotoped",
  "rotunda",
  "roubenka",
  "roucho",
  "roup",
  "roura",
  "rovina",
  "rovnice",
  "rozbor",
  "rozchod",
  "rozdat",
  "rozeznat",
  "rozhodce",
  "rozinka",
  "rozjezd",
  "rozkaz",
  "rozloha",
  "rozmar",
  "rozpad",
  "rozruch",
  "rozsah",
  "roztok",
  "rozum",
  "rozvod",
  "rubrika",
  "ruchadlo",
  "rukavice",
  "rukopis",
  "ryba",
  "rybolov",
  "rychlost",
  "rydlo",
  "rypadlo",
  "rytina",
  "ryzost",
  "sadista",
  "sahat",
  "sako",
  "samec",
  "samizdat",
  "samota",
  "sanitka",
  "sardinka",
  "sasanka",
  "satelit",
  "sazba",
  "sazenice",
  "sbor",
  "schovat",
  "sebranka",
  "secese",
  "sedadlo",
  "sediment",
  "sedlo",
  "sehnat",
  "sejmout",
  "sekera",
  "sekta",
  "sekunda",
  "sekvoje",
  "semeno",
  "seno",
  "servis",
  "sesadit",
  "seshora",
  "seskok",
  "seslat",
  "sestra",
  "sesuv",
  "sesypat",
  "setba",
  "setina",
  "setkat",
  "setnout",
  "setrvat",
  "sever",
  "seznam",
  "shoda",
  "shrnout",
  "sifon",
  "silnice",
  "sirka",
  "sirotek",
  "sirup",
  "situace",
  "skafandr",
  "skalisko",
  "skanzen",
  "skaut",
  "skeptik",
  "skica",
  "skladba",
  "sklenice",
  "sklo",
  "skluz",
  "skoba",
  "skokan",
  "skoro",
  "skripta",
  "skrz",
  "skupina",
  "skvost",
  "skvrna",
  "slabika",
  "sladidlo",
  "slanina",
  "slast",
  "slavnost",
  "sledovat",
  "slepec",
  "sleva",
  "slezina",
  "slib",
  "slina",
  "sliznice",
  "slon",
  "sloupek",
  "slovo",
  "sluch",
  "sluha",
  "slunce",
  "slupka",
  "slza",
  "smaragd",
  "smetana",
  "smilstvo",
  "smlouva",
  "smog",
  "smrad",
  "smrk",
  "smrtka",
  "smutek",
  "smysl",
  "snad",
  "snaha",
  "snob",
  "sobota",
  "socha",
  "sodovka",
  "sokol",
  "sopka",
  "sotva",
  "souboj",
  "soucit",
  "soudce",
  "souhlas",
  "soulad",
  "soumrak",
  "souprava",
  "soused",
  "soutok",
  "souviset",
  "spalovna",
  "spasitel",
  "spis",
  "splav",
  "spodek",
  "spojenec",
  "spolu",
  "sponzor",
  "spornost",
  "spousta",
  "sprcha",
  "spustit",
  "sranda",
  "sraz",
  "srdce",
  "srna",
  "srnec",
  "srovnat",
  "srpen",
  "srst",
  "srub",
  "stanice",
  "starosta",
  "statika",
  "stavba",
  "stehno",
  "stezka",
  "stodola",
  "stolek",
  "stopa",
  "storno",
  "stoupat",
  "strach",
  "stres",
  "strhnout",
  "strom",
  "struna",
  "studna",
  "stupnice",
  "stvol",
  "styk",
  "subjekt",
  "subtropy",
  "suchar",
  "sudost",
  "sukno",
  "sundat",
  "sunout",
  "surikata",
  "surovina",
  "svah",
  "svalstvo",
  "svetr",
  "svatba",
  "svazek",
  "svisle",
  "svitek",
  "svoboda",
  "svodidlo",
  "svorka",
  "svrab",
  "sykavka",
  "sykot",
  "synek",
  "synovec",
  "sypat",
  "sypkost",
  "syrovost",
  "sysel",
  "sytost",
  "tabletka",
  "tabule",
  "tahoun",
  "tajemno",
  "tajfun",
  "tajga",
  "tajit",
  "tajnost",
  "taktika",
  "tamhle",
  "tampon",
  "tancovat",
  "tanec",
  "tanker",
  "tapeta",
  "tavenina",
  "tazatel",
  "technika",
  "tehdy",
  "tekutina",
  "telefon",
  "temnota",
  "tendence",
  "tenista",
  "tenor",
  "teplota",
  "tepna",
  "teprve",
  "terapie",
  "termoska",
  "textil",
  "ticho",
  "tiskopis",
  "titulek",
  "tkadlec",
  "tkanina",
  "tlapka",
  "tleskat",
  "tlukot",
  "tlupa",
  "tmel",
  "toaleta",
  "topinka",
  "topol",
  "torzo",
  "touha",
  "toulec",
  "tradice",
  "traktor",
  "tramp",
  "trasa",
  "traverza",
  "trefit",
  "trest",
  "trezor",
  "trhavina",
  "trhlina",
  "trochu",
  "trojice",
  "troska",
  "trouba",
  "trpce",
  "trpitel",
  "trpkost",
  "trubec",
  "truchlit",
  "truhlice",
  "trus",
  "trvat",
  "tudy",
  "tuhnout",
  "tuhost",
  "tundra",
  "turista",
  "turnaj",
  "tuzemsko",
  "tvaroh",
  "tvorba",
  "tvrdost",
  "tvrz",
  "tygr",
  "tykev",
  "ubohost",
  "uboze",
  "ubrat",
  "ubrousek",
  "ubrus",
  "ubytovna",
  "ucho",
  "uctivost",
  "udivit",
  "uhradit",
  "ujednat",
  "ujistit",
  "ujmout",
  "ukazatel",
  "uklidnit",
  "uklonit",
  "ukotvit",
  "ukrojit",
  "ulice",
  "ulita",
  "ulovit",
  "umyvadlo",
  "unavit",
  "uniforma",
  "uniknout",
  "upadnout",
  "uplatnit",
  "uplynout",
  "upoutat",
  "upravit",
  "uran",
  "urazit",
  "usednout",
  "usilovat",
  "usmrtit",
  "usnadnit",
  "usnout",
  "usoudit",
  "ustlat",
  "ustrnout",
  "utahovat",
  "utkat",
  "utlumit",
  "utonout",
  "utopenec",
  "utrousit",
  "uvalit",
  "uvolnit",
  "uvozovka",
  "uzdravit",
  "uzel",
  "uzenina",
  "uzlina",
  "uznat",
  "vagon",
  "valcha",
  "valoun",
  "vana",
  "vandal",
  "vanilka",
  "varan",
  "varhany",
  "varovat",
  "vcelku",
  "vchod",
  "vdova",
  "vedro",
  "vegetace",
  "vejce",
  "velbloud",
  "veletrh",
  "velitel",
  "velmoc",
  "velryba",
  "venkov",
  "veranda",
  "verze",
  "veselka",
  "veskrze",
  "vesnice",
  "vespodu",
  "vesta",
  "veterina",
  "veverka",
  "vibrace",
  "vichr",
  "videohra",
  "vidina",
  "vidle",
  "vila",
  "vinice",
  "viset",
  "vitalita",
  "vize",
  "vizitka",
  "vjezd",
  "vklad",
  "vkus",
  "vlajka",
  "vlak",
  "vlasec",
  "vlevo",
  "vlhkost",
  "vliv",
  "vlnovka",
  "vloupat",
  "vnucovat",
  "vnuk",
  "voda",
  "vodivost",
  "vodoznak",
  "vodstvo",
  "vojensky",
  "vojna",
  "vojsko",
  "volant",
  "volba",
  "volit",
  "volno",
  "voskovka",
  "vozidlo",
  "vozovna",
  "vpravo",
  "vrabec",
  "vracet",
  "vrah",
  "vrata",
  "vrba",
  "vrcholek",
  "vrhat",
  "vrstva",
  "vrtule",
  "vsadit",
  "vstoupit",
  "vstup",
  "vtip",
  "vybavit",
  "vybrat",
  "vychovat",
  "vydat",
  "vydra",
  "vyfotit",
  "vyhledat",
  "vyhnout",
  "vyhodit",
  "vyhradit",
  "vyhubit",
  "vyjasnit",
  "vyjet",
  "vyjmout",
  "vyklopit",
  "vykonat",
  "vylekat",
  "vymazat",
  "vymezit",
  "vymizet",
  "vymyslet",
  "vynechat",
  "vynikat",
  "vynutit",
  "vypadat",
  "vyplatit",
  "vypravit",
  "vypustit",
  "vyrazit",
  "vyrovnat",
  "vyrvat",
  "vyslovit",
  "vysoko",
  "vystavit",
  "vysunout",
  "vysypat",
  "vytasit",
  "vytesat",
  "vytratit",
  "vyvinout",
  "vyvolat",
  "vyvrhel",
  "vyzdobit",
  "vyznat",
  "vzadu",
  "vzbudit",
  "vzchopit",
  "vzdor",
  "vzduch",
  "vzdychat",
  "vzestup",
  "vzhledem",
  "vzkaz",
  "vzlykat",
  "vznik",
  "vzorek",
  "vzpoura",
  "vztah",
  "vztek",
  "xylofon",
  "zabrat",
  "zabydlet",
  "zachovat",
  "zadarmo",
  "zadusit",
  "zafoukat",
  "zahltit",
  "zahodit",
  "zahrada",
  "zahynout",
  "zajatec",
  "zajet",
  "zajistit",
  "zaklepat",
  "zakoupit",
  "zalepit",
  "zamezit",
  "zamotat",
  "zamyslet",
  "zanechat",
  "zanikat",
  "zaplatit",
  "zapojit",
  "zapsat",
  "zarazit",
  "zastavit",
  "zasunout",
  "zatajit",
  "zatemnit",
  "zatknout",
  "zaujmout",
  "zavalit",
  "zavelet",
  "zavinit",
  "zavolat",
  "zavrtat",
  "zazvonit",
  "zbavit",
  "zbrusu",
  "zbudovat",
  "zbytek",
  "zdaleka",
  "zdarma",
  "zdatnost",
  "zdivo",
  "zdobit",
  "zdroj",
  "zdvih",
  "zdymadlo",
  "zelenina",
  "zeman",
  "zemina",
  "zeptat",
  "zezadu",
  "zezdola",
  "zhatit",
  "zhltnout",
  "zhluboka",
  "zhotovit",
  "zhruba",
  "zima",
  "zimnice",
  "zjemnit",
  "zklamat",
  "zkoumat",
  "zkratka",
  "zkumavka",
  "zlato",
  "zlehka",
  "zloba",
  "zlom",
  "zlost",
  "zlozvyk",
  "zmapovat",
  "zmar",
  "zmatek",
  "zmije",
  "zmizet",
  "zmocnit",
  "zmodrat",
  "zmrzlina",
  "zmutovat",
  "znak",
  "znalost",
  "znamenat",
  "znovu",
  "zobrazit",
  "zotavit",
  "zoubek",
  "zoufale",
  "zplodit",
  "zpomalit",
  "zprava",
  "zprostit",
  "zprudka",
  "zprvu",
  "zrada",
  "zranit",
  "zrcadlo",
  "zrnitost",
  "zrno",
  "zrovna",
  "zrychlit",
  "zrzavost",
  "zticha",
  "ztratit",
  "zubovina",
  "zubr",
  "zvednout",
  "zvenku",
  "zvesela",
  "zvon",
  "zvrat",
  "zvukovod",
  "zvyk"
];
const require$$1 = [
  "的",
  "一",
  "是",
  "在",
  "不",
  "了",
  "有",
  "和",
  "人",
  "这",
  "中",
  "大",
  "为",
  "上",
  "个",
  "国",
  "我",
  "以",
  "要",
  "他",
  "时",
  "来",
  "用",
  "们",
  "生",
  "到",
  "作",
  "地",
  "于",
  "出",
  "就",
  "分",
  "对",
  "成",
  "会",
  "可",
  "主",
  "发",
  "年",
  "动",
  "同",
  "工",
  "也",
  "能",
  "下",
  "过",
  "子",
  "说",
  "产",
  "种",
  "面",
  "而",
  "方",
  "后",
  "多",
  "定",
  "行",
  "学",
  "法",
  "所",
  "民",
  "得",
  "经",
  "十",
  "三",
  "之",
  "进",
  "着",
  "等",
  "部",
  "度",
  "家",
  "电",
  "力",
  "里",
  "如",
  "水",
  "化",
  "高",
  "自",
  "二",
  "理",
  "起",
  "小",
  "物",
  "现",
  "实",
  "加",
  "量",
  "都",
  "两",
  "体",
  "制",
  "机",
  "当",
  "使",
  "点",
  "从",
  "业",
  "本",
  "去",
  "把",
  "性",
  "好",
  "应",
  "开",
  "它",
  "合",
  "还",
  "因",
  "由",
  "其",
  "些",
  "然",
  "前",
  "外",
  "天",
  "政",
  "四",
  "日",
  "那",
  "社",
  "义",
  "事",
  "平",
  "形",
  "相",
  "全",
  "表",
  "间",
  "样",
  "与",
  "关",
  "各",
  "重",
  "新",
  "线",
  "内",
  "数",
  "正",
  "心",
  "反",
  "你",
  "明",
  "看",
  "原",
  "又",
  "么",
  "利",
  "比",
  "或",
  "但",
  "质",
  "气",
  "第",
  "向",
  "道",
  "命",
  "此",
  "变",
  "条",
  "只",
  "没",
  "结",
  "解",
  "问",
  "意",
  "建",
  "月",
  "公",
  "无",
  "系",
  "军",
  "很",
  "情",
  "者",
  "最",
  "立",
  "代",
  "想",
  "已",
  "通",
  "并",
  "提",
  "直",
  "题",
  "党",
  "程",
  "展",
  "五",
  "果",
  "料",
  "象",
  "员",
  "革",
  "位",
  "入",
  "常",
  "文",
  "总",
  "次",
  "品",
  "式",
  "活",
  "设",
  "及",
  "管",
  "特",
  "件",
  "长",
  "求",
  "老",
  "头",
  "基",
  "资",
  "边",
  "流",
  "路",
  "级",
  "少",
  "图",
  "山",
  "统",
  "接",
  "知",
  "较",
  "将",
  "组",
  "见",
  "计",
  "别",
  "她",
  "手",
  "角",
  "期",
  "根",
  "论",
  "运",
  "农",
  "指",
  "几",
  "九",
  "区",
  "强",
  "放",
  "决",
  "西",
  "被",
  "干",
  "做",
  "必",
  "战",
  "先",
  "回",
  "则",
  "任",
  "取",
  "据",
  "处",
  "队",
  "南",
  "给",
  "色",
  "光",
  "门",
  "即",
  "保",
  "治",
  "北",
  "造",
  "百",
  "规",
  "热",
  "领",
  "七",
  "海",
  "口",
  "东",
  "导",
  "器",
  "压",
  "志",
  "世",
  "金",
  "增",
  "争",
  "济",
  "阶",
  "油",
  "思",
  "术",
  "极",
  "交",
  "受",
  "联",
  "什",
  "认",
  "六",
  "共",
  "权",
  "收",
  "证",
  "改",
  "清",
  "美",
  "再",
  "采",
  "转",
  "更",
  "单",
  "风",
  "切",
  "打",
  "白",
  "教",
  "速",
  "花",
  "带",
  "安",
  "场",
  "身",
  "车",
  "例",
  "真",
  "务",
  "具",
  "万",
  "每",
  "目",
  "至",
  "达",
  "走",
  "积",
  "示",
  "议",
  "声",
  "报",
  "斗",
  "完",
  "类",
  "八",
  "离",
  "华",
  "名",
  "确",
  "才",
  "科",
  "张",
  "信",
  "马",
  "节",
  "话",
  "米",
  "整",
  "空",
  "元",
  "况",
  "今",
  "集",
  "温",
  "传",
  "土",
  "许",
  "步",
  "群",
  "广",
  "石",
  "记",
  "需",
  "段",
  "研",
  "界",
  "拉",
  "林",
  "律",
  "叫",
  "且",
  "究",
  "观",
  "越",
  "织",
  "装",
  "影",
  "算",
  "低",
  "持",
  "音",
  "众",
  "书",
  "布",
  "复",
  "容",
  "儿",
  "须",
  "际",
  "商",
  "非",
  "验",
  "连",
  "断",
  "深",
  "难",
  "近",
  "矿",
  "千",
  "周",
  "委",
  "素",
  "技",
  "备",
  "半",
  "办",
  "青",
  "省",
  "列",
  "习",
  "响",
  "约",
  "支",
  "般",
  "史",
  "感",
  "劳",
  "便",
  "团",
  "往",
  "酸",
  "历",
  "市",
  "克",
  "何",
  "除",
  "消",
  "构",
  "府",
  "称",
  "太",
  "准",
  "精",
  "值",
  "号",
  "率",
  "族",
  "维",
  "划",
  "选",
  "标",
  "写",
  "存",
  "候",
  "毛",
  "亲",
  "快",
  "效",
  "斯",
  "院",
  "查",
  "江",
  "型",
  "眼",
  "王",
  "按",
  "格",
  "养",
  "易",
  "置",
  "派",
  "层",
  "片",
  "始",
  "却",
  "专",
  "状",
  "育",
  "厂",
  "京",
  "识",
  "适",
  "属",
  "圆",
  "包",
  "火",
  "住",
  "调",
  "满",
  "县",
  "局",
  "照",
  "参",
  "红",
  "细",
  "引",
  "听",
  "该",
  "铁",
  "价",
  "严",
  "首",
  "底",
  "液",
  "官",
  "德",
  "随",
  "病",
  "苏",
  "失",
  "尔",
  "死",
  "讲",
  "配",
  "女",
  "黄",
  "推",
  "显",
  "谈",
  "罪",
  "神",
  "艺",
  "呢",
  "席",
  "含",
  "企",
  "望",
  "密",
  "批",
  "营",
  "项",
  "防",
  "举",
  "球",
  "英",
  "氧",
  "势",
  "告",
  "李",
  "台",
  "落",
  "木",
  "帮",
  "轮",
  "破",
  "亚",
  "师",
  "围",
  "注",
  "远",
  "字",
  "材",
  "排",
  "供",
  "河",
  "态",
  "封",
  "另",
  "施",
  "减",
  "树",
  "溶",
  "怎",
  "止",
  "案",
  "言",
  "士",
  "均",
  "武",
  "固",
  "叶",
  "鱼",
  "波",
  "视",
  "仅",
  "费",
  "紧",
  "爱",
  "左",
  "章",
  "早",
  "朝",
  "害",
  "续",
  "轻",
  "服",
  "试",
  "食",
  "充",
  "兵",
  "源",
  "判",
  "护",
  "司",
  "足",
  "某",
  "练",
  "差",
  "致",
  "板",
  "田",
  "降",
  "黑",
  "犯",
  "负",
  "击",
  "范",
  "继",
  "兴",
  "似",
  "余",
  "坚",
  "曲",
  "输",
  "修",
  "故",
  "城",
  "夫",
  "够",
  "送",
  "笔",
  "船",
  "占",
  "右",
  "财",
  "吃",
  "富",
  "春",
  "职",
  "觉",
  "汉",
  "画",
  "功",
  "巴",
  "跟",
  "虽",
  "杂",
  "飞",
  "检",
  "吸",
  "助",
  "升",
  "阳",
  "互",
  "初",
  "创",
  "抗",
  "考",
  "投",
  "坏",
  "策",
  "古",
  "径",
  "换",
  "未",
  "跑",
  "留",
  "钢",
  "曾",
  "端",
  "责",
  "站",
  "简",
  "述",
  "钱",
  "副",
  "尽",
  "帝",
  "射",
  "草",
  "冲",
  "承",
  "独",
  "令",
  "限",
  "阿",
  "宣",
  "环",
  "双",
  "请",
  "超",
  "微",
  "让",
  "控",
  "州",
  "良",
  "轴",
  "找",
  "否",
  "纪",
  "益",
  "依",
  "优",
  "顶",
  "础",
  "载",
  "倒",
  "房",
  "突",
  "坐",
  "粉",
  "敌",
  "略",
  "客",
  "袁",
  "冷",
  "胜",
  "绝",
  "析",
  "块",
  "剂",
  "测",
  "丝",
  "协",
  "诉",
  "念",
  "陈",
  "仍",
  "罗",
  "盐",
  "友",
  "洋",
  "错",
  "苦",
  "夜",
  "刑",
  "移",
  "频",
  "逐",
  "靠",
  "混",
  "母",
  "短",
  "皮",
  "终",
  "聚",
  "汽",
  "村",
  "云",
  "哪",
  "既",
  "距",
  "卫",
  "停",
  "烈",
  "央",
  "察",
  "烧",
  "迅",
  "境",
  "若",
  "印",
  "洲",
  "刻",
  "括",
  "激",
  "孔",
  "搞",
  "甚",
  "室",
  "待",
  "核",
  "校",
  "散",
  "侵",
  "吧",
  "甲",
  "游",
  "久",
  "菜",
  "味",
  "旧",
  "模",
  "湖",
  "货",
  "损",
  "预",
  "阻",
  "毫",
  "普",
  "稳",
  "乙",
  "妈",
  "植",
  "息",
  "扩",
  "银",
  "语",
  "挥",
  "酒",
  "守",
  "拿",
  "序",
  "纸",
  "医",
  "缺",
  "雨",
  "吗",
  "针",
  "刘",
  "啊",
  "急",
  "唱",
  "误",
  "训",
  "愿",
  "审",
  "附",
  "获",
  "茶",
  "鲜",
  "粮",
  "斤",
  "孩",
  "脱",
  "硫",
  "肥",
  "善",
  "龙",
  "演",
  "父",
  "渐",
  "血",
  "欢",
  "械",
  "掌",
  "歌",
  "沙",
  "刚",
  "攻",
  "谓",
  "盾",
  "讨",
  "晚",
  "粒",
  "乱",
  "燃",
  "矛",
  "乎",
  "杀",
  "药",
  "宁",
  "鲁",
  "贵",
  "钟",
  "煤",
  "读",
  "班",
  "伯",
  "香",
  "介",
  "迫",
  "句",
  "丰",
  "培",
  "握",
  "兰",
  "担",
  "弦",
  "蛋",
  "沉",
  "假",
  "穿",
  "执",
  "答",
  "乐",
  "谁",
  "顺",
  "烟",
  "缩",
  "征",
  "脸",
  "喜",
  "松",
  "脚",
  "困",
  "异",
  "免",
  "背",
  "星",
  "福",
  "买",
  "染",
  "井",
  "概",
  "慢",
  "怕",
  "磁",
  "倍",
  "祖",
  "皇",
  "促",
  "静",
  "补",
  "评",
  "翻",
  "肉",
  "践",
  "尼",
  "衣",
  "宽",
  "扬",
  "棉",
  "希",
  "伤",
  "操",
  "垂",
  "秋",
  "宜",
  "氢",
  "套",
  "督",
  "振",
  "架",
  "亮",
  "末",
  "宪",
  "庆",
  "编",
  "牛",
  "触",
  "映",
  "雷",
  "销",
  "诗",
  "座",
  "居",
  "抓",
  "裂",
  "胞",
  "呼",
  "娘",
  "景",
  "威",
  "绿",
  "晶",
  "厚",
  "盟",
  "衡",
  "鸡",
  "孙",
  "延",
  "危",
  "胶",
  "屋",
  "乡",
  "临",
  "陆",
  "顾",
  "掉",
  "呀",
  "灯",
  "岁",
  "措",
  "束",
  "耐",
  "剧",
  "玉",
  "赵",
  "跳",
  "哥",
  "季",
  "课",
  "凯",
  "胡",
  "额",
  "款",
  "绍",
  "卷",
  "齐",
  "伟",
  "蒸",
  "殖",
  "永",
  "宗",
  "苗",
  "川",
  "炉",
  "岩",
  "弱",
  "零",
  "杨",
  "奏",
  "沿",
  "露",
  "杆",
  "探",
  "滑",
  "镇",
  "饭",
  "浓",
  "航",
  "怀",
  "赶",
  "库",
  "夺",
  "伊",
  "灵",
  "税",
  "途",
  "灭",
  "赛",
  "归",
  "召",
  "鼓",
  "播",
  "盘",
  "裁",
  "险",
  "康",
  "唯",
  "录",
  "菌",
  "纯",
  "借",
  "糖",
  "盖",
  "横",
  "符",
  "私",
  "努",
  "堂",
  "域",
  "枪",
  "润",
  "幅",
  "哈",
  "竟",
  "熟",
  "虫",
  "泽",
  "脑",
  "壤",
  "碳",
  "欧",
  "遍",
  "侧",
  "寨",
  "敢",
  "彻",
  "虑",
  "斜",
  "薄",
  "庭",
  "纳",
  "弹",
  "饲",
  "伸",
  "折",
  "麦",
  "湿",
  "暗",
  "荷",
  "瓦",
  "塞",
  "床",
  "筑",
  "恶",
  "户",
  "访",
  "塔",
  "奇",
  "透",
  "梁",
  "刀",
  "旋",
  "迹",
  "卡",
  "氯",
  "遇",
  "份",
  "毒",
  "泥",
  "退",
  "洗",
  "摆",
  "灰",
  "彩",
  "卖",
  "耗",
  "夏",
  "择",
  "忙",
  "铜",
  "献",
  "硬",
  "予",
  "繁",
  "圈",
  "雪",
  "函",
  "亦",
  "抽",
  "篇",
  "阵",
  "阴",
  "丁",
  "尺",
  "追",
  "堆",
  "雄",
  "迎",
  "泛",
  "爸",
  "楼",
  "避",
  "谋",
  "吨",
  "野",
  "猪",
  "旗",
  "累",
  "偏",
  "典",
  "馆",
  "索",
  "秦",
  "脂",
  "潮",
  "爷",
  "豆",
  "忽",
  "托",
  "惊",
  "塑",
  "遗",
  "愈",
  "朱",
  "替",
  "纤",
  "粗",
  "倾",
  "尚",
  "痛",
  "楚",
  "谢",
  "奋",
  "购",
  "磨",
  "君",
  "池",
  "旁",
  "碎",
  "骨",
  "监",
  "捕",
  "弟",
  "暴",
  "割",
  "贯",
  "殊",
  "释",
  "词",
  "亡",
  "壁",
  "顿",
  "宝",
  "午",
  "尘",
  "闻",
  "揭",
  "炮",
  "残",
  "冬",
  "桥",
  "妇",
  "警",
  "综",
  "招",
  "吴",
  "付",
  "浮",
  "遭",
  "徐",
  "您",
  "摇",
  "谷",
  "赞",
  "箱",
  "隔",
  "订",
  "男",
  "吹",
  "园",
  "纷",
  "唐",
  "败",
  "宋",
  "玻",
  "巨",
  "耕",
  "坦",
  "荣",
  "闭",
  "湾",
  "键",
  "凡",
  "驻",
  "锅",
  "救",
  "恩",
  "剥",
  "凝",
  "碱",
  "齿",
  "截",
  "炼",
  "麻",
  "纺",
  "禁",
  "废",
  "盛",
  "版",
  "缓",
  "净",
  "睛",
  "昌",
  "婚",
  "涉",
  "筒",
  "嘴",
  "插",
  "岸",
  "朗",
  "庄",
  "街",
  "藏",
  "姑",
  "贸",
  "腐",
  "奴",
  "啦",
  "惯",
  "乘",
  "伙",
  "恢",
  "匀",
  "纱",
  "扎",
  "辩",
  "耳",
  "彪",
  "臣",
  "亿",
  "璃",
  "抵",
  "脉",
  "秀",
  "萨",
  "俄",
  "网",
  "舞",
  "店",
  "喷",
  "纵",
  "寸",
  "汗",
  "挂",
  "洪",
  "贺",
  "闪",
  "柬",
  "爆",
  "烯",
  "津",
  "稻",
  "墙",
  "软",
  "勇",
  "像",
  "滚",
  "厘",
  "蒙",
  "芳",
  "肯",
  "坡",
  "柱",
  "荡",
  "腿",
  "仪",
  "旅",
  "尾",
  "轧",
  "冰",
  "贡",
  "登",
  "黎",
  "削",
  "钻",
  "勒",
  "逃",
  "障",
  "氨",
  "郭",
  "峰",
  "币",
  "港",
  "伏",
  "轨",
  "亩",
  "毕",
  "擦",
  "莫",
  "刺",
  "浪",
  "秘",
  "援",
  "株",
  "健",
  "售",
  "股",
  "岛",
  "甘",
  "泡",
  "睡",
  "童",
  "铸",
  "汤",
  "阀",
  "休",
  "汇",
  "舍",
  "牧",
  "绕",
  "炸",
  "哲",
  "磷",
  "绩",
  "朋",
  "淡",
  "尖",
  "启",
  "陷",
  "柴",
  "呈",
  "徒",
  "颜",
  "泪",
  "稍",
  "忘",
  "泵",
  "蓝",
  "拖",
  "洞",
  "授",
  "镜",
  "辛",
  "壮",
  "锋",
  "贫",
  "虚",
  "弯",
  "摩",
  "泰",
  "幼",
  "廷",
  "尊",
  "窗",
  "纲",
  "弄",
  "隶",
  "疑",
  "氏",
  "宫",
  "姐",
  "震",
  "瑞",
  "怪",
  "尤",
  "琴",
  "循",
  "描",
  "膜",
  "违",
  "夹",
  "腰",
  "缘",
  "珠",
  "穷",
  "森",
  "枝",
  "竹",
  "沟",
  "催",
  "绳",
  "忆",
  "邦",
  "剩",
  "幸",
  "浆",
  "栏",
  "拥",
  "牙",
  "贮",
  "礼",
  "滤",
  "钠",
  "纹",
  "罢",
  "拍",
  "咱",
  "喊",
  "袖",
  "埃",
  "勤",
  "罚",
  "焦",
  "潜",
  "伍",
  "墨",
  "欲",
  "缝",
  "姓",
  "刊",
  "饱",
  "仿",
  "奖",
  "铝",
  "鬼",
  "丽",
  "跨",
  "默",
  "挖",
  "链",
  "扫",
  "喝",
  "袋",
  "炭",
  "污",
  "幕",
  "诸",
  "弧",
  "励",
  "梅",
  "奶",
  "洁",
  "灾",
  "舟",
  "鉴",
  "苯",
  "讼",
  "抱",
  "毁",
  "懂",
  "寒",
  "智",
  "埔",
  "寄",
  "届",
  "跃",
  "渡",
  "挑",
  "丹",
  "艰",
  "贝",
  "碰",
  "拔",
  "爹",
  "戴",
  "码",
  "梦",
  "芽",
  "熔",
  "赤",
  "渔",
  "哭",
  "敬",
  "颗",
  "奔",
  "铅",
  "仲",
  "虎",
  "稀",
  "妹",
  "乏",
  "珍",
  "申",
  "桌",
  "遵",
  "允",
  "隆",
  "螺",
  "仓",
  "魏",
  "锐",
  "晓",
  "氮",
  "兼",
  "隐",
  "碍",
  "赫",
  "拨",
  "忠",
  "肃",
  "缸",
  "牵",
  "抢",
  "博",
  "巧",
  "壳",
  "兄",
  "杜",
  "讯",
  "诚",
  "碧",
  "祥",
  "柯",
  "页",
  "巡",
  "矩",
  "悲",
  "灌",
  "龄",
  "伦",
  "票",
  "寻",
  "桂",
  "铺",
  "圣",
  "恐",
  "恰",
  "郑",
  "趣",
  "抬",
  "荒",
  "腾",
  "贴",
  "柔",
  "滴",
  "猛",
  "阔",
  "辆",
  "妻",
  "填",
  "撤",
  "储",
  "签",
  "闹",
  "扰",
  "紫",
  "砂",
  "递",
  "戏",
  "吊",
  "陶",
  "伐",
  "喂",
  "疗",
  "瓶",
  "婆",
  "抚",
  "臂",
  "摸",
  "忍",
  "虾",
  "蜡",
  "邻",
  "胸",
  "巩",
  "挤",
  "偶",
  "弃",
  "槽",
  "劲",
  "乳",
  "邓",
  "吉",
  "仁",
  "烂",
  "砖",
  "租",
  "乌",
  "舰",
  "伴",
  "瓜",
  "浅",
  "丙",
  "暂",
  "燥",
  "橡",
  "柳",
  "迷",
  "暖",
  "牌",
  "秧",
  "胆",
  "详",
  "簧",
  "踏",
  "瓷",
  "谱",
  "呆",
  "宾",
  "糊",
  "洛",
  "辉",
  "愤",
  "竞",
  "隙",
  "怒",
  "粘",
  "乃",
  "绪",
  "肩",
  "籍",
  "敏",
  "涂",
  "熙",
  "皆",
  "侦",
  "悬",
  "掘",
  "享",
  "纠",
  "醒",
  "狂",
  "锁",
  "淀",
  "恨",
  "牲",
  "霸",
  "爬",
  "赏",
  "逆",
  "玩",
  "陵",
  "祝",
  "秒",
  "浙",
  "貌",
  "役",
  "彼",
  "悉",
  "鸭",
  "趋",
  "凤",
  "晨",
  "畜",
  "辈",
  "秩",
  "卵",
  "署",
  "梯",
  "炎",
  "滩",
  "棋",
  "驱",
  "筛",
  "峡",
  "冒",
  "啥",
  "寿",
  "译",
  "浸",
  "泉",
  "帽",
  "迟",
  "硅",
  "疆",
  "贷",
  "漏",
  "稿",
  "冠",
  "嫩",
  "胁",
  "芯",
  "牢",
  "叛",
  "蚀",
  "奥",
  "鸣",
  "岭",
  "羊",
  "凭",
  "串",
  "塘",
  "绘",
  "酵",
  "融",
  "盆",
  "锡",
  "庙",
  "筹",
  "冻",
  "辅",
  "摄",
  "袭",
  "筋",
  "拒",
  "僚",
  "旱",
  "钾",
  "鸟",
  "漆",
  "沈",
  "眉",
  "疏",
  "添",
  "棒",
  "穗",
  "硝",
  "韩",
  "逼",
  "扭",
  "侨",
  "凉",
  "挺",
  "碗",
  "栽",
  "炒",
  "杯",
  "患",
  "馏",
  "劝",
  "豪",
  "辽",
  "勃",
  "鸿",
  "旦",
  "吏",
  "拜",
  "狗",
  "埋",
  "辊",
  "掩",
  "饮",
  "搬",
  "骂",
  "辞",
  "勾",
  "扣",
  "估",
  "蒋",
  "绒",
  "雾",
  "丈",
  "朵",
  "姆",
  "拟",
  "宇",
  "辑",
  "陕",
  "雕",
  "偿",
  "蓄",
  "崇",
  "剪",
  "倡",
  "厅",
  "咬",
  "驶",
  "薯",
  "刷",
  "斥",
  "番",
  "赋",
  "奉",
  "佛",
  "浇",
  "漫",
  "曼",
  "扇",
  "钙",
  "桃",
  "扶",
  "仔",
  "返",
  "俗",
  "亏",
  "腔",
  "鞋",
  "棱",
  "覆",
  "框",
  "悄",
  "叔",
  "撞",
  "骗",
  "勘",
  "旺",
  "沸",
  "孤",
  "吐",
  "孟",
  "渠",
  "屈",
  "疾",
  "妙",
  "惜",
  "仰",
  "狠",
  "胀",
  "谐",
  "抛",
  "霉",
  "桑",
  "岗",
  "嘛",
  "衰",
  "盗",
  "渗",
  "脏",
  "赖",
  "涌",
  "甜",
  "曹",
  "阅",
  "肌",
  "哩",
  "厉",
  "烃",
  "纬",
  "毅",
  "昨",
  "伪",
  "症",
  "煮",
  "叹",
  "钉",
  "搭",
  "茎",
  "笼",
  "酷",
  "偷",
  "弓",
  "锥",
  "恒",
  "杰",
  "坑",
  "鼻",
  "翼",
  "纶",
  "叙",
  "狱",
  "逮",
  "罐",
  "络",
  "棚",
  "抑",
  "膨",
  "蔬",
  "寺",
  "骤",
  "穆",
  "冶",
  "枯",
  "册",
  "尸",
  "凸",
  "绅",
  "坯",
  "牺",
  "焰",
  "轰",
  "欣",
  "晋",
  "瘦",
  "御",
  "锭",
  "锦",
  "丧",
  "旬",
  "锻",
  "垄",
  "搜",
  "扑",
  "邀",
  "亭",
  "酯",
  "迈",
  "舒",
  "脆",
  "酶",
  "闲",
  "忧",
  "酚",
  "顽",
  "羽",
  "涨",
  "卸",
  "仗",
  "陪",
  "辟",
  "惩",
  "杭",
  "姚",
  "肚",
  "捉",
  "飘",
  "漂",
  "昆",
  "欺",
  "吾",
  "郎",
  "烷",
  "汁",
  "呵",
  "饰",
  "萧",
  "雅",
  "邮",
  "迁",
  "燕",
  "撒",
  "姻",
  "赴",
  "宴",
  "烦",
  "债",
  "帐",
  "斑",
  "铃",
  "旨",
  "醇",
  "董",
  "饼",
  "雏",
  "姿",
  "拌",
  "傅",
  "腹",
  "妥",
  "揉",
  "贤",
  "拆",
  "歪",
  "葡",
  "胺",
  "丢",
  "浩",
  "徽",
  "昂",
  "垫",
  "挡",
  "览",
  "贪",
  "慰",
  "缴",
  "汪",
  "慌",
  "冯",
  "诺",
  "姜",
  "谊",
  "凶",
  "劣",
  "诬",
  "耀",
  "昏",
  "躺",
  "盈",
  "骑",
  "乔",
  "溪",
  "丛",
  "卢",
  "抹",
  "闷",
  "咨",
  "刮",
  "驾",
  "缆",
  "悟",
  "摘",
  "铒",
  "掷",
  "颇",
  "幻",
  "柄",
  "惠",
  "惨",
  "佳",
  "仇",
  "腊",
  "窝",
  "涤",
  "剑",
  "瞧",
  "堡",
  "泼",
  "葱",
  "罩",
  "霍",
  "捞",
  "胎",
  "苍",
  "滨",
  "俩",
  "捅",
  "湘",
  "砍",
  "霞",
  "邵",
  "萄",
  "疯",
  "淮",
  "遂",
  "熊",
  "粪",
  "烘",
  "宿",
  "档",
  "戈",
  "驳",
  "嫂",
  "裕",
  "徙",
  "箭",
  "捐",
  "肠",
  "撑",
  "晒",
  "辨",
  "殿",
  "莲",
  "摊",
  "搅",
  "酱",
  "屏",
  "疫",
  "哀",
  "蔡",
  "堵",
  "沫",
  "皱",
  "畅",
  "叠",
  "阁",
  "莱",
  "敲",
  "辖",
  "钩",
  "痕",
  "坝",
  "巷",
  "饿",
  "祸",
  "丘",
  "玄",
  "溜",
  "曰",
  "逻",
  "彭",
  "尝",
  "卿",
  "妨",
  "艇",
  "吞",
  "韦",
  "怨",
  "矮",
  "歇"
];
const require$$2 = [
  "的",
  "一",
  "是",
  "在",
  "不",
  "了",
  "有",
  "和",
  "人",
  "這",
  "中",
  "大",
  "為",
  "上",
  "個",
  "國",
  "我",
  "以",
  "要",
  "他",
  "時",
  "來",
  "用",
  "們",
  "生",
  "到",
  "作",
  "地",
  "於",
  "出",
  "就",
  "分",
  "對",
  "成",
  "會",
  "可",
  "主",
  "發",
  "年",
  "動",
  "同",
  "工",
  "也",
  "能",
  "下",
  "過",
  "子",
  "說",
  "產",
  "種",
  "面",
  "而",
  "方",
  "後",
  "多",
  "定",
  "行",
  "學",
  "法",
  "所",
  "民",
  "得",
  "經",
  "十",
  "三",
  "之",
  "進",
  "著",
  "等",
  "部",
  "度",
  "家",
  "電",
  "力",
  "裡",
  "如",
  "水",
  "化",
  "高",
  "自",
  "二",
  "理",
  "起",
  "小",
  "物",
  "現",
  "實",
  "加",
  "量",
  "都",
  "兩",
  "體",
  "制",
  "機",
  "當",
  "使",
  "點",
  "從",
  "業",
  "本",
  "去",
  "把",
  "性",
  "好",
  "應",
  "開",
  "它",
  "合",
  "還",
  "因",
  "由",
  "其",
  "些",
  "然",
  "前",
  "外",
  "天",
  "政",
  "四",
  "日",
  "那",
  "社",
  "義",
  "事",
  "平",
  "形",
  "相",
  "全",
  "表",
  "間",
  "樣",
  "與",
  "關",
  "各",
  "重",
  "新",
  "線",
  "內",
  "數",
  "正",
  "心",
  "反",
  "你",
  "明",
  "看",
  "原",
  "又",
  "麼",
  "利",
  "比",
  "或",
  "但",
  "質",
  "氣",
  "第",
  "向",
  "道",
  "命",
  "此",
  "變",
  "條",
  "只",
  "沒",
  "結",
  "解",
  "問",
  "意",
  "建",
  "月",
  "公",
  "無",
  "系",
  "軍",
  "很",
  "情",
  "者",
  "最",
  "立",
  "代",
  "想",
  "已",
  "通",
  "並",
  "提",
  "直",
  "題",
  "黨",
  "程",
  "展",
  "五",
  "果",
  "料",
  "象",
  "員",
  "革",
  "位",
  "入",
  "常",
  "文",
  "總",
  "次",
  "品",
  "式",
  "活",
  "設",
  "及",
  "管",
  "特",
  "件",
  "長",
  "求",
  "老",
  "頭",
  "基",
  "資",
  "邊",
  "流",
  "路",
  "級",
  "少",
  "圖",
  "山",
  "統",
  "接",
  "知",
  "較",
  "將",
  "組",
  "見",
  "計",
  "別",
  "她",
  "手",
  "角",
  "期",
  "根",
  "論",
  "運",
  "農",
  "指",
  "幾",
  "九",
  "區",
  "強",
  "放",
  "決",
  "西",
  "被",
  "幹",
  "做",
  "必",
  "戰",
  "先",
  "回",
  "則",
  "任",
  "取",
  "據",
  "處",
  "隊",
  "南",
  "給",
  "色",
  "光",
  "門",
  "即",
  "保",
  "治",
  "北",
  "造",
  "百",
  "規",
  "熱",
  "領",
  "七",
  "海",
  "口",
  "東",
  "導",
  "器",
  "壓",
  "志",
  "世",
  "金",
  "增",
  "爭",
  "濟",
  "階",
  "油",
  "思",
  "術",
  "極",
  "交",
  "受",
  "聯",
  "什",
  "認",
  "六",
  "共",
  "權",
  "收",
  "證",
  "改",
  "清",
  "美",
  "再",
  "採",
  "轉",
  "更",
  "單",
  "風",
  "切",
  "打",
  "白",
  "教",
  "速",
  "花",
  "帶",
  "安",
  "場",
  "身",
  "車",
  "例",
  "真",
  "務",
  "具",
  "萬",
  "每",
  "目",
  "至",
  "達",
  "走",
  "積",
  "示",
  "議",
  "聲",
  "報",
  "鬥",
  "完",
  "類",
  "八",
  "離",
  "華",
  "名",
  "確",
  "才",
  "科",
  "張",
  "信",
  "馬",
  "節",
  "話",
  "米",
  "整",
  "空",
  "元",
  "況",
  "今",
  "集",
  "溫",
  "傳",
  "土",
  "許",
  "步",
  "群",
  "廣",
  "石",
  "記",
  "需",
  "段",
  "研",
  "界",
  "拉",
  "林",
  "律",
  "叫",
  "且",
  "究",
  "觀",
  "越",
  "織",
  "裝",
  "影",
  "算",
  "低",
  "持",
  "音",
  "眾",
  "書",
  "布",
  "复",
  "容",
  "兒",
  "須",
  "際",
  "商",
  "非",
  "驗",
  "連",
  "斷",
  "深",
  "難",
  "近",
  "礦",
  "千",
  "週",
  "委",
  "素",
  "技",
  "備",
  "半",
  "辦",
  "青",
  "省",
  "列",
  "習",
  "響",
  "約",
  "支",
  "般",
  "史",
  "感",
  "勞",
  "便",
  "團",
  "往",
  "酸",
  "歷",
  "市",
  "克",
  "何",
  "除",
  "消",
  "構",
  "府",
  "稱",
  "太",
  "準",
  "精",
  "值",
  "號",
  "率",
  "族",
  "維",
  "劃",
  "選",
  "標",
  "寫",
  "存",
  "候",
  "毛",
  "親",
  "快",
  "效",
  "斯",
  "院",
  "查",
  "江",
  "型",
  "眼",
  "王",
  "按",
  "格",
  "養",
  "易",
  "置",
  "派",
  "層",
  "片",
  "始",
  "卻",
  "專",
  "狀",
  "育",
  "廠",
  "京",
  "識",
  "適",
  "屬",
  "圓",
  "包",
  "火",
  "住",
  "調",
  "滿",
  "縣",
  "局",
  "照",
  "參",
  "紅",
  "細",
  "引",
  "聽",
  "該",
  "鐵",
  "價",
  "嚴",
  "首",
  "底",
  "液",
  "官",
  "德",
  "隨",
  "病",
  "蘇",
  "失",
  "爾",
  "死",
  "講",
  "配",
  "女",
  "黃",
  "推",
  "顯",
  "談",
  "罪",
  "神",
  "藝",
  "呢",
  "席",
  "含",
  "企",
  "望",
  "密",
  "批",
  "營",
  "項",
  "防",
  "舉",
  "球",
  "英",
  "氧",
  "勢",
  "告",
  "李",
  "台",
  "落",
  "木",
  "幫",
  "輪",
  "破",
  "亞",
  "師",
  "圍",
  "注",
  "遠",
  "字",
  "材",
  "排",
  "供",
  "河",
  "態",
  "封",
  "另",
  "施",
  "減",
  "樹",
  "溶",
  "怎",
  "止",
  "案",
  "言",
  "士",
  "均",
  "武",
  "固",
  "葉",
  "魚",
  "波",
  "視",
  "僅",
  "費",
  "緊",
  "愛",
  "左",
  "章",
  "早",
  "朝",
  "害",
  "續",
  "輕",
  "服",
  "試",
  "食",
  "充",
  "兵",
  "源",
  "判",
  "護",
  "司",
  "足",
  "某",
  "練",
  "差",
  "致",
  "板",
  "田",
  "降",
  "黑",
  "犯",
  "負",
  "擊",
  "范",
  "繼",
  "興",
  "似",
  "餘",
  "堅",
  "曲",
  "輸",
  "修",
  "故",
  "城",
  "夫",
  "夠",
  "送",
  "筆",
  "船",
  "佔",
  "右",
  "財",
  "吃",
  "富",
  "春",
  "職",
  "覺",
  "漢",
  "畫",
  "功",
  "巴",
  "跟",
  "雖",
  "雜",
  "飛",
  "檢",
  "吸",
  "助",
  "昇",
  "陽",
  "互",
  "初",
  "創",
  "抗",
  "考",
  "投",
  "壞",
  "策",
  "古",
  "徑",
  "換",
  "未",
  "跑",
  "留",
  "鋼",
  "曾",
  "端",
  "責",
  "站",
  "簡",
  "述",
  "錢",
  "副",
  "盡",
  "帝",
  "射",
  "草",
  "衝",
  "承",
  "獨",
  "令",
  "限",
  "阿",
  "宣",
  "環",
  "雙",
  "請",
  "超",
  "微",
  "讓",
  "控",
  "州",
  "良",
  "軸",
  "找",
  "否",
  "紀",
  "益",
  "依",
  "優",
  "頂",
  "礎",
  "載",
  "倒",
  "房",
  "突",
  "坐",
  "粉",
  "敵",
  "略",
  "客",
  "袁",
  "冷",
  "勝",
  "絕",
  "析",
  "塊",
  "劑",
  "測",
  "絲",
  "協",
  "訴",
  "念",
  "陳",
  "仍",
  "羅",
  "鹽",
  "友",
  "洋",
  "錯",
  "苦",
  "夜",
  "刑",
  "移",
  "頻",
  "逐",
  "靠",
  "混",
  "母",
  "短",
  "皮",
  "終",
  "聚",
  "汽",
  "村",
  "雲",
  "哪",
  "既",
  "距",
  "衛",
  "停",
  "烈",
  "央",
  "察",
  "燒",
  "迅",
  "境",
  "若",
  "印",
  "洲",
  "刻",
  "括",
  "激",
  "孔",
  "搞",
  "甚",
  "室",
  "待",
  "核",
  "校",
  "散",
  "侵",
  "吧",
  "甲",
  "遊",
  "久",
  "菜",
  "味",
  "舊",
  "模",
  "湖",
  "貨",
  "損",
  "預",
  "阻",
  "毫",
  "普",
  "穩",
  "乙",
  "媽",
  "植",
  "息",
  "擴",
  "銀",
  "語",
  "揮",
  "酒",
  "守",
  "拿",
  "序",
  "紙",
  "醫",
  "缺",
  "雨",
  "嗎",
  "針",
  "劉",
  "啊",
  "急",
  "唱",
  "誤",
  "訓",
  "願",
  "審",
  "附",
  "獲",
  "茶",
  "鮮",
  "糧",
  "斤",
  "孩",
  "脫",
  "硫",
  "肥",
  "善",
  "龍",
  "演",
  "父",
  "漸",
  "血",
  "歡",
  "械",
  "掌",
  "歌",
  "沙",
  "剛",
  "攻",
  "謂",
  "盾",
  "討",
  "晚",
  "粒",
  "亂",
  "燃",
  "矛",
  "乎",
  "殺",
  "藥",
  "寧",
  "魯",
  "貴",
  "鐘",
  "煤",
  "讀",
  "班",
  "伯",
  "香",
  "介",
  "迫",
  "句",
  "豐",
  "培",
  "握",
  "蘭",
  "擔",
  "弦",
  "蛋",
  "沉",
  "假",
  "穿",
  "執",
  "答",
  "樂",
  "誰",
  "順",
  "煙",
  "縮",
  "徵",
  "臉",
  "喜",
  "松",
  "腳",
  "困",
  "異",
  "免",
  "背",
  "星",
  "福",
  "買",
  "染",
  "井",
  "概",
  "慢",
  "怕",
  "磁",
  "倍",
  "祖",
  "皇",
  "促",
  "靜",
  "補",
  "評",
  "翻",
  "肉",
  "踐",
  "尼",
  "衣",
  "寬",
  "揚",
  "棉",
  "希",
  "傷",
  "操",
  "垂",
  "秋",
  "宜",
  "氫",
  "套",
  "督",
  "振",
  "架",
  "亮",
  "末",
  "憲",
  "慶",
  "編",
  "牛",
  "觸",
  "映",
  "雷",
  "銷",
  "詩",
  "座",
  "居",
  "抓",
  "裂",
  "胞",
  "呼",
  "娘",
  "景",
  "威",
  "綠",
  "晶",
  "厚",
  "盟",
  "衡",
  "雞",
  "孫",
  "延",
  "危",
  "膠",
  "屋",
  "鄉",
  "臨",
  "陸",
  "顧",
  "掉",
  "呀",
  "燈",
  "歲",
  "措",
  "束",
  "耐",
  "劇",
  "玉",
  "趙",
  "跳",
  "哥",
  "季",
  "課",
  "凱",
  "胡",
  "額",
  "款",
  "紹",
  "卷",
  "齊",
  "偉",
  "蒸",
  "殖",
  "永",
  "宗",
  "苗",
  "川",
  "爐",
  "岩",
  "弱",
  "零",
  "楊",
  "奏",
  "沿",
  "露",
  "桿",
  "探",
  "滑",
  "鎮",
  "飯",
  "濃",
  "航",
  "懷",
  "趕",
  "庫",
  "奪",
  "伊",
  "靈",
  "稅",
  "途",
  "滅",
  "賽",
  "歸",
  "召",
  "鼓",
  "播",
  "盤",
  "裁",
  "險",
  "康",
  "唯",
  "錄",
  "菌",
  "純",
  "借",
  "糖",
  "蓋",
  "橫",
  "符",
  "私",
  "努",
  "堂",
  "域",
  "槍",
  "潤",
  "幅",
  "哈",
  "竟",
  "熟",
  "蟲",
  "澤",
  "腦",
  "壤",
  "碳",
  "歐",
  "遍",
  "側",
  "寨",
  "敢",
  "徹",
  "慮",
  "斜",
  "薄",
  "庭",
  "納",
  "彈",
  "飼",
  "伸",
  "折",
  "麥",
  "濕",
  "暗",
  "荷",
  "瓦",
  "塞",
  "床",
  "築",
  "惡",
  "戶",
  "訪",
  "塔",
  "奇",
  "透",
  "梁",
  "刀",
  "旋",
  "跡",
  "卡",
  "氯",
  "遇",
  "份",
  "毒",
  "泥",
  "退",
  "洗",
  "擺",
  "灰",
  "彩",
  "賣",
  "耗",
  "夏",
  "擇",
  "忙",
  "銅",
  "獻",
  "硬",
  "予",
  "繁",
  "圈",
  "雪",
  "函",
  "亦",
  "抽",
  "篇",
  "陣",
  "陰",
  "丁",
  "尺",
  "追",
  "堆",
  "雄",
  "迎",
  "泛",
  "爸",
  "樓",
  "避",
  "謀",
  "噸",
  "野",
  "豬",
  "旗",
  "累",
  "偏",
  "典",
  "館",
  "索",
  "秦",
  "脂",
  "潮",
  "爺",
  "豆",
  "忽",
  "托",
  "驚",
  "塑",
  "遺",
  "愈",
  "朱",
  "替",
  "纖",
  "粗",
  "傾",
  "尚",
  "痛",
  "楚",
  "謝",
  "奮",
  "購",
  "磨",
  "君",
  "池",
  "旁",
  "碎",
  "骨",
  "監",
  "捕",
  "弟",
  "暴",
  "割",
  "貫",
  "殊",
  "釋",
  "詞",
  "亡",
  "壁",
  "頓",
  "寶",
  "午",
  "塵",
  "聞",
  "揭",
  "炮",
  "殘",
  "冬",
  "橋",
  "婦",
  "警",
  "綜",
  "招",
  "吳",
  "付",
  "浮",
  "遭",
  "徐",
  "您",
  "搖",
  "谷",
  "贊",
  "箱",
  "隔",
  "訂",
  "男",
  "吹",
  "園",
  "紛",
  "唐",
  "敗",
  "宋",
  "玻",
  "巨",
  "耕",
  "坦",
  "榮",
  "閉",
  "灣",
  "鍵",
  "凡",
  "駐",
  "鍋",
  "救",
  "恩",
  "剝",
  "凝",
  "鹼",
  "齒",
  "截",
  "煉",
  "麻",
  "紡",
  "禁",
  "廢",
  "盛",
  "版",
  "緩",
  "淨",
  "睛",
  "昌",
  "婚",
  "涉",
  "筒",
  "嘴",
  "插",
  "岸",
  "朗",
  "莊",
  "街",
  "藏",
  "姑",
  "貿",
  "腐",
  "奴",
  "啦",
  "慣",
  "乘",
  "夥",
  "恢",
  "勻",
  "紗",
  "扎",
  "辯",
  "耳",
  "彪",
  "臣",
  "億",
  "璃",
  "抵",
  "脈",
  "秀",
  "薩",
  "俄",
  "網",
  "舞",
  "店",
  "噴",
  "縱",
  "寸",
  "汗",
  "掛",
  "洪",
  "賀",
  "閃",
  "柬",
  "爆",
  "烯",
  "津",
  "稻",
  "牆",
  "軟",
  "勇",
  "像",
  "滾",
  "厘",
  "蒙",
  "芳",
  "肯",
  "坡",
  "柱",
  "盪",
  "腿",
  "儀",
  "旅",
  "尾",
  "軋",
  "冰",
  "貢",
  "登",
  "黎",
  "削",
  "鑽",
  "勒",
  "逃",
  "障",
  "氨",
  "郭",
  "峰",
  "幣",
  "港",
  "伏",
  "軌",
  "畝",
  "畢",
  "擦",
  "莫",
  "刺",
  "浪",
  "秘",
  "援",
  "株",
  "健",
  "售",
  "股",
  "島",
  "甘",
  "泡",
  "睡",
  "童",
  "鑄",
  "湯",
  "閥",
  "休",
  "匯",
  "舍",
  "牧",
  "繞",
  "炸",
  "哲",
  "磷",
  "績",
  "朋",
  "淡",
  "尖",
  "啟",
  "陷",
  "柴",
  "呈",
  "徒",
  "顏",
  "淚",
  "稍",
  "忘",
  "泵",
  "藍",
  "拖",
  "洞",
  "授",
  "鏡",
  "辛",
  "壯",
  "鋒",
  "貧",
  "虛",
  "彎",
  "摩",
  "泰",
  "幼",
  "廷",
  "尊",
  "窗",
  "綱",
  "弄",
  "隸",
  "疑",
  "氏",
  "宮",
  "姐",
  "震",
  "瑞",
  "怪",
  "尤",
  "琴",
  "循",
  "描",
  "膜",
  "違",
  "夾",
  "腰",
  "緣",
  "珠",
  "窮",
  "森",
  "枝",
  "竹",
  "溝",
  "催",
  "繩",
  "憶",
  "邦",
  "剩",
  "幸",
  "漿",
  "欄",
  "擁",
  "牙",
  "貯",
  "禮",
  "濾",
  "鈉",
  "紋",
  "罷",
  "拍",
  "咱",
  "喊",
  "袖",
  "埃",
  "勤",
  "罰",
  "焦",
  "潛",
  "伍",
  "墨",
  "欲",
  "縫",
  "姓",
  "刊",
  "飽",
  "仿",
  "獎",
  "鋁",
  "鬼",
  "麗",
  "跨",
  "默",
  "挖",
  "鏈",
  "掃",
  "喝",
  "袋",
  "炭",
  "污",
  "幕",
  "諸",
  "弧",
  "勵",
  "梅",
  "奶",
  "潔",
  "災",
  "舟",
  "鑑",
  "苯",
  "訟",
  "抱",
  "毀",
  "懂",
  "寒",
  "智",
  "埔",
  "寄",
  "屆",
  "躍",
  "渡",
  "挑",
  "丹",
  "艱",
  "貝",
  "碰",
  "拔",
  "爹",
  "戴",
  "碼",
  "夢",
  "芽",
  "熔",
  "赤",
  "漁",
  "哭",
  "敬",
  "顆",
  "奔",
  "鉛",
  "仲",
  "虎",
  "稀",
  "妹",
  "乏",
  "珍",
  "申",
  "桌",
  "遵",
  "允",
  "隆",
  "螺",
  "倉",
  "魏",
  "銳",
  "曉",
  "氮",
  "兼",
  "隱",
  "礙",
  "赫",
  "撥",
  "忠",
  "肅",
  "缸",
  "牽",
  "搶",
  "博",
  "巧",
  "殼",
  "兄",
  "杜",
  "訊",
  "誠",
  "碧",
  "祥",
  "柯",
  "頁",
  "巡",
  "矩",
  "悲",
  "灌",
  "齡",
  "倫",
  "票",
  "尋",
  "桂",
  "鋪",
  "聖",
  "恐",
  "恰",
  "鄭",
  "趣",
  "抬",
  "荒",
  "騰",
  "貼",
  "柔",
  "滴",
  "猛",
  "闊",
  "輛",
  "妻",
  "填",
  "撤",
  "儲",
  "簽",
  "鬧",
  "擾",
  "紫",
  "砂",
  "遞",
  "戲",
  "吊",
  "陶",
  "伐",
  "餵",
  "療",
  "瓶",
  "婆",
  "撫",
  "臂",
  "摸",
  "忍",
  "蝦",
  "蠟",
  "鄰",
  "胸",
  "鞏",
  "擠",
  "偶",
  "棄",
  "槽",
  "勁",
  "乳",
  "鄧",
  "吉",
  "仁",
  "爛",
  "磚",
  "租",
  "烏",
  "艦",
  "伴",
  "瓜",
  "淺",
  "丙",
  "暫",
  "燥",
  "橡",
  "柳",
  "迷",
  "暖",
  "牌",
  "秧",
  "膽",
  "詳",
  "簧",
  "踏",
  "瓷",
  "譜",
  "呆",
  "賓",
  "糊",
  "洛",
  "輝",
  "憤",
  "競",
  "隙",
  "怒",
  "粘",
  "乃",
  "緒",
  "肩",
  "籍",
  "敏",
  "塗",
  "熙",
  "皆",
  "偵",
  "懸",
  "掘",
  "享",
  "糾",
  "醒",
  "狂",
  "鎖",
  "淀",
  "恨",
  "牲",
  "霸",
  "爬",
  "賞",
  "逆",
  "玩",
  "陵",
  "祝",
  "秒",
  "浙",
  "貌",
  "役",
  "彼",
  "悉",
  "鴨",
  "趨",
  "鳳",
  "晨",
  "畜",
  "輩",
  "秩",
  "卵",
  "署",
  "梯",
  "炎",
  "灘",
  "棋",
  "驅",
  "篩",
  "峽",
  "冒",
  "啥",
  "壽",
  "譯",
  "浸",
  "泉",
  "帽",
  "遲",
  "矽",
  "疆",
  "貸",
  "漏",
  "稿",
  "冠",
  "嫩",
  "脅",
  "芯",
  "牢",
  "叛",
  "蝕",
  "奧",
  "鳴",
  "嶺",
  "羊",
  "憑",
  "串",
  "塘",
  "繪",
  "酵",
  "融",
  "盆",
  "錫",
  "廟",
  "籌",
  "凍",
  "輔",
  "攝",
  "襲",
  "筋",
  "拒",
  "僚",
  "旱",
  "鉀",
  "鳥",
  "漆",
  "沈",
  "眉",
  "疏",
  "添",
  "棒",
  "穗",
  "硝",
  "韓",
  "逼",
  "扭",
  "僑",
  "涼",
  "挺",
  "碗",
  "栽",
  "炒",
  "杯",
  "患",
  "餾",
  "勸",
  "豪",
  "遼",
  "勃",
  "鴻",
  "旦",
  "吏",
  "拜",
  "狗",
  "埋",
  "輥",
  "掩",
  "飲",
  "搬",
  "罵",
  "辭",
  "勾",
  "扣",
  "估",
  "蔣",
  "絨",
  "霧",
  "丈",
  "朵",
  "姆",
  "擬",
  "宇",
  "輯",
  "陝",
  "雕",
  "償",
  "蓄",
  "崇",
  "剪",
  "倡",
  "廳",
  "咬",
  "駛",
  "薯",
  "刷",
  "斥",
  "番",
  "賦",
  "奉",
  "佛",
  "澆",
  "漫",
  "曼",
  "扇",
  "鈣",
  "桃",
  "扶",
  "仔",
  "返",
  "俗",
  "虧",
  "腔",
  "鞋",
  "棱",
  "覆",
  "框",
  "悄",
  "叔",
  "撞",
  "騙",
  "勘",
  "旺",
  "沸",
  "孤",
  "吐",
  "孟",
  "渠",
  "屈",
  "疾",
  "妙",
  "惜",
  "仰",
  "狠",
  "脹",
  "諧",
  "拋",
  "黴",
  "桑",
  "崗",
  "嘛",
  "衰",
  "盜",
  "滲",
  "臟",
  "賴",
  "湧",
  "甜",
  "曹",
  "閱",
  "肌",
  "哩",
  "厲",
  "烴",
  "緯",
  "毅",
  "昨",
  "偽",
  "症",
  "煮",
  "嘆",
  "釘",
  "搭",
  "莖",
  "籠",
  "酷",
  "偷",
  "弓",
  "錐",
  "恆",
  "傑",
  "坑",
  "鼻",
  "翼",
  "綸",
  "敘",
  "獄",
  "逮",
  "罐",
  "絡",
  "棚",
  "抑",
  "膨",
  "蔬",
  "寺",
  "驟",
  "穆",
  "冶",
  "枯",
  "冊",
  "屍",
  "凸",
  "紳",
  "坯",
  "犧",
  "焰",
  "轟",
  "欣",
  "晉",
  "瘦",
  "禦",
  "錠",
  "錦",
  "喪",
  "旬",
  "鍛",
  "壟",
  "搜",
  "撲",
  "邀",
  "亭",
  "酯",
  "邁",
  "舒",
  "脆",
  "酶",
  "閒",
  "憂",
  "酚",
  "頑",
  "羽",
  "漲",
  "卸",
  "仗",
  "陪",
  "闢",
  "懲",
  "杭",
  "姚",
  "肚",
  "捉",
  "飄",
  "漂",
  "昆",
  "欺",
  "吾",
  "郎",
  "烷",
  "汁",
  "呵",
  "飾",
  "蕭",
  "雅",
  "郵",
  "遷",
  "燕",
  "撒",
  "姻",
  "赴",
  "宴",
  "煩",
  "債",
  "帳",
  "斑",
  "鈴",
  "旨",
  "醇",
  "董",
  "餅",
  "雛",
  "姿",
  "拌",
  "傅",
  "腹",
  "妥",
  "揉",
  "賢",
  "拆",
  "歪",
  "葡",
  "胺",
  "丟",
  "浩",
  "徽",
  "昂",
  "墊",
  "擋",
  "覽",
  "貪",
  "慰",
  "繳",
  "汪",
  "慌",
  "馮",
  "諾",
  "姜",
  "誼",
  "兇",
  "劣",
  "誣",
  "耀",
  "昏",
  "躺",
  "盈",
  "騎",
  "喬",
  "溪",
  "叢",
  "盧",
  "抹",
  "悶",
  "諮",
  "刮",
  "駕",
  "纜",
  "悟",
  "摘",
  "鉺",
  "擲",
  "頗",
  "幻",
  "柄",
  "惠",
  "慘",
  "佳",
  "仇",
  "臘",
  "窩",
  "滌",
  "劍",
  "瞧",
  "堡",
  "潑",
  "蔥",
  "罩",
  "霍",
  "撈",
  "胎",
  "蒼",
  "濱",
  "倆",
  "捅",
  "湘",
  "砍",
  "霞",
  "邵",
  "萄",
  "瘋",
  "淮",
  "遂",
  "熊",
  "糞",
  "烘",
  "宿",
  "檔",
  "戈",
  "駁",
  "嫂",
  "裕",
  "徙",
  "箭",
  "捐",
  "腸",
  "撐",
  "曬",
  "辨",
  "殿",
  "蓮",
  "攤",
  "攪",
  "醬",
  "屏",
  "疫",
  "哀",
  "蔡",
  "堵",
  "沫",
  "皺",
  "暢",
  "疊",
  "閣",
  "萊",
  "敲",
  "轄",
  "鉤",
  "痕",
  "壩",
  "巷",
  "餓",
  "禍",
  "丘",
  "玄",
  "溜",
  "曰",
  "邏",
  "彭",
  "嘗",
  "卿",
  "妨",
  "艇",
  "吞",
  "韋",
  "怨",
  "矮",
  "歇"
];
const require$$3 = [
  "가격",
  "가끔",
  "가난",
  "가능",
  "가득",
  "가르침",
  "가뭄",
  "가방",
  "가상",
  "가슴",
  "가운데",
  "가을",
  "가이드",
  "가입",
  "가장",
  "가정",
  "가족",
  "가죽",
  "각오",
  "각자",
  "간격",
  "간부",
  "간섭",
  "간장",
  "간접",
  "간판",
  "갈등",
  "갈비",
  "갈색",
  "갈증",
  "감각",
  "감기",
  "감소",
  "감수성",
  "감자",
  "감정",
  "갑자기",
  "강남",
  "강당",
  "강도",
  "강력히",
  "강변",
  "강북",
  "강사",
  "강수량",
  "강아지",
  "강원도",
  "강의",
  "강제",
  "강조",
  "같이",
  "개구리",
  "개나리",
  "개방",
  "개별",
  "개선",
  "개성",
  "개인",
  "객관적",
  "거실",
  "거액",
  "거울",
  "거짓",
  "거품",
  "걱정",
  "건강",
  "건물",
  "건설",
  "건조",
  "건축",
  "걸음",
  "검사",
  "검토",
  "게시판",
  "게임",
  "겨울",
  "견해",
  "결과",
  "결국",
  "결론",
  "결석",
  "결승",
  "결심",
  "결정",
  "결혼",
  "경계",
  "경고",
  "경기",
  "경력",
  "경복궁",
  "경비",
  "경상도",
  "경영",
  "경우",
  "경쟁",
  "경제",
  "경주",
  "경찰",
  "경치",
  "경향",
  "경험",
  "계곡",
  "계단",
  "계란",
  "계산",
  "계속",
  "계약",
  "계절",
  "계층",
  "계획",
  "고객",
  "고구려",
  "고궁",
  "고급",
  "고등학생",
  "고무신",
  "고민",
  "고양이",
  "고장",
  "고전",
  "고집",
  "고춧가루",
  "고통",
  "고향",
  "곡식",
  "골목",
  "골짜기",
  "골프",
  "공간",
  "공개",
  "공격",
  "공군",
  "공급",
  "공기",
  "공동",
  "공무원",
  "공부",
  "공사",
  "공식",
  "공업",
  "공연",
  "공원",
  "공장",
  "공짜",
  "공책",
  "공통",
  "공포",
  "공항",
  "공휴일",
  "과목",
  "과일",
  "과장",
  "과정",
  "과학",
  "관객",
  "관계",
  "관광",
  "관념",
  "관람",
  "관련",
  "관리",
  "관습",
  "관심",
  "관점",
  "관찰",
  "광경",
  "광고",
  "광장",
  "광주",
  "괴로움",
  "굉장히",
  "교과서",
  "교문",
  "교복",
  "교실",
  "교양",
  "교육",
  "교장",
  "교직",
  "교통",
  "교환",
  "교훈",
  "구경",
  "구름",
  "구멍",
  "구별",
  "구분",
  "구석",
  "구성",
  "구속",
  "구역",
  "구입",
  "구청",
  "구체적",
  "국가",
  "국기",
  "국내",
  "국립",
  "국물",
  "국민",
  "국수",
  "국어",
  "국왕",
  "국적",
  "국제",
  "국회",
  "군대",
  "군사",
  "군인",
  "궁극적",
  "권리",
  "권위",
  "권투",
  "귀국",
  "귀신",
  "규정",
  "규칙",
  "균형",
  "그날",
  "그냥",
  "그늘",
  "그러나",
  "그룹",
  "그릇",
  "그림",
  "그제서야",
  "그토록",
  "극복",
  "극히",
  "근거",
  "근교",
  "근래",
  "근로",
  "근무",
  "근본",
  "근원",
  "근육",
  "근처",
  "글씨",
  "글자",
  "금강산",
  "금고",
  "금년",
  "금메달",
  "금액",
  "금연",
  "금요일",
  "금지",
  "긍정적",
  "기간",
  "기관",
  "기념",
  "기능",
  "기독교",
  "기둥",
  "기록",
  "기름",
  "기법",
  "기본",
  "기분",
  "기쁨",
  "기숙사",
  "기술",
  "기억",
  "기업",
  "기온",
  "기운",
  "기원",
  "기적",
  "기준",
  "기침",
  "기혼",
  "기획",
  "긴급",
  "긴장",
  "길이",
  "김밥",
  "김치",
  "김포공항",
  "깍두기",
  "깜빡",
  "깨달음",
  "깨소금",
  "껍질",
  "꼭대기",
  "꽃잎",
  "나들이",
  "나란히",
  "나머지",
  "나물",
  "나침반",
  "나흘",
  "낙엽",
  "난방",
  "날개",
  "날씨",
  "날짜",
  "남녀",
  "남대문",
  "남매",
  "남산",
  "남자",
  "남편",
  "남학생",
  "낭비",
  "낱말",
  "내년",
  "내용",
  "내일",
  "냄비",
  "냄새",
  "냇물",
  "냉동",
  "냉면",
  "냉방",
  "냉장고",
  "넥타이",
  "넷째",
  "노동",
  "노란색",
  "노력",
  "노인",
  "녹음",
  "녹차",
  "녹화",
  "논리",
  "논문",
  "논쟁",
  "놀이",
  "농구",
  "농담",
  "농민",
  "농부",
  "농업",
  "농장",
  "농촌",
  "높이",
  "눈동자",
  "눈물",
  "눈썹",
  "뉴욕",
  "느낌",
  "늑대",
  "능동적",
  "능력",
  "다방",
  "다양성",
  "다음",
  "다이어트",
  "다행",
  "단계",
  "단골",
  "단독",
  "단맛",
  "단순",
  "단어",
  "단위",
  "단점",
  "단체",
  "단추",
  "단편",
  "단풍",
  "달걀",
  "달러",
  "달력",
  "달리",
  "닭고기",
  "담당",
  "담배",
  "담요",
  "담임",
  "답변",
  "답장",
  "당근",
  "당분간",
  "당연히",
  "당장",
  "대규모",
  "대낮",
  "대단히",
  "대답",
  "대도시",
  "대략",
  "대량",
  "대륙",
  "대문",
  "대부분",
  "대신",
  "대응",
  "대장",
  "대전",
  "대접",
  "대중",
  "대책",
  "대출",
  "대충",
  "대통령",
  "대학",
  "대한민국",
  "대합실",
  "대형",
  "덩어리",
  "데이트",
  "도대체",
  "도덕",
  "도둑",
  "도망",
  "도서관",
  "도심",
  "도움",
  "도입",
  "도자기",
  "도저히",
  "도전",
  "도중",
  "도착",
  "독감",
  "독립",
  "독서",
  "독일",
  "독창적",
  "동화책",
  "뒷모습",
  "뒷산",
  "딸아이",
  "마누라",
  "마늘",
  "마당",
  "마라톤",
  "마련",
  "마무리",
  "마사지",
  "마약",
  "마요네즈",
  "마을",
  "마음",
  "마이크",
  "마중",
  "마지막",
  "마찬가지",
  "마찰",
  "마흔",
  "막걸리",
  "막내",
  "막상",
  "만남",
  "만두",
  "만세",
  "만약",
  "만일",
  "만점",
  "만족",
  "만화",
  "많이",
  "말기",
  "말씀",
  "말투",
  "맘대로",
  "망원경",
  "매년",
  "매달",
  "매력",
  "매번",
  "매스컴",
  "매일",
  "매장",
  "맥주",
  "먹이",
  "먼저",
  "먼지",
  "멀리",
  "메일",
  "며느리",
  "며칠",
  "면담",
  "멸치",
  "명단",
  "명령",
  "명예",
  "명의",
  "명절",
  "명칭",
  "명함",
  "모금",
  "모니터",
  "모델",
  "모든",
  "모범",
  "모습",
  "모양",
  "모임",
  "모조리",
  "모집",
  "모퉁이",
  "목걸이",
  "목록",
  "목사",
  "목소리",
  "목숨",
  "목적",
  "목표",
  "몰래",
  "몸매",
  "몸무게",
  "몸살",
  "몸속",
  "몸짓",
  "몸통",
  "몹시",
  "무관심",
  "무궁화",
  "무더위",
  "무덤",
  "무릎",
  "무슨",
  "무엇",
  "무역",
  "무용",
  "무조건",
  "무지개",
  "무척",
  "문구",
  "문득",
  "문법",
  "문서",
  "문제",
  "문학",
  "문화",
  "물가",
  "물건",
  "물결",
  "물고기",
  "물론",
  "물리학",
  "물음",
  "물질",
  "물체",
  "미국",
  "미디어",
  "미사일",
  "미술",
  "미역",
  "미용실",
  "미움",
  "미인",
  "미팅",
  "미혼",
  "민간",
  "민족",
  "민주",
  "믿음",
  "밀가루",
  "밀리미터",
  "밑바닥",
  "바가지",
  "바구니",
  "바나나",
  "바늘",
  "바닥",
  "바닷가",
  "바람",
  "바이러스",
  "바탕",
  "박물관",
  "박사",
  "박수",
  "반대",
  "반드시",
  "반말",
  "반발",
  "반성",
  "반응",
  "반장",
  "반죽",
  "반지",
  "반찬",
  "받침",
  "발가락",
  "발걸음",
  "발견",
  "발달",
  "발레",
  "발목",
  "발바닥",
  "발생",
  "발음",
  "발자국",
  "발전",
  "발톱",
  "발표",
  "밤하늘",
  "밥그릇",
  "밥맛",
  "밥상",
  "밥솥",
  "방금",
  "방면",
  "방문",
  "방바닥",
  "방법",
  "방송",
  "방식",
  "방안",
  "방울",
  "방지",
  "방학",
  "방해",
  "방향",
  "배경",
  "배꼽",
  "배달",
  "배드민턴",
  "백두산",
  "백색",
  "백성",
  "백인",
  "백제",
  "백화점",
  "버릇",
  "버섯",
  "버튼",
  "번개",
  "번역",
  "번지",
  "번호",
  "벌금",
  "벌레",
  "벌써",
  "범위",
  "범인",
  "범죄",
  "법률",
  "법원",
  "법적",
  "법칙",
  "베이징",
  "벨트",
  "변경",
  "변동",
  "변명",
  "변신",
  "변호사",
  "변화",
  "별도",
  "별명",
  "별일",
  "병실",
  "병아리",
  "병원",
  "보관",
  "보너스",
  "보라색",
  "보람",
  "보름",
  "보상",
  "보안",
  "보자기",
  "보장",
  "보전",
  "보존",
  "보통",
  "보편적",
  "보험",
  "복도",
  "복사",
  "복숭아",
  "복습",
  "볶음",
  "본격적",
  "본래",
  "본부",
  "본사",
  "본성",
  "본인",
  "본질",
  "볼펜",
  "봉사",
  "봉지",
  "봉투",
  "부근",
  "부끄러움",
  "부담",
  "부동산",
  "부문",
  "부분",
  "부산",
  "부상",
  "부엌",
  "부인",
  "부작용",
  "부장",
  "부정",
  "부족",
  "부지런히",
  "부친",
  "부탁",
  "부품",
  "부회장",
  "북부",
  "북한",
  "분노",
  "분량",
  "분리",
  "분명",
  "분석",
  "분야",
  "분위기",
  "분필",
  "분홍색",
  "불고기",
  "불과",
  "불교",
  "불꽃",
  "불만",
  "불법",
  "불빛",
  "불안",
  "불이익",
  "불행",
  "브랜드",
  "비극",
  "비난",
  "비닐",
  "비둘기",
  "비디오",
  "비로소",
  "비만",
  "비명",
  "비밀",
  "비바람",
  "비빔밥",
  "비상",
  "비용",
  "비율",
  "비중",
  "비타민",
  "비판",
  "빌딩",
  "빗물",
  "빗방울",
  "빗줄기",
  "빛깔",
  "빨간색",
  "빨래",
  "빨리",
  "사건",
  "사계절",
  "사나이",
  "사냥",
  "사람",
  "사랑",
  "사립",
  "사모님",
  "사물",
  "사방",
  "사상",
  "사생활",
  "사설",
  "사슴",
  "사실",
  "사업",
  "사용",
  "사월",
  "사장",
  "사전",
  "사진",
  "사촌",
  "사춘기",
  "사탕",
  "사투리",
  "사흘",
  "산길",
  "산부인과",
  "산업",
  "산책",
  "살림",
  "살인",
  "살짝",
  "삼계탕",
  "삼국",
  "삼십",
  "삼월",
  "삼촌",
  "상관",
  "상금",
  "상대",
  "상류",
  "상반기",
  "상상",
  "상식",
  "상업",
  "상인",
  "상자",
  "상점",
  "상처",
  "상추",
  "상태",
  "상표",
  "상품",
  "상황",
  "새벽",
  "색깔",
  "색연필",
  "생각",
  "생명",
  "생물",
  "생방송",
  "생산",
  "생선",
  "생신",
  "생일",
  "생활",
  "서랍",
  "서른",
  "서명",
  "서민",
  "서비스",
  "서양",
  "서울",
  "서적",
  "서점",
  "서쪽",
  "서클",
  "석사",
  "석유",
  "선거",
  "선물",
  "선배",
  "선생",
  "선수",
  "선원",
  "선장",
  "선전",
  "선택",
  "선풍기",
  "설거지",
  "설날",
  "설렁탕",
  "설명",
  "설문",
  "설사",
  "설악산",
  "설치",
  "설탕",
  "섭씨",
  "성공",
  "성당",
  "성명",
  "성별",
  "성인",
  "성장",
  "성적",
  "성질",
  "성함",
  "세금",
  "세미나",
  "세상",
  "세월",
  "세종대왕",
  "세탁",
  "센터",
  "센티미터",
  "셋째",
  "소규모",
  "소극적",
  "소금",
  "소나기",
  "소년",
  "소득",
  "소망",
  "소문",
  "소설",
  "소속",
  "소아과",
  "소용",
  "소원",
  "소음",
  "소중히",
  "소지품",
  "소질",
  "소풍",
  "소형",
  "속담",
  "속도",
  "속옷",
  "손가락",
  "손길",
  "손녀",
  "손님",
  "손등",
  "손목",
  "손뼉",
  "손실",
  "손질",
  "손톱",
  "손해",
  "솔직히",
  "솜씨",
  "송아지",
  "송이",
  "송편",
  "쇠고기",
  "쇼핑",
  "수건",
  "수년",
  "수단",
  "수돗물",
  "수동적",
  "수면",
  "수명",
  "수박",
  "수상",
  "수석",
  "수술",
  "수시로",
  "수업",
  "수염",
  "수영",
  "수입",
  "수준",
  "수집",
  "수출",
  "수컷",
  "수필",
  "수학",
  "수험생",
  "수화기",
  "숙녀",
  "숙소",
  "숙제",
  "순간",
  "순서",
  "순수",
  "순식간",
  "순위",
  "숟가락",
  "술병",
  "술집",
  "숫자",
  "스님",
  "스물",
  "스스로",
  "스승",
  "스웨터",
  "스위치",
  "스케이트",
  "스튜디오",
  "스트레스",
  "스포츠",
  "슬쩍",
  "슬픔",
  "습관",
  "습기",
  "승객",
  "승리",
  "승부",
  "승용차",
  "승진",
  "시각",
  "시간",
  "시골",
  "시금치",
  "시나리오",
  "시댁",
  "시리즈",
  "시멘트",
  "시민",
  "시부모",
  "시선",
  "시설",
  "시스템",
  "시아버지",
  "시어머니",
  "시월",
  "시인",
  "시일",
  "시작",
  "시장",
  "시절",
  "시점",
  "시중",
  "시즌",
  "시집",
  "시청",
  "시합",
  "시험",
  "식구",
  "식기",
  "식당",
  "식량",
  "식료품",
  "식물",
  "식빵",
  "식사",
  "식생활",
  "식초",
  "식탁",
  "식품",
  "신고",
  "신규",
  "신념",
  "신문",
  "신발",
  "신비",
  "신사",
  "신세",
  "신용",
  "신제품",
  "신청",
  "신체",
  "신화",
  "실감",
  "실내",
  "실력",
  "실례",
  "실망",
  "실수",
  "실습",
  "실시",
  "실장",
  "실정",
  "실질적",
  "실천",
  "실체",
  "실컷",
  "실태",
  "실패",
  "실험",
  "실현",
  "심리",
  "심부름",
  "심사",
  "심장",
  "심정",
  "심판",
  "쌍둥이",
  "씨름",
  "씨앗",
  "아가씨",
  "아나운서",
  "아드님",
  "아들",
  "아쉬움",
  "아스팔트",
  "아시아",
  "아울러",
  "아저씨",
  "아줌마",
  "아직",
  "아침",
  "아파트",
  "아프리카",
  "아픔",
  "아홉",
  "아흔",
  "악기",
  "악몽",
  "악수",
  "안개",
  "안경",
  "안과",
  "안내",
  "안녕",
  "안동",
  "안방",
  "안부",
  "안주",
  "알루미늄",
  "알코올",
  "암시",
  "암컷",
  "압력",
  "앞날",
  "앞문",
  "애인",
  "애정",
  "액수",
  "앨범",
  "야간",
  "야단",
  "야옹",
  "약간",
  "약국",
  "약속",
  "약수",
  "약점",
  "약품",
  "약혼녀",
  "양념",
  "양력",
  "양말",
  "양배추",
  "양주",
  "양파",
  "어둠",
  "어려움",
  "어른",
  "어젯밤",
  "어쨌든",
  "어쩌다가",
  "어쩐지",
  "언니",
  "언덕",
  "언론",
  "언어",
  "얼굴",
  "얼른",
  "얼음",
  "얼핏",
  "엄마",
  "업무",
  "업종",
  "업체",
  "엉덩이",
  "엉망",
  "엉터리",
  "엊그제",
  "에너지",
  "에어컨",
  "엔진",
  "여건",
  "여고생",
  "여관",
  "여군",
  "여권",
  "여대생",
  "여덟",
  "여동생",
  "여든",
  "여론",
  "여름",
  "여섯",
  "여성",
  "여왕",
  "여인",
  "여전히",
  "여직원",
  "여학생",
  "여행",
  "역사",
  "역시",
  "역할",
  "연결",
  "연구",
  "연극",
  "연기",
  "연락",
  "연설",
  "연세",
  "연속",
  "연습",
  "연애",
  "연예인",
  "연인",
  "연장",
  "연주",
  "연출",
  "연필",
  "연합",
  "연휴",
  "열기",
  "열매",
  "열쇠",
  "열심히",
  "열정",
  "열차",
  "열흘",
  "염려",
  "엽서",
  "영국",
  "영남",
  "영상",
  "영양",
  "영역",
  "영웅",
  "영원히",
  "영하",
  "영향",
  "영혼",
  "영화",
  "옆구리",
  "옆방",
  "옆집",
  "예감",
  "예금",
  "예방",
  "예산",
  "예상",
  "예선",
  "예술",
  "예습",
  "예식장",
  "예약",
  "예전",
  "예절",
  "예정",
  "예컨대",
  "옛날",
  "오늘",
  "오락",
  "오랫동안",
  "오렌지",
  "오로지",
  "오른발",
  "오븐",
  "오십",
  "오염",
  "오월",
  "오전",
  "오직",
  "오징어",
  "오페라",
  "오피스텔",
  "오히려",
  "옥상",
  "옥수수",
  "온갖",
  "온라인",
  "온몸",
  "온종일",
  "온통",
  "올가을",
  "올림픽",
  "올해",
  "옷차림",
  "와이셔츠",
  "와인",
  "완성",
  "완전",
  "왕비",
  "왕자",
  "왜냐하면",
  "왠지",
  "외갓집",
  "외국",
  "외로움",
  "외삼촌",
  "외출",
  "외침",
  "외할머니",
  "왼발",
  "왼손",
  "왼쪽",
  "요금",
  "요일",
  "요즘",
  "요청",
  "용기",
  "용서",
  "용어",
  "우산",
  "우선",
  "우승",
  "우연히",
  "우정",
  "우체국",
  "우편",
  "운동",
  "운명",
  "운반",
  "운전",
  "운행",
  "울산",
  "울음",
  "움직임",
  "웃어른",
  "웃음",
  "워낙",
  "원고",
  "원래",
  "원서",
  "원숭이",
  "원인",
  "원장",
  "원피스",
  "월급",
  "월드컵",
  "월세",
  "월요일",
  "웨이터",
  "위반",
  "위법",
  "위성",
  "위원",
  "위험",
  "위협",
  "윗사람",
  "유난히",
  "유럽",
  "유명",
  "유물",
  "유산",
  "유적",
  "유치원",
  "유학",
  "유행",
  "유형",
  "육군",
  "육상",
  "육십",
  "육체",
  "은행",
  "음력",
  "음료",
  "음반",
  "음성",
  "음식",
  "음악",
  "음주",
  "의견",
  "의논",
  "의문",
  "의복",
  "의식",
  "의심",
  "의외로",
  "의욕",
  "의원",
  "의학",
  "이것",
  "이곳",
  "이념",
  "이놈",
  "이달",
  "이대로",
  "이동",
  "이렇게",
  "이력서",
  "이론적",
  "이름",
  "이민",
  "이발소",
  "이별",
  "이불",
  "이빨",
  "이상",
  "이성",
  "이슬",
  "이야기",
  "이용",
  "이웃",
  "이월",
  "이윽고",
  "이익",
  "이전",
  "이중",
  "이튿날",
  "이틀",
  "이혼",
  "인간",
  "인격",
  "인공",
  "인구",
  "인근",
  "인기",
  "인도",
  "인류",
  "인물",
  "인생",
  "인쇄",
  "인연",
  "인원",
  "인재",
  "인종",
  "인천",
  "인체",
  "인터넷",
  "인하",
  "인형",
  "일곱",
  "일기",
  "일단",
  "일대",
  "일등",
  "일반",
  "일본",
  "일부",
  "일상",
  "일생",
  "일손",
  "일요일",
  "일월",
  "일정",
  "일종",
  "일주일",
  "일찍",
  "일체",
  "일치",
  "일행",
  "일회용",
  "임금",
  "임무",
  "입대",
  "입력",
  "입맛",
  "입사",
  "입술",
  "입시",
  "입원",
  "입장",
  "입학",
  "자가용",
  "자격",
  "자극",
  "자동",
  "자랑",
  "자부심",
  "자식",
  "자신",
  "자연",
  "자원",
  "자율",
  "자전거",
  "자정",
  "자존심",
  "자판",
  "작가",
  "작년",
  "작성",
  "작업",
  "작용",
  "작은딸",
  "작품",
  "잔디",
  "잔뜩",
  "잔치",
  "잘못",
  "잠깐",
  "잠수함",
  "잠시",
  "잠옷",
  "잠자리",
  "잡지",
  "장관",
  "장군",
  "장기간",
  "장래",
  "장례",
  "장르",
  "장마",
  "장면",
  "장모",
  "장미",
  "장비",
  "장사",
  "장소",
  "장식",
  "장애인",
  "장인",
  "장점",
  "장차",
  "장학금",
  "재능",
  "재빨리",
  "재산",
  "재생",
  "재작년",
  "재정",
  "재채기",
  "재판",
  "재학",
  "재활용",
  "저것",
  "저고리",
  "저곳",
  "저녁",
  "저런",
  "저렇게",
  "저번",
  "저울",
  "저절로",
  "저축",
  "적극",
  "적당히",
  "적성",
  "적용",
  "적응",
  "전개",
  "전공",
  "전기",
  "전달",
  "전라도",
  "전망",
  "전문",
  "전반",
  "전부",
  "전세",
  "전시",
  "전용",
  "전자",
  "전쟁",
  "전주",
  "전철",
  "전체",
  "전통",
  "전혀",
  "전후",
  "절대",
  "절망",
  "절반",
  "절약",
  "절차",
  "점검",
  "점수",
  "점심",
  "점원",
  "점점",
  "점차",
  "접근",
  "접시",
  "접촉",
  "젓가락",
  "정거장",
  "정도",
  "정류장",
  "정리",
  "정말",
  "정면",
  "정문",
  "정반대",
  "정보",
  "정부",
  "정비",
  "정상",
  "정성",
  "정오",
  "정원",
  "정장",
  "정지",
  "정치",
  "정확히",
  "제공",
  "제과점",
  "제대로",
  "제목",
  "제발",
  "제법",
  "제삿날",
  "제안",
  "제일",
  "제작",
  "제주도",
  "제출",
  "제품",
  "제한",
  "조각",
  "조건",
  "조금",
  "조깅",
  "조명",
  "조미료",
  "조상",
  "조선",
  "조용히",
  "조절",
  "조정",
  "조직",
  "존댓말",
  "존재",
  "졸업",
  "졸음",
  "종교",
  "종로",
  "종류",
  "종소리",
  "종업원",
  "종종",
  "종합",
  "좌석",
  "죄인",
  "주관적",
  "주름",
  "주말",
  "주머니",
  "주먹",
  "주문",
  "주민",
  "주방",
  "주변",
  "주식",
  "주인",
  "주일",
  "주장",
  "주전자",
  "주택",
  "준비",
  "줄거리",
  "줄기",
  "줄무늬",
  "중간",
  "중계방송",
  "중국",
  "중년",
  "중단",
  "중독",
  "중반",
  "중부",
  "중세",
  "중소기업",
  "중순",
  "중앙",
  "중요",
  "중학교",
  "즉석",
  "즉시",
  "즐거움",
  "증가",
  "증거",
  "증권",
  "증상",
  "증세",
  "지각",
  "지갑",
  "지경",
  "지극히",
  "지금",
  "지급",
  "지능",
  "지름길",
  "지리산",
  "지방",
  "지붕",
  "지식",
  "지역",
  "지우개",
  "지원",
  "지적",
  "지점",
  "지진",
  "지출",
  "직선",
  "직업",
  "직원",
  "직장",
  "진급",
  "진동",
  "진로",
  "진료",
  "진리",
  "진짜",
  "진찰",
  "진출",
  "진통",
  "진행",
  "질문",
  "질병",
  "질서",
  "짐작",
  "집단",
  "집안",
  "집중",
  "짜증",
  "찌꺼기",
  "차남",
  "차라리",
  "차량",
  "차림",
  "차별",
  "차선",
  "차츰",
  "착각",
  "찬물",
  "찬성",
  "참가",
  "참기름",
  "참새",
  "참석",
  "참여",
  "참외",
  "참조",
  "찻잔",
  "창가",
  "창고",
  "창구",
  "창문",
  "창밖",
  "창작",
  "창조",
  "채널",
  "채점",
  "책가방",
  "책방",
  "책상",
  "책임",
  "챔피언",
  "처벌",
  "처음",
  "천국",
  "천둥",
  "천장",
  "천재",
  "천천히",
  "철도",
  "철저히",
  "철학",
  "첫날",
  "첫째",
  "청년",
  "청바지",
  "청소",
  "청춘",
  "체계",
  "체력",
  "체온",
  "체육",
  "체중",
  "체험",
  "초등학생",
  "초반",
  "초밥",
  "초상화",
  "초순",
  "초여름",
  "초원",
  "초저녁",
  "초점",
  "초청",
  "초콜릿",
  "촛불",
  "총각",
  "총리",
  "총장",
  "촬영",
  "최근",
  "최상",
  "최선",
  "최신",
  "최악",
  "최종",
  "추석",
  "추억",
  "추진",
  "추천",
  "추측",
  "축구",
  "축소",
  "축제",
  "축하",
  "출근",
  "출발",
  "출산",
  "출신",
  "출연",
  "출입",
  "출장",
  "출판",
  "충격",
  "충고",
  "충돌",
  "충분히",
  "충청도",
  "취업",
  "취직",
  "취향",
  "치약",
  "친구",
  "친척",
  "칠십",
  "칠월",
  "칠판",
  "침대",
  "침묵",
  "침실",
  "칫솔",
  "칭찬",
  "카메라",
  "카운터",
  "칼국수",
  "캐릭터",
  "캠퍼스",
  "캠페인",
  "커튼",
  "컨디션",
  "컬러",
  "컴퓨터",
  "코끼리",
  "코미디",
  "콘서트",
  "콜라",
  "콤플렉스",
  "콩나물",
  "쾌감",
  "쿠데타",
  "크림",
  "큰길",
  "큰딸",
  "큰소리",
  "큰아들",
  "큰어머니",
  "큰일",
  "큰절",
  "클래식",
  "클럽",
  "킬로",
  "타입",
  "타자기",
  "탁구",
  "탁자",
  "탄생",
  "태권도",
  "태양",
  "태풍",
  "택시",
  "탤런트",
  "터널",
  "터미널",
  "테니스",
  "테스트",
  "테이블",
  "텔레비전",
  "토론",
  "토마토",
  "토요일",
  "통계",
  "통과",
  "통로",
  "통신",
  "통역",
  "통일",
  "통장",
  "통제",
  "통증",
  "통합",
  "통화",
  "퇴근",
  "퇴원",
  "퇴직금",
  "튀김",
  "트럭",
  "특급",
  "특별",
  "특성",
  "특수",
  "특징",
  "특히",
  "튼튼히",
  "티셔츠",
  "파란색",
  "파일",
  "파출소",
  "판결",
  "판단",
  "판매",
  "판사",
  "팔십",
  "팔월",
  "팝송",
  "패션",
  "팩스",
  "팩시밀리",
  "팬티",
  "퍼센트",
  "페인트",
  "편견",
  "편의",
  "편지",
  "편히",
  "평가",
  "평균",
  "평생",
  "평소",
  "평양",
  "평일",
  "평화",
  "포스터",
  "포인트",
  "포장",
  "포함",
  "표면",
  "표정",
  "표준",
  "표현",
  "품목",
  "품질",
  "풍경",
  "풍속",
  "풍습",
  "프랑스",
  "프린터",
  "플라스틱",
  "피곤",
  "피망",
  "피아노",
  "필름",
  "필수",
  "필요",
  "필자",
  "필통",
  "핑계",
  "하느님",
  "하늘",
  "하드웨어",
  "하룻밤",
  "하반기",
  "하숙집",
  "하순",
  "하여튼",
  "하지만",
  "하천",
  "하품",
  "하필",
  "학과",
  "학교",
  "학급",
  "학기",
  "학년",
  "학력",
  "학번",
  "학부모",
  "학비",
  "학생",
  "학술",
  "학습",
  "학용품",
  "학원",
  "학위",
  "학자",
  "학점",
  "한계",
  "한글",
  "한꺼번에",
  "한낮",
  "한눈",
  "한동안",
  "한때",
  "한라산",
  "한마디",
  "한문",
  "한번",
  "한복",
  "한식",
  "한여름",
  "한쪽",
  "할머니",
  "할아버지",
  "할인",
  "함께",
  "함부로",
  "합격",
  "합리적",
  "항공",
  "항구",
  "항상",
  "항의",
  "해결",
  "해군",
  "해답",
  "해당",
  "해물",
  "해석",
  "해설",
  "해수욕장",
  "해안",
  "핵심",
  "핸드백",
  "햄버거",
  "햇볕",
  "햇살",
  "행동",
  "행복",
  "행사",
  "행운",
  "행위",
  "향기",
  "향상",
  "향수",
  "허락",
  "허용",
  "헬기",
  "현관",
  "현금",
  "현대",
  "현상",
  "현실",
  "현장",
  "현재",
  "현지",
  "혈액",
  "협력",
  "형부",
  "형사",
  "형수",
  "형식",
  "형제",
  "형태",
  "형편",
  "혜택",
  "호기심",
  "호남",
  "호랑이",
  "호박",
  "호텔",
  "호흡",
  "혹시",
  "홀로",
  "홈페이지",
  "홍보",
  "홍수",
  "홍차",
  "화면",
  "화분",
  "화살",
  "화요일",
  "화장",
  "화학",
  "확보",
  "확인",
  "확장",
  "확정",
  "환갑",
  "환경",
  "환영",
  "환율",
  "환자",
  "활기",
  "활동",
  "활발히",
  "활용",
  "활짝",
  "회견",
  "회관",
  "회복",
  "회색",
  "회원",
  "회장",
  "회전",
  "횟수",
  "횡단보도",
  "효율적",
  "후반",
  "후춧가루",
  "훈련",
  "훨씬",
  "휴식",
  "휴일",
  "흉내",
  "흐름",
  "흑백",
  "흑인",
  "흔적",
  "흔히",
  "흥미",
  "흥분",
  "희곡",
  "희망",
  "희생",
  "흰색",
  "힘껏"
];
const require$$4 = [
  "abaisser",
  "abandon",
  "abdiquer",
  "abeille",
  "abolir",
  "aborder",
  "aboutir",
  "aboyer",
  "abrasif",
  "abreuver",
  "abriter",
  "abroger",
  "abrupt",
  "absence",
  "absolu",
  "absurde",
  "abusif",
  "abyssal",
  "académie",
  "acajou",
  "acarien",
  "accabler",
  "accepter",
  "acclamer",
  "accolade",
  "accroche",
  "accuser",
  "acerbe",
  "achat",
  "acheter",
  "aciduler",
  "acier",
  "acompte",
  "acquérir",
  "acronyme",
  "acteur",
  "actif",
  "actuel",
  "adepte",
  "adéquat",
  "adhésif",
  "adjectif",
  "adjuger",
  "admettre",
  "admirer",
  "adopter",
  "adorer",
  "adoucir",
  "adresse",
  "adroit",
  "adulte",
  "adverbe",
  "aérer",
  "aéronef",
  "affaire",
  "affecter",
  "affiche",
  "affreux",
  "affubler",
  "agacer",
  "agencer",
  "agile",
  "agiter",
  "agrafer",
  "agréable",
  "agrume",
  "aider",
  "aiguille",
  "ailier",
  "aimable",
  "aisance",
  "ajouter",
  "ajuster",
  "alarmer",
  "alchimie",
  "alerte",
  "algèbre",
  "algue",
  "aliéner",
  "aliment",
  "alléger",
  "alliage",
  "allouer",
  "allumer",
  "alourdir",
  "alpaga",
  "altesse",
  "alvéole",
  "amateur",
  "ambigu",
  "ambre",
  "aménager",
  "amertume",
  "amidon",
  "amiral",
  "amorcer",
  "amour",
  "amovible",
  "amphibie",
  "ampleur",
  "amusant",
  "analyse",
  "anaphore",
  "anarchie",
  "anatomie",
  "ancien",
  "anéantir",
  "angle",
  "angoisse",
  "anguleux",
  "animal",
  "annexer",
  "annonce",
  "annuel",
  "anodin",
  "anomalie",
  "anonyme",
  "anormal",
  "antenne",
  "antidote",
  "anxieux",
  "apaiser",
  "apéritif",
  "aplanir",
  "apologie",
  "appareil",
  "appeler",
  "apporter",
  "appuyer",
  "aquarium",
  "aqueduc",
  "arbitre",
  "arbuste",
  "ardeur",
  "ardoise",
  "argent",
  "arlequin",
  "armature",
  "armement",
  "armoire",
  "armure",
  "arpenter",
  "arracher",
  "arriver",
  "arroser",
  "arsenic",
  "artériel",
  "article",
  "aspect",
  "asphalte",
  "aspirer",
  "assaut",
  "asservir",
  "assiette",
  "associer",
  "assurer",
  "asticot",
  "astre",
  "astuce",
  "atelier",
  "atome",
  "atrium",
  "atroce",
  "attaque",
  "attentif",
  "attirer",
  "attraper",
  "aubaine",
  "auberge",
  "audace",
  "audible",
  "augurer",
  "aurore",
  "automne",
  "autruche",
  "avaler",
  "avancer",
  "avarice",
  "avenir",
  "averse",
  "aveugle",
  "aviateur",
  "avide",
  "avion",
  "aviser",
  "avoine",
  "avouer",
  "avril",
  "axial",
  "axiome",
  "badge",
  "bafouer",
  "bagage",
  "baguette",
  "baignade",
  "balancer",
  "balcon",
  "baleine",
  "balisage",
  "bambin",
  "bancaire",
  "bandage",
  "banlieue",
  "bannière",
  "banquier",
  "barbier",
  "baril",
  "baron",
  "barque",
  "barrage",
  "bassin",
  "bastion",
  "bataille",
  "bateau",
  "batterie",
  "baudrier",
  "bavarder",
  "belette",
  "bélier",
  "belote",
  "bénéfice",
  "berceau",
  "berger",
  "berline",
  "bermuda",
  "besace",
  "besogne",
  "bétail",
  "beurre",
  "biberon",
  "bicycle",
  "bidule",
  "bijou",
  "bilan",
  "bilingue",
  "billard",
  "binaire",
  "biologie",
  "biopsie",
  "biotype",
  "biscuit",
  "bison",
  "bistouri",
  "bitume",
  "bizarre",
  "blafard",
  "blague",
  "blanchir",
  "blessant",
  "blinder",
  "blond",
  "bloquer",
  "blouson",
  "bobard",
  "bobine",
  "boire",
  "boiser",
  "bolide",
  "bonbon",
  "bondir",
  "bonheur",
  "bonifier",
  "bonus",
  "bordure",
  "borne",
  "botte",
  "boucle",
  "boueux",
  "bougie",
  "boulon",
  "bouquin",
  "bourse",
  "boussole",
  "boutique",
  "boxeur",
  "branche",
  "brasier",
  "brave",
  "brebis",
  "brèche",
  "breuvage",
  "bricoler",
  "brigade",
  "brillant",
  "brioche",
  "brique",
  "brochure",
  "broder",
  "bronzer",
  "brousse",
  "broyeur",
  "brume",
  "brusque",
  "brutal",
  "bruyant",
  "buffle",
  "buisson",
  "bulletin",
  "bureau",
  "burin",
  "bustier",
  "butiner",
  "butoir",
  "buvable",
  "buvette",
  "cabanon",
  "cabine",
  "cachette",
  "cadeau",
  "cadre",
  "caféine",
  "caillou",
  "caisson",
  "calculer",
  "calepin",
  "calibre",
  "calmer",
  "calomnie",
  "calvaire",
  "camarade",
  "caméra",
  "camion",
  "campagne",
  "canal",
  "caneton",
  "canon",
  "cantine",
  "canular",
  "capable",
  "caporal",
  "caprice",
  "capsule",
  "capter",
  "capuche",
  "carabine",
  "carbone",
  "caresser",
  "caribou",
  "carnage",
  "carotte",
  "carreau",
  "carton",
  "cascade",
  "casier",
  "casque",
  "cassure",
  "causer",
  "caution",
  "cavalier",
  "caverne",
  "caviar",
  "cédille",
  "ceinture",
  "céleste",
  "cellule",
  "cendrier",
  "censurer",
  "central",
  "cercle",
  "cérébral",
  "cerise",
  "cerner",
  "cerveau",
  "cesser",
  "chagrin",
  "chaise",
  "chaleur",
  "chambre",
  "chance",
  "chapitre",
  "charbon",
  "chasseur",
  "chaton",
  "chausson",
  "chavirer",
  "chemise",
  "chenille",
  "chéquier",
  "chercher",
  "cheval",
  "chien",
  "chiffre",
  "chignon",
  "chimère",
  "chiot",
  "chlorure",
  "chocolat",
  "choisir",
  "chose",
  "chouette",
  "chrome",
  "chute",
  "cigare",
  "cigogne",
  "cimenter",
  "cinéma",
  "cintrer",
  "circuler",
  "cirer",
  "cirque",
  "citerne",
  "citoyen",
  "citron",
  "civil",
  "clairon",
  "clameur",
  "claquer",
  "classe",
  "clavier",
  "client",
  "cligner",
  "climat",
  "clivage",
  "cloche",
  "clonage",
  "cloporte",
  "cobalt",
  "cobra",
  "cocasse",
  "cocotier",
  "coder",
  "codifier",
  "coffre",
  "cogner",
  "cohésion",
  "coiffer",
  "coincer",
  "colère",
  "colibri",
  "colline",
  "colmater",
  "colonel",
  "combat",
  "comédie",
  "commande",
  "compact",
  "concert",
  "conduire",
  "confier",
  "congeler",
  "connoter",
  "consonne",
  "contact",
  "convexe",
  "copain",
  "copie",
  "corail",
  "corbeau",
  "cordage",
  "corniche",
  "corpus",
  "correct",
  "cortège",
  "cosmique",
  "costume",
  "coton",
  "coude",
  "coupure",
  "courage",
  "couteau",
  "couvrir",
  "coyote",
  "crabe",
  "crainte",
  "cravate",
  "crayon",
  "créature",
  "créditer",
  "crémeux",
  "creuser",
  "crevette",
  "cribler",
  "crier",
  "cristal",
  "critère",
  "croire",
  "croquer",
  "crotale",
  "crucial",
  "cruel",
  "crypter",
  "cubique",
  "cueillir",
  "cuillère",
  "cuisine",
  "cuivre",
  "culminer",
  "cultiver",
  "cumuler",
  "cupide",
  "curatif",
  "curseur",
  "cyanure",
  "cycle",
  "cylindre",
  "cynique",
  "daigner",
  "damier",
  "danger",
  "danseur",
  "dauphin",
  "débattre",
  "débiter",
  "déborder",
  "débrider",
  "débutant",
  "décaler",
  "décembre",
  "déchirer",
  "décider",
  "déclarer",
  "décorer",
  "décrire",
  "décupler",
  "dédale",
  "déductif",
  "déesse",
  "défensif",
  "défiler",
  "défrayer",
  "dégager",
  "dégivrer",
  "déglutir",
  "dégrafer",
  "déjeuner",
  "délice",
  "déloger",
  "demander",
  "demeurer",
  "démolir",
  "dénicher",
  "dénouer",
  "dentelle",
  "dénuder",
  "départ",
  "dépenser",
  "déphaser",
  "déplacer",
  "déposer",
  "déranger",
  "dérober",
  "désastre",
  "descente",
  "désert",
  "désigner",
  "désobéir",
  "dessiner",
  "destrier",
  "détacher",
  "détester",
  "détourer",
  "détresse",
  "devancer",
  "devenir",
  "deviner",
  "devoir",
  "diable",
  "dialogue",
  "diamant",
  "dicter",
  "différer",
  "digérer",
  "digital",
  "digne",
  "diluer",
  "dimanche",
  "diminuer",
  "dioxyde",
  "directif",
  "diriger",
  "discuter",
  "disposer",
  "dissiper",
  "distance",
  "divertir",
  "diviser",
  "docile",
  "docteur",
  "dogme",
  "doigt",
  "domaine",
  "domicile",
  "dompter",
  "donateur",
  "donjon",
  "donner",
  "dopamine",
  "dortoir",
  "dorure",
  "dosage",
  "doseur",
  "dossier",
  "dotation",
  "douanier",
  "double",
  "douceur",
  "douter",
  "doyen",
  "dragon",
  "draper",
  "dresser",
  "dribbler",
  "droiture",
  "duperie",
  "duplexe",
  "durable",
  "durcir",
  "dynastie",
  "éblouir",
  "écarter",
  "écharpe",
  "échelle",
  "éclairer",
  "éclipse",
  "éclore",
  "écluse",
  "école",
  "économie",
  "écorce",
  "écouter",
  "écraser",
  "écrémer",
  "écrivain",
  "écrou",
  "écume",
  "écureuil",
  "édifier",
  "éduquer",
  "effacer",
  "effectif",
  "effigie",
  "effort",
  "effrayer",
  "effusion",
  "égaliser",
  "égarer",
  "éjecter",
  "élaborer",
  "élargir",
  "électron",
  "élégant",
  "éléphant",
  "élève",
  "éligible",
  "élitisme",
  "éloge",
  "élucider",
  "éluder",
  "emballer",
  "embellir",
  "embryon",
  "émeraude",
  "émission",
  "emmener",
  "émotion",
  "émouvoir",
  "empereur",
  "employer",
  "emporter",
  "emprise",
  "émulsion",
  "encadrer",
  "enchère",
  "enclave",
  "encoche",
  "endiguer",
  "endosser",
  "endroit",
  "enduire",
  "énergie",
  "enfance",
  "enfermer",
  "enfouir",
  "engager",
  "engin",
  "englober",
  "énigme",
  "enjamber",
  "enjeu",
  "enlever",
  "ennemi",
  "ennuyeux",
  "enrichir",
  "enrobage",
  "enseigne",
  "entasser",
  "entendre",
  "entier",
  "entourer",
  "entraver",
  "énumérer",
  "envahir",
  "enviable",
  "envoyer",
  "enzyme",
  "éolien",
  "épaissir",
  "épargne",
  "épatant",
  "épaule",
  "épicerie",
  "épidémie",
  "épier",
  "épilogue",
  "épine",
  "épisode",
  "épitaphe",
  "époque",
  "épreuve",
  "éprouver",
  "épuisant",
  "équerre",
  "équipe",
  "ériger",
  "érosion",
  "erreur",
  "éruption",
  "escalier",
  "espadon",
  "espèce",
  "espiègle",
  "espoir",
  "esprit",
  "esquiver",
  "essayer",
  "essence",
  "essieu",
  "essorer",
  "estime",
  "estomac",
  "estrade",
  "étagère",
  "étaler",
  "étanche",
  "étatique",
  "éteindre",
  "étendoir",
  "éternel",
  "éthanol",
  "éthique",
  "ethnie",
  "étirer",
  "étoffer",
  "étoile",
  "étonnant",
  "étourdir",
  "étrange",
  "étroit",
  "étude",
  "euphorie",
  "évaluer",
  "évasion",
  "éventail",
  "évidence",
  "éviter",
  "évolutif",
  "évoquer",
  "exact",
  "exagérer",
  "exaucer",
  "exceller",
  "excitant",
  "exclusif",
  "excuse",
  "exécuter",
  "exemple",
  "exercer",
  "exhaler",
  "exhorter",
  "exigence",
  "exiler",
  "exister",
  "exotique",
  "expédier",
  "explorer",
  "exposer",
  "exprimer",
  "exquis",
  "extensif",
  "extraire",
  "exulter",
  "fable",
  "fabuleux",
  "facette",
  "facile",
  "facture",
  "faiblir",
  "falaise",
  "fameux",
  "famille",
  "farceur",
  "farfelu",
  "farine",
  "farouche",
  "fasciner",
  "fatal",
  "fatigue",
  "faucon",
  "fautif",
  "faveur",
  "favori",
  "fébrile",
  "féconder",
  "fédérer",
  "félin",
  "femme",
  "fémur",
  "fendoir",
  "féodal",
  "fermer",
  "féroce",
  "ferveur",
  "festival",
  "feuille",
  "feutre",
  "février",
  "fiasco",
  "ficeler",
  "fictif",
  "fidèle",
  "figure",
  "filature",
  "filetage",
  "filière",
  "filleul",
  "filmer",
  "filou",
  "filtrer",
  "financer",
  "finir",
  "fiole",
  "firme",
  "fissure",
  "fixer",
  "flairer",
  "flamme",
  "flasque",
  "flatteur",
  "fléau",
  "flèche",
  "fleur",
  "flexion",
  "flocon",
  "flore",
  "fluctuer",
  "fluide",
  "fluvial",
  "folie",
  "fonderie",
  "fongible",
  "fontaine",
  "forcer",
  "forgeron",
  "formuler",
  "fortune",
  "fossile",
  "foudre",
  "fougère",
  "fouiller",
  "foulure",
  "fourmi",
  "fragile",
  "fraise",
  "franchir",
  "frapper",
  "frayeur",
  "frégate",
  "freiner",
  "frelon",
  "frémir",
  "frénésie",
  "frère",
  "friable",
  "friction",
  "frisson",
  "frivole",
  "froid",
  "fromage",
  "frontal",
  "frotter",
  "fruit",
  "fugitif",
  "fuite",
  "fureur",
  "furieux",
  "furtif",
  "fusion",
  "futur",
  "gagner",
  "galaxie",
  "galerie",
  "gambader",
  "garantir",
  "gardien",
  "garnir",
  "garrigue",
  "gazelle",
  "gazon",
  "géant",
  "gélatine",
  "gélule",
  "gendarme",
  "général",
  "génie",
  "genou",
  "gentil",
  "géologie",
  "géomètre",
  "géranium",
  "germe",
  "gestuel",
  "geyser",
  "gibier",
  "gicler",
  "girafe",
  "givre",
  "glace",
  "glaive",
  "glisser",
  "globe",
  "gloire",
  "glorieux",
  "golfeur",
  "gomme",
  "gonfler",
  "gorge",
  "gorille",
  "goudron",
  "gouffre",
  "goulot",
  "goupille",
  "gourmand",
  "goutte",
  "graduel",
  "graffiti",
  "graine",
  "grand",
  "grappin",
  "gratuit",
  "gravir",
  "grenat",
  "griffure",
  "griller",
  "grimper",
  "grogner",
  "gronder",
  "grotte",
  "groupe",
  "gruger",
  "grutier",
  "gruyère",
  "guépard",
  "guerrier",
  "guide",
  "guimauve",
  "guitare",
  "gustatif",
  "gymnaste",
  "gyrostat",
  "habitude",
  "hachoir",
  "halte",
  "hameau",
  "hangar",
  "hanneton",
  "haricot",
  "harmonie",
  "harpon",
  "hasard",
  "hélium",
  "hématome",
  "herbe",
  "hérisson",
  "hermine",
  "héron",
  "hésiter",
  "heureux",
  "hiberner",
  "hibou",
  "hilarant",
  "histoire",
  "hiver",
  "homard",
  "hommage",
  "homogène",
  "honneur",
  "honorer",
  "honteux",
  "horde",
  "horizon",
  "horloge",
  "hormone",
  "horrible",
  "houleux",
  "housse",
  "hublot",
  "huileux",
  "humain",
  "humble",
  "humide",
  "humour",
  "hurler",
  "hydromel",
  "hygiène",
  "hymne",
  "hypnose",
  "idylle",
  "ignorer",
  "iguane",
  "illicite",
  "illusion",
  "image",
  "imbiber",
  "imiter",
  "immense",
  "immobile",
  "immuable",
  "impact",
  "impérial",
  "implorer",
  "imposer",
  "imprimer",
  "imputer",
  "incarner",
  "incendie",
  "incident",
  "incliner",
  "incolore",
  "indexer",
  "indice",
  "inductif",
  "inédit",
  "ineptie",
  "inexact",
  "infini",
  "infliger",
  "informer",
  "infusion",
  "ingérer",
  "inhaler",
  "inhiber",
  "injecter",
  "injure",
  "innocent",
  "inoculer",
  "inonder",
  "inscrire",
  "insecte",
  "insigne",
  "insolite",
  "inspirer",
  "instinct",
  "insulter",
  "intact",
  "intense",
  "intime",
  "intrigue",
  "intuitif",
  "inutile",
  "invasion",
  "inventer",
  "inviter",
  "invoquer",
  "ironique",
  "irradier",
  "irréel",
  "irriter",
  "isoler",
  "ivoire",
  "ivresse",
  "jaguar",
  "jaillir",
  "jambe",
  "janvier",
  "jardin",
  "jauger",
  "jaune",
  "javelot",
  "jetable",
  "jeton",
  "jeudi",
  "jeunesse",
  "joindre",
  "joncher",
  "jongler",
  "joueur",
  "jouissif",
  "journal",
  "jovial",
  "joyau",
  "joyeux",
  "jubiler",
  "jugement",
  "junior",
  "jupon",
  "juriste",
  "justice",
  "juteux",
  "juvénile",
  "kayak",
  "kimono",
  "kiosque",
  "label",
  "labial",
  "labourer",
  "lacérer",
  "lactose",
  "lagune",
  "laine",
  "laisser",
  "laitier",
  "lambeau",
  "lamelle",
  "lampe",
  "lanceur",
  "langage",
  "lanterne",
  "lapin",
  "largeur",
  "larme",
  "laurier",
  "lavabo",
  "lavoir",
  "lecture",
  "légal",
  "léger",
  "légume",
  "lessive",
  "lettre",
  "levier",
  "lexique",
  "lézard",
  "liasse",
  "libérer",
  "libre",
  "licence",
  "licorne",
  "liège",
  "lièvre",
  "ligature",
  "ligoter",
  "ligue",
  "limer",
  "limite",
  "limonade",
  "limpide",
  "linéaire",
  "lingot",
  "lionceau",
  "liquide",
  "lisière",
  "lister",
  "lithium",
  "litige",
  "littoral",
  "livreur",
  "logique",
  "lointain",
  "loisir",
  "lombric",
  "loterie",
  "louer",
  "lourd",
  "loutre",
  "louve",
  "loyal",
  "lubie",
  "lucide",
  "lucratif",
  "lueur",
  "lugubre",
  "luisant",
  "lumière",
  "lunaire",
  "lundi",
  "luron",
  "lutter",
  "luxueux",
  "machine",
  "magasin",
  "magenta",
  "magique",
  "maigre",
  "maillon",
  "maintien",
  "mairie",
  "maison",
  "majorer",
  "malaxer",
  "maléfice",
  "malheur",
  "malice",
  "mallette",
  "mammouth",
  "mandater",
  "maniable",
  "manquant",
  "manteau",
  "manuel",
  "marathon",
  "marbre",
  "marchand",
  "mardi",
  "maritime",
  "marqueur",
  "marron",
  "marteler",
  "mascotte",
  "massif",
  "matériel",
  "matière",
  "matraque",
  "maudire",
  "maussade",
  "mauve",
  "maximal",
  "méchant",
  "méconnu",
  "médaille",
  "médecin",
  "méditer",
  "méduse",
  "meilleur",
  "mélange",
  "mélodie",
  "membre",
  "mémoire",
  "menacer",
  "mener",
  "menhir",
  "mensonge",
  "mentor",
  "mercredi",
  "mérite",
  "merle",
  "messager",
  "mesure",
  "métal",
  "météore",
  "méthode",
  "métier",
  "meuble",
  "miauler",
  "microbe",
  "miette",
  "mignon",
  "migrer",
  "milieu",
  "million",
  "mimique",
  "mince",
  "minéral",
  "minimal",
  "minorer",
  "minute",
  "miracle",
  "miroiter",
  "missile",
  "mixte",
  "mobile",
  "moderne",
  "moelleux",
  "mondial",
  "moniteur",
  "monnaie",
  "monotone",
  "monstre",
  "montagne",
  "monument",
  "moqueur",
  "morceau",
  "morsure",
  "mortier",
  "moteur",
  "motif",
  "mouche",
  "moufle",
  "moulin",
  "mousson",
  "mouton",
  "mouvant",
  "multiple",
  "munition",
  "muraille",
  "murène",
  "murmure",
  "muscle",
  "muséum",
  "musicien",
  "mutation",
  "muter",
  "mutuel",
  "myriade",
  "myrtille",
  "mystère",
  "mythique",
  "nageur",
  "nappe",
  "narquois",
  "narrer",
  "natation",
  "nation",
  "nature",
  "naufrage",
  "nautique",
  "navire",
  "nébuleux",
  "nectar",
  "néfaste",
  "négation",
  "négliger",
  "négocier",
  "neige",
  "nerveux",
  "nettoyer",
  "neurone",
  "neutron",
  "neveu",
  "niche",
  "nickel",
  "nitrate",
  "niveau",
  "noble",
  "nocif",
  "nocturne",
  "noirceur",
  "noisette",
  "nomade",
  "nombreux",
  "nommer",
  "normatif",
  "notable",
  "notifier",
  "notoire",
  "nourrir",
  "nouveau",
  "novateur",
  "novembre",
  "novice",
  "nuage",
  "nuancer",
  "nuire",
  "nuisible",
  "numéro",
  "nuptial",
  "nuque",
  "nutritif",
  "obéir",
  "objectif",
  "obliger",
  "obscur",
  "observer",
  "obstacle",
  "obtenir",
  "obturer",
  "occasion",
  "occuper",
  "océan",
  "octobre",
  "octroyer",
  "octupler",
  "oculaire",
  "odeur",
  "odorant",
  "offenser",
  "officier",
  "offrir",
  "ogive",
  "oiseau",
  "oisillon",
  "olfactif",
  "olivier",
  "ombrage",
  "omettre",
  "onctueux",
  "onduler",
  "onéreux",
  "onirique",
  "opale",
  "opaque",
  "opérer",
  "opinion",
  "opportun",
  "opprimer",
  "opter",
  "optique",
  "orageux",
  "orange",
  "orbite",
  "ordonner",
  "oreille",
  "organe",
  "orgueil",
  "orifice",
  "ornement",
  "orque",
  "ortie",
  "osciller",
  "osmose",
  "ossature",
  "otarie",
  "ouragan",
  "ourson",
  "outil",
  "outrager",
  "ouvrage",
  "ovation",
  "oxyde",
  "oxygène",
  "ozone",
  "paisible",
  "palace",
  "palmarès",
  "palourde",
  "palper",
  "panache",
  "panda",
  "pangolin",
  "paniquer",
  "panneau",
  "panorama",
  "pantalon",
  "papaye",
  "papier",
  "papoter",
  "papyrus",
  "paradoxe",
  "parcelle",
  "paresse",
  "parfumer",
  "parler",
  "parole",
  "parrain",
  "parsemer",
  "partager",
  "parure",
  "parvenir",
  "passion",
  "pastèque",
  "paternel",
  "patience",
  "patron",
  "pavillon",
  "pavoiser",
  "payer",
  "paysage",
  "peigne",
  "peintre",
  "pelage",
  "pélican",
  "pelle",
  "pelouse",
  "peluche",
  "pendule",
  "pénétrer",
  "pénible",
  "pensif",
  "pénurie",
  "pépite",
  "péplum",
  "perdrix",
  "perforer",
  "période",
  "permuter",
  "perplexe",
  "persil",
  "perte",
  "peser",
  "pétale",
  "petit",
  "pétrir",
  "peuple",
  "pharaon",
  "phobie",
  "phoque",
  "photon",
  "phrase",
  "physique",
  "piano",
  "pictural",
  "pièce",
  "pierre",
  "pieuvre",
  "pilote",
  "pinceau",
  "pipette",
  "piquer",
  "pirogue",
  "piscine",
  "piston",
  "pivoter",
  "pixel",
  "pizza",
  "placard",
  "plafond",
  "plaisir",
  "planer",
  "plaque",
  "plastron",
  "plateau",
  "pleurer",
  "plexus",
  "pliage",
  "plomb",
  "plonger",
  "pluie",
  "plumage",
  "pochette",
  "poésie",
  "poète",
  "pointe",
  "poirier",
  "poisson",
  "poivre",
  "polaire",
  "policier",
  "pollen",
  "polygone",
  "pommade",
  "pompier",
  "ponctuel",
  "pondérer",
  "poney",
  "portique",
  "position",
  "posséder",
  "posture",
  "potager",
  "poteau",
  "potion",
  "pouce",
  "poulain",
  "poumon",
  "pourpre",
  "poussin",
  "pouvoir",
  "prairie",
  "pratique",
  "précieux",
  "prédire",
  "préfixe",
  "prélude",
  "prénom",
  "présence",
  "prétexte",
  "prévoir",
  "primitif",
  "prince",
  "prison",
  "priver",
  "problème",
  "procéder",
  "prodige",
  "profond",
  "progrès",
  "proie",
  "projeter",
  "prologue",
  "promener",
  "propre",
  "prospère",
  "protéger",
  "prouesse",
  "proverbe",
  "prudence",
  "pruneau",
  "psychose",
  "public",
  "puceron",
  "puiser",
  "pulpe",
  "pulsar",
  "punaise",
  "punitif",
  "pupitre",
  "purifier",
  "puzzle",
  "pyramide",
  "quasar",
  "querelle",
  "question",
  "quiétude",
  "quitter",
  "quotient",
  "racine",
  "raconter",
  "radieux",
  "ragondin",
  "raideur",
  "raisin",
  "ralentir",
  "rallonge",
  "ramasser",
  "rapide",
  "rasage",
  "ratisser",
  "ravager",
  "ravin",
  "rayonner",
  "réactif",
  "réagir",
  "réaliser",
  "réanimer",
  "recevoir",
  "réciter",
  "réclamer",
  "récolter",
  "recruter",
  "reculer",
  "recycler",
  "rédiger",
  "redouter",
  "refaire",
  "réflexe",
  "réformer",
  "refrain",
  "refuge",
  "régalien",
  "région",
  "réglage",
  "régulier",
  "réitérer",
  "rejeter",
  "rejouer",
  "relatif",
  "relever",
  "relief",
  "remarque",
  "remède",
  "remise",
  "remonter",
  "remplir",
  "remuer",
  "renard",
  "renfort",
  "renifler",
  "renoncer",
  "rentrer",
  "renvoi",
  "replier",
  "reporter",
  "reprise",
  "reptile",
  "requin",
  "réserve",
  "résineux",
  "résoudre",
  "respect",
  "rester",
  "résultat",
  "rétablir",
  "retenir",
  "réticule",
  "retomber",
  "retracer",
  "réunion",
  "réussir",
  "revanche",
  "revivre",
  "révolte",
  "révulsif",
  "richesse",
  "rideau",
  "rieur",
  "rigide",
  "rigoler",
  "rincer",
  "riposter",
  "risible",
  "risque",
  "rituel",
  "rival",
  "rivière",
  "rocheux",
  "romance",
  "rompre",
  "ronce",
  "rondin",
  "roseau",
  "rosier",
  "rotatif",
  "rotor",
  "rotule",
  "rouge",
  "rouille",
  "rouleau",
  "routine",
  "royaume",
  "ruban",
  "rubis",
  "ruche",
  "ruelle",
  "rugueux",
  "ruiner",
  "ruisseau",
  "ruser",
  "rustique",
  "rythme",
  "sabler",
  "saboter",
  "sabre",
  "sacoche",
  "safari",
  "sagesse",
  "saisir",
  "salade",
  "salive",
  "salon",
  "saluer",
  "samedi",
  "sanction",
  "sanglier",
  "sarcasme",
  "sardine",
  "saturer",
  "saugrenu",
  "saumon",
  "sauter",
  "sauvage",
  "savant",
  "savonner",
  "scalpel",
  "scandale",
  "scélérat",
  "scénario",
  "sceptre",
  "schéma",
  "science",
  "scinder",
  "score",
  "scrutin",
  "sculpter",
  "séance",
  "sécable",
  "sécher",
  "secouer",
  "sécréter",
  "sédatif",
  "séduire",
  "seigneur",
  "séjour",
  "sélectif",
  "semaine",
  "sembler",
  "semence",
  "séminal",
  "sénateur",
  "sensible",
  "sentence",
  "séparer",
  "séquence",
  "serein",
  "sergent",
  "sérieux",
  "serrure",
  "sérum",
  "service",
  "sésame",
  "sévir",
  "sevrage",
  "sextuple",
  "sidéral",
  "siècle",
  "siéger",
  "siffler",
  "sigle",
  "signal",
  "silence",
  "silicium",
  "simple",
  "sincère",
  "sinistre",
  "siphon",
  "sirop",
  "sismique",
  "situer",
  "skier",
  "social",
  "socle",
  "sodium",
  "soigneux",
  "soldat",
  "soleil",
  "solitude",
  "soluble",
  "sombre",
  "sommeil",
  "somnoler",
  "sonde",
  "songeur",
  "sonnette",
  "sonore",
  "sorcier",
  "sortir",
  "sosie",
  "sottise",
  "soucieux",
  "soudure",
  "souffle",
  "soulever",
  "soupape",
  "source",
  "soutirer",
  "souvenir",
  "spacieux",
  "spatial",
  "spécial",
  "sphère",
  "spiral",
  "stable",
  "station",
  "sternum",
  "stimulus",
  "stipuler",
  "strict",
  "studieux",
  "stupeur",
  "styliste",
  "sublime",
  "substrat",
  "subtil",
  "subvenir",
  "succès",
  "sucre",
  "suffixe",
  "suggérer",
  "suiveur",
  "sulfate",
  "superbe",
  "supplier",
  "surface",
  "suricate",
  "surmener",
  "surprise",
  "sursaut",
  "survie",
  "suspect",
  "syllabe",
  "symbole",
  "symétrie",
  "synapse",
  "syntaxe",
  "système",
  "tabac",
  "tablier",
  "tactile",
  "tailler",
  "talent",
  "talisman",
  "talonner",
  "tambour",
  "tamiser",
  "tangible",
  "tapis",
  "taquiner",
  "tarder",
  "tarif",
  "tartine",
  "tasse",
  "tatami",
  "tatouage",
  "taupe",
  "taureau",
  "taxer",
  "témoin",
  "temporel",
  "tenaille",
  "tendre",
  "teneur",
  "tenir",
  "tension",
  "terminer",
  "terne",
  "terrible",
  "tétine",
  "texte",
  "thème",
  "théorie",
  "thérapie",
  "thorax",
  "tibia",
  "tiède",
  "timide",
  "tirelire",
  "tiroir",
  "tissu",
  "titane",
  "titre",
  "tituber",
  "toboggan",
  "tolérant",
  "tomate",
  "tonique",
  "tonneau",
  "toponyme",
  "torche",
  "tordre",
  "tornade",
  "torpille",
  "torrent",
  "torse",
  "tortue",
  "totem",
  "toucher",
  "tournage",
  "tousser",
  "toxine",
  "traction",
  "trafic",
  "tragique",
  "trahir",
  "train",
  "trancher",
  "travail",
  "trèfle",
  "tremper",
  "trésor",
  "treuil",
  "triage",
  "tribunal",
  "tricoter",
  "trilogie",
  "triomphe",
  "tripler",
  "triturer",
  "trivial",
  "trombone",
  "tronc",
  "tropical",
  "troupeau",
  "tuile",
  "tulipe",
  "tumulte",
  "tunnel",
  "turbine",
  "tuteur",
  "tutoyer",
  "tuyau",
  "tympan",
  "typhon",
  "typique",
  "tyran",
  "ubuesque",
  "ultime",
  "ultrason",
  "unanime",
  "unifier",
  "union",
  "unique",
  "unitaire",
  "univers",
  "uranium",
  "urbain",
  "urticant",
  "usage",
  "usine",
  "usuel",
  "usure",
  "utile",
  "utopie",
  "vacarme",
  "vaccin",
  "vagabond",
  "vague",
  "vaillant",
  "vaincre",
  "vaisseau",
  "valable",
  "valise",
  "vallon",
  "valve",
  "vampire",
  "vanille",
  "vapeur",
  "varier",
  "vaseux",
  "vassal",
  "vaste",
  "vecteur",
  "vedette",
  "végétal",
  "véhicule",
  "veinard",
  "véloce",
  "vendredi",
  "vénérer",
  "venger",
  "venimeux",
  "ventouse",
  "verdure",
  "vérin",
  "vernir",
  "verrou",
  "verser",
  "vertu",
  "veston",
  "vétéran",
  "vétuste",
  "vexant",
  "vexer",
  "viaduc",
  "viande",
  "victoire",
  "vidange",
  "vidéo",
  "vignette",
  "vigueur",
  "vilain",
  "village",
  "vinaigre",
  "violon",
  "vipère",
  "virement",
  "virtuose",
  "virus",
  "visage",
  "viseur",
  "vision",
  "visqueux",
  "visuel",
  "vital",
  "vitesse",
  "viticole",
  "vitrine",
  "vivace",
  "vivipare",
  "vocation",
  "voguer",
  "voile",
  "voisin",
  "voiture",
  "volaille",
  "volcan",
  "voltiger",
  "volume",
  "vorace",
  "vortex",
  "voter",
  "vouloir",
  "voyage",
  "voyelle",
  "wagon",
  "xénon",
  "yacht",
  "zèbre",
  "zénith",
  "zeste",
  "zoologie"
];
const require$$5 = [
  "abaco",
  "abbaglio",
  "abbinato",
  "abete",
  "abisso",
  "abolire",
  "abrasivo",
  "abrogato",
  "accadere",
  "accenno",
  "accusato",
  "acetone",
  "achille",
  "acido",
  "acqua",
  "acre",
  "acrilico",
  "acrobata",
  "acuto",
  "adagio",
  "addebito",
  "addome",
  "adeguato",
  "aderire",
  "adipe",
  "adottare",
  "adulare",
  "affabile",
  "affetto",
  "affisso",
  "affranto",
  "aforisma",
  "afoso",
  "africano",
  "agave",
  "agente",
  "agevole",
  "aggancio",
  "agire",
  "agitare",
  "agonismo",
  "agricolo",
  "agrumeto",
  "aguzzo",
  "alabarda",
  "alato",
  "albatro",
  "alberato",
  "albo",
  "albume",
  "alce",
  "alcolico",
  "alettone",
  "alfa",
  "algebra",
  "aliante",
  "alibi",
  "alimento",
  "allagato",
  "allegro",
  "allievo",
  "allodola",
  "allusivo",
  "almeno",
  "alogeno",
  "alpaca",
  "alpestre",
  "altalena",
  "alterno",
  "alticcio",
  "altrove",
  "alunno",
  "alveolo",
  "alzare",
  "amalgama",
  "amanita",
  "amarena",
  "ambito",
  "ambrato",
  "ameba",
  "america",
  "ametista",
  "amico",
  "ammasso",
  "ammenda",
  "ammirare",
  "ammonito",
  "amore",
  "ampio",
  "ampliare",
  "amuleto",
  "anacardo",
  "anagrafe",
  "analista",
  "anarchia",
  "anatra",
  "anca",
  "ancella",
  "ancora",
  "andare",
  "andrea",
  "anello",
  "angelo",
  "angolare",
  "angusto",
  "anima",
  "annegare",
  "annidato",
  "anno",
  "annuncio",
  "anonimo",
  "anticipo",
  "anzi",
  "apatico",
  "apertura",
  "apode",
  "apparire",
  "appetito",
  "appoggio",
  "approdo",
  "appunto",
  "aprile",
  "arabica",
  "arachide",
  "aragosta",
  "araldica",
  "arancio",
  "aratura",
  "arazzo",
  "arbitro",
  "archivio",
  "ardito",
  "arenile",
  "argento",
  "argine",
  "arguto",
  "aria",
  "armonia",
  "arnese",
  "arredato",
  "arringa",
  "arrosto",
  "arsenico",
  "arso",
  "artefice",
  "arzillo",
  "asciutto",
  "ascolto",
  "asepsi",
  "asettico",
  "asfalto",
  "asino",
  "asola",
  "aspirato",
  "aspro",
  "assaggio",
  "asse",
  "assoluto",
  "assurdo",
  "asta",
  "astenuto",
  "astice",
  "astratto",
  "atavico",
  "ateismo",
  "atomico",
  "atono",
  "attesa",
  "attivare",
  "attorno",
  "attrito",
  "attuale",
  "ausilio",
  "austria",
  "autista",
  "autonomo",
  "autunno",
  "avanzato",
  "avere",
  "avvenire",
  "avviso",
  "avvolgere",
  "azione",
  "azoto",
  "azzimo",
  "azzurro",
  "babele",
  "baccano",
  "bacino",
  "baco",
  "badessa",
  "badilata",
  "bagnato",
  "baita",
  "balcone",
  "baldo",
  "balena",
  "ballata",
  "balzano",
  "bambino",
  "bandire",
  "baraonda",
  "barbaro",
  "barca",
  "baritono",
  "barlume",
  "barocco",
  "basilico",
  "basso",
  "batosta",
  "battuto",
  "baule",
  "bava",
  "bavosa",
  "becco",
  "beffa",
  "belgio",
  "belva",
  "benda",
  "benevole",
  "benigno",
  "benzina",
  "bere",
  "berlina",
  "beta",
  "bibita",
  "bici",
  "bidone",
  "bifido",
  "biga",
  "bilancia",
  "bimbo",
  "binocolo",
  "biologo",
  "bipede",
  "bipolare",
  "birbante",
  "birra",
  "biscotto",
  "bisesto",
  "bisnonno",
  "bisonte",
  "bisturi",
  "bizzarro",
  "blando",
  "blatta",
  "bollito",
  "bonifico",
  "bordo",
  "bosco",
  "botanico",
  "bottino",
  "bozzolo",
  "braccio",
  "bradipo",
  "brama",
  "branca",
  "bravura",
  "bretella",
  "brevetto",
  "brezza",
  "briglia",
  "brillante",
  "brindare",
  "broccolo",
  "brodo",
  "bronzina",
  "brullo",
  "bruno",
  "bubbone",
  "buca",
  "budino",
  "buffone",
  "buio",
  "bulbo",
  "buono",
  "burlone",
  "burrasca",
  "bussola",
  "busta",
  "cadetto",
  "caduco",
  "calamaro",
  "calcolo",
  "calesse",
  "calibro",
  "calmo",
  "caloria",
  "cambusa",
  "camerata",
  "camicia",
  "cammino",
  "camola",
  "campale",
  "canapa",
  "candela",
  "cane",
  "canino",
  "canotto",
  "cantina",
  "capace",
  "capello",
  "capitolo",
  "capogiro",
  "cappero",
  "capra",
  "capsula",
  "carapace",
  "carcassa",
  "cardo",
  "carisma",
  "carovana",
  "carretto",
  "cartolina",
  "casaccio",
  "cascata",
  "caserma",
  "caso",
  "cassone",
  "castello",
  "casuale",
  "catasta",
  "catena",
  "catrame",
  "cauto",
  "cavillo",
  "cedibile",
  "cedrata",
  "cefalo",
  "celebre",
  "cellulare",
  "cena",
  "cenone",
  "centesimo",
  "ceramica",
  "cercare",
  "certo",
  "cerume",
  "cervello",
  "cesoia",
  "cespo",
  "ceto",
  "chela",
  "chiaro",
  "chicca",
  "chiedere",
  "chimera",
  "china",
  "chirurgo",
  "chitarra",
  "ciao",
  "ciclismo",
  "cifrare",
  "cigno",
  "cilindro",
  "ciottolo",
  "circa",
  "cirrosi",
  "citrico",
  "cittadino",
  "ciuffo",
  "civetta",
  "civile",
  "classico",
  "clinica",
  "cloro",
  "cocco",
  "codardo",
  "codice",
  "coerente",
  "cognome",
  "collare",
  "colmato",
  "colore",
  "colposo",
  "coltivato",
  "colza",
  "coma",
  "cometa",
  "commando",
  "comodo",
  "computer",
  "comune",
  "conciso",
  "condurre",
  "conferma",
  "congelare",
  "coniuge",
  "connesso",
  "conoscere",
  "consumo",
  "continuo",
  "convegno",
  "coperto",
  "copione",
  "coppia",
  "copricapo",
  "corazza",
  "cordata",
  "coricato",
  "cornice",
  "corolla",
  "corpo",
  "corredo",
  "corsia",
  "cortese",
  "cosmico",
  "costante",
  "cottura",
  "covato",
  "cratere",
  "cravatta",
  "creato",
  "credere",
  "cremoso",
  "crescita",
  "creta",
  "criceto",
  "crinale",
  "crisi",
  "critico",
  "croce",
  "cronaca",
  "crostata",
  "cruciale",
  "crusca",
  "cucire",
  "cuculo",
  "cugino",
  "cullato",
  "cupola",
  "curatore",
  "cursore",
  "curvo",
  "cuscino",
  "custode",
  "dado",
  "daino",
  "dalmata",
  "damerino",
  "daniela",
  "dannoso",
  "danzare",
  "datato",
  "davanti",
  "davvero",
  "debutto",
  "decennio",
  "deciso",
  "declino",
  "decollo",
  "decreto",
  "dedicato",
  "definito",
  "deforme",
  "degno",
  "delegare",
  "delfino",
  "delirio",
  "delta",
  "demenza",
  "denotato",
  "dentro",
  "deposito",
  "derapata",
  "derivare",
  "deroga",
  "descritto",
  "deserto",
  "desiderio",
  "desumere",
  "detersivo",
  "devoto",
  "diametro",
  "dicembre",
  "diedro",
  "difeso",
  "diffuso",
  "digerire",
  "digitale",
  "diluvio",
  "dinamico",
  "dinnanzi",
  "dipinto",
  "diploma",
  "dipolo",
  "diradare",
  "dire",
  "dirotto",
  "dirupo",
  "disagio",
  "discreto",
  "disfare",
  "disgelo",
  "disposto",
  "distanza",
  "disumano",
  "dito",
  "divano",
  "divelto",
  "dividere",
  "divorato",
  "doblone",
  "docente",
  "doganale",
  "dogma",
  "dolce",
  "domato",
  "domenica",
  "dominare",
  "dondolo",
  "dono",
  "dormire",
  "dote",
  "dottore",
  "dovuto",
  "dozzina",
  "drago",
  "druido",
  "dubbio",
  "dubitare",
  "ducale",
  "duna",
  "duomo",
  "duplice",
  "duraturo",
  "ebano",
  "eccesso",
  "ecco",
  "eclissi",
  "economia",
  "edera",
  "edicola",
  "edile",
  "editoria",
  "educare",
  "egemonia",
  "egli",
  "egoismo",
  "egregio",
  "elaborato",
  "elargire",
  "elegante",
  "elencato",
  "eletto",
  "elevare",
  "elfico",
  "elica",
  "elmo",
  "elsa",
  "eluso",
  "emanato",
  "emblema",
  "emesso",
  "emiro",
  "emotivo",
  "emozione",
  "empirico",
  "emulo",
  "endemico",
  "enduro",
  "energia",
  "enfasi",
  "enoteca",
  "entrare",
  "enzima",
  "epatite",
  "epilogo",
  "episodio",
  "epocale",
  "eppure",
  "equatore",
  "erario",
  "erba",
  "erboso",
  "erede",
  "eremita",
  "erigere",
  "ermetico",
  "eroe",
  "erosivo",
  "errante",
  "esagono",
  "esame",
  "esanime",
  "esaudire",
  "esca",
  "esempio",
  "esercito",
  "esibito",
  "esigente",
  "esistere",
  "esito",
  "esofago",
  "esortato",
  "esoso",
  "espanso",
  "espresso",
  "essenza",
  "esso",
  "esteso",
  "estimare",
  "estonia",
  "estroso",
  "esultare",
  "etilico",
  "etnico",
  "etrusco",
  "etto",
  "euclideo",
  "europa",
  "evaso",
  "evidenza",
  "evitato",
  "evoluto",
  "evviva",
  "fabbrica",
  "faccenda",
  "fachiro",
  "falco",
  "famiglia",
  "fanale",
  "fanfara",
  "fango",
  "fantasma",
  "fare",
  "farfalla",
  "farinoso",
  "farmaco",
  "fascia",
  "fastoso",
  "fasullo",
  "faticare",
  "fato",
  "favoloso",
  "febbre",
  "fecola",
  "fede",
  "fegato",
  "felpa",
  "feltro",
  "femmina",
  "fendere",
  "fenomeno",
  "fermento",
  "ferro",
  "fertile",
  "fessura",
  "festivo",
  "fetta",
  "feudo",
  "fiaba",
  "fiducia",
  "fifa",
  "figurato",
  "filo",
  "finanza",
  "finestra",
  "finire",
  "fiore",
  "fiscale",
  "fisico",
  "fiume",
  "flacone",
  "flamenco",
  "flebo",
  "flemma",
  "florido",
  "fluente",
  "fluoro",
  "fobico",
  "focaccia",
  "focoso",
  "foderato",
  "foglio",
  "folata",
  "folclore",
  "folgore",
  "fondente",
  "fonetico",
  "fonia",
  "fontana",
  "forbito",
  "forchetta",
  "foresta",
  "formica",
  "fornaio",
  "foro",
  "fortezza",
  "forzare",
  "fosfato",
  "fosso",
  "fracasso",
  "frana",
  "frassino",
  "fratello",
  "freccetta",
  "frenata",
  "fresco",
  "frigo",
  "frollino",
  "fronde",
  "frugale",
  "frutta",
  "fucilata",
  "fucsia",
  "fuggente",
  "fulmine",
  "fulvo",
  "fumante",
  "fumetto",
  "fumoso",
  "fune",
  "funzione",
  "fuoco",
  "furbo",
  "furgone",
  "furore",
  "fuso",
  "futile",
  "gabbiano",
  "gaffe",
  "galateo",
  "gallina",
  "galoppo",
  "gambero",
  "gamma",
  "garanzia",
  "garbo",
  "garofano",
  "garzone",
  "gasdotto",
  "gasolio",
  "gastrico",
  "gatto",
  "gaudio",
  "gazebo",
  "gazzella",
  "geco",
  "gelatina",
  "gelso",
  "gemello",
  "gemmato",
  "gene",
  "genitore",
  "gennaio",
  "genotipo",
  "gergo",
  "ghepardo",
  "ghiaccio",
  "ghisa",
  "giallo",
  "gilda",
  "ginepro",
  "giocare",
  "gioiello",
  "giorno",
  "giove",
  "girato",
  "girone",
  "gittata",
  "giudizio",
  "giurato",
  "giusto",
  "globulo",
  "glutine",
  "gnomo",
  "gobba",
  "golf",
  "gomito",
  "gommone",
  "gonfio",
  "gonna",
  "governo",
  "gracile",
  "grado",
  "grafico",
  "grammo",
  "grande",
  "grattare",
  "gravoso",
  "grazia",
  "greca",
  "gregge",
  "grifone",
  "grigio",
  "grinza",
  "grotta",
  "gruppo",
  "guadagno",
  "guaio",
  "guanto",
  "guardare",
  "gufo",
  "guidare",
  "ibernato",
  "icona",
  "identico",
  "idillio",
  "idolo",
  "idra",
  "idrico",
  "idrogeno",
  "igiene",
  "ignaro",
  "ignorato",
  "ilare",
  "illeso",
  "illogico",
  "illudere",
  "imballo",
  "imbevuto",
  "imbocco",
  "imbuto",
  "immane",
  "immerso",
  "immolato",
  "impacco",
  "impeto",
  "impiego",
  "importo",
  "impronta",
  "inalare",
  "inarcare",
  "inattivo",
  "incanto",
  "incendio",
  "inchino",
  "incisivo",
  "incluso",
  "incontro",
  "incrocio",
  "incubo",
  "indagine",
  "india",
  "indole",
  "inedito",
  "infatti",
  "infilare",
  "inflitto",
  "ingaggio",
  "ingegno",
  "inglese",
  "ingordo",
  "ingrosso",
  "innesco",
  "inodore",
  "inoltrare",
  "inondato",
  "insano",
  "insetto",
  "insieme",
  "insonnia",
  "insulina",
  "intasato",
  "intero",
  "intonaco",
  "intuito",
  "inumidire",
  "invalido",
  "invece",
  "invito",
  "iperbole",
  "ipnotico",
  "ipotesi",
  "ippica",
  "iride",
  "irlanda",
  "ironico",
  "irrigato",
  "irrorare",
  "isolato",
  "isotopo",
  "isterico",
  "istituto",
  "istrice",
  "italia",
  "iterare",
  "labbro",
  "labirinto",
  "lacca",
  "lacerato",
  "lacrima",
  "lacuna",
  "laddove",
  "lago",
  "lampo",
  "lancetta",
  "lanterna",
  "lardoso",
  "larga",
  "laringe",
  "lastra",
  "latenza",
  "latino",
  "lattuga",
  "lavagna",
  "lavoro",
  "legale",
  "leggero",
  "lembo",
  "lentezza",
  "lenza",
  "leone",
  "lepre",
  "lesivo",
  "lessato",
  "lesto",
  "letterale",
  "leva",
  "levigato",
  "libero",
  "lido",
  "lievito",
  "lilla",
  "limatura",
  "limitare",
  "limpido",
  "lineare",
  "lingua",
  "liquido",
  "lira",
  "lirica",
  "lisca",
  "lite",
  "litigio",
  "livrea",
  "locanda",
  "lode",
  "logica",
  "lombare",
  "londra",
  "longevo",
  "loquace",
  "lorenzo",
  "loto",
  "lotteria",
  "luce",
  "lucidato",
  "lumaca",
  "luminoso",
  "lungo",
  "lupo",
  "luppolo",
  "lusinga",
  "lusso",
  "lutto",
  "macabro",
  "macchina",
  "macero",
  "macinato",
  "madama",
  "magico",
  "maglia",
  "magnete",
  "magro",
  "maiolica",
  "malafede",
  "malgrado",
  "malinteso",
  "malsano",
  "malto",
  "malumore",
  "mana",
  "mancia",
  "mandorla",
  "mangiare",
  "manifesto",
  "mannaro",
  "manovra",
  "mansarda",
  "mantide",
  "manubrio",
  "mappa",
  "maratona",
  "marcire",
  "maretta",
  "marmo",
  "marsupio",
  "maschera",
  "massaia",
  "mastino",
  "materasso",
  "matricola",
  "mattone",
  "maturo",
  "mazurca",
  "meandro",
  "meccanico",
  "mecenate",
  "medesimo",
  "meditare",
  "mega",
  "melassa",
  "melis",
  "melodia",
  "meninge",
  "meno",
  "mensola",
  "mercurio",
  "merenda",
  "merlo",
  "meschino",
  "mese",
  "messere",
  "mestolo",
  "metallo",
  "metodo",
  "mettere",
  "miagolare",
  "mica",
  "micelio",
  "michele",
  "microbo",
  "midollo",
  "miele",
  "migliore",
  "milano",
  "milite",
  "mimosa",
  "minerale",
  "mini",
  "minore",
  "mirino",
  "mirtillo",
  "miscela",
  "missiva",
  "misto",
  "misurare",
  "mitezza",
  "mitigare",
  "mitra",
  "mittente",
  "mnemonico",
  "modello",
  "modifica",
  "modulo",
  "mogano",
  "mogio",
  "mole",
  "molosso",
  "monastero",
  "monco",
  "mondina",
  "monetario",
  "monile",
  "monotono",
  "monsone",
  "montato",
  "monviso",
  "mora",
  "mordere",
  "morsicato",
  "mostro",
  "motivato",
  "motosega",
  "motto",
  "movenza",
  "movimento",
  "mozzo",
  "mucca",
  "mucosa",
  "muffa",
  "mughetto",
  "mugnaio",
  "mulatto",
  "mulinello",
  "multiplo",
  "mummia",
  "munto",
  "muovere",
  "murale",
  "musa",
  "muscolo",
  "musica",
  "mutevole",
  "muto",
  "nababbo",
  "nafta",
  "nanometro",
  "narciso",
  "narice",
  "narrato",
  "nascere",
  "nastrare",
  "naturale",
  "nautica",
  "naviglio",
  "nebulosa",
  "necrosi",
  "negativo",
  "negozio",
  "nemmeno",
  "neofita",
  "neretto",
  "nervo",
  "nessuno",
  "nettuno",
  "neutrale",
  "neve",
  "nevrotico",
  "nicchia",
  "ninfa",
  "nitido",
  "nobile",
  "nocivo",
  "nodo",
  "nome",
  "nomina",
  "nordico",
  "normale",
  "norvegese",
  "nostrano",
  "notare",
  "notizia",
  "notturno",
  "novella",
  "nucleo",
  "nulla",
  "numero",
  "nuovo",
  "nutrire",
  "nuvola",
  "nuziale",
  "oasi",
  "obbedire",
  "obbligo",
  "obelisco",
  "oblio",
  "obolo",
  "obsoleto",
  "occasione",
  "occhio",
  "occidente",
  "occorrere",
  "occultare",
  "ocra",
  "oculato",
  "odierno",
  "odorare",
  "offerta",
  "offrire",
  "offuscato",
  "oggetto",
  "oggi",
  "ognuno",
  "olandese",
  "olfatto",
  "oliato",
  "oliva",
  "ologramma",
  "oltre",
  "omaggio",
  "ombelico",
  "ombra",
  "omega",
  "omissione",
  "ondoso",
  "onere",
  "onice",
  "onnivoro",
  "onorevole",
  "onta",
  "operato",
  "opinione",
  "opposto",
  "oracolo",
  "orafo",
  "ordine",
  "orecchino",
  "orefice",
  "orfano",
  "organico",
  "origine",
  "orizzonte",
  "orma",
  "ormeggio",
  "ornativo",
  "orologio",
  "orrendo",
  "orribile",
  "ortensia",
  "ortica",
  "orzata",
  "orzo",
  "osare",
  "oscurare",
  "osmosi",
  "ospedale",
  "ospite",
  "ossa",
  "ossidare",
  "ostacolo",
  "oste",
  "otite",
  "otre",
  "ottagono",
  "ottimo",
  "ottobre",
  "ovale",
  "ovest",
  "ovino",
  "oviparo",
  "ovocito",
  "ovunque",
  "ovviare",
  "ozio",
  "pacchetto",
  "pace",
  "pacifico",
  "padella",
  "padrone",
  "paese",
  "paga",
  "pagina",
  "palazzina",
  "palesare",
  "pallido",
  "palo",
  "palude",
  "pandoro",
  "pannello",
  "paolo",
  "paonazzo",
  "paprica",
  "parabola",
  "parcella",
  "parere",
  "pargolo",
  "pari",
  "parlato",
  "parola",
  "partire",
  "parvenza",
  "parziale",
  "passivo",
  "pasticca",
  "patacca",
  "patologia",
  "pattume",
  "pavone",
  "peccato",
  "pedalare",
  "pedonale",
  "peggio",
  "peloso",
  "penare",
  "pendice",
  "penisola",
  "pennuto",
  "penombra",
  "pensare",
  "pentola",
  "pepe",
  "pepita",
  "perbene",
  "percorso",
  "perdonato",
  "perforare",
  "pergamena",
  "periodo",
  "permesso",
  "perno",
  "perplesso",
  "persuaso",
  "pertugio",
  "pervaso",
  "pesatore",
  "pesista",
  "peso",
  "pestifero",
  "petalo",
  "pettine",
  "petulante",
  "pezzo",
  "piacere",
  "pianta",
  "piattino",
  "piccino",
  "picozza",
  "piega",
  "pietra",
  "piffero",
  "pigiama",
  "pigolio",
  "pigro",
  "pila",
  "pilifero",
  "pillola",
  "pilota",
  "pimpante",
  "pineta",
  "pinna",
  "pinolo",
  "pioggia",
  "piombo",
  "piramide",
  "piretico",
  "pirite",
  "pirolisi",
  "pitone",
  "pizzico",
  "placebo",
  "planare",
  "plasma",
  "platano",
  "plenario",
  "pochezza",
  "poderoso",
  "podismo",
  "poesia",
  "poggiare",
  "polenta",
  "poligono",
  "pollice",
  "polmonite",
  "polpetta",
  "polso",
  "poltrona",
  "polvere",
  "pomice",
  "pomodoro",
  "ponte",
  "popoloso",
  "porfido",
  "poroso",
  "porpora",
  "porre",
  "portata",
  "posa",
  "positivo",
  "possesso",
  "postulato",
  "potassio",
  "potere",
  "pranzo",
  "prassi",
  "pratica",
  "precluso",
  "predica",
  "prefisso",
  "pregiato",
  "prelievo",
  "premere",
  "prenotare",
  "preparato",
  "presenza",
  "pretesto",
  "prevalso",
  "prima",
  "principe",
  "privato",
  "problema",
  "procura",
  "produrre",
  "profumo",
  "progetto",
  "prolunga",
  "promessa",
  "pronome",
  "proposta",
  "proroga",
  "proteso",
  "prova",
  "prudente",
  "prugna",
  "prurito",
  "psiche",
  "pubblico",
  "pudica",
  "pugilato",
  "pugno",
  "pulce",
  "pulito",
  "pulsante",
  "puntare",
  "pupazzo",
  "pupilla",
  "puro",
  "quadro",
  "qualcosa",
  "quasi",
  "querela",
  "quota",
  "raccolto",
  "raddoppio",
  "radicale",
  "radunato",
  "raffica",
  "ragazzo",
  "ragione",
  "ragno",
  "ramarro",
  "ramingo",
  "ramo",
  "randagio",
  "rantolare",
  "rapato",
  "rapina",
  "rappreso",
  "rasatura",
  "raschiato",
  "rasente",
  "rassegna",
  "rastrello",
  "rata",
  "ravveduto",
  "reale",
  "recepire",
  "recinto",
  "recluta",
  "recondito",
  "recupero",
  "reddito",
  "redimere",
  "regalato",
  "registro",
  "regola",
  "regresso",
  "relazione",
  "remare",
  "remoto",
  "renna",
  "replica",
  "reprimere",
  "reputare",
  "resa",
  "residente",
  "responso",
  "restauro",
  "rete",
  "retina",
  "retorica",
  "rettifica",
  "revocato",
  "riassunto",
  "ribadire",
  "ribelle",
  "ribrezzo",
  "ricarica",
  "ricco",
  "ricevere",
  "riciclato",
  "ricordo",
  "ricreduto",
  "ridicolo",
  "ridurre",
  "rifasare",
  "riflesso",
  "riforma",
  "rifugio",
  "rigare",
  "rigettato",
  "righello",
  "rilassato",
  "rilevato",
  "rimanere",
  "rimbalzo",
  "rimedio",
  "rimorchio",
  "rinascita",
  "rincaro",
  "rinforzo",
  "rinnovo",
  "rinomato",
  "rinsavito",
  "rintocco",
  "rinuncia",
  "rinvenire",
  "riparato",
  "ripetuto",
  "ripieno",
  "riportare",
  "ripresa",
  "ripulire",
  "risata",
  "rischio",
  "riserva",
  "risibile",
  "riso",
  "rispetto",
  "ristoro",
  "risultato",
  "risvolto",
  "ritardo",
  "ritegno",
  "ritmico",
  "ritrovo",
  "riunione",
  "riva",
  "riverso",
  "rivincita",
  "rivolto",
  "rizoma",
  "roba",
  "robotico",
  "robusto",
  "roccia",
  "roco",
  "rodaggio",
  "rodere",
  "roditore",
  "rogito",
  "rollio",
  "romantico",
  "rompere",
  "ronzio",
  "rosolare",
  "rospo",
  "rotante",
  "rotondo",
  "rotula",
  "rovescio",
  "rubizzo",
  "rubrica",
  "ruga",
  "rullino",
  "rumine",
  "rumoroso",
  "ruolo",
  "rupe",
  "russare",
  "rustico",
  "sabato",
  "sabbiare",
  "sabotato",
  "sagoma",
  "salasso",
  "saldatura",
  "salgemma",
  "salivare",
  "salmone",
  "salone",
  "saltare",
  "saluto",
  "salvo",
  "sapere",
  "sapido",
  "saporito",
  "saraceno",
  "sarcasmo",
  "sarto",
  "sassoso",
  "satellite",
  "satira",
  "satollo",
  "saturno",
  "savana",
  "savio",
  "saziato",
  "sbadiglio",
  "sbalzo",
  "sbancato",
  "sbarra",
  "sbattere",
  "sbavare",
  "sbendare",
  "sbirciare",
  "sbloccato",
  "sbocciato",
  "sbrinare",
  "sbruffone",
  "sbuffare",
  "scabroso",
  "scadenza",
  "scala",
  "scambiare",
  "scandalo",
  "scapola",
  "scarso",
  "scatenare",
  "scavato",
  "scelto",
  "scenico",
  "scettro",
  "scheda",
  "schiena",
  "sciarpa",
  "scienza",
  "scindere",
  "scippo",
  "sciroppo",
  "scivolo",
  "sclerare",
  "scodella",
  "scolpito",
  "scomparto",
  "sconforto",
  "scoprire",
  "scorta",
  "scossone",
  "scozzese",
  "scriba",
  "scrollare",
  "scrutinio",
  "scuderia",
  "scultore",
  "scuola",
  "scuro",
  "scusare",
  "sdebitare",
  "sdoganare",
  "seccatura",
  "secondo",
  "sedano",
  "seggiola",
  "segnalato",
  "segregato",
  "seguito",
  "selciato",
  "selettivo",
  "sella",
  "selvaggio",
  "semaforo",
  "sembrare",
  "seme",
  "seminato",
  "sempre",
  "senso",
  "sentire",
  "sepolto",
  "sequenza",
  "serata",
  "serbato",
  "sereno",
  "serio",
  "serpente",
  "serraglio",
  "servire",
  "sestina",
  "setola",
  "settimana",
  "sfacelo",
  "sfaldare",
  "sfamato",
  "sfarzoso",
  "sfaticato",
  "sfera",
  "sfida",
  "sfilato",
  "sfinge",
  "sfocato",
  "sfoderare",
  "sfogo",
  "sfoltire",
  "sforzato",
  "sfratto",
  "sfruttato",
  "sfuggito",
  "sfumare",
  "sfuso",
  "sgabello",
  "sgarbato",
  "sgonfiare",
  "sgorbio",
  "sgrassato",
  "sguardo",
  "sibilo",
  "siccome",
  "sierra",
  "sigla",
  "signore",
  "silenzio",
  "sillaba",
  "simbolo",
  "simpatico",
  "simulato",
  "sinfonia",
  "singolo",
  "sinistro",
  "sino",
  "sintesi",
  "sinusoide",
  "sipario",
  "sisma",
  "sistole",
  "situato",
  "slitta",
  "slogatura",
  "sloveno",
  "smarrito",
  "smemorato",
  "smentito",
  "smeraldo",
  "smilzo",
  "smontare",
  "smottato",
  "smussato",
  "snellire",
  "snervato",
  "snodo",
  "sobbalzo",
  "sobrio",
  "soccorso",
  "sociale",
  "sodale",
  "soffitto",
  "sogno",
  "soldato",
  "solenne",
  "solido",
  "sollazzo",
  "solo",
  "solubile",
  "solvente",
  "somatico",
  "somma",
  "sonda",
  "sonetto",
  "sonnifero",
  "sopire",
  "soppeso",
  "sopra",
  "sorgere",
  "sorpasso",
  "sorriso",
  "sorso",
  "sorteggio",
  "sorvolato",
  "sospiro",
  "sosta",
  "sottile",
  "spada",
  "spalla",
  "spargere",
  "spatola",
  "spavento",
  "spazzola",
  "specie",
  "spedire",
  "spegnere",
  "spelatura",
  "speranza",
  "spessore",
  "spettrale",
  "spezzato",
  "spia",
  "spigoloso",
  "spillato",
  "spinoso",
  "spirale",
  "splendido",
  "sportivo",
  "sposo",
  "spranga",
  "sprecare",
  "spronato",
  "spruzzo",
  "spuntino",
  "squillo",
  "sradicare",
  "srotolato",
  "stabile",
  "stacco",
  "staffa",
  "stagnare",
  "stampato",
  "stantio",
  "starnuto",
  "stasera",
  "statuto",
  "stelo",
  "steppa",
  "sterzo",
  "stiletto",
  "stima",
  "stirpe",
  "stivale",
  "stizzoso",
  "stonato",
  "storico",
  "strappo",
  "stregato",
  "stridulo",
  "strozzare",
  "strutto",
  "stuccare",
  "stufo",
  "stupendo",
  "subentro",
  "succoso",
  "sudore",
  "suggerito",
  "sugo",
  "sultano",
  "suonare",
  "superbo",
  "supporto",
  "surgelato",
  "surrogato",
  "sussurro",
  "sutura",
  "svagare",
  "svedese",
  "sveglio",
  "svelare",
  "svenuto",
  "svezia",
  "sviluppo",
  "svista",
  "svizzera",
  "svolta",
  "svuotare",
  "tabacco",
  "tabulato",
  "tacciare",
  "taciturno",
  "tale",
  "talismano",
  "tampone",
  "tannino",
  "tara",
  "tardivo",
  "targato",
  "tariffa",
  "tarpare",
  "tartaruga",
  "tasto",
  "tattico",
  "taverna",
  "tavolata",
  "tazza",
  "teca",
  "tecnico",
  "telefono",
  "temerario",
  "tempo",
  "temuto",
  "tendone",
  "tenero",
  "tensione",
  "tentacolo",
  "teorema",
  "terme",
  "terrazzo",
  "terzetto",
  "tesi",
  "tesserato",
  "testato",
  "tetro",
  "tettoia",
  "tifare",
  "tigella",
  "timbro",
  "tinto",
  "tipico",
  "tipografo",
  "tiraggio",
  "tiro",
  "titanio",
  "titolo",
  "titubante",
  "tizio",
  "tizzone",
  "toccare",
  "tollerare",
  "tolto",
  "tombola",
  "tomo",
  "tonfo",
  "tonsilla",
  "topazio",
  "topologia",
  "toppa",
  "torba",
  "tornare",
  "torrone",
  "tortora",
  "toscano",
  "tossire",
  "tostatura",
  "totano",
  "trabocco",
  "trachea",
  "trafila",
  "tragedia",
  "tralcio",
  "tramonto",
  "transito",
  "trapano",
  "trarre",
  "trasloco",
  "trattato",
  "trave",
  "treccia",
  "tremolio",
  "trespolo",
  "tributo",
  "tricheco",
  "trifoglio",
  "trillo",
  "trincea",
  "trio",
  "tristezza",
  "triturato",
  "trivella",
  "tromba",
  "trono",
  "troppo",
  "trottola",
  "trovare",
  "truccato",
  "tubatura",
  "tuffato",
  "tulipano",
  "tumulto",
  "tunisia",
  "turbare",
  "turchino",
  "tuta",
  "tutela",
  "ubicato",
  "uccello",
  "uccisore",
  "udire",
  "uditivo",
  "uffa",
  "ufficio",
  "uguale",
  "ulisse",
  "ultimato",
  "umano",
  "umile",
  "umorismo",
  "uncinetto",
  "ungere",
  "ungherese",
  "unicorno",
  "unificato",
  "unisono",
  "unitario",
  "unte",
  "uovo",
  "upupa",
  "uragano",
  "urgenza",
  "urlo",
  "usanza",
  "usato",
  "uscito",
  "usignolo",
  "usuraio",
  "utensile",
  "utilizzo",
  "utopia",
  "vacante",
  "vaccinato",
  "vagabondo",
  "vagliato",
  "valanga",
  "valgo",
  "valico",
  "valletta",
  "valoroso",
  "valutare",
  "valvola",
  "vampata",
  "vangare",
  "vanitoso",
  "vano",
  "vantaggio",
  "vanvera",
  "vapore",
  "varano",
  "varcato",
  "variante",
  "vasca",
  "vedetta",
  "vedova",
  "veduto",
  "vegetale",
  "veicolo",
  "velcro",
  "velina",
  "velluto",
  "veloce",
  "venato",
  "vendemmia",
  "vento",
  "verace",
  "verbale",
  "vergogna",
  "verifica",
  "vero",
  "verruca",
  "verticale",
  "vescica",
  "vessillo",
  "vestale",
  "veterano",
  "vetrina",
  "vetusto",
  "viandante",
  "vibrante",
  "vicenda",
  "vichingo",
  "vicinanza",
  "vidimare",
  "vigilia",
  "vigneto",
  "vigore",
  "vile",
  "villano",
  "vimini",
  "vincitore",
  "viola",
  "vipera",
  "virgola",
  "virologo",
  "virulento",
  "viscoso",
  "visione",
  "vispo",
  "vissuto",
  "visura",
  "vita",
  "vitello",
  "vittima",
  "vivanda",
  "vivido",
  "viziare",
  "voce",
  "voga",
  "volatile",
  "volere",
  "volpe",
  "voragine",
  "vulcano",
  "zampogna",
  "zanna",
  "zappato",
  "zattera",
  "zavorra",
  "zefiro",
  "zelante",
  "zelo",
  "zenzero",
  "zerbino",
  "zibetto",
  "zinco",
  "zircone",
  "zitto",
  "zolla",
  "zotico",
  "zucchero",
  "zufolo",
  "zulu",
  "zuppa"
];
const require$$6 = [
  "ábaco",
  "abdomen",
  "abeja",
  "abierto",
  "abogado",
  "abono",
  "aborto",
  "abrazo",
  "abrir",
  "abuelo",
  "abuso",
  "acabar",
  "academia",
  "acceso",
  "acción",
  "aceite",
  "acelga",
  "acento",
  "aceptar",
  "ácido",
  "aclarar",
  "acné",
  "acoger",
  "acoso",
  "activo",
  "acto",
  "actriz",
  "actuar",
  "acudir",
  "acuerdo",
  "acusar",
  "adicto",
  "admitir",
  "adoptar",
  "adorno",
  "aduana",
  "adulto",
  "aéreo",
  "afectar",
  "afición",
  "afinar",
  "afirmar",
  "ágil",
  "agitar",
  "agonía",
  "agosto",
  "agotar",
  "agregar",
  "agrio",
  "agua",
  "agudo",
  "águila",
  "aguja",
  "ahogo",
  "ahorro",
  "aire",
  "aislar",
  "ajedrez",
  "ajeno",
  "ajuste",
  "alacrán",
  "alambre",
  "alarma",
  "alba",
  "álbum",
  "alcalde",
  "aldea",
  "alegre",
  "alejar",
  "alerta",
  "aleta",
  "alfiler",
  "alga",
  "algodón",
  "aliado",
  "aliento",
  "alivio",
  "alma",
  "almeja",
  "almíbar",
  "altar",
  "alteza",
  "altivo",
  "alto",
  "altura",
  "alumno",
  "alzar",
  "amable",
  "amante",
  "amapola",
  "amargo",
  "amasar",
  "ámbar",
  "ámbito",
  "ameno",
  "amigo",
  "amistad",
  "amor",
  "amparo",
  "amplio",
  "ancho",
  "anciano",
  "ancla",
  "andar",
  "andén",
  "anemia",
  "ángulo",
  "anillo",
  "ánimo",
  "anís",
  "anotar",
  "antena",
  "antiguo",
  "antojo",
  "anual",
  "anular",
  "anuncio",
  "añadir",
  "añejo",
  "año",
  "apagar",
  "aparato",
  "apetito",
  "apio",
  "aplicar",
  "apodo",
  "aporte",
  "apoyo",
  "aprender",
  "aprobar",
  "apuesta",
  "apuro",
  "arado",
  "araña",
  "arar",
  "árbitro",
  "árbol",
  "arbusto",
  "archivo",
  "arco",
  "arder",
  "ardilla",
  "arduo",
  "área",
  "árido",
  "aries",
  "armonía",
  "arnés",
  "aroma",
  "arpa",
  "arpón",
  "arreglo",
  "arroz",
  "arruga",
  "arte",
  "artista",
  "asa",
  "asado",
  "asalto",
  "ascenso",
  "asegurar",
  "aseo",
  "asesor",
  "asiento",
  "asilo",
  "asistir",
  "asno",
  "asombro",
  "áspero",
  "astilla",
  "astro",
  "astuto",
  "asumir",
  "asunto",
  "atajo",
  "ataque",
  "atar",
  "atento",
  "ateo",
  "ático",
  "atleta",
  "átomo",
  "atraer",
  "atroz",
  "atún",
  "audaz",
  "audio",
  "auge",
  "aula",
  "aumento",
  "ausente",
  "autor",
  "aval",
  "avance",
  "avaro",
  "ave",
  "avellana",
  "avena",
  "avestruz",
  "avión",
  "aviso",
  "ayer",
  "ayuda",
  "ayuno",
  "azafrán",
  "azar",
  "azote",
  "azúcar",
  "azufre",
  "azul",
  "baba",
  "babor",
  "bache",
  "bahía",
  "baile",
  "bajar",
  "balanza",
  "balcón",
  "balde",
  "bambú",
  "banco",
  "banda",
  "baño",
  "barba",
  "barco",
  "barniz",
  "barro",
  "báscula",
  "bastón",
  "basura",
  "batalla",
  "batería",
  "batir",
  "batuta",
  "baúl",
  "bazar",
  "bebé",
  "bebida",
  "bello",
  "besar",
  "beso",
  "bestia",
  "bicho",
  "bien",
  "bingo",
  "blanco",
  "bloque",
  "blusa",
  "boa",
  "bobina",
  "bobo",
  "boca",
  "bocina",
  "boda",
  "bodega",
  "boina",
  "bola",
  "bolero",
  "bolsa",
  "bomba",
  "bondad",
  "bonito",
  "bono",
  "bonsái",
  "borde",
  "borrar",
  "bosque",
  "bote",
  "botín",
  "bóveda",
  "bozal",
  "bravo",
  "brazo",
  "brecha",
  "breve",
  "brillo",
  "brinco",
  "brisa",
  "broca",
  "broma",
  "bronce",
  "brote",
  "bruja",
  "brusco",
  "bruto",
  "buceo",
  "bucle",
  "bueno",
  "buey",
  "bufanda",
  "bufón",
  "búho",
  "buitre",
  "bulto",
  "burbuja",
  "burla",
  "burro",
  "buscar",
  "butaca",
  "buzón",
  "caballo",
  "cabeza",
  "cabina",
  "cabra",
  "cacao",
  "cadáver",
  "cadena",
  "caer",
  "café",
  "caída",
  "caimán",
  "caja",
  "cajón",
  "cal",
  "calamar",
  "calcio",
  "caldo",
  "calidad",
  "calle",
  "calma",
  "calor",
  "calvo",
  "cama",
  "cambio",
  "camello",
  "camino",
  "campo",
  "cáncer",
  "candil",
  "canela",
  "canguro",
  "canica",
  "canto",
  "caña",
  "cañón",
  "caoba",
  "caos",
  "capaz",
  "capitán",
  "capote",
  "captar",
  "capucha",
  "cara",
  "carbón",
  "cárcel",
  "careta",
  "carga",
  "cariño",
  "carne",
  "carpeta",
  "carro",
  "carta",
  "casa",
  "casco",
  "casero",
  "caspa",
  "castor",
  "catorce",
  "catre",
  "caudal",
  "causa",
  "cazo",
  "cebolla",
  "ceder",
  "cedro",
  "celda",
  "célebre",
  "celoso",
  "célula",
  "cemento",
  "ceniza",
  "centro",
  "cerca",
  "cerdo",
  "cereza",
  "cero",
  "cerrar",
  "certeza",
  "césped",
  "cetro",
  "chacal",
  "chaleco",
  "champú",
  "chancla",
  "chapa",
  "charla",
  "chico",
  "chiste",
  "chivo",
  "choque",
  "choza",
  "chuleta",
  "chupar",
  "ciclón",
  "ciego",
  "cielo",
  "cien",
  "cierto",
  "cifra",
  "cigarro",
  "cima",
  "cinco",
  "cine",
  "cinta",
  "ciprés",
  "circo",
  "ciruela",
  "cisne",
  "cita",
  "ciudad",
  "clamor",
  "clan",
  "claro",
  "clase",
  "clave",
  "cliente",
  "clima",
  "clínica",
  "cobre",
  "cocción",
  "cochino",
  "cocina",
  "coco",
  "código",
  "codo",
  "cofre",
  "coger",
  "cohete",
  "cojín",
  "cojo",
  "cola",
  "colcha",
  "colegio",
  "colgar",
  "colina",
  "collar",
  "colmo",
  "columna",
  "combate",
  "comer",
  "comida",
  "cómodo",
  "compra",
  "conde",
  "conejo",
  "conga",
  "conocer",
  "consejo",
  "contar",
  "copa",
  "copia",
  "corazón",
  "corbata",
  "corcho",
  "cordón",
  "corona",
  "correr",
  "coser",
  "cosmos",
  "costa",
  "cráneo",
  "cráter",
  "crear",
  "crecer",
  "creído",
  "crema",
  "cría",
  "crimen",
  "cripta",
  "crisis",
  "cromo",
  "crónica",
  "croqueta",
  "crudo",
  "cruz",
  "cuadro",
  "cuarto",
  "cuatro",
  "cubo",
  "cubrir",
  "cuchara",
  "cuello",
  "cuento",
  "cuerda",
  "cuesta",
  "cueva",
  "cuidar",
  "culebra",
  "culpa",
  "culto",
  "cumbre",
  "cumplir",
  "cuna",
  "cuneta",
  "cuota",
  "cupón",
  "cúpula",
  "curar",
  "curioso",
  "curso",
  "curva",
  "cutis",
  "dama",
  "danza",
  "dar",
  "dardo",
  "dátil",
  "deber",
  "débil",
  "década",
  "decir",
  "dedo",
  "defensa",
  "definir",
  "dejar",
  "delfín",
  "delgado",
  "delito",
  "demora",
  "denso",
  "dental",
  "deporte",
  "derecho",
  "derrota",
  "desayuno",
  "deseo",
  "desfile",
  "desnudo",
  "destino",
  "desvío",
  "detalle",
  "detener",
  "deuda",
  "día",
  "diablo",
  "diadema",
  "diamante",
  "diana",
  "diario",
  "dibujo",
  "dictar",
  "diente",
  "dieta",
  "diez",
  "difícil",
  "digno",
  "dilema",
  "diluir",
  "dinero",
  "directo",
  "dirigir",
  "disco",
  "diseño",
  "disfraz",
  "diva",
  "divino",
  "doble",
  "doce",
  "dolor",
  "domingo",
  "don",
  "donar",
  "dorado",
  "dormir",
  "dorso",
  "dos",
  "dosis",
  "dragón",
  "droga",
  "ducha",
  "duda",
  "duelo",
  "dueño",
  "dulce",
  "dúo",
  "duque",
  "durar",
  "dureza",
  "duro",
  "ébano",
  "ebrio",
  "echar",
  "eco",
  "ecuador",
  "edad",
  "edición",
  "edificio",
  "editor",
  "educar",
  "efecto",
  "eficaz",
  "eje",
  "ejemplo",
  "elefante",
  "elegir",
  "elemento",
  "elevar",
  "elipse",
  "élite",
  "elixir",
  "elogio",
  "eludir",
  "embudo",
  "emitir",
  "emoción",
  "empate",
  "empeño",
  "empleo",
  "empresa",
  "enano",
  "encargo",
  "enchufe",
  "encía",
  "enemigo",
  "enero",
  "enfado",
  "enfermo",
  "engaño",
  "enigma",
  "enlace",
  "enorme",
  "enredo",
  "ensayo",
  "enseñar",
  "entero",
  "entrar",
  "envase",
  "envío",
  "época",
  "equipo",
  "erizo",
  "escala",
  "escena",
  "escolar",
  "escribir",
  "escudo",
  "esencia",
  "esfera",
  "esfuerzo",
  "espada",
  "espejo",
  "espía",
  "esposa",
  "espuma",
  "esquí",
  "estar",
  "este",
  "estilo",
  "estufa",
  "etapa",
  "eterno",
  "ética",
  "etnia",
  "evadir",
  "evaluar",
  "evento",
  "evitar",
  "exacto",
  "examen",
  "exceso",
  "excusa",
  "exento",
  "exigir",
  "exilio",
  "existir",
  "éxito",
  "experto",
  "explicar",
  "exponer",
  "extremo",
  "fábrica",
  "fábula",
  "fachada",
  "fácil",
  "factor",
  "faena",
  "faja",
  "falda",
  "fallo",
  "falso",
  "faltar",
  "fama",
  "familia",
  "famoso",
  "faraón",
  "farmacia",
  "farol",
  "farsa",
  "fase",
  "fatiga",
  "fauna",
  "favor",
  "fax",
  "febrero",
  "fecha",
  "feliz",
  "feo",
  "feria",
  "feroz",
  "fértil",
  "fervor",
  "festín",
  "fiable",
  "fianza",
  "fiar",
  "fibra",
  "ficción",
  "ficha",
  "fideo",
  "fiebre",
  "fiel",
  "fiera",
  "fiesta",
  "figura",
  "fijar",
  "fijo",
  "fila",
  "filete",
  "filial",
  "filtro",
  "fin",
  "finca",
  "fingir",
  "finito",
  "firma",
  "flaco",
  "flauta",
  "flecha",
  "flor",
  "flota",
  "fluir",
  "flujo",
  "flúor",
  "fobia",
  "foca",
  "fogata",
  "fogón",
  "folio",
  "folleto",
  "fondo",
  "forma",
  "forro",
  "fortuna",
  "forzar",
  "fosa",
  "foto",
  "fracaso",
  "frágil",
  "franja",
  "frase",
  "fraude",
  "freír",
  "freno",
  "fresa",
  "frío",
  "frito",
  "fruta",
  "fuego",
  "fuente",
  "fuerza",
  "fuga",
  "fumar",
  "función",
  "funda",
  "furgón",
  "furia",
  "fusil",
  "fútbol",
  "futuro",
  "gacela",
  "gafas",
  "gaita",
  "gajo",
  "gala",
  "galería",
  "gallo",
  "gamba",
  "ganar",
  "gancho",
  "ganga",
  "ganso",
  "garaje",
  "garza",
  "gasolina",
  "gastar",
  "gato",
  "gavilán",
  "gemelo",
  "gemir",
  "gen",
  "género",
  "genio",
  "gente",
  "geranio",
  "gerente",
  "germen",
  "gesto",
  "gigante",
  "gimnasio",
  "girar",
  "giro",
  "glaciar",
  "globo",
  "gloria",
  "gol",
  "golfo",
  "goloso",
  "golpe",
  "goma",
  "gordo",
  "gorila",
  "gorra",
  "gota",
  "goteo",
  "gozar",
  "grada",
  "gráfico",
  "grano",
  "grasa",
  "gratis",
  "grave",
  "grieta",
  "grillo",
  "gripe",
  "gris",
  "grito",
  "grosor",
  "grúa",
  "grueso",
  "grumo",
  "grupo",
  "guante",
  "guapo",
  "guardia",
  "guerra",
  "guía",
  "guiño",
  "guion",
  "guiso",
  "guitarra",
  "gusano",
  "gustar",
  "haber",
  "hábil",
  "hablar",
  "hacer",
  "hacha",
  "hada",
  "hallar",
  "hamaca",
  "harina",
  "haz",
  "hazaña",
  "hebilla",
  "hebra",
  "hecho",
  "helado",
  "helio",
  "hembra",
  "herir",
  "hermano",
  "héroe",
  "hervir",
  "hielo",
  "hierro",
  "hígado",
  "higiene",
  "hijo",
  "himno",
  "historia",
  "hocico",
  "hogar",
  "hoguera",
  "hoja",
  "hombre",
  "hongo",
  "honor",
  "honra",
  "hora",
  "hormiga",
  "horno",
  "hostil",
  "hoyo",
  "hueco",
  "huelga",
  "huerta",
  "hueso",
  "huevo",
  "huida",
  "huir",
  "humano",
  "húmedo",
  "humilde",
  "humo",
  "hundir",
  "huracán",
  "hurto",
  "icono",
  "ideal",
  "idioma",
  "ídolo",
  "iglesia",
  "iglú",
  "igual",
  "ilegal",
  "ilusión",
  "imagen",
  "imán",
  "imitar",
  "impar",
  "imperio",
  "imponer",
  "impulso",
  "incapaz",
  "índice",
  "inerte",
  "infiel",
  "informe",
  "ingenio",
  "inicio",
  "inmenso",
  "inmune",
  "innato",
  "insecto",
  "instante",
  "interés",
  "íntimo",
  "intuir",
  "inútil",
  "invierno",
  "ira",
  "iris",
  "ironía",
  "isla",
  "islote",
  "jabalí",
  "jabón",
  "jamón",
  "jarabe",
  "jardín",
  "jarra",
  "jaula",
  "jazmín",
  "jefe",
  "jeringa",
  "jinete",
  "jornada",
  "joroba",
  "joven",
  "joya",
  "juerga",
  "jueves",
  "juez",
  "jugador",
  "jugo",
  "juguete",
  "juicio",
  "junco",
  "jungla",
  "junio",
  "juntar",
  "júpiter",
  "jurar",
  "justo",
  "juvenil",
  "juzgar",
  "kilo",
  "koala",
  "labio",
  "lacio",
  "lacra",
  "lado",
  "ladrón",
  "lagarto",
  "lágrima",
  "laguna",
  "laico",
  "lamer",
  "lámina",
  "lámpara",
  "lana",
  "lancha",
  "langosta",
  "lanza",
  "lápiz",
  "largo",
  "larva",
  "lástima",
  "lata",
  "látex",
  "latir",
  "laurel",
  "lavar",
  "lazo",
  "leal",
  "lección",
  "leche",
  "lector",
  "leer",
  "legión",
  "legumbre",
  "lejano",
  "lengua",
  "lento",
  "leña",
  "león",
  "leopardo",
  "lesión",
  "letal",
  "letra",
  "leve",
  "leyenda",
  "libertad",
  "libro",
  "licor",
  "líder",
  "lidiar",
  "lienzo",
  "liga",
  "ligero",
  "lima",
  "límite",
  "limón",
  "limpio",
  "lince",
  "lindo",
  "línea",
  "lingote",
  "lino",
  "linterna",
  "líquido",
  "liso",
  "lista",
  "litera",
  "litio",
  "litro",
  "llaga",
  "llama",
  "llanto",
  "llave",
  "llegar",
  "llenar",
  "llevar",
  "llorar",
  "llover",
  "lluvia",
  "lobo",
  "loción",
  "loco",
  "locura",
  "lógica",
  "logro",
  "lombriz",
  "lomo",
  "lonja",
  "lote",
  "lucha",
  "lucir",
  "lugar",
  "lujo",
  "luna",
  "lunes",
  "lupa",
  "lustro",
  "luto",
  "luz",
  "maceta",
  "macho",
  "madera",
  "madre",
  "maduro",
  "maestro",
  "mafia",
  "magia",
  "mago",
  "maíz",
  "maldad",
  "maleta",
  "malla",
  "malo",
  "mamá",
  "mambo",
  "mamut",
  "manco",
  "mando",
  "manejar",
  "manga",
  "maniquí",
  "manjar",
  "mano",
  "manso",
  "manta",
  "mañana",
  "mapa",
  "máquina",
  "mar",
  "marco",
  "marea",
  "marfil",
  "margen",
  "marido",
  "mármol",
  "marrón",
  "martes",
  "marzo",
  "masa",
  "máscara",
  "masivo",
  "matar",
  "materia",
  "matiz",
  "matriz",
  "máximo",
  "mayor",
  "mazorca",
  "mecha",
  "medalla",
  "medio",
  "médula",
  "mejilla",
  "mejor",
  "melena",
  "melón",
  "memoria",
  "menor",
  "mensaje",
  "mente",
  "menú",
  "mercado",
  "merengue",
  "mérito",
  "mes",
  "mesón",
  "meta",
  "meter",
  "método",
  "metro",
  "mezcla",
  "miedo",
  "miel",
  "miembro",
  "miga",
  "mil",
  "milagro",
  "militar",
  "millón",
  "mimo",
  "mina",
  "minero",
  "mínimo",
  "minuto",
  "miope",
  "mirar",
  "misa",
  "miseria",
  "misil",
  "mismo",
  "mitad",
  "mito",
  "mochila",
  "moción",
  "moda",
  "modelo",
  "moho",
  "mojar",
  "molde",
  "moler",
  "molino",
  "momento",
  "momia",
  "monarca",
  "moneda",
  "monja",
  "monto",
  "moño",
  "morada",
  "morder",
  "moreno",
  "morir",
  "morro",
  "morsa",
  "mortal",
  "mosca",
  "mostrar",
  "motivo",
  "mover",
  "móvil",
  "mozo",
  "mucho",
  "mudar",
  "mueble",
  "muela",
  "muerte",
  "muestra",
  "mugre",
  "mujer",
  "mula",
  "muleta",
  "multa",
  "mundo",
  "muñeca",
  "mural",
  "muro",
  "músculo",
  "museo",
  "musgo",
  "música",
  "muslo",
  "nácar",
  "nación",
  "nadar",
  "naipe",
  "naranja",
  "nariz",
  "narrar",
  "nasal",
  "natal",
  "nativo",
  "natural",
  "náusea",
  "naval",
  "nave",
  "navidad",
  "necio",
  "néctar",
  "negar",
  "negocio",
  "negro",
  "neón",
  "nervio",
  "neto",
  "neutro",
  "nevar",
  "nevera",
  "nicho",
  "nido",
  "niebla",
  "nieto",
  "niñez",
  "niño",
  "nítido",
  "nivel",
  "nobleza",
  "noche",
  "nómina",
  "noria",
  "norma",
  "norte",
  "nota",
  "noticia",
  "novato",
  "novela",
  "novio",
  "nube",
  "nuca",
  "núcleo",
  "nudillo",
  "nudo",
  "nuera",
  "nueve",
  "nuez",
  "nulo",
  "número",
  "nutria",
  "oasis",
  "obeso",
  "obispo",
  "objeto",
  "obra",
  "obrero",
  "observar",
  "obtener",
  "obvio",
  "oca",
  "ocaso",
  "océano",
  "ochenta",
  "ocho",
  "ocio",
  "ocre",
  "octavo",
  "octubre",
  "oculto",
  "ocupar",
  "ocurrir",
  "odiar",
  "odio",
  "odisea",
  "oeste",
  "ofensa",
  "oferta",
  "oficio",
  "ofrecer",
  "ogro",
  "oído",
  "oír",
  "ojo",
  "ola",
  "oleada",
  "olfato",
  "olivo",
  "olla",
  "olmo",
  "olor",
  "olvido",
  "ombligo",
  "onda",
  "onza",
  "opaco",
  "opción",
  "ópera",
  "opinar",
  "oponer",
  "optar",
  "óptica",
  "opuesto",
  "oración",
  "orador",
  "oral",
  "órbita",
  "orca",
  "orden",
  "oreja",
  "órgano",
  "orgía",
  "orgullo",
  "oriente",
  "origen",
  "orilla",
  "oro",
  "orquesta",
  "oruga",
  "osadía",
  "oscuro",
  "osezno",
  "oso",
  "ostra",
  "otoño",
  "otro",
  "oveja",
  "óvulo",
  "óxido",
  "oxígeno",
  "oyente",
  "ozono",
  "pacto",
  "padre",
  "paella",
  "página",
  "pago",
  "país",
  "pájaro",
  "palabra",
  "palco",
  "paleta",
  "pálido",
  "palma",
  "paloma",
  "palpar",
  "pan",
  "panal",
  "pánico",
  "pantera",
  "pañuelo",
  "papá",
  "papel",
  "papilla",
  "paquete",
  "parar",
  "parcela",
  "pared",
  "parir",
  "paro",
  "párpado",
  "parque",
  "párrafo",
  "parte",
  "pasar",
  "paseo",
  "pasión",
  "paso",
  "pasta",
  "pata",
  "patio",
  "patria",
  "pausa",
  "pauta",
  "pavo",
  "payaso",
  "peatón",
  "pecado",
  "pecera",
  "pecho",
  "pedal",
  "pedir",
  "pegar",
  "peine",
  "pelar",
  "peldaño",
  "pelea",
  "peligro",
  "pellejo",
  "pelo",
  "peluca",
  "pena",
  "pensar",
  "peñón",
  "peón",
  "peor",
  "pepino",
  "pequeño",
  "pera",
  "percha",
  "perder",
  "pereza",
  "perfil",
  "perico",
  "perla",
  "permiso",
  "perro",
  "persona",
  "pesa",
  "pesca",
  "pésimo",
  "pestaña",
  "pétalo",
  "petróleo",
  "pez",
  "pezuña",
  "picar",
  "pichón",
  "pie",
  "piedra",
  "pierna",
  "pieza",
  "pijama",
  "pilar",
  "piloto",
  "pimienta",
  "pino",
  "pintor",
  "pinza",
  "piña",
  "piojo",
  "pipa",
  "pirata",
  "pisar",
  "piscina",
  "piso",
  "pista",
  "pitón",
  "pizca",
  "placa",
  "plan",
  "plata",
  "playa",
  "plaza",
  "pleito",
  "pleno",
  "plomo",
  "pluma",
  "plural",
  "pobre",
  "poco",
  "poder",
  "podio",
  "poema",
  "poesía",
  "poeta",
  "polen",
  "policía",
  "pollo",
  "polvo",
  "pomada",
  "pomelo",
  "pomo",
  "pompa",
  "poner",
  "porción",
  "portal",
  "posada",
  "poseer",
  "posible",
  "poste",
  "potencia",
  "potro",
  "pozo",
  "prado",
  "precoz",
  "pregunta",
  "premio",
  "prensa",
  "preso",
  "previo",
  "primo",
  "príncipe",
  "prisión",
  "privar",
  "proa",
  "probar",
  "proceso",
  "producto",
  "proeza",
  "profesor",
  "programa",
  "prole",
  "promesa",
  "pronto",
  "propio",
  "próximo",
  "prueba",
  "público",
  "puchero",
  "pudor",
  "pueblo",
  "puerta",
  "puesto",
  "pulga",
  "pulir",
  "pulmón",
  "pulpo",
  "pulso",
  "puma",
  "punto",
  "puñal",
  "puño",
  "pupa",
  "pupila",
  "puré",
  "quedar",
  "queja",
  "quemar",
  "querer",
  "queso",
  "quieto",
  "química",
  "quince",
  "quitar",
  "rábano",
  "rabia",
  "rabo",
  "ración",
  "radical",
  "raíz",
  "rama",
  "rampa",
  "rancho",
  "rango",
  "rapaz",
  "rápido",
  "rapto",
  "rasgo",
  "raspa",
  "rato",
  "rayo",
  "raza",
  "razón",
  "reacción",
  "realidad",
  "rebaño",
  "rebote",
  "recaer",
  "receta",
  "rechazo",
  "recoger",
  "recreo",
  "recto",
  "recurso",
  "red",
  "redondo",
  "reducir",
  "reflejo",
  "reforma",
  "refrán",
  "refugio",
  "regalo",
  "regir",
  "regla",
  "regreso",
  "rehén",
  "reino",
  "reír",
  "reja",
  "relato",
  "relevo",
  "relieve",
  "relleno",
  "reloj",
  "remar",
  "remedio",
  "remo",
  "rencor",
  "rendir",
  "renta",
  "reparto",
  "repetir",
  "reposo",
  "reptil",
  "res",
  "rescate",
  "resina",
  "respeto",
  "resto",
  "resumen",
  "retiro",
  "retorno",
  "retrato",
  "reunir",
  "revés",
  "revista",
  "rey",
  "rezar",
  "rico",
  "riego",
  "rienda",
  "riesgo",
  "rifa",
  "rígido",
  "rigor",
  "rincón",
  "riñón",
  "río",
  "riqueza",
  "risa",
  "ritmo",
  "rito",
  "rizo",
  "roble",
  "roce",
  "rociar",
  "rodar",
  "rodeo",
  "rodilla",
  "roer",
  "rojizo",
  "rojo",
  "romero",
  "romper",
  "ron",
  "ronco",
  "ronda",
  "ropa",
  "ropero",
  "rosa",
  "rosca",
  "rostro",
  "rotar",
  "rubí",
  "rubor",
  "rudo",
  "rueda",
  "rugir",
  "ruido",
  "ruina",
  "ruleta",
  "rulo",
  "rumbo",
  "rumor",
  "ruptura",
  "ruta",
  "rutina",
  "sábado",
  "saber",
  "sabio",
  "sable",
  "sacar",
  "sagaz",
  "sagrado",
  "sala",
  "saldo",
  "salero",
  "salir",
  "salmón",
  "salón",
  "salsa",
  "salto",
  "salud",
  "salvar",
  "samba",
  "sanción",
  "sandía",
  "sanear",
  "sangre",
  "sanidad",
  "sano",
  "santo",
  "sapo",
  "saque",
  "sardina",
  "sartén",
  "sastre",
  "satán",
  "sauna",
  "saxofón",
  "sección",
  "seco",
  "secreto",
  "secta",
  "sed",
  "seguir",
  "seis",
  "sello",
  "selva",
  "semana",
  "semilla",
  "senda",
  "sensor",
  "señal",
  "señor",
  "separar",
  "sepia",
  "sequía",
  "ser",
  "serie",
  "sermón",
  "servir",
  "sesenta",
  "sesión",
  "seta",
  "setenta",
  "severo",
  "sexo",
  "sexto",
  "sidra",
  "siesta",
  "siete",
  "siglo",
  "signo",
  "sílaba",
  "silbar",
  "silencio",
  "silla",
  "símbolo",
  "simio",
  "sirena",
  "sistema",
  "sitio",
  "situar",
  "sobre",
  "socio",
  "sodio",
  "sol",
  "solapa",
  "soldado",
  "soledad",
  "sólido",
  "soltar",
  "solución",
  "sombra",
  "sondeo",
  "sonido",
  "sonoro",
  "sonrisa",
  "sopa",
  "soplar",
  "soporte",
  "sordo",
  "sorpresa",
  "sorteo",
  "sostén",
  "sótano",
  "suave",
  "subir",
  "suceso",
  "sudor",
  "suegra",
  "suelo",
  "sueño",
  "suerte",
  "sufrir",
  "sujeto",
  "sultán",
  "sumar",
  "superar",
  "suplir",
  "suponer",
  "supremo",
  "sur",
  "surco",
  "sureño",
  "surgir",
  "susto",
  "sutil",
  "tabaco",
  "tabique",
  "tabla",
  "tabú",
  "taco",
  "tacto",
  "tajo",
  "talar",
  "talco",
  "talento",
  "talla",
  "talón",
  "tamaño",
  "tambor",
  "tango",
  "tanque",
  "tapa",
  "tapete",
  "tapia",
  "tapón",
  "taquilla",
  "tarde",
  "tarea",
  "tarifa",
  "tarjeta",
  "tarot",
  "tarro",
  "tarta",
  "tatuaje",
  "tauro",
  "taza",
  "tazón",
  "teatro",
  "techo",
  "tecla",
  "técnica",
  "tejado",
  "tejer",
  "tejido",
  "tela",
  "teléfono",
  "tema",
  "temor",
  "templo",
  "tenaz",
  "tender",
  "tener",
  "tenis",
  "tenso",
  "teoría",
  "terapia",
  "terco",
  "término",
  "ternura",
  "terror",
  "tesis",
  "tesoro",
  "testigo",
  "tetera",
  "texto",
  "tez",
  "tibio",
  "tiburón",
  "tiempo",
  "tienda",
  "tierra",
  "tieso",
  "tigre",
  "tijera",
  "tilde",
  "timbre",
  "tímido",
  "timo",
  "tinta",
  "tío",
  "típico",
  "tipo",
  "tira",
  "tirón",
  "titán",
  "títere",
  "título",
  "tiza",
  "toalla",
  "tobillo",
  "tocar",
  "tocino",
  "todo",
  "toga",
  "toldo",
  "tomar",
  "tono",
  "tonto",
  "topar",
  "tope",
  "toque",
  "tórax",
  "torero",
  "tormenta",
  "torneo",
  "toro",
  "torpedo",
  "torre",
  "torso",
  "tortuga",
  "tos",
  "tosco",
  "toser",
  "tóxico",
  "trabajo",
  "tractor",
  "traer",
  "tráfico",
  "trago",
  "traje",
  "tramo",
  "trance",
  "trato",
  "trauma",
  "trazar",
  "trébol",
  "tregua",
  "treinta",
  "tren",
  "trepar",
  "tres",
  "tribu",
  "trigo",
  "tripa",
  "triste",
  "triunfo",
  "trofeo",
  "trompa",
  "tronco",
  "tropa",
  "trote",
  "trozo",
  "truco",
  "trueno",
  "trufa",
  "tubería",
  "tubo",
  "tuerto",
  "tumba",
  "tumor",
  "túnel",
  "túnica",
  "turbina",
  "turismo",
  "turno",
  "tutor",
  "ubicar",
  "úlcera",
  "umbral",
  "unidad",
  "unir",
  "universo",
  "uno",
  "untar",
  "uña",
  "urbano",
  "urbe",
  "urgente",
  "urna",
  "usar",
  "usuario",
  "útil",
  "utopía",
  "uva",
  "vaca",
  "vacío",
  "vacuna",
  "vagar",
  "vago",
  "vaina",
  "vajilla",
  "vale",
  "válido",
  "valle",
  "valor",
  "válvula",
  "vampiro",
  "vara",
  "variar",
  "varón",
  "vaso",
  "vecino",
  "vector",
  "vehículo",
  "veinte",
  "vejez",
  "vela",
  "velero",
  "veloz",
  "vena",
  "vencer",
  "venda",
  "veneno",
  "vengar",
  "venir",
  "venta",
  "venus",
  "ver",
  "verano",
  "verbo",
  "verde",
  "vereda",
  "verja",
  "verso",
  "verter",
  "vía",
  "viaje",
  "vibrar",
  "vicio",
  "víctima",
  "vida",
  "vídeo",
  "vidrio",
  "viejo",
  "viernes",
  "vigor",
  "vil",
  "villa",
  "vinagre",
  "vino",
  "viñedo",
  "violín",
  "viral",
  "virgo",
  "virtud",
  "visor",
  "víspera",
  "vista",
  "vitamina",
  "viudo",
  "vivaz",
  "vivero",
  "vivir",
  "vivo",
  "volcán",
  "volumen",
  "volver",
  "voraz",
  "votar",
  "voto",
  "voz",
  "vuelo",
  "vulgar",
  "yacer",
  "yate",
  "yegua",
  "yema",
  "yerno",
  "yeso",
  "yodo",
  "yoga",
  "yogur",
  "zafiro",
  "zanja",
  "zapato",
  "zarza",
  "zona",
  "zorro",
  "zumo",
  "zurdo"
];
const require$$7 = [
  "あいこくしん",
  "あいさつ",
  "あいだ",
  "あおぞら",
  "あかちゃん",
  "あきる",
  "あけがた",
  "あける",
  "あこがれる",
  "あさい",
  "あさひ",
  "あしあと",
  "あじわう",
  "あずかる",
  "あずき",
  "あそぶ",
  "あたえる",
  "あたためる",
  "あたりまえ",
  "あたる",
  "あつい",
  "あつかう",
  "あっしゅく",
  "あつまり",
  "あつめる",
  "あてな",
  "あてはまる",
  "あひる",
  "あぶら",
  "あぶる",
  "あふれる",
  "あまい",
  "あまど",
  "あまやかす",
  "あまり",
  "あみもの",
  "あめりか",
  "あやまる",
  "あゆむ",
  "あらいぐま",
  "あらし",
  "あらすじ",
  "あらためる",
  "あらゆる",
  "あらわす",
  "ありがとう",
  "あわせる",
  "あわてる",
  "あんい",
  "あんがい",
  "あんこ",
  "あんぜん",
  "あんてい",
  "あんない",
  "あんまり",
  "いいだす",
  "いおん",
  "いがい",
  "いがく",
  "いきおい",
  "いきなり",
  "いきもの",
  "いきる",
  "いくじ",
  "いくぶん",
  "いけばな",
  "いけん",
  "いこう",
  "いこく",
  "いこつ",
  "いさましい",
  "いさん",
  "いしき",
  "いじゅう",
  "いじょう",
  "いじわる",
  "いずみ",
  "いずれ",
  "いせい",
  "いせえび",
  "いせかい",
  "いせき",
  "いぜん",
  "いそうろう",
  "いそがしい",
  "いだい",
  "いだく",
  "いたずら",
  "いたみ",
  "いたりあ",
  "いちおう",
  "いちじ",
  "いちど",
  "いちば",
  "いちぶ",
  "いちりゅう",
  "いつか",
  "いっしゅん",
  "いっせい",
  "いっそう",
  "いったん",
  "いっち",
  "いってい",
  "いっぽう",
  "いてざ",
  "いてん",
  "いどう",
  "いとこ",
  "いない",
  "いなか",
  "いねむり",
  "いのち",
  "いのる",
  "いはつ",
  "いばる",
  "いはん",
  "いびき",
  "いひん",
  "いふく",
  "いへん",
  "いほう",
  "いみん",
  "いもうと",
  "いもたれ",
  "いもり",
  "いやがる",
  "いやす",
  "いよかん",
  "いよく",
  "いらい",
  "いらすと",
  "いりぐち",
  "いりょう",
  "いれい",
  "いれもの",
  "いれる",
  "いろえんぴつ",
  "いわい",
  "いわう",
  "いわかん",
  "いわば",
  "いわゆる",
  "いんげんまめ",
  "いんさつ",
  "いんしょう",
  "いんよう",
  "うえき",
  "うえる",
  "うおざ",
  "うがい",
  "うかぶ",
  "うかべる",
  "うきわ",
  "うくらいな",
  "うくれれ",
  "うけたまわる",
  "うけつけ",
  "うけとる",
  "うけもつ",
  "うける",
  "うごかす",
  "うごく",
  "うこん",
  "うさぎ",
  "うしなう",
  "うしろがみ",
  "うすい",
  "うすぎ",
  "うすぐらい",
  "うすめる",
  "うせつ",
  "うちあわせ",
  "うちがわ",
  "うちき",
  "うちゅう",
  "うっかり",
  "うつくしい",
  "うったえる",
  "うつる",
  "うどん",
  "うなぎ",
  "うなじ",
  "うなずく",
  "うなる",
  "うねる",
  "うのう",
  "うぶげ",
  "うぶごえ",
  "うまれる",
  "うめる",
  "うもう",
  "うやまう",
  "うよく",
  "うらがえす",
  "うらぐち",
  "うらない",
  "うりあげ",
  "うりきれ",
  "うるさい",
  "うれしい",
  "うれゆき",
  "うれる",
  "うろこ",
  "うわき",
  "うわさ",
  "うんこう",
  "うんちん",
  "うんてん",
  "うんどう",
  "えいえん",
  "えいが",
  "えいきょう",
  "えいご",
  "えいせい",
  "えいぶん",
  "えいよう",
  "えいわ",
  "えおり",
  "えがお",
  "えがく",
  "えきたい",
  "えくせる",
  "えしゃく",
  "えすて",
  "えつらん",
  "えのぐ",
  "えほうまき",
  "えほん",
  "えまき",
  "えもじ",
  "えもの",
  "えらい",
  "えらぶ",
  "えりあ",
  "えんえん",
  "えんかい",
  "えんぎ",
  "えんげき",
  "えんしゅう",
  "えんぜつ",
  "えんそく",
  "えんちょう",
  "えんとつ",
  "おいかける",
  "おいこす",
  "おいしい",
  "おいつく",
  "おうえん",
  "おうさま",
  "おうじ",
  "おうせつ",
  "おうたい",
  "おうふく",
  "おうべい",
  "おうよう",
  "おえる",
  "おおい",
  "おおう",
  "おおどおり",
  "おおや",
  "おおよそ",
  "おかえり",
  "おかず",
  "おがむ",
  "おかわり",
  "おぎなう",
  "おきる",
  "おくさま",
  "おくじょう",
  "おくりがな",
  "おくる",
  "おくれる",
  "おこす",
  "おこなう",
  "おこる",
  "おさえる",
  "おさない",
  "おさめる",
  "おしいれ",
  "おしえる",
  "おじぎ",
  "おじさん",
  "おしゃれ",
  "おそらく",
  "おそわる",
  "おたがい",
  "おたく",
  "おだやか",
  "おちつく",
  "おっと",
  "おつり",
  "おでかけ",
  "おとしもの",
  "おとなしい",
  "おどり",
  "おどろかす",
  "おばさん",
  "おまいり",
  "おめでとう",
  "おもいで",
  "おもう",
  "おもたい",
  "おもちゃ",
  "おやつ",
  "おやゆび",
  "およぼす",
  "おらんだ",
  "おろす",
  "おんがく",
  "おんけい",
  "おんしゃ",
  "おんせん",
  "おんだん",
  "おんちゅう",
  "おんどけい",
  "かあつ",
  "かいが",
  "がいき",
  "がいけん",
  "がいこう",
  "かいさつ",
  "かいしゃ",
  "かいすいよく",
  "かいぜん",
  "かいぞうど",
  "かいつう",
  "かいてん",
  "かいとう",
  "かいふく",
  "がいへき",
  "かいほう",
  "かいよう",
  "がいらい",
  "かいわ",
  "かえる",
  "かおり",
  "かかえる",
  "かがく",
  "かがし",
  "かがみ",
  "かくご",
  "かくとく",
  "かざる",
  "がぞう",
  "かたい",
  "かたち",
  "がちょう",
  "がっきゅう",
  "がっこう",
  "がっさん",
  "がっしょう",
  "かなざわし",
  "かのう",
  "がはく",
  "かぶか",
  "かほう",
  "かほご",
  "かまう",
  "かまぼこ",
  "かめれおん",
  "かゆい",
  "かようび",
  "からい",
  "かるい",
  "かろう",
  "かわく",
  "かわら",
  "がんか",
  "かんけい",
  "かんこう",
  "かんしゃ",
  "かんそう",
  "かんたん",
  "かんち",
  "がんばる",
  "きあい",
  "きあつ",
  "きいろ",
  "ぎいん",
  "きうい",
  "きうん",
  "きえる",
  "きおう",
  "きおく",
  "きおち",
  "きおん",
  "きかい",
  "きかく",
  "きかんしゃ",
  "ききて",
  "きくばり",
  "きくらげ",
  "きけんせい",
  "きこう",
  "きこえる",
  "きこく",
  "きさい",
  "きさく",
  "きさま",
  "きさらぎ",
  "ぎじかがく",
  "ぎしき",
  "ぎじたいけん",
  "ぎじにってい",
  "ぎじゅつしゃ",
  "きすう",
  "きせい",
  "きせき",
  "きせつ",
  "きそう",
  "きぞく",
  "きぞん",
  "きたえる",
  "きちょう",
  "きつえん",
  "ぎっちり",
  "きつつき",
  "きつね",
  "きてい",
  "きどう",
  "きどく",
  "きない",
  "きなが",
  "きなこ",
  "きぬごし",
  "きねん",
  "きのう",
  "きのした",
  "きはく",
  "きびしい",
  "きひん",
  "きふく",
  "きぶん",
  "きぼう",
  "きほん",
  "きまる",
  "きみつ",
  "きむずかしい",
  "きめる",
  "きもだめし",
  "きもち",
  "きもの",
  "きゃく",
  "きやく",
  "ぎゅうにく",
  "きよう",
  "きょうりゅう",
  "きらい",
  "きらく",
  "きりん",
  "きれい",
  "きれつ",
  "きろく",
  "ぎろん",
  "きわめる",
  "ぎんいろ",
  "きんかくじ",
  "きんじょ",
  "きんようび",
  "ぐあい",
  "くいず",
  "くうかん",
  "くうき",
  "くうぐん",
  "くうこう",
  "ぐうせい",
  "くうそう",
  "ぐうたら",
  "くうふく",
  "くうぼ",
  "くかん",
  "くきょう",
  "くげん",
  "ぐこう",
  "くさい",
  "くさき",
  "くさばな",
  "くさる",
  "くしゃみ",
  "くしょう",
  "くすのき",
  "くすりゆび",
  "くせげ",
  "くせん",
  "ぐたいてき",
  "くださる",
  "くたびれる",
  "くちこみ",
  "くちさき",
  "くつした",
  "ぐっすり",
  "くつろぐ",
  "くとうてん",
  "くどく",
  "くなん",
  "くねくね",
  "くのう",
  "くふう",
  "くみあわせ",
  "くみたてる",
  "くめる",
  "くやくしょ",
  "くらす",
  "くらべる",
  "くるま",
  "くれる",
  "くろう",
  "くわしい",
  "ぐんかん",
  "ぐんしょく",
  "ぐんたい",
  "ぐんて",
  "けあな",
  "けいかく",
  "けいけん",
  "けいこ",
  "けいさつ",
  "げいじゅつ",
  "けいたい",
  "げいのうじん",
  "けいれき",
  "けいろ",
  "けおとす",
  "けおりもの",
  "げきか",
  "げきげん",
  "げきだん",
  "げきちん",
  "げきとつ",
  "げきは",
  "げきやく",
  "げこう",
  "げこくじょう",
  "げざい",
  "けさき",
  "げざん",
  "けしき",
  "けしごむ",
  "けしょう",
  "げすと",
  "けたば",
  "けちゃっぷ",
  "けちらす",
  "けつあつ",
  "けつい",
  "けつえき",
  "けっこん",
  "けつじょ",
  "けっせき",
  "けってい",
  "けつまつ",
  "げつようび",
  "げつれい",
  "けつろん",
  "げどく",
  "けとばす",
  "けとる",
  "けなげ",
  "けなす",
  "けなみ",
  "けぬき",
  "げねつ",
  "けねん",
  "けはい",
  "げひん",
  "けぶかい",
  "げぼく",
  "けまり",
  "けみかる",
  "けむし",
  "けむり",
  "けもの",
  "けらい",
  "けろけろ",
  "けわしい",
  "けんい",
  "けんえつ",
  "けんお",
  "けんか",
  "げんき",
  "けんげん",
  "けんこう",
  "けんさく",
  "けんしゅう",
  "けんすう",
  "げんそう",
  "けんちく",
  "けんてい",
  "けんとう",
  "けんない",
  "けんにん",
  "げんぶつ",
  "けんま",
  "けんみん",
  "けんめい",
  "けんらん",
  "けんり",
  "こあくま",
  "こいぬ",
  "こいびと",
  "ごうい",
  "こうえん",
  "こうおん",
  "こうかん",
  "ごうきゅう",
  "ごうけい",
  "こうこう",
  "こうさい",
  "こうじ",
  "こうすい",
  "ごうせい",
  "こうそく",
  "こうたい",
  "こうちゃ",
  "こうつう",
  "こうてい",
  "こうどう",
  "こうない",
  "こうはい",
  "ごうほう",
  "ごうまん",
  "こうもく",
  "こうりつ",
  "こえる",
  "こおり",
  "ごかい",
  "ごがつ",
  "ごかん",
  "こくご",
  "こくさい",
  "こくとう",
  "こくない",
  "こくはく",
  "こぐま",
  "こけい",
  "こける",
  "ここのか",
  "こころ",
  "こさめ",
  "こしつ",
  "こすう",
  "こせい",
  "こせき",
  "こぜん",
  "こそだて",
  "こたい",
  "こたえる",
  "こたつ",
  "こちょう",
  "こっか",
  "こつこつ",
  "こつばん",
  "こつぶ",
  "こてい",
  "こてん",
  "ことがら",
  "ことし",
  "ことば",
  "ことり",
  "こなごな",
  "こねこね",
  "このまま",
  "このみ",
  "このよ",
  "ごはん",
  "こひつじ",
  "こふう",
  "こふん",
  "こぼれる",
  "ごまあぶら",
  "こまかい",
  "ごますり",
  "こまつな",
  "こまる",
  "こむぎこ",
  "こもじ",
  "こもち",
  "こもの",
  "こもん",
  "こやく",
  "こやま",
  "こゆう",
  "こゆび",
  "こよい",
  "こよう",
  "こりる",
  "これくしょん",
  "ころっけ",
  "こわもて",
  "こわれる",
  "こんいん",
  "こんかい",
  "こんき",
  "こんしゅう",
  "こんすい",
  "こんだて",
  "こんとん",
  "こんなん",
  "こんびに",
  "こんぽん",
  "こんまけ",
  "こんや",
  "こんれい",
  "こんわく",
  "ざいえき",
  "さいかい",
  "さいきん",
  "ざいげん",
  "ざいこ",
  "さいしょ",
  "さいせい",
  "ざいたく",
  "ざいちゅう",
  "さいてき",
  "ざいりょう",
  "さうな",
  "さかいし",
  "さがす",
  "さかな",
  "さかみち",
  "さがる",
  "さぎょう",
  "さくし",
  "さくひん",
  "さくら",
  "さこく",
  "さこつ",
  "さずかる",
  "ざせき",
  "さたん",
  "さつえい",
  "ざつおん",
  "ざっか",
  "ざつがく",
  "さっきょく",
  "ざっし",
  "さつじん",
  "ざっそう",
  "さつたば",
  "さつまいも",
  "さてい",
  "さといも",
  "さとう",
  "さとおや",
  "さとし",
  "さとる",
  "さのう",
  "さばく",
  "さびしい",
  "さべつ",
  "さほう",
  "さほど",
  "さます",
  "さみしい",
  "さみだれ",
  "さむけ",
  "さめる",
  "さやえんどう",
  "さゆう",
  "さよう",
  "さよく",
  "さらだ",
  "ざるそば",
  "さわやか",
  "さわる",
  "さんいん",
  "さんか",
  "さんきゃく",
  "さんこう",
  "さんさい",
  "ざんしょ",
  "さんすう",
  "さんせい",
  "さんそ",
  "さんち",
  "さんま",
  "さんみ",
  "さんらん",
  "しあい",
  "しあげ",
  "しあさって",
  "しあわせ",
  "しいく",
  "しいん",
  "しうち",
  "しえい",
  "しおけ",
  "しかい",
  "しかく",
  "じかん",
  "しごと",
  "しすう",
  "じだい",
  "したうけ",
  "したぎ",
  "したて",
  "したみ",
  "しちょう",
  "しちりん",
  "しっかり",
  "しつじ",
  "しつもん",
  "してい",
  "してき",
  "してつ",
  "じてん",
  "じどう",
  "しなぎれ",
  "しなもの",
  "しなん",
  "しねま",
  "しねん",
  "しのぐ",
  "しのぶ",
  "しはい",
  "しばかり",
  "しはつ",
  "しはらい",
  "しはん",
  "しひょう",
  "しふく",
  "じぶん",
  "しへい",
  "しほう",
  "しほん",
  "しまう",
  "しまる",
  "しみん",
  "しむける",
  "じむしょ",
  "しめい",
  "しめる",
  "しもん",
  "しゃいん",
  "しゃうん",
  "しゃおん",
  "じゃがいも",
  "しやくしょ",
  "しゃくほう",
  "しゃけん",
  "しゃこ",
  "しゃざい",
  "しゃしん",
  "しゃせん",
  "しゃそう",
  "しゃたい",
  "しゃちょう",
  "しゃっきん",
  "じゃま",
  "しゃりん",
  "しゃれい",
  "じゆう",
  "じゅうしょ",
  "しゅくはく",
  "じゅしん",
  "しゅっせき",
  "しゅみ",
  "しゅらば",
  "じゅんばん",
  "しょうかい",
  "しょくたく",
  "しょっけん",
  "しょどう",
  "しょもつ",
  "しらせる",
  "しらべる",
  "しんか",
  "しんこう",
  "じんじゃ",
  "しんせいじ",
  "しんちく",
  "しんりん",
  "すあげ",
  "すあし",
  "すあな",
  "ずあん",
  "すいえい",
  "すいか",
  "すいとう",
  "ずいぶん",
  "すいようび",
  "すうがく",
  "すうじつ",
  "すうせん",
  "すおどり",
  "すきま",
  "すくう",
  "すくない",
  "すける",
  "すごい",
  "すこし",
  "ずさん",
  "すずしい",
  "すすむ",
  "すすめる",
  "すっかり",
  "ずっしり",
  "ずっと",
  "すてき",
  "すてる",
  "すねる",
  "すのこ",
  "すはだ",
  "すばらしい",
  "ずひょう",
  "ずぶぬれ",
  "すぶり",
  "すふれ",
  "すべて",
  "すべる",
  "ずほう",
  "すぼん",
  "すまい",
  "すめし",
  "すもう",
  "すやき",
  "すらすら",
  "するめ",
  "すれちがう",
  "すろっと",
  "すわる",
  "すんぜん",
  "すんぽう",
  "せあぶら",
  "せいかつ",
  "せいげん",
  "せいじ",
  "せいよう",
  "せおう",
  "せかいかん",
  "せきにん",
  "せきむ",
  "せきゆ",
  "せきらんうん",
  "せけん",
  "せこう",
  "せすじ",
  "せたい",
  "せたけ",
  "せっかく",
  "せっきゃく",
  "ぜっく",
  "せっけん",
  "せっこつ",
  "せっさたくま",
  "せつぞく",
  "せつだん",
  "せつでん",
  "せっぱん",
  "せつび",
  "せつぶん",
  "せつめい",
  "せつりつ",
  "せなか",
  "せのび",
  "せはば",
  "せびろ",
  "せぼね",
  "せまい",
  "せまる",
  "せめる",
  "せもたれ",
  "せりふ",
  "ぜんあく",
  "せんい",
  "せんえい",
  "せんか",
  "せんきょ",
  "せんく",
  "せんげん",
  "ぜんご",
  "せんさい",
  "せんしゅ",
  "せんすい",
  "せんせい",
  "せんぞ",
  "せんたく",
  "せんちょう",
  "せんてい",
  "せんとう",
  "せんぬき",
  "せんねん",
  "せんぱい",
  "ぜんぶ",
  "ぜんぽう",
  "せんむ",
  "せんめんじょ",
  "せんもん",
  "せんやく",
  "せんゆう",
  "せんよう",
  "ぜんら",
  "ぜんりゃく",
  "せんれい",
  "せんろ",
  "そあく",
  "そいとげる",
  "そいね",
  "そうがんきょう",
  "そうき",
  "そうご",
  "そうしん",
  "そうだん",
  "そうなん",
  "そうび",
  "そうめん",
  "そうり",
  "そえもの",
  "そえん",
  "そがい",
  "そげき",
  "そこう",
  "そこそこ",
  "そざい",
  "そしな",
  "そせい",
  "そせん",
  "そそぐ",
  "そだてる",
  "そつう",
  "そつえん",
  "そっかん",
  "そつぎょう",
  "そっけつ",
  "そっこう",
  "そっせん",
  "そっと",
  "そとがわ",
  "そとづら",
  "そなえる",
  "そなた",
  "そふぼ",
  "そぼく",
  "そぼろ",
  "そまつ",
  "そまる",
  "そむく",
  "そむりえ",
  "そめる",
  "そもそも",
  "そよかぜ",
  "そらまめ",
  "そろう",
  "そんかい",
  "そんけい",
  "そんざい",
  "そんしつ",
  "そんぞく",
  "そんちょう",
  "ぞんび",
  "ぞんぶん",
  "そんみん",
  "たあい",
  "たいいん",
  "たいうん",
  "たいえき",
  "たいおう",
  "だいがく",
  "たいき",
  "たいぐう",
  "たいけん",
  "たいこ",
  "たいざい",
  "だいじょうぶ",
  "だいすき",
  "たいせつ",
  "たいそう",
  "だいたい",
  "たいちょう",
  "たいてい",
  "だいどころ",
  "たいない",
  "たいねつ",
  "たいのう",
  "たいはん",
  "だいひょう",
  "たいふう",
  "たいへん",
  "たいほ",
  "たいまつばな",
  "たいみんぐ",
  "たいむ",
  "たいめん",
  "たいやき",
  "たいよう",
  "たいら",
  "たいりょく",
  "たいる",
  "たいわん",
  "たうえ",
  "たえる",
  "たおす",
  "たおる",
  "たおれる",
  "たかい",
  "たかね",
  "たきび",
  "たくさん",
  "たこく",
  "たこやき",
  "たさい",
  "たしざん",
  "だじゃれ",
  "たすける",
  "たずさわる",
  "たそがれ",
  "たたかう",
  "たたく",
  "ただしい",
  "たたみ",
  "たちばな",
  "だっかい",
  "だっきゃく",
  "だっこ",
  "だっしゅつ",
  "だったい",
  "たてる",
  "たとえる",
  "たなばた",
  "たにん",
  "たぬき",
  "たのしみ",
  "たはつ",
  "たぶん",
  "たべる",
  "たぼう",
  "たまご",
  "たまる",
  "だむる",
  "ためいき",
  "ためす",
  "ためる",
  "たもつ",
  "たやすい",
  "たよる",
  "たらす",
  "たりきほんがん",
  "たりょう",
  "たりる",
  "たると",
  "たれる",
  "たれんと",
  "たろっと",
  "たわむれる",
  "だんあつ",
  "たんい",
  "たんおん",
  "たんか",
  "たんき",
  "たんけん",
  "たんご",
  "たんさん",
  "たんじょうび",
  "だんせい",
  "たんそく",
  "たんたい",
  "だんち",
  "たんてい",
  "たんとう",
  "だんな",
  "たんにん",
  "だんねつ",
  "たんのう",
  "たんぴん",
  "だんぼう",
  "たんまつ",
  "たんめい",
  "だんれつ",
  "だんろ",
  "だんわ",
  "ちあい",
  "ちあん",
  "ちいき",
  "ちいさい",
  "ちえん",
  "ちかい",
  "ちから",
  "ちきゅう",
  "ちきん",
  "ちけいず",
  "ちけん",
  "ちこく",
  "ちさい",
  "ちしき",
  "ちしりょう",
  "ちせい",
  "ちそう",
  "ちたい",
  "ちたん",
  "ちちおや",
  "ちつじょ",
  "ちてき",
  "ちてん",
  "ちぬき",
  "ちぬり",
  "ちのう",
  "ちひょう",
  "ちへいせん",
  "ちほう",
  "ちまた",
  "ちみつ",
  "ちみどろ",
  "ちめいど",
  "ちゃんこなべ",
  "ちゅうい",
  "ちゆりょく",
  "ちょうし",
  "ちょさくけん",
  "ちらし",
  "ちらみ",
  "ちりがみ",
  "ちりょう",
  "ちるど",
  "ちわわ",
  "ちんたい",
  "ちんもく",
  "ついか",
  "ついたち",
  "つうか",
  "つうじょう",
  "つうはん",
  "つうわ",
  "つかう",
  "つかれる",
  "つくね",
  "つくる",
  "つけね",
  "つける",
  "つごう",
  "つたえる",
  "つづく",
  "つつじ",
  "つつむ",
  "つとめる",
  "つながる",
  "つなみ",
  "つねづね",
  "つのる",
  "つぶす",
  "つまらない",
  "つまる",
  "つみき",
  "つめたい",
  "つもり",
  "つもる",
  "つよい",
  "つるぼ",
  "つるみく",
  "つわもの",
  "つわり",
  "てあし",
  "てあて",
  "てあみ",
  "ていおん",
  "ていか",
  "ていき",
  "ていけい",
  "ていこく",
  "ていさつ",
  "ていし",
  "ていせい",
  "ていたい",
  "ていど",
  "ていねい",
  "ていひょう",
  "ていへん",
  "ていぼう",
  "てうち",
  "ておくれ",
  "てきとう",
  "てくび",
  "でこぼこ",
  "てさぎょう",
  "てさげ",
  "てすり",
  "てそう",
  "てちがい",
  "てちょう",
  "てつがく",
  "てつづき",
  "でっぱ",
  "てつぼう",
  "てつや",
  "でぬかえ",
  "てぬき",
  "てぬぐい",
  "てのひら",
  "てはい",
  "てぶくろ",
  "てふだ",
  "てほどき",
  "てほん",
  "てまえ",
  "てまきずし",
  "てみじか",
  "てみやげ",
  "てらす",
  "てれび",
  "てわけ",
  "てわたし",
  "でんあつ",
  "てんいん",
  "てんかい",
  "てんき",
  "てんぐ",
  "てんけん",
  "てんごく",
  "てんさい",
  "てんし",
  "てんすう",
  "でんち",
  "てんてき",
  "てんとう",
  "てんない",
  "てんぷら",
  "てんぼうだい",
  "てんめつ",
  "てんらんかい",
  "でんりょく",
  "でんわ",
  "どあい",
  "といれ",
  "どうかん",
  "とうきゅう",
  "どうぐ",
  "とうし",
  "とうむぎ",
  "とおい",
  "とおか",
  "とおく",
  "とおす",
  "とおる",
  "とかい",
  "とかす",
  "ときおり",
  "ときどき",
  "とくい",
  "とくしゅう",
  "とくてん",
  "とくに",
  "とくべつ",
  "とけい",
  "とける",
  "とこや",
  "とさか",
  "としょかん",
  "とそう",
  "とたん",
  "とちゅう",
  "とっきゅう",
  "とっくん",
  "とつぜん",
  "とつにゅう",
  "とどける",
  "ととのえる",
  "とない",
  "となえる",
  "となり",
  "とのさま",
  "とばす",
  "どぶがわ",
  "とほう",
  "とまる",
  "とめる",
  "ともだち",
  "ともる",
  "どようび",
  "とらえる",
  "とんかつ",
  "どんぶり",
  "ないかく",
  "ないこう",
  "ないしょ",
  "ないす",
  "ないせん",
  "ないそう",
  "なおす",
  "ながい",
  "なくす",
  "なげる",
  "なこうど",
  "なさけ",
  "なたでここ",
  "なっとう",
  "なつやすみ",
  "ななおし",
  "なにごと",
  "なにもの",
  "なにわ",
  "なのか",
  "なふだ",
  "なまいき",
  "なまえ",
  "なまみ",
  "なみだ",
  "なめらか",
  "なめる",
  "なやむ",
  "ならう",
  "ならび",
  "ならぶ",
  "なれる",
  "なわとび",
  "なわばり",
  "にあう",
  "にいがた",
  "にうけ",
  "におい",
  "にかい",
  "にがて",
  "にきび",
  "にくしみ",
  "にくまん",
  "にげる",
  "にさんかたんそ",
  "にしき",
  "にせもの",
  "にちじょう",
  "にちようび",
  "にっか",
  "にっき",
  "にっけい",
  "にっこう",
  "にっさん",
  "にっしょく",
  "にっすう",
  "にっせき",
  "にってい",
  "になう",
  "にほん",
  "にまめ",
  "にもつ",
  "にやり",
  "にゅういん",
  "にりんしゃ",
  "にわとり",
  "にんい",
  "にんか",
  "にんき",
  "にんげん",
  "にんしき",
  "にんずう",
  "にんそう",
  "にんたい",
  "にんち",
  "にんてい",
  "にんにく",
  "にんぷ",
  "にんまり",
  "にんむ",
  "にんめい",
  "にんよう",
  "ぬいくぎ",
  "ぬかす",
  "ぬぐいとる",
  "ぬぐう",
  "ぬくもり",
  "ぬすむ",
  "ぬまえび",
  "ぬめり",
  "ぬらす",
  "ぬんちゃく",
  "ねあげ",
  "ねいき",
  "ねいる",
  "ねいろ",
  "ねぐせ",
  "ねくたい",
  "ねくら",
  "ねこぜ",
  "ねこむ",
  "ねさげ",
  "ねすごす",
  "ねそべる",
  "ねだん",
  "ねつい",
  "ねっしん",
  "ねつぞう",
  "ねったいぎょ",
  "ねぶそく",
  "ねふだ",
  "ねぼう",
  "ねほりはほり",
  "ねまき",
  "ねまわし",
  "ねみみ",
  "ねむい",
  "ねむたい",
  "ねもと",
  "ねらう",
  "ねわざ",
  "ねんいり",
  "ねんおし",
  "ねんかん",
  "ねんきん",
  "ねんぐ",
  "ねんざ",
  "ねんし",
  "ねんちゃく",
  "ねんど",
  "ねんぴ",
  "ねんぶつ",
  "ねんまつ",
  "ねんりょう",
  "ねんれい",
  "のいず",
  "のおづま",
  "のがす",
  "のきなみ",
  "のこぎり",
  "のこす",
  "のこる",
  "のせる",
  "のぞく",
  "のぞむ",
  "のたまう",
  "のちほど",
  "のっく",
  "のばす",
  "のはら",
  "のべる",
  "のぼる",
  "のみもの",
  "のやま",
  "のらいぬ",
  "のらねこ",
  "のりもの",
  "のりゆき",
  "のれん",
  "のんき",
  "ばあい",
  "はあく",
  "ばあさん",
  "ばいか",
  "ばいく",
  "はいけん",
  "はいご",
  "はいしん",
  "はいすい",
  "はいせん",
  "はいそう",
  "はいち",
  "ばいばい",
  "はいれつ",
  "はえる",
  "はおる",
  "はかい",
  "ばかり",
  "はかる",
  "はくしゅ",
  "はけん",
  "はこぶ",
  "はさみ",
  "はさん",
  "はしご",
  "ばしょ",
  "はしる",
  "はせる",
  "ぱそこん",
  "はそん",
  "はたん",
  "はちみつ",
  "はつおん",
  "はっかく",
  "はづき",
  "はっきり",
  "はっくつ",
  "はっけん",
  "はっこう",
  "はっさん",
  "はっしん",
  "はったつ",
  "はっちゅう",
  "はってん",
  "はっぴょう",
  "はっぽう",
  "はなす",
  "はなび",
  "はにかむ",
  "はぶらし",
  "はみがき",
  "はむかう",
  "はめつ",
  "はやい",
  "はやし",
  "はらう",
  "はろうぃん",
  "はわい",
  "はんい",
  "はんえい",
  "はんおん",
  "はんかく",
  "はんきょう",
  "ばんぐみ",
  "はんこ",
  "はんしゃ",
  "はんすう",
  "はんだん",
  "ぱんち",
  "ぱんつ",
  "はんてい",
  "はんとし",
  "はんのう",
  "はんぱ",
  "はんぶん",
  "はんぺん",
  "はんぼうき",
  "はんめい",
  "はんらん",
  "はんろん",
  "ひいき",
  "ひうん",
  "ひえる",
  "ひかく",
  "ひかり",
  "ひかる",
  "ひかん",
  "ひくい",
  "ひけつ",
  "ひこうき",
  "ひこく",
  "ひさい",
  "ひさしぶり",
  "ひさん",
  "びじゅつかん",
  "ひしょ",
  "ひそか",
  "ひそむ",
  "ひたむき",
  "ひだり",
  "ひたる",
  "ひつぎ",
  "ひっこし",
  "ひっし",
  "ひつじゅひん",
  "ひっす",
  "ひつぜん",
  "ぴったり",
  "ぴっちり",
  "ひつよう",
  "ひてい",
  "ひとごみ",
  "ひなまつり",
  "ひなん",
  "ひねる",
  "ひはん",
  "ひびく",
  "ひひょう",
  "ひほう",
  "ひまわり",
  "ひまん",
  "ひみつ",
  "ひめい",
  "ひめじし",
  "ひやけ",
  "ひやす",
  "ひよう",
  "びょうき",
  "ひらがな",
  "ひらく",
  "ひりつ",
  "ひりょう",
  "ひるま",
  "ひるやすみ",
  "ひれい",
  "ひろい",
  "ひろう",
  "ひろき",
  "ひろゆき",
  "ひんかく",
  "ひんけつ",
  "ひんこん",
  "ひんしゅ",
  "ひんそう",
  "ぴんち",
  "ひんぱん",
  "びんぼう",
  "ふあん",
  "ふいうち",
  "ふうけい",
  "ふうせん",
  "ぷうたろう",
  "ふうとう",
  "ふうふ",
  "ふえる",
  "ふおん",
  "ふかい",
  "ふきん",
  "ふくざつ",
  "ふくぶくろ",
  "ふこう",
  "ふさい",
  "ふしぎ",
  "ふじみ",
  "ふすま",
  "ふせい",
  "ふせぐ",
  "ふそく",
  "ぶたにく",
  "ふたん",
  "ふちょう",
  "ふつう",
  "ふつか",
  "ふっかつ",
  "ふっき",
  "ふっこく",
  "ぶどう",
  "ふとる",
  "ふとん",
  "ふのう",
  "ふはい",
  "ふひょう",
  "ふへん",
  "ふまん",
  "ふみん",
  "ふめつ",
  "ふめん",
  "ふよう",
  "ふりこ",
  "ふりる",
  "ふるい",
  "ふんいき",
  "ぶんがく",
  "ぶんぐ",
  "ふんしつ",
  "ぶんせき",
  "ふんそう",
  "ぶんぽう",
  "へいあん",
  "へいおん",
  "へいがい",
  "へいき",
  "へいげん",
  "へいこう",
  "へいさ",
  "へいしゃ",
  "へいせつ",
  "へいそ",
  "へいたく",
  "へいてん",
  "へいねつ",
  "へいわ",
  "へきが",
  "へこむ",
  "べにいろ",
  "べにしょうが",
  "へらす",
  "へんかん",
  "べんきょう",
  "べんごし",
  "へんさい",
  "へんたい",
  "べんり",
  "ほあん",
  "ほいく",
  "ぼうぎょ",
  "ほうこく",
  "ほうそう",
  "ほうほう",
  "ほうもん",
  "ほうりつ",
  "ほえる",
  "ほおん",
  "ほかん",
  "ほきょう",
  "ぼきん",
  "ほくろ",
  "ほけつ",
  "ほけん",
  "ほこう",
  "ほこる",
  "ほしい",
  "ほしつ",
  "ほしゅ",
  "ほしょう",
  "ほせい",
  "ほそい",
  "ほそく",
  "ほたて",
  "ほたる",
  "ぽちぶくろ",
  "ほっきょく",
  "ほっさ",
  "ほったん",
  "ほとんど",
  "ほめる",
  "ほんい",
  "ほんき",
  "ほんけ",
  "ほんしつ",
  "ほんやく",
  "まいにち",
  "まかい",
  "まかせる",
  "まがる",
  "まける",
  "まこと",
  "まさつ",
  "まじめ",
  "ますく",
  "まぜる",
  "まつり",
  "まとめ",
  "まなぶ",
  "まぬけ",
  "まねく",
  "まほう",
  "まもる",
  "まゆげ",
  "まよう",
  "まろやか",
  "まわす",
  "まわり",
  "まわる",
  "まんが",
  "まんきつ",
  "まんぞく",
  "まんなか",
  "みいら",
  "みうち",
  "みえる",
  "みがく",
  "みかた",
  "みかん",
  "みけん",
  "みこん",
  "みじかい",
  "みすい",
  "みすえる",
  "みせる",
  "みっか",
  "みつかる",
  "みつける",
  "みてい",
  "みとめる",
  "みなと",
  "みなみかさい",
  "みねらる",
  "みのう",
  "みのがす",
  "みほん",
  "みもと",
  "みやげ",
  "みらい",
  "みりょく",
  "みわく",
  "みんか",
  "みんぞく",
  "むいか",
  "むえき",
  "むえん",
  "むかい",
  "むかう",
  "むかえ",
  "むかし",
  "むぎちゃ",
  "むける",
  "むげん",
  "むさぼる",
  "むしあつい",
  "むしば",
  "むじゅん",
  "むしろ",
  "むすう",
  "むすこ",
  "むすぶ",
  "むすめ",
  "むせる",
  "むせん",
  "むちゅう",
  "むなしい",
  "むのう",
  "むやみ",
  "むよう",
  "むらさき",
  "むりょう",
  "むろん",
  "めいあん",
  "めいうん",
  "めいえん",
  "めいかく",
  "めいきょく",
  "めいさい",
  "めいし",
  "めいそう",
  "めいぶつ",
  "めいれい",
  "めいわく",
  "めぐまれる",
  "めざす",
  "めした",
  "めずらしい",
  "めだつ",
  "めまい",
  "めやす",
  "めんきょ",
  "めんせき",
  "めんどう",
  "もうしあげる",
  "もうどうけん",
  "もえる",
  "もくし",
  "もくてき",
  "もくようび",
  "もちろん",
  "もどる",
  "もらう",
  "もんく",
  "もんだい",
  "やおや",
  "やける",
  "やさい",
  "やさしい",
  "やすい",
  "やすたろう",
  "やすみ",
  "やせる",
  "やそう",
  "やたい",
  "やちん",
  "やっと",
  "やっぱり",
  "やぶる",
  "やめる",
  "ややこしい",
  "やよい",
  "やわらかい",
  "ゆうき",
  "ゆうびんきょく",
  "ゆうべ",
  "ゆうめい",
  "ゆけつ",
  "ゆしゅつ",
  "ゆせん",
  "ゆそう",
  "ゆたか",
  "ゆちゃく",
  "ゆでる",
  "ゆにゅう",
  "ゆびわ",
  "ゆらい",
  "ゆれる",
  "ようい",
  "ようか",
  "ようきゅう",
  "ようじ",
  "ようす",
  "ようちえん",
  "よかぜ",
  "よかん",
  "よきん",
  "よくせい",
  "よくぼう",
  "よけい",
  "よごれる",
  "よさん",
  "よしゅう",
  "よそう",
  "よそく",
  "よっか",
  "よてい",
  "よどがわく",
  "よねつ",
  "よやく",
  "よゆう",
  "よろこぶ",
  "よろしい",
  "らいう",
  "らくがき",
  "らくご",
  "らくさつ",
  "らくだ",
  "らしんばん",
  "らせん",
  "らぞく",
  "らたい",
  "らっか",
  "られつ",
  "りえき",
  "りかい",
  "りきさく",
  "りきせつ",
  "りくぐん",
  "りくつ",
  "りけん",
  "りこう",
  "りせい",
  "りそう",
  "りそく",
  "りてん",
  "りねん",
  "りゆう",
  "りゅうがく",
  "りよう",
  "りょうり",
  "りょかん",
  "りょくちゃ",
  "りょこう",
  "りりく",
  "りれき",
  "りろん",
  "りんご",
  "るいけい",
  "るいさい",
  "るいじ",
  "るいせき",
  "るすばん",
  "るりがわら",
  "れいかん",
  "れいぎ",
  "れいせい",
  "れいぞうこ",
  "れいとう",
  "れいぼう",
  "れきし",
  "れきだい",
  "れんあい",
  "れんけい",
  "れんこん",
  "れんさい",
  "れんしゅう",
  "れんぞく",
  "れんらく",
  "ろうか",
  "ろうご",
  "ろうじん",
  "ろうそく",
  "ろくが",
  "ろこつ",
  "ろじうら",
  "ろしゅつ",
  "ろせん",
  "ろてん",
  "ろめん",
  "ろれつ",
  "ろんぎ",
  "ろんぱ",
  "ろんぶん",
  "ろんり",
  "わかす",
  "わかめ",
  "わかやま",
  "わかれる",
  "わしつ",
  "わじまし",
  "わすれもの",
  "わらう",
  "われる"
];
const require$$8 = [
  "abacate",
  "abaixo",
  "abalar",
  "abater",
  "abduzir",
  "abelha",
  "aberto",
  "abismo",
  "abotoar",
  "abranger",
  "abreviar",
  "abrigar",
  "abrupto",
  "absinto",
  "absoluto",
  "absurdo",
  "abutre",
  "acabado",
  "acalmar",
  "acampar",
  "acanhar",
  "acaso",
  "aceitar",
  "acelerar",
  "acenar",
  "acervo",
  "acessar",
  "acetona",
  "achatar",
  "acidez",
  "acima",
  "acionado",
  "acirrar",
  "aclamar",
  "aclive",
  "acolhida",
  "acomodar",
  "acoplar",
  "acordar",
  "acumular",
  "acusador",
  "adaptar",
  "adega",
  "adentro",
  "adepto",
  "adequar",
  "aderente",
  "adesivo",
  "adeus",
  "adiante",
  "aditivo",
  "adjetivo",
  "adjunto",
  "admirar",
  "adorar",
  "adquirir",
  "adubo",
  "adverso",
  "advogado",
  "aeronave",
  "afastar",
  "aferir",
  "afetivo",
  "afinador",
  "afivelar",
  "aflito",
  "afluente",
  "afrontar",
  "agachar",
  "agarrar",
  "agasalho",
  "agenciar",
  "agilizar",
  "agiota",
  "agitado",
  "agora",
  "agradar",
  "agreste",
  "agrupar",
  "aguardar",
  "agulha",
  "ajoelhar",
  "ajudar",
  "ajustar",
  "alameda",
  "alarme",
  "alastrar",
  "alavanca",
  "albergue",
  "albino",
  "alcatra",
  "aldeia",
  "alecrim",
  "alegria",
  "alertar",
  "alface",
  "alfinete",
  "algum",
  "alheio",
  "aliar",
  "alicate",
  "alienar",
  "alinhar",
  "aliviar",
  "almofada",
  "alocar",
  "alpiste",
  "alterar",
  "altitude",
  "alucinar",
  "alugar",
  "aluno",
  "alusivo",
  "alvo",
  "amaciar",
  "amador",
  "amarelo",
  "amassar",
  "ambas",
  "ambiente",
  "ameixa",
  "amenizar",
  "amido",
  "amistoso",
  "amizade",
  "amolador",
  "amontoar",
  "amoroso",
  "amostra",
  "amparar",
  "ampliar",
  "ampola",
  "anagrama",
  "analisar",
  "anarquia",
  "anatomia",
  "andaime",
  "anel",
  "anexo",
  "angular",
  "animar",
  "anjo",
  "anomalia",
  "anotado",
  "ansioso",
  "anterior",
  "anuidade",
  "anunciar",
  "anzol",
  "apagador",
  "apalpar",
  "apanhado",
  "apego",
  "apelido",
  "apertada",
  "apesar",
  "apetite",
  "apito",
  "aplauso",
  "aplicada",
  "apoio",
  "apontar",
  "aposta",
  "aprendiz",
  "aprovar",
  "aquecer",
  "arame",
  "aranha",
  "arara",
  "arcada",
  "ardente",
  "areia",
  "arejar",
  "arenito",
  "aresta",
  "argiloso",
  "argola",
  "arma",
  "arquivo",
  "arraial",
  "arrebate",
  "arriscar",
  "arroba",
  "arrumar",
  "arsenal",
  "arterial",
  "artigo",
  "arvoredo",
  "asfaltar",
  "asilado",
  "aspirar",
  "assador",
  "assinar",
  "assoalho",
  "assunto",
  "astral",
  "atacado",
  "atadura",
  "atalho",
  "atarefar",
  "atear",
  "atender",
  "aterro",
  "ateu",
  "atingir",
  "atirador",
  "ativo",
  "atoleiro",
  "atracar",
  "atrevido",
  "atriz",
  "atual",
  "atum",
  "auditor",
  "aumentar",
  "aura",
  "aurora",
  "autismo",
  "autoria",
  "autuar",
  "avaliar",
  "avante",
  "avaria",
  "avental",
  "avesso",
  "aviador",
  "avisar",
  "avulso",
  "axila",
  "azarar",
  "azedo",
  "azeite",
  "azulejo",
  "babar",
  "babosa",
  "bacalhau",
  "bacharel",
  "bacia",
  "bagagem",
  "baiano",
  "bailar",
  "baioneta",
  "bairro",
  "baixista",
  "bajular",
  "baleia",
  "baliza",
  "balsa",
  "banal",
  "bandeira",
  "banho",
  "banir",
  "banquete",
  "barato",
  "barbado",
  "baronesa",
  "barraca",
  "barulho",
  "baseado",
  "bastante",
  "batata",
  "batedor",
  "batida",
  "batom",
  "batucar",
  "baunilha",
  "beber",
  "beijo",
  "beirada",
  "beisebol",
  "beldade",
  "beleza",
  "belga",
  "beliscar",
  "bendito",
  "bengala",
  "benzer",
  "berimbau",
  "berlinda",
  "berro",
  "besouro",
  "bexiga",
  "bezerro",
  "bico",
  "bicudo",
  "bienal",
  "bifocal",
  "bifurcar",
  "bigorna",
  "bilhete",
  "bimestre",
  "bimotor",
  "biologia",
  "biombo",
  "biosfera",
  "bipolar",
  "birrento",
  "biscoito",
  "bisneto",
  "bispo",
  "bissexto",
  "bitola",
  "bizarro",
  "blindado",
  "bloco",
  "bloquear",
  "boato",
  "bobagem",
  "bocado",
  "bocejo",
  "bochecha",
  "boicotar",
  "bolada",
  "boletim",
  "bolha",
  "bolo",
  "bombeiro",
  "bonde",
  "boneco",
  "bonita",
  "borbulha",
  "borda",
  "boreal",
  "borracha",
  "bovino",
  "boxeador",
  "branco",
  "brasa",
  "braveza",
  "breu",
  "briga",
  "brilho",
  "brincar",
  "broa",
  "brochura",
  "bronzear",
  "broto",
  "bruxo",
  "bucha",
  "budismo",
  "bufar",
  "bule",
  "buraco",
  "busca",
  "busto",
  "buzina",
  "cabana",
  "cabelo",
  "cabide",
  "cabo",
  "cabrito",
  "cacau",
  "cacetada",
  "cachorro",
  "cacique",
  "cadastro",
  "cadeado",
  "cafezal",
  "caiaque",
  "caipira",
  "caixote",
  "cajado",
  "caju",
  "calafrio",
  "calcular",
  "caldeira",
  "calibrar",
  "calmante",
  "calota",
  "camada",
  "cambista",
  "camisa",
  "camomila",
  "campanha",
  "camuflar",
  "canavial",
  "cancelar",
  "caneta",
  "canguru",
  "canhoto",
  "canivete",
  "canoa",
  "cansado",
  "cantar",
  "canudo",
  "capacho",
  "capela",
  "capinar",
  "capotar",
  "capricho",
  "captador",
  "capuz",
  "caracol",
  "carbono",
  "cardeal",
  "careca",
  "carimbar",
  "carneiro",
  "carpete",
  "carreira",
  "cartaz",
  "carvalho",
  "casaco",
  "casca",
  "casebre",
  "castelo",
  "casulo",
  "catarata",
  "cativar",
  "caule",
  "causador",
  "cautelar",
  "cavalo",
  "caverna",
  "cebola",
  "cedilha",
  "cegonha",
  "celebrar",
  "celular",
  "cenoura",
  "censo",
  "centeio",
  "cercar",
  "cerrado",
  "certeiro",
  "cerveja",
  "cetim",
  "cevada",
  "chacota",
  "chaleira",
  "chamado",
  "chapada",
  "charme",
  "chatice",
  "chave",
  "chefe",
  "chegada",
  "cheiro",
  "cheque",
  "chicote",
  "chifre",
  "chinelo",
  "chocalho",
  "chover",
  "chumbo",
  "chutar",
  "chuva",
  "cicatriz",
  "ciclone",
  "cidade",
  "cidreira",
  "ciente",
  "cigana",
  "cimento",
  "cinto",
  "cinza",
  "ciranda",
  "circuito",
  "cirurgia",
  "citar",
  "clareza",
  "clero",
  "clicar",
  "clone",
  "clube",
  "coado",
  "coagir",
  "cobaia",
  "cobertor",
  "cobrar",
  "cocada",
  "coelho",
  "coentro",
  "coeso",
  "cogumelo",
  "coibir",
  "coifa",
  "coiote",
  "colar",
  "coleira",
  "colher",
  "colidir",
  "colmeia",
  "colono",
  "coluna",
  "comando",
  "combinar",
  "comentar",
  "comitiva",
  "comover",
  "complexo",
  "comum",
  "concha",
  "condor",
  "conectar",
  "confuso",
  "congelar",
  "conhecer",
  "conjugar",
  "consumir",
  "contrato",
  "convite",
  "cooperar",
  "copeiro",
  "copiador",
  "copo",
  "coquetel",
  "coragem",
  "cordial",
  "corneta",
  "coronha",
  "corporal",
  "correio",
  "cortejo",
  "coruja",
  "corvo",
  "cosseno",
  "costela",
  "cotonete",
  "couro",
  "couve",
  "covil",
  "cozinha",
  "cratera",
  "cravo",
  "creche",
  "credor",
  "creme",
  "crer",
  "crespo",
  "criada",
  "criminal",
  "crioulo",
  "crise",
  "criticar",
  "crosta",
  "crua",
  "cruzeiro",
  "cubano",
  "cueca",
  "cuidado",
  "cujo",
  "culatra",
  "culminar",
  "culpar",
  "cultura",
  "cumprir",
  "cunhado",
  "cupido",
  "curativo",
  "curral",
  "cursar",
  "curto",
  "cuspir",
  "custear",
  "cutelo",
  "damasco",
  "datar",
  "debater",
  "debitar",
  "deboche",
  "debulhar",
  "decalque",
  "decimal",
  "declive",
  "decote",
  "decretar",
  "dedal",
  "dedicado",
  "deduzir",
  "defesa",
  "defumar",
  "degelo",
  "degrau",
  "degustar",
  "deitado",
  "deixar",
  "delator",
  "delegado",
  "delinear",
  "delonga",
  "demanda",
  "demitir",
  "demolido",
  "dentista",
  "depenado",
  "depilar",
  "depois",
  "depressa",
  "depurar",
  "deriva",
  "derramar",
  "desafio",
  "desbotar",
  "descanso",
  "desenho",
  "desfiado",
  "desgaste",
  "desigual",
  "deslize",
  "desmamar",
  "desova",
  "despesa",
  "destaque",
  "desviar",
  "detalhar",
  "detentor",
  "detonar",
  "detrito",
  "deusa",
  "dever",
  "devido",
  "devotado",
  "dezena",
  "diagrama",
  "dialeto",
  "didata",
  "difuso",
  "digitar",
  "dilatado",
  "diluente",
  "diminuir",
  "dinastia",
  "dinheiro",
  "diocese",
  "direto",
  "discreta",
  "disfarce",
  "disparo",
  "disquete",
  "dissipar",
  "distante",
  "ditador",
  "diurno",
  "diverso",
  "divisor",
  "divulgar",
  "dizer",
  "dobrador",
  "dolorido",
  "domador",
  "dominado",
  "donativo",
  "donzela",
  "dormente",
  "dorsal",
  "dosagem",
  "dourado",
  "doutor",
  "drenagem",
  "drible",
  "drogaria",
  "duelar",
  "duende",
  "dueto",
  "duplo",
  "duquesa",
  "durante",
  "duvidoso",
  "eclodir",
  "ecoar",
  "ecologia",
  "edificar",
  "edital",
  "educado",
  "efeito",
  "efetivar",
  "ejetar",
  "elaborar",
  "eleger",
  "eleitor",
  "elenco",
  "elevador",
  "eliminar",
  "elogiar",
  "embargo",
  "embolado",
  "embrulho",
  "embutido",
  "emenda",
  "emergir",
  "emissor",
  "empatia",
  "empenho",
  "empinado",
  "empolgar",
  "emprego",
  "empurrar",
  "emulador",
  "encaixe",
  "encenado",
  "enchente",
  "encontro",
  "endeusar",
  "endossar",
  "enfaixar",
  "enfeite",
  "enfim",
  "engajado",
  "engenho",
  "englobar",
  "engomado",
  "engraxar",
  "enguia",
  "enjoar",
  "enlatar",
  "enquanto",
  "enraizar",
  "enrolado",
  "enrugar",
  "ensaio",
  "enseada",
  "ensino",
  "ensopado",
  "entanto",
  "enteado",
  "entidade",
  "entortar",
  "entrada",
  "entulho",
  "envergar",
  "enviado",
  "envolver",
  "enxame",
  "enxerto",
  "enxofre",
  "enxuto",
  "epiderme",
  "equipar",
  "ereto",
  "erguido",
  "errata",
  "erva",
  "ervilha",
  "esbanjar",
  "esbelto",
  "escama",
  "escola",
  "escrita",
  "escuta",
  "esfinge",
  "esfolar",
  "esfregar",
  "esfumado",
  "esgrima",
  "esmalte",
  "espanto",
  "espelho",
  "espiga",
  "esponja",
  "espreita",
  "espumar",
  "esquerda",
  "estaca",
  "esteira",
  "esticar",
  "estofado",
  "estrela",
  "estudo",
  "esvaziar",
  "etanol",
  "etiqueta",
  "euforia",
  "europeu",
  "evacuar",
  "evaporar",
  "evasivo",
  "eventual",
  "evidente",
  "evoluir",
  "exagero",
  "exalar",
  "examinar",
  "exato",
  "exausto",
  "excesso",
  "excitar",
  "exclamar",
  "executar",
  "exemplo",
  "exibir",
  "exigente",
  "exonerar",
  "expandir",
  "expelir",
  "expirar",
  "explanar",
  "exposto",
  "expresso",
  "expulsar",
  "externo",
  "extinto",
  "extrato",
  "fabricar",
  "fabuloso",
  "faceta",
  "facial",
  "fada",
  "fadiga",
  "faixa",
  "falar",
  "falta",
  "familiar",
  "fandango",
  "fanfarra",
  "fantoche",
  "fardado",
  "farelo",
  "farinha",
  "farofa",
  "farpa",
  "fartura",
  "fatia",
  "fator",
  "favorita",
  "faxina",
  "fazenda",
  "fechado",
  "feijoada",
  "feirante",
  "felino",
  "feminino",
  "fenda",
  "feno",
  "fera",
  "feriado",
  "ferrugem",
  "ferver",
  "festejar",
  "fetal",
  "feudal",
  "fiapo",
  "fibrose",
  "ficar",
  "ficheiro",
  "figurado",
  "fileira",
  "filho",
  "filme",
  "filtrar",
  "firmeza",
  "fisgada",
  "fissura",
  "fita",
  "fivela",
  "fixador",
  "fixo",
  "flacidez",
  "flamingo",
  "flanela",
  "flechada",
  "flora",
  "flutuar",
  "fluxo",
  "focal",
  "focinho",
  "fofocar",
  "fogo",
  "foguete",
  "foice",
  "folgado",
  "folheto",
  "forjar",
  "formiga",
  "forno",
  "forte",
  "fosco",
  "fossa",
  "fragata",
  "fralda",
  "frango",
  "frasco",
  "fraterno",
  "freira",
  "frente",
  "fretar",
  "frieza",
  "friso",
  "fritura",
  "fronha",
  "frustrar",
  "fruteira",
  "fugir",
  "fulano",
  "fuligem",
  "fundar",
  "fungo",
  "funil",
  "furador",
  "furioso",
  "futebol",
  "gabarito",
  "gabinete",
  "gado",
  "gaiato",
  "gaiola",
  "gaivota",
  "galega",
  "galho",
  "galinha",
  "galocha",
  "ganhar",
  "garagem",
  "garfo",
  "gargalo",
  "garimpo",
  "garoupa",
  "garrafa",
  "gasoduto",
  "gasto",
  "gata",
  "gatilho",
  "gaveta",
  "gazela",
  "gelado",
  "geleia",
  "gelo",
  "gemada",
  "gemer",
  "gemido",
  "generoso",
  "gengiva",
  "genial",
  "genoma",
  "genro",
  "geologia",
  "gerador",
  "germinar",
  "gesso",
  "gestor",
  "ginasta",
  "gincana",
  "gingado",
  "girafa",
  "girino",
  "glacial",
  "glicose",
  "global",
  "glorioso",
  "goela",
  "goiaba",
  "golfe",
  "golpear",
  "gordura",
  "gorjeta",
  "gorro",
  "gostoso",
  "goteira",
  "governar",
  "gracejo",
  "gradual",
  "grafite",
  "gralha",
  "grampo",
  "granada",
  "gratuito",
  "graveto",
  "graxa",
  "grego",
  "grelhar",
  "greve",
  "grilo",
  "grisalho",
  "gritaria",
  "grosso",
  "grotesco",
  "grudado",
  "grunhido",
  "gruta",
  "guache",
  "guarani",
  "guaxinim",
  "guerrear",
  "guiar",
  "guincho",
  "guisado",
  "gula",
  "guloso",
  "guru",
  "habitar",
  "harmonia",
  "haste",
  "haver",
  "hectare",
  "herdar",
  "heresia",
  "hesitar",
  "hiato",
  "hibernar",
  "hidratar",
  "hiena",
  "hino",
  "hipismo",
  "hipnose",
  "hipoteca",
  "hoje",
  "holofote",
  "homem",
  "honesto",
  "honrado",
  "hormonal",
  "hospedar",
  "humorado",
  "iate",
  "ideia",
  "idoso",
  "ignorado",
  "igreja",
  "iguana",
  "ileso",
  "ilha",
  "iludido",
  "iluminar",
  "ilustrar",
  "imagem",
  "imediato",
  "imenso",
  "imersivo",
  "iminente",
  "imitador",
  "imortal",
  "impacto",
  "impedir",
  "implante",
  "impor",
  "imprensa",
  "impune",
  "imunizar",
  "inalador",
  "inapto",
  "inativo",
  "incenso",
  "inchar",
  "incidir",
  "incluir",
  "incolor",
  "indeciso",
  "indireto",
  "indutor",
  "ineficaz",
  "inerente",
  "infantil",
  "infestar",
  "infinito",
  "inflamar",
  "informal",
  "infrator",
  "ingerir",
  "inibido",
  "inicial",
  "inimigo",
  "injetar",
  "inocente",
  "inodoro",
  "inovador",
  "inox",
  "inquieto",
  "inscrito",
  "inseto",
  "insistir",
  "inspetor",
  "instalar",
  "insulto",
  "intacto",
  "integral",
  "intimar",
  "intocado",
  "intriga",
  "invasor",
  "inverno",
  "invicto",
  "invocar",
  "iogurte",
  "iraniano",
  "ironizar",
  "irreal",
  "irritado",
  "isca",
  "isento",
  "isolado",
  "isqueiro",
  "italiano",
  "janeiro",
  "jangada",
  "janta",
  "jararaca",
  "jardim",
  "jarro",
  "jasmim",
  "jato",
  "javali",
  "jazida",
  "jejum",
  "joaninha",
  "joelhada",
  "jogador",
  "joia",
  "jornal",
  "jorrar",
  "jovem",
  "juba",
  "judeu",
  "judoca",
  "juiz",
  "julgador",
  "julho",
  "jurado",
  "jurista",
  "juro",
  "justa",
  "labareda",
  "laboral",
  "lacre",
  "lactante",
  "ladrilho",
  "lagarta",
  "lagoa",
  "laje",
  "lamber",
  "lamentar",
  "laminar",
  "lampejo",
  "lanche",
  "lapidar",
  "lapso",
  "laranja",
  "lareira",
  "largura",
  "lasanha",
  "lastro",
  "lateral",
  "latido",
  "lavanda",
  "lavoura",
  "lavrador",
  "laxante",
  "lazer",
  "lealdade",
  "lebre",
  "legado",
  "legendar",
  "legista",
  "leigo",
  "leiloar",
  "leitura",
  "lembrete",
  "leme",
  "lenhador",
  "lentilha",
  "leoa",
  "lesma",
  "leste",
  "letivo",
  "letreiro",
  "levar",
  "leveza",
  "levitar",
  "liberal",
  "libido",
  "liderar",
  "ligar",
  "ligeiro",
  "limitar",
  "limoeiro",
  "limpador",
  "linda",
  "linear",
  "linhagem",
  "liquidez",
  "listagem",
  "lisura",
  "litoral",
  "livro",
  "lixa",
  "lixeira",
  "locador",
  "locutor",
  "lojista",
  "lombo",
  "lona",
  "longe",
  "lontra",
  "lorde",
  "lotado",
  "loteria",
  "loucura",
  "lousa",
  "louvar",
  "luar",
  "lucidez",
  "lucro",
  "luneta",
  "lustre",
  "lutador",
  "luva",
  "macaco",
  "macete",
  "machado",
  "macio",
  "madeira",
  "madrinha",
  "magnata",
  "magreza",
  "maior",
  "mais",
  "malandro",
  "malha",
  "malote",
  "maluco",
  "mamilo",
  "mamoeiro",
  "mamute",
  "manada",
  "mancha",
  "mandato",
  "manequim",
  "manhoso",
  "manivela",
  "manobrar",
  "mansa",
  "manter",
  "manusear",
  "mapeado",
  "maquinar",
  "marcador",
  "maresia",
  "marfim",
  "margem",
  "marinho",
  "marmita",
  "maroto",
  "marquise",
  "marreco",
  "martelo",
  "marujo",
  "mascote",
  "masmorra",
  "massagem",
  "mastigar",
  "matagal",
  "materno",
  "matinal",
  "matutar",
  "maxilar",
  "medalha",
  "medida",
  "medusa",
  "megafone",
  "meiga",
  "melancia",
  "melhor",
  "membro",
  "memorial",
  "menino",
  "menos",
  "mensagem",
  "mental",
  "merecer",
  "mergulho",
  "mesada",
  "mesclar",
  "mesmo",
  "mesquita",
  "mestre",
  "metade",
  "meteoro",
  "metragem",
  "mexer",
  "mexicano",
  "micro",
  "migalha",
  "migrar",
  "milagre",
  "milenar",
  "milhar",
  "mimado",
  "minerar",
  "minhoca",
  "ministro",
  "minoria",
  "miolo",
  "mirante",
  "mirtilo",
  "misturar",
  "mocidade",
  "moderno",
  "modular",
  "moeda",
  "moer",
  "moinho",
  "moita",
  "moldura",
  "moleza",
  "molho",
  "molinete",
  "molusco",
  "montanha",
  "moqueca",
  "morango",
  "morcego",
  "mordomo",
  "morena",
  "mosaico",
  "mosquete",
  "mostarda",
  "motel",
  "motim",
  "moto",
  "motriz",
  "muda",
  "muito",
  "mulata",
  "mulher",
  "multar",
  "mundial",
  "munido",
  "muralha",
  "murcho",
  "muscular",
  "museu",
  "musical",
  "nacional",
  "nadador",
  "naja",
  "namoro",
  "narina",
  "narrado",
  "nascer",
  "nativa",
  "natureza",
  "navalha",
  "navegar",
  "navio",
  "neblina",
  "nebuloso",
  "negativa",
  "negociar",
  "negrito",
  "nervoso",
  "neta",
  "neural",
  "nevasca",
  "nevoeiro",
  "ninar",
  "ninho",
  "nitidez",
  "nivelar",
  "nobreza",
  "noite",
  "noiva",
  "nomear",
  "nominal",
  "nordeste",
  "nortear",
  "notar",
  "noticiar",
  "noturno",
  "novelo",
  "novilho",
  "novo",
  "nublado",
  "nudez",
  "numeral",
  "nupcial",
  "nutrir",
  "nuvem",
  "obcecado",
  "obedecer",
  "objetivo",
  "obrigado",
  "obscuro",
  "obstetra",
  "obter",
  "obturar",
  "ocidente",
  "ocioso",
  "ocorrer",
  "oculista",
  "ocupado",
  "ofegante",
  "ofensiva",
  "oferenda",
  "oficina",
  "ofuscado",
  "ogiva",
  "olaria",
  "oleoso",
  "olhar",
  "oliveira",
  "ombro",
  "omelete",
  "omisso",
  "omitir",
  "ondulado",
  "oneroso",
  "ontem",
  "opcional",
  "operador",
  "oponente",
  "oportuno",
  "oposto",
  "orar",
  "orbitar",
  "ordem",
  "ordinal",
  "orfanato",
  "orgasmo",
  "orgulho",
  "oriental",
  "origem",
  "oriundo",
  "orla",
  "ortodoxo",
  "orvalho",
  "oscilar",
  "ossada",
  "osso",
  "ostentar",
  "otimismo",
  "ousadia",
  "outono",
  "outubro",
  "ouvido",
  "ovelha",
  "ovular",
  "oxidar",
  "oxigenar",
  "pacato",
  "paciente",
  "pacote",
  "pactuar",
  "padaria",
  "padrinho",
  "pagar",
  "pagode",
  "painel",
  "pairar",
  "paisagem",
  "palavra",
  "palestra",
  "palheta",
  "palito",
  "palmada",
  "palpitar",
  "pancada",
  "panela",
  "panfleto",
  "panqueca",
  "pantanal",
  "papagaio",
  "papelada",
  "papiro",
  "parafina",
  "parcial",
  "pardal",
  "parede",
  "partida",
  "pasmo",
  "passado",
  "pastel",
  "patamar",
  "patente",
  "patinar",
  "patrono",
  "paulada",
  "pausar",
  "peculiar",
  "pedalar",
  "pedestre",
  "pediatra",
  "pedra",
  "pegada",
  "peitoral",
  "peixe",
  "pele",
  "pelicano",
  "penca",
  "pendurar",
  "peneira",
  "penhasco",
  "pensador",
  "pente",
  "perceber",
  "perfeito",
  "pergunta",
  "perito",
  "permitir",
  "perna",
  "perplexo",
  "persiana",
  "pertence",
  "peruca",
  "pescado",
  "pesquisa",
  "pessoa",
  "petiscar",
  "piada",
  "picado",
  "piedade",
  "pigmento",
  "pilastra",
  "pilhado",
  "pilotar",
  "pimenta",
  "pincel",
  "pinguim",
  "pinha",
  "pinote",
  "pintar",
  "pioneiro",
  "pipoca",
  "piquete",
  "piranha",
  "pires",
  "pirueta",
  "piscar",
  "pistola",
  "pitanga",
  "pivete",
  "planta",
  "plaqueta",
  "platina",
  "plebeu",
  "plumagem",
  "pluvial",
  "pneu",
  "poda",
  "poeira",
  "poetisa",
  "polegada",
  "policiar",
  "poluente",
  "polvilho",
  "pomar",
  "pomba",
  "ponderar",
  "pontaria",
  "populoso",
  "porta",
  "possuir",
  "postal",
  "pote",
  "poupar",
  "pouso",
  "povoar",
  "praia",
  "prancha",
  "prato",
  "praxe",
  "prece",
  "predador",
  "prefeito",
  "premiar",
  "prensar",
  "preparar",
  "presilha",
  "pretexto",
  "prevenir",
  "prezar",
  "primata",
  "princesa",
  "prisma",
  "privado",
  "processo",
  "produto",
  "profeta",
  "proibido",
  "projeto",
  "prometer",
  "propagar",
  "prosa",
  "protetor",
  "provador",
  "publicar",
  "pudim",
  "pular",
  "pulmonar",
  "pulseira",
  "punhal",
  "punir",
  "pupilo",
  "pureza",
  "puxador",
  "quadra",
  "quantia",
  "quarto",
  "quase",
  "quebrar",
  "queda",
  "queijo",
  "quente",
  "querido",
  "quimono",
  "quina",
  "quiosque",
  "rabanada",
  "rabisco",
  "rachar",
  "racionar",
  "radial",
  "raiar",
  "rainha",
  "raio",
  "raiva",
  "rajada",
  "ralado",
  "ramal",
  "ranger",
  "ranhura",
  "rapadura",
  "rapel",
  "rapidez",
  "raposa",
  "raquete",
  "raridade",
  "rasante",
  "rascunho",
  "rasgar",
  "raspador",
  "rasteira",
  "rasurar",
  "ratazana",
  "ratoeira",
  "realeza",
  "reanimar",
  "reaver",
  "rebaixar",
  "rebelde",
  "rebolar",
  "recado",
  "recente",
  "recheio",
  "recibo",
  "recordar",
  "recrutar",
  "recuar",
  "rede",
  "redimir",
  "redonda",
  "reduzida",
  "reenvio",
  "refinar",
  "refletir",
  "refogar",
  "refresco",
  "refugiar",
  "regalia",
  "regime",
  "regra",
  "reinado",
  "reitor",
  "rejeitar",
  "relativo",
  "remador",
  "remendo",
  "remorso",
  "renovado",
  "reparo",
  "repelir",
  "repleto",
  "repolho",
  "represa",
  "repudiar",
  "requerer",
  "resenha",
  "resfriar",
  "resgatar",
  "residir",
  "resolver",
  "respeito",
  "ressaca",
  "restante",
  "resumir",
  "retalho",
  "reter",
  "retirar",
  "retomada",
  "retratar",
  "revelar",
  "revisor",
  "revolta",
  "riacho",
  "rica",
  "rigidez",
  "rigoroso",
  "rimar",
  "ringue",
  "risada",
  "risco",
  "risonho",
  "robalo",
  "rochedo",
  "rodada",
  "rodeio",
  "rodovia",
  "roedor",
  "roleta",
  "romano",
  "roncar",
  "rosado",
  "roseira",
  "rosto",
  "rota",
  "roteiro",
  "rotina",
  "rotular",
  "rouco",
  "roupa",
  "roxo",
  "rubro",
  "rugido",
  "rugoso",
  "ruivo",
  "rumo",
  "rupestre",
  "russo",
  "sabor",
  "saciar",
  "sacola",
  "sacudir",
  "sadio",
  "safira",
  "saga",
  "sagrada",
  "saibro",
  "salada",
  "saleiro",
  "salgado",
  "saliva",
  "salpicar",
  "salsicha",
  "saltar",
  "salvador",
  "sambar",
  "samurai",
  "sanar",
  "sanfona",
  "sangue",
  "sanidade",
  "sapato",
  "sarda",
  "sargento",
  "sarjeta",
  "saturar",
  "saudade",
  "saxofone",
  "sazonal",
  "secar",
  "secular",
  "seda",
  "sedento",
  "sediado",
  "sedoso",
  "sedutor",
  "segmento",
  "segredo",
  "segundo",
  "seiva",
  "seleto",
  "selvagem",
  "semanal",
  "semente",
  "senador",
  "senhor",
  "sensual",
  "sentado",
  "separado",
  "sereia",
  "seringa",
  "serra",
  "servo",
  "setembro",
  "setor",
  "sigilo",
  "silhueta",
  "silicone",
  "simetria",
  "simpatia",
  "simular",
  "sinal",
  "sincero",
  "singular",
  "sinopse",
  "sintonia",
  "sirene",
  "siri",
  "situado",
  "soberano",
  "sobra",
  "socorro",
  "sogro",
  "soja",
  "solda",
  "soletrar",
  "solteiro",
  "sombrio",
  "sonata",
  "sondar",
  "sonegar",
  "sonhador",
  "sono",
  "soprano",
  "soquete",
  "sorrir",
  "sorteio",
  "sossego",
  "sotaque",
  "soterrar",
  "sovado",
  "sozinho",
  "suavizar",
  "subida",
  "submerso",
  "subsolo",
  "subtrair",
  "sucata",
  "sucesso",
  "suco",
  "sudeste",
  "sufixo",
  "sugador",
  "sugerir",
  "sujeito",
  "sulfato",
  "sumir",
  "suor",
  "superior",
  "suplicar",
  "suposto",
  "suprimir",
  "surdina",
  "surfista",
  "surpresa",
  "surreal",
  "surtir",
  "suspiro",
  "sustento",
  "tabela",
  "tablete",
  "tabuada",
  "tacho",
  "tagarela",
  "talher",
  "talo",
  "talvez",
  "tamanho",
  "tamborim",
  "tampa",
  "tangente",
  "tanto",
  "tapar",
  "tapioca",
  "tardio",
  "tarefa",
  "tarja",
  "tarraxa",
  "tatuagem",
  "taurino",
  "taxativo",
  "taxista",
  "teatral",
  "tecer",
  "tecido",
  "teclado",
  "tedioso",
  "teia",
  "teimar",
  "telefone",
  "telhado",
  "tempero",
  "tenente",
  "tensor",
  "tentar",
  "termal",
  "terno",
  "terreno",
  "tese",
  "tesoura",
  "testado",
  "teto",
  "textura",
  "texugo",
  "tiara",
  "tigela",
  "tijolo",
  "timbrar",
  "timidez",
  "tingido",
  "tinteiro",
  "tiragem",
  "titular",
  "toalha",
  "tocha",
  "tolerar",
  "tolice",
  "tomada",
  "tomilho",
  "tonel",
  "tontura",
  "topete",
  "tora",
  "torcido",
  "torneio",
  "torque",
  "torrada",
  "torto",
  "tostar",
  "touca",
  "toupeira",
  "toxina",
  "trabalho",
  "tracejar",
  "tradutor",
  "trafegar",
  "trajeto",
  "trama",
  "trancar",
  "trapo",
  "traseiro",
  "tratador",
  "travar",
  "treino",
  "tremer",
  "trepidar",
  "trevo",
  "triagem",
  "tribo",
  "triciclo",
  "tridente",
  "trilogia",
  "trindade",
  "triplo",
  "triturar",
  "triunfal",
  "trocar",
  "trombeta",
  "trova",
  "trunfo",
  "truque",
  "tubular",
  "tucano",
  "tudo",
  "tulipa",
  "tupi",
  "turbo",
  "turma",
  "turquesa",
  "tutelar",
  "tutorial",
  "uivar",
  "umbigo",
  "unha",
  "unidade",
  "uniforme",
  "urologia",
  "urso",
  "urtiga",
  "urubu",
  "usado",
  "usina",
  "usufruir",
  "vacina",
  "vadiar",
  "vagaroso",
  "vaidoso",
  "vala",
  "valente",
  "validade",
  "valores",
  "vantagem",
  "vaqueiro",
  "varanda",
  "vareta",
  "varrer",
  "vascular",
  "vasilha",
  "vassoura",
  "vazar",
  "vazio",
  "veado",
  "vedar",
  "vegetar",
  "veicular",
  "veleiro",
  "velhice",
  "veludo",
  "vencedor",
  "vendaval",
  "venerar",
  "ventre",
  "verbal",
  "verdade",
  "vereador",
  "vergonha",
  "vermelho",
  "verniz",
  "versar",
  "vertente",
  "vespa",
  "vestido",
  "vetorial",
  "viaduto",
  "viagem",
  "viajar",
  "viatura",
  "vibrador",
  "videira",
  "vidraria",
  "viela",
  "viga",
  "vigente",
  "vigiar",
  "vigorar",
  "vilarejo",
  "vinco",
  "vinheta",
  "vinil",
  "violeta",
  "virada",
  "virtude",
  "visitar",
  "visto",
  "vitral",
  "viveiro",
  "vizinho",
  "voador",
  "voar",
  "vogal",
  "volante",
  "voleibol",
  "voltagem",
  "volumoso",
  "vontade",
  "vulto",
  "vuvuzela",
  "xadrez",
  "xarope",
  "xeque",
  "xeretar",
  "xerife",
  "xingar",
  "zangado",
  "zarpar",
  "zebu",
  "zelador",
  "zombar",
  "zoologia",
  "zumbido"
];
const require$$9 = [
  "abandon",
  "ability",
  "able",
  "about",
  "above",
  "absent",
  "absorb",
  "abstract",
  "absurd",
  "abuse",
  "access",
  "accident",
  "account",
  "accuse",
  "achieve",
  "acid",
  "acoustic",
  "acquire",
  "across",
  "act",
  "action",
  "actor",
  "actress",
  "actual",
  "adapt",
  "add",
  "addict",
  "address",
  "adjust",
  "admit",
  "adult",
  "advance",
  "advice",
  "aerobic",
  "affair",
  "afford",
  "afraid",
  "again",
  "age",
  "agent",
  "agree",
  "ahead",
  "aim",
  "air",
  "airport",
  "aisle",
  "alarm",
  "album",
  "alcohol",
  "alert",
  "alien",
  "all",
  "alley",
  "allow",
  "almost",
  "alone",
  "alpha",
  "already",
  "also",
  "alter",
  "always",
  "amateur",
  "amazing",
  "among",
  "amount",
  "amused",
  "analyst",
  "anchor",
  "ancient",
  "anger",
  "angle",
  "angry",
  "animal",
  "ankle",
  "announce",
  "annual",
  "another",
  "answer",
  "antenna",
  "antique",
  "anxiety",
  "any",
  "apart",
  "apology",
  "appear",
  "apple",
  "approve",
  "april",
  "arch",
  "arctic",
  "area",
  "arena",
  "argue",
  "arm",
  "armed",
  "armor",
  "army",
  "around",
  "arrange",
  "arrest",
  "arrive",
  "arrow",
  "art",
  "artefact",
  "artist",
  "artwork",
  "ask",
  "aspect",
  "assault",
  "asset",
  "assist",
  "assume",
  "asthma",
  "athlete",
  "atom",
  "attack",
  "attend",
  "attitude",
  "attract",
  "auction",
  "audit",
  "august",
  "aunt",
  "author",
  "auto",
  "autumn",
  "average",
  "avocado",
  "avoid",
  "awake",
  "aware",
  "away",
  "awesome",
  "awful",
  "awkward",
  "axis",
  "baby",
  "bachelor",
  "bacon",
  "badge",
  "bag",
  "balance",
  "balcony",
  "ball",
  "bamboo",
  "banana",
  "banner",
  "bar",
  "barely",
  "bargain",
  "barrel",
  "base",
  "basic",
  "basket",
  "battle",
  "beach",
  "bean",
  "beauty",
  "because",
  "become",
  "beef",
  "before",
  "begin",
  "behave",
  "behind",
  "believe",
  "below",
  "belt",
  "bench",
  "benefit",
  "best",
  "betray",
  "better",
  "between",
  "beyond",
  "bicycle",
  "bid",
  "bike",
  "bind",
  "biology",
  "bird",
  "birth",
  "bitter",
  "black",
  "blade",
  "blame",
  "blanket",
  "blast",
  "bleak",
  "bless",
  "blind",
  "blood",
  "blossom",
  "blouse",
  "blue",
  "blur",
  "blush",
  "board",
  "boat",
  "body",
  "boil",
  "bomb",
  "bone",
  "bonus",
  "book",
  "boost",
  "border",
  "boring",
  "borrow",
  "boss",
  "bottom",
  "bounce",
  "box",
  "boy",
  "bracket",
  "brain",
  "brand",
  "brass",
  "brave",
  "bread",
  "breeze",
  "brick",
  "bridge",
  "brief",
  "bright",
  "bring",
  "brisk",
  "broccoli",
  "broken",
  "bronze",
  "broom",
  "brother",
  "brown",
  "brush",
  "bubble",
  "buddy",
  "budget",
  "buffalo",
  "build",
  "bulb",
  "bulk",
  "bullet",
  "bundle",
  "bunker",
  "burden",
  "burger",
  "burst",
  "bus",
  "business",
  "busy",
  "butter",
  "buyer",
  "buzz",
  "cabbage",
  "cabin",
  "cable",
  "cactus",
  "cage",
  "cake",
  "call",
  "calm",
  "camera",
  "camp",
  "can",
  "canal",
  "cancel",
  "candy",
  "cannon",
  "canoe",
  "canvas",
  "canyon",
  "capable",
  "capital",
  "captain",
  "car",
  "carbon",
  "card",
  "cargo",
  "carpet",
  "carry",
  "cart",
  "case",
  "cash",
  "casino",
  "castle",
  "casual",
  "cat",
  "catalog",
  "catch",
  "category",
  "cattle",
  "caught",
  "cause",
  "caution",
  "cave",
  "ceiling",
  "celery",
  "cement",
  "census",
  "century",
  "cereal",
  "certain",
  "chair",
  "chalk",
  "champion",
  "change",
  "chaos",
  "chapter",
  "charge",
  "chase",
  "chat",
  "cheap",
  "check",
  "cheese",
  "chef",
  "cherry",
  "chest",
  "chicken",
  "chief",
  "child",
  "chimney",
  "choice",
  "choose",
  "chronic",
  "chuckle",
  "chunk",
  "churn",
  "cigar",
  "cinnamon",
  "circle",
  "citizen",
  "city",
  "civil",
  "claim",
  "clap",
  "clarify",
  "claw",
  "clay",
  "clean",
  "clerk",
  "clever",
  "click",
  "client",
  "cliff",
  "climb",
  "clinic",
  "clip",
  "clock",
  "clog",
  "close",
  "cloth",
  "cloud",
  "clown",
  "club",
  "clump",
  "cluster",
  "clutch",
  "coach",
  "coast",
  "coconut",
  "code",
  "coffee",
  "coil",
  "coin",
  "collect",
  "color",
  "column",
  "combine",
  "come",
  "comfort",
  "comic",
  "common",
  "company",
  "concert",
  "conduct",
  "confirm",
  "congress",
  "connect",
  "consider",
  "control",
  "convince",
  "cook",
  "cool",
  "copper",
  "copy",
  "coral",
  "core",
  "corn",
  "correct",
  "cost",
  "cotton",
  "couch",
  "country",
  "couple",
  "course",
  "cousin",
  "cover",
  "coyote",
  "crack",
  "cradle",
  "craft",
  "cram",
  "crane",
  "crash",
  "crater",
  "crawl",
  "crazy",
  "cream",
  "credit",
  "creek",
  "crew",
  "cricket",
  "crime",
  "crisp",
  "critic",
  "crop",
  "cross",
  "crouch",
  "crowd",
  "crucial",
  "cruel",
  "cruise",
  "crumble",
  "crunch",
  "crush",
  "cry",
  "crystal",
  "cube",
  "culture",
  "cup",
  "cupboard",
  "curious",
  "current",
  "curtain",
  "curve",
  "cushion",
  "custom",
  "cute",
  "cycle",
  "dad",
  "damage",
  "damp",
  "dance",
  "danger",
  "daring",
  "dash",
  "daughter",
  "dawn",
  "day",
  "deal",
  "debate",
  "debris",
  "decade",
  "december",
  "decide",
  "decline",
  "decorate",
  "decrease",
  "deer",
  "defense",
  "define",
  "defy",
  "degree",
  "delay",
  "deliver",
  "demand",
  "demise",
  "denial",
  "dentist",
  "deny",
  "depart",
  "depend",
  "deposit",
  "depth",
  "deputy",
  "derive",
  "describe",
  "desert",
  "design",
  "desk",
  "despair",
  "destroy",
  "detail",
  "detect",
  "develop",
  "device",
  "devote",
  "diagram",
  "dial",
  "diamond",
  "diary",
  "dice",
  "diesel",
  "diet",
  "differ",
  "digital",
  "dignity",
  "dilemma",
  "dinner",
  "dinosaur",
  "direct",
  "dirt",
  "disagree",
  "discover",
  "disease",
  "dish",
  "dismiss",
  "disorder",
  "display",
  "distance",
  "divert",
  "divide",
  "divorce",
  "dizzy",
  "doctor",
  "document",
  "dog",
  "doll",
  "dolphin",
  "domain",
  "donate",
  "donkey",
  "donor",
  "door",
  "dose",
  "double",
  "dove",
  "draft",
  "dragon",
  "drama",
  "drastic",
  "draw",
  "dream",
  "dress",
  "drift",
  "drill",
  "drink",
  "drip",
  "drive",
  "drop",
  "drum",
  "dry",
  "duck",
  "dumb",
  "dune",
  "during",
  "dust",
  "dutch",
  "duty",
  "dwarf",
  "dynamic",
  "eager",
  "eagle",
  "early",
  "earn",
  "earth",
  "easily",
  "east",
  "easy",
  "echo",
  "ecology",
  "economy",
  "edge",
  "edit",
  "educate",
  "effort",
  "egg",
  "eight",
  "either",
  "elbow",
  "elder",
  "electric",
  "elegant",
  "element",
  "elephant",
  "elevator",
  "elite",
  "else",
  "embark",
  "embody",
  "embrace",
  "emerge",
  "emotion",
  "employ",
  "empower",
  "empty",
  "enable",
  "enact",
  "end",
  "endless",
  "endorse",
  "enemy",
  "energy",
  "enforce",
  "engage",
  "engine",
  "enhance",
  "enjoy",
  "enlist",
  "enough",
  "enrich",
  "enroll",
  "ensure",
  "enter",
  "entire",
  "entry",
  "envelope",
  "episode",
  "equal",
  "equip",
  "era",
  "erase",
  "erode",
  "erosion",
  "error",
  "erupt",
  "escape",
  "essay",
  "essence",
  "estate",
  "eternal",
  "ethics",
  "evidence",
  "evil",
  "evoke",
  "evolve",
  "exact",
  "example",
  "excess",
  "exchange",
  "excite",
  "exclude",
  "excuse",
  "execute",
  "exercise",
  "exhaust",
  "exhibit",
  "exile",
  "exist",
  "exit",
  "exotic",
  "expand",
  "expect",
  "expire",
  "explain",
  "expose",
  "express",
  "extend",
  "extra",
  "eye",
  "eyebrow",
  "fabric",
  "face",
  "faculty",
  "fade",
  "faint",
  "faith",
  "fall",
  "false",
  "fame",
  "family",
  "famous",
  "fan",
  "fancy",
  "fantasy",
  "farm",
  "fashion",
  "fat",
  "fatal",
  "father",
  "fatigue",
  "fault",
  "favorite",
  "feature",
  "february",
  "federal",
  "fee",
  "feed",
  "feel",
  "female",
  "fence",
  "festival",
  "fetch",
  "fever",
  "few",
  "fiber",
  "fiction",
  "field",
  "figure",
  "file",
  "film",
  "filter",
  "final",
  "find",
  "fine",
  "finger",
  "finish",
  "fire",
  "firm",
  "first",
  "fiscal",
  "fish",
  "fit",
  "fitness",
  "fix",
  "flag",
  "flame",
  "flash",
  "flat",
  "flavor",
  "flee",
  "flight",
  "flip",
  "float",
  "flock",
  "floor",
  "flower",
  "fluid",
  "flush",
  "fly",
  "foam",
  "focus",
  "fog",
  "foil",
  "fold",
  "follow",
  "food",
  "foot",
  "force",
  "forest",
  "forget",
  "fork",
  "fortune",
  "forum",
  "forward",
  "fossil",
  "foster",
  "found",
  "fox",
  "fragile",
  "frame",
  "frequent",
  "fresh",
  "friend",
  "fringe",
  "frog",
  "front",
  "frost",
  "frown",
  "frozen",
  "fruit",
  "fuel",
  "fun",
  "funny",
  "furnace",
  "fury",
  "future",
  "gadget",
  "gain",
  "galaxy",
  "gallery",
  "game",
  "gap",
  "garage",
  "garbage",
  "garden",
  "garlic",
  "garment",
  "gas",
  "gasp",
  "gate",
  "gather",
  "gauge",
  "gaze",
  "general",
  "genius",
  "genre",
  "gentle",
  "genuine",
  "gesture",
  "ghost",
  "giant",
  "gift",
  "giggle",
  "ginger",
  "giraffe",
  "girl",
  "give",
  "glad",
  "glance",
  "glare",
  "glass",
  "glide",
  "glimpse",
  "globe",
  "gloom",
  "glory",
  "glove",
  "glow",
  "glue",
  "goat",
  "goddess",
  "gold",
  "good",
  "goose",
  "gorilla",
  "gospel",
  "gossip",
  "govern",
  "gown",
  "grab",
  "grace",
  "grain",
  "grant",
  "grape",
  "grass",
  "gravity",
  "great",
  "green",
  "grid",
  "grief",
  "grit",
  "grocery",
  "group",
  "grow",
  "grunt",
  "guard",
  "guess",
  "guide",
  "guilt",
  "guitar",
  "gun",
  "gym",
  "habit",
  "hair",
  "half",
  "hammer",
  "hamster",
  "hand",
  "happy",
  "harbor",
  "hard",
  "harsh",
  "harvest",
  "hat",
  "have",
  "hawk",
  "hazard",
  "head",
  "health",
  "heart",
  "heavy",
  "hedgehog",
  "height",
  "hello",
  "helmet",
  "help",
  "hen",
  "hero",
  "hidden",
  "high",
  "hill",
  "hint",
  "hip",
  "hire",
  "history",
  "hobby",
  "hockey",
  "hold",
  "hole",
  "holiday",
  "hollow",
  "home",
  "honey",
  "hood",
  "hope",
  "horn",
  "horror",
  "horse",
  "hospital",
  "host",
  "hotel",
  "hour",
  "hover",
  "hub",
  "huge",
  "human",
  "humble",
  "humor",
  "hundred",
  "hungry",
  "hunt",
  "hurdle",
  "hurry",
  "hurt",
  "husband",
  "hybrid",
  "ice",
  "icon",
  "idea",
  "identify",
  "idle",
  "ignore",
  "ill",
  "illegal",
  "illness",
  "image",
  "imitate",
  "immense",
  "immune",
  "impact",
  "impose",
  "improve",
  "impulse",
  "inch",
  "include",
  "income",
  "increase",
  "index",
  "indicate",
  "indoor",
  "industry",
  "infant",
  "inflict",
  "inform",
  "inhale",
  "inherit",
  "initial",
  "inject",
  "injury",
  "inmate",
  "inner",
  "innocent",
  "input",
  "inquiry",
  "insane",
  "insect",
  "inside",
  "inspire",
  "install",
  "intact",
  "interest",
  "into",
  "invest",
  "invite",
  "involve",
  "iron",
  "island",
  "isolate",
  "issue",
  "item",
  "ivory",
  "jacket",
  "jaguar",
  "jar",
  "jazz",
  "jealous",
  "jeans",
  "jelly",
  "jewel",
  "job",
  "join",
  "joke",
  "journey",
  "joy",
  "judge",
  "juice",
  "jump",
  "jungle",
  "junior",
  "junk",
  "just",
  "kangaroo",
  "keen",
  "keep",
  "ketchup",
  "key",
  "kick",
  "kid",
  "kidney",
  "kind",
  "kingdom",
  "kiss",
  "kit",
  "kitchen",
  "kite",
  "kitten",
  "kiwi",
  "knee",
  "knife",
  "knock",
  "know",
  "lab",
  "label",
  "labor",
  "ladder",
  "lady",
  "lake",
  "lamp",
  "language",
  "laptop",
  "large",
  "later",
  "latin",
  "laugh",
  "laundry",
  "lava",
  "law",
  "lawn",
  "lawsuit",
  "layer",
  "lazy",
  "leader",
  "leaf",
  "learn",
  "leave",
  "lecture",
  "left",
  "leg",
  "legal",
  "legend",
  "leisure",
  "lemon",
  "lend",
  "length",
  "lens",
  "leopard",
  "lesson",
  "letter",
  "level",
  "liar",
  "liberty",
  "library",
  "license",
  "life",
  "lift",
  "light",
  "like",
  "limb",
  "limit",
  "link",
  "lion",
  "liquid",
  "list",
  "little",
  "live",
  "lizard",
  "load",
  "loan",
  "lobster",
  "local",
  "lock",
  "logic",
  "lonely",
  "long",
  "loop",
  "lottery",
  "loud",
  "lounge",
  "love",
  "loyal",
  "lucky",
  "luggage",
  "lumber",
  "lunar",
  "lunch",
  "luxury",
  "lyrics",
  "machine",
  "mad",
  "magic",
  "magnet",
  "maid",
  "mail",
  "main",
  "major",
  "make",
  "mammal",
  "man",
  "manage",
  "mandate",
  "mango",
  "mansion",
  "manual",
  "maple",
  "marble",
  "march",
  "margin",
  "marine",
  "market",
  "marriage",
  "mask",
  "mass",
  "master",
  "match",
  "material",
  "math",
  "matrix",
  "matter",
  "maximum",
  "maze",
  "meadow",
  "mean",
  "measure",
  "meat",
  "mechanic",
  "medal",
  "media",
  "melody",
  "melt",
  "member",
  "memory",
  "mention",
  "menu",
  "mercy",
  "merge",
  "merit",
  "merry",
  "mesh",
  "message",
  "metal",
  "method",
  "middle",
  "midnight",
  "milk",
  "million",
  "mimic",
  "mind",
  "minimum",
  "minor",
  "minute",
  "miracle",
  "mirror",
  "misery",
  "miss",
  "mistake",
  "mix",
  "mixed",
  "mixture",
  "mobile",
  "model",
  "modify",
  "mom",
  "moment",
  "monitor",
  "monkey",
  "monster",
  "month",
  "moon",
  "moral",
  "more",
  "morning",
  "mosquito",
  "mother",
  "motion",
  "motor",
  "mountain",
  "mouse",
  "move",
  "movie",
  "much",
  "muffin",
  "mule",
  "multiply",
  "muscle",
  "museum",
  "mushroom",
  "music",
  "must",
  "mutual",
  "myself",
  "mystery",
  "myth",
  "naive",
  "name",
  "napkin",
  "narrow",
  "nasty",
  "nation",
  "nature",
  "near",
  "neck",
  "need",
  "negative",
  "neglect",
  "neither",
  "nephew",
  "nerve",
  "nest",
  "net",
  "network",
  "neutral",
  "never",
  "news",
  "next",
  "nice",
  "night",
  "noble",
  "noise",
  "nominee",
  "noodle",
  "normal",
  "north",
  "nose",
  "notable",
  "note",
  "nothing",
  "notice",
  "novel",
  "now",
  "nuclear",
  "number",
  "nurse",
  "nut",
  "oak",
  "obey",
  "object",
  "oblige",
  "obscure",
  "observe",
  "obtain",
  "obvious",
  "occur",
  "ocean",
  "october",
  "odor",
  "off",
  "offer",
  "office",
  "often",
  "oil",
  "okay",
  "old",
  "olive",
  "olympic",
  "omit",
  "once",
  "one",
  "onion",
  "online",
  "only",
  "open",
  "opera",
  "opinion",
  "oppose",
  "option",
  "orange",
  "orbit",
  "orchard",
  "order",
  "ordinary",
  "organ",
  "orient",
  "original",
  "orphan",
  "ostrich",
  "other",
  "outdoor",
  "outer",
  "output",
  "outside",
  "oval",
  "oven",
  "over",
  "own",
  "owner",
  "oxygen",
  "oyster",
  "ozone",
  "pact",
  "paddle",
  "page",
  "pair",
  "palace",
  "palm",
  "panda",
  "panel",
  "panic",
  "panther",
  "paper",
  "parade",
  "parent",
  "park",
  "parrot",
  "party",
  "pass",
  "patch",
  "path",
  "patient",
  "patrol",
  "pattern",
  "pause",
  "pave",
  "payment",
  "peace",
  "peanut",
  "pear",
  "peasant",
  "pelican",
  "pen",
  "penalty",
  "pencil",
  "people",
  "pepper",
  "perfect",
  "permit",
  "person",
  "pet",
  "phone",
  "photo",
  "phrase",
  "physical",
  "piano",
  "picnic",
  "picture",
  "piece",
  "pig",
  "pigeon",
  "pill",
  "pilot",
  "pink",
  "pioneer",
  "pipe",
  "pistol",
  "pitch",
  "pizza",
  "place",
  "planet",
  "plastic",
  "plate",
  "play",
  "please",
  "pledge",
  "pluck",
  "plug",
  "plunge",
  "poem",
  "poet",
  "point",
  "polar",
  "pole",
  "police",
  "pond",
  "pony",
  "pool",
  "popular",
  "portion",
  "position",
  "possible",
  "post",
  "potato",
  "pottery",
  "poverty",
  "powder",
  "power",
  "practice",
  "praise",
  "predict",
  "prefer",
  "prepare",
  "present",
  "pretty",
  "prevent",
  "price",
  "pride",
  "primary",
  "print",
  "priority",
  "prison",
  "private",
  "prize",
  "problem",
  "process",
  "produce",
  "profit",
  "program",
  "project",
  "promote",
  "proof",
  "property",
  "prosper",
  "protect",
  "proud",
  "provide",
  "public",
  "pudding",
  "pull",
  "pulp",
  "pulse",
  "pumpkin",
  "punch",
  "pupil",
  "puppy",
  "purchase",
  "purity",
  "purpose",
  "purse",
  "push",
  "put",
  "puzzle",
  "pyramid",
  "quality",
  "quantum",
  "quarter",
  "question",
  "quick",
  "quit",
  "quiz",
  "quote",
  "rabbit",
  "raccoon",
  "race",
  "rack",
  "radar",
  "radio",
  "rail",
  "rain",
  "raise",
  "rally",
  "ramp",
  "ranch",
  "random",
  "range",
  "rapid",
  "rare",
  "rate",
  "rather",
  "raven",
  "raw",
  "razor",
  "ready",
  "real",
  "reason",
  "rebel",
  "rebuild",
  "recall",
  "receive",
  "recipe",
  "record",
  "recycle",
  "reduce",
  "reflect",
  "reform",
  "refuse",
  "region",
  "regret",
  "regular",
  "reject",
  "relax",
  "release",
  "relief",
  "rely",
  "remain",
  "remember",
  "remind",
  "remove",
  "render",
  "renew",
  "rent",
  "reopen",
  "repair",
  "repeat",
  "replace",
  "report",
  "require",
  "rescue",
  "resemble",
  "resist",
  "resource",
  "response",
  "result",
  "retire",
  "retreat",
  "return",
  "reunion",
  "reveal",
  "review",
  "reward",
  "rhythm",
  "rib",
  "ribbon",
  "rice",
  "rich",
  "ride",
  "ridge",
  "rifle",
  "right",
  "rigid",
  "ring",
  "riot",
  "ripple",
  "risk",
  "ritual",
  "rival",
  "river",
  "road",
  "roast",
  "robot",
  "robust",
  "rocket",
  "romance",
  "roof",
  "rookie",
  "room",
  "rose",
  "rotate",
  "rough",
  "round",
  "route",
  "royal",
  "rubber",
  "rude",
  "rug",
  "rule",
  "run",
  "runway",
  "rural",
  "sad",
  "saddle",
  "sadness",
  "safe",
  "sail",
  "salad",
  "salmon",
  "salon",
  "salt",
  "salute",
  "same",
  "sample",
  "sand",
  "satisfy",
  "satoshi",
  "sauce",
  "sausage",
  "save",
  "say",
  "scale",
  "scan",
  "scare",
  "scatter",
  "scene",
  "scheme",
  "school",
  "science",
  "scissors",
  "scorpion",
  "scout",
  "scrap",
  "screen",
  "script",
  "scrub",
  "sea",
  "search",
  "season",
  "seat",
  "second",
  "secret",
  "section",
  "security",
  "seed",
  "seek",
  "segment",
  "select",
  "sell",
  "seminar",
  "senior",
  "sense",
  "sentence",
  "series",
  "service",
  "session",
  "settle",
  "setup",
  "seven",
  "shadow",
  "shaft",
  "shallow",
  "share",
  "shed",
  "shell",
  "sheriff",
  "shield",
  "shift",
  "shine",
  "ship",
  "shiver",
  "shock",
  "shoe",
  "shoot",
  "shop",
  "short",
  "shoulder",
  "shove",
  "shrimp",
  "shrug",
  "shuffle",
  "shy",
  "sibling",
  "sick",
  "side",
  "siege",
  "sight",
  "sign",
  "silent",
  "silk",
  "silly",
  "silver",
  "similar",
  "simple",
  "since",
  "sing",
  "siren",
  "sister",
  "situate",
  "six",
  "size",
  "skate",
  "sketch",
  "ski",
  "skill",
  "skin",
  "skirt",
  "skull",
  "slab",
  "slam",
  "sleep",
  "slender",
  "slice",
  "slide",
  "slight",
  "slim",
  "slogan",
  "slot",
  "slow",
  "slush",
  "small",
  "smart",
  "smile",
  "smoke",
  "smooth",
  "snack",
  "snake",
  "snap",
  "sniff",
  "snow",
  "soap",
  "soccer",
  "social",
  "sock",
  "soda",
  "soft",
  "solar",
  "soldier",
  "solid",
  "solution",
  "solve",
  "someone",
  "song",
  "soon",
  "sorry",
  "sort",
  "soul",
  "sound",
  "soup",
  "source",
  "south",
  "space",
  "spare",
  "spatial",
  "spawn",
  "speak",
  "special",
  "speed",
  "spell",
  "spend",
  "sphere",
  "spice",
  "spider",
  "spike",
  "spin",
  "spirit",
  "split",
  "spoil",
  "sponsor",
  "spoon",
  "sport",
  "spot",
  "spray",
  "spread",
  "spring",
  "spy",
  "square",
  "squeeze",
  "squirrel",
  "stable",
  "stadium",
  "staff",
  "stage",
  "stairs",
  "stamp",
  "stand",
  "start",
  "state",
  "stay",
  "steak",
  "steel",
  "stem",
  "step",
  "stereo",
  "stick",
  "still",
  "sting",
  "stock",
  "stomach",
  "stone",
  "stool",
  "story",
  "stove",
  "strategy",
  "street",
  "strike",
  "strong",
  "struggle",
  "student",
  "stuff",
  "stumble",
  "style",
  "subject",
  "submit",
  "subway",
  "success",
  "such",
  "sudden",
  "suffer",
  "sugar",
  "suggest",
  "suit",
  "summer",
  "sun",
  "sunny",
  "sunset",
  "super",
  "supply",
  "supreme",
  "sure",
  "surface",
  "surge",
  "surprise",
  "surround",
  "survey",
  "suspect",
  "sustain",
  "swallow",
  "swamp",
  "swap",
  "swarm",
  "swear",
  "sweet",
  "swift",
  "swim",
  "swing",
  "switch",
  "sword",
  "symbol",
  "symptom",
  "syrup",
  "system",
  "table",
  "tackle",
  "tag",
  "tail",
  "talent",
  "talk",
  "tank",
  "tape",
  "target",
  "task",
  "taste",
  "tattoo",
  "taxi",
  "teach",
  "team",
  "tell",
  "ten",
  "tenant",
  "tennis",
  "tent",
  "term",
  "test",
  "text",
  "thank",
  "that",
  "theme",
  "then",
  "theory",
  "there",
  "they",
  "thing",
  "this",
  "thought",
  "three",
  "thrive",
  "throw",
  "thumb",
  "thunder",
  "ticket",
  "tide",
  "tiger",
  "tilt",
  "timber",
  "time",
  "tiny",
  "tip",
  "tired",
  "tissue",
  "title",
  "toast",
  "tobacco",
  "today",
  "toddler",
  "toe",
  "together",
  "toilet",
  "token",
  "tomato",
  "tomorrow",
  "tone",
  "tongue",
  "tonight",
  "tool",
  "tooth",
  "top",
  "topic",
  "topple",
  "torch",
  "tornado",
  "tortoise",
  "toss",
  "total",
  "tourist",
  "toward",
  "tower",
  "town",
  "toy",
  "track",
  "trade",
  "traffic",
  "tragic",
  "train",
  "transfer",
  "trap",
  "trash",
  "travel",
  "tray",
  "treat",
  "tree",
  "trend",
  "trial",
  "tribe",
  "trick",
  "trigger",
  "trim",
  "trip",
  "trophy",
  "trouble",
  "truck",
  "true",
  "truly",
  "trumpet",
  "trust",
  "truth",
  "try",
  "tube",
  "tuition",
  "tumble",
  "tuna",
  "tunnel",
  "turkey",
  "turn",
  "turtle",
  "twelve",
  "twenty",
  "twice",
  "twin",
  "twist",
  "two",
  "type",
  "typical",
  "ugly",
  "umbrella",
  "unable",
  "unaware",
  "uncle",
  "uncover",
  "under",
  "undo",
  "unfair",
  "unfold",
  "unhappy",
  "uniform",
  "unique",
  "unit",
  "universe",
  "unknown",
  "unlock",
  "until",
  "unusual",
  "unveil",
  "update",
  "upgrade",
  "uphold",
  "upon",
  "upper",
  "upset",
  "urban",
  "urge",
  "usage",
  "use",
  "used",
  "useful",
  "useless",
  "usual",
  "utility",
  "vacant",
  "vacuum",
  "vague",
  "valid",
  "valley",
  "valve",
  "van",
  "vanish",
  "vapor",
  "various",
  "vast",
  "vault",
  "vehicle",
  "velvet",
  "vendor",
  "venture",
  "venue",
  "verb",
  "verify",
  "version",
  "very",
  "vessel",
  "veteran",
  "viable",
  "vibrant",
  "vicious",
  "victory",
  "video",
  "view",
  "village",
  "vintage",
  "violin",
  "virtual",
  "virus",
  "visa",
  "visit",
  "visual",
  "vital",
  "vivid",
  "vocal",
  "voice",
  "void",
  "volcano",
  "volume",
  "vote",
  "voyage",
  "wage",
  "wagon",
  "wait",
  "walk",
  "wall",
  "walnut",
  "want",
  "warfare",
  "warm",
  "warrior",
  "wash",
  "wasp",
  "waste",
  "water",
  "wave",
  "way",
  "wealth",
  "weapon",
  "wear",
  "weasel",
  "weather",
  "web",
  "wedding",
  "weekend",
  "weird",
  "welcome",
  "west",
  "wet",
  "whale",
  "what",
  "wheat",
  "wheel",
  "when",
  "where",
  "whip",
  "whisper",
  "wide",
  "width",
  "wife",
  "wild",
  "will",
  "win",
  "window",
  "wine",
  "wing",
  "wink",
  "winner",
  "winter",
  "wire",
  "wisdom",
  "wise",
  "wish",
  "witness",
  "wolf",
  "woman",
  "wonder",
  "wood",
  "wool",
  "word",
  "work",
  "world",
  "worry",
  "worth",
  "wrap",
  "wreck",
  "wrestle",
  "wrist",
  "write",
  "wrong",
  "yard",
  "year",
  "yellow",
  "you",
  "young",
  "youth",
  "zebra",
  "zero",
  "zone",
  "zoo"
];
Object.defineProperty(_wordlists, "__esModule", { value: true });
const wordlists = {};
_wordlists.wordlists = wordlists;
let _default;
var _default_1 = _wordlists._default = _default;
try {
  _default_1 = _wordlists._default = _default = require$$0;
  wordlists.czech = _default;
} catch (err) {
}
try {
  _default_1 = _wordlists._default = _default = require$$1;
  wordlists.chinese_simplified = _default;
} catch (err) {
}
try {
  _default_1 = _wordlists._default = _default = require$$2;
  wordlists.chinese_traditional = _default;
} catch (err) {
}
try {
  _default_1 = _wordlists._default = _default = require$$3;
  wordlists.korean = _default;
} catch (err) {
}
try {
  _default_1 = _wordlists._default = _default = require$$4;
  wordlists.french = _default;
} catch (err) {
}
try {
  _default_1 = _wordlists._default = _default = require$$5;
  wordlists.italian = _default;
} catch (err) {
}
try {
  _default_1 = _wordlists._default = _default = require$$6;
  wordlists.spanish = _default;
} catch (err) {
}
try {
  _default_1 = _wordlists._default = _default = require$$7;
  wordlists.japanese = _default;
  wordlists.JA = _default;
} catch (err) {
}
try {
  _default_1 = _wordlists._default = _default = require$$8;
  wordlists.portuguese = _default;
} catch (err) {
}
try {
  _default_1 = _wordlists._default = _default = require$$9;
  wordlists.english = _default;
  wordlists.EN = _default;
} catch (err) {
}
Object.defineProperty(src, "__esModule", { value: true });
const sha256_1 = sha256;
const sha512_1 = sha512;
const pbkdf2_1 = pbkdf2$1;
const utils_1 = utils$1;
const _wordlists_1 = _wordlists;
let DEFAULT_WORDLIST = _wordlists_1._default;
const INVALID_MNEMONIC = "Invalid mnemonic";
const INVALID_ENTROPY = "Invalid entropy";
const INVALID_CHECKSUM = "Invalid mnemonic checksum";
const WORDLIST_REQUIRED = "A wordlist is required but a default could not be found.\nPlease pass a 2048 word array explicitly.";
function normalize(str) {
  return (str || "").normalize("NFKD");
}
function lpad(str, padString, length) {
  while (str.length < length) {
    str = padString + str;
  }
  return str;
}
function binaryToByte(bin) {
  return parseInt(bin, 2);
}
function bytesToBinary(bytes) {
  return bytes.map((x) => lpad(x.toString(2), "0", 8)).join("");
}
function deriveChecksumBits(entropyBuffer) {
  const ENT = entropyBuffer.length * 8;
  const CS = ENT / 32;
  const hash = sha256_1.sha256(Uint8Array.from(entropyBuffer));
  return bytesToBinary(Array.from(hash)).slice(0, CS);
}
function salt(password) {
  return "mnemonic" + (password || "");
}
function mnemonicToSeedSync(mnemonic, password) {
  const mnemonicBuffer = Uint8Array.from(Buffer.from(normalize(mnemonic), "utf8"));
  const saltBuffer = Uint8Array.from(Buffer.from(salt(normalize(password)), "utf8"));
  const res = pbkdf2_1.pbkdf2(sha512_1.sha512, mnemonicBuffer, saltBuffer, {
    c: 2048,
    dkLen: 64
  });
  return Buffer.from(res);
}
src.mnemonicToSeedSync = mnemonicToSeedSync;
function mnemonicToSeed(mnemonic, password) {
  const mnemonicBuffer = Uint8Array.from(Buffer.from(normalize(mnemonic), "utf8"));
  const saltBuffer = Uint8Array.from(Buffer.from(salt(normalize(password)), "utf8"));
  return pbkdf2_1.pbkdf2Async(sha512_1.sha512, mnemonicBuffer, saltBuffer, {
    c: 2048,
    dkLen: 64
  }).then((res) => Buffer.from(res));
}
src.mnemonicToSeed = mnemonicToSeed;
function mnemonicToEntropy(mnemonic, wordlist) {
  wordlist = wordlist || DEFAULT_WORDLIST;
  if (!wordlist) {
    throw new Error(WORDLIST_REQUIRED);
  }
  const words = normalize(mnemonic).split(" ");
  if (words.length % 3 !== 0) {
    throw new Error(INVALID_MNEMONIC);
  }
  const bits = words.map((word) => {
    const index = wordlist.indexOf(word);
    if (index === -1) {
      throw new Error(INVALID_MNEMONIC);
    }
    return lpad(index.toString(2), "0", 11);
  }).join("");
  const dividerIndex = Math.floor(bits.length / 33) * 32;
  const entropyBits = bits.slice(0, dividerIndex);
  const checksumBits = bits.slice(dividerIndex);
  const entropyBytes = entropyBits.match(/(.{1,8})/g).map(binaryToByte);
  if (entropyBytes.length < 16) {
    throw new Error(INVALID_ENTROPY);
  }
  if (entropyBytes.length > 32) {
    throw new Error(INVALID_ENTROPY);
  }
  if (entropyBytes.length % 4 !== 0) {
    throw new Error(INVALID_ENTROPY);
  }
  const entropy = Buffer.from(entropyBytes);
  const newChecksum = deriveChecksumBits(entropy);
  if (newChecksum !== checksumBits) {
    throw new Error(INVALID_CHECKSUM);
  }
  return entropy.toString("hex");
}
var mnemonicToEntropy_1 = src.mnemonicToEntropy = mnemonicToEntropy;
function entropyToMnemonic(entropy, wordlist) {
  if (!Buffer.isBuffer(entropy)) {
    entropy = Buffer.from(entropy, "hex");
  }
  wordlist = wordlist || DEFAULT_WORDLIST;
  if (!wordlist) {
    throw new Error(WORDLIST_REQUIRED);
  }
  if (entropy.length < 16) {
    throw new TypeError(INVALID_ENTROPY);
  }
  if (entropy.length > 32) {
    throw new TypeError(INVALID_ENTROPY);
  }
  if (entropy.length % 4 !== 0) {
    throw new TypeError(INVALID_ENTROPY);
  }
  const entropyBits = bytesToBinary(Array.from(entropy));
  const checksumBits = deriveChecksumBits(entropy);
  const bits = entropyBits + checksumBits;
  const chunks = bits.match(/(.{1,11})/g);
  const words = chunks.map((binary) => {
    const index = binaryToByte(binary);
    return wordlist[index];
  });
  return wordlist[0] === "あいこくしん" ? words.join("　") : words.join(" ");
}
src.entropyToMnemonic = entropyToMnemonic;
function generateMnemonic$1(strength, rng, wordlist) {
  strength = strength || 128;
  if (strength % 32 !== 0) {
    throw new TypeError(INVALID_ENTROPY);
  }
  rng = rng || ((size) => Buffer.from(utils_1.randomBytes(size)));
  return entropyToMnemonic(rng(strength / 8), wordlist);
}
var generateMnemonic_1 = src.generateMnemonic = generateMnemonic$1;
function validateMnemonic$1(mnemonic, wordlist) {
  try {
    mnemonicToEntropy(mnemonic, wordlist);
  } catch (e) {
    return false;
  }
  return true;
}
var validateMnemonic_1 = src.validateMnemonic = validateMnemonic$1;
function setDefaultWordlist(language) {
  const result = _wordlists_1.wordlists[language];
  if (result) {
    DEFAULT_WORDLIST = result;
  } else {
    throw new Error('Could not find wordlist for language "' + language + '"');
  }
}
src.setDefaultWordlist = setDefaultWordlist;
function getDefaultWordlist() {
  if (!DEFAULT_WORDLIST) {
    throw new Error("No Default Wordlist set");
  }
  return Object.keys(_wordlists_1.wordlists).filter((lang) => {
    if (lang === "JA" || lang === "EN") {
      return false;
    }
    return _wordlists_1.wordlists[lang].every((word, index) => word === DEFAULT_WORDLIST[index]);
  })[0];
}
src.getDefaultWordlist = getDefaultWordlist;
var _wordlists_2 = _wordlists;
src.wordlists = _wordlists_2.wordlists;
let publicKey;
let secretKey;
let upeerId;
let ephemeralPublicKey;
let ephemeralSecretKey;
let spkPublicKey;
let spkSecretKey;
let spkId = 0;
const SPK_ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1e3;
let spkRotationInterval = null;
const MAX_PREVIOUS_SPK = 2;
let previousSpkEntries = [];
const MAX_PREVIOUS_EPH_KEYS = 6;
let previousEphemeralSecretKeys = [];
let ephemeralKeyRotationInterval = null;
let ephemeralKeyRotationCounter = 0;
const EPHEMERAL_KEY_ROTATION_INTERVAL_MS = 5 * 60 * 1e3;
const EPHEMERAL_KEY_MAX_MESSAGES = 100;
let dhtSeq = 0;
let dhtStatePath;
let myAlias = "";
let myAvatar = "";
let _userDataPath = "";
let _isLocked = true;
let _isMnemonicBased = false;
const MNEMONIC_MODE_FLAG = "identity.mnemonic_mode";
const DEVICE_KEY_FILE = "device.key";
const SESSION_ENC_FILE = "identity.enc";
const SESSION_LOCKED_FILE = "session.locked";
const ALIAS_FILE = "identity.alias";
const AVATAR_FILE = "identity.avatar";
function _getOrCreateDeviceKey(userDataPath) {
  const p = path.join(userDataPath, DEVICE_KEY_FILE);
  if (fs.existsSync(p)) {
    const k2 = fs.readFileSync(p);
    if (k2.length === sodium.crypto_secretbox_KEYBYTES) return k2;
  }
  const k = Buffer.allocUnsafe(sodium.crypto_secretbox_KEYBYTES);
  sodium.randombytes_buf(k);
  fs.writeFileSync(p, k, { mode: 384 });
  return k;
}
function _saveEncryptedSession(userDataPath) {
  try {
    const devKey = _getOrCreateDeviceKey(userDataPath);
    const nonce = Buffer.allocUnsafe(sodium.crypto_secretbox_NONCEBYTES);
    sodium.randombytes_buf(nonce);
    const cipher = Buffer.alloc(secretKey.length + sodium.crypto_secretbox_MACBYTES);
    sodium.crypto_secretbox_easy(cipher, secretKey, nonce, devKey);
    fs.writeFileSync(path.join(userDataPath, SESSION_ENC_FILE), Buffer.concat([nonce, cipher]), { mode: 384 });
    const lockedPath = path.join(userDataPath, SESSION_LOCKED_FILE);
    if (fs.existsSync(lockedPath)) fs.unlinkSync(lockedPath);
  } catch (e) {
    error("No se pudo guardar la sesión cifrada", e, "identity");
  }
}
function _tryLoadEncryptedSession(userDataPath) {
  const encPath = path.join(userDataPath, SESSION_ENC_FILE);
  const lockedPath = path.join(userDataPath, SESSION_LOCKED_FILE);
  if (!fs.existsSync(encPath) || fs.existsSync(lockedPath)) return false;
  try {
    const devKey = _getOrCreateDeviceKey(userDataPath);
    const blob2 = fs.readFileSync(encPath);
    const nonce = blob2.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
    const cipher = blob2.subarray(sodium.crypto_secretbox_NONCEBYTES);
    const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
    const ok = sodium.crypto_secretbox_open_easy(plain, cipher, nonce, devKey);
    if (!ok || plain.length !== sodium.crypto_sign_SECRETKEYBYTES) return false;
    secretKey = plain;
    publicKey = secretKey.subarray(32);
    return true;
  } catch (e) {
    error("No se pudo cargar la sesión cifrada", e, "identity");
    return false;
  }
}
function initIdentity(userDataPath) {
  _userDataPath = userDataPath;
  const flagPath = path.join(userDataPath, MNEMONIC_MODE_FLAG);
  const legacyKeyPath = path.join(userDataPath, "identity.key");
  if (!fs.existsSync(flagPath) && fs.existsSync(legacyKeyPath)) {
    try {
      fs.renameSync(legacyKeyPath, legacyKeyPath + ".legacy-bak");
    } catch (_) {
    }
    info("Instalación heredada detectada. Clave aleatoria respaldada. Se requiere frase semilla.", {}, "identity");
  }
  dhtStatePath = path.join(userDataPath, "dht_state.json");
  _isMnemonicBased = fs.existsSync(flagPath);
  _loadDhtSeq();
  const aliasPath = path.join(userDataPath, ALIAS_FILE);
  if (fs.existsSync(aliasPath)) {
    try {
      myAlias = fs.readFileSync(aliasPath, "utf8").trim();
    } catch (_) {
    }
  }
  const avatarPath = path.join(userDataPath, AVATAR_FILE);
  if (fs.existsSync(avatarPath)) {
    try {
      myAvatar = fs.readFileSync(avatarPath, "utf8").trim();
    } catch (_) {
    }
  }
  if (!_isMnemonicBased) {
    _isLocked = true;
    info("Primera ejecución. Se requiere crear o importar una frase semilla.", {}, "identity");
    return;
  }
  const userExplicitlyLocked = fs.existsSync(path.join(userDataPath, SESSION_LOCKED_FILE));
  if (!userExplicitlyLocked && _tryLoadEncryptedSession(userDataPath)) {
    _isLocked = false;
    _finalizeIdentityInit(userDataPath);
    info("Sesión restaurada automáticamente.", { upeerId }, "identity");
  } else {
    _isLocked = true;
    info("Sesión bloqueada. Se requiere frase semilla para continuar.", {}, "identity");
  }
}
function _loadDhtSeq() {
  if (!dhtStatePath) return;
  if (fs.existsSync(dhtStatePath)) {
    try {
      const dhtData = JSON.parse(fs.readFileSync(dhtStatePath, "utf8"));
      if (typeof dhtData.seq === "number") {
        dhtSeq = dhtData.seq;
      }
    } catch (e) {
      error("Error reading DHT state", e, "identity");
    }
  } else {
    dhtSeq = Date.now();
    fs.writeFileSync(dhtStatePath, JSON.stringify({ seq: dhtSeq }));
  }
}
function _finalizeIdentityInit(userDataPath) {
  const hash = Buffer.alloc(16);
  sodium.crypto_generichash(hash, publicKey);
  upeerId = hash.toString("hex");
  ephemeralPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
  ephemeralSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_box_keypair(ephemeralPublicKey, ephemeralSecretKey);
  startEphemeralKeyRotation();
  _rotateSignedPreKey();
  if (spkRotationInterval) clearInterval(spkRotationInterval);
  spkRotationInterval = setInterval(_rotateSignedPreKey, SPK_ROTATION_INTERVAL_MS);
  dhtStatePath = path.join(userDataPath, "dht_state.json");
  _loadDhtSeq();
  info("Identidad upeer Inicializada", { upeerId, dhtSeq }, "identity");
}
function generateMnemonic() {
  return generateMnemonic_1(128);
}
function validateMnemonic(mnemonic) {
  return validateMnemonic_1(mnemonic.trim().toLowerCase());
}
async function deriveKeypairFromMnemonic(mnemonic) {
  const cleaned = mnemonic.trim().toLowerCase();
  if (!validateMnemonic_1(cleaned)) {
    error("Invalid mnemonic provided", {}, "identity");
    return false;
  }
  const entropy = Buffer.from(mnemonicToEntropy_1(cleaned), "hex");
  const seed = Buffer.alloc(64);
  const salt2 = Buffer.alloc(sodium.crypto_pwhash_SALTBYTES);
  sodium.crypto_generichash(salt2.subarray(0, 16), Buffer.from("upeer-identity-v1"));
  sodium.crypto_pwhash(
    seed,
    entropy,
    salt2,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
  publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
  secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
  sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed.subarray(0, 32));
  info("Keypair derivado desde frase semilla", {}, "identity");
  return true;
}
async function createMnemonicIdentity(mnemonic, alias, avatar) {
  if (!_userDataPath) return { success: false, error: "App not initialized" };
  const ok = await deriveKeypairFromMnemonic(mnemonic);
  if (!ok) return { success: false, error: "Frase semilla inválida" };
  _finalizeIdentityInit(_userDataPath);
  if (alias) setMyAlias(alias);
  if (avatar) setMyAvatar(avatar);
  const flagPath = path.join(_userDataPath, MNEMONIC_MODE_FLAG);
  fs.writeFileSync(flagPath, JSON.stringify({ createdAt: Date.now(), version: 1 }));
  _isMnemonicBased = true;
  _isLocked = false;
  _saveEncryptedSession(_userDataPath);
  info("Identidad mnemonic creada", { upeerId }, "identity");
  return { success: true, upeerId };
}
async function unlockWithMnemonic(mnemonic) {
  if (!_isMnemonicBased) return { success: false, error: "Esta identidad no usa frase semilla" };
  const ok = await deriveKeypairFromMnemonic(mnemonic);
  if (!ok) return { success: false, error: "Frase semilla inválida" };
  _finalizeIdentityInit(_userDataPath);
  _isLocked = false;
  _saveEncryptedSession(_userDataPath);
  info("Sesión desbloqueada con frase semilla", { upeerId }, "identity");
  return { success: true, upeerId };
}
function lockSession() {
  if (secretKey) sodium.sodium_memzero(secretKey);
  if (ephemeralSecretKey) sodium.sodium_memzero(ephemeralSecretKey);
  if (spkSecretKey) sodium.sodium_memzero(spkSecretKey);
  for (const entry of previousSpkEntries) {
    sodium.sodium_memzero(entry.spkSk);
  }
  previousSpkEntries = [];
  for (const prevSk of previousEphemeralSecretKeys) {
    sodium.sodium_memzero(prevSk);
  }
  previousEphemeralSecretKeys = [];
  if (spkRotationInterval) {
    clearInterval(spkRotationInterval);
    spkRotationInterval = null;
  }
  stopEphemeralKeyRotation();
  _isLocked = true;
  if (_userDataPath) {
    try {
      fs.writeFileSync(path.join(_userDataPath, SESSION_LOCKED_FILE), "1");
    } catch (_) {
    }
    const encPath = path.join(_userDataPath, SESSION_ENC_FILE);
    if (fs.existsSync(encPath)) {
      try {
        fs.unlinkSync(encPath);
      } catch (_) {
      }
    }
  }
  info("Sesión bloqueada por el usuario", {}, "identity");
}
function isSessionLocked() {
  return _isLocked;
}
function isMnemonicMode() {
  return _isMnemonicBased;
}
function getMyAlias() {
  return myAlias;
}
function setMyAlias(alias) {
  myAlias = alias.trim().slice(0, 64);
  if (_userDataPath) {
    try {
      fs.writeFileSync(path.join(_userDataPath, ALIAS_FILE), myAlias, { encoding: "utf8" });
    } catch (_) {
    }
  }
}
function getMyAvatar() {
  return myAvatar;
}
function setMyAvatar(avatar) {
  if (avatar.length > 204800) {
    error("Avatar demasiado grande, debe ser menor de 200 KB", {}, "identity");
    return;
  }
  myAvatar = avatar;
  if (_userDataPath) {
    try {
      if (avatar) {
        fs.writeFileSync(path.join(_userDataPath, AVATAR_FILE), avatar, { encoding: "utf8" });
      } else {
        const p = path.join(_userDataPath, AVATAR_FILE);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    } catch (_) {
    }
  }
}
function getMyPublicKey() {
  return publicKey;
}
function getMyPublicKeyHex() {
  return publicKey.toString("hex");
}
function getMyUPeerId() {
  return upeerId;
}
function getUPeerIdFromPublicKey(publicKey2) {
  const hash = Buffer.alloc(16);
  sodium.crypto_generichash(hash, publicKey2);
  return hash.toString("hex");
}
function sign(message) {
  const signature = Buffer.allocUnsafe(sodium.crypto_sign_BYTES);
  sodium.crypto_sign_detached(signature, message, secretKey);
  return signature;
}
function verify(message, signature, senderPublicKey) {
  return sodium.crypto_sign_verify_detached(signature, message, senderPublicKey);
}
function getMyEphemeralPublicKeyHex() {
  return ephemeralPublicKey.toString("hex");
}
function rotateEphemeralKeys() {
  previousEphemeralSecretKeys.unshift(ephemeralSecretKey);
  if (previousEphemeralSecretKeys.length > MAX_PREVIOUS_EPH_KEYS) {
    previousEphemeralSecretKeys.length = MAX_PREVIOUS_EPH_KEYS;
  }
  const newEphemeralPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
  const newEphemeralSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_box_keypair(newEphemeralPublicKey, newEphemeralSecretKey);
  ephemeralPublicKey = newEphemeralPublicKey;
  ephemeralSecretKey = newEphemeralSecretKey;
  ephemeralKeyRotationCounter = 0;
  info("Ephemeral keys rotated", {}, "identity");
  notifyContactsAboutKeyRotation();
}
function notifyContactsAboutKeyRotation() {
  info("Notifying contacts about ephemeral key rotation", {}, "identity");
  Promise.resolve().then(() => server).then(({ sendSecureUDPMessage: sendSecureUDPMessage2 }) => {
    import("./db-Cln22U_j.js").then(({ getContacts: getContacts2 }) => {
      const contacts2 = getContacts2();
      for (const c of contacts2) {
        if (c.status === "connected" && c.address) {
          sendSecureUDPMessage2(c.address, {
            type: "PING",
            ephemeralPublicKey: getMyEphemeralPublicKeyHex()
          });
        }
      }
    }).catch(() => {
    });
  }).catch(() => {
  });
}
function incrementEphemeralMessageCounter() {
  ephemeralKeyRotationCounter++;
  if (ephemeralKeyRotationCounter >= EPHEMERAL_KEY_MAX_MESSAGES) {
    rotateEphemeralKeys();
  }
}
function startEphemeralKeyRotation() {
  if (ephemeralKeyRotationInterval) {
    clearInterval(ephemeralKeyRotationInterval);
  }
  ephemeralKeyRotationInterval = setInterval(() => {
    rotateEphemeralKeys();
  }, EPHEMERAL_KEY_ROTATION_INTERVAL_MS);
  info("Ephemeral key rotation started", { interval: EPHEMERAL_KEY_ROTATION_INTERVAL_MS }, "identity");
}
function stopEphemeralKeyRotation() {
  if (ephemeralKeyRotationInterval) {
    clearInterval(ephemeralKeyRotationInterval);
    ephemeralKeyRotationInterval = null;
  }
}
function getMyDhtSeq() {
  return dhtSeq;
}
function incrementMyDhtSeq() {
  dhtSeq++;
  try {
    fs.writeFileSync(dhtStatePath, JSON.stringify({ seq: dhtSeq }));
  } catch (e) {
    error("Failed to save DHT state", e, "identity");
  }
  return dhtSeq;
}
function encrypt(message, recipientPublicKey, useEphemeral = false) {
  let recipientCurvePK;
  let myCurveSK;
  if (useEphemeral) {
    recipientCurvePK = recipientPublicKey;
    myCurveSK = ephemeralSecretKey;
  } else {
    recipientCurvePK = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    sodium.crypto_sign_ed25519_pk_to_curve25519(recipientCurvePK, recipientPublicKey);
    myCurveSK = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_sign_ed25519_sk_to_curve25519(myCurveSK, secretKey);
  }
  const nonce = Buffer.allocUnsafe(sodium.crypto_box_NONCEBYTES);
  sodium.randombytes_buf(nonce);
  const ciphertext = Buffer.alloc(message.length + sodium.crypto_box_MACBYTES);
  sodium.crypto_box_easy(ciphertext, message, nonce, recipientCurvePK, myCurveSK);
  if (!useEphemeral) {
    sodium.sodium_memzero(myCurveSK);
    sodium.sodium_memzero(recipientCurvePK);
  }
  return { ciphertext, nonce };
}
function decrypt(ciphertext, nonce, senderPublicKey, useEphemeral = false) {
  let senderCurvePK;
  let myCurveSK;
  if (useEphemeral) {
    senderCurvePK = senderPublicKey;
    myCurveSK = ephemeralSecretKey;
  } else {
    senderCurvePK = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
    sodium.crypto_sign_ed25519_pk_to_curve25519(senderCurvePK, senderPublicKey);
    myCurveSK = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
    sodium.crypto_sign_ed25519_sk_to_curve25519(myCurveSK, secretKey);
  }
  const decrypted = Buffer.alloc(ciphertext.length - sodium.crypto_box_MACBYTES);
  const success = sodium.crypto_box_open_easy(decrypted, ciphertext, nonce, senderCurvePK, myCurveSK);
  if (success) {
    if (!useEphemeral) {
      sodium.sodium_memzero(myCurveSK);
      sodium.sodium_memzero(senderCurvePK);
    }
    return decrypted;
  }
  if (useEphemeral && previousEphemeralSecretKeys.length > 0) {
    for (let i = 0; i < previousEphemeralSecretKeys.length; i++) {
      const prevSK = previousEphemeralSecretKeys[i];
      const decryptedPrev = Buffer.alloc(ciphertext.length - sodium.crypto_box_MACBYTES);
      const successPrev = sodium.crypto_box_open_easy(decryptedPrev, ciphertext, nonce, senderCurvePK, prevSK);
      if (successPrev) {
        debug(`Decrypted with previous ephemeral key [${i}] (rotation lag fallback)`, {}, "identity");
        return decryptedPrev;
      }
    }
  }
  if (!useEphemeral) {
    sodium.sodium_memzero(myCurveSK);
    sodium.sodium_memzero(senderCurvePK);
  }
  return null;
}
function _rotateSignedPreKey() {
  if (spkPublicKey && spkSecretKey) {
    previousSpkEntries.unshift({ spkId, spkPk: spkPublicKey, spkSk: spkSecretKey });
    if (previousSpkEntries.length > MAX_PREVIOUS_SPK) {
      const old = previousSpkEntries.pop();
      sodium.sodium_memzero(old.spkSk);
    }
  }
  spkPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
  spkSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_box_keypair(spkPublicKey, spkSecretKey);
  spkId = Math.floor(Date.now() / 1e3);
  info("Signed PreKey rotado", { spkId }, "identity");
}
function getMySignedPreKeyBundle() {
  const sig = Buffer.allocUnsafe(sodium.crypto_sign_BYTES);
  sodium.crypto_sign_detached(sig, spkPublicKey, secretKey);
  return {
    spkPub: spkPublicKey.toString("hex"),
    spkSig: sig.toString("hex"),
    spkId
  };
}
function getMySignedPreKeySk() {
  return spkSecretKey;
}
function getMySignedPreKeyPk() {
  return spkPublicKey;
}
function getSpkBySpkId(id) {
  if (id === spkId) return { spkPk: spkPublicKey, spkSk: spkSecretKey };
  const prev = previousSpkEntries.find((e) => e.spkId === id);
  return prev ? { spkPk: prev.spkPk, spkSk: prev.spkSk } : null;
}
function getMyIdentitySkBuffer() {
  return secretKey;
}
function getMyIdentityPkBuffer() {
  return publicKey;
}
function decryptSealed(senderEphPub, nonce, ciphertext) {
  const myCurveSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_sign_ed25519_sk_to_curve25519(myCurveSk, secretKey);
  const plaintext = Buffer.alloc(ciphertext.length - sodium.crypto_box_MACBYTES);
  const ok = sodium.crypto_box_open_easy(plaintext, ciphertext, nonce, senderEphPub, myCurveSk);
  sodium.sodium_memzero(myCurveSk);
  return ok ? plaintext : null;
}
const identity = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  createMnemonicIdentity,
  decrypt,
  decryptSealed,
  deriveKeypairFromMnemonic,
  encrypt,
  generateMnemonic,
  getMyAlias,
  getMyAvatar,
  getMyDhtSeq,
  getMyEphemeralPublicKeyHex,
  getMyIdentityPkBuffer,
  getMyIdentitySkBuffer,
  getMyPublicKey,
  getMyPublicKeyHex,
  getMySignedPreKeyBundle,
  getMySignedPreKeyPk,
  getMySignedPreKeySk,
  getMyUPeerId,
  getSpkBySpkId,
  getUPeerIdFromPublicKey,
  incrementEphemeralMessageCounter,
  incrementMyDhtSeq,
  initIdentity,
  isMnemonicMode,
  isSessionLocked,
  lockSession,
  rotateEphemeralKeys,
  setMyAlias,
  setMyAvatar,
  sign,
  stopEphemeralKeyRotation,
  unlockWithMnemonic,
  validateMnemonic,
  verify
}, Symbol.toStringTag, { value: "Module" }));
const ARGON2_OPSLIMIT = sodium.crypto_pwhash_OPSLIMIT_MIN;
const ARGON2_MEMLIMIT = sodium.crypto_pwhash_MEMLIMIT_MIN;
const ARGON2_ALG = sodium.crypto_pwhash_ALG_ARGON2ID13;
const DIFFICULTY_MASK = 240;
const PROOF_VALIDITY_S = 300;
class AdaptivePow {
  /**
   * Generate a memory-hard Argon2id light proof.
   * Proof format: JSON string { s: saltHex, t: timestampSeconds }
   *
   * Each attempt allocates 8 MiB — GPU botnets are memory-bus limited.
   * Expected: ~16 attempts × ~30 ms/attempt = ~480 ms on desktop CPU.
   */
  static generateLightProof(upeerId2) {
    const t = Math.floor(Date.now() / 1e3);
    const password = Buffer.from(upeerId2 + t.toString());
    const hash = Buffer.alloc(32);
    const salt2 = Buffer.allocUnsafe(sodium.crypto_pwhash_SALTBYTES);
    const MAX_ATTEMPTS = 512;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      sodium.randombytes_buf(salt2);
      sodium.crypto_pwhash(hash, password, salt2, ARGON2_OPSLIMIT, ARGON2_MEMLIMIT, ARGON2_ALG);
      if ((hash[0] & DIFFICULTY_MASK) === 0) {
        return JSON.stringify({ s: salt2.toString("hex"), t });
      }
    }
    return JSON.stringify({ s: salt2.toString("hex"), t });
  }
  /**
   * Verify a light proof. Supports both the new Argon2id format (JSON) and
   * the legacy SHA-256 format (plain hex) for backward compatibility.
   */
  static verifyLightProof(proof, upeerId2) {
    if (!proof || typeof proof !== "string") return false;
    if (proof.startsWith("{")) {
      try {
        const { s: saltHex, t } = JSON.parse(proof);
        if (typeof saltHex !== "string" || typeof t !== "number") return false;
        if (Math.abs(Date.now() / 1e3 - t) > PROOF_VALIDITY_S) return false;
        const salt2 = Buffer.from(saltHex, "hex");
        if (salt2.length !== sodium.crypto_pwhash_SALTBYTES) return false;
        const password = Buffer.from(upeerId2 + t.toString());
        const hash2 = Buffer.alloc(32);
        sodium.crypto_pwhash(hash2, password, salt2, ARGON2_OPSLIMIT, ARGON2_MEMLIMIT, ARGON2_ALG);
        return (hash2[0] & DIFFICULTY_MASK) === 0;
      } catch {
        return false;
      }
    }
    if (!/^[0-9a-f]+$/i.test(proof) || proof.length > 64) return false;
    const hash = crypto$1.createHash("sha256").update(upeerId2 + proof).digest("hex");
    return hash.startsWith("0");
  }
}
let kademlia = null;
function setKademliaInstance(instance) {
  kademlia = instance;
}
function getKademliaInstance() {
  return kademlia;
}
const PUBLIC_PEERS_URL = "https://publicpeers.neilalexander.dev/";
const GEO_SELF_URL = "https://ip-api.com/json?fields=lat,lon,countryCode";
const GEO_BATCH_URL = "https://ip-api.com/batch?fields=lat,lon,countryCode,query";
const PROBE_TIMEOUT_MS = 3e3;
const GEO_TIMEOUT_MS = 6e3;
const FETCH_TIMEOUT_MS = 1e4;
const CACHE_TTL_MS = 2 * 60 * 60 * 1e3;
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1e3;
const PROBE_BATCH_SIZE = 30;
const MAX_ACTIVE_PEERS = 8;
const MAX_GEO_DISTANCE_KM = 12e3;
const FALLBACK_PEERS = [
  { uri: "tls://ygg.mkg20001.io:443", country: "Germany" },
  {
    uri: "tls://yggdrasil.neilalexander.dev:64648?key=ecbbcb3298e7d3b4196103333c3e839cfe47a6ca47602b94a6d596683f6bb358",
    country: "UK"
  },
  { uri: "tls://51.15.204.214:54321", country: "France" },
  { uri: "tls://95.217.35.92:1337", country: "Finland" },
  { uri: "tls://vpn.ltha.de:443", country: "Germany" },
  { uri: "tcp://longseason.1200bps.xyz:13121", country: "UK" },
  { uri: "tls://ygg1.grin.hu:42444", country: "Hungary" },
  { uri: "tcp://yggno.de:18226", country: "Germany" },
  { uri: "tls://spain.magicum.net:36901", country: "Spain" },
  { uri: "tls://redcatho.de:9494", country: "Germany" }
];
let activePeers = [];
let peerPool = [];
let selfGeo = null;
let healthTimer = null;
let peersChangedCb = null;
function setOnPeersChanged(cb) {
  peersChangedCb = cb;
}
function getActivePeerUris() {
  return activePeers.map((p) => p.uri);
}
function getPeerPool() {
  return [...peerPool];
}
function getSelfGeo() {
  return selfGeo ? { lat: selfGeo.lat, lon: selfGeo.lon } : null;
}
async function initPeerManager(cacheDir) {
  const cached = loadCache(cacheDir);
  const cacheAge = cached ? Date.now() - cached.lastFullRefresh : Infinity;
  if (cached && cacheAge < CACHE_TTL_MS && cached.peers.length >= 4) {
    const minLeft = Math.round((CACHE_TTL_MS - cacheAge) / 6e4);
    info(`Peers cache valid (${cached.peers.length} nodes, refresh in ${minLeft} min)`, void 0, "peers");
    selfGeo = cached.selfGeo;
    peerPool = cached.peers;
    activePeers = cached.peers.slice(0, MAX_ACTIVE_PEERS);
    setTimeout(() => fullRefresh(cacheDir).catch(() => {
    }), 2e4);
  } else {
    await fullRefresh(cacheDir);
  }
  startHealthMonitor(cacheDir);
  return getActivePeerUris();
}
function stopPeerManager() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}
async function fullRefresh(cacheDir) {
  info("Full peer discovery started", void 0, "peers");
  if (!selfGeo) {
    selfGeo = await fetchSelfGeo();
    if (selfGeo) {
      info(`Self geolocation: ${selfGeo.countryCode} (${selfGeo.lat.toFixed(2)}, ${selfGeo.lon.toFixed(2)})`, void 0, "peers");
    } else {
      warn("Self geolocation unavailable — scoring without distance", void 0, "peers");
    }
  }
  let rawPeers = await fetchPeersWithMeta();
  info(`${rawPeers.length} online peers parsed`, void 0, "peers");
  const existingUris = new Set(rawPeers.map((p) => p.uri));
  for (const fb of FALLBACK_PEERS) {
    if (!existingUris.has(fb.uri)) {
      rawPeers.push(makePeerInfo(fb.uri, fb.country, 90));
    }
  }
  if (selfGeo) {
    await geolocatePeers(rawPeers);
  }
  await probePeersLatency(rawPeers);
  for (const p of rawPeers) p.score = computeScore$1(p, selfGeo);
  peerPool = rawPeers.filter((p) => p.alive).sort((a, b) => b.score - a.score);
  logTopPeers(peerPool);
  activePeers = peerPool.slice(0, MAX_ACTIVE_PEERS);
  saveCache(cacheDir, { selfGeo, peers: peerPool, lastFullRefresh: Date.now() });
  peersChangedCb == null ? void 0 : peersChangedCb(getActivePeerUris());
  info("Full peer discovery completed", void 0, "peers");
}
function logTopPeers(pool) {
  const n = Math.min(pool.length, 6);
  if (n === 0) {
    warn("No reachable peers!", void 0, "peers");
    return;
  }
  info(`Active pool: ${pool.length} reachable peers — top ${n}:`, void 0, "peers");
  for (const p of pool.slice(0, n)) {
    const dist = p.distanceKm != null ? `${Math.round(p.distanceKm)} km` : "? km";
    const lat = p.latencyMs != null ? `${p.latencyMs} ms` : "? ms";
    info(
      `score=${p.score.toFixed(1).padStart(5)} latency=${lat.padStart(7)} dist=${dist.padStart(8)} uptime=${p.uptimePct}% [${p.country}] ${p.uri}`,
      void 0,
      "peers"
    );
  }
}
function startHealthMonitor(cacheDir) {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(
    () => healthCheck(cacheDir).catch(() => {
    }),
    HEALTH_CHECK_INTERVAL_MS
  );
}
async function healthCheck(cacheDir) {
  if (activePeers.length === 0) return;
  const results = await Promise.all(
    activePeers.map(async (peer) => {
      const r = await probePeerLatency(peer.uri);
      return { peer, ...r };
    })
  );
  let changed = false;
  const activeSet = new Set(activePeers.map((p) => p.uri));
  for (const { peer, alive, latencyMs } of results) {
    const wasAlive = peer.alive;
    peer.alive = alive;
    peer.latencyMs = alive ? latencyMs : peer.latencyMs;
    peer.lastChecked = Date.now();
    peer.score = computeScore$1(peer, selfGeo);
    if (wasAlive && !alive) {
      warn(`Peer down: ${peer.uri}`, void 0, "peers");
      const replacement = peerPool.find((p) => p.alive && !activeSet.has(p.uri));
      if (replacement) {
        activePeers[activePeers.indexOf(peer)] = replacement;
        activeSet.delete(peer.uri);
        activeSet.add(replacement.uri);
        info(`Replaced by: ${replacement.uri} (score=${replacement.score.toFixed(1)})`, void 0, "peers");
        changed = true;
      } else {
        warn("Peer pool exhausted — triggering background rediscovery", void 0, "peers");
        setTimeout(() => fullRefresh(cacheDir).catch(() => {
        }), 2e3);
        return;
      }
    }
  }
  if (changed) {
    saveCache(cacheDir, { selfGeo, peers: peerPool, lastFullRefresh: Date.now() });
    peersChangedCb == null ? void 0 : peersChangedCb(getActivePeerUris());
  }
}
async function fetchPeersWithMeta() {
  const content = await httpGet(PUBLIC_PEERS_URL, FETCH_TIMEOUT_MS);
  if (!content) return [];
  const peers = [];
  const headingRe = /(?:<h[23][^>]*>([^<]+)<\/h[23]>|^#{1,3}\s+(.+)$)/gim;
  const headings = [];
  let hm;
  while ((hm = headingRe.exec(content)) !== null) {
    const raw = (hm[1] ?? hm[2] ?? "").trim().replace(/\s+/g, " ");
    if (raw && !/peer|v\d|\bapi\b/i.test(raw) && raw.length < 60) {
      headings.push({ pos: hm.index, name: raw });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const mdRe = /\|\s*((?:tcp|tls):\/\/[^\s|]+)\s*\|\s*online[^|]*\|\s*(\d+)%/gi;
  let pm;
  while ((pm = mdRe.exec(content)) !== null) {
    const uri = pm[1].trim();
    const uptimePct = parseInt(pm[2], 10);
    tryAddPeer(uri, uptimePct, pm.index, peers, headings, seen);
  }
  if (peers.length === 0) {
    const htmlRe = /href=["']((?:tcp|tls):\/\/[^"'<\s]+)["'][^>]*>[\s\S]{1,300}?online[\s\S]{1,150}?(\d+)%/gi;
    let hpr;
    while ((hpr = htmlRe.exec(content)) !== null) {
      const uri = hpr[1].trim();
      const uptimePct = parseInt(hpr[2], 10);
      tryAddPeer(uri, uptimePct, hpr.index, peers, headings, seen);
    }
  }
  const countries = new Set(peers.map((p) => p.country)).size;
  info(`Parsed ${peers.length} peers from ${countries} countries`, void 0, "peers");
  return peers;
}
function tryAddPeer(uri, uptimePct, pos, peers, headings, seen) {
  if (seen.has(uri)) return;
  const host = extractHost(uri);
  const port = extractPort(uri);
  if (!host || port <= 0) return;
  let country = "Unknown";
  for (const h of headings) {
    if (h.pos <= pos) country = h.name;
    else break;
  }
  seen.add(uri);
  peers.push(makePeerInfo(uri, country, uptimePct));
}
function makePeerInfo(uri, country, uptimePct) {
  return {
    uri,
    host: extractHost(uri),
    port: extractPort(uri),
    country,
    uptimePct,
    latencyMs: null,
    distanceKm: null,
    lat: null,
    lon: null,
    score: 0,
    alive: false,
    lastChecked: 0
  };
}
async function fetchSelfGeo() {
  const data = await httpGet(GEO_SELF_URL, GEO_TIMEOUT_MS);
  if (!data) return null;
  try {
    const j = JSON.parse(data);
    if (typeof j.lat === "number" && typeof j.lon === "number") {
      return { lat: j.lat, lon: j.lon, countryCode: j.countryCode ?? "" };
    }
  } catch {
  }
  return null;
}
async function geolocatePeers(peers) {
  if (!selfGeo) return;
  const hostToIp = /* @__PURE__ */ new Map();
  const hostsToResolve = [
    ...new Set(peers.map((p) => p.host).filter((h) => !isIPv4(h) && !isIPv6(h)))
  ];
  await Promise.allSettled(
    hostsToResolve.map(async (host) => {
      try {
        const addr = await dns.promises.lookup(host, { family: 4 });
        hostToIp.set(host, addr.address);
      } catch {
        hostToIp.set(host, host);
      }
    })
  );
  const peerToIp = /* @__PURE__ */ new Map();
  const uniqueIps = [];
  for (const peer of peers) {
    if (isIPv6(peer.host)) continue;
    const ip = isIPv4(peer.host) ? peer.host : hostToIp.get(peer.host) ?? peer.host;
    peerToIp.set(peer.uri, ip);
    if (!uniqueIps.includes(ip)) uniqueIps.push(ip);
  }
  const geoByIp = /* @__PURE__ */ new Map();
  for (let i = 0; i < uniqueIps.length; i += 100) {
    const batch = uniqueIps.slice(i, i + 100);
    const body = JSON.stringify(batch.map((q) => ({ query: q, fields: "lat,lon,query" })));
    const resp = await httpPost(GEO_BATCH_URL, body, GEO_TIMEOUT_MS);
    if (!resp) continue;
    try {
      const arr = JSON.parse(resp);
      for (const e of arr) {
        if (typeof e.lat === "number" && typeof e.lon === "number") {
          geoByIp.set(e.query, { lat: e.lat, lon: e.lon });
        }
      }
    } catch {
    }
  }
  let geolocated = 0;
  for (const peer of peers) {
    const ip = peerToIp.get(peer.uri);
    if (!ip) continue;
    const geo = geoByIp.get(ip);
    if (geo) {
      peer.lat = geo.lat;
      peer.lon = geo.lon;
      if (selfGeo) {
        peer.distanceKm = haversineKm(selfGeo.lat, selfGeo.lon, geo.lat, geo.lon);
      }
      geolocated++;
    }
  }
  info(`Geolocation: ${geolocated}/${peers.length} peers with distance`, void 0, "peers");
}
async function probePeersLatency(peers) {
  for (let i = 0; i < peers.length; i += PROBE_BATCH_SIZE) {
    const batch = peers.slice(i, i + PROBE_BATCH_SIZE);
    await Promise.all(batch.map(async (peer) => {
      const { alive: alive2, latencyMs } = await probePeerLatency(peer.uri);
      peer.alive = alive2;
      peer.latencyMs = alive2 ? latencyMs : null;
      peer.lastChecked = Date.now();
    }));
  }
  const alive = peers.filter((p) => p.alive).length;
  info(`Latency: ${alive}/${peers.length} peers reachable`, void 0, "peers");
}
async function probePeerLatency(uri) {
  const m = /^(?:tcp|tls):\/\/(\[([^\]]+)\]|([^/:?]+)):(\d+)/.exec(uri);
  if (!m) return { alive: false, latencyMs: 0 };
  const host = m[2] ?? m[3] ?? "";
  const port = parseInt(m[4] ?? "0", 10);
  const t0 = Date.now();
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const done = (alive) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve({ alive, latencyMs: Date.now() - t0 });
    };
    sock.setTimeout(PROBE_TIMEOUT_MS);
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.once("timeout", () => done(false));
    sock.connect(port, host);
  });
}
function computeScore$1(peer, geo) {
  let geoScore = 20;
  let latencyScore = 20;
  if (geo != null && peer.distanceKm != null) {
    geoScore = Math.max(0, 1 - peer.distanceKm / MAX_GEO_DISTANCE_KM) * 40;
  }
  if (peer.latencyMs != null) {
    latencyScore = Math.max(0, 1 - peer.latencyMs / PROBE_TIMEOUT_MS) * 40;
  }
  const uptimeScore = peer.uptimePct / 100 * 20;
  return geoScore + latencyScore + uptimeScore;
}
function getCachePath(dir) {
  return path.join(dir, "peer-cache.json");
}
function loadCache(dir) {
  const p = getCachePath(dir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
function saveCache(dir, cache) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getCachePath(dir), JSON.stringify(cache, null, 2), "utf8");
  } catch (e) {
    warn("Failed to save peer cache", e, "peers");
  }
}
function httpGet(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (c) => {
        data += c.toString();
      });
      res.on("end", () => resolve(data));
      res.on("error", () => resolve(null));
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}
function httpPost(url, body, timeoutMs) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || "443",
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: timeoutMs
    }, (res) => {
      let data = "";
      res.on("data", (c) => {
        data += c.toString();
      });
      res.on("end", () => resolve(data));
      res.on("error", () => resolve(null));
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
function toRad(deg) {
  return deg * (Math.PI / 180);
}
function extractHost(uri) {
  const m = /^(?:tcp|tls):\/\/(?:\[([^\]]+)\]|([^/:?[\]]+))/.exec(uri);
  return m ? m[1] ?? m[2] ?? "" : "";
}
function extractPort(uri) {
  const withoutPrefix = uri.replace(/^(?:tcp|tls):\/\/(?:\[[^\]]+\]|[^/:?[\]]+)/, "");
  const m = /^:(\d+)/.exec(withoutPrefix);
  return m ? parseInt(m[1], 10) : 0;
}
function isIPv4(s) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(s);
}
function isIPv6(s) {
  return s.includes(":") && /^[0-9a-f:]+$/i.test(s);
}
const SOCKS_HOST = "127.0.0.1";
const SOCKS_PORT = 9050;
const APP_P2P_PORT = 50005;
const YGG_IPV6_REGEX = /\b((?:2[0-9a-f]{2}|3[0-9a-f]{2}):[0-9a-f:]{4,}(?::[0-9a-f]{0,4}){1,6})\b/i;
let yggstackProcess = null;
let detectedAddress = null;
let currentConfPath = null;
let isQuitting = false;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 8;
const RESTART_BASE_DELAY_MS = 3e3;
const addressCallbacks = [];
const statusCallbacks = [];
function emitStatus(status, address) {
  statusCallbacks.forEach((cb) => cb(status, address));
}
function onYggstackAddress(cb) {
  addressCallbacks.push(cb);
  if (detectedAddress) cb(detectedAddress);
}
function onYggstackStatus(cb) {
  statusCallbacks.push(cb);
}
function getYggstackAddress() {
  return detectedAddress;
}
function getRestartAttempts() {
  return restartAttempts;
}
function getMaxRestartAttempts() {
  return MAX_RESTART_ATTEMPTS;
}
async function forceRestart() {
  if (yggstackProcess) {
    info("forceRestart: process already running, ignoring", void 0, "yggstack");
    return;
  }
  info("forceRestart: restarting by user request…", void 0, "yggstack");
  restartAttempts = 0;
  isQuitting = false;
  try {
    await spawnYggstack();
  } catch (err) {
    error("forceRestart: error starting process", err, "yggstack");
    scheduleRestart();
  }
}
function resolveYggstackPath() {
  const platformFolder = `${process.platform}-${process.arch}`;
  const exeName = process.platform === "win32" ? "yggstack.exe" : "yggstack";
  const resourcesBasePath = app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(app.getAppPath(), "resources", "bin");
  return path.join(resourcesBasePath, platformFolder, exeName);
}
function updatePeersInConfig(confPath, peers) {
  if (!fs.existsSync(confPath)) return;
  const peersHjson = peers.map((p) => `    "${p}"`).join("\n");
  let conf = fs.readFileSync(confPath, "utf8");
  conf = conf.replace(/(Peers:\s*\[)([\s\S]*?)(\])/, `$1
${peersHjson}
  $3`);
  fs.writeFileSync(confPath, conf, "utf8");
  info(`Peers updated in config (${peers.length} nodes) — effective on next restart`, void 0, "yggstack");
}
async function ensureConfig(yggstackPath) {
  const userDataPath = app.getPath("userData");
  const confPath = path.join(userDataPath, "yggstack.conf");
  currentConfPath = confPath;
  const peers = await initPeerManager(userDataPath);
  const peersHjson = peers.map((p) => `    "${p}"`).join("\n");
  setOnPeersChanged((newPeers) => {
    if (currentConfPath) updatePeersInConfig(currentConfPath, newPeers);
  });
  if (fs.existsSync(confPath)) {
    info(`Updating peers in existing config: ${confPath}`, void 0, "yggstack");
    let conf2 = fs.readFileSync(confPath, "utf8");
    conf2 = conf2.replace(
      /(Peers:\s*\[)([\s\S]*?)(\])/,
      `$1
${peersHjson}
  $3`
    );
    fs.writeFileSync(confPath, conf2, "utf8");
    return confPath;
  }
  info("Generating initial configuration…", void 0, "yggstack");
  const genconf = await new Promise((resolve, reject) => {
    exec(`"${yggstackPath}" -genconf`, { encoding: "utf8" }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
  let conf = genconf.replace(
    /(Peers:\s*\[)([\s\S]*?)(\])/,
    `$1
${peersHjson}
  $3`
  );
  conf = conf.replace(/AdminListen:\s*.*/, "AdminListen: none");
  fs.writeFileSync(confPath, conf, "utf8");
  info(`Config saved to: ${confPath}`, void 0, "yggstack");
  return confPath;
}
async function spawnYggstack() {
  var _a2, _b2;
  if (yggstackProcess) {
    info("Process already running, skipping spawn", void 0, "yggstack");
    return;
  }
  const yggstackPath = resolveYggstackPath();
  if (!fs.existsSync(yggstackPath)) {
    throw new Error(
      `[yggstack] Binario no encontrado en: ${yggstackPath}
Ejecuta 'node scripts/download-yggstack.mjs' para descargarlo.`
    );
  }
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(yggstackPath, 493);
    } catch (e) {
      warn("Could not apply chmod to binary", e, "yggstack");
    }
  }
  const confPath = await ensureConfig(yggstackPath);
  info("Starting yggstack user-space sidecar", { path: yggstackPath, config: confPath, socks: `${SOCKS_HOST}:${SOCKS_PORT}` }, "yggstack");
  yggstackProcess = spawn(
    yggstackPath,
    [
      "-useconffile",
      confPath,
      "-socks",
      `${SOCKS_HOST}:${SOCKS_PORT}`,
      "-remote-tcp",
      `${APP_P2P_PORT}`
    ],
    {
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  if (!yggstackProcess.pid) {
    yggstackProcess = null;
    throw new Error("[yggstack] El sistema operativo no pudo crear el proceso sidecar.");
  }
  info(`Process started with PID: ${yggstackProcess.pid}`, void 0, "yggstack");
  emitStatus("connecting");
  (_a2 = yggstackProcess.stdout) == null ? void 0 : _a2.on("data", (chunk) => {
    const line = chunk.toString();
    process.stdout.write(`[yggstack] ${line}`);
    tryExtractAddress(line);
  });
  (_b2 = yggstackProcess.stderr) == null ? void 0 : _b2.on("data", (chunk) => {
    const line = chunk.toString();
    process.stderr.write(`[yggstack:err] ${line}`);
    tryExtractAddress(line);
  });
  yggstackProcess.on("exit", (code, signal) => {
    if (isQuitting) {
      info("Sidecar stopped intentionally", void 0, "yggstack");
      yggstackProcess = null;
      return;
    }
    warn(`Process terminated unexpectedly. Code: ${code ?? "N/A"}, Signal: ${signal ?? "N/A"}`, void 0, "yggstack");
    yggstackProcess = null;
    detectedAddress = null;
    emitStatus("down");
    scheduleRestart();
  });
  yggstackProcess.on("error", (err) => {
    error("Sidecar process error", err.message, "yggstack");
    if (!isQuitting) {
      yggstackProcess = null;
      detectedAddress = null;
      emitStatus("down");
      scheduleRestart();
    }
  });
}
function scheduleRestart() {
  if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
    error(`Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Yggdrasil network unavailable`, void 0, "yggstack");
    emitStatus("down");
    return;
  }
  restartAttempts++;
  const delayMs = Math.min(RESTART_BASE_DELAY_MS * 2 ** (restartAttempts - 1), 6 * 6e4);
  info(`Retry ${restartAttempts}/${MAX_RESTART_ATTEMPTS} in ${Math.round(delayMs / 1e3)} s…`, void 0, "yggstack");
  emitStatus("reconnecting");
  setTimeout(async () => {
    if (isQuitting) return;
    try {
      await spawnYggstack();
    } catch (err) {
      error("Error in automatic restart", err, "yggstack");
      scheduleRestart();
    }
  }, delayMs);
}
function stopYggstack() {
  if (!yggstackProcess) {
    info("stopYggstack: no active process to stop", void 0, "yggstack");
    return;
  }
  const pid = yggstackProcess.pid;
  info(`Stopping sidecar (PID: ${pid})…`, void 0, "yggstack");
  isQuitting = true;
  restartAttempts = 0;
  const proc = yggstackProcess;
  yggstackProcess = null;
  detectedAddress = null;
  currentConfPath = null;
  stopPeerManager();
  const forceKillTimer = setTimeout(() => {
    warn("Process did not respond to SIGTERM → forcing SIGKILL…", void 0, "yggstack");
    try {
      proc.kill("SIGKILL");
    } catch {
    }
  }, 3e3);
  proc.once("exit", () => {
    clearTimeout(forceKillTimer);
    info("Sidecar stopped correctly", void 0, "yggstack");
  });
  try {
    proc.kill("SIGTERM");
  } catch (err) {
    error("Error sending SIGTERM", err, "yggstack");
    clearTimeout(forceKillTimer);
  }
}
function tryExtractAddress(text2) {
  if (detectedAddress) return;
  const match = YGG_IPV6_REGEX.exec(text2);
  if (match) {
    detectedAddress = match[1];
    restartAttempts = 0;
    info(`Yggdrasil IPv6 address assigned: ${detectedAddress}`, void 0, "yggstack");
    addressCallbacks.forEach((cb) => cb(detectedAddress));
    emitStatus("up", detectedAddress);
  }
}
const DAY_MS = 24 * 60 * 60 * 1e3;
const LOCATION_BLOCK_TTL_MS = 30 * DAY_MS;
const LOCATION_BLOCK_TTL_MAX = 60 * DAY_MS;
const LOCATION_BLOCK_REFRESH_MS = 1 * DAY_MS;
const RENEWAL_TOKEN_ALLOWED_UNTIL_MS = 60 * DAY_MS;
const AUTO_RENEW_THRESHOLD_MS = 3 * DAY_MS;
function canonicalStringify(obj) {
  const allKeys = Object.keys(obj).sort();
  return JSON.stringify(obj, allKeys);
}
function generateSignedLocationBlock(address, dhtSeq2, ttlMs, renewalToken) {
  const ttl = ttlMs ?? LOCATION_BLOCK_TTL_MS;
  const cappedTtl = Math.min(ttl, LOCATION_BLOCK_TTL_MAX);
  const expiresAt = Date.now() + cappedTtl;
  const finalRenewalToken = renewalToken || generateRenewalToken(getMyUPeerId(), 3);
  const data = { upeerId: getMyUPeerId(), address, dhtSeq: dhtSeq2, expiresAt };
  const sig = sign(Buffer.from(canonicalStringify(data))).toString("hex");
  return { address, dhtSeq: dhtSeq2, expiresAt, signature: sig, renewalToken: finalRenewalToken, alias: getMyAlias() || void 0 };
}
function verifyLocationBlock(upeerId2, block, publicKeyHex) {
  if (block.expiresAt !== void 0 && block.expiresAt < Date.now()) {
    if (block.renewalToken && canRenewLocationBlock(block, publicKeyHex)) {
      return true;
    }
    return false;
  }
  if (block.expiresAt !== void 0) {
    const dataWithExpires = { upeerId: upeerId2, address: block.address, dhtSeq: block.dhtSeq, expiresAt: block.expiresAt };
    const validWithExpires = verify(
      Buffer.from(canonicalStringify(dataWithExpires)),
      Buffer.from(block.signature, "hex"),
      Buffer.from(publicKeyHex, "hex")
    );
    if (validWithExpires) {
      if (block.expiresAt < Date.now()) {
        return false;
      }
      if (block.renewalToken) {
        if (!verifyRenewalToken(block.renewalToken, publicKeyHex)) {
          return false;
        }
      }
      return true;
    }
  }
  const dataWithoutExpires = { upeerId: upeerId2, address: block.address, dhtSeq: block.dhtSeq };
  const validWithoutExpires = verify(
    Buffer.from(canonicalStringify(dataWithoutExpires)),
    Buffer.from(block.signature, "hex"),
    Buffer.from(publicKeyHex, "hex")
  );
  if (validWithoutExpires && block.expiresAt !== void 0) {
    if (block.expiresAt < Date.now()) {
      return false;
    }
    if (block.renewalToken) {
      if (!verifyRenewalToken(block.renewalToken, publicKeyHex)) {
        return false;
      }
    }
  }
  return validWithoutExpires;
}
async function verifyLocationBlockWithDHT(upeerId2, block, publicKeyHex) {
  if (block.expiresAt !== void 0 && block.expiresAt < Date.now()) {
    if (block.renewalToken && verifyRenewalToken(block.renewalToken, publicKeyHex)) {
      return true;
    }
    const dhtToken = await findRenewalTokenInDHT(upeerId2);
    if (dhtToken && verifyRenewalToken(dhtToken, publicKeyHex)) {
      return true;
    }
    return false;
  }
  if (block.expiresAt !== void 0) {
    const dataWithExpires = { upeerId: upeerId2, address: block.address, dhtSeq: block.dhtSeq, expiresAt: block.expiresAt };
    const validWithExpires = verify(
      Buffer.from(canonicalStringify(dataWithExpires)),
      Buffer.from(block.signature, "hex"),
      Buffer.from(publicKeyHex, "hex")
    );
    if (validWithExpires) {
      if (block.expiresAt < Date.now()) {
        return false;
      }
      if (block.renewalToken) {
        if (!verifyRenewalToken(block.renewalToken, publicKeyHex)) {
          return false;
        }
      }
      return true;
    }
  }
  const dataWithoutExpires = { upeerId: upeerId2, address: block.address, dhtSeq: block.dhtSeq };
  const validWithoutExpires = verify(
    Buffer.from(canonicalStringify(dataWithoutExpires)),
    Buffer.from(block.signature, "hex"),
    Buffer.from(publicKeyHex, "hex")
  );
  if (validWithoutExpires && block.expiresAt !== void 0) {
    if (block.expiresAt < Date.now()) {
      return false;
    }
    if (block.renewalToken) {
      if (!verifyRenewalToken(block.renewalToken, publicKeyHex)) {
        return false;
      }
    }
  }
  return validWithoutExpires;
}
function generateRenewalToken(targetId, maxRenewals = 3) {
  const allowedUntil = Date.now() + RENEWAL_TOKEN_ALLOWED_UNTIL_MS;
  const signedData = { targetId, allowedUntil, maxRenewals };
  const signature = sign(Buffer.from(canonicalStringify(signedData))).toString("hex");
  return { targetId, allowedUntil, maxRenewals, renewalsUsed: 0, signature };
}
function canRenewLocationBlock(block, publicKeyHex) {
  if (!block.renewalToken) return false;
  const now = Date.now();
  const expiresAt = block.expiresAt || now;
  const timeUntilExpiry = expiresAt - now;
  if (timeUntilExpiry > AUTO_RENEW_THRESHOLD_MS && timeUntilExpiry > 0) {
    return false;
  }
  return verifyRenewalToken(block.renewalToken, publicKeyHex);
}
function renewLocationBlock(block, publicKeyHex) {
  if (!canRenewLocationBlock(block, publicKeyHex) || !block.renewalToken) {
    return null;
  }
  const renewedToken = {
    ...block.renewalToken,
    renewalsUsed: (block.renewalToken.renewalsUsed || 0) + 1
  };
  const renewedBlock = {
    address: block.address,
    dhtSeq: block.dhtSeq,
    // Conservar expiresAt original (está dentro de la firma del bloque).
    // Si es undefined (bloque antiguo sin expiresAt firmado), usar 0 como
    // fallback: 0 = muy expirado → verifyLocationBlock activará el atajo
    // de renewalToken en lugar del camino normal de verificación de firma.
    expiresAt: block.expiresAt ?? 0,
    signature: block.signature,
    renewalToken: renewedToken
  };
  return renewedBlock;
}
function verifyRenewalToken(token, publicKeyHex) {
  if (token.allowedUntil < Date.now()) {
    return false;
  }
  if (token.renewalsUsed >= token.maxRenewals) {
    return false;
  }
  const { signature, renewalsUsed, ...signedData } = token;
  const isValid = verify(
    Buffer.from(canonicalStringify(signedData)),
    Buffer.from(signature, "hex"),
    Buffer.from(publicKeyHex, "hex")
  );
  return isValid;
}
function generateSignedLocationBlockWithRenewal(address, dhtSeq2, ttlMs, renewalToken) {
  const ttl = ttlMs ?? LOCATION_BLOCK_TTL_MS;
  const cappedTtl = Math.min(ttl, LOCATION_BLOCK_TTL_MAX);
  const expiresAt = Date.now() + cappedTtl;
  const data = { upeerId: getMyUPeerId(), address, dhtSeq: dhtSeq2, expiresAt };
  const sig = sign(Buffer.from(canonicalStringify(data))).toString("hex");
  return { address, dhtSeq: dhtSeq2, expiresAt, renewalToken, signature: sig };
}
const MAX_DHT_SEQ_JUMP = 1e3;
function validateDhtSequence(currentSeq, newSeq) {
  if (newSeq <= currentSeq) {
    return { valid: false, requiresPoW: false, reason: "Sequence not increasing" };
  }
  const jump = newSeq - currentSeq;
  if (jump > MAX_DHT_SEQ_JUMP) {
    return { valid: false, requiresPoW: true, reason: `Sequence jump too large: ${jump} > ${MAX_DHT_SEQ_JUMP}` };
  }
  return { valid: true, requiresPoW: false };
}
function getNetworkAddress() {
  const yggAddr = getYggstackAddress();
  if (yggAddr) return yggAddr;
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    if (name.includes("ygg") || name === "utun2" || name === "tun0") {
      for (const net2 of interfaces[name] || []) {
        const family = net2.family;
        const isIPv62 = family === "IPv6" || family === 6;
        if (isIPv62 && (net2.address.startsWith("200:") || net2.address.startsWith("201:"))) {
          return net2.address;
        }
      }
    }
  }
  return null;
}
function createRenewalTokenKey(targetId, signaturePrefix) {
  const hash = crypto$1.createHash("sha256");
  const sigPart = signaturePrefix ? signaturePrefix.substring(0, 16) : "";
  hash.update(`renewal:${targetId}:${sigPart}`);
  return hash.digest();
}
async function storeRenewalTokenInDHT(token) {
  const kademlia2 = getKademliaInstance();
  if (!kademlia2) {
    warn("Kademlia DHT not available for storing renewal token", {}, "dht-renewal");
    return false;
  }
  const key = createRenewalTokenKey(token.targetId, token.signature);
  try {
    await kademlia2.storeValue(key, token, token.targetId, token.signature);
    network("Stored renewal token in DHT", void 0, { targetId: token.targetId }, "dht-renewal");
    return true;
  } catch (err) {
    error("Failed to store renewal token in DHT", err, "dht-renewal");
    return false;
  }
}
async function findRenewalTokenInDHT(targetId, tokenSignature) {
  const kademlia2 = getKademliaInstance();
  if (!kademlia2) {
    warn("Kademlia DHT not available for finding renewal token", {}, "dht-renewal");
    return null;
  }
  const key = createRenewalTokenKey(targetId, tokenSignature || "");
  try {
    const result = await kademlia2.findValue(key);
    if (result && result.value) {
      network("Found renewal token in DHT", void 0, { targetId }, "dht-renewal");
      return result.value;
    }
  } catch (err) {
    error("Failed to find renewal token in DHT", err, "dht-renewal");
  }
  return null;
}
async function canRenewLocationBlockWithDHT(block, publicKeyHex, targetId) {
  if (block.renewalToken) {
    return verifyRenewalToken(block.renewalToken, publicKeyHex);
  }
  const token = await findRenewalTokenInDHT(targetId);
  if (!token) {
    return false;
  }
  return verifyRenewalToken(token, publicKeyHex);
}
async function renewLocationBlockWithDHT(block, publicKeyHex, targetId) {
  if (block.renewalToken && verifyRenewalToken(block.renewalToken, publicKeyHex)) {
    return renewLocationBlock(block, publicKeyHex);
  }
  const token = await findRenewalTokenInDHT(targetId);
  if (!token) {
    return null;
  }
  if (!verifyRenewalToken(token, publicKeyHex)) {
    return null;
  }
  const renewedToken = {
    ...token,
    renewalsUsed: (token.renewalsUsed || 0) + 1
  };
  const renewedBlock = {
    address: block.address,
    dhtSeq: block.dhtSeq,
    expiresAt: block.expiresAt ?? 0,
    // Conservar expiresAt original (ver renewLocationBlock)
    signature: block.signature,
    renewalToken: renewedToken
  };
  return renewedBlock;
}
const utils = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AUTO_RENEW_THRESHOLD_MS,
  LOCATION_BLOCK_REFRESH_MS,
  LOCATION_BLOCK_TTL_MAX,
  LOCATION_BLOCK_TTL_MS,
  MAX_DHT_SEQ_JUMP,
  RENEWAL_TOKEN_ALLOWED_UNTIL_MS,
  canRenewLocationBlock,
  canRenewLocationBlockWithDHT,
  canonicalStringify,
  createRenewalTokenKey,
  findRenewalTokenInDHT,
  generateRenewalToken,
  generateSignedLocationBlock,
  generateSignedLocationBlockWithRenewal,
  getNetworkAddress,
  renewLocationBlock,
  renewLocationBlockWithDHT,
  storeRenewalTokenInDHT,
  validateDhtSequence,
  verifyLocationBlock,
  verifyLocationBlockWithDHT,
  verifyRenewalToken
}, Symbol.toStringTag, { value: "Module" }));
async function handleDhtPacket(type, data, senderRevelnestId, senderAddress, win, sendResponse) {
  const kademlia2 = getKademliaInstance();
  if (!kademlia2) return false;
  try {
    if (type === "DHT_UPDATE") {
      await handleLegacyDhtUpdate(senderRevelnestId, data, win);
      return true;
    }
    if (type === "DHT_EXCHANGE") {
      await handleLegacyDhtExchange(senderRevelnestId, data);
      return true;
    }
    if (type === "DHT_QUERY") {
      await handleLegacyDhtQuery(senderRevelnestId, data, senderAddress, sendResponse);
      return true;
    }
    if (type === "DHT_RESPONSE") {
      await handleLegacyDhtResponse(senderRevelnestId, data, sendResponse);
      return true;
    }
    if (type.startsWith("DHT_")) {
      const response = await kademlia2.handleMessage(senderRevelnestId, data, senderAddress);
      if (response) {
        sendResponse(senderAddress, response);
      }
      return true;
    }
  } catch (err) {
    error(`Error handling ${type}`, err, "dht");
  }
  return false;
}
async function handleLegacyDhtUpdate(senderRevelnestId, data, win) {
  const block = data.locationBlock;
  if (!block || typeof block.dhtSeq !== "number" || !block.address || !block.signature) return;
  const contact = await getContactByRevelnestId(senderRevelnestId);
  if (!contact || !contact.publicKey) return;
  const isValid = await verifyLocationBlockWithDHT(senderRevelnestId, block, contact.publicKey);
  if (!isValid) {
    security("Invalid DHT_UPDATE signature", { upeerId: senderRevelnestId }, "dht");
    return;
  }
  const currentSeq = contact.dhtSeq || 0;
  const seqValidation = validateDhtSequence(currentSeq, block.dhtSeq);
  if (!seqValidation.valid) {
    if (seqValidation.requiresPoW) {
      security("Large sequence jump, PoW required", { upeerId: senderRevelnestId, jump: block.dhtSeq - currentSeq }, "dht");
      return;
    } else {
      security("Invalid sequence", { upeerId: senderRevelnestId, reason: seqValidation.reason }, "dht");
      return;
    }
  }
  network("Updating location (legacy)", void 0, { upeerId: senderRevelnestId, address: block.address, dhtSeq: block.dhtSeq }, "dht-legacy");
  updateContactDhtLocation(senderRevelnestId, block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);
  if (block.renewalToken) {
    storeRenewalTokenInDHT(block.renewalToken).catch((err) => {
      error("Failed to store renewal token in DHT", err, "dht-renewal");
    });
  }
  if (block.renewalToken) {
    network("Received renewal token", void 0, { targetId: senderRevelnestId }, "dht-renewal");
  }
  const kademlia2 = getKademliaInstance();
  if (kademlia2) {
    await kademlia2.storeLocationBlock(senderRevelnestId, block);
  }
}
async function handleLegacyDhtExchange(senderRevelnestId, data) {
  if (!Array.isArray(data.peers)) return;
  network("Receiving locations (legacy)", void 0, { upeerId: senderRevelnestId, count: data.peers.length }, "dht-legacy");
  for (const peer of data.peers) {
    if (!peer.upeerId || !peer.publicKey || !peer.locationBlock) continue;
    if (peer.upeerId === senderRevelnestId) continue;
    const existing = await getContactByRevelnestId(peer.upeerId);
    if (!existing) continue;
    const block = peer.locationBlock;
    if (typeof block.dhtSeq !== "number" || !block.address || !block.signature) continue;
    const isValid = await verifyLocationBlockWithDHT(peer.upeerId, block, existing.publicKey);
    if (!isValid) {
      security("Invalid PEEREX signature", { peerId: peer.upeerId }, "dht");
      continue;
    }
    const currentSeq = existing.dhtSeq || 0;
    const seqValidation = validateDhtSequence(currentSeq, block.dhtSeq);
    if (!seqValidation.valid) {
      if (seqValidation.requiresPoW) {
        security("Large sequence jump, PoW required", { peerId: peer.upeerId, jump: block.dhtSeq - currentSeq }, "dht");
        continue;
      } else {
        security("Invalid sequence", { peerId: peer.upeerId, reason: seqValidation.reason }, "dht");
        continue;
      }
    }
    let finalBlock = block;
    let finalRenewalToken = block.renewalToken;
    if (existing.publicKey && canRenewLocationBlock(block, existing.publicKey)) {
      const renewed = renewLocationBlock(block, existing.publicKey);
      if (renewed) {
        finalBlock = renewed;
        finalRenewalToken = renewed.renewalToken;
        network(
          "Renewed location block via DHT exchange",
          void 0,
          { peerId: peer.upeerId, renewalsUsed: finalRenewalToken.renewalsUsed },
          "dht-renewal"
        );
      }
    }
    updateContactDhtLocation(peer.upeerId, finalBlock.address, finalBlock.dhtSeq, finalBlock.signature, finalBlock.expiresAt, finalRenewalToken);
    if (finalRenewalToken) {
      storeRenewalTokenInDHT(finalRenewalToken).catch((err) => {
        error("Failed to store renewal token in DHT", err, "dht-renewal");
      });
    }
    if (finalRenewalToken) {
      network("Received renewal token via exchange", void 0, { peerId: peer.upeerId }, "dht-renewal");
    }
  }
}
async function handleLegacyDhtQuery(senderRevelnestId, data, fromAddress, sendResponse) {
  network("Searching for target (legacy)", void 0, {
    requester: senderRevelnestId,
    target: data.targetId,
    referralContext: data.referralContext
  }, "dht-legacy");
  const target = await getContactByRevelnestId(data.targetId);
  let responseData = { type: "DHT_RESPONSE", targetId: data.targetId };
  if (target && target.dhtSignature) {
    responseData.locationBlock = {
      address: target.address,
      dhtSeq: target.dhtSeq,
      signature: target.dhtSignature,
      // BUG BP fix: campo Drizzle es dhtExpiresAt, no expiresAt.
      // renewalToken se guarda como JSON string en DB → parsear al leer.
      expiresAt: target.dhtExpiresAt,
      renewalToken: target.renewalToken ? (() => {
        try {
          return JSON.parse(target.renewalToken);
        } catch {
          return void 0;
        }
      })() : void 0
    };
    responseData.publicKey = target.publicKey;
  } else {
    const kademlia2 = getKademliaInstance();
    if (kademlia2) {
      const locationBlock = await kademlia2.findLocationBlock(data.targetId);
      if (locationBlock) {
        responseData.locationBlock = locationBlock;
      }
      if (!responseData.locationBlock) {
        const kInst = kademlia2;
        if (typeof kInst.findClosestContacts === "function") {
          const closest = kInst.findClosestContacts(data.targetId, 5);
          const neighbors = closest.filter((c) => c.upeerId !== senderRevelnestId && c.publicKey).map((c) => ({ upeerId: c.upeerId, address: c.address, publicKey: c.publicKey }));
          if (neighbors.length > 0) responseData.neighbors = neighbors;
        }
      }
    }
  }
  sendResponse(fromAddress, responseData);
}
async function handleLegacyDhtResponse(senderRevelnestId, data, sendResponse) {
  if (data.locationBlock) {
    const block = data.locationBlock;
    const existing = await getContactByRevelnestId(data.targetId);
    if (!existing) return;
    const isValid = await verifyLocationBlockWithDHT(data.targetId, block, existing.publicKey || data.publicKey);
    if (isValid && block.dhtSeq > (existing.dhtSeq || 0)) {
      network("Found new IP (legacy)", void 0, { target: data.targetId, address: block.address }, "dht-legacy");
      let finalBlock = block;
      let finalRenewalToken = block.renewalToken;
      if (existing.publicKey && canRenewLocationBlock(block, existing.publicKey)) {
        const renewed = renewLocationBlock(block, existing.publicKey);
        if (renewed) {
          finalBlock = renewed;
          finalRenewalToken = renewed.renewalToken;
          network(
            "Renewed location block via legacy DHT",
            void 0,
            { targetId: data.targetId, renewalsUsed: finalRenewalToken.renewalsUsed },
            "dht-renewal"
          );
        }
      }
      updateContactDhtLocation(data.targetId, finalBlock.address, finalBlock.dhtSeq, finalBlock.signature, finalBlock.expiresAt, finalRenewalToken);
      if (finalRenewalToken) {
        storeRenewalTokenInDHT(finalRenewalToken).catch((err) => {
          error("Failed to store renewal token in DHT", err, "dht-renewal");
        });
      }
    }
  }
}
async function publishLocationBlock(address, dhtSeq2, signature, renewalToken) {
  const kademlia2 = getKademliaInstance();
  if (!kademlia2) return;
  const locationBlock = { address, dhtSeq: dhtSeq2, signature, renewalToken };
  await kademlia2.storeLocationBlock(kademlia2["upeerId"], locationBlock);
  network("Published location block", void 0, { dhtSeq: dhtSeq2, hasRenewalToken: !!renewalToken }, "kademlia");
}
async function performAutoRenewal() {
  const kademlia2 = getKademliaInstance();
  if (!kademlia2) return;
  const kademliaInstance = kademlia2;
  const store = kademliaInstance.getValueStore();
  if (!store || !store.getAll) return;
  const allValues = store.getAll();
  const now = Date.now();
  const renewalThreshold = 3 * 24 * 60 * 60 * 1e3;
  for (const storedValue of allValues) {
    if (!storedValue.value || !storedValue.value.expiresAt) continue;
    const timeToExpire = storedValue.value.expiresAt - now;
    if (timeToExpire < renewalThreshold && timeToExpire > 0) {
      if (storedValue.value.renewalToken) {
        const token = storedValue.value.renewalToken;
        if (token.allowedUntil > now && token.renewalsUsed < token.maxRenewals) {
          const publisherContact = await getContactByRevelnestId(storedValue.publisher);
          if (!(publisherContact == null ? void 0 : publisherContact.publicKey)) continue;
          if (!verifyRenewalToken(token, publisherContact.publicKey)) {
            security("Auto-renewal rejected: invalid renewal token signature", { publisher: storedValue.publisher }, "dht");
            continue;
          }
          const renewedBlock = { ...storedValue.value };
          renewedBlock.expiresAt = now + 30 * 24 * 60 * 60 * 1e3;
          token.renewalsUsed += 1;
          await kademlia2.storeLocationBlock(storedValue.publisher, renewedBlock);
          network("Auto-renewed location block", void 0, {
            targetId: storedValue.publisher,
            renewalsUsed: token.renewalsUsed
          }, "auto-renewal");
          const contact = await getContactByRevelnestId(storedValue.publisher);
          if (contact) {
            updateContactDhtLocation(
              storedValue.publisher,
              renewedBlock.address,
              renewedBlock.dhtSeq,
              renewedBlock.signature,
              renewedBlock.expiresAt,
              renewedBlock.renewalToken
            );
          }
        }
      }
    }
  }
}
async function findNodeLocation(upeerId2) {
  const kademlia2 = getKademliaInstance();
  if (!kademlia2) return null;
  const locationBlock = await kademlia2.findLocationBlock(upeerId2);
  return (locationBlock == null ? void 0 : locationBlock.address) || null;
}
async function iterativeFindNode(upeerId2, sendMessage) {
  const kademlia2 = getKademliaInstance();
  if (!kademlia2) return null;
  const kademliaInstance = kademlia2;
  const closestContacts = kademliaInstance.findClosestContacts(upeerId2, 3);
  for (const contact of closestContacts) {
    try {
      sendMessage(contact.address, {
        type: "DHT_FIND_NODE",
        targetId: upeerId2
      });
    } catch (error2) {
      warn("Failed to query contact", { contactId: contact.upeerId, error: error2 }, "kademlia");
    }
  }
  return null;
}
async function performDhtMaintenance() {
  const kademlia2 = getKademliaInstance();
  if (kademlia2) {
    kademlia2.performMaintenance();
    try {
      await performAutoRenewal();
    } catch (err) {
      error("Auto-renewal failed", err, "dht");
    }
  }
}
var TransferPhase = /* @__PURE__ */ ((TransferPhase2) => {
  TransferPhase2[TransferPhase2["PROPOSED"] = 0] = "PROPOSED";
  TransferPhase2[TransferPhase2["INITIALIZING"] = 1] = "INITIALIZING";
  TransferPhase2[TransferPhase2["READY"] = 2] = "READY";
  TransferPhase2[TransferPhase2["TRANSFERRING"] = 3] = "TRANSFERRING";
  TransferPhase2[TransferPhase2["VERIFYING"] = 4] = "VERIFYING";
  TransferPhase2[TransferPhase2["COMPLETING"] = 5] = "COMPLETING";
  TransferPhase2[TransferPhase2["DONE"] = 6] = "DONE";
  return TransferPhase2;
})(TransferPhase || {});
const DEFAULT_CONFIG = {
  maxChunkSize: 1024 * 16,
  // 16KB - Safe for TCP
  maxFileSize: 100 * 1024 * 1024,
  // 100MB
  transferTimeout: 3e5,
  maxRetries: 3,
  cleanupInterval: 6e4,
  initialWindowSize: 64,
  // 64 chunks concurrentes en vuelo
  maxWindowSize: 2e3
};
class FileTransferStore {
  constructor() {
    this.transfers = /* @__PURE__ */ new Map();
  }
  createTransfer(data) {
    const fileId = data.fileId || crypto$1.randomUUID();
    const transfer = {
      fileId,
      upeerId: data.upeerId,
      peerAddress: data.peerAddress,
      fileName: data.fileName,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      totalChunks: data.totalChunks,
      chunkSize: data.chunkSize,
      fileHash: data.fileHash,
      thumbnail: data.thumbnail,
      state: "pending",
      phase: TransferPhase.PROPOSED,
      direction: data.direction,
      chunksProcessed: 0,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      pendingChunks: /* @__PURE__ */ new Set(),
      filePath: data.filePath,
      fileBuffer: data.fileBuffer,
      windowSize: 20,
      // initialWindowSize
      ssthresh: 64,
      // slow start threshold
      srtt: 250,
      // smoothed RTT
      rto: 500,
      // initial retransmission timeout
      consecutiveAcks: 0,
      nextChunkIndex: 0
    };
    const key = this.makeKey(fileId, data.direction);
    this.transfers.set(key, transfer);
    return transfer;
  }
  makeKey(fileId, direction) {
    return `${fileId}_${direction}`;
  }
  getTransfer(fileId, direction) {
    return this.transfers.get(this.makeKey(fileId, direction));
  }
  updateTransfer(fileId, direction, updates) {
    const key = this.makeKey(fileId, direction);
    const transfer = this.transfers.get(key);
    if (!transfer) return void 0;
    const updated = { ...transfer, ...updates, lastActivity: Date.now() };
    this.transfers.set(key, updated);
    return updated;
  }
  removeTransfer(fileId, direction) {
    this.transfers.delete(this.makeKey(fileId, direction));
  }
  getAllTransfers() {
    return Array.from(this.transfers.values()).map((transfer) => {
      const cleanTransfer = {};
      for (const key in transfer) {
        if (Object.prototype.hasOwnProperty.call(transfer, key)) {
          if (!key.startsWith("_") && key !== "fileBuffer" && key !== "pendingChunks") {
            cleanTransfer[key] = transfer[key];
          }
        }
      }
      return cleanTransfer;
    });
  }
  clear() {
    this.transfers.clear();
  }
}
class FileChunker {
  constructor(chunkSize = 1024 * 64) {
    this.chunkSize = chunkSize;
  }
  async createTempFile(transfer) {
    if (transfer.direction !== "receiving") {
      throw new Error("Can only create temp files for receiving transfers");
    }
    const tempDir = await fs$1.mkdtemp(path.join(process.env.TMPDIR || "/tmp", "upeer-"));
    transfer.tempPath = path.join(tempDir, transfer.fileId);
    const fd = await fs$1.open(transfer.tempPath, "w");
    try {
      await fd.truncate(transfer.fileSize);
    } finally {
      await fd.close();
    }
  }
  async writeChunk(transfer, chunkData) {
    if (!transfer.tempPath) {
      throw new Error("No temp path for receiving transfer");
    }
    if (chunkData.chunkIndex < 0 || chunkData.chunkIndex >= transfer.totalChunks) {
      throw new Error(`Invalid chunk index: ${chunkData.chunkIndex}`);
    }
    const chunkBuffer = Buffer.from(chunkData.data, "base64");
    const chunkHash = crypto$1.createHash("sha256").update(chunkBuffer).digest("hex");
    if (chunkHash !== chunkData.chunkHash) {
      throw new Error(`Chunk hash mismatch for index ${chunkData.chunkIndex}`);
    }
    const fd = await fs$1.open(transfer.tempPath, "r+");
    try {
      const offset = chunkData.chunkIndex * transfer.chunkSize;
      await fd.write(chunkBuffer, 0, chunkBuffer.length, offset);
    } finally {
      await fd.close();
    }
  }
  async createChunkData(transfer, chunkIndex) {
    if (!transfer.fileBuffer) {
      throw new Error("No file buffer for sending transfer");
    }
    const start = chunkIndex * transfer.chunkSize;
    const end = Math.min(start + transfer.chunkSize, transfer.fileBuffer.length);
    const chunkBuffer = transfer.fileBuffer.slice(start, end);
    const chunkHash = crypto$1.createHash("sha256").update(chunkBuffer).digest("hex");
    return {
      fileId: transfer.fileId,
      chunkIndex,
      totalChunks: transfer.totalChunks,
      data: chunkBuffer.toString("base64"),
      chunkHash
    };
  }
  async readCompleteFile(transfer) {
    if (!transfer.tempPath) {
      throw new Error("No temp path for reading file");
    }
    return await fs$1.readFile(transfer.tempPath);
  }
  async cleanupTempFile(transfer) {
    if (transfer.tempPath) {
      try {
        await fs$1.unlink(transfer.tempPath);
        const tempDir = path.dirname(transfer.tempPath);
        await fs$1.rmdir(tempDir);
      } catch (error2) {
        warn("Error cleaning up temp file", error2, "file-transfer");
      }
    }
  }
  calculateChunks(fileSize, chunkSize) {
    const size = chunkSize || this.chunkSize;
    return Math.ceil(fileSize / size);
  }
  validateChunkIndex(chunkIndex, totalChunks) {
    return chunkIndex >= 0 && chunkIndex < totalChunks;
  }
  getChunkSize() {
    return this.chunkSize;
  }
  setChunkSize(size) {
    if (size <= 0) {
      throw new Error("Chunk size must be positive");
    }
    if (size > 1024 * 1024) {
      throw new Error("Chunk size cannot exceed 1MB");
    }
    this.chunkSize = size;
  }
}
class TransferValidator {
  constructor(maxFileSize = 100 * 1024 * 1024) {
    this.maxFileSize = maxFileSize;
  }
  async validateAndPrepareFile(filePath) {
    await fs$1.access(filePath);
    const stats = await fs$1.stat(filePath);
    if (stats.size > this.maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${this.maxFileSize} bytes)`);
    }
    const fileBuffer = await fs$1.readFile(filePath);
    const fileName = path.basename(filePath);
    const mimeType = this.detectMimeType(fileName);
    const fileHash = crypto$1.createHash("sha256").update(fileBuffer).digest("hex");
    return {
      name: fileName,
      size: stats.size,
      mimeType,
      hash: fileHash,
      buffer: fileBuffer
    };
  }
  validateIncomingFile(data) {
    const requiredFields = ["fileId", "fileName", "fileSize", "mimeType", "totalChunks", "fileHash", "chunkSize"];
    for (const field of requiredFields) {
      if (data[field] === void 0 || data[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(String(data.fileId))) {
      throw new Error("Invalid fileId: must be a UUID");
    }
    if (typeof data.fileSize !== "number" || data.fileSize <= 0) {
      throw new Error("Invalid fileSize");
    }
    if (data.fileSize > this.maxFileSize) {
      throw new Error(`File size exceeds limit: ${data.fileSize} > ${this.maxFileSize}`);
    }
    if (typeof data.totalChunks !== "number" || data.totalChunks <= 0) {
      throw new Error("Invalid totalChunks");
    }
    if (typeof data.chunkSize !== "number" || data.chunkSize <= 0) {
      throw new Error("Invalid chunkSize");
    }
    if (typeof data.fileHash !== "string" || !/^[a-f0-9]{64}$/i.test(data.fileHash)) {
      throw new Error("Invalid fileHash format");
    }
    if (!this.isValidFileName(data.fileName)) {
      throw new Error("Invalid file name");
    }
    if (!this.isValidMimeType(data.mimeType)) {
      throw new Error("Invalid MIME type");
    }
  }
  async verifyFileHash(transfer, expectedHash) {
    if (!transfer.tempPath) {
      throw new Error("No temp file to verify");
    }
    const fileBuffer = await fs$1.readFile(transfer.tempPath);
    const actualHash = crypto$1.createHash("sha256").update(fileBuffer).digest("hex");
    if (actualHash !== expectedHash) {
      throw new Error(`File hash mismatch: expected ${expectedHash.substring(0, 16)}..., got ${actualHash.substring(0, 16)}...`);
    }
  }
  validateChunkData(transfer, chunkData) {
    if (chunkData.fileId !== transfer.fileId) {
      throw new Error("File ID mismatch");
    }
    if (chunkData.chunkIndex < 0 || chunkData.chunkIndex >= transfer.totalChunks) {
      throw new Error(`Invalid chunk index: ${chunkData.chunkIndex}`);
    }
    if (chunkData.totalChunks !== transfer.totalChunks) {
      throw new Error("Total chunks mismatch");
    }
    if (!chunkData.data || typeof chunkData.data !== "string") {
      throw new Error("Invalid chunk data");
    }
    if (!chunkData.chunkHash || typeof chunkData.chunkHash !== "string") {
      throw new Error("Invalid chunk hash");
    }
  }
  detectMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".txt": "text/plain",
      ".pdf": "application/pdf",
      ".zip": "application/zip",
      ".mp3": "audio/mpeg",
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".ppt": "application/vnd.ms-powerpoint",
      ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    };
    return mimeMap[ext] || "application/octet-stream";
  }
  isValidFileName(fileName) {
    if (!fileName || fileName.length > 255) return false;
    if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) return false;
    const dangerousChars = ["<", ">", ":", '"', "|", "?", "*"];
    for (const char of dangerousChars) {
      if (fileName.includes(char)) return false;
    }
    return true;
  }
  isValidMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== "string") return false;
    const parts = mimeType.split("/");
    if (parts.length !== 2) return false;
    const [type, subtype] = parts;
    if (!type || !subtype) return false;
    const allowedTypes = [
      "application",
      "audio",
      "image",
      "text",
      "video",
      "font",
      "model",
      "example",
      "message",
      "multipart"
    ];
    if (!allowedTypes.includes(type)) return false;
    if (!/^[a-z0-9.+*-]+$/i.test(subtype)) return false;
    return true;
  }
  getMaxFileSize() {
    return this.maxFileSize;
  }
  setMaxFileSize(size) {
    if (size <= 0) {
      throw new Error("Max file size must be positive");
    }
    this.maxFileSize = size;
  }
}
function generateTransferKey() {
  return crypto$1.randomBytes(32);
}
function encryptChunk(chunk, key) {
  const iv = crypto$1.randomBytes(12);
  const cipher = crypto$1.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(chunk), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { data: enc.toString("base64"), iv: iv.toString("hex"), tag: tag.toString("hex") };
}
function decryptChunk(data, iv, tag, key) {
  const decipher = crypto$1.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
}
class TransferManager {
  // fileId -> timer
  constructor(config = {}) {
    this.fileHandles = /* @__PURE__ */ new Map();
    this.transferKeys = /* @__PURE__ */ new Map();
    this.retryTimers = /* @__PURE__ */ new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = new FileTransferStore();
    this.chunker = new FileChunker(this.config.maxChunkSize);
    this.validator = new TransferValidator(this.config.maxFileSize);
  }
  initialize(sendFunction, window) {
    this.setSendFunction(sendFunction);
    this.setWindow(window);
  }
  setWindow(window) {
    this.window = window;
  }
  setSendFunction(fn) {
    this.sendFunction = fn;
  }
  // --- PUBLIC API ---
  /**
   * Start sending a file to a peer
   */
  async startSend(upeerId2, address, filePath, thumbnail) {
    try {
      const fileInfo = await this.validator.validateAndPrepareFile(filePath);
      const totalChunks = this.chunker.calculateChunks(fileInfo.size);
      const transfer = this.store.createTransfer({
        upeerId: upeerId2,
        peerAddress: address,
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        mimeType: fileInfo.mimeType,
        totalChunks,
        chunkSize: this.config.maxChunkSize,
        fileHash: fileInfo.hash,
        thumbnail,
        direction: "sending",
        filePath,
        fileBuffer: fileInfo.buffer
      });
      this.store.updateTransfer(transfer.fileId, "sending", { state: "active", phase: TransferPhase.PROPOSED });
      const contact = await getContactByRevelnestId(upeerId2);
      const peerKey = (contact == null ? void 0 : contact.ephemeralPublicKey) || (contact == null ? void 0 : contact.publicKey);
      let encryptedKey;
      let encryptedKeyNonce;
      let useEphemeral = false;
      if (peerKey) {
        const aesKey2 = generateTransferKey();
        this.transferKeys.set(transfer.fileId, aesKey2);
        useEphemeral = !!(contact == null ? void 0 : contact.ephemeralPublicKey);
        const sealed = encrypt(aesKey2, Buffer.from(peerKey, "hex"), useEphemeral);
        encryptedKey = sealed.ciphertext.toString("hex");
        encryptedKeyNonce = sealed.nonce.toString("hex");
      }
      let encThumb;
      const aesKey = this.transferKeys.get(transfer.fileId);
      if (thumbnail && aesKey) {
        encThumb = encryptChunk(Buffer.from(thumbnail.replace(/^data:[^;]+;base64,/, ""), "base64"), aesKey);
      }
      this.send(address, {
        type: "FILE_PROPOSAL",
        fileId: transfer.fileId,
        fileName: transfer.fileName,
        fileSize: transfer.fileSize,
        mimeType: transfer.mimeType,
        totalChunks: transfer.totalChunks,
        chunkSize: transfer.chunkSize,
        fileHash: transfer.fileHash,
        // E2E sealed key
        ...encryptedKey ? { encryptedKey, encryptedKeyNonce, useRecipientEphemeral: useEphemeral } : {},
        // Encrypted thumbnail (optional)
        ...encThumb ? { thumbnail: encThumb } : {}
      });
      this.notifyUIStarted(transfer);
      this.saveToDB(transfer);
      if (aesKey) {
        const staticPeerKey = contact == null ? void 0 : contact.publicKey;
        let vaultEncKey;
        let vaultEncKeyNonce;
        if (staticPeerKey && aesKey) {
          const { encrypt: encStatic } = await Promise.resolve().then(() => identity);
          const vaultSealed = encStatic(aesKey, Buffer.from(staticPeerKey, "hex"), false);
          vaultEncKey = vaultSealed.ciphertext.toString("hex");
          vaultEncKeyNonce = vaultSealed.nonce.toString("hex");
        }
        const proposalData = {
          type: "FILE_PROPOSAL",
          fileId: transfer.fileId,
          fileName: transfer.fileName,
          fileSize: transfer.fileSize,
          mimeType: transfer.mimeType,
          totalChunks: transfer.totalChunks,
          chunkSize: transfer.chunkSize,
          fileHash: transfer.fileHash,
          // Vault version: AES key cifrada con clave estática (no efímera)
          ...vaultEncKey ? { encryptedKey: vaultEncKey, encryptedKeyNonce: vaultEncKeyNonce, useRecipientEphemeral: false } : {},
          ...encThumb ? { thumbnail: encThumb } : {}
          // senderRevelnestId se añade solo en el wrapper externo (no en datos firmados)
        };
        Promise.resolve().then(() => identity).then(({ sign: sign2 }) => {
          Promise.resolve().then(() => utils).then(({ canonicalStringify: canonicalStringify2 }) => {
            import("./manager-DI4fM3Sg.js").then(({ VaultManager }) => {
              const sig = sign2(Buffer.from(canonicalStringify2(proposalData)));
              VaultManager.replicateToVaults(upeerId2, {
                ...proposalData,
                senderRevelnestId: getMyUPeerId(),
                signature: sig.toString("hex")
              });
            });
          });
        }).catch((err) => warn("Failed to vault file proposal", err, "vault"));
        if (transfer.fileBuffer) {
          const encryptedBuffer = this._encryptBuffer(transfer.fileBuffer, aesKey);
          import("./chunk-vault-Ci2RHslI.js").then(({ ChunkVault }) => {
            ChunkVault.replicateFile(transfer.fileHash, encryptedBuffer, upeerId2);
          }).catch((err) => warn("Failed to initiate background file replication", err, "vault"));
        }
      }
      return transfer.fileId;
    } catch (err) {
      error("Error starting file transfer", err, "file-transfer");
      throw err;
    }
  }
  /** AES-256-GCM encrypt a whole buffer (for vault storage) */
  _encryptBuffer(buf, key) {
    const iv = crypto$1.randomBytes(12);
    const cipher = crypto$1.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  }
  /**
   * Cancel a transfer
   */
  cancelTransfer(fileId, reason = "Cancelled by user") {
    const directions = ["sending", "receiving"];
    directions.forEach((dir) => {
      const transfer = this.store.getTransfer(fileId, dir);
      if (transfer && transfer.state === "active") {
        this.store.updateTransfer(fileId, dir, { state: "cancelled" });
        this.send(transfer.peerAddress, { type: "FILE_CANCEL", fileId, reason });
        this.notifyUICancelled(transfer, reason);
        const handle = this.fileHandles.get(fileId);
        if (handle) {
          handle.close().catch(() => {
          });
          this.fileHandles.delete(fileId);
        }
        if (dir === "receiving") {
          this.chunker.cleanupTempFile(transfer).catch(() => {
          });
        }
        this.transferKeys.delete(fileId);
      }
    });
  }
  // --- MESSAGE HANDLERS ---
  async handleMessage(upeerId2, address, data) {
    switch (data.type) {
      case "FILE_PROPOSAL":
        await this.handleProposal(upeerId2, address, data);
        break;
      case "FILE_ACCEPT":
        await this.handleAccept(upeerId2, address, data);
        break;
      case "FILE_CHUNK":
        await this.handleChunk(upeerId2, address, data);
        break;
      case "FILE_CHUNK_ACK":
        await this.handleChunkAck(upeerId2, address, data);
        break;
      case "FILE_DONE_ACK":
        await this.handleDoneAck(upeerId2, address, data);
        break;
      case "FILE_CANCEL":
        await this.handleCancel(upeerId2, address, data);
        break;
    }
  }
  async handleProposal(upeerId2, address, data) {
    var _a2;
    try {
      this.validator.validateIncomingFile(data);
      if (data.encryptedKey && data.encryptedKeyNonce) {
        try {
          const senderContact = await getContactByRevelnestId(upeerId2);
          const senderKey = senderContact == null ? void 0 : senderContact.publicKey;
          if (senderKey) {
            const aesKeyBuf = decrypt(
              Buffer.from(data.encryptedKey, "hex"),
              Buffer.from(data.encryptedKeyNonce, "hex"),
              Buffer.from(senderKey, "hex"),
              !!data.useRecipientEphemeral
            );
            if (aesKeyBuf) this.transferKeys.set(data.fileId, aesKeyBuf);
          }
        } catch {
          warn("Could not decrypt file transfer key", { fileId: data.fileId }, "file-transfer");
        }
      }
      let thumbnail = data.thumbnail;
      const aesKey = this.transferKeys.get(data.fileId);
      if (thumbnail && typeof thumbnail === "object" && thumbnail.iv && aesKey) {
        try {
          const raw = decryptChunk(thumbnail.data, thumbnail.iv, thumbnail.tag, aesKey);
          const mime = ((_a2 = data.mimeType) == null ? void 0 : _a2.startsWith("video")) ? "image/jpeg" : data.mimeType || "image/jpeg";
          thumbnail = `data:${mime};base64,${raw.toString("base64")}`;
        } catch {
          thumbnail = void 0;
        }
      }
      const transfer = this.store.createTransfer({
        fileId: data.fileId,
        upeerId: upeerId2,
        peerAddress: address,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        totalChunks: data.totalChunks,
        chunkSize: data.chunkSize,
        fileHash: data.fileHash || "",
        thumbnail,
        direction: "receiving"
      });
      await this.chunker.createTempFile(transfer);
      this.store.updateTransfer(data.fileId, "receiving", {
        state: "active",
        phase: TransferPhase.READY,
        tempPath: transfer.tempPath
      });
      this.send(address, { type: "FILE_ACCEPT", fileId: data.fileId });
      this.notifyUIStarted(transfer);
      this.saveToDB(transfer);
    } catch (err) {
      error("Error handling file proposal", err, "file-transfer");
      this.send(address, { type: "FILE_CANCEL", fileId: data.fileId, reason: "Rejected by receiver" });
    }
  }
  async handleAccept(upeerId2, address, data) {
    const transfer = this.store.getTransfer(data.fileId, "sending");
    if (!transfer || transfer.phase !== TransferPhase.PROPOSED) return;
    const updatedTransfer = this.store.updateTransfer(data.fileId, "sending", { phase: TransferPhase.TRANSFERRING });
    if (updatedTransfer) this.notifyUIProgress(updatedTransfer);
    this.sendNextChunks(transfer, address);
  }
  async handleChunk(upeerId2, address, data) {
    const transfer = this.store.getTransfer(data.fileId, "receiving");
    if (!transfer || transfer.state !== "active") return;
    if (typeof data.chunkIndex !== "number" || !Number.isInteger(data.chunkIndex) || data.chunkIndex < 0 || data.chunkIndex >= transfer.totalChunks) {
      warn("Invalid chunk index received — dropped", { fileId: data.fileId, chunkIndex: data.chunkIndex }, "file-transfer");
      return;
    }
    try {
      let handle = this.fileHandles.get(transfer.fileId);
      if (!handle && transfer.tempPath) {
        handle = await fs$1.open(transfer.tempPath, "r+");
        this.fileHandles.set(transfer.fileId, handle);
      }
      if (handle) {
        let buffer;
        const aesKey = this.transferKeys.get(data.fileId);
        if (aesKey && data.iv && data.tag) {
          buffer = decryptChunk(data.data, data.iv, data.tag, aesKey);
        } else {
          buffer = Buffer.from(data.data, "base64");
        }
        const offset = data.chunkIndex * transfer.chunkSize;
        await handle.write(buffer, 0, buffer.length, offset);
      }
      transfer.pendingChunks.add(data.chunkIndex);
      const count = transfer.pendingChunks.size;
      const updatedTransfer = this.store.updateTransfer(transfer.fileId, "receiving", {
        chunksProcessed: count,
        phase: TransferPhase.TRANSFERRING
      });
      this.send(address, {
        type: "FILE_CHUNK_ACK",
        fileId: transfer.fileId,
        chunkIndex: data.chunkIndex
      });
      if (updatedTransfer) this.notifyUIProgress(updatedTransfer);
      if (count === transfer.totalChunks && transfer.phase < TransferPhase.VERIFYING) {
        await this.completeReceiver(transfer, address);
      }
    } catch (err) {
      error("Error writing chunk", err, "file-transfer");
    }
  }
  async handleChunkAck(upeerId2, address, data) {
    const transfer = this.store.getTransfer(data.fileId, "sending");
    if (!transfer || transfer.state !== "active") return;
    if (typeof data.chunkIndex !== "number" || !Number.isInteger(data.chunkIndex) || data.chunkIndex < 0 || data.chunkIndex >= transfer.totalChunks) {
      warn("Invalid chunk ACK index — dropped", { fileId: data.fileId, chunkIndex: data.chunkIndex }, "file-transfer");
      return;
    }
    debug("FILE_CHUNK ACK received", { chunkIndex: data.chunkIndex, fileId: data.fileId }, "file-transfer");
    transfer.pendingChunks.add(data.chunkIndex);
    const count = transfer.pendingChunks.size;
    const updatedTransfer = this.store.updateTransfer(transfer.fileId, "sending", {
      chunksProcessed: count
    });
    if (updatedTransfer) {
      const chunksSentTimes = updatedTransfer._chunksSentTimes;
      if (chunksSentTimes && chunksSentTimes.has(data.chunkIndex)) {
        const now = Date.now();
        const rtt = now - chunksSentTimes.get(data.chunkIndex);
        const currentSrtt = updatedTransfer.srtt || 250;
        const newSrtt = Math.floor(0.8 * currentSrtt + 0.2 * rtt);
        const newRto = Math.max(150, Math.min(3e3, newSrtt * 3));
        let newWindowSize = updatedTransfer.windowSize || 64;
        let newSsthresh = updatedTransfer.ssthresh || 128;
        let consecutiveAcks = (updatedTransfer.consecutiveAcks || 0) + 1;
        if (newWindowSize < newSsthresh) {
          newWindowSize += 1;
        } else {
          if (consecutiveAcks >= Math.floor(newWindowSize)) {
            newWindowSize += 1;
            consecutiveAcks = 0;
          }
        }
        newWindowSize = Math.min(newWindowSize, 2e3);
        this.store.updateTransfer(data.fileId, "sending", {
          srtt: newSrtt,
          rto: newRto,
          windowSize: newWindowSize,
          ssthresh: newSsthresh,
          consecutiveAcks
        });
      }
      this.notifyUIProgress(updatedTransfer);
    }
    if (!updatedTransfer) return;
    if (count === transfer.totalChunks && updatedTransfer.phase < TransferPhase.COMPLETING) {
      const updated = this.store.updateTransfer(transfer.fileId, "sending", { phase: TransferPhase.COMPLETING });
      if (updated) this.notifyUIProgress(updated);
    } else if (count < transfer.totalChunks) {
      this.sendNextChunks(updatedTransfer, address);
    }
  }
  async handleDoneAck(upeerId2, address, data) {
    var _a2;
    const transfer = this.store.getTransfer(data.fileId, "sending");
    if (!transfer || transfer.state === "completed") return;
    const timer = this.retryTimers.get(data.fileId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(data.fileId);
    }
    const updated = this.store.updateTransfer(transfer.fileId, "sending", {
      state: "completed",
      phase: TransferPhase.DONE
    });
    if (updated) {
      this.saveToDB(updated);
      this.notifyUIProgress(updated);
      this.notifyUICompleted(updated);
      (_a2 = this.window) == null ? void 0 : _a2.webContents.send("message-delivered", {
        id: updated.fileId,
        // We use fileId as messageId
        upeerId: updated.upeerId
      });
    }
  }
  async handleCancel(upeerId2, address, data) {
    ["sending", "receiving"].forEach(async (dir) => {
      const transfer = this.store.getTransfer(data.fileId, dir);
      if (transfer) {
        const timer = this.retryTimers.get(data.fileId);
        if (timer) {
          clearTimeout(timer);
          this.retryTimers.delete(data.fileId);
        }
        const handle = this.fileHandles.get(data.fileId);
        if (handle) {
          handle.close().catch(() => {
          });
          this.fileHandles.delete(data.fileId);
        }
        if (dir === "receiving") {
          this.chunker.cleanupTempFile(transfer).catch(() => {
          });
        }
        this.transferKeys.delete(data.fileId);
        this.store.updateTransfer(transfer.fileId, dir, { state: "cancelled" });
        this.notifyUICancelled(transfer, data.reason);
        this.saveToDB({ ...transfer, state: "cancelled" });
      }
    });
  }
  // --- INTERNAL HELPERS ---
  async sendNextChunks(transfer, address) {
    const chunksSentTimes = transfer._chunksSentTimes || /* @__PURE__ */ new Map();
    transfer._chunksSentTimes = chunksSentTimes;
    const maxInFlight = Math.floor(transfer.windowSize || 64);
    const now = Date.now();
    const retryTimeout = transfer.rto || 500;
    let inFlight = 0;
    let needsRetransmission = false;
    for (const [chunkIndex, sentAt] of chunksSentTimes.entries()) {
      if (!transfer.pendingChunks.has(chunkIndex)) {
        if (now - sentAt < retryTimeout) {
          inFlight++;
        } else {
          needsRetransmission = true;
        }
      } else {
        chunksSentTimes.delete(chunkIndex);
      }
    }
    if (needsRetransmission) {
      const currentWindow = transfer.windowSize || 20;
      const newSsthresh = Math.max(2, Math.floor(currentWindow / 2));
      debug("FILE transfer congestion detected", { window: currentWindow, newSsthresh, rto: retryTimeout }, "file-transfer");
      this.store.updateTransfer(transfer.fileId, "sending", {
        windowSize: 2,
        // Volver a slow-start agresivo tras pérdida
        ssthresh: newSsthresh,
        consecutiveAcks: 0
      });
    }
    let retransmissionsCount = 0;
    const maxRetransmissionsPerCall = 10;
    for (const [chunkIndex, sentAt] of chunksSentTimes.entries()) {
      if (!transfer.pendingChunks.has(chunkIndex)) {
        if (now - sentAt >= retryTimeout) {
          if (retransmissionsCount < maxRetransmissionsPerCall) {
            chunksSentTimes.set(chunkIndex, now);
            const chunkData = await this.chunker.createChunkData(transfer, chunkIndex);
            debug("Retransmitting chunk", { chunkIndex, fileId: transfer.fileId }, "file-transfer");
            const aesKeyR = this.transferKeys.get(transfer.fileId);
            const encR = aesKeyR ? encryptChunk(Buffer.from(chunkData.data, "base64"), aesKeyR) : { data: chunkData.data, iv: void 0, tag: void 0 };
            this.send(address, { type: "FILE_CHUNK", ...chunkData, ...encR });
            retransmissionsCount++;
          }
        }
      }
    }
    let chunksAdded = 0;
    let currentIndex = transfer.nextChunkIndex || 0;
    while (currentIndex < transfer.totalChunks && inFlight + chunksAdded < maxInFlight) {
      if (!transfer.pendingChunks.has(currentIndex)) {
        if (!chunksSentTimes.has(currentIndex)) {
          chunksSentTimes.set(currentIndex, now);
          chunksAdded++;
          this.store.updateTransfer(transfer.fileId, "sending", {
            nextChunkIndex: currentIndex + 1
          });
          const chunkData = await this.chunker.createChunkData(transfer, currentIndex);
          debug("Sending chunk", { chunkIndex: currentIndex, total: transfer.totalChunks, window: maxInFlight }, "file-transfer");
          const aesKey = this.transferKeys.get(transfer.fileId);
          const enc = aesKey ? encryptChunk(Buffer.from(chunkData.data, "base64"), aesKey) : { data: chunkData.data, iv: void 0, tag: void 0 };
          this.send(address, {
            type: "FILE_CHUNK",
            ...chunkData,
            ...enc
          });
        }
      }
      currentIndex++;
    }
    const unackedCount = transfer.totalChunks - transfer.pendingChunks.size;
    if (unackedCount > 0 && !this.retryTimers.has(transfer.fileId)) {
      const timer = setTimeout(() => {
        this.retryTimers.delete(transfer.fileId);
        const current = this.store.getTransfer(transfer.fileId, "sending");
        if (current && current.state === "active") this.sendNextChunks(current, address);
      }, retryTimeout + 100);
      this.retryTimers.set(transfer.fileId, timer);
    }
  }
  async completeReceiver(transfer, address) {
    if (transfer.state === "completed" || transfer.phase >= TransferPhase.VERIFYING) return;
    try {
      this.store.updateTransfer(transfer.fileId, "receiving", { phase: TransferPhase.VERIFYING });
      if (transfer.fileHash && transfer.tempPath) {
        try {
          await this.validator.verifyFileHash(transfer, transfer.fileHash);
        } catch (hashErr) {
          error("File hash mismatch — transfer rejected", hashErr, "file-transfer");
          this.store.updateTransfer(transfer.fileId, "receiving", { state: "cancelled", phase: TransferPhase.DONE });
          this.send(address, { type: "FILE_CANCEL", fileId: transfer.fileId, reason: "Hash mismatch" });
          this.notifyUICancelled(transfer, "Hash de archivo no coincide — transferencia rechazada");
          this.chunker.cleanupTempFile(transfer).catch(() => {
          });
          return;
        }
      }
      const updated = this.store.updateTransfer(transfer.fileId, "receiving", {
        state: "completed",
        phase: TransferPhase.DONE
      });
      this.send(address, {
        type: "FILE_DONE_ACK",
        fileId: transfer.fileId
      });
      const handle = this.fileHandles.get(transfer.fileId);
      if (handle) {
        await handle.close();
        this.fileHandles.delete(transfer.fileId);
      }
      this.transferKeys.delete(transfer.fileId);
      if (updated) {
        this.saveToDB(updated);
        this.notifyUIProgress(updated);
        this.notifyUICompleted(updated);
      }
      info("File transfer completed", { fileId: transfer.fileId }, "file-transfer");
    } catch (err) {
      error("Error completing receiver", err, "file-transfer");
    }
  }
  send(address, data) {
    if (this.sendFunction) {
      this.sendFunction(address, data);
    }
  }
  saveToDB(transfer) {
    try {
      const myId = getMyUPeerId();
      const isSelf = transfer.upeerId === myId;
      if (isSelf && transfer.direction === "receiving") {
        return;
      }
      saveFileMessage(
        transfer.fileId,
        // Use stable transfer ID to prevent duplicates
        transfer.upeerId,
        transfer.direction === "sending" || isSelf,
        {
          fileName: transfer.fileName,
          fileSize: transfer.fileSize,
          mimeType: transfer.mimeType,
          fileHash: transfer.fileHash,
          tempPath: transfer.tempPath,
          filePath: transfer.filePath,
          direction: transfer.direction,
          transferId: transfer.fileId,
          thumbnail: transfer.thumbnail,
          state: transfer.state
          // Now we include the state in the DB
        },
        void 0,
        isSelf ? "read" : transfer.state === "completed" ? "delivered" : "sent"
      );
    } catch (err) {
      warn("Failed to save file message to DB", err, "file-transfer");
    }
  }
  // --- UI NOTIFICATIONS ---
  notifyUIStarted(transfer) {
    var _a2;
    (_a2 = this.window) == null ? void 0 : _a2.webContents.send("file-transfer-started", this.mapToUI(transfer));
  }
  notifyUIProgress(transfer) {
    var _a2;
    const progress = Number((transfer.chunksProcessed / transfer.totalChunks * 100).toFixed(2));
    const bytesLoaded = transfer.chunksProcessed * transfer.chunkSize;
    (_a2 = this.window) == null ? void 0 : _a2.webContents.send("file-transfer-progress", {
      ...this.mapToUI(transfer),
      progress,
      bytesTransferred: Math.min(bytesLoaded, transfer.fileSize),
      totalBytes: transfer.fileSize,
      chunksTransferred: transfer.chunksProcessed
    });
  }
  notifyUICompleted(transfer) {
    var _a2;
    (_a2 = this.window) == null ? void 0 : _a2.webContents.send("file-transfer-completed", this.mapToUI(transfer));
  }
  notifyUICancelled(transfer, reason) {
    var _a2;
    (_a2 = this.window) == null ? void 0 : _a2.webContents.send("file-transfer-cancelled", { ...this.mapToUI(transfer), reason });
  }
  mapToUI(transfer) {
    return {
      fileId: transfer.fileId,
      upeerId: transfer.upeerId,
      fileName: transfer.fileName,
      fileSize: transfer.fileSize,
      mimeType: transfer.mimeType,
      direction: transfer.direction,
      state: transfer.state,
      phase: transfer.phase,
      chunksProcessed: transfer.chunksProcessed,
      totalChunks: transfer.totalChunks,
      thumbnail: transfer.thumbnail,
      fileHash: transfer.fileHash
    };
  }
  getAllTransfers() {
    return this.store.getAllTransfers();
  }
  getTransfer(fileId, direction) {
    return this.store.getTransfer(fileId, direction);
  }
}
const transferManager = new TransferManager();
class RateLimiter {
  constructor(rules) {
    this.buckets = /* @__PURE__ */ new Map();
    this.rules = rules || this.getDefaultRules();
  }
  getDefaultRules() {
    return {
      // Handshake messages: limited to prevent connection flooding
      "HANDSHAKE_REQ": { windowMs: 6e4, maxTokens: 20, refillRate: 20 / 60 },
      // 20 per minute
      "HANDSHAKE_ACCEPT": { windowMs: 6e4, maxTokens: 20, refillRate: 20 / 60 },
      // Heartbeat messages
      "PING": { windowMs: 1e4, maxTokens: 60, refillRate: 60 / 10 },
      // 60 per 10 seconds
      "PONG": { windowMs: 1e4, maxTokens: 60, refillRate: 60 / 10 },
      // DHT messages: limit queries to prevent amplification attacks
      "DHT_QUERY": { windowMs: 3e4, maxTokens: 20, refillRate: 20 / 30 },
      // 20 per 30 seconds
      "DHT_RESPONSE": { windowMs: 3e4, maxTokens: 40, refillRate: 40 / 30 },
      "DHT_UPDATE": { windowMs: 6e4, maxTokens: 10, refillRate: 10 / 60 },
      // 10 per minute
      "DHT_EXCHANGE": { windowMs: 6e4, maxTokens: 10, refillRate: 10 / 60 },
      // Chat messages: reasonable limits for normal usage
      "CHAT": { windowMs: 6e4, maxTokens: 100, refillRate: 100 / 60 },
      // 100 per minute
      "ACK": { windowMs: 6e4, maxTokens: 200, refillRate: 200 / 60 },
      "READ": { windowMs: 6e4, maxTokens: 200, refillRate: 200 / 60 },
      "TYPING": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      // Social interactions
      "CHAT_CONTACT": { windowMs: 6e4, maxTokens: 20, refillRate: 20 / 60 },
      // BUG CC fix: faltaba regla → ilimitado
      "CHAT_REACTION": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "CHAT_UPDATE": { windowMs: 6e4, maxTokens: 20, refillRate: 20 / 60 },
      "CHAT_DELETE": { windowMs: 6e4, maxTokens: 20, refillRate: 20 / 60 },
      // Kademlia DHT messages
      "DHT_FIND_NODE": { windowMs: 3e4, maxTokens: 30, refillRate: 30 / 30 },
      "DHT_FIND_VALUE": { windowMs: 3e4, maxTokens: 30, refillRate: 30 / 30 },
      "DHT_STORE": { windowMs: 6e4, maxTokens: 10, refillRate: 10 / 60 },
      // Vault messages
      // BUG BH fix: tipos VAULT_* y REPUTATION_* no tenían reglas →
      // la llamada a check() devolvía true incondicionalmente (sin regla = ilimitado).
      // Un peer podía inundar con VAULT_STORE/VAULT_QUERY/REPUTATION_GOSSIP sin límite.
      "VAULT_STORE": { windowMs: 6e4, maxTokens: 30, refillRate: 30 / 60 },
      "VAULT_QUERY": { windowMs: 6e4, maxTokens: 10, refillRate: 10 / 60 },
      "VAULT_DELIVERY": { windowMs: 6e4, maxTokens: 20, refillRate: 20 / 60 },
      "VAULT_ACK": { windowMs: 6e4, maxTokens: 100, refillRate: 100 / 60 },
      "VAULT_RENEW": { windowMs: 6e4, maxTokens: 30, refillRate: 30 / 60 },
      // Reputation gossip
      "REPUTATION_GOSSIP": { windowMs: 6e4, maxTokens: 5, refillRate: 5 / 60 },
      "REPUTATION_REQUEST": { windowMs: 6e4, maxTokens: 10, refillRate: 10 / 60 },
      "REPUTATION_DELIVER": { windowMs: 6e4, maxTokens: 10, refillRate: 10 / 60 },
      // Group messages
      "GROUP_MSG": { windowMs: 6e4, maxTokens: 100, refillRate: 100 / 60 },
      "GROUP_ACK": { windowMs: 6e4, maxTokens: 200, refillRate: 200 / 60 },
      "GROUP_INVITE": { windowMs: 6e4, maxTokens: 5, refillRate: 5 / 60 },
      "GROUP_UPDATE": { windowMs: 6e4, maxTokens: 10, refillRate: 10 / 60 },
      "GROUP_LEAVE": { windowMs: 6e4, maxTokens: 10, refillRate: 10 / 60 },
      // File transfer messages (supporting multiple naming conventions for consistency)
      "FILE_START": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "FILE_PROPOSAL": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "FILE_ACCEPT": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "FILE_CHUNK": { windowMs: 1e3, maxTokens: 5e3, refillRate: 5e3 },
      "FILE_ACK": { windowMs: 1e3, maxTokens: 5e3, refillRate: 5e3 },
      "FILE_CHUNK_ACK": { windowMs: 1e3, maxTokens: 5e3, refillRate: 5e3 },
      "FILE_END": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "FILE_DONE_ACK": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "FILE_CANCEL": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      // BUG DJ fix: SEALED no tenía regla → operaciones DH X25519 ilimitadas por IP.
      // 5000/s es suficiente para transferencias de archivos a máxima velocidad
      // (los FILE_CHUNK más su overhead SEALED) y bloquea floods sin autenticar.
      "SEALED": { windowMs: 1e3, maxTokens: 5e3, refillRate: 5e3 }
    };
  }
  /**
   * Check if a message from given IP and type is allowed
   * Returns true if allowed, false if rate limited
   */
  check(ip, messageType) {
    const rule = this.rules[messageType];
    if (!rule) {
      return true;
    }
    const now = Date.now();
    if (!this.buckets.has(ip)) {
      this.buckets.set(ip, /* @__PURE__ */ new Map());
    }
    const ipBuckets = this.buckets.get(ip);
    if (!ipBuckets.has(messageType)) {
      ipBuckets.set(messageType, {
        tokens: rule.maxTokens,
        lastRefill: now
      });
    }
    const bucket = ipBuckets.get(messageType);
    const elapsedMs = now - bucket.lastRefill;
    if (elapsedMs > 0) {
      const refillTokens = elapsedMs * (rule.refillRate / 1e3);
      bucket.tokens = Math.min(rule.maxTokens, bucket.tokens + refillTokens);
      bucket.lastRefill = now;
    }
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    warn("Rate limited", { ip, messageType, tokens: bucket.tokens.toFixed(2) }, "rate-limiter");
    return false;
  }
  /**
   * Reset rate limits for a specific IP (useful after banning or temporary blocks)
   */
  resetIp(ip) {
    this.buckets.delete(ip);
  }
  /**
   * Get current token count for debugging/monitoring
   */
  getTokenCount(ip, messageType) {
    const ipBuckets = this.buckets.get(ip);
    if (!ipBuckets) return 0;
    const bucket = ipBuckets.get(messageType);
    return bucket ? bucket.tokens : 0;
  }
  /**
   * Clean up old entries to prevent memory leak
   * Should be called periodically (e.g., every hour)
   */
  cleanup(maxAgeMs = 36e5) {
    const now = Date.now();
    const toDelete = [];
    for (const [ip, ipBuckets] of this.buckets.entries()) {
      let hasActivity = false;
      for (const bucket of ipBuckets.values()) {
        if (now - bucket.lastRefill < maxAgeMs) {
          hasActivity = true;
          break;
        }
      }
      if (!hasActivity) {
        toDelete.push(ip);
      }
    }
    for (const ip of toDelete) {
      this.buckets.delete(ip);
    }
  }
  /**
   * Update rate limit rules dynamically
   */
  updateRules(newRules) {
    this.rules = { ...this.rules, ...newRules };
  }
}
var VouchType = /* @__PURE__ */ ((VouchType2) => {
  VouchType2["HANDSHAKE"] = "handshake";
  VouchType2["VAULT_HELPED"] = "vault_helped";
  VouchType2["VAULT_RETRIEVED"] = "vault_ret";
  VouchType2["VAULT_CHUNK"] = "vault_chunk";
  VouchType2["SPAM"] = "spam";
  VouchType2["MALICIOUS"] = "malicious";
  VouchType2["INTEGRITY_FAIL"] = "integrity_fail";
  return VouchType2;
})(VouchType || {});
const VOUCH_WEIGHTS = {
  [
    "handshake"
    /* HANDSHAKE */
  ]: 1,
  [
    "vault_helped"
    /* VAULT_HELPED */
  ]: 2,
  [
    "vault_ret"
    /* VAULT_RETRIEVED */
  ]: 1.5,
  [
    "vault_chunk"
    /* VAULT_CHUNK */
  ]: 3,
  [
    "spam"
    /* SPAM */
  ]: 5,
  [
    "malicious"
    /* MALICIOUS */
  ]: 10,
  [
    "integrity_fail"
    /* INTEGRITY_FAIL */
  ]: 15
};
const VOUCH_POSITIVE = {
  [
    "handshake"
    /* HANDSHAKE */
  ]: true,
  [
    "vault_helped"
    /* VAULT_HELPED */
  ]: true,
  [
    "vault_ret"
    /* VAULT_RETRIEVED */
  ]: true,
  [
    "vault_chunk"
    /* VAULT_CHUNK */
  ]: true,
  [
    "spam"
    /* SPAM */
  ]: false,
  [
    "malicious"
    /* MALICIOUS */
  ]: false,
  [
    "integrity_fail"
    /* INTEGRITY_FAIL */
  ]: false
};
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1e3;
const ONE_DAY_MS = 24 * 60 * 60 * 1e3;
const MAX_CONTRIBUTING_VOUCHES_PER_SENDER = 10;
const GOSSIP_MAX_IDS = 500;
const DELIVER_MAX_VOUCHES = 50;
function computeVouchId(fromId, toId, type, timestamp) {
  const body = `${fromId}|${toId}|${type}|${timestamp}`;
  return crypto$1.createHash("sha256").update(body).digest("hex");
}
function buildSignBody(vouch) {
  return Buffer.from(
    `${vouch.id}|${vouch.fromId}|${vouch.toId}|${vouch.type}|${vouch.positive ? "1" : "0"}|${vouch.timestamp}`
  );
}
function computeScorePure(vouches2, directContactIds) {
  if (vouches2.length === 0) return 50;
  const bySender = /* @__PURE__ */ new Map();
  let delta = 0;
  for (const v of vouches2) {
    if (!directContactIds.has(v.fromId)) continue;
    const used = bySender.get(v.fromId) ?? 0;
    if (used >= MAX_CONTRIBUTING_VOUCHES_PER_SENDER) continue;
    bySender.set(v.fromId, used + 1);
    const weight = VOUCH_WEIGHTS[v.type] ?? 1;
    delta += weight * (v.positive ? 1 : -1);
  }
  return Math.round(Math.max(0, Math.min(100, 50 + delta)));
}
const MAX_VOUCHES_PER_SENDER_PER_DAY = 20;
async function issueVouch(toId, type) {
  try {
    const { getMyUPeerId: getMyUPeerId2, sign: sign2 } = await Promise.resolve().then(() => identity);
    const fromId = getMyUPeerId2();
    if (!fromId) return null;
    const timestamp = Date.now();
    const positive = VOUCH_POSITIVE[type];
    const id = computeVouchId(fromId, toId, type, timestamp);
    if (vouchExists(id)) return null;
    const vouchBody = {
      id,
      fromId,
      toId,
      type,
      positive,
      timestamp
    };
    const signature = sign2(buildSignBody(vouchBody)).toString("hex");
    const vouch = { ...vouchBody, signature };
    insertVouch({ ...vouch, receivedAt: timestamp });
    info("Vouch emitido", { fromId, toId, type, positive }, "reputation");
    return vouch;
  } catch (e) {
    error("issueVouch falló", e, "reputation");
    return null;
  }
}
async function saveIncomingVouch(vouch) {
  try {
    if (vouchExists(vouch.id)) return true;
    if (!vouch.id || !vouch.fromId || !vouch.toId || !vouch.type || !vouch.signature) {
      warn("Vouch malformado", { id: vouch.id }, "reputation");
      return false;
    }
    if (!Object.values(VouchType).includes(vouch.type)) {
      warn("Tipo de vouch desconocido", { type: vouch.type }, "reputation");
      return false;
    }
    const expectedId = computeVouchId(vouch.fromId, vouch.toId, vouch.type, vouch.timestamp);
    if (expectedId !== vouch.id) {
      warn("ID de vouch no coincide", { expected: expectedId, received: vouch.id }, "reputation");
      return false;
    }
    const now = Date.now();
    if (vouch.timestamp > now + 5 * 60 * 1e3) {
      warn("Timestamp de vouch en el futuro", { id: vouch.id }, "reputation");
      return false;
    }
    if (vouch.timestamp < now - THIRTY_DAYS_MS) {
      warn("Vouch demasiado antiguo", { id: vouch.id }, "reputation");
      return false;
    }
    const dayAgo = now - ONE_DAY_MS;
    const todayCount = countRecentVouchesByFrom(vouch.fromId, dayAgo);
    if (todayCount >= MAX_VOUCHES_PER_SENDER_PER_DAY) {
      warn("Rate limit de vouch excedido", { fromId: vouch.fromId }, "reputation");
      return false;
    }
    const { verify: verify2 } = await Promise.resolve().then(() => identity);
    const { getContactByRevelnestId: getContactByRevelnestId2 } = await import("./db-Cln22U_j.js");
    const contact = await getContactByRevelnestId2(vouch.fromId);
    if (!(contact == null ? void 0 : contact.publicKey)) {
      warn("Vouch de contacto desconocido ignorado", { fromId: vouch.fromId }, "reputation");
      return false;
    }
    const positive = VOUCH_POSITIVE[vouch.type];
    const isValid = verify2(
      buildSignBody({ ...vouch, positive }),
      Buffer.from(vouch.signature, "hex"),
      Buffer.from(contact.publicKey, "hex")
    );
    if (!isValid) {
      warn("Firma de vouch inválida", { fromId: vouch.fromId, id: vouch.id }, "reputation");
      return false;
    }
    insertVouch({ ...vouch, positive, receivedAt: now });
    info("Vouch aceptado", { fromId: vouch.fromId, toId: vouch.toId, type: vouch.type }, "reputation");
    return true;
  } catch (e) {
    error("saveIncomingVouch falló", e, "reputation");
    return false;
  }
}
function computeScore(toId, directContactIds) {
  try {
    const since = Date.now() - THIRTY_DAYS_MS;
    const vouches2 = getVouchesForNode(toId, since);
    return computeScorePure(vouches2, directContactIds);
  } catch {
    return 50;
  }
}
async function getVouchScore(toId) {
  try {
    const { getContacts: getContacts2 } = await import("./db-Cln22U_j.js");
    const contacts2 = getContacts2();
    const directContactIds = new Set(
      contacts2.filter((c) => c.status === "connected" && c.upeerId).map((c) => c.upeerId)
    );
    return computeScore(toId, directContactIds);
  } catch {
    return 50;
  }
}
function getGossipIds() {
  const since = Date.now() - THIRTY_DAYS_MS;
  return getVouchIds(since).slice(0, GOSSIP_MAX_IDS);
}
function getVouchesForDelivery(ids) {
  return getVouchesByIds(ids.slice(0, DELIVER_MAX_VOUCHES));
}
const vouches = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  DELIVER_MAX_VOUCHES,
  GOSSIP_MAX_IDS,
  VOUCH_POSITIVE,
  VOUCH_WEIGHTS,
  VouchType,
  computeScore,
  computeVouchId,
  getGossipIds,
  getVouchScore,
  getVouchesForDelivery,
  issueVouch,
  saveIncomingVouch
}, Symbol.toStringTag, { value: "Module" }));
let _cachedDirectIds = /* @__PURE__ */ new Set();
let _cacheTs = 0;
const _CACHE_TTL = 6e4;
async function _getDirectContactIds() {
  const now = Date.now();
  if (now - _cacheTs < _CACHE_TTL) return _cachedDirectIds;
  try {
    const { getContacts: getContacts2 } = await import("./db-Cln22U_j.js");
    const contacts2 = getContacts2();
    _cachedDirectIds = new Set(
      contacts2.filter((c) => c.status === "connected" && c.upeerId).map((c) => c.upeerId)
    );
    _cacheTs = now;
  } catch {
  }
  return _cachedDirectIds;
}
class IdentityRateLimiter extends RateLimiter {
  // upeerId -> messageType -> bucket
  constructor(rules) {
    super(rules);
    this.identityBuckets = /* @__PURE__ */ new Map();
  }
  /**
   * Check if a message from given IP is allowed (IP-based rate limiting only)
   * Alias for super.check() for clarity
   */
  checkIp(ip, messageType) {
    return super.check(ip, messageType);
  }
  /**
   * Check if a message from given identity is allowed (identity-based rate limiting only)
   * Uses reputation-adjusted limits
   */
  checkIdentityOnly(upeerId2, messageType) {
    if (!upeerId2) {
      return true;
    }
    if (Date.now() - _cacheTs >= _CACHE_TTL) {
      _getDirectContactIds().catch(() => {
      });
    }
    const rule = this.rules[messageType];
    if (!rule) {
      return true;
    }
    const adjustedRule = this.getAdjustedRule(upeerId2, messageType, rule);
    const now = Date.now();
    if (!this.identityBuckets.has(upeerId2)) {
      this.identityBuckets.set(upeerId2, /* @__PURE__ */ new Map());
    }
    const identityBuckets = this.identityBuckets.get(upeerId2);
    if (!identityBuckets.has(messageType)) {
      identityBuckets.set(messageType, {
        tokens: adjustedRule.maxTokens,
        lastRefill: now
      });
    }
    const bucket = identityBuckets.get(messageType);
    const elapsedMs = now - bucket.lastRefill;
    if (elapsedMs > 0) {
      const refillTokens = elapsedMs * (adjustedRule.refillRate / 1e3);
      bucket.tokens = Math.min(adjustedRule.maxTokens, bucket.tokens + refillTokens);
      bucket.lastRefill = now;
    }
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    warn("Identity rate limited", {
      upeerId: upeerId2,
      messageType,
      tokens: bucket.tokens.toFixed(2)
    }, "rate-limiter");
    return false;
  }
  /**
   * Check if a message from given IP and identity is allowed
   * Applies both IP-based and identity-based rate limiting
   * Identity limits are adjusted based on reputation score
   */
  checkIdentity(ip, upeerId2, messageType) {
    return this.checkIdentityOnly(upeerId2, messageType);
  }
  /**
   * Get reputation-adjusted rate limit rule
   * BUG BF fix: antes se pasaba `new Set<string>()` como directContactIds, lo que hace
   * que computeScorePure filtre TODOS los vouches (sólo cuentan de contactos directos),
   * devolviendo siempre 50 → multiplicador siempre 1.0 → reputación nunca ajusta límites.
   * Ahora usamos una caché de 60s con los contactos reales para que la protección Sybil
   * y el ajuste de cuota funcionen correctamente sin consultar la DB en cada paquete.
   */
  getAdjustedRule(upeerId2, _messageType, baseRule) {
    const vouchScore = computeScore(upeerId2, _cachedDirectIds);
    const reputationMultiplier = this.calculateReputationMultiplier(vouchScore);
    const adjustedMaxTokens = Math.max(1, Math.floor(baseRule.maxTokens * reputationMultiplier));
    const adjustedRefillRate = baseRule.refillRate * reputationMultiplier;
    return {
      windowMs: baseRule.windowMs,
      maxTokens: adjustedMaxTokens,
      refillRate: adjustedRefillRate
    };
  }
  /**
   * Calculate reputation multiplier based on weightedScore (0-100)
   * Returns multiplier between 0.1 and 3.0
   */
  calculateReputationMultiplier(score) {
    if (score <= 0) return 0.1;
    if (score >= 100) return 3;
    if (score <= 50) {
      return 0.1 + score / 50 * 0.9;
    } else {
      return 1 + (score - 50) / 50 * 2;
    }
  }
  /**
   * Reset rate limits for a specific identity
   */
  resetIdentity(upeerId2) {
    this.identityBuckets.delete(upeerId2);
  }
  /**
   * Reset rate limits for a specific IP (overrides parent method to also clean identity mappings)
   */
  resetIp(ip) {
    super.resetIp(ip);
  }
  /**
   * Get current token count for identity (for debugging/monitoring)
   */
  getIdentityTokenCount(upeerId2, messageType) {
    const identityBuckets = this.identityBuckets.get(upeerId2);
    if (!identityBuckets) return 0;
    const bucket = identityBuckets.get(messageType);
    return bucket ? bucket.tokens : 0;
  }
  /**
   * Clean up old identity entries to prevent memory leak
   */
  cleanupIdentities(maxAgeMs = 36e5) {
    const now = Date.now();
    const toDelete = [];
    for (const [upeerId2, identityBuckets] of this.identityBuckets.entries()) {
      let hasActivity = false;
      for (const bucket of identityBuckets.values()) {
        if (now - bucket.lastRefill < maxAgeMs) {
          hasActivity = true;
          break;
        }
      }
      if (!hasActivity) {
        toDelete.push(upeerId2);
      }
    }
    for (const upeerId2 of toDelete) {
      this.identityBuckets.delete(upeerId2);
    }
  }
  /**
   * Perform complete cleanup (IPs and identities)
   */
  cleanup(maxAgeMs = 36e5) {
    super.cleanup(maxAgeMs);
    this.cleanupIdentities(maxAgeMs);
  }
  /**
   * Get statistics about identity rate limiting
   */
  getIdentityStats() {
    let totalBuckets = 0;
    for (const identityBuckets of this.identityBuckets.values()) {
      totalBuckets += identityBuckets.size;
    }
    return {
      totalIdentities: this.identityBuckets.size,
      totalIdentityBuckets: totalBuckets
    };
  }
}
function validateHandshakeReq(data) {
  if (!data.publicKey || typeof data.publicKey !== "string" || data.publicKey.length !== 64) {
    return { valid: false, error: "Invalid publicKey" };
  }
  if (data.ephemeralPublicKey && (typeof data.ephemeralPublicKey !== "string" || data.ephemeralPublicKey.length !== 64)) {
    return { valid: false, error: "Invalid ephemeralPublicKey" };
  }
  if (data.alias && typeof data.alias !== "string") {
    return { valid: false, error: "Invalid alias" };
  }
  if (data.alias && data.alias.length > 100) {
    return { valid: false, error: "Alias too long" };
  }
  if (data.avatar && (typeof data.avatar !== "string" || data.avatar.length > 307200)) {
    return { valid: false, error: "Avatar too large or invalid" };
  }
  if (data.powProof !== void 0) {
    if (typeof data.powProof !== "string" || data.powProof.length > 256) {
      return { valid: false, error: "Invalid powProof (too long or wrong type)" };
    }
    if (!data.powProof.startsWith("{") && !/^[0-9a-f]+$/i.test(data.powProof)) {
      return { valid: false, error: "Invalid powProof format" };
    }
  }
  if (data.signedPreKey !== void 0 && data.signedPreKey !== null) {
    const spk = data.signedPreKey;
    if (typeof spk !== "object") {
      return { valid: false, error: "signedPreKey must be an object" };
    }
    if (spk.spkPub !== void 0 && (typeof spk.spkPub !== "string" || spk.spkPub.length !== 64)) {
      return { valid: false, error: "Invalid signedPreKey.spkPub (expected 64 hex chars)" };
    }
    if (spk.spkSig !== void 0 && (typeof spk.spkSig !== "string" || spk.spkSig.length !== 128)) {
      return { valid: false, error: "Invalid signedPreKey.spkSig (expected 128 hex chars)" };
    }
    if (spk.spkId !== void 0 && (typeof spk.spkId !== "number" || !Number.isInteger(spk.spkId) || spk.spkId < 0)) {
      return { valid: false, error: "Invalid signedPreKey.spkId" };
    }
  }
  return { valid: true };
}
function validateHandshakeAccept(data) {
  if (!data.publicKey || typeof data.publicKey !== "string" || data.publicKey.length !== 64) {
    return { valid: false, error: "Invalid publicKey" };
  }
  if (data.ephemeralPublicKey && (typeof data.ephemeralPublicKey !== "string" || data.ephemeralPublicKey.length !== 64)) {
    return { valid: false, error: "Invalid ephemeralPublicKey" };
  }
  if (data.avatar && (typeof data.avatar !== "string" || data.avatar.length > 307200)) {
    return { valid: false, error: "Avatar too large or invalid" };
  }
  if (data.alias && (typeof data.alias !== "string" || data.alias.length > 100)) {
    return { valid: false, error: "Alias too long or invalid in HANDSHAKE_ACCEPT" };
  }
  if (data.signedPreKey !== void 0 && data.signedPreKey !== null) {
    const spk = data.signedPreKey;
    if (typeof spk !== "object") {
      return { valid: false, error: "signedPreKey must be an object" };
    }
    if (spk.spkPub !== void 0 && (typeof spk.spkPub !== "string" || spk.spkPub.length !== 64)) {
      return { valid: false, error: "Invalid signedPreKey.spkPub (expected 64 hex chars)" };
    }
    if (spk.spkSig !== void 0 && (typeof spk.spkSig !== "string" || spk.spkSig.length !== 128)) {
      return { valid: false, error: "Invalid signedPreKey.spkSig (expected 128 hex chars)" };
    }
    if (spk.spkId !== void 0 && (typeof spk.spkId !== "number" || !Number.isInteger(spk.spkId) || spk.spkId < 0)) {
      return { valid: false, error: "Invalid signedPreKey.spkId" };
    }
  }
  return { valid: true };
}
function validateChat(data) {
  if (!data.id || typeof data.id !== "string" || data.id.length > 100) {
    return { valid: false, error: "Invalid message id" };
  }
  if (!data.content || typeof data.content !== "string") {
    return { valid: false, error: "Invalid content" };
  }
  if (data.content.length > 2e5) {
    return { valid: false, error: "Content too long" };
  }
  if ((data.ratchetHeader || data.nonce) && data.content.length < 32) {
    return { valid: false, error: "Ciphertext too short (min 32 hex chars)" };
  }
  if (data.nonce && (typeof data.nonce !== "string" || data.nonce.length !== 48)) {
    return { valid: false, error: "Invalid nonce" };
  }
  if (data.ephemeralPublicKey && (typeof data.ephemeralPublicKey !== "string" || data.ephemeralPublicKey.length !== 64)) {
    return { valid: false, error: "Invalid ephemeralPublicKey" };
  }
  if (data.replyTo && (typeof data.replyTo !== "string" || data.replyTo.length > 100)) {
    return { valid: false, error: "Invalid replyTo" };
  }
  if (data.x3dhInit) {
    const xi = data.x3dhInit;
    if (typeof xi !== "object" || xi === null) return { valid: false, error: "x3dhInit must be an object" };
    if (!xi.ikPub || typeof xi.ikPub !== "string" || xi.ikPub.length !== 64)
      return { valid: false, error: "Invalid x3dhInit.ikPub" };
    if (!xi.ekPub || typeof xi.ekPub !== "string" || xi.ekPub.length !== 64)
      return { valid: false, error: "Invalid x3dhInit.ekPub" };
    if (typeof xi.spkId !== "number" || !Number.isInteger(xi.spkId) || xi.spkId < 0)
      return { valid: false, error: "Invalid x3dhInit.spkId" };
  }
  if (data.ratchetHeader) {
    const rh = data.ratchetHeader;
    if (typeof rh !== "object" || rh === null) return { valid: false, error: "ratchetHeader must be an object" };
    if (rh.dh && (typeof rh.dh !== "string" || rh.dh.length !== 64))
      return { valid: false, error: "Invalid ratchetHeader.dh" };
    if (rh.pn !== void 0 && (typeof rh.pn !== "number" || rh.pn < 0 || rh.pn > 1e6))
      return { valid: false, error: "Invalid ratchetHeader.pn" };
    if (rh.n !== void 0 && (typeof rh.n !== "number" || rh.n < 0 || rh.n > 1e6))
      return { valid: false, error: "Invalid ratchetHeader.n" };
  }
  return { valid: true };
}
function validateAck(data) {
  if (!data.id || typeof data.id !== "string" || data.id.length > 100) {
    return { valid: false, error: "Invalid ack id" };
  }
  return { valid: true };
}
function validateRead(data) {
  if (!data.id || typeof data.id !== "string" || data.id.length > 100) {
    return { valid: false, error: "Invalid read id" };
  }
  return { valid: true };
}
function validateTyping(data) {
  return { valid: true };
}
function validatePingPong(data) {
  if (data.ephemeralPublicKey && (typeof data.ephemeralPublicKey !== "string" || data.ephemeralPublicKey.length !== 64)) {
    return { valid: false, error: "Invalid ephemeralPublicKey in PING" };
  }
  if (data.avatar && (typeof data.avatar !== "string" || data.avatar.length > 307200)) {
    return { valid: false, error: "Avatar too large or invalid in PING" };
  }
  if (data.alias && (typeof data.alias !== "string" || data.alias.length > 100)) {
    return { valid: false, error: "Alias too long or invalid in PING" };
  }
  return { valid: true };
}
function validateChatReaction(data) {
  if (!data.msgId || typeof data.msgId !== "string" || data.msgId.length > 100) {
    return { valid: false, error: "Invalid msgId" };
  }
  if (!data.emoji || typeof data.emoji !== "string" || data.emoji.length > 10) {
    return { valid: false, error: "Invalid emoji" };
  }
  if (typeof data.remove !== "boolean") {
    return { valid: false, error: "Invalid remove flag" };
  }
  return { valid: true };
}
function validateChatUpdate(data) {
  if (!data.msgId || typeof data.msgId !== "string" || data.msgId.length > 100) {
    return { valid: false, error: "Invalid msgId" };
  }
  if (!data.content || typeof data.content !== "string") {
    return { valid: false, error: "Invalid content" };
  }
  if (data.content.length > 2e5) {
    return { valid: false, error: "Content too long" };
  }
  if (data.nonce && (typeof data.nonce !== "string" || data.nonce.length !== 48)) {
    return { valid: false, error: "Invalid nonce" };
  }
  if (data.ephemeralPublicKey && (typeof data.ephemeralPublicKey !== "string" || data.ephemeralPublicKey.length !== 64)) {
    return { valid: false, error: "Invalid ephemeralPublicKey" };
  }
  return { valid: true };
}
function validateChatDelete(data) {
  if (!data.msgId || typeof data.msgId !== "string" || data.msgId.length > 100) {
    return { valid: false, error: "Invalid msgId" };
  }
  if (data.signature !== void 0 && (typeof data.signature !== "string" || data.signature.length !== 128)) {
    return { valid: false, error: "Invalid signature (expected 128 hex chars)" };
  }
  return { valid: true };
}
function validateDhtQuery(data) {
  if (!data.targetId || typeof data.targetId !== "string" || data.targetId.length !== 32) {
    return { valid: false, error: "Invalid targetId" };
  }
  return { valid: true };
}
function validateDhtResponse(data) {
  if (!data.targetId || typeof data.targetId !== "string" || data.targetId.length !== 32) {
    return { valid: false, error: "Invalid targetId" };
  }
  if (data.locationBlock) {
    if (!data.locationBlock.address || typeof data.locationBlock.address !== "string") {
      return { valid: false, error: "Invalid locationBlock.address" };
    }
    if (typeof data.locationBlock.dhtSeq !== "number" || data.locationBlock.dhtSeq < 0) {
      return { valid: false, error: "Invalid locationBlock.dhtSeq" };
    }
    if (!data.locationBlock.signature || typeof data.locationBlock.signature !== "string" || data.locationBlock.signature.length !== 128) {
      return { valid: false, error: "Invalid locationBlock.signature" };
    }
  }
  if (data.neighbors && !Array.isArray(data.neighbors)) {
    return { valid: false, error: "Invalid neighbors array" };
  }
  return { valid: true };
}
function validateDhtUpdate(data) {
  if (!data.locationBlock || typeof data.locationBlock !== "object") {
    return { valid: false, error: "Missing locationBlock" };
  }
  if (!data.locationBlock.address || typeof data.locationBlock.address !== "string") {
    return { valid: false, error: "Invalid locationBlock.address" };
  }
  if (typeof data.locationBlock.dhtSeq !== "number" || data.locationBlock.dhtSeq < 0) {
    return { valid: false, error: "Invalid locationBlock.dhtSeq" };
  }
  if (!data.locationBlock.signature || typeof data.locationBlock.signature !== "string" || data.locationBlock.signature.length !== 128) {
    return { valid: false, error: "Invalid locationBlock.signature" };
  }
  return { valid: true };
}
function validateDhtExchange(data) {
  if (!Array.isArray(data.peers)) {
    return { valid: false, error: "Invalid peers array" };
  }
  if (data.peers.length > 50) {
    return { valid: false, error: "Too many peers" };
  }
  for (const peer of data.peers) {
    if (!peer.upeerId || typeof peer.upeerId !== "string" || peer.upeerId.length !== 32) {
      return { valid: false, error: "Invalid peer upeerId" };
    }
    if (!peer.publicKey || typeof peer.publicKey !== "string" || peer.publicKey.length !== 64) {
      return { valid: false, error: "Invalid peer publicKey" };
    }
  }
  return { valid: true };
}
function validateDhtFindNode(data) {
  if (!data.targetId || typeof data.targetId !== "string" || !/^[0-9a-f]+$/i.test(data.targetId) || data.targetId.length > 128) {
    return { valid: false, error: "Invalid targetId" };
  }
  return { valid: true };
}
function validateDhtFindValue(data) {
  if (!data.key || typeof data.key !== "string" || !/^[0-9a-f]+$/i.test(data.key) || data.key.length !== 40 && data.key.length !== 64) {
    return { valid: false, error: "Invalid key (expected 40 or 64 hex chars)" };
  }
  return { valid: true };
}
function validateDhtStore(data) {
  if (!data.key || typeof data.key !== "string" || !/^[0-9a-f]+$/i.test(data.key) || data.key.length !== 40 && data.key.length !== 64) {
    return { valid: false, error: "Invalid key (expected 40 or 64 hex chars)" };
  }
  if (data.value === null || data.value === void 0) {
    return { valid: false, error: "Missing value" };
  }
  try {
    const serialized = typeof data.value === "string" ? data.value : JSON.stringify(data.value);
    if (serialized.length > 1e4) {
      return { valid: false, error: "Value too large" };
    }
  } catch {
    return { valid: false, error: "Value not serializable" };
  }
  if (data.ttl !== void 0 && (typeof data.ttl !== "number" || data.ttl < 0 || data.ttl > 2592e3)) {
    return { valid: false, error: "Invalid TTL" };
  }
  return { valid: true };
}
function validateFileProposal(data) {
  if (!data.fileId || typeof data.fileId !== "string") return { valid: false, error: "Invalid fileId" };
  if (!data.fileName || typeof data.fileName !== "string") return { valid: false, error: "Invalid fileName" };
  if (typeof data.fileSize !== "number" || data.fileSize < 0) return { valid: false, error: "Invalid fileSize" };
  if (data.encryptedKey !== void 0 && (typeof data.encryptedKey !== "string" || data.encryptedKey.length !== 96)) {
    return { valid: false, error: "Invalid encryptedKey (expected 96 hex chars)" };
  }
  if (data.encryptedKeyNonce !== void 0 && (typeof data.encryptedKeyNonce !== "string" || data.encryptedKeyNonce.length !== 48)) {
    return { valid: false, error: "Invalid encryptedKeyNonce (expected 48 hex chars)" };
  }
  return { valid: true };
}
function validateFileAccept(data) {
  if (!data.fileId || typeof data.fileId !== "string") return { valid: false, error: "Invalid fileId" };
  return { valid: true };
}
function validateFileChunk(data) {
  if (!data.fileId || typeof data.fileId !== "string") return { valid: false, error: "Invalid fileId" };
  if (typeof data.chunkIndex !== "number" || data.chunkIndex < 0) return { valid: false, error: "Invalid chunkIndex" };
  if (!data.data || typeof data.data !== "string") return { valid: false, error: "Invalid chunk data" };
  if (data.data.length > 2e5) return { valid: false, error: "Chunk data too large" };
  if (data.iv !== void 0 && (typeof data.iv !== "string" || data.iv.length !== 24)) {
    return { valid: false, error: "Invalid AES-GCM IV (expected 24 hex chars)" };
  }
  if (data.tag !== void 0 && (typeof data.tag !== "string" || data.tag.length !== 32)) {
    return { valid: false, error: "Invalid AES-GCM tag (expected 32 hex chars)" };
  }
  return { valid: true };
}
function validateFileChunkAck(data) {
  if (!data.fileId || typeof data.fileId !== "string") return { valid: false, error: "Invalid fileId" };
  if (typeof data.chunkIndex !== "number") return { valid: false, error: "Invalid chunkIndex" };
  return { valid: true };
}
function validateFileDoneAck(data) {
  if (!data.fileId || typeof data.fileId !== "string") return { valid: false, error: "Invalid fileId" };
  return { valid: true };
}
function validateFileCancel(data) {
  if (!data.fileId || typeof data.fileId !== "string") {
    return { valid: false, error: "Invalid fileId" };
  }
  return { valid: true };
}
function validateVaultStore(data) {
  if (!data.payloadHash || typeof data.payloadHash !== "string" || data.payloadHash.length > 200) return { valid: false, error: "Invalid payloadHash" };
  if (!data.recipientSid || typeof data.recipientSid !== "string" || data.recipientSid.length > 64) return { valid: false, error: "Invalid recipientSid" };
  if (!data.data || typeof data.data !== "string") return { valid: false, error: "Invalid data" };
  if (data.data.length > 2e6) return { valid: false, error: "Vault data too large" };
  return { valid: true };
}
function validateVaultQuery(data) {
  if (!data.requesterSid || typeof data.requesterSid !== "string" || data.requesterSid.length > 64) return { valid: false, error: "Invalid requesterSid" };
  return { valid: true };
}
function validateVaultAck(data) {
  if (!Array.isArray(data.payloadHashes)) return { valid: false, error: "Invalid payloadHashes" };
  if (data.payloadHashes.length > 200) return { valid: false, error: "Too many payloadHashes" };
  for (const h of data.payloadHashes) {
    if (typeof h !== "string" || h.length > 200) return { valid: false, error: "Invalid payloadHash in payloadHashes" };
  }
  return { valid: true };
}
function validateVaultDelivery(data) {
  if (!Array.isArray(data.entries)) return { valid: false, error: "Invalid entries" };
  if (data.entries.length > 100) return { valid: false, error: "Too many vault entries" };
  return { valid: true };
}
function validateVaultRenew(data) {
  if (!data.payloadHash || typeof data.payloadHash !== "string" || data.payloadHash.length !== 64) {
    return { valid: false, error: "Invalid payloadHash" };
  }
  if (typeof data.newExpiresAt !== "number" || data.newExpiresAt < 0) {
    return { valid: false, error: "Invalid newExpiresAt" };
  }
  return { valid: true };
}
function validateGroupMsg(data) {
  if (!data.groupId || typeof data.groupId !== "string" || data.groupId.length > 100) {
    return { valid: false, error: "Invalid groupId" };
  }
  if (!data.content || typeof data.content !== "string" || data.content.length > 2e5) {
    return { valid: false, error: "Invalid or missing content" };
  }
  return { valid: true };
}
function validateGroupAck(data) {
  if (!data.id || typeof data.id !== "string" || data.id.length > 100) {
    return { valid: false, error: "Invalid id" };
  }
  if (!data.groupId || typeof data.groupId !== "string") {
    return { valid: false, error: "Invalid groupId" };
  }
  return { valid: true };
}
function validateGroupInvite(data) {
  if (!data.groupId || typeof data.groupId !== "string" || data.groupId.length > 100) {
    return { valid: false, error: "Invalid groupId" };
  }
  if (!data.payload || typeof data.payload !== "string") {
    return { valid: false, error: "Missing encrypted payload" };
  }
  if (data.payload.length > 5e5) {
    return { valid: false, error: "Group invite payload too large" };
  }
  if (!data.nonce || typeof data.nonce !== "string" || data.nonce.length !== 48) {
    return { valid: false, error: "Invalid nonce" };
  }
  return { valid: true };
}
function validateGroupUpdate(data) {
  if (!data.groupId || typeof data.groupId !== "string" || data.groupId.length > 100) {
    return { valid: false, error: "Invalid groupId" };
  }
  if (!data.payload || typeof data.payload !== "string") {
    return { valid: false, error: "Missing encrypted payload" };
  }
  if (data.payload.length > 5e5) {
    return { valid: false, error: "Group update payload too large" };
  }
  if (!data.nonce || typeof data.nonce !== "string" || data.nonce.length !== 48) {
    return { valid: false, error: "Invalid nonce" };
  }
  return { valid: true };
}
function validateChatContact(data) {
  if (!data.id || typeof data.id !== "string" || data.id.length > 100) {
    return { valid: false, error: "Invalid id" };
  }
  if (!data.upeerId || typeof data.upeerId !== "string" || data.upeerId.length !== 32) {
    return { valid: false, error: "Invalid upeerId" };
  }
  if (data.contactName && (typeof data.contactName !== "string" || data.contactName.length > 100)) {
    return { valid: false, error: "Invalid contactName" };
  }
  if (data.contactAddress && typeof data.contactAddress !== "string") {
    return { valid: false, error: "Invalid contactAddress" };
  }
  if (!data.contactPublicKey || typeof data.contactPublicKey !== "string" || data.contactPublicKey.length !== 64) {
    return { valid: false, error: "Invalid contactPublicKey" };
  }
  return { valid: true };
}
function validateGroupLeave(data) {
  if (!data.groupId || typeof data.groupId !== "string" || data.groupId.length > 100) {
    return { valid: false, error: "Invalid groupId" };
  }
  if (data.signature !== void 0 && (typeof data.signature !== "string" || data.signature.length !== 128)) {
    return { valid: false, error: "Invalid signature (expected 128 hex chars)" };
  }
  return { valid: true };
}
function validateReputationGossip(data) {
  if (!Array.isArray(data.ids)) return { valid: false, error: "ids debe ser un array" };
  if (data.ids.length > 500) return { valid: false, error: "Demasiados IDs" };
  for (const id of data.ids) {
    if (typeof id !== "string" || id.length !== 64) return { valid: false, error: "ID de vouch inválido" };
  }
  return { valid: true };
}
function validateReputationRequest(data) {
  if (!Array.isArray(data.missing)) return { valid: false, error: "missing debe ser un array" };
  if (data.missing.length > 100) return { valid: false, error: "Demasiados IDs faltantes" };
  for (const id of data.missing) {
    if (typeof id !== "string" || id.length !== 64) return { valid: false, error: "ID de vouch inválido" };
  }
  return { valid: true };
}
function validateReputationDeliver(data) {
  if (!Array.isArray(data.vouches)) return { valid: false, error: "vouches debe ser un array" };
  if (data.vouches.length > 50) return { valid: false, error: "Demasiados vouches" };
  for (const v of data.vouches) {
    if (!v.id || typeof v.id !== "string" || v.id.length !== 64) return { valid: false, error: "id inválido" };
    if (!v.fromId || typeof v.fromId !== "string" || v.fromId.length !== 32) return { valid: false, error: "fromId inválido" };
    if (!v.toId || typeof v.toId !== "string" || v.toId.length !== 32) return { valid: false, error: "toId inválido" };
    if (!v.type || typeof v.type !== "string") return { valid: false, error: "type inválido" };
    if (typeof v.timestamp !== "number") return { valid: false, error: "timestamp inválido" };
    if (!v.signature || typeof v.signature !== "string" || v.signature.length !== 128) return { valid: false, error: "signature inválida" };
  }
  return { valid: true };
}
function validateMessage(type, data) {
  switch (type) {
    case "HANDSHAKE_REQ":
      return validateHandshakeReq(data);
    case "HANDSHAKE_ACCEPT":
      return validateHandshakeAccept(data);
    case "CHAT":
      return validateChat(data);
    case "ACK":
      return validateAck(data);
    case "READ":
      return validateRead(data);
    case "TYPING":
      return validateTyping();
    case "PING":
    case "PONG":
      return validatePingPong(data);
    case "CHAT_CONTACT":
      return validateChatContact(data);
    case "CHAT_REACTION":
      return validateChatReaction(data);
    case "CHAT_UPDATE":
      return validateChatUpdate(data);
    case "CHAT_DELETE":
      return validateChatDelete(data);
    case "DHT_QUERY":
      return validateDhtQuery(data);
    case "DHT_RESPONSE":
      return validateDhtResponse(data);
    case "DHT_UPDATE":
      return validateDhtUpdate(data);
    case "DHT_EXCHANGE":
      return validateDhtExchange(data);
    case "DHT_FIND_NODE":
      return validateDhtFindNode(data);
    case "DHT_FIND_VALUE":
      return validateDhtFindValue(data);
    case "DHT_STORE":
      return validateDhtStore(data);
    case "FILE_PROPOSAL":
    case "FILE_START":
      return validateFileProposal(data);
    case "FILE_ACCEPT":
      return validateFileAccept(data);
    case "FILE_CHUNK":
      return validateFileChunk(data);
    case "FILE_CHUNK_ACK":
    case "FILE_ACK":
      return validateFileChunkAck(data);
    case "FILE_DONE_ACK":
    case "FILE_END":
      return validateFileDoneAck(data);
    case "FILE_CANCEL":
      return validateFileCancel(data);
    case "VAULT_STORE":
      return validateVaultStore(data);
    case "VAULT_QUERY":
      return validateVaultQuery(data);
    case "VAULT_ACK":
      return validateVaultAck(data);
    case "VAULT_DELIVERY":
      return validateVaultDelivery(data);
    case "VAULT_RENEW":
      return validateVaultRenew(data);
    case "GROUP_MSG":
      return validateGroupMsg(data);
    case "GROUP_ACK":
      return validateGroupAck(data);
    case "GROUP_INVITE":
      return validateGroupInvite(data);
    case "GROUP_UPDATE":
      return validateGroupUpdate(data);
    case "GROUP_LEAVE":
      return validateGroupLeave(data);
    case "REPUTATION_GOSSIP":
      return validateReputationGossip(data);
    case "REPUTATION_REQUEST":
      return validateReputationRequest(data);
    case "REPUTATION_DELIVER":
      return validateReputationDeliver(data);
    default:
      return { valid: false, error: `Unknown message type: ${type}` };
  }
}
const SEALED_TYPES = /* @__PURE__ */ new Set([
  "CHAT",
  "ACK",
  "READ",
  "TYPING",
  "CHAT_REACTION",
  "CHAT_UPDATE",
  "CHAT_DELETE",
  "GROUP_MSG",
  "GROUP_ACK",
  "FILE_PROPOSAL",
  "FILE_START",
  "FILE_ACCEPT",
  "FILE_CHUNK",
  "FILE_CHUNK_ACK",
  "FILE_ACK",
  "FILE_DONE_ACK",
  "FILE_END",
  "FILE_CANCEL",
  "VAULT_STORE",
  "VAULT_QUERY",
  "VAULT_ACK",
  "VAULT_DELIVERY",
  "VAULT_RENEW"
]);
function sealPacket(signedPacket, recipientEdPkHex) {
  const recipientEdPk = Buffer.from(recipientEdPkHex, "hex");
  const recipientCurvePk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
  sodium.crypto_sign_ed25519_pk_to_curve25519(recipientCurvePk, recipientEdPk);
  const senderEphPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
  const senderEphSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_box_keypair(senderEphPk, senderEphSk);
  const nonce = Buffer.allocUnsafe(sodium.crypto_box_NONCEBYTES);
  sodium.randombytes_buf(nonce);
  const payload = Buffer.from(JSON.stringify(signedPacket));
  const ciphertext = Buffer.alloc(payload.length + sodium.crypto_box_MACBYTES);
  sodium.crypto_box_easy(ciphertext, payload, nonce, recipientCurvePk, senderEphSk);
  sodium.sodium_memzero(senderEphSk);
  return {
    type: "SEALED",
    senderEphPub: senderEphPk.toString("hex"),
    nonce: nonce.toString("hex"),
    ciphertext: ciphertext.toString("hex")
  };
}
function unsealPacket(data, myEdSkFn) {
  try {
    const senderEphPub = Buffer.from(data.senderEphPub, "hex");
    const nonce = Buffer.from(data.nonce, "hex");
    const ciphertext = Buffer.from(data.ciphertext, "hex");
    const plaintext = myEdSkFn(senderEphPub, nonce, ciphertext);
    if (!plaintext) return null;
    return JSON.parse(plaintext.toString("utf-8"));
  } catch {
    return null;
  }
}
const rateLimiter = new IdentityRateLimiter();
function cleanupRateLimiter() {
  rateLimiter.cleanup();
}
async function handlePacket(msg, rinfo, win, sendResponse, startDhtSearch2) {
  var _a2;
  try {
    const fullPacket = JSON.parse(msg.toString());
    if (fullPacket.type === "SEALED") {
      if (!rateLimiter.checkIp(rinfo.address, "SEALED")) {
        return;
      }
      const inner = unsealPacket(fullPacket, (ephPub, nonce, ct) => decryptSealed(ephPub, nonce, ct));
      if (!inner) {
        security("SEALED: failed to decrypt", { ip: rinfo.address }, "network");
        return;
      }
      return handlePacket(Buffer.from(JSON.stringify(inner)), rinfo, win, sendResponse, startDhtSearch2);
    }
    const { signature, senderRevelnestId, senderYggAddress, ...data } = fullPacket;
    const tcpSourceAddress = rinfo.address;
    if (senderYggAddress && /^[23][0-9a-f]{2}:/i.test(senderYggAddress)) {
      rinfo = { ...rinfo, address: senderYggAddress };
    }
    if (data.type === "FILE_CHUNK") {
      debug("FILE_CHUNK received", {
        fileId: data.fileId,
        chunkIndex: data.chunkIndex,
        totalChunks: data.totalChunks,
        dataSize: (_a2 = data.data) == null ? void 0 : _a2.length
      }, "file-transfer");
    }
    if (!data.type || typeof data.type !== "string") {
      security("Packet missing type", { ip: tcpSourceAddress }, "network");
      return;
    }
    if (!rateLimiter.checkIp(tcpSourceAddress, data.type)) {
      return;
    }
    const validation = validateMessage(data.type, data);
    if (!validation.valid) {
      security("Invalid message", { ip: rinfo.address, type: data.type, error: validation.error }, "network");
      return;
    }
    if (data.type === "HANDSHAKE_REQ") {
      if (!signature || !senderRevelnestId || !data.publicKey) {
        security("HANDSHAKE_REQ missing required fields", { ip: rinfo.address }, "network");
        return;
      }
      const fieldsToExclude2 = ["contactCache", "renewalToken"];
      const dataForVerification2 = { ...data };
      fieldsToExclude2.forEach((field) => {
        if (field in dataForVerification2) {
          delete dataForVerification2[field];
        }
      });
      const payloadForVerification2 = { ...dataForVerification2, senderRevelnestId, senderYggAddress };
      const isValidSignature = verify(
        Buffer.from(canonicalStringify(payloadForVerification2)),
        Buffer.from(signature, "hex"),
        Buffer.from(data.publicKey, "hex")
      );
      if (!isValidSignature) {
        const legacyPayload = { ...dataForVerification2, senderRevelnestId };
        const legacyValid = verify(
          Buffer.from(canonicalStringify(legacyPayload)),
          Buffer.from(signature, "hex"),
          Buffer.from(data.publicKey, "hex")
        );
        if (!legacyValid) {
          security("Invalid HANDSHAKE_REQ signature", { ip: rinfo.address }, "network");
          return;
        }
      }
      const derivedId = getUPeerIdFromPublicKey(Buffer.from(data.publicKey, "hex"));
      if (derivedId !== senderRevelnestId) {
        security("HANDSHAKE_REQ ID mismatch", { ip: rinfo.address, expected: derivedId, received: senderRevelnestId }, "network");
        return;
      }
      network("Handshake request verified", rinfo.address, { upeerId: senderRevelnestId }, "handshake");
      if (isContactBlocked(senderRevelnestId)) {
        security("Blocked contact attempted handshake", { upeerId: senderRevelnestId, ip: rinfo.address }, "network");
        return;
      }
      if (!rateLimiter.checkIdentity(rinfo.address, senderRevelnestId, data.type)) {
        return;
      }
      const existingContact = await getContactByRevelnestId(senderRevelnestId);
      const isNewContact = !existingContact;
      if (isNewContact) {
        if (!data.powProof) {
          security("New contact requires PoW proof", { upeerId: senderRevelnestId, ip: rinfo.address }, "pow");
          return;
        }
        if (!AdaptivePow.verifyLightProof(data.powProof, senderRevelnestId)) {
          security("Invalid PoW proof from new contact", { upeerId: senderRevelnestId, ip: rinfo.address }, "pow");
          return;
        }
        security("PoW verified for new contact", { upeerId: senderRevelnestId, ip: rinfo.address }, "pow");
      }
      issueVouch(senderRevelnestId, VouchType.HANDSHAKE).catch(() => {
      });
      const { getContacts: _gc } = await import("./db-Cln22U_j.js").catch(() => ({ getContacts: () => [] }));
      const _contacts = _gc();
      const _directIds = new Set(_contacts.filter((c) => c.status === "connected" && c.upeerId).map((c) => c.upeerId));
      const vouchScore = computeScore(senderRevelnestId, _directIds);
      if (vouchScore < 40) {
        security("Low vouch score contact detected", { upeerId: senderRevelnestId, score: vouchScore, ip: rinfo.address }, "reputation");
        win == null ? void 0 : win.webContents.send("contact-untrustworthy", {
          upeerId: senderRevelnestId,
          address: rinfo.address,
          alias: data.alias,
          reason: "low_reputation"
        });
      }
      if ((existingContact == null ? void 0 : existingContact.status) === "blocked") {
        security("Rejected handshake from blocked contact", { upeerId: senderRevelnestId, ip: rinfo.address }, "security");
        return;
      }
      const isAlreadyConnected = (existingContact == null ? void 0 : existingContact.status) === "connected";
      const newStatus = isAlreadyConnected ? "connected" : "incoming";
      const alias = data.alias || (existingContact == null ? void 0 : existingContact.name) || `Peer ${senderRevelnestId.slice(0, 4)}`;
      if (isAlreadyConnected && (existingContact == null ? void 0 : existingContact.publicKey) && existingContact.publicKey !== data.publicKey) {
        Promise.resolve().then(() => keys).then(({ computeKeyFingerprint: computeKeyFingerprint2 }) => {
          win == null ? void 0 : win.webContents.send("key-change-alert", {
            upeerId: senderRevelnestId,
            oldFingerprint: computeKeyFingerprint2(existingContact.publicKey),
            newFingerprint: computeKeyFingerprint2(data.publicKey),
            alias
          });
        }).catch(() => {
        });
        security("TOFU: static public key changed on re-handshake!", { upeerId: senderRevelnestId, ip: rinfo.address }, "security");
      }
      addOrUpdateContact(senderRevelnestId, rinfo.address, alias, data.publicKey, newStatus, data.ephemeralPublicKey);
      if (data.signedPreKey && typeof data.signedPreKey === "object") {
        const { spkPub, spkSig, spkId: spkId2 } = data.signedPreKey;
        if (typeof spkPub === "string" && typeof spkSig === "string" && typeof spkId2 === "number") {
          try {
            const spkValid = verify(
              Buffer.from(spkPub, "hex"),
              Buffer.from(spkSig, "hex"),
              Buffer.from(data.publicKey, "hex")
            );
            if (spkValid) {
              Promise.resolve().then(() => keys).then(({ updateContactSignedPreKey: updateContactSignedPreKey2 }) => {
                updateContactSignedPreKey2(senderRevelnestId, spkPub, spkSig, spkId2);
              }).catch(() => {
              });
            } else {
              security("HANDSHAKE_REQ: firma SPK inválida", { upeerId: senderRevelnestId }, "security");
            }
          } catch {
          }
        }
      }
      if (data.avatar && typeof data.avatar === "string" && data.avatar.startsWith("data:image/")) {
        import("./db-Cln22U_j.js").then(({ updateContactAvatar: updateContactAvatar2 }) => {
          updateContactAvatar2 == null ? void 0 : updateContactAvatar2(senderRevelnestId, data.avatar);
        }).catch(() => {
        });
      }
      if (isAlreadyConnected) {
        win == null ? void 0 : win.webContents.send("contact-presence", { upeerId: senderRevelnestId, lastSeen: (/* @__PURE__ */ new Date()).toISOString() });
        Promise.resolve().then(() => server).then(({ acceptContactRequest: acceptContactRequest2 }) => {
          acceptContactRequest2(senderRevelnestId, data.publicKey);
        }).catch((err) => error("Failed to auto-accept known contact", err, "network"));
        return;
      }
      win == null ? void 0 : win.webContents.send("contact-request-received", {
        upeerId: senderRevelnestId,
        address: rinfo.address,
        alias: data.alias,
        avatar: data.avatar || void 0,
        publicKey: data.publicKey,
        ephemeralPublicKey: data.ephemeralPublicKey,
        vouchScore
      });
      return;
    }
    if (data.type === "HANDSHAKE_ACCEPT") {
      if (!signature || !senderRevelnestId || !data.publicKey) {
        security("HANDSHAKE_ACCEPT missing required fields", { ip: rinfo.address }, "network");
        return;
      }
      const acceptPayload = { ...data, senderRevelnestId, senderYggAddress };
      let isValidAcceptSignature = verify(
        Buffer.from(canonicalStringify(acceptPayload)),
        Buffer.from(signature, "hex"),
        Buffer.from(data.publicKey, "hex")
      );
      if (!isValidAcceptSignature) {
        const legacyAcceptPayload = { ...data, senderRevelnestId };
        isValidAcceptSignature = verify(
          Buffer.from(canonicalStringify(legacyAcceptPayload)),
          Buffer.from(signature, "hex"),
          Buffer.from(data.publicKey, "hex")
        );
      }
      if (!isValidAcceptSignature) {
        isValidAcceptSignature = verify(
          Buffer.from(canonicalStringify(data)),
          Buffer.from(signature, "hex"),
          Buffer.from(data.publicKey, "hex")
        );
      }
      if (!isValidAcceptSignature) {
        security("Invalid HANDSHAKE_ACCEPT signature", { ip: rinfo.address }, "network");
        return;
      }
      const derivedId = getUPeerIdFromPublicKey(Buffer.from(data.publicKey, "hex"));
      if (derivedId !== senderRevelnestId) {
        security("HANDSHAKE_ACCEPT ID mismatch", { ip: rinfo.address, expected: derivedId, received: senderRevelnestId }, "network");
        return;
      }
      network("Handshake accepted verified", rinfo.address, { upeerId: senderRevelnestId }, "handshake");
      if (!rateLimiter.checkIdentity(rinfo.address, senderRevelnestId, data.type)) {
        return;
      }
      const ghost = await getContactByAddress(rinfo.address);
      if (ghost && ghost.upeerId.startsWith("pending-")) {
        deleteContact(ghost.upeerId);
      }
      const existing = await getContactByRevelnestId(senderRevelnestId);
      if (existing && existing.status === "pending") {
        const keyResult = updateContactPublicKey(senderRevelnestId, data.publicKey);
        if (keyResult.changed && keyResult.oldKey) {
          Promise.resolve().then(() => keys).then(({ computeKeyFingerprint: computeKeyFingerprint2 }) => {
            win == null ? void 0 : win.webContents.send("key-change-alert", {
              upeerId: senderRevelnestId,
              oldFingerprint: computeKeyFingerprint2(keyResult.oldKey),
              newFingerprint: computeKeyFingerprint2(keyResult.newKey),
              alias: data.alias || existing.name
            });
          }).catch(() => {
          });
        }
        if (data.ephemeralPublicKey) {
          updateContactEphemeralPublicKey(senderRevelnestId, data.ephemeralPublicKey);
        }
        if (data.signedPreKey && typeof data.signedPreKey === "object") {
          const { spkPub, spkSig, spkId: spkId2 } = data.signedPreKey;
          if (typeof spkPub === "string" && typeof spkSig === "string" && typeof spkId2 === "number") {
            try {
              const spkValid = verify(
                Buffer.from(spkPub, "hex"),
                Buffer.from(spkSig, "hex"),
                Buffer.from(data.publicKey, "hex")
              );
              if (spkValid) {
                Promise.resolve().then(() => keys).then(({ updateContactSignedPreKey: updateContactSignedPreKey2 }) => {
                  updateContactSignedPreKey2(senderRevelnestId, spkPub, spkSig, spkId2);
                }).catch(() => {
                });
              }
            } catch {
            }
          }
        }
        if (data.alias) {
          import("./db-Cln22U_j.js").then(({ updateContactName: updateContactName2 }) => {
            updateContactName2 == null ? void 0 : updateContactName2(senderRevelnestId, data.alias);
          }).catch(() => {
          });
        }
        if (data.avatar && typeof data.avatar === "string" && data.avatar.startsWith("data:image/")) {
          import("./db-Cln22U_j.js").then(({ updateContactAvatar: updateContactAvatar2 }) => {
            updateContactAvatar2 == null ? void 0 : updateContactAvatar2(senderRevelnestId, data.avatar);
          }).catch(() => {
          });
        }
        if (data.publicKey) {
          import("./pending-outbox-CDR7A3lj.js").then(({ flushPendingOutbox }) => {
            flushPendingOutbox(senderRevelnestId, data.publicKey).catch(() => {
            });
          }).catch(() => {
          });
        }
        win == null ? void 0 : win.webContents.send("contact-handshake-finished", { upeerId: senderRevelnestId });
      }
      return;
    }
    const upeerId2 = senderRevelnestId;
    if (!upeerId2) return;
    const contact = await getContactByRevelnestId(upeerId2);
    if (!contact || contact.status !== "connected" || !contact.publicKey) {
      security("Origin not connected or missing key", { upeerId: upeerId2, ip: rinfo.address }, "network");
      return;
    }
    if (data.type === "FILE_CHUNK") {
      debug("FILE_CHUNK pre-verify", { fileId: data.fileId, chunkIndex: data.chunkIndex }, "file-transfer");
    }
    const fieldsToExclude = ["contactCache", "renewalToken"];
    const dataForVerification = { ...data };
    fieldsToExclude.forEach((field) => {
      if (field in dataForVerification) {
        delete dataForVerification[field];
      }
    });
    const payloadForVerification = { ...dataForVerification, senderRevelnestId, senderYggAddress };
    let verified = verify(
      Buffer.from(canonicalStringify(payloadForVerification)),
      Buffer.from(signature, "hex"),
      Buffer.from(contact.publicKey, "hex")
    );
    if (!verified) {
      const legacyPayload = { ...dataForVerification, senderRevelnestId };
      verified = verify(
        Buffer.from(canonicalStringify(legacyPayload)),
        Buffer.from(signature, "hex"),
        Buffer.from(contact.publicKey, "hex")
      );
    }
    if (!verified) {
      security("Invalid signature", { upeerId: upeerId2, ip: rinfo.address }, "network");
      return;
    } else if (data.type === "FILE_CHUNK") {
      debug("FILE_CHUNK signature verified", { fileId: data.fileId, chunkIndex: data.chunkIndex }, "file-transfer");
    }
    if (!rateLimiter.checkIdentity(rinfo.address, upeerId2, data.type)) {
      return;
    }
    const YGG_ADDR_RE = /^[23][0-9a-f]{2}:/i;
    if (contact.address !== rinfo.address && YGG_ADDR_RE.test(rinfo.address)) {
      updateContactLocation(upeerId2, rinfo.address);
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    updateLastSeen(upeerId2);
    win == null ? void 0 : win.webContents.send("contact-presence", {
      upeerId: upeerId2,
      lastSeen: nowIso,
      alias: data.alias ?? void 0,
      avatar: data.avatar ?? void 0
    });
    if (data.type.startsWith("DHT_")) {
      const handled = await handleDhtPacket(
        data.type,
        data,
        upeerId2,
        rinfo.address,
        win,
        sendResponse
      );
      if (handled) {
        return;
      }
    }
    switch (data.type) {
      case "PING":
        sendResponse(rinfo.address, { type: "PONG" });
        if (data.alias && typeof data.alias === "string") {
          import("./db-Cln22U_j.js").then(({ updateContactName: updateContactName2 }) => {
            updateContactName2 == null ? void 0 : updateContactName2(upeerId2, data.alias);
          }).catch(() => {
          });
        }
        if (data.avatar && typeof data.avatar === "string" && data.avatar.startsWith("data:image/")) {
          import("./db-Cln22U_j.js").then(({ updateContactAvatar: updateContactAvatar2 }) => {
            updateContactAvatar2 == null ? void 0 : updateContactAvatar2(upeerId2, data.avatar);
          }).catch(() => {
          });
        }
        break;
      case "VAULT_STORE":
        await (await import("./handlers-CK4O6Knu.js")).handleVaultStore(upeerId2, data, rinfo.address, sendResponse);
        break;
      case "VAULT_QUERY":
        await (await import("./handlers-CK4O6Knu.js")).handleVaultQuery(upeerId2, data, rinfo.address, sendResponse);
        break;
      case "VAULT_ACK":
        await (await import("./handlers-CK4O6Knu.js")).handleVaultAck(upeerId2, data);
        break;
      case "VAULT_DELIVERY":
        await handleVaultDelivery(upeerId2, data, win, sendResponse, rinfo.address);
        break;
      case "VAULT_RENEW":
        await (await import("./handlers-CK4O6Knu.js")).handleVaultRenew(upeerId2, data);
        break;
      case "CHAT":
        handleChatMessage(upeerId2, contact, data, win, signature, rinfo.address, sendResponse);
        break;
      case "ACK":
        handleAck(upeerId2, data, win);
        break;
      case "READ":
        handleReadReceipt(upeerId2, data, win);
        break;
      case "TYPING":
        win == null ? void 0 : win.webContents.send("peer-typing", { upeerId: upeerId2 });
        break;
      case "CHAT_CONTACT":
        handleChatContact(upeerId2, data, win);
        break;
      case "CHAT_REACTION":
        handleIncomingReaction(upeerId2, data, win);
        break;
      case "CHAT_UPDATE":
        handleIncomingUpdate(upeerId2, contact, data, win, signature);
        break;
      case "CHAT_DELETE":
        handleIncomingDelete(upeerId2, data, win);
        break;
      case "FILE_PROPOSAL":
      case "FILE_START":
      case "FILE_ACCEPT":
      case "FILE_CHUNK":
      case "FILE_CHUNK_ACK":
      case "FILE_ACK":
      case "FILE_DONE_ACK":
      case "FILE_END":
      case "FILE_CANCEL":
        transferManager.handleMessage(upeerId2, rinfo.address, data);
        break;
      case "GROUP_MSG":
        handleGroupMessage(upeerId2, contact, data, win, rinfo.address);
        break;
      case "GROUP_ACK":
        handleGroupAck(upeerId2, data, win);
        break;
      case "GROUP_INVITE":
        handleGroupInvite(upeerId2, data, win);
        break;
      case "GROUP_UPDATE":
        handleGroupUpdate(upeerId2, data, win);
        break;
      case "GROUP_LEAVE":
        handleGroupLeave(upeerId2, data, win);
        break;
      case "REPUTATION_GOSSIP": {
        const ourIds = new Set(getGossipIds());
        const theirIds = data.ids ?? [];
        const missing = theirIds.filter((id) => !ourIds.has(id)).slice(0, 100);
        if (missing.length > 0) {
          sendResponse(rinfo.address, { type: "REPUTATION_REQUEST", missing });
        }
        break;
      }
      case "REPUTATION_REQUEST": {
        const requested = data.missing ?? [];
        const vouches2 = getVouchesForDelivery(requested);
        if (vouches2.length > 0) {
          sendResponse(rinfo.address, { type: "REPUTATION_DELIVER", vouches: vouches2 });
        }
        break;
      }
      case "REPUTATION_DELIVER": {
        const received = data.vouches ?? [];
        for (const v of received) {
          saveIncomingVouch(v).catch(() => {
          });
        }
        break;
      }
      default:
        warn("Unknown packet", { upeerId: upeerId2, type: data.type, ip: rinfo.address }, "network");
    }
  } catch (e) {
    error("UDP Packet Error", e, "network");
  }
}
async function handleVaultDelivery(senderSid, data, win, sendResponse, fromAddress) {
  if (!Array.isArray(data.entries)) {
    security("VAULT_DELIVERY: entries no es un array", { from: senderSid }, "vault");
    return;
  }
  const MAX_DELIVERY_ENTRIES = 50;
  const entries = data.entries.slice(0, MAX_DELIVERY_ENTRIES);
  debug("Handling vault delivery", { count: entries.length, from: senderSid }, "vault");
  issueVouch(senderSid, VouchType.VAULT_RETRIEVED).catch(() => {
  });
  const validatedHashes = [];
  try {
    for (const entry of entries) {
      try {
        const originalContact = await getContactByRevelnestId(entry.senderSid);
        if (!originalContact) {
          warn("Vault entry from unknown original sender", { senderSid: entry.senderSid }, "vault");
          continue;
        }
        let innerPacket = null;
        try {
          innerPacket = JSON.parse(Buffer.from(entry.data, "hex").toString());
        } catch (e) {
        }
        if (innerPacket && innerPacket.signature) {
          const { signature: innerSig, senderRevelnestId, ...innerData } = innerPacket;
          const isInnerValid = verify(
            Buffer.from(canonicalStringify(innerData)),
            Buffer.from(innerSig, "hex"),
            Buffer.from(originalContact.publicKey, "hex")
          );
          if (!isInnerValid) {
            security("Vault delivery integrity failure!", { originalSender: entry.senderSid, custodian: senderSid }, "vault");
            issueVouch(senderSid, VouchType.INTEGRITY_FAIL).catch(() => {
            });
            continue;
          }
          if (innerPacket.type === "CHAT") {
            await handleChatMessage(entry.senderSid, originalContact, innerPacket, win, innerSig, fromAddress, sendResponse);
          } else if (innerPacket.type === "FILE_DATA_SMALL") {
            saveFileMessage(innerPacket.fileHash, entry.senderSid, false, {
              fileHash: innerPacket.fileHash,
              data: innerPacket.data,
              state: "completed"
            });
          } else if (innerPacket.type.startsWith("FILE_")) {
            transferManager.handleMessage(entry.senderSid, fromAddress, innerPacket);
          } else if (innerPacket.type === "GROUP_MSG") {
            await handleGroupMessage(entry.senderSid, originalContact, innerPacket, win);
          } else if (innerPacket.type === "CHAT_DELETE") {
            await handleIncomingDelete(entry.senderSid, innerPacket, win);
          } else if (innerPacket.type === "GROUP_INVITE") {
            await handleGroupInvite(entry.senderSid, innerPacket, win);
          } else if (innerPacket.type === "GROUP_UPDATE") {
            await handleGroupUpdate(entry.senderSid, innerPacket, win);
          }
        } else {
          if (entry.payloadHash.startsWith("shard:")) {
            debug("Received file shard from vault", { cid: entry.payloadHash }, "vault");
            issueVouch(senderSid, VouchType.VAULT_CHUNK).catch(() => {
            });
            const [_, fileHash, shardIndex] = entry.payloadHash.split(":");
            if (fileHash && shardIndex) {
              saveFileMessage(fileHash, entry.senderSid, false, {
                fileHash,
                shardIndex: parseInt(shardIndex),
                data: entry.data,
                state: "completed"
              });
            }
          }
        }
        validatedHashes.push(entry.payloadHash);
      } catch (err) {
        error("Failed to process delivered vault entry", err, "vault");
      }
    }
  } catch (err) {
    error("Vault delivery processing failed", err, "vault");
  }
  if (validatedHashes.length > 0) {
    sendResponse(fromAddress, {
      type: "VAULT_ACK",
      payloadHashes: validatedHashes
    });
  }
  if (data.hasMore === true && typeof data.nextOffset === "number") {
    const myId = getMyUPeerId();
    sendResponse(fromAddress, {
      type: "VAULT_QUERY",
      requesterSid: myId,
      offset: data.nextOffset
    });
    debug("Vault delivery: requesting next page", { offset: data.nextOffset, from: senderSid }, "vault");
  }
}
async function handleChatMessage(upeerId2, contact, data, win, signature, fromAddress, sendResponse) {
  const msgId = data.id || crypto$1.randomUUID();
  if (data.ephemeralPublicKey) {
    updateContactEphemeralPublicKey(upeerId2, data.ephemeralPublicKey);
  }
  let displayContent = data.content;
  if (data.ratchetHeader) {
    try {
      const { getRatchetSession, saveRatchetSession } = await import("./index-Bqy1W93v.js");
      const { x3dhResponder, ratchetInitBob, ratchetDecrypt } = await import("./ratchet-CVCdiEOM.js");
      const { getMyIdentitySkBuffer: getMyIdentitySkBuffer2, getSpkBySpkId: getSpkBySpkId2 } = await Promise.resolve().then(() => identity);
      let session2 = getRatchetSession(upeerId2);
      if (!session2 && data.x3dhInit) {
        const { ekPub, ikPub, spkId: usedSpkId } = data.x3dhInit;
        const aliceIkPk = Buffer.from(ikPub, "hex");
        const aliceEkPk = Buffer.from(ekPub, "hex");
        const bobIkSk = getMyIdentitySkBuffer2();
        const spkEntry = getSpkBySpkId2(usedSpkId);
        if (!spkEntry) {
          error("X3DH: SPK no encontrado por ID (rotación muy antigua)", { usedSpkId, upeerId: upeerId2 }, "security");
          throw new Error("spk-not-found");
        }
        const { spkPk: bobSpkPk, spkSk: bobSpkSk } = spkEntry;
        const sharedSecret = x3dhResponder(bobIkSk, bobSpkSk, aliceIkPk, aliceEkPk);
        session2 = ratchetInitBob(sharedSecret, bobSpkPk, bobSpkSk);
        sharedSecret.fill(0);
      }
      if (session2) {
        const plaintext = ratchetDecrypt(session2, data.ratchetHeader, data.content, data.nonce);
        if (plaintext) {
          saveRatchetSession(upeerId2, session2);
          displayContent = plaintext.toString("utf-8");
        } else {
          displayContent = "🔒 [Error de descifrado DR]";
          error("Double Ratchet decrypt returned null", { upeerId: upeerId2 }, "security");
        }
      } else {
        displayContent = "🔒 [Sin sesión Double Ratchet]";
      }
    } catch (err) {
      displayContent = "🔒 [Error crítico DR]";
      error("Double Ratchet decrypt failed", err, "security");
    }
  } else if (data.nonce) {
    try {
      const senderKeyHex = data.useRecipientEphemeral ? data.ephemeralPublicKey : contact.publicKey;
      const useEphemeral = !!data.useRecipientEphemeral;
      if (!senderKeyHex) throw new Error("La llave pública del remitente no está disponible para descifrar");
      const decrypted = decrypt(
        Buffer.from(data.content, "hex"),
        Buffer.from(data.nonce, "hex"),
        Buffer.from(senderKeyHex, "hex"),
        useEphemeral
      );
      if (decrypted) {
        displayContent = decrypted.toString("utf-8");
      } else {
        displayContent = "🔒 [Error de descifrado]";
      }
    } catch (err) {
      displayContent = "🔒 [Error crítico de seguridad]";
      error("Decryption failed", err, "security");
    }
  }
  const saved = saveMessage(msgId, upeerId2, false, displayContent, data.replyTo, signature);
  const isNew = (saved == null ? void 0 : saved.changes) > 0;
  if (isNew) {
    win == null ? void 0 : win.webContents.send("receive-p2p-message", {
      id: msgId,
      upeerId: upeerId2,
      isMine: false,
      message: displayContent,
      replyTo: data.replyTo,
      status: "received",
      encrypted: !!data.nonce
    });
  }
  sendResponse(fromAddress, { type: "ACK", id: msgId });
}
function handleChatContact(upeerId2, data, win) {
  const { id: msgId, contactName, contactAddress, upeerId: sharedRevelnestId, contactPublicKey } = data;
  if (!msgId || !sharedRevelnestId || !contactPublicKey) return;
  const displayText = `CONTACT_CARD|${contactName || sharedRevelnestId}`;
  saveMessage(msgId, upeerId2, false, displayText, void 0, void 0, "delivered");
  win == null ? void 0 : win.webContents.send("receive-p2p-message", {
    id: msgId,
    upeerId: upeerId2,
    isMine: false,
    message: displayText,
    status: "delivered",
    contactCard: {
      upeerId: sharedRevelnestId,
      name: contactName,
      address: contactAddress,
      publicKey: contactPublicKey
    }
  });
}
function handleAck(upeerId2, data, win) {
  if (data.id) {
    updateMessageStatus(data.id, "delivered");
    win == null ? void 0 : win.webContents.send("message-delivered", { id: data.id, upeerId: upeerId2 });
  }
}
function handleReadReceipt(upeerId2, data, win) {
  if (data.id) {
    updateMessageStatus(data.id, "read");
    win == null ? void 0 : win.webContents.send("message-read", { id: data.id, upeerId: upeerId2 });
  }
}
async function handleIncomingReaction(upeerId2, data, win) {
  const { msgId, emoji, remove } = data;
  if (remove) {
    deleteReaction(msgId, upeerId2, emoji);
  } else {
    saveReaction(msgId, upeerId2, emoji);
  }
  win == null ? void 0 : win.webContents.send("message-reaction-updated", { msgId, upeerId: upeerId2, emoji, remove });
}
async function handleIncomingUpdate(upeerId2, contact, data, win, signature) {
  const { msgId, content, nonce, ephemeralPublicKey: ephemeralPublicKey2, useRecipientEphemeral } = data;
  let displayContent = content;
  if (nonce) {
    const senderKeyHex = useRecipientEphemeral ? ephemeralPublicKey2 : contact.publicKey;
    const decrypted = decrypt(
      Buffer.from(content, "hex"),
      Buffer.from(nonce, "hex"),
      Buffer.from(senderKeyHex, "hex"),
      !!useRecipientEphemeral
    );
    if (decrypted) displayContent = decrypted.toString("utf-8");
  }
  const { getMessageById: getMessageById2 } = await import("./db-Cln22U_j.js");
  const existingMsg = await getMessageById2(msgId);
  if (existingMsg) {
    const isAuthorized = existingMsg.isMine ? false : existingMsg.chatRevelnestId === upeerId2;
    if (!isAuthorized) {
      security("Unauthorized CHAT_UPDATE attempt!", { requester: upeerId2, msgId }, "security");
      issueVouch(upeerId2, VouchType.MALICIOUS).catch(() => {
      });
      return;
    }
  }
  updateMessageContent(msgId, displayContent, signature);
  win == null ? void 0 : win.webContents.send("message-updated", { id: msgId, upeerId: upeerId2, content: displayContent });
}
async function handleIncomingDelete(upeerId2, data, win) {
  const { signature: deleteSig, senderRevelnestId: _vaultSender, ...signedFields } = data;
  const msgId = signedFields.msgId;
  if (!msgId) return;
  const contact = await getContactByRevelnestId(upeerId2);
  if (!contact || !contact.publicKey) {
    warn("Delete request from unknown or unkeyed contact", { upeerId: upeerId2 }, "security");
    return;
  }
  if (deleteSig) {
    const { verify: verify2 } = await Promise.resolve().then(() => identity);
    const { canonicalStringify: canonicalStringify2 } = await Promise.resolve().then(() => utils);
    const isValid = verify2(
      Buffer.from(canonicalStringify2(signedFields)),
      Buffer.from(deleteSig, "hex"),
      Buffer.from(contact.publicKey, "hex")
    );
    if (!isValid) {
      security("INVALID delete request signature!", { upeerId: upeerId2, msgId }, "security");
      issueVouch(upeerId2, VouchType.INTEGRITY_FAIL).catch(() => {
      });
      return;
    }
  }
  const { getMessageById: getMessageById2 } = await import("./db-Cln22U_j.js");
  const existingMsg = await getMessageById2(msgId);
  if (existingMsg) {
    const isAuthorized = existingMsg.isMine || existingMsg.chatRevelnestId === upeerId2;
    if (!isAuthorized) {
      security("Unauthorized delete attempt!", { requester: upeerId2, msgId }, "security");
      issueVouch(upeerId2, VouchType.MALICIOUS).catch(() => {
      });
      return;
    }
  }
  deleteMessageLocally(msgId);
  win == null ? void 0 : win.webContents.send("message-deleted", { id: msgId, upeerId: upeerId2 });
  debug("Message deleted via P2P command", { msgId, requester: upeerId2 }, "network");
}
async function handleGroupMessage(upeerId2, contact, data, win, senderAddress) {
  const { id, groupId, groupName, content, nonce, ephemeralPublicKey: ephemeralPublicKey2, useRecipientEphemeral, replyTo } = data;
  if (!groupId || !content) return;
  const existingGroup = getGroupById(groupId);
  if (!existingGroup) {
    security("GROUP_MSG para grupo desconocido — rechazado", { sender: upeerId2, groupId }, "security");
    return;
  }
  if (!existingGroup.members.includes(upeerId2)) {
    security("Unauthorized group message!", { sender: upeerId2, groupId }, "security");
    issueVouch(upeerId2, VouchType.MALICIOUS).catch(() => {
    });
    return;
  }
  const msgId = id || crypto$1.randomUUID();
  let displayContent = content;
  if (nonce) {
    try {
      const { decrypt: decrypt2 } = await Promise.resolve().then(() => identity);
      const senderKeyHex = useRecipientEphemeral ? ephemeralPublicKey2 : contact.publicKey;
      if (senderKeyHex) {
        const decrypted = decrypt2(
          Buffer.from(content, "hex"),
          Buffer.from(nonce, "hex"),
          Buffer.from(senderKeyHex, "hex"),
          !!useRecipientEphemeral
        );
        if (decrypted) displayContent = decrypted.toString("utf-8");
        else displayContent = "🔒 [Error de descifrado]";
      }
    } catch (err) {
      displayContent = "🔒 [Error crítico de seguridad]";
    }
  }
  const savedGroup = saveMessage(msgId, groupId, false, displayContent, replyTo, void 0, "delivered");
  const isNewGroupMsg = (savedGroup == null ? void 0 : savedGroup.changes) > 0;
  const ackAddress = senderAddress || (contact == null ? void 0 : contact.address);
  if (ackAddress) {
    const { sendSecureUDPMessage: sendSecureUDPMessage2 } = await Promise.resolve().then(() => server);
    sendSecureUDPMessage2(ackAddress, { type: "GROUP_ACK", id: msgId, groupId });
  }
  if (isNewGroupMsg) {
    win == null ? void 0 : win.webContents.send("receive-group-message", {
      id: msgId,
      groupId,
      senderRevelnestId: upeerId2,
      senderName: contact.name,
      isMine: false,
      message: displayContent,
      replyTo,
      status: "delivered"
    });
  }
}
function handleGroupAck(upeerId2, data, win) {
  const { id: msgId, groupId } = data;
  if (!msgId) return;
  updateMessageStatus(msgId, "delivered");
  win == null ? void 0 : win.webContents.send("group-message-delivered", { id: msgId, groupId, upeerId: upeerId2 });
}
async function handleGroupInvite(upeerId2, data, win) {
  var _a2;
  const { groupId, adminRevelnestId } = data;
  if (!groupId || !data.payload || !data.nonce) return;
  let groupName;
  let members;
  let avatar;
  try {
    const senderKey = (_a2 = await getContactByRevelnestId(upeerId2)) == null ? void 0 : _a2.publicKey;
    if (!senderKey) {
      security("GROUP_INVITE: no sender key to decrypt", { upeerId: upeerId2 }, "security");
      return;
    }
    const decrypted = decrypt(
      Buffer.from(data.payload, "hex"),
      Buffer.from(data.nonce, "hex"),
      Buffer.from(senderKey, "hex"),
      !!data.useRecipientEphemeral
    );
    if (!decrypted) {
      security("GROUP_INVITE: decryption failed", { upeerId: upeerId2, groupId }, "security");
      return;
    }
    const inner = JSON.parse(decrypted.toString("utf-8"));
    groupName = inner.groupName;
    members = inner.members;
    avatar = inner.avatar;
  } catch {
    security("GROUP_INVITE: parse error after decrypt", { upeerId: upeerId2 }, "security");
    return;
  }
  if (!groupName) return;
  if (typeof groupName !== "string" || groupName.length > 100) {
    security("GROUP_INVITE: groupName inválido o demasiado largo", { upeerId: upeerId2 }, "security");
    return;
  }
  if (!Array.isArray(members) || members.length > 500) {
    security("GROUP_INVITE: lista de members inválida o demasiado grande", { upeerId: upeerId2 }, "security");
    return;
  }
  const actualAdmin = adminRevelnestId || upeerId2;
  if (upeerId2 !== actualAdmin) {
    security("Identity mismatch in group invite!", { sender: upeerId2, claimedAdmin: adminRevelnestId }, "security");
    issueVouch(upeerId2, VouchType.MALICIOUS).catch(() => {
    });
    return;
  }
  const existing = getGroupById(groupId);
  if (!existing) {
    saveGroup(groupId, groupName, actualAdmin, members || [upeerId2], "active", avatar);
  } else {
    if (!existing.members.includes(upeerId2)) {
      security("Group invite from non-member!", { sender: upeerId2, groupId }, "security");
      issueVouch(upeerId2, VouchType.MALICIOUS).catch(() => {
      });
      return;
    }
  }
  win == null ? void 0 : win.webContents.send("group-invite-received", {
    groupId,
    groupName,
    adminRevelnestId: actualAdmin,
    members: members || []
  });
}
async function handleGroupUpdate(senderRevelnestId, data, win) {
  var _a2;
  const { groupId, adminRevelnestId } = data;
  if (!groupId) return;
  const group = getGroupById(groupId);
  if (!group) return;
  const claimedAdmin = adminRevelnestId || senderRevelnestId;
  if (group.adminRevelnestId !== claimedAdmin || senderRevelnestId !== claimedAdmin) {
    security("GROUP_UPDATE de no-admin ignorado", { sender: senderRevelnestId, groupId }, "security");
    return;
  }
  if (!data.payload || !data.nonce) return;
  let fields = {};
  try {
    const senderKey = (_a2 = await getContactByRevelnestId(senderRevelnestId)) == null ? void 0 : _a2.publicKey;
    if (!senderKey) return;
    const decrypted = decrypt(
      Buffer.from(data.payload, "hex"),
      Buffer.from(data.nonce, "hex"),
      Buffer.from(senderKey, "hex"),
      !!data.useRecipientEphemeral
    );
    if (!decrypted) {
      security("GROUP_UPDATE: decryption failed", { senderRevelnestId, groupId }, "security");
      return;
    }
    const inner = JSON.parse(decrypted.toString("utf-8"));
    if (inner.groupName && typeof inner.groupName === "string" && inner.groupName.length <= 100) fields.name = inner.groupName;
    if (inner.avatar !== void 0) fields.avatar = inner.avatar;
  } catch {
    security("GROUP_UPDATE: parse error", { senderRevelnestId }, "security");
    return;
  }
  if (Object.keys(fields).length === 0) return;
  updateGroupInfo(groupId, fields);
  win == null ? void 0 : win.webContents.send("group-updated", {
    groupId,
    ...fields.name !== void 0 ? { name: fields.name } : {},
    ...fields.avatar !== void 0 ? { avatar: fields.avatar } : {}
  });
}
async function handleGroupLeave(upeerId2, data, win) {
  const { groupId, signature: leaveSig, ...leaveData } = data;
  if (!groupId) return;
  const contact = await getContactByRevelnestId(upeerId2);
  if (!(contact == null ? void 0 : contact.publicKey)) {
    warn("GROUP_LEAVE from unknown contact", { upeerId: upeerId2 }, "security");
    return;
  }
  if (leaveSig) {
    const { verify: verify2 } = await Promise.resolve().then(() => identity);
    const { canonicalStringify: canonicalStringify2 } = await Promise.resolve().then(() => utils);
    const isValid = verify2(
      Buffer.from(canonicalStringify2(leaveData)),
      Buffer.from(leaveSig, "hex"),
      Buffer.from(contact.publicKey, "hex")
    );
    if (!isValid) {
      security("Invalid GROUP_LEAVE signature", { upeerId: upeerId2, groupId }, "security");
      return;
    }
  }
  const group = getGroupById(groupId);
  if (!group) return;
  const newMembers = group.members.filter((m) => m !== upeerId2);
  updateGroupMembers(groupId, newMembers);
  const senderName = contact.name || upeerId2;
  const systemMsgId = crypto$1.randomUUID();
  const systemText = `${senderName} dejó el grupo`;
  saveMessage(systemMsgId, groupId, false, `__SYS__|${systemText}`, void 0, void 0, "delivered");
  win == null ? void 0 : win.webContents.send("group-updated", { groupId, members: newMembers });
  win == null ? void 0 : win.webContents.send("receive-group-message", {
    id: systemMsgId,
    groupId,
    senderRevelnestId: upeerId2,
    senderName: null,
    isMine: false,
    message: systemText,
    status: "delivered",
    isSystem: true
  });
}
const handlers = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  cleanupRateLimiter,
  handleAck,
  handleChatMessage,
  handlePacket,
  handleReadReceipt
}, Symbol.toStringTag, { value: "Module" }));
let lastKnownIp = null;
function broadcastDhtUpdate(sendSecureUDPMessage2) {
  const currentIp = getNetworkAddress();
  if (!currentIp) return;
  if (currentIp !== lastKnownIp) {
    lastKnownIp = currentIp;
    const newSeq = incrementMyDhtSeq();
    network("IP detected/changed", void 0, { currentIp, newSeq }, "dht");
    const locBlock = generateSignedLocationBlock(currentIp, newSeq);
    publishLocationBlock(currentIp, newSeq, locBlock.signature, locBlock.renewalToken).catch((err) => {
      warn("Failed to publish location block", err, "kademlia");
    });
    const contacts2 = getContacts();
    const intimateContacts = contacts2.filter((c) => c.status === "connected").slice(0, 10);
    for (const contact of intimateContacts) {
      sendSecureUDPMessage2(contact.address, {
        type: "DHT_UPDATE",
        locationBlock: locBlock
      });
    }
    network("Update propagated", void 0, { intimateContacts: intimateContacts.length }, "dht");
  }
}
async function sendDhtExchange(targetRevelnestId, sendSecureUDPMessage2) {
  const targetContact = await getContactByRevelnestId(targetRevelnestId);
  if (!targetContact || targetContact.status !== "connected") return;
  const kademlia2 = getKademliaInstance();
  if (kademlia2) {
    const closestContacts = kademlia2.findClosestContacts(targetRevelnestId, 5);
    const filteredContacts = closestContacts.filter((c) => c.upeerId !== targetRevelnestId && c.dhtSignature);
    const payload = await Promise.all(
      filteredContacts.map(async (c) => {
        const dbContact = await getContactByRevelnestId(c.upeerId);
        return {
          upeerId: c.upeerId,
          publicKey: c.publicKey,
          locationBlock: {
            address: c.address,
            dhtSeq: c.dhtSeq,
            signature: c.dhtSignature,
            expiresAt: (dbContact == null ? void 0 : dbContact.dhtExpiresAt) ?? void 0,
            renewalToken: (dbContact == null ? void 0 : dbContact.renewalToken) ? (() => {
              try {
                return JSON.parse(dbContact.renewalToken);
              } catch {
                return void 0;
              }
            })() : void 0
          }
        };
      })
    );
    if (payload.length > 0) {
      sendSecureUDPMessage2(targetContact.address, {
        type: "DHT_EXCHANGE",
        peers: payload
      });
    }
  } else {
    const allContacts = getContacts();
    const distanceXOR = (idA, idB) => {
      try {
        return BigInt("0x" + idA) ^ BigInt("0x" + idB);
      } catch {
        return BigInt(0);
      }
    };
    const payload = allContacts.filter((c) => c.status === "connected" && c.dhtSignature && c.upeerId !== targetRevelnestId).map((c) => ({
      upeerId: c.upeerId,
      publicKey: c.publicKey,
      locationBlock: {
        address: c.address,
        dhtSeq: c.dhtSeq,
        signature: c.dhtSignature,
        // BUG BP fix: campo Drizzle es dhtExpiresAt, no expiresAt.
        // renewalToken se guarda como JSON string → parsear al leer.
        expiresAt: c.dhtExpiresAt,
        renewalToken: c.renewalToken ? (() => {
          try {
            return JSON.parse(c.renewalToken);
          } catch {
            return void 0;
          }
        })() : void 0
      },
      dist: distanceXOR(c.upeerId, targetRevelnestId)
    })).sort((a, b) => a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0).map(({ dist, ...data }) => data);
    const limitedPayload = payload.slice(0, 5);
    if (limitedPayload.length > 0) {
      sendSecureUDPMessage2(targetContact.address, {
        type: "DHT_EXCHANGE",
        peers: limitedPayload
      });
    }
  }
}
async function startDhtSearch(upeerId2, sendSecureUDPMessage2) {
  network("Starting active DHT search", void 0, { upeerId: upeerId2 }, "dht-search");
  const location = await findNodeLocation(upeerId2);
  if (location) {
    network("Found via DHT lookup", void 0, { upeerId: upeerId2, location }, "kademlia");
    return;
  }
  const kademlia2 = getKademliaInstance();
  if (kademlia2) {
    network("Starting iterative search", void 0, { upeerId: upeerId2 }, "kademlia");
    iterativeFindNode(upeerId2, sendSecureUDPMessage2).catch((err) => {
      warn("Iterative search failed", err, "kademlia");
    });
  } else {
    const allContacts = getContacts();
    const distanceXOR = (idA, idB) => {
      try {
        return BigInt("0x" + idA) ^ BigInt("0x" + idB);
      } catch {
        return BigInt(0);
      }
    };
    const queryTargets = allContacts.filter((c) => c.status === "connected" && c.upeerId !== upeerId2).map((c) => ({
      upeerId: c.upeerId,
      address: c.address,
      dist: distanceXOR(c.upeerId, upeerId2),
      hasRenewalToken: !!c.renewalToken,
      expiresAt: c.expiresAt
    })).sort((a, b) => {
      if (a.hasRenewalToken && !b.hasRenewalToken) return -1;
      if (!a.hasRenewalToken && b.hasRenewalToken) return 1;
      return a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0;
    }).slice(0, 5);
    for (const target of queryTargets) {
      sendSecureUDPMessage2(target.address, {
        type: "DHT_QUERY",
        targetId: upeerId2,
        // Include referral context for better routing
        referralContext: {
          requester: getMyUPeerId(),
          timestamp: Date.now()
        }
      });
    }
  }
}
const K = 20;
const ID_LENGTH_BITS = 160;
const ID_LENGTH_BYTES = ID_LENGTH_BITS / 8;
const BUCKET_COUNT = ID_LENGTH_BITS;
const REFRESH_INTERVAL_MS = 36e5;
const TTL_MS = 2592e6;
const BOOTSTRAP_MIN_NODES = 10;
const BOOTSTRAP_RETRY_MS = 3e4;
const SEED_NODES = [
  // Nodos semilla iniciales - en producción se cargarían desde:
  // 1. Configuración hardcoded en la app
  // 2. DNS TXT records (dht-seeds.upeer.chat)
  // 3. Archivo de configuración local
  // 
  // Formato ejemplo:
  // {
  //     upeerId: "802d20068fe07d3c3c16a15491210cd2",
  //     address: "200:xxxx:xxxx:xxxx::xxxx",
  //     publicKey: "a1b2c3d4e5f6..."
  // }
];
function toKademliaId(upeerId2) {
  const hash = crypto$1.createHash("sha256");
  hash.update(upeerId2, "hex");
  return hash.digest().slice(0, ID_LENGTH_BYTES);
}
function xorDistance(id1, id2) {
  if (id1.length !== id2.length) {
    throw new Error(`ID length mismatch: ${id1.length} vs ${id2.length}`);
  }
  const result = Buffer.alloc(id1.length);
  for (let i = 0; i < id1.length; i++) {
    result[i] = id1[i] ^ id2[i];
  }
  return result;
}
function compareDistance(a, b, target) {
  const distA = xorDistance(a, target);
  const distB = xorDistance(b, target);
  for (let i = 0; i < distA.length; i++) {
    if (distA[i] < distB[i]) return -1;
    if (distA[i] > distB[i]) return 1;
  }
  return 0;
}
function getBucketIndex(nodeId, otherId) {
  const distance = xorDistance(nodeId, otherId);
  for (let byte = 0; byte < distance.length; byte++) {
    if (distance[byte] !== 0) {
      for (let bit = 7; bit >= 0; bit--) {
        if (distance[byte] & 1 << bit) {
          return byte * 8 + (7 - bit);
        }
      }
    }
  }
  return 159;
}
class KBucket {
  constructor(maxSize = K) {
    this.contacts = [];
    this.lastUpdated = Date.now();
    this.maxSize = maxSize;
  }
  get size() {
    return this.contacts.length;
  }
  get all() {
    return [...this.contacts];
  }
  // Add or update a contact (LRU)
  add(contact) {
    const index = this.contacts.findIndex(
      (c) => c.upeerId === contact.upeerId
    );
    if (index !== -1) {
      this.contacts.splice(index, 1);
      this.contacts.push(contact);
    } else {
      if (this.contacts.length >= this.maxSize) {
        this.contacts.shift();
      }
      this.contacts.push(contact);
    }
    this.lastUpdated = Date.now();
    return true;
  }
  remove(upeerId2) {
    const index = this.contacts.findIndex((c) => c.upeerId === upeerId2);
    if (index !== -1) {
      this.contacts.splice(index, 1);
      return true;
    }
    return false;
  }
  findClosest(targetId, limit = K) {
    return this.contacts.sort((a, b) => compareDistance(a.nodeId, b.nodeId, targetId)).slice(0, limit);
  }
  needsRefresh() {
    return Date.now() - this.lastUpdated > REFRESH_INTERVAL_MS;
  }
}
class RoutingTable {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.buckets = new Array(BUCKET_COUNT);
    for (let i = 0; i < BUCKET_COUNT; i++) {
      this.buckets[i] = new KBucket();
    }
  }
  // Add a contact to the appropriate bucket
  addContact(contact) {
    if (contact.nodeId.equals(this.nodeId)) return false;
    const bucketIndex = getBucketIndex(this.nodeId, contact.nodeId);
    return this.buckets[bucketIndex].add(contact);
  }
  // Remove a contact
  removeContact(upeerId2) {
    const contact = this.findContact(upeerId2);
    if (!contact) return false;
    const bucketIndex = getBucketIndex(this.nodeId, contact.nodeId);
    return this.buckets[bucketIndex].remove(upeerId2);
  }
  // Find a contact by upeer ID
  findContact(upeerId2) {
    const targetId = toKademliaId(upeerId2);
    const bucketIndex = getBucketIndex(this.nodeId, targetId);
    const bucket = this.buckets[bucketIndex];
    return bucket.all.find((c) => c.upeerId === upeerId2) || null;
  }
  // Find the K closest contacts to a given ID
  findClosestContacts(targetRevelnestId, limit = K) {
    const targetId = toKademliaId(targetRevelnestId);
    const allContacts = [];
    for (const bucket of this.buckets) {
      allContacts.push(...bucket.all);
    }
    return allContacts.sort((a, b) => compareDistance(a.nodeId, b.nodeId, targetId)).slice(0, limit);
  }
  // Get total number of contacts
  getContactCount() {
    let total = 0;
    for (const bucket of this.buckets) {
      total += bucket.size;
    }
    return total;
  }
  // Get all contacts (for debugging)
  getAllContacts() {
    const allContacts = [];
    for (const bucket of this.buckets) {
      allContacts.push(...bucket.all);
    }
    return allContacts;
  }
  // Refresh buckets that need refreshing
  refreshStaleBuckets() {
    const refreshed = [];
    for (let i = 0; i < this.buckets.length; i++) {
      if (this.buckets[i].needsRefresh()) {
        refreshed.push(i);
      }
    }
    return refreshed;
  }
  // Get bucket by index (for debugging)
  getBucket(index) {
    return this.buckets[index];
  }
  // Get number of buckets
  getBucketCount() {
    return this.buckets.length;
  }
}
const MAX_STORE_ENTRIES = 1e4;
class ValueStore {
  constructor() {
    this.store = /* @__PURE__ */ new Map();
  }
  // Store a value
  set(key, value, publisher, signature) {
    const storedEntry = {
      key,
      value,
      publisher,
      timestamp: Date.now(),
      signature
    };
    const keyHex = key.toString("hex");
    if (!this.store.has(keyHex) && this.store.size >= MAX_STORE_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
      debug("ValueStore full — evicted oldest entry", { size: this.store.size }, "kademlia");
    }
    this.store.set(keyHex, storedEntry);
  }
  // Get a value by key
  get(key) {
    const keyHex = key.toString("hex");
    return this.store.get(keyHex) || null;
  }
  // Check if a key exists
  has(key) {
    const keyHex = key.toString("hex");
    return this.store.has(keyHex);
  }
  // Delete a value
  delete(key) {
    const keyHex = key.toString("hex");
    return this.store.delete(keyHex);
  }
  // Clean up expired values
  cleanupExpiredValues() {
    const now = Date.now();
    let removed = 0;
    for (const [key, value] of this.store.entries()) {
      if (now - value.timestamp > TTL_MS) {
        this.store.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      debug("Kademlia ValueStore: expired entries removed", { removed }, "kademlia");
    }
    return removed;
  }
  // Get all stored values (for debugging/maintenance)
  getAll() {
    return Array.from(this.store.values());
  }
  // Get size of store
  size() {
    return this.store.size;
  }
}
const SEED_DNS_DOMAIN = "dht-seeds.upeer.chat";
const LOCAL_SEEDS_FILE = "seednodes.json";
class BootstrapManager {
  constructor(routingTable, sendMessage, getContacts2, userDataPath) {
    this.routingTable = routingTable;
    this.sendMessage = sendMessage;
    this.getContacts = getContacts2;
    this.userDataPath = userDataPath;
    this.bootstrapped = false;
    this.lastBootstrapAttempt = 0;
    this.totalContacts = 0;
    this.stats = {
      bootstrapAttempts: 0,
      bootstrapSuccesses: 0
    };
  }
  // Load seed nodes from multiple sources
  async loadSeedNodes() {
    const seedNodes = [];
    const seenIds = /* @__PURE__ */ new Set();
    for (const seed of SEED_NODES) {
      if (!seenIds.has(seed.upeerId)) {
        seedNodes.push(seed);
        seenIds.add(seed.upeerId);
      }
    }
    try {
      const dnsSeeds = await this.loadSeedNodesFromDNS();
      for (const seed of dnsSeeds) {
        if (!seenIds.has(seed.upeerId)) {
          seedNodes.push(seed);
          seenIds.add(seed.upeerId);
        }
      }
    } catch (error2) {
      warn("Failed to load seed nodes from DNS", error2, "kademlia-bootstrap");
    }
    try {
      const fileSeeds = await this.loadSeedNodesFromFile();
      for (const seed of fileSeeds) {
        if (!seenIds.has(seed.upeerId)) {
          seedNodes.push(seed);
          seenIds.add(seed.upeerId);
        }
      }
    } catch (error2) {
      warn("Failed to load seed nodes from file", error2, "kademlia-bootstrap");
    }
    try {
      const lanSeeds = await this.loadSeedNodesFromLAN();
      for (const seed of lanSeeds) {
        if (!seenIds.has(seed.upeerId)) {
          seedNodes.push(seed);
          seenIds.add(seed.upeerId);
        }
      }
    } catch (error2) {
      warn("Failed to load seed nodes from LAN", error2, "kademlia-bootstrap");
    }
    info(`Loaded ${seedNodes.length} seed nodes from ${seenIds.size} unique sources`, void 0, "kademlia-bootstrap");
    return seedNodes;
  }
  // Load seed nodes from DNS TXT records
  async loadSeedNodesFromDNS() {
    const records = await dns.promises.resolveTxt(SEED_DNS_DOMAIN);
    const seedNodes = [];
    for (const record of records) {
      for (const entry of record) {
        try {
          const parts = entry.split(";");
          const seed = {};
          for (const part of parts) {
            const [key, value] = part.split("=");
            if (key && value) {
              seed[key] = value;
            }
          }
          if (seed.upeerId && seed.address && seed.publicKey) {
            seedNodes.push({
              upeerId: seed.upeerId,
              address: seed.address,
              publicKey: seed.publicKey
            });
          }
        } catch (error2) {
        }
      }
    }
    return seedNodes;
  }
  // Load seed nodes from local configuration file
  async loadSeedNodesFromFile() {
    if (!this.userDataPath) return [];
    const filePath = path.join(this.userDataPath, LOCAL_SEEDS_FILE);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(content);
    if (!Array.isArray(data)) return [];
    const seedNodes = [];
    for (const item of data) {
      if (item.upeerId && item.address && item.publicKey) {
        seedNodes.push({
          upeerId: item.upeerId,
          address: item.address,
          publicKey: item.publicKey
        });
      }
    }
    return seedNodes;
  }
  // Load seed nodes from LAN discovery
  async loadSeedNodesFromLAN() {
    return [];
  }
  // Bootstrap from existing contacts in database
  bootstrapFromContacts() {
    if (!this.getContacts) return 0;
    const contacts2 = this.getContacts();
    let bootstrapped = 0;
    for (const contact of contacts2) {
      if (!contact.upeerId || !contact.publicKey || contact.status !== "connected") {
        continue;
      }
      const kContact = {
        nodeId: toKademliaId(contact.upeerId),
        upeerId: contact.upeerId,
        address: contact.address,
        publicKey: contact.publicKey,
        lastSeen: Date.now(),
        dhtSeq: contact.dhtSeq || void 0,
        dhtSignature: contact.dhtSignature || void 0
      };
      const added = this.routingTable.addContact(kContact);
      if (added) bootstrapped++;
    }
    this.totalContacts = this.routingTable.getContactCount();
    this.updateBootstrapStatus();
    info(`Bootstrapped with ${bootstrapped} contacts (out of ${contacts2.length})`, void 0, "kademlia-bootstrap");
    return bootstrapped;
  }
  // Attempt bootstrap from seed nodes
  async attemptBootstrapFromSeeds() {
    const now = Date.now();
    if (now - this.lastBootstrapAttempt < BOOTSTRAP_RETRY_MS) {
      return;
    }
    this.lastBootstrapAttempt = now;
    this.stats.bootstrapAttempts++;
    const seedNodes = await this.loadSeedNodes();
    info(`Attempting bootstrap from ${seedNodes.length} seed nodes`, void 0, "kademlia-bootstrap");
    for (const seed of seedNodes) {
      const kContact = {
        nodeId: toKademliaId(seed.upeerId),
        upeerId: seed.upeerId,
        address: seed.address,
        publicKey: seed.publicKey,
        lastSeen: Date.now()
      };
      this.routingTable.addContact(kContact);
      try {
        this.sendMessage(seed.address, {
          type: "DHT_PING",
          timestamp: now
        });
      } catch (error2) {
        warn(`Failed to ping seed node ${seed.upeerId}`, error2, "kademlia-bootstrap");
      }
    }
    this.updateBootstrapStatus();
    if (this.bootstrapped) {
      info(`Bootstrap successful with ${this.totalContacts} contacts`, void 0, "kademlia-bootstrap");
    }
  }
  // Update bootstrap status based on current contact count
  updateBootstrapStatus() {
    const wasBootstrapped = this.bootstrapped;
    this.totalContacts = this.routingTable.getContactCount();
    this.bootstrapped = this.totalContacts >= BOOTSTRAP_MIN_NODES;
    if (wasBootstrapped && !this.bootstrapped) {
      warn(`Lost bootstrap status (${this.totalContacts} contacts)`, void 0, "kademlia-bootstrap");
    } else if (!wasBootstrapped && this.bootstrapped) {
      info(`Gained bootstrap status (${this.totalContacts} contacts)`, void 0, "kademlia-bootstrap");
      this.stats.bootstrapSuccesses++;
    }
  }
  // Force bootstrap retry
  async retryBootstrap() {
    this.lastBootstrapAttempt = 0;
    await this.attemptBootstrapFromSeeds();
  }
  // Check if node is bootstrapped
  isBootstrapped() {
    return this.bootstrapped;
  }
  // Get total contact count
  getContactCount() {
    return this.totalContacts;
  }
  // Get bootstrap statistics
  getStats() {
    return { ...this.stats };
  }
  // Get time since last bootstrap attempt
  getTimeSinceLastAttempt() {
    return Date.now() - this.lastBootstrapAttempt;
  }
}
class ProtocolHandler {
  constructor(nodeId, upeerId2, routingTable, valueStore, sendMessage) {
    this.nodeId = nodeId;
    this.upeerId = upeerId2;
    this.routingTable = routingTable;
    this.valueStore = valueStore;
    this.sendMessage = sendMessage;
    this.stats = {
      messagesReceived: 0,
      messagesSent: 0
    };
  }
  // Handle incoming DHT message
  async handleMessage(senderRevelnestId, data, senderAddress) {
    this.stats.messagesReceived++;
    await this.updateContactFromMessage(senderRevelnestId, senderAddress);
    switch (data.type) {
      case "DHT_PING":
        return this.handlePing(senderRevelnestId, data);
      case "DHT_FIND_NODE":
        return this.handleFindNode(senderRevelnestId, data);
      case "DHT_FIND_VALUE":
        return this.handleFindValue(senderRevelnestId, data);
      case "DHT_STORE":
        return this.handleStore(senderRevelnestId, data);
      default:
        warn("Unknown message type", { type: data.type }, "kademlia");
        return null;
    }
  }
  // Update or create contact from incoming message
  async updateContactFromMessage(senderRevelnestId, senderAddress) {
    let contact = this.routingTable.findContact(senderRevelnestId);
    if (contact) {
      contact.lastSeen = Date.now();
      contact.address = senderAddress;
      this.routingTable.addContact(contact);
    } else {
      const kContact = {
        nodeId: toKademliaId(senderRevelnestId),
        upeerId: senderRevelnestId,
        address: senderAddress,
        publicKey: "",
        // Will be updated later
        lastSeen: Date.now()
      };
      this.routingTable.addContact(kContact);
      network("Created new contact from incoming message", void 0, { upeerId: senderRevelnestId }, "kademlia");
    }
  }
  handlePing(senderRevelnestId, data) {
    return { type: "DHT_PONG", nodeId: this.nodeId.toString("hex") };
  }
  handleFindNode(senderRevelnestId, data) {
    const targetId = Buffer.from(data.targetId, "hex");
    const closestContacts = this.routingTable.findClosestContacts(targetId.toString("hex"), K);
    return {
      type: "DHT_FOUND_NODES",
      nodes: closestContacts.map((c) => ({
        upeerId: c.upeerId,
        address: c.address,
        publicKey: c.publicKey,
        nodeId: c.nodeId.toString("hex")
      }))
    };
  }
  handleFindValue(senderRevelnestId, data) {
    const key = Buffer.from(data.key, "hex");
    const value = this.valueStore.get(key);
    if (value) {
      return {
        type: "DHT_FOUND_VALUE",
        key: data.key,
        value: value.value,
        publisher: value.publisher,
        timestamp: value.timestamp,
        signature: value.signature
      };
    } else {
      return this.handleFindNode(senderRevelnestId, { ...data, targetId: data.key });
    }
  }
  handleStore(senderRevelnestId, data) {
    const key = Buffer.from(data.key, "hex");
    this.valueStore.set(
      key,
      data.value,
      data.publisher,
      data.signature
    );
    return { type: "DHT_STORE_ACK", key: data.key };
  }
  // Store a value in the DHT (initiate replication)
  async storeValue(key, value, publisher, signature) {
    this.valueStore.set(key, value, publisher, signature);
    const closestContacts = this.routingTable.findClosestContacts(key.toString("hex"), K);
    for (const contact of closestContacts) {
      if (contact.upeerId === this.upeerId) continue;
      try {
        this.sendMessage(contact.address, {
          type: "DHT_STORE",
          key: key.toString("hex"),
          value,
          publisher,
          timestamp: Date.now(),
          signature
        });
        this.stats.messagesSent++;
      } catch (error2) {
        warn("Failed to store value on contact", { contactId: contact.upeerId, error: error2 }, "kademlia");
      }
    }
  }
  // Find a value in the DHT
  async findValue(key) {
    const localValue = this.valueStore.get(key);
    if (localValue) {
      return localValue;
    }
    return null;
  }
  // Get protocol statistics
  getStats() {
    return { ...this.stats };
  }
}
class KademliaDHT {
  constructor(upeerId2, sendMessage, getContacts2, userDataPath) {
    this.stats = {
      storeOperations: 0,
      findOperations: 0
    };
    this.upeerId = upeerId2;
    this.nodeId = toKademliaId(upeerId2);
    this.routingTable = new RoutingTable(this.nodeId);
    this.valueStore = new ValueStore();
    this.bootstrapManager = new BootstrapManager(
      this.routingTable,
      sendMessage,
      getContacts2,
      userDataPath
    );
    this.protocolHandler = new ProtocolHandler(
      this.nodeId,
      this.upeerId,
      this.routingTable,
      this.valueStore,
      sendMessage
    );
    const bootstrappedCount = this.bootstrapManager.bootstrapFromContacts();
    info("Kademlia node initialized", { upeerId: upeerId2 }, "kademlia");
    debug("Kademlia ID", { nodeId: this.nodeId.toString("hex") }, "kademlia");
    info("Kademlia bootstrap status", {
      ready: this.isBootstrapped(),
      contacts: bootstrappedCount
    }, "kademlia");
  }
  // === Public API ===
  // Check if node is bootstrapped
  isBootstrapped() {
    return this.bootstrapManager.isBootstrapped();
  }
  // Get total contact count
  getContactCount() {
    return this.bootstrapManager.getContactCount();
  }
  // Force bootstrap retry
  retryBootstrap() {
    this.bootstrapManager.retryBootstrap();
  }
  // Add a contact (e.g., from external source)
  addContact(contact) {
    this.routingTable.addContact(contact);
    this.bootstrapManager.updateBootstrapStatus();
  }
  // Remove a contact
  removeContact(upeerId2) {
    this.routingTable.removeContact(upeerId2);
    this.bootstrapManager.updateBootstrapStatus();
  }
  // Find a contact by upeer ID
  findContact(upeerId2) {
    return this.routingTable.findContact(upeerId2);
  }
  // Find the K closest contacts to a given ID
  findClosestContacts(targetRevelnestId, limit) {
    return this.routingTable.findClosestContacts(targetRevelnestId, limit);
  }
  // Store a value in the DHT
  async storeValue(key, value, publisher, signature) {
    await this.protocolHandler.storeValue(key, value, publisher, signature);
    this.stats.storeOperations++;
  }
  // Find a value in the DHT
  async findValue(key) {
    const result = await this.protocolHandler.findValue(key);
    this.stats.findOperations++;
    return result;
  }
  // Store location block in DHT
  async storeLocationBlock(upeerId2, locationBlock) {
    const key = toKademliaId(upeerId2);
    await this.storeValue(
      key,
      locationBlock,
      upeerId2,
      locationBlock.signature
    );
    network("Stored location block in DHT", void 0, { upeerId: upeerId2 }, "kademlia");
  }
  // Find location block in DHT
  async findLocationBlock(upeerId2) {
    const key = toKademliaId(upeerId2);
    const result = await this.findValue(key);
    if (result && result.value) {
      network("Found location block in DHT", void 0, { upeerId: upeerId2 }, "kademlia");
      return result.value;
    }
    return null;
  }
  // Handle incoming DHT message
  async handleMessage(senderRevelnestId, data, senderAddress) {
    return this.protocolHandler.handleMessage(senderRevelnestId, data, senderAddress);
  }
  // Periodic maintenance
  async performMaintenance() {
    if (!this.isBootstrapped()) {
      const timeSinceLastAttempt = this.bootstrapManager.getTimeSinceLastAttempt();
      if (timeSinceLastAttempt >= BOOTSTRAP_RETRY_MS) {
        warn("Kademlia not bootstrapped, retrying", { contacts: this.getContactCount() }, "kademlia");
        await this.bootstrapManager.retryBootstrap();
      }
    }
    const staleBuckets = this.routingTable.refreshStaleBuckets();
    if (staleBuckets.length > 0) {
      debug("Refreshing stale Kademlia buckets", { count: staleBuckets.length }, "kademlia");
    }
    const removed = this.valueStore.cleanupExpiredValues();
    debug("Kademlia maintenance completed", { removed, ...this.getStats() }, "kademlia");
  }
  // Get statistics
  getStats() {
    const protocolStats = this.protocolHandler.getStats();
    const bootstrapStats = this.bootstrapManager.getStats();
    const totalContacts = this.getContactCount();
    return {
      ...this.stats,
      ...protocolStats,
      ...bootstrapStats,
      totalContacts,
      totalBuckets: this.routingTable.getBucketCount(),
      storedValues: this.valueStore.size()
    };
  }
}
const YGG_PORT = 50005;
const SOCKS5_HOST = "127.0.0.1";
const SOCKS5_PORT = 9050;
let tcpServer = null;
let mainWindow$1 = null;
let kademliaDHT = null;
let dhtMaintenanceTimer = null;
const BACKOFF_STEPS_MS = [
  3e4,
  // 30 s  (1º fallo)
  2 * 6e4,
  // 2 min
  10 * 6e4,
  // 10 min
  30 * 6e4
  // 30 min (tope)
];
const ipFailMap = /* @__PURE__ */ new Map();
function isIPBlocked(ip) {
  const s = ipFailMap.get(ip);
  if (!s) return false;
  return Date.now() < s.blockedUntil;
}
function recordIPFailure(ip) {
  const s = ipFailMap.get(ip) ?? { failures: 0, blockedUntil: 0 };
  s.failures++;
  const backoffMs = BACKOFF_STEPS_MS[Math.min(s.failures - 1, BACKOFF_STEPS_MS.length - 1)];
  s.blockedUntil = Date.now() + backoffMs;
  ipFailMap.set(ip, s);
  if (s.failures === 1) {
    error(`TCP send error to ${ip} (contacto inalcanzable, backoff ${backoffMs / 1e3}s)`, void 0, "network");
  }
}
function recordIPSuccess(ip) {
  ipFailMap.delete(ip);
}
function isIPUnreachable(ip) {
  return ipFailMap.has(ip) && isIPBlocked(ip);
}
const MAX_QUEUE_SIZE = 60;
let networkReady = false;
const sendQueue = [];
function drainSendQueue() {
  if (sendQueue.length === 0) return;
  network("Red lista — enviando mensajes en cola", void 0, { queued: sendQueue.length }, "network");
  const toSend = sendQueue.splice(0);
  for (const { ip, framedBuf } of toSend) {
    socks5Connect(ip, YGG_PORT).then((sock) => {
      sock.write(framedBuf);
      sock.end(() => sock.destroy());
    }).catch((err) => {
      error(`TCP send error (drain) to ${ip}`, err, "network");
    });
  }
}
onYggstackStatus((status) => {
  if (status === "down" || status === "reconnecting") {
    networkReady = false;
    sendQueue.length = 0;
    network("Red Yggdrasil no disponible — mensajes salientes pausados", void 0, { status }, "network");
  }
});
function encodeFrame(data) {
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, data]);
}
function parseIPv6ToBuffer(addr) {
  addr = addr.replace(/^\[|\]$/g, "");
  const halves = addr.split("::");
  let groups2;
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const fill = Array(8 - left.length - right.length).fill("0");
    groups2 = [...left, ...fill, ...right];
  } else {
    groups2 = addr.split(":");
  }
  const buf = Buffer.allocUnsafe(16);
  for (let i = 0; i < 8; i++) buf.writeUInt16BE(parseInt(groups2[i] ?? "0", 16), i * 2);
  return buf;
}
function socks5Connect(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: SOCKS5_HOST, port: SOCKS5_PORT });
    let state = "greeting";
    let buf = Buffer.alloc(0);
    socket.setTimeout(8e3);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("SOCKS5 timeout"));
    });
    socket.on("error", reject);
    socket.once("connect", () => {
      socket.write(Buffer.from([5, 1, 0]));
    });
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (state === "greeting") {
        if (buf.length < 2) return;
        if (buf[0] !== 5 || buf[1] !== 0) {
          socket.destroy();
          reject(new Error(`SOCKS5 auth rechazado: ${buf[1]}`));
          return;
        }
        buf = buf.subarray(2);
        state = "connect";
        try {
          const addrBuf = parseIPv6ToBuffer(host);
          const portBuf = Buffer.allocUnsafe(2);
          portBuf.writeUInt16BE(port, 0);
          socket.write(Buffer.concat([Buffer.from([5, 1, 0, 4]), addrBuf, portBuf]));
        } catch (e) {
          socket.destroy();
          reject(e);
        }
        return;
      }
      if (state === "connect") {
        if (buf.length < 10) return;
        socket.removeAllListeners("data");
        socket.setTimeout(0);
        if (buf[1] !== 0) {
          socket.destroy();
          reject(new Error(`SOCKS5 CONNECT fallido: código ${buf[1]}`));
          return;
        }
        resolve(socket);
      }
    });
  });
}
function startUDPServer(win) {
  mainWindow$1 = win;
  if (tcpServer) {
    return;
  }
  tcpServer = net.createServer((socket) => {
    const peerHint = socket.remoteAddress || "127.0.0.1";
    let frameBuf = Buffer.alloc(0);
    socket.on("data", async (chunk) => {
      frameBuf = Buffer.concat([frameBuf, chunk]);
      const MAX_FRAME_BYTES = 10 * 1024 * 1024;
      if (frameBuf.length > MAX_FRAME_BYTES + 4) {
        socket.destroy();
        error("TCP: frameBuf demasiado grande, conexión cerrada (DoS?)", {
          size: frameBuf.length,
          peer: peerHint
        }, "network");
        return;
      }
      while (frameBuf.length >= 4) {
        const msgLen = frameBuf.readUInt32BE(0);
        if (msgLen > MAX_FRAME_BYTES) {
          socket.destroy();
          error("TCP: frame individual demasiado grande, conexión cerrada", {
            msgLen,
            peer: peerHint
          }, "network");
          return;
        }
        if (frameBuf.length < 4 + msgLen) break;
        const msg = frameBuf.subarray(4, 4 + msgLen);
        frameBuf = frameBuf.subarray(4 + msgLen);
        const rinfo = { address: peerHint, port: socket.remotePort || 0 };
        await handlePacket(
          msg,
          rinfo,
          mainWindow$1,
          sendSecureUDPMessage,
          (rid) => startDhtSearch(rid, sendSecureUDPMessage)
        );
      }
    });
    socket.on("error", () => {
    });
  });
  tcpServer.on("error", (err) => {
    error("TCP Server Error", err, "network");
  });
  transferManager.initialize(sendSecureUDPMessage, win);
  const userDataPath = app.getPath("userData");
  kademliaDHT = new KademliaDHT(getMyUPeerId(), sendSecureUDPMessage, getContacts, userDataPath);
  setKademliaInstance(kademliaDHT);
  dhtMaintenanceTimer = setInterval(() => {
    if (kademliaDHT) {
      kademliaDHT.performMaintenance();
    }
    performDhtMaintenance().catch((err) => {
      error("DHT maintenance error", err, "dht");
    });
    import("./index-CoL40wUv.js").then(({ cleanupExpiredVaultEntries }) => {
      cleanupExpiredVaultEntries().catch((err) => {
        error("Vault cleanup error", err, "vault");
      });
    });
    Promise.resolve().then(() => handlers).then(({ cleanupRateLimiter: cleanupRateLimiter2 }) => {
      cleanupRateLimiter2();
    }).catch(() => {
    });
  }, 36e5);
  try {
    tcpServer.listen(YGG_PORT, "::1", () => {
      const networkAddr = getNetworkAddress();
      network("TCP P2P server listening", void 0, {
        port: YGG_PORT,
        yggAddress: networkAddr ?? "pendiente"
      }, "network");
      onYggstackAddress(() => {
        networkReady = true;
        drainSendQueue();
        import("./manager-DI4fM3Sg.js").then(({ VaultManager }) => {
          VaultManager.queryOwnVaults();
        }).catch((err) => error("Failed to query vaults on start", err, "vault"));
        import("./repair-worker-BpSN0avn.js").then(({ RepairWorker }) => {
          RepairWorker.start();
        }).catch((err) => error("Failed to start repair worker", err, "vault"));
      });
    });
  } catch (e) {
    error("Failed to start TCP server", e, "network");
  }
}
const EPH_FRESHNESS_MS = 2 * 60 * 60 * 1e3;
function shouldUseEphemeral(contact) {
  if (!(contact == null ? void 0 : contact.ephemeralPublicKey)) return false;
  const updatedAt = contact.ephemeralPublicKeyUpdatedAt ? new Date(contact.ephemeralPublicKeyUpdatedAt).getTime() : 0;
  return updatedAt > 0 && Date.now() - updatedAt < EPH_FRESHNESS_MS;
}
function sendSecureUDPMessage(ip, data, recipientPubKeyHex) {
  if (!tcpServer) return;
  const myId = getMyUPeerId();
  const fieldsToExclude = ["contactCache", "renewalToken"];
  const dataForSignature = { ...data };
  fieldsToExclude.forEach((field) => {
    if (field in dataForSignature) delete dataForSignature[field];
  });
  const senderYggAddress = getYggstackAddress() ?? getNetworkAddress() ?? "";
  const payloadToSign = { ...dataForSignature, senderRevelnestId: myId, senderYggAddress };
  const signature = sign(Buffer.from(canonicalStringify(payloadToSign)));
  const signedInner = {
    ...data,
    senderRevelnestId: myId,
    senderYggAddress,
    signature: signature.toString("hex")
  };
  let packetToSend;
  if (recipientPubKeyHex && SEALED_TYPES.has(data.type)) {
    packetToSend = sealPacket(signedInner, recipientPubKeyHex);
  } else {
    packetToSend = signedInner;
  }
  const rawBuf = Buffer.from(JSON.stringify(packetToSend));
  const framedBuf = encodeFrame(rawBuf);
  if (!networkReady) {
    const isFileChunk = data.type === "FILE_CHUNK" || data.type === "FILE_START" || data.type === "FILE_ACK";
    if (!isFileChunk && sendQueue.length < MAX_QUEUE_SIZE) {
      sendQueue.push({ ip, framedBuf });
    }
    return;
  }
  if (isIPBlocked(ip)) return;
  socks5Connect(ip, YGG_PORT).then((sock) => {
    recordIPSuccess(ip);
    sock.write(framedBuf);
    sock.end(() => sock.destroy());
  }).catch((err) => {
    recordIPFailure(ip);
  });
}
async function sendContactRequest(targetIp) {
  const powProof = AdaptivePow.generateLightProof(getMyUPeerId());
  const data = {
    type: "HANDSHAKE_REQ",
    publicKey: getMyPublicKeyHex(),
    ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
    signedPreKey: getMySignedPreKeyBundle(),
    // ← X3DH / Double Ratchet
    alias: getMyAlias() || void 0,
    avatar: getMyAvatar() || void 0,
    powProof
  };
  sendSecureUDPMessage(targetIp, data);
}
async function acceptContactRequest(upeerId2, publicKey2) {
  const contact = await getContactByRevelnestId(upeerId2);
  if (!contact) return;
  updateContactPublicKey(upeerId2, publicKey2);
  const data = {
    type: "HANDSHAKE_ACCEPT",
    publicKey: getMyPublicKeyHex(),
    ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
    signedPreKey: getMySignedPreKeyBundle(),
    // ← X3DH / Double Ratchet
    alias: getMyAlias() || void 0,
    avatar: getMyAvatar() || void 0
  };
  sendSecureUDPMessage(contact.address, data);
}
async function sendUDPMessage(upeerId2, message, replyTo) {
  const myId = getMyUPeerId();
  const msgId = crypto$1.randomUUID();
  const content = typeof message === "string" ? message : message.content;
  const contact = await getContactByRevelnestId(upeerId2);
  if (!contact || contact.status !== "connected" || !contact.publicKey) {
    if (contact && !contact.publicKey) {
      saveMessage(msgId, upeerId2, true, content, replyTo, "", "sent");
      const { savePendingOutboxMessage } = await import("./pending-outbox-CDR7A3lj.js");
      await savePendingOutboxMessage(upeerId2, msgId, content, replyTo);
      warn("No pubkey for contact, message queued in pending outbox", { upeerId: upeerId2 }, "vault");
      return msgId;
    }
    return void 0;
  }
  let ratchetHeader;
  let x3dhInit;
  let contentHex;
  let nonceHex;
  let ephPubKey;
  let useEphemeralFlag;
  try {
    const { getRatchetSession, saveRatchetSession } = await import("./index-Bqy1W93v.js");
    const { x3dhInitiator, ratchetInitAlice, ratchetEncrypt } = await import("./ratchet-CVCdiEOM.js");
    let session2 = getRatchetSession(upeerId2);
    if (!session2 && contact.signedPreKey) {
      const myIkSk = getMyIdentitySkBuffer();
      const myIkPk = getMyIdentityPkBuffer();
      const bobIkPk = Buffer.from(contact.publicKey, "hex");
      const bobSpkPk = Buffer.from(contact.signedPreKey, "hex");
      const { sharedSecret, ekPub } = x3dhInitiator(myIkSk, myIkPk, bobIkPk, bobSpkPk);
      session2 = ratchetInitAlice(sharedSecret, bobSpkPk);
      sharedSecret.fill(0);
      x3dhInit = {
        ekPub: ekPub.toString("hex"),
        spkId: contact.signedPreKeyId,
        ikPub: myIkPk.toString("hex")
      };
      saveRatchetSession(upeerId2, session2, contact.signedPreKeyId);
    }
    if (session2) {
      const { header, ciphertext, nonce } = ratchetEncrypt(session2, Buffer.from(content, "utf-8"));
      saveRatchetSession(upeerId2, session2);
      ratchetHeader = header;
      contentHex = ciphertext;
      nonceHex = nonce;
    } else {
      throw new Error("no-session");
    }
  } catch {
    const useEphemeral = shouldUseEphemeral(contact);
    const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
    ephPubKey = getMyEphemeralPublicKeyHex();
    const { ciphertext, nonce } = encrypt(
      Buffer.from(content, "utf-8"),
      Buffer.from(targetKeyHex, "hex"),
      useEphemeral
    );
    if (useEphemeral) incrementEphemeralMessageCounter();
    useEphemeralFlag = useEphemeral;
    contentHex = ciphertext.toString("hex");
    nonceHex = nonce.toString("hex");
  }
  const data = {
    type: "CHAT",
    id: msgId,
    content: contentHex,
    nonce: nonceHex,
    // Double Ratchet (si disponible)
    ...ratchetHeader ? { ratchetHeader } : {},
    ...x3dhInit ? { x3dhInit } : {},
    // Legacy crypto_box (si DR no disponible)
    ...ephPubKey ? { ephemeralPublicKey: ephPubKey } : {},
    ...useEphemeralFlag !== void 0 ? { useRecipientEphemeral: useEphemeralFlag } : {},
    replyTo
  };
  const signature = sign(Buffer.from(canonicalStringify(data)));
  const isToSelf = upeerId2 === getMyUPeerId();
  saveMessage(msgId, upeerId2, true, content, replyTo, signature.toString("hex"), isToSelf ? "read" : "sent");
  const chatAddresses = [];
  if (contact.address) chatAddresses.push(contact.address);
  try {
    const known = JSON.parse(contact.knownAddresses ?? "[]");
    for (const addr of known) {
      if (!chatAddresses.includes(addr)) chatAddresses.push(addr);
    }
  } catch {
  }
  for (const addr of chatAddresses) {
    sendSecureUDPMessage(addr, data, contact.publicKey);
  }
  setTimeout(async () => {
    var _a2;
    const { getMessageStatus: getMessageStatus2 } = await import("./db-Cln22U_j.js");
    const status = await getMessageStatus2(msgId);
    if (status === "sent") {
      warn("Message not delivered, starting vault replication", { msgId, upeerId: upeerId2 }, "vault");
      const freshContact = await getContactByRevelnestId(upeerId2);
      if (!(freshContact == null ? void 0 : freshContact.publicKey)) return;
      const { encrypt: encStatic } = await Promise.resolve().then(() => identity);
      const vaultEncrypted = encStatic(
        Buffer.from(content, "utf-8"),
        Buffer.from(freshContact.publicKey, "hex"),
        false
        // static key, no ephemeral — vault delivery siempre usa clave estática
      );
      const vaultData = {
        type: "CHAT",
        id: msgId,
        content: vaultEncrypted.ciphertext.toString("hex"),
        nonce: vaultEncrypted.nonce.toString("hex"),
        // No ratchetHeader: el receptor descifra con crypto_box al recibir del vault
        replyTo
      };
      const vaultSig = sign(Buffer.from(canonicalStringify(vaultData)));
      const innerPacket = {
        ...vaultData,
        senderRevelnestId: myId,
        signature: vaultSig.toString("hex")
      };
      const { VaultManager } = await import("./manager-DI4fM3Sg.js");
      const nodes = await VaultManager.replicateToVaults(upeerId2, innerPacket);
      if (nodes > 0) {
        const { updateMessageStatus: updateMessageStatus2 } = await import("./db-Cln22U_j.js");
        updateMessageStatus2(msgId, "vaulted");
        const { BrowserWindow: BrowserWindow2 } = await import("electron");
        (_a2 = BrowserWindow2.getAllWindows()[0]) == null ? void 0 : _a2.webContents.send("message-status-updated", { id: msgId, status: "vaulted" });
      }
      startDhtSearch(upeerId2, sendSecureUDPMessage);
    }
  }, 5e3);
  return msgId;
}
function checkHeartbeat(contacts2) {
  for (const contact of contacts2) {
    if (contact.status === "connected") {
      if (isIPBlocked(contact.address)) continue;
      sendSecureUDPMessage(contact.address, {
        type: "PING",
        alias: getMyAlias() || void 0,
        avatar: getMyAvatar() || void 0
      });
      sendDhtExchange(contact.upeerId, sendSecureUDPMessage);
      distributedHeartbeat(contact, sendSecureUDPMessage).catch((err) => {
        warn("Distributed heartbeat failed", err, "heartbeat");
      });
    }
  }
}
async function distributedHeartbeat(contact, sendSecureUDPMessage2) {
  await exchangeLocationBlocks(contact, sendSecureUDPMessage2);
  const aliveContacts = getContactsSeenLast24h();
  await sendContactList(contact, aliveContacts, sendSecureUDPMessage2);
  const blocksToShare = getLocationBlocksForRenewal();
  await shareBlocks(contact, blocksToShare, sendSecureUDPMessage2);
  await exchangeReputationGossip(contact, sendSecureUDPMessage2);
  network("Distributed heartbeat completed", void 0, { contact: contact.upeerId }, "heartbeat");
}
async function exchangeReputationGossip(contact, send) {
  try {
    const { getGossipIds: getGossipIds2 } = await Promise.resolve().then(() => vouches);
    const ids = getGossipIds2();
    if (ids.length === 0) return;
    send(contact.address, { type: "REPUTATION_GOSSIP", ids });
  } catch {
  }
}
async function exchangeLocationBlocks(contact, sendSecureUDPMessage2) {
  const currentIp = getNetworkAddress();
  if (!currentIp) return;
  const { getMyDhtSeq: getMyDhtSeq2 } = await Promise.resolve().then(() => identity);
  const currentSeq = getMyDhtSeq2();
  const { generateSignedLocationBlock: generateSignedLocationBlock2 } = await Promise.resolve().then(() => utils);
  const locBlock = generateSignedLocationBlock2(currentIp, currentSeq);
  sendSecureUDPMessage2(contact.address, {
    type: "DHT_UPDATE",
    locationBlock: locBlock
  });
}
function getContactsSeenLast24h() {
  const allContacts = getContacts();
  const cutoff = Date.now() - 24 * 60 * 60 * 1e3;
  return allContacts.filter((c) => c.lastSeen && c.lastSeen > cutoff && c.address).map((c) => ({
    upeerId: c.upeerId,
    lastSeen: c.lastSeen,
    address: c.address
  }));
}
async function sendContactList(contact, aliveContacts, sendSecureUDPMessage2) {
  if (aliveContacts.length === 0) return;
  sendSecureUDPMessage2(contact.address, {
    type: "DHT_EXCHANGE",
    peers: aliveContacts.filter((c) => c.publicKey && c.upeerId).map((c) => ({
      upeerId: c.upeerId,
      publicKey: c.publicKey,
      address: c.address,
      lastSeen: c.lastSeen
    }))
  });
}
function getLocationBlocksForRenewal() {
  const allContacts = getContacts();
  const now = Date.now();
  const renewalThreshold = 3 * 24 * 60 * 60 * 1e3;
  return allContacts.filter((c) => c.dhtSignature && c.dhtExpiresAt && c.publicKey && c.upeerId).filter((c) => {
    const timeToExpire = c.dhtExpiresAt - now;
    return timeToExpire < renewalThreshold && timeToExpire > 0;
  }).map((c) => ({
    upeerId: c.upeerId,
    // BUG AY fix: publicKey es obligatoria en validateDhtExchange — sin ella
    // el receptor rechaza el paquete y shareBlocks no servía de nada.
    publicKey: c.publicKey,
    locationBlock: {
      address: c.address,
      dhtSeq: c.dhtSeq,
      signature: c.dhtSignature,
      expiresAt: c.dhtExpiresAt,
      // BUG CI fix: incluir renewalToken para que el receptor pueda auto-renovar
      // el bloque cuando expira. Sin el token, la propagación era inefectiva.
      renewalToken: c.renewalToken ? (() => {
        try {
          return JSON.parse(c.renewalToken);
        } catch {
          return void 0;
        }
      })() : void 0
    }
  }));
}
async function shareBlocks(contact, blocksToShare, sendSecureUDPMessage2) {
  if (blocksToShare.length === 0) return;
  sendSecureUDPMessage2(contact.address, {
    type: "DHT_EXCHANGE",
    peers: blocksToShare
  });
}
function wrappedBroadcastDhtUpdate() {
  if (isSessionLocked()) return;
  broadcastDhtUpdate(sendSecureUDPMessage);
}
function sendTypingIndicator(upeerId2) {
  const contact = getContactByRevelnestId(upeerId2);
  if (contact && contact.status === "connected") sendSecureUDPMessage(contact.address, { type: "TYPING" });
}
function sendReadReceipt(upeerId2, id) {
  updateMessageStatus(id, "read");
  const contact = getContactByRevelnestId(upeerId2);
  if (contact && contact.status === "connected") sendSecureUDPMessage(contact.address, { type: "READ", id });
}
function sendContactCard(targetRevelnestId, contact) {
  const targetContact = getContactByRevelnestId(targetRevelnestId);
  if (!targetContact || targetContact.status !== "connected") return void 0;
  const msgId = crypto$1.randomUUID();
  const data = {
    type: "CHAT_CONTACT",
    id: msgId,
    contactName: contact.name,
    contactAddress: contact.address,
    upeerId: contact.upeerId,
    contactPublicKey: contact.publicKey
  };
  const signature = sign(Buffer.from(canonicalStringify(data)));
  saveMessage(msgId, targetRevelnestId, true, `CONTACT_CARD|${contact.name}`, void 0, signature.toString("hex"));
  sendSecureUDPMessage(targetContact.address, data);
  return msgId;
}
async function sendChatReaction(upeerId2, msgId, emoji, remove) {
  const contact = await getContactByRevelnestId(upeerId2);
  if (!contact || contact.status !== "connected") return;
  if (remove) deleteReaction(msgId, getMyUPeerId(), emoji);
  else saveReaction(msgId, getMyUPeerId(), emoji);
  const data = { type: "CHAT_REACTION", msgId, emoji, remove };
  sendSecureUDPMessage(contact.address, data);
}
async function sendChatUpdate(upeerId2, msgId, newContent) {
  const contact = await getContactByRevelnestId(upeerId2);
  if (!contact || contact.status !== "connected" || !contact.publicKey) return;
  const useEphemeral = shouldUseEphemeral(contact);
  const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
  const ephPubKey = getMyEphemeralPublicKeyHex();
  const { ciphertext, nonce } = encrypt(
    Buffer.from(newContent, "utf-8"),
    Buffer.from(targetKeyHex, "hex"),
    useEphemeral
  );
  if (useEphemeral) {
    incrementEphemeralMessageCounter();
  }
  const data = {
    type: "CHAT_UPDATE",
    msgId,
    content: ciphertext.toString("hex"),
    nonce: nonce.toString("hex"),
    ephemeralPublicKey: ephPubKey,
    useRecipientEphemeral: useEphemeral
  };
  const signature = sign(Buffer.from(canonicalStringify(data)));
  updateMessageContent(msgId, newContent, signature.toString("hex"));
  sendSecureUDPMessage(contact.address, data);
}
async function sendChatDelete(upeerId2, msgId) {
  const contact = await getContactByRevelnestId(upeerId2);
  if (!contact || contact.status !== "connected") return;
  deleteMessageLocally(msgId);
  const data = {
    type: "CHAT_DELETE",
    msgId,
    timestamp: Date.now()
  };
  sendSecureUDPMessage(contact.address, data);
  const myId = getMyUPeerId();
  const innerSignature = sign(Buffer.from(canonicalStringify(data)));
  const innerPacket = {
    ...data,
    senderRevelnestId: myId,
    signature: innerSignature.toString("hex")
  };
  import("./manager-DI4fM3Sg.js").then(({ VaultManager }) => {
    VaultManager.replicateToVaults(upeerId2, innerPacket);
  }).catch((err) => error("Failed to propagate delete to vaults", err, "vault"));
}
async function sendFile(upeerId2, filePath, thumbnail) {
  const contact = await getContactByRevelnestId(upeerId2);
  if (!contact || contact.status !== "connected") return void 0;
  try {
    const fileId = await transferManager.startSend(
      upeerId2,
      contact.address,
      filePath,
      thumbnail
    );
    return fileId;
  } catch (error2) {
    warn("File transfer failed to start", { upeerId: upeerId2, filePath, error: error2 }, "file-transfer");
    return void 0;
  }
}
function closeUDPServer() {
  if (dhtMaintenanceTimer) {
    clearInterval(dhtMaintenanceTimer);
    dhtMaintenanceTimer = null;
  }
  if (tcpServer) {
    tcpServer.close();
    tcpServer = null;
  }
}
async function sendGroupMessage(groupId, message, replyTo) {
  const group = getGroupById(groupId);
  if (!group || group.status !== "active") return void 0;
  const msgId = crypto$1.randomUUID();
  const myId = getMyUPeerId();
  const signature = sign(Buffer.from(message));
  saveMessage(msgId, groupId, true, message, replyTo, signature.toString("hex"), "sent");
  for (const memberRevelnestId of group.members) {
    if (memberRevelnestId === myId) continue;
    const contact = await getContactByRevelnestId(memberRevelnestId);
    if (!contact || contact.status !== "connected" || !contact.publicKey) continue;
    const useEphemeral = shouldUseEphemeral(contact);
    const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
    const ephPubKey = getMyEphemeralPublicKeyHex();
    const { ciphertext, nonce } = encrypt(
      Buffer.from(message, "utf-8"),
      Buffer.from(targetKeyHex, "hex"),
      useEphemeral
    );
    if (useEphemeral) incrementEphemeralMessageCounter();
    const data = {
      type: "GROUP_MSG",
      id: msgId,
      groupId,
      groupName: group.name,
      senderRevelnestId: myId,
      content: ciphertext.toString("hex"),
      nonce: nonce.toString("hex"),
      ephemeralPublicKey: ephPubKey,
      useRecipientEphemeral: useEphemeral,
      replyTo
      // members omitted: receiver already has the group roster locally;
      // including it leaks the full membership list to vault custodians
    };
    sendSecureUDPMessage(contact.address, data, contact.publicKey);
  }
  for (const memberRevelnestId of group.members) {
    if (memberRevelnestId === myId) continue;
    const contact = await getContactByRevelnestId(memberRevelnestId);
    if (!contact || contact.status === "connected" || !contact.publicKey) continue;
    const useEphemeral = false;
    const targetKeyHex = contact.publicKey;
    getMyEphemeralPublicKeyHex();
    const { ciphertext, nonce } = encrypt(
      Buffer.from(message, "utf-8"),
      Buffer.from(targetKeyHex, "hex"),
      useEphemeral
    );
    const offlinePacket = {
      type: "GROUP_MSG",
      id: msgId,
      groupId,
      // groupName omitido: el receptor lo tiene en su BD desde GROUP_INVITE.
      // senderRevelnestId omitido: el custodio lo conoce del protocolo VAULT_STORE
      // (entry.senderSid) — no hace falta exponerlo dentro del payload cifrado.
      content: ciphertext.toString("hex"),
      nonce: nonce.toString("hex"),
      useRecipientEphemeral: useEphemeral,
      replyTo
    };
    const signedPacket = {
      ...offlinePacket,
      signature: sign(Buffer.from(canonicalStringify(offlinePacket))).toString("hex")
    };
    const { VaultManager } = await import("./manager-DI4fM3Sg.js");
    const payloadHashOverride = crypto$1.createHash("sha256").update(`group:${msgId}:${memberRevelnestId}`).digest("hex");
    await VaultManager.replicateToVaults(memberRevelnestId, signedPacket, void 0, payloadHashOverride);
  }
  return msgId;
}
async function createGroup(name, memberRevelnestIds, avatar) {
  const myId = getMyUPeerId();
  const groupId = `grp-${crypto$1.randomUUID()}`;
  const allMembers = Array.from(/* @__PURE__ */ new Set([myId, ...memberRevelnestIds]));
  saveGroup(groupId, name, myId, allMembers, "active", avatar);
  for (const memberRevelnestId of memberRevelnestIds) {
    if (memberRevelnestId === myId) continue;
    await _sendGroupInvite(groupId, name, allMembers, memberRevelnestId, avatar);
  }
  return groupId;
}
async function inviteToGroup(groupId, upeerId2) {
  const group = getGroupById(groupId);
  if (!group) return;
  const newMembers = Array.from(/* @__PURE__ */ new Set([...group.members, upeerId2]));
  updateGroupMembers(groupId, newMembers);
  await _sendGroupInvite(groupId, group.name, newMembers, upeerId2);
}
async function updateGroup(groupId, fields) {
  const group = getGroupById(groupId);
  if (!group) return;
  updateGroupInfo(groupId, fields);
  const myId = getMyUPeerId();
  const sensitivePayload = JSON.stringify({
    ...fields.name !== void 0 ? { groupName: fields.name } : {},
    ...fields.avatar !== void 0 ? { avatar: fields.avatar } : {}
  });
  for (const memberRevelnestId of group.members) {
    if (memberRevelnestId === myId) continue;
    const contact = await getContactByRevelnestId(memberRevelnestId);
    if (!contact || !contact.publicKey) continue;
    const useEphemeral = shouldUseEphemeral(contact);
    const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
    const ephPubKey = getMyEphemeralPublicKeyHex();
    const { ciphertext, nonce } = encrypt(
      Buffer.from(sensitivePayload, "utf-8"),
      Buffer.from(targetKeyHex, "hex"),
      useEphemeral
    );
    if (useEphemeral) incrementEphemeralMessageCounter();
    const packet = {
      type: "GROUP_UPDATE",
      groupId,
      adminRevelnestId: myId,
      payload: ciphertext.toString("hex"),
      nonce: nonce.toString("hex"),
      ephemeralPublicKey: ephPubKey,
      useRecipientEphemeral: useEphemeral
    };
    if (contact.status === "connected") {
      sendSecureUDPMessage(contact.address, packet);
    } else {
      const signedPacket = {
        ...packet,
        senderRevelnestId: myId,
        signature: sign(Buffer.from(canonicalStringify(packet))).toString("hex")
      };
      const { VaultManager } = await import("./manager-DI4fM3Sg.js");
      await VaultManager.replicateToVaults(memberRevelnestId, signedPacket);
      warn("GROUP_UPDATE vaulted for offline member", { memberRevelnestId, groupId }, "vault");
    }
  }
}
async function _sendGroupInvite(groupId, groupName, members, targetRevelnestId, avatar) {
  const contact = await getContactByRevelnestId(targetRevelnestId);
  if (!contact || !contact.publicKey) return;
  const myId = getMyUPeerId();
  const useEphemeral = contact.status === "connected" ? shouldUseEphemeral(contact) : false;
  const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
  const sensitivePayload = JSON.stringify({ groupName, members, ...avatar ? { avatar } : {} });
  const ephPubKey = getMyEphemeralPublicKeyHex();
  const { ciphertext, nonce } = encrypt(
    Buffer.from(sensitivePayload, "utf-8"),
    Buffer.from(targetKeyHex, "hex"),
    useEphemeral
  );
  if (useEphemeral) incrementEphemeralMessageCounter();
  const packet = {
    type: "GROUP_INVITE",
    groupId,
    adminRevelnestId: myId,
    payload: ciphertext.toString("hex"),
    nonce: nonce.toString("hex"),
    ephemeralPublicKey: ephPubKey,
    useRecipientEphemeral: useEphemeral
  };
  if (contact.status === "connected") {
    sendSecureUDPMessage(contact.address, packet);
  } else {
    const signedPacket = {
      ...packet,
      senderRevelnestId: myId,
      signature: sign(Buffer.from(canonicalStringify(packet))).toString("hex")
    };
    const { VaultManager } = await import("./manager-DI4fM3Sg.js");
    await VaultManager.replicateToVaults(targetRevelnestId, signedPacket);
    warn("GROUP_INVITE vaulted for offline member", { targetRevelnestId, groupId }, "vault");
  }
}
async function leaveGroup(groupId) {
  const group = getGroupById(groupId);
  if (!group) return;
  const myId = getMyUPeerId();
  const packet = {
    type: "GROUP_LEAVE",
    groupId,
    senderRevelnestId: myId,
    timestamp: Date.now()
  };
  for (const memberRevelnestId of group.members) {
    if (memberRevelnestId === myId) continue;
    const contact = await getContactByRevelnestId(memberRevelnestId);
    if ((contact == null ? void 0 : contact.status) === "connected" && contact.address) {
      sendSecureUDPMessage(contact.address, packet);
    }
  }
  const { deleteGroup: deleteGroup2, deleteMessagesByChatId: deleteMessagesByChatId2 } = await import("./db-Cln22U_j.js");
  deleteMessagesByChatId2(groupId);
  deleteGroup2(groupId);
}
const server = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  acceptContactRequest,
  broadcastDhtUpdate: wrappedBroadcastDhtUpdate,
  checkHeartbeat,
  closeUDPServer,
  createGroup,
  inviteToGroup,
  isIPUnreachable,
  leaveGroup,
  sendChatDelete,
  sendChatReaction,
  sendChatUpdate,
  sendContactCard,
  sendContactRequest,
  sendFile,
  sendGroupMessage,
  sendReadReceipt,
  sendSecureUDPMessage,
  sendTypingIndicator,
  sendUDPMessage,
  startUDPServer,
  updateGroup,
  wrappedBroadcastDhtUpdate
}, Symbol.toStringTag, { value: "Module" }));
const LAN_DISCOVERY_PORT = 50006;
const LAN_MULTICAST_GROUP = "ff02::1";
const LAN_BROADCAST_INTERVAL = 3e4;
const LAN_DISCOVERY_TIMEOUT = 6e4;
const YGG_REGEX = /^[23][0-9a-f]{2}:/i;
class LanDiscovery {
  constructor() {
    this.socket = null;
    this.discoveryInterval = null;
    this.discoveredPeers = /* @__PURE__ */ new Map();
    this.isRunning = false;
    this.lanRateLimiter = new RateLimiter({
      "LAN_DISCOVERY": { windowMs: 6e4, maxTokens: 10, refillRate: 10 / 60 }
    });
  }
  // Start LAN discovery
  async start() {
    if (this.isRunning) return;
    try {
      this.socket = dgram.createSocket({ type: "udp6", reuseAddr: true });
      this.socket.on("message", (msg, rinfo) => {
        this.handleLanMessage(msg, rinfo);
      });
      this.socket.on("error", (err) => {
        warn("LAN discovery socket error", err, "lan");
      });
      await new Promise((resolve, reject) => {
        this.socket.bind(LAN_DISCOVERY_PORT, "::", () => {
          try {
            this.socket.addMembership(LAN_MULTICAST_GROUP);
            info("LAN discovery started", { port: LAN_DISCOVERY_PORT, multicastGroup: LAN_MULTICAST_GROUP }, "lan");
            resolve();
          } catch (error2) {
            reject(error2);
          }
        });
      });
      this.discoveryInterval = setInterval(() => {
        this.announcePresence();
        this.cleanupOldPeers();
      }, LAN_BROADCAST_INTERVAL);
      setTimeout(() => this.announcePresence(), 1e3);
      this.isRunning = true;
    } catch (error2) {
      warn("Failed to start LAN discovery", error2, "lan");
      this.stop();
    }
  }
  // Stop LAN discovery
  stop() {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    if (this.socket) {
      try {
        this.socket.dropMembership(LAN_MULTICAST_GROUP);
        this.socket.close();
      } catch (error2) {
      }
      this.socket = null;
    }
    this.discoveredPeers.clear();
    this.isRunning = false;
    info("LAN discovery stopped", {}, "lan");
  }
  // Announce presence on LAN
  announcePresence() {
    if (!this.socket) return;
    const myAddress = getNetworkAddress();
    if (!myAddress) return;
    let upeerId2;
    let publicKey2;
    let ephemeralPublicKey2;
    try {
      upeerId2 = getMyUPeerId();
      publicKey2 = getMyPublicKeyHex();
      ephemeralPublicKey2 = getMyEphemeralPublicKeyHex();
      if (!upeerId2 || !publicKey2) return;
    } catch {
      return;
    }
    const messageData = {
      type: "LAN_DISCOVERY_ANNOUNCE",
      upeerId: upeerId2,
      publicKey: publicKey2,
      ephemeralPublicKey: ephemeralPublicKey2,
      address: myAddress,
      timestamp: Date.now()
    };
    const signature = sign(Buffer.from(canonicalStringify(messageData))).toString("hex");
    const message = {
      ...messageData,
      signature
    };
    const buffer = Buffer.from(JSON.stringify(message));
    this.socket.send(buffer, 0, buffer.length, LAN_DISCOVERY_PORT, LAN_MULTICAST_GROUP, (err) => {
      if (err) {
        warn("Failed to send LAN announcement", err, "lan");
      }
    });
    network("LAN announcement sent", void 0, { address: myAddress }, "lan");
  }
  // Handle incoming LAN messages
  handleLanMessage(msg, rinfo) {
    try {
      if (!this.lanRateLimiter.check(rinfo.address, "LAN_DISCOVERY")) {
        warn("LAN discovery rate limit exceeded", { sourceIp: rinfo.address }, "lan");
        return;
      }
      const message = JSON.parse(msg.toString());
      if (!this.validateLanMessage(message, rinfo)) {
        return;
      }
      if (message.upeerId === getMyUPeerId()) {
        return;
      }
      this.discoveredPeers.set(message.upeerId, {
        address: message.address,
        timestamp: Date.now()
      });
      this.addDiscoveredPeer(message);
      if (message.type === "LAN_DISCOVERY_ANNOUNCE") {
        this.sendResponse(message.upeerId, message.address);
      }
    } catch (error2) {
      warn("Failed to parse LAN message", error2, "lan");
    }
  }
  // Validate LAN message
  validateLanMessage(message, rinfo) {
    if (!message.upeerId || !message.publicKey || !message.address || !message.timestamp || !message.signature) {
      return false;
    }
    const now = Date.now();
    const tsDelta = now - message.timestamp;
    if (tsDelta > 5 * 60 * 1e3 || tsDelta < -3e5) {
      return false;
    }
    if (typeof message.publicKey !== "string" || !/^[0-9a-f]{64}$/i.test(message.publicKey)) {
      warn("LAN message: invalid publicKey format", {}, "lan");
      return false;
    }
    const addrSegments = message.address.split(":");
    if (!YGG_REGEX.test(message.address) || addrSegments.length !== 8) {
      warn("LAN message: address is not a valid Yggdrasil IPv6 address", { address: message.address }, "lan");
      return false;
    }
    try {
      const { signature, ...messageData } = message;
      const messageBuffer = Buffer.from(canonicalStringify(messageData));
      const signatureBuffer = Buffer.from(signature, "hex");
      const publicKeyBuffer = Buffer.from(message.publicKey, "hex");
      const isValid = verify(messageBuffer, signatureBuffer, publicKeyBuffer);
      if (!isValid) {
        warn("Invalid LAN message signature", { upeerId: message.upeerId }, "lan");
        return false;
      }
      const derivedId = getUPeerIdFromPublicKey(publicKeyBuffer);
      if (derivedId !== message.upeerId) {
        warn("LAN message: upeerId does not match publicKey (identity spoofing attempt)", { claimed: message.upeerId }, "lan");
        return false;
      }
    } catch (error2) {
      warn("Failed to verify LAN message signature", error2, "lan");
      return false;
    }
    return true;
  }
  // Send response to discovered peer
  sendResponse(targetRevelnestId, targetAddress) {
    if (!this.socket) return;
    const myAddress = getNetworkAddress();
    if (!myAddress) return;
    const responseData = {
      type: "LAN_DISCOVERY_RESPONSE",
      upeerId: getMyUPeerId(),
      publicKey: getMyPublicKeyHex(),
      ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
      address: myAddress,
      timestamp: Date.now()
    };
    const signature = sign(Buffer.from(canonicalStringify(responseData))).toString("hex");
    const response = {
      ...responseData,
      signature
    };
    const buffer = Buffer.from(JSON.stringify(response));
    this.socket.send(buffer, 0, buffer.length, LAN_DISCOVERY_PORT, targetAddress, (err) => {
      if (err) {
        warn("Failed to send LAN response", err, "lan");
      }
    });
    network("LAN response sent", void 0, { target: targetRevelnestId }, "lan");
  }
  // Add discovered peer to contacts
  async addDiscoveredPeer(message) {
    try {
      if (isContactBlocked(message.upeerId)) {
        warn("LAN: ignoring announcement from blocked contact", { upeerId: message.upeerId }, "lan");
        return;
      }
      await addOrUpdateContact(
        message.upeerId,
        message.address,
        `LAN Peer ${message.upeerId.slice(0, 4)}`,
        message.publicKey,
        "connected",
        message.ephemeralPublicKey
      );
      info("LAN peer discovered", {
        upeerId: message.upeerId,
        address: message.address
      }, "lan");
    } catch (error2) {
      warn("Failed to add LAN peer to contacts", error2, "lan");
    }
  }
  // Cleanup old peers
  cleanupOldPeers() {
    const now = Date.now();
    for (const [upeerId2, data] of this.discoveredPeers.entries()) {
      if (now - data.timestamp > LAN_DISCOVERY_TIMEOUT) {
        this.discoveredPeers.delete(upeerId2);
      }
    }
  }
  // Get discovered peers
  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers.entries()).map(([upeerId2, data]) => ({
      upeerId: upeerId2,
      address: data.address,
      timestamp: data.timestamp
    }));
  }
  // Check if running
  isActive() {
    return this.isRunning;
  }
}
let lanDiscoveryInstance = null;
function getLanDiscovery() {
  if (!lanDiscoveryInstance) {
    lanDiscoveryInstance = new LanDiscovery();
  }
  return lanDiscoveryInstance;
}
async function startLanDiscovery() {
  const lanDiscovery = getLanDiscovery();
  await lanDiscovery.start();
}
function stopLanDiscovery() {
  if (lanDiscoveryInstance) {
    lanDiscoveryInstance.stop();
    lanDiscoveryInstance = null;
  }
}
process.stdout.on("error", (err) => {
  if (err.code !== "EPIPE") throw err;
});
process.stderr.on("error", (err) => {
  if (err.code !== "EPIPE") throw err;
});
process.on("unhandledRejection", (reason) => {
  error("[Main] Promesa rechazada sin capturar", { reason: String(reason) }, "unhandled-rejection");
});
process.on("uncaughtException", (err) => {
  error("[Main] Excepción no capturada", { message: err.message, stack: err.stack }, "uncaught-exception");
});
if (process.env.XDG_SESSION_TYPE === "wayland") {
  app.commandLine.appendSwitch("enable-features", "UseOzonePlatform");
  app.commandLine.appendSwitch("ozone-platform", "wayland");
}
if (started) {
  app.quit();
}
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
let mainWindow = null;
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1e3,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.cjs")
    }
  });
  {
    mainWindow.loadURL("http://localhost:5181");
  }
};
app.on("ready", async () => {
  await session.defaultSession.setProxy({
    proxyRules: "socks5://127.0.0.1:9050",
    proxyBypassRules: "localhost"
  });
  info("[Proxy] SOCKS5 configurado", { proxy: "socks5://127.0.0.1:9050", bypass: "localhost" }, "proxy");
  try {
    await spawnYggstack();
  } catch (err) {
    error("[yggstack] Error inicializando sidecar", { err: String(err) }, "yggstack");
  }
  onYggstackAddress((address) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send("yggstack-address", address);
      info("[IPC] Dirección Yggdrasil enviada al renderer", { address }, "ipc");
    }
  });
  onYggstackStatus((status, address) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send("yggstack-status", status, address);
    }
  });
  const userDataPath = app.getPath("userData");
  initIdentity(userDataPath);
  await initDB(userDataPath);
  createWindow();
  if (!isSessionLocked() && mainWindow) startUDPServer(mainWindow);
  try {
    const { VaultManager } = await import("./manager-DI4fM3Sg.js");
    VaultManager.queryOwnVaults();
  } catch (err) {
    error("[Vault] Error querying offline messages", { err: String(err) }, "vault");
  }
  if (!isSessionLocked()) {
    try {
      await startLanDiscovery();
    } catch (err) {
      error("[LAN] Error starting LAN discovery", { err: String(err) }, "lan");
    }
  }
  setInterval(() => {
    if (isSessionLocked()) return;
    wrappedBroadcastDhtUpdate();
    const contacts2 = getContacts();
    checkHeartbeat(contacts2.map((c) => ({ address: c.address, status: c.status })));
  }, 3e4);
});
ipcMain.handle("get-ygg-ip", () => getYggstackAddress() || "No detectado");
ipcMain.handle("get-network-stats", () => {
  const activePeerUris = new Set(getActivePeerUris());
  const pool = getPeerPool();
  const activePeers2 = pool.filter((p) => activePeerUris.has(p.uri)).map((p) => ({
    host: p.host,
    country: p.country,
    latencyMs: p.latencyMs,
    score: Math.round(p.score),
    alive: p.alive,
    lat: p.lat,
    lon: p.lon
  }));
  const self = getSelfGeo();
  return {
    peerCount: activePeers2.length,
    peers: activePeers2,
    restartAttempts: getRestartAttempts(),
    maxRestartAttempts: getMaxRestartAttempts(),
    selfLat: (self == null ? void 0 : self.lat) ?? null,
    selfLon: (self == null ? void 0 : self.lon) ?? null
  };
});
ipcMain.handle("restart-yggstack", async () => {
  await forceRestart();
});
ipcMain.handle("get-messages", (event, upeerId2) => getMessages(upeerId2));
ipcMain.handle("get-contacts", async () => {
  const contacts2 = await getContacts();
  const directContactIds = new Set(
    contacts2.filter((c) => c.status === "connected" && c.upeerId).map((c) => c.upeerId)
  );
  return contacts2.map((contact) => ({
    ...contact,
    vouchScore: computeScore(contact.upeerId ?? "", directContactIds)
  }));
});
ipcMain.handle("add-contact", async (event, { address, name }) => {
  const separator = "@";
  if (!address.includes(separator)) {
    return { success: false, error: "Formato UPeerID@IP requerido. Usa ID@200:xxxx:xxxx:..." };
  }
  let [targetRevelnestId, targetIp] = address.split(separator);
  targetIp = targetIp.trim();
  const segments = targetIp.split(":");
  const YGG_REGEX2 = /^[23][0-9a-f]{2}:/i;
  const isValidYggdrasil = YGG_REGEX2.test(targetIp) && segments.length === 8;
  if (!isValidYggdrasil) {
    return { success: false, error: "Dirección Yggdrasil inválida. Debe tener 8 segmentos comenzando con 200:-3fe: (ej: 201:5884:ec67:1c3e:d713:8b32:ed5e:9de3)" };
  }
  const oldGhost = await getContactByAddress(targetIp);
  if (oldGhost && oldGhost.upeerId.startsWith("pending-")) {
    await deleteContact(oldGhost.upeerId);
  }
  const sanitizedName = typeof name === "string" ? name.slice(0, 100) : "";
  addOrUpdateContact(targetRevelnestId, targetIp, sanitizedName, void 0, "pending");
  await sendContactRequest(targetIp);
  return { success: true, upeerId: targetRevelnestId };
});
ipcMain.handle("accept-contact-request", async (event, { upeerId: upeerId2, publicKey: publicKey2 }) => {
  await acceptContactRequest(upeerId2, publicKey2);
  return { success: true };
});
ipcMain.handle("delete-contact", (event, { upeerId: upeerId2 }) => deleteContact(upeerId2));
ipcMain.handle("block-contact", (event, { upeerId: upeerId2 }) => blockContact(upeerId2));
ipcMain.handle("unblock-contact", (event, { upeerId: upeerId2 }) => unblockContact(upeerId2));
ipcMain.handle("get-blocked-contacts", () => getBlockedContacts());
ipcMain.handle("send-p2p-message", async (event, { upeerId: upeerId2, message, replyTo }) => await sendUDPMessage(upeerId2, message, replyTo));
ipcMain.handle("send-typing-indicator", (event, { upeerId: upeerId2 }) => sendTypingIndicator(upeerId2));
ipcMain.handle("send-read-receipt", (event, { upeerId: upeerId2, id }) => sendReadReceipt(upeerId2, id));
ipcMain.handle("send-contact-card", (event, { targetRevelnestId, contact }) => sendContactCard(targetRevelnestId, contact));
ipcMain.handle("send-chat-reaction", (event, { upeerId: upeerId2, msgId, emoji, remove }) => sendChatReaction(upeerId2, msgId, emoji, remove));
ipcMain.handle("send-chat-update", (event, { upeerId: upeerId2, msgId, newContent }) => sendChatUpdate(upeerId2, msgId, newContent));
ipcMain.handle("send-chat-delete", (event, { upeerId: upeerId2, msgId }) => sendChatDelete(upeerId2, msgId));
ipcMain.handle("get-groups", () => getGroups());
ipcMain.handle("create-group", async (event, { name, memberRevelnestIds, avatar }) => {
  const safeName = typeof name === "string" ? name.slice(0, 100) : "";
  if (typeof avatar === "string" && avatar.length > 2e6) {
    return { success: false, error: "Avatar demasiado grande (máx 2 MB)" };
  }
  const groupId = await createGroup(safeName, memberRevelnestIds, avatar);
  return { success: true, groupId };
});
ipcMain.handle("update-group-avatar", (event, { groupId, avatar }) => {
  if (typeof avatar === "string" && avatar.length > 2e6) return { success: false, error: "Avatar demasiado grande (máx 2 MB)" };
  return updateGroupAvatar(groupId, avatar);
});
ipcMain.handle("send-group-message", async (event, { groupId, message, replyTo }) => {
  const msgId = await sendGroupMessage(groupId, message, replyTo);
  return msgId;
});
ipcMain.handle("invite-to-group", async (event, { groupId, upeerId: upeerId2 }) => {
  await inviteToGroup(groupId, upeerId2);
  return { success: true };
});
ipcMain.handle("update-group", async (event, { groupId, name, avatar }) => {
  const safeName = typeof name === "string" ? name.slice(0, 100) : name;
  if (typeof avatar === "string" && avatar.length > 2e6) {
    return { success: false, error: "Avatar demasiado grande (máx 2 MB)" };
  }
  await updateGroup(groupId, { name: safeName, avatar });
  return { success: true };
});
ipcMain.handle("leave-group", async (event, { groupId }) => {
  await leaveGroup(groupId);
  return { success: true };
});
ipcMain.on("contact-untrustworthy", (event, data) => {
  const mainWindow2 = BrowserWindow.getAllWindows()[0];
  if (mainWindow2) {
    mainWindow2.webContents.send("contact-untrustworthy", data);
  }
});
ipcMain.handle("get-my-identity", () => {
  const address = getYggstackAddress();
  if (isSessionLocked()) {
    return { address, upeerId: null, publicKey: null, alias: null, avatar: null };
  }
  return {
    address,
    upeerId: getMyUPeerId(),
    publicKey: getMyPublicKeyHex(),
    alias: getMyAlias(),
    avatar: getMyAvatar() || void 0
  };
});
ipcMain.handle("get-my-reputation", async () => {
  if (isSessionLocked()) return null;
  try {
    const myId = getMyUPeerId();
    const contacts2 = await getContacts();
    const connectedCount = contacts2.filter((c) => c.status === "connected").length;
    const vouchScore = await getVouchScore(myId);
    return { vouchScore, connectionCount: connectedCount };
  } catch {
    return { vouchScore: 50, connectionCount: 0 };
  }
});
ipcMain.handle("identity-status", () => ({
  isMnemonicMode: isMnemonicMode(),
  isLocked: isSessionLocked(),
  upeerId: !isSessionLocked() ? getMyUPeerId() : null
}));
ipcMain.handle("generate-mnemonic", () => ({
  mnemonic: generateMnemonic()
}));
ipcMain.handle("set-my-alias", (event, { alias }) => {
  const sanitized = typeof alias === "string" ? alias.slice(0, 100) : "";
  setMyAlias(sanitized);
  return { success: true };
});
ipcMain.handle("set-my-avatar", (event, { avatar }) => {
  if (typeof avatar === "string" && avatar.length > 2e6) {
    return { success: false, error: "Avatar demasiado grande (máx 2 MB)" };
  }
  setMyAvatar(avatar ?? "");
  return { success: true };
});
ipcMain.handle("create-mnemonic-identity", async (event, { mnemonic, alias, avatar }) => {
  if (isMnemonicMode()) {
    clearUserData();
  }
  const result = await createMnemonicIdentity(mnemonic, alias, avatar);
  if (result.success && mainWindow) {
    startUDPServer(mainWindow);
    try {
      await startLanDiscovery();
    } catch (e) {
    }
  }
  return result;
});
ipcMain.handle("unlock-session", async (event, { mnemonic }) => {
  const result = await unlockWithMnemonic(mnemonic);
  if (result.success) {
    if (mainWindow) startUDPServer(mainWindow);
    try {
      await startLanDiscovery();
    } catch (e) {
    }
  }
  return result;
});
ipcMain.handle("lock-session", () => {
  lockSession();
  return { success: true };
});
ipcMain.handle("get-vault-stats", async () => {
  const { getVaultStats } = await import("./operations-H0fA7MW9.js");
  return await getVaultStats();
});
ipcMain.handle("open-file-dialog", async (event, { title, filters, defaultPath, multiSelect }) => {
  try {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const targetWindow = senderWindow || BrowserWindow.getFocusedWindow();
    const dialogOptions = {
      title: title || "Seleccionar archivo",
      defaultPath: defaultPath || app.getPath("downloads"),
      filters: filters || [
        { name: "Todos los archivos", extensions: ["*"] },
        { name: "Imágenes", extensions: ["jpg", "jpeg", "png", "gif", "webp"] },
        { name: "Documentos", extensions: ["pdf", "doc", "docx", "txt", "rtf"] },
        { name: "Audio", extensions: ["mp3", "wav", "ogg", "flac"] },
        { name: "Video", extensions: ["mp4", "mov", "avi", "mkv"] }
      ],
      properties: multiSelect ? ["openFile", "multiSelections"] : ["openFile"]
    };
    const isWayland = process.env.XDG_SESSION_TYPE === "wayland";
    const result = targetWindow && !isWayland ? await dialog.showOpenDialog(targetWindow, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled) {
      return { success: true, canceled: true, files: [] };
    }
    const files = await Promise.all(result.filePaths.map(async (filePath) => {
      try {
        const stats = await fs$1.stat(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const name = path.basename(filePath);
        let mimeType = "application/octet-stream";
        const mimeMap = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".txt": "text/plain",
          ".pdf": "application/pdf",
          ".zip": "application/zip",
          ".mp3": "audio/mpeg",
          ".mp4": "video/mp4",
          ".mov": "video/quicktime",
          ".avi": "video/x-msvideo",
          ".doc": "application/msword",
          ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ".xls": "application/vnd.ms-excel",
          ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ".ppt": "application/vnd.ms-powerpoint",
          ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        };
        if (mimeMap[ext]) {
          mimeType = mimeMap[ext];
        }
        return {
          path: filePath,
          name,
          size: stats.size,
          type: mimeType,
          lastModified: stats.mtimeMs
        };
      } catch (err) {
        error("Error getting file info", { filePath, err: String(err) }, "ipc");
        return {
          path: filePath,
          name: path.basename(filePath),
          size: 0,
          type: "application/octet-stream",
          lastModified: Date.now()
        };
      }
    }));
    return { success: true, canceled: false, files };
  } catch (error$1) {
    error("Error opening file dialog", { err: String(error$1) }, "ipc");
    return { success: false, error: error$1 instanceof Error ? error$1.message : "Unknown error" };
  }
});
ipcMain.handle("read-file-as-base64", async (event, { filePath, maxSizeMB = 5 }) => {
  try {
    if (typeof filePath !== "string" || !filePath) {
      return { success: false, error: "Invalid file path" };
    }
    const resolvedPath = path.resolve(filePath);
    const homeDir = app.getPath("home");
    const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
    if (!resolvedPath.startsWith(homeDirNormalized) && resolvedPath !== homeDir) {
      return { success: false, error: "File must be within home directory" };
    }
    const stats = await fs$1.stat(resolvedPath);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (stats.size > maxSizeBytes) {
      return { success: false, error: `File too large for preview. Max size: ${maxSizeMB}MB` };
    }
    const buffer = await fs$1.readFile(resolvedPath);
    const base64 = buffer.toString("base64");
    const ext = path.extname(resolvedPath).toLowerCase();
    let mimeType = "application/octet-stream";
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".svg": "image/svg+xml"
    };
    if (mimeMap[ext]) {
      mimeType = mimeMap[ext];
    }
    const dataUrl = `data:${mimeType};base64,${base64}`;
    return { success: true, dataUrl, mimeType, size: stats.size };
  } catch (error$1) {
    error("Error reading file as base64", { err: String(error$1) }, "ipc");
    return { success: false, error: error$1 instanceof Error ? error$1.message : "Unknown error" };
  }
});
ipcMain.handle("start-file-transfer", async (event, { upeerId: upeerId2, filePath, thumbnail }) => {
  try {
    if (typeof filePath !== "string" || !filePath) {
      return { success: false, error: "Invalid file path" };
    }
    const resolvedSrc = path.resolve(filePath);
    const homeDir = app.getPath("home");
    const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
    if (!resolvedSrc.startsWith(homeDirNormalized) && resolvedSrc !== homeDir) {
      return { success: false, error: "Source file must be within home directory" };
    }
    const contact = await getContactByRevelnestId(upeerId2);
    if (!contact || contact.status !== "connected") {
      return { success: false, error: "Contact not connected" };
    }
    const fileId = await transferManager.startSend(upeerId2, contact.address, resolvedSrc, thumbnail);
    return { success: true, fileId };
  } catch (error$1) {
    error("Error starting file transfer", { err: String(error$1) }, "file-transfer");
    return { success: false, error: error$1 instanceof Error ? error$1.message : "Unknown error" };
  }
});
ipcMain.handle("cancel-file-transfer", (event, { fileId, reason }) => {
  try {
    transferManager.cancelTransfer(fileId, reason);
    return { success: true };
  } catch (error$1) {
    error("Error canceling file transfer", { err: String(error$1) }, "file-transfer");
    return { success: false, error: error$1 instanceof Error ? error$1.message : "Unknown error" };
  }
});
ipcMain.handle("get-file-transfers", () => {
  try {
    const transfers = transferManager.getAllTransfers().map((t) => {
      const { fileBuffer, pendingChunks, timers, _retryTimer, _chunksSentTimes, ...serializableTransfer } = t;
      return {
        ...serializableTransfer,
        pendingChunks: pendingChunks ? Array.from(pendingChunks) : [],
        progress: t.chunksProcessed / t.totalChunks * 100
      };
    });
    return { success: true, transfers };
  } catch (error$1) {
    error("Error getting file transfers", { err: String(error$1) }, "file-transfer");
    return { success: false, error: error$1 instanceof Error ? error$1.message : "Unknown error" };
  }
});
ipcMain.handle("save-transferred-file", async (event, { fileId, destinationPath }) => {
  try {
    if (typeof destinationPath !== "string" || !destinationPath) {
      return { success: false, error: "Invalid destination path" };
    }
    const resolvedDest = path.resolve(destinationPath);
    const homeDir = app.getPath("home");
    const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
    if (!resolvedDest.startsWith(homeDirNormalized) && resolvedDest !== homeDir) {
      return { success: false, error: "Destination must be within home directory" };
    }
    const transfer = transferManager.getTransfer(fileId, "receiving");
    if (!transfer || !transfer.tempPath) {
      return { success: false, error: "Transfer not found or no temporary file" };
    }
    const fs2 = await import("node:fs/promises");
    await fs2.copyFile(transfer.tempPath, resolvedDest);
    return { success: true };
  } catch (error$1) {
    error("Error saving transferred file", { err: String(error$1) }, "file-transfer");
    return { success: false, error: error$1 instanceof Error ? error$1.message : "Unknown error" };
  }
});
ipcMain.handle("show-save-dialog", async (event, { defaultPath, filters }) => {
  try {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const targetWindow = senderWindow || BrowserWindow.getFocusedWindow();
    const opts = {
      defaultPath: typeof defaultPath === "string" ? defaultPath : void 0,
      filters: Array.isArray(filters) ? filters : [
        { name: "Todos los archivos", extensions: ["*"] }
      ]
    };
    const result = targetWindow ? await dialog.showSaveDialog(targetWindow, opts) : await dialog.showSaveDialog(opts);
    return result;
  } catch (error$1) {
    error("Error en show-save-dialog", { err: String(error$1) }, "ipc");
    return { canceled: true };
  }
});
ipcMain.handle("open-file", async (event, { filePath }) => {
  try {
    if (typeof filePath !== "string" || !filePath) {
      return { success: false, error: "Ruta de archivo inválida" };
    }
    const resolvedPath = path.resolve(filePath);
    const homeDir = app.getPath("home");
    const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
    if (!resolvedPath.startsWith(homeDirNormalized) && resolvedPath !== homeDir) {
      return { success: false, error: "El archivo debe estar dentro del directorio home" };
    }
    const errorMsg = await shell.openPath(resolvedPath);
    return { success: !errorMsg, error: errorMsg || void 0 };
  } catch (error$1) {
    error("Error abriendo archivo", { err: String(error$1) }, "ipc");
    return { success: false, error: error$1 instanceof Error ? error$1.message : "Error desconocido" };
  }
});
app.on("before-quit", () => {
  stopYggstack();
});
app.on("window-all-closed", () => {
  stopPeerManager();
  closeDB();
  closeUDPServer();
  stopLanDiscovery();
  if (process.platform !== "darwin") app.quit();
});
export {
  saveMessage as $,
  getContactByRevelnestId as A,
  getMessageById as B,
  addOrUpdateContact as C,
  blockContact as D,
  clearUserData as E,
  closeDB as F,
  computeKeyFingerprint as G,
  countRecentVouchesByFrom as H,
  deleteContact as I,
  deleteMessageLocally as J,
  deleteReaction as K,
  desc as L,
  getBlockedContacts as M,
  getContactByAddress as N,
  getGroupById as O,
  getGroups as P,
  getMessages as Q,
  getVouchIds as R,
  getVouchesByIds as S,
  getVouchesForNode as T,
  initDB as U,
  VouchType as V,
  insertVouch as W,
  isContactBlocked as X,
  or as Y,
  saveFileMessage as Z,
  saveGroup as _,
  distributedAssets as a,
  saveReaction as a0,
  unblockContact as a1,
  updateContactAvatar as a2,
  updateContactDhtLocation as a3,
  updateContactEphemeralPublicKey as a4,
  updateContactLocation as a5,
  updateContactName as a6,
  updateContactPublicKey as a7,
  updateContactSignedPreKey as a8,
  updateContactStatus as a9,
  updateGroupAvatar as aa,
  updateGroupInfo as ab,
  updateGroupMembers as ac,
  updateGroupStatus as ad,
  updateLastSeen as ae,
  updateMessageContent as af,
  vouchExists as ag,
  identity as ah,
  utils as ai,
  server as aj,
  getSchema as b,
  issueVouch as c,
  debug as d,
  eq as e,
  computeScore as f,
  getDb as g,
  and as h,
  info as i,
  gt as j,
  sql as k,
  lt as l,
  getContacts as m,
  network as n,
  sendSecureUDPMessage as o,
  pendingOutbox as p,
  getMyUPeerId as q,
  redundancyHealth as r,
  security as s,
  error as t,
  getMessageStatus as u,
  vaultStorage as v,
  warn as w,
  updateMessageStatus as x,
  deleteMessagesByChatId as y,
  deleteGroup as z
};
