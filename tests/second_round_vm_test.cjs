"use strict";

// Isolated regression harness for app.js. No network, browser, or packages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function createHarness() {
  let now = 1_800_000_000_000;
  let serial = 0;
  let timerId = 0;
  const timers = new Map();
  const winEvents = new Map();
  const docEvents = new Map();
  const posts = [];
  const beacons = [];
  const sources = [];
  let responder = async (_packet) => ({ status: 200, ok: true,
    headers: { get: () => null }, json: async () => ({ id: "published-" + ++serial, time: Math.floor(now / 1000) }) });

  class FakeNode {
    constructor(tag = "div") {
      this.tag = tag;
      this.children = [];
      this.dataset = {};
      this.style = { setProperty() {} };
      this.classList = { toggle() {}, add() {}, remove() {} };
      this.listeners = new Map();
      this.value = "";
      this.textContent = "";
      this.hidden = false;
      this.validity = { valid: true };
      this.scrollHeight = 0;
      this.scrollTop = 0;
      this.clientHeight = 0;
    }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    setAttribute(name, value) { this[name] = value; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes.flatMap(node => node.tag === "fragment" ? node.children : [node]); }
    closest() { return new FakeNode(); }
    focus() {}
    select() {}
    remove() {}
  }
  const nodes = new Map();
  const document = {
    documentElement: { lang: "", style: { setProperty() {} } },
    body: new FakeNode("body"),
    visibilityState: "visible",
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, new FakeNode(id));
      return nodes.get(id);
    },
    querySelectorAll() { return []; },
    createElement(tag) { return new FakeNode(tag); },
    createDocumentFragment() { return new FakeNode("fragment"); },
    addEventListener(name, fn) { docEvents.set(name, fn); },
  };
  const location = new URL("https://example.test/index.html");
  const storage = () => {
    const map = new Map();
    return {
      getItem: key => map.has(key) ? map.get(key) : null,
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: key => map.delete(key),
      dump: () => map,
    };
  };
  const localStorage = storage();
  const sessionStorage = storage();
  class FakeEventSource {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; sources.push(this); }
    close() { this.readyState = 2; }
    open() { this.readyState = 1; this.onopen?.(); }
    message(packet, serverId = "server-" + ++serial, time = Math.floor(now / 1000)) {
      this.onmessage?.({ data: JSON.stringify({ event: "message", id: serverId, time,
        message: JSON.stringify(packet) }) });
    }
  }
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const window = {
    SpeechRecognition: null,
    webkitSpeechRecognition: null,
    speechSynthesis: null,
    crypto: { randomUUID: () => "uuid-" + ++serial, getRandomValues: bytes => { bytes.fill(7); return bytes; } },
    addEventListener: (name, fn) => winEvents.set(name, fn),
    history: { replaceState(_a, _b, url) { const next = new URL(url); location.href = next.href; } },
  };
  const navigator = { onLine: true, sendBeacon: (url, body) => { beacons.push({ url, body }); return true; } };
  const setTimeoutFake = (fn, ms = 0) => { const id = ++timerId; timers.set(id, { fn, due: now + Number(ms) }); return id; };
  const setIntervalFake = () => ++timerId;
  const context = vm.createContext({
    window, document, navigator, location, localStorage, sessionStorage,
    EventSource: FakeEventSource, Date: FakeDate, URL, URLSearchParams, TextEncoder,
    AbortController, console, crypto: window.crypto,
    setTimeout: setTimeoutFake, clearTimeout: id => timers.delete(id),
    setInterval: setIntervalFake, clearInterval() {},
    fetch: async (url, options = {}) => {
      const packet = options.body ? JSON.parse(options.body) : null;
      posts.push({ url, options, packet });
      return responder(packet, url, options);
    },
    confirm: () => true,
  });
  vm.runInContext(source, context, { filename: "app.js" });
  const evaluate = expression => vm.runInContext(expression, context);
  async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
  async function advance(ms) {
    const target = now + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > target) break;
      now = next[1].due;
      timers.delete(next[0]);
      next[1].fn();
      await flush();
    }
    now = target;
    await flush();
  }
  function enter() {
    nodes.get("nameInput").value = "Tester";
    nodes.get("languageSelect").value = "zh-TW";
    evaluate("openRoomFromForm({preventDefault() {}})");
    sources.at(-1).open();
    return flush();
  }
  return { evaluate, enter, flush, advance, nodes, posts, beacons, sources,
    winEvents, docEvents, localStorage, sessionStorage,
    setResponder: fn => { responder = fn; }, now: () => now };
}

