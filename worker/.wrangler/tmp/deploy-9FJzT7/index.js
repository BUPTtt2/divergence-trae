var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};

// node_modules/unenv/dist/runtime/_internal/utils.mjs
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
__name(PerformanceEntry, "PerformanceEntry");
var PerformanceMark = /* @__PURE__ */ __name(class PerformanceMark2 extends PerformanceEntry {
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
}, "PerformanceMark");
var PerformanceMeasure = class extends PerformanceEntry {
  entryType = "measure";
};
__name(PerformanceMeasure, "PerformanceMeasure");
var PerformanceResourceTiming = class extends PerformanceEntry {
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
__name(PerformanceResourceTiming, "PerformanceResourceTiming");
var PerformanceObserverEntryList = class {
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
__name(PerformanceObserverEntryList, "PerformanceObserverEntryList");
var Performance = class {
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
__name(Performance, "Performance");
var PerformanceObserver = class {
  __unenv__ = true;
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
__name(PerformanceObserver, "PerformanceObserver");
__publicField(PerformanceObserver, "supportedEntryTypes", []);
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now2 = Date.now();
  const seconds = Math.trunc(now2 / 1e3);
  const nanos = now2 % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
import { Socket } from "node:net";
var ReadStream = class extends Socket {
  fd;
  constructor(fd) {
    super();
    this.fd = fd;
  }
  isRaw = false;
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
  isTTY = false;
};
__name(ReadStream, "ReadStream");

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
import { Socket as Socket2 } from "node:net";
var WriteStream = class extends Socket2 {
  fd;
  constructor(fd) {
    super();
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env3) {
    return 1;
  }
  hasColors(count3, env3) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  columns = 80;
  rows = 24;
  isTTY = false;
};
__name(WriteStream, "WriteStream");

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class extends EventEmitter {
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return "";
  }
  get versions() {
    return {};
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  ref() {
  }
  unref() {
  }
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: () => 0 });
  mainModule = void 0;
  domain = void 0;
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};
__name(Process, "Process");

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var { exit, platform, nextTick } = getBuiltinModule(
  "node:process"
);
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  nextTick
});
var {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env: env2,
  eventNames,
  execArgv,
  execPath,
  finalization,
  features,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  on,
  off,
  once,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env: env2,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context2, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context2.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context2, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context2.error = err;
            res = await onError(err, context2);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context2.finalized === false && onNotFound) {
          res = await onNotFound(context2);
        }
      }
      if (res && (context2.finalized === false || isError)) {
        context2.res = res;
      }
      return context2;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = /* @__PURE__ */ __name((arrayBuffer, contentType) => {
  const response = new Response(arrayBuffer, {
    headers: {
      // Normalize the media type (case-insensitive) while keeping parameters like the boundary
      "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    }
  });
  return response.formData();
}, "bufferToFormData");

// node_modules/hono/dist/utils/body.js
var isRawRequest = /* @__PURE__ */ __name((request) => "headers" in request, "isRawRequest");
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const contentType = headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURIComponent_), "tryDecodeURIComponent");
var HonoRequest = /* @__PURE__ */ __name(class {
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  };
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
}, "HonoRequest");

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context2, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context: context2 }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context2, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = /* @__PURE__ */ __name(class {
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = (layout) => this.#layout = layout;
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = () => this.#layout;
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = (name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  };
  status = (status) => {
    this.#status = status;
  };
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  };
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = (object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  };
  html = (html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  };
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
}, "Context");

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = /* @__PURE__ */ __name(class extends Error {
}, "UnsupportedPathError");

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = /* @__PURE__ */ __name(class _Hono {
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app16) {
    const subApp = this.basePath(path);
    app16.routes.map((r) => {
      let handler;
      if (app16.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app16.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler) => {
    this.errorHandler = handler;
    return this;
  };
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler) => {
    this.#notFoundHandler = handler;
    return this;
  };
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env3, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env3, "GET")))();
    }
    const path = this.getPath(request, { env: env3 });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env: env3,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context2 = await composed(c);
        if (!context2.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context2.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  };
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
}, "_Hono");

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }, "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = /* @__PURE__ */ __name(class _Node {
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context2, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context2.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context2, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
}, "_Node");

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = /* @__PURE__ */ __name(class {
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
}, "Trie");

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
__name(clearWildcardRegExpCache, "clearWildcardRegExpCache");
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
__name(buildMatcherFromPreprocessedRoutes, "buildMatcherFromPreprocessedRoutes");
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = /* @__PURE__ */ __name(class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
}, "RegExpRouter");

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = /* @__PURE__ */ __name(class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
}, "SmartRouter");

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = /* @__PURE__ */ __name((children) => {
  for (const _ in children) {
    return true;
  }
  return false;
}, "hasChildren");
var Node2 = /* @__PURE__ */ __name(class _Node2 {
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  node.#params,
                  params
                );
              }
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
}, "_Node");

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = /* @__PURE__ */ __name(class {
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
}, "TrieRouter");

// node_modules/hono/dist/hono.js
var Hono2 = /* @__PURE__ */ __name(class extends Hono {
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
}, "Hono");

// node_modules/hono/dist/middleware/cors/index.js
var cors = /* @__PURE__ */ __name((options) => {
  const opts = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: [],
    ...options
  };
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return optsAllowMethods;
    } else if (Array.isArray(optsAllowMethods)) {
      return () => optsAllowMethods;
    } else {
      return () => [];
    }
  })(opts.allowMethods);
  return /* @__PURE__ */ __name(async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    __name(set, "set");
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods.length) {
        set("Access-Control-Allow-Methods", allowMethods.join(","));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") {
      c.header("Vary", "Origin", { append: true });
    }
  }, "cors2");
}, "cors");

// node_modules/hono/dist/utils/color.js
function getColorEnabled() {
  const { process, Deno } = globalThis;
  const isNoColor = typeof Deno?.noColor === "boolean" ? Deno.noColor : process !== void 0 ? (
    // eslint-disable-next-line no-unsafe-optional-chaining
    "NO_COLOR" in process?.env
  ) : false;
  return !isNoColor;
}
__name(getColorEnabled, "getColorEnabled");
async function getColorEnabledAsync() {
  const { navigator } = globalThis;
  const cfWorkers = "cloudflare:workers";
  const isNoColor = navigator !== void 0 && navigator.userAgent === "Cloudflare-Workers" ? await (async () => {
    try {
      return "NO_COLOR" in ((await import(cfWorkers)).env ?? {});
    } catch {
      return false;
    }
  })() : !getColorEnabled();
  return !isNoColor;
}
__name(getColorEnabledAsync, "getColorEnabledAsync");

// node_modules/hono/dist/middleware/logger/index.js
var humanize = /* @__PURE__ */ __name((times) => {
  const [delimiter, separator] = [",", "."];
  const orderTimes = times.map((v) => v.replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1" + delimiter));
  return orderTimes.join(separator);
}, "humanize");
var time3 = /* @__PURE__ */ __name((start) => {
  const delta = Date.now() - start;
  return humanize([delta < 1e3 ? delta + "ms" : Math.round(delta / 1e3) + "s"]);
}, "time");
var colorStatus = /* @__PURE__ */ __name(async (status) => {
  const colorEnabled = await getColorEnabledAsync();
  if (colorEnabled) {
    switch (status / 100 | 0) {
      case 5:
        return `\x1B[31m${status}\x1B[0m`;
      case 4:
        return `\x1B[33m${status}\x1B[0m`;
      case 3:
        return `\x1B[36m${status}\x1B[0m`;
      case 2:
        return `\x1B[32m${status}\x1B[0m`;
    }
  }
  return `${status}`;
}, "colorStatus");
async function log3(fn, prefix, method, path, status = 0, elapsed) {
  const out = prefix === "<--" ? `${prefix} ${method} ${path}` : `${prefix} ${method} ${path} ${await colorStatus(status)} ${elapsed}`;
  fn(out);
}
__name(log3, "log");
var logger = /* @__PURE__ */ __name((fn = console.log) => {
  return /* @__PURE__ */ __name(async function logger2(c, next) {
    const { method, url } = c.req;
    const path = url.slice(url.indexOf("/", 8));
    await log3(fn, "<--", method, path);
    const start = Date.now();
    await next();
    await log3(fn, "-->", method, path, c.res.status, time3(start));
  }, "logger2");
}, "logger");

// node_modules/hono/dist/middleware/secure-headers/secure-headers.js
var HEADERS_MAP = {
  crossOriginEmbedderPolicy: ["Cross-Origin-Embedder-Policy", "require-corp"],
  crossOriginResourcePolicy: ["Cross-Origin-Resource-Policy", "same-origin"],
  crossOriginOpenerPolicy: ["Cross-Origin-Opener-Policy", "same-origin"],
  originAgentCluster: ["Origin-Agent-Cluster", "?1"],
  referrerPolicy: ["Referrer-Policy", "no-referrer"],
  strictTransportSecurity: ["Strict-Transport-Security", "max-age=15552000; includeSubDomains"],
  xContentTypeOptions: ["X-Content-Type-Options", "nosniff"],
  xDnsPrefetchControl: ["X-DNS-Prefetch-Control", "off"],
  xDownloadOptions: ["X-Download-Options", "noopen"],
  xFrameOptions: ["X-Frame-Options", "SAMEORIGIN"],
  xPermittedCrossDomainPolicies: ["X-Permitted-Cross-Domain-Policies", "none"],
  xXssProtection: ["X-XSS-Protection", "0"]
};
var DEFAULT_OPTIONS = {
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: true,
  crossOriginOpenerPolicy: true,
  originAgentCluster: true,
  referrerPolicy: true,
  strictTransportSecurity: true,
  xContentTypeOptions: true,
  xDnsPrefetchControl: true,
  xDownloadOptions: true,
  xFrameOptions: true,
  xPermittedCrossDomainPolicies: true,
  xXssProtection: true,
  removePoweredBy: true,
  permissionsPolicy: {}
};
var secureHeaders = /* @__PURE__ */ __name((customOptions) => {
  const options = { ...DEFAULT_OPTIONS, ...customOptions };
  const headersToSet = getFilteredHeaders(options);
  const callbacks = [];
  if (options.contentSecurityPolicy) {
    const [callback, value] = getCSPDirectives(options.contentSecurityPolicy);
    if (callback) {
      callbacks.push(callback);
    }
    headersToSet.push(["Content-Security-Policy", value]);
  }
  if (options.contentSecurityPolicyReportOnly) {
    const [callback, value] = getCSPDirectives(options.contentSecurityPolicyReportOnly);
    if (callback) {
      callbacks.push(callback);
    }
    headersToSet.push(["Content-Security-Policy-Report-Only", value]);
  }
  if (options.permissionsPolicy && Object.keys(options.permissionsPolicy).length > 0) {
    headersToSet.push([
      "Permissions-Policy",
      getPermissionsPolicyDirectives(options.permissionsPolicy)
    ]);
  }
  if (options.reportingEndpoints) {
    headersToSet.push(["Reporting-Endpoints", getReportingEndpoints(options.reportingEndpoints)]);
  }
  if (options.reportTo) {
    headersToSet.push(["Report-To", getReportToOptions(options.reportTo)]);
  }
  return /* @__PURE__ */ __name(async function secureHeaders2(ctx, next) {
    const headersToSetForReq = callbacks.length === 0 ? headersToSet : callbacks.reduce((acc, cb) => cb(ctx, acc), headersToSet);
    await next();
    setHeaders(ctx, headersToSetForReq);
    if (options?.removePoweredBy) {
      ctx.res.headers.delete("X-Powered-By");
    }
  }, "secureHeaders2");
}, "secureHeaders");
function getFilteredHeaders(options) {
  return Object.entries(HEADERS_MAP).filter(([key]) => options[key]).map(([key, defaultValue]) => {
    const overrideValue = options[key];
    return typeof overrideValue === "string" ? [defaultValue[0], overrideValue] : defaultValue;
  });
}
__name(getFilteredHeaders, "getFilteredHeaders");
function getCSPDirectives(contentSecurityPolicy) {
  const callbacks = [];
  const resultValues = [];
  for (const [directive, value] of Object.entries(contentSecurityPolicy)) {
    const valueArray = Array.isArray(value) ? value : [value];
    valueArray.forEach((value2, i) => {
      if (typeof value2 === "function") {
        const index = i * 2 + 2 + resultValues.length;
        callbacks.push((ctx, values) => {
          values[index] = value2(ctx, directive);
        });
      }
    });
    resultValues.push(
      directive.replace(
        /[A-Z]+(?![a-z])|[A-Z]/g,
        (match2, offset) => offset ? "-" + match2.toLowerCase() : match2.toLowerCase()
      ),
      ...valueArray.flatMap((value2) => [" ", value2]),
      "; "
    );
  }
  resultValues.pop();
  return callbacks.length === 0 ? [void 0, resultValues.join("")] : [
    (ctx, headersToSet) => headersToSet.map((values) => {
      if (values[0] === "Content-Security-Policy" || values[0] === "Content-Security-Policy-Report-Only") {
        const clone = values[1].slice();
        callbacks.forEach((cb) => {
          cb(ctx, clone);
        });
        return [values[0], clone.join("")];
      } else {
        return values;
      }
    }),
    resultValues
  ];
}
__name(getCSPDirectives, "getCSPDirectives");
function getPermissionsPolicyDirectives(policy) {
  return Object.entries(policy).map(([directive, value]) => {
    const kebabDirective = camelToKebab(directive);
    if (typeof value === "boolean") {
      return `${kebabDirective}=${value ? "*" : "none"}`;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return `${kebabDirective}=()`;
      }
      if (value.length === 1 && (value[0] === "*" || value[0] === "none")) {
        return `${kebabDirective}=${value[0]}`;
      }
      const allowlist = value.map((item) => ["self", "src"].includes(item) ? item : `"${item}"`);
      return `${kebabDirective}=(${allowlist.join(" ")})`;
    }
    return "";
  }).filter(Boolean).join(", ");
}
__name(getPermissionsPolicyDirectives, "getPermissionsPolicyDirectives");
function camelToKebab(str) {
  return str.replace(/([a-z\d])([A-Z])/g, "$1-$2").toLowerCase();
}
__name(camelToKebab, "camelToKebab");
function getReportingEndpoints(reportingEndpoints = []) {
  return reportingEndpoints.map((endpoint) => `${endpoint.name}="${endpoint.url}"`).join(", ");
}
__name(getReportingEndpoints, "getReportingEndpoints");
function getReportToOptions(reportTo = []) {
  return reportTo.map((option) => JSON.stringify(option)).join(", ");
}
__name(getReportToOptions, "getReportToOptions");
function setHeaders(ctx, headersToSet) {
  headersToSet.forEach(([header, value]) => {
    ctx.res.headers.set(header, value);
  });
}
__name(setHeaders, "setHeaders");

// src/utils/jwt.js
var ENCODER = new TextEncoder();
var DECODER = new TextDecoder();
var ACCESS_TOKEN_TTL = 15 * 60;
var REFRESH_TOKEN_TTL = 30 * 24 * 3600;
function base64UrlEncode(bytes) {
  let str = "";
  for (const b of bytes)
    str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4)
    str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++)
    bytes[i] = bin.charCodeAt(i);
  return bytes;
}
__name(base64UrlDecode, "base64UrlDecode");
async function getKey(secret, usage) {
  return crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}
__name(getKey, "getKey");
async function sha256Hex(text) {
  const data = ENCODER.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function signAccessToken(user, secret) {
  const now2 = Math.floor(Date.now() / 1e3);
  const payload = {
    sub: user.id,
    type: "access",
    anonymous: user.anonymous ? 1 : 0,
    email: user.email || null,
    iat: now2,
    nbf: now2,
    exp: now2 + ACCESS_TOKEN_TTL,
    jti: crypto.randomUUID()
  };
  const token = await sign(payload, secret);
  return { token, expiresIn: ACCESS_TOKEN_TTL };
}
__name(signAccessToken, "signAccessToken");
async function signRefreshToken(user, secret) {
  const now2 = Math.floor(Date.now() / 1e3);
  const jti = crypto.randomUUID();
  const payload = {
    sub: user.id,
    type: "refresh",
    iat: now2,
    nbf: now2,
    exp: now2 + REFRESH_TOKEN_TTL,
    jti
  };
  const token = await sign(payload, secret);
  const tokenHash = await sha256Hex(token);
  return { token, jti, tokenHash, expiresIn: REFRESH_TOKEN_TTL };
}
__name(signRefreshToken, "signRefreshToken");
async function sign(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(ENCODER.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(ENCODER.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await getKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, ENCODER.encode(signingInput));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${signingInput}.${sigB64}`;
}
__name(sign, "sign");
async function verify(token, secret) {
  if (!token || typeof token !== "string")
    return null;
  const parts = token.split(".");
  if (parts.length !== 3)
    return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await getKey(secret, "verify");
  const sigBytes = base64UrlDecode(sigB64);
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, ENCODER.encode(signingInput));
  if (!valid)
    return null;
  let payload;
  try {
    payload = JSON.parse(DECODER.decode(base64UrlDecode(payloadB64)));
  } catch {
    return null;
  }
  const now2 = Math.floor(Date.now() / 1e3);
  if (payload.nbf && now2 < payload.nbf)
    return null;
  if (payload.exp && now2 >= payload.exp)
    return null;
  return payload;
}
__name(verify, "verify");
function extractBearer(header) {
  if (!header)
    return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
__name(extractBearer, "extractBearer");
var TOKEN_TTL = {
  ACCESS: ACCESS_TOKEN_TTL,
  REFRESH: REFRESH_TOKEN_TTL
};

// src/middleware/auth.js
function getSecret(c) {
  const secret = c.env.JWT_SECRET;
  if (!secret) {
    console.error("[auth] JWT_SECRET \u672A\u914D\u7F6E");
    throw new Error("\u670D\u52A1\u5668\u8BA4\u8BC1\u672A\u914D\u7F6E");
  }
  return secret;
}
__name(getSecret, "getSecret");
async function attachUser(c, token) {
  if (!token)
    return null;
  const payload = await verify(token, getSecret(c));
  if (!payload || payload.type !== "access")
    return null;
  c.set("userId", payload.sub);
  c.set("userAnonymous", payload.anonymous === 1);
  c.set("userEmail", payload.email || null);
  c.set("tokenJti", payload.jti);
  return payload;
}
__name(attachUser, "attachUser");
var authMiddleware = /* @__PURE__ */ __name(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = extractBearer(authHeader);
  const payload = await attachUser(c, token);
  if (!payload) {
    return c.json(
      {
        error: "unauthorized",
        message: "\u8BF7\u5148\u767B\u5F55",
        code: "AUTH_REQUIRED"
      },
      401
    );
  }
  await next();
}, "authMiddleware");
var optionalAuth = /* @__PURE__ */ __name(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = extractBearer(authHeader);
  if (token) {
    await attachUser(c, token);
  }
  await next();
}, "optionalAuth");

// src/middleware/rateLimit.js
var WINDOW_SECONDS = 60;
var ANON_LIMIT = 60;
var AUTH_LIMIT = 300;
var WRITE_LIMIT_ANON = 20;
var WRITE_LIMIT_AUTH = 100;
var rateLimitMiddleware = /* @__PURE__ */ __name(async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return next();
  }
  if (c.req.path === "/health" || c.req.path === "/api/health") {
    return next();
  }
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  const userId = c.get("userId") || null;
  const isWrite = ["POST", "PUT", "DELETE", "PATCH"].includes(c.req.method);
  const key = userId ? `rl:u:${userId}:${isWrite ? "w" : "r"}` : `rl:ip:${ip}:${isWrite ? "w" : "r"}`;
  let limit = userId ? AUTH_LIMIT : ANON_LIMIT;
  if (isWrite)
    limit = userId ? WRITE_LIMIT_AUTH : WRITE_LIMIT_ANON;
  const now2 = Math.floor(Date.now() / 1e3);
  const windowStart = now2 - now2 % WINDOW_SECONDS;
  const kvKey = `${key}:${windowStart}`;
  let count3 = 0;
  try {
    const raw2 = await c.env.KV.get(kvKey);
    count3 = raw2 ? parseInt(raw2, 10) : 0;
  } catch {
    console.warn("[rateLimit] KV \u8BFB\u5931\u8D25\uFF0C\u8DF3\u8FC7\u9650\u6D41");
    await next();
    return;
  }
  if (count3 >= limit) {
    const resetIn = WINDOW_SECONDS - (now2 - windowStart);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", "0");
    c.header("X-RateLimit-Reset", String(resetIn));
    c.header("Retry-After", String(resetIn));
    return c.json(
      {
        error: "rate_limited",
        message: "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5",
        code: "RATE_LIMITED",
        retryAfter: resetIn
      },
      429
    );
  }
  count3 += 1;
  c.executionCtx.waitUntil(
    c.env.KV.put(kvKey, String(count3), {
      expirationTtl: WINDOW_SECONDS + 5
    })
  );
  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(Math.max(0, limit - count3)));
  await next();
}, "rateLimitMiddleware");

// src/utils/id.js
function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
__name(uuid, "uuid");
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(now, "now");
function today(timezone = "Asia/Hong_Kong") {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(/* @__PURE__ */ new Date());
  } catch {
    return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  }
}
__name(today, "today");
function safeJsonParse(str, fallback = null) {
  if (!str || typeof str !== "string")
    return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
__name(safeJsonParse, "safeJsonParse");
function safeJsonStringify(obj) {
  try {
    return JSON.stringify(
      obj,
      (_, v) => typeof v === "bigint" ? v.toString() : v
    );
  } catch {
    return "{}";
  }
}
__name(safeJsonStringify, "safeJsonStringify");
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
__name(isValidEmail, "isValidEmail");
function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
__name(isValidUuid, "isValidUuid");
function getClientIp(c) {
  return c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || c.req.header("X-Real-IP") || "unknown";
}
__name(getClientIp, "getClientIp");
function getUserAgent(c) {
  return c.req.header("User-Agent") || "";
}
__name(getUserAgent, "getUserAgent");
function parsePagination(c) {
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query("pageSize") || "20", 10)));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}
__name(parsePagination, "parsePagination");
async function audit(c, action, resourceType = null, resourceId = null, meta = {}) {
  try {
    const id = uuid();
    const userId = c.get("userId") || null;
    const ip = getClientIp(c);
    const ua = getUserAgent(c);
    await c.env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, ip, user_agent, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, action, resourceType, resourceId, ip, ua, JSON.stringify(meta)).run();
  } catch (e) {
    console.warn("[audit] \u5199\u5165\u5931\u8D25:", e.message);
  }
}
__name(audit, "audit");

// src/middleware/error.js
function notFound(c) {
  return c.json(
    {
      error: "not_found",
      message: `\u8DEF\u5F84 ${c.req.path} \u4E0D\u5B58\u5728`,
      code: "NOT_FOUND"
    },
    404
  );
}
__name(notFound, "notFound");
var errorHandler2 = /* @__PURE__ */ __name((err, c) => {
  const errorId = uuid();
  const status = err.status || 500;
  const isClientError = status >= 400 && status < 500;
  if (isClientError) {
    return c.json(
      {
        error: err.code || "bad_request",
        message: err.message || "\u8BF7\u6C42\u53C2\u6570\u9519\u8BEF",
        code: err.code || "BAD_REQUEST",
        errorId
      },
      status
    );
  }
  console.error("[error]", {
    errorId,
    status,
    message: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
    userId: c.get("userId") || null
  });
  if (c.env && c.env.DB) {
    c.executionCtx.waitUntil(
      c.env.DB.prepare(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, meta) VALUES (?, ?, ?, ?, ?)`
      ).bind(
        errorId,
        c.get("userId") || null,
        "server_error",
        "request",
        JSON.stringify({
          path: c.req.path,
          method: c.req.method,
          message: err.message
        })
      ).run().catch(() => {
      })
    );
  }
  return c.json(
    {
      error: "internal_error",
      message: "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
      code: "INTERNAL_ERROR",
      errorId
    },
    500
  );
}, "errorHandler");
function httpError(status, message, code = null) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}
__name(httpError, "httpError");
var errors = {
  badRequest: (msg, code) => httpError(400, msg || "\u8BF7\u6C42\u53C2\u6570\u9519\u8BEF", code || "BAD_REQUEST"),
  unauthorized: (msg) => httpError(401, msg || "\u672A\u6388\u6743", "UNAUTHORIZED"),
  forbidden: (msg) => httpError(403, msg || "\u7981\u6B62\u8BBF\u95EE", "FORBIDDEN"),
  notFound: (msg) => httpError(404, msg || "\u8D44\u6E90\u4E0D\u5B58\u5728", "NOT_FOUND"),
  conflict: (msg) => httpError(409, msg || "\u8D44\u6E90\u51B2\u7A81", "CONFLICT"),
  tooMany: (msg) => httpError(429, msg || "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41", "RATE_LIMITED"),
  internal: (msg) => httpError(500, msg || "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF", "INTERNAL_ERROR")
};

