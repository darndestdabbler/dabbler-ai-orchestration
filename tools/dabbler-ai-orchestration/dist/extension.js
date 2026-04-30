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
        return parse(val);
      } else if (type === "number" && isFinite(val)) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse(str) {
      str = String(str);
      if (str.length > 100) {
        return;
      }
      var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str
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
    function setup(env4) {
      createDebug.debug = createDebug;
      createDebug.default = createDebug;
      createDebug.coerce = coerce;
      createDebug.disable = disable;
      createDebug.enable = enable;
      createDebug.enabled = enabled;
      createDebug.humanize = require_ms();
      createDebug.destroy = destroy;
      Object.keys(env4).forEach((key) => {
        createDebug[key] = env4[key];
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
    var os = require("os");
    var tty = require("tty");
    var hasFlag = require_has_flag();
    var { env: env4 } = process;
    var forceColor;
    if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
      forceColor = 0;
    } else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
      forceColor = 1;
    }
    if ("FORCE_COLOR" in env4) {
      if (env4.FORCE_COLOR === "true") {
        forceColor = 1;
      } else if (env4.FORCE_COLOR === "false") {
        forceColor = 0;
      } else {
        forceColor = env4.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env4.FORCE_COLOR, 10), 3);
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
      if (env4.TERM === "dumb") {
        return min;
      }
      if (process.platform === "win32") {
        const osRelease = os.release().split(".");
        if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
          return Number(osRelease[2]) >= 14931 ? 3 : 2;
        }
        return 1;
      }
      if ("CI" in env4) {
        if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((sign) => sign in env4) || env4.CI_NAME === "codeship") {
          return 1;
        }
        return min;
      }
      if ("TEAMCITY_VERSION" in env4) {
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env4.TEAMCITY_VERSION) ? 1 : 0;
      }
      if (env4.COLORTERM === "truecolor") {
        return 3;
      }
      if ("TERM_PROGRAM" in env4) {
        const version = parseInt((env4.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (env4.TERM_PROGRAM) {
          case "iTerm.app":
            return version >= 3 ? 3 : 2;
          case "Apple_Terminal":
            return 2;
        }
      }
      if (/-256(color)?$/i.test(env4.TERM)) {
        return 2;
      }
      if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env4.TERM)) {
        return 1;
      }
      if ("COLORTERM" in env4) {
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
      return util.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
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
    function check(path13, isFile, isDirectory) {
      log(`checking %s`, path13);
      try {
        const stat = fs_1.statSync(path13);
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
    function exists2(path13, type = exports2.READABLE) {
      return check(path13, (type & exports2.FILE) > 0, (type & exports2.FOLDER) > 0);
    }
    exports2.exists = exists2;
    exports2.FILE = 1;
    exports2.FOLDER = 2;
    exports2.READABLE = exports2.FILE + exports2.FOLDER;
  }
});

// node_modules/@kwsites/file-exists/dist/index.js
var require_dist = __commonJS({
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
var require_dist2 = __commonJS({
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
var vscode14 = __toESM(require("vscode"));
var fs10 = __toESM(require("fs"));
var path12 = __toESM(require("path"));

// src/providers/SessionSetsProvider.ts
var vscode2 = __toESM(require("vscode"));
var path3 = __toESM(require("path"));

// src/utils/fileSystem.ts
var vscode = __toESM(require("vscode"));
var fs = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// src/utils/git.ts
var cp = __toESM(require("child_process"));
var path = __toESM(require("path"));
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
        paths.push(path.resolve(wt));
    }
  }
  return paths;
}

// src/utils/fileSystem.ts
var SESSION_SETS_REL = path2.join("docs", "session-sets");
var PLAYWRIGHT_REL_DEFAULT = "tests";
var STATE_RANK = {
  done: 2,
  "in-progress": 1,
  "not-started": 0
};
function discoverRoots() {
  const seen = /* @__PURE__ */ new Map();
  const order = [];
  const add = (p2) => {
    if (!p2)
      return;
    const canonical = path2.resolve(p2);
    const key = canonical.toLowerCase();
    if (seen.has(key) || !fs.existsSync(canonical))
      return;
    seen.set(key, canonical);
    order.push(canonical);
  };
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    add(folder.uri.fsPath);
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    for (const wt of listGitWorktrees(folder.uri.fsPath)) {
      add(wt);
    }
  }
  return order;
}
function parseSessionSetConfig(specPath) {
  const config = { requiresUAT: false, requiresE2E: false, uatScope: "none" };
  if (!fs.existsSync(specPath))
    return config;
  let text;
  try {
    text = fs.readFileSync(specPath, "utf8");
  } catch {
    return config;
  }
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i
  );
  const block = headingMatch ? headingMatch[1] : text.slice(0, 4e3);
  const flagRe = (key) => new RegExp(`^\\s*${key}\\s*:\\s*(true|false)\\s*$`, "im");
  const stringRe = (key) => new RegExp(`^\\s*${key}\\s*:\\s*([\\w-]+)\\s*$`, "im");
  const uat = block.match(flagRe("requiresUAT"));
  if (uat)
    config.requiresUAT = uat[1].toLowerCase() === "true";
  const e2e = block.match(flagRe("requiresE2E"));
  if (e2e)
    config.requiresE2E = e2e[1].toLowerCase() === "true";
  const scope = block.match(stringRe("uatScope"));
  if (scope)
    config.uatScope = scope[1];
  return config;
}
function parseUatChecklist(checklistPath) {
  if (!fs.existsSync(checklistPath))
    return null;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(checklistPath, "utf8"));
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
    if (r2 === "" || r2 === null || /^pending$/i.test(String(r2)))
      pending++;
    const ref = it["E2ETestReference"] || it["e2eTestReference"];
    if (ref)
      e2eRefs.add(String(ref));
  }
  return { totalItems: items.length, pendingItems: pending, e2eRefs: Array.from(e2eRefs) };
}
function readSessionSets(root) {
  const sessionSetsDir = path2.join(root, SESSION_SETS_REL);
  if (!fs.existsSync(sessionSetsDir))
    return [];
  const entries = fs.readdirSync(sessionSetsDir, { withFileTypes: true });
  const sets = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_"))
      continue;
    const dir = path2.join(sessionSetsDir, entry.name);
    const specPath = path2.join(dir, "spec.md");
    if (!fs.existsSync(specPath))
      continue;
    const activityPath = path2.join(dir, "activity-log.json");
    const changeLogPath = path2.join(dir, "change-log.md");
    const statePath = path2.join(dir, "session-state.json");
    const aiAssignmentPath = path2.join(dir, "ai-assignment.md");
    const uatChecklistPath = path2.join(dir, `${entry.name}-uat-checklist.json`);
    let state;
    if (fs.existsSync(changeLogPath))
      state = "done";
    else if (fs.existsSync(activityPath) || fs.existsSync(statePath))
      state = "in-progress";
    else
      state = "not-started";
    let totalSessions = null;
    let sessionsCompleted = 0;
    let lastTouched = null;
    let liveSession = null;
    if (fs.existsSync(activityPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(activityPath, "utf8"));
        if (typeof data.totalSessions === "number")
          totalSessions = data.totalSessions;
        const completedSet = /* @__PURE__ */ new Set();
        for (const e of data.entries ?? []) {
          if (typeof e.sessionNumber === "number")
            completedSet.add(e.sessionNumber);
          if (e.dateTime && (!lastTouched || e.dateTime > lastTouched))
            lastTouched = e.dateTime;
        }
        sessionsCompleted = completedSet.size;
      } catch {
      }
    }
    if (fs.existsSync(statePath)) {
      try {
        const sd = JSON.parse(fs.readFileSync(statePath, "utf8"));
        if (totalSessions === null && typeof sd.totalSessions === "number") {
          totalSessions = sd.totalSessions;
        }
        const stateTouched = sd.completedAt || sd.startedAt;
        if (stateTouched && (!lastTouched || stateTouched > lastTouched))
          lastTouched = stateTouched;
        liveSession = {
          currentSession: sd.currentSession ?? null,
          status: sd.status ?? null,
          orchestrator: sd.orchestrator ?? null,
          startedAt: sd.startedAt ?? null,
          completedAt: sd.completedAt ?? null,
          verificationVerdict: sd.verificationVerdict ?? null
        };
      } catch {
      }
    }
    const config = parseSessionSetConfig(specPath);
    const uatSummary = config.requiresUAT ? parseUatChecklist(uatChecklistPath) : null;
    sets.push({
      name: entry.name,
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
      root
    });
  }
  return sets;
}
function readAllSessionSets() {
  const merged = /* @__PURE__ */ new Map();
  for (const root of discoverRoots()) {
    for (const set of readSessionSets(root)) {
      const prior = merged.get(set.name);
      if (!prior) {
        merged.set(set.name, set);
        continue;
      }
      const newRank = STATE_RANK[set.state] ?? -1;
      const priorRank = STATE_RANK[prior.state] ?? -1;
      if (newRank > priorRank) {
        merged.set(set.name, set);
      } else if (newRank === priorRank) {
        if ((set.lastTouched || "") > (prior.lastTouched || ""))
          merged.set(set.name, set);
      }
    }
  }
  return Array.from(merged.values());
}

