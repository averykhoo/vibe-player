var ortWasmThreaded = (() => {
    var _scriptName = import.meta.url;

    return (
        async function (moduleArg = {}) {
            var moduleRtn;

            var f = moduleArg, aa, ba, ca = new Promise((a, b) => {
                    aa = a;
                    ba = b
                }), da = "object" == typeof window, ea = "undefined" != typeof WorkerGlobalScope,
                m = "object" == typeof process && "object" == typeof process.versions && "string" == typeof process.versions.node && "renderer" != process.type,
                n = ea && self.name?.startsWith("em-pthread");
            if (m) {
                const {createRequire: a} = await import("module");
                var require = a(import.meta.url), fa = require("worker_threads");
                global.Worker = fa.Worker;
                n = (ea = !fa.je) && "em-pthread" == fa.workerData
            }
            "use strict";
            f.mountExternalData = (a, b) => {
                a.startsWith("./") && (a = a.substring(2));
                (f.Bd || (f.Bd = new Map)).set(a, b)
            };
            f.unmountExternalData = () => {
                delete f.Bd
            };
            var SharedArrayBuffer = globalThis.SharedArrayBuffer ?? (new WebAssembly.Memory({
                initial: 0,
                maximum: 0,
                shared: !0
            })).buffer.constructor;
            "use strict";
            let ia = () => {
                const a = (c, d, e) => (...g) => {
                    const h = t, k = d?.();
                    g = c(...g);
                    const l = d?.();
                    k !== l && (c = l, e(k), d = e = null);
                    return t != h ? ha() : g
                }, b = c => async (...d) => {
                    try {
                        if (f.Cd) throw Error("Session already started");
                        const e = f.Cd = {be: d[0], errors: []}, g = await c(...d);
                        if (f.Cd !== e) throw Error("Session mismatch");
                        f.Dd?.flush();
                        const h = e.errors;
                        if (0 < h.length) {
                            let k = await Promise.all(h);
                            k = k.filter(l => l);
                            if (0 < k.length) throw Error(k.join("\n"));
                        }
                        return g
                    } finally {
                        f.Cd = null
                    }
                };
                f._OrtCreateSession = a(f._OrtCreateSession, () => f._OrtCreateSession,
                    c => f._OrtCreateSession = c);
                f._OrtRun = b(a(f._OrtRun, () => f._OrtRun, c => f._OrtRun = c));
                f._OrtRunWithBinding = b(a(f._OrtRunWithBinding, () => f._OrtRunWithBinding, c => f._OrtRunWithBinding = c));
                f._OrtBindInput = a(f._OrtBindInput, () => f._OrtBindInput, c => f._OrtBindInput = c);
                ia = void 0
            };
            f.jsepInit = (a, b) => {
                ia?.();
                if ("webgpu" === a) {
                    [f.Dd, f.Rd, f.Vd, f.Hd, f.Ud, f.hc, f.Wd, f.Zd, f.Sd, f.Td, f.Xd] = b;
                    const c = f.Dd;
                    f.jsepRegisterBuffer = (d, e, g, h) => c.registerBuffer(d, e, g, h);
                    f.jsepGetBuffer = d => c.getBuffer(d);
                    f.jsepCreateDownloader = (d, e, g) => c.createDownloader(d, e, g);
                    f.jsepOnCreateSession = d => {
                        c.onCreateSession(d)
                    };
                    f.jsepOnReleaseSession = d => {
                        c.onReleaseSession(d)
                    };
                    f.jsepOnRunStart = d => c.onRunStart(d);
                    f.$d = (d, e) => {
                        c.upload(d, e)
                    }
                } else if ("webnn" === a) {
                    [f.Dd, f.Yd, f.Id, f.jsepEnsureTensor, f.Jd, f.jsepDownloadTensor] =
                        b;
                    f.jsepReleaseTensorId = f.Id;
                    f.jsepUploadTensor = f.Jd;
                    const c = f.Dd;
                    f.jsepOnRunStart = d => c.onRunStart(d);
                    f.jsepOnRunEnd = c.onRunEnd.bind(c);
                    f.jsepRegisterMLContext = (d, e) => {
                        c.registerMLContext(d, e)
                    };
                    f.jsepOnReleaseSession = d => {
                        c.onReleaseSession(d)
                    };
                    f.jsepCreateMLTensorDownloader = (d, e) => c.createMLTensorDownloader(d, e);
                    f.jsepRegisterMLTensor = (d, e, g, h) => c.registerMLTensor(d, e, g, h);
                    f.jsepCreateMLContext = d => c.createMLContext(d);
                    f.jsepRegisterMLConstant = (d, e, g, h, k) => c.registerMLConstant(d, e, g, h, k, f.Bd);
                    f.jsepRegisterGraphInput =
                        c.registerGraphInput.bind(c);
                    f.jsepIsGraphInput = c.isGraphInput.bind(c);
                    f.jsepCreateTemporaryTensor = c.createTemporaryTensor.bind(c)
                }
            };
            var ja = Object.assign({}, f), ka = "./this.program", ma = (a, b) => {
                throw b;
            }, u = "", na, oa;
            if (m) {
                var fs = require("fs"), pa = require("path");
                import.meta.url.startsWith("data:") || (u = pa.dirname(require("url").fileURLToPath(import.meta.url)) + "/");
                oa = a => {
                    a = qa(a) ? new URL(a) : a;
                    return fs.readFileSync(a)
                };
                na = async a => {
                    a = qa(a) ? new URL(a) : a;
                    return fs.readFileSync(a, void 0)
                };
                !f.thisProgram && 1 < process.argv.length && (ka = process.argv[1].replace(/\\/g, "/"));
                process.argv.slice(2);
                ma = (a, b) => {
                    process.exitCode = a;
                    throw b;
                }
            } else if (da || ea) ea ? u = self.location.href : "undefined" != typeof document &&
                document.currentScript && (u = document.currentScript.src), _scriptName && (u = _scriptName), u.startsWith("blob:") ? u = "" : u = u.slice(0, u.replace(/[?#].*/, "").lastIndexOf("/") + 1), m || (ea && (oa = a => {
                var b = new XMLHttpRequest;
                b.open("GET", a, !1);
                b.responseType = "arraybuffer";
                b.send(null);
                return new Uint8Array(b.response)
            }), na = async a => {
                if (qa(a)) return new Promise((c, d) => {
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
            var ra = console.log.bind(console), sa = console.error.bind(console);
            m && (ra = (...a) => fs.writeSync(1, a.join(" ") + "\n"), sa = (...a) => fs.writeSync(2, a.join(" ") + "\n"));
            var ta = ra, v = sa;
            Object.assign(f, ja);
            ja = null;
            var ua = f.wasmBinary, x, va, wa = !1, xa, y, ya, za, Aa, Ba, Ca, Da, A, Ea, Fa,
                qa = a => a.startsWith("file://");

            function B() {
                x.buffer != y.buffer && C();
                return y
            }

            function D() {
                x.buffer != y.buffer && C();
                return ya
            }

            function Ga() {
                x.buffer != y.buffer && C();
                return za
            }

            function Ha() {
                x.buffer != y.buffer && C();
                return Aa
            }

            function E() {
                x.buffer != y.buffer && C();
                return Ba
            }

            function F() {
                x.buffer != y.buffer && C();
                return Ca
            }

            function Ia() {
                x.buffer != y.buffer && C();
                return Da
            }

            function Ja() {
                x.buffer != y.buffer && C();
                return Fa
            }

            if (n) {
                var Ka;
                if (m) {
                    var La = fa.parentPort;
                    La.on("message", b => onmessage({data: b}));
                    Object.assign(globalThis, {self: global, postMessage: b => La.postMessage(b)})
                }
                var Ma = !1;
                v = function (...b) {
                    b = b.join(" ");
                    m ? fs.writeSync(2, b + "\n") : console.error(b)
                };
                self.alert = function (...b) {
                    postMessage({yd: "alert", text: b.join(" "), fe: Na()})
                };
                self.onunhandledrejection = b => {
                    throw b.reason || b;
                };

                function a(b) {
                    try {
                        var c = b.data, d = c.yd;
                        if ("load" === d) {
                            let e = [];
                            self.onmessage = g => e.push(g);
                            self.startWorker = () => {
                                postMessage({yd: "loaded"});
                                for (let g of e) a(g);
                                self.onmessage = a
                            };
                            for (const g of c.Od) if (!f[g] || f[g].proxy) f[g] = (...h) => {
                                postMessage({yd: "callHandler", Nd: g, args: h})
                            }, "print" == g && (ta = f[g]), "printErr" == g && (v = f[g]);
                            x = c.he;
                            C();
                            Ka(c.ie)
                        } else if ("run" === d) {
                            Oa(c.xd);
                            Pa(c.xd, 0, 0, 1, 0, 0);
                            Qa();
                            Ra(c.xd);
                            Ma || (Sa(), Ma = !0);
                            try {
                                Ta(c.de, c.Fd)
                            } catch (e) {
                                if ("unwind" != e) throw e;
                            }
                        } else "setimmediate" !== c.target && ("checkMailbox" === d ? Ma && Ua() : d && (v(`worker: received unknown command ${d}`), v(c)))
                    } catch (e) {
                        throw Va(), e;
                    }
                }

                self.onmessage = a
            }

            function C() {
                var a = x.buffer;
                f.HEAP8 = y = new Int8Array(a);
                f.HEAP16 = za = new Int16Array(a);
                f.HEAPU8 = ya = new Uint8Array(a);
                f.HEAPU16 = Aa = new Uint16Array(a);
                f.HEAP32 = Ba = new Int32Array(a);
                f.HEAPU32 = Ca = new Uint32Array(a);
                f.HEAPF32 = Da = new Float32Array(a);
                f.HEAPF64 = Fa = new Float64Array(a);
                f.HEAP64 = A = new BigInt64Array(a);
                f.HEAPU64 = Ea = new BigUint64Array(a)
            }

            n || (x = new WebAssembly.Memory({initial: 256, maximum: 65536, shared: !0}), C());

            function Wa() {
                n ? startWorker(f) : G.Bb()
            }

            var Xa = 0, Ya = null;

            function Za() {
                Xa--;
                if (0 == Xa && Ya) {
                    var a = Ya;
                    Ya = null;
                    a()
                }
            }

            function H(a) {
                a = "Aborted(" + a + ")";
                v(a);
                wa = !0;
                a = new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info.");
                ba(a);
                throw a;
            }

            var $a;

            async function ab(a) {
                if (!ua) try {
                    var b = await na(a);
                    return new Uint8Array(b)
                } catch {
                }
                if (a == $a && ua) a = new Uint8Array(ua); else if (oa) a = oa(a); else throw "both async and sync fetching of the wasm failed";
                return a
            }

            async function bb(a, b) {
                try {
                    var c = await ab(a);
                    return await WebAssembly.instantiate(c, b)
                } catch (d) {
                    v(`failed to asynchronously prepare wasm: ${d}`), H(d)
                }
            }

            async function cb(a) {
                var b = $a;
                if (!ua && "function" == typeof WebAssembly.instantiateStreaming && !qa(b) && !m) try {
                    var c = fetch(b, {credentials: "same-origin"});
                    return await WebAssembly.instantiateStreaming(c, a)
                } catch (d) {
                    v(`wasm streaming compile failed: ${d}`), v("falling back to ArrayBuffer instantiation")
                }
                return bb(b, a)
            }

            function db() {
                eb = {
                    Ta: fb,
                    Va: gb,
                    W: hb,
                    la: ib,
                    b: jb,
                    u: kb,
                    R: lb,
                    Za: mb,
                    d: nb,
                    pb: ob,
                    g: pb,
                    T: qb,
                    Ga: rb,
                    lb: sb,
                    nb: tb,
                    Ha: ub,
                    Ea: vb,
                    wb,
                    Da: xb,
                    pa: yb,
                    mb: zb,
                    jb: Ab,
                    Fa: Bb,
                    kb: Cb,
                    Ma: Db,
                    za: Eb,
                    eb: Fb,
                    cb: Gb,
                    ya: Hb,
                    V: Ib,
                    N: Jb,
                    db: Kb,
                    ma: Lb,
                    fb: Mb,
                    zb: Nb,
                    hb: Ob,
                    qb: Pb,
                    ab: Qb,
                    Aa: Rb,
                    yb: Ra,
                    Ja: Sb,
                    S: Tb,
                    Wa: Ub,
                    $: Vb,
                    G: Wb,
                    E: Xb,
                    m: Yb,
                    H: Zb,
                    B: $b,
                    X: ac,
                    J: bc,
                    v: cc,
                    O: dc,
                    D: ec,
                    t: fc,
                    A: gc,
                    z: hc,
                    w: ic,
                    r: jc,
                    tb: kc,
                    ub: lc,
                    vb: mc,
                    rb: nc,
                    sb: oc,
                    bb: pc,
                    Oa: qc,
                    La: rc,
                    y: sc,
                    ja: tc,
                    Ba: uc,
                    Ka: vc,
                    qa: wc,
                    Ia: xc,
                    ib: yc,
                    U: zc,
                    fa: Ac,
                    Sa: Bc,
                    gb: Cc,
                    Qa: Dc,
                    Pa: Ec,
                    Ab: Fc,
                    Ca: Gc,
                    ob: Hc,
                    aa: Ic,
                    oa: Jc,
                    xb: Kc,
                    na: Lc,
                    $a: Mc,
                    ia: Nc,
                    sa: Oc,
                    ga: Pc,
                    da: Qc,
                    ua: Rc,
                    p: Sc,
                    e: Tc,
                    c: Uc,
                    ea: Vc,
                    f: Wc,
                    n: Xc,
                    k: Yc,
                    Y: Zc,
                    ka: $c,
                    j: ad,
                    wa: bd,
                    Ra: cd,
                    ca: dd,
                    Ua: ed,
                    P: fd,
                    K: gd,
                    _: hd,
                    Q: jd,
                    Z: kd,
                    x: ld,
                    l: md,
                    va: nd,
                    i: od,
                    h: pd,
                    ra: qd,
                    ta: rd,
                    o: sd,
                    q: td,
                    s: ud,
                    I: vd,
                    C: wd,
                    L: xd,
                    xa: yd,
                    _a: zd,
                    F: Ad,
                    Ya: Bd,
                    ba: Cd,
                    M: Dd,
                    Xa: Ed,
                    ha: Fd,
                    a: x,
                    Na: Gd
                };
                return {a: eb}
            }

            var Hd = {
                1319426: () => "undefined" !== typeof wasmOffsetConverter, 1319483: (a, b, c, d, e) => {
                    if ("undefined" == typeof f || !f.Bd) return 1;
                    a = I(Number(a >>> 0));
                    a.startsWith("./") && (a = a.substring(2));
                    a = f.Bd.get(a);
                    if (!a) return 2;
                    b = Number(b >>> 0);
                    c = Number(c >>> 0);
                    d = Number(d >>> 0);
                    if (b + c > a.byteLength) return 3;
                    try {
                        const g = a.subarray(b, b + c);
                        switch (e) {
                            case 0:
                                D().set(g, d >>> 0);
                                break;
                            case 1:
                                f.$d(d, g);
                                break;
                            default:
                                return 4
                        }
                        return 0
                    } catch {
                        return 4
                    }
                }, 1320198: (a, b, c) => {
                    f.Jd(a, D().subarray(b >>> 0, b + c >>> 0))
                }, 1320261: () => f.Yd(), 1320302: a => {
                    f.Id(a)
                }, 1320338: () => {
                    f.Sd()
                }, 1320369: () => {
                    f.Td()
                }, 1320398: () => {
                    f.Xd()
                }, 1320423: a => f.Rd(a), 1320456: a => f.Vd(a), 1320488: (a, b, c) => {
                    f.Hd(Number(a), Number(b), Number(c), !0)
                }, 1320551: (a, b, c) => {
                    f.Hd(Number(a), Number(b), Number(c))
                }, 1320608: a => {
                    f.hc("Abs", a, void 0)
                }, 1320659: a => {
                    f.hc("Neg", a, void 0)
                }, 1320710: a => {
                    f.hc("Floor", a, void 0)
                }, 1320763: a => {
                    f.hc("Ceil", a, void 0)
                }, 1320815: a => {
                    f.hc("Reciprocal", a, void 0)
                }, 1320873: a => {
                    f.hc("Sqrt", a, void 0)
                }, 1320925: a => {
                    f.hc("Exp", a, void 0)
                }, 1320976: a => {
                    f.hc("Erf", a, void 0)
                },
                1321027: a => {
                    f.hc("Sigmoid", a, void 0)
                }, 1321082: (a, b, c) => {
                    f.hc("HardSigmoid", a, {alpha: b, beta: c})
                }, 1321161: a => {
                    f.hc("Log", a, void 0)
                }, 1321212: a => {
                    f.hc("Sin", a, void 0)
                }, 1321263: a => {
                    f.hc("Cos", a, void 0)
                }, 1321314: a => {
                    f.hc("Tan", a, void 0)
                }, 1321365: a => {
                    f.hc("Asin", a, void 0)
                }, 1321417: a => {
                    f.hc("Acos", a, void 0)
                }, 1321469: a => {
                    f.hc("Atan", a, void 0)
                }, 1321521: a => {
                    f.hc("Sinh", a, void 0)
                }, 1321573: a => {
                    f.hc("Cosh", a, void 0)
                }, 1321625: a => {
                    f.hc("Asinh", a, void 0)
                }, 1321678: a => {
                    f.hc("Acosh", a, void 0)
                }, 1321731: a => {
                    f.hc("Atanh",
                        a, void 0)
                }, 1321784: a => {
                    f.hc("Tanh", a, void 0)
                }, 1321836: a => {
                    f.hc("Not", a, void 0)
                }, 1321887: (a, b, c) => {
                    f.hc("Clip", a, {min: b, max: c})
                }, 1321956: a => {
                    f.hc("Clip", a, void 0)
                }, 1322008: (a, b) => {
                    f.hc("Elu", a, {alpha: b})
                }, 1322066: a => {
                    f.hc("Gelu", a, void 0)
                }, 1322118: a => {
                    f.hc("Relu", a, void 0)
                }, 1322170: (a, b) => {
                    f.hc("LeakyRelu", a, {alpha: b})
                }, 1322234: (a, b) => {
                    f.hc("ThresholdedRelu", a, {alpha: b})
                }, 1322304: (a, b) => {
                    f.hc("Cast", a, {to: b})
                }, 1322362: a => {
                    f.hc("Add", a, void 0)
                }, 1322413: a => {
                    f.hc("Sub", a, void 0)
                }, 1322464: a => {
                    f.hc("Mul",
                        a, void 0)
                }, 1322515: a => {
                    f.hc("Div", a, void 0)
                }, 1322566: a => {
                    f.hc("Pow", a, void 0)
                }, 1322617: a => {
                    f.hc("Equal", a, void 0)
                }, 1322670: a => {
                    f.hc("Greater", a, void 0)
                }, 1322725: a => {
                    f.hc("GreaterOrEqual", a, void 0)
                }, 1322787: a => {
                    f.hc("Less", a, void 0)
                }, 1322839: a => {
                    f.hc("LessOrEqual", a, void 0)
                }, 1322898: (a, b, c, d, e) => {
                    f.hc("ReduceMean", a, {
                        keepDims: !!b,
                        noopWithEmptyAxes: !!c,
                        axes: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1323073: (a, b, c, d, e) => {
                    f.hc("ReduceMax", a, {
                        keepDims: !!b, noopWithEmptyAxes: !!c, axes: d ?
                            Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1323247: (a, b, c, d, e) => {
                    f.hc("ReduceMin", a, {
                        keepDims: !!b,
                        noopWithEmptyAxes: !!c,
                        axes: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1323421: (a, b, c, d, e) => {
                    f.hc("ReduceProd", a, {
                        keepDims: !!b,
                        noopWithEmptyAxes: !!c,
                        axes: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1323596: (a, b, c, d, e) => {
                    f.hc("ReduceSum", a, {
                        keepDims: !!b,
                        noopWithEmptyAxes: !!c,
                        axes: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1323770: (a,
                             b, c, d, e) => {
                    f.hc("ReduceL1", a, {
                        keepDims: !!b,
                        noopWithEmptyAxes: !!c,
                        axes: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1323943: (a, b, c, d, e) => {
                    f.hc("ReduceL2", a, {
                        keepDims: !!b,
                        noopWithEmptyAxes: !!c,
                        axes: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1324116: (a, b, c, d, e) => {
                    f.hc("ReduceLogSum", a, {
                        keepDims: !!b,
                        noopWithEmptyAxes: !!c,
                        axes: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1324293: (a, b, c, d, e) => {
                    f.hc("ReduceSumSquare", a, {
                        keepDims: !!b, noopWithEmptyAxes: !!c,
                        axes: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1324473: (a, b, c, d, e) => {
                    f.hc("ReduceLogSumExp", a, {
                        keepDims: !!b,
                        noopWithEmptyAxes: !!c,
                        axes: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1324653: a => {
                    f.hc("Where", a, void 0)
                }, 1324706: (a, b, c) => {
                    f.hc("Transpose", a, {perm: b ? Array.from(E().subarray(Number(b) >>> 0, Number(c) >>> 0)) : []})
                }, 1324830: (a, b, c, d) => {
                    f.hc("DepthToSpace", a, {blocksize: b, mode: I(c), format: d ? "NHWC" : "NCHW"})
                }, 1324963: (a, b, c, d) => {
                    f.hc("DepthToSpace", a, {
                        blocksize: b,
                        mode: I(c), format: d ? "NHWC" : "NCHW"
                    })
                }, 1325096: (a, b, c, d, e, g, h, k, l, p, q, r, w, z, J) => {
                    f.hc("ConvTranspose", a, {
                        format: l ? "NHWC" : "NCHW",
                        autoPad: b,
                        dilations: [c],
                        group: d,
                        kernelShape: [e],
                        pads: [g, h],
                        strides: [k],
                        wIsConst: () => !!B()[p >>> 0],
                        outputPadding: q ? Array.from(E().subarray(Number(q) >>> 0, Number(r) >>> 0)) : [],
                        outputShape: w ? Array.from(E().subarray(Number(w) >>> 0, Number(z) >>> 0)) : [],
                        activation: I(J)
                    })
                }, 1325529: (a, b, c, d, e, g, h, k, l, p, q, r, w, z) => {
                    f.hc("ConvTranspose", a, {
                        format: k ? "NHWC" : "NCHW",
                        autoPad: b,
                        dilations: Array.from(E().subarray(Number(c) >>>
                            0, (Number(c) >>> 0) + 2 >>> 0)),
                        group: d,
                        kernelShape: Array.from(E().subarray(Number(e) >>> 0, (Number(e) >>> 0) + 2 >>> 0)),
                        pads: Array.from(E().subarray(Number(g) >>> 0, (Number(g) >>> 0) + 4 >>> 0)),
                        strides: Array.from(E().subarray(Number(h) >>> 0, (Number(h) >>> 0) + 2 >>> 0)),
                        wIsConst: () => !!B()[l >>> 0],
                        outputPadding: p ? Array.from(E().subarray(Number(p) >>> 0, Number(q) >>> 0)) : [],
                        outputShape: r ? Array.from(E().subarray(Number(r) >>> 0, Number(w) >>> 0)) : [],
                        activation: I(z)
                    })
                }, 1326190: (a, b, c, d, e, g, h, k, l, p, q, r, w, z, J) => {
                    f.hc("ConvTranspose", a, {
                        format: l ?
                            "NHWC" : "NCHW",
                        autoPad: b,
                        dilations: [c],
                        group: d,
                        kernelShape: [e],
                        pads: [g, h],
                        strides: [k],
                        wIsConst: () => !!B()[p >>> 0],
                        outputPadding: q ? Array.from(E().subarray(Number(q) >>> 0, Number(r) >>> 0)) : [],
                        outputShape: w ? Array.from(E().subarray(Number(w) >>> 0, Number(z) >>> 0)) : [],
                        activation: I(J)
                    })
                }, 1326623: (a, b, c, d, e, g, h, k, l, p, q, r, w, z) => {
                    f.hc("ConvTranspose", a, {
                        format: k ? "NHWC" : "NCHW",
                        autoPad: b,
                        dilations: Array.from(E().subarray(Number(c) >>> 0, (Number(c) >>> 0) + 2 >>> 0)),
                        group: d,
                        kernelShape: Array.from(E().subarray(Number(e) >>> 0,
                            (Number(e) >>> 0) + 2 >>> 0)),
                        pads: Array.from(E().subarray(Number(g) >>> 0, (Number(g) >>> 0) + 4 >>> 0)),
                        strides: Array.from(E().subarray(Number(h) >>> 0, (Number(h) >>> 0) + 2 >>> 0)),
                        wIsConst: () => !!B()[l >>> 0],
                        outputPadding: p ? Array.from(E().subarray(Number(p) >>> 0, Number(q) >>> 0)) : [],
                        outputShape: r ? Array.from(E().subarray(Number(r) >>> 0, Number(w) >>> 0)) : [],
                        activation: I(z)
                    })
                }, 1327284: (a, b) => {
                    f.hc("GlobalAveragePool", a, {format: b ? "NHWC" : "NCHW"})
                }, 1327375: (a, b, c, d, e, g, h, k, l, p, q, r, w, z) => {
                    f.hc("AveragePool", a, {
                        format: z ? "NHWC" : "NCHW",
                        auto_pad: b,
                        ceil_mode: c,
                        count_include_pad: d,
                        storage_order: e,
                        dilations: g ? Array.from(E().subarray(Number(g) >>> 0, Number(h) >>> 0)) : [],
                        kernel_shape: k ? Array.from(E().subarray(Number(k) >>> 0, Number(l) >>> 0)) : [],
                        pads: p ? Array.from(E().subarray(Number(p) >>> 0, Number(q) >>> 0)) : [],
                        strides: r ? Array.from(E().subarray(Number(r) >>> 0, Number(w) >>> 0)) : []
                    })
                }, 1327854: (a, b) => {
                    f.hc("GlobalAveragePool", a, {format: b ? "NHWC" : "NCHW"})
                }, 1327945: (a, b, c, d, e, g, h, k, l, p, q, r, w, z) => {
                    f.hc("AveragePool", a, {
                        format: z ? "NHWC" : "NCHW",
                        auto_pad: b,
                        ceil_mode: c,
                        count_include_pad: d,
                        storage_order: e,
                        dilations: g ? Array.from(E().subarray(Number(g) >>> 0, Number(h) >>> 0)) : [],
                        kernel_shape: k ? Array.from(E().subarray(Number(k) >>> 0, Number(l) >>> 0)) : [],
                        pads: p ? Array.from(E().subarray(Number(p) >>> 0, Number(q) >>> 0)) : [],
                        strides: r ? Array.from(E().subarray(Number(r) >>> 0, Number(w) >>> 0)) : []
                    })
                }, 1328424: (a, b) => {
                    f.hc("GlobalMaxPool", a, {format: b ? "NHWC" : "NCHW"})
                }, 1328511: (a, b, c, d, e, g, h, k, l, p, q, r, w, z) => {
                    f.hc("MaxPool", a, {
                        format: z ? "NHWC" : "NCHW",
                        auto_pad: b,
                        ceil_mode: c,
                        count_include_pad: d,
                        storage_order: e,
                        dilations: g ? Array.from(E().subarray(Number(g) >>> 0, Number(h) >>> 0)) : [],
                        kernel_shape: k ? Array.from(E().subarray(Number(k) >>> 0, Number(l) >>> 0)) : [],
                        pads: p ? Array.from(E().subarray(Number(p) >>> 0, Number(q) >>> 0)) : [],
                        strides: r ? Array.from(E().subarray(Number(r) >>> 0, Number(w) >>> 0)) : []
                    })
                }, 1328986: (a, b) => {
                    f.hc("GlobalMaxPool", a, {format: b ? "NHWC" : "NCHW"})
                }, 1329073: (a, b, c, d, e, g, h, k, l, p, q, r, w, z) => {
                    f.hc("MaxPool", a, {
                        format: z ? "NHWC" : "NCHW",
                        auto_pad: b,
                        ceil_mode: c,
                        count_include_pad: d,
                        storage_order: e,
                        dilations: g ?
                            Array.from(E().subarray(Number(g) >>> 0, Number(h) >>> 0)) : [],
                        kernel_shape: k ? Array.from(E().subarray(Number(k) >>> 0, Number(l) >>> 0)) : [],
                        pads: p ? Array.from(E().subarray(Number(p) >>> 0, Number(q) >>> 0)) : [],
                        strides: r ? Array.from(E().subarray(Number(r) >>> 0, Number(w) >>> 0)) : []
                    })
                }, 1329548: (a, b, c, d, e) => {
                    f.hc("Gemm", a, {alpha: b, beta: c, transA: d, transB: e})
                }, 1329652: a => {
                    f.hc("MatMul", a, void 0)
                }, 1329706: (a, b, c, d) => {
                    f.hc("ArgMax", a, {keepDims: !!b, selectLastIndex: !!c, axis: d})
                }, 1329814: (a, b, c, d) => {
                    f.hc("ArgMin", a, {
                        keepDims: !!b,
                        selectLastIndex: !!c, axis: d
                    })
                }, 1329922: (a, b) => {
                    f.hc("Softmax", a, {axis: b})
                }, 1329985: (a, b) => {
                    f.hc("Concat", a, {axis: b})
                }, 1330045: (a, b, c, d, e) => {
                    f.hc("Split", a, {
                        axis: b,
                        numOutputs: c,
                        splitSizes: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1330201: a => {
                    f.hc("Expand", a, void 0)
                }, 1330255: (a, b) => {
                    f.hc("Gather", a, {axis: Number(b)})
                }, 1330326: (a, b) => {
                    f.hc("GatherElements", a, {axis: Number(b)})
                }, 1330405: (a, b) => {
                    f.hc("GatherND", a, {batch_dims: Number(b)})
                }, 1330484: (a, b, c, d, e, g, h, k, l, p, q) => {
                    f.hc("Resize",
                        a, {
                            antialias: b,
                            axes: c ? Array.from(E().subarray(Number(c) >>> 0, Number(d) >>> 0)) : [],
                            coordinateTransformMode: I(e),
                            cubicCoeffA: g,
                            excludeOutside: h,
                            extrapolationValue: k,
                            keepAspectRatioPolicy: I(l),
                            mode: I(p),
                            nearestMode: I(q)
                        })
                }, 1330846: (a, b, c, d, e, g, h) => {
                    f.hc("Slice", a, {
                        starts: b ? Array.from(E().subarray(Number(b) >>> 0, Number(c) >>> 0)) : [],
                        ends: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : [],
                        axes: g ? Array.from(E().subarray(Number(g) >>> 0, Number(h) >>> 0)) : []
                    })
                }, 1331110: a => {
                    f.hc("Tile", a, void 0)
                }, 1331162: (a,
                             b, c) => {
                    f.hc("InstanceNormalization", a, {epsilon: b, format: c ? "NHWC" : "NCHW"})
                }, 1331276: (a, b, c) => {
                    f.hc("InstanceNormalization", a, {epsilon: b, format: c ? "NHWC" : "NCHW"})
                }, 1331390: a => {
                    f.hc("Range", a, void 0)
                }, 1331443: (a, b) => {
                    f.hc("Einsum", a, {equation: I(b)})
                }, 1331524: (a, b, c, d, e) => {
                    f.hc("Pad", a, {
                        mode: b,
                        value: c,
                        pads: d ? Array.from(E().subarray(Number(d) >>> 0, Number(e) >>> 0)) : []
                    })
                }, 1331667: (a, b, c, d, e, g) => {
                    f.hc("BatchNormalization", a, {
                        epsilon: b,
                        momentum: c,
                        spatial: !!e,
                        trainingMode: !!d,
                        format: g ? "NHWC" : "NCHW"
                    })
                }, 1331836: (a,
                             b, c, d, e, g) => {
                    f.hc("BatchNormalization", a, {
                        epsilon: b,
                        momentum: c,
                        spatial: !!e,
                        trainingMode: !!d,
                        format: g ? "NHWC" : "NCHW"
                    })
                }, 1332005: (a, b, c) => {
                    f.hc("CumSum", a, {exclusive: Number(b), reverse: Number(c)})
                }, 1332102: (a, b, c) => {
                    f.hc("DequantizeLinear", a, {axis: b, blockSize: c})
                }, 1332192: (a, b, c, d, e) => {
                    f.hc("GridSample", a, {
                        align_corners: b,
                        mode: I(c),
                        padding_mode: I(d),
                        format: e ? "NHWC" : "NCHW"
                    })
                }, 1332362: (a, b, c, d, e) => {
                    f.hc("GridSample", a, {
                        align_corners: b,
                        mode: I(c),
                        padding_mode: I(d),
                        format: e ? "NHWC" : "NCHW"
                    })
                }, 1332532: (a, b) => {
                    f.hc("ScatterND", a, {reduction: I(b)})
                }, 1332617: (a, b, c, d, e, g, h, k, l) => {
                    f.hc("Attention", a, {
                        numHeads: b,
                        isUnidirectional: c,
                        maskFilterValue: d,
                        scale: e,
                        doRotary: g,
                        qkvHiddenSizes: h ? Array.from(E().subarray(Number(k) >>> 0, Number(k) + h >>> 0)) : [],
                        pastPresentShareBuffer: !!l
                    })
                }, 1332889: a => {
                    f.hc("BiasAdd", a, void 0)
                }, 1332944: a => {
                    f.hc("BiasSplitGelu", a, void 0)
                }, 1333005: a => {
                    f.hc("FastGelu", a, void 0)
                }, 1333061: (a, b, c, d, e, g, h, k, l, p, q, r, w, z, J, la) => {
                    f.hc("Conv", a, {
                        format: r ? "NHWC" : "NCHW",
                        auto_pad: b,
                        dilations: c ? Array.from(E().subarray(Number(c) >>>
                            0, Number(d) >>> 0)) : [],
                        group: e,
                        kernel_shape: g ? Array.from(E().subarray(Number(g) >>> 0, Number(h) >>> 0)) : [],
                        pads: k ? Array.from(E().subarray(Number(k) >>> 0, Number(l) >>> 0)) : [],
                        strides: p ? Array.from(E().subarray(Number(p) >>> 0, Number(q) >>> 0)) : [],
                        w_is_const: () => !!B()[Number(w) >>> 0],
                        activation: I(z),
                        activation_params: J ? Array.from(Ia().subarray(Number(J) >>> 0, Number(la) >>> 0)) : []
                    })
                }, 1333645: a => {
                    f.hc("Gelu", a, void 0)
                }, 1333697: (a, b, c, d, e, g, h, k, l) => {
                    f.hc("GroupQueryAttention", a, {
                        numHeads: b, kvNumHeads: c, scale: d, softcap: e,
                        doRotary: g, rotaryInterleaved: h, smoothSoftmax: k, localWindowSize: l
                    })
                }, 1333914: (a, b, c, d) => {
                    f.hc("LayerNormalization", a, {axis: b, epsilon: c, simplified: !!d})
                }, 1334025: (a, b, c, d) => {
                    f.hc("LayerNormalization", a, {axis: b, epsilon: c, simplified: !!d})
                }, 1334136: (a, b, c, d, e, g) => {
                    f.hc("MatMulNBits", a, {k: b, n: c, accuracyLevel: d, bits: e, blockSize: g})
                }, 1334263: (a, b, c, d, e, g) => {
                    f.hc("MultiHeadAttention", a, {
                        numHeads: b,
                        isUnidirectional: c,
                        maskFilterValue: d,
                        scale: e,
                        doRotary: g
                    })
                }, 1334422: (a, b) => {
                    f.hc("QuickGelu", a, {alpha: b})
                }, 1334486: (a,
                             b, c, d, e) => {
                    f.hc("RotaryEmbedding", a, {interleaved: !!b, numHeads: c, rotaryEmbeddingDim: d, scale: e})
                }, 1334625: (a, b, c) => {
                    f.hc("SkipLayerNormalization", a, {epsilon: b, simplified: !!c})
                }, 1334727: (a, b, c) => {
                    f.hc("SkipLayerNormalization", a, {epsilon: b, simplified: !!c})
                }, 1334829: (a, b, c, d) => {
                    f.hc("GatherBlockQuantized", a, {gatherAxis: b, quantizeAxis: c, blockSize: d})
                }, 1334950: a => {
                    f.Wd(a)
                }, 1334984: (a, b) => f.Zd(Number(a), Number(b), f.Cd.be, f.Cd.errors)
            };

            function gb(a, b, c) {
                return Id(async () => {
                    await f.Ud(Number(a), Number(b), Number(c))
                })
            }

            function fb() {
                return "undefined" !== typeof wasmOffsetConverter
            }

            class Jd {
                name = "ExitStatus";

                constructor(a) {
                    this.message = `Program terminated with exit(${a})`;
                    this.status = a
                }
            }

            var Kd = a => {
                a.terminate();
                a.onmessage = () => {
                }
            }, Ld = [], Pd = a => {
                0 == K.length && (Md(), Nd(K[0]));
                var b = K.pop();
                if (!b) return 6;
                Od.push(b);
                L[a.xd] = b;
                b.xd = a.xd;
                var c = {yd: "run", de: a.ce, Fd: a.Fd, xd: a.xd};
                m && b.unref();
                b.postMessage(c, a.Ld);
                return 0
            }, M = 0, P = (a, b, ...c) => {
                for (var d = 2 * c.length, e = N(), g = Qd(8 * d), h = g >>> 3, k = 0; k < c.length; k++) {
                    var l = c[k];
                    "bigint" == typeof l ? (A[h + 2 * k] = 1n, A[h + 2 * k + 1] = l) : (A[h + 2 * k] = 0n, Ja()[h + 2 * k + 1 >>> 0] = l)
                }
                a = Rd(a, 0, d, g, b);
                O(e);
                return a
            };

            function Gd(a) {
                if (n) return P(0, 1, a);
                xa = a;
                if (!(0 < M)) {
                    for (var b of Od) Kd(b);
                    for (b of K) Kd(b);
                    K = [];
                    Od = [];
                    L = {};
                    wa = !0
                }
                ma(a, new Jd(a))
            }

            function Sd(a) {
                if (n) return P(1, 0, a);
                Hc(a)
            }

            var Hc = a => {
                xa = a;
                if (n) throw Sd(a), "unwind";
                Gd(a)
            }, K = [], Od = [], Td = [], L = {};

            function Ud() {
                for (var a = f.numThreads - 1; a--;) Md();
                Ld.unshift(() => {
                    Xa++;
                    Vd(() => Za())
                })
            }

            var Xd = a => {
                var b = a.xd;
                delete L[b];
                K.push(a);
                Od.splice(Od.indexOf(a), 1);
                a.xd = 0;
                Wd(b)
            };

            function Qa() {
                Td.forEach(a => a())
            }

            var Nd = a => new Promise(b => {
                a.onmessage = g => {
                    g = g.data;
                    var h = g.yd;
                    if (g.Ed && g.Ed != Na()) {
                        var k = L[g.Ed];
                        k ? k.postMessage(g, g.Ld) : v(`Internal error! Worker sent a message "${h}" to target pthread ${g.Ed}, but that thread no longer exists!`)
                    } else if ("checkMailbox" === h) Ua(); else if ("spawnThread" === h) Pd(g); else if ("cleanupThread" === h) Xd(L[g.ee]); else if ("loaded" === h) a.loaded = !0, m && !a.xd && a.unref(), b(a); else if ("alert" === h) alert(`Thread ${g.fe}: ${g.text}`); else if ("setimmediate" === g.target) a.postMessage(g); else if ("callHandler" ===
                        h) f[g.Nd](...g.args); else h && v(`worker sent an unknown command ${h}`)
                };
                a.onerror = g => {
                    v(`${"worker sent an error!"} ${g.filename}:${g.lineno}: ${g.message}`);
                    throw g;
                };
                m && (a.on("message", g => a.onmessage({data: g})), a.on("error", g => a.onerror(g)));
                var c = [], d = [], e;
                for (e of d) f.propertyIsEnumerable(e) && c.push(e);
                a.postMessage({yd: "load", Od: c, he: x, ie: va})
            });

            function Vd(a) {
                n ? a() : Promise.all(K.map(Nd)).then(a)
            }

            function Md() {
                var a = new Worker(new URL(import.meta.url), {
                    type: "module",
                    workerData: "em-pthread",
                    name: "em-pthread"
                });
                K.push(a)
            }

            var Oa = a => {
                C();
                var b = F()[a + 52 >>> 2 >>> 0];
                a = F()[a + 56 >>> 2 >>> 0];
                Yd(b, b - a);
                O(b)
            }, Ta = (a, b) => {
                M = 0;
                a = Zd(a, b);
                0 < M ? xa = a : $d(a)
            }, ae = [], be = 0;

            function hb(a) {
                a >>>= 0;
                var b = new ce(a);
                if (0 == B()[b.wd + 12 >>> 0]) {
                    var c = 1;
                    B()[b.wd + 12 >>> 0] = c;
                    be--
                }
                c = 0;
                B()[b.wd + 13 >>> 0] = c;
                ae.push(b);
                de(a);
                return ee(a)
            }

            var Q = 0, ib = () => {
                R(0, 0);
                var a = ae.pop();
                fe(a.Gd);
                Q = 0
            };

            class ce {
                constructor(a) {
                    this.Gd = a;
                    this.wd = a - 24
                }
            }

            function pb(a) {
                Q ||= a >>> 0;
                throw Q;
            }

            var ie = a => {
                var b = Q;
                if (!b) return ge(0), 0;
                var c = new ce(b);
                F()[c.wd + 16 >>> 2 >>> 0] = b;
                var d = F()[c.wd + 4 >>> 2 >>> 0];
                if (!d) return ge(0), b;
                for (var e of a) {
                    if (0 === e || e === d) break;
                    if (he(e, d, c.wd + 16)) return ge(e), b
                }
                ge(d);
                return b
            };

            function jb() {
                return ie([])
            }

            function kb(a) {
                return ie([a >>> 0])
            }

            function lb(a, b) {
                return ie([a >>> 0, b >>> 0])
            }

            var mb = () => {
                var a = ae.pop();
                a || H("no exception to throw");
                var b = a.Gd;
                if (0 == B()[a.wd + 13 >>> 0]) {
                    ae.push(a);
                    var c = 1;
                    B()[a.wd + 13 >>> 0] = c;
                    c = 0;
                    B()[a.wd + 12 >>> 0] = c;
                    be++
                }
                Q = b;
                throw Q;
            };

            function nb(a, b, c) {
                a >>>= 0;
                var d = new ce(a);
                b >>>= 0;
                c >>>= 0;
                F()[d.wd + 16 >>> 2 >>> 0] = 0;
                F()[d.wd + 4 >>> 2 >>> 0] = b;
                F()[d.wd + 8 >>> 2 >>> 0] = c;
                Q = a;
                be++;
                throw Q;
            }

            function je(a, b, c, d) {
                return n ? P(2, 1, a, b, c, d) : ob(a, b, c, d)
            }

            function ob(a, b, c, d) {
                a >>>= 0;
                b >>>= 0;
                c >>>= 0;
                d >>>= 0;
                if ("undefined" == typeof SharedArrayBuffer) return 6;
                var e = [];
                if (n && 0 === e.length) return je(a, b, c, d);
                a = {ce: c, xd: a, Fd: d, Ld: e};
                return n ? (a.yd = "spawnThread", postMessage(a, e), 0) : Pd(a)
            }

            var ke = "undefined" != typeof TextDecoder ? new TextDecoder : void 0, le = (a, b = 0, c = NaN) => {
                b >>>= 0;
                var d = b + c;
                for (c = b; a[c] && !(c >= d);) ++c;
                if (16 < c - b && a.buffer && ke) return ke.decode(a.buffer instanceof ArrayBuffer ? a.subarray(b, c) : a.slice(b, c));
                for (d = ""; b < c;) {
                    var e = a[b++];
                    if (e & 128) {
                        var g = a[b++] & 63;
                        if (192 == (e & 224)) d += String.fromCharCode((e & 31) << 6 | g); else {
                            var h = a[b++] & 63;
                            e = 224 == (e & 240) ? (e & 15) << 12 | g << 6 | h : (e & 7) << 18 | g << 12 | h << 6 | a[b++] & 63;
                            65536 > e ? d += String.fromCharCode(e) : (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 |
                                e & 1023))
                        }
                    } else d += String.fromCharCode(e)
                }
                return d
            }, I = (a, b) => (a >>>= 0) ? le(D(), a, b) : "";

            function qb(a, b, c) {
                return n ? P(3, 1, a, b, c) : 0
            }

            function rb(a, b) {
                if (n) return P(4, 1, a, b)
            }

            var me = a => {
                for (var b = 0, c = 0; c < a.length; ++c) {
                    var d = a.charCodeAt(c);
                    127 >= d ? b++ : 2047 >= d ? b += 2 : 55296 <= d && 57343 >= d ? (b += 4, ++c) : b += 3
                }
                return b
            }, ne = (a, b, c) => {
                var d = D();
                b >>>= 0;
                if (0 < c) {
                    var e = b;
                    c = b + c - 1;
                    for (var g = 0; g < a.length; ++g) {
                        var h = a.charCodeAt(g);
                        if (55296 <= h && 57343 >= h) {
                            var k = a.charCodeAt(++g);
                            h = 65536 + ((h & 1023) << 10) | k & 1023
                        }
                        if (127 >= h) {
                            if (b >= c) break;
                            d[b++ >>> 0] = h
                        } else {
                            if (2047 >= h) {
                                if (b + 1 >= c) break;
                                d[b++ >>> 0] = 192 | h >> 6
                            } else {
                                if (65535 >= h) {
                                    if (b + 2 >= c) break;
                                    d[b++ >>> 0] = 224 | h >> 12
                                } else {
                                    if (b + 3 >= c) break;
                                    d[b++ >>> 0] = 240 | h >> 18;
                                    d[b++ >>> 0] = 128 | h >> 12 & 63
                                }
                                d[b++ >>> 0] = 128 | h >> 6 & 63
                            }
                            d[b++ >>> 0] = 128 | h & 63
                        }
                    }
                    d[b >>> 0] = 0;
                    a = b - e
                } else a = 0;
                return a
            };

            function sb(a, b) {
                if (n) return P(5, 1, a, b)
            }

            function tb(a, b, c) {
                if (n) return P(6, 1, a, b, c)
            }

            function ub(a, b, c) {
                return n ? P(7, 1, a, b, c) : 0
            }

            function vb(a, b) {
                if (n) return P(8, 1, a, b)
            }

            function wb(a, b, c) {
                if (n) return P(9, 1, a, b, c)
            }

            function xb(a, b, c, d) {
                if (n) return P(10, 1, a, b, c, d)
            }

            function yb(a, b, c, d) {
                if (n) return P(11, 1, a, b, c, d)
            }

            function zb(a, b, c, d) {
                if (n) return P(12, 1, a, b, c, d)
            }

            function Ab(a) {
                if (n) return P(13, 1, a)
            }

            function Bb(a, b) {
                if (n) return P(14, 1, a, b)
            }

            function Cb(a, b, c) {
                if (n) return P(15, 1, a, b, c)
            }

            var Db = () => H(""), oe, S = a => {
                for (var b = ""; D()[a >>> 0];) b += oe[D()[a++ >>> 0]];
                return b
            }, pe = {}, qe = {}, re = {}, T;

            function se(a, b, c = {}) {
                var d = b.name;
                if (!a) throw new T(`type "${d}" must have a positive integer typeid pointer`);
                if (qe.hasOwnProperty(a)) {
                    if (c.Pd) return;
                    throw new T(`Cannot register type '${d}' twice`);
                }
                qe[a] = b;
                delete re[a];
                pe.hasOwnProperty(a) && (b = pe[a], delete pe[a], b.forEach(e => e()))
            }

            function U(a, b, c = {}) {
                return se(a, b, c)
            }

            var te = (a, b, c) => {
                switch (b) {
                    case 1:
                        return c ? d => B()[d >>> 0] : d => D()[d >>> 0];
                    case 2:
                        return c ? d => Ga()[d >>> 1 >>> 0] : d => Ha()[d >>> 1 >>> 0];
                    case 4:
                        return c ? d => E()[d >>> 2 >>> 0] : d => F()[d >>> 2 >>> 0];
                    case 8:
                        return c ? d => A[d >>> 3] : d => Ea[d >>> 3];
                    default:
                        throw new TypeError(`invalid integer width (${b}): ${a}`);
                }
            };

            function Eb(a, b, c) {
                a >>>= 0;
                c >>>= 0;
                b = S(b >>> 0);
                U(a, {
                    name: b, fromWireType: d => d, toWireType: function (d, e) {
                        if ("bigint" != typeof e && "number" != typeof e) throw null === e ? e = "null" : (d = typeof e, e = "object" === d || "array" === d || "function" === d ? e.toString() : "" + e), new TypeError(`Cannot convert "${e}" to ${this.name}`);
                        "number" == typeof e && (e = BigInt(e));
                        return e
                    }, zd: V, readValueFromPointer: te(b, c, -1 == b.indexOf("u")), Ad: null
                })
            }

            var V = 8;

            function Fb(a, b, c, d) {
                a >>>= 0;
                b = S(b >>> 0);
                U(a, {
                    name: b, fromWireType: function (e) {
                        return !!e
                    }, toWireType: function (e, g) {
                        return g ? c : d
                    }, zd: V, readValueFromPointer: function (e) {
                        return this.fromWireType(D()[e >>> 0])
                    }, Ad: null
                })
            }

            var ue = [], W = [];

            function Yb(a) {
                a >>>= 0;
                9 < a && 0 === --W[a + 1] && (W[a] = void 0, ue.push(a))
            }

            var X = a => {
                if (!a) throw new T("Cannot use deleted val. handle = " + a);
                return W[a]
            }, Y = a => {
                switch (a) {
                    case void 0:
                        return 2;
                    case null:
                        return 4;
                    case !0:
                        return 6;
                    case !1:
                        return 8;
                    default:
                        const b = ue.pop() || W.length;
                        W[b] = a;
                        W[b + 1] = 1;
                        return b
                }
            };

            function ve(a) {
                return this.fromWireType(F()[a >>> 2 >>> 0])
            }

            var we = {
                name: "emscripten::val", fromWireType: a => {
                    var b = X(a);
                    Yb(a);
                    return b
                }, toWireType: (a, b) => Y(b), zd: V, readValueFromPointer: ve, Ad: null
            };

            function Gb(a) {
                return U(a >>> 0, we)
            }

            var xe = (a, b) => {
                switch (b) {
                    case 4:
                        return function (c) {
                            return this.fromWireType(Ia()[c >>> 2 >>> 0])
                        };
                    case 8:
                        return function (c) {
                            return this.fromWireType(Ja()[c >>> 3 >>> 0])
                        };
                    default:
                        throw new TypeError(`invalid float width (${b}): ${a}`);
                }
            };

            function Hb(a, b, c) {
                a >>>= 0;
                c >>>= 0;
                b = S(b >>> 0);
                U(a, {
                    name: b,
                    fromWireType: d => d,
                    toWireType: (d, e) => e,
                    zd: V,
                    readValueFromPointer: xe(b, c),
                    Ad: null
                })
            }

            function Ib(a, b, c, d, e) {
                a >>>= 0;
                c >>>= 0;
                b = S(b >>> 0);
                -1 === e && (e = 4294967295);
                e = k => k;
                if (0 === d) {
                    var g = 32 - 8 * c;
                    e = k => k << g >>> g
                }
                var h = b.includes("unsigned") ? function (k, l) {
                    return l >>> 0
                } : function (k, l) {
                    return l
                };
                U(a, {
                    name: b,
                    fromWireType: e,
                    toWireType: h,
                    zd: V,
                    readValueFromPointer: te(b, c, 0 !== d),
                    Ad: null
                })
            }

            function Jb(a, b, c) {
                function d(g) {
                    var h = F()[g >>> 2 >>> 0];
                    g = F()[g + 4 >>> 2 >>> 0];
                    return new e(B().buffer, g, h)
                }

                a >>>= 0;
                var e = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array][b];
                c = S(c >>> 0);
                U(a, {name: c, fromWireType: d, zd: V, readValueFromPointer: d}, {Pd: !0})
            }

            function Kb(a, b) {
                a >>>= 0;
                b = S(b >>> 0);
                U(a, {
                    name: b, fromWireType: function (c) {
                        for (var d = F()[c >>> 2 >>> 0], e = c + 4, g, h = e, k = 0; k <= d; ++k) {
                            var l = e + k;
                            if (k == d || 0 == D()[l >>> 0]) h = I(h, l - h), void 0 === g ? g = h : (g += String.fromCharCode(0), g += h), h = l + 1
                        }
                        Z(c);
                        return g
                    }, toWireType: function (c, d) {
                        d instanceof ArrayBuffer && (d = new Uint8Array(d));
                        var e = "string" == typeof d;
                        if (!(e || d instanceof Uint8Array || d instanceof Uint8ClampedArray || d instanceof Int8Array)) throw new T("Cannot pass non-string to std::string");
                        var g = e ? me(d) : d.length;
                        var h =
                            ye(4 + g + 1), k = h + 4;
                        F()[h >>> 2 >>> 0] = g;
                        if (e) ne(d, k, g + 1); else if (e) for (e = 0; e < g; ++e) {
                            var l = d.charCodeAt(e);
                            if (255 < l) throw Z(h), new T("String has UTF-16 code units that do not fit in 8 bits");
                            D()[k + e >>> 0] = l
                        } else for (e = 0; e < g; ++e) D()[k + e >>> 0] = d[e];
                        null !== c && c.push(Z, h);
                        return h
                    }, zd: V, readValueFromPointer: ve, Ad(c) {
                        Z(c)
                    }
                })
            }

            var ze = "undefined" != typeof TextDecoder ? new TextDecoder("utf-16le") : void 0, Ae = (a, b) => {
                var c = a >> 1;
                for (var d = c + b / 2; !(c >= d) && Ha()[c >>> 0];) ++c;
                c <<= 1;
                if (32 < c - a && ze) return ze.decode(D().slice(a, c));
                c = "";
                for (d = 0; !(d >= b / 2); ++d) {
                    var e = Ga()[a + 2 * d >>> 1 >>> 0];
                    if (0 == e) break;
                    c += String.fromCharCode(e)
                }
                return c
            }, Be = (a, b, c) => {
                c ??= 2147483647;
                if (2 > c) return 0;
                c -= 2;
                var d = b;
                c = c < 2 * a.length ? c / 2 : a.length;
                for (var e = 0; e < c; ++e) {
                    var g = a.charCodeAt(e);
                    Ga()[b >>> 1 >>> 0] = g;
                    b += 2
                }
                Ga()[b >>> 1 >>> 0] = 0;
                return b - d
            }, Ce = a => 2 * a.length, De = (a, b) => {
                for (var c = 0, d = ""; !(c >= b / 4);) {
                    var e = E()[a + 4 * c >>> 2 >>> 0];
                    if (0 == e) break;
                    ++c;
                    65536 <= e ? (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 | e & 1023)) : d += String.fromCharCode(e)
                }
                return d
            }, Ee = (a, b, c) => {
                b >>>= 0;
                c ??= 2147483647;
                if (4 > c) return 0;
                var d = b;
                c = d + c - 4;
                for (var e = 0; e < a.length; ++e) {
                    var g = a.charCodeAt(e);
                    if (55296 <= g && 57343 >= g) {
                        var h = a.charCodeAt(++e);
                        g = 65536 + ((g & 1023) << 10) | h & 1023
                    }
                    E()[b >>> 2 >>> 0] = g;
                    b += 4;
                    if (b + 4 > c) break
                }
                E()[b >>> 2 >>> 0] = 0;
                return b - d
            }, Fe = a => {
                for (var b = 0, c = 0; c < a.length; ++c) {
                    var d = a.charCodeAt(c);
                    55296 <=
                    d && 57343 >= d && ++c;
                    b += 4
                }
                return b
            };

            function Lb(a, b, c) {
                a >>>= 0;
                b >>>= 0;
                c >>>= 0;
                c = S(c);
                if (2 === b) {
                    var d = Ae;
                    var e = Be;
                    var g = Ce;
                    var h = k => Ha()[k >>> 1 >>> 0]
                } else 4 === b && (d = De, e = Ee, g = Fe, h = k => F()[k >>> 2 >>> 0]);
                U(a, {
                    name: c, fromWireType: k => {
                        for (var l = F()[k >>> 2 >>> 0], p, q = k + 4, r = 0; r <= l; ++r) {
                            var w = k + 4 + r * b;
                            if (r == l || 0 == h(w)) q = d(q, w - q), void 0 === p ? p = q : (p += String.fromCharCode(0), p += q), q = w + b
                        }
                        Z(k);
                        return p
                    }, toWireType: (k, l) => {
                        if ("string" != typeof l) throw new T(`Cannot pass non-string to C++ string type ${c}`);
                        var p = g(l), q = ye(4 + p + b);
                        F()[q >>> 2 >>> 0] = p / b;
                        e(l, q + 4, p + b);
                        null !== k && k.push(Z, q);
                        return q
                    }, zd: V, readValueFromPointer: ve, Ad(k) {
                        Z(k)
                    }
                })
            }

            function Mb(a, b) {
                a >>>= 0;
                b = S(b >>> 0);
                U(a, {
                    Qd: !0, name: b, zd: 0, fromWireType: () => {
                    }, toWireType: () => {
                    }
                })
            }

            function Nb(a) {
                Pa(a >>> 0, !ea, 1, !da, 131072, !1);
                Qa()
            }

            var Ge = a => {
                if (!wa) try {
                    if (a(), !(0 < M)) try {
                        n ? $d(xa) : Hc(xa)
                    } catch (b) {
                        b instanceof Jd || "unwind" == b || ma(1, b)
                    }
                } catch (b) {
                    b instanceof Jd || "unwind" == b || ma(1, b)
                }
            };

            function Ra(a) {
                a >>>= 0;
                "function" === typeof Atomics.ge && (Atomics.ge(E(), a >>> 2, a).value.then(Ua), a += 128, Atomics.store(E(), a >>> 2, 1))
            }

            var Ua = () => {
                var a = Na();
                a && (Ra(a), Ge(He))
            };

            function Ob(a, b) {
                a >>>= 0;
                a == b >>> 0 ? setTimeout(Ua) : n ? postMessage({
                    Ed: a,
                    yd: "checkMailbox"
                }) : (a = L[a]) && a.postMessage({yd: "checkMailbox"})
            }

            var Ie = [];

            function Pb(a, b, c, d, e) {
                b >>>= 0;
                d /= 2;
                Ie.length = d;
                c = e >>> 0 >>> 3;
                for (e = 0; e < d; e++) Ie[e] = A[c + 2 * e] ? A[c + 2 * e + 1] : Ja()[c + 2 * e + 1 >>> 0];
                return (b ? Hd[b] : Je[a])(...Ie)
            }

            var Qb = () => {
                M = 0
            };

            function Rb(a) {
                a >>>= 0;
                n ? postMessage({yd: "cleanupThread", ee: a}) : Xd(L[a])
            }

            function Sb(a) {
                m && L[a >>> 0].ref()
            }

            var Le = (a, b) => {
                var c = qe[a];
                if (void 0 === c) throw a = Ke(a), c = S(a), Z(a), new T(`${b} has unknown type ${c}`);
                return c
            }, Me = (a, b, c) => {
                var d = [];
                a = a.toWireType(d, c);
                d.length && (F()[b >>> 2 >>> 0] = Y(d));
                return a
            };

            function Tb(a, b, c) {
                b >>>= 0;
                c >>>= 0;
                a = X(a >>> 0);
                b = Le(b, "emval::as");
                return Me(b, c, a)
            }

            function Ub(a, b) {
                b >>>= 0;
                a = X(a >>> 0);
                b = Le(b, "emval::as");
                return b.toWireType(null, a)
            }

            var Ne = a => {
                try {
                    a()
                } catch (b) {
                    H(b)
                }
            };

            function Oe() {
                var a = G, b = {};
                for (let [c, d] of Object.entries(a)) b[c] = "function" == typeof d ? (...e) => {
                    Pe.push(c);
                    try {
                        return d(...e)
                    } finally {
                        wa || (Pe.pop(), t && 1 === Qe && 0 === Pe.length && (Qe = 0, M += 1, Ne(Re), "undefined" != typeof Fibers && Fibers.le()))
                    }
                } : d;
                return b
            }

            var Qe = 0, t = null, Se = 0, Pe = [], Te = {}, Ue = {}, Ve = 0, We = null, Xe = [];

            function ha() {
                return new Promise((a, b) => {
                    We = {resolve: a, reject: b}
                })
            }

            function Ye() {
                var a = ye(65548), b = a + 12;
                F()[a >>> 2 >>> 0] = b;
                F()[a + 4 >>> 2 >>> 0] = b + 65536;
                b = Pe[0];
                var c = Te[b];
                void 0 === c && (c = Ve++, Te[b] = c, Ue[c] = b);
                b = c;
                E()[a + 8 >>> 2 >>> 0] = b;
                return a
            }

            function Ze() {
                var a = E()[t + 8 >>> 2 >>> 0];
                a = G[Ue[a]];
                --M;
                return a()
            }

            function $e(a) {
                if (!wa) {
                    if (0 === Qe) {
                        var b = !1, c = !1;
                        a((d = 0) => {
                            if (!wa && (Se = d, b = !0, c)) {
                                Qe = 2;
                                Ne(() => af(t));
                                "undefined" != typeof MainLoop && MainLoop.Md && MainLoop.resume();
                                d = !1;
                                try {
                                    var e = Ze()
                                } catch (k) {
                                    e = k, d = !0
                                }
                                var g = !1;
                                if (!t) {
                                    var h = We;
                                    h && (We = null, (d ? h.reject : h.resolve)(e), g = !0)
                                }
                                if (d && !g) throw e;
                            }
                        });
                        c = !0;
                        b || (Qe = 1, t = Ye(), "undefined" != typeof MainLoop && MainLoop.Md && MainLoop.pause(), Ne(() => bf(t)))
                    } else 2 === Qe ? (Qe = 0, Ne(cf), Z(t), t = null, Xe.forEach(Ge)) : H(`invalid state: ${Qe}`);
                    return Se
                }
            }

            function Id(a) {
                return $e(b => {
                    a().then(b)
                })
            }

            function Vb(a) {
                a >>>= 0;
                return Id(async () => {
                    var b = await X(a);
                    return Y(b)
                })
            }

            var df = [];

            function Wb(a, b, c, d) {
                c >>>= 0;
                d >>>= 0;
                a = df[a >>> 0];
                b = X(b >>> 0);
                return a(null, b, c, d)
            }

            var ef = {}, ff = a => {
                var b = ef[a];
                return void 0 === b ? S(a) : b
            };

            function Xb(a, b, c, d, e) {
                c >>>= 0;
                d >>>= 0;
                e >>>= 0;
                a = df[a >>> 0];
                b = X(b >>> 0);
                c = ff(c);
                return a(b, b[c], d, e)
            }

            var gf = () => "object" == typeof globalThis ? globalThis : Function("return this")();

            function Zb(a) {
                a >>>= 0;
                if (0 === a) return Y(gf());
                a = ff(a);
                return Y(gf()[a])
            }

            var hf = a => {
                var b = df.length;
                df.push(a);
                return b
            }, jf = (a, b) => {
                for (var c = Array(a), d = 0; d < a; ++d) c[d] = Le(F()[b + 4 * d >>> 2 >>> 0], "parameter " + d);
                return c
            }, kf = (a, b) => Object.defineProperty(b, "name", {value: a});

            function lf(a) {
                var b = Function;
                if (!(b instanceof Function)) throw new TypeError(`new_ called with constructor type ${typeof b} which is not a function`);
                var c = kf(b.name || "unknownFunctionName", function () {
                });
                c.prototype = b.prototype;
                c = new c;
                a = b.apply(c, a);
                return a instanceof Object ? a : c
            }

            function $b(a, b, c) {
                b = jf(a, b >>> 0);
                var d = b.shift();
                a--;
                var e = "return function (obj, func, destructorsRef, args) {\n", g = 0, h = [];
                0 === c && h.push("obj");
                for (var k = ["retType"], l = [d], p = 0; p < a; ++p) h.push("arg" + p), k.push("argType" + p), l.push(b[p]), e += `  var arg${p} = argType${p}.readValueFromPointer(args${g ? "+" + g : ""});\n`, g += b[p].zd;
                e += `  var rv = ${1 === c ? "new func" : "func.call"}(${h.join(", ")});\n`;
                d.Qd || (k.push("emval_returnValue"), l.push(Me), e += "  return emval_returnValue(retType, destructorsRef, rv);\n");
                k.push(e +
                    "};\n");
                a = lf(k)(...l);
                c = `methodCaller<(${b.map(q => q.name).join(", ")}) => ${d.name}>`;
                return hf(kf(c, a))
            }

            function ac(a) {
                a = ff(a >>> 0);
                return Y(f[a])
            }

            function bc(a, b) {
                b >>>= 0;
                a = X(a >>> 0);
                b = X(b);
                return Y(a[b])
            }

            function cc(a) {
                a >>>= 0;
                9 < a && (W[a + 1] += 1)
            }

            function dc() {
                return Y([])
            }

            function ec(a) {
                a = X(a >>> 0);
                for (var b = Array(a.length), c = 0; c < a.length; c++) b[c] = a[c];
                return Y(b)
            }

            function fc(a) {
                return Y(ff(a >>> 0))
            }

            function gc() {
                return Y({})
            }

            function hc(a) {
                a >>>= 0;
                for (var b = X(a); b.length;) {
                    var c = b.pop();
                    b.pop()(c)
                }
                Yb(a)
            }

            function ic(a, b, c) {
                b >>>= 0;
                c >>>= 0;
                a = X(a >>> 0);
                b = X(b);
                c = X(c);
                a[b] = c
            }

            function jc(a, b) {
                b >>>= 0;
                a = Le(a >>> 0, "_emval_take_value");
                a = a.readValueFromPointer(b);
                return Y(a)
            }

            function kc(a, b) {
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

            var mf = a => 0 === a % 4 && (0 !== a % 100 || 0 === a % 400),
                nf = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335],
                of = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

            function lc(a, b) {
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
                var c = (mf(a.getFullYear()) ? nf : of)[a.getMonth()] + a.getDate() - 1 | 0;
                E()[b + 28 >>> 2 >>> 0] = c;
                E()[b + 36 >>> 2 >>> 0] = -(60 * a.getTimezoneOffset());
                c = (new Date(a.getFullYear(), 6, 1)).getTimezoneOffset();
                var d = (new Date(a.getFullYear(), 0, 1)).getTimezoneOffset();
                a = (c != d && a.getTimezoneOffset() == Math.min(d, c)) | 0;
                E()[b + 32 >>> 2 >>> 0] = a
            }

            function mc(a) {
                a >>>= 0;
                var b = new Date(E()[a + 20 >>> 2 >>> 0] + 1900, E()[a + 16 >>> 2 >>> 0], E()[a + 12 >>> 2 >>> 0], E()[a + 8 >>> 2 >>> 0], E()[a + 4 >>> 2 >>> 0], E()[a >>> 2 >>> 0], 0),
                    c = E()[a + 32 >>> 2 >>> 0], d = b.getTimezoneOffset(),
                    e = (new Date(b.getFullYear(), 6, 1)).getTimezoneOffset(),
                    g = (new Date(b.getFullYear(), 0, 1)).getTimezoneOffset(), h = Math.min(g, e);
                0 > c ? E()[a + 32 >>> 2 >>> 0] = Number(e != g && h == d) : 0 < c != (h == d) && (e = Math.max(g, e), b.setTime(b.getTime() + 6E4 * ((0 < c ? h : e) - d)));
                E()[a + 24 >>> 2 >>> 0] = b.getDay();
                c = (mf(b.getFullYear()) ? nf : of)[b.getMonth()] +
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

            function nc(a, b, c, d, e, g, h) {
                return n ? P(16, 1, a, b, c, d, e, g, h) : -52
            }

            function oc(a, b, c, d, e, g) {
                if (n) return P(17, 1, a, b, c, d, e, g)
            }

            var pf = {}, zc = () => performance.timeOrigin + performance.now();

            function pc(a, b) {
                if (n) return P(18, 1, a, b);
                pf[a] && (clearTimeout(pf[a].id), delete pf[a]);
                if (!b) return 0;
                var c = setTimeout(() => {
                    delete pf[a];
                    Ge(() => qf(a, performance.timeOrigin + performance.now()))
                }, b);
                pf[a] = {id: c, ke: b};
                return 0
            }

            function qc(a, b, c, d) {
                a >>>= 0;
                b >>>= 0;
                c >>>= 0;
                d >>>= 0;
                var e = (new Date).getFullYear(), g = (new Date(e, 0, 1)).getTimezoneOffset();
                e = (new Date(e, 6, 1)).getTimezoneOffset();
                var h = Math.max(g, e);
                F()[a >>> 2 >>> 0] = 60 * h;
                E()[b >>> 2 >>> 0] = Number(g != e);
                b = k => {
                    var l = Math.abs(k);
                    return `UTC${0 <= k ? "-" : "+"}${String(Math.floor(l / 60)).padStart(2, "0")}${String(l % 60).padStart(2, "0")}`
                };
                a = b(g);
                b = b(e);
                e < g ? (ne(a, c, 17), ne(b, d, 17)) : (ne(a, d, 17), ne(b, c, 17))
            }

            var vc = () => Date.now(), rf = 1;

            function rc(a, b, c) {
                if (!(0 <= a && 3 >= a)) return 28;
                if (0 === a) a = Date.now(); else if (rf) a = performance.timeOrigin + performance.now(); else return 52;
                A[c >>> 0 >>> 3] = BigInt(Math.round(1E6 * a));
                return 0
            }

            var sf = [], tf = (a, b) => {
                sf.length = 0;
                for (var c; c = D()[a++ >>> 0];) {
                    var d = 105 != c;
                    d &= 112 != c;
                    b += d && b % 8 ? 4 : 0;
                    sf.push(112 == c ? F()[b >>> 2 >>> 0] : 106 == c ? A[b >>> 3] : 105 == c ? E()[b >>> 2 >>> 0] : Ja()[b >>> 3 >>> 0]);
                    b += d ? 8 : 4
                }
                return sf
            };

            function sc(a, b, c) {
                a >>>= 0;
                b = tf(b >>> 0, c >>> 0);
                return Hd[a](...b)
            }

            function tc(a, b, c) {
                a >>>= 0;
                b = tf(b >>> 0, c >>> 0);
                return Hd[a](...b)
            }

            var uc = () => {
            };

            function wc(a, b) {
                return v(I(a >>> 0, b >>> 0))
            }

            var xc = () => {
                M += 1;
                throw "unwind";
            };

            function yc() {
                return 4294901760
            }

            var Ac = () => m ? require("os").cpus().length : navigator.hardwareConcurrency;

            function Bc() {
                H("Cannot use emscripten_pc_get_function without -sUSE_OFFSET_CONVERTER");
                return 0
            }

            function Cc(a) {
                a >>>= 0;
                var b = D().length;
                if (a <= b || 4294901760 < a) return !1;
                for (var c = 1; 4 >= c; c *= 2) {
                    var d = b * (1 + .2 / c);
                    d = Math.min(d, a + 100663296);
                    a:{
                        d = (Math.min(4294901760, 65536 * Math.ceil(Math.max(a, d) / 65536)) - x.buffer.byteLength + 65535) / 65536 | 0;
                        try {
                            x.grow(d);
                            C();
                            var e = 1;
                            break a
                        } catch (g) {
                        }
                        e = void 0
                    }
                    if (e) return !0
                }
                return !1
            }

            var uf = () => {
                H("Cannot use convertFrameToPC (needed by __builtin_return_address) without -sUSE_OFFSET_CONVERTER");
                return 0
            }, vf = {}, wf = a => {
                a.forEach(b => {
                    var c = uf();
                    c && (vf[c] = b)
                })
            };

            function Dc() {
                var a = Error().stack.toString().split("\n");
                "Error" == a[0] && a.shift();
                wf(a);
                vf.Kd = uf();
                vf.ae = a;
                return vf.Kd
            }

            function Ec(a, b, c) {
                a >>>= 0;
                b >>>= 0;
                if (vf.Kd == a) var d = vf.ae; else d = Error().stack.toString().split("\n"), "Error" == d[0] && d.shift(), wf(d);
                for (var e = 3; d[e] && uf() != a;) ++e;
                for (a = 0; a < c && d[a + e]; ++a) E()[b + 4 * a >>> 2 >>> 0] = uf();
                return a
            }

            var xf = {}, zf = () => {
                if (!yf) {
                    var a = {
                        USER: "web_user",
                        LOGNAME: "web_user",
                        PATH: "/",
                        PWD: "/",
                        HOME: "/home/web_user",
                        LANG: ("object" == typeof navigator && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8",
                        _: ka || "./this.program"
                    }, b;
                    for (b in xf) void 0 === xf[b] ? delete a[b] : a[b] = xf[b];
                    var c = [];
                    for (b in a) c.push(`${b}=${a[b]}`);
                    yf = c
                }
                return yf
            }, yf;

            function Fc(a, b) {
                if (n) return P(19, 1, a, b);
                a >>>= 0;
                b >>>= 0;
                var c = 0;
                zf().forEach((d, e) => {
                    var g = b + c;
                    e = F()[a + 4 * e >>> 2 >>> 0] = g;
                    for (g = 0; g < d.length; ++g) B()[e++ >>> 0] = d.charCodeAt(g);
                    B()[e >>> 0] = 0;
                    c += d.length + 1
                });
                return 0
            }

            function Gc(a, b) {
                if (n) return P(20, 1, a, b);
                a >>>= 0;
                b >>>= 0;
                var c = zf();
                F()[a >>> 2 >>> 0] = c.length;
                var d = 0;
                c.forEach(e => d += e.length + 1);
                F()[b >>> 2 >>> 0] = d;
                return 0
            }

            function Ic(a) {
                return n ? P(21, 1, a) : 52
            }

            function Jc(a, b, c, d) {
                return n ? P(22, 1, a, b, c, d) : 52
            }

            function Kc(a, b, c, d) {
                return n ? P(23, 1, a, b, c, d) : 70
            }

            var Af = [null, [], []];

            function Lc(a, b, c, d) {
                if (n) return P(24, 1, a, b, c, d);
                b >>>= 0;
                c >>>= 0;
                d >>>= 0;
                for (var e = 0, g = 0; g < c; g++) {
                    var h = F()[b >>> 2 >>> 0], k = F()[b + 4 >>> 2 >>> 0];
                    b += 8;
                    for (var l = 0; l < k; l++) {
                        var p = D()[h + l >>> 0], q = Af[a];
                        0 === p || 10 === p ? ((1 === a ? ta : v)(le(q)), q.length = 0) : q.push(p)
                    }
                    e += k
                }
                F()[d >>> 2 >>> 0] = e;
                return 0
            }

            function Fd(a) {
                return a >>> 0
            }

            n || Ud();
            for (var Bf = Array(256), Cf = 0; 256 > Cf; ++Cf) Bf[Cf] = String.fromCharCode(Cf);
            oe = Bf;
            T = f.BindingError = class extends Error {
                constructor(a) {
                    super(a);
                    this.name = "BindingError"
                }
            };
            f.InternalError = class extends Error {
                constructor(a) {
                    super(a);
                    this.name = "InternalError"
                }
            };
            W.push(0, 1, void 0, 1, null, 1, !0, 1, !1, 1);
            f.count_emval_handles = () => W.length / 2 - 5 - ue.length;
            var Je = [Gd, Sd, je, qb, rb, sb, tb, ub, vb, wb, xb, yb, zb, Ab, Bb, Cb, nc, oc, pc, Fc, Gc, Ic, Jc, Kc, Lc],
                eb, G;
            (async function () {
                function a(d, e) {
                    G = d.exports;
                    G = Oe();
                    G = Df();
                    Td.push(G.jc);
                    va = e;
                    Za();
                    return G
                }

                Xa++;
                var b = db();
                if (f.instantiateWasm) return new Promise(d => {
                    f.instantiateWasm(b, (e, g) => {
                        a(e, g);
                        d(e.exports)
                    })
                });
                if (n) return new Promise(d => {
                    Ka = e => {
                        var g = new WebAssembly.Instance(e, db());
                        d(a(g, e))
                    }
                });
                $a ??= f.locateFile ? f.locateFile ? f.locateFile("ort-wasm-simd-threaded.jsep.wasm", u) : u + "ort-wasm-simd-threaded.jsep.wasm" : (new URL("ort-wasm-simd-threaded.jsep.wasm", import.meta.url)).href;
                try {
                    var c = await cb(b);
                    return a(c.instance, c.module)
                } catch (d) {
                    return ba(d), Promise.reject(d)
                }
            })();
            var Ke = a => (Ke = G.Cb)(a), Sa = () => (Sa = G.Db)();
            f._OrtInit = (a, b) => (f._OrtInit = G.Eb)(a, b);
            f._OrtGetLastError = (a, b) => (f._OrtGetLastError = G.Fb)(a, b);
            f._OrtCreateSessionOptions = (a, b, c, d, e, g, h, k, l, p) => (f._OrtCreateSessionOptions = G.Gb)(a, b, c, d, e, g, h, k, l, p);
            f._OrtAppendExecutionProvider = (a, b) => (f._OrtAppendExecutionProvider = G.Hb)(a, b);
            f._OrtAddFreeDimensionOverride = (a, b, c) => (f._OrtAddFreeDimensionOverride = G.Ib)(a, b, c);
            f._OrtAddSessionConfigEntry = (a, b, c) => (f._OrtAddSessionConfigEntry = G.Jb)(a, b, c);
            f._OrtReleaseSessionOptions = a => (f._OrtReleaseSessionOptions = G.Kb)(a);
            f._OrtCreateSession = (a, b, c) => (f._OrtCreateSession = G.Lb)(a, b, c);
            f._OrtReleaseSession = a => (f._OrtReleaseSession = G.Mb)(a);
            f._OrtGetInputOutputCount = (a, b, c) => (f._OrtGetInputOutputCount = G.Nb)(a, b, c);
            f._OrtGetInputName = (a, b) => (f._OrtGetInputName = G.Ob)(a, b);
            f._OrtGetOutputName = (a, b) => (f._OrtGetOutputName = G.Pb)(a, b);
            f._OrtFree = a => (f._OrtFree = G.Qb)(a);
            f._OrtCreateTensor = (a, b, c, d, e, g) => (f._OrtCreateTensor = G.Rb)(a, b, c, d, e, g);
            f._OrtGetTensorData = (a, b, c, d, e) => (f._OrtGetTensorData = G.Sb)(a, b, c, d, e);
            f._OrtReleaseTensor = a => (f._OrtReleaseTensor = G.Tb)(a);
            f._OrtCreateRunOptions = (a, b, c, d) => (f._OrtCreateRunOptions = G.Ub)(a, b, c, d);
            f._OrtAddRunConfigEntry = (a, b, c) => (f._OrtAddRunConfigEntry = G.Vb)(a, b, c);
            f._OrtReleaseRunOptions = a => (f._OrtReleaseRunOptions = G.Wb)(a);
            f._OrtCreateBinding = a => (f._OrtCreateBinding = G.Xb)(a);
            f._OrtBindInput = (a, b, c) => (f._OrtBindInput = G.Yb)(a, b, c);
            f._OrtBindOutput = (a, b, c, d) => (f._OrtBindOutput = G.Zb)(a, b, c, d);
            f._OrtClearBoundOutputs = a => (f._OrtClearBoundOutputs = G._b)(a);
            f._OrtReleaseBinding = a => (f._OrtReleaseBinding = G.$b)(a);
            f._OrtRunWithBinding = (a, b, c, d, e) => (f._OrtRunWithBinding = G.ac)(a, b, c, d, e);
            f._OrtRun = (a, b, c, d, e, g, h, k) => (f._OrtRun = G.bc)(a, b, c, d, e, g, h, k);
            f._OrtEndProfiling = a => (f._OrtEndProfiling = G.cc)(a);
            f._JsepOutput = (a, b, c) => (f._JsepOutput = G.dc)(a, b, c);
            f._JsepGetNodeName = a => (f._JsepGetNodeName = G.ec)(a);
            var Na = () => (Na = G.fc)(), Z = f._free = a => (Z = f._free = G.gc)(a),
                ye = f._malloc = a => (ye = f._malloc = G.ic)(a),
                Pa = (a, b, c, d, e, g) => (Pa = G.kc)(a, b, c, d, e, g), Va = () => (Va = G.lc)(),
                Rd = (a, b, c, d, e) => (Rd = G.mc)(a, b, c, d, e), Wd = a => (Wd = G.nc)(a), $d = a => ($d = G.oc)(a),
                qf = (a, b) => (qf = G.pc)(a, b), He = () => (He = G.qc)(), R = (a, b) => (R = G.rc)(a, b),
                ge = a => (ge = G.sc)(a), Yd = (a, b) => (Yd = G.tc)(a, b), O = a => (O = G.uc)(a),
                Qd = a => (Qd = G.vc)(a), N = () => (N = G.wc)(), fe = a => (fe = G.xc)(a), de = a => (de = G.yc)(a),
                he = (a, b, c) => (he = G.zc)(a, b, c), ee = a => (ee = G.Ac)(a), dynCall_iii = f.dynCall_iii =
                    (a, b, c) => (dynCall_iii = f.dynCall_iii = G.Bc)(a, b, c),
                dynCall_vi = f.dynCall_vi = (a, b) => (dynCall_vi = f.dynCall_vi = G.Cc)(a, b),
                Zd = f.dynCall_ii = (a, b) => (Zd = f.dynCall_ii = G.Dc)(a, b),
                dynCall_vii = f.dynCall_vii = (a, b, c) => (dynCall_vii = f.dynCall_vii = G.Ec)(a, b, c),
                Ef = f.dynCall_iiii = (a, b, c, d) => (Ef = f.dynCall_iiii = G.Fc)(a, b, c, d),
                Ff = f.dynCall_viii = (a, b, c, d) => (Ff = f.dynCall_viii = G.Gc)(a, b, c, d),
                Gf = f.dynCall_iiiii = (a, b, c, d, e) => (Gf = f.dynCall_iiiii = G.Hc)(a, b, c, d, e),
                Hf = f.dynCall_viiii = (a, b, c, d, e) => (Hf = f.dynCall_viiii = G.Ic)(a, b, c,
                    d, e),
                If = f.dynCall_viiiiii = (a, b, c, d, e, g, h) => (If = f.dynCall_viiiiii = G.Jc)(a, b, c, d, e, g, h),
                Jf = f.dynCall_viiiiiii = (a, b, c, d, e, g, h, k) => (Jf = f.dynCall_viiiiiii = G.Kc)(a, b, c, d, e, g, h, k),
                Kf = f.dynCall_ji = (a, b) => (Kf = f.dynCall_ji = G.Lc)(a, b),
                dynCall_v = f.dynCall_v = a => (dynCall_v = f.dynCall_v = G.Mc)(a),
                Lf = f.dynCall_viiiii = (a, b, c, d, e, g) => (Lf = f.dynCall_viiiii = G.Nc)(a, b, c, d, e, g),
                Mf = f.dynCall_i = a => (Mf = f.dynCall_i = G.Oc)(a),
                Nf = f.dynCall_fii = (a, b, c) => (Nf = f.dynCall_fii = G.Pc)(a, b, c),
                Of = f.dynCall_viiiiiiii = (a, b, c, d, e, g, h, k, l) => (Of =
                    f.dynCall_viiiiiiii = G.Qc)(a, b, c, d, e, g, h, k, l),
                Pf = f.dynCall_viiiiiiiiii = (a, b, c, d, e, g, h, k, l, p, q) => (Pf = f.dynCall_viiiiiiiiii = G.Rc)(a, b, c, d, e, g, h, k, l, p, q),
                Qf = f.dynCall_jiii = (a, b, c, d) => (Qf = f.dynCall_jiii = G.Sc)(a, b, c, d),
                Rf = f.dynCall_dii = (a, b, c) => (Rf = f.dynCall_dii = G.Tc)(a, b, c),
                Sf = f.dynCall_viiiiiiiii = (a, b, c, d, e, g, h, k, l, p) => (Sf = f.dynCall_viiiiiiiii = G.Uc)(a, b, c, d, e, g, h, k, l, p),
                Tf = f.dynCall_viiiiiiiiiii = (a, b, c, d, e, g, h, k, l, p, q, r) => (Tf = f.dynCall_viiiiiiiiiii = G.Vc)(a, b, c, d, e, g, h, k, l, p, q, r),
                Uf = f.dynCall_iiiiii = (a,
                                         b, c, d, e, g) => (Uf = f.dynCall_iiiiii = G.Wc)(a, b, c, d, e, g),
                Vf = f.dynCall_iij = (a, b, c) => (Vf = f.dynCall_iij = G.Xc)(a, b, c),
                Wf = f.dynCall_iiiiiiiiii = (a, b, c, d, e, g, h, k, l, p) => (Wf = f.dynCall_iiiiiiiiii = G.Yc)(a, b, c, d, e, g, h, k, l, p),
                Xf = f.dynCall_iiiiiiiiiii = (a, b, c, d, e, g, h, k, l, p, q) => (Xf = f.dynCall_iiiiiiiiiii = G.Zc)(a, b, c, d, e, g, h, k, l, p, q),
                Yf = f.dynCall_vij = (a, b, c) => (Yf = f.dynCall_vij = G._c)(a, b, c),
                Zf = f.dynCall_iiif = (a, b, c, d) => (Zf = f.dynCall_iiif = G.$c)(a, b, c, d),
                $f = f.dynCall_iiij = (a, b, c, d) => ($f = f.dynCall_iiij = G.ad)(a, b, c, d), ag = f.dynCall_fiii =
                    (a, b, c, d) => (ag = f.dynCall_fiii = G.bd)(a, b, c, d),
                bg = f.dynCall_viiiiiiiiiiiii = (a, b, c, d, e, g, h, k, l, p, q, r, w, z) => (bg = f.dynCall_viiiiiiiiiiiii = G.cd)(a, b, c, d, e, g, h, k, l, p, q, r, w, z),
                cg = f.dynCall_vjiii = (a, b, c, d, e) => (cg = f.dynCall_vjiii = G.dd)(a, b, c, d, e),
                dg = f.dynCall_vif = (a, b, c) => (dg = f.dynCall_vif = G.ed)(a, b, c),
                eg = f.dynCall_iiiiiii = (a, b, c, d, e, g, h) => (eg = f.dynCall_iiiiiii = G.fd)(a, b, c, d, e, g, h),
                fg = f.dynCall_iiiij = (a, b, c, d, e) => (fg = f.dynCall_iiiij = G.gd)(a, b, c, d, e),
                gg = f.dynCall_iiiiiiii = (a, b, c, d, e, g, h, k) => (gg = f.dynCall_iiiiiiii =
                    G.hd)(a, b, c, d, e, g, h, k),
                hg = f.dynCall_viiiiiiiiiiii = (a, b, c, d, e, g, h, k, l, p, q, r, w) => (hg = f.dynCall_viiiiiiiiiiii = G.id)(a, b, c, d, e, g, h, k, l, p, q, r, w),
                ig = f.dynCall_diii = (a, b, c, d) => (ig = f.dynCall_diii = G.jd)(a, b, c, d),
                jg = f.dynCall_jiiii = (a, b, c, d, e) => (jg = f.dynCall_jiiii = G.kd)(a, b, c, d, e),
                kg = f.dynCall_viiij = (a, b, c, d, e) => (kg = f.dynCall_viiij = G.ld)(a, b, c, d, e),
                lg = f.dynCall_fiiii = (a, b, c, d, e) => (lg = f.dynCall_fiiii = G.md)(a, b, c, d, e),
                mg = f.dynCall_viiif = (a, b, c, d, e) => (mg = f.dynCall_viiif = G.nd)(a, b, c, d, e),
                ng = f.dynCall_diiii = (a,
                                        b, c, d, e) => (ng = f.dynCall_diiii = G.od)(a, b, c, d, e),
                og = f.dynCall_viiid = (a, b, c, d, e) => (og = f.dynCall_viiid = G.pd)(a, b, c, d, e),
                pg = f.dynCall_iiiijii = (a, b, c, d, e, g, h) => (pg = f.dynCall_iiiijii = G.qd)(a, b, c, d, e, g, h),
                qg = f.dynCall_iiiiiij = (a, b, c, d, e, g, h) => (qg = f.dynCall_iiiiiij = G.rd)(a, b, c, d, e, g, h),
                bf = a => (bf = G.sd)(a), Re = () => (Re = G.td)(), af = a => (af = G.ud)(a), cf = () => (cf = G.vd)();

            function od(a, b, c) {
                var d = N();
                try {
                    dynCall_vii(a, b, c)
                } catch (e) {
                    O(d);
                    if (e !== e + 0) throw e;
                    R(1, 0)
                }
            }

            function Uc(a, b, c) {
                var d = N();
                try {
                    return dynCall_iii(a, b, c)
                } catch (e) {
                    O(d);
                    if (e !== e + 0) throw e;
                    R(1, 0)
                }
            }

            function md(a, b) {
                var c = N();
                try {
                    dynCall_vi(a, b)
                } catch (d) {
                    O(c);
                    if (d !== d + 0) throw d;
                    R(1, 0)
                }
            }

            function Tc(a, b) {
                var c = N();
                try {
                    return Zd(a, b)
                } catch (d) {
                    O(c);
                    if (d !== d + 0) throw d;
                    R(1, 0)
                }
            }

            function Wc(a, b, c, d) {
                var e = N();
                try {
                    return Ef(a, b, c, d)
                } catch (g) {
                    O(e);
                    if (g !== g + 0) throw g;
                    R(1, 0)
                }
            }

            function sd(a, b, c, d, e) {
                var g = N();
                try {
                    Hf(a, b, c, d, e)
                } catch (h) {
                    O(g);
                    if (h !== h + 0) throw h;
                    R(1, 0)
                }
            }

            function Xc(a, b, c, d, e) {
                var g = N();
                try {
                    return Gf(a, b, c, d, e)
                } catch (h) {
                    O(g);
                    if (h !== h + 0) throw h;
                    R(1, 0)
                }
            }

            function pd(a, b, c, d) {
                var e = N();
                try {
                    Ff(a, b, c, d)
                } catch (g) {
                    O(e);
                    if (g !== g + 0) throw g;
                    R(1, 0)
                }
            }

            function Zc(a, b, c, d, e, g, h) {
                var k = N();
                try {
                    return eg(a, b, c, d, e, g, h)
                } catch (l) {
                    O(k);
                    if (l !== l + 0) throw l;
                    R(1, 0)
                }
            }

            function ld(a) {
                var b = N();
                try {
                    dynCall_v(a)
                } catch (c) {
                    O(b);
                    if (c !== c + 0) throw c;
                    R(1, 0)
                }
            }

            function gd(a, b, c) {
                var d = N();
                try {
                    return Vf(a, b, c)
                } catch (e) {
                    O(d);
                    if (e !== e + 0) throw e;
                    R(1, 0)
                }
            }

            function td(a, b, c, d, e, g) {
                var h = N();
                try {
                    Lf(a, b, c, d, e, g)
                } catch (k) {
                    O(h);
                    if (k !== k + 0) throw k;
                    R(1, 0)
                }
            }

            function Dd(a, b, c) {
                var d = N();
                try {
                    Yf(a, b, c)
                } catch (e) {
                    O(d);
                    if (e !== e + 0) throw e;
                    R(1, 0)
                }
            }

            function ud(a, b, c, d, e, g, h) {
                var k = N();
                try {
                    If(a, b, c, d, e, g, h)
                } catch (l) {
                    O(k);
                    if (l !== l + 0) throw l;
                    R(1, 0)
                }
            }

            function vd(a, b, c, d, e, g, h, k) {
                var l = N();
                try {
                    Jf(a, b, c, d, e, g, h, k)
                } catch (p) {
                    O(l);
                    if (p !== p + 0) throw p;
                    R(1, 0)
                }
            }

            function Yc(a, b, c, d, e, g) {
                var h = N();
                try {
                    return Uf(a, b, c, d, e, g)
                } catch (k) {
                    O(h);
                    if (k !== k + 0) throw k;
                    R(1, 0)
                }
            }

            function $c(a, b, c, d, e, g, h, k) {
                var l = N();
                try {
                    return gg(a, b, c, d, e, g, h, k)
                } catch (p) {
                    O(l);
                    if (p !== p + 0) throw p;
                    R(1, 0)
                }
            }

            function xd(a, b, c, d, e, g, h, k, l, p) {
                var q = N();
                try {
                    Sf(a, b, c, d, e, g, h, k, l, p)
                } catch (r) {
                    O(q);
                    if (r !== r + 0) throw r;
                    R(1, 0)
                }
            }

            function wd(a, b, c, d, e, g, h, k, l) {
                var p = N();
                try {
                    Of(a, b, c, d, e, g, h, k, l)
                } catch (q) {
                    O(p);
                    if (q !== q + 0) throw q;
                    R(1, 0)
                }
            }

            function Sc(a) {
                var b = N();
                try {
                    return Mf(a)
                } catch (c) {
                    O(b);
                    if (c !== c + 0) throw c;
                    R(1, 0)
                }
            }

            function ad(a, b, c, d, e, g, h, k, l, p) {
                var q = N();
                try {
                    return Wf(a, b, c, d, e, g, h, k, l, p)
                } catch (r) {
                    O(q);
                    if (r !== r + 0) throw r;
                    R(1, 0)
                }
            }

            function Pc(a, b, c) {
                var d = N();
                try {
                    return Nf(a, b, c)
                } catch (e) {
                    O(d);
                    if (e !== e + 0) throw e;
                    R(1, 0)
                }
            }

            function jd(a, b, c, d) {
                var e = N();
                try {
                    return Qf(a, b, c, d)
                } catch (g) {
                    O(e);
                    if (g !== g + 0) throw g;
                    R(1, 0);
                    return 0n
                }
            }

            function Mc(a, b, c) {
                var d = N();
                try {
                    return Rf(a, b, c)
                } catch (e) {
                    O(d);
                    if (e !== e + 0) throw e;
                    R(1, 0)
                }
            }

            function zd(a, b, c, d, e, g, h, k, l, p, q, r) {
                var w = N();
                try {
                    Tf(a, b, c, d, e, g, h, k, l, p, q, r)
                } catch (z) {
                    O(w);
                    if (z !== z + 0) throw z;
                    R(1, 0)
                }
            }

            function yd(a, b, c, d, e, g, h, k, l, p, q) {
                var r = N();
                try {
                    Pf(a, b, c, d, e, g, h, k, l, p, q)
                } catch (w) {
                    O(r);
                    if (w !== w + 0) throw w;
                    R(1, 0)
                }
            }

            function bd(a, b, c, d, e, g, h, k, l, p, q) {
                var r = N();
                try {
                    return Xf(a, b, c, d, e, g, h, k, l, p, q)
                } catch (w) {
                    O(r);
                    if (w !== w + 0) throw w;
                    R(1, 0)
                }
            }

            function Vc(a, b, c, d) {
                var e = N();
                try {
                    return Zf(a, b, c, d)
                } catch (g) {
                    O(e);
                    if (g !== g + 0) throw g;
                    R(1, 0)
                }
            }

            function fd(a, b, c, d) {
                var e = N();
                try {
                    return $f(a, b, c, d)
                } catch (g) {
                    O(e);
                    if (g !== g + 0) throw g;
                    R(1, 0)
                }
            }

            function Qc(a, b, c, d) {
                var e = N();
                try {
                    return ag(a, b, c, d)
                } catch (g) {
                    O(e);
                    if (g !== g + 0) throw g;
                    R(1, 0)
                }
            }

            function Bd(a, b, c, d, e, g, h, k, l, p, q, r, w, z) {
                var J = N();
                try {
                    bg(a, b, c, d, e, g, h, k, l, p, q, r, w, z)
                } catch (la) {
                    O(J);
                    if (la !== la + 0) throw la;
                    R(1, 0)
                }
            }

            function Ed(a, b, c, d, e) {
                var g = N();
                try {
                    cg(a, b, c, d, e)
                } catch (h) {
                    O(g);
                    if (h !== h + 0) throw h;
                    R(1, 0)
                }
            }

            function nd(a, b, c) {
                var d = N();
                try {
                    dg(a, b, c)
                } catch (e) {
                    O(d);
                    if (e !== e + 0) throw e;
                    R(1, 0)
                }
            }

            function hd(a, b) {
                var c = N();
                try {
                    return Kf(a, b)
                } catch (d) {
                    O(c);
                    if (d !== d + 0) throw d;
                    R(1, 0);
                    return 0n
                }
            }

            function dd(a, b, c, d, e) {
                var g = N();
                try {
                    return fg(a, b, c, d, e)
                } catch (h) {
                    O(g);
                    if (h !== h + 0) throw h;
                    R(1, 0)
                }
            }

            function Ad(a, b, c, d, e, g, h, k, l, p, q, r, w) {
                var z = N();
                try {
                    hg(a, b, c, d, e, g, h, k, l, p, q, r, w)
                } catch (J) {
                    O(z);
                    if (J !== J + 0) throw J;
                    R(1, 0)
                }
            }

            function Nc(a, b, c, d) {
                var e = N();
                try {
                    return ig(a, b, c, d)
                } catch (g) {
                    O(e);
                    if (g !== g + 0) throw g;
                    R(1, 0)
                }
            }

            function kd(a, b, c, d, e) {
                var g = N();
                try {
                    return jg(a, b, c, d, e)
                } catch (h) {
                    O(g);
                    if (h !== h + 0) throw h;
                    R(1, 0);
                    return 0n
                }
            }

            function Cd(a, b, c, d, e) {
                var g = N();
                try {
                    kg(a, b, c, d, e)
                } catch (h) {
                    O(g);
                    if (h !== h + 0) throw h;
                    R(1, 0)
                }
            }

            function Rc(a, b, c, d, e) {
                var g = N();
                try {
                    return lg(a, b, c, d, e)
                } catch (h) {
                    O(g);
                    if (h !== h + 0) throw h;
                    R(1, 0)
                }
            }

            function rd(a, b, c, d, e) {
                var g = N();
                try {
                    mg(a, b, c, d, e)
                } catch (h) {
                    O(g);
                    if (h !== h + 0) throw h;
                    R(1, 0)
                }
            }

            function Oc(a, b, c, d, e) {
                var g = N();
                try {
                    return ng(a, b, c, d, e)
                } catch (h) {
                    O(g);
                    if (h !== h + 0) throw h;
                    R(1, 0)
                }
            }

            function qd(a, b, c, d, e) {
                var g = N();
                try {
                    og(a, b, c, d, e)
                } catch (h) {
                    O(g);
                    if (h !== h + 0) throw h;
                    R(1, 0)
                }
            }

            function ed(a, b, c, d, e, g, h) {
                var k = N();
                try {
                    return pg(a, b, c, d, e, g, h)
                } catch (l) {
                    O(k);
                    if (l !== l + 0) throw l;
                    R(1, 0)
                }
            }

            function cd(a, b, c, d, e, g, h) {
                var k = N();
                try {
                    return qg(a, b, c, d, e, g, h)
                } catch (l) {
                    O(k);
                    if (l !== l + 0) throw l;
                    R(1, 0)
                }
            }

            function Df() {
                var a = G;
                a = Object.assign({}, a);
                var b = d => e => d(e) >>> 0, c = d => () => d() >>> 0;
                a.Cb = b(a.Cb);
                a.fc = c(a.fc);
                a.ic = b(a.ic);
                a.vc = b(a.vc);
                a.wc = c(a.wc);
                a.Ac = b(a.Ac);
                return a
            }

            f.stackSave = () => N();
            f.stackRestore = a => O(a);
            f.stackAlloc = a => Qd(a);
            f.setValue = function (a, b, c = "i8") {
                c.endsWith("*") && (c = "*");
                switch (c) {
                    case "i1":
                        B()[a >>> 0] = b;
                        break;
                    case "i8":
                        B()[a >>> 0] = b;
                        break;
                    case "i16":
                        Ga()[a >>> 1 >>> 0] = b;
                        break;
                    case "i32":
                        E()[a >>> 2 >>> 0] = b;
                        break;
                    case "i64":
                        A[a >>> 3] = BigInt(b);
                        break;
                    case "float":
                        Ia()[a >>> 2 >>> 0] = b;
                        break;
                    case "double":
                        Ja()[a >>> 3 >>> 0] = b;
                        break;
                    case "*":
                        F()[a >>> 2 >>> 0] = b;
                        break;
                    default:
                        H(`invalid type for setValue: ${c}`)
                }
            };
            f.getValue = function (a, b = "i8") {
                b.endsWith("*") && (b = "*");
                switch (b) {
                    case "i1":
                        return B()[a >>> 0];
                    case "i8":
                        return B()[a >>> 0];
                    case "i16":
                        return Ga()[a >>> 1 >>> 0];
                    case "i32":
                        return E()[a >>> 2 >>> 0];
                    case "i64":
                        return A[a >>> 3];
                    case "float":
                        return Ia()[a >>> 2 >>> 0];
                    case "double":
                        return Ja()[a >>> 3 >>> 0];
                    case "*":
                        return F()[a >>> 2 >>> 0];
                    default:
                        H(`invalid type for getValue: ${b}`)
                }
            };
            f.UTF8ToString = I;
            f.stringToUTF8 = ne;
            f.lengthBytesUTF8 = me;

            function rg() {
                if (0 < Xa) Ya = rg; else if (n) aa(f), Wa(); else {
                    for (; 0 < Ld.length;) Ld.shift()(f);
                    0 < Xa ? Ya = rg : (f.calledRun = !0, wa || (Wa(), aa(f)))
                }
            }

            rg();
            "use strict";
            f.PTR_SIZE = 4;
            moduleRtn = ca;


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