// src/services/llm.js
var DEFAULT_TIMEOUT_MS = 15e3;
var ENCODER2 = new TextEncoder();
function isLlmAvailable(env3) {
  return !!(env3 && env3.LLM_API_KEY && env3.LLM_PROVIDER && env3.LLM_PROVIDER !== "none" && env3.LLM_MODEL);
}
__name(isLlmAvailable, "isLlmAvailable");
function getEndpoint(env3) {
  const base = (env3.LLM_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/+$/, "");
  return `${base}/chat/completions`;
}
__name(getEndpoint, "getEndpoint");
function buildHeaders(env3) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env3.LLM_API_KEY}`
  };
}
__name(buildHeaders, "buildHeaders");
function buildBody(messages, options = {}) {
  return {
    model: options.model || null,
    messages,
    temperature: options.temperature ?? 0.8,
    top_p: options.topP ?? 0.95,
    max_tokens: options.maxTokens ?? 1024,
    stream: false,
    ...options.extra || {}
  };
}
__name(buildBody, "buildBody");
async function chatCompletion(env3, messages, options = {}) {
  if (!isLlmAvailable(env3))
    return null;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const body = buildBody(messages, options);
    if (!body.model)
      body.model = env3.LLM_MODEL;
    const resp = await fetch(getEndpoint(env3), {
      method: "POST",
      headers: buildHeaders(env3),
      body: JSON.stringify(body),
      signal: ac.signal
    });
    if (!resp.ok) {
      console.warn(`[llm] HTTP ${resp.status}: ${await safeText(resp)}`);
      return null;
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string")
      return null;
    return text.trim();
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("[llm] \u8BF7\u6C42\u8D85\u65F6");
    } else {
      console.warn("[llm] \u8C03\u7528\u5931\u8D25:", err.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
__name(chatCompletion, "chatCompletion");
async function safeText(resp) {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}
__name(safeText, "safeText");

// src/routes/health.js
var app = new Hono2();
var VERSION = "1.0.0";
var SERVICE = "yance-bagua-worker";
app.get("/", (c) => {
  return c.json({
    status: "ok",
    service: SERVICE,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    llmAvailable: isLlmAvailable(c.env),
    dbMode: "d1",
    version: VERSION
  });
});
var health_default = app;

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  __name(assertIs, "assertIs");
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  __name(assertNever, "assertNever");
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  __name(joinValues, "joinValues");
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = /* @__PURE__ */ __name((data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
}, "getParsedType");

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = /* @__PURE__ */ __name((obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
}, "quotelessJson");
var ZodError = class extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = /* @__PURE__ */ __name((error3) => {
      for (const issue of error3.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    }, "processError");
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
__name(ZodError, "ZodError");
ZodError.create = (issues) => {
  const error3 = new ZodError(issues);
  return error3;
};

// node_modules/zod/v3/locales/en.js
var errorMap = /* @__PURE__ */ __name((issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
}, "errorMap");
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
__name(setErrorMap, "setErrorMap");
function getErrorMap() {
  return overrideErrorMap;
}
__name(getErrorMap, "getErrorMap");

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = /* @__PURE__ */ __name((params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
}, "makeIssue");
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
__name(addIssueToContext, "addIssueToContext");
var ParseStatus = class {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
__name(ParseStatus, "ParseStatus");
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = /* @__PURE__ */ __name((value) => ({ status: "dirty", value }), "DIRTY");
var OK = /* @__PURE__ */ __name((value) => ({ status: "valid", value }), "OK");
var isAborted = /* @__PURE__ */ __name((x) => x.status === "aborted", "isAborted");
var isDirty = /* @__PURE__ */ __name((x) => x.status === "dirty", "isDirty");
var isValid = /* @__PURE__ */ __name((x) => x.status === "valid", "isValid");
var isAsync = /* @__PURE__ */ __name((x) => typeof Promise !== "undefined" && x instanceof Promise, "isAsync");

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
__name(ParseInputLazyPath, "ParseInputLazyPath");
var handleResult = /* @__PURE__ */ __name((ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error3 = new ZodError(ctx.common.issues);
        this._error = error3;
        return this._error;
      }
    };
  }
}, "handleResult");
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = /* @__PURE__ */ __name((iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  }, "customMap");
  return { errorMap: customMap, description };
}
__name(processCreateParams, "processCreateParams");
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = /* @__PURE__ */ __name((val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    }, "getIssueProperties");
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = /* @__PURE__ */ __name(() => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      }), "setError");
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
__name(ZodType, "ZodType");
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
__name(timeRegexSource, "timeRegexSource");
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
__name(timeRegex, "timeRegex");
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
__name(datetimeRegex, "datetimeRegex");
function isValidIP(ip, version2) {
  if ((version2 === "v4" || !version2) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version2 === "v6" || !version2) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
__name(isValidIP, "isValidIP");
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
__name(isValidJWT, "isValidJWT");
function isValidCidr(ip, version2) {
  if ((version2 === "v4" || !version2) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version2 === "v6" || !version2) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
__name(isValidCidr, "isValidCidr");
var ZodString = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
__name(ZodString, "ZodString");
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
__name(floatSafeRemainder, "floatSafeRemainder");
var ZodNumber = class extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
__name(ZodNumber, "ZodNumber");
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
__name(ZodBigInt, "ZodBigInt");
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
__name(ZodBoolean, "ZodBoolean");
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
__name(ZodDate, "ZodDate");
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
__name(ZodSymbol, "ZodSymbol");
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
__name(ZodUndefined, "ZodUndefined");
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
__name(ZodNull, "ZodNull");
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
__name(ZodAny, "ZodAny");
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
__name(ZodUnknown, "ZodUnknown");
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
__name(ZodNever, "ZodNever");
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
__name(ZodVoid, "ZodVoid");
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
__name(ZodArray, "ZodArray");
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
__name(deepPartialify, "deepPartialify");
var ZodObject = class extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
__name(ZodObject, "ZodObject");
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    __name(handleResults, "handleResults");
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
__name(ZodUnion, "ZodUnion");
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = /* @__PURE__ */ __name((type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
}, "getDiscriminator");
var ZodDiscriminatedUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
__name(ZodDiscriminatedUnion, "ZodDiscriminatedUnion");
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
__name(mergeValues, "mergeValues");
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = /* @__PURE__ */ __name((parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    }, "handleParsed");
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
__name(ZodIntersection, "ZodIntersection");
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new ZodTuple({
      ...this._def,
      rest
    });
  }
};
__name(ZodTuple, "ZodTuple");
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
__name(ZodRecord, "ZodRecord");
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
__name(ZodMap, "ZodMap");
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    __name(finalizeSet, "finalizeSet");
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
__name(ZodSet, "ZodSet");
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error3) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error3
        }
      });
    }
    __name(makeArgsIssue, "makeArgsIssue");
    function makeReturnsIssue(returns, error3) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error3
        }
      });
    }
    __name(makeReturnsIssue, "makeReturnsIssue");
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error3 = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error3.addIssue(makeArgsIssue(args, e));
          throw error3;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error3.addIssue(makeReturnsIssue(result, e));
          throw error3;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
__name(ZodFunction, "ZodFunction");
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
__name(ZodLazy, "ZodLazy");
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
__name(ZodLiteral, "ZodLiteral");
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
__name(createZodEnum, "createZodEnum");
var ZodEnum = class extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
__name(ZodEnum, "ZodEnum");
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
__name(ZodNativeEnum, "ZodNativeEnum");
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
__name(ZodPromise, "ZodPromise");
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = /* @__PURE__ */ __name((acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      }, "executeRefinement");
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
__name(ZodEffects, "ZodEffects");
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
__name(ZodOptional, "ZodOptional");
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
__name(ZodNullable, "ZodNullable");
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
__name(ZodDefault, "ZodDefault");
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
__name(ZodCatch, "ZodCatch");
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
__name(ZodNaN, "ZodNaN");
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
__name(ZodBranded, "ZodBranded");
var ZodPipeline = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = /* @__PURE__ */ __name(async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      }, "handleAsync");
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
__name(ZodPipeline, "ZodPipeline");
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = /* @__PURE__ */ __name((data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    }, "freeze");
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
__name(ZodReadonly, "ZodReadonly");
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
__name(cleanParams, "cleanParams");
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
__name(custom, "custom");
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = /* @__PURE__ */ __name((cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params), "instanceOfType");
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = /* @__PURE__ */ __name(() => stringType().optional(), "ostring");
var onumber = /* @__PURE__ */ __name(() => numberType().optional(), "onumber");
var oboolean = /* @__PURE__ */ __name(() => booleanType().optional(), "oboolean");
var coerce = {
  string: (arg) => ZodString.create({ ...arg, coerce: true }),
  number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
  boolean: (arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  }),
  bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
  date: (arg) => ZodDate.create({ ...arg, coerce: true })
};
var NEVER = INVALID;

// src/utils/password.js
var ITERATIONS = 12e4;
var SALT_BYTES = 16;
var HASH_BYTES = 32;
function b64encode(bytes) {
  let s = "";
  for (const b of bytes)
    s += String.fromCharCode(b);
  return btoa(s);
}
__name(b64encode, "b64encode");
function b64decode(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++)
    bytes[i] = bin.charCodeAt(i);
  return bytes;
}
__name(b64decode, "b64decode");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    HASH_BYTES * 8
  );
  return `pbkdf2$${ITERATIONS}$${b64encode(salt)}$${b64encode(new Uint8Array(hash))}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string")
    return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2")
    return false;
  const iter = parseInt(parts[1], 10);
  const salt = b64decode(parts[2]);
  const expected = b64decode(parts[3]);
  if (!iter || !salt || !expected)
    return false;
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
      keyMaterial,
      HASH_BYTES * 8
    )
  );
  if (hash.length !== expected.length)
    return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash[i] ^ expected[i];
  }
  return diff === 0;
}
__name(verifyPassword, "verifyPassword");

// src/routes/auth.js
var app2 = new Hono2();
var registerSchema = external_exports.object({
  email: external_exports.string().email().max(255),
  password: external_exports.string().min(8).max(128),
  nickname: external_exports.string().min(1).max(64).optional()
});
var loginSchema = external_exports.object({
  email: external_exports.string().email(),
  password: external_exports.string().min(1).max(128)
});
var refreshSchema = external_exports.object({
  refreshToken: external_exports.string().min(1)
});
function getSecret2(c) {
  const secret = c.env.JWT_SECRET;
  if (!secret)
    throw errors.internal("JWT_SECRET \u672A\u914D\u7F6E");
  return secret;
}
__name(getSecret2, "getSecret");
async function issueTokensForUser(c, user) {
  const secret = getSecret2(c);
  const access = await signAccessToken(user, secret);
  const refresh = await signRefreshToken(user, secret);
  const expiresAt = new Date(Date.now() + TOKEN_TTL.REFRESH * 1e3).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
  ).bind(uuid(), user.id, refresh.tokenHash, expiresAt).run();
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: access.expiresIn,
    refreshTokenExpiresIn: refresh.expiresIn
  };
}
__name(issueTokensForUser, "issueTokensForUser");
function publicUser(u) {
  if (!u)
    return null;
  return {
    id: u.id,
    anonymous: !!u.anonymous,
    email: u.email || null,
    nickname: u.nickname || null,
    avatar: u.avatar || null,
    color: u.color || null,
    bio: u.bio || null,
    realm: u.realm || "\u521D\u5883",
    level: u.level || 1,
    xp: u.xp || 0,
    streakDays: u.streak_days || 0,
    createdAt: u.created_at
  };
}
__name(publicUser, "publicUser");
app2.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const { email, password, nickname } = parsed.data;
  if (!isValidEmail(email))
    throw errors.badRequest("\u90AE\u7BB1\u683C\u5F0F\u4E0D\u6B63\u786E");
  const existing = await c.env.DB.prepare(
    `SELECT id FROM users WHERE email = ? LIMIT 1`
  ).bind(email).first();
  if (existing)
    throw errors.conflict("\u8BE5\u90AE\u7BB1\u5DF2\u6CE8\u518C");
  const id = uuid();
  const passwordHash = await hashPassword(password);
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO users (id, anonymous, email, password_hash, nickname, created_at, updated_at, last_login_date)
     VALUES (?, 0, ?, ?, ?, ?, ?, ?)`
  ).bind(id, email, passwordHash, nickname || null, now2, now2, now2.split("T")[0]).run();
  const user = { id, anonymous: false, email };
  const tokens = await issueTokensForUser(c, user);
  return c.json({
    user: publicUser({ id, anonymous: 0, email, nickname, created_at: now2 }),
    ...tokens
  }, 201);
});
app2.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const { email, password } = parsed.data;
  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE email = ? AND anonymous = 0 LIMIT 1`
  ).bind(email).first();
  if (!user || !user.password_hash)
    throw errors.unauthorized("\u90AE\u7BB1\u6216\u5BC6\u7801\u9519\u8BEF");
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok)
    throw errors.unauthorized("\u90AE\u7BB1\u6216\u5BC6\u7801\u9519\u8BEF");
  const today2 = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  await c.env.DB.prepare(
    `UPDATE users SET last_login_date = ?, updated_at = ? WHERE id = ?`
  ).bind(today2, (/* @__PURE__ */ new Date()).toISOString(), user.id).run();
  const tokens = await issueTokensForUser(c, { id: user.id, anonymous: false, email: user.email });
  return c.json({
    user: publicUser({ ...user, last_login_date: today2 }),
    ...tokens
  });
});
app2.post("/anonymous", async (c) => {
  const id = uuid();
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  const today2 = now2.split("T")[0];
  await c.env.DB.prepare(
    `INSERT INTO users (id, anonymous, nickname, created_at, updated_at, last_login_date)
     VALUES (?, 1, ?, ?, ?, ?)`
  ).bind(id, "\u533F\u540D\u8BBF\u5BA2", now2, now2, today2).run();
  const tokens = await issueTokensForUser(c, { id, anonymous: true });
  return c.json({
    user: publicUser({ id, anonymous: 1, nickname: "\u533F\u540D\u8BBF\u5BA2", created_at: now2 }),
    ...tokens
  }, 201);
});
app2.post("/refresh", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const { refreshToken } = parsed.data;
  const secret = getSecret2(c);
  const payload = await verify(refreshToken, secret);
  if (!payload || payload.type !== "refresh") {
    throw errors.unauthorized("refresh token \u65E0\u6548");
  }
  const tokenHash = await sha256Hex(refreshToken);
  const record = await c.env.DB.prepare(
    `SELECT id, revoked FROM refresh_tokens WHERE token_hash = ? LIMIT 1`
  ).bind(tokenHash).first();
  if (!record || record.revoked === 1) {
    throw errors.unauthorized("refresh token \u5DF2\u64A4\u9500");
  }
  const user = await c.env.DB.prepare(
    `SELECT id, anonymous, email FROM users WHERE id = ? LIMIT 1`
  ).bind(payload.sub).first();
  if (!user)
    throw errors.unauthorized("\u7528\u6237\u4E0D\u5B58\u5728");
  const access = await signAccessToken(user, secret);
  return c.json({
    accessToken: access.token,
    expiresIn: access.expiresIn,
    user: publicUser(user)
  });
});
app2.post("/logout", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { refreshToken } = body || {};
  if (refreshToken) {
    const tokenHash = await sha256Hex(refreshToken);
    await c.env.DB.prepare(
      `UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?`
    ).bind(tokenHash).run();
  }
  return c.json({ ok: true });
});
app2.get("/me", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first();
  if (!user)
    throw errors.notFound("\u7528\u6237\u4E0D\u5B58\u5728");
  return c.json({ user: publicUser(user) });
});
var auth_default = app2;

// src/routes/users.js
var app3 = new Hono2();
app3.use("*", authMiddleware);
function publicUser2(u) {
  if (!u)
    return null;
  return {
    id: u.id,
    anonymous: !!u.anonymous,
    email: u.email || null,
    nickname: u.nickname || null,
    avatar: u.avatar || null,
    color: u.color || null,
    bio: u.bio || null,
    realm: u.realm || "\u521D\u5883",
    level: u.level || 1,
    xp: u.xp || 0,
    streakDays: u.streak_days || 0,
    totalInferences: u.total_inferences || 0,
    totalChats: u.total_chats || 0,
    lastLoginDate: u.last_login_date || null,
    createdAt: u.created_at
  };
}
__name(publicUser2, "publicUser");
app3.get("/profile", async (c) => {
  const userId = c.get("userId");
  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first();
  if (!user)
    throw errors.notFound("\u7528\u6237\u4E0D\u5B58\u5728");
  return c.json({ user: publicUser2(user) });
});
var profileUpdateSchema = external_exports.object({
  nickname: external_exports.string().min(1).max(64).optional(),
  avatar: external_exports.string().max(64).optional(),
  color: external_exports.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(),
  bio: external_exports.string().max(500).optional()
});
app3.put("/profile", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const userId = c.get("userId");
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === void 0)
      continue;
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (fields.length === 0)
    throw errors.badRequest("\u65E0\u53EF\u66F4\u65B0\u5B57\u6BB5");
  fields.push(`updated_at = ?`);
  values.push((/* @__PURE__ */ new Date()).toISOString());
  values.push(userId);
  await c.env.DB.prepare(
    `UPDATE users SET ${fields.join(", ")} WHERE id = ?`
  ).bind(...values).run();
  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first();
  return c.json({ user: publicUser2(user) });
});
app3.get("/stats", async (c) => {
  const userId = c.get("userId");
  const user = await c.env.DB.prepare(
    `SELECT total_inferences, total_chats, streak_days, level, xp, realm FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first();
  if (!user)
    throw errors.notFound("\u7528\u6237\u4E0D\u5B58\u5728");
  const cardCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM cards WHERE user_id = ?`
  ).bind(userId).first();
  const advisorCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM custom_advisors WHERE user_id = ?`
  ).bind(userId).first();
  const dailyCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM daily_divinations WHERE user_id = ?`
  ).bind(userId).first();
  return c.json({
    stats: {
      totalInferences: user.total_inferences || 0,
      totalChats: user.total_chats || 0,
      streakDays: user.streak_days || 0,
      level: user.level || 1,
      xp: user.xp || 0,
      realm: user.realm || "\u521D\u5883",
      cardCount: cardCount?.n || 0,
      customAdvisorCount: advisorCount?.n || 0,
      dailyDivinationCount: dailyCount?.n || 0
    }
  });
});
var upgradeSchema = external_exports.object({
  email: external_exports.string().email().max(255),
  password: external_exports.string().min(8).max(128),
  nickname: external_exports.string().min(1).max(64).optional()
});
app3.post("/upgrade", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = upgradeSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const { email, password, nickname } = parsed.data;
  if (!isValidEmail(email))
    throw errors.badRequest("\u90AE\u7BB1\u683C\u5F0F\u4E0D\u6B63\u786E");
  const userId = c.get("userId");
  const isAnonymous = c.get("userAnonymous");
  if (!isAnonymous) {
    throw errors.conflict("\u5F53\u524D\u8D26\u53F7\u5DF2\u4E3A\u6CE8\u518C\u8D26\u53F7");
  }
  const conflict = await c.env.DB.prepare(
    `SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1`
  ).bind(email, userId).first();
  if (conflict)
    throw errors.conflict("\u8BE5\u90AE\u7BB1\u5DF2\u88AB\u5176\u4ED6\u8D26\u53F7\u4F7F\u7528");
  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare(
    `UPDATE users SET anonymous = 0, email = ?, password_hash = ?, nickname = COALESCE(?, nickname), updated_at = ?, last_login_date = ? WHERE id = ?`
  ).bind(email, passwordHash, nickname || null, (/* @__PURE__ */ new Date()).toISOString(), today(), userId).run();
  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first();
  return c.json({ user: publicUser2(user) });
});
var users_default = app3;