// src/providers/SessionSetsProvider.ts
var ICON_FILES = {
  done: "done.svg",
  "in-progress": "in-progress.svg",
  "not-started": "not-started.svg"
};
function iconUriFor(extensionUri, state) {
  const file = ICON_FILES[state];
  return file ? vscode2.Uri.joinPath(extensionUri, "media", file) : void 0;
}
function progressText(set) {
  if (set.state === "done") {
    return set.sessionsCompleted > 0 ? `${set.sessionsCompleted}/${set.sessionsCompleted}` : "";
  }
  if (set.totalSessions && set.totalSessions > 0) {
    return `${set.sessionsCompleted}/${set.totalSessions}`;
  }
  return set.sessionsCompleted > 0 ? `${set.sessionsCompleted} done` : "";
}
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
function liveSessionTooltipLines(set) {
  if (!set.liveSession)
    return [];
  const ls = set.liveSession;
  const lines = [];
  if (typeof ls.currentSession === "number") {
    const total = set.totalSessions ? `/${set.totalSessions}` : "";
    const status = ls.status ? ` (${ls.status})` : "";
    lines.push(`Session: ${ls.currentSession}${total}${status}`);
  }
  if (ls.orchestrator) {
    const o2 = ls.orchestrator;
    const parts = [o2.engine, o2.model].filter(Boolean).join(" \xB7 ");
    const effort = o2.effort && o2.effort !== "unknown" ? ` @ effort=${o2.effort}` : "";
    if (parts)
      lines.push(`Orchestrator: ${parts}${effort}`);
  }
  if (ls.verificationVerdict) {
    lines.push(`Verifier: ${ls.verificationVerdict}`);
  }
  return lines;
}
function configTooltipLines(set) {
  if (!set.config)
    return [];
  const flags = [];
  if (set.config.requiresUAT)
    flags.push("UAT");
  if (set.config.requiresE2E)
    flags.push("E2E");
  const lines = [];
  lines.push(`Gates: ${flags.length ? flags.join(" + ") : "none"}`);
  if (set.config.requiresUAT && set.uatSummary) {
    const u = set.uatSummary;
    if (u.totalItems > 0) {
      lines.push(`UAT items: ${u.pendingItems} pending / ${u.totalItems} total`);
    } else {
      lines.push("UAT checklist: not yet authored");
    }
  }
  return lines;
}
function folderTooltip(set) {
  const roots = discoverRoots();
  const rel = path3.relative(set.root, set.dir);
  return roots.length > 1 ? `${path3.basename(set.root)} / ${rel}` : rel;
}
function contextValueFor(set) {
  const parts = [`sessionSet:${set.state}`];
  if (set.config?.requiresUAT)
    parts.push("uat");
  if (set.config?.requiresE2E)
    parts.push("e2e");
  return parts.join(":");
}
var SessionSetsProvider = class {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this._onDidChangeTreeData = new vscode2.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._cache = null;
  }
  refresh() {
    this._cache = null;
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (!vscode2.workspace.workspaceFolders?.length)
      return [];
    if (!this._cache) {
      this._cache = readAllSessionSets();
    }
    const all = this._cache;
    if (!element) {
      const inProgress = all.filter((s) => s.state === "in-progress");
      const notStarted = all.filter((s) => s.state === "not-started");
      const done = all.filter((s) => s.state === "done");
      return [
        this.makeGroup("In Progress", "in-progress", inProgress.length),
        this.makeGroup("Not Started", "not-started", notStarted.length),
        this.makeGroup("Done", "done", done.length)
      ];
    }
    const group = element;
    if (group.contextValue === "group") {
      const subset = all.filter((s) => s.state === group.groupKey);
      if (group.groupKey === "in-progress" || group.groupKey === "done") {
        subset.sort(
          (a, b2) => (b2.lastTouched || "").localeCompare(a.lastTouched || "")
        );
      } else {
        subset.sort((a, b2) => a.name.localeCompare(b2.name));
      }
      return subset.map((s) => this.makeSetItem(s));
    }
    return [];
  }
  makeGroup(label, groupKey, count) {
    const item = new vscode2.TreeItem(
      `${label}  (${count})`,
      count > 0 ? vscode2.TreeItemCollapsibleState.Expanded : vscode2.TreeItemCollapsibleState.Collapsed
    );
    item.iconPath = iconUriFor(this.extensionUri, groupKey);
    item.contextValue = "group";
    item.groupKey = groupKey;
    return item;
  }
  makeSetItem(set) {
    const item = new vscode2.TreeItem(
      set.name,
      vscode2.TreeItemCollapsibleState.None
    );
    const bits = [progressText(set), touchedDate(set), uatBadge(set)].filter(Boolean);
    item.description = bits.join("  \xB7  ");
    item.tooltip = new vscode2.MarkdownString(
      [
        `**${set.name}**`,
        `State: ${set.state}`,
        bits.length ? `Progress: ${bits.join(" \xB7 ")}` : null,
        ...configTooltipLines(set),
        ...liveSessionTooltipLines(set),
        `Folder: \`${folderTooltip(set)}\``
      ].filter(Boolean).join("\n\n")
    );
    item.contextValue = contextValueFor(set);
    item.set = set;
    item.iconPath = iconUriFor(this.extensionUri, set.state);
    item.command = {
      command: "dabblerSessionSets.openSpec",
      title: "Open Spec",
      arguments: [item]
    };
    return item;
  }
};

// src/providers/ProviderQueuesProvider.ts
var vscode4 = __toESM(require("vscode"));

