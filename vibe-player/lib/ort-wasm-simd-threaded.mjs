var ortWasmThreaded = (() => {
    var _scriptName = import.meta.url;

    return (
        async function (moduleArg = {}) {
            var moduleRtn;

            var h = moduleArg, ba, ca, da = new Promise((a, b) => {
                    ba = a;
                    ca = b
                }), ea = "object" == typeof window, l = "undefined" != typeof WorkerGlobalScope,
                m = "object" == typeof process && "object" == typeof process.versions && "string" == typeof process.versions.node && "renderer" != process.type,
                n = l && self.name?.startsWith("em-pthread");
            if (m) {
                const {createRequire: a} = await import("module");
                var require = a(import.meta.url), fa = require("worker_threads");
                global.Worker = fa.Worker;
                n = (l = !fa.pc) && "em-pthread" == fa.workerData
            }
            "use strict";
            h.mountExternalData = (a, b) => {
                a.startsWith("./") && (a = a.substring(2));
                (h.Zb || (h.Zb = new Map)).set(a, b)
            };
            h.unmountExternalData = () => {
                delete h.Zb
            };
            var SharedArrayBuffer = globalThis.SharedArrayBuffer ?? (new WebAssembly.Memory({
                initial: 0,
                maximum: 0,
                shared: !0
            })).buffer.constructor, ha = Object.assign({}, h), ia = "./this.program", ja = (a, b) => {
                throw b;
            }, q = "", ka, la;
            if (m) {
                var fs = require("fs"), ma = require("path");
                import.meta.url.startsWith("data:") || (q = ma.dirname(require("url").fileURLToPath(import.meta.url)) + "/");
                la = a => {
                    a = na(a) ? new URL(a) : a;
                    return fs.readFileSync(a)
                };
                ka = async a => {
                    a = na(a) ? new URL(a) : a;
                    return fs.readFileSync(a, void 0)
                };
                !h.thisProgram && 1 < process.argv.length && (ia = process.argv[1].replace(/\\/g, "/"));
                process.argv.slice(2);
                ja = (a, b) => {
                    process.exitCode = a;
                    throw b;
                }
            } else if (ea || l) l ? q = self.location.href : "undefined" != typeof document &&
                document.currentScript && (q = document.currentScript.src), _scriptName && (q = _scriptName), q.startsWith("blob:") ? q = "" : q = q.slice(0, q.replace(/[?#].*/, "").lastIndexOf("/") + 1), m || (l && (la = a => {
                var b = new XMLHttpRequest;
                b.open("GET", a, !1);
                b.responseType = "arraybuffer";
                b.send(null);
                return new Uint8Array(b.response)
            }), ka = async a => {
                if (na(a)) return new Promise((c, d) => {
                    var e = new XMLHttpRequest;
                    e.open("GET", a, !0);
                    e.responseType = "arraybuffer";
                    e.onload = () => {
                        200 == e.status || 0 == e.status && e.response ? c(e.response) : d(e.status)
                    };
                    e.onerror = d;
                    e.send(null)
                });
                var b = await fetch(a, {credentials: "same-origin"});
                if (b.ok) return b.arrayBuffer();
                throw Error(b.status + " : " + b.url);
            });
            var oa = console.log.bind(console), pa = console.error.bind(console);
            m && (oa = (...a) => fs.writeSync(1, a.join(" ") + "\n"), pa = (...a) => fs.writeSync(2, a.join(" ") + "\n"));
            var qa = oa, r = pa;
            Object.assign(h, ha);
            ha = null;
            var ra = h.wasmBinary, t, sa, ta = !1, u, w, ua, va, wa, xa, ya, y, za, na = a => a.startsWith("file://");

            function A() {
                t.buffer != w.buffer && B();
                return w
            }

            function D() {
                t.buffer != w.buffer && B();
                return ua
            }

            function Aa() {
                t.buffer != w.buffer && B();
                return va
            }

            function E() {
                t.buffer != w.buffer && B();
                return wa
            }

            function F() {
                t.buffer != w.buffer && B();
                return xa
            }

            function Ba() {
                t.buffer != w.buffer && B();
                return ya
            }

            function G() {
                t.buffer != w.buffer && B();
                return za
            }

            if (n) {
                var Ca;
                if (m) {
                    var Da = fa.parentPort;
                    Da.on("message", b => onmessage({data: b}));
                    Object.assign(globalThis, {self: global, postMessage: b => Da.postMessage(b)})
                }
                var Ea = !1;
                r = function (...b) {
                    b = b.join(" ");
                    m ? fs.writeSync(2, b + "\n") : console.error(b)
                };
                self.alert = function (...b) {
                    postMessage({Yb: "alert", text: b.join(" "), lc: Fa()})
                };
                self.onunhandledrejection = b => {
                    throw b.reason || b;
                };

                function a(b) {
                    try {
                        var c = b.data, d = c.Yb;
                        if ("load" === d) {
                            let e = [];
                            self.onmessage = f => e.push(f);
                            self.startWorker = () => {
                                postMessage({Yb: "loaded"});
                                for (let f of e) a(f);
                                self.onmessage = a
                            };
                            for (const f of c.fc) if (!h[f] || h[f].proxy) h[f] = (...g) => {
                                postMessage({Yb: "callHandler", ec: f, args: g})
                            }, "print" == f && (qa = h[f]), "printErr" == f && (r = h[f]);
                            t = c.nc;
                            B();
                            Ca(c.oc)
                        } else if ("run" === d) {
                            Ga(c.Xb);
                            Ia(c.Xb, 0, 0, 1, 0, 0);
                            Ja();
                            Ka(c.Xb);
                            Ea ||= !0;
                            try {
                                La(c.jc, c.ac)
                            } catch (e) {
                                if ("unwind" != e) throw e;
                            }
                        } else "setimmediate" !== c.target && ("checkMailbox" === d ? Ea && Ma() : d && (r(`worker: received unknown command ${d}`), r(c)))
                    } catch (e) {
                        throw Na(), e;
                    }
                }

                self.onmessage = a
            }

            function B() {
                var a = t.buffer;
                h.HEAP8 = w = new Int8Array(a);
                h.HEAP16 = va = new Int16Array(a);
                h.HEAPU8 = ua = new Uint8Array(a);
                h.HEAPU16 = new Uint16Array(a);
                h.HEAP32 = wa = new Int32Array(a);
                h.HEAPU32 = xa = new Uint32Array(a);
                h.HEAPF32 = ya = new Float32Array(a);
                h.HEAPF64 = za = new Float64Array(a);
                h.HEAP64 = y = new BigInt64Array(a);
                h.HEAPU64 = new BigUint64Array(a)
            }

            n || (t = new WebAssembly.Memory({initial: 256, maximum: 65536, shared: !0}), B());

            function Oa() {
                n ? startWorker(h) : H._a()
            }

            var I = 0, J = null;

            function Pa() {
                I--;
                if (0 == I && J) {
                    var a = J;
                    J = null;
                    a()
                }
            }

            function K(a) {
                a = "Aborted(" + a + ")";
                r(a);
                ta = !0;
                a = new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info.");
                ca(a);
                throw a;
            }

            var Qa;

            async function Ra(a) {
                if (!ra) try {
                    var b = await ka(a);
                    return new Uint8Array(b)
                } catch {
                }
                if (a == Qa && ra) a = new Uint8Array(ra); else if (la) a = la(a); else throw "both async and sync fetching of the wasm failed";
                return a
            }

            async function Sa(a, b) {
                try {
                    var c = await Ra(a);
                    return await WebAssembly.instantiate(c, b)
                } catch (d) {
                    r(`failed to asynchronously prepare wasm: ${d}`), K(d)
                }
            }

            async function Ta(a) {
                var b = Qa;
                if (!ra && "function" == typeof WebAssembly.instantiateStreaming && !na(b) && !m) try {
                    var c = fetch(b, {credentials: "same-origin"});
                    return await WebAssembly.instantiateStreaming(c, a)
                } catch (d) {
                    r(`wasm streaming compile failed: ${d}`), r("falling back to ArrayBuffer instantiation")
                }
                return Sa(b, a)
            }

            function Ua() {
                Va = {
                    Oa: Wa,
                    E: Xa,
                    S: Ya,
                    b: Za,
                    r: $a,
                    B: ab,
                    Sa: bb,
                    d: cb,
                    la: db,
                    g: eb,
                    C: fb,
                    Ba: gb,
                    ha: hb,
                    ja: ib,
                    Ca: jb,
                    za: kb,
                    sa: lb,
                    ya: mb,
                    X: nb,
                    ia: ob,
                    fa: pb,
                    Aa: qb,
                    ga: rb,
                    Ha: sb,
                    va: tb,
                    Ya: ub,
                    ma: vb,
                    Va: wb,
                    T: xb,
                    ua: Ka,
                    Ea: yb,
                    pa: zb,
                    qa: Ab,
                    ra: Bb,
                    na: Cb,
                    oa: Db,
                    Wa: Eb,
                    Ja: Fb,
                    Ga: Gb,
                    da: Hb,
                    U: Ib,
                    Fa: Jb,
                    Y: Kb,
                    Da: Lb,
                    Za: Mb,
                    D: Nb,
                    N: Ob,
                    Na: Pb,
                    Xa: Qb,
                    La: Rb,
                    Ka: Sb,
                    wa: Tb,
                    xa: Ub,
                    ka: Vb,
                    I: Wb,
                    W: Xb,
                    ta: Yb,
                    V: Zb,
                    Ua: $b,
                    Q: ac,
                    _: bc,
                    O: cc,
                    L: dc,
                    aa: ec,
                    o: fc,
                    e: gc,
                    c: hc,
                    M: ic,
                    f: jc,
                    m: kc,
                    k: lc,
                    F: mc,
                    R: nc,
                    j: oc,
                    ca: pc,
                    Ma: qc,
                    K: rc,
                    Pa: sc,
                    z: tc,
                    w: uc,
                    H: vc,
                    A: wc,
                    G: xc,
                    s: yc,
                    l: zc,
                    ba: Ac,
                    i: Bc,
                    h: Cc,
                    Z: Dc,
                    $: Ec,
                    n: Fc,
                    p: Gc,
                    q: Hc,
                    v: Ic,
                    t: Jc,
                    x: Kc,
                    ea: Lc,
                    Ta: Mc,
                    u: Nc,
                    Ra: Oc,
                    J: Pc,
                    y: Qc,
                    Qa: Rc,
                    P: Sc,
                    a: t,
                    Ia: Tc
                };
                return {a: Va}
            }

            var Vc = {
                1285017: () => "undefined" !== typeof wasmOffsetConverter, 1285074: (a, b, c, d, e) => {
                    if ("undefined" == typeof h || !h.Zb) return 1;
                    a = Uc(Number(a >>> 0));
                    a.startsWith("./") && (a = a.substring(2));
                    a = h.Zb.get(a);
                    if (!a) return 2;
                    b = Number(b >>> 0);
                    c = Number(c >>> 0);
                    d = Number(d >>> 0);
                    if (b + c > a.byteLength) return 3;
                    try {
                        const f = a.subarray(b, b + c);
                        switch (e) {
                            case 0:
                                D().set(f, d >>> 0);
                                break;
                            case 1:
                                h.qc(d, f);
                                break;
                            default:
                                return 4
                        }
                        return 0
                    } catch {
                        return 4
                    }
                }
            };

            function Wa() {
                return "undefined" !== typeof wasmOffsetConverter
            }

            class Wc {
                name = "ExitStatus";

                constructor(a) {
                    this.message = `Program terminated with exit(${a})`;
                    this.status = a
                }
            }

            var Xc = a => {
                a.terminate();
                a.onmessage = () => {
                }
            }, Yc = [], ad = a => {
                0 == L.length && (Zc(), $c(L[0]));
                var b = L.pop();
                if (!b) return 6;
                M.push(b);
                O[a.Xb] = b;
                b.Xb = a.Xb;
                var c = {Yb: "run", jc: a.ic, ac: a.ac, Xb: a.Xb};
                m && b.unref();
                b.postMessage(c, a.dc);
                return 0
            }, P = 0, S = (a, b, ...c) => {
                for (var d = 2 * c.length, e = Q(), f = bd(8 * d), g = f >>> 3, k = 0; k < c.length; k++) {
                    var p = c[k];
                    "bigint" == typeof p ? (y[g + 2 * k] = 1n, y[g + 2 * k + 1] = p) : (y[g + 2 * k] = 0n, G()[g + 2 * k + 1 >>> 0] = p)
                }
                a = cd(a, 0, d, f, b);
                R(e);
                return a
            };

            function Tc(a) {
                if (n) return S(0, 1, a);
                u = a;
                if (!(0 < P)) {
                    for (var b of M) Xc(b);
                    for (b of L) Xc(b);
                    L = [];
                    M = [];
                    O = {};
                    ta = !0
                }
                ja(a, new Wc(a))
            }

            function dd(a) {
                if (n) return S(1, 0, a);
                Vb(a)
            }

            var Vb = a => {
                u = a;
                if (n) throw dd(a), "unwind";
                Tc(a)
            }, L = [], M = [], ed = [], O = {};

            function fd() {
                for (var a = h.numThreads - 1; a--;) Zc();
                Yc.unshift(() => {
                    I++;
                    gd(() => Pa())
                })
            }

            var jd = a => {
                var b = a.Xb;
                delete O[b];
                L.push(a);
                M.splice(M.indexOf(a), 1);
                a.Xb = 0;
                hd(b)
            };

            function Ja() {
                ed.forEach(a => a())
            }

            var $c = a => new Promise(b => {
                a.onmessage = f => {
                    f = f.data;
                    var g = f.Yb;
                    if (f.$b && f.$b != Fa()) {
                        var k = O[f.$b];
                        k ? k.postMessage(f, f.dc) : r(`Internal error! Worker sent a message "${g}" to target pthread ${f.$b}, but that thread no longer exists!`)
                    } else if ("checkMailbox" === g) Ma(); else if ("spawnThread" === g) ad(f); else if ("cleanupThread" === g) jd(O[f.kc]); else if ("loaded" === g) a.loaded = !0, m && !a.Xb && a.unref(), b(a); else if ("alert" === g) alert(`Thread ${f.lc}: ${f.text}`); else if ("setimmediate" === f.target) a.postMessage(f); else if ("callHandler" ===
                        g) h[f.ec](...f.args); else g && r(`worker sent an unknown command ${g}`)
                };
                a.onerror = f => {
                    r(`${"worker sent an error!"} ${f.filename}:${f.lineno}: ${f.message}`);
                    throw f;
                };
                m && (a.on("message", f => a.onmessage({data: f})), a.on("error", f => a.onerror(f)));
                var c = [], d = [], e;
                for (e of d) h.propertyIsEnumerable(e) && c.push(e);
                a.postMessage({Yb: "load", fc: c, nc: t, oc: sa})
            });

            function gd(a) {
                n ? a() : Promise.all(L.map($c)).then(a)
            }

            function Zc() {
                var a = new Worker(new URL(import.meta.url), {
                    type: "module",
                    workerData: "em-pthread",
                    name: "em-pthread"
                });
                L.push(a)
            }

            var Ga = a => {
                B();
                var b = F()[a + 52 >>> 2 >>> 0];
                a = F()[a + 56 >>> 2 >>> 0];
                kd(b, b - a);
                R(b)
            }, ld = [], md, T = a => {
                var b = ld[a];
                b || (a >= ld.length && (ld.length = a + 1), ld[a] = b = md.get(a));
                return b
            }, La = (a, b) => {
                P = 0;
                a = T(a)(b);
                0 < P ? u = a : nd(a)
            }, od = [], pd = 0;

            function Xa(a) {
                a >>>= 0;
                var b = new qd(a);
                if (0 == A()[b.Wb + 12 >>> 0]) {
                    var c = 1;
                    A()[b.Wb + 12 >>> 0] = c;
                    pd--
                }
                c = 0;
                A()[b.Wb + 13 >>> 0] = c;
                od.push(b);
                rd(a);
                return sd(a)
            }

            var U = 0, Ya = () => {
                V(0, 0);
                var a = od.pop();
                td(a.bc);
                U = 0
            };

            class qd {
                constructor(a) {
                    this.bc = a;
                    this.Wb = a - 24
                }
            }

            function eb(a) {
                U ||= a >>> 0;
                throw U;
            }

            var vd = a => {
                var b = U;
                if (!b) return W(0), 0;
                var c = new qd(b);
                F()[c.Wb + 16 >>> 2 >>> 0] = b;
                var d = F()[c.Wb + 4 >>> 2 >>> 0];
                if (!d) return W(0), b;
                for (var e of a) {
                    if (0 === e || e === d) break;
                    if (ud(e, d, c.Wb + 16)) return W(e), b
                }
                W(d);
                return b
            };

            function Za() {
                return vd([])
            }

            function $a(a) {
                return vd([a >>> 0])
            }

            function ab(a, b) {
                return vd([a >>> 0, b >>> 0])
            }

            var bb = () => {
                var a = od.pop();
                a || K("no exception to throw");
                var b = a.bc;
                if (0 == A()[a.Wb + 13 >>> 0]) {
                    od.push(a);
                    var c = 1;
                    A()[a.Wb + 13 >>> 0] = c;
                    c = 0;
                    A()[a.Wb + 12 >>> 0] = c;
                    pd++
                }
                U = b;
                throw U;
            };

            function cb(a, b, c) {
                a >>>= 0;
                var d = new qd(a);
                b >>>= 0;
                c >>>= 0;
                F()[d.Wb + 16 >>> 2 >>> 0] = 0;
                F()[d.Wb + 4 >>> 2 >>> 0] = b;
                F()[d.Wb + 8 >>> 2 >>> 0] = c;
                U = a;
                pd++;
                throw U;
            }

            function wd(a, b, c, d) {
                return n ? S(2, 1, a, b, c, d) : db(a, b, c, d)
            }

            function db(a, b, c, d) {
                a >>>= 0;
                b >>>= 0;
                c >>>= 0;
                d >>>= 0;
                if ("undefined" == typeof SharedArrayBuffer) return 6;
                var e = [];
                if (n && 0 === e.length) return wd(a, b, c, d);
                a = {ic: c, Xb: a, ac: d, dc: e};
                return n ? (a.Yb = "spawnThread", postMessage(a, e), 0) : ad(a)
            }

            var xd = "undefined" != typeof TextDecoder ? new TextDecoder : void 0, yd = (a, b = 0, c = NaN) => {
                b >>>= 0;
                var d = b + c;
                for (c = b; a[c] && !(c >= d);) ++c;
                if (16 < c - b && a.buffer && xd) return xd.decode(a.buffer instanceof ArrayBuffer ? a.subarray(b, c) : a.slice(b, c));
                for (d = ""; b < c;) {
                    var e = a[b++];
                    if (e & 128) {
                        var f = a[b++] & 63;
                        if (192 == (e & 224)) d += String.fromCharCode((e & 31) << 6 | f); else {
                            var g = a[b++] & 63;
                            e = 224 == (e & 240) ? (e & 15) << 12 | f << 6 | g : (e & 7) << 18 | f << 12 | g << 6 | a[b++] & 63;
                            65536 > e ? d += String.fromCharCode(e) : (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 |
                                e & 1023))
                        }
                    } else d += String.fromCharCode(e)
                }
                return d
            }, Uc = (a, b) => (a >>>= 0) ? yd(D(), a, b) : "";

            function fb(a, b, c) {
                return n ? S(3, 1, a, b, c) : 0
            }

            function gb(a, b) {
                if (n) return S(4, 1, a, b)
            }

            var X = (a, b, c) => {
                var d = D();
                b >>>= 0;
                if (0 < c) {
                    var e = b;
                    c = b + c - 1;
                    for (var f = 0; f < a.length; ++f) {
                        var g = a.charCodeAt(f);
                        if (55296 <= g && 57343 >= g) {
                            var k = a.charCodeAt(++f);
                            g = 65536 + ((g & 1023) << 10) | k & 1023
                        }
                        if (127 >= g) {
                            if (b >= c) break;
                            d[b++ >>> 0] = g
                        } else {
                            if (2047 >= g) {
                                if (b + 1 >= c) break;
                                d[b++ >>> 0] = 192 | g >> 6
                            } else {
                                if (65535 >= g) {
                                    if (b + 2 >= c) break;
                                    d[b++ >>> 0] = 224 | g >> 12
                                } else {
                                    if (b + 3 >= c) break;
                                    d[b++ >>> 0] = 240 | g >> 18;
                                    d[b++ >>> 0] = 128 | g >> 12 & 63
                                }
                                d[b++ >>> 0] = 128 | g >> 6 & 63
                            }
                            d[b++ >>> 0] = 128 | g & 63
                        }
                    }
                    d[b >>> 0] = 0;
                    a = b - e
                } else a = 0;
                return a
            };

            function hb(a, b) {
                if (n) return S(5, 1, a, b)
            }

            function ib(a, b, c) {
                if (n) return S(6, 1, a, b, c)
            }

            function jb(a, b, c) {
                return n ? S(7, 1, a, b, c) : 0
            }

            function kb(a, b) {
                if (n) return S(8, 1, a, b)
            }

            function lb(a, b, c) {
                if (n) return S(9, 1, a, b, c)
            }

            function mb(a, b, c, d) {
                if (n) return S(10, 1, a, b, c, d)
            }

            function nb(a, b, c, d) {
                if (n) return S(11, 1, a, b, c, d)
            }

            function ob(a, b, c, d) {
                if (n) return S(12, 1, a, b, c, d)
            }

            function pb(a) {
                if (n) return S(13, 1, a)
            }

            function qb(a, b) {
                if (n) return S(14, 1, a, b)
            }

            function rb(a, b, c) {
                if (n) return S(15, 1, a, b, c)
            }

            var sb = () => K("");

            function tb(a) {
                Ia(a >>> 0, !l, 1, !ea, 131072, !1);
                Ja()
            }

            var zd = a => {
                if (!ta) try {
                    if (a(), !(0 < P)) try {
                        n ? nd(u) : Vb(u)
                    } catch (b) {
                        b instanceof Wc || "unwind" == b || ja(1, b)
                    }
                } catch (b) {
                    b instanceof Wc || "unwind" == b || ja(1, b)
                }
            };

            function Ka(a) {
                a >>>= 0;
                "function" === typeof Atomics.mc && (Atomics.mc(E(), a >>> 2, a).value.then(Ma), a += 128, Atomics.store(E(), a >>> 2, 1))
            }

            var Ma = () => {
                var a = Fa();
                a && (Ka(a), zd(Ad))
            };

            function ub(a, b) {
                a >>>= 0;
                a == b >>> 0 ? setTimeout(Ma) : n ? postMessage({
                    $b: a,
                    Yb: "checkMailbox"
                }) : (a = O[a]) && a.postMessage({Yb: "checkMailbox"})
            }

            var Bd = [];

            function vb(a, b, c, d, e) {
                b >>>= 0;
                d /= 2;
                Bd.length = d;
                c = e >>> 0 >>> 3;
                for (e = 0; e < d; e++) Bd[e] = y[c + 2 * e] ? y[c + 2 * e + 1] : G()[c + 2 * e + 1 >>> 0];
                return (b ? Vc[b] : Cd[a])(...Bd)
            }

            var wb = () => {
                P = 0
            };

            function xb(a) {
                a >>>= 0;
                n ? postMessage({Yb: "cleanupThread", kc: a}) : jd(O[a])
            }

            function yb(a) {
                m && O[a >>> 0].ref()
            }

            function zb(a, b) {
                a = -9007199254740992 > a || 9007199254740992 < a ? NaN : Number(a);
                b >>>= 0;
                a = new Date(1E3 * a);
                E()[b >>> 2 >>> 0] = a.getUTCSeconds();
                E()[b + 4 >>> 2 >>> 0] = a.getUTCMinutes();
                E()[b + 8 >>> 2 >>> 0] = a.getUTCHours();
                E()[b + 12 >>> 2 >>> 0] = a.getUTCDate();
                E()[b + 16 >>> 2 >>> 0] = a.getUTCMonth();
                E()[b + 20 >>> 2 >>> 0] = a.getUTCFullYear() - 1900;
                E()[b + 24 >>> 2 >>> 0] = a.getUTCDay();
                a = (a.getTime() - Date.UTC(a.getUTCFullYear(), 0, 1, 0, 0, 0, 0)) / 864E5 | 0;
                E()[b + 28 >>> 2 >>> 0] = a
            }

            var Dd = a => 0 === a % 4 && (0 !== a % 100 || 0 === a % 400),
                Ed = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335],
                Fd = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

            function Ab(a, b) {
                a = -9007199254740992 > a || 9007199254740992 < a ? NaN : Number(a);
                b >>>= 0;
                a = new Date(1E3 * a);
                E()[b >>> 2 >>> 0] = a.getSeconds();
                E()[b + 4 >>> 2 >>> 0] = a.getMinutes();
                E()[b + 8 >>> 2 >>> 0] = a.getHours();
                E()[b + 12 >>> 2 >>> 0] = a.getDate();
                E()[b + 16 >>> 2 >>> 0] = a.getMonth();
                E()[b + 20 >>> 2 >>> 0] = a.getFullYear() - 1900;
                E()[b + 24 >>> 2 >>> 0] = a.getDay();
                var c = (Dd(a.getFullYear()) ? Ed : Fd)[a.getMonth()] + a.getDate() - 1 | 0;
                E()[b + 28 >>> 2 >>> 0] = c;
                E()[b + 36 >>> 2 >>> 0] = -(60 * a.getTimezoneOffset());
                c = (new Date(a.getFullYear(), 6, 1)).getTimezoneOffset();
                var d = (new Date(a.getFullYear(), 0, 1)).getTimezoneOffset();
                a = (c != d && a.getTimezoneOffset() == Math.min(d, c)) | 0;
                E()[b + 32 >>> 2 >>> 0] = a
            }

            function Bb(a) {
                a >>>= 0;
                var b = new Date(E()[a + 20 >>> 2 >>> 0] + 1900, E()[a + 16 >>> 2 >>> 0], E()[a + 12 >>> 2 >>> 0], E()[a + 8 >>> 2 >>> 0], E()[a + 4 >>> 2 >>> 0], E()[a >>> 2 >>> 0], 0),
                    c = E()[a + 32 >>> 2 >>> 0], d = b.getTimezoneOffset(),
                    e = (new Date(b.getFullYear(), 6, 1)).getTimezoneOffset(),
                    f = (new Date(b.getFullYear(), 0, 1)).getTimezoneOffset(), g = Math.min(f, e);
                0 > c ? E()[a + 32 >>> 2 >>> 0] = Number(e != f && g == d) : 0 < c != (g == d) && (e = Math.max(f, e), b.setTime(b.getTime() + 6E4 * ((0 < c ? g : e) - d)));
                E()[a + 24 >>> 2 >>> 0] = b.getDay();
                c = (Dd(b.getFullYear()) ? Ed : Fd)[b.getMonth()] +
                    b.getDate() - 1 | 0;
                E()[a + 28 >>> 2 >>> 0] = c;
                E()[a >>> 2 >>> 0] = b.getSeconds();
                E()[a + 4 >>> 2 >>> 0] = b.getMinutes();
                E()[a + 8 >>> 2 >>> 0] = b.getHours();
                E()[a + 12 >>> 2 >>> 0] = b.getDate();
                E()[a + 16 >>> 2 >>> 0] = b.getMonth();
                E()[a + 20 >>> 2 >>> 0] = b.getYear();
                a = b.getTime();
                return BigInt(isNaN(a) ? -1 : a / 1E3)
            }

            function Cb(a, b, c, d, e, f, g) {
                return n ? S(16, 1, a, b, c, d, e, f, g) : -52
            }

            function Db(a, b, c, d, e, f) {
                if (n) return S(17, 1, a, b, c, d, e, f)
            }

            var Y = {}, Nb = () => performance.timeOrigin + performance.now();

            function Eb(a, b) {
                if (n) return S(18, 1, a, b);
                Y[a] && (clearTimeout(Y[a].id), delete Y[a]);
                if (!b) return 0;
                var c = setTimeout(() => {
                    delete Y[a];
                    zd(() => Gd(a, performance.timeOrigin + performance.now()))
                }, b);
                Y[a] = {id: c, rc: b};
                return 0
            }

            function Fb(a, b, c, d) {
                a >>>= 0;
                b >>>= 0;
                c >>>= 0;
                d >>>= 0;
                var e = (new Date).getFullYear(), f = (new Date(e, 0, 1)).getTimezoneOffset();
                e = (new Date(e, 6, 1)).getTimezoneOffset();
                var g = Math.max(f, e);
                F()[a >>> 2 >>> 0] = 60 * g;
                E()[b >>> 2 >>> 0] = Number(f != e);
                b = k => {
                    var p = Math.abs(k);
                    return `UTC${0 <= k ? "-" : "+"}${String(Math.floor(p / 60)).padStart(2, "0")}${String(p % 60).padStart(2, "0")}`
                };
                a = b(f);
                b = b(e);
                e < f ? (X(a, c, 17), X(b, d, 17)) : (X(a, d, 17), X(b, c, 17))
            }

            var Jb = () => Date.now(), Hd = 1;

            function Gb(a, b, c) {
                if (!(0 <= a && 3 >= a)) return 28;
                if (0 === a) a = Date.now(); else if (Hd) a = performance.timeOrigin + performance.now(); else return 52;
                y[c >>> 0 >>> 3] = BigInt(Math.round(1E6 * a));
                return 0
            }

            var Id = [];

            function Hb(a, b, c) {
                a >>>= 0;
                b >>>= 0;
                c >>>= 0;
                Id.length = 0;
                for (var d; d = D()[b++ >>> 0];) {
                    var e = 105 != d;
                    e &= 112 != d;
                    c += e && c % 8 ? 4 : 0;
                    Id.push(112 == d ? F()[c >>> 2 >>> 0] : 106 == d ? y[c >>> 3] : 105 == d ? E()[c >>> 2 >>> 0] : G()[c >>> 3 >>> 0]);
                    c += e ? 8 : 4
                }
                return Vc[a](...Id)
            }

            var Ib = () => {
            };

            function Kb(a, b) {
                return r(Uc(a >>> 0, b >>> 0))
            }

            var Lb = () => {
                P += 1;
                throw "unwind";
            };

            function Mb() {
                return 4294901760
            }

            var Ob = () => m ? require("os").cpus().length : navigator.hardwareConcurrency;

            function Pb() {
                K("Cannot use emscripten_pc_get_function without -sUSE_OFFSET_CONVERTER");
                return 0
            }

            function Qb(a) {
                a >>>= 0;
                var b = D().length;
                if (a <= b || 4294901760 < a) return !1;
                for (var c = 1; 4 >= c; c *= 2) {
                    var d = b * (1 + .2 / c);
                    d = Math.min(d, a + 100663296);
                    a:{
                        d = (Math.min(4294901760, 65536 * Math.ceil(Math.max(a, d) / 65536)) - t.buffer.byteLength + 65535) / 65536 | 0;
                        try {
                            t.grow(d);
                            B();
                            var e = 1;
                            break a
                        } catch (f) {
                        }
                        e = void 0
                    }
                    if (e) return !0
                }
                return !1
            }

            var Jd = () => {
                K("Cannot use convertFrameToPC (needed by __builtin_return_address) without -sUSE_OFFSET_CONVERTER");
                return 0
            }, Z = {}, Kd = a => {
                a.forEach(b => {
                    var c = Jd();
                    c && (Z[c] = b)
                })
            };

            function Rb() {
                var a = Error().stack.toString().split("\n");
                "Error" == a[0] && a.shift();
                Kd(a);
                Z.cc = Jd();
                Z.hc = a;
                return Z.cc
            }

            function Sb(a, b, c) {
                a >>>= 0;
                b >>>= 0;
                if (Z.cc == a) var d = Z.hc; else d = Error().stack.toString().split("\n"), "Error" == d[0] && d.shift(), Kd(d);
                for (var e = 3; d[e] && Jd() != a;) ++e;
                for (a = 0; a < c && d[a + e]; ++a) E()[b + 4 * a >>> 2 >>> 0] = Jd();
                return a
            }

            var Ld = {}, Nd = () => {
                if (!Md) {
                    var a = {
                        USER: "web_user",
                        LOGNAME: "web_user",
                        PATH: "/",
                        PWD: "/",
                        HOME: "/home/web_user",
                        LANG: ("object" == typeof navigator && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8",
                        _: ia || "./this.program"
                    }, b;
                    for (b in Ld) void 0 === Ld[b] ? delete a[b] : a[b] = Ld[b];
                    var c = [];
                    for (b in a) c.push(`${b}=${a[b]}`);
                    Md = c
                }
                return Md
            }, Md;

            function Tb(a, b) {
                if (n) return S(19, 1, a, b);
                a >>>= 0;
                b >>>= 0;
                var c = 0;
                Nd().forEach((d, e) => {
                    var f = b + c;
                    e = F()[a + 4 * e >>> 2 >>> 0] = f;
                    for (f = 0; f < d.length; ++f) A()[e++ >>> 0] = d.charCodeAt(f);
                    A()[e >>> 0] = 0;
                    c += d.length + 1
                });
                return 0
            }

            function Ub(a, b) {
                if (n) return S(20, 1, a, b);
                a >>>= 0;
                b >>>= 0;
                var c = Nd();
                F()[a >>> 2 >>> 0] = c.length;
                var d = 0;
                c.forEach(e => d += e.length + 1);
                F()[b >>> 2 >>> 0] = d;
                return 0
            }

            function Wb(a) {
                return n ? S(21, 1, a) : 52
            }

            function Xb(a, b, c, d) {
                return n ? S(22, 1, a, b, c, d) : 52
            }

            function Yb(a, b, c, d) {
                return n ? S(23, 1, a, b, c, d) : 70
            }

            var Od = [null, [], []];

            function Zb(a, b, c, d) {
                if (n) return S(24, 1, a, b, c, d);
                b >>>= 0;
                c >>>= 0;
                d >>>= 0;
                for (var e = 0, f = 0; f < c; f++) {
                    var g = F()[b >>> 2 >>> 0], k = F()[b + 4 >>> 2 >>> 0];
                    b += 8;
                    for (var p = 0; p < k; p++) {
                        var v = D()[g + p >>> 0], x = Od[a];
                        0 === v || 10 === v ? ((1 === a ? qa : r)(yd(x)), x.length = 0) : x.push(v)
                    }
                    e += k
                }
                F()[d >>> 2 >>> 0] = e;
                return 0
            }

            function Sc(a) {
                return a >>> 0
            }

            n || fd();
            var Cd = [Tc, dd, wd, fb, gb, hb, ib, jb, kb, lb, mb, nb, ob, pb, qb, rb, Cb, Db, Eb, Tb, Ub, Wb, Xb, Yb, Zb],
                Va, H;
            (async function () {
                function a(d, e) {
                    H = d.exports;
                    H = Pd();
                    ed.push(H.Eb);
                    md = H.Cb;
                    sa = e;
                    Pa();
                    return H
                }

                I++;
                var b = Ua();
                if (h.instantiateWasm) return new Promise(d => {
                    h.instantiateWasm(b, (e, f) => {
                        a(e, f);
                        d(e.exports)
                    })
                });
                if (n) return new Promise(d => {
                    Ca = e => {
                        var f = new WebAssembly.Instance(e, Ua());
                        d(a(f, e))
                    }
                });
                Qa ??= h.locateFile ? h.locateFile ? h.locateFile("ort-wasm-simd-threaded.wasm", q) : q + "ort-wasm-simd-threaded.wasm" : (new URL("ort-wasm-simd-threaded.wasm", import.meta.url)).href;
                try {
                    var c = await Ta(b);
                    return a(c.instance,
                        c.module)
                } catch (d) {
                    return ca(d), Promise.reject(d)
                }
            })();
            h._OrtInit = (a, b) => (h._OrtInit = H.$a)(a, b);
            h._OrtGetLastError = (a, b) => (h._OrtGetLastError = H.ab)(a, b);
            h._OrtCreateSessionOptions = (a, b, c, d, e, f, g, k, p, v) => (h._OrtCreateSessionOptions = H.bb)(a, b, c, d, e, f, g, k, p, v);
            h._OrtAppendExecutionProvider = (a, b) => (h._OrtAppendExecutionProvider = H.cb)(a, b);
            h._OrtAddFreeDimensionOverride = (a, b, c) => (h._OrtAddFreeDimensionOverride = H.db)(a, b, c);
            h._OrtAddSessionConfigEntry = (a, b, c) => (h._OrtAddSessionConfigEntry = H.eb)(a, b, c);
            h._OrtReleaseSessionOptions = a => (h._OrtReleaseSessionOptions = H.fb)(a);
            h._OrtCreateSession = (a, b, c) => (h._OrtCreateSession = H.gb)(a, b, c);
            h._OrtReleaseSession = a => (h._OrtReleaseSession = H.hb)(a);
            h._OrtGetInputOutputCount = (a, b, c) => (h._OrtGetInputOutputCount = H.ib)(a, b, c);
            h._OrtGetInputName = (a, b) => (h._OrtGetInputName = H.jb)(a, b);
            h._OrtGetOutputName = (a, b) => (h._OrtGetOutputName = H.kb)(a, b);
            h._OrtFree = a => (h._OrtFree = H.lb)(a);
            h._OrtCreateTensor = (a, b, c, d, e, f) => (h._OrtCreateTensor = H.mb)(a, b, c, d, e, f);
            h._OrtGetTensorData = (a, b, c, d, e) => (h._OrtGetTensorData = H.nb)(a, b, c, d, e);
            h._OrtReleaseTensor = a => (h._OrtReleaseTensor = H.ob)(a);
            h._OrtCreateRunOptions = (a, b, c, d) => (h._OrtCreateRunOptions = H.pb)(a, b, c, d);
            h._OrtAddRunConfigEntry = (a, b, c) => (h._OrtAddRunConfigEntry = H.qb)(a, b, c);
            h._OrtReleaseRunOptions = a => (h._OrtReleaseRunOptions = H.rb)(a);
            h._OrtCreateBinding = a => (h._OrtCreateBinding = H.sb)(a);
            h._OrtBindInput = (a, b, c) => (h._OrtBindInput = H.tb)(a, b, c);
            h._OrtBindOutput = (a, b, c, d) => (h._OrtBindOutput = H.ub)(a, b, c, d);
            h._OrtClearBoundOutputs = a => (h._OrtClearBoundOutputs = H.vb)(a);
            h._OrtReleaseBinding = a => (h._OrtReleaseBinding = H.wb)(a);
            h._OrtRunWithBinding = (a, b, c, d, e) => (h._OrtRunWithBinding = H.xb)(a, b, c, d, e);
            h._OrtRun = (a, b, c, d, e, f, g, k) => (h._OrtRun = H.yb)(a, b, c, d, e, f, g, k);
            h._OrtEndProfiling = a => (h._OrtEndProfiling = H.zb)(a);
            var Fa = () => (Fa = H.Ab)();
            h._free = a => (h._free = H.Bb)(a);
            h._malloc = a => (h._malloc = H.Db)(a);
            var Ia = (a, b, c, d, e, f) => (Ia = H.Fb)(a, b, c, d, e, f), Na = () => (Na = H.Gb)(),
                cd = (a, b, c, d, e) => (cd = H.Hb)(a, b, c, d, e), hd = a => (hd = H.Ib)(a), nd = a => (nd = H.Jb)(a),
                Gd = (a, b) => (Gd = H.Kb)(a, b), Ad = () => (Ad = H.Lb)(), V = (a, b) => (V = H.Mb)(a, b),
                W = a => (W = H.Nb)(a), kd = (a, b) => (kd = H.Ob)(a, b), R = a => (R = H.Pb)(a),
                bd = a => (bd = H.Qb)(a), Q = () => (Q = H.Rb)(), td = a => (td = H.Sb)(a), rd = a => (rd = H.Tb)(a),
                ud = (a, b, c) => (ud = H.Ub)(a, b, c), sd = a => (sd = H.Vb)(a);

            function Bc(a, b, c) {
                var d = Q();
                try {
                    T(a)(b, c)
                } catch (e) {
                    R(d);
                    if (e !== e + 0) throw e;
                    V(1, 0)
                }
            }

            function hc(a, b, c) {
                var d = Q();
                try {
                    return T(a)(b, c)
                } catch (e) {
                    R(d);
                    if (e !== e + 0) throw e;
                    V(1, 0)
                }
            }

            function zc(a, b) {
                var c = Q();
                try {
                    T(a)(b)
                } catch (d) {
                    R(c);
                    if (d !== d + 0) throw d;
                    V(1, 0)
                }
            }

            function gc(a, b) {
                var c = Q();
                try {
                    return T(a)(b)
                } catch (d) {
                    R(c);
                    if (d !== d + 0) throw d;
                    V(1, 0)
                }
            }

            function jc(a, b, c, d) {
                var e = Q();
                try {
                    return T(a)(b, c, d)
                } catch (f) {
                    R(e);
                    if (f !== f + 0) throw f;
                    V(1, 0)
                }
            }

            function Fc(a, b, c, d, e) {
                var f = Q();
                try {
                    T(a)(b, c, d, e)
                } catch (g) {
                    R(f);
                    if (g !== g + 0) throw g;
                    V(1, 0)
                }
            }

            function kc(a, b, c, d, e) {
                var f = Q();
                try {
                    return T(a)(b, c, d, e)
                } catch (g) {
                    R(f);
                    if (g !== g + 0) throw g;
                    V(1, 0)
                }
            }

            function Cc(a, b, c, d) {
                var e = Q();
                try {
                    T(a)(b, c, d)
                } catch (f) {
                    R(e);
                    if (f !== f + 0) throw f;
                    V(1, 0)
                }
            }

            function mc(a, b, c, d, e, f, g) {
                var k = Q();
                try {
                    return T(a)(b, c, d, e, f, g)
                } catch (p) {
                    R(k);
                    if (p !== p + 0) throw p;
                    V(1, 0)
                }
            }

            function yc(a) {
                var b = Q();
                try {
                    T(a)()
                } catch (c) {
                    R(b);
                    if (c !== c + 0) throw c;
                    V(1, 0)
                }
            }

            function uc(a, b, c) {
                var d = Q();
                try {
                    return T(a)(b, c)
                } catch (e) {
                    R(d);
                    if (e !== e + 0) throw e;
                    V(1, 0)
                }
            }

            function Gc(a, b, c, d, e, f) {
                var g = Q();
                try {
                    T(a)(b, c, d, e, f)
                } catch (k) {
                    R(g);
                    if (k !== k + 0) throw k;
                    V(1, 0)
                }
            }

            function Qc(a, b, c) {
                var d = Q();
                try {
                    T(a)(b, c)
                } catch (e) {
                    R(d);
                    if (e !== e + 0) throw e;
                    V(1, 0)
                }
            }

            function Hc(a, b, c, d, e, f, g) {
                var k = Q();
                try {
                    T(a)(b, c, d, e, f, g)
                } catch (p) {
                    R(k);
                    if (p !== p + 0) throw p;
                    V(1, 0)
                }
            }

            function Ic(a, b, c, d, e, f, g, k) {
                var p = Q();
                try {
                    T(a)(b, c, d, e, f, g, k)
                } catch (v) {
                    R(p);
                    if (v !== v + 0) throw v;
                    V(1, 0)
                }
            }

            function lc(a, b, c, d, e, f) {
                var g = Q();
                try {
                    return T(a)(b, c, d, e, f)
                } catch (k) {
                    R(g);
                    if (k !== k + 0) throw k;
                    V(1, 0)
                }
            }

            function nc(a, b, c, d, e, f, g, k) {
                var p = Q();
                try {
                    return T(a)(b, c, d, e, f, g, k)
                } catch (v) {
                    R(p);
                    if (v !== v + 0) throw v;
                    V(1, 0)
                }
            }

            function Kc(a, b, c, d, e, f, g, k, p, v) {
                var x = Q();
                try {
                    T(a)(b, c, d, e, f, g, k, p, v)
                } catch (z) {
                    R(x);
                    if (z !== z + 0) throw z;
                    V(1, 0)
                }
            }

            function Jc(a, b, c, d, e, f, g, k, p) {
                var v = Q();
                try {
                    T(a)(b, c, d, e, f, g, k, p)
                } catch (x) {
                    R(v);
                    if (x !== x + 0) throw x;
                    V(1, 0)
                }
            }

            function fc(a) {
                var b = Q();
                try {
                    return T(a)()
                } catch (c) {
                    R(b);
                    if (c !== c + 0) throw c;
                    V(1, 0)
                }
            }

            function oc(a, b, c, d, e, f, g, k, p, v) {
                var x = Q();
                try {
                    return T(a)(b, c, d, e, f, g, k, p, v)
                } catch (z) {
                    R(x);
                    if (z !== z + 0) throw z;
                    V(1, 0)
                }
            }

            function cc(a, b, c) {
                var d = Q();
                try {
                    return T(a)(b, c)
                } catch (e) {
                    R(d);
                    if (e !== e + 0) throw e;
                    V(1, 0)
                }
            }

            function wc(a, b, c, d) {
                var e = Q();
                try {
                    return T(a)(b, c, d)
                } catch (f) {
                    R(e);
                    if (f !== f + 0) throw f;
                    V(1, 0);
                    return 0n
                }
            }

            function $b(a, b, c) {
                var d = Q();
                try {
                    return T(a)(b, c)
                } catch (e) {
                    R(d);
                    if (e !== e + 0) throw e;
                    V(1, 0)
                }
            }

            function Mc(a, b, c, d, e, f, g, k, p, v, x, z) {
                var C = Q();
                try {
                    T(a)(b, c, d, e, f, g, k, p, v, x, z)
                } catch (N) {
                    R(C);
                    if (N !== N + 0) throw N;
                    V(1, 0)
                }
            }

            function Lc(a, b, c, d, e, f, g, k, p, v, x) {
                var z = Q();
                try {
                    T(a)(b, c, d, e, f, g, k, p, v, x)
                } catch (C) {
                    R(z);
                    if (C !== C + 0) throw C;
                    V(1, 0)
                }
            }

            function pc(a, b, c, d, e, f, g, k, p, v, x) {
                var z = Q();
                try {
                    return T(a)(b, c, d, e, f, g, k, p, v, x)
                } catch (C) {
                    R(z);
                    if (C !== C + 0) throw C;
                    V(1, 0)
                }
            }

            function ic(a, b, c, d) {
                var e = Q();
                try {
                    return T(a)(b, c, d)
                } catch (f) {
                    R(e);
                    if (f !== f + 0) throw f;
                    V(1, 0)
                }
            }

            function tc(a, b, c, d) {
                var e = Q();
                try {
                    return T(a)(b, c, d)
                } catch (f) {
                    R(e);
                    if (f !== f + 0) throw f;
                    V(1, 0)
                }
            }

            function dc(a, b, c, d) {
                var e = Q();
                try {
                    return T(a)(b, c, d)
                } catch (f) {
                    R(e);
                    if (f !== f + 0) throw f;
                    V(1, 0)
                }
            }

            function Oc(a, b, c, d, e, f, g, k, p, v, x, z, C, N) {
                var aa = Q();
                try {
                    T(a)(b, c, d, e, f, g, k, p, v, x, z, C, N)
                } catch (Ha) {
                    R(aa);
                    if (Ha !== Ha + 0) throw Ha;
                    V(1, 0)
                }
            }

            function Rc(a, b, c, d, e) {
                var f = Q();
                try {
                    T(a)(b, c, d, e)
                } catch (g) {
                    R(f);
                    if (g !== g + 0) throw g;
                    V(1, 0)
                }
            }

            function Ac(a, b, c) {
                var d = Q();
                try {
                    T(a)(b, c)
                } catch (e) {
                    R(d);
                    if (e !== e + 0) throw e;
                    V(1, 0)
                }
            }

            function vc(a, b) {
                var c = Q();
                try {
                    return T(a)(b)
                } catch (d) {
                    R(c);
                    if (d !== d + 0) throw d;
                    V(1, 0);
                    return 0n
                }
            }

            function rc(a, b, c, d, e) {
                var f = Q();
                try {
                    return T(a)(b, c, d, e)
                } catch (g) {
                    R(f);
                    if (g !== g + 0) throw g;
                    V(1, 0)
                }
            }

            function Nc(a, b, c, d, e, f, g, k, p, v, x, z, C) {
                var N = Q();
                try {
                    T(a)(b, c, d, e, f, g, k, p, v, x, z, C)
                } catch (aa) {
                    R(N);
                    if (aa !== aa + 0) throw aa;
                    V(1, 0)
                }
            }

            function ac(a, b, c, d) {
                var e = Q();
                try {
                    return T(a)(b, c, d)
                } catch (f) {
                    R(e);
                    if (f !== f + 0) throw f;
                    V(1, 0)
                }
            }

            function xc(a, b, c, d, e) {
                var f = Q();
                try {
                    return T(a)(b, c, d, e)
                } catch (g) {
                    R(f);
                    if (g !== g + 0) throw g;
                    V(1, 0);
                    return 0n
                }
            }

            function Pc(a, b, c, d, e) {
                var f = Q();
                try {
                    T(a)(b, c, d, e)
                } catch (g) {
                    R(f);
                    if (g !== g + 0) throw g;
                    V(1, 0)
                }
            }

            function ec(a, b, c, d, e) {
                var f = Q();
                try {
                    return T(a)(b, c, d, e)
                } catch (g) {
                    R(f);
                    if (g !== g + 0) throw g;
                    V(1, 0)
                }
            }

            function Ec(a, b, c, d, e) {
                var f = Q();
                try {
                    T(a)(b, c, d, e)
                } catch (g) {
                    R(f);
                    if (g !== g + 0) throw g;
                    V(1, 0)
                }
            }

            function bc(a, b, c, d, e) {
                var f = Q();
                try {
                    return T(a)(b, c, d, e)
                } catch (g) {
                    R(f);
                    if (g !== g + 0) throw g;
                    V(1, 0)
                }
            }

            function Dc(a, b, c, d, e) {
                var f = Q();
                try {
                    T(a)(b, c, d, e)
                } catch (g) {
                    R(f);
                    if (g !== g + 0) throw g;
                    V(1, 0)
                }
            }

            function sc(a, b, c, d, e, f, g) {
                var k = Q();
                try {
                    return T(a)(b, c, d, e, f, g)
                } catch (p) {
                    R(k);
                    if (p !== p + 0) throw p;
                    V(1, 0)
                }
            }

            function qc(a, b, c, d, e, f, g) {
                var k = Q();
                try {
                    return T(a)(b, c, d, e, f, g)
                } catch (p) {
                    R(k);
                    if (p !== p + 0) throw p;
                    V(1, 0)
                }
            }

            function Pd() {
                var a = H;
                a = Object.assign({}, a);
                var b = d => () => d() >>> 0, c = d => e => d(e) >>> 0;
                a.Ab = b(a.Ab);
                a.Db = c(a.Db);
                a.Qb = c(a.Qb);
                a.Rb = b(a.Rb);
                a.Vb = c(a.Vb);
                return a
            }

            h.stackSave = () => Q();
            h.stackRestore = a => R(a);
            h.stackAlloc = a => bd(a);
            h.setValue = function (a, b, c = "i8") {
                c.endsWith("*") && (c = "*");
                switch (c) {
                    case "i1":
                        A()[a >>> 0] = b;
                        break;
                    case "i8":
                        A()[a >>> 0] = b;
                        break;
                    case "i16":
                        Aa()[a >>> 1 >>> 0] = b;
                        break;
                    case "i32":
                        E()[a >>> 2 >>> 0] = b;
                        break;
                    case "i64":
                        y[a >>> 3] = BigInt(b);
                        break;
                    case "float":
                        Ba()[a >>> 2 >>> 0] = b;
                        break;
                    case "double":
                        G()[a >>> 3 >>> 0] = b;
                        break;
                    case "*":
                        F()[a >>> 2 >>> 0] = b;
                        break;
                    default:
                        K(`invalid type for setValue: ${c}`)
                }
            };
            h.getValue = function (a, b = "i8") {
                b.endsWith("*") && (b = "*");
                switch (b) {
                    case "i1":
                        return A()[a >>> 0];
                    case "i8":
                        return A()[a >>> 0];
                    case "i16":
                        return Aa()[a >>> 1 >>> 0];
                    case "i32":
                        return E()[a >>> 2 >>> 0];
                    case "i64":
                        return y[a >>> 3];
                    case "float":
                        return Ba()[a >>> 2 >>> 0];
                    case "double":
                        return G()[a >>> 3 >>> 0];
                    case "*":
                        return F()[a >>> 2 >>> 0];
                    default:
                        K(`invalid type for getValue: ${b}`)
                }
            };
            h.UTF8ToString = Uc;
            h.stringToUTF8 = X;
            h.lengthBytesUTF8 = a => {
                for (var b = 0, c = 0; c < a.length; ++c) {
                    var d = a.charCodeAt(c);
                    127 >= d ? b++ : 2047 >= d ? b += 2 : 55296 <= d && 57343 >= d ? (b += 4, ++c) : b += 3
                }
                return b
            };

            function Qd() {
                if (0 < I) J = Qd; else if (n) ba(h), Oa(); else {
                    for (; 0 < Yc.length;) Yc.shift()(h);
                    0 < I ? J = Qd : (h.calledRun = !0, ta || (Oa(), ba(h)))
                }
            }

            Qd();
            "use strict";
            h.PTR_SIZE = 4;
            moduleRtn = da;


            return moduleRtn;
        }
    );
})();
export default ortWasmThreaded;
var isPthread = globalThis.self?.name?.startsWith('em-pthread');
var isNode = typeof globalThis.process?.versions?.node == 'string';
if (isNode) isPthread = (await import('worker_threads')).workerData === 'em-pthread';

// When running as a pthread, construct a new instance on startup
isPthread && ortWasmThreaded();
