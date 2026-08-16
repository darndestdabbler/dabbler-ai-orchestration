#!/usr/bin/env node
// obs-websocket v5 client (Set 113 Session 4).
//
// Dependency-free ON PURPOSE. Node 22+ ships a global WebSocket, and the
// obs-websocket v5 handshake is a Hello / Identify / Identified exchange
// followed by request-response pairs -- about a hundred lines. Taking
// `obs-websocket-js` instead would add a runtime dependency to an
// extension package for a capability the spec calls an OPTIONAL Windows
// prerequisite, which is the wrong trade: the dependency would be
// installed by everyone and used by almost nobody.
//
// OBS itself is never bundled. It is a documented optional prerequisite,
// and "OBS absent, or running without its websocket reachable" is a
// first-class failure path here, not an unhandled one.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const crypto = require("crypto");

const OP_HELLO = 0;
const OP_IDENTIFY = 1;
const OP_IDENTIFIED = 2;
const OP_EVENT = 5;
const OP_REQUEST = 6;
const OP_REQUEST_RESPONSE = 7;

const RPC_VERSION = 1;

/**
 * The error every unreachable-dependency path raises.
 *
 * It carries a `kind` so callers can tell "OBS is not listening" from
 * "OBS rejected the password" from "OBS closed on us" WITHOUT parsing a
 * message string -- criterion C5 asks for a named failure per variant,
 * and a name that only exists in prose is not one.
 */
class ObsUnavailableError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "ObsUnavailableError";
    this.kind = kind;
  }
}

function sha256Base64(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("base64");
}

/**
 * The v5 authentication string: base64(sha256(base64(sha256(password +
 * salt)) + challenge)). Only computed when OBS actually asks for it --
 * a server with authentication disabled sends no challenge.
 */
function authResponse(password, salt, challenge) {
  return sha256Base64(sha256Base64(password + salt) + challenge);
}

class ObsWebSocketClient {
  constructor(socket) {
    this._socket = socket;
    this._pending = new Map();
    this._eventHandlers = new Map();
    this._nextId = 1;
    this._closed = false;
    this._closeReason = null;

    socket.addEventListener("message", (ev) => this._onMessage(ev));
    socket.addEventListener("close", (ev) => {
      this._closed = true;
      this._closeReason = "code " + ev.code;
      const err = new ObsUnavailableError(
        "connection-closed",
        "OBS websocket closed (" + this._closeReason + ")."
      );
      for (const waiter of this._pending.values()) waiter.reject(err);
      this._pending.clear();
    });
  }

  _onMessage(ev) {
    let frame;
    try {
      frame = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (frame.op === OP_REQUEST_RESPONSE) {
      const d = frame.d || {};
      const waiter = this._pending.get(d.requestId);
      if (!waiter) return;
      this._pending.delete(d.requestId);
      const status = d.requestStatus || {};
      if (status.result) {
        waiter.resolve(d.responseData || {});
      } else {
        waiter.reject(
          new Error(
            "OBS request " +
              d.requestType +
              " failed: " +
              (status.comment || "no comment") +
              " (code " +
              status.code +
              ")."
          )
        );
      }
      return;
    }
    if (frame.op === OP_EVENT) {
      const d = frame.d || {};
      const handlers = this._eventHandlers.get(d.eventType);
      if (handlers) for (const h of handlers) h(d.eventData || {});
    }
  }

  on(eventType, handler) {
    if (!this._eventHandlers.has(eventType)) {
      this._eventHandlers.set(eventType, []);
    }
    this._eventHandlers.get(eventType).push(handler);
  }

  async request(requestType, requestData) {
    if (this._closed) {
      throw new ObsUnavailableError(
        "connection-closed",
        "OBS websocket is closed (" +
          this._closeReason +
          "); cannot send " +
          requestType +
          "."
      );
    }
    const requestId = "dabbler-" + this._nextId++;
    const promise = new Promise((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject });
    });
    this._socket.send(
      JSON.stringify({
        op: OP_REQUEST,
        d: { requestType, requestId, requestData: requestData || {} },
      })
    );
    return promise;
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    try {
      this._socket.close();
    } catch {
      /* already gone */
    }
  }
}

/**
 * Connect and identify, or raise ObsUnavailableError.
 *
 * Every failure here is one of criterion C5's variants, and each gets its
 * own `kind`: the port is not listening, the password was rejected, or
 * OBS went away mid-handshake.
 */
async function connectObs(options) {
  const port = options.port;
  const password = options.password;
  const timeoutMs = options.timeoutMs || 15000;
  const url = "ws://127.0.0.1:" + port;

  let socket;
  try {
    socket = new WebSocket(url);
  } catch (err) {
    throw new ObsUnavailableError(
      "unreachable",
      "Could not open a websocket to OBS at " +
        url +
        ": " +
        err.message +
        ". Is OBS running with its websocket server enabled?"
    );
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* nothing to close */
      }
      finish(
        reject,
        new ObsUnavailableError(
          "timeout",
          "OBS did not complete the websocket handshake at " +
            url +
            " within " +
            timeoutMs +
            "ms. Is OBS running with its websocket server enabled?"
        )
      );
    }, timeoutMs);

    socket.addEventListener("error", () => {
      finish(
        reject,
        new ObsUnavailableError(
          "unreachable",
          "No OBS websocket is listening at " +
            url +
            ". OBS is an optional prerequisite for OS capture: start OBS, " +
            "or run without recording."
        )
      );
    });

    socket.addEventListener("close", (ev) => {
      // 4009 is obs-websocket's authentication failure. It arrives as a
      // CLOSE, not an error, so a caller that only listens for "error"
      // reports "unreachable" for a wrong password -- which sends whoever
      // is debugging it to look at firewalls instead of at their password.
      if (ev.code === 4009) {
        finish(
          reject,
          new ObsUnavailableError(
            "auth-rejected",
            "OBS rejected the websocket password at " + url + " (close 4009)."
          )
        );
        return;
      }
      finish(
        reject,
        new ObsUnavailableError(
          "connection-closed",
          "OBS closed the websocket at " +
            url +
            " before identifying (code " +
            ev.code +
            ")."
        )
      );
    });

    socket.addEventListener("message", (ev) => {
      let frame;
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (frame.op === OP_HELLO) {
        const d = frame.d || {};
        const identify = { rpcVersion: RPC_VERSION, eventSubscriptions: 0 };
        if (d.authentication) {
          if (!password) {
            finish(
              reject,
              new ObsUnavailableError(
                "auth-required",
                "OBS at " +
                  url +
                  " requires a websocket password and none was supplied."
              )
            );
            return;
          }
          identify.authentication = authResponse(
            password,
            d.authentication.salt,
            d.authentication.challenge
          );
        }
        socket.send(JSON.stringify({ op: OP_IDENTIFY, d: identify }));
        return;
      }
      if (frame.op === OP_IDENTIFIED) {
        const client = new ObsWebSocketClient(socket);
        finish(resolve, client);
      }
    });
  });
}

module.exports = {
  connectObs,
  ObsWebSocketClient,
  ObsUnavailableError,
  authResponse,
  RPC_VERSION,
};
