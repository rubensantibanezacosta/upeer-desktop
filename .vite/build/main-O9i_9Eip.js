var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V, _W, _X, _Y, _Z, __, _$, _aa, _ba, _ca, _da, _ea, _fa, _ga, _ha, _ia, _ja, _ka, _la, _ma, _na, _oa, _pa, _qa, _ra, _sa, _ta, _ua, _va, _wa, _xa, _ya, _za, _Aa, _Ba, _Ca, _Da, _Ea, _Fa, _Ga, _Ha, _Ia, _Ja, _Ka, _La, _Ma, _Na, _Oa, _Pa, _Qa, _Ra, _Sa, _Ta, _Ua, _Va, _Wa, _Xa, _Ya, _Za, __a, _$a, _ab, _bb, _cb, _db, _eb, _fb, _gb, _hb, _ib, _jb, _kb, _lb, _mb, _nb, _ob, _pb, _qb, _rb, _sb, _tb, _ub, _vb, _wb, _xb, _yb, _zb, _Ab, _Bb, _Cb, _Db, _Eb, _Fb, _Gb, _Hb, _Ib, _Jb, _Kb, _Lb, _Mb, _Nb, _Ob, _Pb, _Qb, _Rb, _Sb, _Tb, _Ub, _Vb, _Wb, _Xb, _Yb, _Zb, __b, _$b, _ac, _bc, _cc;
import { app, ipcMain, BrowserWindow, dialog } from "electron";
import path from "node:path";
import fs$1 from "node:fs/promises";
import { fileURLToPath } from "node:url";
import started from "electron-squirrel-startup";
import Client from "better-sqlite3";
import crypto$1 from "node:crypto";
import fs from "node:fs";
import dgram from "node:dgram";
import sodium from "sodium-native";
import os from "node:os";
import dns from "node:dns";
import { exec, spawn } from "node:child_process";
import sudo from "@vscode/sudo-prompt";
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
  constructor(table, session, dialect, withList) {
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
    this.session = session;
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
  migrate(migrations, session, config) {
    const migrationsTable = config === void 0 ? "__drizzle_migrations" : typeof config === "string" ? "__drizzle_migrations" : config.migrationsTable ?? "__drizzle_migrations";
    const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
    session.run(migrationTableCreate);
    const dbMigrations = session.values(
      sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`
    );
    const lastDbMigration = dbMigrations[0] ?? void 0;
    session.run(sql`BEGIN`);
    try {
      for (const migration of migrations) {
        if (!lastDbMigration || Number(lastDbMigration[2]) < migration.folderMillis) {
          for (const stmt of migration.sql) {
            session.run(sql.raw(stmt));
          }
          session.run(
            sql`INSERT INTO ${sql.identifier(migrationsTable)} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`
          );
        }
      }
      session.run(sql`COMMIT`);
    } catch (e) {
      session.run(sql`ROLLBACK`);
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
  constructor({ table, fields, isPartialSelect, session, dialect, withList, distinct }) {
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
    this.session = session;
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
  constructor(table, session, dialect, withList) {
    this.table = table;
    this.session = session;
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
  constructor(table, values, session, dialect, withList, select) {
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
    this.session = session;
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
  constructor(table, session, dialect, withList) {
    this.table = table;
    this.session = session;
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
  constructor(table, set, session, dialect, withList) {
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
    this.session = session;
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
  constructor(mode, fullSchema, schema2, tableNamesMap, table, tableConfig, dialect, session) {
    this.mode = mode;
    this.fullSchema = fullSchema;
    this.schema = schema2;
    this.tableNamesMap = tableNamesMap;
    this.table = table;
    this.tableConfig = tableConfig;
    this.dialect = dialect;
    this.session = session;
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
  constructor(fullSchema, schema2, tableNamesMap, table, tableConfig, dialect, session, config, mode) {
    super();
    /** @internal */
    __publicField(this, "mode");
    this.fullSchema = fullSchema;
    this.schema = schema2;
    this.tableNamesMap = tableNamesMap;
    this.table = table;
    this.tableConfig = tableConfig;
    this.dialect = dialect;
    this.session = session;
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
  constructor(resultKind, dialect, session, schema2) {
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
    this.session = session;
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
          session
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
  constructor(resultType, dialect, session, schema2, nestedIndex = 0) {
    super(resultType, dialect, session, schema2);
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
  const session = new BetterSQLiteSession(client, dialect, schema2, { logger: logger2 });
  const db2 = new BetterSQLite3Database("sync", dialect, session, schema2);
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
const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  chatRevelnestId: text("chat_revelnest_id").notNull(),
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
  revelnestId: text("revelnest_id").notNull(),
  emoji: text("emoji").notNull(),
  timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`)
});
const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  revelnestId: text("revelnest_id").unique(),
  address: text("address").notNull(),
  name: text("name").notNull(),
  publicKey: text("public_key"),
  ephemeralPublicKey: text("ephemeral_public_key"),
  dhtSeq: integer("dht_seq").notNull().default(0),
  dhtSignature: text("dht_signature"),
  dhtExpiresAt: integer("dht_expires_at"),
  renewalToken: text("renewal_token"),
  status: text("status").notNull().default("connected"),
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
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  backupSurvivalKit,
  contacts,
  messages,
  reactions
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
      "revelnestId",
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
      source: source || "RevelNest"
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
   * but should still redact other sensitive data
   */
  network(message, ip, data, source) {
    if (!this.shouldLog(
      1
      /* INFO */
    )) return;
    let safeData = data ? { ...data } : {};
    if (ip && !this.isProduction) {
      safeData.ip = ip;
    } else if (ip) {
      safeData.ip = ip.split(":")[0] + ":[REDACTED]";
    }
    safeData = this.redactSensitiveData(safeData);
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
async function initDB(userDataPath) {
  const dbPath = path.join(userDataPath, "p2p-chat.db");
  const sqlite2 = new Client(dbPath);
  const db2 = drizzle(sqlite2, { schema });
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
function saveReaction(messageId, revelnestId2, emoji) {
  const db2 = getDb();
  const schema2 = getSchema();
  const existing = db2.select().from(schema2.reactions).where(and(
    eq(schema2.reactions.messageId, messageId),
    eq(schema2.reactions.revelnestId, revelnestId2),
    eq(schema2.reactions.emoji, emoji)
  )).get();
  if (!existing) {
    return db2.insert(schema2.reactions).values({
      messageId,
      revelnestId: revelnestId2,
      emoji
    }).run();
  }
}
function deleteReaction(messageId, revelnestId2, emoji) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.delete(schema2.reactions).where(and(
    eq(schema2.reactions.messageId, messageId),
    eq(schema2.reactions.revelnestId, revelnestId2),
    eq(schema2.reactions.emoji, emoji)
  )).run();
}
function getContactByRevelnestId(revelnestId2) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.select().from(schema2.contacts).where(eq(schema2.contacts.revelnestId, revelnestId2)).get();
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
    const lastMsgObj = db2.select().from(schema2.messages).where(eq(schema2.messages.chatRevelnestId, c.revelnestId || "")).orderBy(desc(schema2.messages.timestamp)).limit(1).get();
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
function addOrUpdateContact(revelnestId2, address, name, publicKey2, status = "connected", ephemeralPublicKey2, dhtSeq2, dhtSignature, dhtExpiresAt) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.insert(schema2.contacts).values({
    revelnestId: revelnestId2,
    address,
    name,
    publicKey: publicKey2,
    ephemeralPublicKey: ephemeralPublicKey2,
    dhtSeq: dhtSeq2,
    dhtSignature,
    dhtExpiresAt,
    status
  }).onConflictDoUpdate({
    target: schema2.contacts.revelnestId,
    set: {
      address,
      name,
      publicKey: publicKey2,
      ephemeralPublicKey: ephemeralPublicKey2,
      dhtSeq: dhtSeq2,
      dhtSignature,
      dhtExpiresAt,
      status
    }
  }).run();
}
function deleteContact(revelnestId2) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.delete(schema2.contacts).where(eq(schema2.contacts.revelnestId, revelnestId2)).run();
}
function updateContactLocation(revelnestId2, address) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ address, lastSeen: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(schema2.contacts.revelnestId, revelnestId2)).run();
}
function updateContactDhtLocation(revelnestId2, address, dhtSeq2, dhtSignature, dhtExpiresAt, renewalToken) {
  const db2 = getDb();
  const schema2 = getSchema();
  const updateData = { address, dhtSeq: dhtSeq2, dhtSignature, lastSeen: (/* @__PURE__ */ new Date()).toISOString() };
  if (dhtExpiresAt !== void 0) {
    updateData.dhtExpiresAt = dhtExpiresAt;
  }
  if (renewalToken !== void 0) {
    updateData.renewalToken = JSON.stringify(renewalToken);
  }
  return db2.update(schema2.contacts).set(updateData).where(eq(schema2.contacts.revelnestId, revelnestId2)).run();
}
function updateLastSeen(revelnestId2) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ lastSeen: (/* @__PURE__ */ new Date()).toISOString() }).where(eq(schema2.contacts.revelnestId, revelnestId2)).run();
}
function updateContactPublicKey(revelnestId2, publicKey2) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ publicKey: publicKey2, status: "connected" }).where(eq(schema2.contacts.revelnestId, revelnestId2)).run();
}
function updateContactEphemeralPublicKey(revelnestId2, ephemeralPublicKey2) {
  const db2 = getDb();
  const schema2 = getSchema();
  return db2.update(schema2.contacts).set({ ephemeralPublicKey: ephemeralPublicKey2 }).where(eq(schema2.contacts.revelnestId, revelnestId2)).run();
}
let publicKey;
let secretKey;
let revelnestId;
let ephemeralPublicKey;
let ephemeralSecretKey;
let ephemeralKeyRotationInterval = null;
let ephemeralKeyRotationCounter = 0;
const EPHEMERAL_KEY_ROTATION_INTERVAL_MS = 5 * 60 * 1e3;
const EPHEMERAL_KEY_MAX_MESSAGES = 100;
let dhtSeq = 0;
let dhtStatePath;
function initIdentity(userDataPath) {
  const keyPath = path.join(userDataPath, "identity.key");
  if (fs.existsSync(keyPath)) {
    const data = fs.readFileSync(keyPath);
    if (data.length === sodium.crypto_sign_SECRETKEYBYTES) {
      secretKey = data;
      publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
      publicKey = secretKey.subarray(32);
    } else {
      generateNewKeypair(keyPath);
    }
  } else {
    generateNewKeypair(keyPath);
  }
  const hash = Buffer.alloc(16);
  sodium.crypto_generichash(hash, publicKey);
  revelnestId = hash.toString("hex");
  ephemeralPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
  ephemeralSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_box_keypair(ephemeralPublicKey, ephemeralSecretKey);
  startEphemeralKeyRotation();
  dhtStatePath = path.join(userDataPath, "dht_state.json");
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
  info("Identidad RevelNest Inicializada", { revelnestId, dhtSeq }, "identity");
}
function generateNewKeypair(keyPath) {
  publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
  secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
  sodium.crypto_sign_keypair(publicKey, secretKey);
  fs.writeFileSync(keyPath, secretKey);
}
function getMyPublicKeyHex() {
  return publicKey.toString("hex");
}
function getMyRevelNestId() {
  return revelnestId;
}
function getRevelNestIdFromPublicKey(publicKey2) {
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
  const newEphemeralPublicKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
  const newEphemeralSecretKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_box_keypair(newEphemeralPublicKey, newEphemeralSecretKey);
  ephemeralPublicKey = newEphemeralPublicKey;
  ephemeralSecretKey = newEphemeralSecretKey;
  ephemeralKeyRotationCounter = 0;
  info("Ephemeral keys rotated", { rotation: ++ephemeralKeyRotationCounter }, "identity");
  notifyContactsAboutKeyRotation();
}
function notifyContactsAboutKeyRotation() {
  info("Notifying contacts about ephemeral key rotation", {}, "identity");
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
    incrementEphemeralMessageCounter();
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
  if (!success) return null;
  return decrypted;
}
const identity = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  decrypt,
  encrypt,
  getMyEphemeralPublicKeyHex,
  getMyPublicKeyHex,
  getMyRevelNestId,
  getRevelNestIdFromPublicKey,
  incrementEphemeralMessageCounter,
  incrementMyDhtSeq,
  initIdentity,
  rotateEphemeralKeys,
  sign,
  verify
}, Symbol.toStringTag, { value: "Module" }));
const _AdaptivePow = class _AdaptivePow {
  // 5 minutes
  /**
   * Generate a new PoW challenge
   * @param revelnestId The ID of the requester (to prevent precomputation)
   * @param difficultyOverride Optional custom difficulty
   */
  static generateChallenge(revelnestId2, difficultyOverride) {
    const difficulty = difficultyOverride || this.DIFFICULTY_MEDIUM;
    return {
      difficulty,
      timestamp: Date.now(),
      data: revelnestId2
    };
  }
  /**
   * Solve a PoW challenge (client-side)
   * @param challenge The challenge to solve
   * @returns Solution with nonce
   */
  static solveChallenge(challenge) {
    const { difficulty, timestamp, data } = challenge;
    const target = BigInt(1) << BigInt(256 - difficulty);
    let nonce = 0;
    const maxAttempts = 1e6;
    while (nonce < maxAttempts) {
      const hash = crypto$1.createHash("sha256").update(data + timestamp.toString() + nonce.toString()).digest();
      const hashValue = BigInt("0x" + hash.toString("hex"));
      if (hashValue < target) {
        return {
          nonce: nonce.toString(),
          difficulty,
          timestamp
        };
      }
      nonce++;
    }
    return null;
  }
  /**
   * Verify a PoW solution
   * @param solution The solution to verify
   * @param revelnestId Expected revelnestId
   * @returns true if valid
   */
  static verifySolution(solution, revelnestId2) {
    const { nonce, difficulty, timestamp } = solution;
    if (Date.now() - timestamp > this.CHALLENGE_VALIDITY) {
      return false;
    }
    if (difficulty < this.DIFFICULTY_LOW) {
      return false;
    }
    const target = BigInt(1) << BigInt(256 - difficulty);
    const hash = crypto$1.createHash("sha256").update(revelnestId2 + timestamp.toString() + nonce).digest();
    const hashValue = BigInt("0x" + hash.toString("hex"));
    return hashValue < target;
  }
  /**
   * Adjust difficulty based on device type or reputation
   * @param deviceType 'mobile', 'desktop', or 'server'
   * @param reputationScore 0.0 to 1.0 (higher = more trusted)
   */
  static adjustDifficulty(deviceType, reputationScore = 0.5) {
    let baseDifficulty;
    switch (deviceType) {
      case "mobile":
        baseDifficulty = this.DIFFICULTY_LOW;
        break;
      case "desktop":
        baseDifficulty = this.DIFFICULTY_MEDIUM;
        break;
      case "server":
        baseDifficulty = this.DIFFICULTY_HIGH;
        break;
      default:
        baseDifficulty = this.DIFFICULTY_MEDIUM;
    }
    const reputationFactor = 1.5 - reputationScore;
    const adjusted = Math.floor(baseDifficulty * reputationFactor);
    return Math.max(this.DIFFICULTY_LOW, Math.min(this.DIFFICULTY_HIGH, adjusted));
  }
  /**
   * Quick verification for rate-limited endpoints
   * Simpler than full PoW, just checks that some work was done
   */
  static verifyLightProof(proof, revelnestId2) {
    if (!proof || typeof proof !== "string") return false;
    if (!/^[0-9a-f]+$/i.test(proof)) return false;
    if (proof.length > 64) return false;
    const hash = crypto$1.createHash("sha256").update(revelnestId2 + proof).digest("hex");
    return hash.startsWith("0");
  }
  /**
   * Generate a light proof (for mobile devices)
   */
  static generateLightProof(revelnestId2) {
    let nonce = 0;
    const maxAttempts = 1e5;
    while (nonce < maxAttempts) {
      const proof = nonce.toString(16);
      const hash = crypto$1.createHash("sha256").update(revelnestId2 + proof).digest("hex");
      if (hash.startsWith("0")) {
        return proof;
      }
      nonce++;
    }
    return Date.now().toString(16);
  }
};
_AdaptivePow.DIFFICULTY_LOW = 12;
_AdaptivePow.DIFFICULTY_MEDIUM = 16;
_AdaptivePow.DIFFICULTY_HIGH = 20;
_AdaptivePow.CHALLENGE_VALIDITY = 3e5;
let AdaptivePow = _AdaptivePow;
let kademlia = null;
function setKademliaInstance(instance) {
  kademlia = instance;
}
function getKademliaInstance() {
  return kademlia;
}
const DAY_MS = 24 * 60 * 60 * 1e3;
const LOCATION_BLOCK_TTL_MS = 30 * DAY_MS;
const LOCATION_BLOCK_TTL_MAX = 60 * DAY_MS;
const RENEWAL_TOKEN_ALLOWED_UNTIL_MS = 60 * DAY_MS;
const AUTO_RENEW_THRESHOLD_MS = 3 * DAY_MS;
function canonicalStringify(obj) {
  const allKeys = Object.keys(obj).sort();
  return JSON.stringify(obj, allKeys);
}
function generateSignedLocationBlock(address, dhtSeq2, ttlMs, renewalToken) {
  const ttl = LOCATION_BLOCK_TTL_MS;
  const cappedTtl = Math.min(ttl, LOCATION_BLOCK_TTL_MAX);
  const expiresAt = Date.now() + cappedTtl;
  const finalRenewalToken = generateRenewalToken(getMyRevelNestId(), 3);
  const data = { revelnestId: getMyRevelNestId(), address, dhtSeq: dhtSeq2, expiresAt };
  const sig = sign(Buffer.from(canonicalStringify(data))).toString("hex");
  return { address, dhtSeq: dhtSeq2, expiresAt, signature: sig, renewalToken: finalRenewalToken };
}
async function verifyLocationBlockWithDHT(revelnestId2, block, publicKeyHex) {
  if (block.expiresAt !== void 0 && block.expiresAt < Date.now()) {
    if (block.renewalToken && verifyRenewalToken(block.renewalToken, publicKeyHex)) {
      return true;
    }
    const dhtToken = await findRenewalTokenInDHT(revelnestId2);
    if (dhtToken && verifyRenewalToken(dhtToken, publicKeyHex)) {
      return true;
    }
    return false;
  }
  if (block.expiresAt !== void 0) {
    const dataWithExpires = { revelnestId: revelnestId2, address: block.address, dhtSeq: block.dhtSeq, expiresAt: block.expiresAt };
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
  const dataWithoutExpires = { revelnestId: revelnestId2, address: block.address, dhtSeq: block.dhtSeq };
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
  const tokenData = { targetId, allowedUntil, maxRenewals, renewalsUsed: 0 };
  const signature = sign(Buffer.from(canonicalStringify(tokenData))).toString("hex");
  return { ...tokenData, signature };
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
  const newExpiresAt = Date.now() + LOCATION_BLOCK_TTL_MS;
  const renewedBlock = {
    address: block.address,
    dhtSeq: block.dhtSeq,
    expiresAt: newExpiresAt,
    signature: block.signature,
    // Keep original signature (expiresAt not in signature)
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
  const { signature, ...data } = token;
  const isValid = verify(
    Buffer.from(canonicalStringify(data)),
    Buffer.from(signature, "hex"),
    Buffer.from(publicKeyHex, "hex")
  );
  return isValid;
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
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    if (name.includes("ygg") || name === "utun2" || name === "tun0") {
      for (const net of interfaces[name] || []) {
        const family = net.family;
        const isIPv6 = family === "IPv6" || family === 6;
        if (isIPv6 && (net.address.startsWith("200:") || net.address.startsWith("201:"))) {
          return net.address;
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
    console.warn("Kademlia DHT not available for storing renewal token");
    return false;
  }
  const key = createRenewalTokenKey(token.targetId, token.signature);
  try {
    await kademlia2.storeValue(key, token, token.targetId, token.signature);
    console.log(`[Renewal] Stored renewal token for ${token.targetId} in DHT`);
    return true;
  } catch (err) {
    console.error("Failed to store renewal token in DHT:", err);
    return false;
  }
}
async function findRenewalTokenInDHT(targetId, tokenSignature) {
  const kademlia2 = getKademliaInstance();
  if (!kademlia2) {
    console.warn("Kademlia DHT not available for finding renewal token");
    return null;
  }
  const key = createRenewalTokenKey(targetId, "");
  try {
    const result = await kademlia2.findValue(key);
    if (result && result.value) {
      console.log(`[Renewal] Found renewal token for ${targetId} in DHT`);
      return result.value;
    }
  } catch (err) {
    console.error("Failed to find renewal token in DHT:", err);
  }
  return null;
}
const utils = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AUTO_RENEW_THRESHOLD_MS,
  LOCATION_BLOCK_TTL_MAX,
  LOCATION_BLOCK_TTL_MS,
  MAX_DHT_SEQ_JUMP,
  RENEWAL_TOKEN_ALLOWED_UNTIL_MS,
  canRenewLocationBlock,
  canonicalStringify,
  createRenewalTokenKey,
  findRenewalTokenInDHT,
  generateRenewalToken,
  generateSignedLocationBlock,
  getNetworkAddress,
  renewLocationBlock,
  storeRenewalTokenInDHT,
  validateDhtSequence,
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
    security("Invalid DHT_UPDATE signature", { revelnestId: senderRevelnestId }, "dht");
    return;
  }
  const currentSeq = contact.dhtSeq || 0;
  const seqValidation = validateDhtSequence(currentSeq, block.dhtSeq);
  if (!seqValidation.valid) {
    if (seqValidation.requiresPoW) {
      security("Large sequence jump, PoW required", { revelnestId: senderRevelnestId, jump: block.dhtSeq - currentSeq }, "dht");
      return;
    } else {
      security("Invalid sequence", { revelnestId: senderRevelnestId, reason: seqValidation.reason }, "dht");
      return;
    }
  }
  network("Updating location (legacy)", void 0, { revelnestId: senderRevelnestId, address: block.address, dhtSeq: block.dhtSeq }, "dht-legacy");
  updateContactDhtLocation(senderRevelnestId, block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);
  if (block.renewalToken) {
    storeRenewalTokenInDHT(block.renewalToken).catch((err) => {
      console.error("Failed to store renewal token in DHT:", err);
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
  network("Receiving locations (legacy)", void 0, { revelnestId: senderRevelnestId, count: data.peers.length }, "dht-legacy");
  for (const peer of data.peers) {
    if (!peer.revelnestId || !peer.publicKey || !peer.locationBlock) continue;
    if (peer.revelnestId === senderRevelnestId) continue;
    const existing = await getContactByRevelnestId(peer.revelnestId);
    if (!existing) continue;
    const block = peer.locationBlock;
    if (typeof block.dhtSeq !== "number" || !block.address || !block.signature) continue;
    const isValid = await verifyLocationBlockWithDHT(peer.revelnestId, block, existing.publicKey);
    if (!isValid) {
      security("Invalid PEEREX signature", { peerId: peer.revelnestId }, "dht");
      continue;
    }
    const currentSeq = existing.dhtSeq || 0;
    const seqValidation = validateDhtSequence(currentSeq, block.dhtSeq);
    if (!seqValidation.valid) {
      if (seqValidation.requiresPoW) {
        security("Large sequence jump, PoW required", { peerId: peer.revelnestId, jump: block.dhtSeq - currentSeq }, "dht");
        continue;
      } else {
        security("Invalid sequence", { peerId: peer.revelnestId, reason: seqValidation.reason }, "dht");
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
          { peerId: peer.revelnestId, renewalsUsed: finalRenewalToken.renewalsUsed },
          "dht-renewal"
        );
      }
    }
    updateContactDhtLocation(peer.revelnestId, finalBlock.address, finalBlock.dhtSeq, finalBlock.signature, finalBlock.expiresAt, finalRenewalToken);
    if (finalRenewalToken) {
      storeRenewalTokenInDHT(finalRenewalToken).catch((err) => {
        console.error("Failed to store renewal token in DHT:", err);
      });
    }
    if (finalRenewalToken) {
      network("Received renewal token via exchange", void 0, { peerId: peer.revelnestId }, "dht-renewal");
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
      expiresAt: target.expiresAt,
      renewalToken: target.renewalToken
    };
    responseData.publicKey = target.publicKey;
  } else {
    const kademlia2 = getKademliaInstance();
    if (kademlia2) {
      const locationBlock = await kademlia2.findLocationBlock(data.targetId);
      if (locationBlock) {
        responseData.locationBlock = locationBlock;
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
          console.error("Failed to store renewal token in DHT:", err);
        });
      }
    }
  }
}
async function publishLocationBlock(address, dhtSeq2, signature, renewalToken) {
  const kademlia2 = getKademliaInstance();
  if (!kademlia2) return;
  const locationBlock = { address, dhtSeq: dhtSeq2, signature, renewalToken };
  await kademlia2.storeLocationBlock(kademlia2["revelnestId"], locationBlock);
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
async function findNodeLocation(revelnestId2) {
  const kademlia2 = getKademliaInstance();
  if (!kademlia2) return null;
  const locationBlock = await kademlia2.findLocationBlock(revelnestId2);
  return (locationBlock == null ? void 0 : locationBlock.address) || null;
}
async function iterativeFindNode(revelnestId2, sendMessage) {
  const kademlia2 = getKademliaInstance();
  if (!kademlia2) return null;
  const kademliaInstance = kademlia2;
  const closestContacts = kademliaInstance.findClosestContacts(revelnestId2, 3);
  for (const contact of closestContacts) {
    try {
      sendMessage(contact.address, {
        type: "DHT_FIND_NODE",
        targetId: revelnestId2
      });
    } catch (error2) {
      warn("Failed to query contact", { contactId: contact.revelnestId, error: error2 }, "kademlia");
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
      console.error("Auto-renewal failed:", err);
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
  // 16KB - Safe for UDP
  maxFileSize: 100 * 1024 * 1024,
  // 100MB
  transferTimeout: 3e5,
  maxRetries: 3,
  cleanupInterval: 6e4,
  initialWindowSize: 20,
  maxWindowSize: 1e3
  // Up to 16MB in flight with 16KB chunks
};
class FileTransferStore {
  constructor() {
    this.transfers = /* @__PURE__ */ new Map();
  }
  createTransfer(data) {
    const fileId = data.fileId || crypto$1.randomUUID();
    const transfer = {
      fileId,
      revelnestId: data.revelnestId,
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
    const tempDir = await fs$1.mkdtemp(path.join(process.env.TMPDIR || "/tmp", "revelnest-"));
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
        console.debug("Error cleaning up temp file:", error2);
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
class TransferManager {
  // fileId -> fs.FileHandle
  constructor(config = {}) {
    this.fileHandles = /* @__PURE__ */ new Map();
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
  async startSend(revelnestId2, address, filePath, thumbnail) {
    try {
      const fileInfo = await this.validator.validateAndPrepareFile(filePath);
      const totalChunks = this.chunker.calculateChunks(fileInfo.size);
      const transfer = this.store.createTransfer({
        revelnestId: revelnestId2,
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
      this.send(address, {
        type: "FILE_PROPOSAL",
        fileId: transfer.fileId,
        fileName: transfer.fileName,
        fileSize: transfer.fileSize,
        mimeType: transfer.mimeType,
        totalChunks: transfer.totalChunks,
        chunkSize: transfer.chunkSize,
        fileHash: transfer.fileHash,
        thumbnail
      });
      this.notifyUIStarted(transfer);
      this.saveToDB(transfer);
      return transfer.fileId;
    } catch (err) {
      error("Error starting file transfer", err, "file-transfer");
      throw err;
    }
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
      }
    });
  }
  // --- MESSAGE HANDLERS ---
  async handleMessage(revelnestId2, address, data) {
    switch (data.type) {
      case "FILE_PROPOSAL":
        await this.handleProposal(revelnestId2, address, data);
        break;
      case "FILE_ACCEPT":
        await this.handleAccept(revelnestId2, address, data);
        break;
      case "FILE_CHUNK":
        await this.handleChunk(revelnestId2, address, data);
        break;
      case "FILE_CHUNK_ACK":
        await this.handleChunkAck(revelnestId2, address, data);
        break;
      case "FILE_DONE_ACK":
        await this.handleDoneAck(revelnestId2, address, data);
        break;
      case "FILE_CANCEL":
        await this.handleCancel(revelnestId2, address, data);
        break;
    }
  }
  async handleProposal(revelnestId2, address, data) {
    try {
      this.validator.validateIncomingFile(data);
      const transfer = this.store.createTransfer({
        fileId: data.fileId,
        revelnestId: revelnestId2,
        peerAddress: address,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        totalChunks: data.totalChunks,
        chunkSize: data.chunkSize,
        fileHash: data.fileHash || "",
        thumbnail: data.thumbnail,
        direction: "receiving"
      });
      await this.chunker.createTempFile(transfer);
      this.store.updateTransfer(data.fileId, "receiving", {
        state: "active",
        phase: TransferPhase.READY,
        tempPath: transfer.tempPath
      });
      this.send(address, {
        type: "FILE_ACCEPT",
        fileId: data.fileId
      });
      this.notifyUIStarted(transfer);
      this.saveToDB(transfer);
    } catch (err) {
      error("Error handling file proposal", err, "file-transfer");
      this.send(address, { type: "FILE_CANCEL", fileId: data.fileId, reason: "Rejected by receiver" });
    }
  }
  async handleAccept(revelnestId2, address, data) {
    const transfer = this.store.getTransfer(data.fileId, "sending");
    if (!transfer || transfer.phase !== TransferPhase.PROPOSED) return;
    const updatedTransfer = this.store.updateTransfer(data.fileId, "sending", { phase: TransferPhase.TRANSFERRING });
    if (updatedTransfer) this.notifyUIProgress(updatedTransfer);
    this.sendNextChunks(transfer, address);
  }
  async handleChunk(revelnestId2, address, data) {
    const transfer = this.store.getTransfer(data.fileId, "receiving");
    if (!transfer || transfer.state !== "active") return;
    try {
      let handle = this.fileHandles.get(transfer.fileId);
      if (!handle && transfer.tempPath) {
        handle = await fs$1.open(transfer.tempPath, "r+");
        this.fileHandles.set(transfer.fileId, handle);
      }
      if (handle) {
        const buffer = Buffer.from(data.data, "base64");
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
  async handleChunkAck(revelnestId2, address, data) {
    const transfer = this.store.getTransfer(data.fileId, "sending");
    if (!transfer || transfer.state !== "active") return;
    console.log(`[Transfer] Received ACK for chunk ${data.chunkIndex}`);
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
        let newWindowSize = updatedTransfer.windowSize || 20;
        let newSsthresh = updatedTransfer.ssthresh || 64;
        let consecutiveAcks = (updatedTransfer.consecutiveAcks || 0) + 1;
        if (newWindowSize < newSsthresh) {
          newWindowSize += 1;
        } else {
          if (consecutiveAcks >= Math.floor(newWindowSize)) {
            newWindowSize += 1;
            consecutiveAcks = 0;
          }
        }
        newWindowSize = Math.min(newWindowSize, 1e3);
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
  async handleDoneAck(revelnestId2, address, data) {
    var _a2;
    const transfer = this.store.getTransfer(data.fileId, "sending");
    if (!transfer || transfer.state === "completed") return;
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
        revelnestId: updated.revelnestId
      });
    }
  }
  async handleCancel(revelnestId2, address, data) {
    ["sending", "receiving"].forEach(async (dir) => {
      const transfer = this.store.getTransfer(data.fileId, dir);
      if (transfer) {
        if (transfer._retryTimer) {
          clearTimeout(transfer._retryTimer);
          transfer._retryTimer = null;
        }
        const handle = this.fileHandles.get(data.fileId);
        if (handle) {
          handle.close().catch(() => {
          });
          this.fileHandles.delete(data.fileId);
        }
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
    const maxInFlight = Math.floor(transfer.windowSize || 20);
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
      console.log(`[Transfer] CONGESTION DETECTED. Window: ${currentWindow} -> 2, ssthresh: ${newSsthresh}, RTO: ${retryTimeout}ms`);
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
            console.log(`[Transfer] Retransmitting chunk ${chunkIndex} (RTO match)`);
            this.send(address, { type: "FILE_CHUNK", ...chunkData });
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
          console.log(`[Transfer] Sending chunk ${currentIndex}/${transfer.totalChunks}. Window: ${maxInFlight}`);
          this.send(address, {
            type: "FILE_CHUNK",
            ...chunkData
          });
        }
      }
      currentIndex++;
    }
    const unackedCount = transfer.totalChunks - transfer.pendingChunks.size;
    if (unackedCount > 0 && !transfer._retryTimer) {
      transfer._retryTimer = setTimeout(() => {
        transfer._retryTimer = null;
        if (transfer.state === "active") this.sendNextChunks(transfer, address);
      }, retryTimeout + 100);
    }
  }
  async completeReceiver(transfer, address) {
    if (transfer.state === "completed" || transfer.phase >= TransferPhase.VERIFYING) return;
    try {
      this.store.updateTransfer(transfer.fileId, "receiving", { phase: TransferPhase.VERIFYING });
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
      const myId = getMyRevelNestId();
      const isSelf = transfer.revelnestId === myId;
      if (isSelf && transfer.direction === "receiving") {
        return;
      }
      saveFileMessage(
        transfer.fileId,
        // Use stable transfer ID to prevent duplicates
        transfer.revelnestId,
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
      revelnestId: transfer.revelnestId,
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
      "CHAT_REACTION": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "CHAT_UPDATE": { windowMs: 6e4, maxTokens: 20, refillRate: 20 / 60 },
      "CHAT_DELETE": { windowMs: 6e4, maxTokens: 20, refillRate: 20 / 60 },
      // Kademlia DHT messages
      "DHT_FIND_NODE": { windowMs: 3e4, maxTokens: 30, refillRate: 30 / 30 },
      "DHT_FIND_VALUE": { windowMs: 3e4, maxTokens: 30, refillRate: 30 / 30 },
      "DHT_STORE": { windowMs: 6e4, maxTokens: 10, refillRate: 10 / 60 },
      // File transfer messages (supporting multiple naming conventions for consistency)
      "FILE_START": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "FILE_PROPOSAL": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "FILE_ACCEPT": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "FILE_CHUNK": { windowMs: 1e3, maxTokens: 5e3, refillRate: 5e3 },
      "FILE_ACK": { windowMs: 1e3, maxTokens: 5e3, refillRate: 5e3 },
      "FILE_CHUNK_ACK": { windowMs: 1e3, maxTokens: 5e3, refillRate: 5e3 },
      "FILE_END": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "FILE_DONE_ACK": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 },
      "FILE_CANCEL": { windowMs: 6e4, maxTokens: 50, refillRate: 50 / 60 }
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
      console.log("DEBUG RateLimiter - ALLOWED:", {
        ip,
        messageType,
        remainingTokens: bucket.tokens,
        maxTokens: rule.maxTokens,
        timestamp: now
      });
      return true;
    }
    warn("Rate limited", { ip, messageType, tokens: bucket.tokens.toFixed(2) }, "rate-limiter");
    console.log("DEBUG RateLimiter - BLOCKED:", {
      ip,
      messageType,
      remainingTokens: bucket.tokens,
      maxTokens: rule.maxTokens,
      timestamp: now
    });
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
class SocialReputation {
  // Activity history
  constructor() {
    this.graph = /* @__PURE__ */ new Map();
    this.trustScores = /* @__PURE__ */ new Map();
    this.activityLogs = /* @__PURE__ */ new Map();
    info("Social reputation system initialized", {}, "reputation");
  }
  // Add a connection between two nodes
  addConnection(nodeA, nodeB) {
    if (!this.graph.has(nodeA)) {
      this.graph.set(nodeA, /* @__PURE__ */ new Set());
    }
    this.graph.get(nodeA).add(nodeB);
    if (!this.graph.has(nodeB)) {
      this.graph.set(nodeB, /* @__PURE__ */ new Set());
    }
    this.graph.get(nodeB).add(nodeA);
    if (!this.trustScores.has(nodeA)) {
      this.trustScores.set(nodeA, 50);
    }
    if (!this.trustScores.has(nodeB)) {
      this.trustScores.set(nodeB, 50);
    }
    info("Connection added", { nodeA, nodeB }, "reputation");
  }
  // Remove a connection
  removeConnection(nodeA, nodeB) {
    if (this.graph.has(nodeA)) {
      this.graph.get(nodeA).delete(nodeB);
    }
    if (this.graph.has(nodeB)) {
      this.graph.get(nodeB).delete(nodeA);
    }
    info("Connection removed", { nodeA, nodeB }, "reputation");
  }
  // Log activity for a node
  logActivity(nodeId, activityType, details) {
    if (!this.activityLogs.has(nodeId)) {
      this.activityLogs.set(nodeId, []);
    }
    const activity = {
      timestamp: Date.now(),
      type: activityType,
      details
    };
    this.activityLogs.get(nodeId).push(activity);
    if (this.activityLogs.get(nodeId).length > 1e3) {
      this.activityLogs.set(nodeId, this.activityLogs.get(nodeId).slice(-1e3));
    }
    this.updateTrustScore(nodeId, activityType);
  }
  // Update trust score based on activity
  updateTrustScore(nodeId, activityType) {
    const currentScore = this.trustScores.get(nodeId) || 50;
    let newScore = currentScore;
    switch (activityType) {
      case "MESSAGE_SENT":
        newScore += 0.1;
        break;
      case "MESSAGE_RECEIVED":
        newScore += 0.05;
        break;
      case "HANDSHAKE_COMPLETED":
        newScore += 1;
        break;
      case "DHT_UPDATE":
        newScore += 0.2;
        break;
      case "SPAM_DETECTED":
        newScore -= 5;
        break;
      case "MALICIOUS_ACTIVITY":
        newScore -= 10;
        break;
      case "INACTIVE_PERIOD":
        newScore -= 0.01;
        break;
    }
    newScore = Math.max(0, Math.min(100, newScore));
    this.trustScores.set(nodeId, newScore);
    info("Trust score updated", { nodeId, oldScore: currentScore, newScore }, "reputation");
  }
  // Calculate reputation score using social graph analysis
  calculateReputation(nodeId) {
    const trustScore = this.trustScores.get(nodeId) || 50;
    const connections = this.graph.get(nodeId) || /* @__PURE__ */ new Set();
    const centrality = this.calculateCentrality(nodeId);
    const activityScore = this.calculateActivityScore(nodeId);
    const reputation = {
      trustScore,
      centrality,
      activityScore,
      connectionCount: connections.size,
      weightedScore: this.calculateWeightedScore(trustScore, centrality, activityScore)
    };
    return reputation;
  }
  // Calculate network centrality (betweenness approximation)
  calculateCentrality(nodeId) {
    const connections = this.graph.get(nodeId);
    if (!connections || connections.size === 0) return 0;
    let centrality = 0;
    for (const neighbor of connections) {
      const neighborConnections = this.graph.get(neighbor);
      if (neighborConnections) {
        centrality += neighborConnections.size;
      }
    }
    return Math.min(100, centrality);
  }
  // Calculate activity score based on recent activity
  calculateActivityScore(nodeId) {
    const activities = this.activityLogs.get(nodeId);
    if (!activities || activities.length === 0) return 0;
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1e3;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1e3;
    let recentActivity = 0;
    let weeklyActivity = 0;
    for (const activity of activities) {
      if (activity.timestamp >= oneDayAgo) {
        recentActivity++;
      }
      if (activity.timestamp >= oneWeekAgo) {
        weeklyActivity++;
      }
    }
    const dailyScore = Math.min(100, recentActivity * 10);
    const weeklyScore = Math.min(100, weeklyActivity * 2);
    return dailyScore * 0.7 + weeklyScore * 0.3;
  }
  // Calculate weighted reputation score
  calculateWeightedScore(trustScore, centrality, activityScore) {
    const trustWeight = 0.5;
    const centralityWeight = 0.2;
    const activityWeight = 0.3;
    return trustScore * trustWeight + centrality * centralityWeight + activityScore * activityWeight;
  }
  // Check if a node is likely Sybil
  isLikelySybil(nodeId) {
    const reputation = this.calculateReputation(nodeId);
    const isSybil = reputation.connectionCount < 3 || // Few connections
    reputation.activityScore < 10 || // Low activity
    reputation.trustScore < 20 || // Low trust
    reputation.weightedScore < 30;
    if (isSybil) {
      warn("Potential Sybil node detected", { nodeId, reputation }, "reputation");
    }
    return isSybil;
  }
  // Get recommendations for new connections
  getConnectionRecommendations(nodeId, limit = 5) {
    const recommendations = [];
    const existingConnections = this.graph.get(nodeId) || /* @__PURE__ */ new Set();
    for (const friend of existingConnections) {
      const friendsFriends = this.graph.get(friend);
      if (friendsFriends) {
        for (const friendOfFriend of friendsFriends) {
          if (friendOfFriend === nodeId || existingConnections.has(friendOfFriend)) {
            continue;
          }
          const reputation = this.calculateReputation(friendOfFriend);
          const score = reputation.weightedScore;
          recommendations.push({ node: friendOfFriend, score });
        }
      }
    }
    return recommendations.sort((a, b) => b.score - a.score).slice(0, limit).map((r) => r.node);
  }
  // Export reputation data (for backup/analysis)
  exportData() {
    return {
      graph: Array.from(this.graph.entries()).map(([node, connections]) => ({
        node,
        connections: Array.from(connections)
      })),
      trustScores: Array.from(this.trustScores.entries()),
      nodeCount: this.graph.size
    };
  }
  // Import reputation data
  importData(data) {
    this.graph.clear();
    this.trustScores.clear();
    for (const nodeData of data.graph) {
      this.graph.set(nodeData.node, new Set(nodeData.connections));
    }
    for (const [node, score] of data.trustScores) {
      this.trustScores.set(node, score);
    }
    info("Reputation data imported", { nodeCount: data.nodeCount }, "reputation");
  }
  // Get statistics
  getStats() {
    const nodes = Array.from(this.graph.keys());
    const scores = nodes.map((node) => this.trustScores.get(node) || 50);
    return {
      totalNodes: nodes.length,
      averageTrustScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      minTrustScore: Math.min(...scores),
      maxTrustScore: Math.max(...scores),
      totalConnections: Array.from(this.graph.values()).reduce((total, connections) => total + connections.size, 0)
    };
  }
}
var ActivityType = /* @__PURE__ */ ((ActivityType2) => {
  ActivityType2["MESSAGE_SENT"] = "MESSAGE_SENT";
  ActivityType2["MESSAGE_RECEIVED"] = "MESSAGE_RECEIVED";
  ActivityType2["HANDSHAKE_COMPLETED"] = "HANDSHAKE_COMPLETED";
  ActivityType2["DHT_UPDATE"] = "DHT_UPDATE";
  ActivityType2["SPAM_DETECTED"] = "SPAM_DETECTED";
  ActivityType2["MALICIOUS_ACTIVITY"] = "MALICIOUS_ACTIVITY";
  ActivityType2["INACTIVE_PERIOD"] = "INACTIVE_PERIOD";
  return ActivityType2;
})(ActivityType || {});
let reputationInstance = null;
function getReputationSystem() {
  if (!reputationInstance) {
    reputationInstance = new SocialReputation();
  }
  return reputationInstance;
}
class IdentityRateLimiter extends RateLimiter {
  constructor(rules, reputationSystem) {
    super(rules);
    this.identityBuckets = /* @__PURE__ */ new Map();
    this.reputationSystem = reputationSystem || getReputationSystem();
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
  checkIdentityOnly(revelnestId2, messageType) {
    if (!revelnestId2) {
      return true;
    }
    const rule = this.rules[messageType];
    if (!rule) {
      return true;
    }
    const adjustedRule = this.getAdjustedRule(revelnestId2, messageType, rule);
    const now = Date.now();
    if (!this.identityBuckets.has(revelnestId2)) {
      this.identityBuckets.set(revelnestId2, /* @__PURE__ */ new Map());
    }
    const identityBuckets = this.identityBuckets.get(revelnestId2);
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
      revelnestId: revelnestId2,
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
  checkIdentity(ip, revelnestId2, messageType) {
    return this.checkIdentityOnly(revelnestId2, messageType);
  }
  /**
   * Get reputation-adjusted rate limit rule
   */
  getAdjustedRule(revelnestId2, messageType, baseRule) {
    const reputation = this.reputationSystem.calculateReputation(revelnestId2);
    const reputationMultiplier = this.calculateReputationMultiplier(reputation);
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
  calculateReputationMultiplier(reputation) {
    const score = reputation.weightedScore;
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
  resetIdentity(revelnestId2) {
    this.identityBuckets.delete(revelnestId2);
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
  getIdentityTokenCount(revelnestId2, messageType) {
    const identityBuckets = this.identityBuckets.get(revelnestId2);
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
    for (const [revelnestId2, identityBuckets] of this.identityBuckets.entries()) {
      let hasActivity = false;
      for (const bucket of identityBuckets.values()) {
        if (now - bucket.lastRefill < maxAgeMs) {
          hasActivity = true;
          break;
        }
      }
      if (!hasActivity) {
        toDelete.push(revelnestId2);
      }
    }
    for (const revelnestId2 of toDelete) {
      this.identityBuckets.delete(revelnestId2);
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
  if (data.powProof && (typeof data.powProof !== "string" || !/^[0-9a-f]+$/i.test(data.powProof))) {
    return { valid: false, error: "Invalid powProof format" };
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
  return { valid: true };
}
function validateChat(data) {
  if (!data.id || typeof data.id !== "string" || data.id.length > 100) {
    return { valid: false, error: "Invalid message id" };
  }
  if (!data.content || typeof data.content !== "string") {
    return { valid: false, error: "Invalid content" };
  }
  if (data.content.length > 1e4) {
    return { valid: false, error: "Content too long" };
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
  if (data.content.length > 1e4) {
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
    if (!peer.revelnestId || typeof peer.revelnestId !== "string" || peer.revelnestId.length !== 32) {
      return { valid: false, error: "Invalid peer revelnestId" };
    }
    if (!peer.publicKey || typeof peer.publicKey !== "string" || peer.publicKey.length !== 64) {
      return { valid: false, error: "Invalid peer publicKey" };
    }
  }
  return { valid: true };
}
function validateDhtFindNode(data) {
  if (!data.target || typeof data.target !== "string" || data.target.length !== 32) {
    return { valid: false, error: "Invalid target" };
  }
  return { valid: true };
}
function validateDhtFindValue(data) {
  if (!data.key || typeof data.key !== "string" || data.key.length !== 64) {
    return { valid: false, error: "Invalid key" };
  }
  return { valid: true };
}
function validateDhtStore(data) {
  if (!data.key || typeof data.key !== "string" || data.key.length !== 64) {
    return { valid: false, error: "Invalid key" };
  }
  if (!data.value || typeof data.value !== "string") {
    return { valid: false, error: "Invalid value" };
  }
  if (data.value.length > 1e4) {
    return { valid: false, error: "Value too large" };
  }
  if (typeof data.ttl !== "number" || data.ttl < 0 || data.ttl > 2592e3) {
    return { valid: false, error: "Invalid TTL" };
  }
  return { valid: true };
}
function validateFileProposal(data) {
  if (!data.fileId || typeof data.fileId !== "string") return { valid: false, error: "Invalid fileId" };
  if (!data.fileName || typeof data.fileName !== "string") return { valid: false, error: "Invalid fileName" };
  if (typeof data.fileSize !== "number" || data.fileSize < 0) return { valid: false, error: "Invalid fileSize" };
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
      return validatePingPong();
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
    default:
      return { valid: false, error: `Unknown message type: ${type}` };
  }
}
const rateLimiter = new IdentityRateLimiter();
async function handlePacket(msg, rinfo, win, sendResponse, startDhtSearch2) {
  var _a2;
  try {
    const fullPacket = JSON.parse(msg.toString());
    const { signature, senderRevelnestId, ...data } = fullPacket;
    console.log("DEBUG handlePacket - RAW PACKET ARRIVED:", {
      type: data.type,
      fromAddress: rinfo.address,
      fromPort: rinfo.port,
      size: msg.length,
      hasSignature: !!signature,
      hasSenderId: !!senderRevelnestId,
      timestamp: Date.now()
    });
    if (data.type === "FILE_CHUNK") {
      console.log("DEBUG handlePacket - FILE_CHUNK RAW:", {
        fileId: data.fileId,
        chunkIndex: data.chunkIndex,
        totalChunks: data.totalChunks,
        fromAddress: rinfo.address,
        dataSize: (_a2 = data.data) == null ? void 0 : _a2.length,
        signatureLength: signature == null ? void 0 : signature.length,
        timestamp: Date.now()
      });
    }
    if (!data.type || typeof data.type !== "string") {
      security("Packet missing type", { ip: rinfo.address }, "network");
      return;
    }
    if (!rateLimiter.checkIp(rinfo.address, data.type)) {
      console.log("DEBUG handlePacket - IP RATE LIMITED:", {
        type: data.type,
        ip: rinfo.address,
        fileId: data.fileId,
        chunkIndex: data.chunkIndex,
        timestamp: Date.now()
      });
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
      const isValidSignature = verify(
        Buffer.from(canonicalStringify(dataForVerification2)),
        Buffer.from(signature, "hex"),
        Buffer.from(data.publicKey, "hex")
      );
      if (!isValidSignature) {
        security("Invalid HANDSHAKE_REQ signature", { ip: rinfo.address }, "network");
        return;
      }
      const derivedId = getRevelNestIdFromPublicKey(Buffer.from(data.publicKey, "hex"));
      if (derivedId !== senderRevelnestId) {
        security("HANDSHAKE_REQ ID mismatch", { ip: rinfo.address, expected: derivedId, received: senderRevelnestId }, "network");
        return;
      }
      network("Handshake request verified", rinfo.address, { revelnestId: senderRevelnestId }, "handshake");
      if (!rateLimiter.checkIdentity(rinfo.address, senderRevelnestId, data.type)) {
        return;
      }
      const existingContact = await getContactByRevelnestId(senderRevelnestId);
      const isNewContact = !existingContact;
      if (isNewContact) {
        if (!data.powProof) {
          security("New contact requires PoW proof", { revelnestId: senderRevelnestId, ip: rinfo.address }, "pow");
          return;
        }
        if (!AdaptivePow.verifyLightProof(data.powProof, senderRevelnestId)) {
          security("Invalid PoW proof from new contact", { revelnestId: senderRevelnestId, ip: rinfo.address }, "pow");
          return;
        }
        security("PoW verified for new contact", { revelnestId: senderRevelnestId, ip: rinfo.address }, "pow");
      }
      const reputation = getReputationSystem();
      const myId = getMyRevelNestId();
      reputation.addConnection(myId, senderRevelnestId);
      reputation.logActivity(senderRevelnestId, ActivityType.HANDSHAKE_COMPLETED, { source: "incoming" });
      const isSybil = reputation.isLikelySybil(senderRevelnestId);
      if (isSybil) {
        security("Potential Sybil contact detected", { revelnestId: senderRevelnestId, ip: rinfo.address }, "reputation");
        win == null ? void 0 : win.webContents.send("contact-untrustworthy", {
          revelnestId: senderRevelnestId,
          address: rinfo.address,
          alias: data.alias,
          reason: "low_reputation"
        });
      }
      const isAlreadyConnected = (existingContact == null ? void 0 : existingContact.status) === "connected";
      const newStatus = isAlreadyConnected ? "connected" : "incoming";
      const alias = data.alias || (existingContact == null ? void 0 : existingContact.name) || `Peer ${senderRevelnestId.slice(0, 4)}`;
      addOrUpdateContact(senderRevelnestId, rinfo.address, alias, data.publicKey, newStatus, data.ephemeralPublicKey);
      if (isAlreadyConnected) {
        win == null ? void 0 : win.webContents.send("contact-presence", { revelnestId: senderRevelnestId, lastSeen: (/* @__PURE__ */ new Date()).toISOString() });
        Promise.resolve().then(() => server).then(({ acceptContactRequest: acceptContactRequest2 }) => {
          acceptContactRequest2(senderRevelnestId, data.publicKey);
        }).catch((err) => error("Failed to auto-accept known contact", err, "network"));
        return;
      }
      win == null ? void 0 : win.webContents.send("contact-request-received", {
        revelnestId: senderRevelnestId,
        address: rinfo.address,
        alias: data.alias,
        publicKey: data.publicKey,
        ephemeralPublicKey: data.ephemeralPublicKey
      });
      return;
    }
    if (data.type === "HANDSHAKE_ACCEPT") {
      if (!signature || !senderRevelnestId || !data.publicKey) {
        security("HANDSHAKE_ACCEPT missing required fields", { ip: rinfo.address }, "network");
        return;
      }
      const isValidSignature = verify(
        Buffer.from(canonicalStringify(data)),
        Buffer.from(signature, "hex"),
        Buffer.from(data.publicKey, "hex")
      );
      if (!isValidSignature) {
        security("Invalid HANDSHAKE_ACCEPT signature", { ip: rinfo.address }, "network");
        return;
      }
      const derivedId = getRevelNestIdFromPublicKey(Buffer.from(data.publicKey, "hex"));
      if (derivedId !== senderRevelnestId) {
        security("HANDSHAKE_ACCEPT ID mismatch", { ip: rinfo.address, expected: derivedId, received: senderRevelnestId }, "network");
        return;
      }
      network("Handshake accepted verified", rinfo.address, { revelnestId: senderRevelnestId }, "handshake");
      if (!rateLimiter.checkIdentity(rinfo.address, senderRevelnestId, data.type)) {
        return;
      }
      const ghost = await getContactByAddress(rinfo.address);
      if (ghost && ghost.revelnestId.startsWith("pending-")) {
        deleteContact(ghost.revelnestId);
      }
      const existing = await getContactByRevelnestId(senderRevelnestId);
      if (existing && existing.status === "pending") {
        updateContactPublicKey(senderRevelnestId, data.publicKey);
        if (data.ephemeralPublicKey) {
          updateContactEphemeralPublicKey(senderRevelnestId, data.ephemeralPublicKey);
        }
        win == null ? void 0 : win.webContents.send("contact-handshake-finished", { revelnestId: senderRevelnestId });
      }
      return;
    }
    const revelnestId2 = senderRevelnestId;
    if (!revelnestId2) return;
    const contact = await getContactByRevelnestId(revelnestId2);
    if (!contact || contact.status !== "connected" || !contact.publicKey) {
      console.log("DEBUG handlePacket - CONTACT VALIDATION FAILED:", {
        type: data.type,
        fileId: data.fileId,
        chunkIndex: data.chunkIndex,
        revelnestId: revelnestId2,
        hasContact: !!contact,
        contactStatus: contact == null ? void 0 : contact.status,
        hasPublicKey: !!(contact == null ? void 0 : contact.publicKey),
        timestamp: Date.now()
      });
      security("Origin not connected or missing key", { revelnestId: revelnestId2, ip: rinfo.address }, "network");
      return;
    }
    if (data.type === "FILE_CHUNK") {
      console.log("DEBUG handlePacket - FILE_CHUNK BEFORE SIGNATURE VERIFICATION:", {
        fileId: data.fileId,
        chunkIndex: data.chunkIndex,
        hasContact: !!contact,
        contactStatus: contact == null ? void 0 : contact.status,
        hasPublicKey: !!(contact == null ? void 0 : contact.publicKey),
        signatureLength: signature == null ? void 0 : signature.length,
        timestamp: Date.now()
      });
    }
    const fieldsToExclude = ["contactCache", "renewalToken"];
    const dataForVerification = { ...data };
    fieldsToExclude.forEach((field) => {
      if (field in dataForVerification) {
        delete dataForVerification[field];
      }
    });
    const verified = verify(
      Buffer.from(canonicalStringify(dataForVerification)),
      Buffer.from(signature, "hex"),
      Buffer.from(contact.publicKey, "hex")
    );
    if (!verified) {
      console.log("DEBUG handlePacket - SIGNATURE VERIFICATION FAILED:", {
        type: data.type,
        fileId: data.fileId,
        chunkIndex: data.chunkIndex,
        revelnestId: revelnestId2,
        timestamp: Date.now()
      });
      security("Invalid signature", { revelnestId: revelnestId2, ip: rinfo.address }, "network");
      return;
    } else if (data.type === "FILE_CHUNK") {
      console.log("DEBUG handlePacket - FILE_CHUNK SIGNATURE VERIFIED:", {
        fileId: data.fileId,
        chunkIndex: data.chunkIndex,
        revelnestId: revelnestId2,
        timestamp: Date.now()
      });
    }
    if (!rateLimiter.checkIdentity(rinfo.address, revelnestId2, data.type)) {
      console.log("DEBUG handlePacket - RATE LIMITED:", {
        type: data.type,
        fileId: data.fileId,
        chunkIndex: data.chunkIndex,
        revelnestId: revelnestId2,
        ip: rinfo.address,
        timestamp: Date.now()
      });
      return;
    }
    if (contact.address !== rinfo.address) {
      updateContactLocation(revelnestId2, rinfo.address);
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    updateLastSeen(revelnestId2);
    win == null ? void 0 : win.webContents.send("contact-presence", { revelnestId: revelnestId2, lastSeen: nowIso });
    if (data.type.startsWith("DHT_")) {
      const handled = await handleDhtPacket(
        data.type,
        data,
        revelnestId2,
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
        break;
      case "PONG":
        console.log("DEBUG handlePacket - PONG received:", {
          fromAddress: rinfo.address,
          revelnestId: revelnestId2,
          timestamp: Date.now()
        });
        break;
      case "CHAT":
        handleChatMessage(revelnestId2, contact, data, win, signature, rinfo.address, sendResponse);
        break;
      case "ACK":
        handleAck(revelnestId2, data, win);
        break;
      case "READ":
        handleReadReceipt(revelnestId2, data, win);
        break;
      case "TYPING":
        win == null ? void 0 : win.webContents.send("peer-typing", { revelnestId: revelnestId2 });
        break;
      case "CHAT_REACTION":
        handleIncomingReaction(revelnestId2, data, win);
        break;
      case "CHAT_UPDATE":
        handleIncomingUpdate(revelnestId2, contact, data, win, signature);
        break;
      case "CHAT_DELETE":
        handleIncomingDelete(revelnestId2, data, win);
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
        transferManager.handleMessage(revelnestId2, rinfo.address, data);
        break;
      default:
        warn("Unknown packet", { revelnestId: revelnestId2, type: data.type, ip: rinfo.address }, "network");
    }
  } catch (e) {
    error("UDP Packet Error", e, "network");
  }
}
async function handleChatMessage(revelnestId2, contact, data, win, signature, fromAddress, sendResponse) {
  const msgId = data.id || crypto$1.randomUUID();
  if (data.ephemeralPublicKey) {
    updateContactEphemeralPublicKey(revelnestId2, data.ephemeralPublicKey);
  }
  let displayContent = data.content;
  if (data.nonce) {
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
  saveMessage(msgId, revelnestId2, false, displayContent, data.replyTo, signature);
  win == null ? void 0 : win.webContents.send("receive-p2p-message", {
    id: msgId,
    revelnestId: revelnestId2,
    isMine: false,
    message: displayContent,
    replyTo: data.replyTo,
    status: "received",
    encrypted: !!data.nonce
  });
  sendResponse(fromAddress, { type: "ACK", id: msgId });
}
function handleAck(revelnestId2, data, win) {
  if (data.id) {
    updateMessageStatus(data.id, "delivered");
    win == null ? void 0 : win.webContents.send("message-delivered", { id: data.id, revelnestId: revelnestId2 });
  }
}
function handleReadReceipt(revelnestId2, data, win) {
  if (data.id) {
    updateMessageStatus(data.id, "read");
    win == null ? void 0 : win.webContents.send("message-read", { id: data.id, revelnestId: revelnestId2 });
  }
}
async function handleIncomingReaction(revelnestId2, data, win) {
  const { msgId, emoji, remove } = data;
  if (remove) {
    deleteReaction(msgId, revelnestId2, emoji);
  } else {
    saveReaction(msgId, revelnestId2, emoji);
  }
  win == null ? void 0 : win.webContents.send("message-reaction-updated", { msgId, revelnestId: revelnestId2, emoji, remove });
}
async function handleIncomingUpdate(revelnestId2, contact, data, win, signature) {
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
  updateMessageContent(msgId, displayContent, signature);
  win == null ? void 0 : win.webContents.send("message-updated", { id: msgId, revelnestId: revelnestId2, content: displayContent });
}
async function handleIncomingDelete(revelnestId2, data, win) {
  const { msgId } = data;
  deleteMessageLocally(msgId);
  win == null ? void 0 : win.webContents.send("message-deleted", { id: msgId, revelnestId: revelnestId2 });
}
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
    const payload = closestContacts.filter((c) => c.revelnestId !== targetRevelnestId && c.dhtSignature).map((c) => ({
      revelnestId: c.revelnestId,
      publicKey: c.publicKey,
      locationBlock: {
        address: c.address,
        dhtSeq: c.dhtSeq,
        signature: c.dhtSignature,
        expiresAt: c.expiresAt,
        renewalToken: c.renewalToken
      }
    }));
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
    const payload = allContacts.filter((c) => c.status === "connected" && c.dhtSignature && c.revelnestId !== targetRevelnestId).map((c) => ({
      revelnestId: c.revelnestId,
      publicKey: c.publicKey,
      locationBlock: {
        address: c.address,
        dhtSeq: c.dhtSeq,
        signature: c.dhtSignature,
        expiresAt: c.expiresAt,
        renewalToken: c.renewalToken
      },
      dist: distanceXOR(c.revelnestId, targetRevelnestId)
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
async function startDhtSearch(revelnestId2, sendSecureUDPMessage2) {
  network("Starting active DHT search", void 0, { revelnestId: revelnestId2 }, "dht-search");
  const location = await findNodeLocation(revelnestId2);
  if (location) {
    network("Found via DHT lookup", void 0, { revelnestId: revelnestId2, location }, "kademlia");
    return;
  }
  const kademlia2 = getKademliaInstance();
  if (kademlia2) {
    network("Starting iterative search", void 0, { revelnestId: revelnestId2 }, "kademlia");
    iterativeFindNode(revelnestId2, sendSecureUDPMessage2).catch((err) => {
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
    const queryTargets = allContacts.filter((c) => c.status === "connected" && c.revelnestId !== revelnestId2).map((c) => ({
      revelnestId: c.revelnestId,
      address: c.address,
      dist: distanceXOR(c.revelnestId, revelnestId2),
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
        targetId: revelnestId2,
        // Include referral context for better routing
        referralContext: {
          requester: getMyRevelNestId(),
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
  // 2. DNS TXT records (dht-seeds.revelnest.chat)
  // 3. Archivo de configuración local
  // 
  // Formato ejemplo:
  // {
  //     revelnestId: "802d20068fe07d3c3c16a15491210cd2",
  //     address: "200:xxxx:xxxx:xxxx::xxxx",
  //     publicKey: "a1b2c3d4e5f6..."
  // }
];
function toKademliaId(revelnestId2) {
  const hash = crypto$1.createHash("sha256");
  hash.update(revelnestId2, "hex");
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
      (c) => c.revelnestId === contact.revelnestId
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
  remove(revelnestId2) {
    const index = this.contacts.findIndex((c) => c.revelnestId === revelnestId2);
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
  removeContact(revelnestId2) {
    const contact = this.findContact(revelnestId2);
    if (!contact) return false;
    const bucketIndex = getBucketIndex(this.nodeId, contact.nodeId);
    return this.buckets[bucketIndex].remove(revelnestId2);
  }
  // Find a contact by RevelNest ID
  findContact(revelnestId2) {
    const targetId = toKademliaId(revelnestId2);
    const bucketIndex = getBucketIndex(this.nodeId, targetId);
    const bucket = this.buckets[bucketIndex];
    return bucket.all.find((c) => c.revelnestId === revelnestId2) || null;
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
  // Clean up expired values with auto-renewal capability
  cleanupExpiredValues() {
    const now = Date.now();
    let removed = 0;
    let renewed = 0;
    for (const [key, value] of this.store.entries()) {
      if (now - value.timestamp > TTL_MS) {
        if (value.value && value.value.address && value.value.signature) {
          if (value.value.renewalToken) {
            const token = value.value.renewalToken;
            if (token.allowedUntil > now && token.renewalsUsed < token.maxRenewals) {
              const renewedBlock = { ...value.value };
              renewedBlock.expiresAt = now + TTL_MS;
              token.renewalsUsed += 1;
              this.store.set(key, {
                ...value,
                value: renewedBlock,
                timestamp: now
                // Reset timestamp
              });
              renewed++;
              continue;
            }
          }
          this.store.delete(key);
          removed++;
        } else {
          this.store.delete(key);
          removed++;
        }
      }
    }
    if (renewed > 0) {
      console.log(`[Kademlia] Auto-renewed ${renewed} location blocks`);
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
const SEED_DNS_DOMAIN = "dht-seeds.revelnest.chat";
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
      if (!seenIds.has(seed.revelnestId)) {
        seedNodes.push(seed);
        seenIds.add(seed.revelnestId);
      }
    }
    try {
      const dnsSeeds = await this.loadSeedNodesFromDNS();
      for (const seed of dnsSeeds) {
        if (!seenIds.has(seed.revelnestId)) {
          seedNodes.push(seed);
          seenIds.add(seed.revelnestId);
        }
      }
    } catch (error2) {
      console.warn("[Kademlia] Failed to load seed nodes from DNS:", error2);
    }
    try {
      const fileSeeds = await this.loadSeedNodesFromFile();
      for (const seed of fileSeeds) {
        if (!seenIds.has(seed.revelnestId)) {
          seedNodes.push(seed);
          seenIds.add(seed.revelnestId);
        }
      }
    } catch (error2) {
      console.warn("[Kademlia] Failed to load seed nodes from file:", error2);
    }
    try {
      const lanSeeds = await this.loadSeedNodesFromLAN();
      for (const seed of lanSeeds) {
        if (!seenIds.has(seed.revelnestId)) {
          seedNodes.push(seed);
          seenIds.add(seed.revelnestId);
        }
      }
    } catch (error2) {
      console.warn("[Kademlia] Failed to load seed nodes from LAN:", error2);
    }
    console.log(`[Kademlia] Loaded ${seedNodes.length} seed nodes from ${seenIds.size} unique sources`);
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
          if (seed.revelnestId && seed.address && seed.publicKey) {
            seedNodes.push({
              revelnestId: seed.revelnestId,
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
      if (item.revelnestId && item.address && item.publicKey) {
        seedNodes.push({
          revelnestId: item.revelnestId,
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
      if (!contact.revelnestId || !contact.publicKey || contact.status !== "connected") {
        continue;
      }
      const kContact = {
        nodeId: toKademliaId(contact.revelnestId),
        revelnestId: contact.revelnestId,
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
    console.log(`[Kademlia] Bootstrapped with ${bootstrapped} contacts (out of ${contacts2.length})`);
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
    console.log(`[Kademlia] Attempting bootstrap from ${seedNodes.length} seed nodes`);
    for (const seed of seedNodes) {
      const kContact = {
        nodeId: toKademliaId(seed.revelnestId),
        revelnestId: seed.revelnestId,
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
        console.warn(`[Kademlia] Failed to ping seed node ${seed.revelnestId}:`, error2);
      }
    }
    this.updateBootstrapStatus();
    if (this.bootstrapped) {
      console.log(`[Kademlia] Bootstrap successful with ${this.totalContacts} contacts`);
    }
  }
  // Update bootstrap status based on current contact count
  updateBootstrapStatus() {
    const wasBootstrapped = this.bootstrapped;
    this.totalContacts = this.routingTable.getContactCount();
    this.bootstrapped = this.totalContacts >= BOOTSTRAP_MIN_NODES;
    if (wasBootstrapped && !this.bootstrapped) {
      console.warn(`[Kademlia] Lost bootstrap status (${this.totalContacts} contacts)`);
    } else if (!wasBootstrapped && this.bootstrapped) {
      console.log(`[Kademlia] Gained bootstrap status (${this.totalContacts} contacts)`);
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
  constructor(nodeId, revelnestId2, routingTable, valueStore, sendMessage) {
    this.nodeId = nodeId;
    this.revelnestId = revelnestId2;
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
        revelnestId: senderRevelnestId,
        address: senderAddress,
        publicKey: "",
        // Will be updated later
        lastSeen: Date.now()
      };
      this.routingTable.addContact(kContact);
      network("Created new contact from incoming message", void 0, { revelnestId: senderRevelnestId }, "kademlia");
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
        revelnestId: c.revelnestId,
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
      return this.handleFindNode(senderRevelnestId, data);
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
      if (contact.revelnestId === this.revelnestId) continue;
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
        warn("Failed to store value on contact", { contactId: contact.revelnestId, error: error2 }, "kademlia");
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
  constructor(revelnestId2, sendMessage, getContacts2, userDataPath) {
    this.stats = {
      storeOperations: 0,
      findOperations: 0
    };
    this.revelnestId = revelnestId2;
    this.nodeId = toKademliaId(revelnestId2);
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
      this.revelnestId,
      this.routingTable,
      this.valueStore,
      sendMessage
    );
    const bootstrappedCount = this.bootstrapManager.bootstrapFromContacts();
    console.log(`[Kademlia] Node initialized: ${revelnestId2}`);
    console.log(`[Kademlia] Kademlia ID: ${this.nodeId.toString("hex")}`);
    console.log(`[Kademlia] Bootstrap status: ${this.isBootstrapped() ? "READY" : "PENDING"} (${bootstrappedCount} contacts)`);
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
  removeContact(revelnestId2) {
    this.routingTable.removeContact(revelnestId2);
    this.bootstrapManager.updateBootstrapStatus();
  }
  // Find a contact by RevelNest ID
  findContact(revelnestId2) {
    return this.routingTable.findContact(revelnestId2);
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
  async storeLocationBlock(revelnestId2, locationBlock) {
    const key = toKademliaId(revelnestId2);
    await this.storeValue(
      key,
      locationBlock,
      revelnestId2,
      locationBlock.signature
    );
    console.log(`[Kademlia] Stored location block for ${revelnestId2} in DHT`);
  }
  // Find location block in DHT
  async findLocationBlock(revelnestId2) {
    const key = toKademliaId(revelnestId2);
    const result = await this.findValue(key);
    if (result && result.value) {
      if (result.signature) {
        const contact = this.findContact(revelnestId2);
        if (contact) {
          console.log(`[Kademlia] Found location block for ${revelnestId2}`);
          return result.value;
        }
      }
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
        console.log(`[Kademlia] Not bootstrapped (${this.getContactCount()} contacts). Retrying...`);
        await this.bootstrapManager.retryBootstrap();
      }
    }
    const staleBuckets = this.routingTable.refreshStaleBuckets();
    if (staleBuckets.length > 0) {
      console.log(`[Kademlia] Refreshing ${staleBuckets.length} stale buckets`);
    }
    const removed = this.valueStore.cleanupExpiredValues();
    if (removed > 0) {
      console.log(`[Kademlia] Cleaned up ${removed} expired values`);
    }
    console.log(`[Kademlia] Maintenance completed. Stats:`, this.getStats());
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
let udpSocket = null;
let mainWindow$1 = null;
let kademliaDHT = null;
function startUDPServer(win) {
  mainWindow$1 = win;
  const networkAddr = getNetworkAddress();
  if (!networkAddr) return;
  udpSocket = dgram.createSocket({ type: "udp6", reuseAddr: true });
  transferManager.initialize(sendSecureUDPMessage, win);
  const userDataPath = app.getPath("userData");
  kademliaDHT = new KademliaDHT(getMyRevelNestId(), sendSecureUDPMessage, getContacts, userDataPath);
  setKademliaInstance(kademliaDHT);
  setInterval(() => {
    if (kademliaDHT) {
      kademliaDHT.performMaintenance();
    }
    performDhtMaintenance().catch((err) => {
      console.error("DHT maintenance error:", err);
    });
  }, 36e5);
  udpSocket.on("message", async (msg, rinfo) => {
    await handlePacket(
      msg,
      rinfo,
      mainWindow$1,
      sendSecureUDPMessage
    );
  });
  udpSocket.on("error", (err) => {
    error("UDP Error", err, "network");
  });
  try {
    udpSocket.bind(YGG_PORT, networkAddr);
  } catch (e) {
    error("Failed to bind socket", e, "network");
  }
}
function sendSecureUDPMessage(ip, data) {
  if (!udpSocket) return;
  const myId = getMyRevelNestId();
  const fieldsToExclude = ["contactCache", "renewalToken"];
  const dataForSignature = { ...data };
  fieldsToExclude.forEach((field) => {
    if (field in dataForSignature) {
      delete dataForSignature[field];
    }
  });
  const signature = sign(Buffer.from(canonicalStringify(dataForSignature)));
  const fullPacket = {
    ...data,
    senderRevelnestId: myId,
    signature: signature.toString("hex")
  };
  const buf = Buffer.from(JSON.stringify(fullPacket));
  if (data.type === "FILE_CHUNK" || data.type === "FILE_START" || data.type === "FILE_ACK") {
    console.log("DEBUG sendSecureUDPMessage:", {
      type: data.type,
      ip,
      port: YGG_PORT,
      fileId: data.fileId,
      chunkIndex: data.chunkIndex,
      timestamp: Date.now()
    });
  }
  udpSocket.send(buf, YGG_PORT, ip, (err) => {
    if (err) {
      error(`UDP send error to ${ip}`, err, "network");
    }
  });
}
async function sendContactRequest(targetIp, alias) {
  const powProof = AdaptivePow.generateLightProof(getMyRevelNestId());
  const data = {
    type: "HANDSHAKE_REQ",
    publicKey: getMyPublicKeyHex(),
    ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
    alias,
    powProof
  };
  sendSecureUDPMessage(targetIp, data);
}
async function acceptContactRequest(revelnestId2, publicKey2) {
  const contact = await getContactByRevelnestId(revelnestId2);
  if (!contact) return;
  updateContactPublicKey(revelnestId2, publicKey2);
  const data = {
    type: "HANDSHAKE_ACCEPT",
    publicKey: getMyPublicKeyHex(),
    ephemeralPublicKey: getMyEphemeralPublicKeyHex()
  };
  sendSecureUDPMessage(contact.address, data);
}
async function sendUDPMessage(revelnestId2, message, replyTo) {
  const msgId = crypto$1.randomUUID();
  const content = typeof message === "string" ? message : message.content;
  const contact = await getContactByRevelnestId(revelnestId2);
  if (!contact || contact.status !== "connected" || !contact.publicKey) return void 0;
  const useEphemeral = !!contact.ephemeralPublicKey;
  const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
  const { ciphertext, nonce } = encrypt(
    Buffer.from(content, "utf-8"),
    Buffer.from(targetKeyHex, "hex"),
    useEphemeral
  );
  if (useEphemeral) {
    incrementEphemeralMessageCounter();
  }
  const data = {
    type: "CHAT",
    id: msgId,
    content: ciphertext.toString("hex"),
    nonce: nonce.toString("hex"),
    ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
    useRecipientEphemeral: useEphemeral,
    replyTo
  };
  const signature = sign(Buffer.from(canonicalStringify(data)));
  const isToSelf = revelnestId2 === getMyRevelNestId();
  saveMessage(msgId, revelnestId2, true, content, replyTo, signature.toString("hex"), isToSelf ? "read" : "sent");
  sendSecureUDPMessage(contact.address, data);
  setTimeout(async () => {
    const { getMessageStatus: getMessageStatus2 } = await import("./db-Bp0GgYuM.js");
    const status = await getMessageStatus2(msgId);
    if (status === "sent") {
      warn("Message not delivered, starting reactive search", { msgId, revelnestId: revelnestId2 }, "network");
      startDhtSearch(revelnestId2, sendSecureUDPMessage);
    }
  }, 5e3);
  return msgId;
}
function checkHeartbeat(contacts2) {
  for (const contact of contacts2) {
    if (contact.status === "connected") {
      sendSecureUDPMessage(contact.address, { type: "PING" });
      sendDhtExchange(contact.revelnestId, sendSecureUDPMessage);
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
  network("Distributed heartbeat completed", void 0, { contact: contact.revelnestId }, "heartbeat");
}
async function exchangeLocationBlocks(contact, sendSecureUDPMessage2) {
  const currentIp = getNetworkAddress();
  if (!currentIp) return;
  const { incrementMyDhtSeq: incrementMyDhtSeq2 } = await Promise.resolve().then(() => identity);
  const newSeq = incrementMyDhtSeq2();
  const { generateSignedLocationBlock: generateSignedLocationBlock2, generateRenewalToken: generateRenewalToken2 } = await Promise.resolve().then(() => utils);
  const renewalToken = generateRenewalToken2(contact.revelnestId);
  const locBlock = generateSignedLocationBlock2(currentIp, newSeq, void 0, renewalToken);
  sendSecureUDPMessage2(contact.address, {
    type: "DHT_UPDATE",
    locationBlock: locBlock
  });
}
function getContactsSeenLast24h() {
  const allContacts = getContacts();
  const cutoff = Date.now() - 24 * 60 * 60 * 1e3;
  return allContacts.filter((c) => c.lastSeen && c.lastSeen > cutoff && c.address).map((c) => ({
    revelnestId: c.revelnestId,
    lastSeen: c.lastSeen,
    address: c.address
  }));
}
async function sendContactList(contact, aliveContacts, sendSecureUDPMessage2) {
  if (aliveContacts.length === 0) return;
  sendSecureUDPMessage2(contact.address, {
    type: "DHT_EXCHANGE",
    peers: aliveContacts.map((c) => ({
      revelnestId: c.revelnestId,
      address: c.address,
      lastSeen: c.lastSeen
    }))
  });
}
function getLocationBlocksForRenewal() {
  const allContacts = getContacts();
  const now = Date.now();
  const renewalThreshold = 3 * 24 * 60 * 60 * 1e3;
  return allContacts.filter((c) => c.dhtSignature && c.expiresAt).filter((c) => {
    const timeToExpire = c.expiresAt - now;
    return timeToExpire < renewalThreshold && timeToExpire > 0;
  }).map((c) => ({
    revelnestId: c.revelnestId,
    locationBlock: {
      address: c.address,
      dhtSeq: c.dhtSeq,
      signature: c.dhtSignature,
      expiresAt: c.expiresAt
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
  broadcastDhtUpdate(sendSecureUDPMessage);
}
function sendTypingIndicator(revelnestId2) {
  const contact = getContactByRevelnestId(revelnestId2);
  if (contact && contact.status === "connected") sendSecureUDPMessage(contact.address, { type: "TYPING" });
}
function sendReadReceipt(revelnestId2, id) {
  updateMessageStatus(id, "read");
  const contact = getContactByRevelnestId(revelnestId2);
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
    revelnestId: contact.revelnestId,
    contactPublicKey: contact.publicKey
  };
  const signature = sign(Buffer.from(canonicalStringify(data)));
  saveMessage(msgId, targetRevelnestId, true, `CONTACT_CARD|${contact.name}`, void 0, signature.toString("hex"));
  sendSecureUDPMessage(targetContact.address, data);
  return msgId;
}
async function sendChatReaction(revelnestId2, msgId, emoji, remove) {
  const contact = await getContactByRevelnestId(revelnestId2);
  if (!contact || contact.status !== "connected") return;
  if (remove) deleteReaction(msgId, getMyRevelNestId(), emoji);
  else saveReaction(msgId, getMyRevelNestId(), emoji);
  const data = { type: "CHAT_REACTION", msgId, emoji, remove };
  sendSecureUDPMessage(contact.address, data);
}
async function sendChatUpdate(revelnestId2, msgId, newContent) {
  const contact = await getContactByRevelnestId(revelnestId2);
  if (!contact || contact.status !== "connected" || !contact.publicKey) return;
  const useEphemeral = !!contact.ephemeralPublicKey;
  const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
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
    ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
    useRecipientEphemeral: useEphemeral
  };
  const signature = sign(Buffer.from(canonicalStringify(data)));
  updateMessageContent(msgId, newContent, signature.toString("hex"));
  sendSecureUDPMessage(contact.address, data);
}
async function sendChatDelete(revelnestId2, msgId) {
  const contact = await getContactByRevelnestId(revelnestId2);
  if (!contact || contact.status !== "connected") return;
  deleteMessageLocally(msgId);
  const data = { type: "CHAT_DELETE", msgId };
  sendSecureUDPMessage(contact.address, data);
}
async function sendFile(revelnestId2, filePath, thumbnail) {
  const contact = await getContactByRevelnestId(revelnestId2);
  if (!contact || contact.status !== "connected") return void 0;
  try {
    const fileId = await transferManager.startSend(
      revelnestId2,
      contact.address,
      filePath,
      thumbnail
    );
    return fileId;
  } catch (error2) {
    warn("File transfer failed to start", { revelnestId: revelnestId2, filePath, error: error2 }, "file-transfer");
    return void 0;
  }
}
function closeUDPServer() {
  if (udpSocket) udpSocket.close();
}
const server = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  acceptContactRequest,
  broadcastDhtUpdate: wrappedBroadcastDhtUpdate,
  checkHeartbeat,
  closeUDPServer,
  sendChatDelete,
  sendChatReaction,
  sendChatUpdate,
  sendContactCard,
  sendContactRequest,
  sendFile,
  sendReadReceipt,
  sendSecureUDPMessage,
  sendTypingIndicator,
  sendUDPMessage,
  startUDPServer,
  wrappedBroadcastDhtUpdate
}, Symbol.toStringTag, { value: "Module" }));
async function isSystemYggdrasilAvailable() {
  const existingAddress = getNetworkAddress();
  if (existingAddress) {
    console.log(`[Yggdrasil] Instancia global detectada con IPv6: ${existingAddress}`);
    return true;
  }
  if (process.platform === "linux") {
    try {
      const checkService = () => {
        return new Promise((resolve) => {
          exec("systemctl is-active revelnest-yggdrasil.service", (error2, stdout) => {
            if (!error2 && stdout.toString().trim() === "active") {
              console.log("[Yggdrasil] Servicio systemd revelnest-yggdrasil está activo");
              resolve(true);
            } else {
              exec("systemctl list-unit-files | grep revelnest-yggdrasil", (err) => {
                if (!err) {
                  console.log("[Yggdrasil] Servicio systemd instalado pero no activo");
                  resolve(false);
                } else {
                  resolve(false);
                }
              });
            }
          });
        });
      };
      return await checkService();
    } catch (error2) {
      console.log("[Yggdrasil] Error verificando servicio systemd:", error2);
      return false;
    }
  }
  return false;
}
async function activateSystemYggdrasil() {
  if (process.platform !== "linux") {
    return false;
  }
  try {
    return new Promise((resolve) => {
      console.log("[Yggdrasil] Intentando activar servicio systemd...");
      exec("sudo systemctl start revelnest-yggdrasil.service", (error2) => {
        if (error2) {
          console.log("[Yggdrasil] No se pudo activar el servicio systemd:", error2.message);
          resolve(false);
        } else {
          setTimeout(async () => {
            const isActive = await isSystemYggdrasilAvailable();
            if (isActive) {
              console.log("[Yggdrasil] Servicio systemd activado correctamente");
            }
            resolve(isActive);
          }, 2e3);
        }
      });
    });
  } catch (error2) {
    console.log("[Yggdrasil] Error activando servicio systemd:", error2);
    return false;
  }
}
async function manageYggdrasilInstance() {
  console.log("[Yggdrasil] Preparando conexión a la red descentralizada RevelNest...");
  const existingAddress = getNetworkAddress();
  if (existingAddress) {
    console.log(`[Yggdrasil] Red mesh ya activa con IPv6: ${existingAddress}`);
    return;
  }
  if (process.platform === "linux") {
    const systemServiceAvailable = await isSystemYggdrasilAvailable();
    if (systemServiceAvailable) {
      console.log("[Yggdrasil] Usando servicio de sistema para red mesh");
      return;
    }
    const activated = await activateSystemYggdrasil();
    if (activated) {
      console.log("[Yggdrasil] Servicio de sistema activado correctamente");
      return;
    }
    console.log("[Yggdrasil] No hay servicio de sistema disponible. Usando modo aplicación.");
    console.log("[Yggdrasil] Nota: Para mejor experiencia, instale el paquete completo del sistema.");
  }
  console.log("[Yggdrasil] Configurando red mesh en modo aplicación...");
  const userDataPath = app.getPath("userData");
  const confPath = path.join(userDataPath, "yggdrasil.conf");
  const pidPath = path.join(userDataPath, "ygg.pid");
  const platformFolder = `${process.platform}-${process.arch}`;
  const exeName = process.platform === "win32" ? "yggdrasil.exe" : "yggdrasil";
  const resourcesBasePath = app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(app.getAppPath(), "resources", "bin");
  let yggPath = path.join(resourcesBasePath, platformFolder, exeName);
  if (!fs.existsSync(yggPath)) {
    throw new Error(`[Yggdrasil] Archivo de sidecar no encontrado en el paquete: ${yggPath}. Por favor compila/ubica los binarios en resources/bin.`);
  }
  console.log(`[Yggdrasil] Usando ejecutable empaquetado Sidecar: ${yggPath}`);
  if (!fs.existsSync(confPath)) {
    console.log("[Yggdrasil] Generando configuración...");
    const genconf = await new Promise((resolve, reject) => {
      exec(`"${yggPath}" -genconf`, { encoding: "utf8" }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
    let modConf = genconf.replace(
      /(Peers: \[)([\s\S]*?)(\])/,
      `$1
    "tls://ygg.mkg20001.io:443",
    "tcp://ygg.tomasgl.ru:10526"
  $3`
    );
    modConf = modConf.replace(/AdminListen: .*/, "AdminListen: none");
    modConf = modConf.replace(/IfName: .*/, "IfName: ygg0");
    fs.writeFileSync(confPath, modConf);
    console.log("[Yggdrasil] Configuración generada.");
  }
  let configContent = fs.readFileSync(confPath, "utf8");
  let newContent = configContent;
  if (!newContent.includes("AdminListen:")) {
    const ifNameRegex = /IfName: ygg0/;
    const match = ifNameRegex.exec(newContent);
    if (match) {
      const insertPos = match.index + match[0].length;
      newContent = newContent.slice(0, insertPos) + "\n  AdminListen: none" + newContent.slice(insertPos);
    }
  } else {
    newContent = newContent.replace(/AdminListen: .*/, "AdminListen: none");
  }
  newContent = newContent.replace(/IfName: .*/, "IfName: ygg0");
  if (newContent !== configContent) {
    fs.writeFileSync(confPath, newContent);
    console.log("[Yggdrasil] Configuración actualizada.");
  }
  console.log("[Yggdrasil] Preparando conexión a la red descentralizada RevelNest...");
  console.log("[Yggdrasil] Nota: Se requieren permisos de administrador para crear una red privada segura.");
  return new Promise((resolve, reject) => {
    const cleanRootOwnedFiles = () => {
      try {
        const stat = fs.statSync(pidPath);
        if (stat && (stat.uid === 0 || (stat.mode & 128) === 0)) {
          console.log("[Yggdrasil] Eliminando archivo PID de root...");
          fs.unlinkSync(pidPath);
        }
      } catch (e) {
      }
      try {
        const stat = fs.statSync(path.join(userDataPath, "ygg.log"));
        if (stat && (stat.uid === 0 || (stat.mode & 128) === 0)) {
          console.log("[Yggdrasil] Eliminando archivo log de root...");
          fs.unlinkSync(path.join(userDataPath, "ygg.log"));
        }
      } catch (e) {
      }
    };
    const spawnWithoutSudo = () => {
      return new Promise((spawnResolve, spawnReject) => {
        var _a2, _b2, _c2;
        console.log("[Yggdrasil] Intentando conexión con permisos estándar...");
        cleanRootOwnedFiles();
        if (process.platform === "win32") {
          const cmd = `cd "${userDataPath}" && start /B "${yggPath}" -useconffile "${confPath}"`;
          exec(cmd, { cwd: userDataPath }, (error2) => {
            if (error2) {
              spawnReject(error2);
            } else {
              console.log("[Yggdrasil] Lanzado en background (modo estándar).");
              setTimeout(spawnResolve, 3e3);
            }
          });
        } else {
          const child = spawn(yggPath, ["-useconffile", confPath], {
            cwd: userDataPath,
            detached: true,
            stdio: ["ignore", "pipe", "pipe"]
          });
          if (!(child == null ? void 0 : child.pid)) {
            spawnReject(new Error("No se pudo crear el proceso Yggdrasil"));
            return;
          }
          fs.writeFileSync(pidPath, child.pid.toString());
          child.unref();
          let stderrData = "";
          (_a2 = child.stderr) == null ? void 0 : _a2.on("data", (data) => {
            stderrData += data.toString();
            if (stderrData.includes("operation not permitted") || stderrData.includes("failed to create TUN") || stderrData.includes("panic:")) {
              console.error("[Yggdrasil] Error crítico detectado:", stderrData);
              try {
                if (child == null ? void 0 : child.pid) process.kill(child.pid, "SIGKILL");
              } catch (e) {
              }
              spawnReject(new Error("Yggdrasil falló al crear la interfaz de red"));
            }
          });
          const logStream = fs.createWriteStream(path.join(userDataPath, "ygg.log"), { flags: "a" });
          (_b2 = child.stdout) == null ? void 0 : _b2.pipe(logStream);
          (_c2 = child.stderr) == null ? void 0 : _c2.pipe(logStream);
          console.log("[Yggdrasil] Lanzado en background (PID: %d).", child.pid);
          setTimeout(() => {
            try {
              if (child.pid) {
                process.kill(child.pid, 0);
                spawnResolve();
              } else {
                spawnReject(new Error("No se encontró el PID del proceso"));
              }
            } catch (err) {
              spawnReject(new Error("El proceso Yggdrasil terminó prematuramente"));
            }
          }, 2e3);
        }
      });
    };
    const runWithSudo = () => {
      return new Promise((sudoResolve, sudoReject) => {
        console.log("[Yggdrasil] Se requieren permisos de administrador para la red privada.");
        console.log("[Yggdrasil] Se mostrará un diálogo para ingresar su contraseña.");
        const cmd = process.platform === "win32" ? `cd "${userDataPath}" && "${yggPath}" -useconffile "${confPath}"` : `sh -c '"${yggPath}" -useconffile "${confPath}" > "${userDataPath}/ygg.log" 2>&1 & echo $! > "${pidPath}"'`;
        try {
          sudo.exec(cmd, { name: "RevelNest Secure Network" }, (error2, stdout, stderr) => {
            if (error2) {
              console.error("[Yggdrasil] Error con permisos elevados:", error2);
              sudoReject(error2);
            } else {
              console.log("[Yggdrasil] Lanzado con permisos elevados.");
              setTimeout(sudoResolve, 3e3);
            }
          });
        } catch (sudoError) {
          console.error("[Yggdrasil] Error síncrono en sudo.exec:", sudoError);
          sudoReject(sudoError);
        }
      });
    };
    spawnWithoutSudo().then(() => {
      console.log("[Yggdrasil] Red descentralizada lista.");
      resolve();
    }).catch((spawnError) => {
      console.log("[Yggdrasil] Falló el modo estándar:", spawnError.message);
      console.log("[Yggdrasil] Intentando con permisos elevados...");
      runWithSudo().then(() => {
        console.log("[Yggdrasil] Red descentralizada lista (con permisos elevados).");
        resolve();
      }).catch((sudoError) => {
        console.error("[Yggdrasil] No se pudo iniciar Yggdrasil:", sudoError.message);
        reject(new Error(`No se pudo establecer la red descentralizada: ${sudoError.message}`));
      });
    });
  });
}
function stopYggdrasil() {
  const pidPath = path.join(app.getPath("userData"), "ygg.pid");
  if (fs.existsSync(pidPath)) {
    const pid = fs.readFileSync(pidPath, "utf8").trim();
    if (!pid) return;
    console.log(`[Yggdrasil] Deteniendo proceso ${pid}...`);
    const killCmd = process.platform === "win32" ? `taskkill /PID ${pid} /F` : `kill -9 ${pid} 2>/dev/null || sudo kill -9 ${pid}`;
    exec(killCmd, (error2) => {
      if (error2) {
        console.error("[Yggdrasil] Error al detener:", error2.message);
        try {
          process.kill(parseInt(pid), 9);
        } catch (e) {
        }
      } else {
        console.log("[Yggdrasil] Proceso detenido con éxito.");
      }
      try {
        fs.unlinkSync(pidPath);
      } catch (e) {
      }
    });
  }
}
const LAN_DISCOVERY_PORT = 50006;
const LAN_MULTICAST_GROUP = "ff02::1";
const LAN_BROADCAST_INTERVAL = 3e4;
const LAN_DISCOVERY_TIMEOUT = 6e4;
class LanDiscovery {
  constructor() {
    this.socket = null;
    this.discoveryInterval = null;
    this.discoveredPeers = /* @__PURE__ */ new Map();
    this.isRunning = false;
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
    const messageData = {
      type: "LAN_DISCOVERY_ANNOUNCE",
      revelnestId: getMyRevelNestId(),
      publicKey: getMyPublicKeyHex(),
      ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
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
      const message = JSON.parse(msg.toString());
      if (!this.validateLanMessage(message, rinfo)) {
        return;
      }
      if (message.revelnestId === getMyRevelNestId()) {
        return;
      }
      this.discoveredPeers.set(message.revelnestId, {
        address: message.address,
        timestamp: Date.now()
      });
      this.addDiscoveredPeer(message);
      if (message.type === "LAN_DISCOVERY_ANNOUNCE") {
        this.sendResponse(message.revelnestId, message.address);
      }
    } catch (error2) {
      warn("Failed to parse LAN message", error2, "lan");
    }
  }
  // Validate LAN message
  validateLanMessage(message, rinfo) {
    if (!message.revelnestId || !message.publicKey || !message.address || !message.timestamp || !message.signature) {
      return false;
    }
    if (Date.now() - message.timestamp > 5 * 60 * 1e3) {
      return false;
    }
    try {
      const { signature, ...messageData } = message;
      const messageBuffer = Buffer.from(canonicalStringify(messageData));
      const signatureBuffer = Buffer.from(signature, "hex");
      const publicKeyBuffer = Buffer.from(message.publicKey, "hex");
      const isValid = verify(messageBuffer, signatureBuffer, publicKeyBuffer);
      if (!isValid) {
        warn("Invalid LAN message signature", { revelnestId: message.revelnestId }, "lan");
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
      revelnestId: getMyRevelNestId(),
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
      await addOrUpdateContact(
        message.revelnestId,
        message.address,
        `LAN Peer ${message.revelnestId.slice(0, 4)}`,
        message.publicKey,
        "connected",
        message.ephemeralPublicKey
      );
      info("LAN peer discovered", {
        revelnestId: message.revelnestId,
        address: message.address
      }, "lan");
    } catch (error2) {
      warn("Failed to add LAN peer to contacts", error2, "lan");
    }
  }
  // Cleanup old peers
  cleanupOldPeers() {
    const now = Date.now();
    for (const [revelnestId2, data] of this.discoveredPeers.entries()) {
      if (now - data.timestamp > LAN_DISCOVERY_TIMEOUT) {
        this.discoveredPeers.delete(revelnestId2);
      }
    }
  }
  // Get discovered peers
  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers.entries()).map(([revelnestId2, data]) => ({
      revelnestId: revelnestId2,
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
    mainWindow.loadURL("http://localhost:5173");
  }
};
app.on("ready", async () => {
  try {
    await manageYggdrasilInstance();
  } catch (err) {
    console.error("[Yggdrasil] Error inicializando sidecar:", err);
  }
  const userDataPath = app.getPath("userData");
  initIdentity(userDataPath);
  await initDB(userDataPath);
  createWindow();
  if (mainWindow) startUDPServer(mainWindow);
  try {
    await startLanDiscovery();
  } catch (err) {
    console.error("[LAN] Error starting LAN discovery:", err);
  }
  setInterval(() => {
    wrappedBroadcastDhtUpdate();
    const contacts2 = getContacts();
    checkHeartbeat(contacts2.map((c) => ({ address: c.address, status: c.status })));
  }, 3e4);
});
ipcMain.handle("get-ygg-ip", () => getNetworkAddress() || "No detectado");
ipcMain.handle("get-messages", (event, revelnestId2) => getMessages(revelnestId2));
ipcMain.handle("get-contacts", () => getContacts());
ipcMain.handle("add-contact", async (event, { address, name }) => {
  const separator = "@";
  if (!address.includes(separator)) {
    return { success: false, error: "Formato RevelNestID@IP requerido. Usa ID@200:xxxx:xxxx:..." };
  }
  let [targetRevelnestId, targetIp] = address.split(separator);
  targetIp = targetIp.trim();
  const segments = targetIp.split(":");
  const has200Prefix = targetIp.startsWith("200:");
  const isValidYggdrasil = has200Prefix && segments.length === 8;
  if (!isValidYggdrasil) {
    return { success: false, error: "Dirección Yggdrasil inválida. Debe tener 8 segmentos comenzando con 200: (ej: 200:7704:49e5:b4cd:7910:2191:2574:351b)" };
  }
  const oldGhost = await getContactByAddress(targetIp);
  if (oldGhost && oldGhost.revelnestId.startsWith("pending-")) {
    await deleteContact(oldGhost.revelnestId);
  }
  addOrUpdateContact(targetRevelnestId, targetIp, name, void 0, "pending");
  await sendContactRequest(targetIp, name);
  return { success: true, revelnestId: targetRevelnestId };
});
ipcMain.handle("accept-contact-request", async (event, { revelnestId: revelnestId2, publicKey: publicKey2 }) => {
  await acceptContactRequest(revelnestId2, publicKey2);
  return { success: true };
});
ipcMain.handle("delete-contact", (event, { revelnestId: revelnestId2 }) => deleteContact(revelnestId2));
ipcMain.handle("send-p2p-message", async (event, { revelnestId: revelnestId2, message, replyTo }) => await sendUDPMessage(revelnestId2, message, replyTo));
ipcMain.handle("send-typing-indicator", (event, { revelnestId: revelnestId2 }) => sendTypingIndicator(revelnestId2));
ipcMain.handle("send-read-receipt", (event, { revelnestId: revelnestId2, id }) => sendReadReceipt(revelnestId2, id));
ipcMain.handle("send-contact-card", (event, { targetRevelnestId, contact }) => sendContactCard(targetRevelnestId, contact));
ipcMain.handle("send-chat-reaction", (event, { revelnestId: revelnestId2, msgId, emoji, remove }) => sendChatReaction(revelnestId2, msgId, emoji, remove));
ipcMain.handle("send-chat-update", (event, { revelnestId: revelnestId2, msgId, newContent }) => sendChatUpdate(revelnestId2, msgId, newContent));
ipcMain.handle("send-chat-delete", (event, { revelnestId: revelnestId2, msgId }) => sendChatDelete(revelnestId2, msgId));
ipcMain.on("contact-untrustworthy", (event, data) => {
  const mainWindow2 = BrowserWindow.getAllWindows()[0];
  if (mainWindow2) {
    mainWindow2.webContents.send("contact-untrustworthy", data);
  }
});
ipcMain.handle("get-my-identity", () => ({
  address: getNetworkAddress(),
  revelnestId: getMyRevelNestId(),
  publicKey: getMyPublicKeyHex()
}));
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
        console.error(`Error getting file info for ${filePath}:`, err);
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
  } catch (error2) {
    console.error("Error opening file dialog:", error2);
    return { success: false, error: error2 instanceof Error ? error2.message : "Unknown error" };
  }
});
ipcMain.handle("read-file-as-base64", async (event, { filePath, maxSizeMB = 5 }) => {
  try {
    const stats = await fs$1.stat(filePath);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (stats.size > maxSizeBytes) {
      return { success: false, error: `File too large for preview. Max size: ${maxSizeMB}MB` };
    }
    const buffer = await fs$1.readFile(filePath);
    const base64 = buffer.toString("base64");
    const ext = path.extname(filePath).toLowerCase();
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
  } catch (error2) {
    console.error("Error reading file as base64:", error2);
    return { success: false, error: error2 instanceof Error ? error2.message : "Unknown error" };
  }
});
ipcMain.handle("start-file-transfer", async (event, { revelnestId: revelnestId2, filePath, thumbnail }) => {
  try {
    const contact = await getContactByRevelnestId(revelnestId2);
    if (!contact || contact.status !== "connected") {
      return { success: false, error: "Contact not connected" };
    }
    const fileId = await transferManager.startSend(revelnestId2, contact.address, filePath, thumbnail);
    return { success: true, fileId };
  } catch (error2) {
    console.error("Error starting file transfer:", error2);
    return { success: false, error: error2 instanceof Error ? error2.message : "Unknown error" };
  }
});
ipcMain.handle("cancel-file-transfer", (event, { fileId, reason }) => {
  try {
    transferManager.cancelTransfer(fileId, reason);
    return { success: true };
  } catch (error2) {
    console.error("Error canceling file transfer:", error2);
    return { success: false, error: error2 instanceof Error ? error2.message : "Unknown error" };
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
  } catch (error2) {
    console.error("Error getting file transfers:", error2);
    return { success: false, error: error2 instanceof Error ? error2.message : "Unknown error" };
  }
});
ipcMain.handle("save-transferred-file", async (event, { fileId, destinationPath }) => {
  try {
    const transfer = transferManager.getTransfer(fileId, "receiving");
    if (!transfer || !transfer.tempPath) {
      return { success: false, error: "Transfer not found or no temporary file" };
    }
    const fs2 = await import("node:fs/promises");
    await fs2.copyFile(transfer.tempPath, destinationPath);
    return { success: true };
  } catch (error2) {
    console.error("Error saving transferred file:", error2);
    return { success: false, error: error2 instanceof Error ? error2.message : "Unknown error" };
  }
});
app.on("window-all-closed", () => {
  closeDB();
  closeUDPServer();
  stopYggdrasil();
  stopLanDiscovery();
  if (process.platform !== "darwin") app.quit();
});
export {
  addOrUpdateContact as a,
  and as b,
  closeDB as c,
  deleteContact as d,
  deleteMessageLocally as e,
  deleteReaction as f,
  getMessageStatus as g,
  desc as h,
  eq as i,
  getContactByAddress as j,
  getContactByRevelnestId as k,
  getContacts as l,
  getMessages as m,
  initDB as n,
  or as o,
  saveMessage as p,
  saveReaction as q,
  updateContactEphemeralPublicKey as r,
  saveFileMessage as s,
  updateContactLocation as t,
  updateContactDhtLocation as u,
  updateContactPublicKey as v,
  updateLastSeen as w,
  updateMessageContent as x,
  updateMessageStatus as y
};
