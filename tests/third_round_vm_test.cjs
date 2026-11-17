"use strict";

// SpeechRecognition timing regression harness. No browser, network, or packages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function createHarness() {
  let now = 1_800_000_000_000;
  let serial = 0;
  let timerId = 0;
  const timers = new Map();
  const nodes = new Map();
  const posts = [];
  const recognitions = [];
  const winEvents = new Map();
  const docEvents = new Map();
  const sources = [];

  class FakeRecognition {
    constructor() {
      this.startCalls = 0;
      this.stopCalls = 0;
      this.abortCalls = 0;
      this.abortEvent = "";
      this.abortEventCount = 0;
      recognitions.push(this);
    }
    start() { this.startCalls++; }
    stop() { this.stopCalls++; }
    abort() {
      this.abortCalls++;
      if (this.abortEvent === "error") {
        this.abortEventCount++;
        this.onerror?.({ error: "aborted" });
      } else if (this.abortEvent === "end") {
        this.abortEventCount++;
        this.onend?.();
      }
    }
    result(text, isFinal = false) {
      this.onresult?.({ results: [{ 0: { transcript: text }, isFinal }] });
    }
    end() { this.onend?.(); }
  }

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
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) {
      this.children = children.flatMap(child => child.tag === "fragment" ? child.children : [child]);
    }
    closest() { return new FakeNode(); }
    focus() {}
    select() {}
    remove() {}
  }
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
  function storage() {
    const items = new Map();
    return {
      getItem: key => items.has(key) ? items.get(key) : null,
      setItem: (key, value) => items.set(key, String(value)),
      removeItem: key => items.delete(key),
    };
  }
  class FakeEventSource {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; sources.push(this); }
    close() { this.readyState = 2; }
    open() { this.readyState = 1; this.onopen?.(); }
  }
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const window = {
    SpeechRecognition: FakeRecognition,
    webkitSpeechRecognition: null,
    speechSynthesis: null,
    crypto: {
      randomUUID: () => "uuid-" + ++serial,
      getRandomValues: bytes => { bytes.fill(7); return bytes; },
    },
    addEventListener: (name, fn) => winEvents.set(name, fn),
    history: { replaceState(_a, _b, url) { location.href = new URL(url).href; } },
  };
  const context = vm.createContext({
    window, document, location,
    navigator: { onLine: true, sendBeacon: () => true },
    localStorage: storage(), sessionStorage: storage(),
    EventSource: FakeEventSource, Date: FakeDate, URL, URLSearchParams, TextEncoder,
    AbortController, console, crypto: window.crypto,
    setTimeout: (fn, ms = 0) => {
      const id = ++timerId;
      timers.set(id, { fn, due: now + Number(ms) });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    setInterval: () => ++timerId,
    clearInterval() {},
    fetch: async (url, options = {}) => {
      const packet = options.body ? JSON.parse(options.body) : null;
      posts.push({ url, packet });
      return {
        status: 200, ok: true, headers: { get: () => null },
        json: async () => ({ id: packet.id + "-server", time: Math.floor(now / 1000) }),
      };
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
  async function enter() {
    nodes.get("nameInput").value = "Tester";
    nodes.get("languageSelect").value = "zh-TW";
    evaluate("openRoomFromForm({preventDefault() {}})");
    sources.at(-1).open();
    await flush();
  }
  const utterances = () => posts.filter(post => post.packet?.type === "utterance");
  return { evaluate, flush, advance, enter, recognitions, utterances, nodes };
}

async function waitForIdle(h) {
  for (let i = 0; i < 100 && h.evaluate("localMode") !== "idle"; i++) {
    await h.flush();
  }
  assert.equal(h.evaluate("localMode"), "idle", "submission must settle before another recording");
}

async function testSilenceStopAndEnd() {
  const h = createHarness();
  await h.enter();
  h.evaluate("startListening()");
  const rec = h.recognitions.at(-1);
  assert.equal(rec.startCalls, 1);
  rec.result("Hel");
  await h.advance(1500);
  rec.result("  Hello  "); // A new interim result resets the silence timer.
  await h.advance(1999);
  assert.equal(rec.stopCalls, 0, "interim text must not stop before 2 seconds");
  await h.advance(1);
  assert.equal(rec.stopCalls, 1, "2 seconds of silence must call stop once");
  assert.equal(h.evaluate("recognitionStopping"), true);
  rec.end();
  await h.flush();
  assert.equal(h.utterances().length, 1);
  assert.equal(h.utterances()[0].packet.text, "Hello",
    "onend without an upgraded final result must use the last interim text");
  await h.advance(5000);
  assert.equal(rec.abortCalls, 0, "onend must clear the stop fallback timer");
  assert.equal(h.utterances().length, 1);
}

async function testFinalStopsImmediately() {
  const h = createHarness();
  await h.enter();
  h.evaluate("startListening()");
  const rec = h.recognitions.at(-1);
  rec.result("Final sentence", true);
  assert.equal(rec.stopCalls, 1, "isFinal must stop without waiting for silence");
  rec.end();
  await h.flush();
  assert.equal(h.utterances().length, 1);
  assert.equal(h.utterances()[0].packet.text, "Final sentence");
}

async function testStopFallback() {
  const h = createHarness();
  await h.enter();
  h.evaluate("startListening()");
  const rec = h.recognitions.at(-1);
  rec.result("Fallback interim");
  rec.abortEvent = "error";
  await h.advance(2000);
  assert.equal(rec.stopCalls, 1);
  await h.advance(4999);
  assert.equal(rec.abortCalls, 0);
  assert.equal(h.utterances().length, 0);
  await h.advance(1);
  assert.equal(rec.abortCalls, 1, "missing onend must cause abort after 5 seconds");
  assert.equal(rec.abortEventCount, 1, "fake iOS must synchronously call onerror during abort");
  assert.equal(h.utterances().length, 1);
  assert.equal(h.utterances()[0].packet.text, "Fallback interim");
  rec.end();
  await h.flush();
  assert.equal(h.utterances().length, 1, "late onend must not submit again");

  const empty = createHarness();
  await empty.enter();
  empty.evaluate("startListening()");
  const emptyRec = empty.recognitions.at(-1);
  emptyRec.abortEvent = "end";
  await empty.advance(6000);
  empty.evaluate("stopListening()");
  await empty.advance(1999);
  assert.equal(emptyRec.abortCalls, 0, "stopping must cancel the earlier 8-second watchdog");
  await empty.advance(3001);
  assert.equal(emptyRec.abortCalls, 1);
  assert.equal(emptyRec.abortEventCount, 1, "fake iOS must synchronously call onend during abort");
  assert.equal(empty.utterances().length, 0, "empty input must never submit");
  assert.equal(empty.nodes.get("toast").textContent,
    "沒有聽到聲音，請再試一次。", "empty input must display noSpeech");
}

async function testManualStopAndOldTimers() {
  const h = createHarness();
  await h.enter();
  h.evaluate("startListening()");
  const first = h.recognitions.at(-1);
  first.result("Manual sentence");
  await h.advance(500);
  h.evaluate("stopListening()");
  h.evaluate("stopListening()");
  assert.equal(first.stopCalls, 1, "a repeated tap must not call stop twice");
  first.end();
  await h.flush();
  assert.equal(h.utterances().length, 1);
  assert.equal(h.utterances()[0].packet.text, "Manual sentence");

  await waitForIdle(h);
  h.evaluate("startListening()");
  const second = h.recognitions.at(-1);
  assert.notEqual(second, first);
  await h.advance(1500); // The first sentence's silence timer would have fired now.
  assert.equal(second.stopCalls, 0, "old silence timer must not stop the next sentence");
  assert.equal(h.evaluate("localMode"), "listening");
  second.result("Next sentence", true);
  assert.equal(second.stopCalls, 1);
  second.end();
  await h.advance(5000);
  first.end();
  await h.flush();
  assert.equal(h.utterances().length, 2, "late callbacks and timers must not duplicate submissions");
  assert.deepEqual(h.utterances().map(post => post.packet.text),
    ["Manual sentence", "Next sentence"]);
  assert.equal(first.abortCalls, 0);
  assert.equal(second.abortCalls, 0);
}

async function main() {
  await testSilenceStopAndEnd();
  await testFinalStopsImmediately();
  await testStopFallback();
  await testManualStopAndOldTimers();
  console.log("PASS: silence stop, final stop, 5-second fallback, manual stop, old timer isolation");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