async function main() {
  const h = createHarness();
  await h.enter();
  const originalId = h.evaluate("me.id");
  const first = h.sources.at(-1);
  first.message({ v: 1, type: "ping", id: "remote-1", from: "other", name: "Amy",
    lang: "en", host: false }, "cursor-1");
  assert.equal(JSON.parse(h.sessionStorage.getItem(h.evaluate("STORE.cursor(roomCode)"))), "cursor-1");
  h.winEvents.get("pagehide")({ persisted: false });
  assert.equal(first.readyState, 2);
  assert.equal(h.evaluate("transportStatus"), "offline");
  h.winEvents.get("pageshow")({ persisted: false });
  assert.equal(h.evaluate("me.id"), originalId);
  assert.match(h.sources.at(-1).url, /since=cursor-1/);
  h.sources.at(-1).open();
  await h.flush();
  assert.equal(h.evaluate("transportStatus"), "connected");
  const beaconsBeforeBF = h.beacons.length;
  h.winEvents.get("pagehide")({ persisted: true });
  assert.equal(h.beacons.length, beaconsBeforeBF);
  h.winEvents.get("pageshow")({ persisted: true });
  assert.notEqual(h.sources.at(-1), first);
  h.sources.at(-1).open();
  await h.flush();

  h.setResponder(async packet => packet?.type === "utterance"
    ? { status: 429, ok: false, headers: { get: () => "60" } }
    : { status: 200, ok: true, headers: { get: () => null },
      json: async () => ({ id: "published-" + Math.random(), time: Math.floor(h.now() / 1000) }) });
  const result = await h.evaluate("submitUtterance('A sentence', 'failed-1')");
  assert.equal(result, false);
  assert.equal(h.evaluate("getRecord('failed-1').sent"), false);
  assert.equal(h.evaluate("fallbackTimers.has('failed-1')"), false);
  const before = h.posts.length;
  await h.advance(20_000);
  assert.equal(h.posts.length, before, "long Retry-After must not schedule retry");
  assert.equal(h.evaluate("localMode"), "idle");

  h.setResponder(async packet => ({ status: 200, ok: true,
    headers: { get: () => null },
    json: async () => ({ id: packet.id + "-server", time: Math.floor(h.now() / 1000) }) }));
  const retried = await h.evaluate("submitUtterance('A sentence', 'failed-1')");
  assert.equal(retried, true);
  assert.equal(h.evaluate("getRecord('failed-1').sent"), true);
  assert.equal(h.evaluate("getRecord('failed-1').serverId"), "failed-1-server");

  let onAttempts = 0;
  h.setResponder(async packet => packet?.type === "listening" && packet.on && onAttempts++ === 0
    ? { status: 429, ok: false, headers: { get: () => "10" } }
    : { status: 200, ok: true, headers: { get: () => null },
      json: async () => ({ id: packet.id + "-server", time: Math.floor(h.now() / 1000) }) });
  const onTask = h.evaluate("sendListening(true, 'rate-on')");
  const offTask = h.evaluate("sendListening(false, 'rate-off')");
  const utteranceTask = h.evaluate("submitUtterance('after rate limit', 'after-rate')");
  await h.flush();
  assert.equal(h.posts.some(post => post.packet?.id === "rate-off"), true,
    "off must publish while on is waiting for retry");
  assert.equal(h.posts.some(post => post.packet?.id === "after-rate"), true,
    "utterance must publish while on is waiting for retry");
  assert.equal(h.evaluate("claims.has(me.id)"), false, "off clears own claim immediately");
  await offTask;
  await utteranceTask;
  await h.advance(10_000);
  await onTask.catch(() => {});

  const source2 = h.sources.at(-1);
  source2.message({ v: 1, type: "listening", id: "old-on", from: "other", name: "Amy",
    lang: "en", on: true }, "old-on-server", Math.floor(h.now() / 1000) - 90);
  assert.equal(h.evaluate("claims.has('other')"), false);
  source2.message({ v: 1, type: "hello", id: "old-hello", from: "stale", name: "Old",
    lang: "en", host: false }, "old-hello-server", Math.floor(h.now() / 1000) - 600);
  await h.flush();
  assert.equal(h.evaluate("isOnline(members.get('stale'))"), false);
  assert.equal(h.posts.some(post => post.packet?.replyTo === "old-hello"), false);
  source2.message({ v: 1, type: "hello", id: "bad-name", from: "bad", name: { x: 1 },
    lang: "en", host: false }, "bad-name-server");
  assert.equal(h.evaluate("members.has('bad')"), false);
  console.log("PASS: pagehide/pageshow, since cursor, 429 cap, failed/retried utterance, stale replay, malformed name");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
