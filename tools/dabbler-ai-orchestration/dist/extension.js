"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports2) {
    "use strict";
    var ALIAS = Symbol.for("yaml.alias");
    var DOC = Symbol.for("yaml.document");
    var MAP = Symbol.for("yaml.map");
    var PAIR = Symbol.for("yaml.pair");
    var SCALAR = Symbol.for("yaml.scalar");
    var SEQ = Symbol.for("yaml.seq");
    var NODE_TYPE = Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports2.ALIAS = ALIAS;
    exports2.DOC = DOC;
    exports2.MAP = MAP;
    exports2.NODE_TYPE = NODE_TYPE;
    exports2.PAIR = PAIR;
    exports2.SCALAR = SCALAR;
    exports2.SEQ = SEQ;
    exports2.hasAnchor = hasAnchor;
    exports2.isAlias = isAlias;
    exports2.isCollection = isCollection;
    exports2.isDocument = isDocument;
    exports2.isMap = isMap;
    exports2.isNode = isNode;
    exports2.isPair = isPair;
    exports2.isScalar = isScalar;
    exports2.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path37) {
      const ctrl = callVisitor(key, node, visitor, path37);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path37, ctrl);
        return visit_(key, ctrl, visitor, path37);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path37 = Object.freeze(path37.concat(node));
          for (let i2 = 0; i2 < node.items.length; ++i2) {
            const ci = visit_(i2, node.items[i2], visitor, path37);
            if (typeof ci === "number")
              i2 = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i2, 1);
              i2 -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path37 = Object.freeze(path37.concat(node));
          const ck = visit_("key", node.key, visitor, path37);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path37);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path37) {
      const ctrl = await callVisitor(key, node, visitor, path37);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path37, ctrl);
        return visitAsync_(key, ctrl, visitor, path37);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path37 = Object.freeze(path37.concat(node));
          for (let i2 = 0; i2 < node.items.length; ++i2) {
            const ci = await visitAsync_(i2, node.items[i2], visitor, path37);
            if (typeof ci === "number")
              i2 = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i2, 1);
              i2 -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path37 = Object.freeze(path37.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path37);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path37);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path37) {
      if (typeof visitor === "function")
        return visitor(key, node, path37);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path37);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path37);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path37);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path37);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path37);
      return void 0;
    }
    function replaceNode(key, path37, node) {
      const parent = path37[path37.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports2.visit = visit;
    exports2.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy2 = new _Directives(this.yaml, this.tags);
        copy2.docStart = this.docStart;
        return copy2;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError2) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError2(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError2(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError2(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError2(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError2) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError2(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError2(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError2("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError2(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError2(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError2(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports2.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i2 = 1; true; ++i2) {
        const name = `${prefix}${i2}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports2.anchorIsValid = anchorIsValid;
    exports2.anchorNames = anchorNames;
    exports2.createNodeAnchors = createNodeAnchors;
    exports2.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports2) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i2 = 0, len = val.length; i2 < len; ++i2) {
            const v0 = val[i2];
            const v1 = applyReviver(reviver, val, String(i2), v0);
            if (v1 === void 0)
              delete val[i2];
            else if (v1 !== v0)
              val[i2] = v1;
          }
        } else if (val instanceof Map) {
          for (const k2 of Array.from(val.keys())) {
            const v0 = val.get(k2);
            const v1 = applyReviver(reviver, val, k2, v0);
            if (v1 === void 0)
              val.delete(k2);
            else if (v1 !== v0)
              val.set(k2, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k2, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k2, v0);
            if (v1 === void 0)
              delete val[k2];
            else if (v1 !== v0)
              val[k2] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports2.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports2) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i2) => toJS(v, String(i2), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports2.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports2) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy2 = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy2.range = this.range.slice();
        return copy2;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports2.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports2) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c3 = getAliasCount(doc, item, anchors2);
          if (c3 > count)
            count = c3;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports2.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports2.Scalar = Scalar;
    exports2.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports2) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t2) => t2.tag === tagName);
        const tagObj = match.find((t2) => !t2.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t2) => t2.identify?.(value) && !t2.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports2.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports2) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path37, value) {
      let v = value;
      for (let i2 = path37.length - 1; i2 >= 0; --i2) {
        const k2 = path37[i2];
        if (typeof k2 === "number" && Number.isInteger(k2) && k2 >= 0) {
          const a = [];
          a[k2] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k2, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path37) => path37 == null || typeof path37 === "object" && !!path37[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy2 = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy2.schema = schema;
        copy2.items = copy2.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy2.range = this.range.slice();
        return copy2;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path37, value) {
        if (isEmptyPath(path37))
          this.add(value);
        else {
          const [key, ...rest] = path37;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path37) {
        const [key, ...rest] = path37;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path37, keepScalar) {
        const [key, ...rest] = path37;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path37) {
        const [key, ...rest] = path37;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path37, value) {
        const [key, ...rest] = path37;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports2.Collection = Collection;
    exports2.collectionFromPath = collectionFromPath;
    exports2.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports2) {
    "use strict";
    var stringifyComment = (str2) => str2.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str2, indent, comment) => str2.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str2.endsWith(" ") ? "" : " ") + comment;
    exports2.indentComment = indentComment;
    exports2.lineComment = lineComment;
    exports2.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports2) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i2 = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i2 = consumeMoreIndentedLines(text, i2, indent.length);
        if (i2 !== -1)
          end = i2 + endStep;
      }
      for (let ch; ch = text[i2 += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i2;
          switch (text[i2 + 1]) {
            case "x":
              i2 += 3;
              break;
            case "u":
              i2 += 5;
              break;
            case "U":
              i2 += 9;
              break;
            default:
              i2 += 1;
          }
          escEnd = i2;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i2 = consumeMoreIndentedLines(text, i2, indent.length);
          end = i2 + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i2 + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i2;
          }
          if (i2 >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i2 += 1];
                overflow = true;
              }
              const j2 = i2 > escEnd + 1 ? i2 - 2 : escStart - 1;
              if (escapedFolds[j2])
                return text;
              folds.push(j2);
              escapedFolds[j2] = true;
              end = j2 + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i3 = 0; i3 < folds.length; ++i3) {
        const fold = folds[i3];
        const end2 = folds[i3 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i2, indent) {
      let end = i2;
      let start = i2 + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i2 < start + indent) {
          ch = text[++i2];
        } else {
          do {
            ch = text[++i2];
          } while (ch && ch !== "\n");
          end = i2;
          start = i2 + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports2.FOLD_BLOCK = FOLD_BLOCK;
    exports2.FOLD_FLOW = FOLD_FLOW;
    exports2.FOLD_QUOTED = FOLD_QUOTED;
    exports2.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str2) => /^(%|---|\.\.\.)/m.test(str2);
    function lineLengthOverLimit(str2, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str2.length;
      if (strLen <= limit)
        return false;
      for (let i2 = 0, start = 0; i2 < strLen; ++i2) {
        if (str2[i2] === "\n") {
          if (i2 - start > limit)
            return true;
          start = i2 + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str2 = "";
      let start = 0;
      for (let i2 = 0, ch = json[i2]; ch; ch = json[++i2]) {
        if (ch === " " && json[i2 + 1] === "\\" && json[i2 + 2] === "n") {
          str2 += json.slice(start, i2) + "\\ ";
          i2 += 1;
          start = i2;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i2 + 1]) {
            case "u":
              {
                str2 += json.slice(start, i2);
                const code = json.substr(i2 + 2, 4);
                switch (code) {
                  case "0000":
                    str2 += "\\0";
                    break;
                  case "0007":
                    str2 += "\\a";
                    break;
                  case "000b":
                    str2 += "\\v";
                    break;
                  case "001b":
                    str2 += "\\e";
                    break;
                  case "0085":
                    str2 += "\\N";
                    break;
                  case "00a0":
                    str2 += "\\_";
                    break;
                  case "2028":
                    str2 += "\\L";
                    break;
                  case "2029":
                    str2 += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str2 += "\\x" + code.substr(2);
                    else
                      str2 += json.substr(i2, 6);
                }
                i2 += 5;
                start = i2 + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i2 + 2] === '"' || json.length < minMultiLineLength) {
                i2 += 1;
              } else {
                str2 += json.slice(start, i2) + "\n\n";
                while (json[i2 + 2] === "\\" && json[i2 + 3] === "n" && json[i2 + 4] !== '"') {
                  str2 += "\n";
                  i2 += 2;
                }
                str2 += indent;
                if (json[i2 + 2] === " ")
                  str2 += "\\";
                i2 += 1;
                start = i2 + 1;
              }
              break;
            default:
              i2 += 1;
          }
      }
      str2 = start ? str2 + json.slice(start) : json;
      return implicitKey ? str2 : foldFlowLines.foldFlowLines(str2, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str2 = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str2);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str2 : foldFlowLines.foldFlowLines(str2, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t2 = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t2);
        if (res === null)
          throw new Error(`Unsupported default string type ${t2}`);
      }
      return res;
    }
    exports2.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports2) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t2) => t2.tag === item.tag);
        if (match.length > 0)
          return match.find((t2) => t2.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t2) => t2.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t2) => t2.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t2) => t2.format === item.format) ?? match.find((t2) => !t2.format);
      } else {
        obj = item;
        tagObj = tags.find((t2) => t2.nodeClass && obj instanceof t2.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o2) => tagObj = o2 });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str2 = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str2;
      return identity.isScalar(node) || str2[0] === "{" || str2[0] === "[" ? `${props} ${str2}` : `${props}
${ctx.indent}${str2}`;
    }
    exports2.createStringifyContext = createStringifyContext;
    exports2.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str2 = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str2.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str2 === "" ? "?" : explicitKey ? `? ${str2}` : str2;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str2 = `? ${str2}`;
        if (keyComment && !keyCommentDone) {
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str2;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
        str2 = `? ${str2}
${indent}:`;
      } else {
        str2 = `${str2}:`;
        if (keyComment)
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str2.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str2 += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str2;
    }
    exports2.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports2) {
    "use strict";
    var node_process = require("process");
    function debug2(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports2.debug = debug2;
    exports2.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports2.addMergeToJSMap = addMergeToJSMap;
    exports2.isMergeKey = isMergeKey;
    exports2.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports2) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports2.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports2) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k2 = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k2, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_2, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports2.Pair = Pair;
    exports2.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i2 = 0; i2 < items.length; ++i2) {
        const item = items[i2];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str3 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str3 += stringifyComment.lineComment(str3, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str3);
      }
      let str2;
      if (lines.length === 0) {
        str2 = flowChars.start + flowChars.end;
      } else {
        str2 = lines[0];
        for (let i2 = 1; i2 < lines.length; ++i2) {
          const line = lines[i2];
          str2 += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str2 += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str2;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i2 = 0; i2 < items.length; ++i2) {
        const item = items[i2];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str2 = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str2.includes("\n"));
        if (i2 < items.length - 1) {
          str2 += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str2.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str2 += ",";
          }
        }
        if (comment)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment));
        lines.push(str2);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str2 = start;
          for (const line of lines)
            str2 += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str2}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports2.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports2) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k2 = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k2)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k2)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i2 = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i2 === -1)
            this.items.push(_pair);
          else
            this.items.splice(i2, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_2, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports2.YAMLMap = YAMLMap;
    exports2.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError2) {
        if (!identity.isMap(map2))
          onError2("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports2.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports2) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_2, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i2 = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i2++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i2 = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i2++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports2.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError2) {
        if (!identity.isSeq(seq2))
          onError2("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports2.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports2) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str2) => str2,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports2.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports2.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str2) => new Scalar.Scalar(str2[0] === "t" || str2[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports2.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports2) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i2 = n.indexOf(".");
        if (i2 < 0) {
          i2 = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i2 - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports2.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str2) => str2.slice(-3).toLowerCase() === "nan" ? NaN : str2[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str2) => parseFloat(str2),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str2) {
        const node = new Scalar.Scalar(parseFloat(str2));
        const dot = str2.indexOf(".");
        if (dot !== -1 && str2[str2.length - 1] === "0")
          node.minFractionDigits = str2.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports2.float = float;
    exports2.floatExp = floatExp;
    exports2.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str2, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str2) : parseInt(str2.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports2.int = int;
    exports2.intHex = intHex;
    exports2.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports2) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool2 = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool2.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports2.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str2) => str2,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str2) => str2 === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str2, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str2) : parseInt(str2, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str2) => parseFloat(str2),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str2, onError2) {
        onError2(`Unresolved plain scalar ${JSON.stringify(str2)}`);
        return str2;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports2.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports2) {
    "use strict";
    var node_buffer = require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError2) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str2 = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str2.length);
          for (let i2 = 0; i2 < str2.length; ++i2)
            buffer[i2] = str2.charCodeAt(i2);
          return buffer;
        } else {
          onError2("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str2;
        if (typeof node_buffer.Buffer === "function") {
          str2 = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i2 = 0; i2 < buf.length; ++i2)
            s += String.fromCharCode(buf[i2]);
          str2 = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str2.length / lineWidth);
          const lines = new Array(n);
          for (let i2 = 0, o2 = 0; i2 < n; ++i2, o2 += lineWidth) {
            lines[i2] = str2.substr(o2, lineWidth);
          }
          str2 = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str2 }, ctx, onComment, onChompKeep);
      }
    };
    exports2.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError2) {
      if (identity.isSeq(seq)) {
        for (let i2 = 0; i2 < seq.items.length; ++i2) {
          let item = seq.items[i2];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError2("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i2] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError2("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i2 = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i2++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports2.createPairs = createPairs;
    exports2.pairs = pairs;
    exports2.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_2, ctx) {
        if (!ctx)
          return super.toJSON(_2);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError2) {
        const pairs$1 = pairs.resolvePairs(seq, onError2);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError2(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports2.YAMLOMap = YAMLOMap;
    exports2.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports2.falseTag = falseTag;
    exports2.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str2) => str2.slice(-3).toLowerCase() === "nan" ? NaN : str2[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str2) => parseFloat(str2.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str2) {
        const node = new Scalar.Scalar(parseFloat(str2.replace(/_/g, "")));
        const dot = str2.indexOf(".");
        if (dot !== -1) {
          const f = str2.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports2.float = float;
    exports2.floatExp = floatExp;
    exports2.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str2, offset, radix, { intAsBigInt }) {
      const sign = str2[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str2 = str2.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str2 = `0b${str2}`;
            break;
          case 8:
            str2 = `0o${str2}`;
            break;
          case 16:
            str2 = `0x${str2}`;
            break;
        }
        const n2 = BigInt(str2);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str2, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str2 = value.toString(radix);
        return value < 0 ? "-" + prefix + str2.substr(1) : prefix + str2;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports2.int = int;
    exports2.intBin = intBin;
    exports2.intHex = intHex;
    exports2.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_2, ctx) {
        return super.toJSON(_2, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError2) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError2("Set items must all have null values");
        } else
          onError2("Expected a mapping for this tag");
        return map;
      }
    };
    exports2.YAMLSet = YAMLSet;
    exports2.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str2, asBigInt) {
      const sign = str2[0];
      const parts = sign === "-" || sign === "+" ? str2.substring(1) : str2;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p2) => res2 * num(60) + num(p2), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str2, _onError, { intAsBigInt }) => parseSexagesimal(str2, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str2) => parseSexagesimal(str2, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str2) {
        const match = str2.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports2.floatTime = floatTime;
    exports2.intTime = intTime;
    exports2.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports2) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool2 = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool2.trueTag,
      bool2.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports2.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports2) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool2 = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool2.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports2.coreKnownTags = coreKnownTags;
    exports2.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b2) => a.key < b2.key ? -1 : a.key > b2.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy2 = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy2.tags = this.tags.slice();
        return copy2;
      }
    };
    exports2.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports2.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports2) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document2 = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy2 = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy2.commentBefore = this.commentBefore;
        copy2.comment = this.comment;
        copy2.errors = this.errors.slice();
        copy2.warnings = this.warnings.slice();
        copy2.options = Object.assign({}, this.options);
        if (this.directives)
          copy2.directives = this.directives.clone();
        copy2.schema = this.schema.clone();
        copy2.contents = identity.isNode(this.contents) ? this.contents.clone(copy2.schema) : this.contents;
        if (this.range)
          copy2.range = this.range.slice();
        return copy2;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path37, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path37, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k2 = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k2, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path37) {
        if (Collection.isEmptyPath(path37)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path37) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path37, keepScalar) {
        if (Collection.isEmptyPath(path37))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path37, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path37) {
        if (Collection.isEmptyPath(path37))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path37) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path37, value) {
        if (Collection.isEmptyPath(path37)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path37), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path37, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports2.Document = Document2;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports2) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports2.YAMLError = YAMLError;
    exports2.YAMLParseError = YAMLParseError;
    exports2.YAMLWarning = YAMLWarning;
    exports2.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports2) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError: onError2, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError2(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError2(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError2(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError2(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError2(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError2(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError2(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError2(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError2(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          default:
            onError2(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last2 = tokens[tokens.length - 1];
      const end = last2 ? last2.offset + last2.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError2(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError2(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports2.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports2) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports2.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports2) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError2) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError2(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports2.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports2) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b2) => a === b2 || identity.isScalar(a) && identity.isScalar(b2) && a.value === b2.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports2.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports2) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError2, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep3, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep3?.[0],
          offset,
          onError: onError2,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError2(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError2(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep3) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError2(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError2(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError2) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError2);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError2);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError2(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep3 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError: onError2,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError2(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError2(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError2) : composeEmptyNode(ctx, offset, sep3, null, valueProps, onError2);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError2);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError2(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError2(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports2.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports2) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError2, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError: onError2,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError2(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError2(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError2) : composeEmptyNode(ctx, props.end, start, null, props, onError2);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError2);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports2.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports2) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError2) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep3 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError2(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep3 + cb;
              sep3 = "";
              break;
            }
            case "newline":
              if (comment)
                sep3 += source;
              hasSpace = true;
              break;
            default:
              onError2(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports2.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError2, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i2 = 0; i2 < fc.items.length; ++i2) {
        const collItem = fc.items[i2];
        const { start, key, sep: sep3, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep3?.[0],
          offset,
          onError: onError2,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep3 && !value) {
            if (i2 === 0 && props.comma)
              onError2(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i2 < fc.items.length - 1)
              onError2(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError2(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i2 === 0) {
          if (props.comma)
            onError2(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError2(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop:
              for (const st of start) {
                switch (st.type) {
                  case "comma":
                  case "space":
                    break;
                  case "comment":
                    prevItemComment = st.source.substring(1);
                    break loop;
                  default:
                    break loop;
                }
              }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep3 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError2) : composeEmptyNode(ctx, props.end, sep3, null, props, onError2);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError2(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError2) : composeEmptyNode(ctx, keyStart, start, null, props, onError2);
          if (isBlock(key))
            onError2(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep3 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError: onError2,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep3)
                for (const st of sep3) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError2(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError2(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError2(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError2(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError2) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep3, null, valueProps, onError2) : null;
          if (valueNode) {
            if (isBlock(value))
              onError2(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError2(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee2] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError2(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee2.unshift(ce);
      }
      if (ee2.length > 0) {
        const end = resolveEnd.resolveEnd(ee2, cePos, ctx.options.strict, onError2);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports2.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError2, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError2, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError2, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError2, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError2) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError2(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError2(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError2, tagName);
      }
      let tag = ctx.schema.tags.find((t2) => t2.tag === tagName && t2.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError2(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError2(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError2, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError2, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError2(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports2.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError2) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError2);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i2 = lines.length - 1; i2 >= 0; --i2) {
        const content = lines[i2][1];
        if (content === "" || content === "\r")
          chompStart = i2;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i2 = 0; i2 < chompStart; ++i2) {
        const [indent, content] = lines[i2];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError2(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i2;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError2(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i2 = lines.length - 1; i2 >= chompStart; --i2) {
        if (lines[i2][0].length > trimIndent)
          chompStart = i2 + 1;
      }
      let value = "";
      let sep3 = "";
      let prevMoreIndented = false;
      for (let i2 = 0; i2 < contentStart; ++i2)
        value += lines[i2][0].slice(trimIndent) + "\n";
      for (let i2 = contentStart; i2 < chompStart; ++i2) {
        let [indent, content] = lines[i2];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError2(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep3 + indent.slice(trimIndent) + content;
          sep3 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep3 === " ")
            sep3 = "\n";
          else if (!prevMoreIndented && sep3 === "\n")
            sep3 = "\n\n";
          value += sep3 + indent.slice(trimIndent) + content;
          sep3 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep3 === "\n")
            value += "\n";
          else
            sep3 = "\n";
        } else {
          value += sep3 + content;
          sep3 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i2 = chompStart; i2 < lines.length; ++i2)
            value += "\n" + lines[i2][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError2) {
      if (props[0].type !== "block-scalar-header") {
        onError2(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i2 = 1; i2 < source.length; ++i2) {
        const ch = source[i2];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i2;
        }
      }
      if (error !== -1)
        onError2(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i2 = 1; i2 < props.length; ++i2) {
        const token = props[i2];
        switch (token.type) {
          case "space":
            hasSpace = true;
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError2(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError2(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError2(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first2 = split[0];
      const m = first2.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first2.slice(m[1].length)] : ["", first2];
      const lines = [line0];
      for (let i2 = 1; i2 < split.length; i2 += 2)
        lines.push([split[i2], split[i2 + 1]]);
      return lines;
    }
    exports2.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports2) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError2) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError2(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        default:
          onError2(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError2);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError2) {
      let badChar = "";
      switch (source[0]) {
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError2(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError2) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError2(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first2, line;
      try {
        first2 = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first2 = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first2.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep3 = " ";
      let pos = first2.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep3 === "\n")
            res += sep3;
          else
            sep3 = "\n";
        } else {
          res += sep3 + match[1];
          sep3 = " ";
        }
        pos = line.lastIndex;
      }
      const last2 = /[ \t]*(.*)/sy;
      last2.lastIndex = pos;
      match = last2.exec(source);
      return res + sep3 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError2) {
      let res = "";
      for (let i2 = 1; i2 < source.length - 1; ++i2) {
        const ch = source[i2];
        if (ch === "\r" && source[i2 + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i2);
          res += fold;
          i2 = offset;
        } else if (ch === "\\") {
          let next = source[++i2];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i2 + 1];
            while (next === " " || next === "	")
              next = source[++i2 + 1];
          } else if (next === "\r" && source[i2 + 1] === "\n") {
            next = source[++i2 + 1];
            while (next === " " || next === "	")
              next = source[++i2 + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i2 + 1, length, onError2);
            i2 += length;
          } else {
            const raw = source.substr(i2 - 1, 2);
            onError2(i2 - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i2;
          let next = source[i2 + 1];
          while (next === " " || next === "	")
            next = source[++i2 + 1];
          if (next !== "\n" && !(next === "\r" && source[i2 + 2] === "\n"))
            res += i2 > wsStart ? source.slice(wsStart, i2 + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError2(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError2) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError2(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports2.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports2) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError2) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError2) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError2);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError2(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError2);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError2);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError2(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError2(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError2) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError2(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError2) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError2(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports2.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports2) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i2 = pos - 1; i2 >= 0; --i2) {
          let st = before[i2];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i2];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i2];
          }
          break;
        }
      }
      return offset;
    }
    exports2.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports2) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError2) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError2);
          if (anchor || tag)
            onError2(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError2);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError2);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError2(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError2(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError2));
      if (anchor && node.anchor === "")
        onError2(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError2(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError2) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError2);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError2(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError2) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError2(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError2(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError2);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports2.composeEmptyNode = composeEmptyNode;
    exports2.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports2) {
    "use strict";
    var Document2 = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError2) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document2.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError: onError2,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError2(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError2) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError2);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError2);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports2.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports2) {
    "use strict";
    var node_process = require("process");
    var directives = require_directives();
    var Document2 = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i2 = 0; i2 < prelude.length; ++i2) {
        const source = prelude[i2];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i2 + 1]?.[0] !== "#")
              i2 += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i2 = 0; i2 < this.errors.length; ++i2)
            doc.errors.push(this.errors[i2]);
          for (let i2 = 0; i2 < this.warnings.length; ++i2)
            doc.warnings.push(this.warnings[i2]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document2.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports2.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports2) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError2) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError2)
            onError2(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports2.createScalarToken = createScalarToken;
    exports2.resolveAsScalar = resolveAsScalar;
    exports2.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports2) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep3, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep3)
        for (const st of sep3)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports2.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports2) {
    "use strict";
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path37) => {
      let item = cst;
      for (const [field, index] of path37) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path37) => {
      const parent = visit.itemAtPath(cst, path37.slice(0, -1));
      const field = path37[path37.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path37, item, visitor) {
      let ctrl = visitor(item, path37);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i2 = 0; i2 < token.items.length; ++i2) {
            const ci = _visit(Object.freeze(path37.concat([[field, i2]])), token.items[i2], visitor);
            if (typeof ci === "number")
              i2 = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i2, 1);
              i2 -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path37);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path37) : ctrl;
    }
    exports2.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports2) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports2.createScalarToken = cstScalar.createScalarToken;
    exports2.resolveAsScalar = cstScalar.resolveAsScalar;
    exports2.setScalarValue = cstScalar.setScalarValue;
    exports2.stringify = cstStringify.stringify;
    exports2.visit = cstVisit.visit;
    exports2.BOM = BOM;
    exports2.DOCUMENT = DOCUMENT;
    exports2.FLOW_END = FLOW_END;
    exports2.SCALAR = SCALAR;
    exports2.isCollection = isCollection;
    exports2.isScalar = isScalar;
    exports2.prettyToken = prettyToken;
    exports2.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports2) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i2 = this.pos;
        let ch = this.buffer[i2];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i2];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i2 + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i2 = this.pos;
        while (true) {
          const ch = this.buffer[++i2];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop:
          for (let i3 = this.pos; ch = this.buffer[i3]; ++i3) {
            switch (ch) {
              case " ":
                indent += 1;
                break;
              case "\n":
                nl = i3;
                indent = 0;
                break;
              case "\r": {
                const next = this.buffer[i3 + 1];
                if (!next && !this.atEnd)
                  return this.setNext("block-scalar");
                if (next === "\n")
                  break;
              }
              default:
                break loop;
            }
          }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i2 = nl + 1;
        ch = this.buffer[i2];
        while (ch === " ")
          ch = this.buffer[++i2];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i2];
          nl = i2 - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i3 = nl - 1;
            let ch2 = this.buffer[i3];
            if (ch2 === "\r")
              ch2 = this.buffer[--i3];
            const lastChar = i3;
            while (ch2 === " ")
              ch2 = this.buffer[--i3];
            if (ch2 === "\n" && i3 >= this.pos && i3 + 1 + indent > lastChar)
              nl = i3;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i2 = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i2]) {
          if (ch === ":") {
            const next = this.buffer[i2 + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i2;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i2 + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i2 += 1;
                ch = "\n";
                next = this.buffer[i2 + 1];
              } else
                end = i2;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i2 + 1);
              if (cs === -1)
                break;
              i2 = Math.max(i2, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i2;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i2, allowEmpty) {
        const s = this.buffer.slice(this.pos, i2);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop:
          while (true) {
            switch (this.charAt(0)) {
              case "!":
                n += yield* this.pushTag();
                n += yield* this.pushSpaces(true);
                continue loop;
              case "&":
                n += yield* this.pushUntil(isNotAnchorChar);
                n += yield* this.pushSpaces(true);
                continue loop;
              case "-":
              case "?":
              case ":": {
                const inFlow = this.flowLevel > 0;
                const ch1 = this.charAt(1);
                if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                  if (!inFlow)
                    this.indentNext = this.indentValue + 1;
                  else if (this.flowKey)
                    this.flowKey = false;
                  n += yield* this.pushCount(1);
                  n += yield* this.pushSpaces(true);
                  continue loop;
                }
              }
            }
            break loop;
          }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i2 = this.pos + 2;
          let ch = this.buffer[i2];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i2];
          return yield* this.pushToIndex(ch === ">" ? i2 + 1 : i2, false);
        } else {
          let i2 = this.pos + 1;
          let ch = this.buffer[i2];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i2];
            else if (ch === "%" && hexDigits.has(this.buffer[i2 + 1]) && hexDigits.has(this.buffer[i2 + 2])) {
              ch = this.buffer[i2 += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i2, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i2 = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i2];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i2 - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i2;
        }
        return n;
      }
      *pushUntil(test) {
        let i2 = this.pos;
        let ch = this.buffer[i2];
        while (!test(ch))
          ch = this.buffer[++i2];
        return yield* this.pushToIndex(i2, false);
      }
    };
    exports2.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports2) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports2.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports2) {
    "use strict";
    var node_process = require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list2, type) {
      for (let i2 = 0; i2 < list2.length; ++i2)
        if (list2[i2].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list2) {
      for (let i2 = 0; i2 < list2.length; ++i2) {
        switch (list2[i2].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i2;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i2 = prev.length;
      loop:
        while (--i2 >= 0) {
          switch (prev[i2].type) {
            case "doc-start":
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
            case "newline":
              break loop;
          }
        }
      while (prev[++i2]?.type === "space") {
      }
      return prev.splice(i2, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i2 = 0; i2 < source.length; ++i2)
          target.push(source[i2]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last2 = token.items[token.items.length - 1];
            if (last2 && !last2.sep && !last2.value && last2.start.length > 0 && findNonEmptyIndex(last2.start) === -1 && (token.indent === 0 || last2.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last2.start;
              else
                top.items.push({ start: last2.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep3;
          if (scalar.end) {
            sep3 = scalar.end;
            sep3.push(this.sourceToken);
            delete scalar.end;
          } else
            sep3 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep3 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last2 = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last2?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i2 = 0; i2 < it.sep.length; ++i2) {
              const st = it.sep[i2];
              switch (st.type) {
                case "newline":
                  nl.push(i2);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep3 = it.sep;
                  sep3.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep3 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs30 = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs30, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs30);
              } else {
                Object.assign(it, { key: fs30, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last2 = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last2?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs30 = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs30, sep: [] });
              else if (it.sep)
                this.stack.push(fs30);
              else
                Object.assign(it, { key: fs30, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep3 = fc.end.splice(1, fc.end.length);
            sep3.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep3 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports2.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports2) {
    "use strict";
    var composer = require_composer();
    var Document2 = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser4 = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser4.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser4.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse2(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document2.Document(value, _replacer, options).toString(options);
    }
    exports2.parse = parse2;
    exports2.parseAllDocuments = parseAllDocuments;
    exports2.parseDocument = parseDocument;
    exports2.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports2) {
    "use strict";
    var composer = require_composer();
    var Document2 = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser4 = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports2.Composer = composer.Composer;
    exports2.Document = Document2.Document;
    exports2.Schema = Schema.Schema;
    exports2.YAMLError = errors.YAMLError;
    exports2.YAMLParseError = errors.YAMLParseError;
    exports2.YAMLWarning = errors.YAMLWarning;
    exports2.Alias = Alias.Alias;
    exports2.isAlias = identity.isAlias;
    exports2.isCollection = identity.isCollection;
    exports2.isDocument = identity.isDocument;
    exports2.isMap = identity.isMap;
    exports2.isNode = identity.isNode;
    exports2.isPair = identity.isPair;
    exports2.isScalar = identity.isScalar;
    exports2.isSeq = identity.isSeq;
    exports2.Pair = Pair.Pair;
    exports2.Scalar = Scalar.Scalar;
    exports2.YAMLMap = YAMLMap.YAMLMap;
    exports2.YAMLSeq = YAMLSeq.YAMLSeq;
    exports2.CST = cst;
    exports2.Lexer = lexer.Lexer;
    exports2.LineCounter = lineCounter.LineCounter;
    exports2.Parser = parser4.Parser;
    exports2.parse = publicApi.parse;
    exports2.parseAllDocuments = publicApi.parseAllDocuments;
    exports2.parseDocument = publicApi.parseDocument;
    exports2.stringify = publicApi.stringify;
    exports2.visit = visit.visit;
    exports2.visitAsync = visit.visitAsync;
  }
});

// node_modules/ms/index.js
var require_ms = __commonJS({
  "node_modules/ms/index.js"(exports2, module2) {
    var s = 1e3;
    var m = s * 60;
    var h2 = m * 60;
    var d = h2 * 24;
    var w = d * 7;
    var y2 = d * 365.25;
    module2.exports = function(val, options) {
      options = options || {};
      var type = typeof val;
      if (type === "string" && val.length > 0) {
        return parse2(val);
      } else if (type === "number" && isFinite(val)) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse2(str2) {
      str2 = String(str2);
      if (str2.length > 100) {
        return;
      }
      var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str2
      );
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type = (match[2] || "ms").toLowerCase();
      switch (type) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y2;
        case "weeks":
        case "week":
        case "w":
          return n * w;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h2;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    function fmtShort(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return Math.round(ms / d) + "d";
      }
      if (msAbs >= h2) {
        return Math.round(ms / h2) + "h";
      }
      if (msAbs >= m) {
        return Math.round(ms / m) + "m";
      }
      if (msAbs >= s) {
        return Math.round(ms / s) + "s";
      }
      return ms + "ms";
    }
    function fmtLong(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return plural(ms, msAbs, d, "day");
      }
      if (msAbs >= h2) {
        return plural(ms, msAbs, h2, "hour");
      }
      if (msAbs >= m) {
        return plural(ms, msAbs, m, "minute");
      }
      if (msAbs >= s) {
        return plural(ms, msAbs, s, "second");
      }
      return ms + " ms";
    }
    function plural(ms, msAbs, n, name) {
      var isPlural = msAbs >= n * 1.5;
      return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
    }
  }
});

// node_modules/debug/src/common.js
var require_common = __commonJS({
  "node_modules/debug/src/common.js"(exports2, module2) {
    function setup(env8) {
      createDebug.debug = createDebug;
      createDebug.default = createDebug;
      createDebug.coerce = coerce;
      createDebug.disable = disable;
      createDebug.enable = enable;
      createDebug.enabled = enabled;
      createDebug.humanize = require_ms();
      createDebug.destroy = destroy;
      Object.keys(env8).forEach((key) => {
        createDebug[key] = env8[key];
      });
      createDebug.names = [];
      createDebug.skips = [];
      createDebug.formatters = {};
      function selectColor(namespace) {
        let hash = 0;
        for (let i2 = 0; i2 < namespace.length; i2++) {
          hash = (hash << 5) - hash + namespace.charCodeAt(i2);
          hash |= 0;
        }
        return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
      }
      createDebug.selectColor = selectColor;
      function createDebug(namespace) {
        let prevTime;
        let enableOverride = null;
        let namespacesCache;
        let enabledCache;
        function debug2(...args) {
          if (!debug2.enabled) {
            return;
          }
          const self = debug2;
          const curr = Number(/* @__PURE__ */ new Date());
          const ms = curr - (prevTime || curr);
          self.diff = ms;
          self.prev = prevTime;
          self.curr = curr;
          prevTime = curr;
          args[0] = createDebug.coerce(args[0]);
          if (typeof args[0] !== "string") {
            args.unshift("%O");
          }
          let index = 0;
          args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
            if (match === "%%") {
              return "%";
            }
            index++;
            const formatter = createDebug.formatters[format];
            if (typeof formatter === "function") {
              const val = args[index];
              match = formatter.call(self, val);
              args.splice(index, 1);
              index--;
            }
            return match;
          });
          createDebug.formatArgs.call(self, args);
          const logFn = self.log || createDebug.log;
          logFn.apply(self, args);
        }
        debug2.namespace = namespace;
        debug2.useColors = createDebug.useColors();
        debug2.color = createDebug.selectColor(namespace);
        debug2.extend = extend;
        debug2.destroy = createDebug.destroy;
        Object.defineProperty(debug2, "enabled", {
          enumerable: true,
          configurable: false,
          get: () => {
            if (enableOverride !== null) {
              return enableOverride;
            }
            if (namespacesCache !== createDebug.namespaces) {
              namespacesCache = createDebug.namespaces;
              enabledCache = createDebug.enabled(namespace);
            }
            return enabledCache;
          },
          set: (v) => {
            enableOverride = v;
          }
        });
        if (typeof createDebug.init === "function") {
          createDebug.init(debug2);
        }
        return debug2;
      }
      function extend(namespace, delimiter) {
        const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
        newDebug.log = this.log;
        return newDebug;
      }
      function enable(namespaces) {
        createDebug.save(namespaces);
        createDebug.namespaces = namespaces;
        createDebug.names = [];
        createDebug.skips = [];
        const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
        for (const ns of split) {
          if (ns[0] === "-") {
            createDebug.skips.push(ns.slice(1));
          } else {
            createDebug.names.push(ns);
          }
        }
      }
      function matchesTemplate(search, template) {
        let searchIndex = 0;
        let templateIndex = 0;
        let starIndex = -1;
        let matchIndex = 0;
        while (searchIndex < search.length) {
          if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
            if (template[templateIndex] === "*") {
              starIndex = templateIndex;
              matchIndex = searchIndex;
              templateIndex++;
            } else {
              searchIndex++;
              templateIndex++;
            }
          } else if (starIndex !== -1) {
            templateIndex = starIndex + 1;
            matchIndex++;
            searchIndex = matchIndex;
          } else {
            return false;
          }
        }
        while (templateIndex < template.length && template[templateIndex] === "*") {
          templateIndex++;
        }
        return templateIndex === template.length;
      }
      function disable() {
        const namespaces = [
          ...createDebug.names,
          ...createDebug.skips.map((namespace) => "-" + namespace)
        ].join(",");
        createDebug.enable("");
        return namespaces;
      }
      function enabled(name) {
        for (const skip of createDebug.skips) {
          if (matchesTemplate(name, skip)) {
            return false;
          }
        }
        for (const ns of createDebug.names) {
          if (matchesTemplate(name, ns)) {
            return true;
          }
        }
        return false;
      }
      function coerce(val) {
        if (val instanceof Error) {
          return val.stack || val.message;
        }
        return val;
      }
      function destroy() {
        console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
      }
      createDebug.enable(createDebug.load());
      return createDebug;
    }
    module2.exports = setup;
  }
});

// node_modules/debug/src/browser.js
var require_browser = __commonJS({
  "node_modules/debug/src/browser.js"(exports2, module2) {
    exports2.formatArgs = formatArgs;
    exports2.save = save;
    exports2.load = load;
    exports2.useColors = useColors;
    exports2.storage = localstorage();
    exports2.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports2.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module2.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c3 = "color: " + this.color;
      args.splice(1, 0, c3, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c3);
    }
    exports2.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports2.storage.setItem("debug", namespaces);
        } else {
          exports2.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load() {
      let r2;
      try {
        r2 = exports2.storage.getItem("debug") || exports2.storage.getItem("DEBUG");
      } catch (error) {
      }
      if (!r2 && typeof process !== "undefined" && "env" in process) {
        r2 = process.env.DEBUG;
      }
      return r2;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module2.exports = require_common()(exports2);
    var { formatters } = module2.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  }
});

// node_modules/has-flag/index.js
var require_has_flag = __commonJS({
  "node_modules/has-flag/index.js"(exports2, module2) {
    "use strict";
    module2.exports = (flag, argv = process.argv) => {
      const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
      const position = argv.indexOf(prefix + flag);
      const terminatorPosition = argv.indexOf("--");
      return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
    };
  }
});

// node_modules/supports-color/index.js
var require_supports_color = __commonJS({
  "node_modules/supports-color/index.js"(exports2, module2) {
    "use strict";
    var os4 = require("os");
    var tty = require("tty");
    var hasFlag = require_has_flag();
    var { env: env8 } = process;
    var forceColor;
    if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
      forceColor = 0;
    } else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
      forceColor = 1;
    }
    if ("FORCE_COLOR" in env8) {
      if (env8.FORCE_COLOR === "true") {
        forceColor = 1;
      } else if (env8.FORCE_COLOR === "false") {
        forceColor = 0;
      } else {
        forceColor = env8.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env8.FORCE_COLOR, 10), 3);
      }
    }
    function translateLevel(level) {
      if (level === 0) {
        return false;
      }
      return {
        level,
        hasBasic: true,
        has256: level >= 2,
        has16m: level >= 3
      };
    }
    function supportsColor(haveStream, streamIsTTY) {
      if (forceColor === 0) {
        return 0;
      }
      if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
        return 3;
      }
      if (hasFlag("color=256")) {
        return 2;
      }
      if (haveStream && !streamIsTTY && forceColor === void 0) {
        return 0;
      }
      const min = forceColor || 0;
      if (env8.TERM === "dumb") {
        return min;
      }
      if (process.platform === "win32") {
        const osRelease = os4.release().split(".");
        if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
          return Number(osRelease[2]) >= 14931 ? 3 : 2;
        }
        return 1;
      }
      if ("CI" in env8) {
        if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((sign) => sign in env8) || env8.CI_NAME === "codeship") {
          return 1;
        }
        return min;
      }
      if ("TEAMCITY_VERSION" in env8) {
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env8.TEAMCITY_VERSION) ? 1 : 0;
      }
      if (env8.COLORTERM === "truecolor") {
        return 3;
      }
      if ("TERM_PROGRAM" in env8) {
        const version = parseInt((env8.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (env8.TERM_PROGRAM) {
          case "iTerm.app":
            return version >= 3 ? 3 : 2;
          case "Apple_Terminal":
            return 2;
        }
      }
      if (/-256(color)?$/i.test(env8.TERM)) {
        return 2;
      }
      if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env8.TERM)) {
        return 1;
      }
      if ("COLORTERM" in env8) {
        return 1;
      }
      return min;
    }
    function getSupportLevel(stream) {
      const level = supportsColor(stream, stream && stream.isTTY);
      return translateLevel(level);
    }
    module2.exports = {
      supportsColor: getSupportLevel,
      stdout: translateLevel(supportsColor(true, tty.isatty(1))),
      stderr: translateLevel(supportsColor(true, tty.isatty(2)))
    };
  }
});

// node_modules/debug/src/node.js
var require_node = __commonJS({
  "node_modules/debug/src/node.js"(exports2, module2) {
    var tty = require("tty");
    var util = require("util");
    exports2.init = init;
    exports2.log = log;
    exports2.formatArgs = formatArgs;
    exports2.save = save;
    exports2.load = load;
    exports2.useColors = useColors;
    exports2.destroy = util.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports2.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = require_supports_color();
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports2.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports2.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_2, k2) => {
        return k2.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports2.inspectOpts ? Boolean(exports2.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name, useColors: useColors2 } = this;
      if (useColors2) {
        const c3 = this.color;
        const colorCode = "\x1B[3" + (c3 < 8 ? c3 : "8;5;" + c3);
        const prefix = `  ${colorCode};1m${name} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module2.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name + " " + args[0];
      }
    }
    function getDate() {
      if (exports2.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args) {
      return process.stderr.write(util.formatWithOptions(exports2.inspectOpts, ...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init(debug2) {
      debug2.inspectOpts = {};
      const keys = Object.keys(exports2.inspectOpts);
      for (let i2 = 0; i2 < keys.length; i2++) {
        debug2.inspectOpts[keys[i2]] = exports2.inspectOpts[keys[i2]];
      }
    }
    module2.exports = require_common()(exports2);
    var { formatters } = module2.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts).split("\n").map((str2) => str2.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts);
    };
  }
});

// node_modules/debug/src/index.js
var require_src = __commonJS({
  "node_modules/debug/src/index.js"(exports2, module2) {
    if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
      module2.exports = require_browser();
    } else {
      module2.exports = require_node();
    }
  }
});

// node_modules/@kwsites/file-exists/dist/src/index.js
var require_src2 = __commonJS({
  "node_modules/@kwsites/file-exists/dist/src/index.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fs_1 = require("fs");
    var debug_1 = __importDefault(require_src());
    var log = debug_1.default("@kwsites/file-exists");
    function check(path37, isFile, isDirectory) {
      log(`checking %s`, path37);
      try {
        const stat = fs_1.statSync(path37);
        if (stat.isFile() && isFile) {
          log(`[OK] path represents a file`);
          return true;
        }
        if (stat.isDirectory() && isDirectory) {
          log(`[OK] path represents a directory`);
          return true;
        }
        log(`[FAIL] path represents something other than a file or directory`);
        return false;
      } catch (e) {
        if (e.code === "ENOENT") {
          log(`[FAIL] path is not accessible: %o`, e);
          return false;
        }
        log(`[FATAL] %o`, e);
        throw e;
      }
    }
    function exists2(path37, type = exports2.READABLE) {
      return check(path37, (type & exports2.FILE) > 0, (type & exports2.FOLDER) > 0);
    }
    exports2.exists = exists2;
    exports2.FILE = 1;
    exports2.FOLDER = 2;
    exports2.READABLE = exports2.FILE + exports2.FOLDER;
  }
});

// node_modules/@kwsites/file-exists/dist/index.js
var require_dist2 = __commonJS({
  "node_modules/@kwsites/file-exists/dist/index.js"(exports2) {
    "use strict";
    function __export3(m) {
      for (var p2 in m)
        if (!exports2.hasOwnProperty(p2))
          exports2[p2] = m[p2];
    }
    Object.defineProperty(exports2, "__esModule", { value: true });
    __export3(require_src2());
  }
});

// node_modules/@kwsites/promise-deferred/dist/index.js
var require_dist3 = __commonJS({
  "node_modules/@kwsites/promise-deferred/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createDeferred = exports2.deferred = void 0;
    function deferred2() {
      let done;
      let fail;
      let status = "pending";
      const promise = new Promise((_done, _fail) => {
        done = _done;
        fail = _fail;
      });
      return {
        promise,
        done(result) {
          if (status === "pending") {
            status = "resolved";
            done(result);
          }
        },
        fail(error) {
          if (status === "pending") {
            status = "rejected";
            fail(error);
          }
        },
        get fulfilled() {
          return status !== "pending";
        },
        get status() {
          return status;
        }
      };
    }
    exports2.deferred = deferred2;
    exports2.createDeferred = deferred2;
    exports2.default = deferred2;
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode36 = __toESM(require("vscode"));
var fs29 = __toESM(require("fs"));
var path36 = __toESM(require("path"));

// src/commands/migrateSet.ts
var vscode = __toESM(require("vscode"));

// src/utils/migrateSessionState.ts
var fs2 = __toESM(require("fs"));
var path = __toESM(require("path"));

// src/utils/progress.ts
var fs = __toESM(require("fs"));
var SCHEMA_VERSION_V3 = 3;
var SCHEMA_VERSION_V4 = 4;
var SESSION_STATUS_NOT_STARTED = "not-started";
var SESSION_STATUS_IN_PROGRESS = "in-progress";
var SESSION_STATUS_COMPLETE = "complete";
var SESSION_STATUSES = [
  SESSION_STATUS_NOT_STARTED,
  SESSION_STATUS_IN_PROGRESS,
  SESSION_STATUS_COMPLETE
];
var TOP_LEVEL_STATUSES = [
  "not-started",
  "in-progress",
  "complete",
  "cancelled"
];
var LIFECYCLE_STATE_WORK_IN_PROGRESS = "work_in_progress";
var LIFECYCLE_STATE_CLOSED = "closed";
var STATUS_ALIASES = {
  completed: SESSION_STATUS_COMPLETE,
  done: SESSION_STATUS_COMPLETE
};
function canonicalizeStatus(value) {
  if (value === null || value === void 0) {
    return null;
  }
  return STATUS_ALIASES[value] ?? value;
}
var SessionStateInvariantError = class extends Error {
  constructor(rule, message) {
    super(`[v3 invariant rule ${rule}] ${message}`);
    this.rule = rule;
    this.name = "SessionStateInvariantError";
  }
};
var SESSION_HEADING_RE = /^###\s+Session\s+(\d+)(?:\s+of\s+\d+)?\s*:\s*(.+?)\s*$/gm;
function extractSessionTitlesFromText(text) {
  const out = [];
  let m;
  SESSION_HEADING_RE.lastIndex = 0;
  while ((m = SESSION_HEADING_RE.exec(text)) !== null) {
    out.push({ number: parseInt(m[1], 10), title: m[2].trim() });
  }
  out.sort((a, b2) => a.number - b2.number);
  return out;
}
function extractSessionTitlesFromSpec(specMdPath) {
  let text;
  try {
    text = fs.readFileSync(specMdPath, "utf-8");
  } catch {
    return [];
  }
  return extractSessionTitlesFromText(text);
}
var GENERIC_TITLE_RE = /^Session\s+(\d+)$/;
function isGenericTitle(title, num) {
  if (typeof title !== "string")
    return true;
  const stripped = title.trim();
  if (stripped.length === 0)
    return true;
  const m = GENERIC_TITLE_RE.exec(stripped);
  return m !== null && parseInt(m[1], 10) === num;
}
function healTitle(storedTitle, num, specTitles) {
  if (!isGenericTitle(storedTitle, num))
    return storedTitle;
  const specTitle = specTitles?.get(num);
  if (typeof specTitle === "string" && specTitle.trim().length > 0) {
    return specTitle.trim();
  }
  if (typeof storedTitle === "string" && storedTitle.trim().length > 0) {
    return storedTitle;
  }
  return null;
}
function healGenericTitles(sessions, specTitles) {
  let healed = 0;
  for (const entry of sessions) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      continue;
    const num = entry.number;
    if (!isStrictPositiveInt(num))
      continue;
    const current = entry.title;
    const resolved = healTitle(current, num, specTitles);
    if (resolved !== null && resolved !== current) {
      entry.title = resolved;
      healed += 1;
    }
  }
  return healed;
}
function needsTitleHeal(sessions) {
  for (const entry of sessions) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      continue;
    const num = entry.number;
    if (!isStrictPositiveInt(num))
      continue;
    if (isGenericTitle(entry.title, num))
      return true;
  }
  return false;
}
function specTitleMapFromText(text) {
  const out = /* @__PURE__ */ new Map();
  for (const t2 of extractSessionTitlesFromText(text))
    out.set(t2.number, t2.title);
  return out;
}
function specTitleMap(specMdPath) {
  const out = /* @__PURE__ */ new Map();
  for (const t2 of extractSessionTitlesFromSpec(specMdPath)) {
    out.set(t2.number, t2.title);
  }
  return out;
}
function isStrictPositiveInt(v) {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && typeof v !== "boolean";
}
function synthesizeV3FromV2(state, specMdPath) {
  if (state === null || state === void 0) {
    throw new TypeError("synthesizeV3FromV2: state is null");
  }
  const legacyCurrent = isStrictPositiveInt(state.currentSession) ? state.currentSession : null;
  const legacyTotal = isStrictPositiveInt(state.totalSessions) ? state.totalSessions : 0;
  const legacyCompleted = Array.isArray(state.completedSessions) ? state.completedSessions.filter((n) => isStrictPositiveInt(n)) : [];
  const topStatusRaw = state.status ?? null;
  const topStatus = canonicalizeStatus(topStatusRaw);
  const titles = extractSessionTitlesFromSpec(specMdPath);
  const titlesByNumber = /* @__PURE__ */ new Map();
  for (const t2 of titles) {
    titlesByNumber.set(t2.number, t2.title);
  }
  let total = legacyTotal;
  for (const n of titlesByNumber.keys()) {
    if (n > total)
      total = n;
  }
  for (const n of legacyCompleted) {
    if (n > total)
      total = n;
  }
  const completedSet = new Set(legacyCompleted);
  const sessions = [];
  for (let n = 1; n <= total; n++) {
    const title = titlesByNumber.get(n) ?? `Session ${n}`;
    let status;
    if (completedSet.has(n)) {
      status = SESSION_STATUS_COMPLETE;
    } else if (legacyCurrent === n && topStatus === "in-progress" && !completedSet.has(n)) {
      status = SESSION_STATUS_IN_PROGRESS;
    } else {
      status = SESSION_STATUS_NOT_STARTED;
    }
    sessions.push({ number: n, title, status });
  }
  const out = { ...state };
  out.schemaVersion = SCHEMA_VERSION_V3;
  out.sessions = sessions;
  if (topStatus !== null && topStatus !== topStatusRaw) {
    out.status = topStatus;
  }
  return out;
}
var V4_PER_SESSION_KEYS = [
  "startedAt",
  "completedAt",
  "orchestrator",
  "verificationVerdict"
];
function normalizeToV4Shape(state, specMdPath, specTitles) {
  if (state === null || state === void 0) {
    throw new TypeError("normalizeToV4Shape: state is null");
  }
  let v3State;
  if (state.sessions === void 0 || state.sessions === null) {
    v3State = synthesizeV3FromV2(state, specMdPath);
  } else {
    v3State = { ...state };
  }
  const rawSessions = v3State.sessions ?? [];
  if (!Array.isArray(rawSessions)) {
    throw new SessionStateInvariantError(
      1,
      `sessions[] must be an array, got ${typeof rawSessions}`
    );
  }
  const sessionsV4 = [];
  for (const entry of rawSessions) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      sessionsV4.push({ number: null, title: null, status: null });
      continue;
    }
    const sv4 = { ...entry };
    sv4.status = canonicalizeStatus(sv4.status);
    for (const k2 of V4_PER_SESSION_KEYS) {
      if (sv4[k2] === void 0)
        sv4[k2] = null;
    }
    sessionsV4.push(sv4);
  }
  if (needsTitleHeal(sessionsV4)) {
    const titles = specTitles ?? specTitleMap(specMdPath);
    if (titles.size > 0)
      healGenericTitles(sessionsV4, titles);
  }
  const schemaVersionIn = state.schemaVersion;
  const isV4Input = typeof schemaVersionIn === "number" && schemaVersionIn >= SCHEMA_VERSION_V4;
  if (!isV4Input) {
    const topOrchestrator = state.orchestrator ?? null;
    const topStarted = state.startedAt ?? null;
    const topCompleted = state.completedAt ?? null;
    const topVerdict = state.verificationVerdict ?? null;
    const inProgress = sessionsV4.filter((s) => s.status === SESSION_STATUS_IN_PROGRESS);
    const completed = sessionsV4.filter((s) => s.status === SESSION_STATUS_COMPLETE);
    if (inProgress.length > 0) {
      const tgt = inProgress[0];
      if (tgt.orchestrator === null && topOrchestrator !== null) {
        tgt.orchestrator = topOrchestrator;
      }
      if (tgt.startedAt === null && topStarted !== null) {
        tgt.startedAt = topStarted;
      }
    }
    if (completed.length > 0) {
      const lastCompleted = completed[completed.length - 1];
      if (lastCompleted.completedAt === null && topCompleted !== null) {
        lastCompleted.completedAt = topCompleted;
      }
      if (lastCompleted.verificationVerdict === null && topVerdict !== null) {
        lastCompleted.verificationVerdict = topVerdict;
      }
      if (inProgress.length === 0) {
        if (lastCompleted.orchestrator === null && topOrchestrator !== null) {
          lastCompleted.orchestrator = topOrchestrator;
        }
        if (lastCompleted.startedAt === null && topStarted !== null) {
          lastCompleted.startedAt = topStarted;
        }
      }
    }
  }
  const completedNumbers = sessionsV4.filter((s) => s.status === SESSION_STATUS_COMPLETE && Number.isInteger(s.number)).map((s) => s.number);
  const inProgressList = sessionsV4.filter(
    (s) => s.status === SESSION_STATUS_IN_PROGRESS
  );
  const currentSession = inProgressList.length > 0 && Number.isInteger(inProgressList[0].number) ? inProgressList[0].number : null;
  let derivedOrchestrator = null;
  let derivedStarted = null;
  let derivedCompleted = null;
  let derivedVerdict = null;
  if (inProgressList.length > 0) {
    derivedOrchestrator = inProgressList[0].orchestrator ?? null;
    derivedStarted = inProgressList[0].startedAt ?? null;
  }
  const completedV4 = sessionsV4.filter((s) => s.status === SESSION_STATUS_COMPLETE);
  if (completedV4.length > 0) {
    const lastCompleted = completedV4[completedV4.length - 1];
    derivedCompleted = lastCompleted.completedAt ?? null;
    derivedVerdict = lastCompleted.verificationVerdict ?? null;
    if (derivedOrchestrator === null) {
      derivedOrchestrator = lastCompleted.orchestrator ?? null;
    }
    if (derivedStarted === null) {
      for (let i2 = completedV4.length - 1; i2 >= 0; i2--) {
        const s = completedV4[i2];
        if (s.startedAt) {
          derivedStarted = s.startedAt;
          break;
        }
      }
    }
  }
  const canonicalTopStatus = canonicalizeStatus(state.status ?? null);
  const out = {
    schemaVersion: SCHEMA_VERSION_V4,
    sessionSetName: state.sessionSetName ?? null,
    sessions: sessionsV4,
    status: canonicalTopStatus,
    currentSession,
    totalSessions: sessionsV4.length,
    completedSessions: completedNumbers,
    orchestrator: derivedOrchestrator,
    startedAt: derivedStarted,
    completedAt: derivedCompleted,
    verificationVerdict: derivedVerdict,
    lifecycleState: state.lifecycleState ?? null
  };
  for (const passthroughKey of ["preCancelStatus", "forceClosed"]) {
    if (passthroughKey in state) {
      out[passthroughKey] = state[passthroughKey];
    }
  }
  return out;
}
function readProgress(state, specMdPath, specTitles) {
  if (state === null || state === void 0) {
    throw new TypeError("readProgress: state is null");
  }
  const normalized = normalizeToV4Shape(state, specMdPath, specTitles);
  return getProgress(normalized);
}
function getProgress(state) {
  if (state === null || state === void 0) {
    throw new TypeError("getProgress: state is null");
  }
  const rawSessions = state.sessions;
  if (rawSessions === void 0 || rawSessions === null) {
    throw new SessionStateInvariantError(
      1,
      "sessions[] is missing; synthesize v3 from v2 first or pass a v3 state"
    );
  }
  const sessions = parseSessions(rawSessions);
  const topStatus = canonicalizeStatus(state.status ?? null);
  const lifecycleState = state.lifecycleState ?? null;
  validateInvariants(sessions, topStatus, lifecycleState);
  const completedNumbers = sessions.filter((s) => s.status === SESSION_STATUS_COMPLETE).map((s) => s.number);
  const inProgress = sessions.filter((s) => s.status === SESSION_STATUS_IN_PROGRESS);
  const currentSession = inProgress.length > 0 ? inProgress[0].number : null;
  const notStarted = sessions.filter((s) => s.status === SESSION_STATUS_NOT_STARTED);
  const nextSession = notStarted.length > 0 ? notStarted[0].number : null;
  const isBetweenSessions = currentSession === null && completedNumbers.length >= 1 && nextSession !== null;
  return {
    sessions,
    totalSessions: sessions.length,
    completedSessions: completedNumbers,
    currentSession,
    nextSession,
    isBetweenSessions
  };
}
function validateInvariants(sessions, topStatus, lifecycleState) {
  if (sessions.length === 0) {
    throw new SessionStateInvariantError(1, "sessions[] must be non-empty");
  }
  const seen = /* @__PURE__ */ new Set();
  let expected = 1;
  for (const s of sessions) {
    if (!Number.isInteger(s.number) || typeof s.number === "boolean") {
      throw new SessionStateInvariantError(
        2,
        `session number must be an integer (not bool/float/string); got ${JSON.stringify(s.number)} of type ${typeof s.number}`
      );
    }
    if (s.number <= 0) {
      throw new SessionStateInvariantError(
        2,
        `session number must be positive, got ${s.number}`
      );
    }
    if (seen.has(s.number)) {
      throw new SessionStateInvariantError(
        2,
        `duplicate session number: ${s.number}`
      );
    }
    if (s.number !== expected) {
      throw new SessionStateInvariantError(
        2,
        `session numbers must be contiguous starting at 1; expected ${expected} next, got ${s.number}`
      );
    }
    seen.add(s.number);
    expected = s.number + 1;
    if (!SESSION_STATUSES.includes(s.status)) {
      throw new SessionStateInvariantError(
        2,
        `session ${s.number} has unknown status ${JSON.stringify(s.status)}; expected one of ${SESSION_STATUSES.join(", ")}`
      );
    }
  }
  const inProgress = sessions.filter((s) => s.status === SESSION_STATUS_IN_PROGRESS);
  if (inProgress.length > 1) {
    throw new SessionStateInvariantError(
      3,
      `only one session may be in-progress at a time; found: ${inProgress.map((s) => s.number).join(", ")}`
    );
  }
  let blockerNumber = null;
  let blockerStatus = null;
  for (const s of sessions) {
    if (s.status === SESSION_STATUS_NOT_STARTED || s.status === SESSION_STATUS_IN_PROGRESS) {
      if (blockerNumber === null) {
        blockerNumber = s.number;
        blockerStatus = s.status;
      }
    } else if (s.status === SESSION_STATUS_COMPLETE && blockerNumber !== null) {
      throw new SessionStateInvariantError(
        4,
        `session ${s.number} is complete but earlier session ${blockerNumber} is ${JSON.stringify(blockerStatus)}; complete sessions must form a contiguous prefix`
      );
    }
  }
  if (lifecycleState === LIFECYCLE_STATE_CLOSED) {
    if (topStatus !== "complete" && topStatus !== "cancelled") {
      throw new SessionStateInvariantError(
        8,
        `lifecycleState 'closed' requires status 'complete' or 'cancelled', got ${JSON.stringify(topStatus)}`
      );
    }
  }
  if (topStatus === null) {
    return;
  }
  if (!TOP_LEVEL_STATUSES.includes(topStatus)) {
    throw new SessionStateInvariantError(
      2,
      `top-level status must be one of ${TOP_LEVEL_STATUSES.join(", ")}, got ${JSON.stringify(topStatus)}`
    );
  }
  if (topStatus === "not-started") {
    const offenders = sessions.filter((s) => s.status !== SESSION_STATUS_NOT_STARTED).map((s) => s.number);
    if (offenders.length > 0) {
      throw new SessionStateInvariantError(
        5,
        `top-level status 'not-started' but sessions [${offenders.join(", ")}] are not 'not-started'`
      );
    }
  }
  if (topStatus === "complete") {
    const offenders = sessions.filter((s) => s.status !== SESSION_STATUS_COMPLETE).map((s) => s.number);
    if (offenders.length > 0) {
      throw new SessionStateInvariantError(
        7,
        `top-level status 'complete' but sessions [${offenders.join(", ")}] are not 'complete'`
      );
    }
  }
  if (topStatus === "in-progress") {
    const completeCount = sessions.filter((s) => s.status === SESSION_STATUS_COMPLETE).length;
    const notStartedCount = sessions.filter(
      (s) => s.status === SESSION_STATUS_NOT_STARTED
    ).length;
    const inProgressCount = inProgress.length;
    const okActive = inProgressCount === 1;
    const okBetween = inProgressCount === 0 && completeCount >= 1 && notStartedCount >= 1;
    if (!okActive && !okBetween) {
      throw new SessionStateInvariantError(
        6,
        `top-level status 'in-progress' requires either exactly one in-progress session or a between-sessions state (>=1 complete, >=1 not-started, 0 in-progress); got in_progress=${inProgressCount}, complete=${completeCount}, not_started=${notStartedCount}`
      );
    }
  }
}
function parseSessions(raw) {
  if (!Array.isArray(raw)) {
    throw new SessionStateInvariantError(
      1,
      `sessions[] must be an array, got ${typeof raw}`
    );
  }
  const out = [];
  for (let i2 = 0; i2 < raw.length; i2++) {
    const entry = raw[i2];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new SessionStateInvariantError(
        2,
        `sessions[${i2}] must be an object, got ${Array.isArray(entry) ? "array" : typeof entry}`
      );
    }
    if (!("number" in entry)) {
      throw new SessionStateInvariantError(
        2,
        `sessions[${i2}] missing required key 'number'`
      );
    }
    if (!("status" in entry)) {
      throw new SessionStateInvariantError(
        2,
        `sessions[${i2}] missing required key 'status'`
      );
    }
    const status = canonicalizeStatus(entry.status) ?? entry.status;
    out.push({
      number: entry.number,
      title: entry.title ?? `Session ${entry.number}`,
      status
    });
  }
  return out;
}

// src/utils/migrateSessionState.ts
var SESSION_STATE_FILENAME = "session-state.json";
function isStrictPositiveInt2(v) {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && !Number.isNaN(v);
}
function stripLegacyCompleted(raw, total) {
  if (!Array.isArray(raw))
    return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const n of raw) {
    if (isStrictPositiveInt2(n) && n >= 1 && n <= total && !seen.has(n)) {
      out.push(n);
      seen.add(n);
    }
  }
  out.sort((a, b2) => a - b2);
  return out;
}
function resolveTotal(state, specTitles) {
  const candidates = [];
  if (isStrictPositiveInt2(state.totalSessions))
    candidates.push(state.totalSessions);
  if (specTitles.size > 0)
    candidates.push(Math.max(...specTitles.keys()));
  if (isStrictPositiveInt2(state.currentSession))
    candidates.push(state.currentSession);
  if (Array.isArray(state.completedSessions)) {
    for (const n of state.completedSessions) {
      if (isStrictPositiveInt2(n))
        candidates.push(n);
    }
  }
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}
function resolveLifecycleState(topStatus, raw) {
  if (topStatus === SESSION_STATUS_COMPLETE)
    return LIFECYCLE_STATE_CLOSED;
  if (topStatus === "cancelled") {
    return typeof raw === "string" && raw.length > 0 ? raw : LIFECYCLE_STATE_CLOSED;
  }
  if (topStatus === SESSION_STATUS_IN_PROGRESS) {
    return typeof raw === "string" && raw.length > 0 ? raw : LIFECYCLE_STATE_WORK_IN_PROGRESS;
  }
  return typeof raw === "string" ? raw : null;
}
function buildV3Sessions(state, specTitles, total, useGenericTitles) {
  const topStatus = canonicalizeStatus(state.status);
  const lifecycle = state.lifecycleState;
  const currentInt = isStrictPositiveInt2(state.currentSession) ? state.currentSession : null;
  const legacyTotalInt = isStrictPositiveInt2(state.totalSessions) ? state.totalSessions : null;
  const closedSignal = topStatus === SESSION_STATUS_COMPLETE && (lifecycle === LIFECYCLE_STATE_CLOSED || legacyTotalInt !== null && currentInt !== null && currentInt >= legacyTotalInt);
  const completedLegacy = stripLegacyCompleted(state.completedSessions, total);
  const completedSet = closedSignal ? new Set(Array.from({ length: total }, (_2, i2) => i2 + 1)) : new Set(completedLegacy);
  let inProgressNumber = null;
  if (topStatus === SESSION_STATUS_IN_PROGRESS && currentInt !== null && currentInt >= 1 && currentInt <= total && !completedSet.has(currentInt)) {
    inProgressNumber = currentInt;
  }
  const sessions = [];
  for (let n = 1; n <= total; n++) {
    const title = useGenericTitles || !specTitles.has(n) ? `Session ${n}` : specTitles.get(n);
    let status;
    if (inProgressNumber !== null && n === inProgressNumber) {
      status = SESSION_STATUS_IN_PROGRESS;
    } else if (completedSet.has(n)) {
      status = SESSION_STATUS_COMPLETE;
    } else {
      status = SESSION_STATUS_NOT_STARTED;
    }
    sessions.push({ number: n, title, status });
  }
  return sessions;
}
function deriveLegacyTriple(sessions) {
  let current = null;
  const completed = [];
  for (const s of sessions) {
    if (s.status === SESSION_STATUS_IN_PROGRESS) {
      current = s.number;
    } else if (s.status === SESSION_STATUS_COMPLETE) {
      completed.push(s.number);
    }
  }
  completed.sort((a, b2) => a - b2);
  return { current, total: sessions.length, completed };
}
function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `${base}.tmp.${process.pid}.${Date.now()}`);
  const fd = fs2.openSync(tmp, "w");
  try {
    fs2.writeSync(fd, JSON.stringify(data, null, 2) + "\n", null, "utf-8");
    fs2.fsyncSync(fd);
  } finally {
    fs2.closeSync(fd);
  }
  fs2.renameSync(tmp, filePath);
}
function migrateOneSet(setDir, options = {}) {
  const strategy = options.strategy ?? "regex";
  const dryRun = options.dryRun ?? false;
  const statePath = path.join(setDir, SESSION_STATE_FILENAME);
  if (!fs2.existsSync(statePath)) {
    return {
      setDir,
      action: "skipped-no-state",
      reason: `${SESSION_STATE_FILENAME} not found`
    };
  }
  let raw;
  try {
    raw = fs2.readFileSync(statePath, "utf-8");
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc);
    return {
      setDir,
      action: "skipped-malformed",
      reason: `failed to read: ${msg}`,
      error: msg
    };
  }
  let state;
  try {
    state = JSON.parse(raw);
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc);
    return {
      setDir,
      action: "skipped-malformed",
      reason: `failed to parse: ${msg}`,
      error: msg
    };
  }
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    const t2 = Array.isArray(state) ? "array" : typeof state;
    return {
      setDir,
      action: "skipped-malformed",
      reason: `top-level JSON is ${t2}, expected object`
    };
  }
  const stateObj = state;
  const schemaVersion = stateObj.schemaVersion;
  if (typeof schemaVersion === "number" && schemaVersion > SCHEMA_VERSION_V3) {
    return {
      setDir,
      action: "skipped-future-schema",
      reason: `schemaVersion=${schemaVersion} is newer than this migrator (v${SCHEMA_VERSION_V3}); refusing to downgrade. Upgrade the migrator or hand-edit the file.`
    };
  }
  if (schemaVersion === SCHEMA_VERSION_V3) {
    if (Array.isArray(stateObj.sessions)) {
      return {
        setDir,
        action: "skipped-v3",
        reason: "already v3 (sessions[] present)"
      };
    }
    return {
      setDir,
      action: "skipped-malformed",
      reason: "schemaVersion=3 but sessions[] is missing or not a list; this is a broken v3 file, not a v2 file. Hand-repair or restore from git."
    };
  }
  const specMdPath = path.join(setDir, "spec.md");
  const specTitlesArr = extractSessionTitlesFromSpec(specMdPath);
  const specTitles = new Map(
    specTitlesArr.map((t2) => [t2.number, t2.title])
  );
  const total = resolveTotal(stateObj, specTitles);
  if (total < 1) {
    return {
      setDir,
      action: "would-violate",
      reason: "cannot determine totalSessions: no spec.md headings, no legacy totalSessions, no completedSessions, no currentSession"
    };
  }
  const sessions = buildV3Sessions(
    stateObj,
    specTitles,
    total,
    strategy === "generic"
  );
  const topStatusRaw = stateObj.status;
  const topStatus = canonicalizeStatus(topStatusRaw);
  const lifecycleState = resolveLifecycleState(topStatus, stateObj.lifecycleState);
  try {
    validateInvariants(sessions, topStatus, lifecycleState);
  } catch (exc) {
    if (exc instanceof SessionStateInvariantError) {
      return {
        setDir,
        action: "would-violate",
        reason: exc.message,
        error: exc.message
      };
    }
    throw exc;
  }
  const { current, total: derivedTotal, completed } = deriveLegacyTriple(sessions);
  const out = { ...stateObj };
  out.schemaVersion = SCHEMA_VERSION_V3;
  out.sessions = sessions;
  if (topStatus !== null && topStatus !== topStatusRaw) {
    out.status = topStatus;
  }
  if (lifecycleState !== null || "lifecycleState" in out) {
    out.lifecycleState = lifecycleState;
  }
  out.currentSession = current;
  out.totalSessions = derivedTotal;
  out.completedSessions = completed;
  if (!dryRun) {
    atomicWriteJson(statePath, out);
  }
  return {
    setDir,
    action: "migrated",
    reason: `migrated using ${strategy} strategy`
  };
}

// src/commands/migrateSet.ts
var STRATEGY_CHOICES = [
  {
    label: "$(symbol-text)  Use spec.md headings",
    description: "Regex extraction \xB7 deterministic \xB7 zero cost",
    detail: "Reads `### Session K of N: <title>` headings from spec.md. Recommended for normal session sets.",
    strategy: "regex"
  },
  {
    label: "$(symbol-numeric)  Use generic labels",
    description: "Fallback \xB7 'Session 1', 'Session 2', \u2026",
    detail: "Use when spec.md is intentionally missing or you want neutral, stable labels independent of heading drift.",
    strategy: "generic"
  }
];
function registerMigrateSetCommand(context, deps) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.migrate",
      async (treeItem) => {
        const set = treeItem?.set;
        if (!set) {
          vscode.window.showErrorMessage(
            "Migrate to v3 schema must be invoked from a session-set row in the Session Sets view. Right-click a row marked '(needs migration)' to use this command."
          );
          return;
        }
        if (!set.needsMigration) {
          vscode.window.showInformationMessage(
            `${set.name} is already on schema v3 \u2014 nothing to migrate.`
          );
          return;
        }
        const choice = await vscode.window.showQuickPick(STRATEGY_CHOICES, {
          title: `Migrate ${set.name} to v3 schema`,
          placeHolder: "Choose how session titles should be derived",
          ignoreFocusOut: true
        });
        if (!choice)
          return;
        await runMigrator(set, choice.strategy, deps);
      }
    )
  );
}
async function runMigrator(set, strategy, deps) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Migrating ${set.name} to v3 schema (${strategy})\u2026`,
      cancellable: false
    },
    async () => {
      let result;
      try {
        result = migrateOneSet(set.dir, { strategy });
      } catch (exc) {
        const msg = exc instanceof Error ? exc.message : String(exc);
        vscode.window.showErrorMessage(
          `Migration of ${set.name} failed with an unexpected error: ${msg}`
        );
        return;
      }
      handleMigrationResult(set, strategy, result, deps);
    }
  );
}
function handleMigrationResult(set, strategy, result, deps) {
  if (result.action === "migrated") {
    vscode.window.showInformationMessage(
      `${set.name} migrated to v3 schema (${strategy}). The tree will refresh shortly; the (needs migration) badge clears on the next read.`
    );
    deps.refreshView();
    return;
  }
  if (result.action === "skipped-v3") {
    vscode.window.showInformationMessage(
      `${set.name} is already v3 \u2014 no changes written.`
    );
    deps.refreshView();
    return;
  }
  if (result.action === "would-violate") {
    vscode.window.showWarningMessage(
      `Migration of ${set.name} stopped: the resulting v3 file would violate schema invariants. Reason: ${result.reason}. Try the other strategy (regex \u2194 generic) or hand-repair the state file before retrying.`
    );
    return;
  }
  vscode.window.showWarningMessage(
    `Migration of ${set.name} skipped (${result.action}): ${result.reason}.`
  );
}

// src/commands/migrateSetV4.ts
var vscode2 = __toESM(require("vscode"));

// src/utils/migrateSessionStateV4.ts
var fs3 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var SESSION_STATE_FILENAME2 = "session-state.json";
var BACKUP_FILENAME = "session-state.v3.bak.json";
var SWEEP_BACKUP_FILENAME = "session-state.pre-049-sweep.bak.json";
var RETIRED_ORCHESTRATOR_KEYS = [
  "chatSessionId",
  "checkedOutAt",
  "lastActivityAt"
];
var V4_TOP_LEVEL_DROPPED_KEYS = [
  "lifecycleState",
  "currentSession",
  "totalSessions",
  "completedSessions",
  "startedAt",
  "completedAt",
  "orchestrator",
  "verificationVerdict"
];
var V4_TOP_LEVEL_PRESERVED_KEYS = [
  "schemaVersion",
  "sessionSetName",
  "status",
  "sessions"
];
var V4_TOP_LEVEL_PASSTHROUGH_KEYS = [
  "preCancelStatus",
  "forceClosed"
];
function stripRetiredOrchestratorKeys(block) {
  if (block === null || typeof block !== "object" || Array.isArray(block)) {
    return [block, false];
  }
  const obj = block;
  let changed = false;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (RETIRED_ORCHESTRATOR_KEYS.includes(key)) {
      changed = true;
      continue;
    }
    out[key] = value;
  }
  return [out, changed];
}
function sweepOrchestratorBlocks(state) {
  let changed = false;
  let newState = state;
  const topOrch = state.orchestrator;
  if (topOrch !== null && typeof topOrch === "object" && !Array.isArray(topOrch)) {
    const [swept, topChanged] = stripRetiredOrchestratorKeys(topOrch);
    if (topChanged) {
      newState = { ...state };
      newState.orchestrator = swept;
      changed = true;
    }
  }
  const sessions = state.sessions;
  if (Array.isArray(sessions)) {
    const newSessions = [];
    let sessionsChanged = false;
    for (const entry of sessions) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        newSessions.push(entry);
        continue;
      }
      const entryObj = entry;
      const [swept, entryChanged] = stripRetiredOrchestratorKeys(
        entryObj.orchestrator
      );
      if (entryChanged) {
        newSessions.push({ ...entryObj, orchestrator: swept });
        sessionsChanged = true;
      } else {
        newSessions.push(entry);
      }
    }
    if (sessionsChanged) {
      if (newState === state) {
        newState = { ...state };
      }
      newState.sessions = newSessions;
      changed = true;
    }
  }
  return [newState, changed];
}
function buildV4OnDiskShape(normalized, original) {
  const out = {};
  for (const key of V4_TOP_LEVEL_PRESERVED_KEYS) {
    if (key === "schemaVersion") {
      out[key] = SCHEMA_VERSION_V4;
    } else if (key === "status") {
      const canon = canonicalizeStatus(
        normalized.status ?? null
      );
      out[key] = canon ?? normalized.status ?? null;
    } else if (key === "sessions") {
      out[key] = normalized.sessions ?? [];
    } else {
      out[key] = normalized[key] ?? null;
    }
  }
  for (const key of V4_TOP_LEVEL_PASSTHROUGH_KEYS) {
    if (key in original) {
      out[key] = original[key];
    }
  }
  for (const key of V4_TOP_LEVEL_DROPPED_KEYS) {
    delete out[key];
  }
  return out;
}
function atomicWriteJson2(filePath, data) {
  const dir = path2.dirname(filePath);
  const base = path2.basename(filePath);
  const tmp = path2.join(
    dir,
    `.${base}.tmp.${process.pid}.${Date.now()}`
  );
  const fd = fs3.openSync(tmp, "w");
  try {
    fs3.writeSync(fd, JSON.stringify(data, null, 2) + "\n", null, "utf-8");
    fs3.fsyncSync(fd);
  } finally {
    fs3.closeSync(fd);
  }
  try {
    fs3.renameSync(tmp, filePath);
  } catch (exc) {
    try {
      fs3.unlinkSync(tmp);
    } catch {
    }
    throw exc;
  }
}
function atomicCopyJson(src, dst) {
  const raw = JSON.parse(fs3.readFileSync(src, "utf-8"));
  atomicWriteJson2(dst, raw);
}
function migrateOneSetV4(setDir, options = {}) {
  const dryRun = options.dryRun ?? false;
  const statePath = path2.join(setDir, SESSION_STATE_FILENAME2);
  const backupPath = path2.join(setDir, BACKUP_FILENAME);
  if (!fs3.existsSync(statePath)) {
    return {
      setDir,
      action: "skipped-no-state",
      reason: `${SESSION_STATE_FILENAME2} not found`
    };
  }
  let raw;
  try {
    raw = fs3.readFileSync(statePath, "utf-8");
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc);
    return {
      setDir,
      action: "skipped-malformed",
      reason: `failed to read: ${msg}`,
      error: msg
    };
  }
  let state;
  try {
    state = JSON.parse(raw);
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc);
    return {
      setDir,
      action: "skipped-malformed",
      reason: `failed to parse: ${msg}`,
      error: msg
    };
  }
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    const t2 = Array.isArray(state) ? "array" : typeof state;
    return {
      setDir,
      action: "skipped-malformed",
      reason: `top-level JSON is ${t2}, expected object`
    };
  }
  const stateObj = state;
  const schemaVersion = stateObj.schemaVersion;
  if (typeof schemaVersion === "number" && schemaVersion > SCHEMA_VERSION_V4) {
    return {
      setDir,
      action: "skipped-future-schema",
      reason: `schemaVersion=${schemaVersion} is newer than this migrator (v${SCHEMA_VERSION_V4}); refusing to downgrade. Upgrade the migrator or hand-edit the file.`,
      before: state
    };
  }
  if (typeof schemaVersion === "number" && schemaVersion >= SCHEMA_VERSION_V4) {
    const [sweptState, swept] = sweepOrchestratorBlocks(stateObj);
    if (!swept) {
      return {
        setDir,
        action: "skipped-v4",
        reason: `already v4 (schemaVersion=${schemaVersion})`,
        before: state,
        after: state
      };
    }
    if (dryRun) {
      return {
        setDir,
        action: "swept-orchestrator",
        reason: `v4 \u2192 v4 (orchestrator-block sweep: stripping ${RETIRED_ORCHESTRATOR_KEYS.join(", ")}; dry-run, no write performed)`,
        before: state,
        after: sweptState
      };
    }
    const sweepBackupPath = path2.join(setDir, SWEEP_BACKUP_FILENAME);
    try {
      atomicCopyJson(statePath, sweepBackupPath);
    } catch (exc) {
      const msg = exc instanceof Error ? exc.message : String(exc);
      return {
        setDir,
        action: "failed-backup",
        reason: `could not write backup at ${sweepBackupPath}: ${msg}`,
        error: msg,
        before: state
      };
    }
    try {
      atomicWriteJson2(statePath, sweptState);
    } catch (exc) {
      const msg = exc instanceof Error ? exc.message : String(exc);
      return {
        setDir,
        action: "failed-backup",
        reason: `backup written at ${sweepBackupPath} but state-file write failed: ${msg}. Restore the backup via the rollback procedure at docs/v3-to-v4-rollback-procedure.md.`,
        error: msg,
        before: state,
        backupPath: sweepBackupPath
      };
    }
    return {
      setDir,
      action: "swept-orchestrator",
      reason: `v4 \u2192 v4 (orchestrator-block sweep: stripped ${RETIRED_ORCHESTRATOR_KEYS.join(", ")})`,
      before: state,
      after: sweptState,
      backupPath: sweepBackupPath
    };
  }
  if (!(typeof schemaVersion === "number" && schemaVersion === SCHEMA_VERSION_V3)) {
    return {
      setDir,
      action: "skipped-not-v3",
      reason: `schemaVersion=${JSON.stringify(schemaVersion)} is not v${SCHEMA_VERSION_V3}; the v3\u2192v4 migrator only operates on v3 input. Right-click the row and run "Migrate to v3 schema" first, then re-run "Migrate to v4 schema".`,
      before: state
    };
  }
  if (!Array.isArray(stateObj.sessions)) {
    return {
      setDir,
      action: "skipped-malformed",
      reason: "schemaVersion=3 but sessions[] is missing or not a list; this is a broken v3 file, not a downgrade candidate. Hand-repair or restore from git, then re-run.",
      before: state
    };
  }
  const specMdPath = path2.join(setDir, "spec.md");
  let normalized;
  try {
    normalized = normalizeToV4Shape(stateObj, specMdPath);
  } catch (exc) {
    if (exc instanceof SessionStateInvariantError) {
      return {
        setDir,
        action: "would-violate",
        reason: exc.message,
        error: exc.message,
        before: state
      };
    }
    const msg = exc instanceof Error ? exc.message : String(exc);
    return {
      setDir,
      action: "skipped-malformed",
      reason: `normalizeToV4Shape rejected the input: ${msg}`,
      error: msg,
      before: state
    };
  }
  try {
    getProgress(normalized);
  } catch (exc) {
    if (exc instanceof SessionStateInvariantError) {
      return {
        setDir,
        action: "would-violate",
        reason: exc.message,
        error: exc.message,
        before: state
      };
    }
    throw exc;
  }
  let newState = buildV4OnDiskShape(normalized, stateObj);
  const [sweptNewState] = sweepOrchestratorBlocks(newState);
  newState = sweptNewState;
  if (dryRun) {
    return {
      setDir,
      action: "migrated",
      reason: "v3 \u2192 v4 (dry-run; no write performed)",
      before: state,
      after: newState
    };
  }
  try {
    atomicCopyJson(statePath, backupPath);
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc);
    return {
      setDir,
      action: "failed-backup",
      reason: `could not write backup at ${backupPath}: ${msg}`,
      error: msg,
      before: state
    };
  }
  try {
    atomicWriteJson2(statePath, newState);
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc);
    return {
      setDir,
      action: "failed-backup",
      reason: `backup written at ${backupPath} but state-file write failed: ${msg}. Restore the backup via the rollback procedure at docs/v3-to-v4-rollback-procedure.md.`,
      error: msg,
      before: state,
      backupPath
    };
  }
  return {
    setDir,
    action: "migrated",
    reason: "v3 \u2192 v4",
    before: state,
    after: newState,
    backupPath
  };
}

// src/commands/migrateSetV4.ts
function registerMigrateSetV4Command(context, deps) {
  context.subscriptions.push(
    vscode2.commands.registerCommand(
      "dabblerSessionSets.migrateToV4",
      async (treeItem) => {
        const set = treeItem?.set;
        if (!set) {
          vscode2.window.showErrorMessage(
            "Migrate to v4 schema must be invoked from a session-set row in the Session Sets view. Right-click a row marked '(needs migration)' to use this command."
          );
          return;
        }
        if (set.migrationTargetSchemaVersion !== 4) {
          if (set.migrationTargetSchemaVersion === 3) {
            vscode2.window.showInformationMessage(
              `${set.name} is at v1/v2 (or broken v3) \u2014 run "Migrate to v3 schema" first, then re-run this command.`
            );
          } else {
            vscode2.window.showInformationMessage(
              `${set.name} is already on schema v4 \u2014 nothing to migrate.`
            );
          }
          return;
        }
        const confirm = await vscode2.window.showInformationMessage(
          `Migrate ${set.name} to v4 schema? This will rewrite session-state.json in v4 shape and write a backup at session-state.v3.bak.json alongside it for rollback.`,
          { modal: true },
          "Migrate"
        );
        if (confirm !== "Migrate")
          return;
        await runMigratorV4(set, deps);
      }
    )
  );
}
async function runMigratorV4(set, deps) {
  await vscode2.window.withProgress(
    {
      location: vscode2.ProgressLocation.Notification,
      title: `Migrating ${set.name} to v4 schema\u2026`,
      cancellable: false
    },
    async () => {
      let result;
      try {
        result = migrateOneSetV4(set.dir, { dryRun: false });
      } catch (exc) {
        const msg = exc instanceof Error ? exc.message : String(exc);
        vscode2.window.showErrorMessage(
          `Migration of ${set.name} to v4 failed with an unexpected error: ${msg}`
        );
        return;
      }
      handleMigrationResultV4(set, result, deps);
    }
  );
}
function handleMigrationResultV4(set, result, deps) {
  if (result.action === "migrated") {
    vscode2.window.showInformationMessage(
      `${set.name} migrated to v4 schema. Backup at session-state.v3.bak.json. The tree will refresh shortly; the (needs migration) badge clears on the next read.`
    );
    deps.refreshView();
    return;
  }
  if (result.action === "skipped-v4") {
    vscode2.window.showInformationMessage(
      `${set.name} is already v4 \u2014 no changes written.`
    );
    deps.refreshView();
    return;
  }
  if (result.action === "skipped-not-v3") {
    vscode2.window.showWarningMessage(
      `Migration of ${set.name} to v4 was skipped: ${result.reason}`
    );
    return;
  }
  if (result.action === "would-violate") {
    vscode2.window.showWarningMessage(
      `Migration of ${set.name} stopped: the resulting v4 file would violate schema invariants. Reason: ${result.reason}. Hand-repair the state file before retrying.`
    );
    return;
  }
  if (result.action === "failed-backup") {
    if (result.backupPath) {
      vscode2.window.showErrorMessage(
        `Migration of ${set.name} failed AFTER backup was written at ${result.backupPath}. ${result.reason} See docs/v3-to-v4-rollback-procedure.md to restore.`
      );
    } else {
      vscode2.window.showErrorMessage(
        `Migration of ${set.name} could not write its backup: ${result.reason}. The state file was not modified \u2014 fix the filesystem issue (permissions / disk space) and re-run. No rollback needed.`
      );
    }
    return;
  }
  vscode2.window.showWarningMessage(
    `Migration of ${set.name} skipped (${result.action}): ${result.reason}.`
  );
}

// src/utils/fileSystem.ts
var vscode3 = __toESM(require("vscode"));
var crypto = __toESM(require("crypto"));
var fs6 = __toESM(require("fs"));
var path6 = __toESM(require("path"));
var YAML = __toESM(require_dist());

// src/utils/git.ts
var cp = __toESM(require("child_process"));
var path3 = __toESM(require("path"));
function listGitWorktrees(cwd) {
  let out;
  try {
    out = cp.execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      timeout: 5e3
    });
  } catch {
    return [];
  }
  const paths = [];
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      const wt = line.slice("worktree ".length).trim();
      if (wt)
        paths.push(path3.resolve(wt));
    }
  }
  return paths;
}

// src/utils/sessionState.ts
var fs4 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
var SCHEMA_VERSION = SCHEMA_VERSION_V4;
var SESSION_STATE_FILENAME3 = "session-state.json";
function buildSessions(totalSessions, topStatus, specTitles) {
  if (totalSessions === null || totalSessions <= 0)
    return void 0;
  const out = [];
  for (let n = 1; n <= totalSessions; n++) {
    let status = "not-started";
    if (topStatus === "complete") {
      status = "complete";
    } else if (topStatus === "in-progress" && n === 1) {
      status = "in-progress";
    }
    out.push({
      number: n,
      title: healTitle(null, n, specTitles) ?? `Session ${n}`,
      status,
      startedAt: null,
      completedAt: null,
      orchestrator: null,
      verificationVerdict: null
    });
  }
  return out;
}
var STATUS_ALIASES2 = {
  completed: "complete",
  done: "complete"
};
function canonicalizeStatus2(raw) {
  return STATUS_ALIASES2[raw] ?? raw;
}
function totalSessionsFromSpecText(text, specTitles) {
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i
  );
  const block = headingMatch ? headingMatch[1] : text.slice(0, 4e3);
  const totalMatch = block.match(/^\s*totalSessions\s*:\s*(\d+)\s*$/im);
  if (totalMatch) {
    const value = Number.parseInt(totalMatch[1], 10);
    if (Number.isFinite(value) && value > 0)
      return value;
  }
  if (specTitles.size === 0)
    return null;
  const maxN = Math.max(...specTitles.keys());
  return maxN > 0 ? maxN : null;
}
function readSpecOnce(sessionSetDir) {
  const specPath = path4.join(sessionSetDir, "spec.md");
  let text;
  try {
    text = fs4.readFileSync(specPath, "utf8");
  } catch {
    return { titles: /* @__PURE__ */ new Map(), total: null };
  }
  const titles = specTitleMapFromText(text);
  return { titles, total: totalSessionsFromSpecText(text, titles) };
}
function notStartedPayload(sessionSetDir) {
  const { titles, total } = readSpecOnce(sessionSetDir);
  const sessions = buildSessions(total, "not-started", titles);
  const base = {
    schemaVersion: SCHEMA_VERSION,
    sessionSetName: path4.basename(sessionSetDir.replace(/[\\/]+$/, "")),
    status: "not-started"
  };
  if (sessions !== void 0) {
    base.sessions = sessions;
  }
  return base;
}
function inferStateInMemory(sessionSetDir) {
  const changelogPath = path4.join(sessionSetDir, "change-log.md");
  if (fs4.existsSync(changelogPath)) {
    const base = notStartedPayload(sessionSetDir);
    if (!Array.isArray(base.sessions)) {
      return base;
    }
    base.status = "complete";
    const sessions = base.sessions;
    for (const entry of sessions) {
      entry.status = "complete";
    }
    return base;
  }
  const activityPath = path4.join(sessionSetDir, "activity-log.json");
  if (fs4.existsSync(activityPath)) {
    let entries = null;
    let readable = true;
    try {
      const data = JSON.parse(fs4.readFileSync(activityPath, "utf8"));
      if (Array.isArray(data)) {
        entries = data;
      } else if (data && typeof data === "object" && Array.isArray(data.entries)) {
        entries = data.entries;
      } else {
        readable = false;
      }
    } catch {
      readable = false;
    }
    if (readable && entries !== null && entries.length === 0) {
      return notStartedPayload(sessionSetDir);
    }
    const base = notStartedPayload(sessionSetDir);
    if (!Array.isArray(base.sessions) || base.sessions.length === 0) {
      return base;
    }
    base.status = "in-progress";
    const sessions = base.sessions;
    sessions[0].status = "in-progress";
    const timestamps = [];
    for (const e of entries ?? []) {
      if (typeof e.dateTime === "string")
        timestamps.push(e.dateTime);
    }
    timestamps.sort();
    const earliest = timestamps[0];
    if (earliest !== void 0) {
      sessions[0].startedAt = earliest;
    }
    return base;
  }
  return notStartedPayload(sessionSetDir);
}
function loadCanonicalStatus(filePath) {
  const raw = fs4.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(
      `${filePath}: session-state.json must contain a JSON object`
    );
  }
  const status = parsed.status;
  if (typeof status !== "string") {
    throw new Error(
      `${filePath}: session-state.json missing string 'status' field`
    );
  }
  return canonicalizeStatus2(status);
}
function readStatus(sessionSetDir) {
  const filePath = path4.join(sessionSetDir, SESSION_STATE_FILENAME3);
  if (fs4.existsSync(filePath)) {
    return loadCanonicalStatus(filePath);
  }
  const inferred = inferStateInMemory(sessionSetDir).status;
  return typeof inferred === "string" ? canonicalizeStatus2(inferred) : "not-started";
}

// src/utils/cancelLifecycle.ts
var fs5 = __toESM(require("fs"));
var path5 = __toESM(require("path"));
var CANCELLED_FILENAME = "CANCELLED.md";
var RESTORED_FILENAME = "RESTORED.md";
var SESSION_STATE_FILENAME4 = "session-state.json";
function isCancelled(sessionSetDir) {
  return fs5.existsSync(path5.join(sessionSetDir, CANCELLED_FILENAME));
}
function readSessionState(sessionSetDir) {
  const statePath = path5.join(sessionSetDir, SESSION_STATE_FILENAME4);
  if (!fs5.existsSync(statePath))
    return null;
  try {
    const raw = fs5.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
  } catch {
  }
  return null;
}
function readCancellationState(sessionSetDir) {
  const state = readSessionState(sessionSetDir);
  if (state === null)
    return "unknown";
  if (typeof state.status !== "string" || state.status.length === 0) {
    return "unknown";
  }
  if (state.status === "cancelled")
    return "cancelled";
  if (fs5.existsSync(path5.join(sessionSetDir, RESTORED_FILENAME))) {
    return "restored";
  }
  return "active";
}

// src/providers/sessionStepModel.ts
var PLAN_STEP_KIND = "plan-step";
var STATUS_GLYPHS = {
  complete: "complete",
  done: "complete",
  "in-progress": "in-progress",
  in_progress: "in-progress",
  started: "in-progress",
  pending: "not-started",
  "not-started": "not-started",
  blocked: "cancelled",
  failed: "cancelled"
};
function glyphStatusOf(status) {
  return STATUS_GLYPHS[pyStr(status).toLowerCase()] ?? "not-started";
}
var IN_PROGRESS_STATUS = "in-progress";
var UNSTARTED_STATUSES = new Set(
  Object.entries(STATUS_GLYPHS).filter(([, glyph]) => glyph === "not-started").map(([token]) => token)
);
var RECORD_ANSWERS_GLYPHS = /* @__PURE__ */ new Set([
  "in-progress",
  "cancelled"
]);
function effectiveStatusOf(row) {
  return row.isActive ? IN_PROGRESS_STATUS : row.status;
}
var NOT_IN_FLIGHT = { inFlight: false, startedAt: null };
function isoOrNull(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function sessionFlightFacts(state, sessionNumber) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return NOT_IN_FLIGHT;
  }
  const sessions = state.sessions;
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return {
      inFlight: false,
      startedAt: isoOrNull(state.startedAt)
    };
  }
  for (const entry of sessions) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      continue;
    const e = entry;
    if (typeof e.number !== "number" || !Number.isInteger(e.number))
      continue;
    if (e.number !== sessionNumber)
      continue;
    return {
      inFlight: e.status === "in-progress",
      startedAt: isoOrNull(e.startedAt)
    };
  }
  return NOT_IN_FLIGHT;
}
function pyStr(value) {
  return value ? String(value) : "";
}
function isLoggedStep(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry))
    return false;
  return pyStr(entry.kind).trim() === "";
}
function stepNumberOf(entry) {
  const value = entry.stepNumber;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
function keyOf(entry) {
  return pyStr(entry.stepKey).trim();
}
function collapseByStepKey(entries) {
  const order = [];
  const latest = /* @__PURE__ */ new Map();
  let anonymous = 0;
  for (const entry of entries) {
    let key = keyOf(entry);
    if (!key) {
      anonymous += 1;
      key = `\0anon-${anonymous}`;
    }
    if (!latest.has(key))
      order.push(key);
    latest.set(key, entry);
  }
  return order.map((key) => latest.get(key));
}
function rowFromEntry(entry, isPlanned) {
  return {
    stepNumber: stepNumberOf(entry),
    stepKey: pyStr(entry.stepKey),
    description: pyStr(entry.description),
    status: pyStr(entry.status),
    isPlanned,
    // Derived last, by `deriveProgress`, on every path. Constructed at
    // their null answers so a row is never half-built.
    isActive: false,
    startedAt: null
  };
}
function completionOf(entry) {
  if (!isLoggedStep(entry))
    return null;
  return pyStr(entry.dateTime).trim() || null;
}
function isStepRow(item) {
  return item.isStep || item.row.isPlanned;
}
function evidenceOf(entry, isPlanned) {
  return {
    row: rowFromEntry(entry, isPlanned),
    completion: completionOf(entry),
    isStep: isLoggedStep(entry)
  };
}
function reconcile(plan, real, allowOrdinal) {
  const evidence = plan.map((entry) => evidenceOf(entry, true));
  const byNumber = /* @__PURE__ */ new Map();
  const byKey = /* @__PURE__ */ new Map();
  plan.forEach((entry, index) => {
    const number = stepNumberOf(entry);
    if (number !== null && !byNumber.has(number))
      byNumber.set(number, index);
    const key = keyOf(entry);
    if (key && !byKey.has(key))
      byKey.set(key, index);
  });
  const claims = /* @__PURE__ */ new Map();
  const claimed = /* @__PURE__ */ new Set();
  const claim = (target, position) => {
    if (target === void 0 || claimed.has(target))
      return;
    claimed.add(target);
    claims.set(position, target);
  };
  real.forEach((entry, position) => {
    if (!isLoggedStep(entry))
      return;
    claim(byKey.get(keyOf(entry)), position);
  });
  if (allowOrdinal) {
    real.forEach((entry, position) => {
      if (claims.has(position) || !isLoggedStep(entry))
        return;
      const number = stepNumberOf(entry);
      if (number === null)
        return;
      claim(byNumber.get(number), position);
    });
  }
  for (const [position, target] of claims) {
    evidence[target] = evidenceOf(real[position], false);
  }
  const extra = real.filter((_entry, position) => !claims.has(position)).map((entry) => evidenceOf(entry, false));
  return [...evidence, ...extra];
}
function activeStepIndex(rows) {
  if (rows.some((row) => RECORD_ANSWERS_GLYPHS.has(glyphStatusOf(row.status)))) {
    return null;
  }
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.isPlanned && UNSTARTED_STATUSES.has(pyStr(row.status).toLowerCase())) {
      return index;
    }
  }
  return null;
}
function deriveProgress(evidence, flight) {
  const rows = evidence.map((item) => item.row);
  const active = flight.inFlight ? activeStepIndex(rows) : null;
  const derived = [];
  let previousCompletion = flight.startedAt;
  evidence.forEach((item, index) => {
    const isActive = index === active;
    const hasStarted = isActive || item.isStep;
    derived.push({
      ...item.row,
      isActive,
      startedAt: hasStarted ? previousCompletion : null
    });
    if (isStepRow(item))
      previousCompletion = item.completion;
  });
  return derived;
}
var SESSION_HEAD_RE = /^###\s+Session\s+(\d+)(?:\s+of\s+(\d+))?\s*:\s*(.*)$/gm;
var STEP_RE = /^(\s{0,3})(\d+)\.\s+\S/gm;
var FENCE_RE = /^\s*(?:```|~~~)/;
function stripFencedBlocks(text) {
  let inFence = false;
  return text.split("\n").map((line) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return "";
    }
    return inFence ? "" : line;
  }).join("\n");
}
function parseStepTexts(segment) {
  const bounds = [];
  STEP_RE.lastIndex = 0;
  let match;
  while ((match = STEP_RE.exec(segment)) !== null) {
    const digitStart = match.index + match[1].length;
    bounds.push(segment.lastIndexOf("\n", digitStart - 1) + 1);
  }
  return bounds.map((start, i2) => {
    const end = i2 + 1 < bounds.length ? bounds[i2 + 1] : segment.length;
    const lines = segment.slice(start, end).split("\n");
    const kept = lines.length > 0 ? [lines[0]] : [];
    for (const line of lines.slice(1)) {
      if (line.trim() !== "" && !/^\s/.test(line.slice(0, 1)))
        break;
      kept.push(line);
    }
    return kept.join(" ").replace(/^\s*\d+\.\s*/, "").replace(/\s+/g, " ").trim();
  });
}
function scanSessionHeads(body) {
  const heads = [];
  SESSION_HEAD_RE.lastIndex = 0;
  let match;
  while ((match = SESSION_HEAD_RE.exec(body)) !== null) {
    heads.push({
      number: Number(match[1]),
      headStart: match.index,
      contentStart: match.index + match[0].length
    });
    if (match[0].length === 0)
      SESSION_HEAD_RE.lastIndex += 1;
  }
  return heads;
}
function parseSpecSteps(specText, sessionNumber) {
  const body = stripFencedBlocks(specText);
  const heads = scanSessionHeads(body);
  for (let i2 = 0; i2 < heads.length; i2 += 1) {
    if (heads[i2].number !== sessionNumber)
      continue;
    const end = i2 + 1 < heads.length ? heads[i2 + 1].headStart : body.length;
    return parseStepTexts(body.slice(heads[i2].contentStart, end)).filter(
      (step) => step.trim() !== ""
    );
  }
  return [];
}
function planMatchesSpec(plan, specSteps) {
  if (specSteps.length === 0)
    return false;
  const seeded = plan.map((entry) => pyStr(entry.description));
  return seeded.length === specSteps.length && seeded.every((text, i2) => text === specSteps[i2]);
}
function buildStepRows(entries, sessionNumber, specSteps, flight = NOT_IN_FLIGHT) {
  const mine = entries.filter(
    (entry) => entry && typeof entry === "object" && !Array.isArray(entry) && entry.sessionNumber === sessionNumber
  );
  if (mine.length === 0)
    return [];
  const plan = collapseByStepKey(mine.filter((e) => e.kind === PLAN_STEP_KIND));
  const real = collapseByStepKey(mine.filter((e) => isLoggedStep(e)));
  const evidence = plan.length === 0 ? real.map((entry) => evidenceOf(entry, false)) : reconcile(plan, real, planMatchesSpec(plan, specSteps));
  return deriveProgress(evidence, flight);
}
function humanizeStepKey(stepKey) {
  const text = pyStr(stepKey).replace(/[_-]/g, " ").trim();
  if (!text)
    return "";
  return text[0].toUpperCase() + text.slice(1);
}
function stepRowLabel(row) {
  const label = humanizeStepKey(row.stepKey);
  if (label)
    return label;
  const description = pyStr(row.description).trim();
  if (!description)
    return "(unnamed step)";
  const clause = /^[^.:;]*[.:;]?/.exec(description);
  return (clause?.[0] ?? description).trim() || description;
}

// src/utils/fileSystem.ts
var SESSION_SETS_REL = path6.join("docs", "session-sets");
var MODULES_MANIFEST_REL = path6.join("docs", "modules.yaml");
var PLAYWRIGHT_REL_DEFAULT = "tests";
function listSessionSetDirNames(root) {
  const dir = path6.join(root, SESSION_SETS_REL);
  if (!fs6.existsSync(dir))
    return [];
  return fs6.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name).sort();
}
var NODE_EXCLUSIVE_WRITE_OPS = {
  lstat: (p2) => void fs6.lstatSync(p2),
  writeExclusive: (p2, data) => fs6.writeFileSync(p2, data, { encoding: "utf8", flag: "wx" }),
  link: (from, to) => fs6.linkSync(from, to),
  remove: (p2) => fs6.rmSync(p2, { force: true })
};
var LINK_UNSUPPORTED_CODES = /* @__PURE__ */ new Set([
  "ENOTSUP",
  "EOPNOTSUPP",
  "EPERM",
  "EMLINK",
  "EXDEV"
]);
function writeFileExclusiveSync(absPath, content, ops = NODE_EXCLUSIVE_WRITE_OPS) {
  let destExists = false;
  try {
    ops.lstat(absPath);
    destExists = true;
  } catch (e) {
    if (e.code !== "ENOENT")
      throw e;
  }
  if (destExists) {
    const err = new Error(`EEXIST: ${absPath} already exists`);
    err.code = "EEXIST";
    throw err;
  }
  const tmp = `${absPath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.dabbler-exclusive-tmp`;
  ops.writeExclusive(tmp, content);
  try {
    ops.link(tmp, absPath);
  } catch (e) {
    const code = e.code;
    if (code && LINK_UNSUPPORTED_CODES.has(code)) {
      throw new Error(
        `Could not create ${absPath} atomically: this workspace's filesystem does not support hard links (${code}). Move the project to a filesystem with hard-link support (NTFS, APFS, ext4, \u2026), then retry.`
      );
    }
    throw e;
  } finally {
    try {
      ops.remove(tmp);
    } catch {
    }
  }
}
var STATE_RANK = {
  complete: 3,
  "in-progress": 2,
  "not-started": 1,
  cancelled: 0
};
function discoverRootsWithFamilies() {
  const seen = /* @__PURE__ */ new Map();
  const order = [];
  const canonicalKey = (p2) => {
    try {
      return fs6.realpathSync.native(p2);
    } catch {
      return p2;
    }
  };
  const add = (p2, familyId) => {
    if (!p2)
      return;
    const canonical = path6.resolve(p2);
    const key = canonicalKey(canonical);
    if (seen.has(key) || !fs6.existsSync(canonical))
      return;
    seen.set(key, canonical);
    order.push({ dir: canonical, familyId });
  };
  const folders = (vscode3.workspace.workspaceFolders ?? []).map((f) => {
    const folderPath = path6.resolve(f.uri.fsPath);
    const worktrees = listGitWorktrees(folderPath);
    const familyId = canonicalKey(
      worktrees.length > 0 ? worktrees[0] : folderPath
    );
    return { folderPath, worktrees, familyId };
  });
  for (const f of folders) {
    add(f.folderPath, f.familyId);
  }
  for (const f of folders) {
    for (const wt of f.worktrees) {
      add(wt, f.familyId);
    }
  }
  return order;
}
function discoverRoots() {
  return discoverRootsWithFamilies().map((r2) => r2.dir);
}
function isMidSetComplete(statePath) {
  if (!fs6.existsSync(statePath))
    return false;
  let sd;
  try {
    sd = JSON.parse(fs6.readFileSync(statePath, "utf8"));
  } catch {
    return false;
  }
  if (sd === null || typeof sd !== "object" || Array.isArray(sd))
    return false;
  let stateForProgress = sd;
  if (sd.sessions === void 0 && (!Array.isArray(sd.completedSessions) || sd.completedSessions.length === 0)) {
    const eventsPath = path6.join(path6.dirname(statePath), "session-events.jsonl");
    const ledgerSessions = readClosedSessionsFromLedger(eventsPath);
    if (ledgerSessions.length > 0) {
      stateForProgress = { ...sd, completedSessions: ledgerSessions };
    }
  }
  const specPath = path6.join(path6.dirname(statePath), "spec.md");
  try {
    readProgress(stateForProgress, specPath);
    return false;
  } catch (e) {
    if (e instanceof SessionStateInvariantError) {
      return true;
    }
    return false;
  }
}
function readClosedSessionsFromLedger(eventsPath) {
  if (!fs6.existsSync(eventsPath))
    return [];
  let text;
  try {
    text = fs6.readFileSync(eventsPath, "utf8");
  } catch {
    return [];
  }
  const seen = /* @__PURE__ */ new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line)
      continue;
    try {
      const event = JSON.parse(line);
      if (event.event_type === "closeout_succeeded" && typeof event.session_number === "number" && Number.isInteger(event.session_number) && event.session_number > 0) {
        seen.add(event.session_number);
      }
    } catch {
    }
  }
  return [...seen].sort((a, b2) => a - b2);
}
function countDistinctCloseoutSessions(eventsPath) {
  if (!fs6.existsSync(eventsPath))
    return 0;
  let text;
  try {
    text = fs6.readFileSync(eventsPath, "utf8");
  } catch {
    return 0;
  }
  const seen = /* @__PURE__ */ new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line)
      continue;
    try {
      const event = JSON.parse(line);
      if (event.event_type === "closeout_succeeded" && Number.isInteger(event.session_number) && event.session_number > 0) {
        seen.add(event.session_number);
      }
    } catch {
    }
  }
  return seen.size;
}
var _SESSION_STATUSES = /* @__PURE__ */ new Set([
  "not-started",
  "in-progress",
  "complete",
  "cancelled"
]);
function normalizeLedgerSessions(raw) {
  if (!Array.isArray(raw))
    return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object")
      continue;
    const e = entry;
    if (typeof e.number !== "number" || !Number.isInteger(e.number))
      continue;
    if (e.number < 1)
      continue;
    if (seen.has(e.number))
      continue;
    if (typeof e.status !== "string" || !_SESSION_STATUSES.has(e.status))
      continue;
    const rawTitle = typeof e.title === "string" ? e.title.trim() : "";
    seen.add(e.number);
    out.push({
      number: e.number,
      // Trimmed, not just trim-TESTED: a whitespace-padded ledger title
      // would otherwise render with the padding intact.
      title: rawTitle.length > 0 ? rawTitle : `Session ${e.number}`,
      status: e.status
    });
  }
  return out;
}
function parseSessionSetConfig(specPath) {
  const config = {
    requiresUAT: false,
    requiresE2E: false,
    uatScope: "none",
    module: null
  };
  if (!fs6.existsSync(specPath))
    return config;
  let text;
  try {
    text = fs6.readFileSync(specPath, "utf8");
  } catch {
    return config;
  }
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i
  );
  const block = headingMatch ? headingMatch[1] : text;
  const triStateRe = (key) => new RegExp(
    `^\\s*${key}\\s*:\\s*(?:"(suggested)"|(true|false|suggested))\\s*(?:#.*)?$`,
    "im"
  );
  const stringRe = (key) => new RegExp(
    `^\\s*${key}\\s*:\\s*(?:"([\\w-]+)"|'([\\w-]+)'|([\\w-]+))\\s*(?:#.*)?$`,
    "im"
  );
  const stringValue = (m) => m ? m[1] ?? m[2] ?? m[3] ?? null : null;
  const parseTriState = (m) => {
    if (!m)
      return null;
    const raw = (m[1] ?? m[2] ?? "").toLowerCase();
    if (raw === "true")
      return true;
    if (raw === "false")
      return false;
    if (raw === "suggested")
      return "suggested";
    return null;
  };
  const uat = parseTriState(block.match(triStateRe("requiresUAT")));
  if (uat !== null)
    config.requiresUAT = uat;
  const e2e = parseTriState(block.match(triStateRe("requiresE2E")));
  if (e2e !== null)
    config.requiresE2E = e2e;
  const scope = stringValue(block.match(stringRe("uatScope")));
  if (scope)
    config.uatScope = scope;
  const mod = stringValue(block.match(stringRe("module")));
  if (mod)
    config.module = mod;
  const kd = stringValue(block.match(stringRe("kind")));
  if (kd)
    config.kind = kd;
  return config;
}
function parsePrerequisites(specPath) {
  if (!fs6.existsSync(specPath))
    return null;
  let text;
  try {
    text = fs6.readFileSync(specPath, "utf8");
  } catch {
    return null;
  }
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i
  );
  const block = headingMatch ? headingMatch[1] : text;
  const keyRe = /^\s*prerequisites\s*:(.*)$/im;
  const keyMatch = block.match(keyRe);
  if (!keyMatch)
    return null;
  const inlineRest = keyMatch[1].trim();
  if (inlineRest === "[]")
    return [];
  const keyIndex = block.search(keyRe);
  if (keyIndex < 0)
    return null;
  const after = block.slice(keyIndex + keyMatch[0].length);
  const lines = after.split(/\r?\n/);
  const bodyLines = [];
  for (const line of lines) {
    if (line.trim() === "") {
      bodyLines.push(line);
      continue;
    }
    if (!/^\s/.test(line))
      break;
    bodyLines.push(line);
  }
  const body = bodyLines.join("\n");
  const chunks = body.split(/\r?\n[ \t]*-[ \t]+/);
  const out = [];
  const stripComment = (s) => s.replace(/\s+#.*$/, "").trim();
  for (const chunk of chunks.slice(1)) {
    const slugLineMatch = chunk.match(/^\s*slug\s*:\s*(.+)$/im);
    if (!slugLineMatch)
      continue;
    const slug = stripComment(slugLineMatch[1]);
    if (!slug)
      continue;
    const condLineMatch = chunk.match(/^\s*condition\s*:\s*(.*)$/im);
    let condition;
    if (condLineMatch) {
      const raw = stripComment(condLineMatch[1]);
      if (raw === "complete") {
        condition = "complete";
      } else {
        continue;
      }
    } else {
      condition = "complete";
    }
    out.push({ slug, condition });
  }
  return out;
}
function readModulesManifest(root) {
  const manifestPath = path6.join(root, MODULES_MANIFEST_REL);
  let text;
  try {
    text = fs6.readFileSync(manifestPath, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      let entryExists = false;
      try {
        fs6.lstatSync(manifestPath);
        entryExists = true;
      } catch {
      }
      if (!entryExists)
        return null;
    }
    console.warn(
      `[dabblerSessionSets] ${manifestPath} exists but could not be read (${e instanceof Error ? e.message : String(e)}) \u2014 falling back to the single implicit module.`
    );
    return null;
  }
  let doc;
  try {
    doc = YAML.parse(text);
  } catch {
    console.warn(
      `[dabblerSessionSets] ${manifestPath} is not valid YAML \u2014 falling back to the single implicit module.`
    );
    return null;
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    console.warn(
      `[dabblerSessionSets] ${manifestPath} is not a YAML mapping \u2014 falling back to the single implicit module.`
    );
    return null;
  }
  const rawModules = doc.modules;
  if (rawModules === null)
    return [];
  if (!Array.isArray(rawModules)) {
    console.warn(
      `[dabblerSessionSets] ${manifestPath} has no "modules:" list \u2014 falling back to the single implicit module.`
    );
    return null;
  }
  const stringList = (v) => Array.isArray(v) ? v.filter((x2) => typeof x2 === "string" && x2.trim() !== "").map((s) => s.trim()) : [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of rawModules) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
      continue;
    const obj = raw;
    const slug = typeof obj.slug === "string" ? obj.slug.trim() : "";
    if (!slug)
      continue;
    if (seen.has(slug)) {
      console.warn(
        `[dabblerSessionSets] duplicate module slug "${slug}" in ${manifestPath} \u2014 keeping the first entry.`
      );
      continue;
    }
    seen.add(slug);
    const title = typeof obj.title === "string" && obj.title.trim() !== "" ? obj.title.trim() : slug;
    const planPath = typeof obj.planPath === "string" && obj.planPath.trim() !== "" ? obj.planPath.trim() : null;
    out.push({
      slug,
      title,
      codeRoots: stringList(obj.codeRoots),
      planPath,
      touches: stringList(obj.touches)
    });
  }
  return out;
}
function parseUatChecklist(checklistPath) {
  if (!fs6.existsSync(checklistPath))
    return null;
  let data;
  try {
    data = JSON.parse(fs6.readFileSync(checklistPath, "utf8"));
  } catch {
    return null;
  }
  const items = [];
  const collect = (node) => {
    if (!node || typeof node !== "object")
      return;
    if (Array.isArray(node)) {
      for (const v of node)
        collect(v);
      return;
    }
    const obj = node;
    if (obj["Result"] !== void 0 || obj["result"] !== void 0) {
      items.push(obj);
    }
    for (const v of Object.values(obj))
      collect(v);
  };
  collect(data);
  const e2eRefs = /* @__PURE__ */ new Set();
  let pending = 0;
  for (const it of items) {
    const r2 = it["Result"] ?? it["result"] ?? "";
    if (r2 === "" || /^pending$/i.test(String(r2)))
      pending++;
    const ref = it["E2ETestReference"] || it["e2eTestReference"];
    if (ref)
      e2eRefs.add(String(ref));
  }
  return { totalItems: items.length, pendingItems: pending, e2eRefs: Array.from(e2eRefs) };
}
function buildStepLedger(state, currentSession, entries, specPath, sessionState) {
  if (state !== "in-progress")
    return null;
  if (currentSession === null || !Array.isArray(entries))
    return null;
  const mine = entries.filter(
    (entry) => entry && typeof entry === "object" && !Array.isArray(entry) && entry.sessionNumber === currentSession
  );
  if (mine.length === 0)
    return null;
  let specSteps = [];
  try {
    specSteps = parseSpecSteps(fs6.readFileSync(specPath, "utf8"), currentSession);
  } catch {
  }
  return {
    sessionNumber: currentSession,
    entries: mine.map((e) => ({
      sessionNumber: e.sessionNumber,
      stepNumber: e.stepNumber,
      stepKey: e.stepKey,
      description: e.description,
      status: e.status,
      kind: e.kind,
      dateTime: e.dateTime
    })),
    specSteps,
    flight: sessionFlightFacts(sessionState, currentSession)
  };
}
var CLOSE_OBLIGATIONS_REL = path6.join(
  ".dabbler",
  "close-obligations.json"
);
var CLOSE_OBLIGATIONS_SCHEMA_VERSION = 1;
function digestSetDirectory(dir) {
  const digests = {};
  let names;
  try {
    names = fs6.readdirSync(dir);
  } catch {
    return digests;
  }
  for (const name of names) {
    const full = path6.join(dir, name);
    try {
      if (!fs6.statSync(full).isFile())
        continue;
    } catch {
      continue;
    }
    try {
      digests[name] = crypto.createHash("sha256").update(fs6.readFileSync(full)).digest("hex");
    } catch {
      digests[name] = null;
    }
  }
  return digests;
}
function projectionIsFresh(recorded, live) {
  if (!recorded || typeof recorded !== "object" || Array.isArray(recorded)) {
    return false;
  }
  const was = recorded;
  const wasKeys = Object.keys(was);
  const liveKeys = Object.keys(live);
  if (wasKeys.length !== liveKeys.length)
    return false;
  for (const key of liveKeys) {
    if (!(key in was))
      return false;
    const before = was[key] === null ? null : String(was[key]);
    if (before !== live[key])
      return false;
  }
  return true;
}
function narrowObligation(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return null;
  const row = raw;
  if (typeof row.check !== "string" || !row.check)
    return null;
  return {
    check: row.check,
    met: row.met === true,
    // Unknown reads as BLOCKING, and unknown volatility reads as
    // volatile: both defaults answer a missing field with the claim that
    // costs the operator least if it is wrong. A row that silently
    // demoted itself to advisory is how a close-out list starts lying.
    blocking: row.blocking !== false,
    detail: typeof row.detail === "string" ? row.detail : "",
    action: typeof row.action === "string" ? row.action : "",
    cost_warning: typeof row.cost_warning === "string" ? row.cost_warning : "",
    volatile: row.volatile !== false
  };
}
function readCloseObligations(dir, state) {
  if (state !== "in-progress")
    return null;
  const empty = (s) => ({
    state: s,
    sessionNumber: null,
    verdict: null,
    generatedAt: null,
    obligations: []
  });
  const file = path6.join(dir, CLOSE_OBLIGATIONS_REL);
  let raw;
  try {
    raw = fs6.readFileSync(file, "utf8");
  } catch (err) {
    const code = err?.code;
    return empty(code === "ENOENT" ? "absent" : "unreadable");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty("unreadable");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return empty("unreadable");
  }
  const payload = parsed;
  const version = payload.schemaVersion;
  if (typeof version !== "number" || version > CLOSE_OBLIGATIONS_SCHEMA_VERSION) {
    return empty("unreadable");
  }
  const report = payload.report;
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return empty("unreadable");
  }
  const reportRecord = report;
  if (!Array.isArray(reportRecord.obligations))
    return empty("unreadable");
  const obligations = [];
  for (const row of reportRecord.obligations) {
    const narrowed = narrowObligation(row);
    if (narrowed === null)
      return empty("unreadable");
    obligations.push(narrowed);
  }
  return {
    state: projectionIsFresh(payload.inputs, digestSetDirectory(dir)) ? "fresh" : "stale",
    sessionNumber: typeof reportRecord.session_number === "number" ? reportRecord.session_number : null,
    verdict: typeof reportRecord.verdict === "string" ? reportRecord.verdict : null,
    generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : null,
    obligations
  };
}
function readSessionSets(root) {
  const sessionSetsDir = path6.join(root, SESSION_SETS_REL);
  if (!fs6.existsSync(sessionSetsDir))
    return [];
  const entries = fs6.readdirSync(sessionSetsDir, { withFileTypes: true });
  const sets = [];
  const modulesManifest = readModulesManifest(root);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_"))
      continue;
    const dir = path6.join(sessionSetsDir, entry.name);
    const specPath = path6.join(dir, "spec.md");
    if (!fs6.existsSync(specPath))
      continue;
    const activityPath = path6.join(dir, "activity-log.json");
    const changeLogPath = path6.join(dir, "change-log.md");
    const statePath = path6.join(dir, "session-state.json");
    const aiAssignmentPath = path6.join(dir, "ai-assignment.md");
    const uatChecklistPath = path6.join(dir, `${entry.name}-uat-checklist.json`);
    let state;
    let inferredState = null;
    const cancellation = readCancellationState(dir);
    if (cancellation === "cancelled") {
      state = "cancelled";
    } else if (cancellation === "unknown" && isCancelled(dir)) {
      console.warn(
        `[dabblerSessionSets] Cancellation detected via legacy file-presence fallback for ${dir} \u2014 session-state.json is missing or unparseable. Consider running ensure_state_file to repair.`
      );
      state = "cancelled";
    } else {
      if (!fs6.existsSync(statePath)) {
        inferredState = inferStateInMemory(dir);
        const raw = inferredState.status;
        state = typeof raw === "string" ? canonicalizeStatus(raw) : "not-started";
        if (state === "complete" && isMidSetComplete(statePath)) {
          state = "in-progress";
        }
      } else {
        const status = readStatus(dir);
        if (status === "complete") {
          state = isMidSetComplete(statePath) ? "in-progress" : "complete";
        } else if (status === "in-progress") {
          state = "in-progress";
        } else {
          state = "not-started";
        }
      }
    }
    let totalSessions = null;
    let sessionsCompleted = 0;
    let lastTouched = null;
    let liveSession = null;
    let needsMigration = false;
    let migrationTargetSchemaVersion = null;
    let ledgerSessions = null;
    let schemaVersionOnDisk = null;
    let rawStepEntries = null;
    let normalizedState = null;
    const eventsPath = path6.join(dir, "session-events.jsonl");
    if (fs6.existsSync(activityPath)) {
      try {
        const data = JSON.parse(fs6.readFileSync(activityPath, "utf8"));
        if (typeof data.totalSessions === "number")
          totalSessions = data.totalSessions;
        for (const e of data.entries ?? []) {
          if (e.dateTime && (!lastTouched || e.dateTime > lastTouched))
            lastTouched = e.dateTime;
        }
        if (state === "in-progress" && Array.isArray(data.entries)) {
          rawStepEntries = data.entries;
        }
      } catch {
      }
    }
    {
      try {
        const stateFileOnDisk = fs6.existsSync(statePath);
        const rawSd = stateFileOnDisk ? JSON.parse(fs6.readFileSync(statePath, "utf8")) : inferredState ?? inferStateInMemory(dir);
        if (rawSd && typeof rawSd === "object" && !Array.isArray(rawSd)) {
          const sv = rawSd.schemaVersion;
          schemaVersionOnDisk = typeof sv === "number" ? sv : null;
          if (typeof sv === "number" && sv >= 4) {
            needsMigration = false;
            migrationTargetSchemaVersion = null;
          } else if (sv === 3) {
            if (Array.isArray(rawSd.sessions)) {
              needsMigration = true;
              migrationTargetSchemaVersion = 4;
            } else {
              needsMigration = true;
              migrationTargetSchemaVersion = 3;
            }
          } else if (typeof sv !== "number" || sv < 3) {
            needsMigration = true;
            migrationTargetSchemaVersion = 3;
          }
        }
        let preNormalizeSd = rawSd;
        if (rawSd && typeof rawSd === "object" && !Array.isArray(rawSd) && rawSd.sessions === void 0 && (!Array.isArray(rawSd.completedSessions) || // noqa: D13 - v2-compat ledger-merge for synthesizer input
        rawSd.completedSessions.length === 0)) {
          const closedLedgerSessions = readClosedSessionsFromLedger(eventsPath);
          if (closedLedgerSessions.length > 0) {
            preNormalizeSd = { ...rawSd, completedSessions: closedLedgerSessions };
          }
        }
        const sd = normalizeToV4Shape(
          preNormalizeSd,
          specPath,
          // Set 115 S1: an in-memory synthesis already resolved its
          // titles from the one `spec.md` read it performed, so forbid a
          // second read here.
          inferredState !== null ? /* @__PURE__ */ new Map() : void 0
        );
        ledgerSessions = sd.sessions ?? null;
        normalizedState = stateFileOnDisk ? sd : null;
        let progressTotal = null;
        let progressCompleted = null;
        let progressCurrent = null;
        try {
          const view = readProgress(sd, specPath, /* @__PURE__ */ new Map());
          progressTotal = view.totalSessions;
          progressCompleted = [...view.completedSessions];
          progressCurrent = view.currentSession;
        } catch (e) {
          if (!(e instanceof SessionStateInvariantError)) {
            throw e;
          }
        }
        if (progressTotal !== null && progressTotal > 0) {
          totalSessions = progressTotal;
        }
        const stateTouched = sd.completedAt || sd.startedAt;
        if (stateTouched && (!lastTouched || stateTouched > lastTouched))
          lastTouched = stateTouched;
        liveSession = {
          currentSession: progressCurrent,
          status: sd.status ?? null,
          orchestrator: sd.orchestrator ?? null,
          startedAt: sd.startedAt ?? null,
          completedAt: sd.completedAt ?? null,
          verificationVerdict: sd.verificationVerdict ?? null,
          forceClosed: sd.forceClosed ?? null,
          completedSessions: progressCompleted
        };
        if (progressCompleted !== null) {
          sessionsCompleted = progressCompleted.length;
        } else {
          const ledgerCount = countDistinctCloseoutSessions(eventsPath);
          if (ledgerCount > 0) {
            sessionsCompleted = ledgerCount;
          } else if (state === "complete" && typeof totalSessions === "number") {
            sessionsCompleted = totalSessions;
          }
        }
      } catch {
      }
    }
    const config = parseSessionSetConfig(specPath);
    let module2 = null;
    let moduleTitle = null;
    let moduleOrder = null;
    if (config.module !== null && modulesManifest !== null) {
      const manifestIndex = modulesManifest.findIndex(
        (m) => m.slug === config.module
      );
      const manifestEntry = manifestIndex >= 0 ? modulesManifest[manifestIndex] : void 0;
      if (manifestEntry) {
        module2 = manifestEntry.slug;
        moduleTitle = manifestEntry.title;
        moduleOrder = manifestIndex;
      } else {
        console.warn(
          `[dabblerSessionSets] ${entry.name}: spec declares module: ${config.module}, which is not a slug in docs/modules.yaml \u2014 treating as the implicit module.`
        );
      }
    }
    let kind;
    if (config.kind !== void 0) {
      const v = config.kind.toLowerCase();
      if (v === "plan" || v === "decomposition") {
        kind = v;
      } else {
        console.warn(
          `[dabblerSessionSets] ${entry.name}: spec declares kind: ${config.kind}, which is not a known set kind (plan | decomposition) \u2014 treating as an ordinary work set.`
        );
      }
    }
    const uatSummary = config.requiresUAT ? parseUatChecklist(uatChecklistPath) : null;
    const prerequisites = parsePrerequisites(specPath);
    const stepLedger = buildStepLedger(
      state,
      liveSession?.currentSession ?? null,
      rawStepEntries,
      specPath,
      normalizedState
    );
    sets.push({
      name: entry.name,
      module: module2,
      moduleTitle,
      moduleOrder,
      kind,
      dir,
      specPath,
      activityPath,
      changeLogPath,
      statePath,
      aiAssignmentPath,
      uatChecklistPath,
      state,
      totalSessions,
      sessionsCompleted,
      lastTouched,
      liveSession,
      config,
      uatSummary,
      root,
      needsMigration,
      migrationTargetSchemaVersion,
      schemaVersionOnDisk,
      prerequisites,
      // Default false; the cross-reference pass below overwrites this
      // once every set's `state` is known so each prereq can resolve
      // against an up-to-date snapshot. Sets without declared
      // prerequisites stay at false in both passes.
      blockedByPrereqs: false,
      unsatisfiedPrereqs: [],
      // Set 110 S2: the fourth tree level's data, taken from the ledger
      // this scan already parsed — no extra read, no extra stat.
      sessions: normalizeLedgerSessions(ledgerSessions),
      // Set 114 S3: the fifth level's data. Null on every set that is not
      // in flight, and on an in-flight set whose activity log is absent,
      // unreadable, or silent about the current session.
      stepLedger,
      // Set 115 S4: the close-out obligations for the in-flight session.
      // Null on every set that is not in flight; a real state (including
      // `absent`) on the one that is.
      closeObligations: readCloseObligations(dir, state)
    });
  }
  deriveBlockedByPrereqs(sets);
  if (sets.length > 0) {
    const counts = sets.reduce(
      (acc, s) => {
        acc[s.state] = (acc[s.state] ?? 0) + 1;
        return acc;
      },
      {}
    );
    console.log(
      `[dabbler-ai-orchestration] readSessionSets(${path6.basename(root)}): ${sets.length} set(s) \u2014 complete=${counts.complete ?? 0}, in-progress=${counts["in-progress"] ?? 0}, not-started=${counts["not-started"] ?? 0}, cancelled=${counts.cancelled ?? 0}`
    );
  }
  return sets;
}
function deriveBlockedByPrereqs(sets) {
  const setsByName = /* @__PURE__ */ new Map();
  for (const s of sets)
    setsByName.set(s.name, s);
  for (const s of sets) {
    if (!s.prerequisites || s.prerequisites.length === 0) {
      s.blockedByPrereqs = false;
      s.unsatisfiedPrereqs = [];
      continue;
    }
    const unsatisfied = [];
    for (const prereq of s.prerequisites) {
      const target = setsByName.get(prereq.slug);
      if (!target) {
        unsatisfied.push({
          slug: prereq.slug,
          condition: prereq.condition,
          targetState: "unknown"
        });
        continue;
      }
      if (prereq.condition === "complete" && target.state !== "complete") {
        unsatisfied.push({
          slug: prereq.slug,
          condition: prereq.condition,
          targetState: target.state
        });
      }
    }
    s.blockedByPrereqs = unsatisfied.length > 0;
    s.unsatisfiedPrereqs = unsatisfied;
  }
}
function outranks(candidate, incumbent) {
  const candRank = STATE_RANK[candidate.state] ?? -1;
  const incRank = STATE_RANK[incumbent.state] ?? -1;
  if (candRank !== incRank)
    return candRank > incRank;
  return (candidate.lastTouched || "") > (incumbent.lastTouched || "");
}
var loggedCollisionSignatures = /* @__PURE__ */ new Set();
function readAllSessionSetsWithDiagnostics() {
  const byName = /* @__PURE__ */ new Map();
  for (const root of discoverRootsWithFamilies()) {
    for (const set of readSessionSets(root.dir)) {
      const relPath = path6.relative(root.dir, set.dir).split(path6.sep).join("/");
      const candidate = {
        set,
        familyId: root.familyId,
        identityKey: `${root.familyId}\0${relPath}`
      };
      const bucket = byName.get(set.name);
      if (bucket)
        bucket.push(candidate);
      else
        byName.set(set.name, [candidate]);
    }
  }
  const mergedList = [];
  const collisions = [];
  const currentSignatures = /* @__PURE__ */ new Set();
  for (const [name, candidates] of byName) {
    let winner = candidates[0];
    for (const c3 of candidates.slice(1)) {
      if (outranks(c3.set, winner.set))
        winner = c3;
    }
    const distinctIdentities = /* @__PURE__ */ new Map();
    for (const c3 of candidates) {
      const rep = distinctIdentities.get(c3.identityKey);
      if (!rep || outranks(c3.set, rep.set)) {
        distinctIdentities.set(c3.identityKey, c3);
      }
    }
    if (distinctIdentities.size > 1) {
      const representatives = Array.from(distinctIdentities.values());
      const conflictingDirs = representatives.map((c3) => c3.set.dir).sort();
      winner.set.duplicateNameError = {
        name,
        chosenDir: winner.set.dir,
        conflictingDirs
      };
      const collision = {
        name,
        chosenDir: winner.set.dir,
        conflictingDirs,
        candidates: representatives.map((c3) => ({
          dir: c3.set.dir,
          familyId: c3.familyId,
          state: c3.set.state,
          lastTouched: c3.set.lastTouched
        }))
      };
      collisions.push(collision);
      const signature = `${name}\0${conflictingDirs.join("|")}`;
      currentSignatures.add(signature);
      if (!loggedCollisionSignatures.has(signature)) {
        loggedCollisionSignatures.add(signature);
        console.error(
          `[dabblerSessionSets] DUPLICATE SESSION-SET NAME "${name}": ${conflictingDirs.length} different sets share this name (${conflictingDirs.join(", ")}). Session-set names must be globally unique across the workspace \u2014 rename one of them. Showing only ${winner.set.dir}; name-keyed actions resolve to that copy.`
        );
      }
    }
    mergedList.push(winner.set);
  }
  for (const sig of loggedCollisionSignatures) {
    if (!currentSignatures.has(sig))
      loggedCollisionSignatures.delete(sig);
  }
  deriveBlockedByPrereqs(mergedList);
  return { sets: mergedList, collisions };
}
function readAllSessionSets() {
  return readAllSessionSetsWithDiagnostics().sets;
}

// src/commands/openFile.ts
var vscode4 = __toESM(require("vscode"));
var fs7 = __toESM(require("fs"));
var path7 = __toESM(require("path"));

// src/providers/specSectionLocator.ts
function lineAt(text, offset) {
  let line = 0;
  for (let i2 = 0; i2 < offset && i2 < text.length; i2 += 1) {
    if (text[i2] === "\n")
      line += 1;
  }
  return line;
}
function locateSessionSection(specText, sessionNumber) {
  if (typeof specText !== "string" || specText === "")
    return null;
  if (!Number.isInteger(sessionNumber))
    return null;
  const body = stripFencedBlocks(specText);
  const heads = scanSessionHeads(body);
  const index = heads.findIndex((head) => head.number === sessionNumber);
  if (index === -1)
    return null;
  const originalLines = specText.split("\n");
  const lastLine = originalLines.length - 1;
  const startLine = Math.min(lineAt(body, heads[index].headStart), lastLine);
  let endLine = index + 1 < heads.length ? Math.max(lineAt(body, heads[index + 1].headStart) - 1, startLine) : lastLine;
  while (endLine > startLine && (originalLines[endLine] ?? "").trim() === "") {
    endLine -= 1;
  }
  return { startLine, endLine };
}

// src/commands/openFile.ts
function openIfExists(filePath, label, reveal) {
  if (!filePath || !fs7.existsSync(filePath)) {
    vscode4.window.showInformationMessage(
      `${label} does not exist yet: ${filePath ? path7.basename(filePath) : "<unknown>"}`
    );
    return;
  }
  const uri = vscode4.Uri.file(filePath);
  if (!reveal) {
    vscode4.commands.executeCommand("vscode.open", uri);
    return;
  }
  void revealSection(uri, reveal);
}
async function revealSection(uri, range) {
  try {
    const editor = await vscode4.window.showTextDocument(uri);
    const lastLine = Math.max(editor.document.lineCount - 1, 0);
    const start = new vscode4.Position(Math.min(range.startLine, lastLine), 0);
    const end = new vscode4.Position(Math.min(range.endLine, lastLine), 0);
    editor.selection = new vscode4.Selection(start, start);
    editor.revealRange(new vscode4.Range(start, end), vscode4.TextEditorRevealType.AtTop);
  } catch (err) {
    console.warn(`[Dabbler] reveal failed for ${uri.fsPath}; opening at the top`, err);
    vscode4.commands.executeCommand("vscode.open", uri);
  }
}
function sessionNumberOf(item) {
  if (item === null || typeof item !== "object")
    return void 0;
  const node = item;
  if (node.kind !== "session")
    return void 0;
  const number = node.session?.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) {
    return void 0;
  }
  return number;
}
function specSectionTargetFor(specPath, sessionNumber) {
  if (!specPath || sessionNumber === void 0)
    return void 0;
  let text;
  try {
    text = fs7.readFileSync(specPath, "utf-8");
  } catch {
    return void 0;
  }
  return locateSessionSection(text, sessionNumber) ?? void 0;
}
async function openPrerequisiteSpec(set) {
  const unsatisfied = set.unsatisfiedPrereqs ?? [];
  if (unsatisfied.length === 0) {
    vscode4.window.showInformationMessage(
      `"${set.name}" has no unsatisfied prerequisites.`
    );
    return;
  }
  const allSets = readAllSessionSets();
  const bySlug = new Map(allSets.map((s) => [s.name, s]));
  const openTarget = (p2) => {
    if (p2.targetState === "unknown") {
      vscode4.window.showInformationMessage(
        `Prerequisite "${p2.slug}" does not match any session set \u2014 check the slug in ${set.name}/spec.md.`
      );
      return;
    }
    openIfExists(bySlug.get(p2.slug)?.specPath, `Prerequisite spec (${p2.slug})`);
  };
  if (unsatisfied.length === 1) {
    openTarget(unsatisfied[0]);
    return;
  }
  const picked = await vscode4.window.showQuickPick(
    unsatisfied.map((p2) => ({
      label: p2.slug,
      description: p2.targetState === "unknown" ? "unknown set \u2014 check the slug" : p2.targetState.replace("-", " "),
      prereq: p2
    })),
    { placeHolder: `Prerequisites blocking "${set.name}"` }
  );
  if (picked)
    openTarget(picked.prereq);
}
function findPlaywrightTests(set) {
  const cfg = vscode4.workspace.getConfiguration("dabblerSessionSets");
  const testDirRel = cfg.get("e2e.testDirectory", PLAYWRIGHT_REL_DEFAULT) || PLAYWRIGHT_REL_DEFAULT;
  const playwrightDir = path7.join(set.root, testDirRel);
  if (!fs7.existsSync(playwrightDir))
    return [];
  const slugTokens = set.name.split("-").filter((s) => s.length >= 3);
  const testRefs = set.uatSummary?.e2eRefs ?? [];
  const candidates = /* @__PURE__ */ new Set();
  const walk = (dir, depth) => {
    if (depth > 4)
      return;
    let entries;
    try {
      entries = fs7.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p2 = path7.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "bin" || e.name === "obj" || e.name === "node_modules")
          continue;
        walk(p2, depth + 1);
        continue;
      }
      if (!/\.(cs|ts|js)$/.test(e.name))
        continue;
      const lowerName = e.name.toLowerCase();
      if (slugTokens.some((t2) => lowerName.includes(t2.toLowerCase()))) {
        candidates.add(p2);
        continue;
      }
      if (testRefs.length > 0) {
        try {
          const txt = fs7.readFileSync(p2, "utf8");
          for (const ref of testRefs) {
            const short = String(ref).split(".").pop();
            if (short && txt.includes(short)) {
              candidates.add(p2);
              break;
            }
          }
        } catch {
        }
      }
    }
  };
  walk(playwrightDir, 0);
  return Array.from(candidates).sort();
}
function registerOpenFileCommands(context) {
  context.subscriptions.push(
    // Set 115 S2: ONE `Open Spec`, two callers. A set row opens the file
    // at the top exactly as before; a session row (`kind: "session"`)
    // opens the same file positioned at its own `### Session N of M:`
    // block. Adding a parallel command would have meant a second place
    // for "which file is the spec" to be answered.
    vscode4.commands.registerCommand(
      "dabblerSessionSets.openSpec",
      (item) => openIfExists(
        item?.set?.specPath,
        "Spec",
        specSectionTargetFor(item?.set?.specPath, sessionNumberOf(item))
      )
    ),
    vscode4.commands.registerCommand(
      "dabblerSessionSets.openActivityLog",
      (item) => openIfExists(item?.set?.activityPath, "Activity log")
    ),
    vscode4.commands.registerCommand(
      "dabblerSessionSets.openChangeLog",
      (item) => openIfExists(item?.set?.changeLogPath, "Change log")
    ),
    // Set 048 S3 (operator-locked L3): `Open AI Assignment` is fully
    // removed. The `ai-assignment.md` file on disk continues to exist
    // for any consumer that reads it directly; the menu / palette
    // entry to open it does not.
    vscode4.commands.registerCommand(
      "dabblerSessionSets.openUatChecklist",
      (item) => openIfExists(item?.set?.uatChecklistPath, "UAT checklist")
    ),
    vscode4.commands.registerCommand(
      "dabblerSessionSets.openSessionState",
      (item) => openIfExists(item?.set?.statePath, "Session state")
    ),
    // Set 061 S2 (spec D3): blocked-marker companion. Tolerates a
    // bare Command Palette invocation (no row context) with an
    // informational no-op, matching the other openFile commands.
    vscode4.commands.registerCommand("dabblerSessionSets.openPrerequisiteSpec", (item) => {
      if (!item?.set) {
        vscode4.window.showInformationMessage(
          "Open Prerequisite Spec is available from a session-set row's context menu."
        );
        return;
      }
      void openPrerequisiteSpec(item.set);
    }),
    vscode4.commands.registerCommand("dabblerSessionSets.openFolder", (item) => {
      if (!item?.set)
        return;
      vscode4.commands.executeCommand("revealInExplorer", vscode4.Uri.file(item.set.dir));
    }),
    vscode4.commands.registerCommand(
      "dabblerSessionSets.revealPlaywrightTests",
      async (item) => {
        if (!item?.set)
          return;
        const tests = findPlaywrightTests(item.set);
        if (tests.length === 0) {
          const cfg = vscode4.workspace.getConfiguration("dabblerSessionSets");
          const dir = cfg.get("e2e.testDirectory", PLAYWRIGHT_REL_DEFAULT);
          vscode4.window.showInformationMessage(
            `No Playwright tests found for "${item.set.name}". Search root: ${dir}`
          );
          return;
        }
        if (tests.length === 1) {
          vscode4.commands.executeCommand("vscode.open", vscode4.Uri.file(tests[0]));
          return;
        }
        const picked = await vscode4.window.showQuickPick(
          tests.map((p2) => ({
            label: path7.basename(p2),
            description: path7.relative(item.set.root, p2),
            absolute: p2
          })),
          { placeHolder: `Playwright tests matching "${item.set.name}"` }
        );
        if (picked) {
          vscode4.commands.executeCommand("vscode.open", vscode4.Uri.file(picked.absolute));
        }
      }
    )
  );
}

// src/commands/copyCommand.ts
var vscode5 = __toESM(require("vscode"));
async function copy(text, label) {
  await vscode5.env.clipboard.writeText(text);
  vscode5.window.setStatusBarMessage(`Copied: ${label}`, 4e3);
}
var startCommandPresets = {
  default: (slug) => `Start the next session of \`${slug}\`.`,
  parallel: (slug) => `Start the next parallel session of \`${slug}\`.`
};
var presetLabels = {
  default: "start next session",
  parallel: "start next parallel session"
};
function registerCopyCommands(context) {
  for (const [key, builder] of Object.entries(startCommandPresets)) {
    context.subscriptions.push(
      vscode5.commands.registerCommand(
        `dabblerSessionSets.copyStartCommand.${key}`,
        async (item) => {
          if (!item?.set)
            return;
          await copy(builder(item.set.name), presetLabels[key]);
        }
      )
    );
  }
  context.subscriptions.push(
    vscode5.commands.registerCommand(
      "dabblerSessionSets.copySlug",
      async (item) => {
        if (!item?.set)
          return;
        await copy(item.set.name, "slug");
      }
    )
  );
}

// src/commands/copyPromptCommands.ts
var vscode7 = __toESM(require("vscode"));

// src/providers/rowMenuHelpers.ts
function planLeftClickActivation(setName, state) {
  const openCommand = { commandId: "dabblerSessionSets.openSpec", setName };
  if (state !== "in-progress" && state !== "not-started") {
    return { openCommand, clipboardWrite: null };
  }
  const sanitized = setName.replace(/`/g, "'");
  return {
    openCommand,
    clipboardWrite: {
      text: `Start the next session of \`${sanitized}\`.`,
      toast: `Copied: Start the next session of ${setName}`
    }
  };
}
function nextRunnableSessionNumber(sessions) {
  const ordered = [...sessions ?? []].sort((a, b2) => a.number - b2.number);
  let expected = 1;
  for (const session of ordered) {
    if (session.number !== expected)
      return null;
    expected += 1;
    if (session.status === "complete" || session.status === "cancelled")
      continue;
    if (session.status === "in-progress" || session.status === "not-started") {
      return session.number;
    }
    return null;
  }
  return null;
}
function sessionOffersRunPrompt(set, session) {
  if (planLeftClickActivation(set.name, set.state).clipboardWrite === null) {
    return false;
  }
  return nextRunnableSessionNumber(set.sessions) === session.number;
}

// src/commands/workExplorerTreeCommands.ts
var vscode6 = __toESM(require("vscode"));
function asSetNode(arg) {
  if (arg === null || typeof arg !== "object")
    return void 0;
  const node = arg;
  return node.kind === "set" && node.set ? node : void 0;
}
function asSessionNode(arg) {
  if (arg === null || typeof arg !== "object")
    return void 0;
  const node = arg;
  return node.kind === "session" && node.set && node.session ? node : void 0;
}
async function activateSetRow(arg) {
  const node = asSetNode(arg);
  if (!node)
    return;
  const plan = planLeftClickActivation(node.set.name, node.set.state);
  await vscode6.commands.executeCommand(plan.openCommand.commandId, node);
  if (!plan.clipboardWrite)
    return;
  try {
    await vscode6.env.clipboard.writeText(plan.clipboardWrite.text);
    vscode6.window.showInformationMessage(plan.clipboardWrite.toast);
  } catch (err) {
    console.warn(
      `[WorkExplorerTree] left-click clipboard write failed for "${node.set.name}"`,
      err
    );
  }
}
async function activateSessionRow(arg) {
  const node = asSessionNode(arg);
  if (!node)
    return;
  await vscode6.commands.executeCommand("dabblerSessionSets.openSpec", node);
}
function registerWorkExplorerTreeCommands(context) {
  context.subscriptions.push(
    vscode6.commands.registerCommand(
      "dabblerWorkExplorer.activateSet",
      (arg) => activateSetRow(arg)
    ),
    vscode6.commands.registerCommand(
      "dabblerWorkExplorer.activateSession",
      (arg) => activateSessionRow(arg)
    )
  );
}

// src/utils/consumerBootstrap.ts
var fs8 = __toESM(require("fs"));
var path8 = __toESM(require("path"));
var BUNDLE_FILES = {
  specTemplate: "spec.md.template",
  sessionStateTemplate: "session-state.json.template",
  startHereTemplate: "start-here.md.template",
  gettingStartedTemplate: "getting-started.md.template",
  sharedBody: "engine-file.shared-body.md",
  claudeTail: "engine-file.claude-tail.md",
  agentsTail: "engine-file.agents-tail.md",
  geminiTail: "engine-file.gemini-tail.md",
  lessonsLearnedTemplate: "lessons-learned.md.template",
  projectGuidanceTemplate: "project-guidance.md.template",
  lessonsArchiveTemplate: "lessons-archive.md.template",
  crossProviderVerificationTemplate: "cross-provider-verification.md.template",
  codeownersTemplate: "CODEOWNERS.template",
  monorepoCiTemplate: "monorepo-ci.yml.template",
  azurePipelinesTemplate: "azure-pipelines.yml.template"
};
var GETTING_STARTED_TEMPLATE_FILENAME = BUNDLE_FILES.gettingStartedTemplate;
function resolveBundledTemplateDir(extensionPath) {
  return path8.join(extensionPath, "dist", "templates", "consumer-bootstrap");
}
function loadTemplateBundle(bundleDir) {
  const read = (name) => fs8.readFileSync(path8.join(bundleDir, name), "utf8").replace(/\r\n/g, "\n");
  return {
    specTemplate: read(BUNDLE_FILES.specTemplate),
    sessionStateTemplate: read(BUNDLE_FILES.sessionStateTemplate),
    startHereTemplate: read(BUNDLE_FILES.startHereTemplate),
    gettingStartedTemplate: read(BUNDLE_FILES.gettingStartedTemplate),
    sharedBody: read(BUNDLE_FILES.sharedBody),
    claudeTail: read(BUNDLE_FILES.claudeTail),
    agentsTail: read(BUNDLE_FILES.agentsTail),
    geminiTail: read(BUNDLE_FILES.geminiTail),
    lessonsLearnedTemplate: read(BUNDLE_FILES.lessonsLearnedTemplate),
    projectGuidanceTemplate: read(BUNDLE_FILES.projectGuidanceTemplate),
    lessonsArchiveTemplate: read(BUNDLE_FILES.lessonsArchiveTemplate),
    crossProviderVerificationTemplate: read(
      BUNDLE_FILES.crossProviderVerificationTemplate
    ),
    codeownersTemplate: read(BUNDLE_FILES.codeownersTemplate),
    monorepoCiTemplate: read(BUNDLE_FILES.monorepoCiTemplate),
    azurePipelinesTemplate: read(BUNDLE_FILES.azurePipelinesTemplate)
  };
}
function padSessionNumber(n) {
  return String(n).padStart(3, "0");
}
function assertPositiveSessionCount(totalSessions) {
  if (!Number.isInteger(totalSessions) || totalSessions < 1) {
    throw new Error(
      `consumer-bootstrap: totalSessions must be a positive integer, got ${totalSessions}`
    );
  }
}
function moduleLine(ctx) {
  if (!ctx.module)
    return "";
  return `module: ${ctx.module}                      # grouping only \u2014 set names stay globally unique
`;
}
function tokenTable(ctx) {
  return {
    REPO_NAME: ctx.repoName,
    SET_TITLE: ctx.setTitle,
    PURPOSE: ctx.purpose,
    SLUG: ctx.slug,
    CREATED: ctx.created,
    MODULE_LINE: moduleLine(ctx),
    TOTAL_SESSIONS: String(ctx.totalSessions)
  };
}
function substituteTokens(text, ctx) {
  const table = tokenTable(ctx);
  return text.replace(
    /{{([A-Z_]+)}}/g,
    (whole, key) => Object.prototype.hasOwnProperty.call(table, key) ? table[key] : whole
  );
}
function findUnsubstitutedTokens(rendered) {
  const out = /* @__PURE__ */ new Set();
  for (const m of rendered.matchAll(/{{[A-Z_]+}}/g))
    out.add(m[0]);
  return [...out];
}
function expandSpecSessions(specText, totalSessions) {
  assertPositiveSessionCount(totalSessions);
  specText = specText.replace(/\r\n/g, "\n");
  const SESSIONS_HEADER = "## Sessions\n";
  const DELIVERABLES_HEADER = "## End-of-set deliverables";
  const SEP = "\n\n---\n\n";
  const headerIdx = specText.indexOf(SESSIONS_HEADER);
  const deliverablesIdx = specText.indexOf(DELIVERABLES_HEADER);
  if (headerIdx === -1 || deliverablesIdx === -1 || deliverablesIdx < headerIdx) {
    return specText;
  }
  const preamble = specText.slice(0, headerIdx + SESSIONS_HEADER.length);
  const postamble = specText.slice(deliverablesIdx);
  const region = specText.slice(headerIdx + SESSIONS_HEADER.length, deliverablesIdx);
  const blockStart = region.indexOf("### Session 1 of");
  if (blockStart === -1)
    return specText;
  const afterStart = region.slice(blockStart);
  const sepIdx = afterStart.indexOf(SEP);
  const unit = (sepIdx === -1 ? afterStart : afterStart.slice(0, sepIdx)).trimEnd();
  const blocks = [];
  for (let k2 = 1; k2 <= totalSessions; k2++) {
    let block = unit.replace("### Session 1 of", `### Session ${k2} of`);
    block = block.replace(/session-001\//g, `session-${padSessionNumber(k2)}/`);
    blocks.push(block);
  }
  return `${preamble}
${blocks.join(SEP)}${SEP}${postamble}`;
}
function expandSessionState(stateText, totalSessions) {
  assertPositiveSessionCount(totalSessions);
  const parsed = JSON.parse(stateText);
  const unit = parsed.sessions[0];
  parsed.sessions = [];
  for (let k2 = 1; k2 <= totalSessions; k2++) {
    parsed.sessions.push({
      ...unit,
      number: k2,
      title: `Session ${k2}`,
      status: "not-started",
      startedAt: null,
      completedAt: null,
      orchestrator: null,
      verificationVerdict: null
    });
  }
  return JSON.stringify(parsed, null, 2) + "\n";
}
function renderEngineFile(sharedBody, tail, ctx) {
  return substituteTokens(sharedBody, ctx) + "\n" + substituteTokens(tail, ctx);
}
function renderSpec(bundle, ctx) {
  return expandSpecSessions(
    substituteTokens(bundle.specTemplate, ctx),
    ctx.totalSessions
  );
}
function renderSessionState(bundle, ctx) {
  return expandSessionState(
    substituteTokens(bundle.sessionStateTemplate, ctx),
    ctx.totalSessions
  );
}
function renderStartHere(bundle, ctx) {
  return substituteTokens(bundle.startHereTemplate, ctx);
}
function specRelPath(ctx) {
  return path8.posix.join("docs", "session-sets", ctx.slug, "spec.md");
}
function sessionStateRelPath(ctx) {
  return path8.posix.join("docs", "session-sets", ctx.slug, "session-state.json");
}
var START_HERE_REL_PATH = path8.posix.join("docs", "dabbler", "start-here.md");
var GETTING_STARTED_REL_PATH = path8.posix.join(
  "docs",
  "dabbler",
  "getting-started.md"
);
var CROSS_PROVIDER_VERIFICATION_REL_PATH = path8.posix.join(
  "docs",
  "dabbler",
  "cross-provider-verification.md"
);
function renderCrossProviderVerification(bundle, ctx) {
  return substituteTokens(bundle.crossProviderVerificationTemplate, ctx);
}
var LESSONS_LEARNED_REL_PATH = path8.posix.join("docs", "planning", "lessons-learned.md");
var PROJECT_GUIDANCE_REL_PATH = path8.posix.join("docs", "planning", "project-guidance.md");
var LESSONS_ARCHIVE_REL_PATH = path8.posix.join("docs", "planning", "lessons-archive.md");
var CODEOWNERS_REL_PATH = path8.posix.join(".github", "CODEOWNERS");
var MONOREPO_CI_REL_PATH = path8.posix.join(
  ".github",
  "workflows",
  "monorepo-ci.yml"
);
var AZURE_PIPELINES_REL_PATH = "azure-pipelines.yml";
function guidanceFiles(bundle, ctx) {
  return {
    [LESSONS_LEARNED_REL_PATH]: substituteTokens(bundle.lessonsLearnedTemplate, ctx),
    [PROJECT_GUIDANCE_REL_PATH]: substituteTokens(bundle.projectGuidanceTemplate, ctx),
    [LESSONS_ARCHIVE_REL_PATH]: substituteTokens(bundle.lessonsArchiveTemplate, ctx)
  };
}
function renderConsumerBootstrap(bundle, ctx) {
  const files = {
    "CLAUDE.md": renderEngineFile(bundle.sharedBody, bundle.claudeTail, ctx),
    "AGENTS.md": renderEngineFile(bundle.sharedBody, bundle.agentsTail, ctx),
    "GEMINI.md": renderEngineFile(bundle.sharedBody, bundle.geminiTail, ctx),
    [START_HERE_REL_PATH]: renderStartHere(bundle, ctx),
    [GETTING_STARTED_REL_PATH]: bundle.gettingStartedTemplate,
    // Set 077 S4 (Feature 3): the engine-facing verification doc the
    // Evaluate pointer prompts reference.
    [CROSS_PROVIDER_VERIFICATION_REL_PATH]: renderCrossProviderVerification(
      bundle,
      ctx
    ),
    [specRelPath(ctx)]: renderSpec(bundle, ctx),
    [sessionStateRelPath(ctx)]: renderSessionState(bundle, ctx),
    // Set 064 (D7): the guidance-lifecycle starters under docs/planning/.
    ...guidanceFiles(bundle, ctx),
    // Set 087 S3 (ruling Q3): the module-ownership + monorepo-CI teaching
    // templates (token-free; inert until adapted).
    [CODEOWNERS_REL_PATH]: bundle.codeownersTemplate,
    [MONOREPO_CI_REL_PATH]: bundle.monorepoCiTemplate,
    // Set 107 S1: the ADO half of the same teaching pair.
    [AZURE_PIPELINES_REL_PATH]: bundle.azurePipelinesTemplate
  };
  const leftovers = /* @__PURE__ */ new Set();
  for (const content of Object.values(files)) {
    for (const t2 of findUnsubstitutedTokens(content))
      leftovers.add(t2);
  }
  if (leftovers.size > 0) {
    throw new Error(
      `consumer-bootstrap render left unsubstituted token(s): ${[...leftovers].sort().join(", ")}`
    );
  }
  return { files };
}
function renderStructureBootstrap(bundle, ctx) {
  const files = {
    "CLAUDE.md": renderEngineFile(bundle.sharedBody, bundle.claudeTail, ctx),
    "AGENTS.md": renderEngineFile(bundle.sharedBody, bundle.agentsTail, ctx),
    "GEMINI.md": renderEngineFile(bundle.sharedBody, bundle.geminiTail, ctx),
    [START_HERE_REL_PATH]: renderStartHere(bundle, ctx),
    // D8 (Set 060 S3): the static Getting Started teaching doc ships
    // with the structure scaffold too, so the editor-open path can
    // prefer the workspace copy once the structure is built.
    [GETTING_STARTED_REL_PATH]: bundle.gettingStartedTemplate,
    // Set 077 S4 (Feature 3): the verification instruction doc is repo
    // structure — the Lightweight review flow depends on it.
    [CROSS_PROVIDER_VERIFICATION_REL_PATH]: renderCrossProviderVerification(
      bundle,
      ctx
    ),
    // Set 064 (D7): the guidance-lifecycle starters are repo structure too,
    // so a fresh repo built via "Build project structure" starts the
    // lifecycle with docs/planning/ in place.
    ...guidanceFiles(bundle, ctx),
    // Set 087 S3 (ruling Q3): the ownership + CI teaching templates are
    // repo structure too — a new project starts with them in place.
    [CODEOWNERS_REL_PATH]: bundle.codeownersTemplate,
    [MONOREPO_CI_REL_PATH]: bundle.monorepoCiTemplate,
    // Set 107 S1: the ADO half of the same teaching pair.
    [AZURE_PIPELINES_REL_PATH]: bundle.azurePipelinesTemplate
  };
  const leftovers = /* @__PURE__ */ new Set();
  for (const content of Object.values(files)) {
    for (const t2 of findUnsubstitutedTokens(content))
      leftovers.add(t2);
  }
  if (leftovers.size > 0) {
    throw new Error(
      `structure-only bootstrap render left unsubstituted token(s): ${[...leftovers].sort().join(", ")}`
    );
  }
  return { files };
}
function structureOnlyContext(repoName, created) {
  return {
    repoName,
    setTitle: "(no starter set \u2014 created via the Getting Started decomposition prompt)",
    purpose: "(no starter set)",
    slug: "000-placeholder-unused",
    created,
    totalSessions: 1
  };
}

// src/commands/copyPromptCommands.ts
function sanitizeSlugForPrompt(slug) {
  return slug.replace(/`/g, "'");
}
function buildStartNextSessionPrompt(set) {
  return `Start the next session of \`${sanitizeSlugForPrompt(set.name)}\`.`;
}
function planSessionRunPrompt(set, session) {
  if (!sessionOffersRunPrompt(set, session))
    return null;
  return {
    text: buildStartNextSessionPrompt(set),
    toast: `Copied: Start session ${session.number} of ${set.name}`
  };
}
async function copyToClipboard(text, statusMessage) {
  try {
    await vscode7.env.clipboard.writeText(text);
    vscode7.window.setStatusBarMessage(statusMessage, 4e3);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    vscode7.window.showWarningMessage(`Failed to copy to clipboard: ${detail}`);
  }
}
function registerCopyPromptCommands(context) {
  context.subscriptions.push(
    vscode7.commands.registerCommand(
      "dabbler.copyStartNextSessionPrompt",
      async (item) => {
        if (!item?.set)
          return;
        const prompt = buildStartNextSessionPrompt(item.set);
        await copyToClipboard(
          prompt,
          `Copied: Start the next session of ${item.set.name}`
        );
      }
    ),
    // Set 115 S3: the session row's sibling. It re-checks the gate on
    // dispatch rather than trusting the menu — `contextValue` is computed
    // at render time, so a row that has been on screen since before a
    // session closed would otherwise still copy a prompt for a set that
    // has moved on. A refused invocation is silent: the entry the
    // operator clicked simply should not have been there.
    vscode7.commands.registerCommand(
      "dabbler.copySessionRunPrompt",
      async (arg) => {
        const node = asSessionNode(arg);
        if (!node)
          return;
        const plan = planSessionRunPrompt(node.set, node.session);
        if (!plan)
          return;
        await copyToClipboard(plan.text, plan.toast);
      }
    )
  );
}

// src/commands/gitScaffold.ts
var vscode12 = __toESM(require("vscode"));
var cp4 = __toESM(require("child_process"));
var os3 = __toESM(require("os"));
var path16 = __toESM(require("path"));

// node_modules/simple-git/dist/esm/index.js
var import_file_exists = __toESM(require_dist2(), 1);

// node_modules/@simple-git/args-pathspec/dist/index.mjs
var t = /* @__PURE__ */ new WeakMap();
function c(...n) {
  const e = new String(n);
  return t.set(e, n), e;
}
function r(n) {
  return n instanceof String && t.has(n);
}
function o(n) {
  return t.get(n) ?? [];
}

// node_modules/simple-git/dist/esm/index.js
var import_debug = __toESM(require_src(), 1);
var import_child_process = require("child_process");
var import_promise_deferred = __toESM(require_dist3(), 1);
var import_node_path = require("node:path");

// node_modules/@simple-git/argv-parser/dist/index.mjs
function* U(e, t2) {
  const n = t2 === "global";
  for (const o2 of e)
    o2.isGlobal === n && (yield o2);
}
var k = /* @__PURE__ */ new Set([
  "--add",
  "--edit",
  "--remove-section",
  "--rename-section",
  "--replace-all",
  "--unset",
  "--unset-all",
  "-e"
]);
var S = /* @__PURE__ */ new Set([
  "--get",
  "--get-all",
  "--get-color",
  "--get-colorbool",
  "--get-regexp",
  "--get-urlmatch",
  "--list",
  "-l"
]);
var P = /* @__PURE__ */ new Set([
  "edit",
  "remove-section",
  "rename-section",
  "set",
  "unset"
]);
var E = /* @__PURE__ */ new Set(["get", "get-color", "get-colorbool", "list"]);
function F(e, t2) {
  for (const { name: o2 } of U(e, "task")) {
    if (k.has(o2))
      return p(true, t2);
    if (S.has(o2))
      return p(false, t2);
  }
  const n = t2.at(0)?.toLowerCase();
  return n === void 0 ? null : P.has(n) ? p(true, t2.slice(1)) : E.has(n) ? p(false, t2.slice(1)) : t2.length === 1 ? p(false, t2) : p(true, t2);
}
function p(e = false, t2 = []) {
  const n = t2.at(0)?.toLowerCase();
  return n === void 0 ? null : {
    isWrite: e,
    isRead: !e,
    key: n,
    value: t2.at(1)
  };
}
function A(e, t2) {
  return t2.isWrite && t2.value !== void 0 ? { key: t2.key, value: t2.value, scope: e } : { key: t2.key, scope: e };
}
function M(e) {
  const t2 = e?.indexOf("=") || -1;
  return !e || t2 < 0 ? null : {
    key: e.slice(0, t2).trim().toLowerCase(),
    value: e.slice(t2 + 1)
  };
}
function N(e) {
  for (const { name: t2 } of U(e, "task"))
    switch (t2) {
      case "--global":
        return "global";
      case "--system":
        return "system";
      case "--worktree":
        return "worktree";
      case "--local":
        return "local";
      case "--file":
      case "-f":
        return "file";
    }
  return "local";
}
function G({ name: e }) {
  if (e === "-c" || e === "--config")
    return "inline";
  if (e === "--config-env")
    return "env";
}
function* O(e) {
  for (const t2 of e) {
    const n = G(t2), o2 = n && M(t2.value);
    o2 && (yield {
      ...o2,
      scope: n
    });
  }
}
function L(e, t2, n) {
  const o2 = {
    read: [],
    write: [...O(t2)]
  };
  return e === "config" && $(
    o2,
    N(t2),
    F(t2, n)
  ), o2;
}
function $(e, t2, n) {
  if (n === null)
    return;
  const o2 = A(t2, n);
  n.isWrite ? e.write.push(o2) : e.read.push(o2);
}
var x = {
  short: /* @__PURE__ */ new Map([
    ["c", true]
    //  -c <k=v>    set config key for this invocation
  ])
};
var D = {
  short: new Map([
    ["C", true],
    //  -C <path>   change working directory
    ["P", false],
    // -P          no pager (alias for --no-pager)
    ["h", false],
    // -h          help
    ["p", false],
    // -p          paginate
    ["v", false],
    // -v          version
    ...x.short.entries()
  ]),
  long: /* @__PURE__ */ new Set([
    "attr-source",
    "config-env",
    "exec-path",
    "git-dir",
    "list-cmds",
    "namespace",
    "super-prefix",
    "work-tree"
  ])
};
var R = {
  clone: {
    short: /* @__PURE__ */ new Map([
      ["b", true],
      // -b <branch>
      ["j", true],
      // -j <n>          parallel jobs
      ["l", false],
      // -l local
      ["n", false],
      // -n no-checkout
      ["o", true],
      // -o <name>       remote name
      ["q", false],
      // -q quiet
      ["s", false],
      // -s shared
      ["u", true]
      // -u <upload-pack>
    ]),
    long: /* @__PURE__ */ new Set(["branch", "config", "jobs", "origin", "upload-pack", "u", "template"])
  },
  commit: {
    short: /* @__PURE__ */ new Map([
      ["C", true],
      // -C <commit>  reuse message
      ["F", true],
      // -F <file>    read message from file
      ["c", true],
      // -c <commit>  reedit message
      ["m", true],
      // -m <msg>
      ["t", true]
      // -t <template>
    ]),
    long: /* @__PURE__ */ new Set(["file", "message", "reedit-message", "reuse-message", "template"])
  },
  config: {
    short: /* @__PURE__ */ new Map([
      ["e", false],
      // -e  open editor
      ["f", true],
      //  -f <file>
      ["l", false]
      // -l  list
    ]),
    long: /* @__PURE__ */ new Set(["blob", "comment", "default", "file", "type", "value"])
  },
  fetch: {
    short: /* @__PURE__ */ new Map(),
    long: /* @__PURE__ */ new Set(["upload-pack"])
  },
  init: {
    short: /* @__PURE__ */ new Map(),
    long: /* @__PURE__ */ new Set(["template"])
  },
  pull: {
    short: /* @__PURE__ */ new Map(),
    long: /* @__PURE__ */ new Set(["upload-pack"])
  },
  push: {
    short: /* @__PURE__ */ new Map(),
    long: /* @__PURE__ */ new Set(["exec", "receive-pack"])
  }
};
var T = { short: /* @__PURE__ */ new Map(), long: /* @__PURE__ */ new Set() };
function I(e) {
  const t2 = R[e ?? ""] ?? T;
  return {
    short: new Map([...x.short.entries(), ...t2.short.entries()]),
    long: t2.long
  };
}
function b(e, t2 = D) {
  if (e.startsWith("--")) {
    const n = e.indexOf("=");
    if (n > 2)
      return [{ name: e.slice(0, n), value: e.slice(n + 1), needsNext: false }];
    const o2 = e.slice(2);
    return [{ name: e, needsNext: t2.long.has(o2) }];
  }
  if (e.length === 2) {
    const n = e.charAt(1), o2 = t2.short.get(n);
    return [{ name: e, needsNext: o2 === true }];
  }
  return W(e, t2.short);
}
function W(e, t2) {
  const n = e.slice(1).split(""), o2 = [];
  for (let s = 0; s < n.length; s++) {
    const r2 = n[s], l = t2.get(r2);
    if (l === void 0)
      return [{ name: e, needsNext: false }];
    if (l) {
      const a = n.slice(s + 1).join("");
      if (a && ![...a].every((w) => t2.has(w)))
        return o2.push({ name: `-${r2}`, value: a, needsNext: false }), o2;
    }
    o2.push({ name: `-${r2}`, needsNext: l });
  }
  return o2;
}
function j(e, t2 = []) {
  let n = 0;
  for (; n < e.length; ) {
    const o2 = String(e[n]);
    if (!o2.startsWith("-") || o2.length < 2)
      break;
    const s = b(o2);
    let r2 = n + 1;
    for (const l of s) {
      const a = {
        name: l.name,
        value: l.value,
        absorbedNext: false,
        isGlobal: true
      };
      l.needsNext && a.value === void 0 && r2 < e.length && (a.value = String(e[r2]), a.absorbedNext = true, r2++), t2.push(a);
    }
    n = r2;
  }
  return { flags: t2, taskIndex: n };
}
function B(e, t2, n = []) {
  const o2 = I(t2), s = [], r2 = [];
  let l = 0;
  for (; l < e.length; ) {
    const a = e[l];
    if (r(a)) {
      r2.push(...o(a)), l++;
      continue;
    }
    const f = String(a);
    if (f === "--") {
      for (let g = l + 1; g < e.length; g++) {
        const u = e[g];
        r(u) ? r2.push(...o(u)) : r2.push(String(u));
      }
      break;
    }
    if (!f.startsWith("-") || f.length < 2) {
      s.push(f), l++;
      continue;
    }
    const w = b(f, o2);
    let d = l + 1;
    for (const g of w) {
      const u = {
        name: g.name,
        value: g.value,
        absorbedNext: false,
        isGlobal: false
      };
      g.needsNext && u.value === void 0 && d < e.length && !r(e[d]) && (u.value = String(e[d]), u.absorbedNext = true, d++), n.push(u);
    }
    l = d;
  }
  return { flags: n, positionals: s, pathspecs: r2 };
}
function* V({
  write: e
}) {
  for (const t2 of e)
    for (const n of q) {
      const o2 = n(t2.key);
      o2 && (yield o2);
    }
}
function c2(e, t2, n = String(e)) {
  const o2 = typeof e == "string" ? new RegExp(`\\s*${e.toLowerCase()}`) : e;
  return function(r2) {
    if (o2.test(r2))
      return {
        category: t2,
        message: `Configuring ${n} is not permitted without enabling ${t2}`
      };
  };
}
function i(e, t2) {
  const n = new RegExp(`\\s*${e.toLowerCase().replace(/\./g, "(..+)?.")}`);
  return c2(n, t2, e);
}
var q = [
  c2("alias", "allowUnsafeAlias"),
  c2("core.askPass", "allowUnsafeAskPass"),
  c2("core.editor", "allowUnsafeEditor"),
  c2("core.fsmonitor", "allowUnsafeFsMonitor"),
  c2("core.gitProxy", "allowUnsafeGitProxy"),
  c2("core.hooksPath", "allowUnsafeHooksPath"),
  c2("core.pager", "allowUnsafePager"),
  c2("core.sshCommand", "allowUnsafeSshCommand"),
  i("credential.helper", "allowUnsafeCredentialHelper"),
  i("diff.command", "allowUnsafeDiffExternal"),
  c2("diff.external", "allowUnsafeDiffExternal"),
  i("diff.textconv", "allowUnsafeDiffTextConv"),
  i("filter.clean", "allowUnsafeFilter"),
  i("filter.smudge", "allowUnsafeFilter"),
  i("gpg.program", "allowUnsafeGpgProgram"),
  c2("init.templateDir", "allowUnsafeTemplateDir"),
  i("merge.driver", "allowUnsafeMergeDriver"),
  i("mergetool.path", "allowUnsafeMergeDriver"),
  i("mergetool.cmd", "allowUnsafeMergeDriver"),
  i("protocol.allow", "allowUnsafeProtocolOverride"),
  i("remote.receivepack", "allowUnsafePack"),
  i("remote.uploadpack", "allowUnsafePack"),
  c2("sequence.editor", "allowUnsafeEditor")
];
function* K(e, t2) {
  for (const n of t2)
    for (const o2 of H) {
      const s = o2(e, n.name);
      s && (yield s);
    }
}
function h(e, t2, n, o2 = String(t2)) {
  const s = typeof t2 == "string" ? new RegExp(`\\s*${t2.toLowerCase()}`) : t2, r2 = `Use of ${e ? `${e} with option ` : ""}${o2} is not permitted without enabling ${n}`;
  return function(a, f) {
    if ((!e || a === e) && s.test(f))
      return {
        category: n,
        message: r2
      };
  };
}
var H = [
  h(
    null,
    /--(upload|receive)-pack/,
    "allowUnsafePack",
    "--upload-pack or --receive-pack"
  ),
  h("clone", /^-\w*u/, "allowUnsafePack"),
  h("clone", "--u", "allowUnsafePack"),
  h("push", "--exec", "allowUnsafePack"),
  h(null, "--template", "allowUnsafeTemplateDir")
];
function C(e, t2, n) {
  return [...K(e, t2), ...V(n)];
}
function Y(...e) {
  const { flags: t2, taskIndex: n } = j(e), o2 = n < e.length ? String(e[n]).toLowerCase() : null, s = o2 !== null ? e.slice(n + 1) : [], { positionals: r2, pathspecs: l } = B(s, o2, t2), a = L(o2, t2, r2);
  return {
    task: o2,
    flags: t2.map(J),
    paths: l,
    config: a,
    vulnerabilities: z(C(o2, t2, a))
  };
}
function z(e) {
  return Object.defineProperty(e, "vulnerabilities", {
    value: e
  });
}
function J({ value: e, name: t2 }) {
  return e !== void 0 ? { name: t2, value: e } : { name: t2 };
}
var y = {
  editor: "allowUnsafeEditor",
  git_askpass: "allowUnsafeAskPass",
  git_config_global: "allowUnsafeConfigPaths",
  git_config_system: "allowUnsafeConfigPaths",
  git_config_count: "allowUnsafeConfigEnvCount",
  git_config: "allowUnsafeConfigPaths",
  git_editor: "allowUnsafeEditor",
  git_exec_path: "allowUnsafeConfigPaths",
  git_external_diff: "allowUnsafeDiffExternal",
  git_pager: "allowUnsafePager",
  git_proxy_command: "allowUnsafeGitProxy",
  git_template_dir: "allowUnsafeTemplateDir",
  git_sequence_editor: "allowUnsafeEditor",
  git_ssh: "allowUnsafeSshCommand",
  git_ssh_command: "allowUnsafeSshCommand",
  pager: "allowUnsafePager",
  prefix: "allowUnsafeConfigPaths",
  ssh_askpass: "allowUnsafeAskPass"
};
function* Q(e) {
  const t2 = parseInt(e.git_config_count ?? "0", 10);
  for (let n = 0; n < t2; n++) {
    const o2 = e[`git_config_key_${n}`], s = e[`git_config_value_${n}`];
    o2 !== void 0 && (yield { key: o2.toLowerCase().trim(), value: s, scope: "env" });
  }
}
function* X(e) {
  for (const t2 of Object.keys(e))
    if (_(t2)) {
      const n = y[t2];
      yield {
        category: n,
        message: `Use of "${t2.toUpperCase()}" is not permitted without enabling ${n}`
      };
    }
}
function _(e) {
  return Object.hasOwn(y, e);
}
function Z(e) {
  const t2 = {};
  for (const [n, o2] of Object.entries(e)) {
    const s = n.toLowerCase().trim();
    (_(s) || s.startsWith("git")) && (t2[s] = String(o2));
  }
  return t2;
}
function ee(e) {
  const t2 = Z(e), n = {
    read: [],
    write: [...Q(t2)]
  }, o2 = [
    ...X(t2),
    ...C(null, [], n)
  ];
  return {
    config: n,
    vulnerabilities: o2
  };
}
function ne(e, t2) {
  return [...Y(...e).vulnerabilities, ...ee(t2).vulnerabilities];
}

// node_modules/simple-git/dist/esm/index.js
var import_promise_deferred2 = __toESM(require_dist3(), 1);
var import_node_events = require("node:events");
var __defProp2 = Object.defineProperty;
var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
var __getOwnPropNames2 = Object.getOwnPropertyNames;
var __hasOwnProp2 = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames2(fn)[0]])(fn = 0)), res;
};
var __commonJS2 = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames2(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export2 = (target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
};
var __copyProps2 = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames2(from))
      if (!__hasOwnProp2.call(to, key) && key !== except)
        __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS2 = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
var GitError;
var init_git_error = __esm({
  "src/lib/errors/git-error.ts"() {
    "use strict";
    GitError = class extends Error {
      constructor(task, message) {
        super(message);
        this.task = task;
        Object.setPrototypeOf(this, new.target.prototype);
      }
    };
  }
});
var GitResponseError;
var init_git_response_error = __esm({
  "src/lib/errors/git-response-error.ts"() {
    "use strict";
    init_git_error();
    GitResponseError = class extends GitError {
      constructor(git3, message) {
        super(void 0, message || String(git3));
        this.git = git3;
      }
    };
  }
});
var TaskConfigurationError;
var init_task_configuration_error = __esm({
  "src/lib/errors/task-configuration-error.ts"() {
    "use strict";
    init_git_error();
    TaskConfigurationError = class extends GitError {
      constructor(message) {
        super(void 0, message);
      }
    };
  }
});
function asFunction(source) {
  if (typeof source !== "function") {
    return NOOP;
  }
  return source;
}
function isUserFunction(source) {
  return typeof source === "function" && source !== NOOP;
}
function splitOn(input, char) {
  const index = input.indexOf(char);
  if (index <= 0) {
    return [input, ""];
  }
  return [input.substr(0, index), input.substr(index + 1)];
}
function first(input, offset = 0) {
  return isArrayLike(input) && input.length > offset ? input[offset] : void 0;
}
function last(input, offset = 0) {
  if (isArrayLike(input) && input.length > offset) {
    return input[input.length - 1 - offset];
  }
}
function isArrayLike(input) {
  return filterHasLength(input);
}
function toLinesWithContent(input = "", trimmed2 = true, separator = "\n") {
  return input.split(separator).reduce((output, line) => {
    const lineContent = trimmed2 ? line.trim() : line;
    if (lineContent) {
      output.push(lineContent);
    }
    return output;
  }, []);
}
function forEachLineWithContent(input, callback) {
  return toLinesWithContent(input, true).map((line) => callback(line));
}
function folderExists(path37) {
  return (0, import_file_exists.exists)(path37, import_file_exists.FOLDER);
}
function append(target, item) {
  if (Array.isArray(target)) {
    if (!target.includes(item)) {
      target.push(item);
    }
  } else {
    target.add(item);
  }
  return item;
}
function including(target, item) {
  if (Array.isArray(target) && !target.includes(item)) {
    target.push(item);
  }
  return target;
}
function remove(target, item) {
  if (Array.isArray(target)) {
    const index = target.indexOf(item);
    if (index >= 0) {
      target.splice(index, 1);
    }
  } else {
    target.delete(item);
  }
  return item;
}
function asArray(source) {
  return Array.isArray(source) ? source : [source];
}
function asCamelCase(str2) {
  return str2.replace(/[\s-]+(.)/g, (_all, chr) => {
    return chr.toUpperCase();
  });
}
function asStringArray(source) {
  return asArray(source).map((item) => {
    return item instanceof String ? item : String(item);
  });
}
function asNumber(source, onNaN = 0) {
  if (source == null) {
    return onNaN;
  }
  const num = parseInt(source, 10);
  return Number.isNaN(num) ? onNaN : num;
}
function prefixedArray(input, prefix) {
  const output = [];
  for (let i2 = 0, max = input.length; i2 < max; i2++) {
    output.push(prefix, input[i2]);
  }
  return output;
}
function bufferToString(input) {
  return (Array.isArray(input) ? Buffer.concat(input) : input).toString("utf-8");
}
function pick(source, properties) {
  const out = {};
  properties.forEach((key) => {
    if (source[key] !== void 0) {
      out[key] = source[key];
    }
  });
  return out;
}
function delay(duration = 0) {
  return new Promise((done) => setTimeout(done, duration));
}
function orVoid(input) {
  if (input === false) {
    return void 0;
  }
  return input;
}
var NULL;
var NOOP;
var objectToString;
var init_util = __esm({
  "src/lib/utils/util.ts"() {
    "use strict";
    init_argument_filters();
    NULL = "\0";
    NOOP = () => {
    };
    objectToString = Object.prototype.toString.call.bind(Object.prototype.toString);
  }
});
function filterType(input, filter, def) {
  if (filter(input)) {
    return input;
  }
  return arguments.length > 2 ? def : void 0;
}
function filterPrimitives(input, omit) {
  const type = r(input) ? "string" : typeof input;
  return /number|string|boolean/.test(type) && (!omit || !omit.includes(type));
}
function filterPlainObject(input) {
  return !!input && objectToString(input) === "[object Object]";
}
function filterFunction(input) {
  return typeof input === "function";
}
var filterArray;
var filterNumber;
var filterString;
var filterStringOrStringArray;
var filterHasLength;
var init_argument_filters = __esm({
  "src/lib/utils/argument-filters.ts"() {
    "use strict";
    init_util();
    filterArray = (input) => {
      return Array.isArray(input);
    };
    filterNumber = (input) => {
      return typeof input === "number";
    };
    filterString = (input) => {
      return typeof input === "string" || r(input);
    };
    filterStringOrStringArray = (input) => {
      return filterString(input) || Array.isArray(input) && input.every(filterString);
    };
    filterHasLength = (input) => {
      if (input == null || "number|boolean|function".includes(typeof input)) {
        return false;
      }
      return typeof input.length === "number";
    };
  }
});
var ExitCodes;
var init_exit_codes = __esm({
  "src/lib/utils/exit-codes.ts"() {
    "use strict";
    ExitCodes = /* @__PURE__ */ ((ExitCodes2) => {
      ExitCodes2[ExitCodes2["SUCCESS"] = 0] = "SUCCESS";
      ExitCodes2[ExitCodes2["ERROR"] = 1] = "ERROR";
      ExitCodes2[ExitCodes2["NOT_FOUND"] = -2] = "NOT_FOUND";
      ExitCodes2[ExitCodes2["UNCLEAN"] = 128] = "UNCLEAN";
      return ExitCodes2;
    })(ExitCodes || {});
  }
});
var GitOutputStreams;
var init_git_output_streams = __esm({
  "src/lib/utils/git-output-streams.ts"() {
    "use strict";
    GitOutputStreams = class _GitOutputStreams {
      constructor(stdOut, stdErr) {
        this.stdOut = stdOut;
        this.stdErr = stdErr;
      }
      asStrings() {
        return new _GitOutputStreams(this.stdOut.toString("utf8"), this.stdErr.toString("utf8"));
      }
    };
  }
});
function useMatchesDefault() {
  throw new Error(`LineParser:useMatches not implemented`);
}
var LineParser;
var RemoteLineParser;
var init_line_parser = __esm({
  "src/lib/utils/line-parser.ts"() {
    "use strict";
    LineParser = class {
      constructor(regExp, useMatches) {
        this.matches = [];
        this.useMatches = useMatchesDefault;
        this.parse = (line, target) => {
          this.resetMatches();
          if (!this._regExp.every((reg, index) => this.addMatch(reg, index, line(index)))) {
            return false;
          }
          return this.useMatches(target, this.prepareMatches()) !== false;
        };
        this._regExp = Array.isArray(regExp) ? regExp : [regExp];
        if (useMatches) {
          this.useMatches = useMatches;
        }
      }
      resetMatches() {
        this.matches.length = 0;
      }
      prepareMatches() {
        return this.matches;
      }
      addMatch(reg, index, line) {
        const matched = line && reg.exec(line);
        if (matched) {
          this.pushMatch(index, matched);
        }
        return !!matched;
      }
      pushMatch(_index, matched) {
        this.matches.push(...matched.slice(1));
      }
    };
    RemoteLineParser = class extends LineParser {
      addMatch(reg, index, line) {
        return /^remote:\s/.test(String(line)) && super.addMatch(reg, index, line);
      }
      pushMatch(index, matched) {
        if (index > 0 || matched.length > 1) {
          super.pushMatch(index, matched);
        }
      }
    };
  }
});
function createInstanceConfig(...options) {
  const baseDir = process.cwd();
  const config = Object.assign(
    { baseDir, ...defaultOptions },
    ...options.filter((o2) => typeof o2 === "object" && o2)
  );
  config.baseDir = config.baseDir || baseDir;
  config.trimmed = config.trimmed === true;
  return config;
}
var defaultOptions;
var init_simple_git_options = __esm({
  "src/lib/utils/simple-git-options.ts"() {
    "use strict";
    defaultOptions = {
      binary: "git",
      maxConcurrentProcesses: 5,
      config: [],
      trimmed: false
    };
  }
});
function appendTaskOptions(options, commands29 = []) {
  if (!filterPlainObject(options)) {
    return commands29;
  }
  return Object.keys(options).reduce((commands210, key) => {
    const value = options[key];
    if (r(value)) {
      commands210.push(value);
    } else if (filterPrimitives(value, ["boolean"])) {
      commands210.push(key + "=" + value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        if (!filterPrimitives(v, ["string", "number"])) {
          commands210.push(key + "=" + v);
        }
      }
    } else {
      commands210.push(key);
    }
    return commands210;
  }, commands29);
}
function getTrailingOptions(args, initialPrimitive = 0, objectOnly = false) {
  const command = [];
  for (let i2 = 0, max = initialPrimitive < 0 ? args.length : initialPrimitive; i2 < max; i2++) {
    if ("string|number".includes(typeof args[i2])) {
      command.push(String(args[i2]));
    }
  }
  appendTaskOptions(trailingOptionsArgument(args), command);
  if (!objectOnly) {
    command.push(...trailingArrayArgument(args));
  }
  return command;
}
function trailingArrayArgument(args) {
  const hasTrailingCallback = typeof last(args) === "function";
  return asStringArray(filterType(last(args, hasTrailingCallback ? 1 : 0), filterArray, []));
}
function trailingOptionsArgument(args) {
  const hasTrailingCallback = filterFunction(last(args));
  return filterType(last(args, hasTrailingCallback ? 1 : 0), filterPlainObject);
}
function trailingFunctionArgument(args, includeNoop = true) {
  const callback = asFunction(last(args));
  return includeNoop || isUserFunction(callback) ? callback : void 0;
}
var init_task_options = __esm({
  "src/lib/utils/task-options.ts"() {
    "use strict";
    init_argument_filters();
    init_util();
  }
});
function callTaskParser(parser4, streams) {
  return parser4(streams.stdOut, streams.stdErr);
}
function parseStringResponse(result, parsers12, texts, trim = true) {
  asArray(texts).forEach((text) => {
    for (let lines = toLinesWithContent(text, trim), i2 = 0, max = lines.length; i2 < max; i2++) {
      const line = (offset = 0) => {
        if (i2 + offset >= max) {
          return;
        }
        return lines[i2 + offset];
      };
      parsers12.some(({ parse: parse2 }) => parse2(line, result));
    }
  });
  return result;
}
var init_task_parser = __esm({
  "src/lib/utils/task-parser.ts"() {
    "use strict";
    init_util();
  }
});
var utils_exports = {};
__export2(utils_exports, {
  ExitCodes: () => ExitCodes,
  GitOutputStreams: () => GitOutputStreams,
  LineParser: () => LineParser,
  NOOP: () => NOOP,
  NULL: () => NULL,
  RemoteLineParser: () => RemoteLineParser,
  append: () => append,
  appendTaskOptions: () => appendTaskOptions,
  asArray: () => asArray,
  asCamelCase: () => asCamelCase,
  asFunction: () => asFunction,
  asNumber: () => asNumber,
  asStringArray: () => asStringArray,
  bufferToString: () => bufferToString,
  callTaskParser: () => callTaskParser,
  createInstanceConfig: () => createInstanceConfig,
  delay: () => delay,
  filterArray: () => filterArray,
  filterFunction: () => filterFunction,
  filterHasLength: () => filterHasLength,
  filterNumber: () => filterNumber,
  filterPlainObject: () => filterPlainObject,
  filterPrimitives: () => filterPrimitives,
  filterString: () => filterString,
  filterStringOrStringArray: () => filterStringOrStringArray,
  filterType: () => filterType,
  first: () => first,
  folderExists: () => folderExists,
  forEachLineWithContent: () => forEachLineWithContent,
  getTrailingOptions: () => getTrailingOptions,
  including: () => including,
  isUserFunction: () => isUserFunction,
  last: () => last,
  objectToString: () => objectToString,
  orVoid: () => orVoid,
  parseStringResponse: () => parseStringResponse,
  pick: () => pick,
  prefixedArray: () => prefixedArray,
  remove: () => remove,
  splitOn: () => splitOn,
  toLinesWithContent: () => toLinesWithContent,
  trailingFunctionArgument: () => trailingFunctionArgument,
  trailingOptionsArgument: () => trailingOptionsArgument
});
var init_utils = __esm({
  "src/lib/utils/index.ts"() {
    "use strict";
    init_argument_filters();
    init_exit_codes();
    init_git_output_streams();
    init_line_parser();
    init_simple_git_options();
    init_task_options();
    init_task_parser();
    init_util();
  }
});
var check_is_repo_exports = {};
__export2(check_is_repo_exports, {
  CheckRepoActions: () => CheckRepoActions,
  checkIsBareRepoTask: () => checkIsBareRepoTask,
  checkIsRepoRootTask: () => checkIsRepoRootTask,
  checkIsRepoTask: () => checkIsRepoTask
});
function checkIsRepoTask(action) {
  switch (action) {
    case "bare":
      return checkIsBareRepoTask();
    case "root":
      return checkIsRepoRootTask();
  }
  const commands29 = ["rev-parse", "--is-inside-work-tree"];
  return {
    commands: commands29,
    format: "utf-8",
    onError,
    parser
  };
}
function checkIsRepoRootTask() {
  const commands29 = ["rev-parse", "--git-dir"];
  return {
    commands: commands29,
    format: "utf-8",
    onError,
    parser(path37) {
      return /^\.(git)?$/.test(path37.trim());
    }
  };
}
function checkIsBareRepoTask() {
  const commands29 = ["rev-parse", "--is-bare-repository"];
  return {
    commands: commands29,
    format: "utf-8",
    onError,
    parser
  };
}
function isNotRepoMessage(error) {
  return /(Not a git repository|Kein Git-Repository)/i.test(String(error));
}
var CheckRepoActions;
var onError;
var parser;
var init_check_is_repo = __esm({
  "src/lib/tasks/check-is-repo.ts"() {
    "use strict";
    init_utils();
    CheckRepoActions = /* @__PURE__ */ ((CheckRepoActions2) => {
      CheckRepoActions2["BARE"] = "bare";
      CheckRepoActions2["IN_TREE"] = "tree";
      CheckRepoActions2["IS_REPO_ROOT"] = "root";
      return CheckRepoActions2;
    })(CheckRepoActions || {});
    onError = ({ exitCode }, error, done, fail) => {
      if (exitCode === 128 && isNotRepoMessage(error)) {
        return done(Buffer.from("false"));
      }
      fail(error);
    };
    parser = (text) => {
      return text.trim() === "true";
    };
  }
});
function cleanSummaryParser(dryRun, text) {
  const summary = new CleanResponse(dryRun);
  const regexp = dryRun ? dryRunRemovalRegexp : removalRegexp;
  toLinesWithContent(text).forEach((line) => {
    const removed = line.replace(regexp, "");
    summary.paths.push(removed);
    (isFolderRegexp.test(removed) ? summary.folders : summary.files).push(removed);
  });
  return summary;
}
var CleanResponse;
var removalRegexp;
var dryRunRemovalRegexp;
var isFolderRegexp;
var init_CleanSummary = __esm({
  "src/lib/responses/CleanSummary.ts"() {
    "use strict";
    init_utils();
    CleanResponse = class {
      constructor(dryRun) {
        this.dryRun = dryRun;
        this.paths = [];
        this.files = [];
        this.folders = [];
      }
    };
    removalRegexp = /^[a-z]+\s*/i;
    dryRunRemovalRegexp = /^[a-z]+\s+[a-z]+\s*/i;
    isFolderRegexp = /\/$/;
  }
});
var task_exports = {};
__export2(task_exports, {
  EMPTY_COMMANDS: () => EMPTY_COMMANDS,
  adhocExecTask: () => adhocExecTask,
  configurationErrorTask: () => configurationErrorTask,
  isBufferTask: () => isBufferTask,
  isEmptyTask: () => isEmptyTask,
  straightThroughBufferTask: () => straightThroughBufferTask,
  straightThroughStringTask: () => straightThroughStringTask
});
function adhocExecTask(parser4) {
  return {
    commands: EMPTY_COMMANDS,
    format: "empty",
    parser: parser4
  };
}
function configurationErrorTask(error) {
  return {
    commands: EMPTY_COMMANDS,
    format: "empty",
    parser() {
      throw typeof error === "string" ? new TaskConfigurationError(error) : error;
    }
  };
}
function straightThroughStringTask(commands29, trimmed2 = false) {
  return {
    commands: commands29,
    format: "utf-8",
    parser(text) {
      return trimmed2 ? String(text).trim() : text;
    }
  };
}
function straightThroughBufferTask(commands29) {
  return {
    commands: commands29,
    format: "buffer",
    parser(buffer) {
      return buffer;
    }
  };
}
function isBufferTask(task) {
  return task.format === "buffer";
}
function isEmptyTask(task) {
  return task.format === "empty" || !task.commands.length;
}
var EMPTY_COMMANDS;
var init_task = __esm({
  "src/lib/tasks/task.ts"() {
    "use strict";
    init_task_configuration_error();
    EMPTY_COMMANDS = [];
  }
});
var clean_exports = {};
__export2(clean_exports, {
  CONFIG_ERROR_INTERACTIVE_MODE: () => CONFIG_ERROR_INTERACTIVE_MODE,
  CONFIG_ERROR_MODE_REQUIRED: () => CONFIG_ERROR_MODE_REQUIRED,
  CONFIG_ERROR_UNKNOWN_OPTION: () => CONFIG_ERROR_UNKNOWN_OPTION,
  CleanOptions: () => CleanOptions,
  cleanTask: () => cleanTask,
  cleanWithOptionsTask: () => cleanWithOptionsTask,
  isCleanOptionsArray: () => isCleanOptionsArray
});
function cleanWithOptionsTask(mode, customArgs) {
  const { cleanMode, options, valid } = getCleanOptions(mode);
  if (!cleanMode) {
    return configurationErrorTask(CONFIG_ERROR_MODE_REQUIRED);
  }
  if (!valid.options) {
    return configurationErrorTask(CONFIG_ERROR_UNKNOWN_OPTION + JSON.stringify(mode));
  }
  options.push(...customArgs);
  if (options.some(isInteractiveMode)) {
    return configurationErrorTask(CONFIG_ERROR_INTERACTIVE_MODE);
  }
  return cleanTask(cleanMode, options);
}
function cleanTask(mode, customArgs) {
  const commands29 = ["clean", `-${mode}`, ...customArgs];
  return {
    commands: commands29,
    format: "utf-8",
    parser(text) {
      return cleanSummaryParser(mode === "n", text);
    }
  };
}
function isCleanOptionsArray(input) {
  return Array.isArray(input) && input.every((test) => CleanOptionValues.has(test));
}
function getCleanOptions(input) {
  let cleanMode;
  let options = [];
  let valid = { cleanMode: false, options: true };
  input.replace(/[^a-z]i/g, "").split("").forEach((char) => {
    if (isCleanMode(char)) {
      cleanMode = char;
      valid.cleanMode = true;
    } else {
      valid.options = valid.options && isKnownOption(options[options.length] = `-${char}`);
    }
  });
  return {
    cleanMode,
    options,
    valid
  };
}
function isCleanMode(cleanMode) {
  return cleanMode === "f" || cleanMode === "n";
}
function isKnownOption(option) {
  return /^-[a-z]$/i.test(option) && CleanOptionValues.has(option.charAt(1));
}
function isInteractiveMode(option) {
  if (/^-[^\-]/.test(option)) {
    return option.indexOf("i") > 0;
  }
  return option === "--interactive";
}
var CONFIG_ERROR_INTERACTIVE_MODE;
var CONFIG_ERROR_MODE_REQUIRED;
var CONFIG_ERROR_UNKNOWN_OPTION;
var CleanOptions;
var CleanOptionValues;
var init_clean = __esm({
  "src/lib/tasks/clean.ts"() {
    "use strict";
    init_CleanSummary();
    init_utils();
    init_task();
    CONFIG_ERROR_INTERACTIVE_MODE = "Git clean interactive mode is not supported";
    CONFIG_ERROR_MODE_REQUIRED = 'Git clean mode parameter ("n" or "f") is required';
    CONFIG_ERROR_UNKNOWN_OPTION = "Git clean unknown option found in: ";
    CleanOptions = /* @__PURE__ */ ((CleanOptions2) => {
      CleanOptions2["DRY_RUN"] = "n";
      CleanOptions2["FORCE"] = "f";
      CleanOptions2["IGNORED_INCLUDED"] = "x";
      CleanOptions2["IGNORED_ONLY"] = "X";
      CleanOptions2["EXCLUDING"] = "e";
      CleanOptions2["QUIET"] = "q";
      CleanOptions2["RECURSIVE"] = "d";
      return CleanOptions2;
    })(CleanOptions || {});
    CleanOptionValues = /* @__PURE__ */ new Set([
      "i",
      ...asStringArray(Object.values(CleanOptions))
    ]);
  }
});
function configListParser(text) {
  const config = new ConfigList();
  for (const item of configParser(text)) {
    config.addValue(item.file, String(item.key), item.value);
  }
  return config;
}
function configGetParser(text, key) {
  let value = null;
  const values = [];
  const scopes = /* @__PURE__ */ new Map();
  for (const item of configParser(text, key)) {
    if (item.key !== key) {
      continue;
    }
    values.push(value = item.value);
    if (!scopes.has(item.file)) {
      scopes.set(item.file, []);
    }
    scopes.get(item.file).push(value);
  }
  return {
    key,
    paths: Array.from(scopes.keys()),
    scopes,
    value,
    values
  };
}
function configFilePath(filePath) {
  return filePath.replace(/^(file):/, "");
}
function* configParser(text, requestedKey = null) {
  const lines = text.split("\0");
  for (let i2 = 0, max = lines.length - 1; i2 < max; ) {
    const file = configFilePath(lines[i2++]);
    let value = lines[i2++];
    let key = requestedKey;
    if (value.includes("\n")) {
      const line = splitOn(value, "\n");
      key = line[0];
      value = line[1];
    }
    yield { file, key, value };
  }
}
var ConfigList;
var init_ConfigList = __esm({
  "src/lib/responses/ConfigList.ts"() {
    "use strict";
    init_utils();
    ConfigList = class {
      constructor() {
        this.files = [];
        this.values = /* @__PURE__ */ Object.create(null);
      }
      get all() {
        if (!this._all) {
          this._all = this.files.reduce((all, file) => {
            return Object.assign(all, this.values[file]);
          }, {});
        }
        return this._all;
      }
      addFile(file) {
        if (!(file in this.values)) {
          const latest = last(this.files);
          this.values[file] = latest ? Object.create(this.values[latest]) : {};
          this.files.push(file);
        }
        return this.values[file];
      }
      addValue(file, key, value) {
        const values = this.addFile(file);
        if (!Object.hasOwn(values, key)) {
          values[key] = value;
        } else if (Array.isArray(values[key])) {
          values[key].push(value);
        } else {
          values[key] = [values[key], value];
        }
        this._all = void 0;
      }
    };
  }
});
function asConfigScope(scope, fallback) {
  if (typeof scope === "string" && Object.hasOwn(GitConfigScope, scope)) {
    return scope;
  }
  return fallback;
}
function addConfigTask(key, value, append2, scope) {
  const commands29 = ["config", `--${scope}`];
  if (append2) {
    commands29.push("--add");
  }
  commands29.push(key, value);
  return {
    commands: commands29,
    format: "utf-8",
    parser(text) {
      return text;
    }
  };
}
function getConfigTask(key, scope) {
  const commands29 = ["config", "--null", "--show-origin", "--get-all", key];
  if (scope) {
    commands29.splice(1, 0, `--${scope}`);
  }
  return {
    commands: commands29,
    format: "utf-8",
    parser(text) {
      return configGetParser(text, key);
    }
  };
}
function listConfigTask(scope) {
  const commands29 = ["config", "--list", "--show-origin", "--null"];
  if (scope) {
    commands29.push(`--${scope}`);
  }
  return {
    commands: commands29,
    format: "utf-8",
    parser(text) {
      return configListParser(text);
    }
  };
}
function config_default() {
  return {
    addConfig(key, value, ...rest) {
      return this._runTask(
        addConfigTask(
          key,
          value,
          rest[0] === true,
          asConfigScope(
            rest[1],
            "local"
            /* local */
          )
        ),
        trailingFunctionArgument(arguments)
      );
    },
    getConfig(key, scope) {
      return this._runTask(
        getConfigTask(key, asConfigScope(scope, void 0)),
        trailingFunctionArgument(arguments)
      );
    },
    listConfig(...rest) {
      return this._runTask(
        listConfigTask(asConfigScope(rest[0], void 0)),
        trailingFunctionArgument(arguments)
      );
    }
  };
}
var GitConfigScope;
var init_config = __esm({
  "src/lib/tasks/config.ts"() {
    "use strict";
    init_ConfigList();
    init_utils();
    GitConfigScope = /* @__PURE__ */ ((GitConfigScope2) => {
      GitConfigScope2["system"] = "system";
      GitConfigScope2["global"] = "global";
      GitConfigScope2["local"] = "local";
      GitConfigScope2["worktree"] = "worktree";
      return GitConfigScope2;
    })(GitConfigScope || {});
  }
});
function isDiffNameStatus(input) {
  return diffNameStatus.has(input);
}
var DiffNameStatus;
var diffNameStatus;
var init_diff_name_status = __esm({
  "src/lib/tasks/diff-name-status.ts"() {
    "use strict";
    DiffNameStatus = /* @__PURE__ */ ((DiffNameStatus2) => {
      DiffNameStatus2["ADDED"] = "A";
      DiffNameStatus2["COPIED"] = "C";
      DiffNameStatus2["DELETED"] = "D";
      DiffNameStatus2["MODIFIED"] = "M";
      DiffNameStatus2["RENAMED"] = "R";
      DiffNameStatus2["CHANGED"] = "T";
      DiffNameStatus2["UNMERGED"] = "U";
      DiffNameStatus2["UNKNOWN"] = "X";
      DiffNameStatus2["BROKEN"] = "B";
      return DiffNameStatus2;
    })(DiffNameStatus || {});
    diffNameStatus = new Set(Object.values(DiffNameStatus));
  }
});
function grepQueryBuilder(...params) {
  return new GrepQuery().param(...params);
}
function parseGrep(grep) {
  const paths = /* @__PURE__ */ new Set();
  const results = {};
  forEachLineWithContent(grep, (input) => {
    const [path37, line, preview] = input.split(NULL);
    paths.add(path37);
    (results[path37] = results[path37] || []).push({
      line: asNumber(line),
      path: path37,
      preview
    });
  });
  return {
    paths,
    results
  };
}
function grep_default() {
  return {
    grep(searchTerm) {
      const then = trailingFunctionArgument(arguments);
      const options = getTrailingOptions(arguments);
      for (const option of disallowedOptions) {
        if (options.includes(option)) {
          return this._runTask(
            configurationErrorTask(`git.grep: use of "${option}" is not supported.`),
            then
          );
        }
      }
      if (typeof searchTerm === "string") {
        searchTerm = grepQueryBuilder().param(searchTerm);
      }
      const commands29 = ["grep", "--null", "-n", "--full-name", ...options, ...searchTerm];
      return this._runTask(
        {
          commands: commands29,
          format: "utf-8",
          parser(stdOut) {
            return parseGrep(stdOut);
          }
        },
        then
      );
    }
  };
}
var disallowedOptions;
var Query;
var _a;
var GrepQuery;
var init_grep = __esm({
  "src/lib/tasks/grep.ts"() {
    "use strict";
    init_utils();
    init_task();
    disallowedOptions = ["-h"];
    Query = Symbol("grepQuery");
    GrepQuery = class {
      constructor() {
        this[_a] = [];
      }
      *[(_a = Query, Symbol.iterator)]() {
        for (const query of this[Query]) {
          yield query;
        }
      }
      and(...and) {
        and.length && this[Query].push("--and", "(", ...prefixedArray(and, "-e"), ")");
        return this;
      }
      param(...param) {
        this[Query].push(...prefixedArray(param, "-e"));
        return this;
      }
    };
  }
});
var reset_exports = {};
__export2(reset_exports, {
  ResetMode: () => ResetMode,
  getResetMode: () => getResetMode,
  resetTask: () => resetTask
});
function resetTask(mode, customArgs) {
  const commands29 = ["reset"];
  if (isValidResetMode(mode)) {
    commands29.push(`--${mode}`);
  }
  commands29.push(...customArgs);
  return straightThroughStringTask(commands29);
}
function getResetMode(mode) {
  if (isValidResetMode(mode)) {
    return mode;
  }
  switch (typeof mode) {
    case "string":
    case "undefined":
      return "soft";
  }
  return;
}
function isValidResetMode(mode) {
  return typeof mode === "string" && validResetModes.includes(mode);
}
var ResetMode;
var validResetModes;
var init_reset = __esm({
  "src/lib/tasks/reset.ts"() {
    "use strict";
    init_utils();
    init_task();
    ResetMode = /* @__PURE__ */ ((ResetMode2) => {
      ResetMode2["MIXED"] = "mixed";
      ResetMode2["SOFT"] = "soft";
      ResetMode2["HARD"] = "hard";
      ResetMode2["MERGE"] = "merge";
      ResetMode2["KEEP"] = "keep";
      return ResetMode2;
    })(ResetMode || {});
    validResetModes = asStringArray(Object.values(ResetMode));
  }
});
function createLog() {
  return (0, import_debug.default)("simple-git");
}
function prefixedLogger(to, prefix, forward) {
  if (!prefix || !String(prefix).replace(/\s*/, "")) {
    return !forward ? to : (message, ...args) => {
      to(message, ...args);
      forward(message, ...args);
    };
  }
  return (message, ...args) => {
    to(`%s ${message}`, prefix, ...args);
    if (forward) {
      forward(message, ...args);
    }
  };
}
function childLoggerName(name, childDebugger, { namespace: parentNamespace }) {
  if (typeof name === "string") {
    return name;
  }
  const childNamespace = childDebugger && childDebugger.namespace || "";
  if (childNamespace.startsWith(parentNamespace)) {
    return childNamespace.substr(parentNamespace.length + 1);
  }
  return childNamespace || parentNamespace;
}
function createLogger(label, verbose, initialStep, infoDebugger = createLog()) {
  const labelPrefix = label && `[${label}]` || "";
  const spawned = [];
  const debugDebugger = typeof verbose === "string" ? infoDebugger.extend(verbose) : verbose;
  const key = childLoggerName(filterType(verbose, filterString), debugDebugger, infoDebugger);
  return step(initialStep);
  function sibling(name, initial) {
    return append(
      spawned,
      createLogger(label, key.replace(/^[^:]+/, name), initial, infoDebugger)
    );
  }
  function step(phase) {
    const stepPrefix = phase && `[${phase}]` || "";
    const debug2 = debugDebugger && prefixedLogger(debugDebugger, stepPrefix) || NOOP;
    const info = prefixedLogger(infoDebugger, `${labelPrefix} ${stepPrefix}`, debug2);
    return Object.assign(debugDebugger ? debug2 : info, {
      label,
      sibling,
      info,
      step
    });
  }
}
var init_git_logger = __esm({
  "src/lib/git-logger.ts"() {
    "use strict";
    init_utils();
    import_debug.default.formatters.L = (value) => String(filterHasLength(value) ? value.length : "-");
    import_debug.default.formatters.B = (value) => {
      if (Buffer.isBuffer(value)) {
        return value.toString("utf8");
      }
      return objectToString(value);
    };
  }
});
var TasksPendingQueue;
var init_tasks_pending_queue = __esm({
  "src/lib/runners/tasks-pending-queue.ts"() {
    "use strict";
    init_git_error();
    init_git_logger();
    TasksPendingQueue = class _TasksPendingQueue {
      constructor(logLabel = "GitExecutor") {
        this.logLabel = logLabel;
        this._queue = /* @__PURE__ */ new Map();
      }
      withProgress(task) {
        return this._queue.get(task);
      }
      createProgress(task) {
        const name = _TasksPendingQueue.getName(task.commands[0]);
        const logger = createLogger(this.logLabel, name);
        return {
          task,
          logger,
          name
        };
      }
      push(task) {
        const progress = this.createProgress(task);
        progress.logger("Adding task to the queue, commands = %o", task.commands);
        this._queue.set(task, progress);
        return progress;
      }
      fatal(err) {
        for (const [task, { logger }] of Array.from(this._queue.entries())) {
          if (task === err.task) {
            logger.info(`Failed %o`, err);
            logger(
              `Fatal exception, any as-yet un-started tasks run through this executor will not be attempted`
            );
          } else {
            logger.info(
              `A fatal exception occurred in a previous task, the queue has been purged: %o`,
              err.message
            );
          }
          this.complete(task);
        }
        if (this._queue.size !== 0) {
          throw new Error(`Queue size should be zero after fatal: ${this._queue.size}`);
        }
      }
      complete(task) {
        const progress = this.withProgress(task);
        if (progress) {
          this._queue.delete(task);
        }
      }
      attempt(task) {
        const progress = this.withProgress(task);
        if (!progress) {
          throw new GitError(void 0, "TasksPendingQueue: attempt called for an unknown task");
        }
        progress.logger("Starting task");
        return progress;
      }
      static getName(name = "empty") {
        return `task:${name}:${++_TasksPendingQueue.counter}`;
      }
      static {
        this.counter = 0;
      }
    };
  }
});
function pluginContext(task, commands29) {
  return {
    method: first(task.commands) || "",
    commands: commands29
  };
}
function onErrorReceived(target, logger) {
  return (err) => {
    logger(`[ERROR] child process exception %o`, err);
    target.push(Buffer.from(String(err.stack), "ascii"));
  };
}
function onDataReceived(target, name, logger, output) {
  return (buffer) => {
    logger(`%s received %L bytes`, name, buffer);
    output(`%B`, buffer);
    target.push(buffer);
  };
}
var GitExecutorChain;
var init_git_executor_chain = __esm({
  "src/lib/runners/git-executor-chain.ts"() {
    "use strict";
    init_git_error();
    init_task();
    init_utils();
    init_tasks_pending_queue();
    GitExecutorChain = class {
      constructor(_executor, _scheduler, _plugins) {
        this._executor = _executor;
        this._scheduler = _scheduler;
        this._plugins = _plugins;
        this._chain = Promise.resolve();
        this._queue = new TasksPendingQueue();
      }
      get cwd() {
        return this._cwd || this._executor.cwd;
      }
      set cwd(cwd) {
        this._cwd = cwd;
      }
      get env() {
        return this._executor.env;
      }
      get outputHandler() {
        return this._executor.outputHandler;
      }
      chain() {
        return this;
      }
      push(task) {
        this._queue.push(task);
        return this._chain = this._chain.then(() => this.attemptTask(task));
      }
      async attemptTask(task) {
        const onScheduleComplete = await this._scheduler.next();
        const onQueueComplete = () => this._queue.complete(task);
        try {
          const { logger } = this._queue.attempt(task);
          return await (isEmptyTask(task) ? this.attemptEmptyTask(task, logger) : this.attemptRemoteTask(task, logger));
        } catch (e) {
          throw this.onFatalException(task, e);
        } finally {
          onQueueComplete();
          onScheduleComplete();
        }
      }
      onFatalException(task, e) {
        const gitError = e instanceof GitError ? Object.assign(e, { task }) : new GitError(task, e && String(e));
        this._chain = Promise.resolve();
        this._queue.fatal(gitError);
        return gitError;
      }
      async attemptRemoteTask(task, logger) {
        const binary = this._plugins.exec("spawn.binary", "", pluginContext(task, task.commands));
        const args = this._plugins.exec("spawn.args", [...task.commands], {
          ...pluginContext(task, task.commands),
          env: { ...this.env }
        });
        const raw = await this.gitResponse(
          task,
          binary,
          args,
          this.outputHandler,
          logger.step("SPAWN")
        );
        const outputStreams = await this.handleTaskData(task, args, raw, logger.step("HANDLE"));
        logger(`passing response to task's parser as a %s`, task.format);
        if (isBufferTask(task)) {
          return callTaskParser(task.parser, outputStreams);
        }
        return callTaskParser(task.parser, outputStreams.asStrings());
      }
      async attemptEmptyTask(task, logger) {
        logger(`empty task bypassing child process to call to task's parser`);
        return task.parser(this);
      }
      handleTaskData(task, args, result, logger) {
        const { exitCode, rejection, stdOut, stdErr } = result;
        return new Promise((done, fail) => {
          logger(`Preparing to handle process response exitCode=%d stdOut=`, exitCode);
          const { error } = this._plugins.exec(
            "task.error",
            { error: rejection },
            {
              ...pluginContext(task, args),
              ...result
            }
          );
          if (error && task.onError) {
            logger.info(`exitCode=%s handling with custom error handler`);
            return task.onError(
              result,
              error,
              (newStdOut) => {
                logger.info(`custom error handler treated as success`);
                logger(`custom error returned a %s`, objectToString(newStdOut));
                done(
                  new GitOutputStreams(
                    Array.isArray(newStdOut) ? Buffer.concat(newStdOut) : newStdOut,
                    Buffer.concat(stdErr)
                  )
                );
              },
              fail
            );
          }
          if (error) {
            logger.info(
              `handling as error: exitCode=%s stdErr=%s rejection=%o`,
              exitCode,
              stdErr.length,
              rejection
            );
            return fail(error);
          }
          logger.info(`retrieving task output complete`);
          done(new GitOutputStreams(Buffer.concat(stdOut), Buffer.concat(stdErr)));
        });
      }
      async gitResponse(task, command, args, outputHandler, logger) {
        const outputLogger = logger.sibling("output");
        const spawnOptions = this._plugins.exec(
          "spawn.options",
          {
            cwd: this.cwd,
            env: this.env,
            windowsHide: true
          },
          pluginContext(task, task.commands)
        );
        return new Promise((done) => {
          const stdOut = [];
          const stdErr = [];
          logger.info(`%s %o`, command, args);
          logger("%O", spawnOptions);
          let rejection = this._beforeSpawn(task, args);
          if (rejection) {
            return done({
              stdOut,
              stdErr,
              exitCode: 9901,
              rejection
            });
          }
          this._plugins.exec("spawn.before", void 0, {
            ...pluginContext(task, args),
            kill(reason) {
              rejection = reason || rejection;
            }
          });
          const spawned = (0, import_child_process.spawn)(command, args, spawnOptions);
          spawned.stdout.on(
            "data",
            onDataReceived(stdOut, "stdOut", logger, outputLogger.step("stdOut"))
          );
          spawned.stderr.on(
            "data",
            onDataReceived(stdErr, "stdErr", logger, outputLogger.step("stdErr"))
          );
          spawned.on("error", onErrorReceived(stdErr, logger));
          if (outputHandler) {
            logger(`Passing child process stdOut/stdErr to custom outputHandler`);
            outputHandler(command, spawned.stdout, spawned.stderr, [...args]);
          }
          this._plugins.exec("spawn.after", void 0, {
            ...pluginContext(task, args),
            spawned,
            close(exitCode, reason) {
              done({
                stdOut,
                stdErr,
                exitCode,
                rejection: rejection || reason
              });
            },
            kill(reason) {
              if (spawned.killed) {
                return;
              }
              rejection = reason;
              spawned.kill("SIGINT");
            }
          });
        });
      }
      _beforeSpawn(task, args) {
        let rejection;
        this._plugins.exec("spawn.before", void 0, {
          ...pluginContext(task, args),
          kill(reason) {
            rejection = reason || rejection;
          }
        });
        return rejection;
      }
    };
  }
});
var git_executor_exports = {};
__export2(git_executor_exports, {
  GitExecutor: () => GitExecutor
});
var GitExecutor;
var init_git_executor = __esm({
  "src/lib/runners/git-executor.ts"() {
    "use strict";
    init_git_executor_chain();
    GitExecutor = class {
      constructor(cwd, _scheduler, _plugins) {
        this.cwd = cwd;
        this._scheduler = _scheduler;
        this._plugins = _plugins;
        this._chain = new GitExecutorChain(this, this._scheduler, this._plugins);
      }
      chain() {
        return new GitExecutorChain(this, this._scheduler, this._plugins);
      }
      push(task) {
        return this._chain.push(task);
      }
    };
  }
});
function taskCallback(task, response, callback = NOOP) {
  const onSuccess = (data) => {
    callback(null, data);
  };
  const onError2 = (err) => {
    if (err?.task === task) {
      callback(
        err instanceof GitResponseError ? addDeprecationNoticeToError(err) : err,
        void 0
      );
    }
  };
  response.then(onSuccess, onError2);
}
function addDeprecationNoticeToError(err) {
  let log = (name) => {
    console.warn(
      `simple-git deprecation notice: accessing GitResponseError.${name} should be GitResponseError.git.${name}, this will no longer be available in version 3`
    );
    log = NOOP;
  };
  return Object.create(err, Object.getOwnPropertyNames(err.git).reduce(descriptorReducer, {}));
  function descriptorReducer(all, name) {
    if (name in err) {
      return all;
    }
    all[name] = {
      enumerable: false,
      configurable: false,
      get() {
        log(name);
        return err.git[name];
      }
    };
    return all;
  }
}
var init_task_callback = __esm({
  "src/lib/task-callback.ts"() {
    "use strict";
    init_git_response_error();
    init_utils();
  }
});
function changeWorkingDirectoryTask(directory, root) {
  return adhocExecTask((instance) => {
    if (!folderExists(directory)) {
      throw new Error(`Git.cwd: cannot change to non-directory "${directory}"`);
    }
    return (root || instance).cwd = directory;
  });
}
var init_change_working_directory = __esm({
  "src/lib/tasks/change-working-directory.ts"() {
    "use strict";
    init_utils();
    init_task();
  }
});
function checkoutTask(args) {
  const commands29 = ["checkout", ...args];
  if (commands29[1] === "-b" && commands29.includes("-B")) {
    commands29[1] = remove(commands29, "-B");
  }
  return straightThroughStringTask(commands29);
}
function checkout_default() {
  return {
    checkout() {
      return this._runTask(
        checkoutTask(getTrailingOptions(arguments, 1)),
        trailingFunctionArgument(arguments)
      );
    },
    checkoutBranch(branchName, startPoint) {
      return this._runTask(
        checkoutTask(["-b", branchName, startPoint, ...getTrailingOptions(arguments)]),
        trailingFunctionArgument(arguments)
      );
    },
    checkoutLocalBranch(branchName) {
      return this._runTask(
        checkoutTask(["-b", branchName, ...getTrailingOptions(arguments)]),
        trailingFunctionArgument(arguments)
      );
    }
  };
}
var init_checkout = __esm({
  "src/lib/tasks/checkout.ts"() {
    "use strict";
    init_utils();
    init_task();
  }
});
function countObjectsResponse() {
  return {
    count: 0,
    garbage: 0,
    inPack: 0,
    packs: 0,
    prunePackable: 0,
    size: 0,
    sizeGarbage: 0,
    sizePack: 0
  };
}
function count_objects_default() {
  return {
    countObjects() {
      return this._runTask({
        commands: ["count-objects", "--verbose"],
        format: "utf-8",
        parser(stdOut) {
          return parseStringResponse(countObjectsResponse(), [parser2], stdOut);
        }
      });
    }
  };
}
var parser2;
var init_count_objects = __esm({
  "src/lib/tasks/count-objects.ts"() {
    "use strict";
    init_utils();
    parser2 = new LineParser(
      /([a-z-]+): (\d+)$/,
      (result, [key, value]) => {
        const property = asCamelCase(key);
        if (Object.hasOwn(result, property)) {
          result[property] = asNumber(value);
        }
      }
    );
  }
});
function parseCommitResult(stdOut) {
  const result = {
    author: null,
    branch: "",
    commit: "",
    root: false,
    summary: {
      changes: 0,
      insertions: 0,
      deletions: 0
    }
  };
  return parseStringResponse(result, parsers, stdOut);
}
var parsers;
var init_parse_commit = __esm({
  "src/lib/parsers/parse-commit.ts"() {
    "use strict";
    init_utils();
    parsers = [
      new LineParser(/^\[([^\s]+)( \([^)]+\))? ([^\]]+)/, (result, [branch, root, commit]) => {
        result.branch = branch;
        result.commit = commit;
        result.root = !!root;
      }),
      new LineParser(/\s*Author:\s(.+)/i, (result, [author]) => {
        const parts = author.split("<");
        const email = parts.pop();
        if (!email || !email.includes("@")) {
          return;
        }
        result.author = {
          email: email.substr(0, email.length - 1),
          name: parts.join("<").trim()
        };
      }),
      new LineParser(
        /(\d+)[^,]*(?:,\s*(\d+)[^,]*)(?:,\s*(\d+))/g,
        (result, [changes, insertions, deletions]) => {
          result.summary.changes = parseInt(changes, 10) || 0;
          result.summary.insertions = parseInt(insertions, 10) || 0;
          result.summary.deletions = parseInt(deletions, 10) || 0;
        }
      ),
      new LineParser(
        /^(\d+)[^,]*(?:,\s*(\d+)[^(]+\(([+-]))?/,
        (result, [changes, lines, direction]) => {
          result.summary.changes = parseInt(changes, 10) || 0;
          const count = parseInt(lines, 10) || 0;
          if (direction === "-") {
            result.summary.deletions = count;
          } else if (direction === "+") {
            result.summary.insertions = count;
          }
        }
      )
    ];
  }
});
function commitTask(message, files, customArgs) {
  const commands29 = [
    "-c",
    "core.abbrev=40",
    "commit",
    ...prefixedArray(message, "-m"),
    ...files,
    ...customArgs
  ];
  return {
    commands: commands29,
    format: "utf-8",
    parser: parseCommitResult
  };
}
function commit_default() {
  return {
    commit(message, ...rest) {
      const next = trailingFunctionArgument(arguments);
      const task = rejectDeprecatedSignatures(message) || commitTask(
        asArray(message),
        asArray(filterType(rest[0], filterStringOrStringArray, [])),
        [
          ...asStringArray(filterType(rest[1], filterArray, [])),
          ...getTrailingOptions(arguments, 0, true)
        ]
      );
      return this._runTask(task, next);
    }
  };
  function rejectDeprecatedSignatures(message) {
    return !filterStringOrStringArray(message) && configurationErrorTask(
      `git.commit: requires the commit message to be supplied as a string/string[]`
    );
  }
}
var init_commit = __esm({
  "src/lib/tasks/commit.ts"() {
    "use strict";
    init_parse_commit();
    init_utils();
    init_task();
  }
});
function first_commit_default() {
  return {
    firstCommit() {
      return this._runTask(
        straightThroughStringTask(["rev-list", "--max-parents=0", "HEAD"], true),
        trailingFunctionArgument(arguments)
      );
    }
  };
}
var init_first_commit = __esm({
  "src/lib/tasks/first-commit.ts"() {
    "use strict";
    init_utils();
    init_task();
  }
});
function hashObjectTask(filePath, write) {
  const commands29 = ["hash-object", filePath];
  if (write) {
    commands29.push("-w");
  }
  return straightThroughStringTask(commands29, true);
}
var init_hash_object = __esm({
  "src/lib/tasks/hash-object.ts"() {
    "use strict";
    init_task();
  }
});
function parseInit(bare, path37, text) {
  const response = String(text).trim();
  let result;
  if (result = initResponseRegex.exec(response)) {
    return new InitSummary(bare, path37, false, result[1]);
  }
  if (result = reInitResponseRegex.exec(response)) {
    return new InitSummary(bare, path37, true, result[1]);
  }
  let gitDir = "";
  const tokens = response.split(" ");
  while (tokens.length) {
    const token = tokens.shift();
    if (token === "in") {
      gitDir = tokens.join(" ");
      break;
    }
  }
  return new InitSummary(bare, path37, /^re/i.test(response), gitDir);
}
var InitSummary;
var initResponseRegex;
var reInitResponseRegex;
var init_InitSummary = __esm({
  "src/lib/responses/InitSummary.ts"() {
    "use strict";
    InitSummary = class {
      constructor(bare, path37, existing, gitDir) {
        this.bare = bare;
        this.path = path37;
        this.existing = existing;
        this.gitDir = gitDir;
      }
    };
    initResponseRegex = /^Init.+ repository in (.+)$/;
    reInitResponseRegex = /^Rein.+ in (.+)$/;
  }
});
function hasBareCommand(command) {
  return command.includes(bareCommand);
}
function initTask(bare = false, path37, customArgs) {
  const commands29 = ["init", ...customArgs];
  if (bare && !hasBareCommand(commands29)) {
    commands29.splice(1, 0, bareCommand);
  }
  return {
    commands: commands29,
    format: "utf-8",
    parser(text) {
      return parseInit(commands29.includes("--bare"), path37, text);
    }
  };
}
var bareCommand;
var init_init = __esm({
  "src/lib/tasks/init.ts"() {
    "use strict";
    init_InitSummary();
    bareCommand = "--bare";
  }
});
function logFormatFromCommand(customArgs) {
  for (let i2 = 0; i2 < customArgs.length; i2++) {
    const format = logFormatRegex.exec(customArgs[i2]);
    if (format) {
      return `--${format[1]}`;
    }
  }
  return "";
}
function isLogFormat(customArg) {
  return logFormatRegex.test(customArg);
}
var logFormatRegex;
var init_log_format = __esm({
  "src/lib/args/log-format.ts"() {
    "use strict";
    logFormatRegex = /^--(stat|numstat|name-only|name-status)(=|$)/;
  }
});
var DiffSummary;
var init_DiffSummary = __esm({
  "src/lib/responses/DiffSummary.ts"() {
    "use strict";
    DiffSummary = class {
      constructor() {
        this.changed = 0;
        this.deletions = 0;
        this.insertions = 0;
        this.files = [];
      }
    };
  }
});
function getDiffParser(format = "") {
  const parser4 = diffSummaryParsers[format];
  return (stdOut) => parseStringResponse(new DiffSummary(), parser4, stdOut, false);
}
var statParser;
var numStatParser;
var nameOnlyParser;
var nameStatusParser;
var diffSummaryParsers;
var init_parse_diff_summary = __esm({
  "src/lib/parsers/parse-diff-summary.ts"() {
    "use strict";
    init_log_format();
    init_DiffSummary();
    init_diff_name_status();
    init_utils();
    statParser = [
      new LineParser(
        /^(.+)\s+\|\s+(\d+)(\s+[+\-]+)?$/,
        (result, [file, changes, alterations = ""]) => {
          result.files.push({
            file: file.trim(),
            changes: asNumber(changes),
            insertions: alterations.replace(/[^+]/g, "").length,
            deletions: alterations.replace(/[^-]/g, "").length,
            binary: false
          });
        }
      ),
      new LineParser(
        /^(.+) \|\s+Bin ([0-9.]+) -> ([0-9.]+) ([a-z]+)/,
        (result, [file, before, after]) => {
          result.files.push({
            file: file.trim(),
            before: asNumber(before),
            after: asNumber(after),
            binary: true
          });
        }
      ),
      new LineParser(
        /(\d+) files? changed\s*((?:, \d+ [^,]+){0,2})/,
        (result, [changed, summary]) => {
          const inserted = /(\d+) i/.exec(summary);
          const deleted = /(\d+) d/.exec(summary);
          result.changed = asNumber(changed);
          result.insertions = asNumber(inserted?.[1]);
          result.deletions = asNumber(deleted?.[1]);
        }
      )
    ];
    numStatParser = [
      new LineParser(
        /(\d+)\t(\d+)\t(.+)$/,
        (result, [changesInsert, changesDelete, file]) => {
          const insertions = asNumber(changesInsert);
          const deletions = asNumber(changesDelete);
          result.changed++;
          result.insertions += insertions;
          result.deletions += deletions;
          result.files.push({
            file,
            changes: insertions + deletions,
            insertions,
            deletions,
            binary: false
          });
        }
      ),
      new LineParser(/-\t-\t(.+)$/, (result, [file]) => {
        result.changed++;
        result.files.push({
          file,
          after: 0,
          before: 0,
          binary: true
        });
      })
    ];
    nameOnlyParser = [
      new LineParser(/(.+)$/, (result, [file]) => {
        result.changed++;
        result.files.push({
          file,
          changes: 0,
          insertions: 0,
          deletions: 0,
          binary: false
        });
      })
    ];
    nameStatusParser = [
      new LineParser(
        /([ACDMRTUXB])([0-9]{0,3})\t(.[^\t]*)(\t(.[^\t]*))?$/,
        (result, [status, similarity, from, _to, to]) => {
          result.changed++;
          result.files.push({
            file: to ?? from,
            changes: 0,
            insertions: 0,
            deletions: 0,
            binary: false,
            status: orVoid(isDiffNameStatus(status) && status),
            from: orVoid(!!to && from !== to && from),
            similarity: asNumber(similarity)
          });
        }
      )
    ];
    diffSummaryParsers = {
      [
        ""
        /* NONE */
      ]: statParser,
      [
        "--stat"
        /* STAT */
      ]: statParser,
      [
        "--numstat"
        /* NUM_STAT */
      ]: numStatParser,
      [
        "--name-status"
        /* NAME_STATUS */
      ]: nameStatusParser,
      [
        "--name-only"
        /* NAME_ONLY */
      ]: nameOnlyParser
    };
  }
});
function lineBuilder(tokens, fields) {
  return fields.reduce(
    (line, field, index) => {
      line[field] = tokens[index] || "";
      return line;
    },
    /* @__PURE__ */ Object.create({ diff: null })
  );
}
function createListLogSummaryParser(splitter = SPLITTER, fields = defaultFieldNames, logFormat = "") {
  const parseDiffResult = getDiffParser(logFormat);
  return function(stdOut) {
    const all = toLinesWithContent(
      stdOut.trim(),
      false,
      START_BOUNDARY
    ).map(function(item) {
      const lineDetail = item.split(COMMIT_BOUNDARY);
      const listLogLine = lineBuilder(lineDetail[0].split(splitter), fields);
      if (lineDetail.length > 1 && !!lineDetail[1].trim()) {
        listLogLine.diff = parseDiffResult(lineDetail[1]);
      }
      return listLogLine;
    });
    return {
      all,
      latest: all.length && all[0] || null,
      total: all.length
    };
  };
}
var START_BOUNDARY;
var COMMIT_BOUNDARY;
var SPLITTER;
var defaultFieldNames;
var init_parse_list_log_summary = __esm({
  "src/lib/parsers/parse-list-log-summary.ts"() {
    "use strict";
    init_utils();
    init_parse_diff_summary();
    init_log_format();
    START_BOUNDARY = "\xF2\xF2\xF2\xF2\xF2\xF2 ";
    COMMIT_BOUNDARY = " \xF2\xF2";
    SPLITTER = " \xF2 ";
    defaultFieldNames = ["hash", "date", "message", "refs", "author_name", "author_email"];
  }
});
var diff_exports = {};
__export2(diff_exports, {
  diffSummaryTask: () => diffSummaryTask,
  validateLogFormatConfig: () => validateLogFormatConfig
});
function diffSummaryTask(customArgs) {
  let logFormat = logFormatFromCommand(customArgs);
  const commands29 = ["diff"];
  if (logFormat === "") {
    logFormat = "--stat";
    commands29.push("--stat=4096");
  }
  commands29.push(...customArgs);
  return validateLogFormatConfig(commands29) || {
    commands: commands29,
    format: "utf-8",
    parser: getDiffParser(logFormat)
  };
}
function validateLogFormatConfig(customArgs) {
  const flags = customArgs.filter(isLogFormat);
  if (flags.length > 1) {
    return configurationErrorTask(
      `Summary flags are mutually exclusive - pick one of ${flags.join(",")}`
    );
  }
  if (flags.length && customArgs.includes("-z")) {
    return configurationErrorTask(
      `Summary flag ${flags} parsing is not compatible with null termination option '-z'`
    );
  }
}
var init_diff = __esm({
  "src/lib/tasks/diff.ts"() {
    "use strict";
    init_log_format();
    init_parse_diff_summary();
    init_task();
  }
});
function prettyFormat(format, splitter) {
  const fields = [];
  const formatStr = [];
  Object.keys(format).forEach((field) => {
    fields.push(field);
    formatStr.push(String(format[field]));
  });
  return [fields, formatStr.join(splitter)];
}
function userOptions(input) {
  return Object.keys(input).reduce((out, key) => {
    if (!(key in excludeOptions)) {
      out[key] = input[key];
    }
    return out;
  }, {});
}
function parseLogOptions(opt = {}, customArgs = []) {
  const splitter = filterType(opt.splitter, filterString, SPLITTER);
  const format = filterPlainObject(opt.format) ? opt.format : {
    hash: "%H",
    date: opt.strictDate === false ? "%ai" : "%aI",
    message: "%s",
    refs: "%D",
    body: opt.multiLine ? "%B" : "%b",
    author_name: opt.mailMap !== false ? "%aN" : "%an",
    author_email: opt.mailMap !== false ? "%aE" : "%ae"
  };
  const [fields, formatStr] = prettyFormat(format, splitter);
  const suffix = [];
  const command = [
    `--pretty=format:${START_BOUNDARY}${formatStr}${COMMIT_BOUNDARY}`,
    ...customArgs
  ];
  const maxCount = opt.n || opt["max-count"] || opt.maxCount;
  if (maxCount) {
    command.push(`--max-count=${maxCount}`);
  }
  if (opt.from || opt.to) {
    const rangeOperator = opt.symmetric !== false ? "..." : "..";
    suffix.push(`${opt.from || ""}${rangeOperator}${opt.to || ""}`);
  }
  if (filterString(opt.file)) {
    command.push("--follow", c(opt.file));
  }
  appendTaskOptions(userOptions(opt), command);
  return {
    fields,
    splitter,
    commands: [...command, ...suffix]
  };
}
function logTask(splitter, fields, customArgs) {
  const parser4 = createListLogSummaryParser(splitter, fields, logFormatFromCommand(customArgs));
  return {
    commands: ["log", ...customArgs],
    format: "utf-8",
    parser: parser4
  };
}
function log_default() {
  return {
    log(...rest) {
      const next = trailingFunctionArgument(arguments);
      const options = parseLogOptions(
        trailingOptionsArgument(arguments),
        asStringArray(filterType(arguments[0], filterArray, []))
      );
      const task = rejectDeprecatedSignatures(...rest) || validateLogFormatConfig(options.commands) || createLogTask(options);
      return this._runTask(task, next);
    }
  };
  function createLogTask(options) {
    return logTask(options.splitter, options.fields, options.commands);
  }
  function rejectDeprecatedSignatures(from, to) {
    return filterString(from) && filterString(to) && configurationErrorTask(
      `git.log(string, string) should be replaced with git.log({ from: string, to: string })`
    );
  }
}
var excludeOptions;
var init_log = __esm({
  "src/lib/tasks/log.ts"() {
    "use strict";
    init_log_format();
    init_parse_list_log_summary();
    init_utils();
    init_task();
    init_diff();
    excludeOptions = /* @__PURE__ */ ((excludeOptions2) => {
      excludeOptions2[excludeOptions2["--pretty"] = 0] = "--pretty";
      excludeOptions2[excludeOptions2["max-count"] = 1] = "max-count";
      excludeOptions2[excludeOptions2["maxCount"] = 2] = "maxCount";
      excludeOptions2[excludeOptions2["n"] = 3] = "n";
      excludeOptions2[excludeOptions2["file"] = 4] = "file";
      excludeOptions2[excludeOptions2["format"] = 5] = "format";
      excludeOptions2[excludeOptions2["from"] = 6] = "from";
      excludeOptions2[excludeOptions2["to"] = 7] = "to";
      excludeOptions2[excludeOptions2["splitter"] = 8] = "splitter";
      excludeOptions2[excludeOptions2["symmetric"] = 9] = "symmetric";
      excludeOptions2[excludeOptions2["mailMap"] = 10] = "mailMap";
      excludeOptions2[excludeOptions2["multiLine"] = 11] = "multiLine";
      excludeOptions2[excludeOptions2["strictDate"] = 12] = "strictDate";
      return excludeOptions2;
    })(excludeOptions || {});
  }
});
var MergeSummaryConflict;
var MergeSummaryDetail;
var init_MergeSummary = __esm({
  "src/lib/responses/MergeSummary.ts"() {
    "use strict";
    MergeSummaryConflict = class {
      constructor(reason, file = null, meta) {
        this.reason = reason;
        this.file = file;
        this.meta = meta;
      }
      toString() {
        return `${this.file}:${this.reason}`;
      }
    };
    MergeSummaryDetail = class {
      constructor() {
        this.conflicts = [];
        this.merges = [];
        this.result = "success";
      }
      get failed() {
        return this.conflicts.length > 0;
      }
      get reason() {
        return this.result;
      }
      toString() {
        if (this.conflicts.length) {
          return `CONFLICTS: ${this.conflicts.join(", ")}`;
        }
        return "OK";
      }
    };
  }
});
var PullSummary;
var PullFailedSummary;
var init_PullSummary = __esm({
  "src/lib/responses/PullSummary.ts"() {
    "use strict";
    PullSummary = class {
      constructor() {
        this.remoteMessages = {
          all: []
        };
        this.created = [];
        this.deleted = [];
        this.files = [];
        this.deletions = {};
        this.insertions = {};
        this.summary = {
          changes: 0,
          deletions: 0,
          insertions: 0
        };
      }
    };
    PullFailedSummary = class {
      constructor() {
        this.remote = "";
        this.hash = {
          local: "",
          remote: ""
        };
        this.branch = {
          local: "",
          remote: ""
        };
        this.message = "";
      }
      toString() {
        return this.message;
      }
    };
  }
});
function objectEnumerationResult(remoteMessages) {
  return remoteMessages.objects = remoteMessages.objects || {
    compressing: 0,
    counting: 0,
    enumerating: 0,
    packReused: 0,
    reused: { count: 0, delta: 0 },
    total: { count: 0, delta: 0 }
  };
}
function asObjectCount(source) {
  const count = /^\s*(\d+)/.exec(source);
  const delta2 = /delta (\d+)/i.exec(source);
  return {
    count: asNumber(count && count[1] || "0"),
    delta: asNumber(delta2 && delta2[1] || "0")
  };
}
var remoteMessagesObjectParsers;
var init_parse_remote_objects = __esm({
  "src/lib/parsers/parse-remote-objects.ts"() {
    "use strict";
    init_utils();
    remoteMessagesObjectParsers = [
      new RemoteLineParser(
        /^remote:\s*(enumerating|counting|compressing) objects: (\d+),/i,
        (result, [action, count]) => {
          const key = action.toLowerCase();
          const enumeration = objectEnumerationResult(result.remoteMessages);
          Object.assign(enumeration, { [key]: asNumber(count) });
        }
      ),
      new RemoteLineParser(
        /^remote:\s*(enumerating|counting|compressing) objects: \d+% \(\d+\/(\d+)\),/i,
        (result, [action, count]) => {
          const key = action.toLowerCase();
          const enumeration = objectEnumerationResult(result.remoteMessages);
          Object.assign(enumeration, { [key]: asNumber(count) });
        }
      ),
      new RemoteLineParser(
        /total ([^,]+), reused ([^,]+), pack-reused (\d+)/i,
        (result, [total, reused, packReused]) => {
          const objects = objectEnumerationResult(result.remoteMessages);
          objects.total = asObjectCount(total);
          objects.reused = asObjectCount(reused);
          objects.packReused = asNumber(packReused);
        }
      )
    ];
  }
});
function parseRemoteMessages(_stdOut, stdErr) {
  return parseStringResponse({ remoteMessages: new RemoteMessageSummary() }, parsers2, stdErr);
}
var parsers2;
var RemoteMessageSummary;
var init_parse_remote_messages = __esm({
  "src/lib/parsers/parse-remote-messages.ts"() {
    "use strict";
    init_utils();
    init_parse_remote_objects();
    parsers2 = [
      new RemoteLineParser(/^remote:\s*(.+)$/, (result, [text]) => {
        result.remoteMessages.all.push(text.trim());
        return false;
      }),
      ...remoteMessagesObjectParsers,
      new RemoteLineParser(
        [/create a (?:pull|merge) request/i, /\s(https?:\/\/\S+)$/],
        (result, [pullRequestUrl]) => {
          result.remoteMessages.pullRequestUrl = pullRequestUrl;
        }
      ),
      new RemoteLineParser(
        [/found (\d+) vulnerabilities.+\(([^)]+)\)/i, /\s(https?:\/\/\S+)$/],
        (result, [count, summary, url]) => {
          result.remoteMessages.vulnerabilities = {
            count: asNumber(count),
            summary,
            url
          };
        }
      )
    ];
    RemoteMessageSummary = class {
      constructor() {
        this.all = [];
      }
    };
  }
});
function parsePullErrorResult(stdOut, stdErr) {
  const pullError = parseStringResponse(new PullFailedSummary(), errorParsers, [stdOut, stdErr]);
  return pullError.message && pullError;
}
var FILE_UPDATE_REGEX;
var SUMMARY_REGEX;
var ACTION_REGEX;
var parsers3;
var errorParsers;
var parsePullDetail;
var parsePullResult;
var init_parse_pull = __esm({
  "src/lib/parsers/parse-pull.ts"() {
    "use strict";
    init_PullSummary();
    init_utils();
    init_parse_remote_messages();
    FILE_UPDATE_REGEX = /^\s*(.+?)\s+\|\s+\d+\s*(\+*)(-*)/;
    SUMMARY_REGEX = /(\d+)\D+((\d+)\D+\(\+\))?(\D+(\d+)\D+\(-\))?/;
    ACTION_REGEX = /^(create|delete) mode \d+ (.+)/;
    parsers3 = [
      new LineParser(FILE_UPDATE_REGEX, (result, [file, insertions, deletions]) => {
        result.files.push(file);
        if (insertions) {
          result.insertions[file] = insertions.length;
        }
        if (deletions) {
          result.deletions[file] = deletions.length;
        }
      }),
      new LineParser(SUMMARY_REGEX, (result, [changes, , insertions, , deletions]) => {
        if (insertions !== void 0 || deletions !== void 0) {
          result.summary.changes = +changes || 0;
          result.summary.insertions = +insertions || 0;
          result.summary.deletions = +deletions || 0;
          return true;
        }
        return false;
      }),
      new LineParser(ACTION_REGEX, (result, [action, file]) => {
        append(result.files, file);
        append(action === "create" ? result.created : result.deleted, file);
      })
    ];
    errorParsers = [
      new LineParser(/^from\s(.+)$/i, (result, [remote]) => void (result.remote = remote)),
      new LineParser(/^fatal:\s(.+)$/, (result, [message]) => void (result.message = message)),
      new LineParser(
        /([a-z0-9]+)\.\.([a-z0-9]+)\s+(\S+)\s+->\s+(\S+)$/,
        (result, [hashLocal, hashRemote, branchLocal, branchRemote]) => {
          result.branch.local = branchLocal;
          result.hash.local = hashLocal;
          result.branch.remote = branchRemote;
          result.hash.remote = hashRemote;
        }
      )
    ];
    parsePullDetail = (stdOut, stdErr) => {
      return parseStringResponse(new PullSummary(), parsers3, [stdOut, stdErr]);
    };
    parsePullResult = (stdOut, stdErr) => {
      return Object.assign(
        new PullSummary(),
        parsePullDetail(stdOut, stdErr),
        parseRemoteMessages(stdOut, stdErr)
      );
    };
  }
});
var parsers4;
var parseMergeResult;
var parseMergeDetail;
var init_parse_merge = __esm({
  "src/lib/parsers/parse-merge.ts"() {
    "use strict";
    init_MergeSummary();
    init_utils();
    init_parse_pull();
    parsers4 = [
      new LineParser(/^Auto-merging\s+(.+)$/, (summary, [autoMerge]) => {
        summary.merges.push(autoMerge);
      }),
      new LineParser(/^CONFLICT\s+\((.+)\): Merge conflict in (.+)$/, (summary, [reason, file]) => {
        summary.conflicts.push(new MergeSummaryConflict(reason, file));
      }),
      new LineParser(
        /^CONFLICT\s+\((.+\/delete)\): (.+) deleted in (.+) and/,
        (summary, [reason, file, deleteRef]) => {
          summary.conflicts.push(new MergeSummaryConflict(reason, file, { deleteRef }));
        }
      ),
      new LineParser(/^CONFLICT\s+\((.+)\):/, (summary, [reason]) => {
        summary.conflicts.push(new MergeSummaryConflict(reason, null));
      }),
      new LineParser(/^Automatic merge failed;\s+(.+)$/, (summary, [result]) => {
        summary.result = result;
      })
    ];
    parseMergeResult = (stdOut, stdErr) => {
      return Object.assign(parseMergeDetail(stdOut, stdErr), parsePullResult(stdOut, stdErr));
    };
    parseMergeDetail = (stdOut) => {
      return parseStringResponse(new MergeSummaryDetail(), parsers4, stdOut);
    };
  }
});
function mergeTask(customArgs) {
  if (!customArgs.length) {
    return configurationErrorTask("Git.merge requires at least one option");
  }
  return {
    commands: ["merge", ...customArgs],
    format: "utf-8",
    parser(stdOut, stdErr) {
      const merge = parseMergeResult(stdOut, stdErr);
      if (merge.failed) {
        throw new GitResponseError(merge);
      }
      return merge;
    }
  };
}
var init_merge = __esm({
  "src/lib/tasks/merge.ts"() {
    "use strict";
    init_git_response_error();
    init_parse_merge();
    init_task();
  }
});
function pushResultPushedItem(local, remote, status) {
  const deleted = status.includes("deleted");
  const tag = status.includes("tag") || /^refs\/tags/.test(local);
  const alreadyUpdated = !status.includes("new");
  return {
    deleted,
    tag,
    branch: !tag,
    new: !alreadyUpdated,
    alreadyUpdated,
    local,
    remote
  };
}
var parsers5;
var parsePushResult;
var parsePushDetail;
var init_parse_push = __esm({
  "src/lib/parsers/parse-push.ts"() {
    "use strict";
    init_utils();
    init_parse_remote_messages();
    parsers5 = [
      new LineParser(/^Pushing to (.+)$/, (result, [repo]) => {
        result.repo = repo;
      }),
      new LineParser(/^updating local tracking ref '(.+)'/, (result, [local]) => {
        result.ref = {
          ...result.ref || {},
          local
        };
      }),
      new LineParser(/^[=*-]\s+([^:]+):(\S+)\s+\[(.+)]$/, (result, [local, remote, type]) => {
        result.pushed.push(pushResultPushedItem(local, remote, type));
      }),
      new LineParser(
        /^Branch '([^']+)' set up to track remote branch '([^']+)' from '([^']+)'/,
        (result, [local, remote, remoteName]) => {
          result.branch = {
            ...result.branch || {},
            local,
            remote,
            remoteName
          };
        }
      ),
      new LineParser(
        /^([^:]+):(\S+)\s+([a-z0-9]+)\.\.([a-z0-9]+)$/,
        (result, [local, remote, from, to]) => {
          result.update = {
            head: {
              local,
              remote
            },
            hash: {
              from,
              to
            }
          };
        }
      )
    ];
    parsePushResult = (stdOut, stdErr) => {
      const pushDetail = parsePushDetail(stdOut, stdErr);
      const responseDetail = parseRemoteMessages(stdOut, stdErr);
      return {
        ...pushDetail,
        ...responseDetail
      };
    };
    parsePushDetail = (stdOut, stdErr) => {
      return parseStringResponse({ pushed: [] }, parsers5, [stdOut, stdErr]);
    };
  }
});
var push_exports = {};
__export2(push_exports, {
  pushTagsTask: () => pushTagsTask,
  pushTask: () => pushTask
});
function pushTagsTask(ref = {}, customArgs) {
  append(customArgs, "--tags");
  return pushTask(ref, customArgs);
}
function pushTask(ref = {}, customArgs) {
  const commands29 = ["push", ...customArgs];
  if (ref.branch) {
    commands29.splice(1, 0, ref.branch);
  }
  if (ref.remote) {
    commands29.splice(1, 0, ref.remote);
  }
  remove(commands29, "-v");
  append(commands29, "--verbose");
  append(commands29, "--porcelain");
  return {
    commands: commands29,
    format: "utf-8",
    parser: parsePushResult
  };
}
var init_push = __esm({
  "src/lib/tasks/push.ts"() {
    "use strict";
    init_parse_push();
    init_utils();
  }
});
function show_default() {
  return {
    showBuffer() {
      const commands29 = ["show", ...getTrailingOptions(arguments, 1)];
      if (!commands29.includes("--binary")) {
        commands29.splice(1, 0, "--binary");
      }
      return this._runTask(
        straightThroughBufferTask(commands29),
        trailingFunctionArgument(arguments)
      );
    },
    show() {
      const commands29 = ["show", ...getTrailingOptions(arguments, 1)];
      return this._runTask(
        straightThroughStringTask(commands29),
        trailingFunctionArgument(arguments)
      );
    }
  };
}
var init_show = __esm({
  "src/lib/tasks/show.ts"() {
    "use strict";
    init_utils();
    init_task();
  }
});
var fromPathRegex;
var FileStatusSummary;
var init_FileStatusSummary = __esm({
  "src/lib/responses/FileStatusSummary.ts"() {
    "use strict";
    fromPathRegex = /^(.+)\0(.+)$/;
    FileStatusSummary = class {
      constructor(path37, index, working_dir) {
        this.path = path37;
        this.index = index;
        this.working_dir = working_dir;
        if (index === "R" || working_dir === "R") {
          const detail = fromPathRegex.exec(path37) || [null, path37, path37];
          this.from = detail[2] || "";
          this.path = detail[1] || "";
        }
      }
    };
  }
});
function renamedFile(line) {
  const [to, from] = line.split(NULL);
  return {
    from: from || to,
    to
  };
}
function parser3(indexX, indexY, handler) {
  return [`${indexX}${indexY}`, handler];
}
function conflicts(indexX, ...indexY) {
  return indexY.map((y2) => parser3(indexX, y2, (result, file) => result.conflicted.push(file)));
}
function splitLine(result, lineStr) {
  const trimmed2 = lineStr.trim();
  switch (" ") {
    case trimmed2.charAt(2):
      return data(trimmed2.charAt(0), trimmed2.charAt(1), trimmed2.slice(3));
    case trimmed2.charAt(1):
      return data(" ", trimmed2.charAt(0), trimmed2.slice(2));
    default:
      return;
  }
  function data(index, workingDir, path37) {
    const raw = `${index}${workingDir}`;
    const handler = parsers6.get(raw);
    if (handler) {
      handler(result, path37);
    }
    if (raw !== "##" && raw !== "!!") {
      result.files.push(new FileStatusSummary(path37, index, workingDir));
    }
  }
}
var StatusSummary;
var parsers6;
var parseStatusSummary;
var init_StatusSummary = __esm({
  "src/lib/responses/StatusSummary.ts"() {
    "use strict";
    init_utils();
    init_FileStatusSummary();
    StatusSummary = class {
      constructor() {
        this.not_added = [];
        this.conflicted = [];
        this.created = [];
        this.deleted = [];
        this.ignored = void 0;
        this.modified = [];
        this.renamed = [];
        this.files = [];
        this.staged = [];
        this.ahead = 0;
        this.behind = 0;
        this.current = null;
        this.tracking = null;
        this.detached = false;
        this.isClean = () => {
          return !this.files.length;
        };
      }
    };
    parsers6 = new Map([
      parser3(
        " ",
        "A",
        (result, file) => result.created.push(file)
      ),
      parser3(
        " ",
        "D",
        (result, file) => result.deleted.push(file)
      ),
      parser3(
        " ",
        "M",
        (result, file) => result.modified.push(file)
      ),
      parser3("A", " ", (result, file) => {
        result.created.push(file);
        result.staged.push(file);
      }),
      parser3("A", "M", (result, file) => {
        result.created.push(file);
        result.staged.push(file);
        result.modified.push(file);
      }),
      parser3("D", " ", (result, file) => {
        result.deleted.push(file);
        result.staged.push(file);
      }),
      parser3("M", " ", (result, file) => {
        result.modified.push(file);
        result.staged.push(file);
      }),
      parser3("M", "M", (result, file) => {
        result.modified.push(file);
        result.staged.push(file);
      }),
      parser3("R", " ", (result, file) => {
        result.renamed.push(renamedFile(file));
      }),
      parser3("R", "M", (result, file) => {
        const renamed = renamedFile(file);
        result.renamed.push(renamed);
        result.modified.push(renamed.to);
      }),
      parser3("!", "!", (_result, _file) => {
        (_result.ignored = _result.ignored || []).push(_file);
      }),
      parser3(
        "?",
        "?",
        (result, file) => result.not_added.push(file)
      ),
      ...conflicts(
        "A",
        "A",
        "U"
        /* UNMERGED */
      ),
      ...conflicts(
        "D",
        "D",
        "U"
        /* UNMERGED */
      ),
      ...conflicts(
        "U",
        "A",
        "D",
        "U"
        /* UNMERGED */
      ),
      [
        "##",
        (result, line) => {
          const aheadReg = /ahead (\d+)/;
          const behindReg = /behind (\d+)/;
          const currentReg = /^(.+?(?=(?:\.{3}|\s|$)))/;
          const trackingReg = /\.{3}(\S*)/;
          const onEmptyBranchReg = /\son\s(\S+?)(?=\.{3}|$)/;
          let regexResult = aheadReg.exec(line);
          result.ahead = regexResult && +regexResult[1] || 0;
          regexResult = behindReg.exec(line);
          result.behind = regexResult && +regexResult[1] || 0;
          regexResult = currentReg.exec(line);
          result.current = filterType(regexResult?.[1], filterString, null);
          regexResult = trackingReg.exec(line);
          result.tracking = filterType(regexResult?.[1], filterString, null);
          regexResult = onEmptyBranchReg.exec(line);
          if (regexResult) {
            result.current = filterType(regexResult?.[1], filterString, result.current);
          }
          result.detached = /\(no branch\)/.test(line);
        }
      ]
    ]);
    parseStatusSummary = function(text) {
      const lines = text.split(NULL);
      const status = new StatusSummary();
      for (let i2 = 0, l = lines.length; i2 < l; ) {
        let line = lines[i2++].trim();
        if (!line) {
          continue;
        }
        if (line.charAt(0) === "R") {
          line += NULL + (lines[i2++] || "");
        }
        splitLine(status, line);
      }
      return status;
    };
  }
});
function statusTask(customArgs) {
  const commands29 = [
    "status",
    "--porcelain",
    "-b",
    "-u",
    "--null",
    ...customArgs.filter((arg) => !ignoredOptions.includes(arg))
  ];
  return {
    format: "utf-8",
    commands: commands29,
    parser(text) {
      return parseStatusSummary(text);
    }
  };
}
var ignoredOptions;
var init_status = __esm({
  "src/lib/tasks/status.ts"() {
    "use strict";
    init_StatusSummary();
    ignoredOptions = ["--null", "-z"];
  }
});
function versionResponse(major = 0, minor = 0, patch = 0, agent = "", installed = true) {
  return Object.defineProperty(
    {
      major,
      minor,
      patch,
      agent,
      installed
    },
    "toString",
    {
      value() {
        return `${this.major}.${this.minor}.${this.patch}`;
      },
      configurable: false,
      enumerable: false
    }
  );
}
function notInstalledResponse() {
  return versionResponse(0, 0, 0, "", false);
}
function version_default() {
  return {
    version() {
      return this._runTask({
        commands: ["--version"],
        format: "utf-8",
        parser: versionParser,
        onError(result, error, done, fail) {
          if (result.exitCode === -2) {
            return done(Buffer.from(NOT_INSTALLED));
          }
          fail(error);
        }
      });
    }
  };
}
function versionParser(stdOut) {
  if (stdOut === NOT_INSTALLED) {
    return notInstalledResponse();
  }
  return parseStringResponse(versionResponse(0, 0, 0, stdOut), parsers7, stdOut);
}
var NOT_INSTALLED;
var parsers7;
var init_version = __esm({
  "src/lib/tasks/version.ts"() {
    "use strict";
    init_utils();
    NOT_INSTALLED = "installed=false";
    parsers7 = [
      new LineParser(
        /version (\d+)\.(\d+)\.(\d+)(?:\s*\((.+)\))?/,
        (result, [major, minor, patch, agent = ""]) => {
          Object.assign(
            result,
            versionResponse(asNumber(major), asNumber(minor), asNumber(patch), agent)
          );
        }
      ),
      new LineParser(
        /version (\d+)\.(\d+)\.(\D+)(.+)?$/,
        (result, [major, minor, patch, agent = ""]) => {
          Object.assign(result, versionResponse(asNumber(major), asNumber(minor), patch, agent));
        }
      )
    ];
  }
});
function createCloneTask(api, task, repoPath, ...args) {
  if (!filterString(repoPath)) {
    return configurationErrorTask(`git.${api}() requires a string 'repoPath'`);
  }
  return task(repoPath, filterType(args[0], filterString), getTrailingOptions(arguments));
}
function clone_default() {
  return {
    clone(repo, ...rest) {
      return this._runTask(
        createCloneTask("clone", cloneTask, filterType(repo, filterString), ...rest),
        trailingFunctionArgument(arguments)
      );
    },
    mirror(repo, ...rest) {
      return this._runTask(
        createCloneTask("mirror", cloneMirrorTask, filterType(repo, filterString), ...rest),
        trailingFunctionArgument(arguments)
      );
    }
  };
}
var cloneTask;
var cloneMirrorTask;
var init_clone = __esm({
  "src/lib/tasks/clone.ts"() {
    "use strict";
    init_task();
    init_utils();
    cloneTask = (repo, directory, customArgs) => {
      const commands29 = ["clone", ...customArgs];
      filterString(repo) && commands29.push(c(repo));
      filterString(directory) && commands29.push(c(directory));
      return straightThroughStringTask(commands29);
    };
    cloneMirrorTask = (repo, directory, customArgs) => {
      append(customArgs, "--mirror");
      return cloneTask(repo, directory, customArgs);
    };
  }
});
var simple_git_api_exports = {};
__export2(simple_git_api_exports, {
  SimpleGitApi: () => SimpleGitApi
});
var SimpleGitApi;
var init_simple_git_api = __esm({
  "src/lib/simple-git-api.ts"() {
    "use strict";
    init_task_callback();
    init_change_working_directory();
    init_checkout();
    init_count_objects();
    init_commit();
    init_config();
    init_first_commit();
    init_grep();
    init_hash_object();
    init_init();
    init_log();
    init_merge();
    init_push();
    init_show();
    init_status();
    init_task();
    init_version();
    init_utils();
    init_clone();
    SimpleGitApi = class {
      constructor(_executor) {
        this._executor = _executor;
      }
      _runTask(task, then) {
        const chain = this._executor.chain();
        const promise = chain.push(task);
        if (then) {
          taskCallback(task, promise, then);
        }
        return Object.create(this, {
          then: { value: promise.then.bind(promise) },
          catch: { value: promise.catch.bind(promise) },
          _executor: { value: chain }
        });
      }
      add(files) {
        return this._runTask(
          straightThroughStringTask(["add", ...asArray(files)]),
          trailingFunctionArgument(arguments)
        );
      }
      cwd(directory) {
        const next = trailingFunctionArgument(arguments);
        if (typeof directory === "string") {
          return this._runTask(changeWorkingDirectoryTask(directory, this._executor), next);
        }
        if (typeof directory?.path === "string") {
          return this._runTask(
            changeWorkingDirectoryTask(
              directory.path,
              directory.root && this._executor || void 0
            ),
            next
          );
        }
        return this._runTask(
          configurationErrorTask("Git.cwd: workingDirectory must be supplied as a string"),
          next
        );
      }
      hashObject(path37, write) {
        return this._runTask(
          hashObjectTask(path37, write === true),
          trailingFunctionArgument(arguments)
        );
      }
      init(bare) {
        return this._runTask(
          initTask(bare === true, this._executor.cwd, getTrailingOptions(arguments)),
          trailingFunctionArgument(arguments)
        );
      }
      merge() {
        return this._runTask(
          mergeTask(getTrailingOptions(arguments)),
          trailingFunctionArgument(arguments)
        );
      }
      mergeFromTo(remote, branch) {
        if (!(filterString(remote) && filterString(branch))) {
          return this._runTask(
            configurationErrorTask(
              `Git.mergeFromTo requires that the 'remote' and 'branch' arguments are supplied as strings`
            )
          );
        }
        return this._runTask(
          mergeTask([remote, branch, ...getTrailingOptions(arguments)]),
          trailingFunctionArgument(arguments, false)
        );
      }
      outputHandler(handler) {
        this._executor.outputHandler = handler;
        return this;
      }
      push() {
        const task = pushTask(
          {
            remote: filterType(arguments[0], filterString),
            branch: filterType(arguments[1], filterString)
          },
          getTrailingOptions(arguments)
        );
        return this._runTask(task, trailingFunctionArgument(arguments));
      }
      stash() {
        return this._runTask(
          straightThroughStringTask(["stash", ...getTrailingOptions(arguments)]),
          trailingFunctionArgument(arguments)
        );
      }
      status() {
        return this._runTask(
          statusTask(getTrailingOptions(arguments)),
          trailingFunctionArgument(arguments)
        );
      }
    };
    Object.assign(
      SimpleGitApi.prototype,
      checkout_default(),
      clone_default(),
      commit_default(),
      config_default(),
      count_objects_default(),
      first_commit_default(),
      grep_default(),
      log_default(),
      show_default(),
      version_default()
    );
  }
});
var scheduler_exports = {};
__export2(scheduler_exports, {
  Scheduler: () => Scheduler
});
var createScheduledTask;
var Scheduler;
var init_scheduler = __esm({
  "src/lib/runners/scheduler.ts"() {
    "use strict";
    init_utils();
    init_git_logger();
    createScheduledTask = /* @__PURE__ */ (() => {
      let id = 0;
      return () => {
        id++;
        const { promise, done } = (0, import_promise_deferred.createDeferred)();
        return {
          promise,
          done,
          id
        };
      };
    })();
    Scheduler = class {
      constructor(concurrency = 2) {
        this.concurrency = concurrency;
        this.logger = createLogger("", "scheduler");
        this.pending = [];
        this.running = [];
        this.logger(`Constructed, concurrency=%s`, concurrency);
      }
      schedule() {
        if (!this.pending.length || this.running.length >= this.concurrency) {
          this.logger(
            `Schedule attempt ignored, pending=%s running=%s concurrency=%s`,
            this.pending.length,
            this.running.length,
            this.concurrency
          );
          return;
        }
        const task = append(this.running, this.pending.shift());
        this.logger(`Attempting id=%s`, task.id);
        task.done(() => {
          this.logger(`Completing id=`, task.id);
          remove(this.running, task);
          this.schedule();
        });
      }
      next() {
        const { promise, id } = append(this.pending, createScheduledTask());
        this.logger(`Scheduling id=%s`, id);
        this.schedule();
        return promise;
      }
    };
  }
});
var apply_patch_exports = {};
__export2(apply_patch_exports, {
  applyPatchTask: () => applyPatchTask
});
function applyPatchTask(patches, customArgs) {
  return straightThroughStringTask(["apply", ...customArgs, ...patches]);
}
var init_apply_patch = __esm({
  "src/lib/tasks/apply-patch.ts"() {
    "use strict";
    init_task();
  }
});
function branchDeletionSuccess(branch, hash) {
  return {
    branch,
    hash,
    success: true
  };
}
function branchDeletionFailure(branch) {
  return {
    branch,
    hash: null,
    success: false
  };
}
var BranchDeletionBatch;
var init_BranchDeleteSummary = __esm({
  "src/lib/responses/BranchDeleteSummary.ts"() {
    "use strict";
    BranchDeletionBatch = class {
      constructor() {
        this.all = [];
        this.branches = {};
        this.errors = [];
      }
      get success() {
        return !this.errors.length;
      }
    };
  }
});
function hasBranchDeletionError(data, processExitCode) {
  return processExitCode === 1 && deleteErrorRegex.test(data);
}
var deleteSuccessRegex;
var deleteErrorRegex;
var parsers8;
var parseBranchDeletions;
var init_parse_branch_delete = __esm({
  "src/lib/parsers/parse-branch-delete.ts"() {
    "use strict";
    init_BranchDeleteSummary();
    init_utils();
    deleteSuccessRegex = /(\S+)\s+\(\S+\s([^)]+)\)/;
    deleteErrorRegex = /^error[^']+'([^']+)'/m;
    parsers8 = [
      new LineParser(deleteSuccessRegex, (result, [branch, hash]) => {
        const deletion = branchDeletionSuccess(branch, hash);
        result.all.push(deletion);
        result.branches[branch] = deletion;
      }),
      new LineParser(deleteErrorRegex, (result, [branch]) => {
        const deletion = branchDeletionFailure(branch);
        result.errors.push(deletion);
        result.all.push(deletion);
        result.branches[branch] = deletion;
      })
    ];
    parseBranchDeletions = (stdOut, stdErr) => {
      return parseStringResponse(new BranchDeletionBatch(), parsers8, [stdOut, stdErr]);
    };
  }
});
var BranchSummaryResult;
var init_BranchSummary = __esm({
  "src/lib/responses/BranchSummary.ts"() {
    "use strict";
    BranchSummaryResult = class {
      constructor() {
        this.all = [];
        this.branches = {};
        this.current = "";
        this.detached = false;
      }
      push(status, detached, name, commit, label) {
        if (status === "*") {
          this.detached = detached;
          this.current = name;
        }
        this.all.push(name);
        this.branches[name] = {
          current: status === "*",
          linkedWorkTree: status === "+",
          name,
          commit,
          label
        };
      }
    };
  }
});
function branchStatus(input) {
  return input ? input.charAt(0) : "";
}
function parseBranchSummary(stdOut, currentOnly = false) {
  return parseStringResponse(
    new BranchSummaryResult(),
    currentOnly ? [currentBranchParser] : parsers9,
    stdOut
  );
}
var parsers9;
var currentBranchParser;
var init_parse_branch = __esm({
  "src/lib/parsers/parse-branch.ts"() {
    "use strict";
    init_BranchSummary();
    init_utils();
    parsers9 = [
      new LineParser(
        /^([*+]\s)?\((?:HEAD )?detached (?:from|at) (\S+)\)\s+([a-z0-9]+)\s(.*)$/,
        (result, [current, name, commit, label]) => {
          result.push(branchStatus(current), true, name, commit, label);
        }
      ),
      new LineParser(
        /^([*+]\s)?(\S+)\s+([a-z0-9]+)\s?(.*)$/s,
        (result, [current, name, commit, label]) => {
          result.push(branchStatus(current), false, name, commit, label);
        }
      )
    ];
    currentBranchParser = new LineParser(/^(\S+)$/s, (result, [name]) => {
      result.push("*", false, name, "", "");
    });
  }
});
var branch_exports = {};
__export2(branch_exports, {
  branchLocalTask: () => branchLocalTask,
  branchTask: () => branchTask,
  containsDeleteBranchCommand: () => containsDeleteBranchCommand,
  deleteBranchTask: () => deleteBranchTask,
  deleteBranchesTask: () => deleteBranchesTask
});
function containsDeleteBranchCommand(commands29) {
  const deleteCommands = ["-d", "-D", "--delete"];
  return commands29.some((command) => deleteCommands.includes(command));
}
function branchTask(customArgs) {
  const isDelete = containsDeleteBranchCommand(customArgs);
  const isCurrentOnly = customArgs.includes("--show-current");
  const commands29 = ["branch", ...customArgs];
  if (commands29.length === 1) {
    commands29.push("-a");
  }
  if (!commands29.includes("-v")) {
    commands29.splice(1, 0, "-v");
  }
  return {
    format: "utf-8",
    commands: commands29,
    parser(stdOut, stdErr) {
      if (isDelete) {
        return parseBranchDeletions(stdOut, stdErr).all[0];
      }
      return parseBranchSummary(stdOut, isCurrentOnly);
    }
  };
}
function branchLocalTask() {
  return {
    format: "utf-8",
    commands: ["branch", "-v"],
    parser(stdOut) {
      return parseBranchSummary(stdOut);
    }
  };
}
function deleteBranchesTask(branches, forceDelete = false) {
  return {
    format: "utf-8",
    commands: ["branch", "-v", forceDelete ? "-D" : "-d", ...branches],
    parser(stdOut, stdErr) {
      return parseBranchDeletions(stdOut, stdErr);
    },
    onError({ exitCode, stdOut }, error, done, fail) {
      if (!hasBranchDeletionError(String(error), exitCode)) {
        return fail(error);
      }
      done(stdOut);
    }
  };
}
function deleteBranchTask(branch, forceDelete = false) {
  const task = {
    format: "utf-8",
    commands: ["branch", "-v", forceDelete ? "-D" : "-d", branch],
    parser(stdOut, stdErr) {
      return parseBranchDeletions(stdOut, stdErr).branches[branch];
    },
    onError({ exitCode, stdErr, stdOut }, error, _2, fail) {
      if (!hasBranchDeletionError(String(error), exitCode)) {
        return fail(error);
      }
      throw new GitResponseError(
        task.parser(bufferToString(stdOut), bufferToString(stdErr)),
        String(error)
      );
    }
  };
  return task;
}
var init_branch = __esm({
  "src/lib/tasks/branch.ts"() {
    "use strict";
    init_git_response_error();
    init_parse_branch_delete();
    init_parse_branch();
    init_utils();
  }
});
function toPath(input) {
  const path37 = input.trim().replace(/^["']|["']$/g, "");
  return path37 && (0, import_node_path.normalize)(path37);
}
var parseCheckIgnore;
var init_CheckIgnore = __esm({
  "src/lib/responses/CheckIgnore.ts"() {
    "use strict";
    parseCheckIgnore = (text) => {
      return text.split(/\n/g).map(toPath).filter(Boolean);
    };
  }
});
var check_ignore_exports = {};
__export2(check_ignore_exports, {
  checkIgnoreTask: () => checkIgnoreTask
});
function checkIgnoreTask(paths) {
  return {
    commands: ["check-ignore", ...paths],
    format: "utf-8",
    parser: parseCheckIgnore
  };
}
var init_check_ignore = __esm({
  "src/lib/tasks/check-ignore.ts"() {
    "use strict";
    init_CheckIgnore();
  }
});
function parseFetchResult(stdOut, stdErr) {
  const result = {
    raw: stdOut,
    remote: null,
    branches: [],
    tags: [],
    updated: [],
    deleted: []
  };
  return parseStringResponse(result, parsers10, [stdOut, stdErr]);
}
var parsers10;
var init_parse_fetch = __esm({
  "src/lib/parsers/parse-fetch.ts"() {
    "use strict";
    init_utils();
    parsers10 = [
      new LineParser(/From (.+)$/, (result, [remote]) => {
        result.remote = remote;
      }),
      new LineParser(/\* \[new branch]\s+(\S+)\s*-> (.+)$/, (result, [name, tracking]) => {
        result.branches.push({
          name,
          tracking
        });
      }),
      new LineParser(/\* \[new tag]\s+(\S+)\s*-> (.+)$/, (result, [name, tracking]) => {
        result.tags.push({
          name,
          tracking
        });
      }),
      new LineParser(/- \[deleted]\s+\S+\s*-> (.+)$/, (result, [tracking]) => {
        result.deleted.push({
          tracking
        });
      }),
      new LineParser(
        /\s*([^.]+)\.\.(\S+)\s+(\S+)\s*-> (.+)$/,
        (result, [from, to, name, tracking]) => {
          result.updated.push({
            name,
            tracking,
            to,
            from
          });
        }
      )
    ];
  }
});
var fetch_exports = {};
__export2(fetch_exports, {
  fetchTask: () => fetchTask
});
function disallowedCommand(command) {
  return /^--upload-pack(=|$)/.test(command);
}
function fetchTask(remote, branch, customArgs) {
  const commands29 = ["fetch", ...customArgs];
  if (remote && branch) {
    commands29.push(remote, branch);
  }
  const banned = commands29.find(disallowedCommand);
  if (banned) {
    return configurationErrorTask(`git.fetch: potential exploit argument blocked.`);
  }
  return {
    commands: commands29,
    format: "utf-8",
    parser: parseFetchResult
  };
}
var init_fetch = __esm({
  "src/lib/tasks/fetch.ts"() {
    "use strict";
    init_parse_fetch();
    init_task();
  }
});
function parseMoveResult(stdOut) {
  return parseStringResponse({ moves: [] }, parsers11, stdOut);
}
var parsers11;
var init_parse_move = __esm({
  "src/lib/parsers/parse-move.ts"() {
    "use strict";
    init_utils();
    parsers11 = [
      new LineParser(/^Renaming (.+) to (.+)$/, (result, [from, to]) => {
        result.moves.push({ from, to });
      })
    ];
  }
});
var move_exports = {};
__export2(move_exports, {
  moveTask: () => moveTask
});
function moveTask(from, to) {
  return {
    commands: ["mv", "-v", ...asArray(from), to],
    format: "utf-8",
    parser: parseMoveResult
  };
}
var init_move = __esm({
  "src/lib/tasks/move.ts"() {
    "use strict";
    init_parse_move();
    init_utils();
  }
});
var pull_exports = {};
__export2(pull_exports, {
  pullTask: () => pullTask
});
function pullTask(remote, branch, customArgs) {
  const commands29 = ["pull", ...customArgs];
  if (remote && branch) {
    commands29.splice(1, 0, remote, branch);
  }
  return {
    commands: commands29,
    format: "utf-8",
    parser(stdOut, stdErr) {
      return parsePullResult(stdOut, stdErr);
    },
    onError(result, _error, _done, fail) {
      const pullError = parsePullErrorResult(
        bufferToString(result.stdOut),
        bufferToString(result.stdErr)
      );
      if (pullError) {
        return fail(new GitResponseError(pullError));
      }
      fail(_error);
    }
  };
}
var init_pull = __esm({
  "src/lib/tasks/pull.ts"() {
    "use strict";
    init_git_response_error();
    init_parse_pull();
    init_utils();
  }
});
function parseGetRemotes(text) {
  const remotes = {};
  forEach(text, ([name]) => remotes[name] = { name });
  return Object.values(remotes);
}
function parseGetRemotesVerbose(text) {
  const remotes = {};
  forEach(text, ([name, url, purpose]) => {
    if (!Object.hasOwn(remotes, name)) {
      remotes[name] = {
        name,
        refs: { fetch: "", push: "" }
      };
    }
    if (purpose && url) {
      remotes[name].refs[purpose.replace(/[^a-z]/g, "")] = url;
    }
  });
  return Object.values(remotes);
}
function forEach(text, handler) {
  forEachLineWithContent(text, (line) => handler(line.split(/\s+/)));
}
var init_GetRemoteSummary = __esm({
  "src/lib/responses/GetRemoteSummary.ts"() {
    "use strict";
    init_utils();
  }
});
var remote_exports = {};
__export2(remote_exports, {
  addRemoteTask: () => addRemoteTask,
  getRemotesTask: () => getRemotesTask,
  listRemotesTask: () => listRemotesTask,
  remoteTask: () => remoteTask,
  removeRemoteTask: () => removeRemoteTask
});
function addRemoteTask(remoteName, remoteRepo, customArgs) {
  return straightThroughStringTask(["remote", "add", ...customArgs, remoteName, remoteRepo]);
}
function getRemotesTask(verbose) {
  const commands29 = ["remote"];
  if (verbose) {
    commands29.push("-v");
  }
  return {
    commands: commands29,
    format: "utf-8",
    parser: verbose ? parseGetRemotesVerbose : parseGetRemotes
  };
}
function listRemotesTask(customArgs) {
  const commands29 = [...customArgs];
  if (commands29[0] !== "ls-remote") {
    commands29.unshift("ls-remote");
  }
  return straightThroughStringTask(commands29);
}
function remoteTask(customArgs) {
  const commands29 = [...customArgs];
  if (commands29[0] !== "remote") {
    commands29.unshift("remote");
  }
  return straightThroughStringTask(commands29);
}
function removeRemoteTask(remoteName) {
  return straightThroughStringTask(["remote", "remove", remoteName]);
}
var init_remote = __esm({
  "src/lib/tasks/remote.ts"() {
    "use strict";
    init_GetRemoteSummary();
    init_task();
  }
});
var stash_list_exports = {};
__export2(stash_list_exports, {
  stashListTask: () => stashListTask
});
function stashListTask(opt = {}, customArgs) {
  const options = parseLogOptions(opt);
  const commands29 = ["stash", "list", ...options.commands, ...customArgs];
  const parser4 = createListLogSummaryParser(
    options.splitter,
    options.fields,
    logFormatFromCommand(commands29)
  );
  return validateLogFormatConfig(commands29) || {
    commands: commands29,
    format: "utf-8",
    parser: parser4
  };
}
var init_stash_list = __esm({
  "src/lib/tasks/stash-list.ts"() {
    "use strict";
    init_log_format();
    init_parse_list_log_summary();
    init_diff();
    init_log();
  }
});
var sub_module_exports = {};
__export2(sub_module_exports, {
  addSubModuleTask: () => addSubModuleTask,
  initSubModuleTask: () => initSubModuleTask,
  subModuleTask: () => subModuleTask,
  updateSubModuleTask: () => updateSubModuleTask
});
function addSubModuleTask(repo, path37) {
  return subModuleTask(["add", repo, path37]);
}
function initSubModuleTask(customArgs) {
  return subModuleTask(["init", ...customArgs]);
}
function subModuleTask(customArgs) {
  const commands29 = [...customArgs];
  if (commands29[0] !== "submodule") {
    commands29.unshift("submodule");
  }
  return straightThroughStringTask(commands29);
}
function updateSubModuleTask(customArgs) {
  return subModuleTask(["update", ...customArgs]);
}
var init_sub_module = __esm({
  "src/lib/tasks/sub-module.ts"() {
    "use strict";
    init_task();
  }
});
function singleSorted(a, b2) {
  const aIsNum = Number.isNaN(a);
  const bIsNum = Number.isNaN(b2);
  if (aIsNum !== bIsNum) {
    return aIsNum ? 1 : -1;
  }
  return aIsNum ? sorted(a, b2) : 0;
}
function sorted(a, b2) {
  return a === b2 ? 0 : a > b2 ? 1 : -1;
}
function trimmed(input) {
  return input.trim();
}
function toNumber(input) {
  if (typeof input === "string") {
    return parseInt(input.replace(/^\D+/g, ""), 10) || 0;
  }
  return 0;
}
var TagList;
var parseTagList;
var init_TagList = __esm({
  "src/lib/responses/TagList.ts"() {
    "use strict";
    TagList = class {
      constructor(all, latest) {
        this.all = all;
        this.latest = latest;
      }
    };
    parseTagList = function(data, customSort = false) {
      const tags = data.split("\n").map(trimmed).filter(Boolean);
      if (!customSort) {
        tags.sort(function(tagA, tagB) {
          const partsA = tagA.split(".");
          const partsB = tagB.split(".");
          if (partsA.length === 1 || partsB.length === 1) {
            return singleSorted(toNumber(partsA[0]), toNumber(partsB[0]));
          }
          for (let i2 = 0, l = Math.max(partsA.length, partsB.length); i2 < l; i2++) {
            const diff = sorted(toNumber(partsA[i2]), toNumber(partsB[i2]));
            if (diff) {
              return diff;
            }
          }
          return 0;
        });
      }
      const latest = customSort ? tags[0] : [...tags].reverse().find((tag) => tag.indexOf(".") >= 0);
      return new TagList(tags, latest);
    };
  }
});
var tag_exports = {};
__export2(tag_exports, {
  addAnnotatedTagTask: () => addAnnotatedTagTask,
  addTagTask: () => addTagTask,
  tagListTask: () => tagListTask
});
function tagListTask(customArgs = []) {
  const hasCustomSort = customArgs.some((option) => /^--sort=/.test(option));
  return {
    format: "utf-8",
    commands: ["tag", "-l", ...customArgs],
    parser(text) {
      return parseTagList(text, hasCustomSort);
    }
  };
}
function addTagTask(name) {
  return {
    format: "utf-8",
    commands: ["tag", name],
    parser() {
      return { name };
    }
  };
}
function addAnnotatedTagTask(name, tagMessage) {
  return {
    format: "utf-8",
    commands: ["tag", "-a", "-m", tagMessage, name],
    parser() {
      return { name };
    }
  };
}
var init_tag = __esm({
  "src/lib/tasks/tag.ts"() {
    "use strict";
    init_TagList();
  }
});
var require_git = __commonJS2({
  "src/git.js"(exports2, module2) {
    "use strict";
    var { GitExecutor: GitExecutor2 } = (init_git_executor(), __toCommonJS2(git_executor_exports));
    var { SimpleGitApi: SimpleGitApi2 } = (init_simple_git_api(), __toCommonJS2(simple_git_api_exports));
    var { Scheduler: Scheduler2 } = (init_scheduler(), __toCommonJS2(scheduler_exports));
    var { adhocExecTask: adhocExecTask2, configurationErrorTask: configurationErrorTask2 } = (init_task(), __toCommonJS2(task_exports));
    var {
      asArray: asArray2,
      filterArray: filterArray2,
      filterPrimitives: filterPrimitives2,
      filterString: filterString2,
      filterStringOrStringArray: filterStringOrStringArray2,
      filterType: filterType2,
      getTrailingOptions: getTrailingOptions2,
      trailingFunctionArgument: trailingFunctionArgument2,
      trailingOptionsArgument: trailingOptionsArgument2
    } = (init_utils(), __toCommonJS2(utils_exports));
    var { applyPatchTask: applyPatchTask2 } = (init_apply_patch(), __toCommonJS2(apply_patch_exports));
    var {
      branchTask: branchTask2,
      branchLocalTask: branchLocalTask2,
      deleteBranchesTask: deleteBranchesTask2,
      deleteBranchTask: deleteBranchTask2
    } = (init_branch(), __toCommonJS2(branch_exports));
    var { checkIgnoreTask: checkIgnoreTask2 } = (init_check_ignore(), __toCommonJS2(check_ignore_exports));
    var { checkIsRepoTask: checkIsRepoTask2 } = (init_check_is_repo(), __toCommonJS2(check_is_repo_exports));
    var { cleanWithOptionsTask: cleanWithOptionsTask2, isCleanOptionsArray: isCleanOptionsArray2 } = (init_clean(), __toCommonJS2(clean_exports));
    var { diffSummaryTask: diffSummaryTask2 } = (init_diff(), __toCommonJS2(diff_exports));
    var { fetchTask: fetchTask2 } = (init_fetch(), __toCommonJS2(fetch_exports));
    var { moveTask: moveTask2 } = (init_move(), __toCommonJS2(move_exports));
    var { pullTask: pullTask2 } = (init_pull(), __toCommonJS2(pull_exports));
    var { pushTagsTask: pushTagsTask2 } = (init_push(), __toCommonJS2(push_exports));
    var {
      addRemoteTask: addRemoteTask2,
      getRemotesTask: getRemotesTask2,
      listRemotesTask: listRemotesTask2,
      remoteTask: remoteTask2,
      removeRemoteTask: removeRemoteTask2
    } = (init_remote(), __toCommonJS2(remote_exports));
    var { getResetMode: getResetMode2, resetTask: resetTask2 } = (init_reset(), __toCommonJS2(reset_exports));
    var { stashListTask: stashListTask2 } = (init_stash_list(), __toCommonJS2(stash_list_exports));
    var {
      addSubModuleTask: addSubModuleTask2,
      initSubModuleTask: initSubModuleTask2,
      subModuleTask: subModuleTask2,
      updateSubModuleTask: updateSubModuleTask2
    } = (init_sub_module(), __toCommonJS2(sub_module_exports));
    var { addAnnotatedTagTask: addAnnotatedTagTask2, addTagTask: addTagTask2, tagListTask: tagListTask2 } = (init_tag(), __toCommonJS2(tag_exports));
    var { straightThroughBufferTask: straightThroughBufferTask2, straightThroughStringTask: straightThroughStringTask2 } = (init_task(), __toCommonJS2(task_exports));
    function Git2(options, plugins) {
      this._plugins = plugins;
      this._executor = new GitExecutor2(
        options.baseDir,
        new Scheduler2(options.maxConcurrentProcesses),
        plugins
      );
      this._trimmed = options.trimmed;
    }
    (Git2.prototype = Object.create(SimpleGitApi2.prototype)).constructor = Git2;
    Git2.prototype.customBinary = function(command) {
      this._plugins.reconfigure("binary", command);
      return this;
    };
    Git2.prototype.env = function(name, value) {
      if (arguments.length === 1 && typeof name === "object") {
        this._executor.env = name;
      } else {
        (this._executor.env = this._executor.env || {})[name] = value;
      }
      return this;
    };
    Git2.prototype.stashList = function(options) {
      return this._runTask(
        stashListTask2(
          trailingOptionsArgument2(arguments) || {},
          filterArray2(options) && options || []
        ),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.mv = function(from, to) {
      return this._runTask(moveTask2(from, to), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.checkoutLatestTag = function(then) {
      var git3 = this;
      return this.pull(function() {
        git3.tags(function(err, tags) {
          git3.checkout(tags.latest, then);
        });
      });
    };
    Git2.prototype.pull = function(remote, branch, options, then) {
      return this._runTask(
        pullTask2(
          filterType2(remote, filterString2),
          filterType2(branch, filterString2),
          getTrailingOptions2(arguments)
        ),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.fetch = function(remote, branch) {
      return this._runTask(
        fetchTask2(
          filterType2(remote, filterString2),
          filterType2(branch, filterString2),
          getTrailingOptions2(arguments)
        ),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.silent = function(silence) {
      return this._runTask(
        adhocExecTask2(
          () => console.warn(
            "simple-git deprecation notice: git.silent: logging should be configured using the `debug` library / `DEBUG` environment variable, this method will be removed."
          )
        )
      );
    };
    Git2.prototype.tags = function(options, then) {
      return this._runTask(
        tagListTask2(getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.rebase = function() {
      return this._runTask(
        straightThroughStringTask2(["rebase", ...getTrailingOptions2(arguments)]),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.reset = function(mode) {
      return this._runTask(
        resetTask2(getResetMode2(mode), getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.revert = function(commit) {
      const next = trailingFunctionArgument2(arguments);
      if (typeof commit !== "string") {
        return this._runTask(configurationErrorTask2("Commit must be a string"), next);
      }
      return this._runTask(
        straightThroughStringTask2(["revert", ...getTrailingOptions2(arguments, 0, true), commit]),
        next
      );
    };
    Git2.prototype.addTag = function(name) {
      const task = typeof name === "string" ? addTagTask2(name) : configurationErrorTask2("Git.addTag requires a tag name");
      return this._runTask(task, trailingFunctionArgument2(arguments));
    };
    Git2.prototype.addAnnotatedTag = function(tagName, tagMessage) {
      return this._runTask(
        addAnnotatedTagTask2(tagName, tagMessage),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.deleteLocalBranch = function(branchName, forceDelete, then) {
      return this._runTask(
        deleteBranchTask2(branchName, typeof forceDelete === "boolean" ? forceDelete : false),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.deleteLocalBranches = function(branchNames, forceDelete, then) {
      return this._runTask(
        deleteBranchesTask2(branchNames, typeof forceDelete === "boolean" ? forceDelete : false),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.branch = function(options, then) {
      return this._runTask(
        branchTask2(getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.branchLocal = function(then) {
      return this._runTask(branchLocalTask2(), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.raw = function(commands29) {
      const createRestCommands = !Array.isArray(commands29);
      const command = [].slice.call(createRestCommands ? arguments : commands29, 0);
      for (let i2 = 0; i2 < command.length && createRestCommands; i2++) {
        if (!filterPrimitives2(command[i2])) {
          command.splice(i2, command.length - i2);
          break;
        }
      }
      command.push(...getTrailingOptions2(arguments, 0, true));
      var next = trailingFunctionArgument2(arguments);
      if (!command.length) {
        return this._runTask(
          configurationErrorTask2("Raw: must supply one or more command to execute"),
          next
        );
      }
      return this._runTask(straightThroughStringTask2(command, this._trimmed), next);
    };
    Git2.prototype.submoduleAdd = function(repo, path37, then) {
      return this._runTask(addSubModuleTask2(repo, path37), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.submoduleUpdate = function(args, then) {
      return this._runTask(
        updateSubModuleTask2(getTrailingOptions2(arguments, true)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.submoduleInit = function(args, then) {
      return this._runTask(
        initSubModuleTask2(getTrailingOptions2(arguments, true)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.subModule = function(options, then) {
      return this._runTask(
        subModuleTask2(getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.listRemote = function() {
      return this._runTask(
        listRemotesTask2(getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.addRemote = function(remoteName, remoteRepo, then) {
      return this._runTask(
        addRemoteTask2(remoteName, remoteRepo, getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.removeRemote = function(remoteName, then) {
      return this._runTask(removeRemoteTask2(remoteName), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.getRemotes = function(verbose, then) {
      return this._runTask(getRemotesTask2(verbose === true), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.remote = function(options, then) {
      return this._runTask(
        remoteTask2(getTrailingOptions2(arguments)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.tag = function(options, then) {
      const command = getTrailingOptions2(arguments);
      if (command[0] !== "tag") {
        command.unshift("tag");
      }
      return this._runTask(straightThroughStringTask2(command), trailingFunctionArgument2(arguments));
    };
    Git2.prototype.updateServerInfo = function(then) {
      return this._runTask(
        straightThroughStringTask2(["update-server-info"]),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.pushTags = function(remote, then) {
      const task = pushTagsTask2(
        { remote: filterType2(remote, filterString2) },
        getTrailingOptions2(arguments)
      );
      return this._runTask(task, trailingFunctionArgument2(arguments));
    };
    Git2.prototype.rm = function(files) {
      return this._runTask(
        straightThroughStringTask2(["rm", "-f", ...asArray2(files)]),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.rmKeepLocal = function(files) {
      return this._runTask(
        straightThroughStringTask2(["rm", "--cached", ...asArray2(files)]),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.catFile = function(options, then) {
      return this._catFile("utf-8", arguments);
    };
    Git2.prototype.binaryCatFile = function() {
      return this._catFile("buffer", arguments);
    };
    Git2.prototype._catFile = function(format, args) {
      var handler = trailingFunctionArgument2(args);
      var command = ["cat-file"];
      var options = args[0];
      if (typeof options === "string") {
        return this._runTask(
          configurationErrorTask2("Git.catFile: options must be supplied as an array of strings"),
          handler
        );
      }
      if (Array.isArray(options)) {
        command.push.apply(command, options);
      }
      const task = format === "buffer" ? straightThroughBufferTask2(command) : straightThroughStringTask2(command);
      return this._runTask(task, handler);
    };
    Git2.prototype.diff = function(options, then) {
      const task = filterString2(options) ? configurationErrorTask2(
        "git.diff: supplying options as a single string is no longer supported, switch to an array of strings"
      ) : straightThroughStringTask2(["diff", ...getTrailingOptions2(arguments)]);
      return this._runTask(task, trailingFunctionArgument2(arguments));
    };
    Git2.prototype.diffSummary = function() {
      return this._runTask(
        diffSummaryTask2(getTrailingOptions2(arguments, 1)),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.applyPatch = function(patches) {
      const task = !filterStringOrStringArray2(patches) ? configurationErrorTask2(
        `git.applyPatch requires one or more string patches as the first argument`
      ) : applyPatchTask2(asArray2(patches), getTrailingOptions2([].slice.call(arguments, 1)));
      return this._runTask(task, trailingFunctionArgument2(arguments));
    };
    Git2.prototype.revparse = function() {
      const commands29 = ["rev-parse", ...getTrailingOptions2(arguments, true)];
      return this._runTask(
        straightThroughStringTask2(commands29, true),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.clean = function(mode, options, then) {
      const usingCleanOptionsArray = isCleanOptionsArray2(mode);
      const cleanMode = usingCleanOptionsArray && mode.join("") || filterType2(mode, filterString2) || "";
      const customArgs = getTrailingOptions2([].slice.call(arguments, usingCleanOptionsArray ? 1 : 0));
      return this._runTask(
        cleanWithOptionsTask2(cleanMode, customArgs),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.exec = function(then) {
      const task = {
        commands: [],
        format: "utf-8",
        parser() {
          if (typeof then === "function") {
            then();
          }
        }
      };
      return this._runTask(task);
    };
    Git2.prototype.clearQueue = function() {
      return this._runTask(
        adhocExecTask2(
          () => console.warn(
            "simple-git deprecation notice: clearQueue() is deprecated and will be removed, switch to using the abortPlugin instead."
          )
        )
      );
    };
    Git2.prototype.checkIgnore = function(pathnames, then) {
      return this._runTask(
        checkIgnoreTask2(asArray2(filterType2(pathnames, filterStringOrStringArray2, []))),
        trailingFunctionArgument2(arguments)
      );
    };
    Git2.prototype.checkIsRepo = function(checkType, then) {
      return this._runTask(
        checkIsRepoTask2(filterType2(checkType, filterString2)),
        trailingFunctionArgument2(arguments)
      );
    };
    module2.exports = Git2;
  }
});
init_git_error();
var GitConstructError = class extends GitError {
  constructor(config, message) {
    super(void 0, message);
    this.config = config;
  }
};
init_git_error();
init_git_error();
var GitPluginError = class extends GitError {
  constructor(task, plugin, message) {
    super(task, message);
    this.task = task;
    this.plugin = plugin;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
init_git_response_error();
init_task_configuration_error();
init_check_is_repo();
init_clean();
init_config();
init_diff_name_status();
init_grep();
init_reset();
function abortPlugin(signal) {
  if (!signal) {
    return;
  }
  const onSpawnAfter = {
    type: "spawn.after",
    action(_data, context) {
      function kill() {
        context.kill(new GitPluginError(void 0, "abort", "Abort signal received"));
      }
      signal.addEventListener("abort", kill);
      context.spawned.on("close", () => signal.removeEventListener("abort", kill));
    }
  };
  const onSpawnBefore = {
    type: "spawn.before",
    action(_data, context) {
      if (signal.aborted) {
        context.kill(new GitPluginError(void 0, "abort", "Abort already signaled"));
      }
    }
  };
  return [onSpawnBefore, onSpawnAfter];
}
function blockUnsafeOperationsPlugin(options = {}) {
  return {
    type: "spawn.args",
    action(args, { env: env8 }) {
      for (const vulnerability of ne(args, env8)) {
        if (options[vulnerability.category] !== true) {
          throw new GitPluginError(void 0, "unsafe", vulnerability.message);
        }
      }
      return args;
    }
  };
}
init_utils();
function commandConfigPrefixingPlugin(configuration) {
  const prefix = prefixedArray(configuration, "-c");
  return {
    type: "spawn.args",
    action(data) {
      return [...prefix, ...data];
    }
  };
}
init_utils();
var never = (0, import_promise_deferred2.deferred)().promise;
function completionDetectionPlugin({
  onClose = true,
  onExit = 50
} = {}) {
  function createEvents() {
    let exitCode = -1;
    const events = {
      close: (0, import_promise_deferred2.deferred)(),
      closeTimeout: (0, import_promise_deferred2.deferred)(),
      exit: (0, import_promise_deferred2.deferred)(),
      exitTimeout: (0, import_promise_deferred2.deferred)()
    };
    const result = Promise.race([
      onClose === false ? never : events.closeTimeout.promise,
      onExit === false ? never : events.exitTimeout.promise
    ]);
    configureTimeout(onClose, events.close, events.closeTimeout);
    configureTimeout(onExit, events.exit, events.exitTimeout);
    return {
      close(code) {
        exitCode = code;
        events.close.done();
      },
      exit(code) {
        exitCode = code;
        events.exit.done();
      },
      get exitCode() {
        return exitCode;
      },
      result
    };
  }
  function configureTimeout(flag, event, timeout) {
    if (flag === false) {
      return;
    }
    (flag === true ? event.promise : event.promise.then(() => delay(flag))).then(timeout.done);
  }
  return {
    type: "spawn.after",
    async action(_data, { spawned, close }) {
      const events = createEvents();
      let deferClose = true;
      let quickClose = () => void (deferClose = false);
      spawned.stdout?.on("data", quickClose);
      spawned.stderr?.on("data", quickClose);
      spawned.on("error", quickClose);
      spawned.on("close", (code) => events.close(code));
      spawned.on("exit", (code) => events.exit(code));
      try {
        await events.result;
        if (deferClose) {
          await delay(50);
        }
        close(events.exitCode);
      } catch (err) {
        close(events.exitCode, err);
      }
    }
  };
}
init_utils();
var WRONG_NUMBER_ERR = `Invalid value supplied for custom binary, requires a single string or an array containing either one or two strings`;
var WRONG_CHARS_ERR = `Invalid value supplied for custom binary, restricted characters must be removed or supply the unsafe.allowUnsafeCustomBinary option`;
function isBadArgument(arg) {
  return !arg || !/^([a-z]:)?([a-z0-9/.\\_~-]+)$/i.test(arg);
}
function toBinaryConfig(input, allowUnsafe) {
  if (input.length < 1 || input.length > 2) {
    throw new GitPluginError(void 0, "binary", WRONG_NUMBER_ERR);
  }
  const isBad = input.some(isBadArgument);
  if (isBad) {
    if (allowUnsafe) {
      console.warn(WRONG_CHARS_ERR);
    } else {
      throw new GitPluginError(void 0, "binary", WRONG_CHARS_ERR);
    }
  }
  const [binary, prefix] = input;
  return {
    binary,
    prefix
  };
}
function customBinaryPlugin(plugins, input = ["git"], allowUnsafe = false) {
  let config = toBinaryConfig(asArray(input), allowUnsafe);
  plugins.on("binary", (input2) => {
    config = toBinaryConfig(asArray(input2), allowUnsafe);
  });
  plugins.append("spawn.binary", () => {
    return config.binary;
  });
  plugins.append("spawn.args", (data) => {
    return config.prefix ? [config.prefix, ...data] : data;
  });
}
init_git_error();
function isTaskError(result) {
  return !!(result.exitCode && result.stdErr.length);
}
function getErrorMessage(result) {
  return Buffer.concat([...result.stdOut, ...result.stdErr]);
}
function errorDetectionHandler(overwrite = false, isError = isTaskError, errorMessage = getErrorMessage) {
  return (error, result) => {
    if (!overwrite && error || !isError(result)) {
      return error;
    }
    return errorMessage(result);
  };
}
function errorDetectionPlugin(config) {
  return {
    type: "task.error",
    action(data, context) {
      const error = config(data.error, {
        stdErr: context.stdErr,
        stdOut: context.stdOut,
        exitCode: context.exitCode
      });
      if (Buffer.isBuffer(error)) {
        return { error: new GitError(void 0, error.toString("utf-8")) };
      }
      return {
        error
      };
    }
  };
}
init_utils();
var PluginStore = class {
  constructor() {
    this.plugins = /* @__PURE__ */ new Set();
    this.events = new import_node_events.EventEmitter();
  }
  on(type, listener) {
    this.events.on(type, listener);
  }
  reconfigure(type, data) {
    this.events.emit(type, data);
  }
  append(type, action) {
    const plugin = append(this.plugins, { type, action });
    return () => this.plugins.delete(plugin);
  }
  add(plugin) {
    const plugins = [];
    asArray(plugin).forEach((plugin2) => plugin2 && this.plugins.add(append(plugins, plugin2)));
    return () => {
      plugins.forEach((plugin2) => this.plugins.delete(plugin2));
    };
  }
  exec(type, data, context) {
    let output = data;
    const contextual = Object.freeze(Object.create(context));
    for (const plugin of this.plugins) {
      if (plugin.type === type) {
        output = plugin.action(output, contextual);
      }
    }
    return output;
  }
};
init_utils();
function progressMonitorPlugin(progress) {
  const progressCommand = "--progress";
  const progressMethods = ["checkout", "clone", "fetch", "pull", "push"];
  const onProgress = {
    type: "spawn.after",
    action(_data, context) {
      if (!context.commands.includes(progressCommand)) {
        return;
      }
      context.spawned.stderr?.on("data", (chunk) => {
        const message = /^([\s\S]+?):\s*(\d+)% \((\d+)\/(\d+)\)/.exec(chunk.toString("utf8"));
        if (!message) {
          return;
        }
        progress({
          method: context.method,
          stage: progressEventStage(message[1]),
          progress: asNumber(message[2]),
          processed: asNumber(message[3]),
          total: asNumber(message[4])
        });
      });
    }
  };
  const onArgs = {
    type: "spawn.args",
    action(args, context) {
      if (!progressMethods.includes(context.method)) {
        return args;
      }
      return including(args, progressCommand);
    }
  };
  return [onArgs, onProgress];
}
function progressEventStage(input) {
  return String(input.toLowerCase().split(" ", 1)) || "unknown";
}
init_utils();
function spawnOptionsPlugin(spawnOptions) {
  const options = pick(spawnOptions, ["uid", "gid"]);
  return {
    type: "spawn.options",
    action(data) {
      return { ...options, ...data };
    }
  };
}
function timeoutPlugin({
  block,
  stdErr = true,
  stdOut = true
}) {
  if (block > 0) {
    return {
      type: "spawn.after",
      action(_data, context) {
        let timeout;
        function wait() {
          timeout && clearTimeout(timeout);
          timeout = setTimeout(kill, block);
        }
        function stop() {
          context.spawned.stdout?.off("data", wait);
          context.spawned.stderr?.off("data", wait);
          context.spawned.off("exit", stop);
          context.spawned.off("close", stop);
          timeout && clearTimeout(timeout);
        }
        function kill() {
          stop();
          context.kill(new GitPluginError(void 0, "timeout", `block timeout reached`));
        }
        stdOut && context.spawned.stdout?.on("data", wait);
        stdErr && context.spawned.stderr?.on("data", wait);
        context.spawned.on("exit", stop);
        context.spawned.on("close", stop);
        wait();
      }
    };
  }
}
function suffixPathsPlugin() {
  return {
    type: "spawn.args",
    action(data) {
      const prefix = [];
      let suffix;
      function append2(args) {
        (suffix = suffix || []).push(...args);
      }
      for (let i2 = 0; i2 < data.length; i2++) {
        const param = data[i2];
        if (r(param)) {
          append2(o(param));
          continue;
        }
        if (param === "--") {
          append2(
            data.slice(i2 + 1).flatMap((item) => r(item) && o(item) || item)
          );
          break;
        }
        prefix.push(param);
      }
      return !suffix ? prefix : [...prefix, "--", ...suffix.map(String)];
    }
  };
}
init_utils();
var Git = require_git();
function gitInstanceFactory(baseDir, options) {
  const plugins = new PluginStore();
  const config = createInstanceConfig(
    baseDir && (typeof baseDir === "string" ? { baseDir } : baseDir) || {},
    options
  );
  if (!folderExists(config.baseDir)) {
    throw new GitConstructError(
      config,
      `Cannot use simple-git on a directory that does not exist`
    );
  }
  if (Array.isArray(config.config)) {
    plugins.add(commandConfigPrefixingPlugin(config.config));
  }
  plugins.add(blockUnsafeOperationsPlugin(config.unsafe));
  plugins.add(completionDetectionPlugin(config.completion));
  config.abort && plugins.add(abortPlugin(config.abort));
  config.progress && plugins.add(progressMonitorPlugin(config.progress));
  config.timeout && plugins.add(timeoutPlugin(config.timeout));
  config.spawnOptions && plugins.add(spawnOptionsPlugin(config.spawnOptions));
  plugins.add(suffixPathsPlugin());
  plugins.add(errorDetectionPlugin(errorDetectionHandler(true)));
  config.errors && plugins.add(errorDetectionPlugin(config.errors));
  customBinaryPlugin(plugins, config.binary, config.unsafe?.allowUnsafeCustomBinary);
  return new Git(config, plugins);
}
init_git_response_error();
var esm_default = gitInstanceFactory;

// src/utils/aiRouterInstall.ts
var fs9 = __toESM(require("fs"));
var path9 = __toESM(require("path"));
var PYPI_PACKAGE_NAME = "dabbler-ai-router";
var MINIMUM_ROUTER_VERSION = "1.0.0";
var PYPI_REQUIREMENT = `${PYPI_PACKAGE_NAME}>=${MINIMUM_ROUTER_VERSION}`;
var REPO_URL = "https://github.com/darndestdabbler/dabbler-ai-orchestration.git";
var ROUTER_CONFIG_REL = path9.posix.join("ai_router", "router-config.yaml");
var LOCAL_OVERRIDES_REL = path9.posix.join("ai_router", "local-overrides.yaml");
var INSTALL_METHOD_REL = path9.posix.join(".dabbler", "install-method");
var GITHUB_CHECKOUT_REL = path9.posix.join(".dabbler", "ai-router-src");
var DEFAULT_GITHUB_REF = "<latest released tag>";
var RELEASE_TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;
function isAiRouterNotInstalled(stderr) {
  if (!stderr)
    return false;
  if (/ModuleNotFoundError:\s*No module named ['"]ai_router['"]/.test(stderr))
    return true;
  if (/Error while finding module specification for ['"]ai_router\./.test(stderr) && /No module named ['"]ai_router['"]/.test(stderr)) {
    return true;
  }
  if (/No module named ['"]?ai_router\.[\w.]+['"]?/.test(stderr))
    return true;
  return false;
}
function describeAiRouterImportFailure(pythonPath, hint) {
  const venvHint = process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python";
  return `ai_router could not be imported by the interpreter '${pythonPath}'. This is an interpreter / installation problem \u2014 NOT missing API keys. Point the 'dabblerSessionSets.pythonPath' setting at your workspace venv (e.g. ${venvHint}), or install the router into that interpreter: ${pythonPath} -m pip install dabbler-ai-router.` + (hint ? ` (${hint})` : "");
}
async function installAiRouter(deps) {
  return doInstall(deps, { mode: "install" });
}
async function updateAiRouter(deps) {
  return doInstall(deps, { mode: "update" });
}
async function doInstall(deps, opts) {
  const report = deps.reportProgress ?? (() => {
  });
  let priorSource = null;
  if (opts.mode === "update") {
    priorSource = readInstallMethodMarker(deps);
  }
  const defaultSource = priorSource ?? "pypi";
  const source = await deps.prompts.pickSource(defaultSource);
  if (!source) {
    return {
      ok: false,
      message: "Install cancelled (no source chosen).",
      source: null,
      venvPath: null,
      routerConfigPreserved: false
    };
  }
  const venvResult = await ensureVenv(deps);
  if (!venvResult.ok) {
    return {
      ok: false,
      message: venvResult.message,
      source,
      venvPath: null,
      routerConfigPreserved: false
    };
  }
  const venvPath = venvResult.venvPath;
  if (source === "pypi") {
    return await verifyRouterCapability(
      deps,
      await runPyPiInstall(deps, { venvPath, mode: opts.mode, report })
    );
  }
  return await verifyRouterCapability(
    deps,
    await runGitHubInstall(deps, { venvPath, report })
  );
}
async function verifyRouterCapability(deps, outcome) {
  if (!outcome.ok || !outcome.venvPath)
    return outcome;
  const resolved = deps.resolveLauncherPython?.()?.trim();
  const target = resolved ? resolved : venvPython(outcome.venvPath);
  const capability = await probeRouterCapability(deps.spawner, target, {
    cwd: deps.workspaceRoot
  });
  if (capability.ok)
    return { ...outcome, capability };
  return {
    ...outcome,
    ok: false,
    capability,
    message: `${outcome.message} ${capability.message}`
  };
}
async function ensureVenv(deps) {
  const fromPythonPath = deriveVenvFromPythonPath(deps.pythonPath);
  if (fromPythonPath && deps.fileOps.exists(fromPythonPath) && deps.fileOps.exists(path9.join(fromPythonPath, "pyvenv.cfg"))) {
    return {
      ok: true,
      venvPath: fromPythonPath,
      message: `Using venv from configured pythonPath: ${fromPythonPath}`
    };
  }
  const candidate = findExistingVenv(deps);
  if (candidate) {
    return { ok: true, venvPath: candidate, message: `Using existing venv at ${candidate}` };
  }
  const target = path9.join(deps.workspaceRoot, ".venv");
  const create = await deps.prompts.confirmCreateVenv(target);
  if (!create) {
    return {
      ok: false,
      message: "No venv found at .venv/ or venv/. Install cancelled \u2014 create a venv first or accept the prompt to create .venv.",
      venvPath: null
    };
  }
  const venvShaped = deriveVenvFromPythonPath(deps.pythonPath) !== null;
  const interpreterExists = path9.isAbsolute(deps.pythonPath) ? deps.fileOps.exists(deps.pythonPath) : true;
  const bootstrap = venvShaped && !interpreterExists ? "python" : deps.pythonPath;
  const result = await deps.spawner(bootstrap, ["-m", "venv", target], {
    cwd: deps.workspaceRoot,
    timeoutMs: 6e4
  });
  if (result.exitCode !== 0) {
    return {
      ok: false,
      message: `Failed to create venv at ${target} (using bootstrap '${bootstrap}'): ${oneLine(result.stderr || result.stdout) || `exit ${result.exitCode}`}`,
      venvPath: null
    };
  }
  return { ok: true, venvPath: target, message: `Created venv at ${target}` };
}
function findExistingVenv(deps) {
  for (const rel of [".venv", "venv"]) {
    const abs = path9.join(deps.workspaceRoot, rel);
    if (deps.fileOps.exists(abs))
      return abs;
  }
  return null;
}
function deriveVenvFromPythonPath(pythonPath) {
  if (!pythonPath || !path9.isAbsolute(pythonPath))
    return null;
  const parent = path9.basename(path9.dirname(pythonPath));
  if (parent === "Scripts" || parent === "bin") {
    return path9.dirname(path9.dirname(pythonPath));
  }
  return null;
}
function venvPython(venvPath) {
  const candidates = process.platform === "win32" ? [path9.join(venvPath, "Scripts", "python.exe"), path9.join(venvPath, "Scripts", "python")] : [path9.join(venvPath, "bin", "python"), path9.join(venvPath, "bin", "python3")];
  return candidates[0];
}
function routerInstallSpec(env8 = process.env) {
  const override = (env8.DABBLER_ROUTER_INSTALL_SPEC ?? "").trim();
  return override === "" ? PYPI_REQUIREMENT : override;
}
function routerInstallRequirement(env8 = process.env, isDirectory = (p2) => {
  try {
    return fs9.statSync(p2).isDirectory();
  } catch {
    return false;
  }
}) {
  const spec = routerInstallSpec(env8);
  return spec !== PYPI_REQUIREMENT && isDirectory(spec) ? ["-e", spec] : [spec];
}
async function runPyPiInstall(deps, opts) {
  const requirement = routerInstallRequirement();
  const spec = routerInstallSpec();
  const source = spec === PYPI_REQUIREMENT ? "PyPI" : spec;
  opts.report(
    opts.mode === "update" ? `Force-refreshing ${PYPI_PACKAGE_NAME} from ${source}\u2026` : `Installing ${PYPI_PACKAGE_NAME} (>=${MINIMUM_ROUTER_VERSION}) from ${source}\u2026`
  );
  const pipArgs = opts.mode === "update" ? ["-m", "pip", "install", "--upgrade", "--force-reinstall", "--no-cache-dir", ...requirement] : ["-m", "pip", "install", "--upgrade", ...requirement];
  const venvPy = venvPython(opts.venvPath);
  const result = await deps.spawner(venvPy, pipArgs, {
    cwd: deps.workspaceRoot,
    timeoutMs: 3e5
  });
  if (result.exitCode !== 0) {
    return {
      ok: false,
      message: `pip install failed: ${oneLine(result.stderr || result.stdout) || `exit ${result.exitCode}`}`,
      source: "pypi",
      venvPath: opts.venvPath,
      routerConfigPreserved: false
    };
  }
  let materialized = false;
  let seedFailed = false;
  const workspaceConfig = path9.join(deps.workspaceRoot, ROUTER_CONFIG_REL);
  if (!deps.fileOps.exists(workspaceConfig)) {
    const seed = await readBundledRouterConfig(deps, venvPy);
    if (seed !== null) {
      try {
        deps.fileOps.mkdirp(path9.dirname(workspaceConfig));
        deps.fileOps.writeFile(workspaceConfig, seed);
        materialized = true;
      } catch {
        seedFailed = true;
      }
    } else {
      seedFailed = true;
    }
  }
  writeInstallMethodMarker(deps, "pypi");
  const seedNote = materialized ? " Seeded ai_router/router-config.yaml from the installed package." : seedFailed ? ` Could not seed ai_router/router-config.yaml from the installed package \u2014 run "Dabbler: Install ai-router" again, or copy the file from the venv's site-packages/ai_router/ by hand.` : "";
  return {
    ok: true,
    message: opts.mode === "update" ? `Upgraded ${PYPI_PACKAGE_NAME} in ${opts.venvPath}.${seedNote}` : `Installed ${PYPI_PACKAGE_NAME} into ${opts.venvPath}.${seedNote}`,
    source: "pypi",
    venvPath: opts.venvPath,
    routerConfigPreserved: materialized
  };
}
var READ_BUNDLED_ROUTER_CONFIG_CODE = "from importlib.resources import files; p = files('ai_router').joinpath('router-config.yaml'); import sys; sys.stdout.buffer.write(p.read_bytes())";
async function readBundledRouterConfig(deps, venvPy) {
  const result = await deps.spawner(venvPy, ["-c", READ_BUNDLED_ROUTER_CONFIG_CODE], {
    cwd: deps.workspaceRoot,
    timeoutMs: 3e4
  });
  if (result.exitCode !== 0 || !result.stdout)
    return null;
  return result.stdout;
}
var ROUTER_CAPABILITY_MODULE = "ai_router.modules";
var ROUTER_CAPABILITY_PROBE_CODE = [
  "import importlib, sys",
  `importlib.import_module(${JSON.stringify(ROUTER_CAPABILITY_MODULE)})`,
  "try:",
  "    from importlib.metadata import version",
  `    v = version(${JSON.stringify(PYPI_PACKAGE_NAME)})`,
  "except Exception:",
  '    v = ""',
  "sys.stdout.write(v)"
].join("\n");
function compareReleaseVersions(a, b2) {
  const parse2 = (v) => {
    const m = /^\s*(\d+(?:\.\d+)*)/.exec(v);
    if (!m)
      return null;
    return m[1].split(".").map((n) => Number(n));
  };
  const pa = parse2(a);
  const pb = parse2(b2);
  if (pa === null || pb === null)
    return null;
  const len = Math.max(pa.length, pb.length);
  for (let i2 = 0; i2 < len; i2 += 1) {
    const d = (pa[i2] ?? 0) - (pb[i2] ?? 0);
    if (d !== 0)
      return d;
  }
  return 0;
}
async function probeRouterCapability(spawner, venvPythonPath, opts = {}) {
  let result;
  try {
    result = await spawner(venvPythonPath, ["-c", ROUTER_CAPABILITY_PROBE_CODE], {
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs ?? 6e4
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      interpreter: venvPythonPath,
      version: null,
      reason: "probe-failed",
      message: `Could not verify ${PYPI_PACKAGE_NAME} in '${venvPythonPath}': ${oneLine(detail)}. ` + describeAiRouterImportFailure(venvPythonPath)
    };
  }
  if (result.exitCode !== 0) {
    const detail = oneLine(result.stderr || result.stdout);
    return {
      ok: false,
      interpreter: venvPythonPath,
      version: null,
      reason: "not-importable",
      message: `${ROUTER_CAPABILITY_MODULE} could not be imported after installing ${PYPI_PACKAGE_NAME}${detail ? ` (${detail})` : ""}. ` + describeAiRouterImportFailure(venvPythonPath)
    };
  }
  const version = result.stdout.trim() || null;
  if (version !== null) {
    const cmp = compareReleaseVersions(version, MINIMUM_ROUTER_VERSION);
    if (cmp !== null && cmp < 0) {
      return {
        ok: false,
        interpreter: venvPythonPath,
        version,
        reason: "below-floor",
        message: `${PYPI_PACKAGE_NAME} ${version} is installed in '${venvPythonPath}', but this extension requires >=${MINIMUM_ROUTER_VERSION}. Run "Dabbler: Update ai-router" to upgrade it, then try again.`
      };
    }
  }
  return {
    ok: true,
    interpreter: venvPythonPath,
    version,
    reason: "ok",
    message: `${ROUTER_CAPABILITY_MODULE} is importable${version ? ` (${PYPI_PACKAGE_NAME} ${version})` : ""}.`
  };
}
async function resolveLatestReleaseTag(deps) {
  const repo = deps.repoUrl ?? REPO_URL;
  const result = await deps.spawner(
    "git",
    ["ls-remote", "--tags", "--refs", repo],
    { cwd: deps.workspaceRoot, timeoutMs: 6e4 }
  );
  if (result.exitCode !== 0)
    return null;
  const tags = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const m = /^[0-9a-f]+\s+refs\/tags\/(.+)$/.exec(line.trim());
    if (!m)
      continue;
    const tag = m[1];
    const sm = RELEASE_TAG_RE.exec(tag);
    if (!sm)
      continue;
    tags.push({
      raw: tag,
      sortable: [Number(sm[1]), Number(sm[2]), Number(sm[3])]
    });
  }
  if (tags.length === 0)
    return null;
  tags.sort((a, b2) => {
    for (let i2 = 0; i2 < 3; i2++) {
      if (a.sortable[i2] !== b2.sortable[i2])
        return b2.sortable[i2] - a.sortable[i2];
    }
    return 0;
  });
  return tags[0].raw;
}
async function runGitHubInstall(deps, opts) {
  const userRef = await deps.prompts.promptGitHubRef(DEFAULT_GITHUB_REF);
  if (userRef === void 0) {
    return {
      ok: false,
      message: "Install cancelled (no GitHub ref chosen).",
      source: "github",
      venvPath: opts.venvPath,
      routerConfigPreserved: false,
      resolvedRef: null
    };
  }
  const explicitRef = userRef.trim() === "" || userRef === DEFAULT_GITHUB_REF ? null : userRef;
  let refToUse = explicitRef;
  if (refToUse === null) {
    opts.report("Resolving latest released tag\u2026");
    refToUse = await resolveLatestReleaseTag(deps);
    if (refToUse === null) {
      return {
        ok: false,
        message: "Could not resolve the latest released tag from the remote. Re-run and supply a tag/branch explicitly.",
        source: "github",
        venvPath: opts.venvPath,
        routerConfigPreserved: false,
        resolvedRef: null
      };
    }
  }
  const routerConfigAbs = path9.join(deps.workspaceRoot, ROUTER_CONFIG_REL);
  let stashedConfig = null;
  if (deps.fileOps.exists(routerConfigAbs)) {
    stashedConfig = deps.fileOps.readFile(routerConfigAbs);
  }
  let preserved = false;
  let lastRestoreError = null;
  const restoreStash = () => {
    if (stashedConfig === null)
      return true;
    if (preserved)
      return true;
    try {
      deps.fileOps.writeFile(routerConfigAbs, stashedConfig);
      preserved = true;
      lastRestoreError = null;
      return true;
    } catch (err) {
      lastRestoreError = err instanceof Error ? err.message : String(err);
      return false;
    }
  };
  const finalize = (outcome) => {
    if (stashedConfig !== null && !preserved) {
      return {
        ...outcome,
        ok: false,
        message: `Failed to restore operator-tuned ai_router/router-config.yaml after install (${lastRestoreError ?? "unknown error"}). The install changes have been applied but your tuned config was not put back. Check the workspace's ai_router/router-config.yaml before continuing.`,
        routerConfigPreserved: false
      };
    }
    return outcome;
  };
  const repo = deps.repoUrl ?? REPO_URL;
  opts.report(`Sparse-cloning ${repo}\u2026`);
  const tmp = deps.fileOps.mkdtemp("dabbler-ai-router-install-");
  try {
    const cloneArgs = ["clone", "--depth", "1", "--filter=blob:none", "--sparse"];
    cloneArgs.push("--branch", refToUse);
    cloneArgs.push(repo, tmp);
    const cloneResult = await deps.spawner("git", cloneArgs, {
      cwd: deps.workspaceRoot,
      timeoutMs: 3e5
    });
    if (cloneResult.exitCode !== 0) {
      restoreStash();
      return finalize({
        ok: false,
        message: `git clone failed: ${oneLine(cloneResult.stderr || cloneResult.stdout) || `exit ${cloneResult.exitCode}`}`,
        source: "github",
        venvPath: opts.venvPath,
        routerConfigPreserved: preserved,
        resolvedRef: refToUse
      });
    }
    opts.report("Configuring sparse-checkout\u2026");
    const sparseResult = await deps.spawner(
      "git",
      ["-C", tmp, "sparse-checkout", "set", "ai_router", "pyproject.toml"],
      { cwd: deps.workspaceRoot, timeoutMs: 6e4 }
    );
    if (sparseResult.exitCode !== 0) {
      restoreStash();
      return finalize({
        ok: false,
        message: `git sparse-checkout failed: ${oneLine(sparseResult.stderr || sparseResult.stdout) || `exit ${sparseResult.exitCode}`}`,
        source: "github",
        venvPath: opts.venvPath,
        routerConfigPreserved: preserved,
        resolvedRef: refToUse
      });
    }
    const stableSrc = path9.join(deps.workspaceRoot, GITHUB_CHECKOUT_REL);
    const dstAiRouter = path9.join(deps.workspaceRoot, "ai_router");
    opts.report("Copying sparse-checkout into the workspace\u2026");
    try {
      deps.fileOps.removeRecursive(stableSrc);
      deps.fileOps.copyDir(tmp, stableSrc);
      deps.fileOps.removeRecursive(dstAiRouter);
      deps.fileOps.copyDir(path9.join(stableSrc, "ai_router"), dstAiRouter);
    } catch (err) {
      restoreStash();
      return finalize({
        ok: false,
        message: `Failed to copy ai_router/ into the workspace: ${err instanceof Error ? err.message : String(err)}`,
        source: "github",
        venvPath: opts.venvPath,
        routerConfigPreserved: preserved,
        resolvedRef: refToUse
      });
    }
    restoreStash();
    opts.report("Installing the sparse-checked-out tree (editable)\u2026");
    const pipResult = await deps.spawner(
      venvPython(opts.venvPath),
      ["-m", "pip", "install", "-e", stableSrc],
      { cwd: deps.workspaceRoot, timeoutMs: 3e5 }
    );
    if (pipResult.exitCode !== 0) {
      return finalize({
        ok: false,
        message: `pip install -e <sparse-checkout> failed: ${oneLine(pipResult.stderr || pipResult.stdout) || `exit ${pipResult.exitCode}`}`,
        source: "github",
        venvPath: opts.venvPath,
        routerConfigPreserved: preserved,
        resolvedRef: refToUse
      });
    }
    writeInstallMethodMarker(deps, "github");
    return finalize({
      ok: true,
      message: `Installed ai_router from GitHub (${refToUse})${preserved ? " \u2014 preserved existing router-config.yaml" : ""}.`,
      source: "github",
      venvPath: opts.venvPath,
      routerConfigPreserved: preserved,
      resolvedRef: refToUse
    });
  } finally {
    restoreStash();
    try {
      deps.fileOps.removeRecursive(tmp);
    } catch {
    }
  }
}
function readInstallMethodMarker(deps) {
  const markerAbs = path9.join(deps.workspaceRoot, INSTALL_METHOD_REL);
  if (!deps.fileOps.exists(markerAbs))
    return null;
  const raw = deps.fileOps.readFile(markerAbs).trim();
  if (raw === "pypi" || raw === "github")
    return raw;
  return null;
}
function writeInstallMethodMarker(deps, source) {
  const markerAbs = path9.join(deps.workspaceRoot, INSTALL_METHOD_REL);
  const markerDir = path9.dirname(markerAbs);
  deps.fileOps.mkdirp(markerDir);
  deps.fileOps.writeFile(markerAbs, `${source}
`);
}
function oneLine(s) {
  const trimmed2 = (s || "").trim();
  if (!trimmed2)
    return "";
  const lastLines = trimmed2.split(/\r?\n/).filter(Boolean).slice(-2).join(" / ");
  return lastLines;
}

// src/commands/installAiRouterCommands.ts
var cp2 = __toESM(require("child_process"));
var fs11 = __toESM(require("fs"));
var os = __toESM(require("os"));
var path11 = __toESM(require("path"));
var vscode9 = __toESM(require("vscode"));

// src/utils/pythonInterpreter.ts
var fs10 = __toESM(require("fs"));
var path10 = __toESM(require("path"));
var vscode8 = __toESM(require("vscode"));
var realExists = (p2) => {
  try {
    return fs10.statSync(p2).isFile();
  } catch {
    return false;
  }
};
function venvInterpreterCandidate(workspaceRoot2) {
  return process.platform === "win32" ? path10.join(workspaceRoot2, ".venv", "Scripts", "python.exe") : path10.join(workspaceRoot2, ".venv", "bin", "python");
}
function detectWorkspaceVenvInterpreter(workspaceRoot2, fileExists = realExists) {
  if (!workspaceRoot2)
    return null;
  const venvRoot = path10.join(workspaceRoot2, ".venv");
  if (!fileExists(path10.join(venvRoot, "pyvenv.cfg")))
    return null;
  const interp = venvInterpreterCandidate(workspaceRoot2);
  return fileExists(interp) ? interp : null;
}
function explicitPythonPathSetting() {
  const inspected = vscode8.workspace.getConfiguration("dabblerSessionSets").inspect("pythonPath");
  if (!inspected)
    return void 0;
  const value = inspected.workspaceFolderValue ?? inspected.workspaceValue ?? inspected.globalValue;
  const trimmed2 = (value ?? "").trim();
  return trimmed2 === "" ? void 0 : trimmed2;
}
function normalizeExplicit(value, workspaceRoot2) {
  if (path10.isAbsolute(value))
    return value;
  if (value.includes(path10.sep) || value.includes("/")) {
    return path10.resolve(workspaceRoot2, value);
  }
  return value;
}
function resolveExplicitPythonPath(workspaceRoot2) {
  const explicit = explicitPythonPathSetting();
  return explicit ? normalizeExplicit(explicit, workspaceRoot2) : "python";
}
function resolvePythonInterpreter(workspaceRoot2, fileExists = realExists) {
  const explicit = explicitPythonPathSetting();
  if (explicit)
    return normalizeExplicit(explicit, workspaceRoot2);
  return detectWorkspaceVenvInterpreter(workspaceRoot2, fileExists) ?? "python";
}
function findCommandOnPath(cmd, env8 = process.env, fileExists = realExists, platform = process.platform) {
  const rawPath = env8.PATH ?? env8.Path ?? "";
  if (!rawPath)
    return null;
  const isWin = platform === "win32";
  const p2 = isWin ? path10.win32 : path10.posix;
  const delimiter = isWin ? ";" : ":";
  for (const dir of rawPath.split(delimiter)) {
    const entry = dir.trim();
    if (!entry)
      continue;
    if (isWin && /\\Microsoft\\WindowsApps\\?$/i.test(entry))
      continue;
    const candidates = isWin ? /\.[^\\/.]+$/.test(cmd) ? [p2.join(entry, cmd)] : [p2.join(entry, `${cmd}.exe`)] : [p2.join(entry, cmd)];
    for (const candidate of candidates) {
      if (fileExists(candidate))
        return candidate;
    }
  }
  return null;
}
function resolveBootstrapPythonCore(explicitSetting, workspaceRoot2, env8 = process.env, fileExists = realExists, platform = process.platform) {
  const p2 = platform === "win32" ? path10.win32 : path10.posix;
  if (explicitSetting) {
    const normalized = normalizeExplicit(explicitSetting, workspaceRoot2);
    if (p2.isAbsolute(normalized)) {
      return fileExists(normalized) ? normalized : null;
    }
    return findCommandOnPath(normalized, env8, fileExists, platform) !== null ? normalized : null;
  }
  const commands29 = platform === "win32" ? ["python"] : ["python3", "python"];
  for (const cmd of commands29) {
    if (findCommandOnPath(cmd, env8, fileExists, platform) !== null)
      return cmd;
  }
  return null;
}
function resolveScaffoldBootstrapPython(workspaceRoot2, fileExists = realExists) {
  return resolveBootstrapPythonCore(
    explicitPythonPathSetting(),
    workspaceRoot2,
    process.env,
    fileExists
  );
}
function probePythonPresenceCore(explicitSetting, workspaceRoot2, env8 = process.env, fileExists = realExists, platform = process.platform) {
  if (explicitSetting) {
    return resolveBootstrapPythonCore(
      explicitSetting,
      workspaceRoot2,
      env8,
      fileExists,
      platform
    ) !== null;
  }
  if (detectWorkspaceVenvInterpreter(workspaceRoot2, fileExists) !== null) {
    return true;
  }
  return resolveBootstrapPythonCore(
    void 0,
    workspaceRoot2,
    env8,
    fileExists,
    platform
  ) !== null;
}
function interpreterResolves(pythonPath, env8 = process.env, fileExists = realExists, platform = process.platform) {
  if (!pythonPath)
    return false;
  const p2 = platform === "win32" ? path10.win32 : path10.posix;
  if (p2.isAbsolute(pythonPath))
    return fileExists(pythonPath);
  if (pythonPath.includes("\\") || pythonPath.includes("/")) {
    return fileExists(path10.resolve(pythonPath));
  }
  return findCommandOnPath(pythonPath, env8, fileExists, platform) !== null;
}
function probePythonPresence(workspaceRoot2, fileExists = realExists) {
  return probePythonPresenceCore(
    explicitPythonPathSetting(),
    workspaceRoot2,
    process.env,
    fileExists
  );
}
function describeMissingPython(actionLabel) {
  return `${actionLabel} needs a Python interpreter, but none was found \u2014 no Python is installed, or it is not on PATH. This is a missing Python installation, NOT an extension or API-key problem. Install Python from https://www.python.org/downloads/ (tick "Add python.exe to PATH"; avoid the Microsoft Store build), or point the 'dabblerSessionSets.pythonPath' setting at an installed interpreter, then reload the VS Code window and try again.`;
}

// src/utils/utf8ChunkDecoder.ts
var import_string_decoder = require("string_decoder");
function makeUtf8ChunkDecoder() {
  const sd = new import_string_decoder.StringDecoder("utf8");
  return {
    write: (chunk) => sd.write(chunk),
    end: () => sd.end()
  };
}

// src/commands/installAiRouterCommands.ts
function registerInstallAiRouterCommands(context) {
  context.subscriptions.push(
    vscode9.commands.registerCommand("dabblerSessionSets.installAiRouter", async () => {
      await runInstallFlow("install");
    }),
    vscode9.commands.registerCommand("dabblerSessionSets.updateAiRouter", async () => {
      await runInstallFlow("update");
    })
  );
}
async function runInstallFlow(mode) {
  const root = vscode9.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode9.window.showErrorMessage(
      "Open a workspace folder before running Dabbler: Install ai-router."
    );
    return;
  }
  const pythonPath = resolveExplicitPythonPath(root);
  const repoUrl = resolveAiRouterRepoUrl();
  const outcome = await vscode9.window.withProgress(
    {
      location: vscode9.ProgressLocation.Notification,
      title: mode === "update" ? "Updating ai_router\u2026" : "Installing ai_router\u2026",
      cancellable: false
    },
    async (progress) => {
      const deps = {
        workspaceRoot: root,
        pythonPath,
        // Set 122 S3: resolved AFTER the install, so a venv created by
        // this very run is what the probe targets.
        resolveLauncherPython: () => resolvePythonInterpreter(root),
        repoUrl,
        spawner: makeSpawner(),
        fileOps: makeFileOps(),
        prompts: makePrompts(),
        reportProgress: (msg) => progress.report({ message: msg })
      };
      return mode === "update" ? await updateAiRouter(deps) : await installAiRouter(deps);
    }
  );
  if (!outcome.ok) {
    vscode9.window.showErrorMessage(outcome.message);
    return;
  }
  vscode9.window.showInformationMessage(outcome.message);
  const routerConfig = path11.join(root, ROUTER_CONFIG_REL);
  if (fs11.existsSync(routerConfig)) {
    try {
      const doc = await vscode9.workspace.openTextDocument(routerConfig);
      await vscode9.window.showTextDocument(doc, { preview: false });
      vscode9.window.showInformationMessage(
        "Tune router-config.yaml for your project \u2014 per-task-type effort, the cost guard, and delegation.always_route_task_types live here."
      );
    } catch {
    }
  }
}
function resolveAiRouterRepoUrl() {
  const cfg = vscode9.workspace.getConfiguration("dabblerSessionSets");
  const raw = (cfg.get("aiRouterRepoUrl") ?? "").trim();
  return raw === "" ? void 0 : raw;
}
function makeSpawner() {
  return (cmd, args, opts) => new Promise((resolve7) => {
    const child = cp2.spawn(cmd, args, {
      cwd: opts?.cwd,
      env: process.env,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const outDec = makeUtf8ChunkDecoder();
    const errDec = makeUtf8ChunkDecoder();
    const flush = () => {
      stdout += outDec.end();
      stderr += errDec.end();
    };
    let timedOut = false;
    const timer = opts?.timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill();
    }, opts.timeoutMs) : null;
    child.stdout?.on("data", (chunk) => {
      stdout += outDec.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += errDec.write(chunk);
    });
    child.on("error", (err) => {
      if (timer)
        clearTimeout(timer);
      flush();
      resolve7({
        exitCode: null,
        stdout,
        stderr: stderr + (stderr ? "\n" : "") + `spawn error: ${err.message}`
      });
    });
    child.on("close", (code) => {
      if (timer)
        clearTimeout(timer);
      flush();
      if (timedOut) {
        resolve7({
          exitCode: code ?? -1,
          stdout,
          stderr: stderr + (stderr ? "\n" : "") + "process killed by timeout"
        });
      } else {
        resolve7({ exitCode: code, stdout, stderr });
      }
    });
  });
}
function makeFileOps() {
  return {
    exists: (p2) => fs11.existsSync(p2),
    readFile: (p2) => fs11.readFileSync(p2, "utf8"),
    // Always ensure the parent directory exists before writing. The
    // GitHub-fallback flow can momentarily leave the destination
    // ai_router/ directory missing (between `removeRecursive(dst)` and
    // a partial `copyDir` failure), and the stash-restore path writes
    // the operator-tuned router-config.yaml inside that directory. The
    // cost of an always-on mkdirp is one extra syscall per write; the
    // cost of dropping it is silent data loss in a narrow but real
    // failure window. Round-3 verifier catch.
    writeFile: (p2, content) => {
      fs11.mkdirSync(path11.dirname(p2), { recursive: true });
      fs11.writeFileSync(p2, content, "utf8");
    },
    // Set 094: atomic, symlink-safe exclusive create (temp-write → hard-link
    // publish) — fails EEXIST when the path already exists, INCLUDING a
    // dangling symlink, which it never follows, with no check-then-act window
    // (round-4 verifier catch). The caller (ensureModulesManifest) mkdirps the
    // parent first.
    writeFileExclusive: (p2, content) => writeFileExclusiveSync(p2, content),
    mkdirp: (p2) => fs11.mkdirSync(p2, { recursive: true }),
    copyDir: (src, dst) => copyDirSync(src, dst),
    removeRecursive: (p2) => {
      if (fs11.existsSync(p2))
        fs11.rmSync(p2, { recursive: true, force: true });
    },
    mkdtemp: (prefix) => fs11.mkdtempSync(path11.join(os.tmpdir(), prefix)),
    // Set 079 S3: same-directory atomic replace for the seat-setup config
    // write (fs.rename replaces an existing destination file on both NTFS
    // and POSIX filesystems).
    rename: (oldP, newP) => fs11.renameSync(oldP, newP)
  };
}
function copyDirSync(src, dst) {
  fs11.mkdirSync(dst, { recursive: true });
  for (const entry of fs11.readdirSync(src, { withFileTypes: true })) {
    const s = path11.join(src, entry.name);
    const d = path11.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else if (entry.isSymbolicLink()) {
      const target = fs11.readlinkSync(s);
      fs11.symlinkSync(target, d);
    } else {
      fs11.copyFileSync(s, d);
    }
  }
}
function makePrompts() {
  return {
    pickSource: async (defaultSource) => {
      const items = [
        {
          label: "Install from PyPI (recommended)",
          description: "pip install dabbler-ai-router",
          detail: "Default. Pulls the latest released version from the Python Package Index.",
          value: "pypi"
        },
        {
          label: "Install from GitHub (fallback)",
          description: "git sparse-checkout of ai_router/",
          detail: "Use for offline workspaces, pre-release testing, or forks. Preserves any existing router-config.yaml.",
          value: "github"
        }
      ];
      items.sort((a, b2) => a.value === defaultSource ? -1 : b2.value === defaultSource ? 1 : 0);
      const picked = await vscode9.window.showQuickPick(items, {
        placeHolder: "Choose how to install ai_router",
        ignoreFocusOut: true
      });
      return picked?.value;
    },
    confirmCreateVenv: async (venvAbsPath) => {
      const choice = await vscode9.window.showInformationMessage(
        `No venv found in this workspace. Create one at ${venvAbsPath}?`,
        { modal: true, detail: "ai_router needs a Python environment to install into. The recommended location is .venv at the workspace root." },
        "Create venv",
        "Cancel"
      );
      return choice === "Create venv";
    },
    promptGitHubRef: async (defaultRef) => {
      const ref = await vscode9.window.showInputBox({
        prompt: "Git ref for the sparse checkout (tag or branch). Leave blank for the latest released tag.",
        placeHolder: defaultRef,
        ignoreFocusOut: true
      });
      return ref;
    }
  };
}

// src/utils/copilotCli.ts
var path12 = __toESM(require("path"));
var vscode10 = __toESM(require("vscode"));
function explicitCopilotCliPathSetting() {
  const inspected = vscode10.workspace.getConfiguration("dabblerSessionSets").inspect("copilotCliPath");
  if (!inspected)
    return void 0;
  const value = inspected.workspaceFolderValue ?? inspected.workspaceValue ?? inspected.globalValue;
  const trimmed2 = (value ?? "").trim();
  return trimmed2 === "" ? void 0 : trimmed2;
}
function resolveCopilotCliBinaryCore(explicitSetting, workspaceRoot2, platform = process.platform) {
  if (!explicitSetting)
    return void 0;
  const p2 = platform === "win32" ? path12.win32 : path12.posix;
  if (p2.isAbsolute(explicitSetting))
    return explicitSetting;
  if (explicitSetting.includes("\\") || explicitSetting.includes("/")) {
    return p2.resolve(workspaceRoot2, explicitSetting);
  }
  return explicitSetting;
}
function resolveCopilotCliBinary(workspaceRoot2) {
  return resolveCopilotCliBinaryCore(
    explicitCopilotCliPathSetting(),
    workspaceRoot2,
    process.platform
  );
}

// src/utils/copilotSeatSetup.ts
var crypto2 = __toESM(require("crypto"));
var os2 = __toESM(require("os"));
var path13 = __toESM(require("path"));
var CATALOG_LOCKFILE_REL = path13.posix.join(
  "ai_router",
  "copilot-catalog.lock"
);
var VERIFY_TYPE_FILE_REL = "project-verify-type.txt";
function deriveSeatId(hostname2, username) {
  const canonical = `${hostname2.trim().toLowerCase()}|${username.trim().toLowerCase()}`;
  const digest = crypto2.createHash("sha256").update(canonical, "utf8").digest("hex");
  return `seat-${digest.slice(0, 12)}`;
}
function deriveSeatLabel(projectDir) {
  const base = path13.basename(projectDir);
  return base === "" ? "workspace" : base;
}
function currentUsername() {
  try {
    return os2.userInfo().username;
  } catch {
    return process.env.USERNAME ?? process.env.USER ?? "user";
  }
}
function buildRefreshArgs(seatId, seatLabel, explicitBinary) {
  const args = [
    "-m",
    "ai_router.copilot_catalog",
    "--refresh",
    "--seat-id",
    seatId,
    "--seat-label",
    seatLabel
  ];
  if (explicitBinary)
    args.push("--binary", explicitBinary);
  return args;
}
var REFRESH_SUMMARY_RE = /^Wrote (.+): (\d+)\/(\d+) models confirmed, providers=\[([^\]]*)\]\s*$/m;
function parseRefreshStdout(stdout) {
  const m = REFRESH_SUMMARY_RE.exec(stdout);
  if (!m)
    return null;
  const providers = m[4].split(",").map((tok) => tok.trim().replace(/^'(.*)'$/, "$1")).filter((tok) => tok.length > 0);
  return {
    lockfilePath: m[1],
    confirmed: Number(m[2]),
    total: Number(m[3]),
    providers
  };
}
var SEAT_STATUS_MARKER_REL = path13.posix.join(
  ".dabbler",
  "copilot-seat-status"
);
function writeCopilotSeatStatusMarker(root, ops) {
  ops.writeFile(path13.join(root, SEAT_STATUS_MARKER_REL), "unconfirmed\n");
}
function clearCopilotSeatStatusMarker(root, ops) {
  const abs = path13.join(root, SEAT_STATUS_MARKER_REL);
  if (!ops.exists(abs))
    return;
  ops.removeRecursive(abs);
}
var DEFAULT_KILL_SETTLE_TIMEOUT_MS = 1e4;
function runCatalogRefresh(deps) {
  const lockfileAbs = path13.join(deps.projectDir, CATALOG_LOCKFILE_REL);
  const existedBefore = deps.fileOps.exists(lockfileAbs);
  let priorContent = null;
  if (existedBefore) {
    try {
      priorContent = deps.fileOps.readFile(lockfileAbs);
    } catch {
      priorContent = null;
    }
  }
  const restoreLockfile = () => {
    try {
      if (!existedBefore) {
        deps.fileOps.removeRecursive(lockfileAbs);
      } else if (priorContent !== null) {
        deps.fileOps.writeFile(lockfileAbs, priorContent);
      }
    } catch {
    }
  };
  return new Promise((resolve7) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let cancelledBy = null;
    let cancelReg = null;
    let disposal = null;
    let killSettleTimer = null;
    const settle = (outcome) => {
      if (settled)
        return;
      settled = true;
      if (killSettleTimer)
        clearTimeout(killSettleTimer);
      cancelReg?.dispose();
      disposal?.dispose();
      resolve7(outcome);
    };
    if (deps.cancellation.isCancellationRequested) {
      settle({ kind: "cancelled", by: "operator" });
      return;
    }
    let child = null;
    const killForCancel = (by) => {
      if (settled || cancelledBy)
        return;
      cancelledBy = by;
      try {
        child?.kill();
      } catch {
      }
      killSettleTimer = setTimeout(() => {
        if (settled)
          return;
        restoreLockfile();
        settle({ kind: "cancelled", by });
      }, deps.killSettleTimeoutMs ?? DEFAULT_KILL_SETTLE_TIMEOUT_MS);
    };
    disposal = deps.registerDisposal(() => {
      if (settled)
        return;
      cancelledBy = cancelledBy ?? "teardown";
      try {
        child?.kill();
      } catch {
      }
      restoreLockfile();
      settle({ kind: "cancelled", by: cancelledBy });
    });
    cancelReg = deps.cancellation.onCancellationRequested(
      () => killForCancel("operator")
    );
    try {
      child = deps.spawn(
        deps.venvPythonPath,
        buildRefreshArgs(deps.seatId, deps.seatLabel, deps.explicitBinary),
        { cwd: deps.projectDir },
        {
          onStdout: (chunk) => {
            stdout += chunk;
          },
          onStderr: (chunk) => {
            stderr += chunk;
          },
          onError: (err) => {
            restoreLockfile();
            settle({ kind: "spawn-error", message: err.message });
          },
          onClose: (exitCode) => {
            if (settled) {
              if (cancelledBy === "teardown")
                restoreLockfile();
              return;
            }
            if (exitCode === 0) {
              const summary = parseRefreshStdout(stdout);
              if (summary) {
                settle({ kind: "completed", summary, stdout, stderr });
                return;
              }
            }
            if (cancelledBy) {
              restoreLockfile();
              settle({ kind: "cancelled", by: cancelledBy });
              return;
            }
            if (exitCode !== 0) {
              restoreLockfile();
              settle({ kind: "exit-error", exitCode, stdout, stderr });
              return;
            }
            settle({ kind: "completed-unparseable", stdout, stderr });
          }
        }
      );
    } catch (err) {
      restoreLockfile();
      settle({
        kind: "spawn-error",
        message: err instanceof Error ? err.message : String(err)
      });
      return;
    }
  });
}
function resolveKillStrategy(platform, pid) {
  if (!pid)
    return "plain";
  return platform === "win32" ? "taskkill-tree" : "posix-group";
}
function spawnDetached(platform) {
  return platform !== "win32";
}
function dispatchKill(platform, pid, fx) {
  switch (resolveKillStrategy(platform, pid)) {
    case "taskkill-tree":
      try {
        fx.taskkillTree(pid);
        return;
      } catch {
        break;
      }
    case "posix-group":
      try {
        fx.signalGroup(pid);
        return;
      } catch {
        break;
      }
    case "plain":
      break;
  }
  fx.plainKill();
}
function rerunRefreshHint() {
  return 'run "Dabbler: Set Up Copilot Seat" from the Command Palette';
}
function describeSeatSetupOutcome(outcome, providerKeysPresent, rerunHint) {
  const rerun = `Re-run seat setup (no need to re-scaffold): ${rerunHint}`;
  const keyless = "no DABBLER_* provider key is set, so the router is not yet functional";
  const keyed = "the DABBLER_* provider key(s) already set keep the api profile working wherever this project's verify type resolves to DIRECT_API";
  const notRecorded = `this project's verify type was NOT set to COPILOT_CLI (${VERIFY_TYPE_FILE_REL} is what decides the effective transport)`;
  switch (outcome.kind) {
    case "success":
      return {
        level: outcome.writerWarning ? "warning" : "info",
        message: `Copilot seat set up: ${outcome.confirmed}/${outcome.total} models confirmed (providers: ${outcome.providers.join(", ")}). ` + (outcome.writerWarning ? `COPILOT_CLI written to ${VERIFY_TYPE_FILE_REL}, but it is NOT git-ignored: ${outcome.writerWarning}` : `COPILOT_CLI written to ${VERIFY_TYPE_FILE_REL} (gitignored \u2014 the router derives transport.profile: copilot-cli from it).`)
      };
    case "insufficient-providers": {
      const cause = outcome.confirmed === 0 ? "No models responded at all \u2014 the Copilot CLI may be missing from PATH, not signed in, or blocked by policy. " : outcome.providers.length === 1 ? "This seat may expose only one provider family (an enterprise-managed seat can do this), in which case re-running will not change the result. " : "";
      return {
        level: "warning",
        message: `Copilot seat setup completed, but only ${outcome.providers.length} distinct provider(s) confirmed (${outcome.providers.join(", ") || "none"}) \u2014 routed dispatch would fail closed, so ${notRecorded}. ${cause}` + (providerKeysPresent ? `Meanwhile ${keyed}. ` : `And ${keyless}. `) + `The probe lockfile was kept for inspection at ai_router/copilot-catalog.lock. ${rerun}`
      };
    }
    case "refresh-failed":
      return {
        level: "warning",
        message: providerKeysPresent ? `Copilot seat setup failed: ${outcome.detail}. So ${notRecorded}, and ${keyed}. To use the Copilot seat instead, fix the cause first. ${rerun}` : `Scaffold completed, but the Copilot seat setup did not: ${outcome.detail}. So ${notRecorded}, and ${keyless}. Fix the cause, then: ${rerun}`
      };
    case "cancelled":
      return {
        level: "warning",
        message: `Copilot seat setup was cancelled \u2014 the lockfile was restored to its pre-run state and ${notRecorded}. ` + (providerKeysPresent ? `Meanwhile ${keyed}. ` : `Note ${keyless} until seat setup completes. `) + rerun
      };
    case "verify-type-write-failed":
      return {
        level: "warning",
        message: `Copilot seat probe succeeded (providers: ${outcome.providers.join(", ")}) and the lockfile is in place, but recording this project's verify type failed: ${outcome.detail}. Run \`${verifyTypeCommandHint("COPILOT_CLI")}\` in the project folder \u2014 no re-probe is needed. Until then ` + (providerKeysPresent ? `the router keeps running on whatever ${VERIFY_TYPE_FILE_REL} resolves to, with the DABBLER_* key(s) already set.` : "the router is not yet functional (the verify type is unrecorded and no DABBLER_* provider key is set).")
      };
    default: {
      const unreachable = outcome;
      throw new Error(`unhandled seat-setup outcome: ${JSON.stringify(unreachable)}`);
    }
  }
}
function describeSkipInstallIncompleteHonesty(providerKeysPresent) {
  return providerKeysPresent ? "The DABBLER_* provider key(s) already set will keep the api profile working once the install completes." : "No DABBLER_* provider key is set, so the router is not functional until the install completes and seat setup succeeds.";
}
function outputTail(s) {
  const trimmed2 = (s || "").trim();
  if (!trimmed2)
    return "";
  return trimmed2.split(/\r?\n/).filter(Boolean).slice(-2).join(" / ");
}
function buildVerifyTypeArgs(verifyType, projectDir) {
  return [
    "-m",
    "ai_router.verify_type",
    "--set",
    verifyType,
    "--project-root",
    projectDir
  ];
}
function verifyTypeCommandHint(verifyType) {
  return `python -m ai_router.verify_type --set ${verifyType}`;
}
function extractWriterWarning(stderr) {
  const lines = (stderr || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("WARNING: "));
  return lines.length > 0 ? lines.join(" ") : void 0;
}
function writeVerifyTypeThroughRouter(deps, verifyType) {
  return new Promise((resolve7) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const settle = (result) => {
      if (settled)
        return;
      settled = true;
      resolve7(result);
    };
    const failed = (detail) => settle({ ok: false, detail });
    try {
      deps.spawn(
        deps.venvPythonPath,
        buildVerifyTypeArgs(verifyType, deps.projectDir),
        { cwd: deps.projectDir },
        {
          onStdout: (chunk) => {
            stdout += chunk;
          },
          onStderr: (chunk) => {
            stderr += chunk;
          },
          onClose: (exitCode) => {
            if (exitCode === 0) {
              const warning = extractWriterWarning(stderr);
              settle(warning === void 0 ? { ok: true } : { ok: true, warning });
              return;
            }
            const tail = outputTail(stderr || stdout);
            failed(
              `\`${verifyTypeCommandHint(verifyType)}\` exited with code ${exitCode}${tail ? `: ${tail}` : ""}`
            );
          },
          onError: (err) => {
            failed(`the write subprocess could not start: ${err.message}`);
          }
        }
      );
    } catch (err) {
      failed(
        `the write subprocess could not start: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
}
async function performCopilotSeatSetup(deps) {
  const outcome = await runCatalogRefresh(deps);
  switch (outcome.kind) {
    case "cancelled":
      return { kind: "cancelled", by: outcome.by };
    case "spawn-error":
      return {
        kind: "refresh-failed",
        detail: `the refresh subprocess could not start: ${outcome.message}`
      };
    case "exit-error":
      return {
        kind: "refresh-failed",
        detail: `the refresh exited with code ${outcome.exitCode}` + (outputTail(outcome.stderr || outcome.stdout) ? `: ${outputTail(outcome.stderr || outcome.stdout)}` : "")
      };
    case "completed-unparseable":
      return {
        kind: "refresh-failed",
        detail: "the refresh finished but its result line could not be parsed" + (outputTail(outcome.stdout) ? ` (last output: ${outputTail(outcome.stdout)})` : " (no output)")
      };
    case "completed": {
      const distinct = Array.from(new Set(outcome.summary.providers)).sort();
      const base = {
        providers: distinct,
        confirmed: outcome.summary.confirmed,
        total: outcome.summary.total
      };
      if (distinct.length < 2) {
        return { kind: "insufficient-providers", ...base };
      }
      const written = await writeVerifyTypeThroughRouter(deps, "COPILOT_CLI");
      if (!written.ok) {
        return {
          kind: "verify-type-write-failed",
          providers: distinct,
          detail: written.detail
        };
      }
      return written.warning === void 0 ? { kind: "success", ...base } : { kind: "success", ...base, writerWarning: written.warning };
    }
  }
}

// src/utils/providerKey.ts
var PROVIDER_KEY_VARS = [
  "DABBLER_ANTHROPIC_API_KEY",
  "DABBLER_OPENAI_API_KEY",
  "DABBLER_GEMINI_API_KEY"
];
function providerKeyPresent(env8) {
  return PROVIDER_KEY_VARS.some((k2) => {
    const v = env8[k2];
    return typeof v === "string" && v.trim().length > 0;
  });
}

// src/utils/budgetYaml.ts
var path14 = __toESM(require("path"));
var BUDGET_YAML_REL = path14.join("ai_router", "budget.yaml");
function deriveBudgetMode(thresholdUsd) {
  if (thresholdUsd === 0)
    return "zero-budget";
  if (thresholdUsd < 20)
    return "limited-budget";
  if (thresholdUsd < 100)
    return "middle-tier";
  return "ample-budget";
}
function resolveVerificationMethod(thresholdUsd, zeroMethod) {
  if (thresholdUsd > 0)
    return "api";
  return zeroMethod;
}
function localIsoTimestamp(d = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(Math.abs(n)).padStart(2, "0");
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(Math.abs(offMin) / 60))}:${pad(Math.abs(offMin) % 60)}`;
}
function renderBudgetYaml(opts) {
  return [
    "# Project verification budget \u2014 see docs/budget-yaml-schema.md.",
    "# Used by the workflow for spend reporting and threshold monitoring.",
    `threshold_usd: ${opts.thresholdUsd}`,
    "scope: per-project",
    `mode: "${deriveBudgetMode(opts.thresholdUsd)}"`,
    `verification_method: "${opts.verificationMethod}"`,
    `verification_nte_usd: ${opts.thresholdUsd}`,
    `set_at: "${opts.setAt}"`,
    'set_by: "getting-started-form"',
    "warn_at_percent: 80",
    ""
  ].join("\n");
}
function writeBudgetYaml(projectDir, budget, fileOps, now = /* @__PURE__ */ new Date()) {
  const relPath = BUDGET_YAML_REL;
  const method = resolveVerificationMethod(budget.thresholdUsd, budget.zeroMethod);
  if (!method)
    return { outcome: "skipped-unresolved", relPath };
  const abs = path14.join(projectDir, relPath);
  if (fileOps.exists(abs))
    return { outcome: "skipped-exists", relPath };
  fileOps.writeFile(
    abs,
    renderBudgetYaml({
      thresholdUsd: budget.thresholdUsd,
      verificationMethod: method,
      setAt: localIsoTimestamp(now)
    })
  );
  return { outcome: "written", relPath };
}

// src/utils/moduleAuthoring.ts
var fs12 = __toESM(require("fs"));
var path15 = __toESM(require("path"));
var MODULES_MANIFEST_DISPLAY = MODULES_MANIFEST_REL.replace(/\\/g, "/");
var MODULE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function validateNewModuleSlug(raw, existingSlugs) {
  const slug = (raw ?? "").trim();
  if (slug === "") {
    return "Enter a module slug (kebab-case, e.g. greeter).";
  }
  if (!MODULE_SLUG_RE.test(slug)) {
    return 'Module slugs are kebab-case: lowercase letters and digits, joined by single hyphens (e.g. "greeter", "payment-api").';
  }
  if (existingSlugs.includes(slug)) {
    return `Module "${slug}" already exists in ${MODULES_MANIFEST_DISPLAY}.`;
  }
  return null;
}
function defaultModulePlanPath(slug) {
  return `docs/modules/${slug}/project-plan.md`;
}
var LEGACY_ROOT_PLAN_REL = "docs/planning/project-plan.md";
function classifyModulesManifest(root) {
  const entries = readModulesManifest(root);
  if (entries !== null)
    return { kind: "present", entries };
  return manifestEntryExists(path15.join(root, MODULES_MANIFEST_REL)) ? { kind: "invalid" } : { kind: "absent" };
}
function manifestEntryExists(abs) {
  try {
    fs12.lstatSync(abs);
    return true;
  } catch {
    return false;
  }
}
var INVALID_MANIFEST_MESSAGE = `${MODULES_MANIFEST_DISPLAY} exists but is not a valid module manifest (expected a YAML mapping with a "modules:" list). Fix the file by hand before using the module-aware flows.`;
var MODULES_YAML_HEADER_COMMENTS = `# docs/modules.yaml \u2014 the module manifest (Dabbler module-organized projects).
#
# Each entry declares one module of this repo:
#   slug:      machine identity (kebab-case). Session sets declare
#              \`module: <slug>\` in their spec.md configuration block and the
#              Session Set Explorer groups them under this module.
#   title:     the display name the Explorer shows for the group.
#   codeRoots: the code paths this module owns ([] for an integration
#              module that only composes other modules).
#   planPath:  the module's project plan (decomposed into session sets).
#   touches:   optional \u2014 the modules an integration module is sanctioned
#              to work across; owners of every touched module review its PRs.
#
# Explorer display order = this file's order. Session-set NAMES stay
# globally unique across ALL modules \u2014 \`module\` is a grouping attribute,
# never part of a set's identity.
#
# To have an AI assistant decompose this project into modules and fill this
# file in, run the "Dabbler: Copy Module Decomposition Prompt" command
# (Command Palette) \u2014 then paste the copied prompt into your assistant.
#
# Renaming, deleting, splitting, or merging modules later (and adopting
# modules in an older repo) is covered in the module reorganization guide:
# https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/module-reorganization.md
`;
var MODULES_YAML_TEMPLATE = `${MODULES_YAML_HEADER_COMMENTS}#
# Example entries (copy below \`modules:\`, uncommented, to declare this
# repo's modules \u2014 or leave the list empty for a single-module repo):
#
# - slug: payment-api
#   title: "Payment API"
#   codeRoots:
#     - src/payment
#   planPath: docs/modules/payment-api/project-plan.md
# - slug: integration
#   title: "Cross-Module Integration"
#   codeRoots: []
#   planPath: docs/modules/integration/project-plan.md
#   touches:
#     - payment-api

modules: []
`;
var NODE_ENSURE_MANIFEST_IO = {
  mkdirp: (dir) => fs12.mkdirSync(dir, { recursive: true }),
  writeFileExclusive: (abs, data) => writeFileExclusiveSync(abs, data)
};
function ensureModulesManifest(root, io = NODE_ENSURE_MANIFEST_IO) {
  const abs = path15.join(root, MODULES_MANIFEST_REL);
  io.mkdirp(path15.dirname(abs));
  try {
    io.writeFileExclusive(abs, MODULES_YAML_TEMPLATE);
    return { created: true, manifestRel: MODULES_MANIFEST_DISPLAY };
  } catch (err) {
    if (err.code === "EEXIST") {
      return { created: false, manifestRel: MODULES_MANIFEST_DISPLAY };
    }
    throw err;
  }
}
function resolveModuleTarget(entries) {
  if (!entries || entries.length === 0)
    return { kind: "none" };
  if (entries.length === 1)
    return { kind: "auto", entry: entries[0] };
  return { kind: "pick", entries };
}
function isSafeRepoRelativePath(p2) {
  if (p2 === "")
    return false;
  if (p2.startsWith("/"))
    return false;
  if (/^[A-Za-z]:/.test(p2))
    return false;
  return p2.split("/").every((seg) => seg !== ".." && seg !== "");
}
function resolveModulePlanRelPath(entry) {
  const fallback = defaultModulePlanPath(entry.slug);
  const raw = entry.planPath && entry.planPath.trim() !== "" ? entry.planPath.trim().replace(/\\/g, "/") : "";
  if (raw === "")
    return { path: fallback, degraded: false };
  if (!isSafeRepoRelativePath(raw))
    return { path: fallback, degraded: true };
  return { path: raw, degraded: false };
}
function modulePlanRelPath(entry) {
  const resolved = resolveModulePlanRelPath(entry);
  if (resolved.degraded) {
    console.warn(
      `[dabblerSessionSets] module "${entry.slug}" declares planPath ${JSON.stringify(entry.planPath)}, which is not a safe repo-relative path \u2014 using the default ${resolved.path} instead.`
    );
  }
  return resolved.path;
}
function unknownModuleMessage(slug) {
  return `Module "${slug}" is no longer declared in ${MODULES_MANIFEST_DISPLAY} (it may have been removed or renamed). Refresh the Work Explorer and try again.`;
}
async function pickModuleForAuthoring(root, ui, opts) {
  const classified = classifyModulesManifest(root);
  if (classified.kind === "invalid") {
    ui.showErrorMessage(INVALID_MANIFEST_MESSAGE);
    return { kind: "invalid-manifest", entry: null };
  }
  if (opts && opts.preselectedSlug !== void 0) {
    const slug = opts.preselectedSlug;
    if (slug === "")
      return { kind: "none", entry: null };
    const entries = classified.kind === "present" ? classified.entries : [];
    const entry = entries.find((e) => e.slug === slug);
    if (!entry) {
      ui.showErrorMessage(unknownModuleMessage(slug));
      return { kind: "unknown-module", entry: null };
    }
    return { kind: "picked", entry };
  }
  const target = resolveModuleTarget(
    classified.kind === "present" ? classified.entries : null
  );
  if (target.kind === "none")
    return { kind: "none", entry: null };
  if (target.kind === "auto") {
    ui.showInformationMessage(
      `Using module "${target.entry.title}" (${target.entry.slug}) \u2014 the only module in ${MODULES_MANIFEST_DISPLAY}.`
    );
    return { kind: "picked", entry: target.entry };
  }
  const picked = await ui.showQuickPick(
    target.entries.map((e) => ({
      label: e.title,
      description: e.slug,
      detail: `plan: ${modulePlanRelPath(e)}`,
      entry: e
    })),
    { placeHolder: "Which module is this for?", ignoreFocusOut: true }
  );
  if (!picked)
    return { kind: "cancelled", entry: null };
  return { kind: "picked", entry: picked.entry };
}
var EXECUTION_ARTIFACT_FILENAMES = [
  "activity-log.json",
  "session-events.jsonl",
  "change-log.md",
  "ai-assignment.md",
  "disposition.json",
  "CANCELLED.md",
  "RESTORED.md"
];
function hasExecutionArtifacts(dir) {
  return EXECUTION_ARTIFACT_FILENAMES.some((f) => fs12.existsSync(path15.join(dir, f)));
}
function inferLegacyStatus(dir) {
  if (fs12.existsSync(path15.join(dir, "change-log.md")))
    return "complete";
  if (fs12.existsSync(path15.join(dir, "activity-log.json")))
    return "in-progress";
  return "not-started";
}
function rawSessionSetStatus(dir) {
  let raw;
  try {
    raw = fs12.readFileSync(path15.join(dir, "session-state.json"), "utf8");
  } catch {
    return inferLegacyStatus(dir);
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    return inferLegacyStatus(dir);
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc))
    return inferLegacyStatus(dir);
  const status = doc.status;
  if (typeof status !== "string")
    return inferLegacyStatus(dir);
  const canon = status === "completed" || status === "done" ? "complete" : status;
  return canon === "complete" || canon === "in-progress" ? canon : "not-started";
}
function classifyOneSetForDeletion(dir, kind) {
  const cancellation = readCancellationState(dir);
  if (cancellation === "cancelled" || cancellation === "unknown" && isCancelled(dir)) {
    return "terminal";
  }
  const status = rawSessionSetStatus(dir);
  if (status === "complete")
    return "terminal";
  if (status === "not-started") {
    const k2 = (kind ?? "").toLowerCase();
    const isLifecycleScaffold = k2 === "plan" || k2 === "decomposition";
    if (isLifecycleScaffold && !hasExecutionArtifacts(dir))
      return "remove";
  }
  return "cancel";
}
function classifyModuleSetsForDeletion(root, slug) {
  const setsRoot = path15.join(root, SESSION_SETS_REL);
  const out = [];
  for (const name of listSessionSetDirNames(root)) {
    const dir = path15.join(setsRoot, name);
    const specAbs = path15.join(dir, "spec.md");
    const config = parseSessionSetConfig(specAbs);
    if (config.module !== slug)
      continue;
    out.push({ name, dir, disposition: classifyOneSetForDeletion(dir, config.kind) });
  }
  return out;
}

// src/utils/routerCli.ts
var vscode11 = __toESM(require("vscode"));
var cp3 = __toESM(require("child_process"));
var ROUTER_OUTPUT_CHANNEL = "Dabbler Commands";
function quoteForDisplay(arg) {
  if (arg === "")
    return '""';
  if (!/[\s"'`$&|<>()^;,{}[\]@#]/.test(arg))
    return arg;
  return `"${arg.replace(/(["`$])/g, "`$1")}"`;
}
function buildCommandLine(pythonPath, invocation) {
  const exe = quoteForDisplay(pythonPath);
  const parts = [exe, "-m", invocation.module, ...invocation.args.map(quoteForDisplay)];
  return (exe.startsWith('"') ? "& " : "") + parts.join(" ");
}
function buildArgv(invocation) {
  return ["-m", invocation.module, ...invocation.args];
}
var sharedChannel;
function routerOutputChannel() {
  if (!sharedChannel) {
    sharedChannel = vscode11.window.createOutputChannel(ROUTER_OUTPUT_CHANNEL);
  }
  return sharedChannel;
}
function defaultEcho() {
  const channel = routerOutputChannel();
  return {
    append: (line) => channel.appendLine(line),
    // `preserveFocus: true` — showing the developer the command must never
    // steal focus from the editor mid-flow. They asked to see it, not to be
    // taken to it.
    reveal: () => channel.show(true)
  };
}
function runRouterCli(invocation, deps = {}) {
  const resolveInterpreter = deps.resolveInterpreter ?? resolvePythonInterpreter;
  const interpreterExists = deps.interpreterExists ?? ((p2) => interpreterResolves(p2));
  const spawn6 = deps.spawn ?? cp3.spawn;
  const echo = deps.echo ?? defaultEcho();
  const pythonPath = resolveInterpreter(invocation.cwd);
  const commandLine = buildCommandLine(pythonPath, invocation);
  echo.reveal();
  echo.append(`[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] Running:`);
  echo.append(commandLine);
  const settleUnavailable = (message) => {
    echo.append(`  ${message}`);
    return {
      outcome: "unavailable",
      ok: false,
      exitCode: null,
      message,
      commandLine,
      raw: { stdout: "", stderr: "" }
    };
  };
  if (!interpreterExists(pythonPath)) {
    return Promise.resolve(
      settleUnavailable(describeMissingPython(invocation.actionLabel))
    );
  }
  return new Promise((resolve7) => {
    let settled = false;
    const settle = (result) => {
      if (settled)
        return;
      settled = true;
      resolve7(result);
    };
    let child;
    try {
      child = spawn6(pythonPath, buildArgv(invocation), {
        cwd: invocation.cwd,
        windowsHide: true
      });
    } catch (err) {
      settle(
        settleUnavailable(
          `could not spawn ${pythonPath}: ${err instanceof Error ? err.message : String(err)}`
        )
      );
      return;
    }
    let stdout = "";
    let stderr = "";
    const outDec = makeUtf8ChunkDecoder();
    const errDec = makeUtf8ChunkDecoder();
    child.stdout?.on("data", (c3) => stdout += outDec.write(c3));
    child.stderr?.on("data", (c3) => stderr += errDec.write(c3));
    child.on("error", (err) => {
      settle(settleUnavailable(`could not spawn ${pythonPath}: ${err.message}`));
    });
    child.on("close", (code) => {
      if (settled)
        return;
      stdout += outDec.end();
      stderr += errDec.end();
      for (const line of `${stdout}${stderr}`.split(/\r?\n/)) {
        if (line.trim() !== "")
          echo.append(`  ${line}`);
      }
      if (isAiRouterNotInstalled(stderr)) {
        settle({
          outcome: "unavailable",
          ok: false,
          exitCode: code,
          message: describeAiRouterImportFailure(pythonPath),
          commandLine,
          raw: { stdout, stderr }
        });
        return;
      }
      const payload = parseJsonPayload(stdout);
      settle({
        ...classify(code, payload, stdout, stderr),
        commandLine,
        payload,
        raw: { stdout, stderr }
      });
    });
  });
}
function parseJsonPayload(stdout) {
  const text = (stdout || "").trim();
  if (!text)
    return void 0;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start)
    return void 0;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function firstString(payload, key) {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : void 0;
}
function classify(code, payload, stdout, stderr) {
  const fallback = (stderr.trim() || stdout.trim() || `exit ${code}`).slice(
    0,
    600
  );
  if (code === 0) {
    return { outcome: "ok", ok: true, exitCode: code, message: stdout.trim() };
  }
  if (code === 3) {
    return {
      outcome: "refused",
      ok: false,
      exitCode: code,
      message: firstString(payload, "refused") ?? fallback
    };
  }
  if (code === 4) {
    return {
      outcome: "writeFailed",
      ok: false,
      exitCode: code,
      message: firstString(payload, "writeFailed") ?? fallback
    };
  }
  return { outcome: "failed", ok: false, exitCode: code, message: fallback };
}

// src/utils/moduleLifecycleCli.ts
var MODULES_CLI = "ai_router.modules";
function createArgs(root, args) {
  const out = ["--repo-root", root, "--json", "create", "--slug", args.slug];
  const title = (args.title ?? "").trim();
  if (title !== "")
    out.push("--title", title);
  return out;
}
function renameArgs(root, args) {
  const out = ["--repo-root", root, "--json", "rename", "--slug", args.slug];
  if (args.newSlug !== void 0)
    out.push("--new-slug", args.newSlug);
  if (args.newTitle !== void 0)
    out.push("--new-title", args.newTitle);
  return out;
}
function deleteArgs(root, slug) {
  return ["--repo-root", root, "--json", "delete", "--slug", slug];
}
function assignSetsArgs(root, args) {
  const out = [
    "--repo-root",
    root,
    "--json",
    "assign-sets",
    "--slug",
    args.slug
  ];
  for (const name of args.setNames)
    out.push("--set", name);
  return out;
}
function run(root, args, actionLabel, deps) {
  return runRouterCli(
    { module: MODULES_CLI, args, cwd: root, actionLabel },
    deps
  );
}
function runCreateModule(root, args, deps) {
  return run(root, createArgs(root, args), "Creating a module", deps);
}
function runRenameModule(root, args, deps) {
  return run(root, renameArgs(root, args), "Renaming a module", deps);
}
function runDeleteModule(root, slug, deps) {
  return run(root, deleteArgs(root, slug), "Deleting a module", deps);
}
function runAssignSets(root, args, deps) {
  return run(root, assignSetsArgs(root, args), "Assigning sets", deps);
}
function str(payload, key) {
  const v = payload?.[key];
  return typeof v === "string" ? v : "";
}
function bool(payload, key) {
  return payload?.[key] === true;
}
function list(payload, key) {
  const v = payload?.[key];
  return Array.isArray(v) ? v.filter((x2) => typeof x2 === "string") : [];
}
function describeFailure(verb, result) {
  const detail = result.message.trim() || `exit ${result.exitCode}`;
  switch (result.outcome) {
    case "refused":
      return `${verb} refused \u2014 ${detail} Nothing was written.`;
    case "writeFailed": {
      const rolledBack = result.payload?.["rolledBack"];
      if (rolledBack === true) {
        return `${verb} failed: ${detail} Every touched file was rolled back \u2014 the workspace is unchanged.`;
      }
      if (rolledBack === false) {
        return `${verb} failed: ${detail} A rollback write ALSO failed \u2014 reconcile docs/modules.yaml and the affected files from git before retrying.`;
      }
      if (bool(result.payload, "stillDeclared")) {
        return `${verb} stopped partway: ${detail} The module is still declared \u2014 re-run the command to finish (already-applied steps are skipped).`;
      }
      return `${verb} failed: ${detail}`;
    }
    case "unavailable":
      return detail;
    default:
      return `${verb} failed: ${detail}`;
  }
}
function describeCreate(payload) {
  const slug = str(payload, "slug");
  const manifestRel = str(payload, "manifestRel");
  const planRel = str(payload, "planRel");
  const planSet = str(payload, "planSetSlug");
  const decompSet = str(payload, "decompositionSetSlug");
  return `Module "${slug}" ${bool(payload, "manifestCreated") ? `declared in a new ${manifestRel}` : `appended to ${manifestRel}`}. ` + (bool(payload, "planCreated") ? `Plan stub created at ${planRel} \u2014 fill it in, then decompose it into session sets.` : `Existing plan at ${planRel} kept.`) + (planSet || decompSet ? ` Next steps scaffolded: ${planSet} and ${decompSet}.` : "");
}
function describeRename(payload) {
  const parts = [];
  if (bool(payload, "slugChanged"))
    parts.push(`slug \u2192 ${str(payload, "newSlug")}`);
  if (bool(payload, "titleChanged"))
    parts.push(`title \u2192 "${str(payload, "newTitle")}"`);
  const restamped = list(payload, "restamped");
  const tail = restamped.length ? ` Restamped ${restamped.length} set(s): ${restamped.join(", ")}.` : "";
  return `Renamed module (${parts.join(", ")}).${tail}`;
}
function describeDelete(payload) {
  return `Deleted module "${str(payload, "slug")}" \u2014 ${list(payload, "cancelled").length} set(s) cancelled, ${list(payload, "removed").length} scaffold(s) removed, ${list(payload, "terminal").length} left untouched.`;
}
function describeAssign(payload) {
  const slug = str(payload, "slug");
  const stamped = list(payload, "stamped");
  const already = list(payload, "alreadyAssigned");
  const parts = [];
  if (stamped.length) {
    parts.push(
      `Stamped module: ${slug} into ${stamped.length} set(s) (${stamped.join(", ")})`
    );
  }
  if (already.length) {
    parts.push(`${already.length} already assigned (${already.join(", ")})`);
  }
  return parts.length ? `${parts.join("; ")}.` : `Nothing to change \u2014 the selected sets already declare module: ${slug}.`;
}
function assignedAny(payload) {
  return list(payload, "stamped").length > 0;
}

// src/commands/gitScaffold.ts
async function scaffoldConsumerRepo(deps) {
  const report = deps.reportProgress ?? (() => {
  });
  const { files } = deps.structureOnly ? renderStructureBootstrap(deps.bundle, deps.ctx) : renderConsumerBootstrap(deps.bundle, deps.ctx);
  const written = [];
  const skipped = [];
  for (const [rel, content] of Object.entries(files)) {
    const abs = path16.join(deps.projectDir, rel);
    if (deps.fileOps.exists(abs)) {
      skipped.push(rel);
      continue;
    }
    deps.fileOps.writeFile(abs, content);
    written.push(rel);
  }
  const ensured = ensureModulesManifest(deps.projectDir, deps.fileOps);
  (ensured.created ? written : skipped).push(ensured.manifestRel);
  report("Installing dabbler-ai-router (venv + router config)\u2026");
  const install = await deps.installRouter();
  let budgetOutcome = null;
  if (deps.budget) {
    const r2 = writeBudgetYaml(deps.projectDir, deps.budget, deps.fileOps, deps.now);
    budgetOutcome = r2.outcome;
  }
  return {
    written,
    skipped,
    installOk: install.ok,
    installMessage: install.message,
    budgetOutcome
  };
}
async function scaffoldDefaultModuleAndLifecycleSets(projectDir, cliDeps) {
  if (listSessionSetDirNames(projectDir).length > 0) {
    return {
      ran: false,
      note: " The default module was NOT scaffolded \u2014 this repo already has session sets under docs/session-sets/, so it is treated as an existing (legacy) repo, not a fresh scaffold."
    };
  }
  const result = await runCreateModule(
    projectDir,
    { slug: "default", title: "Default" },
    cliDeps
  );
  if (!result.ok) {
    return {
      ran: false,
      note: ` The default module's starter sets were NOT scaffolded (${describeFailure("Creating the default module", result)}).`
    };
  }
  const planSlug = String(result.payload?.["planSetSlug"] ?? "");
  const decompositionSlug = String(result.payload?.["decompositionSetSlug"] ?? "");
  return {
    ran: true,
    planSlug,
    decompositionSlug,
    note: ` Default module scaffolded: ${planSlug} (plan) and ${decompositionSlug} (decomposition) \u2014 rename or delete "Default" any time from the Work Explorer.`
  };
}
function decideDefaultModuleScaffold(classification, routerCapable) {
  if (classification.kind === "invalid")
    return "skip-manifest-invalid";
  if (classification.kind === "present" && classification.entries.length > 0) {
    return "skip-modules-declared";
  }
  if (!routerCapable)
    return "skip-router-unavailable";
  return "scaffold";
}
function describeDefaultModuleSkip(gate) {
  switch (gate) {
    case "skip-router-unavailable":
      return ' The default module was NOT scaffolded because the ai-router install did not complete \u2014 creating it runs `python -m ai_router.modules` in the scaffolded .venv. Finish the install ("Dabbler: Install ai-router"), then run "Dabbler: Set Up New Project" again \u2014 it will pick up where it left off, and you do NOT need to delete docs/modules.yaml.';
    case "skip-manifest-invalid":
      return ` The default module was NOT scaffolded \u2014 ${INVALID_MANIFEST_MESSAGE}`;
    case "skip-modules-declared":
    case "scaffold":
      return "";
  }
}
async function pickDirectory() {
  const picked = await vscode12.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select project folder"
  });
  return picked?.[0]?.fsPath;
}
function isoDate() {
  const d = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function registerGitScaffoldCommand(context) {
  context.subscriptions.push(
    vscode12.commands.registerCommand("dabbler.setupNewProject", async () => {
      const openRoot = vscode12.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const projectDir = openRoot ?? await pickDirectory();
      if (!projectDir)
        return;
      await buildProjectStructureNoPrompt(context, projectDir);
      if (!openRoot) {
        await vscode12.commands.executeCommand(
          "vscode.openFolder",
          vscode12.Uri.file(projectDir)
        );
      }
    })
  );
}
function makeScaffoldInstallPrompts() {
  return {
    pickSource: async () => "pypi",
    confirmCreateVenv: async () => true,
    promptGitHubRef: async () => ""
  };
}
async function buildProjectStructureNoPrompt(context, projectDir, budget, transportProfile, seams = {}) {
  if (!(seams.probePython ?? probePythonPresence)(projectDir)) {
    vscode12.window.showErrorMessage(
      describeMissingPython("Build project structure")
    );
    return void 0;
  }
  try {
    if (seams.gitInit) {
      await seams.gitInit(projectDir);
    } else {
      const git3 = esm_default(projectDir);
      const isRepo = await git3.checkIsRepo().catch(() => false);
      if (!isRepo)
        await git3.init();
    }
  } catch (err) {
    console.warn("[gettingStarted] git init failed \u2014 continuing scaffold", err);
  }
  let bundle;
  try {
    bundle = seams.loadBundle ? seams.loadBundle() : loadTemplateBundle(resolveBundledTemplateDir(context.extensionPath));
  } catch (err) {
    vscode12.window.showErrorMessage(
      `Could not load the consumer-bootstrap template bundle: ${err instanceof Error ? err.message : String(err)}`
    );
    return void 0;
  }
  const ctx = structureOnlyContext(path16.basename(projectDir), isoDate());
  const effectiveBudget = transportProfile === "copilot-cli" ? void 0 : budget;
  const pythonPath = resolveScaffoldBootstrapPython(projectDir) ?? resolveExplicitPythonPath(projectDir);
  const runScaffold = seams.runScaffold ?? (async (scaffoldCtx, scaffoldBundle, scaffoldPython, scaffoldBudget) => {
    let installOutcome2 = null;
    const scaffolded = await vscode12.window.withProgress(
      {
        location: vscode12.ProgressLocation.Notification,
        title: "Building project structure\u2026",
        cancellable: false
      },
      async (progress) => scaffoldConsumerRepo({
        projectDir,
        ctx: scaffoldCtx,
        bundle: scaffoldBundle,
        fileOps: makeFileOps(),
        structureOnly: true,
        budget: scaffoldBudget,
        reportProgress: (m) => progress.report({ message: m }),
        installRouter: async () => {
          installOutcome2 = await installAiRouter({
            workspaceRoot: projectDir,
            pythonPath: scaffoldPython,
            // Set 122 S3: resolved AFTER the install, so a fresh
            // project's newly-created .venv is what gets probed — the
            // same call `runRouterCli` makes when a command runs.
            resolveLauncherPython: () => resolvePythonInterpreter(projectDir),
            spawner: makeSpawner(),
            fileOps: makeFileOps(),
            prompts: makeScaffoldInstallPrompts(),
            reportProgress: (m) => progress.report({ message: m })
          });
          return installOutcome2;
        }
      })
    );
    return { result: scaffolded, installOutcome: installOutcome2 };
  });
  const { result, installOutcome } = await runScaffold(
    ctx,
    bundle,
    pythonPath,
    effectiveBudget
  );
  const budgetNote = result.budgetOutcome === "written" ? " Budget saved to ai_router/budget.yaml." : result.budgetOutcome === "skipped-exists" ? " Existing ai_router/budget.yaml kept (budget input not applied)." : "";
  const defaultModuleGate = (seams.decideDefaultModule ?? decideDefaultModuleScaffold)(
    classifyModulesManifest(projectDir),
    result.installOk
  );
  const defaultModuleNote = defaultModuleGate === "scaffold" ? (await (seams.scaffoldDefaultModule ?? scaffoldDefaultModuleAndLifecycleSets)(projectDir)).note : describeDefaultModuleSkip(defaultModuleGate);
  const summary = `Project structure built: ${result.written.length} file(s) written` + (result.skipped.length ? `, ${result.skipped.length} existing kept` : "") + `. ${result.installOk ? "ai-router installed." : `Router install needs attention: ${result.installMessage}`}` + budgetNote + defaultModuleNote;
  const showInfo = seams.showInfo ?? ((m) => void vscode12.window.showInformationMessage(m));
  const showWarning = seams.showWarning ?? ((m) => void vscode12.window.showWarningMessage(m));
  if (result.installOk) {
    showInfo(summary);
  } else {
    showWarning(
      `${summary} You can finish the install later with "Dabbler: Install ai-router".`
    );
  }
  const venvPath = installOutcome?.venvPath ?? null;
  const seatDecision = decideCopilotSeatSetup(
    transportProfile,
    result.installOk,
    venvPath
  );
  const recordSeatChoice = seams.recordSeatChoice ?? ((dir, chosen) => {
    const ops = makeFileOps();
    if (chosen)
      writeCopilotSeatStatusMarker(dir, ops);
    else
      clearCopilotSeatStatusMarker(dir, ops);
  });
  if (transportProfile === "copilot-cli") {
    recordSeatChoice(projectDir, true);
  } else if (transportProfile === "api") {
    recordSeatChoice(projectDir, false);
  }
  switch (seatDecision) {
    case "run":
      await (seams.seatSetup ?? runCopilotSeatSetupWithProgress)(
        context,
        projectDir,
        venvPath
      );
      break;
    case "skip-install-incomplete":
      showWarning(
        'Copilot seat setup was skipped because the ai-router install did not complete \u2014 the seat setup runs inside the scaffolded .venv. Finish the install ("Dabbler: Install ai-router"), then ' + rerunRefreshHint() + ". " + describeSkipInstallIncompleteHonesty(providerKeyPresent(process.env))
      );
      break;
    case "skip-not-selected":
      break;
  }
  return result;
}
function decideCopilotSeatSetup(transportProfile, installOk, venvPath) {
  if (transportProfile !== "copilot-cli") {
    return "skip-not-selected";
  }
  if (!installOk || !venvPath)
    return "skip-install-incomplete";
  return "run";
}
function makeRealKillEffects(child, spawnFn = (cmd, args, opts) => cp4.spawn(cmd, args, opts)) {
  return {
    taskkillTree: (pid) => {
      const tk = spawnFn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true
      });
      tk.on("error", () => child.kill());
    },
    signalGroup: (pid) => process.kill(-pid, "SIGTERM"),
    plainKill: () => child.kill()
  };
}
function makeRefreshChildSpawner() {
  return (cmd, args, opts, callbacks) => {
    const child = cp4.spawn(cmd, args, {
      cwd: opts.cwd,
      env: process.env,
      windowsHide: true,
      // POSIX: run the child as its own process-group leader so a cancel
      // can signal the whole group — python AND its in-flight `copilot`
      // grandchild (S3, the named S2 residual). win32 stays undetached;
      // taskkill /T walks the tree without it.
      detached: spawnDetached(process.platform)
    });
    const outDec = makeUtf8ChunkDecoder();
    const errDec = makeUtf8ChunkDecoder();
    child.stdout?.on(
      "data",
      (chunk) => callbacks.onStdout(outDec.write(chunk))
    );
    child.stderr?.on(
      "data",
      (chunk) => callbacks.onStderr(errDec.write(chunk))
    );
    const flush = () => {
      const outTail = outDec.end();
      if (outTail)
        callbacks.onStdout(outTail);
      const errTail = errDec.end();
      if (errTail)
        callbacks.onStderr(errTail);
    };
    child.on("error", (err) => callbacks.onError(err));
    child.on("close", (code) => {
      flush();
      callbacks.onClose(code);
    });
    return {
      kill: () => {
        dispatchKill(process.platform, child.pid, makeRealKillEffects(child));
      }
    };
  };
}
async function runCopilotSeatSetupWithProgress(context, projectDir, venvPath, seams = {}) {
  const withProgress = seams.withProgress ?? vscode12.window.withProgress.bind(vscode12.window);
  const perform = seams.perform ?? performCopilotSeatSetup;
  const showInfo = seams.showInfo ?? ((m) => void vscode12.window.showInformationMessage(m));
  const showWarning = seams.showWarning ?? ((m) => void vscode12.window.showWarningMessage(m));
  const seatId = deriveSeatId(os3.hostname(), currentUsername());
  const seatLabel = deriveSeatLabel(projectDir);
  const outcome = await withProgress(
    {
      location: vscode12.ProgressLocation.Notification,
      title: "Setting up the Copilot seat \u2014 probing the seat's models (about 1\u20132 minutes)\u2026",
      cancellable: true
    },
    (_progress, token) => perform({
      venvPythonPath: venvPython(venvPath),
      projectDir,
      seatId,
      seatLabel,
      explicitBinary: resolveCopilotCliBinary(projectDir),
      spawn: seams.spawn ?? makeRefreshChildSpawner(),
      fileOps: makeFileOps(),
      cancellation: token,
      registerDisposal: (dispose) => {
        const d = new vscode12.Disposable(dispose);
        context.subscriptions.push(d);
        return {
          // S2 review Minor 4: also splice the Disposable back out of
          // context.subscriptions when the run settles, so repeated
          // builds do not accumulate dead entries for the host's
          // lifetime.
          dispose: () => {
            d.dispose();
            const i2 = context.subscriptions.indexOf(d);
            if (i2 >= 0)
              context.subscriptions.splice(i2, 1);
          }
        };
      }
    })
  );
  const msg = describeSeatSetupOutcome(
    outcome,
    providerKeyPresent(process.env),
    rerunRefreshHint()
  );
  (msg.level === "info" ? showInfo : showWarning)(msg.message);
  return outcome;
}

// src/commands/trySampleProject.ts
var fs13 = __toESM(require("fs"));
var path18 = __toESM(require("path"));
var vscode13 = __toESM(require("vscode"));

// src/utils/sampleProject.ts
var path17 = __toESM(require("path"));
function resolveBundledSampleDir(extensionPath) {
  return path17.join(extensionPath, "dist", "templates", "sample-project");
}
function renderedBasename(name) {
  return name.startsWith("dot-") ? `.${name.slice(4)}` : name;
}
function renderedRelPath(relPath) {
  return relPath.split(/[\\/]/).filter((s) => s.length > 0).map(renderedBasename).join("/");
}
function loadSampleBundle(bundleDir, io) {
  const metaRaw = io.readFile(path17.join(bundleDir, "bundle.json"));
  const meta = JSON.parse(metaRaw);
  for (const key of [
    "bundleVersion",
    "sampleSetSlug",
    "programEntryPoint",
    "testCommandArgs",
    "expectedTestCount",
    "expectedProgramOutput",
    "missingFunction"
  ]) {
    if (meta[key] === void 0 || meta[key] === null) {
      throw new Error(`sample bundle: bundle.json is missing "${key}"`);
    }
  }
  const filesDir = path17.join(bundleDir, "files");
  const files = {};
  for (const rel of io.listFilesRecursive(filesDir)) {
    const content = io.readFile(path17.join(filesDir, rel)).replace(/\r\n/g, "\n");
    files[renderedRelPath(rel)] = content;
  }
  if (Object.keys(files).length === 0) {
    throw new Error(`sample bundle: no files found under ${filesDir}`);
  }
  return { meta, files };
}
var SAMPLE_STEPS = ["render", "git", "marker", "install"];
var SAMPLE_STEP_PHRASE = {
  render: "creating the sample files",
  git: "setting up version history for the folder",
  marker: "recording that this project is local only",
  install: "creating the .venv folder and installing dabbler-ai-router"
};
var SAMPLE_MARKER_REL = ".dabbler/sample-in-progress.json";
var LOCAL_ONLY_REL = ".dabbler/local-only";
var SEEDED_ROUTER_DIR = "ai_router";
function renderLocalOnlyMarker(nowIso) {
  return `# .dabbler/local-only -- this repository is deliberately remote-less.
# The close-out push gate (ai_router.gate_checks.check_pushed_to_remote)
# passes-with-note instead of failing on the missing upstream, but ONLY
# while no git remote is configured. See ai_router/docs/close-out.md.
enabled_at: ${nowIso}
enabled_by: Dabbler: Try a sample project
reason: The Dabbler sample project is local only by design -- no git host account, no remote repository.
`;
}
function sampleOwnedTopLevelEntries(bundle) {
  const owned = /* @__PURE__ */ new Set([".dabbler", ".git"]);
  for (const rel of Object.keys(bundle.files)) {
    const top = rel.split("/")[0];
    if (top)
      owned.add(top);
  }
  return [...owned].sort();
}
function classifyTargetFolder(targetDir, bundleVersion, io) {
  const markerAbs = path17.join(targetDir, SAMPLE_MARKER_REL);
  if (io.exists(markerAbs)) {
    let marker = null;
    try {
      marker = JSON.parse(io.readFile(markerAbs));
    } catch {
      marker = null;
    }
    if (marker && marker.bundleVersion === bundleVersion && Array.isArray(marker.completedSteps)) {
      const next = SAMPLE_STEPS.find(
        (s) => !marker.completedSteps.includes(s)
      );
      return {
        kind: "resumable",
        marker,
        nextStep: next ?? SAMPLE_STEPS[SAMPLE_STEPS.length - 1]
      };
    }
    return { kind: "non-empty" };
  }
  const entries = io.exists(targetDir) ? io.listDir(targetDir) : [];
  return entries.length === 0 ? { kind: "empty" } : { kind: "non-empty" };
}
var IDENTITY_NAME = "Dabbler Sample";
var IDENTITY_EMAIL = "sample@dabbler.local";
var BASELINE_COMMIT = "The Dabbler sample project";
var MARKER_COMMIT = "Record that this project is local only";
async function createSampleProject(deps) {
  const report = deps.reportProgress ?? (() => {
  });
  const nowIso = deps.nowIso ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  const done = new Set(deps.resumeFrom ?? []);
  const written = [];
  let venvPath = null;
  const startedAt = nowIso();
  const writeMarker = () => {
    const marker = {
      bundleVersion: deps.bundle.meta.bundleVersion,
      completedSteps: SAMPLE_STEPS.filter((s) => done.has(s)),
      startedAt
    };
    deps.fileOps.writeFile(
      path17.join(deps.targetDir, SAMPLE_MARKER_REL),
      `${JSON.stringify(marker, null, 2)}
`
    );
  };
  const fail = (step, reason) => {
    try {
      writeMarker();
    } catch {
    }
    return {
      ok: false,
      written,
      failedStep: step,
      failureReason: reason,
      completedSteps: SAMPLE_STEPS.filter((s) => done.has(s)),
      venvPath
    };
  };
  if (!done.has("render")) {
    report(SAMPLE_PROGRESS.render);
    try {
      for (const [rel, content] of Object.entries(deps.bundle.files)) {
        deps.fileOps.writeFile(path17.join(deps.targetDir, rel), content);
        written.push(rel);
      }
    } catch (err) {
      return fail("render", describeError(err));
    }
    done.add("render");
    writeMarker();
  }
  if (!done.has("git")) {
    report(SAMPLE_PROGRESS.git);
    if (!await deps.git.isAvailable()) {
      return fail("git", "git was not found on PATH");
    }
    try {
      await deps.git.init(deps.targetDir);
      await deps.git.setLocalIdentity(
        deps.targetDir,
        IDENTITY_NAME,
        IDENTITY_EMAIL
      );
      await deps.git.commitAll(deps.targetDir, BASELINE_COMMIT);
    } catch (err) {
      return fail("git", describeError(err));
    }
    done.add("git");
    writeMarker();
  }
  if (!done.has("marker")) {
    report(SAMPLE_PROGRESS.marker);
    try {
      deps.fileOps.writeFile(
        path17.join(deps.targetDir, LOCAL_ONLY_REL),
        renderLocalOnlyMarker(nowIso())
      );
      await deps.git.commitAll(deps.targetDir, MARKER_COMMIT);
    } catch (err) {
      return fail("marker", describeError(err));
    }
    done.add("marker");
    writeMarker();
  }
  if (!done.has("install")) {
    report(SAMPLE_PROGRESS.install);
    const outcome = await deps.installRouter();
    venvPath = outcome.venvPath;
    if (!outcome.ok) {
      return fail("install", outcome.message);
    }
    if (!Object.keys(deps.bundle.files).some((rel) => rel.startsWith(`${SEEDED_ROUTER_DIR}/`))) {
      try {
        deps.fileOps.removeRecursive(path17.join(deps.targetDir, SEEDED_ROUTER_DIR));
      } catch {
      }
    }
    done.add("install");
  }
  try {
    deps.fileOps.removeRecursive(path17.join(deps.targetDir, SAMPLE_MARKER_REL));
  } catch {
  }
  return {
    ok: true,
    written,
    failedStep: null,
    failureReason: null,
    completedSteps: [...SAMPLE_STEPS],
    venvPath
  };
}
function describeError(err) {
  const raw = err instanceof Error ? err.message : String(err);
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !isStackFrame(l));
  return lines.slice(-2).join(" / ") || "no further detail available";
}
function isStackFrame(line) {
  if (line === "Traceback (most recent call last):")
    return true;
  if (/^at\s/.test(line))
    return true;
  if (/^File ".*", line \d+/.test(line))
    return true;
  if (/^\^+$/.test(line))
    return true;
  return false;
}
var SAMPLE_PICKER_LABEL = "Create Sample Project";
var SAMPLE_PICKER_TITLE = "Select an Empty Folder for the Sample Project";
var SAMPLE_PROGRESS = {
  render: "Creating sample files...",
  git: "Setting up version history...",
  marker: "Recording that this project is local only...",
  install: "Installing Python packages...",
  open: "Opening project folder..."
};
var REFUSE_NON_EMPTY_RETRY = "Choose Again";
var REFUSE_NON_EMPTY_CANCEL = "Cancel";
function describeNonEmptyFolder(folder) {
  return `The folder '${folder}' must be empty. This prevents overwriting your files. Please choose a different folder.`;
}
var RESUME_ACTION = "Resume";
var RESUME_START_OVER_ACTION = "Start Over";
var RESUME_CANCEL_ACTION = "Cancel";
function describeResumableSample(folder, nextStep) {
  return `The sample project in '${folder}' is incomplete. The last attempt stopped while ${SAMPLE_STEP_PHRASE[nextStep]}. Do you want to resume or start over?`;
}
var GIT_MISSING_MESSAGE = "Git was not found on your system. The sample project needs Git to keep a history of your changes. Install it from https://git-scm.com/downloads and then run 'Dabbler: Try a sample project' again.";
var INSTALL_FAILED_SHOW_LOG_ACTION = "Show Log";
var INSTALL_FAILED_RETRY_ACTION = "Retry Install";
var MANUAL_COMMANDS_HEADING = "To finish installing by hand, run these commands in a terminal:";
var PROXY_HINT = "If you are on a corporate network or VPN, you may need to set the HTTPS_PROXY environment variable, or add a --proxy option to the pip command above.";
function describeInstallFailure(folder, reason) {
  return `The sample project in '${folder}' was created successfully and nothing was lost. Only the Python package install did not finish: ${reason}. Run 'Dabbler: Try a sample project' on the same folder to pick up where it stopped.`;
}
function renderManualInstallCommands(targetDir, bootstrapPython, venvPythonPath) {
  return [
    `cd "${targetDir}"`,
    `"${bootstrapPython}" -m venv .venv`,
    `"${venvPythonPath}" -m pip install dabbler-ai-router`
  ];
}
function renderInstallFailureLog(folder, reason, commands29) {
  return [
    describeInstallFailure(folder, reason),
    "",
    MANUAL_COMMANDS_HEADING,
    ...commands29.map((c3) => `  ${c3}`),
    "",
    PROXY_HINT
  ].join("\n");
}
var SUCCESS_NEXT_STEP_ACTION = "Copy Starter Prompt";
function describeSuccess() {
  return "Your sample project is ready. To start the first AI task, copy the starter prompt and paste it into your AI chat.";
}
var STARTER_LINE_COPIED = "Copied to clipboard. Paste it into your AI chat to begin.";
function buildSampleStarterLine(slug) {
  return `Start the next session of \`${slug}\`.`;
}

// src/commands/trySampleProject.ts
var PENDING_SAMPLE_LANDING_KEY = "dabbler.pendingSampleLanding";
async function pickTargetFolder(bundle, io) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const folder = await io.showOpenDialog();
    if (!folder)
      return null;
    const verdict = classifyTargetFolder(folder, bundle.meta.bundleVersion, io);
    if (verdict.kind === "empty")
      return { folder, resumeFrom: [] };
    if (verdict.kind === "resumable") {
      const answer2 = await io.showWarning(
        describeResumableSample(folder, verdict.nextStep),
        RESUME_ACTION,
        RESUME_START_OVER_ACTION,
        RESUME_CANCEL_ACTION
      );
      if (answer2 === RESUME_ACTION) {
        return { folder, resumeFrom: verdict.marker.completedSteps };
      }
      if (answer2 === RESUME_START_OVER_ACTION) {
        for (const rel of sampleOwnedTopLevelEntries(bundle)) {
          io.removeRecursive(path18.join(folder, rel));
        }
        return { folder, resumeFrom: [] };
      }
      return null;
    }
    const answer = await io.showWarning(
      describeNonEmptyFolder(folder),
      REFUSE_NON_EMPTY_RETRY,
      REFUSE_NON_EMPTY_CANCEL
    );
    if (answer !== REFUSE_NON_EMPTY_RETRY)
      return null;
  }
  return null;
}
function listFilesRecursiveSync(absDir) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of fs13.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory())
        walk(path18.join(dir, entry.name), rel);
      else if (entry.isFile())
        out.push(rel);
    }
  };
  walk(absDir, "");
  return out.sort();
}
function makeSampleGitOps() {
  return {
    isAvailable: async () => {
      try {
        await esm_default().raw(["--version"]);
        return true;
      } catch {
        return false;
      }
    },
    init: async (dir) => {
      if (!fs13.existsSync(path18.join(dir, ".git"))) {
        await esm_default(dir).init();
      }
    },
    setLocalIdentity: async (dir, name, email) => {
      const git3 = esm_default(dir);
      await git3.addConfig("user.name", name, false, "local");
      await git3.addConfig("user.email", email, false, "local");
    },
    commitAll: async (dir, message) => {
      const git3 = esm_default(dir);
      await git3.add(["-A"]);
      const status = await git3.status();
      if (status.staged.length === 0)
        return;
      await git3.commit(message);
    }
  };
}
async function showPendingSampleLanding(context, io) {
  const pending = context.globalState.get(
    PENDING_SAMPLE_LANDING_KEY
  );
  if (!pending)
    return false;
  const matches = io.openFolders.some(
    (f) => path18.resolve(f) === path18.resolve(pending.folder)
  );
  if (!matches)
    return false;
  await context.globalState.update(PENDING_SAMPLE_LANDING_KEY, void 0);
  const answer = await io.showInfo(describeSuccess(), SUCCESS_NEXT_STEP_ACTION);
  if (answer === SUCCESS_NEXT_STEP_ACTION) {
    await io.copyToClipboard(buildSampleStarterLine(pending.slug));
    io.setStatus(STARTER_LINE_COPIED);
  }
  return true;
}
function registerTrySampleProjectCommand(context) {
  context.subscriptions.push(
    vscode13.commands.registerCommand("dabbler.trySampleProject", async () => {
      await runTrySampleProject(context);
    })
  );
  void showPendingSampleLanding(context, {
    openFolders: (vscode13.workspace.workspaceFolders ?? []).map(
      (f) => f.uri.fsPath
    ),
    showInfo: (msg, ...actions) => Promise.resolve(vscode13.window.showInformationMessage(msg, ...actions)),
    copyToClipboard: (text) => Promise.resolve(vscode13.env.clipboard.writeText(text)),
    setStatus: (msg) => vscode13.window.setStatusBarMessage(msg, 5e3)
  });
}
var sampleChannel;
function sampleOutputChannel() {
  if (!sampleChannel) {
    sampleChannel = vscode13.window.createOutputChannel("Dabbler: Sample Project");
  }
  return sampleChannel;
}
async function runTrySampleProject(context) {
  let bundle;
  try {
    bundle = loadSampleBundle(resolveBundledSampleDir(context.extensionPath), {
      readFile: (p2) => fs13.readFileSync(p2, "utf8"),
      listFilesRecursive: listFilesRecursiveSync
    });
  } catch (err) {
    vscode13.window.showErrorMessage(
      `The sample project could not be loaded from the installed extension: ${describeError(err)}`
    );
    return;
  }
  const picked = await pickTargetFolder(bundle, {
    showOpenDialog: async () => {
      const chosen = await vscode13.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: SAMPLE_PICKER_LABEL,
        title: SAMPLE_PICKER_TITLE
      });
      return chosen?.[0]?.fsPath;
    },
    showWarning: (msg, ...actions) => Promise.resolve(vscode13.window.showWarningMessage(msg, ...actions)),
    exists: (p2) => fs13.existsSync(p2),
    readFile: (p2) => fs13.readFileSync(p2, "utf8"),
    listDir: (p2) => fs13.readdirSync(p2),
    removeRecursive: (p2) => {
      if (fs13.existsSync(p2))
        fs13.rmSync(p2, { recursive: true, force: true });
    }
  });
  if (!picked)
    return;
  const { folder, resumeFrom } = picked;
  if (!probePythonPresence(folder)) {
    vscode13.window.showErrorMessage(
      describeMissingPython("Try a sample project")
    );
    return;
  }
  const bootstrapPython = resolveScaffoldBootstrapPython(folder) ?? resolveExplicitPythonPath(folder);
  const result = await vscode13.window.withProgress(
    {
      location: vscode13.ProgressLocation.Notification,
      title: "Creating your sample project...",
      cancellable: false
    },
    async (progress) => createSampleProject({
      targetDir: folder,
      bundle,
      fileOps: makeFileOps(),
      git: makeSampleGitOps(),
      resumeFrom,
      reportProgress: (m) => progress.report({ message: m }),
      installRouter: async () => {
        const outcome = await installAiRouter({
          workspaceRoot: folder,
          pythonPath: bootstrapPython,
          spawner: makeSpawner(),
          fileOps: makeFileOps(),
          prompts: {
            // No prompts: choosing "Try a sample project" IS the consent.
            pickSource: async () => "pypi",
            confirmCreateVenv: async () => true,
            promptGitHubRef: async () => ""
          },
          reportProgress: (m) => progress.report({ message: m })
        });
        return {
          ok: outcome.ok,
          message: outcome.message,
          venvPath: outcome.venvPath
        };
      }
    })
  );
  if (!result.ok) {
    await reportSampleFailure(folder, bootstrapPython, result);
    return;
  }
  await context.globalState.update(PENDING_SAMPLE_LANDING_KEY, {
    folder,
    slug: bundle.meta.sampleSetSlug
  });
  const alreadyOpen = (vscode13.workspace.workspaceFolders ?? []).some(
    (f) => path18.resolve(f.uri.fsPath) === path18.resolve(folder)
  );
  if (alreadyOpen) {
    await showPendingSampleLanding(context, {
      openFolders: [folder],
      showInfo: (msg, ...actions) => Promise.resolve(vscode13.window.showInformationMessage(msg, ...actions)),
      copyToClipboard: (text) => Promise.resolve(vscode13.env.clipboard.writeText(text)),
      setStatus: (msg) => vscode13.window.setStatusBarMessage(msg, 5e3)
    });
    return;
  }
  await vscode13.commands.executeCommand(
    "vscode.openFolder",
    vscode13.Uri.file(folder)
  );
}
async function reportSampleFailure(folder, bootstrapPython, result) {
  const reason = result.failureReason ?? "no further detail available";
  if (result.failedStep === "git") {
    vscode13.window.showErrorMessage(GIT_MISSING_MESSAGE);
    return;
  }
  if (result.failedStep !== "install") {
    vscode13.window.showErrorMessage(
      `The sample project could not be created in '${folder}': ${reason}`
    );
    return;
  }
  const channel = sampleOutputChannel();
  channel.appendLine(
    renderInstallFailureLog(
      folder,
      reason,
      renderManualInstallCommands(
        folder,
        bootstrapPython,
        venvPython(path18.join(folder, ".venv"))
      )
    )
  );
  const answer = await vscode13.window.showWarningMessage(
    describeInstallFailure(folder, reason),
    INSTALL_FAILED_SHOW_LOG_ACTION,
    INSTALL_FAILED_RETRY_ACTION
  );
  if (answer === INSTALL_FAILED_SHOW_LOG_ACTION) {
    channel.show(true);
  } else if (answer === INSTALL_FAILED_RETRY_ACTION) {
    await vscode13.commands.executeCommand("dabbler.trySampleProject");
  }
}

// src/commands/gitWorkflow.ts
var vscode16 = __toESM(require("vscode"));
var cp5 = __toESM(require("child_process"));
var fs15 = __toESM(require("fs"));
var path20 = __toESM(require("path"));

// src/utils/gitHost.ts
var vscode14 = __toESM(require("vscode"));
var GIT_SUFFIX = /\.git$/i;
function stripGitSuffix(s) {
  return s.replace(GIT_SUFFIX, "");
}
function decodeSegment(s) {
  if (!s.includes("%"))
    return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
function splitRemote(url) {
  const trimmed2 = url.trim();
  if (trimmed2 === "")
    return null;
  let host = "";
  let pathPart = "";
  const schemeMatch = /^(?:https?|ssh|git):\/\/(?:([^/@]+)@)?([^/:]+)(?::\d+)?\/(.*)$/i.exec(
    trimmed2
  );
  if (schemeMatch) {
    host = schemeMatch[2];
    pathPart = schemeMatch[3];
  } else {
    const scpMatch = /^(?:([^/@]+)@)?([^/:@]+):(.*)$/.exec(trimmed2);
    if (!scpMatch)
      return null;
    const [, user, scpHost, scpPath] = scpMatch;
    if (!user && !scpHost.includes("."))
      return null;
    host = scpHost;
    pathPart = scpPath.replace(/^\/+/, "");
  }
  const segments = pathPart.split("/").map((s) => decodeSegment(s.trim())).filter((s) => s !== "");
  return { host: host.toLowerCase(), segments };
}
function gitSegmentIndex(segments) {
  return segments.findIndex((s) => s.toLowerCase() === "_git");
}
function classifyRemoteUrl(url) {
  const unknown = { kind: "unknown", host: "", owner: "", repo: "" };
  const split = splitRemote(url);
  if (!split)
    return unknown;
  const { host, segments } = split;
  if (host === "dev.azure.com") {
    const gitIdx = gitSegmentIndex(segments);
    if (gitIdx >= 2 && segments.length > gitIdx + 1) {
      return {
        kind: "azure-devops",
        host,
        owner: segments[0],
        project: segments[gitIdx - 1],
        repo: stripGitSuffix(segments[gitIdx + 1])
      };
    }
    return { ...unknown, host };
  }
  if (host === "ssh.dev.azure.com") {
    if (segments.length >= 4 && segments[0].toLowerCase() === "v3") {
      return {
        kind: "azure-devops",
        host,
        owner: segments[1],
        project: segments[2],
        repo: stripGitSuffix(segments[3])
      };
    }
    return { ...unknown, host };
  }
  const vsMatch = /^([^.]+)\.visualstudio\.com$/.exec(host);
  if (vsMatch) {
    const gitIdx = gitSegmentIndex(segments);
    if (gitIdx >= 1 && segments.length > gitIdx + 1) {
      return {
        kind: "azure-devops",
        host,
        owner: vsMatch[1],
        project: segments[gitIdx - 1],
        repo: stripGitSuffix(segments[gitIdx + 1])
      };
    }
    return { ...unknown, host };
  }
  if (host === "github.com") {
    if (segments.length >= 2) {
      return {
        kind: "github",
        host,
        owner: segments[0],
        repo: stripGitSuffix(segments[1])
      };
    }
    return { ...unknown, host };
  }
  return { ...unknown, host };
}
function resolveGitHostFromUrl(url, setting) {
  const auto = classifyRemoteUrl(url);
  if (setting === "auto")
    return auto;
  if (setting === auto.kind)
    return auto;
  if (setting === "github") {
    const split = splitRemote(url);
    if (split && split.segments.length >= 2) {
      const segs = split.segments;
      return {
        kind: "github",
        host: split.host,
        owner: segs[segs.length - 2],
        repo: stripGitSuffix(segs[segs.length - 1])
      };
    }
    return { kind: "unknown", host: auto.host, owner: "", repo: "" };
  }
  return auto.kind === "azure-devops" ? auto : { kind: "unknown", host: auto.host, owner: "", repo: "" };
}
function gitHostSetting() {
  const v = vscode14.workspace.getConfiguration("dabblerSessionSets").get("gitHost");
  return v === "github" || v === "azure-devops" ? v : "auto";
}
function createPrWebUrl(info, branch, targetBranch) {
  const enc = encodeURIComponent;
  if (info.kind === "github") {
    return `https://${info.host}/${info.owner}/${info.repo}/compare/${enc(
      targetBranch
    )}...${enc(branch)}?expand=1`;
  }
  if (info.kind === "azure-devops") {
    const base = info.host === "dev.azure.com" || info.host === "ssh.dev.azure.com" ? `https://dev.azure.com/${info.owner}/${enc(info.project ?? "")}` : `https://${info.host}/${enc(info.project ?? "")}`;
    return `${base}/_git/${enc(info.repo)}/pullrequestcreate?sourceRef=${enc(
      `refs/heads/${branch}`
    )}&targetRef=${enc(`refs/heads/${targetBranch}`)}`;
  }
  return null;
}
function adoOrganizationUrl(info) {
  if (info.kind !== "azure-devops")
    return null;
  if (info.host === "dev.azure.com" || info.host === "ssh.dev.azure.com") {
    return `https://dev.azure.com/${info.owner}`;
  }
  return `https://${info.host}`;
}
function adoPrWebUrl(info, prId) {
  const org = adoOrganizationUrl(info);
  if (!org || !info.project)
    return null;
  const enc = encodeURIComponent;
  return `${org}/${enc(info.project)}/_git/${enc(info.repo)}/pullrequest/${prId}`;
}

// src/utils/hostCli.ts
var fs14 = __toESM(require("fs"));
var path19 = __toESM(require("path"));
var vscode15 = __toESM(require("vscode"));
var realExists2 = (p2) => {
  try {
    return fs14.statSync(p2).isFile();
  } catch {
    return false;
  }
};
function hostCliCommand(kind) {
  if (kind === "github")
    return { command: "gh", settingKey: "ghCliPath" };
  if (kind === "azure-devops")
    return { command: "az", settingKey: "azCliPath" };
  return null;
}
function findHostCliOnPath(cmd, env8 = process.env, fileExists = realExists2, platform = process.platform) {
  const rawPath = env8.PATH ?? env8.Path ?? "";
  if (!rawPath)
    return null;
  const isWin = platform === "win32";
  const p2 = isWin ? path19.win32 : path19.posix;
  const dirs = rawPath.split(isWin ? ";" : ":").filter((d) => d.trim() !== "");
  const names = isWin ? [`${cmd}.exe`, `${cmd}.cmd`, `${cmd}.bat`] : [cmd];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = p2.join(dir.trim(), name);
      if (fileExists(candidate))
        return candidate;
    }
  }
  return null;
}
function probeHostCliCore(command, explicitSetting, workspaceRoot2, env8 = process.env, fileExists = realExists2, platform = process.platform) {
  const p2 = platform === "win32" ? path19.win32 : path19.posix;
  if (explicitSetting) {
    if (p2.isAbsolute(explicitSetting)) {
      return fileExists(explicitSetting) ? { present: true, resolved: explicitSetting } : { present: false, resolved: null };
    }
    if (explicitSetting.includes("\\") || explicitSetting.includes("/")) {
      const abs = p2.resolve(workspaceRoot2, explicitSetting);
      return fileExists(abs) ? { present: true, resolved: abs } : { present: false, resolved: null };
    }
    const found2 = findHostCliOnPath(explicitSetting, env8, fileExists, platform);
    return found2 ? { present: true, resolved: found2 } : { present: false, resolved: null };
  }
  const found = findHostCliOnPath(command, env8, fileExists, platform);
  return found ? { present: true, resolved: found } : { present: false, resolved: null };
}
function explicitCliPathSetting(key) {
  const inspected = vscode15.workspace.getConfiguration("dabblerSessionSets").inspect(key);
  if (!inspected)
    return void 0;
  const value = inspected.workspaceFolderValue ?? inspected.workspaceValue ?? inspected.globalValue;
  const trimmed2 = (value ?? "").trim();
  return trimmed2 === "" ? void 0 : trimmed2;
}
function probeHostCli(kind, workspaceRoot2, fileExists = realExists2) {
  const cli = hostCliCommand(kind);
  if (!cli)
    return { present: false, resolved: null };
  return probeHostCliCore(
    cli.command,
    explicitCliPathSetting(cli.settingKey),
    workspaceRoot2,
    process.env,
    fileExists,
    process.platform
  );
}
function describeMissingHostCli(kind) {
  if (kind === "github") {
    return "The GitHub CLI (gh) was not found. To enable one-click PRs: install it (winget install GitHub.cli), then sign in with `gh auth login` (for GitHub Enterprise: `gh auth login --hostname <your-ghe-host>`). If gh is installed somewhere unusual, point the dabblerSessionSets.ghCliPath setting at it. Until then you can push and open the PR from the browser page this command offers.";
  }
  if (kind === "azure-devops") {
    return "The Azure CLI (az) was not found. To enable one-click PRs: install it (winget install Microsoft.AzureCLI), add the DevOps extension (az extension add --name azure-devops), then sign in with `az login` (or set the AZURE_DEVOPS_EXT_PAT environment variable to a Personal Access Token with Code Read & Write). If az is installed somewhere unusual, point the dabblerSessionSets.azCliPath setting at it. Until then you can push and open the PR from the browser page this command offers.";
  }
  return `This repo's origin remote was not recognized as GitHub or Azure DevOps. If it is a GitHub Enterprise (or other) host, set the dabblerSessionSets.gitHost setting to "github" or "azure-devops" so the git-workflow commands know which CLI to use.`;
}
function describeHostCliAuthHint(kind) {
  if (kind === "github") {
    return "If this is an authentication problem, run `gh auth login` (add --hostname <host> for GitHub Enterprise) and retry.";
  }
  if (kind === "azure-devops") {
    return "If this is an authentication problem, run `az login` (or set AZURE_DEVOPS_EXT_PAT) and `az extension add --name azure-devops`, then retry.";
  }
  return "";
}

// src/commands/gitWorkflow.ts
function defaultRunner() {
  return (file, args, opts) => new Promise((resolve7) => {
    cp5.execFile(
      file,
      args,
      {
        cwd: opts.cwd,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        timeout: 12e4,
        windowsVerbatimArguments: opts.windowsVerbatimArguments ?? false
      },
      (err, stdout, stderr) => {
        const code = err && typeof err.code === "number" ? err.code : err ? 1 : 0;
        resolve7({ code, stdout: String(stdout), stderr: String(stderr) });
      }
    );
  });
}
function defaultUi() {
  return {
    confirm: async (message, detail, button) => {
      const picked = await vscode16.window.showWarningMessage(
        message,
        { modal: true, detail },
        button
      );
      return picked === button;
    },
    showInputBox: vscode16.window.showInputBox,
    showQuickPickLabels: (labels, placeHolder) => Promise.resolve(
      vscode16.window.showQuickPick(labels, { placeHolder, ignoreFocusOut: true }).then((p2) => p2?.label)
    ),
    showInfo: (m) => void vscode16.window.showInformationMessage(m),
    showWarning: (m) => void vscode16.window.showWarningMessage(m),
    showError: (m) => void vscode16.window.showErrorMessage(m),
    openExternal: async (url) => {
      await vscode16.env.openExternal(vscode16.Uri.parse(url));
    },
    workspaceRoot: () => vscode16.workspace.workspaceFolders?.[0]?.uri.fsPath
  };
}
var SESSION_BRANCH_PREFIX = "session-set/";
var CMD_UNSAFE = /[\r\n"^&|<>%!]/;
function cmdArgProblem(arg) {
  const m = CMD_UNSAFE.exec(arg);
  if (!m)
    return null;
  return `contains ${JSON.stringify(m[0])}, which cannot be passed safely through the Azure CLI's .cmd entrypoint on Windows \u2014 remove characters ${'" ^ & | < > % !'} and line breaks, or install a native az executable`;
}
function displayCommand(file, args) {
  const show = (s) => /[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
  return [show(path20.basename(file)), ...args.map(show)].join(" ");
}
function toRunnableInvocation(file, args, platform = process.platform) {
  const display = displayCommand(file, args);
  const isCmdShim = platform === "win32" && /\.(cmd|bat)$/i.test(file);
  if (!isCmdShim) {
    return { file, args, display };
  }
  for (const a of args) {
    const problem = cmdArgProblem(a);
    if (problem) {
      throw new Error(`Argument ${JSON.stringify(a)} ${problem}.`);
    }
  }
  const line = [file, ...args].map((a) => `"${a}"`).join(" ");
  return {
    file: "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    windowsVerbatimArguments: true,
    display
  };
}
function buildGhPrCreateArgs(branch, targetBranch, title, body) {
  return [
    "pr",
    "create",
    "--head",
    branch,
    "--base",
    targetBranch,
    "--title",
    title,
    "--body",
    body
  ];
}
function buildAzPrCreateArgs(info, branch, targetBranch, title, bodyLines) {
  const org = adoOrganizationUrl(info);
  if (!org || !info.project)
    return null;
  return [
    "repos",
    "pr",
    "create",
    "--organization",
    org,
    "--project",
    info.project,
    "--repository",
    info.repo,
    "--source-branch",
    branch,
    "--target-branch",
    targetBranch,
    "--title",
    title,
    "--description",
    ...bodyLines.length ? bodyLines : [""],
    "--output",
    "json"
  ];
}
function parseGhPrUrl(stdout) {
  const matches = stdout.match(/https:\/\/\S+/g);
  return matches && matches.length ? matches[matches.length - 1].trim() : null;
}
function parseAzPrUrl(stdout, info) {
  try {
    const parsed = JSON.parse(stdout);
    const id = parsed.pullRequestId;
    if (typeof id === "number" && Number.isFinite(id)) {
      return adoPrWebUrl(info, id);
    }
  } catch {
  }
  return null;
}
function buildPrTemplate(branch) {
  const slug = branch.startsWith(SESSION_BRANCH_PREFIX) ? branch.slice(SESSION_BRANCH_PREFIX.length) : null;
  const title = slug ? `Session set ${slug}` : branch;
  const bodyLines = [
    slug ? `Session-set branch for docs/session-sets/${slug}/ (spec, state, and per-session artifacts live there).` : `Branch ${branch}.`,
    "Opened by the Dabbler AI Orchestration git-workflow command (operator-confirmed)."
  ];
  return { title, bodyLines };
}
async function git(run3, cwd, ...args) {
  return run3("git", args, { cwd });
}
async function gitLine(run3, cwd, ...args) {
  const r2 = await git(run3, cwd, ...args);
  if (r2.code !== 0)
    return null;
  const line = r2.stdout.split(/\r?\n/).find((l) => l.trim() !== "");
  return line ? line.trim() : null;
}
async function detectTrunkBranch(run3, cwd) {
  const head = await gitLine(
    run3,
    cwd,
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD"
  );
  if (head && head.startsWith("origin/"))
    return head.slice("origin/".length);
  for (const candidate of ["main", "master"]) {
    const r2 = await git(run3, cwd, "show-ref", "--verify", "--quiet", `refs/heads/${candidate}`);
    if (r2.code === 0)
      return candidate;
  }
  return "main";
}
async function isDirty(run3, cwd) {
  const r2 = await git(run3, cwd, "status", "--porcelain");
  return r2.code === 0 ? r2.stdout.trim() !== "" : true;
}
async function primaryRoot(run3, cwd) {
  const common = await gitLine(
    run3,
    cwd,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir"
  );
  if (!common)
    return null;
  return path20.dirname(common);
}
async function listLinkedWorktrees(run3, cwd) {
  const r2 = await git(run3, cwd, "worktree", "list", "--porcelain");
  if (r2.code !== 0)
    return [];
  const entries = [];
  let current = null;
  for (const line of r2.stdout.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current)
        entries.push(current);
      current = { path: line.slice("worktree ".length).trim(), branch: null };
    } else if (line.startsWith("branch ") && current) {
      current.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    }
  }
  if (current)
    entries.push(current);
  return entries.slice(1);
}
async function runOpenPrFlow(deps) {
  const { ui, run: run3 } = deps;
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showError("No workspace folder is open.");
    return;
  }
  const remoteUrl = await gitLine(run3, root, "config", "--get", "remote.origin.url") ?? await gitLine(run3, root, "remote", "get-url", "origin");
  if (!remoteUrl) {
    ui.showError(
      "This workspace has no `origin` remote \u2014 add one (git remote add origin <url>) before opening a PR."
    );
    return;
  }
  const setting = (deps.hostSetting ?? gitHostSetting)();
  const info = resolveGitHostFromUrl(remoteUrl, setting);
  if (info.kind === "unknown") {
    ui.showError(describeMissingHostCli("unknown"));
    return;
  }
  const branch = await gitLine(run3, root, "rev-parse", "--abbrev-ref", "HEAD");
  if (!branch || branch === "HEAD") {
    ui.showError("Could not resolve the current branch (detached HEAD?).");
    return;
  }
  const trunk = await detectTrunkBranch(run3, root);
  if (branch === trunk) {
    ui.showError(
      `You are on the trunk (${trunk}) \u2014 open PRs from a session branch (${SESSION_BRANCH_PREFIX}<slug>).`
    );
    return;
  }
  if (await isDirty(run3, root)) {
    const proceed = await ui.confirm(
      "Uncommitted changes",
      "The working tree has uncommitted changes; they will NOT be part of the pushed branch or the PR. Continue anyway?",
      "Continue"
    );
    if (!proceed)
      return;
  }
  const template = buildPrTemplate(branch);
  const title = await ui.showInputBox({
    title: "PR title",
    value: template.title,
    prompt: "Title for the pull request.",
    ignoreFocusOut: true
  });
  if (title === void 0 || title.trim() === "")
    return;
  const probe = (deps.probeCli ?? probeHostCli)(info.kind, root, deps.fileExists);
  const pushDisplay = `git push -u origin ${branch}`;
  let cliInvocation = null;
  let cliProblem = null;
  if (probe.present && probe.resolved) {
    const args = info.kind === "github" ? buildGhPrCreateArgs(branch, trunk, title.trim(), template.bodyLines.join("\n")) : buildAzPrCreateArgs(info, branch, trunk, title.trim(), template.bodyLines);
    if (!args) {
      cliProblem = describeMissingHostCli("unknown");
    } else {
      try {
        cliInvocation = toRunnableInvocation(probe.resolved, args);
      } catch (err) {
        cliProblem = err instanceof Error ? err.message : String(err);
      }
    }
  }
  if (cliProblem) {
    ui.showError(`Cannot build the PR command: ${cliProblem}`);
    return;
  }
  const webUrl = createPrWebUrl(info, branch, trunk);
  const planLines = cliInvocation ? [pushDisplay, cliInvocation.display] : [pushDisplay, `(no ${info.kind === "github" ? "gh" : "az"} CLI found \u2014 the browser create-PR page will open instead)`];
  const confirmed = await ui.confirm(
    "Push this branch and open a PR?",
    `This will run:

${planLines.map((l) => `  ${l}`).join("\n")}

Target: ${info.kind} (${info.host}), base branch ${trunk}.`,
    "Push + create PR"
  );
  if (!confirmed)
    return;
  const push = await git(run3, root, "push", "-u", "origin", branch);
  if (push.code !== 0) {
    ui.showError(
      `git push failed:
${(push.stderr || push.stdout).trim()}`
    );
    return;
  }
  if (!cliInvocation) {
    if (webUrl)
      await ui.openExternal(webUrl);
    ui.showWarning(
      `Branch pushed. ${describeMissingHostCli(info.kind)}`
    );
    return;
  }
  const created = await run3(cliInvocation.file, cliInvocation.args, {
    cwd: root,
    windowsVerbatimArguments: cliInvocation.windowsVerbatimArguments
  });
  if (created.code !== 0) {
    const errText = (created.stderr || created.stdout).trim();
    ui.showError(
      `The PR command failed:
${errText}

${describeHostCliAuthHint(info.kind)}
You can finish in the browser: ${webUrl ?? "(no URL derivable)"}`
    );
    if (webUrl)
      await ui.openExternal(webUrl);
    return;
  }
  const prUrl = info.kind === "github" ? parseGhPrUrl(created.stdout) : parseAzPrUrl(created.stdout, info);
  if (prUrl) {
    ui.showInfo(`PR created: ${prUrl}`);
    await ui.openExternal(prUrl);
  } else {
    ui.showInfo(
      "PR created (the CLI returned no parseable URL \u2014 check the host's web UI)."
    );
  }
}
async function runFinalizeMergedSetFlow(deps) {
  const { ui, run: run3 } = deps;
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showError("No workspace folder is open.");
    return;
  }
  const primary = await primaryRoot(run3, root);
  if (!primary) {
    ui.showError("This workspace is not inside a git repository.");
    return;
  }
  const toplevel = await gitLine(run3, root, "rev-parse", "--show-toplevel");
  if (!toplevel || path20.resolve(toplevel) !== path20.resolve(primary)) {
    ui.showError(
      `Finalize runs from the main checkout (${primary}), not from inside a worktree \u2014 open the main checkout and re-run, so the worktree you are in can be removed.`
    );
    return;
  }
  const worktrees = await listLinkedWorktrees(run3, primary);
  const sessionWorktrees = worktrees.filter(
    (w) => w.branch?.startsWith(SESSION_BRANCH_PREFIX)
  );
  let chosenBranch = null;
  let chosenWorktree = null;
  if (sessionWorktrees.length === 1) {
    chosenWorktree = sessionWorktrees[0];
    chosenBranch = sessionWorktrees[0].branch;
  } else if (sessionWorktrees.length > 1) {
    const picked = await ui.showQuickPickLabels(
      sessionWorktrees.map((w) => ({
        label: w.branch,
        description: w.path
      })),
      "Which merged set should be finalized?"
    );
    if (!picked)
      return;
    chosenWorktree = sessionWorktrees.find((w) => w.branch === picked) ?? null;
    chosenBranch = picked;
  } else {
    const branches = await git(
      run3,
      primary,
      "for-each-ref",
      "--format=%(refname:short)",
      `refs/heads/${SESSION_BRANCH_PREFIX}*`
    );
    const candidates = branches.code === 0 ? branches.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
    if (candidates.length === 0) {
      ui.showInfo(
        "Nothing to finalize: no linked worktrees and no local session-set/* branches. (Already finalized? This command is safely re-runnable.)"
      );
      return;
    }
    chosenBranch = candidates.length === 1 ? candidates[0] : await ui.showQuickPickLabels(
      candidates.map((b2) => ({ label: b2 })),
      "Which merged session branch should be cleaned up?"
    ) ?? null;
    if (!chosenBranch)
      return;
  }
  if (!chosenBranch) {
    ui.showError(
      "Could not resolve which session branch to finalize (the worktree reports no branch \u2014 detached HEAD?)."
    );
    return;
  }
  const trunk = await detectTrunkBranch(run3, primary);
  const currentBranch = await gitLine(run3, primary, "rev-parse", "--abbrev-ref", "HEAD");
  if (currentBranch !== trunk) {
    ui.showError(
      `The main checkout is on '${currentBranch ?? "?"}', not the trunk ('${trunk}'). Check out the trunk first (git checkout ${trunk}) \u2014 finalize pulls the merged trunk with --ff-only.`
    );
    return;
  }
  if (await isDirty(run3, primary)) {
    ui.showError(
      "The main checkout has uncommitted changes \u2014 finalize refuses to run cleanup on a dirty tree. Commit or stash first."
    );
    return;
  }
  const steps = [];
  steps.push({
    display: `git pull --ff-only`,
    exec: async () => {
      const r2 = await git(run3, primary, "pull", "--ff-only");
      if (r2.code !== 0)
        throw new Error((r2.stderr || r2.stdout).trim());
      return "trunk fast-forwarded";
    }
  });
  if (chosenWorktree) {
    const wtPath = chosenWorktree.path;
    steps.push({
      display: `git worktree remove ${wtPath}`,
      exec: async () => {
        const exists2 = (deps.fileExists ?? ((p2) => fs15.existsSync(p2)))(wtPath);
        if (!exists2) {
          const prune = await git(run3, primary, "worktree", "prune");
          return prune.code === 0 ? "worktree already gone (pruned stale registration)" : "worktree already gone";
        }
        const r2 = await git(run3, primary, "worktree", "remove", wtPath);
        if (r2.code !== 0) {
          throw new Error(
            `${(r2.stderr || r2.stdout).trim()}
(A worktree with uncommitted work is never force-removed \u2014 resolve it, or use python -m ai_router.cancel_session for the messy path.)`
          );
        }
        return "worktree removed";
      }
    });
  }
  const branchToDelete = chosenBranch;
  steps.push({
    display: `git branch -d ${branchToDelete}`,
    exec: async () => {
      const exists2 = await git(
        run3,
        primary,
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${branchToDelete}`
      );
      if (exists2.code !== 0)
        return "branch already deleted";
      const r2 = await git(run3, primary, "branch", "-d", branchToDelete);
      if (r2.code !== 0) {
        throw new Error(
          `${(r2.stderr || r2.stdout).trim()}
(git refuses -d on an unmerged branch \u2014 was the PR actually merged? Nothing is force-deleted.)`
        );
      }
      return "local branch deleted";
    }
  });
  steps.push({
    display: `git fetch --prune`,
    exec: async () => {
      const r2 = await git(run3, primary, "fetch", "--prune");
      if (r2.code !== 0)
        throw new Error((r2.stderr || r2.stdout).trim());
      return "remote-tracking refs pruned";
    }
  });
  const confirmed = await ui.confirm(
    `Finalize merged set '${branchToDelete}'?`,
    `Run AFTER the PR is merged on the host. This will run, in order:

${steps.map((s) => `  ${s.display}`).join("\n")}

Each step is idempotent; an already-done step is skipped. Branch deletion uses -d (never -D), so an unmerged branch refuses rather than losing work.`,
    "Finalize"
  );
  if (!confirmed)
    return;
  const notes = [];
  for (const step of steps) {
    try {
      const note = await step.exec();
      notes.push(`${step.display} \u2014 ${note}`);
    } catch (err) {
      ui.showError(
        `Finalize stopped at '${step.display}':
${err instanceof Error ? err.message : String(err)}

Completed so far:
${notes.join("\n") || "(nothing)"}

Fix the cause and re-run \u2014 completed steps skip themselves.`
      );
      return;
    }
  }
  ui.showInfo(`Merged set finalized.
${notes.join("\n")}`);
}
function registerGitWorkflowCommands(context) {
  context.subscriptions.push(
    vscode16.commands.registerCommand("dabbler.openPrForSet", async () => {
      await runOpenPrFlow({ ui: defaultUi(), run: defaultRunner() });
    }),
    vscode16.commands.registerCommand("dabbler.finalizeMergedSet", async () => {
      await runFinalizeMergedSetFlow({ ui: defaultUi(), run: defaultRunner() });
    })
  );
}

// src/commands/gitRelease.ts
var vscode17 = __toESM(require("vscode"));
var HOTFIX_BRANCH_PREFIX = "hotfix/";
var REF_VISIBLE_UNSAFE = /[ ~^:?*[\\]/;
function refNameProblem(name, kind) {
  const label = `a ${kind} name`;
  if (name === "")
    return `${label} cannot be empty`;
  if (name.startsWith("-"))
    return `${label} cannot begin with '-' (it looks like a command-line flag)`;
  if (name.startsWith("/") || name.endsWith("/"))
    return `${label} cannot begin or end with '/'`;
  if (name.includes("//"))
    return `${label} cannot contain '//'`;
  if (name.includes(".."))
    return `${label} cannot contain '..'`;
  if (name.includes("@{"))
    return `${label} cannot contain '@{'`;
  if (name === "@")
    return `${label} cannot be a single '@'`;
  if (name.endsWith("."))
    return `${label} cannot end with '.'`;
  for (const component of name.split("/")) {
    if (component === "")
      return `${label} cannot contain an empty path segment`;
    if (component.startsWith("."))
      return `no path segment of ${label} may begin with '.'`;
    if (component.endsWith(".lock"))
      return `no path segment of ${label} may end with '.lock'`;
  }
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code === 127)
      return `${label} cannot contain control characters`;
  }
  const bad = REF_VISIBLE_UNSAFE.exec(name);
  if (bad) {
    const shown = bad[0] === " " ? "a space" : `'${bad[0]}'`;
    return `${label} cannot contain ${shown}`;
  }
  return null;
}
function parseTagRefLines(stdout) {
  const out = [];
  for (const raw of stdout.split(/\r?\n/)) {
    if (raw.trim() === "")
      continue;
    const tab = raw.indexOf("	");
    if (tab === -1) {
      out.push({ name: raw.trim(), subject: "" });
    } else {
      out.push({ name: raw.slice(0, tab).trim(), subject: raw.slice(tab + 1).trim() });
    }
  }
  return out;
}
async function git2(run3, cwd, ...args) {
  return run3("git", args, { cwd });
}
async function gitLine2(run3, cwd, ...args) {
  const r2 = await git2(run3, cwd, ...args);
  if (r2.code !== 0)
    return null;
  const line = r2.stdout.split(/\r?\n/).find((l) => l.trim() !== "");
  return line ? line.trim() : null;
}
async function isDirty2(run3, cwd) {
  const r2 = await git2(run3, cwd, "status", "--porcelain");
  return r2.code === 0 ? r2.stdout.trim() !== "" : true;
}
async function refExists(run3, cwd, fullRef) {
  const r2 = await git2(run3, cwd, "rev-parse", "--verify", "--quiet", fullRef);
  return r2.code === 0;
}
async function resolveCommit(run3, cwd, ref) {
  const r2 = await git2(run3, cwd, "log", "-1", "--format=%h %s", ref);
  if (r2.code !== 0)
    return null;
  const line = r2.stdout.split(/\r?\n/).find((l) => l.trim() !== "");
  if (!line)
    return null;
  const t2 = line.trim();
  const idx = t2.indexOf(" ");
  return idx === -1 ? { sha: t2, subject: "" } : { sha: t2.slice(0, idx), subject: t2.slice(idx + 1) };
}
async function listTags(run3, cwd) {
  const r2 = await git2(
    run3,
    cwd,
    "for-each-ref",
    "--sort=-creatordate",
    "--format=%(refname:short)	%(contents:subject)",
    "refs/tags"
  );
  if (r2.code !== 0)
    return null;
  return parseTagRefLines(r2.stdout);
}
async function pickTag(ui, tags, placeHolder) {
  return ui.showQuickPickLabels(
    tags.map((t2) => ({ label: t2.name, description: t2.subject || void 0 })),
    placeHolder
  );
}
async function runCutReleaseTagFlow(deps) {
  const { ui, run: run3 } = deps;
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showError("No workspace folder is open.");
    return;
  }
  const originUrl = await gitLine2(run3, root, "remote", "get-url", "origin");
  if (!originUrl) {
    ui.showError(
      "This workspace has no `origin` remote (or is not a git repository) \u2014 a release tag is created and pushed to origin. Add one with: git remote add origin <url>."
    );
    return;
  }
  const rawName = await ui.showInputBox({
    title: "Release tag name",
    prompt: "Annotated tag to cut, e.g. v1.2.0 (or greeter-v0.1.0 for a per-module tag).",
    ignoreFocusOut: true,
    validateInput: (v) => refNameProblem(v.trim(), "tag") ?? void 0
  });
  if (rawName === void 0)
    return;
  const tag = rawName.trim();
  const nameProblem = refNameProblem(tag, "tag");
  if (nameProblem) {
    ui.showError(`Invalid tag name: ${nameProblem}.`);
    return;
  }
  if (await refExists(run3, root, `refs/tags/${tag}`)) {
    ui.showError(
      `Tag '${tag}' already exists. Pushed release tags are immutable by convention \u2014 choose a new version, or delete the old tag first (git tag -d ${tag}) if it was never pushed.`
    );
    return;
  }
  const rawRef = await ui.showInputBox({
    title: "Commit to tag",
    value: "HEAD",
    prompt: "The commit/branch/tag to place this release tag on (default HEAD = the current commit).",
    ignoreFocusOut: true
  });
  if (rawRef === void 0)
    return;
  const ref = rawRef.trim() || "HEAD";
  const commit = await resolveCommit(run3, root, ref);
  if (!commit) {
    ui.showError(`Could not resolve '${ref}' to a commit \u2014 check the ref and try again.`);
    return;
  }
  const rawMessage = await ui.showInputBox({
    title: "Tag annotation message",
    value: tag,
    prompt: "Message stored in the annotated tag (defaults to the tag name).",
    ignoreFocusOut: true
  });
  if (rawMessage === void 0)
    return;
  const message = rawMessage.trim() || tag;
  const dirtyNote = await isDirty2(run3, root) ? "\n\nNote: the working tree has uncommitted changes \u2014 they are NOT part of the tagged commit." : "";
  const confirmed = await ui.confirm(
    `Cut and push release tag '${tag}'?`,
    `This creates an annotated tag and PUSHES it to origin \u2014 a release action:

  git tag -a ${tag} ${commit.sha} -m "${message}"
  git push origin ${tag}

Tagging ${commit.sha}${commit.subject ? ` "${commit.subject}"` : ""} (resolved from ${ref}).
A pushed tag is immutable by convention \u2014 review the tag and commit above before confirming.` + dirtyNote,
    "Create + push tag"
  );
  if (!confirmed)
    return;
  const created = await git2(run3, root, "tag", "-a", tag, commit.sha, "-m", message);
  if (created.code !== 0) {
    ui.showError(`git tag failed:
${(created.stderr || created.stdout).trim()}`);
    return;
  }
  const pushed = await git2(run3, root, "push", "origin", tag);
  if (pushed.code !== 0) {
    ui.showError(
      `The tag '${tag}' was created locally but the push failed:
${(pushed.stderr || pushed.stdout).trim()}

Retry the push with: git push origin ${tag}
Or remove the local tag with: git tag -d ${tag}`
    );
    return;
  }
  ui.showInfo(
    `Release tag '${tag}' created and pushed to origin (${commit.sha}${commit.subject ? ` "${commit.subject}"` : ""}).`
  );
}
async function runStartHotfixFromTagFlow(deps) {
  const { ui, run: run3 } = deps;
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showError("No workspace folder is open.");
    return;
  }
  const tags = await listTags(run3, root);
  if (tags === null) {
    ui.showError(
      "Could not read tags \u2014 is this folder inside a git repository? Open your repo and try again."
    );
    return;
  }
  if (tags.length === 0) {
    ui.showInfo(
      "No tags yet \u2014 a hotfix branches from a release tag. Cut one first with `Dabbler: Cut release tag`."
    );
    return;
  }
  if (await isDirty2(run3, root)) {
    ui.showError(
      "The working tree has uncommitted changes \u2014 start the hotfix from a clean tree so the branch is exactly the tagged snapshot. Commit or stash first."
    );
    return;
  }
  const tag = await pickTag(ui, tags, "Which release tag is the hotfix based on?");
  if (!tag)
    return;
  const rawName = await ui.showInputBox({
    title: "Hotfix branch name",
    value: `${HOTFIX_BRANCH_PREFIX}${tag}`,
    prompt: "Name for the hotfix branch cut from the tag.",
    ignoreFocusOut: true,
    validateInput: (v) => refNameProblem(v.trim(), "branch") ?? void 0
  });
  if (rawName === void 0)
    return;
  const branch = rawName.trim();
  const nameProblem = refNameProblem(branch, "branch");
  if (nameProblem) {
    ui.showError(`Invalid branch name: ${nameProblem}.`);
    return;
  }
  if (await refExists(run3, root, `refs/heads/${branch}`)) {
    ui.showError(`Branch '${branch}' already exists \u2014 choose a different hotfix branch name.`);
    return;
  }
  const confirmed = await ui.confirm(
    `Start hotfix branch '${branch}' from '${tag}'?`,
    `This creates a local hotfix branch from the release tag '${tag}' (the deployed snapshot) \u2014 never from the trunk, which may hold unreleased work:

  git switch -c ${branch} ${tag}

After this: make the fix, commit, push and open a PR, validate the full suite locally, then cut the next release tag on the hotfix commit.`,
    "Create hotfix branch"
  );
  if (!confirmed)
    return;
  const switched = await git2(run3, root, "switch", "-c", branch, tag);
  if (switched.code !== 0) {
    ui.showError(`git switch -c failed:
${(switched.stderr || switched.stdout).trim()}`);
    return;
  }
  ui.showInfo(
    `On hotfix branch '${branch}', based on the '${tag}' snapshot. Next: make the fix, commit, push + PR, validate the full suite, then cut the next release tag on the hotfix commit.`
  );
}
async function runRollBackToTagFlow(deps) {
  const { ui, run: run3 } = deps;
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showError("No workspace folder is open.");
    return;
  }
  const tags = await listTags(run3, root);
  if (tags === null) {
    ui.showError(
      "Could not read tags \u2014 is this folder inside a git repository? Open your repo and try again."
    );
    return;
  }
  if (tags.length === 0) {
    ui.showInfo(
      "No tags to roll back to \u2014 a rollback redeploys a previous release tag. Cut one first with `Dabbler: Cut release tag`."
    );
    return;
  }
  if (await isDirty2(run3, root)) {
    ui.showError(
      "The working tree has uncommitted changes \u2014 a rollback redeploys the exact tagged snapshot. Commit or stash first."
    );
    return;
  }
  const tag = await pickTag(ui, tags, "Which release tag do you want to roll back to?");
  if (!tag)
    return;
  const commit = await resolveCommit(run3, root, tag);
  const trunk = await detectTrunkBranch(run3, root);
  const confirmed = await ui.confirm(
    `Roll back to '${tag}'?`,
    `This checks out the release tag '${tag}' so you can run / redeploy exactly that snapshot \u2014 a rollback is redeploying the previous tag, not git surgery. You will be on a DETACHED HEAD:

  git checkout ${tag}

Rolling back to ${commit ? `${commit.sha}${commit.subject ? ` "${commit.subject}"` : ""}` : tag}.
Return to the trunk afterward with: git switch ${trunk}`,
    "Check out tag"
  );
  if (!confirmed)
    return;
  const checkedOut = await git2(run3, root, "checkout", tag);
  if (checkedOut.code !== 0) {
    ui.showError(`git checkout failed:
${(checkedOut.stderr || checkedOut.stdout).trim()}`);
    return;
  }
  ui.showInfo(
    `Rolled back to '${tag}'${commit ? ` (${commit.sha})` : ""} \u2014 detached HEAD at the tagged snapshot. Run / redeploy from here. Return to the trunk with: git switch ${trunk}.`
  );
}
function registerGitReleaseCommands(context) {
  const deps = () => ({ ui: defaultUi(), run: defaultRunner() });
  context.subscriptions.push(
    vscode17.commands.registerCommand("dabbler.cutReleaseTag", async () => {
      await runCutReleaseTagFlow(deps());
    }),
    vscode17.commands.registerCommand("dabbler.startHotfixFromTag", async () => {
      await runStartHotfixFromTagFlow(deps());
    }),
    vscode17.commands.registerCommand("dabbler.rollBackToTag", async () => {
      await runRollBackToTagFlow(deps());
    })
  );
}

// src/commands/troubleshoot.ts
var vscode18 = __toESM(require("vscode"));
var fs16 = __toESM(require("fs"));
var path21 = __toESM(require("path"));
var cp6 = __toESM(require("child_process"));
function workspaceRoot() {
  return vscode18.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
function outputChannel() {
  return vscode18.window.createOutputChannel("Dabbler Diagnostics");
}
function checkActivation() {
  const ch = outputChannel();
  const root = workspaceRoot();
  if (!root) {
    ch.appendLine("No workspace folder is open.");
    ch.show();
    return;
  }
  const dir = path21.join(root, SESSION_SETS_REL);
  const exists2 = fs16.existsSync(dir);
  ch.appendLine(`docs/session-sets/ exists: ${exists2}`);
  ch.appendLine(`Expected path: ${dir}`);
  if (!exists2) {
    ch.appendLine("");
    ch.appendLine(
      "The extension activates on 'workspaceContains:docs/session-sets'. Create this folder (and at least one session-set subdirectory with a spec.md) to activate."
    );
    ch.appendLine("Run 'Dabbler: Set Up New Project' to scaffold the folder.");
  } else {
    ch.appendLine("Activation condition is met. If the view is still empty, try 'Dabbler: Refresh'.");
  }
  ch.show();
}
function checkStateStuck() {
  const ch = outputChannel();
  ch.appendLine("Session-set state machine:");
  ch.appendLine("  not-started  \u2192  only spec.md exists");
  ch.appendLine("  in-progress  \u2192  activity-log.json OR session-state.json exists");
  ch.appendLine("  complete     \u2192  change-log.md exists");
  ch.appendLine("");
  ch.appendLine(
    "If a session appears stuck, check that the AI router wrote the expected files. Open 'Activity Log' from the context menu to inspect the raw log."
  );
  ch.show();
}
function checkWorktrees() {
  const ch = outputChannel();
  const root = workspaceRoot();
  if (!root) {
    ch.appendLine("No workspace folder open.");
    ch.show();
    return;
  }
  try {
    const out = cp6.execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 5e3
    });
    ch.appendLine("git worktree list --porcelain output:");
    ch.appendLine(out || "(no output)");
    ch.appendLine("");
    ch.appendLine(
      "The extension scans all listed worktrees for docs/session-sets/ and merges results."
    );
  } catch (err) {
    ch.appendLine(`git worktree list failed: ${err instanceof Error ? err.message : String(err)}`);
    ch.appendLine("Is this folder inside a git repository?");
  }
  ch.show();
}
function checkApiKeys() {
  const ch = outputChannel();
  ch.appendLine("The ai_router reads API keys from environment variables at session start.");
  ch.appendLine("");
  ch.appendLine("Keys used (depending on configured providers):");
  ch.appendLine("  DABBLER_ANTHROPIC_API_KEY  \u2014 Claude (claude.ai)");
  ch.appendLine("  DABBLER_OPENAI_API_KEY     \u2014 OpenAI (GPT models)");
  ch.appendLine("  DABBLER_GEMINI_API_KEY     \u2014 Google Gemini");
  ch.appendLine("");
  ch.appendLine("Export them in your shell profile (~/.bashrc, ~/.zshrc, or $PROFILE on Windows).");
  ch.appendLine("After editing, restart VS Code or open a new terminal.");
  ch.show();
}
function checkHighCost() {
  const ch = outputChannel();
  ch.appendLine("Cost guidance:");
  ch.appendLine("  Opus 4.x   \u2192 ~$1\u20135 per session (highest quality, highest cost)");
  ch.appendLine("  Sonnet 4.x \u2192 ~$0.10\u20130.50 per session (good quality, moderate cost)");
  ch.appendLine("  Haiku 4.x  \u2192 ~$0.01\u20130.05 per session (fast, lowest cost)");
  ch.appendLine("");
  ch.appendLine("Run 'python -m ai_router.report' for cumulative totals and a full spend report.");
  ch.appendLine("Set effort=low in spec.md Session Set Configuration to reduce token spend.");
  ch.show();
}
function checkLayout() {
  const ch = outputChannel();
  const root = workspaceRoot();
  if (!root) {
    ch.appendLine("No workspace folder open.");
    ch.show();
    return;
  }
  const dirs = [
    path21.join("docs", "session-sets"),
    path21.join("docs", "planning"),
    "ai_router"
  ];
  ch.appendLine(`Expected layout under: ${root}`);
  ch.appendLine("");
  for (const d of dirs) {
    const full = path21.join(root, d);
    const exists2 = fs16.existsSync(full);
    ch.appendLine(`  ${exists2 ? "\u2713" : "\u2717"} ${d}`);
  }
  ch.appendLine("");
  ch.appendLine("Missing folders? Run 'Dabbler: Set Up New Project' to scaffold them.");
  ch.show();
}
function registerTroubleshootCommand(context) {
  context.subscriptions.push(
    vscode18.commands.registerCommand("dabbler.troubleshoot", async () => {
      const items = [
        {
          label: "$(warning) Extension not activating",
          detail: "Check for docs/session-sets/ and explain the activation trigger",
          run: checkActivation
        },
        {
          label: "$(sync) Session stuck in 'In Progress'",
          detail: "Explain the file-presence state machine",
          run: checkStateStuck
        },
        {
          label: "$(git-branch) Worktrees not showing",
          detail: "Run git worktree list and show the output",
          run: checkWorktrees
        },
        {
          label: "$(key) API key not found",
          detail: "Show which environment variables the ai_router expects",
          run: checkApiKeys
        },
        {
          label: "$(graph) Cost seems high",
          detail: "Show cost estimates by model and point to the dashboard",
          run: checkHighCost
        },
        {
          label: "$(folder) File/folder layout wrong",
          detail: "Compare expected layout vs. actual workspace state",
          run: checkLayout
        }
      ];
      const picked = await vscode18.window.showQuickPick(
        items.map((i2) => ({ label: i2.label, detail: i2.detail, _run: i2.run })),
        { placeHolder: "Select a troubleshooting topic" }
      );
      if (picked)
        picked._run();
    })
  );
}

// src/commands/cancelLifecycleCommands.ts
var vscode19 = __toESM(require("vscode"));

// src/utils/sessionLifecycleCli.ts
var SESSION_LIFECYCLE_CLI = "ai_router.session_lifecycle";
function cancelArgs(sessionSetDir, reason) {
  return ["--json", "cancel", "--session-set-dir", sessionSetDir, "--reason", reason];
}
function restoreArgs(sessionSetDir, reason) {
  return ["--json", "restore", "--session-set-dir", sessionSetDir, "--reason", reason];
}
function run2(repoRoot, args, actionLabel, deps) {
  return runRouterCli(
    { module: SESSION_LIFECYCLE_CLI, args, cwd: repoRoot, actionLabel },
    deps
  );
}
function runCancelSessionSet(repoRoot, sessionSetDir, reason, deps) {
  return run2(
    repoRoot,
    cancelArgs(sessionSetDir, reason),
    "Cancelling a session set",
    deps
  );
}
function runRestoreSessionSet(repoRoot, sessionSetDir, reason, deps) {
  return run2(
    repoRoot,
    restoreArgs(sessionSetDir, reason),
    "Restoring a session set",
    deps
  );
}
function describeLifecycleFailure(verb, setName, result) {
  const detail = result.message.trim() || `exit ${result.exitCode}`;
  if (result.outcome === "refused") {
    return `${verb} "${setName}" refused \u2014 ${detail} Nothing was written.`;
  }
  if (result.outcome === "unavailable") {
    return detail;
  }
  return `Failed to ${verb.toLowerCase()} "${setName}": ${detail} Re-run the command to finish.`;
}

// src/commands/cancelLifecycleCommands.ts
function defaultUi2() {
  return {
    confirm: (summary, detail, affirmative, negative) => vscode19.window.showInformationMessage(
      summary,
      { modal: true, detail },
      affirmative,
      negative
    ),
    promptReason: (prompt, placeHolder) => vscode19.window.showInputBox({ prompt, placeHolder, ignoreFocusOut: true }),
    showInformationMessage: (m) => vscode19.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode19.window.showErrorMessage(m)
  };
}
async function runCancelSessionSetFlow(set, ui = defaultUi2(), cliDeps) {
  const choice = await ui.confirm(
    `Cancel session set "${set.name}"?`,
    "This writes a CANCELLED.md audit file in the session-set folder. The set can be restored later.",
    "Cancel Session Set",
    "Keep"
  );
  if (choice !== "Cancel Session Set")
    return false;
  const reason = await ui.promptReason(
    `Reason for cancelling "${set.name}" (optional)`,
    "e.g. scope rolled into another set"
  );
  const result = await runCancelSessionSet(set.root, set.dir, reason ?? "", cliDeps);
  if (!result.ok) {
    ui.showErrorMessage(describeLifecycleFailure("Cancelling", set.name, result));
    return false;
  }
  ui.showInformationMessage(
    `Cancelled "${set.name}". CANCELLED.md written to the session-set folder.`
  );
  return true;
}
async function runRestoreSessionSetFlow(set, ui = defaultUi2(), cliDeps) {
  const choice = await ui.confirm(
    `Restore session set "${set.name}"?`,
    "This renames CANCELLED.md to RESTORED.md (history preserved) and returns the set to its prior status.",
    "Restore",
    "Keep Cancelled"
  );
  if (choice !== "Restore")
    return false;
  const reason = await ui.promptReason(
    `Reason for restoring "${set.name}" (optional)`,
    "e.g. scope is back in plan"
  );
  const result = await runRestoreSessionSet(set.root, set.dir, reason ?? "", cliDeps);
  if (!result.ok) {
    ui.showErrorMessage(describeLifecycleFailure("Restoring", set.name, result));
    return false;
  }
  ui.showInformationMessage(
    `Restored "${set.name}". RESTORED.md kept as audit trail.`
  );
  return true;
}
function registerCancelLifecycleCommands(context, deps) {
  context.subscriptions.push(
    vscode19.commands.registerCommand(
      "dabblerSessionSets.cancel",
      async (item) => {
        const set = item?.set;
        if (!set)
          return;
        if (await runCancelSessionSetFlow(set))
          deps.refreshView();
      }
    ),
    vscode19.commands.registerCommand(
      "dabblerSessionSets.restore",
      async (item) => {
        const set = item?.set;
        if (!set)
          return;
        if (await runRestoreSessionSetFlow(set))
          deps.refreshView();
      }
    )
  );
}

// src/commands/copilotSeatSetupCommand.ts
var fs17 = __toESM(require("fs"));
var path22 = __toESM(require("path"));
var vscode20 = __toESM(require("vscode"));
function registerCopilotSeatSetupCommand(context) {
  context.subscriptions.push(
    vscode20.commands.registerCommand(
      "dabblerSessionSets.setUpCopilotSeat",
      () => runSetUpCopilotSeat(context)
    )
  );
}
async function runSetUpCopilotSeat(context) {
  const root = vscode20.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode20.window.showErrorMessage(
      "Open a workspace folder before running Dabbler: Set Up Copilot Seat."
    );
    return;
  }
  const venvPath = path22.join(root, ".venv");
  if (!fs17.existsSync(venvPath)) {
    vscode20.window.showErrorMessage(
      'No .venv found in this workspace \u2014 run "Dabbler: Set Up New Project" or "Dabbler: Install ai-router" first, then re-run this command.'
    );
    return;
  }
  writeCopilotSeatStatusMarker(root, makeFileOps());
  await runCopilotSeatSetupWithProgress(context, root, venvPath);
}

// src/commands/gettingStartedDoc.ts
var vscode21 = __toESM(require("vscode"));
var fs18 = __toESM(require("fs"));
var path23 = __toESM(require("path"));
function workspaceGettingStartedDoc(workspaceRoot2) {
  if (!workspaceRoot2)
    return void 0;
  const abs = path23.join(workspaceRoot2, ...GETTING_STARTED_REL_PATH.split("/"));
  try {
    return fs18.statSync(abs).isFile() ? abs : void 0;
  } catch {
    return void 0;
  }
}
function materializeBundledDoc(context) {
  const src = path23.join(
    resolveBundledTemplateDir(context.extensionPath),
    GETTING_STARTED_TEMPLATE_FILENAME
  );
  const dstDir = context.globalStorageUri.fsPath;
  fs18.mkdirSync(dstDir, { recursive: true });
  const dst = path23.join(dstDir, "getting-started.md");
  fs18.copyFileSync(src, dst);
  return dst;
}
async function openGettingStartedDoc(context) {
  try {
    const root = vscode21.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const docPath = workspaceGettingStartedDoc(root) ?? materializeBundledDoc(context);
    await vscode21.commands.executeCommand(
      "markdown.showPreview",
      vscode21.Uri.file(docPath)
    );
  } catch (err) {
    console.warn("[gettingStarted] could not open the instructions doc", err);
  }
}
function registerGetStartedCommand(context) {
  context.subscriptions.push(
    vscode21.commands.registerCommand("dabbler.getStarted", async () => {
      try {
        await vscode21.commands.executeCommand("dabblerSessionSets.focus");
      } catch (err) {
        console.warn("[gettingStarted] could not focus the Work Explorer view", err);
      }
      await openGettingStartedDoc(context);
    })
  );
}

// src/commands/openModulePlan.ts
var vscode22 = __toESM(require("vscode"));
var fs19 = __toESM(require("fs"));
var path24 = __toESM(require("path"));

// src/providers/ActionRegistry.ts
var inFlightLike = (s) => s.state === "in-progress" || s.state === "not-started";
var cancellable = (s) => s.state === "in-progress" || s.state === "not-started" || s.state === "complete";
var isCancelled2 = (s) => s.state === "cancelled";
var needsMigrationToV3 = (s) => s.needsMigration && s.migrationTargetSchemaVersion === 3;
var needsMigrationToV4 = (s) => s.needsMigration && s.migrationTargetSchemaVersion === 4;
var hasUnsatisfiedPrereqs = (s) => inFlightLike(s) && s.unsatisfiedPrereqs.length > 0;
var ROW_ACTIONS = [
  // Open File ▸ submenu. L2 locks the four entries to: Spec, Activity
  // Log, Change Log, Session State. "Open AI Assignment" removed per
  // L3. Open UAT Checklist / Reveal Playwright Tests / Reveal Folder
  // remain registered as Command-Palette-only commands — they are not
  // surfaced on the right-click menu under L2.
  { id: "dabblerSessionSets.openSpec", label: "Spec", group: 101, category: "openFile", when: () => true },
  { id: "dabblerSessionSets.openActivityLog", label: "Activity Log", group: 102, category: "openFile", when: () => true },
  { id: "dabblerSessionSets.openChangeLog", label: "Change Log", group: 103, category: "openFile", when: () => true },
  { id: "dabblerSessionSets.openSessionState", label: "Session State", group: 104, category: "openFile", when: () => true },
  // Copy Prompt ▸ submenu — L2 labels match the spec §3.3 table (the
  // submenu was renamed Set 049 S1 to better reflect its contents,
  // which include action prompts like "Start Next Session" not just
  // evaluation prompts).
  {
    id: "dabbler.copyStartNextSessionPrompt",
    label: "Start Next Session",
    group: 304,
    category: "copyEval",
    when: (s) => inFlightLike(s)
  },
  // Flat actions — appear at the top level of the QuickPick. The
  // spec §3.3 table lists v4 only because v4 is the canonical target;
  // the v3 entry is kept here for legacy v1/v2 sets (mutually exclusive
  // with v4 — at most one of the two ever appears per row).
  //
  // Set 049 S4 (rip-out): `dabbler.checkOutOrchestrator` ("Set
  // Orchestrator…") retired alongside the check-out / check-in
  // coordination layer.
  { id: "dabblerSessionSets.copySlug", label: "Copy Slug", group: 501, category: "flat", when: () => true },
  // Set 061 S2 (spec D3): companion to the blocked marker — jumps to
  // the spec of whichever unsatisfied prerequisite is blocking this
  // row (QuickPick when more than one). Reuses the openSpec plumbing
  // in commands/openFile.ts.
  { id: "dabblerSessionSets.openPrerequisiteSpec", label: "Open Prerequisite Spec", group: 503, category: "flat", when: hasUnsatisfiedPrereqs },
  { id: "dabblerSessionSets.migrate", label: "Migrate to v3 schema", group: 801, category: "flat", when: needsMigrationToV3 },
  { id: "dabblerSessionSets.migrateToV4", label: "Migrate to v4 schema", group: 802, category: "flat", when: needsMigrationToV4 },
  {
    id: "dabblerSessionSets.cancel",
    label: "Cancel Session Set",
    group: 901,
    category: "flat",
    when: (s) => cancellable(s)
  },
  {
    id: "dabblerSessionSets.restore",
    label: "Restore Session Set",
    group: 902,
    category: "flat",
    when: (s) => isCancelled2(s)
  }
];
var SESSION_ACTIONS = [
  // Gated by `sessionOffersRunPrompt`, which reuses
  // `planLeftClickActivation`'s set-level answer and adds "this row is the
  // next runnable session". The prompt copied is the framework's own
  // set-scoped trigger phrase, so the row that carries it must be the row
  // that phrase resolves to.
  {
    id: "dabbler.copySessionRunPrompt",
    label: "Copy Run Prompt",
    group: 601,
    when: (set, session) => sessionOffersRunPrompt(set, session)
  }
  // Set 115 S4 (operator ruling at the set's UAT walk, 2026-08-11):
  // "Open Session Artifacts" is REMOVED. S3 shipped it beside the run
  // prompt; walking the finished row, the operator judged one entry
  // enough — the artifacts are a folder away and the menu is worth more
  // when it offers exactly what a session row is for. The command, its
  // manifest entries and its discovery helpers went with it rather than
  // being left registered and unreachable.
];

// src/providers/inProgressSetsService.ts
function listInProgressSets(all) {
  const sets = all ?? readAllSessionSets();
  return sets.filter((s) => s.state === "in-progress").sort((a, b2) => {
    const aStart = a.liveSession?.startedAt ?? "";
    const bStart = b2.liveSession?.startedAt ?? "";
    return aStart.localeCompare(bStart);
  });
}

// src/utils/verdictTokens.ts
var RECOGNIZED_VERDICT_PREFIXES = [
  "VERIFIED",
  "ISSUES_FOUND",
  "WAIVED"
];
function isRecognizedVerdictToken(verdict) {
  if (typeof verdict !== "string")
    return false;
  const normalized = verdict.trim().toUpperCase();
  if (!normalized)
    return false;
  return RECOGNIZED_VERDICT_PREFIXES.some((p2) => normalized.startsWith(p2));
}

// src/providers/SessionSetsModel.ts
function migrationTooltip(set) {
  if (!set.needsMigration)
    return "";
  const v = set.schemaVersionOnDisk;
  return typeof v === "number" ? `Ran under schema v${v}` : "Ran under an older schema";
}
function hasSubCurrentSets(allSets) {
  return allSets.some((s) => s.needsMigration);
}
var ICON_FILES = {
  complete: "done.svg",
  "in-progress": "in-progress.svg",
  "not-started": "not-started.svg",
  cancelled: "cancelled.svg"
};
function touchedDate(set) {
  if (!set.lastTouched)
    return "";
  return new Date(set.lastTouched).toLocaleDateString("en-CA");
}
function uatBadge(set) {
  if (!set.config?.requiresUAT || !set.uatSummary)
    return "";
  if (set.uatSummary.pendingItems > 0)
    return `[UAT ${set.uatSummary.pendingItems}]`;
  if (set.uatSummary.totalItems > 0)
    return "[UAT done]";
  return "";
}
function forceClosedBadge(set) {
  return set.liveSession?.forceClosed === true ? "[FORCED]" : "";
}
var BLOCKED_MARKER = "\u26D3\uFE0E";
function targetStateLabel(state) {
  switch (state) {
    case "in-progress":
      return "in progress";
    case "not-started":
      return "not started";
    case "unknown":
      return "unknown set \u2014 check the slug";
    default:
      return state;
  }
}
function blockedMarker(set) {
  if (set.unsatisfiedPrereqs.length === 0)
    return "";
  if (set.state === "complete" || set.state === "cancelled")
    return "";
  return BLOCKED_MARKER;
}
function blockedTooltip(set) {
  if (blockedMarker(set) === "")
    return "";
  const parts = set.unsatisfiedPrereqs.map(
    (p2) => `${p2.slug} (${targetStateLabel(p2.targetState)})`
  );
  return `Blocked by prerequisites: ${parts.join(", ")} \u2014 all must complete first.`;
}
function kindTooltip(set) {
  if (set.kind === "plan") {
    return "Module lifecycle set: creates or imports this module's project plan.";
  }
  if (set.kind === "decomposition") {
    return "Module lifecycle set: decomposes the module's plan into session sets.";
  }
  return "";
}
function bucketSets(all) {
  return {
    inProgress: all.filter((s) => s.state === "in-progress"),
    notStarted: all.filter((s) => s.state === "not-started"),
    complete: all.filter((s) => s.state === "complete"),
    cancelled: all.filter((s) => s.state === "cancelled")
  };
}
function sortBucket(subset, groupKey) {
  const out = subset.slice();
  if (groupKey === "not-started") {
    out.sort((a, b2) => a.name.localeCompare(b2.name));
  } else {
    out.sort((a, b2) => (b2.lastTouched || "").localeCompare(a.lastTouched || ""));
  }
  return out;
}
function orderedBuckets(subset) {
  const buckets = bucketSets(subset);
  const groups = [
    {
      key: "in-progress",
      label: "In Progress",
      sets: listInProgressSets(buckets.inProgress)
    },
    {
      key: "not-started",
      label: "Not Started",
      sets: sortBucket(buckets.notStarted, "not-started")
    },
    {
      key: "complete",
      label: "Complete",
      sets: sortBucket(buckets.complete, "complete")
    }
  ];
  if (buckets.cancelled.length > 0) {
    groups.push({
      key: "cancelled",
      label: "Cancelled",
      sets: sortBucket(buckets.cancelled, "cancelled")
    });
  }
  return groups;
}
function mergeVisibleModules(roots) {
  const declared = /* @__PURE__ */ new Map();
  const fallback = /* @__PURE__ */ new Map();
  let pseudo = null;
  let firstSeen = 0;
  const warningRank = (warning) => {
    if (!warning)
      return 0;
    if (warning.code === "manifest-invalid")
      return 3;
    if (warning.code === "manifest-missing")
      return 2;
    return 1;
  };
  for (const modules of roots) {
    let declaredOrder = 0;
    for (const module2 of modules) {
      if (module2.kind === "declared") {
        const slug = module2.slug;
        const existing = declared.get(slug);
        if (existing) {
          existing.module = {
            ...existing.module,
            sets: [...existing.module.sets, ...module2.sets]
          };
          existing.order = Math.min(existing.order, declaredOrder);
        } else {
          declared.set(slug, {
            module: { ...module2, sets: [...module2.sets] },
            order: declaredOrder,
            firstSeen: firstSeen++
          });
        }
        declaredOrder++;
        continue;
      }
      if (module2.kind === "fallback") {
        const slug = module2.slug;
        const existing = fallback.get(slug);
        fallback.set(
          slug,
          existing ? { ...existing, sets: [...existing.sets, ...module2.sets] } : { ...module2, sets: [...module2.sets] }
        );
        continue;
      }
      if (!pseudo) {
        pseudo = { ...module2, sets: [...module2.sets] };
      } else {
        const existingPseudo = pseudo;
        pseudo = {
          ...existingPseudo,
          warning: warningRank(module2.warning) > warningRank(existingPseudo.warning) ? module2.warning : existingPseudo.warning,
          sets: [...existingPseudo.sets, ...module2.sets]
        };
      }
    }
  }
  const out = Array.from(declared.values()).sort((a, b2) => a.order - b2.order || a.firstSeen - b2.firstSeen).map((entry) => entry.module);
  out.push(...Array.from(fallback.values()).sort((a, b2) => a.slug.localeCompare(b2.slug)));
  const mergedPseudo = pseudo;
  if (mergedPseudo) {
    out.push({
      ...mergedPseudo,
      displayName: out.length === 0 ? PSEUDO_MODULE_SOLE_NAME : PSEUDO_MODULE_COEXIST_NAME
    });
  }
  return out;
}
var PSEUDO_MODULE_SOLE_NAME = "Default";
var PSEUDO_MODULE_COEXIST_NAME = "Unassigned";
function chooseRenderableModuleSnapshot(classification, current, lastKnownGood) {
  if (classification.kind === "invalid" && lastKnownGood) {
    return { modules: lastKnownGood, retainedLastKnownGood: true };
  }
  return { modules: current, retainedLastKnownGood: false };
}
function computeVisibleModules(classification, allSets, opts) {
  const declared = classification.kind === "present" ? classification.entries : [];
  const declaredSlugs = new Set(declared.map((e) => e.slug));
  const declaredSets = /* @__PURE__ */ new Map();
  const fallbackSets = /* @__PURE__ */ new Map();
  const unstamped = [];
  for (const s of allSets) {
    const raw = s.config?.module ?? null;
    if (raw === null) {
      unstamped.push(s);
    } else if (declaredSlugs.has(raw)) {
      const list2 = declaredSets.get(raw);
      if (list2)
        list2.push(s);
      else
        declaredSets.set(raw, [s]);
    } else {
      const list2 = fallbackSets.get(raw);
      if (list2)
        list2.push(s);
      else
        fallbackSets.set(raw, [s]);
    }
  }
  const out = declared.map((entry) => ({
    kind: "declared",
    slug: entry.slug,
    displayName: entry.title,
    warning: null,
    planPath: resolveModulePlanRelPath(entry).path,
    sets: declaredSets.get(entry.slug) ?? []
  }));
  for (const rawSlug of Array.from(fallbackSets.keys()).sort()) {
    out.push({
      kind: "fallback",
      slug: rawSlug,
      displayName: rawSlug,
      warning: { code: "undeclared-slug", rawSlug },
      planPath: null,
      sets: fallbackSets.get(rawSlug)
    });
  }
  const otherGroupsVisible = out.length > 0;
  const pseudoVisible = unstamped.length > 0 || opts.legacyRootPlanExists || !otherGroupsVisible;
  if (pseudoVisible) {
    let warning = null;
    if (classification.kind === "invalid") {
      warning = { code: "manifest-invalid" };
    } else if (classification.kind === "absent" && allSets.length > 0) {
      warning = { code: "manifest-missing" };
    } else if (unstamped.length > 0 && otherGroupsVisible) {
      warning = { code: "unstamped-sets" };
    }
    out.push({
      kind: "pseudo",
      slug: null,
      displayName: otherGroupsVisible ? PSEUDO_MODULE_COEXIST_NAME : PSEUDO_MODULE_SOLE_NAME,
      warning,
      planPath: LEGACY_ROOT_PLAN_REL,
      sets: unstamped
    });
  }
  return out;
}

// src/providers/workExplorerTreeModel.ts
function moduleKeyOf(module2) {
  return `${module2.kind}:${module2.slug ?? ""}`;
}
function preselectFromTreeNode(arg) {
  if (arg === null || typeof arg !== "object")
    return void 0;
  const node = arg;
  if (node.kind !== "module" || !node.module)
    return void 0;
  return { preselectedSlug: node.module.slug ?? "" };
}
function moduleNodes(modules) {
  const declaredModulesExist = modules.some((m) => m.kind === "declared");
  return modules.map((module2) => ({ kind: "module", module: module2, declaredModulesExist }));
}
function bucketNodes(node) {
  return orderedBuckets([...node.module.sets]).map((bucket) => ({
    kind: "bucket",
    moduleKey: moduleKeyOf(node.module),
    bucketKey: bucket.key,
    label: bucket.label,
    sets: bucket.sets
  }));
}
function setNodes(node) {
  return node.sets.map((set) => ({ kind: "set", set }));
}
function sessionNodes(node) {
  return [...node.set.sessions ?? []].sort((a, b2) => a.number - b2.number).map((session) => ({ kind: "session", set: node.set, session }));
}
function stepNodes(node) {
  if (node.session.status !== "in-progress")
    return [];
  const ledger = node.set.stepLedger;
  if (!ledger || ledger.sessionNumber !== node.session.number)
    return [];
  const rows = buildStepRows(
    ledger.entries,
    ledger.sessionNumber,
    ledger.specSteps,
    ledger.flight
  );
  const closeOutAt = closeOutStepIndex(rows);
  const obligations = closeOutAt < 0 ? null : resolveCloseObligations(node);
  return rows.map((row, position) => ({
    kind: "step",
    set: node.set,
    session: node.session,
    row,
    position,
    ...obligations && position === closeOutAt ? { closeOut: obligations } : {}
  }));
}
var CLOSE_OUT_STEP_RE = [
  /\bclos(?:e|ing)[-\s]?out\b/i,
  /\bclose\b\s*(?:[.;,)\]]|$)/i,
  /\bclos(?:e|es|ing)\s+(?:the\s+|this\s+)?(?:session|set)\b/i,
  /\bclose_session\b/i
];
function isCloseOutStep(row) {
  const haystacks = [
    stepRowLabel(row),
    String(row.stepKey || "").replace(/[-_]/g, " ")
  ];
  return haystacks.some(
    (text) => CLOSE_OUT_STEP_RE.some((re) => re.test(text))
  );
}
function closeOutStepIndex(rows) {
  for (let i2 = rows.length - 1; i2 >= 0; i2 -= 1) {
    if (isCloseOutStep(rows[i2]))
      return i2;
  }
  return -1;
}
function resolveCloseObligations(node) {
  if (node.session.status !== "in-progress")
    return null;
  const obligations = node.set.closeObligations;
  if (!obligations)
    return null;
  if (obligations.sessionNumber !== null && obligations.sessionNumber !== node.session.number) {
    return {
      state: "absent",
      sessionNumber: null,
      verdict: null,
      generatedAt: null,
      obligations: []
    };
  }
  return obligations;
}
function closeOutNodes(node) {
  if (stepNodes(node).some((s) => s.closeOut !== void 0))
    return [];
  const obligations = resolveCloseObligations(node);
  if (!obligations)
    return [];
  return [
    { kind: "closeout", set: node.set, session: node.session, obligations }
  ];
}
function obligationNodes(node) {
  return node.obligations.obligations.map((obligation, position) => ({
    kind: "obligation",
    set: node.set,
    session: node.session,
    obligation,
    projection: node.obligations,
    position
  }));
}
function childrenOf(node) {
  switch (node.kind) {
    case "module":
      return bucketNodes(node);
    case "bucket":
      return setNodes(node);
    case "set":
      return sessionNodes(node);
    case "session":
      return [...stepNodes(node), ...closeOutNodes(node)];
    case "closeout":
      return obligationNodes(node);
    case "step":
      return node.closeOut ? obligationNodes({
        set: node.set,
        session: node.session,
        obligations: node.closeOut
      }) : [];
    case "obligation":
      return [];
  }
}
var TOKEN_SEP = ";";
function tokenString(tokens) {
  return TOKEN_SEP + tokens.join(TOKEN_SEP) + TOKEN_SEP;
}
var NODE_TOKEN = {
  module: "dabblerModule",
  bucket: "dabblerBucket",
  set: "dabblerSet",
  session: "dabblerSession",
  step: "dabblerStep",
  closeout: "dabblerCloseOut",
  obligation: "dabblerObligation"
};
var MODULE_TOKEN = {
  declared: "module-declared",
  fallback: "module-fallback",
  pseudo: "module-pseudo",
  canOpenPlan: "can-open-plan",
  canManage: "can-manage-module",
  canAssignLegacy: "can-assign-legacy"
};
function actionToken(action) {
  return `act-${action.id.replace(/^dabbler(SessionSets)?\./, "").replace(/\./g, "-")}`;
}
function verdictIsUnclean(verdict) {
  if (typeof verdict !== "string" || verdict.trim() === "")
    return false;
  if (!isRecognizedVerdictToken(verdict))
    return true;
  const normalized = verdict.trim().toUpperCase();
  return normalized.startsWith("ISSUES_FOUND") || normalized.startsWith("WAIVED");
}
function severityOf(set) {
  if (blockedMarker(set) !== "")
    return "blocked";
  if (set.needsMigration)
    return "migration";
  if (verdictIsUnclean(set.liveSession?.verificationVerdict))
    return "verification";
  if (set.duplicateNameError)
    return "duplicate-name";
  return null;
}
function setIcon(set) {
  return { kind: "file", slug: ICON_FILES[set.state] };
}
function sessionIcon(status) {
  return { kind: "file", slug: ICON_FILES[status] };
}
var MODULE_WARNING_TEXT = {
  "manifest-missing": "No `docs/modules.yaml` in this root \u2014 these sets are ungrouped.",
  "manifest-invalid": "`docs/modules.yaml` is invalid; showing the last good module tree. Fix the file by hand.",
  "unstamped-sets": "Some sets carry no `module:` attribution.",
  "undeclared-slug": "This module is stamped on sets but is not declared in `docs/modules.yaml`."
};
function moduleDescriptor(node) {
  const { module: module2 } = node;
  const setCount = module2.sets.length;
  const warning = module2.warning;
  const tokens = [NODE_TOKEN.module];
  if (module2.kind === "declared") {
    tokens.push(MODULE_TOKEN.declared, MODULE_TOKEN.canOpenPlan, MODULE_TOKEN.canManage);
  } else if (module2.kind === "pseudo") {
    tokens.push(MODULE_TOKEN.pseudo, MODULE_TOKEN.canOpenPlan);
    if (node.declaredModulesExist)
      tokens.push(MODULE_TOKEN.canAssignLegacy);
  } else {
    tokens.push(MODULE_TOKEN.fallback);
  }
  const tooltipLines = [`**${module2.displayName}**`, "", `${setCount} session set${setCount === 1 ? "" : "s"}`];
  if (warning) {
    tooltipLines.push("", `$(warning) ${MODULE_WARNING_TEXT[warning.code] ?? warning.code}`);
  }
  return {
    id: `module:${moduleKeyOf(module2)}`,
    label: module2.displayName,
    description: `${setCount} set${setCount === 1 ? "" : "s"}`,
    tooltip: tooltipLines.join("\n"),
    // Module rows are structural; lifecycle glyphs belong to buckets, sets,
    // and sessions rather than competing with the module name.
    icon: void 0,
    contextValue: tokenString(tokens),
    collapsible: "collapsed"
  };
}
function bucketDescriptor(node) {
  const count = node.sets.length;
  return {
    // Scoped by module: "In Progress" exists under every module row.
    id: `bucket:${node.moduleKey}/${node.bucketKey}`,
    label: node.label,
    // Session 1 recorded this as PROPOSED, not operator-confirmed:
    // bucket labels are short, so `description` survives truncation
    // where a set row's does not. Session 4's walk confirms or drops it.
    description: `${count} set${count === 1 ? "" : "s"}`,
    icon: { kind: "file", slug: ICON_FILES[node.bucketKey] },
    contextValue: tokenString([NODE_TOKEN.bucket, `bucket-${node.bucketKey}`]),
    // The three default buckets render even when EMPTY — a declared
    // module with no work yet still shows where that work will land
    // (never hide work). But an empty one is a LEAF: offering a twisty
    // that opens onto nothing is the same dead affordance a
    // session-less set row would be, and the count in `description`
    // already says why it will not expand.
    collapsible: count > 0 ? "collapsed" : "none"
  };
}
function setTooltip(set) {
  const lines = [`**${set.name}**`];
  const progress = set.totalSessions && set.totalSessions > 0 ? `${set.sessionsCompleted}/${set.totalSessions}` : `${set.sessionsCompleted}/?`;
  const state = set.state.replace("-", " ");
  lines.push("", `${state} \xB7 ${progress} sessions complete`);
  const markers = [];
  const blocked = blockedTooltip(set);
  if (blocked)
    markers.push(blocked);
  if (set.needsMigration)
    markers.push(migrationTooltip(set));
  const verdict = set.liveSession?.verificationVerdict;
  if (typeof verdict === "string" && verdict.trim() !== "") {
    markers.push(
      isRecognizedVerdictToken(verdict) ? `Verification: ${verdict}` : `Verification: "${verdict}" is not a recognized verdict`
    );
  }
  if (set.duplicateNameError) {
    markers.push(
      `Duplicate session-set name in ${set.duplicateNameError.conflictingDirs.length} locations. Showing ${set.duplicateNameError.chosenDir}; rename one copy.`
    );
  }
  const kind = kindTooltip(set);
  if (kind)
    markers.push(kind);
  const uat = uatBadge(set);
  if (uat)
    markers.push(`UAT: ${uat.replace(/^\[|\]$/g, "")}`);
  const forced = forceClosedBadge(set);
  if (forced)
    markers.push("Closed via the --force bypass, not the deterministic gate.");
  if (markers.length > 0) {
    lines.push("", ...markers.map((m) => `- ${m}`));
  }
  const touched = touchedDate(set);
  if (touched)
    lines.push("", `_last touched ${touched}_`);
  return lines.join("\n");
}
function setDescriptor(set, supports) {
  const tokens = [NODE_TOKEN.set, `state-${set.state}`];
  const severity = severityOf(set);
  if (severity)
    tokens.push(`severity-${severity}`);
  for (const action of ROW_ACTIONS) {
    if (action.when(set, supports))
      tokens.push(actionToken(action));
  }
  const sessionCount = (set.sessions ?? []).length;
  return {
    // Set names are globally unique by repo invariant (Set 087), which
    // is exactly why they are also the identity every row action keys on.
    id: `set:${set.name}`,
    label: set.name,
    tooltip: setTooltip(set),
    icon: setIcon(set),
    contextValue: tokenString(tokens),
    // Operator-notes wrinkle 5: a set node MUST report Collapsed, never
    // Expanded, or the fourth level is paid on every refresh — the exact
    // cost the migration exists to remove. A set with no readable ledger
    // is a leaf, so expanding never opens onto nothing.
    collapsible: sessionCount > 0 ? "collapsed" : "none"
  };
}
function sessionDescriptor(node) {
  const { session } = node;
  const steps = stepNodes(node);
  const closeOut = closeOutNodes(node);
  const tokens = [NODE_TOKEN.session, `session-${session.status}`];
  for (const action of SESSION_ACTIONS) {
    if (action.when(node.set, session))
      tokens.push(actionToken(action));
  }
  return {
    id: `session:${node.set.name}/${session.number}`,
    label: session.title || `Session ${session.number}`,
    // Short labels, so `description` survives truncation here. Only the
    // in-flight session says anything — quiet is the default state.
    description: session.status === "in-progress" ? "in flight" : void 0,
    tooltip: sessionTooltip(node, steps.length),
    icon: sessionIcon(session.status),
    contextValue: tokenString(tokens),
    // Collapsed only when there is something under it. A session with no
    // steps to show — every session that is not in flight, and an
    // in-flight one whose activity log is absent or unreadable — is a
    // leaf, which is the same rule an empty bucket and a ledger-less set
    // already follow.
    collapsible: steps.length + closeOut.length > 0 ? "collapsed" : "none"
  };
}
function sessionTooltip(node, stepCount) {
  const { session } = node;
  const title = session.title || `Session ${session.number}`;
  const lines = [`**${title}** \u2014 ${session.status.replace("-", " ")}`];
  if (stepCount > 0) {
    lines.push("", `${stepCount} step${stepCount === 1 ? "" : "s"}`);
  }
  return lines.join("\n");
}
function stepDescriptor(node) {
  const { row } = node;
  const status = effectiveStatusOf(row);
  const glyph = glyphStatusOf(status);
  const tooltipLines = [`**${stepRowLabel(row)}**`];
  const state = row.isActive ? "in progress \u2014 derived from the plan, not yet logged" : row.isPlanned ? "planned \u2014 not started" : String(row.status || "unknown").replace(/[-_]/g, " ");
  tooltipLines.push("", state);
  if (row.startedAt)
    tooltipLines.push("", `Started ${row.startedAt}`);
  const description = String(row.description || "").trim();
  if (description)
    tooltipLines.push("", description);
  const started = stepStartLabel(row.startedAt);
  const closeOut = node.closeOut;
  const readiness = closeOut ? closeOutSummary(closeOut) : "";
  const rowDescription = [started, readiness].filter(Boolean).join("  ");
  if (closeOut) {
    tooltipLines.push("", closeOutTooltip(closeOut));
  }
  return {
    // `position` disambiguates: an unplanned logged step can append
    // alongside a planned row that carries the same key.
    id: `step:${node.set.name}/${node.session.number}/${node.position}`,
    label: stepRowLabel(row),
    ...rowDescription ? { description: rowDescription } : {},
    tooltip: tooltipLines.join("\n"),
    icon: { kind: "file", slug: ICON_FILES[glyph] },
    contextValue: tokenString([
      NODE_TOKEN.step,
      `step-${glyph}`,
      row.isPlanned ? "step-planned" : "step-logged",
      // A derived active step is planned AND running; a `when` clause that
      // wants one or the other can say so without re-deriving anything.
      ...row.isActive ? ["step-active"] : [],
      // The folded close-out step answers to the close-out tokens too, so
      // anything that could target the old standalone row still can.
      ...closeOut ? [NODE_TOKEN.closeout, `closeout-${closeOut.state}`] : []
    ]),
    collapsible: closeOut && closeOut.obligations.length > 0 ? "collapsed" : "none"
  };
}
function stepStartLabel(startedAt) {
  if (!startedAt)
    return "";
  const when = new Date(startedAt);
  if (Number.isNaN(when.getTime()))
    return "";
  const hh = String(when.getHours()).padStart(2, "0");
  const mm = String(when.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}-`;
}
var CLOSE_PREFLIGHT_COMMAND = "python -m ai_router.close_preflight --session-set-dir <set> --write";
function asOfLabel(generatedAt) {
  if (!generatedAt)
    return "as of an unrecorded time";
  const when = new Date(generatedAt);
  if (Number.isNaN(when.getTime()))
    return `as of ${generatedAt}`;
  const hh = String(when.getHours()).padStart(2, "0");
  const mm = String(when.getMinutes()).padStart(2, "0");
  return `as of ${hh}:${mm}`;
}
function obligationCounts(projection) {
  const unmet = projection.obligations.filter((o2) => !o2.met);
  return {
    blocking: unmet.filter((o2) => o2.blocking).length,
    advisory: unmet.filter((o2) => !o2.blocking).length,
    total: projection.obligations.length
  };
}
var VERDICT_WOULD_CLOSE = "would-close";
var VERDICT_UNDECIDED = "undecided-backstop-would-route";
var CLOSE_OUT_GROUP_LABEL = "Close-out readiness";
function closeOutSummary(projection) {
  const { state } = projection;
  if (state === "absent")
    return "";
  if (state === "unreadable")
    return "unreadable \u2014 regenerate";
  const { blocking, advisory } = obligationCounts(projection);
  const parts = [];
  if (blocking > 0)
    parts.push(`${blocking} blocking`);
  if (advisory > 0)
    parts.push(`${advisory} advisory`);
  if (parts.length === 0) {
    parts.push(
      projection.verdict === VERDICT_UNDECIDED ? "not decided \u2014 the backstop would route" : "nothing outstanding"
    );
    parts.push(asOfLabel(projection.generatedAt));
  }
  const outstanding = parts.join(", ");
  return state === "stale" ? `stale \u2014 ${outstanding}` : outstanding;
}
function closeOutGlyph(projection) {
  if (projection.state === "unreadable")
    return "cancelled";
  if (projection.state !== "fresh")
    return "not-started";
  const { blocking, advisory } = obligationCounts(projection);
  if (blocking + advisory > 0)
    return "not-started";
  return projection.verdict === VERDICT_WOULD_CLOSE ? "complete" : "not-started";
}
function closeOutTooltip(p2) {
  const lines = ["**Close-out obligations**"];
  switch (p2.state) {
    case "absent":
      lines.push(
        "",
        "Nothing has been computed for this session yet. This row is not a claim that nothing remains \u2014 it is the absence of an answer.",
        "",
        `Run: \`${CLOSE_PREFLIGHT_COMMAND}\``
      );
      return lines.join("\n");
    case "unreadable":
      lines.push(
        "",
        "The recorded projection could not be read \u2014 damaged, or written by a newer schema than this extension knows.",
        "",
        `Regenerate: \`${CLOSE_PREFLIGHT_COMMAND}\``
      );
      return lines.join("\n");
    case "stale":
      lines.push(
        "",
        `**Stale** \u2014 the session-set directory has changed since this was computed (${asOfLabel(p2.generatedAt)}). Rows below were true then.`,
        "",
        `Regenerate: \`${CLOSE_PREFLIGHT_COMMAND}\``
      );
      break;
    default:
      lines.push("", `Computed ${asOfLabel(p2.generatedAt)}.`);
      break;
  }
  const { blocking, advisory, total } = obligationCounts(p2);
  lines.push(
    "",
    `${total} obligation${total === 1 ? "" : "s"} \u2014 ${blocking} blocking unmet, ${advisory} advisory unmet.`
  );
  if (p2.verdict) {
    lines.push("", `close_session would report: \`${p2.verdict}\``);
  }
  lines.push(
    "",
    "_These are the same predicates `close_session` runs; nothing here refuses a close._"
  );
  return lines.join("\n");
}
function closeOutDescriptor(node) {
  const p2 = node.obligations;
  return {
    id: `closeout:${node.set.name}/${node.session.number}`,
    label: CLOSE_OUT_GROUP_LABEL,
    description: closeOutSummary(p2),
    tooltip: closeOutTooltip(p2),
    icon: { kind: "file", slug: ICON_FILES[closeOutGlyph(p2)] },
    contextValue: tokenString([NODE_TOKEN.closeout, `closeout-${p2.state}`]),
    collapsible: p2.obligations.length > 0 ? "collapsed" : "none"
  };
}
function obligationDescriptor(node) {
  const { obligation: o2, projection } = node;
  const stale = projection.state !== "fresh";
  const asOf = stale || o2.volatile;
  const parts = [];
  if (!o2.met)
    parts.push(o2.blocking ? "blocking" : "advisory");
  if (o2.cost_warning)
    parts.push("$");
  if (asOf)
    parts.push(asOfLabel(projection.generatedAt));
  const tooltip = [`**${humanizeStepKey(o2.check)}**`, "", o2.met ? "met" : "unmet"];
  if (o2.detail)
    tooltip.push("", o2.detail);
  if (o2.action)
    tooltip.push("", `\u2192 ${o2.action}`);
  if (o2.cost_warning)
    tooltip.push("", `$ ${o2.cost_warning}`);
  if (o2.volatile) {
    tooltip.push(
      "",
      "_Read from git, not from a file \u2014 no digest can tell whether it is still true, so this row is only ever as current as the projection's timestamp._"
    );
  }
  if (stale) {
    tooltip.push("", `_The projection is ${projection.state}; regenerate it._`);
  }
  return {
    id: `obligation:${node.set.name}/${node.session.number}/${node.position}`,
    label: humanizeStepKey(o2.check),
    description: parts.length > 0 ? parts.join(" \xB7 ") : void 0,
    tooltip: tooltip.join("\n"),
    // A met row may still read as done: the parent row carries the
    // staleness verdict for the list as a whole, and the description
    // above repeats it per row, so the glyph is not the only thing
    // saying how old the answer is.
    icon: { kind: "file", slug: ICON_FILES[o2.met ? "complete" : "not-started"] },
    contextValue: tokenString([
      NODE_TOKEN.obligation,
      o2.met ? "obligation-met" : "obligation-unmet",
      o2.blocking ? "obligation-blocking" : "obligation-advisory",
      ...o2.volatile ? ["obligation-volatile"] : []
    ]),
    collapsible: "none"
  };
}
function descriptorFor(node, supports) {
  switch (node.kind) {
    case "module":
      return moduleDescriptor(node);
    case "bucket":
      return bucketDescriptor(node);
    case "set":
      return setDescriptor(node.set, supports);
    case "session":
      return sessionDescriptor(node);
    case "step":
      return stepDescriptor(node);
    case "closeout":
      return closeOutDescriptor(node);
    case "obligation":
      return obligationDescriptor(node);
  }
}

// src/commands/openModulePlan.ts
var PLAN_DEST_POSIX = "docs/planning/project-plan.md";
function defaultUi3() {
  return {
    showInformationMessage: vscode22.window.showInformationMessage,
    showErrorMessage: vscode22.window.showErrorMessage,
    showQuickPick: (items, opts) => vscode22.window.showQuickPick(items, opts),
    executeCommand: (command, ...args) => vscode22.commands.executeCommand(command, ...args),
    workspaceRoot: () => vscode22.workspace.workspaceFolders?.[0]?.uri.fsPath
  };
}
async function resolvePlanTarget(root, ui, opts) {
  if (!root)
    return { entry: null, destPosix: PLAN_DEST_POSIX };
  const pick2 = await pickModuleForAuthoring(
    root,
    {
      showQuickPick: ui.showQuickPick,
      showInformationMessage: ui.showInformationMessage,
      showErrorMessage: ui.showErrorMessage
    },
    opts && opts.preselectedSlug !== void 0 ? { preselectedSlug: opts.preselectedSlug } : void 0
  );
  if (pick2.kind === "cancelled" || pick2.kind === "invalid-manifest" || pick2.kind === "unknown-module") {
    return null;
  }
  return {
    entry: pick2.entry,
    destPosix: pick2.entry ? modulePlanRelPath(pick2.entry) : PLAN_DEST_POSIX
  };
}
async function openModulePlan(ui = defaultUi3(), opts) {
  const root = ui.workspaceRoot();
  if (!root) {
    void ui.showErrorMessage("No workspace folder is open.");
    return;
  }
  const target = await resolvePlanTarget(root, ui, opts);
  if (!target)
    return;
  const destPath = path24.join(root, ...target.destPosix.split("/"));
  const containment = path24.relative(path24.resolve(root), path24.resolve(destPath));
  if (containment === "" || containment.startsWith("..") || path24.isAbsolute(containment)) {
    void ui.showErrorMessage(
      `Refusing to open outside the workspace: ${target.destPosix}`
    );
    return;
  }
  if (!fs19.existsSync(destPath)) {
    void ui.showInformationMessage(
      `No plan yet at ${target.destPosix}. Create that file (or copy an existing plan there) and run this action again.`
    );
    return;
  }
  await ui.executeCommand("vscode.open", vscode22.Uri.file(destPath));
}
function registerOpenModulePlanCommand(context) {
  context.subscriptions.push(
    vscode22.commands.registerCommand(
      "dabbler.openModulePlan",
      async (arg) => {
        await openModulePlan(void 0, preselectFromTreeNode(arg));
      }
    )
  );
}

// src/commands/newModule.ts
var vscode23 = __toESM(require("vscode"));
var path25 = __toESM(require("path"));
function defaultUi4() {
  return {
    showInputBox: vscode23.window.showInputBox,
    showInformationMessage: (m) => vscode23.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode23.window.showErrorMessage(m),
    openFile: (absPath) => vscode23.commands.executeCommand("vscode.open", vscode23.Uri.file(absPath)),
    workspaceRoot: () => vscode23.workspace.workspaceFolders?.[0]?.uri.fsPath
  };
}
async function runNewModuleFlow(ui = defaultUi4(), cliDeps) {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }
  const existingSlugs = (readModulesManifest(root) ?? []).map((e) => e.slug);
  const slug = await ui.showInputBox({
    title: "New module (1/2): slug",
    prompt: "Machine identity for the module (kebab-case). Session sets declare module: <slug> and the Explorer groups them under it.",
    placeHolder: "greeter",
    ignoreFocusOut: true,
    validateInput: (v) => validateNewModuleSlug(v, existingSlugs)
  });
  if (slug === void 0 || slug.trim() === "")
    return false;
  const title = await ui.showInputBox({
    title: "New module (2/2): display title",
    prompt: `Shown as the module's group header in the Session Set Explorer. Press Enter to use "${slug.trim()}".`,
    placeHolder: slug.trim(),
    ignoreFocusOut: true
  });
  if (title === void 0)
    return false;
  const result = await runCreateModule(
    root,
    { slug: slug.trim(), title: title.trim() },
    cliDeps
  );
  if (!result.ok) {
    ui.showErrorMessage(describeFailure("New module", result));
    return false;
  }
  const planRel = result.payload?.["planRel"];
  if (typeof planRel === "string" && planRel !== "") {
    await ui.openFile(path25.join(root, ...planRel.split("/")));
  }
  ui.showInformationMessage(describeCreate(result.payload));
  return true;
}
function registerNewModuleCommand(context) {
  context.subscriptions.push(
    vscode23.commands.registerCommand("dabbler.newModule", async () => {
      await runNewModuleFlow();
    })
  );
}

// src/commands/openModulesManifest.ts
var vscode24 = __toESM(require("vscode"));
var path26 = __toESM(require("path"));
function defaultUi5() {
  return {
    showInformationMessage: (m) => vscode24.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode24.window.showErrorMessage(m),
    openFile: (absPath) => vscode24.commands.executeCommand("vscode.open", vscode24.Uri.file(absPath)),
    workspaceRoot: () => vscode24.workspace.workspaceFolders?.[0]?.uri.fsPath
  };
}
async function openModulesManifestFlow(ui = defaultUi5()) {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }
  let created;
  try {
    created = ensureModulesManifest(root).created;
  } catch (err) {
    ui.showErrorMessage(
      `Could not create ${MODULES_MANIFEST_DISPLAY}: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
  const abs = path26.join(root, MODULES_MANIFEST_REL);
  try {
    await ui.openFile(abs);
  } catch (err) {
    ui.showErrorMessage(
      `Could not open ${MODULES_MANIFEST_DISPLAY}: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
  if (created) {
    ui.showInformationMessage(
      `Created ${MODULES_MANIFEST_DISPLAY}. Define your modules (or ask an AI assistant to decompose the project), then SAVE the file \u2014 the Work Explorer groups your session sets by module.`
    );
  }
  return true;
}
function registerOpenModulesManifestCommand(context) {
  context.subscriptions.push(
    vscode24.commands.registerCommand("dabbler.openModulesManifest", async () => {
      await openModulesManifestFlow();
    })
  );
}

// src/commands/copyModuleDecompositionPrompt.ts
var vscode25 = __toESM(require("vscode"));
var fs20 = __toESM(require("fs"));
var path27 = __toESM(require("path"));
function buildModuleDecompositionPrompt(planPresent) {
  const planLine = planPresent ? `Read the repository directly \u2014 its folders and code, and the project plan at \`${LEGACY_ROOT_PLAN_REL}\` (read that file for the project's goals and scope). Nothing is inlined here.` : `Read the repository directly \u2014 its folders and code \u2014 to understand the project's areas of work. Nothing is inlined here (there is no \`${LEGACY_ROOT_PLAN_REL}\` yet).`;
  return `Module-decomposition request (Dabbler module-organized project).

Decompose THIS project into modules for the Dabbler AI-led workflow. A "module" groups related session sets by area of the project \u2014 a unit of work owned by ONE developer at a time (a developer may own several modules, but two developers should never work the same module concurrently; AI-speed changes make concurrent same-module work a constant merge-conflict source \u2014 size modules accordingly). ${planLine}

Write your result into \`${MODULES_MANIFEST_DISPLAY}\` (already created from the canonical template): fill it in, preserving the header comments and the top-level \`modules:\` key, and replace the empty \`modules: []\` list with one block-style entry per module. Each entry:
  - slug:      kebab-case machine identity, GLOBALLY UNIQUE across modules.
  - title:     the display name the Work Explorer shows for the group.
  - codeRoots: the repo-relative code paths this module owns ([] for an
               integration module that only composes others).
  - planPath:  the module's project plan, repo-relative (e.g.
               docs/modules/<slug>/project-plan.md).
  - touches:   integration modules ONLY \u2014 the slugs of the modules it
               works across; owners of every touched module review its PRs.

Hard invariants (do NOT violate):
  - Session-set NAMES stay globally unique across ALL modules. \`module\` is a GROUPING attribute, never part of a set's identity \u2014 never rename a set to encode its module.
  - Keep the file valid YAML matching the template's shape; do not rename or restructure the top-level \`modules:\` key.
  - Every path is repo-relative and forward-slashed.

If the project is a single area of work, one module (or none \u2014 leave \`modules: []\`) is correct; do not invent modules to fill the file. Save \`${MODULES_MANIFEST_DISPLAY}\` when done \u2014 the Work Explorer regroups your session sets as soon as you save.
`;
}
function defaultUi6() {
  return {
    workspaceRoot: () => vscode25.workspace.workspaceFolders?.[0]?.uri.fsPath,
    // fs.existsSync never throws — swallows errors, returns false.
    fileExists: (abs) => fs20.existsSync(abs),
    copyToClipboard: (text) => vscode25.env.clipboard.writeText(text),
    showInformationMessage: (m) => vscode25.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode25.window.showErrorMessage(m)
  };
}
async function runCopyModuleDecompositionPromptFlow(ui = defaultUi6()) {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }
  let created;
  try {
    created = ensureModulesManifest(root).created;
  } catch (err) {
    ui.showErrorMessage(
      `Could not create ${MODULES_MANIFEST_DISPLAY}: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
  const planPresent = ui.fileExists(
    path27.join(root, ...LEGACY_ROOT_PLAN_REL.split("/"))
  );
  const prompt = buildModuleDecompositionPrompt(planPresent);
  try {
    await ui.copyToClipboard(prompt);
  } catch (err) {
    ui.showErrorMessage(
      `Failed to copy to clipboard: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
  ui.showInformationMessage(
    created ? `Created ${MODULES_MANIFEST_DISPLAY} and copied the module-decomposition prompt. Paste it into your AI assistant; it fills in ${MODULES_MANIFEST_DISPLAY} \u2014 then SAVE the file.` : `Copied the module-decomposition prompt. Paste it into your AI assistant; it fills in ${MODULES_MANIFEST_DISPLAY} \u2014 then SAVE the file.`
  );
  return true;
}
function registerCopyModuleDecompositionPromptCommand(context) {
  context.subscriptions.push(
    vscode25.commands.registerCommand(
      "dabbler.copyModuleDecompositionPrompt",
      async () => {
        await runCopyModuleDecompositionPromptFlow();
      }
    )
  );
}

// src/commands/assignLegacySets.ts
var vscode26 = __toESM(require("vscode"));
function defaultUi7() {
  return {
    pickTargetModule: async (entries) => {
      const picked = await vscode26.window.showQuickPick(
        entries.map((e) => ({
          label: e.title,
          description: e.slug,
          entry: e
        })),
        {
          placeHolder: "Assign the selected sets to which module?",
          ignoreFocusOut: true
        }
      );
      return picked?.entry;
    },
    pickSets: async (candidates) => {
      const picked = await vscode26.window.showQuickPick(
        candidates.map((s) => ({ label: s.name, set: s })),
        {
          placeHolder: "Select the legacy (unassigned) sets to assign",
          canPickMany: true,
          ignoreFocusOut: true
        }
      );
      return picked?.map((p2) => p2.set);
    },
    showInformationMessage: (m) => vscode26.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode26.window.showErrorMessage(m),
    workspaceRoot: () => vscode26.workspace.workspaceFolders?.[0]?.uri.fsPath,
    readSets: () => readAllSessionSets()
  };
}
async function runAssignLegacySetsFlow(ui = defaultUi7(), cliDeps) {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }
  const classified = classifyModulesManifest(root);
  if (classified.kind === "invalid") {
    ui.showErrorMessage(INVALID_MANIFEST_MESSAGE);
    return false;
  }
  const entries = classified.kind === "present" ? classified.entries : [];
  if (entries.length === 0) {
    ui.showInformationMessage(
      `No modules are declared in ${MODULES_MANIFEST_DISPLAY} yet. Run "Dabbler: New Module" to declare one, then assign sets to it.`
    );
    return false;
  }
  const candidates = ui.readSets().filter((s) => s.root === root && !s.config?.module);
  if (candidates.length === 0) {
    ui.showInformationMessage(
      "No unassigned session sets to assign \u2014 every set already declares a module."
    );
    return false;
  }
  const target = await ui.pickTargetModule(entries);
  if (!target)
    return false;
  const chosen = await ui.pickSets(candidates);
  if (!chosen || chosen.length === 0)
    return false;
  const result = await runAssignSets(
    root,
    { slug: target.slug, setNames: chosen.map((s) => s.name) },
    cliDeps
  );
  if (!result.ok) {
    ui.showErrorMessage(describeFailure(`Assigning to "${target.title}"`, result));
    return assignedAny(result.payload);
  }
  ui.showInformationMessage(describeAssign(result.payload));
  return assignedAny(result.payload);
}
function registerAssignLegacySetsCommand(context) {
  context.subscriptions.push(
    vscode26.commands.registerCommand(
      "dabbler.assignLegacySetsToModule",
      async () => {
        await runAssignLegacySetsFlow();
      }
    )
  );
}

// src/commands/renameModule.ts
var vscode27 = __toESM(require("vscode"));
function defaultUi8() {
  return {
    pickModule: async (entries) => {
      const picked = await vscode27.window.showQuickPick(
        entries.map((e) => ({
          label: e.title,
          description: e.slug,
          entry: e
        })),
        { placeHolder: "Which module do you want to rename?", ignoreFocusOut: true }
      );
      return picked?.entry;
    },
    promptNewSlug: (currentSlug, validate) => vscode27.window.showInputBox({
      prompt: "New module slug (kebab-case) \u2014 leave unchanged to keep it",
      value: currentSlug,
      ignoreFocusOut: true,
      validateInput: (v) => validate(v) ?? null
    }),
    promptNewTitle: (currentTitle) => vscode27.window.showInputBox({
      prompt: "New module title (display name) \u2014 leave unchanged to keep it",
      value: currentTitle,
      ignoreFocusOut: true
    }),
    confirm: async (summary, detail) => {
      const choice = await vscode27.window.showWarningMessage(
        summary,
        { modal: true, detail },
        "Rename Module"
      );
      return choice === "Rename Module";
    },
    showInformationMessage: (m) => vscode27.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode27.window.showErrorMessage(m),
    workspaceRoot: () => vscode27.workspace.workspaceFolders?.[0]?.uri.fsPath,
    readSets: () => readAllSessionSets()
  };
}
async function runRenameModuleFlow(ui = defaultUi8(), opts, cliDeps) {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }
  const classified = classifyModulesManifest(root);
  if (classified.kind === "invalid") {
    ui.showErrorMessage(INVALID_MANIFEST_MESSAGE);
    return false;
  }
  const entries = classified.kind === "present" ? classified.entries : [];
  if (entries.length === 0) {
    ui.showInformationMessage(
      `No modules are declared in ${MODULES_MANIFEST_DISPLAY} yet. Run "Dabbler: New Module" to declare one.`
    );
    return false;
  }
  let target;
  if (opts && opts.preselectedSlug !== void 0) {
    target = entries.find((e) => e.slug === opts.preselectedSlug);
    if (!target) {
      ui.showErrorMessage(unknownModuleMessage(opts.preselectedSlug));
      return false;
    }
  } else {
    target = await ui.pickModule(entries);
    if (!target)
      return false;
  }
  const otherSlugs = entries.map((e) => e.slug).filter((s) => s !== target.slug);
  const rawSlug = await ui.promptNewSlug(target.slug, (value) => {
    const v = (value ?? "").trim();
    if (v === target.slug)
      return void 0;
    return validateNewModuleSlug(v, otherSlugs) ?? void 0;
  });
  if (rawSlug === void 0)
    return false;
  const rawTitle = await ui.promptNewTitle(target.title);
  if (rawTitle === void 0)
    return false;
  const newSlug = rawSlug.trim();
  const newTitle = rawTitle.trim();
  const slugChanging = newSlug !== "" && newSlug !== target.slug;
  const titleChanging = newTitle !== "" && newTitle !== target.title;
  if (!slugChanging && !titleChanging) {
    ui.showInformationMessage(
      `Nothing to change \u2014 the slug and title are unchanged for "${target.slug}".`
    );
    return false;
  }
  const affected = slugChanging ? ui.readSets().filter((s) => s.root === root && s.config?.module === target.slug).map((s) => s.name).sort() : [];
  const changeLines = [];
  if (slugChanging)
    changeLines.push(`slug: ${target.slug} \u2192 ${newSlug}`);
  if (titleChanging)
    changeLines.push(`title: "${target.title}" \u2192 "${newTitle}"`);
  const restampNote = slugChanging ? affected.length > 0 ? `Restamps module: in ${affected.length} set(s): ${affected.join(", ")}.` : `No session sets are stamped module: ${target.slug} \u2014 only the manifest changes.` : "Title-only change \u2014 no session sets are touched.";
  const confirmed = await ui.confirm(
    `Rename module "${target.slug}"?`,
    `${changeLines.join("\n")}

${restampNote}

Every file is rewritten transactionally; any failure rolls the whole change back.`
  );
  if (!confirmed)
    return false;
  const result = await runRenameModule(
    root,
    {
      slug: target.slug,
      newSlug: slugChanging ? newSlug : void 0,
      newTitle: titleChanging ? newTitle : void 0
    },
    cliDeps
  );
  if (!result.ok) {
    ui.showErrorMessage(describeFailure("Rename", result));
    return false;
  }
  ui.showInformationMessage(describeRename(result.payload));
  return true;
}
function registerRenameModuleCommand(context) {
  context.subscriptions.push(
    vscode27.commands.registerCommand("dabbler.renameModule", async (arg) => {
      await runRenameModuleFlow(void 0, preselectFromTreeNode(arg));
    })
  );
}

// src/commands/deleteModule.ts
var vscode28 = __toESM(require("vscode"));
function defaultUi9() {
  return {
    pickModule: async (entries) => {
      const picked = await vscode28.window.showQuickPick(
        entries.map((e) => ({
          label: e.title,
          description: e.slug,
          entry: e
        })),
        { placeHolder: "Which module do you want to delete?", ignoreFocusOut: true }
      );
      return picked?.entry;
    },
    confirm: async (summary, detail) => {
      const choice = await vscode28.window.showWarningMessage(
        summary,
        { modal: true, detail },
        "Delete Module"
      );
      return choice === "Delete Module";
    },
    showInformationMessage: (m) => vscode28.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode28.window.showErrorMessage(m),
    workspaceRoot: () => vscode28.workspace.workspaceFolders?.[0]?.uri.fsPath
  };
}
function summarizeGroup(label, names) {
  return names.length > 0 ? `${label} (${names.length}): ${names.join(", ")}` : `${label}: none`;
}
async function runDeleteModuleFlow(ui = defaultUi9(), opts, cliDeps) {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }
  const classified = classifyModulesManifest(root);
  if (classified.kind === "invalid") {
    ui.showErrorMessage(INVALID_MANIFEST_MESSAGE);
    return false;
  }
  const entries = classified.kind === "present" ? classified.entries : [];
  if (entries.length === 0) {
    ui.showInformationMessage(
      `No modules are declared in ${MODULES_MANIFEST_DISPLAY} yet.`
    );
    return false;
  }
  let target;
  if (opts && opts.preselectedSlug !== void 0) {
    target = entries.find((e) => e.slug === opts.preselectedSlug);
    if (!target) {
      ui.showErrorMessage(unknownModuleMessage(opts.preselectedSlug));
      return false;
    }
  } else {
    target = await ui.pickModule(entries);
    if (!target)
      return false;
  }
  const classification = classifyModuleSetsForDeletion(root, target.slug);
  const toCancel = classification.filter((c3) => c3.disposition === "cancel").map((c3) => c3.name).sort();
  const toRemove = classification.filter((c3) => c3.disposition === "remove").map((c3) => c3.name).sort();
  const terminal = classification.filter((c3) => c3.disposition === "terminal").map((c3) => c3.name).sort();
  const detailLines = [
    summarizeGroup("Cancelled", toCancel),
    summarizeGroup("Removed outright", toRemove),
    summarizeGroup("Left untouched (completed / already cancelled)", terminal)
  ];
  const confirmed = await ui.confirm(
    `Delete module "${target.slug}"?`,
    `Removes the ${MODULES_MANIFEST_DISPLAY} entry.

${detailLines.join("\n")}

Re-declaring "${target.slug}" later restores this grouping for any untouched history.`
  );
  if (!confirmed)
    return false;
  const result = await runDeleteModule(root, target.slug, cliDeps);
  if (!result.ok) {
    ui.showErrorMessage(describeFailure("Delete", result));
    const cancelled = result.payload?.["cancelled"];
    const removed = result.payload?.["removed"];
    return Array.isArray(cancelled) && cancelled.length > 0 || Array.isArray(removed) && removed.length > 0;
  }
  ui.showInformationMessage(describeDelete(result.payload));
  return true;
}
function registerDeleteModuleCommand(context) {
  context.subscriptions.push(
    vscode28.commands.registerCommand("dabbler.deleteModule", async (arg) => {
      await runDeleteModuleFlow(void 0, preselectFromTreeNode(arg));
    })
  );
}

// src/commands/flagDecisionForReview.ts
var vscode29 = __toESM(require("vscode"));
var path29 = __toESM(require("path"));

// src/commands/decisionReviewQueue.ts
var fs21 = __toESM(require("fs"));
var path28 = __toESM(require("path"));
var QUEUE_FILENAME = "decision-review-queue.jsonl";
function appendQueueEntry(sessionSetDir, entry) {
  const queuePath = path28.join(sessionSetDir, QUEUE_FILENAME);
  const line = JSON.stringify(entry) + "\n";
  fs21.appendFileSync(queuePath, line, "utf8");
}
function findActiveSessionSetDir(provider) {
  const all = provider();
  const inProgress = all.filter((s) => s.state === "in-progress");
  if (inProgress.length === 0)
    return null;
  inProgress.sort((a, b2) => (b2.lastTouched ?? "").localeCompare(a.lastTouched ?? ""));
  return inProgress[0].dir;
}

// src/commands/flagDecisionForReview.ts
function registerFlagDecisionForReview(context) {
  context.subscriptions.push(
    vscode29.commands.registerCommand(
      "dabbler.flagDecisionForReview",
      async () => {
        const activeDir = findActiveSessionSetDir(readAllSessionSets);
        if (!activeDir) {
          vscode29.window.showInformationMessage(
            "No active session set to flag against. Start a session set first (its state must be 'in-progress' for the flag to attach to it)."
          );
          return;
        }
        const reason = await vscode29.window.showInputBox({
          title: "Flag Decision for Cross-Provider Review",
          prompt: "One-line reason this decision should get a second-engine read at the next session start.",
          placeHolder: "e.g. budget-tier defaulting choice \u2014 confirm with Gemini before shipping",
          ignoreFocusOut: true
        });
        if (reason === void 0)
          return;
        const trimmed2 = reason.trim();
        if (trimmed2.length === 0)
          return;
        const entry = {
          ts: (/* @__PURE__ */ new Date()).toISOString(),
          reason: trimmed2,
          source: "command",
          file: null,
          line: null
        };
        try {
          appendQueueEntry(activeDir, entry);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode29.window.showErrorMessage(
            `Failed to append to decision-review queue: ${msg}`
          );
          return;
        }
        const slug = path29.basename(activeDir);
        vscode29.window.showInformationMessage(
          `Flagged for cross-provider review in ${slug}/${QUEUE_FILENAME}. Will surface in the next session's planning checklist.`
        );
      }
    )
  );
}

// src/commands/scanAnnotationsForActiveSet.ts
var vscode30 = __toESM(require("vscode"));
var fs24 = __toESM(require("fs"));
var path31 = __toESM(require("path"));

// src/utils/annotationParser.ts
var ANNOTATION_RE = /(?:#|\/\/)\s*@dabbler:outsource-review\(\s*"((?:\\.|[^"\\\r\n])*)"\s*\)/g;
function findAnnotations(text, filePath, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
  const out = [];
  const posixPath = filePath.replace(/\\/g, "/");
  const ts = now();
  const lineStarts = [0];
  for (let i2 = 0; i2 < text.length; i2++) {
    if (text.charCodeAt(i2) === 10)
      lineStarts.push(i2 + 1);
  }
  ANNOTATION_RE.lastIndex = 0;
  let m;
  while ((m = ANNOTATION_RE.exec(text)) !== null) {
    const reason = unescapeReason(m[1]);
    if (reason.length === 0)
      continue;
    const line = offsetToLine(m.index, lineStarts);
    out.push({
      ts,
      reason,
      source: "annotation",
      file: posixPath,
      line
    });
  }
  return out;
}
function deduplicateAnnotations(incoming, existing) {
  const seen = /* @__PURE__ */ new Set();
  for (const entry of existing) {
    seen.add(keyFor(entry));
  }
  const out = [];
  for (const ann of incoming) {
    const key = keyFor(ann);
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push(ann);
  }
  return out;
}
function keyFor(entry) {
  return `${entry.file}\0${entry.line}\0${entry.reason}`;
}
function offsetToLine(offset, lineStarts) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >>> 1;
    if (lineStarts[mid] <= offset)
      lo = mid;
    else
      hi = mid - 1;
  }
  return lo + 1;
}
function unescapeReason(raw) {
  let out = "";
  for (let i2 = 0; i2 < raw.length; i2++) {
    const c3 = raw.charCodeAt(i2);
    if (c3 === 92 && i2 + 1 < raw.length) {
      const next = raw.charAt(i2 + 1);
      if (next === '"' || next === "\\") {
        out += next;
        i2++;
        continue;
      }
    }
    out += raw.charAt(i2);
  }
  return out;
}

// src/utils/yamlReadWrite.ts
var import_yaml = __toESM(require_dist());
var fs22 = __toESM(require("fs"));
function readYamlFile(filePath) {
  if (!fs22.existsSync(filePath))
    return null;
  const text = fs22.readFileSync(filePath, "utf8");
  const doc = parseDocumentFromText(text);
  return { doc, text, parseErrors: collectParseErrors(doc) };
}
function parseDocumentFromText(text) {
  return (0, import_yaml.parseDocument)(text);
}
function collectParseErrors(doc) {
  const out = [];
  for (const err of doc.errors ?? []) {
    const lc = err.linePos?.[0];
    out.push({
      message: err.message,
      line: lc?.line,
      col: lc?.col
    });
  }
  return out;
}

// src/commands/annotationScanner.ts
var fs23 = __toESM(require("fs"));
var path30 = __toESM(require("path"));
var SCAN_EXTENSIONS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "cs",
  "kt",
  "swift",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "yaml",
  "yml",
  "toml"
];
var SCAN_GLOB = `**/*.{${SCAN_EXTENSIONS.join(",")}}`;
var SCAN_EXCLUDE_GLOB = "{**/node_modules/**,**/dist/**,**/out/**,**/build/**,**/.venv/**,**/venv/**,**/__pycache__/**,**/.git/**}";
function toPosixPath(p2) {
  return p2.replace(/\\/g, "/");
}
function scanFilesForAnnotations(files, workspaceRoot2, now = () => (/* @__PURE__ */ new Date()).toISOString(), readFile = (p2) => fs23.readFileSync(p2, "utf8")) {
  const out = [];
  for (const abs of files) {
    let text;
    try {
      text = readFile(abs);
    } catch {
      continue;
    }
    const rel = toPosixPath(path30.relative(workspaceRoot2, abs));
    const anns = findAnnotations(text, rel, now);
    for (const a of anns)
      out.push(a);
  }
  return out;
}
function loadHonorAnnotationsToggle(workspaceRoot2, readYaml) {
  const candidate = path30.join(workspaceRoot2, "ai_router", "local-overrides.yaml");
  const parsed = readYaml(candidate);
  if (parsed == null)
    return true;
  const dr = parsed["decision_review"];
  if (dr == null || typeof dr !== "object")
    return true;
  const v = dr["honor_annotations"];
  if (typeof v === "boolean")
    return v;
  return true;
}
function loadExistingQueueEntries(sessionSetDir, readFile = (p2) => fs23.readFileSync(p2, "utf8")) {
  const queuePath = path30.join(sessionSetDir, QUEUE_FILENAME);
  if (!fs23.existsSync(queuePath))
    return [];
  let text;
  try {
    text = readFile(queuePath);
  } catch {
    return [];
  }
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line)
      continue;
    try {
      const obj = JSON.parse(line);
      if (typeof obj.reason === "string" && typeof obj.file === "string" && typeof obj.line === "number") {
        out.push({ file: toPosixPath(obj.file), line: obj.line, reason: obj.reason });
      }
    } catch {
    }
  }
  return out;
}

// src/commands/scanAnnotationsForActiveSet.ts
function defaultReadYaml(absPath) {
  if (!fs24.existsSync(absPath))
    return null;
  try {
    const result = readYamlFile(absPath);
    if (result === null)
      return null;
    const json = result.doc.toJSON();
    if (json == null || typeof json !== "object" || Array.isArray(json))
      return null;
    return json;
  } catch {
    return null;
  }
}
function registerScanAnnotationsForActiveSet(context) {
  context.subscriptions.push(
    vscode30.commands.registerCommand(
      "dabbler.scanAnnotationsForActiveSet",
      async () => {
        const all = readAllSessionSets();
        const activeDir = findActiveSessionSetDir(() => all);
        if (!activeDir) {
          vscode30.window.showInformationMessage(
            "No active session set to scan against. Start a session set first."
          );
          return;
        }
        const activeSet = all.find((s) => s.dir === activeDir);
        const workspaceRoot2 = activeSet?.root ?? path31.dirname(path31.dirname(activeDir));
        if (!loadHonorAnnotationsToggle(workspaceRoot2, defaultReadYaml)) {
          vscode30.window.showInformationMessage(
            "Annotation scanning is disabled for this project (local-overrides.yaml \u2192 decision_review.honor_annotations: false). No queue entries appended."
          );
          return;
        }
        const uris = await vscode30.workspace.findFiles(
          new vscode30.RelativePattern(workspaceRoot2, SCAN_GLOB),
          new vscode30.RelativePattern(workspaceRoot2, SCAN_EXCLUDE_GLOB)
        );
        const filePaths = uris.map((u) => u.fsPath);
        const annotations = scanFilesForAnnotations(
          filePaths,
          workspaceRoot2
        );
        const existing = loadExistingQueueEntries(activeDir);
        const fresh = deduplicateAnnotations(annotations, existing);
        if (fresh.length === 0) {
          const msg = annotations.length === 0 ? "No `@dabbler:outsource-review` annotations found in workspace." : `All ${annotations.length} annotation(s) already in the queue \u2014 nothing new appended.`;
          vscode30.window.showInformationMessage(msg);
          return;
        }
        try {
          for (const ann of fresh) {
            appendQueueEntry(activeDir, ann);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode30.window.showErrorMessage(
            `Failed to append annotation(s) to queue: ${msg}`
          );
          return;
        }
        const slug = path31.basename(activeDir);
        vscode30.window.showInformationMessage(
          `Appended ${fresh.length} new annotation(s) to ${slug}/${QUEUE_FILENAME}.`
        );
      }
    )
  );
}

// src/commands/regenerateNarrationTemplates.ts
var cp7 = __toESM(require("child_process"));
var fs25 = __toESM(require("fs"));
var path32 = __toESM(require("path"));
var vscode31 = __toESM(require("vscode"));
var COMMAND_ID = "dabbler.regenerateNarrationTemplates";
function registerRegenerateNarrationTemplatesCommand(context) {
  context.subscriptions.push(
    vscode31.commands.registerCommand(COMMAND_ID, async () => {
      await runRegenerate();
    })
  );
}
async function runRegenerate() {
  if (!vscode31.workspace.workspaceFolders?.length) {
    vscode31.window.showErrorMessage(
      "Open a workspace folder before running Dabbler: Regenerate Narration Templates."
    );
    return;
  }
  const allSets = readAllSessionSets();
  const inProgress = allSets.filter((s) => s.state === "in-progress");
  if (inProgress.length === 0) {
    vscode31.window.showInformationMessage(
      "No session set is in-progress. Start a session via `start_session` (or the orchestrator hook) before regenerating narration templates."
    );
    return;
  }
  const set = await pickSet(inProgress);
  if (!set)
    return;
  const pythonPath = resolvePythonInterpreter(set.root);
  const outDir = path32.join(set.dir, "narration-templates");
  fs25.mkdirSync(outDir, { recursive: true });
  const claudeOut = path32.join(outDir, "CLAUDE.md");
  const agentsOut = path32.join(outDir, "AGENTS.md");
  const render = await vscode31.window.withProgress(
    {
      location: vscode31.ProgressLocation.Notification,
      title: `Regenerating narration templates for ${set.name}\u2026`,
      cancellable: false
    },
    async (progress) => {
      progress.report({ message: "rendering CLAUDE.md\u2026" });
      const claude = renderTemplate(pythonPath, set.root, {
        kind: "claude",
        statePath: set.statePath,
        outputPath: claudeOut
      });
      if (!claude.ok)
        return { ok: false, message: claude.message };
      progress.report({ message: "rendering AGENTS.md\u2026" });
      const agents = renderTemplate(pythonPath, set.root, {
        kind: "agents",
        statePath: set.statePath,
        outputPath: agentsOut
      });
      if (!agents.ok)
        return { ok: false, message: agents.message };
      return { ok: true, message: "" };
    }
  );
  if (!render.ok) {
    vscode31.window.showErrorMessage(
      `Failed to render narration templates: ${render.message}`
    );
    return;
  }
  const relClaude = path32.relative(set.root, claudeOut).replace(/\\/g, "/");
  const relAgents = path32.relative(set.root, agentsOut).replace(/\\/g, "/");
  const COPY_ACTION = "Copy to consumer workspace\u2026";
  const OPEN_ACTION = "Open Rendered CLAUDE.md";
  const choice = await vscode31.window.showInformationMessage(
    `Narration templates regenerated for ${set.name}: ${relClaude}, ${relAgents}.`,
    OPEN_ACTION,
    COPY_ACTION
  );
  if (choice === COPY_ACTION) {
    await offerCopyToConsumerWorkspace(claudeOut, agentsOut);
  } else if (choice === OPEN_ACTION || choice === void 0) {
    try {
      const doc = await vscode31.workspace.openTextDocument(claudeOut);
      await vscode31.window.showTextDocument(doc, { preview: false });
    } catch {
    }
  }
}
async function offerCopyToConsumerWorkspace(claudeOut, agentsOut) {
  const pick2 = await vscode31.window.showQuickPick(
    [
      { label: "Copy CLAUDE.md (for Claude Code consumers)", source: claudeOut, target: "CLAUDE.md" },
      { label: "Copy AGENTS.md (for Copilot CLI consumers)", source: agentsOut, target: "AGENTS.md" }
    ],
    { placeHolder: "Which rendered template do you want to copy?" }
  );
  if (!pick2)
    return;
  const dirUri = await vscode31.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: `Choose consumer workspace folder for ${pick2.target}`
  });
  if (!dirUri || !dirUri.length)
    return;
  const destDir = dirUri[0].fsPath;
  const destPath = path32.join(destDir, pick2.target);
  if (fs25.existsSync(destPath)) {
    const overwrite = await vscode31.window.showWarningMessage(
      `${pick2.target} already exists in the chosen folder. Overwrite?`,
      { modal: true },
      "Overwrite"
    );
    if (overwrite !== "Overwrite")
      return;
  }
  try {
    fs25.copyFileSync(pick2.source, destPath);
  } catch (err) {
    vscode31.window.showErrorMessage(
      `Failed to copy ${pick2.target} to ${destDir}: ${err.message}`
    );
    return;
  }
  vscode31.window.showInformationMessage(
    `Copied ${pick2.target} to ${destDir}. The assistant will emit the session-start marker on its next launch in that workspace.`
  );
}
async function pickSet(inProgress) {
  if (inProgress.length === 1)
    return inProgress[0];
  const choices = inProgress.map((s) => ({
    label: s.name,
    description: `session ${s.liveSession?.currentSession ?? "?"} of ${s.totalSessions ?? "?"}`,
    detail: path32.relative(s.root, s.dir).replace(/\\/g, "/"),
    set: s
  }));
  const picked = await vscode31.window.showQuickPick(choices, {
    placeHolder: "Select the session set to regenerate narration templates for"
  });
  return picked?.set;
}
function renderTemplate(pythonPath, workspaceRoot2, args) {
  const cliArgs = [
    "-m",
    "ai_router.narration",
    "--kind",
    args.kind,
    "--state-file",
    args.statePath,
    "--output",
    args.outputPath
  ];
  let result;
  try {
    result = cp7.spawnSync(pythonPath, cliArgs, {
      cwd: workspaceRoot2,
      encoding: "utf8"
    });
  } catch (err) {
    return {
      ok: false,
      message: `spawn ${pythonPath} failed: ${err.message}`
    };
  }
  if (result.error) {
    return {
      ok: false,
      message: `spawn ${pythonPath} failed: ${result.error.message}`
    };
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim() || "(no stderr output)";
    if (isAiRouterNotInstalled(stderr)) {
      return { ok: false, message: describeAiRouterImportFailure(pythonPath) };
    }
    return {
      ok: false,
      message: `python -m ai_router.narration exited ${result.status}: ${stderr}`
    };
  }
  if (!fs25.existsSync(args.outputPath)) {
    return {
      ok: false,
      message: `python -m ai_router.narration exited 0 but did not write ${args.outputPath}`
    };
  }
  return { ok: true, message: args.outputPath };
}

// src/commands/resolveSetNumber.ts
var vscode32 = __toESM(require("vscode"));

// src/utils/resolveSetNumber.ts
var PREFIX_RE = /^(\d+)-/;
function numericPrefix(slug) {
  const m = PREFIX_RE.exec(slug);
  return m ? parseInt(m[1], 10) : null;
}
function resolveSetNumber(slugs, n) {
  const matches = slugs.filter((s) => numericPrefix(s) === n);
  if (matches.length === 0) {
    const available = Array.from(
      new Set(
        slugs.map(numericPrefix).filter((p2) => p2 !== null)
      )
    ).sort((a, b2) => a - b2);
    return { kind: "no-match", available };
  }
  if (matches.length > 1) {
    return { kind: "collision", matches: matches.slice().sort() };
  }
  return { kind: "match", slug: matches[0] };
}
function parseSetHandle(raw) {
  const trimmed2 = raw.trim().replace(/^set\s+/i, "");
  if (!/^\d+$/.test(trimmed2))
    return null;
  return parseInt(trimmed2, 10);
}

// src/commands/resolveSetNumber.ts
function registerResolveSetNumberCommand(context, deps = {}) {
  const readSets = deps.readSets ?? readAllSessionSets;
  context.subscriptions.push(
    vscode32.commands.registerCommand(
      "dabblerSessionSets.resolveSetNumber",
      async () => {
        const raw = await vscode32.window.showInputBox({
          title: "Resolve session set by number",
          prompt: "Enter a session-set number (e.g. 50 or 050)",
          placeHolder: "50",
          ignoreFocusOut: true,
          validateInput: (value) => value.trim() === "" || parseSetHandle(value) !== null ? void 0 : "Enter a bare number (e.g. 50). Leading zeros and a 'Set ' prefix are OK."
        });
        if (raw === void 0)
          return;
        const n = parseSetHandle(raw);
        if (n === null) {
          vscode32.window.showErrorMessage(
            `"${raw}" is not a session-set number. Enter a bare integer like 50.`
          );
          return;
        }
        const sets = readSets();
        const slugs = sets.map((s) => s.name);
        const result = resolveSetNumber(slugs, n);
        if (result.kind === "no-match") {
          const avail = result.available.length > 0 ? result.available.join(", ") : "(none)";
          vscode32.window.showErrorMessage(
            `No session set numbered ${n}. Available numbers: ${avail}.`
          );
          return;
        }
        if (result.kind === "collision") {
          vscode32.window.showErrorMessage(
            `Number ${n} is ambiguous \u2014 it matches ${result.matches.join(
              " and "
            )}. Two session sets must not share a numeric prefix; rename one.`
          );
          return;
        }
        const slug = result.slug;
        const set = sets.find((s) => s.name === slug);
        await presentActions(slug, set);
      }
    )
  );
}
async function presentActions(slug, set) {
  const actions = [
    {
      label: "$(clippy) Copy slug",
      description: slug,
      run: async () => {
        await vscode32.env.clipboard.writeText(slug);
        vscode32.window.setStatusBarMessage(`Copied: ${slug}`, 4e3);
      }
    },
    {
      label: "$(clippy) Copy \u201CStart the next session\u201D prompt",
      description: `Start the next session of \`${slug}\`.`,
      run: async () => {
        await vscode32.env.clipboard.writeText(
          `Start the next session of \`${slug}\`.`
        );
        vscode32.window.setStatusBarMessage("Copied: start next session", 4e3);
      }
    }
  ];
  if (set?.specPath) {
    actions.push({
      label: "$(go-to-file) Open spec",
      description: slug,
      run: () => void vscode32.commands.executeCommand("dabblerSessionSets.openSpec", {
        set
      })
    });
  }
  const pick2 = await vscode32.window.showQuickPick(actions, {
    title: `Set ${slug}`,
    placeHolder: "What would you like to do with this set?"
  });
  if (pick2)
    await pick2.run();
}

// src/commands/upgradeOlderSets.ts
var vscode33 = __toESM(require("vscode"));
var cp8 = __toESM(require("child_process"));
var path33 = __toESM(require("path"));
var fs26 = __toESM(require("fs"));
var BULK_UPGRADE_MODULES = [
  "ai_router.migrate_session_state",
  "ai_router.migrate_v3_to_v4"
];
var SESSION_SETS_REL2 = path33.join("docs", "session-sets");
function runMigrator2(pythonPath, module2, cwd) {
  return new Promise((resolve7) => {
    const args = [
      "-m",
      module2,
      "--scan",
      SESSION_SETS_REL2,
      "--in-place",
      "--json"
    ];
    const child = cp8.spawn(pythonPath, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let spawnErrored = false;
    const outDec = makeUtf8ChunkDecoder();
    const errDec = makeUtf8ChunkDecoder();
    child.stdout?.on("data", (c3) => stdout += outDec.write(c3));
    child.stderr?.on("data", (c3) => stderr += errDec.write(c3));
    child.on("error", (err) => {
      spawnErrored = true;
      resolve7({
        ok: false,
        module: module2,
        detail: `could not spawn Python (${err.message})`
      });
    });
    child.on("close", (code) => {
      if (spawnErrored)
        return;
      stdout += outDec.end();
      stderr += errDec.end();
      if (code === 0) {
        resolve7({ ok: true, module: module2, detail: summarizeJson(stdout) });
      } else if (isAiRouterNotInstalled(stderr)) {
        resolve7({
          ok: false,
          module: module2,
          detail: describeAiRouterImportFailure(pythonPath)
        });
      } else {
        resolve7({
          ok: false,
          module: module2,
          detail: (stderr.trim() || stdout.trim() || `exit ${code}`).slice(0, 400)
        });
      }
    });
  });
}
function summarizeJson(stdout) {
  try {
    const data = JSON.parse(stdout.trim());
    const results = Array.isArray(data?.results) ? data.results : [];
    const migrated = results.filter(
      (r2) => typeof r2?.action === "string" ? r2.action.startsWith("migrated") : false
    ).length;
    return `${migrated} migrated, ${results.length} scanned`;
  } catch {
    return "ran";
  }
}
function registerUpgradeOlderSetsCommand(context, deps) {
  context.subscriptions.push(
    vscode33.commands.registerCommand(
      "dabblerSessionSets.upgradeOlderSets",
      async () => {
        const roots = discoverRoots().filter(
          (r2) => fs26.existsSync(path33.join(r2, SESSION_SETS_REL2))
        );
        if (roots.length === 0) {
          vscode33.window.showInformationMessage(
            "No docs/session-sets directory found in the workspace \u2014 nothing to upgrade."
          );
          return;
        }
        const confirm = await vscode33.window.showInformationMessage(
          "Upgrade all older session sets to the current schema? This runs the three schema migrators in sequence, in-place, across every set. Each migrator writes a backup alongside any file it rewrites and is a no-op on already-current sets.",
          { modal: true },
          "Upgrade"
        );
        if (confirm !== "Upgrade")
          return;
        await vscode33.window.withProgress(
          {
            location: vscode33.ProgressLocation.Notification,
            title: "Upgrading older session sets\u2026",
            cancellable: false
          },
          async (progress) => {
            const failures = [];
            const summaries = [];
            for (const root of roots) {
              const pythonPath = resolvePythonInterpreter(root);
              for (const module2 of BULK_UPGRADE_MODULES) {
                progress.report({ message: `${path33.basename(root)}: ${module2}` });
                const res = await runMigrator2(pythonPath, module2, root);
                if (res.ok) {
                  summaries.push(`${module2}: ${res.detail}`);
                } else {
                  failures.push(`${module2} \u2014 ${res.detail}`);
                }
              }
            }
            deps.refreshView();
            if (failures.length === 0) {
              vscode33.window.showInformationMessage(
                `Session sets upgraded. ${summaries.join("; ")}. The tree refreshes shortly; the schema markers clear on the next read.`
              );
            } else {
              vscode33.window.showErrorMessage(
                `Bulk upgrade hit ${failures.length} error(s): ${failures.join(
                  " | "
                )}. If Python / dabbler-ai-router isn't installed, set dabblerSessionSets.pythonPath to a venv with the router, or run the migrator chain manually from the repo root.`
              );
            }
          }
        );
      }
    )
  );
}

// src/providers/WorkExplorerTreeProvider.ts
var vscode35 = __toESM(require("vscode"));

// src/providers/moduleAssembly.ts
var fs27 = __toESM(require("fs"));
var path34 = __toESM(require("path"));
var vscode34 = __toESM(require("vscode"));
function nodeModuleAssemblyIo() {
  return {
    workspaceRoots: () => (vscode34.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    classify: (root) => classifyModulesManifest(root),
    // Set 100 S1: the 093-era per-module plan-existence resolution retired
    // with the persistent `Plan` child node it fed. This probe stays — it
    // drives pseudo-module VISIBILITY (the legacy root plan keeps the
    // pseudo-module rendered even when every set is stamped).
    legacyRootPlanExists: (root) => fs27.existsSync(path34.join(root, LEGACY_ROOT_PLAN_REL)),
    rootLabel: (root) => path34.basename(root)
  };
}
var INVALID_MANIFEST_MESSAGE2 = "docs/modules.yaml is invalid (expected a YAML mapping with a modules list). Fix the file by hand; Work Explorer never overwrites it.";
function assembleVisibleModules(allSets, io, lastKnownGood) {
  const roots = new Set(io.workspaceRoots());
  for (const set of allSets)
    roots.add(set.root);
  const manifestFaults = [];
  const byRoot = Array.from(roots).map((root) => {
    const classification = io.classify(root);
    const current = computeVisibleModules(
      classification,
      allSets.filter((set) => set.root === root),
      { legacyRootPlanExists: io.legacyRootPlanExists(root) }
    );
    const selected = chooseRenderableModuleSnapshot(
      classification,
      current,
      lastKnownGood.get(root)
    );
    if (classification.kind === "invalid") {
      manifestFaults.push({
        rootLabel: io.rootLabel(root),
        message: INVALID_MANIFEST_MESSAGE2,
        retainedLastKnownGood: selected.retainedLastKnownGood
      });
    } else {
      lastKnownGood.set(root, current);
    }
    return selected.modules;
  });
  return { modules: mergeVisibleModules(byRoot), manifestFaults };
}

// src/utils/startupTiming.ts
var fs28 = __toESM(require("fs"));
var path35 = __toESM(require("path"));
var marks = {
  moduleLoadedAtUptimeMs: null,
  moduleLoadedAt: null,
  activateStart: null,
  activateEnd: null,
  treeFirstChildrenServed: null,
  treeFirstChildrenCount: null
};
try {
  marks.moduleLoadedAt = Date.now();
  marks.moduleLoadedAtUptimeMs = Math.round(process.uptime() * 1e3);
} catch {
}
function markActivateStart() {
  marks.activateStart = Date.now();
}
function markActivateEnd() {
  marks.activateEnd = Date.now();
  emitIfRequested();
}
function markFirstChildrenServed(count) {
  if (marks.treeFirstChildrenServed !== null)
    return;
  marks.treeFirstChildrenServed = Date.now();
  marks.treeFirstChildrenCount = count;
  emitIfRequested();
}
function readStartupMarks() {
  return { ...marks };
}
var delta = (from, to) => from === null || to === null ? null : to - from;
function startupDurations(m = marks) {
  return {
    activateMs: delta(m.activateStart, m.activateEnd),
    activateEndToTreeRootsMs: delta(m.activateEnd, m.treeFirstChildrenServed)
  };
}
function emitIfRequested() {
  const target = process.env.DABBLER_STARTUP_TIMING_PATH;
  if (!target)
    return;
  const payload = {
    marks: readStartupMarks(),
    durations: startupDurations(),
    note: "Host-side buckets only. First paint is NOT here \u2014 it is observed from the DOM by the Layer 3 harness, because the host cannot see when a row becomes visible."
  };
  try {
    fs28.mkdirSync(path35.dirname(target), { recursive: true });
    fs28.writeFileSync(target, JSON.stringify(payload, null, 2), { encoding: "utf-8" });
  } catch (err) {
    console.error(
      `[dabbler-ai-orchestration] startup timing: could not write DABBLER_STARTUP_TIMING_PATH (${target}) \u2014 the harness will find no file, which must NOT be read as "startup was not instrumented".`,
      err
    );
  }
}

// src/providers/WorkExplorerTreeProvider.ts
var WorkExplorerTreeProvider = class {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.onDidChangeEmitter = new vscode35.EventEmitter();
    this.onDidChangeTreeData = this.onDidChangeEmitter.event;
    /** Memoised scan for the current refresh generation; cleared by `refresh()`. */
    this.scanCache = null;
    this.modulesCache = null;
    this.supportsCache = null;
    /** Per-root last-known-good module trees, so an invalid manifest does not blank the view. */
    this.lastKnownGoodModules = /* @__PURE__ */ new Map();
    /** Parent links, populated as children are served, so `reveal()` works. */
    this.parents = /* @__PURE__ */ new WeakMap();
  }
  static {
    this.viewType = "dabblerWorkExplorerTree";
  }
  /**
   * Register the sink that renders manifest faults. Called once, by
   * `extension.ts`, immediately after `createTreeView`.
   */
  onDiagnostic(sink) {
    this.diagnostic = sink;
  }
  dispose() {
    this.onDidChangeEmitter.dispose();
  }
  /**
   * Invalidate everything and repaint. Fired by the same watcher /
   * poll pipeline that drives the webview, so both surfaces update
   * together while they coexist.
   */
  refresh() {
    this.scanCache = null;
    this.modulesCache = null;
    this.supportsCache = null;
    this.onDidChangeEmitter.fire(void 0);
  }
  getTreeItem(node) {
    return this.toTreeItem(descriptorFor(node, this.supports()), node);
  }
  getChildren(node) {
    if (!node) {
      const roots = moduleNodes(this.modules());
      markFirstChildrenServed(roots.length);
      return roots;
    }
    const children = childrenOf(node);
    for (const child of children)
      this.parents.set(child, node);
    return children;
  }
  /**
   * Required for `TreeView.reveal`. Root modules have no parent; every
   * other node's parent was recorded when it was served.
   */
  getParent(node) {
    return this.parents.get(node);
  }
  // ----- internals -----
  sets() {
    if (!this.scanCache)
      this.scanCache = readAllSessionSets();
    return this.scanCache;
  }
  modules() {
    if (!this.modulesCache) {
      const assembly = assembleVisibleModules(
        this.sets(),
        nodeModuleAssemblyIo(),
        this.lastKnownGoodModules
      );
      this.modulesCache = assembly.modules;
      this.diagnostic?.(describeManifestFaults(assembly.manifestFaults));
    }
    return this.modulesCache;
  }
  /**
   * The UAT / E2E support flags the action registry gates on. Derived
   * the same way `CustomSessionSetsView.readSupports` derives them —
   * VS Code's contextKeyService is not readable, so both surfaces
   * re-derive from configuration plus the scanned sets.
   */
  supports() {
    if (this.supportsCache)
      return this.supportsCache;
    const cfg = vscode35.workspace.getConfiguration("dabblerSessionSets");
    const uatPref = cfg.get("uatSupport.enabled", "auto");
    const e2ePref = cfg.get("e2eSupport.enabled", "auto");
    const all = this.sets();
    this.supportsCache = {
      uat: uatPref === "always" || uatPref === "auto" && all.some((s) => s.config?.requiresUAT),
      e2e: e2ePref === "always" || e2ePref === "auto" && all.some((s) => s.config?.requiresE2E)
    };
    return this.supportsCache;
  }
  toTreeItem(descriptor, node) {
    const item = new vscode35.TreeItem(
      descriptor.label,
      descriptor.collapsible === "collapsed" ? vscode35.TreeItemCollapsibleState.Collapsed : vscode35.TreeItemCollapsibleState.None
    );
    item.id = descriptor.id;
    item.description = descriptor.description;
    item.contextValue = descriptor.contextValue;
    if (descriptor.tooltip !== void 0) {
      const md = new vscode35.MarkdownString(descriptor.tooltip, true);
      item.tooltip = md;
    }
    if (descriptor.icon)
      item.iconPath = this.toIconPath(descriptor.icon);
    if (node.kind === "set") {
      item.command = {
        command: "dabblerWorkExplorer.activateSet",
        title: "Open Spec",
        arguments: [node]
      };
    }
    if (node.kind === "session") {
      item.command = {
        command: "dabblerWorkExplorer.activateSession",
        title: "Open Session Plan",
        arguments: [node]
      };
    }
    return item;
  }
  toIconPath(icon) {
    if (icon.kind === "theme") {
      return icon.color ? new vscode35.ThemeIcon(icon.id, new vscode35.ThemeColor(icon.color)) : new vscode35.ThemeIcon(icon.id);
    }
    return {
      light: vscode35.Uri.joinPath(this.extensionUri, "media", "light", icon.slug),
      dark: vscode35.Uri.joinPath(this.extensionUri, "media", "dark", icon.slug)
    };
  }
};
function describeManifestFaults(faults) {
  if (faults.length === 0)
    return void 0;
  return faults.map((fault) => {
    const shown = fault.retainedLastKnownGood ? "Showing the last-known-good module tree." : "No prior valid module tree is available; showing recoverable fallback groups.";
    return `${fault.rootLabel}: ${fault.message} ${shown}`;
  }).join("  ");
}

// src/extension.ts
var SESSION_SETS_REL3 = path36.join("docs", "session-sets");
function evaluateSupportContextKeys(allSets) {
  const cfg = vscode36.workspace.getConfiguration("dabblerSessionSets");
  const uatPref = cfg.get("uatSupport.enabled", "auto");
  const e2ePref = cfg.get("e2eSupport.enabled", "auto");
  const anyUat = allSets.some((s) => s.config?.requiresUAT);
  const anyE2e = allSets.some((s) => s.config?.requiresE2E);
  const uatActive = uatPref === "always" || uatPref === "auto" && anyUat;
  const e2eActive = e2ePref === "always" || e2ePref === "auto" && anyE2e;
  vscode36.commands.executeCommand("setContext", "dabblerSessionSets.uatSupportActive", uatActive);
  vscode36.commands.executeCommand("setContext", "dabblerSessionSets.e2eSupportActive", e2eActive);
  vscode36.commands.executeCommand(
    "setContext",
    "dabblerSessionSets.hasSubCurrentSets",
    hasSubCurrentSets(allSets)
  );
}
function activate(context) {
  markActivateStart();
  const treeProvider = new WorkExplorerTreeProvider(context.extensionUri);
  context.subscriptions.push({ dispose: () => treeProvider.dispose() });
  const treeView = vscode36.window.createTreeView(WorkExplorerTreeProvider.viewType, {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(treeView);
  treeProvider.onDiagnostic((message) => {
    treeView.message = message;
  });
  const evaluateContextKeys = () => {
    const allSets = readAllSessionSets();
    evaluateSupportContextKeys(allSets);
  };
  try {
    evaluateContextKeys();
  } catch (err) {
    console.error(
      "[dabbler-ai-orchestration] activation: evaluateContextKeys() threw \u2014 context keys (UAT/E2E support flags) may be stale, but command registration continues. Investigate via the dev console stack trace.",
      err
    );
  }
  context.subscriptions.push(
    vscode36.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("dabblerSessionSets.uatSupport.enabled") || e.affectsConfiguration("dabblerSessionSets.e2eSupport.enabled")) {
        evaluateContextKeys();
      }
    })
  );
  let watcherSubs = [];
  let boundRoots = /* @__PURE__ */ new Set();
  function bindWatchers() {
    const roots = discoverRoots();
    const want = new Set(roots.map((r2) => r2.toLowerCase()));
    if (want.size === boundRoots.size && [...want].every((r2) => boundRoots.has(r2))) {
      return;
    }
    for (const sub of watcherSubs)
      sub.dispose();
    watcherSubs = [];
    boundRoots = want;
    for (const root of roots) {
      const sessionSetsAbs = path36.join(root, SESSION_SETS_REL3);
      const pattern = new vscode36.RelativePattern(
        sessionSetsAbs,
        "**/{spec.md,session-state.json,session-events.jsonl,activity-log.json,change-log.md,CANCELLED.md,*-uat-checklist.json,close-obligations.json}"
      );
      const watcher = vscode36.workspace.createFileSystemWatcher(pattern);
      const onEvent = () => {
        treeProvider.refresh();
      };
      watcher.onDidCreate(onEvent);
      watcher.onDidDelete(onEvent);
      watcher.onDidChange(onEvent);
      watcherSubs.push(watcher);
      context.subscriptions.push(watcher);
      const gsPattern = new vscode36.RelativePattern(
        root,
        "{docs/modules.yaml,docs/planning/project-plan.md}"
      );
      const gsWatcher = vscode36.workspace.createFileSystemWatcher(gsPattern);
      gsWatcher.onDidCreate(onEvent);
      gsWatcher.onDidDelete(onEvent);
      gsWatcher.onDidChange(onEvent);
      watcherSubs.push(gsWatcher);
      context.subscriptions.push(gsWatcher);
    }
  }
  const refreshAll = () => {
    bindWatchers();
    treeProvider.refresh();
    setImmediate(evaluateContextKeys);
  };
  try {
    bindWatchers();
  } catch (err) {
    console.error(
      "[dabbler-ai-orchestration] activation: bindWatchers() threw \u2014 live tree-refresh on file changes may not work, but command registration continues. Manual refresh via `Dabbler: Refresh Session Sets` still functions.",
      err
    );
  }
  context.subscriptions.push(vscode36.workspace.onDidChangeWorkspaceFolders(refreshAll));
  const pollHandle = setInterval(refreshAll, 3e4);
  context.subscriptions.push({ dispose: () => clearInterval(pollHandle) });
  context.subscriptions.push(
    vscode36.commands.registerCommand("dabblerSessionSets.refresh", refreshAll)
  );
  const safeRegister = (name, fn) => {
    try {
      fn();
    } catch (err) {
      console.error(
        `[dabbler-ai-orchestration] activation failed in ${name} \u2014 subsequent commands still attempt to register; the failed group's commands will not be available until the underlying error is fixed.`,
        err
      );
    }
  };
  safeRegister(
    "registerWorkExplorerTreeCommands",
    () => registerWorkExplorerTreeCommands(context)
  );
  safeRegister("registerOpenFileCommands", () => registerOpenFileCommands(context));
  safeRegister("registerCopyCommands", () => registerCopyCommands(context));
  safeRegister("registerCopyPromptCommands", () => registerCopyPromptCommands(context));
  safeRegister("registerGitScaffoldCommand", () => registerGitScaffoldCommand(context));
  safeRegister(
    "registerTrySampleProjectCommand",
    () => registerTrySampleProjectCommand(context)
  );
  safeRegister("registerGitWorkflowCommands", () => registerGitWorkflowCommands(context));
  safeRegister("registerGitReleaseCommands", () => registerGitReleaseCommands(context));
  safeRegister("registerTroubleshootCommand", () => registerTroubleshootCommand(context));
  safeRegister("registerGetStartedCommand", () => registerGetStartedCommand(context));
  safeRegister(
    "registerOpenModulePlanCommand",
    () => registerOpenModulePlanCommand(context)
  );
  safeRegister("registerNewModuleCommand", () => registerNewModuleCommand(context));
  safeRegister(
    "registerOpenModulesManifestCommand",
    () => registerOpenModulesManifestCommand(context)
  );
  safeRegister(
    "registerCopyModuleDecompositionPromptCommand",
    () => registerCopyModuleDecompositionPromptCommand(context)
  );
  safeRegister(
    "registerAssignLegacySetsCommand",
    () => registerAssignLegacySetsCommand(context)
  );
  safeRegister(
    "registerRenameModuleCommand",
    () => registerRenameModuleCommand(context)
  );
  safeRegister(
    "registerDeleteModuleCommand",
    () => registerDeleteModuleCommand(context)
  );
  safeRegister(
    "registerCancelLifecycleCommands",
    () => registerCancelLifecycleCommands(context, { refreshView: refreshAll })
  );
  safeRegister(
    "registerInstallAiRouterCommands",
    () => registerInstallAiRouterCommands(context)
  );
  safeRegister(
    "registerCopilotSeatSetupCommand",
    () => registerCopilotSeatSetupCommand(context)
  );
  safeRegister(
    "registerFlagDecisionForReview",
    () => registerFlagDecisionForReview(context)
  );
  safeRegister(
    "registerScanAnnotationsForActiveSet",
    () => registerScanAnnotationsForActiveSet(context)
  );
  safeRegister(
    "registerMigrateSetCommand",
    () => registerMigrateSetCommand(context, { refreshView: refreshAll })
  );
  safeRegister(
    "registerMigrateSetV4Command",
    () => registerMigrateSetV4Command(context, { refreshView: refreshAll })
  );
  safeRegister(
    "registerRegenerateNarrationTemplates",
    () => registerRegenerateNarrationTemplatesCommand(context)
  );
  safeRegister(
    "registerResolveSetNumberCommand",
    () => registerResolveSetNumberCommand(context)
  );
  safeRegister(
    "registerUpgradeOlderSetsCommand",
    () => registerUpgradeOlderSetsCommand(context, { refreshView: refreshAll })
  );
  const hasSeenOnboarding = context.workspaceState.get("hasSeenOnboarding", false);
  if (!hasSeenOnboarding && (vscode36.workspace.workspaceFolders?.length ?? 0) > 0) {
    const roots = discoverRoots();
    const hasSessionSets = roots.some((r2) => {
      try {
        return fs29.existsSync(path36.join(r2, SESSION_SETS_REL3));
      } catch {
        return false;
      }
    });
    if (!hasSessionSets) {
      context.workspaceState.update("hasSeenOnboarding", true);
      vscode36.commands.executeCommand("dabbler.getStarted");
    }
  }
  markActivateEnd();
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