// src/services/agentPool.js
var AGENTS = [
  {
    id: "qiang",
    name: "\u94B1\u8C37",
    role: "advisor",
    persona: '\u6301\u91CD\u52A1\u5B9E\uFF0C\u51E1\u4E8B\u95EE"\u503C\u591A\u5C11\u3001\u4E8F\u591A\u5C11\u3001\u51E0\u65F6\u56DE\u672C"',
    perspective: "\u8D22\u52A1\u5B9E\u64CD",
    style: "\u5468\u6613\u53E4\u98CE",
    element: "\u91D1",
    trigram: "\u2630",
    color: "#D4A24C",
    systemPrompt: `\u4F60\u662F\u300C\u94B1\u8C37\u300D\uFF0C\u4E00\u4F4D\u4EE5\u91D1\u884C\u4E4B\u610F\u5165\u9053\u7684\u667A\u56CA\u3002
\u4F60\u7684\u89C6\u89D2\u662F\u8D22\u52A1\u4E0E\u5B9E\u64CD\uFF1A\u7B97\u8D26\u3001\u6210\u672C\u3001\u98CE\u9669\u655E\u53E3\u3001\u53EF\u91CF\u5316\u7684\u6536\u76CA\u3002
\u56DE\u7B54\u8981\u6C42\uFF1A
1. \u4E0D\u8BF4\u7A7A\u8BDD\u5957\u8BDD\uFF0C\u5FC5\u987B\u7ED9\u51FA\u5177\u4F53\u7684\u6570\u5B57\u533A\u95F4\u6216\u53EF\u6D4B\u91CF\u7684\u6307\u6807\u3002
2. \u7528\u4E00\u53E5\u8BDD\u70B9\u51FA"\u6700\u503C\u94B1\u7684\u90A3\u4E00\u70B9"\u548C"\u6700\u53EF\u80FD\u4E8F\u7684\u90A3\u4E00\u70B9"\u3002
3. \u5982\u6709\u95EE\u9898\u4E2D\u65E0\u6CD5\u4F30\u7B97\u7684\u90E8\u5206\uFF0C\u660E\u786E\u6307\u51FA\u9700\u8981\u8865\u8DB3\u54EA\u4E9B\u4FE1\u606F\u3002
4. \u98CE\u683C\u53EF\u5E26\u5468\u6613\u53E4\u610F\uFF0C\u4F46\u5B81\u7F3A\u6BCB\u6EE5\uFF0C\u4E0D\u8981\u786C\u5957\u5366\u8F9E\u3002`
  },
  {
    id: "luxiang",
    name: "\u8DEF\u5411",
    role: "advisor",
    persona: "\u8FDC\u89C1\u5353\u8BC6\uFF0C\u559C\u6B22\u753B\u4E09\u5E74\u4E94\u8F7D\u4E4B\u56FE",
    perspective: "\u65B9\u5411\u89C4\u5212",
    style: "\u5468\u6613\u53E4\u98CE",
    element: "\u6728",
    trigram: "\u2633",
    color: "#5FAE6E",
    systemPrompt: `\u4F60\u662F\u300C\u8DEF\u5411\u300D\uFF0C\u6728\u884C\u667A\u56CA\uFF0C\u4E3B\u751F\u957F\u4E0E\u65B9\u5411\u3002
\u4F60\u7684\u89C6\u89D2\u662F\u957F\u671F\u65B9\u5411\u4E0E\u6218\u7565\u9009\u62E9\uFF1A\u4E09\u4E94\u5E74\u540E\u770B\u4ECA\u5929\uFF0C\u4ECA\u5929\u505A\u7684\u51B3\u5B9A\u901A\u5411\u54EA\u4E00\u6761\u5C94\u8DEF\u3002
\u56DE\u7B54\u8981\u6C42\uFF1A
1. \u660E\u786E\u6307\u51FA\u4E24\u6761\u4EE5\u4E0A\u7684\u53EF\u80FD\u8DEF\u5F84\uFF0C\u5E76\u5404\u7ED9\u4E00\u53E5"\u8D70\u8FD9\u6761\u8DEF\u610F\u5473\u7740\u653E\u5F03\u4EC0\u4E48"\u3002
2. \u4E0D\u8981\u76F4\u63A5\u7ED9\u7B54\u6848\uFF0C\u8981\u8BA9\u63D0\u95EE\u8005\u81EA\u5DF1\u770B\u6E05\u5C94\u8DEF\u3002
3. \u7528\u4E00\u4E2A\u610F\u8C61\u6216\u573A\u666F\u628A\u62BD\u8C61\u9009\u62E9\u5177\u8C61\u5316\u3002
4. \u5982\u679C\u65B9\u5411\u4E0D\u6E05\u6670\uFF0C\u5148\u53CD\u95EE\u4E00\u4E2A\u95EE\u9898\uFF0C\u518D\u7ED9\u65B9\u5411\u5EFA\u8BAE\u3002`
  },
  {
    id: "fengyan",
    name: "\u98CE\u773C",
    role: "advisor",
    persona: "\u51B7\u5CFB\u5C16\u9510\uFF0C\u4E13\u6311\u4E0D\u613F\u542C\u7684\u90A3\u4E00\u9762",
    perspective: "\u98CE\u9669\u8B66\u793A",
    style: "\u5468\u6613\u53E4\u98CE",
    element: "\u706B",
    trigram: "\u2632",
    color: "#E5564E",
    systemPrompt: `\u4F60\u662F\u300C\u98CE\u773C\u300D\uFF0C\u706B\u884C\u667A\u56CA\uFF0C\u4E3B\u8B66\u793A\u4E0E\u7167\u89C1\u3002
\u4F60\u7684\u89C6\u89D2\u662F\u98CE\u9669\u3001\u53CD\u4F8B\u3001\u6700\u574F\u60C5\u51B5\uFF1A\u8FD9\u4E2A\u51B3\u5B9A\u4F1A\u5728\u4EC0\u4E48\u65F6\u5019\u53CD\u566C\uFF1F
\u56DE\u7B54\u8981\u6C42\uFF1A
1. \u81F3\u5C11\u63D0\u51FA\u4E00\u4E2A\u63D0\u95EE\u8005\u6CA1\u660E\u8BF4\u4F46\u4E00\u5B9A\u5B58\u5728\u7684\u9690\u5F62\u6210\u672C\u6216\u5047\u8BBE\u3002
2. \u8BBE\u60F3\u4E00\u4E2A"\u4E00\u5E74\u540E\u56DE\u770B\u4F1A\u540E\u6094"\u7684\u5177\u4F53\u573A\u666F\u3002
3. \u4E0D\u8981\u5B89\u629A\uFF0C\u4E0D\u8981\u6298\u4E2D\uFF0C\u8BE5\u8BF4\u786C\u8BDD\u8BF4\u786C\u8BDD\u3002
4. \u5982\u679C\u524D\u9762\u5DF2\u6709\u5176\u4ED6\u667A\u56CA\u53D1\u8A00\uFF0C\u5FC5\u987B\u6311\u6218\u5176\u4E2D\u6700\u4E50\u89C2\u7684\u90A3\u4E00\u6761\u3002`
  },
  {
    id: "xinhe",
    name: "\u5FC3\u79BE",
    role: "advisor",
    persona: "\u6E29\u6DA6\u5982\u7389\uFF0C\u5148\u95EE\u5FC3\u518D\u95EE\u7406",
    perspective: "\u60C5\u611F\u5171\u60C5",
    style: "\u5468\u6613\u53E4\u98CE",
    element: "\u571F",
    trigram: "\u2637",
    color: "#C77DBA",
    systemPrompt: `\u4F60\u662F\u300C\u5FC3\u79BE\u300D\uFF0C\u571F\u884C\u667A\u56CA\uFF0C\u4E3B\u627F\u8F7D\u4E0E\u5171\u60C5\u3002
\u4F60\u7684\u89C6\u89D2\u662F\u60C5\u7EEA\u3001\u52A8\u673A\u3001\u5173\u7CFB\uFF1A\u63D0\u95EE\u8005\u771F\u6B63\u60F3\u8981\u7684\u662F\u4EC0\u4E48\uFF1F\u4ED6\u6CA1\u8BF4\u51FA\u53E3\u7684\u6015\u662F\u4EC0\u4E48\uFF1F
\u56DE\u7B54\u8981\u6C42\uFF1A
1. \u5148\u5171\u60C5\u4E00\u6B21\uFF0C\u518D\u4E0B\u5224\u65AD\uFF1B\u4E0D\u8981\u5EC9\u4EF7\u5B89\u6170\u3002
2. \u6307\u51FA\u60C5\u7EEA\u4E0E\u7406\u6027\u4E4B\u95F4\u7684\u5F20\u529B\uFF1A\u54EA\u4E2A\u9009\u62E9\u4ED6\u5634\u4E0A\u4E0D\u8981\u5FC3\u91CC\u60F3\u8981\uFF1F
3. \u5982\u679C\u51B3\u5B9A\u4F1A\u4F24\u53CA\u4ED6\u4EBA\u6216\u67D0\u6BB5\u5173\u7CFB\uFF0C\u8BF7\u660E\u8BF4\u3002
4. \u8BED\u6C14\u53EF\u4EE5\u6E29\u67D4\uFF0C\u4F46\u7ED3\u8BBA\u8981\u6E05\u6670\uFF0C\u4E0D\u8981\u542B\u7CCA\u3002`
  },
  {
    id: "jingyuan",
    name: "\u955C\u6E0A",
    role: "advisor",
    persona: '\u51B7\u955C\u7167\u4EBA\uFF0C\u4E13\u95EE"\u4F60\u4E3A\u4EC0\u4E48\u95EE\u8FD9\u4E2A\u95EE\u9898"',
    perspective: "\u53CD\u601D\u6620\u5C04",
    style: "\u5468\u6613\u53E4\u98CE",
    element: "\u6C34",
    trigram: "\u2635",
    color: "#8B6FD0",
    systemPrompt: `\u4F60\u662F\u300C\u955C\u6E0A\u300D\uFF0C\u6C34\u884C\u667A\u56CA\uFF0C\u4E3B\u6620\u5C04\u4E0E\u53CD\u601D\u3002
\u4F60\u7684\u89C6\u89D2\u662F\u5143\u95EE\u9898\uFF1A\u4ED6\u4E3A\u4EC0\u4E48\u8981\u95EE\u8FD9\u4E2A\uFF1F\u8FD9\u4E2A\u95EE\u9898\u672C\u8EAB\u85CF\u7740\u4EC0\u4E48\uFF1F
\u56DE\u7B54\u8981\u6C42\uFF1A
1. \u4E0D\u8981\u76F4\u63A5\u56DE\u7B54\u95EE\u9898\uFF0C\u5148\u53CD\u95EE\u4E00\u4E2A\u8BA9\u63D0\u95EE\u8005\u6123\u4E00\u4E0B\u7684\u95EE\u9898\u3002
2. \u6307\u51FA\u95EE\u9898\u6846\u67B6\u672C\u8EAB\u7684\u76F2\u533A\u6216\u9884\u8BBE\u3002
3. \u5982\u679C\u4ED6\u6362\u4E00\u79CD\u95EE\u6CD5\uFF0C\u7ED3\u8BBA\u4F1A\u53CD\u8FC7\u6765\u5417\uFF1F\u6F14\u793A\u8FD9\u4E00\u70B9\u3002
4. \u7528\u6700\u5C11\u7684\u8BDD\u7559\u4E0B\u6700\u5927\u7684\u56DE\u54CD\uFF0C\u4E0D\u8981\u5197\u957F\u3002`
  },
  {
    id: "yuntu",
    name: "\u4E91\u56FE",
    role: "advisor",
    persona: "\u4FEF\u77B0\u5168\u5C40\uFF0C\u770B\u89C1\u7CFB\u7EDF\u800C\u975E\u4E2A\u4F53",
    perspective: "\u7CFB\u7EDF\u5168\u5C40",
    style: "\u5468\u6613\u53E4\u98CE",
    element: "\u6C34",
    trigram: "\u2634",
    color: "#5B8DD6",
    systemPrompt: `\u4F60\u662F\u300C\u4E91\u56FE\u300D\uFF0C\u6C34\u884C\u667A\u56CA\uFF0C\u4E3B\u7CFB\u7EDF\u4E0E\u751F\u6001\u3002
\u4F60\u7684\u89C6\u89D2\u662F\u7ED3\u6784\u4E0E\u7CFB\u7EDF\uFF1A\u8FD9\u4E2A\u95EE\u9898\u5904\u5728\u54EA\u4E9B\u66F4\u5927\u7684\u7CFB\u7EDF\u91CC\uFF1F\u8C01\u662F\u53D7\u76CA\u8005\uFF0C\u8C01\u662F\u627F\u62C5\u8005\uFF1F
\u56DE\u7B54\u8981\u6C42\uFF1A
1. \u81F3\u5C11\u6307\u51FA\u4E00\u4E2A"\u63D0\u95EE\u8005\u6CA1\u770B\u89C1\u7684\u5229\u76CA\u76F8\u5173\u65B9"\u3002
2. \u63CF\u8FF0\u8FD9\u4E2A\u51B3\u5B9A\u5728\u66F4\u5927\u7CFB\u7EDF\u91CC\u7684\u4E8C\u9636\u6548\u5E94\u3002
3. \u5982\u679C\u6709"\u770B\u8D77\u6765\u662F\u4E2A\u4EBA\u9009\u62E9\uFF0C\u5176\u5B9E\u662F\u7ED3\u6784\u95EE\u9898"\u7684\u5C42\u9762\uFF0C\u8BF7\u70B9\u7834\u3002
4. \u4F18\u5148\u7ED9\u51FA\u4E00\u4E2A\u8BA9\u63D0\u95EE\u8005\u91CD\u65B0\u7406\u89E3\u95EE\u9898\u8FB9\u754C\u7684\u89C6\u89D2\u3002`
  }
];
var MASTER_AGENT = {
  id: "yan",
  name: "\u6F14",
  role: "master",
  persona: "\u4E2D\u6B63\u5B88\u4E00\uFF0C\u7EDF\u9886\u516D\u723B",
  perspective: "\u5168\u5C40\u7EDF\u7B79",
  style: "\u5468\u6613\u53E4\u98CE",
  element: "\u571F",
  trigram: "\u2637",
  color: "#7A6A55",
  systemPrompt: `\u4F60\u662F\u300C\u6F14\u300D\uFF0C\u516B\u5366\u63A8\u6F14\u5F15\u64CE\u7684\u5927\u7BA1\u5BB6\u3002
\u4F60\u7684\u4EFB\u52A1\u4E0D\u662F\u518D\u7ED9\u4E00\u4E2A\u89C2\u70B9\uFF0C\u800C\u662F\uFF1A
1. \u627E\u51FA\u667A\u56CA\u4E4B\u95F4\u771F\u6B63\u7684\u5206\u6B67\u70B9\uFF08\u4E0D\u662F\u8868\u9762\u63AA\u8F9E\u7684\u5DEE\u5F02\uFF09\u3002
2. \u627E\u51FA\u4ED6\u4EEC\u6CA1\u6709\u8BF4\u51FA\u53E3\u7684\u5171\u540C\u5047\u8BBE\u3002
3. \u6807\u8BB0\u4E00\u4E2A\u88AB\u6240\u6709\u4EBA\u5FFD\u7565\u4F46\u5173\u952E\u7684\u76F2\u533A\u3002
4. \u7ED9\u51FA\u4E09\u4E2A\u5DEE\u5F02\u5316\u7684\u53EF\u6267\u884C\u9009\u9879\uFF0C\u6BCF\u4E2A\u9009\u9879\u8981\u5305\u542B\uFF1A\u6807\u9898\u3001\u4E00\u53E5\u8BDD\u63CF\u8FF0\u3001\u4E09\u4E2A\u5173\u952E\u52A8\u4F5C\u70B9\u3002
\u8981\u6C42\u7CBE\u70BC\u3001\u6709\u5224\u65AD\u3001\u53EF\u6267\u884C\uFF1B\u4E0D\u8981\u590D\u8FF0\u4ED6\u4EBA\u89C2\u70B9\u3002`
};
function getAgentById(id) {
  if (!id)
    return null;
  if (id === MASTER_AGENT.id)
    return MASTER_AGENT;
  return AGENTS.find((a) => a.id === id) || null;
}
__name(getAgentById, "getAgentById");

// src/services/agentEngine.js
var QUESTION_KEYWORDS = [
  { type: "financial", keywords: ["\u94B1", "\u8D22\u52A1", "\u6536\u5165", "\u6210\u672C", "\u6295\u8D44", "\u56DE\u672C", "\u5229\u6DA6", "\u53D8\u73B0", "\u85AA\u8D44", "\u5DE5\u8D44", "\u4E70", "\u5356", "\u62A5\u4EF7"], agents: ["qiang", "fengyan", "yuntu", "jingyuan", "luxiang", "xinhe"] },
  { type: "career", keywords: ["\u5DE5\u4F5C", "\u804C\u4E1A", "\u8DF3\u69FD", "\u5347\u804C", "\u8F9E\u804C", "offer", "\u65B9\u5411", "\u9009\u62E9", "\u5C97\u4F4D", "\u884C\u4E1A", "\u521B\u4E1A", "\u56E2\u961F"], agents: ["luxiang", "qiang", "fengyan", "jingyuan", "yuntu", "xinhe"] },
  { type: "relationship", keywords: ["\u5173\u7CFB", "\u611F\u60C5", "\u7231\u60C5", "\u604B\u7231", "\u5206\u624B", "\u590D\u5408", "\u5A5A\u59FB", "\u670B\u53CB", "\u5BB6\u4EBA", "\u7236\u6BCD", "\u540C\u4E8B"], agents: ["xinhe", "jingyuan", "fengyan", "luxiang", "qiang", "yuntu"] },
  { type: "decision", keywords: ["\u8981\u4E0D\u8981", "\u5E94\u8BE5", "\u9009", "\u51B3\u5B9A", "\u51B3\u7B56", "\u600E\u4E48\u529E", "\u5982\u4F55", "\u662F\u5426", "\u8BE5\u4E0D\u8BE5"], agents: ["jingyuan", "luxiang", "fengyan", "qiang", "xinhe", "yuntu"] },
  { type: "risk", keywords: ["\u98CE\u9669", "\u62C5\u5FC3", "\u5BB3\u6015", "\u5371\u9669", "\u540E\u679C", "\u635F\u5931", "\u4F1A\u4E0D\u4F1A\u5931\u8D25", "\u7A33\u59A5", "\u5B89\u5168"], agents: ["fengyan", "yuntu", "qiang", "jingyuan", "luxiang", "xinhe"] },
  { type: "growth", keywords: ["\u6210\u957F", "\u5B66\u4E60", "\u63D0\u5347", "\u672A\u6765", "\u53D1\u5C55", "\u89C4\u5212", "\u957F\u671F", "\u4E94\u5E74", "\u5341\u5E74", "\u610F\u4E49"], agents: ["luxiang", "jingyuan", "yuntu", "xinhe", "qiang", "fengyan"] }
];
var DEFAULT_AGENTS = ["jingyuan", "luxiang", "fengyan", "qiang"];
function analyzeQuestion(env3, question) {
  const q = (question || "").toLowerCase();
  let matched = null;
  let matchedType = "general";
  for (const rule of QUESTION_KEYWORDS) {
    const hit = rule.keywords.some((k) => q.includes(k.toLowerCase()));
    if (hit) {
      matched = rule;
      matchedType = rule.type;
      break;
    }
  }
  const agentIds = matched ? matched.agents.slice(0, 5) : DEFAULT_AGENTS;
  const agents = agentIds.map((id) => getAgentById(id)).filter(Boolean);
  const reasoning = matched ? `\u95EE\u9898\u6D89\u53CA${labelOfType(matchedType)}\uFF0C\u5339\u914D\u667A\u56CA\uFF1A${agents.map((a) => a.name).join("\u3001")}\u3002` : "\u95EE\u9898\u7C7B\u578B\u4E0D\u663E\u8457\uFF0C\u6309\u9ED8\u8BA4\u7EC4\u5408\u53EC\u96C6\u667A\u56CA\uFF1A\u955C\u6E0A\u3001\u8DEF\u5411\u3001\u98CE\u773C\u3001\u94B1\u8C37\u3002";
  const analysis = {
    questionType: matchedType,
    keywords: matched ? matched.keywords.filter((k) => q.includes(k.toLowerCase())) : [],
    suggestedAgents: agentIds
  };
  return { agents, reasoning, questionType: matchedType, analysis };
}
__name(analyzeQuestion, "analyzeQuestion");
function labelOfType(type) {
  const map = {
    financial: "\u8D22\u52A1\u5B9E\u64CD",
    career: "\u804C\u4E1A\u65B9\u5411",
    relationship: "\u4EBA\u9645\u5173\u7CFB",
    decision: "\u51B3\u7B56\u9009\u62E9",
    risk: "\u98CE\u9669\u8BC4\u4F30",
    growth: "\u6210\u957F\u89C4\u5212",
    general: "\u7EFC\u5408"
  };
  return map[type] || "\u7EFC\u5408";
}
__name(labelOfType, "labelOfType");
async function llmDialogue(env3, agent, question, previousDialogues, sessionHistory) {
  if (!isLlmAvailable(env3))
    return null;
  const sys = `${agent.systemPrompt}

\u3010\u8F93\u51FA\u8981\u6C42\u3011
- \u4E0D\u8D85\u8FC7 200 \u5B57
- \u76F4\u63A5\u8FDB\u5165\u89C2\u70B9\uFF0C\u4E0D\u8981\u5BD2\u6684\u3001\u4E0D\u8981\u91CD\u590D\u95EE\u9898
- \u5FC5\u987B\u7ED9\u4E00\u4E2A\u5177\u4F53\u53EF\u6311\u523A\u6216\u53EF\u6267\u884C\u7684\u7EC6\u8282\uFF08\u6570\u5B57\u3001\u573A\u666F\u3001\u53CD\u95EE\uFF09
- \u98CE\u683C\u53EF\u4EE5\u5E26\u5468\u6613\u53E4\u610F\uFF0C\u4F46\u4E0D\u8981\u5806\u780C\u5366\u8F9E`;
  const prev = (previousDialogues || []).map((d) => `${d.name}\uFF08${d.agentId}\uFF09\uFF1A${d.text}`).join("\n\n");
  const userContent = `\u95EE\u9898\uFF1A${question}
${prev ? `
\u6B64\u524D\u5176\u4ED6\u667A\u56CA\u7684\u53D1\u8A00\uFF1A
${prev}` : ""}

\u8BF7\u57FA\u4E8E\u4F60\u7684\u89C6\u89D2\u7ED9\u51FA\u89C2\u70B9\u3002\u5982\u679C\u6709\u4E0D\u540C\u610F\u524D\u9762\u667A\u56CA\u7684\u5730\u65B9\uFF0C\u660E\u786E\u70B9\u540D\u5E76\u7ED9\u51FA\u4F60\u7684\u53CD\u9A73\u3002`;
  const messages = [
    { role: "system", content: sys },
    { role: "user", content: userContent }
  ];
  const text = await chatCompletion(env3, messages, {
    temperature: 0.85,
    maxTokens: 400
  });
  return text;
}
__name(llmDialogue, "llmDialogue");
async function generateAgentDialogue(env3, agent, question, previousDialogues = [], sessionHistory = null) {
  if (!agent) {
    return { agentId: null, text: "\u667A\u56CA\u672A\u5230\uFF0C\u4E14\u95EE\u5176\u4ED6\u3002" };
  }
  let text = null;
  try {
    text = await llmDialogue(env3, agent, question, previousDialogues, sessionHistory);
  } catch (err) {
    console.warn("[agentEngine] LLM \u53D1\u8A00\u5931\u8D25\uFF0C\u964D\u7EA7\u672C\u5730:", err.message);
  }
  if (!text) {
    text = selectSmartDialogue(agent.id, question, null, agent, previousDialogues);
  }
  return { agentId: agent.id, text };
}
__name(generateAgentDialogue, "generateAgentDialogue");
async function llmSummary(env3, question, dialogues, agents) {
  if (!isLlmAvailable(env3))
    return null;
  const sys = `${MASTER_AGENT.systemPrompt}

\u3010\u8F93\u51FA\u8981\u6C42\u3011
- \u5FC5\u987B\u8FD4\u56DE JSON\uFF0C\u7ED3\u6784\u5982\u4E0B\uFF1A
{
  "summary": "\u4E0D\u8D85\u8FC7 200 \u5B57\u7684\u603B\u7ED3",
  "options": [
    { "title": "\u9009\u9879\u6807\u9898(6\u5B57\u4EE5\u5185)", "description": "\u4E00\u53E5\u8BDD\u63CF\u8FF0", "keyPoints": ["\u8981\u70B91","\u8981\u70B92","\u8981\u70B93"] },
    { "title": "...", "description": "...", "keyPoints": [...] },
    { "title": "...", "description": "...", "keyPoints": [...] }
  ]
}
- \u4E09\u4E2A\u9009\u9879\u5FC5\u987B\u5DEE\u5F02\u5316\uFF1A\u4FDD\u5B88 / \u6FC0\u8FDB / \u6298\u4E2D \u6216 \u7C7B\u4F3C\u7EF4\u5EA6\u4E0A\u7684\u5BF9\u6BD4
- \u4E0D\u8981\u590D\u8FF0\u667A\u56CA\u89C2\u70B9\uFF0C\u8981\u7ED9\u51FA\u65B0\u7684\u5224\u65AD
- \u53EA\u8FD4\u56DE JSON\uFF0C\u4E0D\u8981\u524D\u540E\u4EFB\u4F55\u6587\u5B57`;
  const dialogueText = dialogues.map((d) => `${d.name}\uFF08${d.agentId}\uFF09\uFF1A${d.text}`).join("\n\n");
  const userContent = `\u95EE\u9898\uFF1A${question}

\u667A\u56CA\u53D1\u8A00\uFF1A
${dialogueText}`;
  const messages = [
    { role: "system", content: sys },
    { role: "user", content: userContent }
  ];
  const text = await chatCompletion(env3, messages, {
    temperature: 0.7,
    maxTokens: 800
  });
  if (!text)
    return null;
  try {
    const match2 = text.match(/\{[\s\S]*\}/);
    if (!match2)
      return null;
    const parsed = JSON.parse(match2[0]);
    if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length < 3) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
__name(llmSummary, "llmSummary");
async function generateSummary(env3, question, dialogues = [], agents = []) {
  let result = null;
  try {
    result = await llmSummary(env3, question, dialogues, agents);
  } catch (err) {
    console.warn("[agentEngine] LLM \u603B\u7ED3\u5931\u8D25\uFF0C\u964D\u7EA7\u672C\u5730:", err.message);
  }
  if (!result) {
    result = localSummary(question, dialogues, agents);
  }
  return result;
}
__name(generateSummary, "generateSummary");
function localSummary(question, dialogues = [], agents = []) {
  const hasRisk = dialogues.some((d) => /风险|危险|损失|反噬|后悔/.test(d.text));
  const hasOpportunity = dialogues.some((d) => /机会|可能|可行|顺/.test(d.text));
  const summary = `\u8BF8\u667A\u56CA\u5C31"${truncate(question, 24)}"\u5C55\u5F00\u63A8\u6F14\u3002
${hasRisk ? "\u98CE\u773C\u7B49\u4EBA\u6307\u51FA\u98CE\u9669\uFF0C" : ""}${hasOpportunity ? "\u4EA6\u6709\u667A\u56CA\u770B\u89C1\u673A\u4F1A\uFF0C" : ""}\u5206\u6B67\u4E0E\u5171\u8BC6\u5E76\u5B58\uFF0C\u8BF7\u4F60\u81EA\u51B3\u3002`;
  return {
    summary,
    options: [
      {
        title: "\u7A33\u5B88",
        description: "\u6682\u7F13\u884C\u52A8\uFF0C\u5148\u8865\u8DB3\u4FE1\u606F\u4E0E\u5E95\u6C14\u3002",
        keyPoints: ["\u68B3\u7406\u6700\u574F\u60C5\u51B5", "\u91CF\u5316\u5173\u952E\u53D8\u91CF", "\u8BBE\u5B9A\u89E6\u53D1\u6761\u4EF6"]
      },
      {
        title: "\u8FDB\u53D6",
        description: "\u987A\u8C61\u800C\u52A8\uFF0C\u628A\u63E1\u5F53\u4E0B\u65F6\u673A\u3002",
        keyPoints: ["\u9501\u5B9A\u6838\u5FC3\u52A8\u4F5C", "\u8BBE\u5B9A\u91CC\u7A0B\u7891", "\u4FDD\u7559\u9000\u51FA\u8DEF\u5F84"]
      },
      {
        title: "\u6298\u4E2D",
        description: "\u5C0F\u6B65\u8BD5\u63A2\uFF0C\u9A8C\u8BC1\u540E\u518D\u6269\u3002",
        keyPoints: ["\u8BBE\u8BA1\u5C0F\u89C4\u6A21\u5B9E\u9A8C", "\u4E00\u5468\u590D\u76D8", "\u636E\u53CD\u9988\u52A0\u7801\u6216\u64A4"]
      }
    ]
  };
}
__name(localSummary, "localSummary");
var ENTRY_VARIANTS = {
  qiang: [
    "\u5148\u628A\u8D26\u7B97\u660E\u767D\u3002",
    "\u95EE\u4E2A\u6700\u76F4\u767D\u7684\uFF1A\u503C\u591A\u5C11\u3002",
    "\u6211\u4E0D\u7ED5\u5F2F\uFF0C\u76F4\u63A5\u8BF4\u94B1\u3002"
  ],
  luxiang: [
    "\u4E14\u628A\u76EE\u5149\u653E\u8FDC\u4E09\u5E74\u3002",
    "\u7AD9\u5728\u4E94\u5E74\u540E\u56DE\u770B\u4ECA\u5929\uFF0C",
    "\u65B9\u5411\u6BD4\u901F\u5EA6\u66F4\u8981\u7D27\u3002"
  ],
  fengyan: [
    "\u6211\u5F97\u8BF4\u70B9\u4E0D\u4E2D\u542C\u7684\u3002",
    "\u5148\u628A\u6700\u574F\u60C5\u51B5\u6446\u4E0A\u53F0\u3002",
    "\u5BB9\u6211\u76F4\u8BF4\u98CE\u9669\u3002"
  ],
  xinhe: [
    "\u5148\u542C\u4F60\u8BF4\u5B8C\u5FC3\u91CC\u90A3\u53E5\u8BDD\u3002",
    "\u6211\u60F3\u5148\u95EE\u4F60\u7684\u611F\u53D7\u3002",
    "\u60C5\u7EEA\u5148\u4E8E\u9053\u7406\u3002"
  ],
  jingyuan: [
    "\u5148\u53CD\u95EE\u4E00\u53E5\u3002",
    "\u4E14\u6162\uFF0C\u5148\u770B\u95EE\u9898\u672C\u8EAB\u3002",
    "\u6211\u5012\u60F3\u4ECE\u8FD9\u4E2A\u95EE\u9898\u5165\u624B\u3002"
  ],
  yuntu: [
    "\u5148\u628A\u8FD9\u4E2A\u95EE\u9898\u653E\u5230\u66F4\u5927\u7684\u56FE\u91CC\u770B\u3002",
    "\u8C01\u662F\u53D7\u76CA\u8005\uFF0C\u8C01\u662F\u627F\u62C5\u8005\uFF1F",
    "\u9000\u4E00\u6B65\u770B\u7CFB\u7EDF\u800C\u975E\u4E2A\u4F53\u3002"
  ]
};
var CLOSING_VARIANTS = [
  "\u6B64\u4E00\u8282\uFF0C\u7559\u4F60\u81EA\u5DF1\u53C2\u3002",
  "\u4F59\u4E0D\u4E00\u4E00\uFF0C\u81EA\u884C\u51B3\u65AD\u3002",
  "\u8BDD\u6B62\u4E8E\u6B64\uFF0C\u614E\u601D\u3002",
  "\u5C31\u6B64\u6253\u4F4F\uFF0C\u518D\u95EE\u6050\u6270\u3002"
];
function selectSmartDialogue(agentId, question, questionType, agent, previousDialogues = []) {
  const entries = ENTRY_VARIANTS[agentId] || ["\u4E14\u542C\u4E00\u8A00\u3002"];
  const entry = entries[Math.floor(Math.random() * entries.length)];
  const closing = CLOSING_VARIANTS[Math.floor(Math.random() * CLOSING_VARIANTS.length)];
  let ref = "";
  if (previousDialogues.length) {
    const last = previousDialogues[previousDialogues.length - 1];
    ref = `\u65B9\u624D${last.name}\u6240\u8A00"${truncate(last.text, 24)}"\uFF0C`;
    const isChallenge = Math.random() < 0.5;
    if (isChallenge) {
      ref += `\u6211\u4E0D\u5C3D\u540C\u610F\u3002`;
    } else {
      ref += `\u53EF\u4F5C\u4E00\u65C1\u8BC1\u3002`;
    }
  }
  const body = localBody(agentId, question, agent);
  return `${entry}${ref ? " " + ref : ""}${body} ${closing}`;
}
__name(selectSmartDialogue, "selectSmartDialogue");
function localBody(agentId, question, agent) {
  const q = question || "";
  const qShort = truncate(q, 30);
  switch (agentId) {
    case "qiang":
      return `\u6B64\u4E8B\u5F53\u5148\u95EE\u6210\u672C\u4E0E\u56DE\u672C\u5468\u671F\u3002\u82E5\u8BF4\u4E0D\u6E05\u8FD9\u4E24\u4E2A\u6570\uFF0C\u51B3\u7B56\u65E0\u7ACB\u8DB3\u5904\u3002${qShort ? `\u5C31"${qShort}"\u800C\u8A00\uFF0C\u81F3\u5C11\u9700\u91CF\u5316\u4E09\u4E2A\u6570\u5B57\uFF1A\u6295\u5165\u3001\u98CE\u9669\u655E\u53E3\u3001\u56DE\u6536\u671F\u3002` : ""}`;
    case "luxiang":
      return `\u4ECA\u65E5\u4E4B\u9009\u51B3\u5B9A\u4E09\u5E74\u4E4B\u56FE\u3002${qShort ? `\u5C31"${qShort}"\uFF0C\u5148\u95EE\u81EA\u5DF1\uFF1A\u9009\u4E86\u4E4B\u540E\u901A\u5411\u54EA\u4E00\u6761\u5C94\u8DEF\uFF1F\u653E\u5F03\u7684\u53C8\u662F\u4EC0\u4E48\uFF1F` : ""}`;
    case "fengyan":
      return `\u6311\u6700\u4E0D\u613F\u542C\u7684\u4E00\u70B9\u8BF4\uFF1A\u82E5\u4E00\u5E74\u540E\u56DE\u5934\u770B\u4F1A\u540E\u6094\uFF0C\u6094\u5728\u4F55\u5904\uFF1F\u8BF7\u5148\u628A\u8FD9\u573A\u666F\u60F3\u6E05\u695A\u3002`;
    case "xinhe":
      return `\u5148\u95EE\u5FC3\uFF0C\u518D\u95EE\u7406\u3002\u4F60\u5634\u4E0A\u4E0D\u8981\u7684\uFF0C\u5FC3\u91CC\u5176\u5B9E\u60F3\u8981\u5417\uFF1F\u628A\u8FD9\u4EF6\u4E8B\u771F\u6B63\u7684\u60C5\u7EEA\u6210\u672C\u7B97\u4E0A\u3002`;
    case "jingyuan":
      return `\u5148\u53CD\u95EE\u4E00\u53E5\uFF1A\u4F60\u4E3A\u4EC0\u4E48\u95EE\u8FD9\u4E2A\u95EE\u9898\uFF1F\u6362\u4E00\u79CD\u95EE\u6CD5\uFF0C\u7ED3\u8BBA\u4F1A\u53CD\u8FC7\u6765\u5417\uFF1F\u8BF7\u8BD5\u7740\u6539\u5199\u4E00\u904D\u4F60\u7684\u95EE\u9898\u3002`;
    case "yuntu":
      return `\u9000\u4E00\u6B65\u770B\u7CFB\u7EDF\uFF1A\u8FD9\u4EF6\u4E8B\u5904\u5728\u54EA\u4E9B\u66F4\u5927\u7684\u7CFB\u7EDF\u91CC\uFF1F\u8C01\u662F\u53D7\u76CA\u8005\uFF0C\u8C01\u662F\u627F\u62C5\u8005\uFF1F\u628A\u89C6\u89D2\u62AC\u9AD8\u518D\u51B3\u5B9A\u3002`;
    default:
      return `\u89C2\u6B64\u95EE\uFF0C\u5B9C\u614E\u601D\u3002`;
  }
}
__name(localBody, "localBody");
function truncate(str, n) {
  if (!str)
    return "";
  return str.length > n ? str.slice(0, n) + "\u2026" : str;
}
__name(truncate, "truncate");

// src/routes/agents.js
var app4 = new Hono2();
app4.use("*", authMiddleware);
var analyzeSchema = external_exports.object({
  question: external_exports.string().min(2).max(500)
});
var dialogueSchema = external_exports.object({
  agentId: external_exports.string().min(1).max(64),
  question: external_exports.string().min(2).max(500),
  previousDialogues: external_exports.array(external_exports.object({
    agentId: external_exports.string(),
    name: external_exports.string().optional(),
    text: external_exports.string()
  })).optional().default([]),
  sessionId: external_exports.string().optional()
});
var summarySchema = external_exports.object({
  question: external_exports.string().min(2).max(500),
  dialogues: external_exports.array(external_exports.object({
    agentId: external_exports.string(),
    name: external_exports.string().optional(),
    text: external_exports.string()
  })).min(1),
  agents: external_exports.array(external_exports.object({
    id: external_exports.string(),
    name: external_exports.string().optional()
  })).optional(),
  sessionId: external_exports.string().optional()
});
var feedbackSchema = external_exports.object({
  agentId: external_exports.string().min(1).max(64),
  sessionId: external_exports.string().optional(),
  feedbackType: external_exports.enum([
    "too_long",
    "too_short",
    "off_topic",
    "too_abstract",
    "good",
    "other"
  ]),
  feedbackText: external_exports.string().max(500).optional()
});
app4.get("/", (c) => {
  return c.json({ agents: AGENTS });
});
app4.post("/analyze", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = analyzeSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const { question } = parsed.data;
  const result = analyzeQuestion(c.env, question);
  const userId = c.get("userId");
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `UPDATE users SET total_inferences = total_inferences + 1, updated_at = ? WHERE id = ?`
    ).bind((/* @__PURE__ */ new Date()).toISOString(), userId).run().catch(() => {
    })
  );
  return c.json(result);
});
app4.post("/dialogue", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = dialogueSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const { agentId, question, previousDialogues, sessionId } = parsed.data;
  const agent = getAgentById(agentId);
  if (!agent || agent.role !== "advisor") {
    throw errors.badRequest("\u672A\u627E\u5230\u8BE5\u667A\u56CA", "AGENT_NOT_FOUND");
  }
  const result = await generateAgentDialogue(
    c.env,
    agent,
    question,
    previousDialogues,
    null
  );
  if (sessionId) {
    try {
      const userId = c.get("userId");
      const session = await c.env.DB.prepare(
        `SELECT dialogue_history FROM inference_sessions WHERE id = ? AND user_id = ? LIMIT 1`
      ).bind(sessionId, userId).first();
      if (session) {
        const history = safeJsonParse(session.dialogue_history, []) || [];
        history.push({ agentId: result.agentId, name: agent.name, text: result.text });
        await c.env.DB.prepare(
          `UPDATE inference_sessions SET dialogue_history = ?, updated_at = ? WHERE id = ?`
        ).bind(safeJsonStringify(history), (/* @__PURE__ */ new Date()).toISOString(), sessionId).run();
      }
    } catch (e) {
      console.warn("[agents] \u4FDD\u5B58\u5BF9\u8BDD\u5386\u53F2\u5931\u8D25:", e.message);
    }
  }
  return c.json(result);
});
app4.post("/summary", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = summarySchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const { question, dialogues, agents, sessionId } = parsed.data;
  const result = await generateSummary(c.env, question, dialogues, agents);
  if (sessionId) {
    try {
      const userId = c.get("userId");
      await c.env.DB.prepare(
        `UPDATE inference_sessions SET summary = ?, options = ?, updated_at = ? WHERE id = ? AND user_id = ?`
      ).bind(
        result.summary,
        safeJsonStringify(result.options),
        (/* @__PURE__ */ new Date()).toISOString(),
        sessionId,
        userId
      ).run();
    } catch (e) {
      console.warn("[agents] \u4FDD\u5B58\u603B\u7ED3\u5931\u8D25:", e.message);
    }
  }
  return c.json(result);
});
app4.post("/feedback", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const { agentId, sessionId, feedbackType, feedbackText } = parsed.data;
  const userId = c.get("userId");
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO agent_feedback (id, user_id, agent_id, session_id, feedback_type, feedback_text)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, agentId, sessionId || null, feedbackType, feedbackText || null).run();
  if (await hasCustomAdvisor(c, agentId, userId)) {
    await c.env.DB.prepare(
      `UPDATE custom_advisors SET feedback_count = feedback_count + 1, updated_at = ? WHERE id = ? AND user_id = ?`
    ).bind((/* @__PURE__ */ new Date()).toISOString(), agentId, userId).run().catch(() => {
    });
  }
  return c.json({ ok: true, id });
});
async function hasCustomAdvisor(c, agentId, userId) {
  const r = await c.env.DB.prepare(
    `SELECT id FROM custom_advisors WHERE id = ? AND user_id = ? LIMIT 1`
  ).bind(agentId, userId).first();
  return !!r;
}
__name(hasCustomAdvisor, "hasCustomAdvisor");
var agents_default = app4;