// src/utils/pythonRunner.ts
var cp2 = __toESM(require("child_process"));
var path4 = __toESM(require("path"));
var vscode3 = __toESM(require("vscode"));
function resolvePythonPath(workspaceRoot2, settingKey) {
  const dotIndex = settingKey.indexOf(".");
  if (dotIndex < 0)
    return "python";
  const section = settingKey.slice(0, dotIndex);
  const key = settingKey.slice(dotIndex + 1);
  const cfg = vscode3.workspace.getConfiguration(section);
  const raw = (cfg.get(key) ?? "python").trim();
  if (!raw)
    return "python";
  if (path4.isAbsolute(raw))
    return raw;
  if (raw.includes(path4.sep) || raw.includes("/")) {
    return path4.resolve(workspaceRoot2, raw);
  }
  return raw;
}
function runPythonModule(opts) {
  const exe = resolvePythonPath(opts.cwd, opts.pythonPathSetting);
  const timeoutMs = opts.timeoutMs ?? 1e4;
  return new Promise((resolve4) => {
    const child = cp2.spawn(exe, ["-m", opts.module, ...opts.args], {
      cwd: opts.cwd,
      env: process.env,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve4({
        stdout,
        stderr: stderr + (stderr ? "\n" : "") + `spawn error: ${err.message}`,
        exitCode: null,
        signal: null,
        timedOut
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve4({ stdout, stderr, exitCode: code, signal, timedOut });
    });
  });
}

// src/providers/ProviderQueuesProvider.ts
var QUEUE_STATES = ["new", "claimed", "completed", "failed", "timed_out"];
var CACHE_TTL_MS = 5e3;
var STATE_ICONS = {
  new: "circle-large-outline",
  claimed: "sync",
  completed: "pass",
  failed: "error",
  timed_out: "watch"
};
var STATE_LABELS = {
  new: "new",
  claimed: "claimed",
  completed: "completed",
  failed: "failed",
  timed_out: "timed_out"
};
var ProviderQueuesProvider = class {
  constructor(deps) {
    this.deps = deps;
    this._onDidChangeTreeData = new vscode4.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._cache = null;
    this._lastError = null;
    this._inFlight = null;
  }
  refresh() {
    this._cache = null;
    this._onDidChangeTreeData.fire();
  }
  /** Test-only — inject a payload directly and skip the spawn path. */
  _setPayloadForTest(payload) {
    this._cache = { fetchedAt: this.deps.now?.() ?? Date.now(), payload };
    this._lastError = null;
  }
  // ---------- TreeDataProvider ----------
  getTreeItem(element) {
    return buildTreeItem(element);
  }
  async getChildren(element) {
    const root = this.deps.getWorkspaceRoot();
    if (!root) {
      return [
        { kind: "info", label: "No workspace folder open." }
      ];
    }
    if (!element || element.kind === "root") {
      const payload = await this._getPayload(root);
      if (!payload) {
        const detail = this._lastError ?? "Unknown error.";
        return [
          { kind: "info", label: "Failed to read queue status.", detail, isError: true }
        ];
      }
      const providers = Object.keys(payload.providers).sort();
      if (providers.length === 0) {
        return [
          {
            kind: "info",
            label: "No provider queues found.",
            detail: "Looked for queue.db files under provider-queues/. Run a session that routes work to populate this view."
          }
        ];
      }
      return providers.map((p2) => ({
        kind: "provider",
        provider: p2,
        info: payload.providers[p2]
      }));
    }
    if (element.kind === "provider") {
      if (!element.info.queue_present) {
        return [
          {
            kind: "info",
            label: "queue.db not present",
            detail: element.info.queue_path
          }
        ];
      }
      return QUEUE_STATES.map((state) => {
        const count = element.info.states[state] ?? 0;
        const messages = element.info.messages.filter((m) => m.state === state);
        return {
          kind: "stateGroup",
          provider: element.provider,
          state,
          count,
          messages
        };
      });
    }
    if (element.kind === "stateGroup") {
      const items = element.messages.map((m) => ({
        kind: "message",
        provider: element.provider,
        message: m
      }));
      if (element.count > element.messages.length) {
        items.push({
          kind: "info",
          label: `\u2026 ${element.count - element.messages.length} more not shown`,
          detail: "Increase dabblerProviderQueues.messageLimit to see more."
        });
      }
      return items;
    }
    return [];
  }
  // ---------- internals ----------
  async _getPayload(root) {
    const now = this.deps.now?.() ?? Date.now();
    if (this._cache && now - this._cache.fetchedAt < CACHE_TTL_MS) {
      return this._cache.payload;
    }
    if (this._inFlight) {
      await this._inFlight;
      return this._cache?.payload ?? null;
    }
    const fetcher = this.deps.fetchPayload ?? defaultFetchPayload;
    this._inFlight = (async () => {
      const result = await fetcher(root);
      if (result.ok) {
        this._cache = { fetchedAt: this.deps.now?.() ?? Date.now(), payload: result.payload };
        this._lastError = null;
      } else {
        this._lastError = result.message;
      }
    })();
    try {
      await this._inFlight;
    } finally {
      this._inFlight = null;
    }
    return this._cache?.payload ?? null;
  }
};
function buildTreeItem(node) {
  switch (node.kind) {
    case "root": {
      const item = new vscode4.TreeItem("Provider Queues", vscode4.TreeItemCollapsibleState.Expanded);
      item.contextValue = "queueRoot";
      return item;
    }
    case "provider": {
      const item = new vscode4.TreeItem(
        node.provider,
        vscode4.TreeItemCollapsibleState.Expanded
      );
      const totals = node.info.states;
      const total = QUEUE_STATES.reduce((acc, s) => acc + (totals[s] ?? 0), 0);
      const claimed = totals.claimed ?? 0;
      const failed = totals.failed ?? 0;
      const timedOut = totals.timed_out ?? 0;
      const bits = [`${total} msgs`];
      if (claimed > 0)
        bits.push(`${claimed} claimed`);
      if (failed > 0)
        bits.push(`${failed} failed`);
      if (timedOut > 0)
        bits.push(`${timedOut} timed_out`);
      item.description = bits.join("  \xB7  ");
      item.iconPath = node.info.queue_present ? new vscode4.ThemeIcon("database") : new vscode4.ThemeIcon("circle-slash");
      item.tooltip = new vscode4.MarkdownString(
        [
          `**${node.provider}**`,
          `Queue: \`${node.info.queue_path}\``,
          node.info.queue_present ? null : "_queue.db not yet created_"
        ].filter(Boolean).join("\n\n")
      );
      item.contextValue = `queueProvider:${node.info.queue_present ? "present" : "absent"}`;
      return item;
    }
    case "stateGroup": {
      const collapsible = node.count > 0 && node.state !== "completed" ? vscode4.TreeItemCollapsibleState.Expanded : node.count > 0 ? vscode4.TreeItemCollapsibleState.Collapsed : vscode4.TreeItemCollapsibleState.None;
      const item = new vscode4.TreeItem(
        `${STATE_LABELS[node.state]} (${node.count})`,
        collapsible
      );
      item.iconPath = new vscode4.ThemeIcon(STATE_ICONS[node.state]);
      item.contextValue = `queueState:${node.state}`;
      return item;
    }
    case "message": {
      const m = node.message;
      const idShort = m.id.length > 8 ? m.id.slice(0, 8) : m.id;
      const ss = m.session_set ?? "-";
      const sn = m.session_number ?? "-";
      const item = new vscode4.TreeItem(
        `${idShort}  \xB7  ${m.task_type}`,
        vscode4.TreeItemCollapsibleState.None
      );
      const descBits = [`${ss}/${sn}`];
      if (m.claimed_by)
        descBits.push(`by=${m.claimed_by}`);
      if (m.attempts > 0)
        descBits.push(`try ${m.attempts}/${m.max_attempts}`);
      item.description = descBits.join("  \xB7  ");
      item.iconPath = new vscode4.ThemeIcon(STATE_ICONS[m.state]);
      item.tooltip = buildMessageTooltip(node.provider, m);
      item.contextValue = `queueMessage:${m.state}`;
      item.command = {
        command: "dabblerProviderQueues.openPayload",
        title: "Open Payload",
        arguments: [node]
      };
      return item;
    }
    case "info": {
      const item = new vscode4.TreeItem(node.label, vscode4.TreeItemCollapsibleState.None);
      item.description = node.detail;
      item.tooltip = node.detail ? new vscode4.MarkdownString(node.detail) : void 0;
      item.iconPath = new vscode4.ThemeIcon(node.isError ? "warning" : "info");
      item.contextValue = node.isError ? "queueInfo:error" : "queueInfo";
      return item;
    }
  }
}
function buildMessageTooltip(provider, m) {
  const lines = [
    `**${m.task_type}** \xB7 ${m.state}`,
    `Provider: ${provider}`,
    `ID: \`${m.id}\``,
    `Session set: ${m.session_set ?? "\u2014"} / session ${m.session_number ?? "\u2014"}`,
    `From provider: ${m.from_provider}`,
    `Enqueued: ${m.enqueued_at}`,
    `Attempts: ${m.attempts} / ${m.max_attempts}`
  ];
  if (m.claimed_by)
    lines.push(`Claimed by: ${m.claimed_by}`);
  if (m.lease_expires_at)
    lines.push(`Lease expires: ${m.lease_expires_at}`);
  if (m.completed_at)
    lines.push(`Completed: ${m.completed_at}`);
  return new vscode4.MarkdownString(lines.join("\n\n"));
}
async function defaultFetchPayload(workspaceRoot2) {
  const cfg = vscode4.workspace.getConfiguration("dabblerProviderQueues");
  const limit = cfg.get("messageLimit", 50);
  const result = await runPythonModule({
    cwd: workspaceRoot2,
    module: "ai_router.queue_status",
    args: ["--format", "json", "--limit", String(limit)],
    pythonPathSetting: "dabblerProviderQueues.pythonPath"
  });
  return parseFetchResult(result);
}
function parseFetchResult(result) {
  if (result.timedOut) {
    return { ok: false, message: "queue_status timed out (10s)" };
  }
  if (result.exitCode !== 0) {
    const trimmed2 = (result.stderr || result.stdout).trim();
    const detail = trimmed2 ? ` \u2014 ${trimmed2.split("\n").slice(-3).join(" / ")}` : "";
    return {
      ok: false,
      message: `queue_status exited ${result.exitCode}${detail}`
    };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    if (!parsed || typeof parsed !== "object" || !parsed.providers) {
      return { ok: false, message: "queue_status returned malformed JSON (missing 'providers')" };
    }
    return { ok: true, payload: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Failed to parse queue_status JSON: ${msg}` };
  }
}

// src/commands/openFile.ts
var vscode5 = __toESM(require("vscode"));
var fs2 = __toESM(require("fs"));
var path5 = __toESM(require("path"));
function openIfExists(filePath, label) {
  if (!filePath || !fs2.existsSync(filePath)) {
    vscode5.window.showInformationMessage(
      `${label} does not exist yet: ${filePath ? path5.basename(filePath) : "<unknown>"}`
    );
    return;
  }
  vscode5.commands.executeCommand("vscode.open", vscode5.Uri.file(filePath));
}
function findPlaywrightTests(set) {
  const cfg = vscode5.workspace.getConfiguration("dabblerSessionSets");
  const testDirRel = cfg.get("e2e.testDirectory", PLAYWRIGHT_REL_DEFAULT) || PLAYWRIGHT_REL_DEFAULT;
  const playwrightDir = path5.join(set.root, testDirRel);
  if (!fs2.existsSync(playwrightDir))
    return [];
  const slugTokens = set.name.split("-").filter((s) => s.length >= 3);
  const testRefs = set.uatSummary?.e2eRefs ?? [];
  const candidates = /* @__PURE__ */ new Set();
  const walk = (dir, depth) => {
    if (depth > 4)
      return;
    let entries;
    try {
      entries = fs2.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p2 = path5.join(dir, e.name);
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
          const txt = fs2.readFileSync(p2, "utf8");
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
    vscode5.commands.registerCommand(
      "dabblerSessionSets.openSpec",
      (item) => openIfExists(item?.set?.specPath, "Spec")
    ),
    vscode5.commands.registerCommand(
      "dabblerSessionSets.openActivityLog",
      (item) => openIfExists(item?.set?.activityPath, "Activity log")
    ),
    vscode5.commands.registerCommand(
      "dabblerSessionSets.openChangeLog",
      (item) => openIfExists(item?.set?.changeLogPath, "Change log")
    ),
    vscode5.commands.registerCommand(
      "dabblerSessionSets.openAiAssignment",
      (item) => openIfExists(item?.set?.aiAssignmentPath, "AI assignment")
    ),
    vscode5.commands.registerCommand(
      "dabblerSessionSets.openUatChecklist",
      (item) => openIfExists(item?.set?.uatChecklistPath, "UAT checklist")
    ),
    vscode5.commands.registerCommand("dabblerSessionSets.openFolder", (item) => {
      if (!item?.set)
        return;
      vscode5.commands.executeCommand("revealInExplorer", vscode5.Uri.file(item.set.dir));
    }),
    vscode5.commands.registerCommand(
      "dabblerSessionSets.revealPlaywrightTests",
      async (item) => {
        if (!item?.set)
          return;
        const tests = findPlaywrightTests(item.set);
        if (tests.length === 0) {
          const cfg = vscode5.workspace.getConfiguration("dabblerSessionSets");
          const dir = cfg.get("e2e.testDirectory", PLAYWRIGHT_REL_DEFAULT);
          vscode5.window.showInformationMessage(
            `No Playwright tests found for "${item.set.name}". Search root: ${dir}`
          );
          return;
        }
        if (tests.length === 1) {
          vscode5.commands.executeCommand("vscode.open", vscode5.Uri.file(tests[0]));
          return;
        }
        const picked = await vscode5.window.showQuickPick(
          tests.map((p2) => ({
            label: path5.basename(p2),
            description: path5.relative(item.set.root, p2),
            absolute: p2
          })),
          { placeHolder: `Playwright tests matching "${item.set.name}"` }
        );
        if (picked) {
          vscode5.commands.executeCommand("vscode.open", vscode5.Uri.file(picked.absolute));
        }
      }
    )
  );
}

// src/commands/copyCommand.ts
var vscode6 = __toESM(require("vscode"));
async function copy(text, label) {
  await vscode6.env.clipboard.writeText(text);
  vscode6.window.setStatusBarMessage(`Copied: ${label}`, 4e3);
}
var startCommandPresets = {
  default: (slug) => `Start the next session of \`${slug}\`.`,
  parallel: (slug) => `Start the next parallel session of \`${slug}\`.`,
  maxoutClaude: (slug) => `Start the next session of \`${slug}\`. \u2014 maxout Claude`
};
var presetLabels = {
  default: "start next session",
  parallel: "start next parallel session",
  maxoutClaude: "start next session \u2014 maxout Claude"
};
function registerCopyCommands(context) {
  for (const [key, builder] of Object.entries(startCommandPresets)) {
    context.subscriptions.push(
      vscode6.commands.registerCommand(
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
    vscode6.commands.registerCommand(
      "dabblerSessionSets.copySlug",
      async (item) => {
        if (!item?.set)
          return;
        await copy(item.set.name, "slug");
      }
    )
  );
}

// src/commands/gitScaffold.ts
var vscode7 = __toESM(require("vscode"));
var fs3 = __toESM(require("fs"));
var path6 = __toESM(require("path"));

// node_modules/simple-git/dist/esm/index.js
var import_file_exists = __toESM(require_dist(), 1);

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
var import_promise_deferred = __toESM(require_dist2(), 1);
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
var import_promise_deferred2 = __toESM(require_dist2(), 1);
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
      constructor(git, message) {
        super(void 0, message || String(git));
        this.git = git;
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
function folderExists(path13) {
  return (0, import_file_exists.exists)(path13, import_file_exists.FOLDER);
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
function asCamelCase(str) {
  return str.replace(/[\s-]+(.)/g, (_all, chr) => {
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
function appendTaskOptions(options, commands11 = []) {
  if (!filterPlainObject(options)) {
    return commands11;
  }
  return Object.keys(options).reduce((commands22, key) => {
    const value = options[key];
    if (r(value)) {
      commands22.push(value);
    } else if (filterPrimitives(value, ["boolean"])) {
      commands22.push(key + "=" + value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        if (!filterPrimitives(v, ["string", "number"])) {
          commands22.push(key + "=" + v);
        }
      }
    } else {
      commands22.push(key);
    }
    return commands22;
  }, commands11);
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
      parsers12.some(({ parse }) => parse(line, result));
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
  const commands11 = ["rev-parse", "--is-inside-work-tree"];
  return {
    commands: commands11,
    format: "utf-8",
    onError,
    parser
  };
}
function checkIsRepoRootTask() {
  const commands11 = ["rev-parse", "--git-dir"];
  return {
    commands: commands11,
    format: "utf-8",
    onError,
    parser(path13) {
      return /^\.(git)?$/.test(path13.trim());
    }
  };
}
function checkIsBareRepoTask() {
  const commands11 = ["rev-parse", "--is-bare-repository"];
  return {
    commands: commands11,
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
function straightThroughStringTask(commands11, trimmed2 = false) {
  return {
    commands: commands11,
    format: "utf-8",
    parser(text) {
      return trimmed2 ? String(text).trim() : text;
    }
  };
}
function straightThroughBufferTask(commands11) {
  return {
    commands: commands11,
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
  const commands11 = ["clean", `-${mode}`, ...customArgs];
  return {
    commands: commands11,
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
  const commands11 = ["config", `--${scope}`];
  if (append2) {
    commands11.push("--add");
  }
  commands11.push(key, value);
  return {
    commands: commands11,
    format: "utf-8",
    parser(text) {
      return text;
    }
  };
}
function getConfigTask(key, scope) {
  const commands11 = ["config", "--null", "--show-origin", "--get-all", key];
  if (scope) {
    commands11.splice(1, 0, `--${scope}`);
  }
  return {
    commands: commands11,
    format: "utf-8",
    parser(text) {
      return configGetParser(text, key);
    }
  };
}
function listConfigTask(scope) {
  const commands11 = ["config", "--list", "--show-origin", "--null"];
  if (scope) {
    commands11.push(`--${scope}`);
  }
  return {
    commands: commands11,
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
    const [path13, line, preview] = input.split(NULL);
    paths.add(path13);
    (results[path13] = results[path13] || []).push({
      line: asNumber(line),
      path: path13,
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
      const commands11 = ["grep", "--null", "-n", "--full-name", ...options, ...searchTerm];
      return this._runTask(
        {
          commands: commands11,
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
  const commands11 = ["reset"];
  if (isValidResetMode(mode)) {
    commands11.push(`--${mode}`);
  }
  commands11.push(...customArgs);
  return straightThroughStringTask(commands11);
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
function pluginContext(task, commands11) {
  return {
    method: first(task.commands) || "",
    commands: commands11
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
  const commands11 = ["checkout", ...args];
  if (commands11[1] === "-b" && commands11.includes("-B")) {
    commands11[1] = remove(commands11, "-B");
  }
  return straightThroughStringTask(commands11);
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
  const commands11 = [
    "-c",
    "core.abbrev=40",
    "commit",
    ...prefixedArray(message, "-m"),
    ...files,
    ...customArgs
  ];
  return {
    commands: commands11,
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
  const commands11 = ["hash-object", filePath];
  if (write) {
    commands11.push("-w");
  }
  return straightThroughStringTask(commands11, true);
}
var init_hash_object = __esm({
  "src/lib/tasks/hash-object.ts"() {
    "use strict";
    init_task();
  }
});
function parseInit(bare, path13, text) {
  const response = String(text).trim();
  let result;
  if (result = initResponseRegex.exec(response)) {
    return new InitSummary(bare, path13, false, result[1]);
  }
  if (result = reInitResponseRegex.exec(response)) {
    return new InitSummary(bare, path13, true, result[1]);
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
  return new InitSummary(bare, path13, /^re/i.test(response), gitDir);
}
var InitSummary;
var initResponseRegex;
var reInitResponseRegex;
var init_InitSummary = __esm({
  "src/lib/responses/InitSummary.ts"() {
    "use strict";
    InitSummary = class {
      constructor(bare, path13, existing, gitDir) {
        this.bare = bare;
        this.path = path13;
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
function initTask(bare = false, path13, customArgs) {
  const commands11 = ["init", ...customArgs];
  if (bare && !hasBareCommand(commands11)) {
    commands11.splice(1, 0, bareCommand);
  }
  return {
    commands: commands11,
    format: "utf-8",
    parser(text) {
      return parseInit(commands11.includes("--bare"), path13, text);
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
  const commands11 = ["diff"];
  if (logFormat === "") {
    logFormat = "--stat";
    commands11.push("--stat=4096");
  }
  commands11.push(...customArgs);
  return validateLogFormatConfig(commands11) || {
    commands: commands11,
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
  const delta = /delta (\d+)/i.exec(source);
  return {
    count: asNumber(count && count[1] || "0"),
    delta: asNumber(delta && delta[1] || "0")
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
  const commands11 = ["push", ...customArgs];
  if (ref.branch) {
    commands11.splice(1, 0, ref.branch);
  }
  if (ref.remote) {
    commands11.splice(1, 0, ref.remote);
  }
  remove(commands11, "-v");
  append(commands11, "--verbose");
  append(commands11, "--porcelain");
  return {
    commands: commands11,
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
      const commands11 = ["show", ...getTrailingOptions(arguments, 1)];
      if (!commands11.includes("--binary")) {
        commands11.splice(1, 0, "--binary");
      }
      return this._runTask(
        straightThroughBufferTask(commands11),
        trailingFunctionArgument(arguments)
      );
    },
    show() {
      const commands11 = ["show", ...getTrailingOptions(arguments, 1)];
      return this._runTask(
        straightThroughStringTask(commands11),
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
      constructor(path13, index, working_dir) {
        this.path = path13;
        this.index = index;
        this.working_dir = working_dir;
        if (index === "R" || working_dir === "R") {
          const detail = fromPathRegex.exec(path13) || [null, path13, path13];
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
  function data(index, workingDir, path13) {
    const raw = `${index}${workingDir}`;
    const handler = parsers6.get(raw);
    if (handler) {
      handler(result, path13);
    }
    if (raw !== "##" && raw !== "!!") {
      result.files.push(new FileStatusSummary(path13, index, workingDir));
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
  const commands11 = [
    "status",
    "--porcelain",
    "-b",
    "-u",
    "--null",
    ...customArgs.filter((arg) => !ignoredOptions.includes(arg))
  ];
  return {
    format: "utf-8",
    commands: commands11,
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
      const commands11 = ["clone", ...customArgs];
      filterString(repo) && commands11.push(c(repo));
      filterString(directory) && commands11.push(c(directory));
      return straightThroughStringTask(commands11);
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
      hashObject(path13, write) {
        return this._runTask(
          hashObjectTask(path13, write === true),
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
function containsDeleteBranchCommand(commands11) {
  const deleteCommands = ["-d", "-D", "--delete"];
  return commands11.some((command) => deleteCommands.includes(command));
}
function branchTask(customArgs) {
  const isDelete = containsDeleteBranchCommand(customArgs);
  const isCurrentOnly = customArgs.includes("--show-current");
  const commands11 = ["branch", ...customArgs];
  if (commands11.length === 1) {
    commands11.push("-a");
  }
  if (!commands11.includes("-v")) {
    commands11.splice(1, 0, "-v");
  }
  return {
    format: "utf-8",
    commands: commands11,
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
  const path13 = input.trim().replace(/^["']|["']$/g, "");
  return path13 && (0, import_node_path.normalize)(path13);
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
function parseFetchResult2(stdOut, stdErr) {
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
  const commands11 = ["fetch", ...customArgs];
  if (remote && branch) {
    commands11.push(remote, branch);
  }
  const banned = commands11.find(disallowedCommand);
  if (banned) {
    return configurationErrorTask(`git.fetch: potential exploit argument blocked.`);
  }
  return {
    commands: commands11,
    format: "utf-8",
    parser: parseFetchResult2
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
  const commands11 = ["pull", ...customArgs];
  if (remote && branch) {
    commands11.splice(1, 0, remote, branch);
  }
  return {
    commands: commands11,
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
  const commands11 = ["remote"];
  if (verbose) {
    commands11.push("-v");
  }
  return {
    commands: commands11,
    format: "utf-8",
    parser: verbose ? parseGetRemotesVerbose : parseGetRemotes
  };
}
function listRemotesTask(customArgs) {
  const commands11 = [...customArgs];
  if (commands11[0] !== "ls-remote") {
    commands11.unshift("ls-remote");
  }
  return straightThroughStringTask(commands11);
}
function remoteTask(customArgs) {
  const commands11 = [...customArgs];
  if (commands11[0] !== "remote") {
    commands11.unshift("remote");
  }
  return straightThroughStringTask(commands11);
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
  const commands11 = ["stash", "list", ...options.commands, ...customArgs];
  const parser4 = createListLogSummaryParser(
    options.splitter,
    options.fields,
    logFormatFromCommand(commands11)
  );
  return validateLogFormatConfig(commands11) || {
    commands: commands11,
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
function addSubModuleTask(repo, path13) {
  return subModuleTask(["add", repo, path13]);
}
function initSubModuleTask(customArgs) {
  return subModuleTask(["init", ...customArgs]);
}
function subModuleTask(customArgs) {
  const commands11 = [...customArgs];
  if (commands11[0] !== "submodule") {
    commands11.unshift("submodule");
  }
  return straightThroughStringTask(commands11);
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
      var git = this;
      return this.pull(function() {
        git.tags(function(err, tags) {
          git.checkout(tags.latest, then);
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
    Git2.prototype.raw = function(commands11) {
      const createRestCommands = !Array.isArray(commands11);
      const command = [].slice.call(createRestCommands ? arguments : commands11, 0);
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
    Git2.prototype.submoduleAdd = function(repo, path13, then) {
      return this._runTask(addSubModuleTask2(repo, path13), trailingFunctionArgument2(arguments));
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
      const commands11 = ["rev-parse", ...getTrailingOptions2(arguments, true)];
      return this._runTask(
        straightThroughStringTask2(commands11, true),
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
    action(args, { env: env4 }) {
      for (const vulnerability of ne(args, env4)) {
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

// src/commands/gitScaffold.ts
var SCAFFOLD_DIRS = [
  path6.join("docs", "session-sets"),
  path6.join("docs", "planning"),
  "ai-router"
];
async function pickDirectory() {
  const picked = await vscode7.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select project folder"
  });
  return picked?.[0]?.fsPath;
}
function registerGitScaffoldCommand(context) {
  context.subscriptions.push(
    vscode7.commands.registerCommand("dabbler.setupNewProject", async () => {
      const projectDir = await pickDirectory();
      if (!projectDir)
        return;
      const git = esm_default(projectDir);
      const isRepo = await git.checkIsRepo().catch(() => false);
      if (!isRepo) {
        const confirm = await vscode7.window.showWarningMessage(
          `Initialize a new git repository in ${path6.basename(projectDir)}?`,
          { modal: true },
          "Initialize"
        );
        if (confirm !== "Initialize")
          return;
        await git.init();
        vscode7.window.showInformationMessage("Git repository initialized.");
      }
      for (const rel of SCAFFOLD_DIRS) {
        const full = path6.join(projectDir, rel);
        if (!fs3.existsSync(full))
          fs3.mkdirSync(full, { recursive: true });
      }
      vscode7.window.showInformationMessage("Folder skeleton created.");
      const worktreeAnswer = await vscode7.window.showInformationMessage(
        "Set up git worktrees for parallel session sets? (Recommended for large projects)",
        { modal: true },
        "Yes \u2014 set up worktrees",
        "No \u2014 keep it simple"
      );
      if (worktreeAnswer === "Yes \u2014 set up worktrees") {
        try {
          const status = await git.status();
          if (status.files.length > 0 || !await git.log().catch(() => null)) {
            await git.commit("init", { "--allow-empty": null });
          }
          const worktreesDir = path6.join(projectDir, "worktrees");
          if (!fs3.existsSync(worktreesDir))
            fs3.mkdirSync(worktreesDir, { recursive: true });
          await git.raw(["worktree", "add", path6.join(worktreesDir, "main"), "HEAD"]);
          vscode7.window.showInformationMessage(
            "Worktrees set up. Work from worktrees/main/ for parallel sessions."
          );
        } catch (err) {
          vscode7.window.showWarningMessage(
            `Worktree setup skipped: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      const openFolder = await vscode7.window.showInformationMessage(
        "Project scaffolded. Open the folder now?",
        "Open Folder"
      );
      if (openFolder === "Open Folder") {
        vscode7.commands.executeCommand("vscode.openFolder", vscode7.Uri.file(projectDir));
      } else {
        vscode7.commands.executeCommand("dabbler.getStarted");
      }
    })
  );
}

// src/commands/troubleshoot.ts
var vscode8 = __toESM(require("vscode"));
var fs4 = __toESM(require("fs"));
var path7 = __toESM(require("path"));
var cp3 = __toESM(require("child_process"));
function workspaceRoot() {
  return vscode8.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
function outputChannel() {
  return vscode8.window.createOutputChannel("Dabbler Diagnostics");
}
function checkActivation() {
  const ch = outputChannel();
  const root = workspaceRoot();
  if (!root) {
    ch.appendLine("No workspace folder is open.");
    ch.show();
    return;
  }
  const dir = path7.join(root, SESSION_SETS_REL);
  const exists2 = fs4.existsSync(dir);
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
  ch.appendLine("  done         \u2192  change-log.md exists");
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
    const out = cp3.execFileSync("git", ["worktree", "list", "--porcelain"], {
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
  ch.appendLine("The ai-router reads API keys from environment variables at session start.");
  ch.appendLine("");
  ch.appendLine("Keys used (depending on configured providers):");
  ch.appendLine("  ANTHROPIC_API_KEY  \u2014 Claude (claude.ai)");
  ch.appendLine("  OPENAI_API_KEY     \u2014 OpenAI (GPT models)");
  ch.appendLine("  GEMINI_API_KEY     \u2014 Google Gemini");
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
  ch.appendLine("Run 'Dabbler: Show Cost Dashboard' to see cumulative totals and a daily chart.");
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
    path7.join("docs", "session-sets"),
    path7.join("docs", "planning"),
    "ai-router"
  ];
  ch.appendLine(`Expected layout under: ${root}`);
  ch.appendLine("");
  for (const d of dirs) {
    const full = path7.join(root, d);
    const exists2 = fs4.existsSync(full);
    ch.appendLine(`  ${exists2 ? "\u2713" : "\u2717"} ${d}`);
  }
  ch.appendLine("");
  ch.appendLine("Missing folders? Run 'Dabbler: Set Up New Project' to scaffold them.");
  ch.show();
}
function registerTroubleshootCommand(context) {
  context.subscriptions.push(
    vscode8.commands.registerCommand("dabbler.troubleshoot", async () => {
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
          detail: "Show which environment variables the ai-router expects",
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
      const picked = await vscode8.window.showQuickPick(
        items.map((i2) => ({ label: i2.label, detail: i2.detail, _run: i2.run })),
        { placeHolder: "Select a troubleshooting topic" }
      );
      if (picked)
        picked._run();
    })
  );
}

// src/commands/queueActions.ts
var vscode9 = __toESM(require("vscode"));
var PAYLOAD_SCHEME = "dabbler-queue-payload";
var QueuePayloadContentProvider = class {
  constructor() {
    this._onDidChange = new vscode9.EventEmitter();
    this.onDidChange = this._onDidChange.event;
    this._store = /* @__PURE__ */ new Map();
  }
  setContent(uri, body) {
    this._store.set(uri.toString(), body);
    this._onDidChange.fire(uri);
  }
  provideTextDocumentContent(uri) {
    return this._store.get(uri.toString()) ?? "(payload not loaded)";
  }
};
function registerQueueActionCommands(ctx, qctx) {
  const contentProvider = new QueuePayloadContentProvider();
  ctx.subscriptions.push(
    vscode9.workspace.registerTextDocumentContentProvider(PAYLOAD_SCHEME, contentProvider)
  );
  ctx.subscriptions.push(
    vscode9.commands.registerCommand(
      "dabblerProviderQueues.openPayload",
      async (arg) => {
        if (!arg || arg.kind !== "message") {
          vscode9.window.showWarningMessage("Open Payload: select a queue message first.");
          return;
        }
        const root = qctx.getWorkspaceRoot();
        if (!root) {
          vscode9.window.showErrorMessage("Open Payload: no workspace folder open.");
          return;
        }
        const result = await runPythonModule({
          cwd: root,
          module: "ai_router.queue_status",
          args: [
            "--provider",
            arg.provider,
            "--get-payload",
            arg.message.id
          ],
          pythonPathSetting: "dabblerProviderQueues.pythonPath",
          timeoutMs: 1e4
        });
        if (result.exitCode !== 0 && result.exitCode !== 1) {
          vscode9.window.showErrorMessage(
            `queue_status --get-payload failed: ${(result.stderr || result.stdout).trim() || "no output"}`
          );
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(result.stdout);
        } catch (err) {
          vscode9.window.showErrorMessage(
            `Open Payload: malformed JSON from queue_status: ${err instanceof Error ? err.message : String(err)}`
          );
          return;
        }
        if (!parsed.ok) {
          vscode9.window.showWarningMessage(
            `Open Payload: ${parsed.error ?? "message not found"}`
          );
          return;
        }
        const body = JSON.stringify(parsed.message, null, 2);
        const uri = vscode9.Uri.parse(
          `${PAYLOAD_SCHEME}:/${encodeURIComponent(arg.provider)}/${encodeURIComponent(arg.message.id)}.json`
        );
        contentProvider.setContent(uri, body);
        const doc = await vscode9.workspace.openTextDocument(uri);
        await vscode9.languages.setTextDocumentLanguage(doc, "json");
        await vscode9.window.showTextDocument(doc, { preview: true });
      }
    )
  );
  ctx.subscriptions.push(
    vscode9.commands.registerCommand(
      "dabblerProviderQueues.markFailed",
      async (arg) => {
        if (!arg || arg.kind !== "message") {
          vscode9.window.showWarningMessage("Mark Failed: select a queue message first.");
          return;
        }
        const choice = await vscode9.window.showWarningMessage(
          `Force ${arg.message.id.slice(0, 8)} (${arg.message.task_type}, state=${arg.message.state}) into state=failed?`,
          { modal: true, detail: "Bypasses the normal ownership check. Use only when the worker is known dead." },
          "Mark Failed"
        );
        if (choice !== "Mark Failed")
          return;
        const root = qctx.getWorkspaceRoot();
        if (!root)
          return;
        const result = await runPythonModule({
          cwd: root,
          module: "ai_router.queue_status",
          args: [
            "--provider",
            arg.provider,
            "--mark-failed",
            arg.message.id
          ],
          pythonPathSetting: "dabblerProviderQueues.pythonPath"
        });
        await reportInterventionResult("Mark Failed", result, qctx);
      }
    )
  );
  ctx.subscriptions.push(
    vscode9.commands.registerCommand(
      "dabblerProviderQueues.forceReclaim",
      async (arg) => {
        if (!arg || arg.kind !== "message") {
          vscode9.window.showWarningMessage("Force Reclaim: select a queue message first.");
          return;
        }
        const choice = await vscode9.window.showWarningMessage(
          `Release the lease on ${arg.message.id.slice(0, 8)} (${arg.message.task_type})?`,
          { modal: true, detail: "Returns state=claimed -> new and bumps attempts. The next claim() will pick it up." },
          "Force Reclaim"
        );
        if (choice !== "Force Reclaim")
          return;
        const root = qctx.getWorkspaceRoot();
        if (!root)
          return;
        const result = await runPythonModule({
          cwd: root,
          module: "ai_router.queue_status",
          args: [
            "--provider",
            arg.provider,
            "--force-reclaim",
            arg.message.id
          ],
          pythonPathSetting: "dabblerProviderQueues.pythonPath"
        });
        await reportInterventionResult("Force Reclaim", result, qctx);
      }
    )
  );
}
async function reportInterventionResult(label, result, qctx) {
  if (result.timedOut) {
    vscode9.window.showErrorMessage(`${label}: queue_status timed out.`);
    return;
  }
  let parsed = {};
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
  }
  if (parsed.ok) {
    const prev = parsed.previous_state ? ` (was ${parsed.previous_state})` : "";
    vscode9.window.showInformationMessage(`${label} succeeded${prev}.`);
    qctx.refreshView();
    return;
  }
  const detail = parsed.error || (result.stderr || result.stdout).trim() || "no output";
  vscode9.window.showErrorMessage(`${label} failed: ${detail}`);
}

// src/wizard/WizardPanel.ts
var vscode12 = __toESM(require("vscode"));
var fs7 = __toESM(require("fs"));

// src/wizard/planImport.ts
var vscode10 = __toESM(require("vscode"));
var fs5 = __toESM(require("fs"));
var path8 = __toESM(require("path"));
var PLAN_DEST = path8.join("docs", "planning", "project-plan.md");
var PLAN_AUTHORING_PROMPT = `You are a project planning assistant for an AI-led development workflow.

Help me create a project plan in Markdown format for my software project.

The plan should include:
1. Project overview (2-3 sentences)
2. Goals and success criteria
3. High-level phases or feature areas
4. For each phase: a brief description and the key deliverables

Keep it concise and focused \u2014 this plan will be used to generate AI session sets, so each
distinct feature area or phase should be something that can be implemented in 2-6 focused AI
sessions.

Format as a clean Markdown document I can save as docs/planning/project-plan.md.`;
function registerPlanImportCommand(context) {
  context.subscriptions.push(
    vscode10.commands.registerCommand("dabbler.importPlan", async () => {
      const action = await vscode10.window.showQuickPick(
        [
          { label: "$(file) Import existing plan from file", value: "file" },
          { label: "$(clippy) Get a prompt to create a plan with AI", value: "prompt" }
        ],
        { placeHolder: "How would you like to add a project plan?" }
      );
      if (!action)
        return;
      if (action.value === "prompt") {
        await vscode10.env.clipboard.writeText(PLAN_AUTHORING_PROMPT);
        vscode10.window.showInformationMessage(
          "Plan-authoring prompt copied to clipboard. Paste it into your AI assistant, then save the result as docs/planning/project-plan.md and run 'Dabbler: Import Project Plan' again to import it."
        );
        return;
      }
      const picked = await vscode10.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { "Markdown": ["md"] },
        openLabel: "Import Plan"
      });
      if (!picked?.[0])
        return;
      const root = vscode10.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode10.window.showErrorMessage("No workspace folder is open.");
        return;
      }
      const destPath = path8.join(root, PLAN_DEST);
      const destDir = path8.dirname(destPath);
      if (!fs5.existsSync(destDir))
        fs5.mkdirSync(destDir, { recursive: true });
      if (fs5.existsSync(destPath)) {
        const overwrite = await vscode10.window.showWarningMessage(
          `${PLAN_DEST} already exists. Overwrite it?`,
          { modal: true },
          "Overwrite"
        );
        if (overwrite !== "Overwrite")
          return;
      }
      fs5.copyFileSync(picked[0].fsPath, destPath);
      vscode10.commands.executeCommand("vscode.open", vscode10.Uri.file(destPath));
      vscode10.window.showInformationMessage(
        `Plan imported to ${PLAN_DEST}. Run 'Dabbler: Generate Session-Set Prompt' to translate it into session sets.`
      );
    })
  );
}

// src/wizard/sessionGenPrompt.ts
var vscode11 = __toESM(require("vscode"));
var fs6 = __toESM(require("fs"));
var path9 = __toESM(require("path"));
var PLAN_PATH = path9.join("docs", "planning", "project-plan.md");
var PROMPT_SYSTEM = `You are a session-set architect for an AI-led software development workflow.

Given a project plan, decompose it into a sequence of session sets. Each session set is a
focused, independently deployable unit of work that one AI coding session can complete.

For each session set, produce a spec.md file with this exact structure:

\`\`\`markdown
# <slug> \u2014 <short title>

## Goal
<1\u20132 sentence goal>

## Deliverables
- <deliverable 1>
- <deliverable 2>

## Session Set Configuration
\`\`\`yaml
totalSessions: <estimate 1\u20136>
requiresUAT: <true|false>
requiresE2E: <true|false>
effort: <low|normal|high>
\`\`\`

## Context
<any background the AI needs \u2014 key files, existing patterns, constraints>
\`\`\`

Guidelines:
- Name each session set with a kebab-case slug (e.g., user-auth, product-catalog)
- Order sets so earlier ones unblock later ones
- Keep scope tight: prefer 2\u20134 sessions per set
- Set requiresUAT: true only for user-visible features that need manual verification
- Set requiresE2E: true only if automated browser tests are relevant
- Set effort: low for simple changes, high for complex multi-file refactors
`;
function registerSessionGenPromptCommand(context) {
  context.subscriptions.push(
    vscode11.commands.registerCommand("dabbler.generateSessionSetPrompt", async () => {
      const root = vscode11.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode11.window.showErrorMessage("No workspace folder is open.");
        return;
      }
      const planPath = path9.join(root, PLAN_PATH);
      if (!fs6.existsSync(planPath)) {
        const action = await vscode11.window.showWarningMessage(
          `No project plan found at ${PLAN_PATH}. Import one first?`,
          "Import Plan"
        );
        if (action === "Import Plan")
          vscode11.commands.executeCommand("dabbler.importPlan");
        return;
      }
      const planText = fs6.readFileSync(planPath, "utf8");
      const prompt = `${PROMPT_SYSTEM}

---

Project plan:

${planText}`;
      await vscode11.env.clipboard.writeText(prompt);
      vscode11.window.showInformationMessage(
        "Session-set generation prompt copied to clipboard. Paste it into your AI assistant. When you receive the specs, save each one to docs/session-sets/<slug>/spec.md.\n\nCost reminder: each session set typically costs $0.10\u2013$2.00 depending on model and effort. Review the generated specs before running all sessions.",
        { modal: false }
      );
    })
  );
}

// src/wizard/WizardPanel.ts
function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i2 = 0; i2 < 32; i2++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
var WizardPanel = class _WizardPanel {
  static show(extensionUri) {
    if (_WizardPanel.currentPanel) {
      _WizardPanel.currentPanel._panel.reveal(vscode12.ViewColumn.One);
      return;
    }
    const panel = vscode12.window.createWebviewPanel(
      "dabblerWizard",
      "Dabbler AI Orchestration \u2014 Get Started",
      vscode12.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode12.Uri.joinPath(extensionUri, "webview")]
      }
    );
    _WizardPanel.currentPanel = new _WizardPanel(panel, extensionUri);
  }
  constructor(panel, extensionUri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => {
      _WizardPanel.currentPanel = void 0;
    });
    this._panel.webview.onDidReceiveMessage((msg) => {
      switch (msg.command) {
        case "setupProject":
          vscode12.commands.executeCommand("dabbler.setupNewProject");
          break;
        case "importPlan":
          vscode12.commands.executeCommand("dabbler.importPlan");
          break;
        case "generatePrompt":
          vscode12.commands.executeCommand("dabbler.generateSessionSetPrompt");
          break;
        case "troubleshoot":
          vscode12.commands.executeCommand("dabbler.troubleshoot");
          break;
        case "showCost":
          vscode12.commands.executeCommand("dabbler.showCostDashboard");
          break;
      }
    });
  }
  _getHtml() {
    const htmlPath = vscode12.Uri.joinPath(this._extensionUri, "webview", "wizard.html");
    try {
      let html = fs7.readFileSync(htmlPath.fsPath, "utf8");
      const nonce = getNonce();
      const cspSource = this._panel.webview.cspSource;
      html = html.replace(/{{NONCE}}/g, nonce).replace(/{{CSP_SOURCE}}/g, cspSource);
      return html;
    } catch {
      return `<!DOCTYPE html><html><body><p>Error loading wizard panel.</p></body></html>`;
    }
  }
};
function registerWizardCommands(context) {
  context.subscriptions.push(
    vscode12.commands.registerCommand("dabbler.getStarted", () => {
      WizardPanel.show(context.extensionUri);
    })
  );
  registerPlanImportCommand(context);
  registerSessionGenPromptCommand(context);
}

// src/dashboard/CostDashboard.ts
var vscode13 = __toESM(require("vscode"));
var fs9 = __toESM(require("fs"));
var path11 = __toESM(require("path"));

// src/utils/metrics.ts
var fs8 = __toESM(require("fs"));
var path10 = __toESM(require("path"));
var METRICS_FILE = path10.join("ai-router", "metrics.jsonl");
function readMetrics(workspaceRoot2) {
  const metricsPath = path10.join(workspaceRoot2, METRICS_FILE);
  if (!fs8.existsSync(metricsPath))
    return [];
  try {
    const lines = fs8.readFileSync(metricsPath, "utf8").split(/\r?\n/).filter(Boolean);
    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((e) => e !== null);
  } catch {
    return [];
  }
}
function summarizeMetrics(entries) {
  const bySessionSet = {};
  const byModel = {};
  const dailyMap = {};
  for (const e of entries) {
    if (!bySessionSet[e.session_set]) {
      bySessionSet[e.session_set] = { sessions: 0, cost: 0, lastRun: "" };
    }
    bySessionSet[e.session_set].sessions++;
    bySessionSet[e.session_set].cost += e.cost_usd;
    if (e.timestamp > bySessionSet[e.session_set].lastRun) {
      bySessionSet[e.session_set].lastRun = e.timestamp;
    }
    byModel[e.model] = (byModel[e.model] ?? 0) + e.cost_usd;
    const day = e.timestamp.slice(0, 10);
    dailyMap[day] = (dailyMap[day] ?? 0) + e.cost_usd;
  }
  const today = /* @__PURE__ */ new Date();
  const dailyCosts = Array.from({ length: 30 }, (_2, i2) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i2));
    const dateStr = d.toISOString().slice(0, 10);
    return { date: dateStr, cost: dailyMap[dateStr] ?? 0 };
  });
  return {
    totalCost: entries.reduce((s, e) => s + e.cost_usd, 0),
    bySessionSet,
    byModel,
    dailyCosts
  };
}
function buildSparkline(dailyCosts) {
  const BLOCKS = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";
  const values = dailyCosts.map((d) => d.cost);
  const max = Math.max(...values, 1e-4);
  return values.map((v) => BLOCKS[Math.min(7, Math.floor(v / max * 7.99))]).join("");
}
function exportToCsv(entries) {
  const header = "session_set,session_num,model,effort,input_tokens,output_tokens,cost_usd,timestamp";
  const rows = entries.map(
    (e) => [
      e.session_set,
      e.session_num,
      e.model,
      e.effort,
      e.input_tokens,
      e.output_tokens,
      e.cost_usd.toFixed(4),
      e.timestamp
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

// src/dashboard/CostDashboard.ts
function getNonce2() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i2 = 0; i2 < 32; i2++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
var CostDashboard = class _CostDashboard {
  static show(extensionUri) {
    if (_CostDashboard.currentPanel) {
      _CostDashboard.currentPanel._panel.reveal(vscode13.ViewColumn.Two);
      _CostDashboard.currentPanel._refresh();
      return;
    }
    const panel = vscode13.window.createWebviewPanel(
      "dabblerCostDashboard",
      "Dabbler \u2014 Cost Dashboard",
      vscode13.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [vscode13.Uri.joinPath(extensionUri, "webview")]
      }
    );
    _CostDashboard.currentPanel = new _CostDashboard(panel, extensionUri);
  }
  constructor(panel, extensionUri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._refresh();
    this._panel.onDidDispose(() => {
      _CostDashboard.currentPanel = void 0;
    });
    this._panel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === "exportCsv")
        this._exportCsv();
      if (msg.command === "refresh")
        this._refresh();
    });
  }
  _refresh() {
    this._panel.webview.html = this._getHtml();
  }
  _exportCsv() {
    const root = vscode13.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode13.window.showErrorMessage("No workspace folder open.");
      return;
    }
    const entries = readMetrics(root);
    const csv = exportToCsv(entries);
    const outPath = path11.join(root, "ai-router", "cost-export.csv");
    try {
      fs9.writeFileSync(outPath, csv, "utf8");
      vscode13.commands.executeCommand("vscode.open", vscode13.Uri.file(outPath));
    } catch (err) {
      vscode13.window.showErrorMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  _getHtml() {
    const root = vscode13.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const nonce = getNonce2();
    const cspSource = this._panel.webview.cspSource;
    if (!root) {
      return noWorkspaceHtml(nonce, cspSource);
    }
    const entries = readMetrics(root);
    if (entries.length === 0) {
      return noMetricsHtml(nonce, cspSource, path11.join(root, METRICS_FILE));
    }
    const summary = summarizeMetrics(entries);
    const sparkline = buildSparkline(summary.dailyCosts);
    const htmlPath = vscode13.Uri.joinPath(this._extensionUri, "webview", "dashboard.html");
    try {
      let html = fs9.readFileSync(htmlPath.fsPath, "utf8");
      const sessionSetRows = Object.entries(summary.bySessionSet).sort(([, a], [, b2]) => b2.cost - a.cost).map(
        ([slug, d]) => `<tr><td>${slug}</td><td>${d.sessions}</td><td>$${d.cost.toFixed(3)}</td><td>${d.lastRun ? new Date(d.lastRun).toLocaleDateString("en-CA") : "\u2014"}</td></tr>`
      ).join("\n");
      const modelRows = Object.entries(summary.byModel).sort(([, a], [, b2]) => b2 - a).map(([model, cost]) => {
        const pct = summary.totalCost > 0 ? (cost / summary.totalCost * 100).toFixed(1) : "0";
        return `<tr><td>${model}</td><td>$${cost.toFixed(3)}</td><td>${pct}%</td></tr>`;
      }).join("\n");
      html = html.replace(/{{NONCE}}/g, nonce).replace(/{{CSP_SOURCE}}/g, cspSource).replace("{{TOTAL_COST}}", `$${summary.totalCost.toFixed(3)}`).replace("{{SPARKLINE}}", sparkline).replace("{{SESSION_SET_ROWS}}", sessionSetRows).replace("{{MODEL_ROWS}}", modelRows).replace(
        "{{SPARKLINE_DATES}}",
        `${summary.dailyCosts[0]?.date ?? ""} \u2192 ${summary.dailyCosts[29]?.date ?? ""}`
      );
      return html;
    } catch {
      return noMetricsHtml(nonce, cspSource, path11.join(root, METRICS_FILE));
    }
  }
};
function noWorkspaceHtml(nonce, cspSource) {
  return `<!DOCTYPE html><html><head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}';">
  </head><body><p>Open a workspace folder to view costs.</p></body></html>`;
}
function noMetricsHtml(nonce, cspSource, metricsPath) {
  return `<!DOCTYPE html><html><head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}';">
  <style nonce="${nonce}">body { font-family: var(--vscode-font-family); padding: 20px; }</style>
  </head><body>
  <h2>No cost data found</h2>
  <p>Expected: <code>${metricsPath}</code></p>
  <p>Enable metrics logging in <code>ai-router/config.py</code> by setting <code>METRICS_ENABLED = True</code>.</p>
  <p>Each session run will append a JSON line to <code>ai-router/metrics.jsonl</code>.</p>
  </body></html>`;
}
function registerCostDashboardCommand(context) {
  context.subscriptions.push(
    vscode13.commands.registerCommand("dabbler.showCostDashboard", () => {
      CostDashboard.show(context.extensionUri);
    })
  );
}

// src/extension.ts
var SESSION_SETS_REL2 = path12.join("docs", "session-sets");
function evaluateSupportContextKeys(allSets) {
  const cfg = vscode14.workspace.getConfiguration("dabblerSessionSets");
  const uatPref = cfg.get("uatSupport.enabled", "auto");
  const e2ePref = cfg.get("e2eSupport.enabled", "auto");
  const anyUat = allSets.some((s) => s.config?.requiresUAT);
  const anyE2e = allSets.some((s) => s.config?.requiresE2E);
  const uatActive = uatPref === "always" || uatPref === "auto" && anyUat;
  const e2eActive = e2ePref === "always" || e2ePref === "auto" && anyE2e;
  vscode14.commands.executeCommand("setContext", "dabblerSessionSets.uatSupportActive", uatActive);
  vscode14.commands.executeCommand("setContext", "dabblerSessionSets.e2eSupportActive", e2eActive);
}
function activate(context) {
  if (!vscode14.workspace.workspaceFolders?.length)
    return;
  const provider = new SessionSetsProvider(context.extensionUri);
  context.subscriptions.push(
    vscode14.window.registerTreeDataProvider("dabblerSessionSets", provider)
  );
  const evaluateContextKeys = () => {
    evaluateSupportContextKeys(provider._cache ?? readAllSessionSets());
  };
  const originalRefresh = provider.refresh.bind(provider);
  provider.refresh = () => {
    originalRefresh();
    setImmediate(evaluateContextKeys);
  };
  evaluateContextKeys();
  context.subscriptions.push(
    vscode14.workspace.onDidChangeConfiguration((e) => {
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
      const sessionSetsAbs = path12.join(root, SESSION_SETS_REL2);
      const pattern = new vscode14.RelativePattern(
        sessionSetsAbs,
        "**/{spec.md,session-state.json,activity-log.json,change-log.md,*-uat-checklist.json}"
      );
      const watcher = vscode14.workspace.createFileSystemWatcher(pattern);
      const onEvent = () => provider.refresh();
      watcher.onDidCreate(onEvent);
      watcher.onDidDelete(onEvent);
      watcher.onDidChange(onEvent);
      watcherSubs.push(watcher);
      context.subscriptions.push(watcher);
    }
  }
  const refreshAll = () => {
    bindWatchers();
    provider.refresh();
  };
  bindWatchers();
  context.subscriptions.push(vscode14.workspace.onDidChangeWorkspaceFolders(refreshAll));
  const pollHandle = setInterval(refreshAll, 3e4);
  context.subscriptions.push({ dispose: () => clearInterval(pollHandle) });
  context.subscriptions.push(
    vscode14.commands.registerCommand("dabblerSessionSets.refresh", refreshAll)
  );
  const queuesProvider = new ProviderQueuesProvider({
    getWorkspaceRoot: () => vscode14.workspace.workspaceFolders?.[0]?.uri.fsPath
  });
  context.subscriptions.push(
    vscode14.window.registerTreeDataProvider("dabblerProviderQueues", queuesProvider)
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand(
      "dabblerProviderQueues.refresh",
      () => queuesProvider.refresh()
    )
  );
  let queuesPoll;
  const rebindQueuesPoll = () => {
    if (queuesPoll)
      clearInterval(queuesPoll);
    const seconds = vscode14.workspace.getConfiguration("dabblerProviderQueues").get("autoRefreshSeconds", 15);
    if (seconds > 0) {
      queuesPoll = setInterval(() => queuesProvider.refresh(), seconds * 1e3);
    } else {
      queuesPoll = void 0;
    }
  };
  rebindQueuesPoll();
  context.subscriptions.push({
    dispose: () => {
      if (queuesPoll)
        clearInterval(queuesPoll);
    }
  });
  context.subscriptions.push(
    vscode14.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("dabblerProviderQueues.autoRefreshSeconds")) {
        rebindQueuesPoll();
      }
    })
  );
  registerQueueActionCommands(context, {
    getWorkspaceRoot: () => vscode14.workspace.workspaceFolders?.[0]?.uri.fsPath,
    refreshView: () => queuesProvider.refresh()
  });
  registerOpenFileCommands(context);
  registerCopyCommands(context);
  registerGitScaffoldCommand(context);
  registerTroubleshootCommand(context);
  registerWizardCommands(context);
  registerCostDashboardCommand(context);
  const hasSeenOnboarding = context.workspaceState.get("hasSeenOnboarding", false);
  if (!hasSeenOnboarding) {
    const roots = discoverRoots();
    const hasSessionSets = roots.some((r2) => {
      try {
        return fs10.existsSync(path12.join(r2, SESSION_SETS_REL2));
      } catch {
        return false;
      }
    });
    if (!hasSessionSets) {
      context.workspaceState.update("hasSeenOnboarding", true);
      vscode14.commands.executeCommand("dabbler.getStarted");
    }
  }
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