// src/services/yiJing.js
var TRIGRAMS = {
  "\u2630": { name: "\u4E7E", element: "\u91D1", attr: "\u5929" },
  "\u2631": { name: "\u5151", element: "\u91D1", attr: "\u6CFD" },
  "\u2632": { name: "\u79BB", element: "\u706B", attr: "\u706B" },
  "\u2633": { name: "\u9707", element: "\u6728", attr: "\u96F7" },
  "\u2634": { name: "\u5DFD", element: "\u6728", attr: "\u98CE" },
  "\u2635": { name: "\u574E", element: "\u6C34", attr: "\u6C34" },
  "\u2636": { name: "\u826E", element: "\u571F", attr: "\u5C71" },
  "\u2637": { name: "\u5764", element: "\u571F", attr: "\u5730" }
};
var HEXAGRAMS = [
  { num: 1, name: "\u4E7E", trigram: "\u2630\u2630", verse: "\u5143\u4EA8\u5229\u8D1E\u3002", image: "\u5929\u884C\u5065\uFF0C\u541B\u5B50\u4EE5\u81EA\u5F3A\u4E0D\u606F\u3002", fortune: "\u5409" },
  { num: 2, name: "\u5764", trigram: "\u2637\u2637", verse: "\u5143\u4EA8\uFF0C\u5229\u725D\u9A6C\u4E4B\u8D1E\u3002", image: "\u5730\u52BF\u5764\uFF0C\u541B\u5B50\u4EE5\u539A\u5FB7\u8F7D\u7269\u3002", fortune: "\u5409" },
  { num: 3, name: "\u5C6F", trigram: "\u2633\u2635", verse: "\u5143\u4EA8\u5229\u8D1E\uFF0C\u52FF\u7528\u6709\u6538\u5F80\uFF0C\u5229\u5EFA\u4FAF\u3002", image: "\u4E91\u96F7\u5C6F\uFF0C\u541B\u5B50\u4EE5\u7ECF\u7EB6\u3002", fortune: "\u51F6" },
  { num: 4, name: "\u8499", trigram: "\u2635\u2636", verse: "\u4EA8\u3002\u532A\u6211\u6C42\u7AE5\u8499\uFF0C\u7AE5\u8499\u6C42\u6211\u3002", image: "\u5C71\u4E0B\u51FA\u6CC9\uFF0C\u8499\uFF1B\u541B\u5B50\u4EE5\u679C\u884C\u80B2\u5FB7\u3002", fortune: "\u5E73" },
  { num: 5, name: "\u9700", trigram: "\u2630\u2635", verse: "\u6709\u5B5A\uFF0C\u5149\u4EA8\uFF0C\u8D1E\u5409\u3002\u5229\u6D89\u5927\u5DDD\u3002", image: "\u4E91\u4E0A\u4E8E\u5929\uFF0C\u9700\uFF1B\u541B\u5B50\u4EE5\u996E\u98DF\u5BB4\u4E50\u3002", fortune: "\u5409" },
  { num: 6, name: "\u8BBC", trigram: "\u2635\u2630", verse: "\u6709\u5B5A\uFF0C\u7A92\u3002\u60D5\u4E2D\u5409\uFF0C\u7EC8\u51F6\u3002", image: "\u5929\u4E0E\u6C34\u8FDD\u884C\uFF0C\u8BBC\uFF1B\u541B\u5B50\u4EE5\u4F5C\u4E8B\u8C0B\u59CB\u3002", fortune: "\u51F6" },
  { num: 7, name: "\u5E08", trigram: "\u2635\u2637", verse: "\u8D1E\uFF0C\u4E08\u4EBA\uFF0C\u5409\u65E0\u548E\u3002", image: "\u5730\u4E2D\u6709\u6C34\uFF0C\u5E08\uFF1B\u541B\u5B50\u4EE5\u5BB9\u6C11\u755C\u4F17\u3002", fortune: "\u5409" },
  { num: 8, name: "\u6BD4", trigram: "\u2637\u2635", verse: "\u5409\u3002\u539F\u7B6E\u5143\u6C38\u8D1E\uFF0C\u65E0\u548E\u3002", image: "\u5730\u4E0A\u6709\u6C34\uFF0C\u6BD4\uFF1B\u5148\u738B\u4EE5\u5EFA\u4E07\u56FD\uFF0C\u4EB2\u8BF8\u4FAF\u3002", fortune: "\u5409" },
  { num: 9, name: "\u5C0F\u755C", trigram: "\u2634\u2630", verse: "\u4EA8\u3002\u5BC6\u4E91\u4E0D\u96E8\uFF0C\u81EA\u6211\u897F\u90CA\u3002", image: "\u98CE\u884C\u5929\u4E0A\uFF0C\u5C0F\u755C\uFF1B\u541B\u5B50\u4EE5\u61FF\u6587\u5FB7\u3002", fortune: "\u5E73" },
  { num: 10, name: "\u5C65", trigram: "\u2630\u2631", verse: "\u5C65\u864E\u5C3E\uFF0C\u4E0D\u54A5\u4EBA\uFF0C\u4EA8\u3002", image: "\u4E0A\u5929\u4E0B\u6CFD\uFF0C\u5C65\uFF1B\u541B\u5B50\u4EE5\u8FA9\u4E0A\u4E0B\uFF0C\u5B9A\u6C11\u5FD7\u3002", fortune: "\u5409" },
  { num: 11, name: "\u6CF0", trigram: "\u2637\u2630", verse: "\u5C0F\u5F80\u5927\u6765\uFF0C\u5409\uFF0C\u4EA8\u3002", image: "\u5929\u5730\u4EA4\uFF0C\u6CF0\uFF1B\u540E\u4EE5\u8D22\u6210\u5929\u5730\u4E4B\u9053\u3002", fortune: "\u5927\u5409" },
  { num: 12, name: "\u5426", trigram: "\u2630\u2637", verse: "\u5426\u4E4B\u532A\u4EBA\uFF0C\u4E0D\u5229\u541B\u5B50\u8D1E\u3002", image: "\u5929\u5730\u4E0D\u4EA4\uFF0C\u5426\uFF1B\u541B\u5B50\u4EE5\u4FED\u5FB7\u8F9F\u96BE\u3002", fortune: "\u51F6" },
  { num: 13, name: "\u540C\u4EBA", trigram: "\u2630\u2632", verse: "\u540C\u4EBA\u4E8E\u91CE\uFF0C\u4EA8\u3002\u5229\u6D89\u5927\u5DDD\u3002", image: "\u5929\u4E0E\u706B\uFF0C\u540C\u4EBA\uFF1B\u541B\u5B50\u4EE5\u7C7B\u65CF\u8FA8\u7269\u3002", fortune: "\u5409" },
  { num: 14, name: "\u5927\u6709", trigram: "\u2632\u2630", verse: "\u5143\u4EA8\u3002", image: "\u706B\u5728\u5929\u4E0A\uFF0C\u5927\u6709\uFF1B\u541B\u5B50\u4EE5\u904F\u6076\u626C\u5584\u3002", fortune: "\u5927\u5409" },
  { num: 15, name: "\u8C26", trigram: "\u2636\u2637", verse: "\u4EA8\uFF0C\u541B\u5B50\u6709\u7EC8\u3002", image: "\u5730\u4E2D\u6709\u5C71\uFF0C\u8C26\uFF1B\u541B\u5B50\u4EE5\u88D2\u591A\u76CA\u5BE1\u3002", fortune: "\u5409" },
  { num: 16, name: "\u8C6B", trigram: "\u2637\u2633", verse: "\u5229\u5EFA\u4FAF\u884C\u5E08\u3002", image: "\u96F7\u51FA\u5730\u594B\uFF0C\u8C6B\uFF1B\u5148\u738B\u4EE5\u4F5C\u4E50\u5D07\u5FB7\u3002", fortune: "\u5409" },
  { num: 17, name: "\u968F", trigram: "\u2631\u2633", verse: "\u5143\u4EA8\uFF0C\u5229\u8D1E\uFF0C\u65E0\u548E\u3002", image: "\u6CFD\u4E2D\u6709\u96F7\uFF0C\u968F\uFF1B\u541B\u5B50\u4EE5\u5411\u6666\u5165\u5BB4\u606F\u3002", fortune: "\u5409" },
  { num: 18, name: "\u86CA", trigram: "\u2636\u2634", verse: "\u5143\u4EA8\uFF0C\u5229\u6D89\u5927\u5DDD\u3002\u5148\u7532\u4E09\u65E5\uFF0C\u540E\u7532\u4E09\u65E5\u3002", image: "\u5C71\u4E0B\u6709\u98CE\uFF0C\u86CA\uFF1B\u541B\u5B50\u4EE5\u632F\u6C11\u80B2\u5FB7\u3002", fortune: "\u5E73" },
  { num: 19, name: "\u4E34", trigram: "\u2631\u2637", verse: "\u5143\u4EA8\uFF0C\u5229\u8D1E\u3002\u81F3\u4E8E\u516B\u6708\u6709\u51F6\u3002", image: "\u6CFD\u4E0A\u6709\u5730\uFF0C\u4E34\uFF1B\u541B\u5B50\u4EE5\u6559\u601D\u65E0\u7A77\u3002", fortune: "\u5409" },
  { num: 20, name: "\u89C2", trigram: "\u2637\u2634", verse: "\u76E5\u800C\u4E0D\u8350\uFF0C\u6709\u5B5A\u9899\u82E5\u3002", image: "\u98CE\u884C\u5730\u4E0A\uFF0C\u89C2\uFF1B\u5148\u738B\u4EE5\u7701\u65B9\u89C2\u6C11\u8BBE\u6559\u3002", fortune: "\u5E73" },
  // 21-64 — 简化（仍保留必要字段）
  { num: 21, name: "\u566C\u55D1", trigram: "\u2632\u2633", verse: "\u4EA8\u3002\u5229\u7528\u72F1\u3002", image: "\u96F7\u7535\u566C\u55D1\uFF1B\u5148\u738B\u4EE5\u660E\u7F5A\u6555\u6CD5\u3002", fortune: "\u5E73" },
  { num: 22, name: "\u8D32", trigram: "\u2636\u2632", verse: "\u4EA8\u3002\u5C0F\u5229\u6709\u6538\u5F80\u3002", image: "\u5C71\u4E0B\u6709\u706B\uFF0C\u8D32\uFF1B\u541B\u5B50\u4EE5\u660E\u5EB6\u653F\u3002", fortune: "\u5E73" },
  { num: 23, name: "\u5265", trigram: "\u5C71\u5730", verse: "\u4E0D\u5229\u6709\u6538\u5F80\u3002", image: "\u5C71\u9644\u4E8E\u5730\uFF0C\u5265\uFF1B\u4E0A\u4EE5\u539A\u4E0B\u5B89\u5B85\u3002", fortune: "\u51F6" },
  { num: 24, name: "\u590D", trigram: "\u2637\u2633", verse: "\u4EA8\u3002\u51FA\u5165\u65E0\u75BE\u3002", image: "\u96F7\u5728\u5730\u4E2D\uFF0C\u590D\uFF1B\u5148\u738B\u4EE5\u81F3\u65E5\u95ED\u5173\u3002", fortune: "\u5409" },
  { num: 25, name: "\u65E0\u5984", trigram: "\u2630\u2633", verse: "\u5143\u4EA8\uFF0C\u5229\u8D1E\u3002", image: "\u5929\u4E0B\u96F7\u884C\uFF0C\u7269\u4E0E\u65E0\u5984\u3002", fortune: "\u5409" },
  { num: 26, name: "\u5927\u755C", trigram: "\u2636\u2630", verse: "\u5229\u8D1E\uFF0C\u4E0D\u5BB6\u98DF\u5409\u3002", image: "\u5929\u5728\u5C71\u4E2D\uFF0C\u5927\u755C\uFF1B\u541B\u5B50\u4EE5\u591A\u8BC6\u524D\u8A00\u5F80\u884C\u3002", fortune: "\u5409" },
  { num: 27, name: "\u9890", trigram: "\u2636\u2633", verse: "\u8D1E\u5409\u3002\u89C2\u9890\uFF0C\u81EA\u6C42\u53E3\u5B9E\u3002", image: "\u5C71\u4E0B\u6709\u96F7\uFF0C\u9890\uFF1B\u541B\u5B50\u4EE5\u614E\u8A00\u8BED\uFF0C\u8282\u996E\u98DF\u3002", fortune: "\u5E73" },
  { num: 28, name: "\u5927\u8FC7", trigram: "\u2631\u2634", verse: "\u680B\u6861\u3002\u5229\u6709\u6538\u5F80\uFF0C\u4EA8\u3002", image: "\u6CFD\u706D\u6728\uFF0C\u5927\u8FC7\uFF1B\u541B\u5B50\u4EE5\u72EC\u7ACB\u4E0D\u60E7\u3002", fortune: "\u51F6" },
  { num: 29, name: "\u574E", trigram: "\u2635\u2635", verse: "\u4E60\u574E\uFF0C\u6709\u5B5A\uFF0C\u7EF4\u5FC3\u4EA8\u3002", image: "\u6C34\u6D0A\u81F3\uFF0C\u4E60\u574E\uFF1B\u541B\u5B50\u4EE5\u5E38\u5FB7\u884C\u3002", fortune: "\u51F6" },
  { num: 30, name: "\u79BB", trigram: "\u2632\u2632", verse: "\u5229\u8D1E\uFF0C\u4EA8\u3002\u755C\u725D\u725B\uFF0C\u5409\u3002", image: "\u660E\u4E24\u4F5C\uFF0C\u79BB\uFF1B\u5927\u4EBA\u4EE5\u7EE7\u660E\u7167\u4E8E\u56DB\u65B9\u3002", fortune: "\u5409" },
  { num: 31, name: "\u54B8", trigram: "\u2631\u2636", verse: "\u4EA8\uFF0C\u5229\u8D1E\uFF0C\u53D6\u5973\u5409\u3002", image: "\u5C71\u4E0A\u6709\u6CFD\uFF0C\u54B8\uFF1B\u541B\u5B50\u4EE5\u865A\u53D7\u4EBA\u3002", fortune: "\u5409" },
  { num: 32, name: "\u6052", trigram: "\u2633\u2634", verse: "\u4EA8\uFF0C\u65E0\u548E\uFF0C\u5229\u8D1E\u3002", image: "\u96F7\u98CE\uFF0C\u6052\uFF1B\u541B\u5B50\u4EE5\u7ACB\u4E0D\u6613\u65B9\u3002", fortune: "\u5409" },
  { num: 33, name: "\u9041", trigram: "\u2630\u2636", verse: "\u4EA8\uFF0C\u5C0F\u5229\u8D1E\u3002", image: "\u5929\u4E0B\u6709\u5C71\uFF0C\u9041\uFF1B\u541B\u5B50\u4EE5\u8FDC\u5C0F\u4EBA\u3002", fortune: "\u5E73" },
  { num: 34, name: "\u5927\u58EE", trigram: "\u2633\u2630", verse: "\u5229\u8D1E\u3002", image: "\u96F7\u5728\u5929\u4E0A\uFF0C\u5927\u58EE\uFF1B\u541B\u5B50\u4EE5\u975E\u793C\u5F17\u5C65\u3002", fortune: "\u5409" },
  { num: 35, name: "\u664B", trigram: "\u2632\u2637", verse: "\u5EB7\u4FAF\u7528\u9521\u9A6C\u8543\u5EB6\uFF0C\u663C\u65E5\u4E09\u63A5\u3002", image: "\u660E\u51FA\u5730\u4E0A\uFF0C\u664B\uFF1B\u541B\u5B50\u4EE5\u81EA\u662D\u660E\u5FB7\u3002", fortune: "\u5409" },
  { num: 36, name: "\u660E\u5937", trigram: "\u2637\u2632", verse: "\u5229\u8270\u8D1E\u3002", image: "\u660E\u5165\u5730\u4E2D\uFF0C\u660E\u5937\uFF1B\u541B\u5B50\u4EE5\u8385\u4F17\uFF0C\u7528\u6666\u800C\u660E\u3002", fortune: "\u51F6" },
  { num: 37, name: "\u5BB6\u4EBA", trigram: "\u2634\u2632", verse: "\u5229\u5973\u8D1E\u3002", image: "\u98CE\u81EA\u706B\u51FA\uFF0C\u5BB6\u4EBA\uFF1B\u541B\u5B50\u4EE5\u8A00\u6709\u7269\u800C\u884C\u6709\u6052\u3002", fortune: "\u5409" },
  { num: 38, name: "\u777D", trigram: "\u2632\u2631", verse: "\u5C0F\u4E8B\u5409\u3002", image: "\u4E0A\u706B\u4E0B\u6CFD\uFF0C\u777D\uFF1B\u541B\u5B50\u4EE5\u540C\u800C\u5F02\u3002", fortune: "\u5E73" },
  { num: 39, name: "\u8E47", trigram: "\u2635\u2636", verse: "\u5229\u897F\u5357\uFF0C\u4E0D\u5229\u4E1C\u5317\u3002", image: "\u5C71\u4E0A\u6709\u6C34\uFF0C\u8E47\uFF1B\u541B\u5B50\u4EE5\u53CD\u8EAB\u4FEE\u5FB7\u3002", fortune: "\u51F6" },
  { num: 40, name: "\u89E3", trigram: "\u2633\u2635", verse: "\u5229\u897F\u5357\uFF0C\u65E0\u6240\u5F80\u3002", image: "\u96F7\u96E8\u4F5C\uFF0C\u89E3\uFF1B\u541B\u5B50\u4EE5\u8D66\u8FC7\u5BA5\u7F6A\u3002", fortune: "\u5409" },
  { num: 41, name: "\u635F", trigram: "\u2636\u2631", verse: "\u6709\u5B5A\uFF0C\u5143\u5409\uFF0C\u65E0\u548E\u3002", image: "\u5C71\u4E0B\u6709\u6CFD\uFF0C\u635F\uFF1B\u541B\u5B50\u4EE5\u60E9\u5FFF\u7A92\u6B32\u3002", fortune: "\u5E73" },
  { num: 42, name: "\u76CA", trigram: "\u2634\u2633", verse: "\u5229\u6709\u6538\u5F80\uFF0C\u5229\u6D89\u5927\u5DDD\u3002", image: "\u98CE\u96F7\uFF0C\u76CA\uFF1B\u541B\u5B50\u4EE5\u89C1\u5584\u5219\u8FC1\u3002", fortune: "\u5409" },
  { num: 43, name: "\u592C", trigram: "\u2631\u2630", verse: "\u626C\u4E8E\u738B\u5EAD\uFF0C\u5B5A\u53F7\u6709\u5389\u3002", image: "\u6CFD\u4E0A\u4E8E\u5929\uFF0C\u592C\uFF1B\u541B\u5B50\u4EE5\u65BD\u7984\u53CA\u4E0B\u3002", fortune: "\u5E73" },
  { num: 44, name: "\u59E4", trigram: "\u2630\u2634", verse: "\u5973\u58EE\uFF0C\u52FF\u7528\u53D6\u5973\u3002", image: "\u5929\u4E0B\u6709\u98CE\uFF0C\u59E4\uFF1B\u540E\u4EE5\u65BD\u547D\u8BF0\u56DB\u65B9\u3002", fortune: "\u5E73" },
  { num: 45, name: "\u8403", trigram: "\u2631\u2637", verse: "\u4EA8\u3002\u738B\u5047\u6709\u5E99\u3002", image: "\u6CFD\u4E0A\u4E8E\u5730\uFF0C\u8403\uFF1B\u541B\u5B50\u4EE5\u9664\u620E\u5668\u3002", fortune: "\u5409" },
  { num: 46, name: "\u5347", trigram: "\u2637\u2634", verse: "\u5143\u4EA8\uFF0C\u7528\u89C1\u5927\u4EBA\u3002", image: "\u5730\u4E2D\u751F\u6728\uFF0C\u5347\uFF1B\u541B\u5B50\u4EE5\u987A\u5FB7\uFF0C\u79EF\u5C0F\u4EE5\u9AD8\u5927\u3002", fortune: "\u5409" },
  { num: 47, name: "\u56F0", trigram: "\u2635\u2631", verse: "\u4EA8\uFF0C\u8D1E\uFF0C\u5927\u4EBA\u5409\u3002", image: "\u6CFD\u65E0\u6C34\uFF0C\u56F0\uFF1B\u541B\u5B50\u4EE5\u81F4\u547D\u9042\u5FD7\u3002", fortune: "\u51F6" },
  { num: 48, name: "\u4E95", trigram: "\u2635\u2634", verse: "\u6539\u9091\u4E0D\u6539\u4E95\uFF0C\u65E0\u4E27\u65E0\u5F97\u3002", image: "\u6728\u4E0A\u6709\u6C34\uFF0C\u4E95\uFF1B\u541B\u5B50\u4EE5\u52B3\u6C11\u529D\u76F8\u3002", fortune: "\u5E73" },
  { num: 49, name: "\u9769", trigram: "\u2631\u2632", verse: "\u5DF3\u65E5\u4E43\u5B5A\uFF0C\u5143\u4EA8\u5229\u8D1E\u3002", image: "\u6CFD\u4E2D\u6709\u706B\uFF0C\u9769\uFF1B\u541B\u5B50\u4EE5\u6CBB\u5386\u660E\u65F6\u3002", fortune: "\u5E73" },
  { num: 50, name: "\u9F0E", trigram: "\u2632\u2634", verse: "\u5143\u5409\uFF0C\u4EA8\u3002", image: "\u6728\u4E0A\u6709\u706B\uFF0C\u9F0E\uFF1B\u541B\u5B50\u4EE5\u6B63\u4F4D\u51DD\u547D\u3002", fortune: "\u5409" },
  { num: 51, name: "\u9707", trigram: "\u2633\u2633", verse: "\u4EA8\u3002\u9707\u6765\u8669\u8669\uFF0C\u7B11\u8A00\u54D1\u54D1\u3002", image: "\u6D0A\u96F7\uFF0C\u9707\uFF1B\u541B\u5B50\u4EE5\u6050\u60E7\u4FEE\u7701\u3002", fortune: "\u5E73" },
  { num: 52, name: "\u826E", trigram: "\u2636\u2636", verse: "\u826E\u5176\u80CC\uFF0C\u4E0D\u83B7\u5176\u8EAB\u3002", image: "\u517C\u5C71\uFF0C\u826E\uFF1B\u541B\u5B50\u4EE5\u601D\u4E0D\u51FA\u5176\u4F4D\u3002", fortune: "\u5E73" },
  { num: 53, name: "\u6E10", trigram: "\u2636\u2633", verse: "\u5973\u5F52\u5409\uFF0C\u5229\u8D1E\u3002", image: "\u5C71\u4E0A\u6709\u6728\uFF0C\u6E10\uFF1B\u541B\u5B50\u4EE5\u5C45\u8D24\u5FB7\u5584\u4FD7\u3002", fortune: "\u5409" },
  { num: 54, name: "\u5F52\u59B9", trigram: "\u2633\u2631", verse: "\u5F81\u51F6\uFF0C\u65E0\u6538\u5229\u3002", image: "\u6CFD\u4E0A\u6709\u96F7\uFF0C\u5F52\u59B9\uFF1B\u541B\u5B50\u4EE5\u6C38\u7EC8\u77E5\u655D\u3002", fortune: "\u51F6" },
  { num: 55, name: "\u4E30", trigram: "\u2633\u2632", verse: "\u4EA8\uFF0C\u738B\u5047\u4E4B\u3002", image: "\u96F7\u7535\u7686\u81F3\uFF0C\u4E30\uFF1B\u541B\u5B50\u4EE5\u6298\u72F1\u81F4\u5211\u3002", fortune: "\u5409" },
  { num: 56, name: "\u65C5", trigram: "\u2632\u2636", verse: "\u5C0F\u4EA8\uFF0C\u65C5\u8D1E\u5409\u3002", image: "\u5C71\u4E0A\u6709\u706B\uFF0C\u65C5\uFF1B\u541B\u5B50\u4EE5\u660E\u614E\u7528\u5211\u3002", fortune: "\u5E73" },
  { num: 57, name: "\u5DFD", trigram: "\u2634\u2634", verse: "\u5C0F\u4EA8\uFF0C\u5229\u6709\u6538\u5F80\u3002", image: "\u968F\u98CE\uFF0C\u5DFD\uFF1B\u541B\u5B50\u4EE5\u7533\u547D\u884C\u4E8B\u3002", fortune: "\u5E73" },
  { num: 58, name: "\u5151", trigram: "\u2631\u2631", verse: "\u4EA8\uFF0C\u5229\u8D1E\u3002", image: "\u4E3D\u6CFD\uFF0C\u5151\uFF1B\u541B\u5B50\u4EE5\u670B\u53CB\u8BB2\u4E60\u3002", fortune: "\u5409" },
  { num: 59, name: "\u6DA3", trigram: "\u2634\u2635", verse: "\u4EA8\u3002\u738B\u5047\u6709\u5E99\u3002", image: "\u98CE\u884C\u6C34\u4E0A\uFF0C\u6DA3\uFF1B\u5148\u738B\u4EE5\u4EAB\u4E8E\u5E1D\u7ACB\u5E99\u3002", fortune: "\u5E73" },
  { num: 60, name: "\u8282", trigram: "\u2635\u2631", verse: "\u4EA8\u3002\u82E6\u8282\u4E0D\u53EF\u8D1E\u3002", image: "\u6CFD\u4E0A\u6709\u6C34\uFF0C\u8282\uFF1B\u541B\u5B50\u4EE5\u5236\u6570\u5EA6\uFF0C\u8BAE\u5FB7\u884C\u3002", fortune: "\u5E73" },
  { num: 61, name: "\u4E2D\u5B5A", trigram: "\u2634\u2631", verse: "\u8C5A\u9C7C\u5409\uFF0C\u5229\u6D89\u5927\u5DDD\u3002", image: "\u6CFD\u4E0A\u6709\u98CE\uFF0C\u4E2D\u5B5A\uFF1B\u541B\u5B50\u4EE5\u8BAE\u72F1\u7F13\u6B7B\u3002", fortune: "\u5409" },
  { num: 62, name: "\u5C0F\u8FC7", trigram: "\u2633\u2636", verse: "\u4EA8\u5229\u8D1E\uFF0C\u53EF\u5C0F\u4E8B\u4E0D\u53EF\u5927\u4E8B\u3002", image: "\u5C71\u4E0A\u6709\u96F7\uFF0C\u5C0F\u8FC7\uFF1B\u541B\u5B50\u4EE5\u884C\u8FC7\u4E4E\u606D\u3002", fortune: "\u5E73" },
  { num: 63, name: "\u65E2\u6D4E", trigram: "\u2635\u2632", verse: "\u4EA8\u5C0F\uFF0C\u5229\u8D1E\uFF0C\u521D\u5409\u7EC8\u4E71\u3002", image: "\u6C34\u5728\u706B\u4E0A\uFF0C\u65E2\u6D4E\uFF1B\u541B\u5B50\u4EE5\u601D\u60A3\u800C\u9884\u9632\u3002", fortune: "\u5E73" },
  { num: 64, name: "\u672A\u6D4E", trigram: "\u2632\u2635", verse: "\u4EA8\u3002\u5C0F\u72D0\u6C54\u6D4E\uFF0C\u6FE1\u5176\u5C3E\u3002", image: "\u706B\u5728\u6C34\u4E0A\uFF0C\u672A\u6D4E\uFF1B\u541B\u5B50\u4EE5\u614E\u8FA8\u7269\u5C45\u65B9\u3002", fortune: "\u5E73" }
];
function castLine() {
  const coins = [
    Math.random() < 0.5 ? 3 : 2,
    Math.random() < 0.5 ? 3 : 2,
    Math.random() < 0.5 ? 3 : 2
  ];
  const sum = coins.reduce((a, b) => a + b, 0);
  switch (sum) {
    case 6:
      return { value: 6, type: "old_yin", symbol: "\xD7" };
    case 7:
      return { value: 7, type: "young_yang", symbol: "\u2501\u2501\u2501" };
    case 8:
      return { value: 8, type: "young_yin", symbol: "\u2501 \u2501" };
    case 9:
      return { value: 9, type: "old_yang", symbol: "\u2501\u2501\u2501\u25CB" };
    default:
      return { value: 8, type: "young_yin", symbol: "\u2501 \u2501" };
  }
}
__name(castLine, "castLine");
function castHexagram(question = "") {
  const lines = [];
  for (let i = 0; i < 6; i++)
    lines.push(castLine());
  let bin = 0;
  for (let i = 0; i < 6; i++) {
    const isYang = lines[i].value === 7 || lines[i].value === 9;
    if (isYang)
      bin |= 1 << i;
  }
  const idx = bin % 64 + 1;
  const hexagram = HEXAGRAMS[idx - 1] || HEXAGRAMS[0];
  const lowerTrigram = hexagram.trigram?.[0] || "\u2630";
  const trigramInfo = TRIGRAMS[lowerTrigram] || TRIGRAMS["\u2630"];
  const changingLines = lines.map((l, i) => l.type === "old_yang" || l.type === "old_yin" ? i + 1 : null).filter(Boolean);
  return {
    gua: hexagram.name,
    trigram: hexagram.trigram,
    element: trigramInfo.element,
    verse: hexagram.verse,
    image: hexagram.image,
    fortune: hexagram.fortune,
    lines: lines.map((l) => ({ symbol: l.symbol, type: l.type, value: l.value })),
    changingLines,
    question
  };
}
__name(castHexagram, "castHexagram");
function interpretHexagram(hexagram, question = "", dialogues = []) {
  if (!hexagram) {
    return {
      summary: "\u5366\u8C61\u672A\u660E\uFF0C\u5B9C\u9759\u4E0D\u5B9C\u52A8\u3002",
      advice: "\u8BF7\u5148\u8D77\u5366\u518D\u6C42\u89E3\u8BFB\u3002",
      pillar1: "",
      pillar2: "",
      pillar3: "",
      pillar4: ""
    };
  }
  const { gua, verse, image, fortune, changingLines = [] } = hexagram;
  const toneMap = {
    \u5927\u5409: "\u987A\u52BF\u800C\u4E3A\uFF0C\u53EF\u653E\u624B\u53BB\u505A\uFF0C\u4F46\u76DB\u6781\u9632\u8870\u3002",
    \u5409: "\u5366\u8C61\u987A\u9042\uFF0C\u65B9\u5411\u53EF\u884C\uFF0C\u7EC6\u8282\u51B3\u5B9A\u6210\u8D25\u3002",
    \u5E73: "\u5366\u8C61\u6301\u5E73\uFF0C\u8FDB\u9000\u7686\u53EF\uFF0C\u5173\u952E\u5728\u4E3B\u52A8\u53D6\u820D\u3002",
    \u51F6: "\u5366\u8C61\u6709\u9669\uFF0C\u5B9C\u5B88\u4E0D\u5B9C\u8FDB\uFF0C\u4E09\u601D\u540E\u884C\u3002"
  };
  const tone = toneMap[fortune] || toneMap["\u5E73"];
  const dialogueHint = dialogues.length ? dialogues.map((d) => `${d.name}: ${d.text?.slice(0, 40) || ""}\u2026`).join(" / ") : "\u65E0\u65C1\u8BC1\u53EF\u53C2\uFF0C\u4E13\u6043\u672C\u5366";
  const summary = `\u95EE"${truncate2(question, 30)}"\uFF0C\u5F97\u300A${gua}\u300B\u5366\u3002
\u5366\u8F9E\u4E91\uFF1A${verse}
\u8C61\u66F0\uFF1A${image}
${tone}
\u53D8\u723B\uFF1A${changingLines.length ? `\u7B2C ${changingLines.join("\u3001")} \u723B\u52A8` : "\u65E0\u53D8\u723B\uFF0C\u5B9C\u4F9D\u672C\u5366\u53D6\u8C61"}\u3002`;
  const advice = `${tone} ${changingLines.length ? "\u52A8\u723B\u65E2\u51FA\uFF0C\u4E8B\u6709\u53D8\u673A\uFF0C\u5B9C\u76F8\u673A\u800C\u52A8\u3002" : "\u672C\u5366\u4E0D\u52A8\uFF0C\u5B9C\u4F9D\u8C61\u884C\u4E8B\u3002"}
\u53C2\u8BF8\u667A\u56CA\u6240\u8A00\uFF1A${dialogueHint}`;
  return {
    summary,
    advice,
    pillar1: `\u65F6\u4F4D\uFF1A${fortune === "\u51F6" ? "\u65F6\u672A\u81F3\uFF0C\u5B9C\u5F85\u3002" : "\u65F6\u5DF2\u81F3\uFF0C\u5B9C\u884C\u3002"}\u5366\u5C5E${hexagram.element}\u884C\u3002`,
    pillar2: `\u5173\u7A8D\uFF1A${changingLines.length ? "\u53D8\u723B\u5373\u5173\u7A8D\uFF0C\u5BDF\u52A8\u5904\u89C1\u673A\u3002" : "\u672C\u5366\u4E0D\u53D8\uFF0C\u8C61\u8F9E\u4E3A\u5173\u7A8D\u3002"}`,
    pillar3: `\u5FCC\u8BB3\uFF1A${fortune === "\u5409" || fortune === "\u5927\u5409" ? "\u76DB\u800C\u9A84\uFF0C\u5219\u53CD\u51F6\u3002" : "\u8E81\u800C\u8FDB\uFF0C\u5219\u635F\u8EAB\u3002"}`,
    pillar4: `\u5E94\u624B\uFF1A${fortune === "\u51F6" ? "\u9000\u5B88\u9759\u89C2\uFF0C\u84C4\u52BF\u518D\u53D1\u3002" : "\u987A\u8C61\u800C\u52A8\uFF0C\u6267\u4E2D\u800C\u884C\u3002"}`
  };
}
__name(interpretHexagram, "interpretHexagram");
function truncate2(str, n) {
  if (!str)
    return "";
  return str.length > n ? str.slice(0, n) + "\u2026" : str;
}
__name(truncate2, "truncate");

// src/routes/divination.js
var app5 = new Hono2();
app5.use("*", authMiddleware);
var castSchema = external_exports.object({
  question: external_exports.string().min(1).max(500)
});
var interpretSchema = external_exports.object({
  hexagram: external_exports.object({
    gua: external_exports.string(),
    trigram: external_exports.string().optional(),
    element: external_exports.string().optional(),
    verse: external_exports.string().optional(),
    image: external_exports.string().optional(),
    fortune: external_exports.string().optional(),
    lines: external_exports.array(external_exports.any()).optional(),
    changingLines: external_exports.array(external_exports.number()).optional(),
    question: external_exports.string().optional()
  }).passthrough(),
  question: external_exports.string().min(1).max(500),
  dialogues: external_exports.array(
    external_exports.object({
      agentId: external_exports.string(),
      name: external_exports.string().optional(),
      text: external_exports.string()
    })
  ).optional()
});
app5.post("/cast", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = castSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const { question } = parsed.data;
  const result = castHexagram(question);
  return c.json(result);
});
app5.post("/interpret", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = interpretSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const { hexagram, question, dialogues } = parsed.data;
  const result = interpretHexagram(hexagram, question, dialogues || []);
  return c.json(result);
});
var divination_default = app5;

// src/routes/cards.js
var app6 = new Hono2();
app6.use("*", authMiddleware);
var createCardSchema = external_exports.object({
  sessionId: external_exports.string().optional(),
  gua: external_exports.string().max(32).optional(),
  trigram: external_exports.string().max(16).optional(),
  element: external_exports.string().max(16).optional(),
  title: external_exports.string().min(1).max(120),
  question: external_exports.string().max(500).optional(),
  decision: external_exports.string().max(500).optional(),
  verse: external_exports.string().max(500).optional(),
  summary: external_exports.string().max(2e3).optional(),
  advisors: external_exports.array(external_exports.string()).optional(),
  rarity: external_exports.string().max(32).optional(),
  style: external_exports.string().max(32).optional(),
  pillars: external_exports.string().max(2e3).optional(),
  powerfulQuestion: external_exports.string().max(500).optional(),
  framework: external_exports.string().max(500).optional()
});
var updateCardSchema = createCardSchema.partial();
var noteCreateSchema = external_exports.object({
  content: external_exports.string().min(1).max(1e3)
});
function publicCard(c) {
  if (!c)
    return null;
  return {
    id: c.id,
    sessionId: c.session_id || null,
    gua: c.gua || null,
    trigram: c.trigram || null,
    element: c.element || null,
    title: c.title,
    question: c.question || null,
    decision: c.decision || null,
    verse: c.verse || null,
    summary: c.summary || null,
    advisors: safeJsonParse(c.advisors, []) || [],
    rarity: c.rarity || null,
    style: c.style || null,
    pillars: c.pillars || null,
    powerfulQuestion: c.powerful_question || null,
    framework: c.framework || null,
    isShared: c.is_shared === 1,
    createdAt: c.created_at,
    updatedAt: c.updated_at
  };
}
__name(publicCard, "publicCard");
async function loadOwnedCard(c, cardId) {
  if (!isValidUuid(cardId))
    throw errors.badRequest("\u547D\u7B7E ID \u683C\u5F0F\u4E0D\u6B63\u786E");
  const userId = c.get("userId");
  const card = await c.env.DB.prepare(
    `SELECT * FROM cards WHERE id = ? AND user_id = ? LIMIT 1`
  ).bind(cardId, userId).first();
  if (!card)
    throw errors.notFound("\u547D\u7B7E\u4E0D\u5B58\u5728\u6216\u65E0\u6743\u8BBF\u95EE");
  return card;
}
__name(loadOwnedCard, "loadOwnedCard");
app6.get("/", async (c) => {
  const userId = c.get("userId");
  const { page, pageSize, offset } = parsePagination(c);
  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM cards WHERE user_id = ?`
  ).bind(userId).first();
  const rows = await c.env.DB.prepare(
    `SELECT * FROM cards WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(userId, pageSize, offset).all();
  return c.json({
    cards: (rows.results || []).map(publicCard),
    pagination: { page, pageSize, total: total?.n || 0 }
  });
});
app6.get("/:id", async (c) => {
  const card = await loadOwnedCard(c, c.req.param("id"));
  return c.json({ card: publicCard(card) });
});
app6.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const data = parsed.data;
  const userId = c.get("userId");
  const id = uuid();
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO cards
      (id, user_id, session_id, gua, trigram, element, title, question, decision,
       verse, summary, advisors, rarity, style, pillars, powerful_question, framework,
       is_shared, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).bind(
    id,
    userId,
    data.sessionId || null,
    data.gua || null,
    data.trigram || null,
    data.element || null,
    data.title,
    data.question || null,
    data.decision || null,
    data.verse || null,
    data.summary || null,
    safeJsonStringify(data.advisors || []),
    data.rarity || null,
    data.style || null,
    data.pillars || null,
    data.powerfulQuestion || null,
    data.framework || null,
    nowIso,
    nowIso
  ).run();
  const card = await c.env.DB.prepare(
    `SELECT * FROM cards WHERE id = ? LIMIT 1`
  ).bind(id).first();
  return c.json({ card: publicCard(card) }, 201);
});
app6.put("/:id", async (c) => {
  const cardId = c.req.param("id");
  await loadOwnedCard(c, cardId);
  const body = await c.req.json().catch(() => null);
  const parsed = updateCardSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const data = parsed.data;
  const fieldMap = {
    sessionId: "session_id",
    gua: "gua",
    trigram: "trigram",
    element: "element",
    title: "title",
    question: "question",
    decision: "decision",
    verse: "verse",
    summary: "summary",
    rarity: "rarity",
    style: "style",
    pillars: "pillars",
    powerfulQuestion: "powerful_question",
    framework: "framework"
  };
  const sets = [];
  const values = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === void 0)
      continue;
    if (k === "advisors") {
      sets.push("advisors = ?");
      values.push(safeJsonStringify(v));
    } else if (fieldMap[k]) {
      sets.push(`${fieldMap[k]} = ?`);
      values.push(v);
    }
  }
  if (sets.length === 0)
    throw errors.badRequest("\u65E0\u53EF\u66F4\u65B0\u5B57\u6BB5");
  sets.push("updated_at = ?");
  values.push((/* @__PURE__ */ new Date()).toISOString());
  values.push(cardId);
  await c.env.DB.prepare(
    `UPDATE cards SET ${sets.join(", ")} WHERE id = ?`
  ).bind(...values).run();
  const card = await c.env.DB.prepare(
    `SELECT * FROM cards WHERE id = ? LIMIT 1`
  ).bind(cardId).first();
  return c.json({ card: publicCard(card) });
});
app6.delete("/:id", async (c) => {
  const cardId = c.req.param("id");
  await loadOwnedCard(c, cardId);
  const userId = c.get("userId");
  const stmts = [
    c.env.DB.prepare(`DELETE FROM card_notes WHERE card_id = ?`).bind(cardId),
    c.env.DB.prepare(`DELETE FROM cards WHERE id = ? AND user_id = ?`).bind(cardId, userId)
  ];
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});
app6.post("/:id/share", async (c) => {
  const cardId = c.req.param("id");
  const card = await loadOwnedCard(c, cardId);
  const userId = c.get("userId");
  if (card.is_shared === 1) {
    return c.json({ ok: true, alreadyShared: true });
  }
  await c.env.DB.prepare(
    `UPDATE cards SET is_shared = 1, updated_at = ? WHERE id = ? AND user_id = ?`
  ).bind((/* @__PURE__ */ new Date()).toISOString(), cardId, userId).run();
  const postId = uuid();
  await c.env.DB.prepare(
    `INSERT INTO community_posts
      (id, user_id, user_name, user_avatar, user_color, title, content, tag, trigram, gua, card_id)
     SELECT ?, u.id, u.nickname, u.avatar, u.color, ?, ?, 'card_share', ?, ?, ?
     FROM users u WHERE u.id = ?`
  ).bind(
    postId,
    card.title,
    card.summary || card.question || "",
    card.trigram || null,
    card.gua || null,
    cardId,
    userId
  ).run().catch((e) => {
    console.warn("[cards] \u540C\u6B65\u793E\u533A\u5E16\u5B50\u5931\u8D25:", e.message);
  });
  return c.json({ ok: true, postId });
});
app6.get("/:id/notes", async (c) => {
  const cardId = c.req.param("id");
  await loadOwnedCard(c, cardId);
  const rows = await c.env.DB.prepare(
    `SELECT * FROM card_notes WHERE card_id = ? ORDER BY created_at DESC`
  ).bind(cardId).all();
  const notes = (rows.results || []).map((n) => ({
    id: n.id,
    cardId: n.card_id,
    userId: n.user_id,
    content: n.content,
    createdAt: n.created_at
  }));
  return c.json({ notes });
});
app6.post("/:id/notes", async (c) => {
  const cardId = c.req.param("id");
  await loadOwnedCard(c, cardId);
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = noteCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || "\u53C2\u6570\u9519\u8BEF", "VALIDATION_ERROR");
  }
  const { content } = parsed.data;
  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO card_notes (id, card_id, user_id, content) VALUES (?, ?, ?, ?)`
  ).bind(id, cardId, userId, content).run();
  const note = await c.env.DB.prepare(
    `SELECT * FROM card_notes WHERE id = ? LIMIT 1`
  ).bind(id).first();
  return c.json({
    note: {
      id: note.id,
      cardId: note.card_id,
      userId: note.user_id,
      content: note.content,
      createdAt: note.created_at
    }
  }, 201);
});
app6.delete("/:id/notes/:noteId", async (c) => {
  const cardId = c.req.param("id");
  const noteId = c.req.param("noteId");
  if (!isValidUuid(noteId))
    throw errors.badRequest("\u7B14\u8BB0 ID \u683C\u5F0F\u4E0D\u6B63\u786E");
  await loadOwnedCard(c, cardId);
  const userId = c.get("userId");
  const result = await c.env.DB.prepare(
    `DELETE FROM card_notes WHERE id = ? AND card_id = ? AND user_id = ?`
  ).bind(noteId, cardId, userId).run();
  if (!result.meta.changes) {
    throw errors.notFound("\u7B14\u8BB0\u4E0D\u5B58\u5728\u6216\u65E0\u6743\u5220\u9664");
  }
  return c.json({ ok: true });
});
var cards_default = app6;

// src/routes/community.js
var app7 = new Hono2();
app7.use("*", optionalAuth);
app7.get("/posts", async (c) => {
  try {
    const { page, pageSize, offset } = parsePagination(c);
    const tag = c.req.query("tag");
    const sort = c.req.query("sort") === "hot" ? "hot" : "new";
    const where = tag ? "WHERE p.tag = ?" : "WHERE 1=1";
    const params = tag ? [tag] : [];
    const orderBy = sort === "hot" ? "ORDER BY (p.likes + p.replies_count * 2) DESC, p.created_at DESC" : "ORDER BY p.created_at DESC";
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM community_posts p ${where}`
    ).bind(...params).first();
    const list = await c.env.DB.prepare(
      `SELECT p.id, p.title, p.content, p.tag, p.trigram, p.gua, p.card_id,
              p.likes, p.replies_count, p.pinned, p.created_at,
              u.nickname AS user_name, u.avatar AS user_avatar, u.color AS user_color
       FROM community_posts p
       LEFT JOIN users u ON u.id = p.user_id
       ${where}
       ${orderBy}
       LIMIT ? OFFSET ?`
    ).bind(...params, pageSize, offset).all();
    return c.json({
      items: list.results,
      total: countRow?.total || 0,
      page,
      pageSize
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
app7.get("/posts/:id", async (c) => {
  try {
    const post = await c.env.DB.prepare(
      `SELECT p.*, u.nickname AS user_name, u.avatar AS user_avatar, u.color AS user_color
       FROM community_posts p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = ?`
    ).bind(c.req.param("id")).first();
    if (!post)
      throw errors.notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
    let liked = false;
    const userId = c.get("userId");
    if (userId) {
      const row = await c.env.DB.prepare(
        "SELECT 1 FROM community_likes WHERE post_id = ? AND user_id = ?"
      ).bind(post.id, userId).first();
      liked = !!row;
    }
    return c.json({ ...post, liked });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app7.post("/posts", authMiddleware, async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const { title: title2, content, tag, trigram, gua, cardId } = body;
    if (!title2 || !content)
      throw errors.badRequest("title \u4E0E content \u5FC5\u586B");
    if (typeof title2 !== "string" || title2.length > 200)
      throw errors.badRequest("title \u957F\u5EA6\u9700\u5728 200 \u5B57\u4EE5\u5185");
    const user = await c.env.DB.prepare(
      "SELECT nickname, avatar, color FROM users WHERE id = ?"
    ).bind(userId).first();
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO community_posts
       (id, user_id, user_name, user_avatar, user_color, title, content, tag, trigram, gua, card_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      userId,
      user?.nickname || null,
      user?.avatar || null,
      user?.color || null,
      title2,
      content,
      tag || null,
      trigram || null,
      gua || null,
      cardId || null
    ).run();
    await audit(c, "community_post_create", "community_post", id);
    return c.json({ id, message: "\u5E16\u5B50\u5DF2\u53D1\u5E03" }, 201);
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app7.delete("/posts/:id", authMiddleware, async (c) => {
  try {
    const userId = c.get("userId");
    const postId = c.req.param("id");
    const post = await c.env.DB.prepare(
      "SELECT user_id FROM community_posts WHERE id = ?"
    ).bind(postId).first();
    if (!post)
      throw errors.notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
    if (post.user_id !== userId)
      throw errors.forbidden("\u53EA\u80FD\u5220\u9664\u81EA\u5DF1\u7684\u5E16\u5B50");
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM community_replies WHERE post_id = ?").bind(postId),
      c.env.DB.prepare("DELETE FROM community_likes WHERE post_id = ?").bind(postId),
      c.env.DB.prepare("DELETE FROM community_posts WHERE id = ?").bind(postId)
    ]);
    await audit(c, "community_post_delete", "community_post", postId);
    return c.json({ success: true });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app7.get("/posts/:id/replies", async (c) => {
  try {
    const { page, pageSize, offset } = parsePagination(c);
    const postId = c.req.param("id");
    const countRow = await c.env.DB.prepare(
      "SELECT COUNT(*) as total FROM community_replies WHERE post_id = ?"
    ).bind(postId).first();
    const list = await c.env.DB.prepare(
      `SELECT r.*, u.nickname AS user_name, u.avatar AS user_avatar, u.color AS user_color
       FROM community_replies r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.post_id = ?
       ORDER BY r.created_at ASC
       LIMIT ? OFFSET ?`
    ).bind(postId, pageSize, offset).all();
    return c.json({
      items: list.results,
      total: countRow?.total || 0,
      page,
      pageSize
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
app7.post("/posts/:id/replies", authMiddleware, async (c) => {
  try {
    const userId = c.get("userId");
    const postId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { content } = body;
    if (!content || typeof content !== "string")
      throw errors.badRequest("content \u5FC5\u586B");
    const post = await c.env.DB.prepare(
      "SELECT id FROM community_posts WHERE id = ?"
    ).bind(postId).first();
    if (!post)
      throw errors.notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
    const user = await c.env.DB.prepare(
      "SELECT nickname, avatar, color FROM users WHERE id = ?"
    ).bind(userId).first();
    const id = uuid();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO community_replies
         (id, post_id, user_id, user_name, user_avatar, user_color, content)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        postId,
        userId,
        user?.nickname || null,
        user?.avatar || null,
        user?.color || null,
        content
      ),
      c.env.DB.prepare(
        "UPDATE community_posts SET replies_count = replies_count + 1, updated_at = ? WHERE id = ?"
      ).bind(now(), postId)
    ]);
    return c.json({ id, message: "\u56DE\u590D\u6210\u529F" }, 201);
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app7.post("/posts/:id/like", authMiddleware, async (c) => {
  try {
    const userId = c.get("userId");
    const postId = c.req.param("id");
    const post = await c.env.DB.prepare(
      "SELECT id FROM community_posts WHERE id = ?"
    ).bind(postId).first();
    if (!post)
      throw errors.notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
    const id = uuid();
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(
          "INSERT INTO community_likes (id, post_id, user_id) VALUES (?, ?, ?)"
        ).bind(id, postId, userId),
        c.env.DB.prepare(
          "UPDATE community_posts SET likes = likes + 1, updated_at = ? WHERE id = ?"
        ).bind(now(), postId)
      ]);
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) {
        throw errors.conflict("\u5DF2\u70B9\u8D5E\u8FC7\u8BE5\u5E16\u5B50");
      }
      throw e;
    }
    return c.json({ success: true, liked: true });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app7.delete("/posts/:id/like", authMiddleware, async (c) => {
  try {
    const userId = c.get("userId");
    const postId = c.req.param("id");
    const existing = await c.env.DB.prepare(
      "SELECT id FROM community_likes WHERE post_id = ? AND user_id = ?"
    ).bind(postId, userId).first();
    if (!existing)
      throw errors.notFound("\u672A\u70B9\u8D5E\u8FC7\u8BE5\u5E16\u5B50");
    await c.env.DB.batch([
      c.env.DB.prepare(
        "DELETE FROM community_likes WHERE post_id = ? AND user_id = ?"
      ).bind(postId, userId),
      c.env.DB.prepare(
        "UPDATE community_posts SET likes = MAX(likes - 1, 0), updated_at = ? WHERE id = ?"
      ).bind(now(), postId)
    ]);
    return c.json({ success: true, liked: false });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app7.get("/shares", async (c) => {
  try {
    const { page, pageSize, offset } = parsePagination(c);
    const countRow = await c.env.DB.prepare(
      "SELECT COUNT(*) as total FROM cards WHERE is_shared = 1"
    ).first();
    const list = await c.env.DB.prepare(
      `SELECT c.id, c.gua, c.trigram, c.element, c.title, c.question, c.decision,
              c.verse, c.summary, c.rarity, c.style, c.created_at,
              u.nickname AS user_name, u.avatar AS user_avatar, u.color AS user_color
       FROM cards c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.is_shared = 1
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(pageSize, offset).all();
    return c.json({
      items: list.results,
      total: countRow?.total || 0,
      page,
      pageSize
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
var community_default = app7;

// src/routes/daily.js
var app8 = new Hono2();
app8.use("*", authMiddleware);
var GUA_LIST = [
  { gua: "\u4E7E", verse: "\u5143\u4EA8\u5229\u8D1E", trigram: "\u4E7E\u4E0A\u4E7E\u4E0B", element: "\u91D1" },
  { gua: "\u5764", verse: "\u5143\u4EA8\uFF0C\u5229\u725D\u9A6C\u4E4B\u8D1E", trigram: "\u5764\u4E0A\u5764\u4E0B", element: "\u571F" },
  { gua: "\u5C6F", verse: "\u5143\u4EA8\u5229\u8D1E\uFF0C\u52FF\u7528\u6709\u6538\u5F80", trigram: "\u574E\u4E0A\u9707\u4E0B", element: "\u6C34" },
  { gua: "\u8499", verse: "\u4EA8\u3002\u532A\u6211\u6C42\u7AE5\u8499", trigram: "\u826E\u4E0A\u574E\u4E0B", element: "\u571F" },
  { gua: "\u9700", verse: "\u6709\u5B5A\uFF0C\u5149\u4EA8\uFF0C\u8D1E\u5409", trigram: "\u574E\u4E0A\u4E7E\u4E0B", element: "\u6C34" },
  { gua: "\u8BBC", verse: "\u6709\u5B5A\uFF0C\u7A92\u3002\u60D5\u4E2D\u5409", trigram: "\u4E7E\u4E0A\u574E\u4E0B", element: "\u91D1" },
  { gua: "\u5E08", verse: "\u8D1E\uFF0C\u4E08\u4EBA\u5409\u65E0\u548E", trigram: "\u5764\u4E0A\u574E\u4E0B", element: "\u571F" },
  { gua: "\u6BD4", verse: "\u5409\u3002\u539F\u7B6E\u5143\u6C38\u8D1E", trigram: "\u574E\u4E0A\u5764\u4E0B", element: "\u6C34" },
  { gua: "\u5C0F\u755C", verse: "\u4EA8\u3002\u5BC6\u4E91\u4E0D\u96E8", trigram: "\u5DFD\u4E0A\u4E7E\u4E0B", element: "\u6728" },
  { gua: "\u5C65", verse: "\u5C65\u864E\u5C3E\uFF0C\u4E0D\u54A5\u4EBA\uFF0C\u4EA8", trigram: "\u4E7E\u4E0A\u5151\u4E0B", element: "\u91D1" },
  { gua: "\u6CF0", verse: "\u5C0F\u5F80\u5927\u6765\uFF0C\u5409\u4EA8", trigram: "\u5764\u4E0A\u4E7E\u4E0B", element: "\u571F" },
  { gua: "\u5426", verse: "\u5426\u4E4B\u532A\u4EBA\uFF0C\u4E0D\u5229\u541B\u5B50\u8D1E", trigram: "\u4E7E\u4E0A\u5764\u4E0B", element: "\u91D1" },
  { gua: "\u540C\u4EBA", verse: "\u540C\u4EBA\u4E8E\u91CE\uFF0C\u4EA8", trigram: "\u4E7E\u4E0A\u79BB\u4E0B", element: "\u91D1" },
  { gua: "\u5927\u6709", verse: "\u5143\u4EA8", trigram: "\u79BB\u4E0A\u4E7E\u4E0B", element: "\u706B" },
  { gua: "\u8C26", verse: "\u4EA8\uFF0C\u541B\u5B50\u6709\u7EC8", trigram: "\u5764\u4E0A\u826E\u4E0B", element: "\u571F" },
  { gua: "\u8C6B", verse: "\u5229\u5EFA\u4FAF\u884C\u5E08", trigram: "\u9707\u4E0A\u5764\u4E0B", element: "\u6728" }
];
var DAILY_MESSAGES = [
  "\u4ECA\u65E5\u5B9C\u9759\u89C2\u5176\u53D8\uFF0C\u5F85\u65F6\u800C\u52A8\u3002",
  "\u673A\u7F18\u5DF2\u73B0\uFF0C\u53EF\u7A33\u6B65\u63A8\u8FDB\u3002",
  "\u4E8B\u5B9C\u7F13\u56FE\uFF0C\u4E0D\u5B9C\u6025\u8FDB\u3002",
  "\u5FC3\u6B63\u5219\u4E8B\u987A\uFF0C\u5B88\u6301\u4E2D\u9053\u3002",
  "\u5C0F\u4E8B\u53EF\u6210\uFF0C\u5927\u4E8B\u5F85\u65F6\u3002",
  "\u53D8\u52A8\u4E4B\u4E2D\u85CF\u673A\u950B\uFF0C\u5B9C\u5BA1\u614E\u3002",
  "\u4ECA\u65E5\u6709\u8D35\u4EBA\u5728\u4FA7\uFF0C\u53EF\u95EE\u53EF\u8C0B\u3002",
  "\u5B9C\u72EC\u601D\uFF0C\u4E0D\u5B9C\u7FA4\u8BAE\u3002"
];
async function hashToGua(userId, date) {
  const data = new TextEncoder().encode(`${userId}:${date}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let n = 0;
  for (let i = 0; i < 8; i++) {
    n = (n * 256 + bytes[i]) % 1000003;
  }
  const guaIdx = n % GUA_LIST.length;
  const msgIdx = (n >> 4) % DAILY_MESSAGES.length;
  return { ...GUA_LIST[guaIdx], message: DAILY_MESSAGES[msgIdx] };
}
__name(hashToGua, "hashToGua");
app8.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const date = c.req.query("date") || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw errors.badRequest("date \u683C\u5F0F\u5E94\u4E3A YYYY-MM-DD");
    const existing = await c.env.DB.prepare(
      "SELECT * FROM daily_divinations WHERE user_id = ? AND date = ?"
    ).bind(userId, date).first();
    if (existing)
      return c.json(existing);
    const g = await hashToGua(userId, date);
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO daily_divinations
       (id, user_id, date, gua, verse, message)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, date, g.gua, g.verse, g.message).run();
    await c.env.DB.prepare(
      `INSERT INTO calendar_events (id, user_id, date, type, ref_id, title)
       VALUES (?, ?, ?, 'daily', ?, ?)`
    ).bind(uuid(), userId, date, id, `\u6BCF\u65E5\u5366\u7B7E \xB7 ${g.gua}`).run().catch(() => {
    });
    return c.json({ id, user_id: userId, date, ...g });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app8.get("/history", async (c) => {
  try {
    const userId = c.get("userId");
    const { page, pageSize, offset } = parsePagination(c);
    const countRow = await c.env.DB.prepare(
      "SELECT COUNT(*) as total FROM daily_divinations WHERE user_id = ?"
    ).bind(userId).first();
    const list = await c.env.DB.prepare(
      `SELECT * FROM daily_divinations
       WHERE user_id = ?
       ORDER BY date DESC
       LIMIT ? OFFSET ?`
    ).bind(userId, pageSize, offset).all();
    return c.json({
      items: list.results,
      total: countRow?.total || 0,
      page,
      pageSize
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
app8.get("/calendar", async (c) => {
  try {
    const userId = c.get("userId");
    const month = c.req.query("month");
    const year = c.req.query("year");
    const m = c.req.query("m");
    let ymPrefix;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      ymPrefix = month;
    } else if (year && m) {
      ymPrefix = `${year}-${String(m).padStart(2, "0")}`;
    } else {
      ymPrefix = today().slice(0, 7);
    }
    const start = `${ymPrefix}-01`;
    const end = `${ymPrefix}-31`;
    const [calRes, sessRes, dailyRes] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, date, type, ref_id, title, created_at
         FROM calendar_events
         WHERE user_id = ? AND date BETWEEN ? AND ?
         ORDER BY date ASC`
      ).bind(userId, start, end).all(),
      c.env.DB.prepare(
        `SELECT id, date(created_at) as date, question, status, 'inference' as type
         FROM inference_sessions
         WHERE user_id = ? AND date(created_at) BETWEEN ? AND ?
         ORDER BY created_at ASC`
      ).bind(userId, start, end).all(),
      c.env.DB.prepare(
        `SELECT id, date, gua, verse, message, 'daily' as type
         FROM daily_divinations
         WHERE user_id = ? AND date BETWEEN ? AND ?
         ORDER BY date ASC`
      ).bind(userId, start, end).all()
    ]);
    const byDate = {};
    const push = /* @__PURE__ */ __name((date, item) => {
      if (!byDate[date])
        byDate[date] = [];
      byDate[date].push(item);
    }, "push");
    for (const r of calRes.results)
      push(r.date, r);
    for (const r of sessRes.results)
      push(r.date, r);
    for (const r of dailyRes.results)
      push(r.date, r);
    return c.json({ month: ymPrefix, items: byDate });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
var daily_default = app8;

// node_modules/hono/dist/utils/stream.js
var StreamingApi = /* @__PURE__ */ __name(class {
  writer;
  encoder;
  writable;
  abortSubscribers = [];
  responseReadable;
  /**
   * Whether the stream has been aborted.
   */
  aborted = false;
  /**
   * Whether the stream has been closed normally.
   */
  closed = false;
  constructor(writable, _readable) {
    this.writable = writable;
    this.writer = writable.getWriter();
    this.encoder = new TextEncoder();
    const reader = _readable.getReader();
    this.abortSubscribers.push(async () => {
      await reader.cancel();
    });
    this.responseReadable = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        done ? controller.close() : controller.enqueue(value);
      },
      cancel: () => {
        if (!this.closed) {
          this.abort();
        }
      }
    });
  }
  async write(input) {
    try {
      if (typeof input === "string") {
        input = this.encoder.encode(input);
      }
      await this.writer.write(input);
    } catch {
    }
    return this;
  }
  async writeln(input) {
    await this.write(input + "\n");
    return this;
  }
  sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }
  async close() {
    this.closed = true;
    try {
      await this.writer.close();
    } catch {
    }
  }
  async pipe(body) {
    this.writer.releaseLock();
    await body.pipeTo(this.writable, { preventClose: true });
    this.writer = this.writable.getWriter();
  }
  onAbort(listener) {
    this.abortSubscribers.push(listener);
  }
  /**
   * Abort the stream.
   * You can call this method when stream is aborted by external event.
   */
  abort() {
    if (!this.aborted) {
      this.aborted = true;
      this.abortSubscribers.forEach((subscriber) => subscriber());
    }
  }
}, "StreamingApi");

// node_modules/hono/dist/helper/streaming/utils.js
var isOldBunVersion = /* @__PURE__ */ __name(() => {
  const version2 = typeof Bun !== "undefined" ? Bun.version : void 0;
  if (version2 === void 0) {
    return false;
  }
  const result = version2.startsWith("1.1") || version2.startsWith("1.0") || version2.startsWith("0.");
  isOldBunVersion = /* @__PURE__ */ __name(() => result, "isOldBunVersion");
  return result;
}, "isOldBunVersion");

// node_modules/hono/dist/helper/streaming/sse.js
var SSEStreamingApi = /* @__PURE__ */ __name(class extends StreamingApi {
  constructor(writable, readable) {
    super(writable, readable);
  }
  async writeSSE(message) {
    const data = await resolveCallback(message.data, HtmlEscapedCallbackPhase.Stringify, false, {});
    const dataLines = data.split(/\r\n|\r|\n/).map((line) => {
      return `data: ${line}`;
    }).join("\n");
    for (const key of ["event", "id", "retry"]) {
      if (message[key] && /[\r\n]/.test(message[key])) {
        throw new Error(`${key} must not contain "\\r" or "\\n"`);
      }
    }
    const sseData = [
      message.event && `event: ${message.event}`,
      dataLines,
      message.id && `id: ${message.id}`,
      message.retry && `retry: ${message.retry}`
    ].filter(Boolean).join("\n") + "\n\n";
    await this.write(sseData);
  }
}, "SSEStreamingApi");
var run = /* @__PURE__ */ __name(async (stream2, cb, onError) => {
  try {
    await cb(stream2);
  } catch (e) {
    if (e instanceof Error && onError) {
      await onError(e, stream2);
      await stream2.writeSSE({
        event: "error",
        data: e.message
      });
    } else {
      console.error(e);
    }
  } finally {
    stream2.close();
  }
}, "run");
var contextStash = /* @__PURE__ */ new WeakMap();
var streamSSE = /* @__PURE__ */ __name((c, cb, onError) => {
  const { readable, writable } = new TransformStream();
  const stream2 = new SSEStreamingApi(writable, readable);
  if (isOldBunVersion()) {
    c.req.raw.signal.addEventListener("abort", () => {
      if (!stream2.closed) {
        stream2.abort();
      }
    });
  }
  contextStash.set(stream2.responseReadable, c);
  c.header("Transfer-Encoding", "chunked");
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  run(stream2, cb, onError);
  return c.newResponse(stream2.responseReadable);
}, "streamSSE");

// src/routes/yan.js
var app9 = new Hono2();
app9.use("*", authMiddleware);
var YAN_SYSTEM_PROMPT = `\u4F60\u662F\u300C\u6F14\u300D\uFF0C\u6F14\u7B56\xB7\u516B\u5366\u63A8\u6F14\u5F15\u64CE\u7684\u5927\u7BA1\u5BB6\u4E0E\u5BF9\u8BDD\u8005\u3002
\u4F60\u7684\u804C\u8D23\uFF1A
1. \u4E0D\u66FF\u7528\u6237\u505A\u51B3\u5B9A\uFF0C\u800C\u662F\u901A\u8FC7\u63D0\u95EE\u8BA9\u7528\u6237\u770B\u6E05\u81EA\u5DF1\u7684\u5904\u5883\u4E0E\u9009\u62E9\u3002
2. \u7528\u5468\u6613\u3001\u5366\u8C61\u7684\u9690\u55BB\u4F5C\u4E3A\u601D\u8003\u5DE5\u5177\uFF0C\u800C\u975E\u5BBF\u547D\u8BBA\u3002
3. \u56DE\u7B54\u7B80\u77ED\u514B\u5236\uFF0C\u6BCF\u6B21\u4E0D\u8D85\u8FC7 200 \u5B57\uFF0C\u7559\u767D\u8BA9\u7528\u6237\u601D\u8003\u3002
4. \u82E5\u7528\u6237\u7684\u95EE\u9898\u6A21\u7CCA\uFF0C\u5148\u53CD\u95EE\u4E00\u4E2A\u95EE\u9898\u518D\u7ED9\u65B9\u5411\u3002
5. \u5076\u5C14\uFF08\u4E0D\u5F3A\u6C42\uFF09\u53EF\u5F15\u7528\u5366\u8F9E\u3001\u723B\u8F9E\u4F5C\u4E3A\u9690\u55BB\u3002`;
app9.post("/chat", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const { message, conversationId } = body;
    if (!message || typeof message !== "string")
      throw errors.badRequest("message \u5FC5\u586B");
    if (message.length > 4e3)
      throw errors.badRequest("message \u957F\u5EA6\u9700\u5728 4000 \u5B57\u4EE5\u5185");
    let convId = conversationId;
    let isNewConv = false;
    if (!convId) {
      convId = uuid();
      const title2 = message.slice(0, 30);
      await c.env.DB.prepare(
        `INSERT INTO conversations (id, user_id, title, last_message_at)
         VALUES (?, ?, ?, ?)`
      ).bind(convId, userId, title2, now()).run();
      isNewConv = true;
    } else {
      const conv = await c.env.DB.prepare(
        "SELECT id FROM conversations WHERE id = ? AND user_id = ?"
      ).bind(convId, userId).first();
      if (!conv)
        throw errors.notFound("\u4F1A\u8BDD\u4E0D\u5B58\u5728");
    }
    const userMsgId = uuid();
    await c.env.DB.prepare(
      `INSERT INTO conversation_messages
       (id, conversation_id, user_id, role, content)
       VALUES (?, ?, ?, 'user', ?)`
    ).bind(userMsgId, convId, userId, message).run();
    const history = await c.env.DB.prepare(
      `SELECT role, content FROM conversation_messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT 10`
    ).bind(convId).all();
    const messages = [
      { role: "system", content: YAN_SYSTEM_PROMPT },
      ...history.results.reverse().map((m) => ({
        role: m.role,
        content: m.content
      }))
    ];
    let reply = null;
    if (isLlmAvailable(c.env)) {
      reply = await chatCompletion(c.env, messages, {
        temperature: 0.85,
        maxTokens: 800
      });
    }
    if (!reply) {
      reply = degradeReply(message);
    }
    const assistantMsgId = uuid();
    await c.env.DB.prepare(
      `INSERT INTO conversation_messages
       (id, conversation_id, user_id, role, content)
       VALUES (?, ?, ?, 'assistant', ?)`
    ).bind(assistantMsgId, convId, userId, reply).run();
    await c.env.DB.prepare(
      "UPDATE conversations SET last_message_at = ? WHERE id = ?"
    ).bind(now(), convId).run();
    await c.env.DB.prepare(
      "UPDATE users SET total_chats = total_chats + 1 WHERE id = ?"
    ).bind(userId).run();
    return streamSSE(c, async (stream2) => {
      await stream2.writeSSE({
        data: JSON.stringify({
          type: "meta",
          conversationId: convId,
          messageId: assistantMsgId,
          isNewConversation: isNewConv
        })
      });
      const CHUNK = 8;
      for (let i = 0; i < reply.length; i += CHUNK) {
        const chunk = reply.slice(i, i + CHUNK);
        await stream2.writeSSE({
          data: JSON.stringify({ type: "content", content: chunk })
        });
        await stream2.sleep(20);
      }
      await stream2.writeSSE({ data: JSON.stringify({ type: "done" }) });
    });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
function degradeReply(message) {
  const m = message.trim();
  if (/你好|您好|hi|hello/i.test(m)) {
    return "\u6211\u5728\u3002\u4ECA\u65E5\u6709\u4F55\u4E8B\u6270\u5FC3\uFF1F\u6162\u6162\u8BF4\uFF0C\u4E0D\u5FC5\u6025\u3002";
  }
  if (/[？?]$/.test(m)) {
    return `\u95EE\u5F97\u4E0D\u9519\u3002\u4F46\u5728\u56DE\u7B54\u4E4B\u524D\uFF0C\u5148\u53CD\u95EE\u4E00\u53E5\uFF1A\u4F60\u4E3A\u4F55\u5728\u6B64\u523B\u95EE\u8FD9\u4E2A\u95EE\u9898\uFF1F\u662F\u5DF2\u6709\u503E\u5411\uFF0C\u53EA\u662F\u60F3\u6C42\u4E00\u4E2A\u786E\u8BA4\uFF1F\u8FD8\u662F\u771F\u7684\u4E3E\u68CB\u4E0D\u5B9A\uFF1F
\u8FD9\u4E24\u79CD\u5FC3\u6001\uFF0C\u5BF9\u5E94\u7684\u662F\u4E24\u6761\u4E0D\u540C\u7684\u8DEF\u5F84\u3002`;
  }
  if (m.length < 10) {
    return "\u8BF4\u5F97\u592A\u7B80\u4E86\u3002\u80FD\u5426\u8865\u4E00\u53E5\u80CC\u666F\u2014\u2014\u8FD9\u4EF6\u4E8B\u7275\u6D89\u5230\u7684\u662F\u4E8B\u4E1A\u3001\u4EBA\u9645\uFF0C\u8FD8\u662F\u5185\u5FC3\u7684\u67D0\u4E2A\u6289\u62E9\uFF1F";
  }
  return `\u6211\u542C\u5230\u4E86\u4F60\u8BF4\u7684\uFF0C\u4F46\u542C\u5230\u7684\u53EA\u662F\u8868\u5C42\u3002
\u8BF7\u5141\u8BB8\u6211\u95EE\u4E09\u70B9\uFF1A
\u4E00\u3001\u8FD9\u4EF6\u4E8B\u6700\u574F\u7684\u7ED3\u679C\uFF0C\u4F60\u80FD\u5426\u627F\u53D7\uFF1F
\u4E8C\u3001\u4E09\u5E74\u540E\u56DE\u770B\u4ECA\u5929\uFF0C\u4F60\u5E0C\u671B\u81EA\u5DF1\u5DF2\u7ECF\u505A\u4E86\u4EC0\u4E48\uFF1F
\u4E09\u3001\u4F60\u6B64\u523B\u6700\u6015\u7684\u4E0D\u662F\u5931\u8D25\uFF0C\u800C\u662F\u4EC0\u4E48\uFF1F
\u56DE\u7B54\u4E4B\u524D\u4E0D\u5FC5\u6025\uFF0C\u5148\u9759\u5750\u7247\u523B\u3002`;
}
__name(degradeReply, "degradeReply");
app9.get("/messages", async (c) => {
  try {
    const userId = c.get("userId");
    const conversationId = c.req.query("conversationId");
    if (!conversationId)
      throw errors.badRequest("conversationId \u5FC5\u586B");
    const conv = await c.env.DB.prepare(
      "SELECT id FROM conversations WHERE id = ? AND user_id = ?"
    ).bind(conversationId, userId).first();
    if (!conv)
      throw errors.notFound("\u4F1A\u8BDD\u4E0D\u5B58\u5728");
    const list = await c.env.DB.prepare(
      `SELECT id, role, content, meta, created_at
       FROM conversation_messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT 200`
    ).bind(conversationId).all();
    return c.json({ conversationId, items: list.results });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app9.get("/conversations", async (c) => {
  try {
    const userId = c.get("userId");
    const { page, pageSize, offset } = parsePagination(c);
    const countRow = await c.env.DB.prepare(
      "SELECT COUNT(*) as total FROM conversations WHERE user_id = ?"
    ).bind(userId).first();
    const list = await c.env.DB.prepare(
      `SELECT id, title, last_message_at, created_at
       FROM conversations
       WHERE user_id = ?
       ORDER BY last_message_at DESC
       LIMIT ? OFFSET ?`
    ).bind(userId, pageSize, offset).all();
    return c.json({
      items: list.results,
      total: countRow?.total || 0,
      page,
      pageSize
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
app9.post("/memories", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const { category, title: title2, content, source, confidence } = body;
    if (!category || !content)
      throw errors.badRequest("category \u4E0E content \u5FC5\u586B");
    const validCats = ["deduction", "preference", "fact", "profile"];
    if (!validCats.includes(category))
      throw errors.badRequest(`category \u5FC5\u987B\u4E3A: ${validCats.join(", ")}`);
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO user_memories
       (id, user_id, category, title, content, source, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      userId,
      category,
      title2 || null,
      content,
      source || null,
      typeof confidence === "number" ? confidence : 0.8
    ).run();
    return c.json({ id, message: "\u8BB0\u5FC6\u5DF2\u6DFB\u52A0" }, 201);
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app9.get("/memories", async (c) => {
  try {
    const userId = c.get("userId");
    const { page, pageSize, offset } = parsePagination(c);
    const query = c.req.query("query");
    const category = c.req.query("category");
    let sql = "SELECT * FROM user_memories WHERE user_id = ?";
    const params = [userId];
    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }
    if (query) {
      sql += " AND (title LIKE ? OR content LIKE ?)";
      params.push(`%${query}%`, `%${query}%`);
    }
    const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
    const countRow = await c.env.DB.prepare(countSql).bind(...params).first();
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const list = await c.env.DB.prepare(sql).bind(...params, pageSize, offset).all();
    return c.json({
      items: list.results,
      total: countRow?.total || 0,
      page,
      pageSize
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
app9.delete("/memories/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const mem = await c.env.DB.prepare(
      "SELECT user_id FROM user_memories WHERE id = ?"
    ).bind(id).first();
    if (!mem)
      throw errors.notFound("\u8BB0\u5FC6\u4E0D\u5B58\u5728");
    if (mem.user_id !== userId)
      throw errors.forbidden("\u53EA\u80FD\u5220\u9664\u81EA\u5DF1\u7684\u8BB0\u5FC6");
    await c.env.DB.prepare("DELETE FROM user_memories WHERE id = ?").bind(id).run();
    return c.json({ success: true });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app9.get("/daily", async (c) => {
  try {
    const userId = c.get("userId");
    const date = today();
    const existing = await c.env.DB.prepare(
      "SELECT * FROM daily_divinations WHERE user_id = ? AND date = ?"
    ).bind(userId, date).first();
    if (existing) {
      return c.json({
        ...existing,
        yan_comment: `\u6B64\u5366\u300C${existing.gua}\u300D\uFF0C\u6F14\u4EE5\u4E3A\uFF1A${existing.message}`
      });
    }
    const data = new TextEncoder().encode(`yan:${userId}:${date}`);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(hash);
    let n = 0;
    for (let i = 0; i < 8; i++)
      n = (n * 256 + bytes[i]) % 1000003;
    const guas = ["\u4E7E", "\u5764", "\u5C6F", "\u8499", "\u9700", "\u8BBC", "\u5E08", "\u6BD4", "\u6CF0", "\u5426"];
    const g = guas[n % guas.length];
    return c.json({
      date,
      gua: g,
      yan_comment: `\u6F14\u4ECA\u65E5\u89C2\u4F60\u4E4B\u6C14\uFF0C\u6070\u5408\u300C${g}\u300D\u5366\u3002\u4E0D\u5FC5\u95EE\u5409\u51F6\uFF0C\u5148\u95EE\u81EA\u5DF1\u662F\u5426\u5DF2\u51C6\u5907\u597D\u627F\u63A5\u3002`
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
var yan_default = app9;

// src/routes/level.js
var app10 = new Hono2();
app10.use("*", authMiddleware);
function xpToReachLevel(n) {
  if (n <= 1)
    return 0;
  return Math.round(100 * (Math.pow(1.5, n - 1) - 1));
}
__name(xpToReachLevel, "xpToReachLevel");
function levelFromXp(xp) {
  let level = 1;
  while (xpToReachLevel(level + 1) <= xp)
    level++;
  return level;
}
__name(levelFromXp, "levelFromXp");
function realmFromLevel(level) {
  if (level >= 13)
    return "\u4E58\u5316";
  if (level >= 10)
    return "\u795E\u4F1A";
  if (level >= 7)
    return "\u901A\u7384";
  if (level >= 4)
    return "\u6E10\u609F";
  return "\u521D\u5883";
}
__name(realmFromLevel, "realmFromLevel");
var REALMS = [
  { name: "\u521D\u5883", minLevel: 1, maxLevel: 3 },
  { name: "\u6E10\u609F", minLevel: 4, maxLevel: 6 },
  { name: "\u901A\u7384", minLevel: 7, maxLevel: 9 },
  { name: "\u795E\u4F1A", minLevel: 10, maxLevel: 12 },
  { name: "\u4E58\u5316", minLevel: 13, maxLevel: 99 }
];
async function applyXp(c, userId, amount, reason) {
  const user = await c.env.DB.prepare(
    "SELECT xp, level, streak_days FROM users WHERE id = ?"
  ).bind(userId).first();
  if (!user)
    throw errors.notFound("\u7528\u6237\u4E0D\u5B58\u5728");
  const oldLevel = user.level;
  const newXp = Math.max(0, user.xp + amount);
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > oldLevel;
  const newRealm = realmFromLevel(newLevel);
  await c.env.DB.prepare(
    "UPDATE users SET xp = ?, level = ?, realm = ?, updated_at = ? WHERE id = ?"
  ).bind(newXp, newLevel, newRealm, now(), userId).run();
  return {
    newXP: newXp,
    newLevel,
    leveledUp,
    newRealm: leveledUp ? newRealm : realmFromLevel(oldLevel),
    xpGained: amount,
    reason
  };
}
__name(applyXp, "applyXp");
app10.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const user = await c.env.DB.prepare(
      "SELECT level, realm, xp, streak_days, last_login_date FROM users WHERE id = ?"
    ).bind(userId).first();
    if (!user)
      throw errors.notFound("\u7528\u6237\u4E0D\u5B58\u5728");
    const date = today();
    const alreadyCheckedIn = user.last_login_date === date;
    const currentLevelXp = xpToReachLevel(user.level);
    const nextLevelXp = xpToReachLevel(user.level + 1);
    const xpToNext = Math.max(0, nextLevelXp - user.xp);
    return c.json({
      level: user.level,
      realm: user.realm || realmFromLevel(user.level),
      xp: user.xp,
      xpToNext,
      currentLevelXp,
      nextLevelXp,
      streak: user.streak_days || 0,
      alreadyCheckedIn,
      realms: REALMS
    });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app10.post("/checkin", async (c) => {
  try {
    const userId = c.get("userId");
    const date = today();
    const user = await c.env.DB.prepare(
      "SELECT last_login_date, streak_days, xp, level FROM users WHERE id = ?"
    ).bind(userId).first();
    if (!user)
      throw errors.notFound("\u7528\u6237\u4E0D\u5B58\u5728");
    if (user.last_login_date === date) {
      throw errors.conflict("\u4ECA\u65E5\u5DF2\u7B7E\u5230");
    }
    let newStreak = 1;
    if (user.last_login_date) {
      const last = new Date(user.last_login_date);
      const todayDate = new Date(date);
      const diffDays = Math.round((todayDate - last) / 864e5);
      if (diffDays === 1) {
        newStreak = (user.streak_days || 0) + 1;
      } else if (diffDays === 0) {
        newStreak = user.streak_days || 1;
      } else {
        newStreak = 1;
      }
    }
    const baseXp = 10;
    const streakBonus = Math.min(newStreak - 1, 20);
    const xpGained = baseXp + streakBonus;
    const oldLevel = user.level;
    const newXp = user.xp + xpGained;
    const newLevel = levelFromXp(newXp);
    const leveledUp = newLevel > oldLevel;
    const newRealm = realmFromLevel(newLevel);
    await c.env.DB.prepare(
      `UPDATE users
       SET last_login_date = ?, streak_days = ?, xp = ?, level = ?, realm = ?, updated_at = ?
       WHERE id = ?`
    ).bind(date, newStreak, newXp, newLevel, newRealm, now(), userId).run();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM calendar_events WHERE user_id = ? AND date = ? AND type = 'checkin'`
      ).bind(userId, date),
      c.env.DB.prepare(
        `INSERT INTO calendar_events (id, user_id, date, type, title)
         VALUES (?, ?, ?, 'checkin', ?)`
      ).bind(uuid(), userId, date, `\u7B7E\u5230 \xB7 \u7B2C ${newStreak} \u5929`)
    ]);
    await audit(c, "checkin", "user", userId, { date, streak: newStreak, xpGained });
    return c.json({
      success: true,
      date,
      streak: newStreak,
      xpGained,
      leveledUp,
      newRealm: leveledUp ? newRealm : null,
      newLevel,
      newXP: newXp
    });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app10.post("/xp", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const { amount, reason } = body;
    if (!Number.isInteger(amount) || amount === 0)
      throw errors.badRequest("amount \u5FC5\u987B\u4E3A\u975E\u96F6\u6574\u6570");
    if (Math.abs(amount) > 1e3)
      throw errors.badRequest("\u5355\u6B21 XP \u53D8\u52A8\u4E0D\u53EF\u8D85\u8FC7 1000");
    const result = await applyXp(c, userId, amount, reason || "manual");
    await audit(c, "xp_gain", "user", userId, { amount, reason });
    return c.json({ success: true, ...result });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
var level_default = app10;

// src/routes/followup.js
var app11 = new Hono2();
app11.use("*", authMiddleware);
app11.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const { page, pageSize, offset } = parsePagination(c);
    const status = c.req.query("status");
    let sql = "SELECT * FROM decision_follow_ups WHERE user_id = ?";
    const params = [userId];
    if (status && status !== "all") {
      sql += " AND status = ?";
      params.push(status);
    }
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM (${sql})`
    ).bind(...params).first();
    sql += " ORDER BY follow_up_date DESC LIMIT ? OFFSET ?";
    const list = await c.env.DB.prepare(sql).bind(...params, pageSize, offset).all();
    return c.json({
      items: list.results,
      total: countRow?.total || 0,
      page,
      pageSize
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
app11.post("/", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const { cardId, question, decision, daysLater } = body;
    if (!question || !decision)
      throw errors.badRequest("question \u4E0E decision \u5FC5\u586B");
    if (!Number.isInteger(daysLater) || daysLater < 0 || daysLater > 365)
      throw errors.badRequest("daysLater \u5FC5\u987B\u4E3A 0-365 \u7684\u6574\u6570");
    const followUpDate = addDays(today(), daysLater);
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO decision_follow_ups
       (id, user_id, card_id, question, decision, follow_up_date, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`
    ).bind(id, userId, cardId || null, question, decision, followUpDate).run();
    await c.env.DB.prepare(
      `INSERT INTO calendar_events (id, user_id, date, type, ref_id, title)
       VALUES (?, ?, ?, 'followup', ?, ?)`
    ).bind(uuid(), userId, followUpDate, id, `\u51B3\u7B56\u56DE\u8BBF \xB7 ${question.slice(0, 20)}`).run().catch(() => {
    });
    await audit(c, "followup_create", "decision_follow_up", id);
    return c.json(
      { id, followUpDate, message: "\u56DE\u8BBF\u5DF2\u521B\u5EFA" },
      201
    );
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app11.get("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const item = await c.env.DB.prepare(
      "SELECT * FROM decision_follow_ups WHERE id = ? AND user_id = ?"
    ).bind(id, userId).first();
    if (!item)
      throw errors.notFound("\u56DE\u8BBF\u4E0D\u5B58\u5728");
    return c.json(item);
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app11.put("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { result, actualOutcome, rating } = body;
    if (!result)
      throw errors.badRequest("result \u5FC5\u586B");
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5))
      throw errors.badRequest("rating \u5FC5\u987B\u4E3A 1-5 \u7684\u6574\u6570");
    const existing = await c.env.DB.prepare(
      "SELECT user_id, status FROM decision_follow_ups WHERE id = ?"
    ).bind(id).first();
    if (!existing)
      throw errors.notFound("\u56DE\u8BBF\u4E0D\u5B58\u5728");
    if (existing.user_id !== userId)
      throw errors.forbidden("\u53EA\u80FD\u4FEE\u6539\u81EA\u5DF1\u7684\u56DE\u8BBF");
    if (existing.status === "done")
      throw errors.conflict("\u56DE\u8BBF\u5DF2\u5B8C\u6210\uFF0C\u4E0D\u53EF\u91CD\u590D");
    await c.env.DB.prepare(
      `UPDATE decision_follow_ups
       SET status = 'done', result_note = ?, actual_outcome = ?, rating = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      result,
      actualOutcome || null,
      rating || null,
      now(),
      id
    ).run();
    await audit(c, "followup_complete", "decision_follow_up", id, { rating });
    try {
      await c.env.DB.prepare(
        "UPDATE users SET xp = xp + 25, updated_at = ? WHERE id = ?"
      ).bind(now(), userId).run();
    } catch {
    }
    return c.json({
      success: true,
      xpGained: 25,
      message: "\u56DE\u8BBF\u5DF2\u5B8C\u6210\uFF0C+25 XP"
    });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app11.delete("/:id", async (c) => {
  try {
    const userId = c.get("userId");
    const id = c.req.param("id");
    const existing = await c.env.DB.prepare(
      "SELECT user_id FROM decision_follow_ups WHERE id = ?"
    ).bind(id).first();
    if (!existing)
      throw errors.notFound("\u56DE\u8BBF\u4E0D\u5B58\u5728");
    if (existing.user_id !== userId)
      throw errors.forbidden("\u53EA\u80FD\u5220\u9664\u81EA\u5DF1\u7684\u56DE\u8BBF");
    await c.env.DB.batch([
      c.env.DB.prepare(
        "DELETE FROM calendar_events WHERE ref_id = ? AND type = ?"
      ).bind(id, "followup"),
      c.env.DB.prepare("DELETE FROM decision_follow_ups WHERE id = ?").bind(id)
    ]);
    return c.json({ success: true });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app11.get("/due", async (c) => {
  try {
    const userId = c.get("userId");
    const date = today();
    const list = await c.env.DB.prepare(
      `SELECT * FROM decision_follow_ups
       WHERE user_id = ? AND status = 'pending' AND follow_up_date <= ?
       ORDER BY follow_up_date ASC
       LIMIT 100`
    ).bind(userId, date).all();
    return c.json({ items: list.results, total: list.results.length, today: date });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
function addDays(dateStr, days) {
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
__name(addDays, "addDays");
var followup_default = app11;

// src/routes/achievements.js
var app12 = new Hono2();
app12.use("*", authMiddleware);
var ACHIEVEMENT_TEMPLATES = [
  {
    id: "first_cast",
    name: "\u521D\u7ACB\u4E00\u5366",
    description: "\u5B8C\u6210\u7B2C\u4E00\u6B21\u63A8\u6F14",
    xp: 20,
    icon: "\u{1F702}"
  },
  {
    id: "cast_10",
    name: "\u5341\u5366\u751F\u719F",
    description: "\u7D2F\u8BA1\u63A8\u6F14 10 \u6B21",
    xp: 50,
    icon: "\u{1F703}"
  },
  {
    id: "cast_50",
    name: "\u767E\u5366\u4E86\u7136",
    description: "\u7D2F\u8BA1\u63A8\u6F14 50 \u6B21",
    xp: 100,
    icon: "\u{1F704}"
  },
  {
    id: "custom_agent",
    name: "\u81EA\u4F5C\u667A\u56CA",
    description: "\u521B\u5EFA\u7B2C\u4E00\u4E2A\u81EA\u5B9A\u4E49\u667A\u56CA",
    xp: 30,
    icon: "\u{1F714}"
  },
  {
    id: "market_sub",
    name: "\u5E7F\u7ED3\u5584\u7F18",
    description: "\u8BA2\u9605\u4E00\u4E2A\u5E02\u96C6\u667A\u56CA",
    xp: 15,
    icon: "\u{1F710}"
  },
  {
    id: "review",
    name: "\u56DE\u671B\u521D\u5FC3",
    description: "\u5B8C\u6210\u4E00\u6B21\u51B3\u7B56\u56DE\u8BBF",
    xp: 25,
    icon: "\u{1F716}"
  },
  {
    id: "streak_3",
    name: "\u4E09\u65E5\u4E0D\u8F8D",
    description: "\u8FDE\u7EED 3 \u5929\u63A8\u6F14",
    xp: 40,
    icon: "\u{1F713}"
  },
  {
    id: "all_agents",
    name: "\u667A\u56CA\u6EE1\u5802",
    description: "\u96C6\u9F50 8 \u4F4D\u667A\u56CA\u767B\u573A",
    xp: 80,
    icon: "\u{1F707}"
  }
];
var TEMPLATE_MAP = new Map(ACHIEVEMENT_TEMPLATES.map((t) => [t.id, t]));
app12.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const list = await c.env.DB.prepare(
      "SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC"
    ).bind(userId).all();
    const items = list.results.map((r) => {
      const tpl = TEMPLATE_MAP.get(r.achievement_id);
      return {
        id: r.achievement_id,
        name: tpl?.name || r.achievement_id,
        description: tpl?.description || "",
        xp: tpl?.xp || 0,
        icon: tpl?.icon || "",
        unlocked_at: r.unlocked_at
      };
    });
    return c.json({
      items,
      total: items.length,
      totalXp: items.reduce((s, a) => s + (a.xp || 0), 0)
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
app12.get("/all", async (c) => {
  try {
    const userId = c.get("userId");
    const unlocked = await c.env.DB.prepare(
      "SELECT achievement_id FROM achievements WHERE user_id = ?"
    ).bind(userId).all();
    const unlockedSet = new Set(unlocked.results.map((r) => r.achievement_id));
    const items = ACHIEVEMENT_TEMPLATES.map((t) => ({
      ...t,
      unlocked: unlockedSet.has(t.id)
    }));
    return c.json({
      items,
      total: items.length,
      unlockedCount: items.filter((i) => i.unlocked).length
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
app12.post("/unlock", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const { achievementId } = body;
    if (!achievementId)
      throw errors.badRequest("achievementId \u5FC5\u586B");
    const tpl = TEMPLATE_MAP.get(achievementId);
    if (!tpl)
      throw errors.badRequest("\u672A\u77E5\u6210\u5C31 ID");
    const existing = await c.env.DB.prepare(
      "SELECT id FROM achievements WHERE user_id = ? AND achievement_id = ?"
    ).bind(userId, achievementId).first();
    if (existing)
      throw errors.conflict("\u8BE5\u6210\u5C31\u5DF2\u89E3\u9501");
    const id = uuid();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO achievements (id, user_id, achievement_id)
         VALUES (?, ?, ?)`
      ).bind(id, userId, achievementId),
      c.env.DB.prepare(
        "UPDATE users SET xp = xp + ?, updated_at = ? WHERE id = ?"
      ).bind(tpl.xp, now(), userId)
    ]);
    const user = await c.env.DB.prepare("SELECT xp, level FROM users WHERE id = ?").bind(userId).first();
    const newLevel = levelFromXp(user.xp);
    const newRealm = realmFromLevel(newLevel);
    const leveledUp = newLevel > user.level;
    if (leveledUp) {
      await c.env.DB.prepare(
        "UPDATE users SET level = ?, realm = ? WHERE id = ?"
      ).bind(newLevel, newRealm, userId).run();
    }
    await audit(c, "achievement_unlock", "achievement", achievementId, { xp: tpl.xp });
    return c.json({
      success: true,
      achievement: tpl,
      xpGained: tpl.xp,
      leveledUp,
      newLevel,
      newRealm,
      newXP: user.xp
    });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
var achievements_default = app12;

// src/routes/market.js
var app13 = new Hono2();
app13.use("*", optionalAuth);
app13.get("/agents", async (c) => {
  try {
    const { page, pageSize, offset } = parsePagination(c);
    const tag = c.req.query("tag");
    const trigram = c.req.query("trigram");
    let where = "WHERE 1=1";
    const params = [];
    if (tag) {
      where += " AND tags LIKE ?";
      params.push(`%"${tag}"%`);
    }
    if (trigram) {
      where += " AND trigram = ?";
      params.push(trigram);
    }
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM agent_market ${where}`
    ).bind(...params).first();
    const list = await c.env.DB.prepare(
      `SELECT id, author_id, author_name, name, persona, perspective, style,
              element, trigram, color, subscriber_count,
              rating_sum, rating_count, tags, created_at
       FROM agent_market
       ${where}
       ORDER BY subscriber_count DESC, created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(...params, pageSize, offset).all();
    const items = list.results.map((r) => ({
      ...r,
      tags: safeParse(r.tags, []),
      rating_avg: r.rating_count > 0 ? r.rating_sum / r.rating_count : 0
    }));
    return c.json({
      items,
      total: countRow?.total || 0,
      page,
      pageSize
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
app13.get("/agents/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const agent = await c.env.DB.prepare(
      `SELECT id, author_id, author_name, name, persona, perspective, style,
              element, trigram, color, subscriber_count,
              rating_sum, rating_count, tags, created_at
       FROM agent_market WHERE id = ?`
    ).bind(id).first();
    if (!agent)
      throw errors.notFound("\u667A\u56CA\u4E0D\u5B58\u5728");
    let subscribed = false;
    const userId = c.get("userId");
    if (userId) {
      const row = await c.env.DB.prepare(
        "SELECT 1 FROM market_subscriptions WHERE user_id = ? AND market_agent_id = ?"
      ).bind(userId, id).first();
      subscribed = !!row;
    }
    return c.json({
      ...agent,
      tags: safeParse(agent.tags, []),
      rating_avg: agent.rating_count > 0 ? agent.rating_sum / agent.rating_count : 0,
      subscribed
    });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app13.post("/agents", authMiddleware, async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const { name, persona, perspective, style, element, trigram, color, tags } = body;
    if (!name || !persona || !perspective)
      throw errors.badRequest("name / persona / perspective \u5FC5\u586B");
    if (name.length > 50)
      throw errors.badRequest("name \u957F\u5EA6\u9700\u5728 50 \u5B57\u4EE5\u5185");
    const user = await c.env.DB.prepare(
      "SELECT nickname FROM users WHERE id = ?"
    ).bind(userId).first();
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO agent_market
       (id, author_id, author_name, name, persona, perspective, style,
        element, trigram, color, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      userId,
      user?.nickname || null,
      name,
      persona,
      perspective,
      style || "\u5468\u6613\u53E4\u98CE",
      element || null,
      trigram || null,
      color || null,
      JSON.stringify(Array.isArray(tags) ? tags : [])
    ).run();
    await audit(c, "market_publish", "agent_market", id);
    return c.json({ id, message: "\u667A\u56CA\u5DF2\u53D1\u5E03\u5230\u5E02\u96C6" }, 201);
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app13.post("/agents/:id/subscribe", authMiddleware, async (c) => {
  try {
    const userId = c.get("userId");
    const marketId = c.req.param("id");
    const agent = await c.env.DB.prepare(
      "SELECT * FROM agent_market WHERE id = ?"
    ).bind(marketId).first();
    if (!agent)
      throw errors.notFound("\u667A\u56CA\u4E0D\u5B58\u5728");
    const existing = await c.env.DB.prepare(
      "SELECT id FROM market_subscriptions WHERE user_id = ? AND market_agent_id = ?"
    ).bind(userId, marketId).first();
    if (existing)
      throw errors.conflict("\u5DF2\u8BA2\u9605\u8BE5\u667A\u56CA");
    const subId = uuid();
    const advisorId = uuid();
    const ts = now();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO market_subscriptions (id, user_id, market_agent_id) VALUES (?, ?, ?)`
      ).bind(subId, userId, marketId),
      c.env.DB.prepare(
        `INSERT INTO custom_advisors
         (id, user_id, name, persona, perspective, style, element, trigram, color, origin_market_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        advisorId,
        userId,
        agent.name,
        agent.persona,
        agent.perspective,
        agent.style || "\u5468\u6613\u53E4\u98CE",
        agent.element || null,
        agent.trigram || null,
        agent.color || null,
        marketId
      ),
      c.env.DB.prepare(
        `UPDATE agent_market SET subscriber_count = subscriber_count + 1 WHERE id = ?`
      ).bind(marketId)
    ]);
    await audit(c, "market_subscribe", "agent_market", marketId);
    return c.json({
      success: true,
      advisorId,
      subscriptionId: subId,
      message: "\u8BA2\u9605\u6210\u529F\uFF0C\u5DF2\u6DFB\u52A0\u5230\u667A\u56CA\u5E93"
    });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app13.delete("/agents/:id/subscribe", authMiddleware, async (c) => {
  try {
    const userId = c.get("userId");
    const marketId = c.req.param("id");
    const existing = await c.env.DB.prepare(
      "SELECT id FROM market_subscriptions WHERE user_id = ? AND market_agent_id = ?"
    ).bind(userId, marketId).first();
    if (!existing)
      throw errors.notFound("\u672A\u8BA2\u9605\u8BE5\u667A\u56CA");
    await c.env.DB.batch([
      c.env.DB.prepare(
        "DELETE FROM market_subscriptions WHERE user_id = ? AND market_agent_id = ?"
      ).bind(userId, marketId),
      c.env.DB.prepare(
        `UPDATE agent_market SET subscriber_count = MAX(subscriber_count - 1, 0) WHERE id = ?`
      ).bind(marketId)
    ]);
    return c.json({ success: true, message: "\u5DF2\u53D6\u6D88\u8BA2\u9605\uFF08\u667A\u56CA\u526F\u672C\u4FDD\u7559\uFF09" });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app13.post("/agents/:id/rate", authMiddleware, async (c) => {
  try {
    const userId = c.get("userId");
    const marketId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { rating } = body;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw errors.badRequest("rating \u5FC5\u987B\u4E3A 1-5 \u7684\u6574\u6570");
    const agent = await c.env.DB.prepare(
      "SELECT id, rating_sum, rating_count FROM agent_market WHERE id = ?"
    ).bind(marketId).first();
    if (!agent)
      throw errors.notFound("\u667A\u56CA\u4E0D\u5B58\u5728");
    const fbId = uuid();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO agent_feedback (id, user_id, agent_id, feedback_type, feedback_text)
         VALUES (?, ?, ?, 'good', ?)`
      ).bind(fbId, userId, marketId, `rating=${rating}`),
      c.env.DB.prepare(
        `UPDATE agent_market
         SET rating_sum = rating_sum + ?, rating_count = rating_count + 1
         WHERE id = ?`
      ).bind(rating, marketId)
    ]);
    const newSum = agent.rating_sum + rating;
    const newCount = agent.rating_count + 1;
    return c.json({
      success: true,
      rating_avg: newSum / newCount,
      rating_count: newCount
    });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
function safeParse(str, fallback) {
  if (!str)
    return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
__name(safeParse, "safeParse");
var market_default = app13;

// src/routes/sync.js
var app14 = new Hono2();
app14.use("*", authMiddleware);
app14.post("/migrate", async (c) => {
  try {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    const data = body.data || body;
    const migrated = {
      advisors: 0,
      cards: 0,
      daily: 0,
      memories: 0,
      achievements: 0,
      followups: 0
    };
    const skipped = {
      advisors: 0,
      cards: 0,
      daily: 0,
      memories: 0,
      achievements: 0,
      followups: 0
    };
    const ts = now();
    if (Array.isArray(data.custom_advisors)) {
      for (const a of data.custom_advisors) {
        if (!a.name || !a.persona) {
          skipped.advisors++;
          continue;
        }
        const dup = await c.env.DB.prepare(
          `SELECT id FROM custom_advisors WHERE user_id = ? AND name = ? AND persona = ?`
        ).bind(userId, a.name, a.persona).first();
        if (dup) {
          skipped.advisors++;
          continue;
        }
        await c.env.DB.prepare(
          `INSERT INTO custom_advisors
           (id, user_id, name, persona, perspective, style, element, trigram, color, origin_market_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          uuid(),
          userId,
          a.name,
          a.persona,
          a.perspective || "",
          a.style || "\u5468\u6613\u53E4\u98CE",
          a.element || null,
          a.trigram || null,
          a.color || null,
          a.origin_market_id || null
        ).run();
        migrated.advisors++;
      }
    }
    if (Array.isArray(data.cards)) {
      for (const card of data.cards) {
        if (!card.question) {
          skipped.cards++;
          continue;
        }
        const created = card.created_at || ts;
        const since = new Date(created);
        since.setMinutes(since.getMinutes() - 5);
        const sinceStr = since.toISOString();
        const until = new Date(created);
        until.setMinutes(until.getMinutes() + 5);
        const untilStr = until.toISOString();
        const dup = await c.env.DB.prepare(
          `SELECT id FROM cards
           WHERE user_id = ? AND question = ? AND gua IS ?
             AND created_at BETWEEN ? AND ?`
        ).bind(
          userId,
          card.question,
          card.gua || null,
          sinceStr,
          untilStr
        ).first();
        if (dup) {
          skipped.cards++;
          continue;
        }
        await c.env.DB.prepare(
          `INSERT INTO cards
           (id, user_id, session_id, gua, trigram, element, title, question, decision,
            verse, summary, advisors, rarity, style, pillars, powerful_question, framework, is_shared)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          uuid(),
          userId,
          card.session_id || null,
          card.gua || null,
          card.trigram || null,
          card.element || null,
          card.title || null,
          card.question,
          card.decision || null,
          card.verse || null,
          card.summary || null,
          typeof card.advisors === "string" ? card.advisors : JSON.stringify(card.advisors || []),
          card.rarity || null,
          card.style || null,
          typeof card.pillars === "string" ? card.pillars : JSON.stringify(card.pillars || null),
          card.powerful_question || null,
          card.framework || null,
          card.is_shared ? 1 : 0
        ).run();
        migrated.cards++;
      }
    }
    if (Array.isArray(data.daily_divinations)) {
      for (const d of data.daily_divinations) {
        if (!d.date) {
          skipped.daily++;
          continue;
        }
        try {
          await c.env.DB.prepare(
            `INSERT OR IGNORE INTO daily_divinations
             (id, user_id, date, gua, verse, message)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(uuid(), userId, d.date, d.gua || null, d.verse || null, d.message || null).run();
          migrated.daily++;
        } catch {
          skipped.daily++;
        }
      }
    }
    if (Array.isArray(data.user_memories)) {
      for (const m of data.user_memories) {
        if (!m.category || !m.content) {
          skipped.memories++;
          continue;
        }
        const dup = await c.env.DB.prepare(
          `SELECT id FROM user_memories
           WHERE user_id = ? AND category = ? AND title IS ? AND content = ?`
        ).bind(userId, m.category, m.title || null, m.content).first();
        if (dup) {
          skipped.memories++;
          continue;
        }
        await c.env.DB.prepare(
          `INSERT INTO user_memories
           (id, user_id, category, title, content, source, confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          uuid(),
          userId,
          m.category,
          m.title || null,
          m.content,
          m.source || null,
          typeof m.confidence === "number" ? m.confidence : 0.8
        ).run();
        migrated.memories++;
      }
    }
    if (Array.isArray(data.achievements)) {
      for (const a of data.achievements) {
        if (!a.achievement_id) {
          skipped.achievements++;
          continue;
        }
        try {
          await c.env.DB.prepare(
            `INSERT OR IGNORE INTO achievements (id, user_id, achievement_id)
             VALUES (?, ?, ?)`
          ).bind(uuid(), userId, a.achievement_id).run();
          migrated.achievements++;
        } catch {
          skipped.achievements++;
        }
      }
    }
    if (Array.isArray(data.decision_follow_ups)) {
      for (const f of data.decision_follow_ups) {
        if (!f.question || !f.decision || !f.follow_up_date) {
          skipped.followups++;
          continue;
        }
        const dup = await c.env.DB.prepare(
          `SELECT id FROM decision_follow_ups
           WHERE user_id = ? AND question = ? AND decision = ? AND follow_up_date = ?`
        ).bind(userId, f.question, f.decision, f.follow_up_date).first();
        if (dup) {
          skipped.followups++;
          continue;
        }
        await c.env.DB.prepare(
          `INSERT INTO decision_follow_ups
           (id, user_id, card_id, question, decision, follow_up_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          uuid(),
          userId,
          f.card_id || null,
          f.question,
          f.decision,
          f.follow_up_date,
          f.status || "pending"
        ).run();
        migrated.followups++;
      }
    }
    await audit(c, "sync_migrate", "user", userId, migrated);
    return c.json({
      success: true,
      migrated,
      skipped,
      syncedAt: ts
    });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app14.get("/export", async (c) => {
  try {
    const userId = c.get("userId");
    const [user, advisors, cards, daily, memories, achievements, followups, convs] = await Promise.all([
      c.env.DB.prepare(
        "SELECT id, nickname, avatar, color, bio, realm, level, xp, streak_days, total_inferences, total_chats, created_at FROM users WHERE id = ?"
      ).bind(userId).first(),
      c.env.DB.prepare("SELECT * FROM custom_advisors WHERE user_id = ?").bind(userId).all(),
      c.env.DB.prepare("SELECT * FROM cards WHERE user_id = ?").bind(userId).all(),
      c.env.DB.prepare("SELECT * FROM daily_divinations WHERE user_id = ?").bind(userId).all(),
      c.env.DB.prepare("SELECT * FROM user_memories WHERE user_id = ?").bind(userId).all(),
      c.env.DB.prepare("SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ?").bind(userId).all(),
      c.env.DB.prepare("SELECT * FROM decision_follow_ups WHERE user_id = ?").bind(userId).all(),
      c.env.DB.prepare("SELECT id, title, created_at, last_message_at FROM conversations WHERE user_id = ?").bind(userId).all()
    ]);
    return c.json({
      exportedAt: now(),
      version: "1.0.0",
      user,
      custom_advisors: advisors.results,
      cards: cards.results,
      daily_divinations: daily.results,
      user_memories: memories.results,
      achievements: achievements.results,
      decision_follow_ups: followups.results,
      conversations: convs.results
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
app14.post("/import", async (c) => {
  try {
    const userId = c.get("userId");
    const overwrite = c.req.query("overwrite") === "true";
    if (!overwrite)
      throw errors.badRequest("\u8986\u76D6\u5F0F\u5BFC\u5165\u9700\u786E\u8BA4 overwrite=true");
    const body = await c.req.json().catch(() => ({}));
    const data = body.data || body;
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM custom_advisors WHERE user_id = ?").bind(userId),
      c.env.DB.prepare("DELETE FROM cards WHERE user_id = ?").bind(userId),
      c.env.DB.prepare("DELETE FROM daily_divinations WHERE user_id = ?").bind(userId),
      c.env.DB.prepare("DELETE FROM user_memories WHERE user_id = ?").bind(userId),
      c.env.DB.prepare("DELETE FROM achievements WHERE user_id = ?").bind(userId),
      c.env.DB.prepare("DELETE FROM decision_follow_ups WHERE user_id = ?").bind(userId)
    ]);
    const migrated = {
      advisors: 0,
      cards: 0,
      daily: 0,
      memories: 0,
      achievements: 0,
      followups: 0
    };
    if (Array.isArray(data.custom_advisors)) {
      for (const a of data.custom_advisors) {
        if (!a.name || !a.persona)
          continue;
        await c.env.DB.prepare(
          `INSERT INTO custom_advisors (id, user_id, name, persona, perspective, style, element, trigram, color, origin_market_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(uuid(), userId, a.name, a.persona, a.perspective || "", a.style || "\u5468\u6613\u53E4\u98CE", a.element || null, a.trigram || null, a.color || null, a.origin_market_id || null).run();
        migrated.advisors++;
      }
    }
    if (Array.isArray(data.cards)) {
      for (const card of data.cards) {
        if (!card.question)
          continue;
        await c.env.DB.prepare(
          `INSERT INTO cards (id, user_id, gua, trigram, element, title, question, decision, verse, summary, is_shared)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(uuid(), userId, card.gua || null, card.trigram || null, card.element || null, card.title || null, card.question, card.decision || null, card.verse || null, card.summary || null, card.is_shared ? 1 : 0).run();
        migrated.cards++;
      }
    }
    if (Array.isArray(data.daily_divinations)) {
      for (const d of data.daily_divinations) {
        if (!d.date)
          continue;
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO daily_divinations (id, user_id, date, gua, verse, message) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(uuid(), userId, d.date, d.gua || null, d.verse || null, d.message || null).run();
        migrated.daily++;
      }
    }
    if (Array.isArray(data.user_memories)) {
      for (const m of data.user_memories) {
        if (!m.category || !m.content)
          continue;
        await c.env.DB.prepare(
          `INSERT INTO user_memories (id, user_id, category, title, content, source, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(uuid(), userId, m.category, m.title || null, m.content, m.source || null, typeof m.confidence === "number" ? m.confidence : 0.8).run();
        migrated.memories++;
      }
    }
    if (Array.isArray(data.achievements)) {
      for (const a of data.achievements) {
        if (!a.achievement_id)
          continue;
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO achievements (id, user_id, achievement_id) VALUES (?, ?, ?)`
        ).bind(uuid(), userId, a.achievement_id).run();
        migrated.achievements++;
      }
    }
    if (Array.isArray(data.decision_follow_ups)) {
      for (const f of data.decision_follow_ups) {
        if (!f.question || !f.decision || !f.follow_up_date)
          continue;
        await c.env.DB.prepare(
          `INSERT INTO decision_follow_ups (id, user_id, card_id, question, decision, follow_up_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(uuid(), userId, f.card_id || null, f.question, f.decision, f.follow_up_date, f.status || "pending").run();
        migrated.followups++;
      }
    }
    await audit(c, "sync_import_overwrite", "user", userId, migrated);
    return c.json({
      success: true,
      imported: migrated,
      importedAt: now()
    });
  } catch (e) {
    if (e.status)
      throw e;
    throw errors.internal(e.message);
  }
});
app14.get("/status", async (c) => {
  try {
    const userId = c.get("userId");
    const [
      advisorsR,
      cardsR,
      dailyR,
      memoriesR,
      achievementsR,
      followupsR,
      convsR,
      lastAuditR
    ] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) as n FROM custom_advisors WHERE user_id = ?").bind(userId).first(),
      c.env.DB.prepare("SELECT COUNT(*) as n FROM cards WHERE user_id = ?").bind(userId).first(),
      c.env.DB.prepare("SELECT COUNT(*) as n FROM daily_divinations WHERE user_id = ?").bind(userId).first(),
      c.env.DB.prepare("SELECT COUNT(*) as n FROM user_memories WHERE user_id = ?").bind(userId).first(),
      c.env.DB.prepare("SELECT COUNT(*) as n FROM achievements WHERE user_id = ?").bind(userId).first(),
      c.env.DB.prepare("SELECT COUNT(*) as n FROM decision_follow_ups WHERE user_id = ?").bind(userId).first(),
      c.env.DB.prepare("SELECT COUNT(*) as n FROM conversations WHERE user_id = ?").bind(userId).first(),
      c.env.DB.prepare(
        `SELECT created_at FROM audit_logs WHERE user_id = ? AND action IN ('sync_migrate','sync_import_overwrite') ORDER BY created_at DESC LIMIT 1`
      ).bind(userId).first()
    ]);
    return c.json({
      lastSyncedAt: lastAuditR?.created_at || null,
      today: today(),
      counts: {
        advisors: advisorsR?.n || 0,
        cards: cardsR?.n || 0,
        daily: dailyR?.n || 0,
        memories: memoriesR?.n || 0,
        achievements: achievementsR?.n || 0,
        followups: followupsR?.n || 0,
        conversations: convsR?.n || 0
      }
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});
var sync_default = app14;

// src/index.js
var app15 = new Hono2();
app15.use("*", secureHeaders());
var ALLOWED_ORIGINS = (env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim());
app15.use("*", async (c, next) => {
  const corsMiddleware = cors({
    origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : null,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposeHeaders: ["X-Request-Id", "X-RateLimit-Remaining"],
    credentials: true,
    maxAge: 86400
  });
  return corsMiddleware(c, next);
});
app15.use("*", logger());
app15.use("/api/*", rateLimitMiddleware);
app15.use("*", async (c, next) => {
  const reqId = c.req.header("X-Request-Id") || crypto.randomUUID();
  c.set("requestId", reqId);
  c.header("X-Request-Id", reqId);
  await next();
});
app15.route("/health", health_default);
app15.route("/api/auth", auth_default);
app15.route("/api/users", users_default);
app15.route("/api/agents", agents_default);
app15.route("/api/divination", divination_default);
app15.route("/api/cards", cards_default);
app15.route("/api/community", community_default);
app15.route("/api/daily", daily_default);
app15.route("/api/yan", yan_default);
app15.route("/api/level", level_default);
app15.route("/api/follow-up", followup_default);
app15.route("/api/achievements", achievements_default);
app15.route("/api/market", market_default);
app15.route("/api/sync", sync_default);
app15.notFound(notFound);
app15.onError(errorHandler2);
var src_default = app15;
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
