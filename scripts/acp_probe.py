#!/usr/bin/env python3
"""Phase-0 probe #2: summarize session/new payload without the model firehose."""
import json, subprocess, os, threading, time
from collections import Counter

ENV = dict(os.environ); ENV["HERMES_ACP_SKIP_CONFIGURED_MCP"] = "1"
p = subprocess.Popen(["hermes","acp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.PIPE, text=True, bufsize=1, env=ENV, cwd=os.getcwd())
err=[]; threading.Thread(target=lambda:[err.append(l.rstrip()) for l in p.stderr],daemon=True).start()

def send(o): p.stdin.write(json.dumps(o)+"\n"); p.stdin.flush()
def read_until(i, t=90):
    out=[]; d=time.time()+t
    while time.time()<d:
        l=p.stdout.readline()
        if not l: break
        l=l.strip()
        if not l: continue
        try: m=json.loads(l)
        except Exception: continue
        out.append(m)
        if m.get("id")==i: return out
    return out

send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,
 "clientCapabilities":{"fs":{"readTextFile":True,"writeTextFile":True},"terminal":True,
 "auth":{"terminal":True},"session":{"notices":{},"compaction":{},"configOptions":{"boolean":{}}}},
 "clientInfo":{"name":"probe","version":"0.0.1"}}})
read_until(1)
send({"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":os.getcwd(),"mcpServers":[]}})
msgs = read_until(2, 150)
for m in msgs:
    if m.get("method")=="session/update":
        print("NOTIF session/update:", json.dumps(m["params"]["update"])[:2000]); continue
    r = m.get("result")
    if not r: print("MSG:", json.dumps(m)[:1500]); continue
    print("TOP-LEVEL KEYS of session/new result:", list(r.keys()))
    print("sessionId:", r.get("sessionId"))
    for k in ("modes","models","configOptions","availableCommands","available_commands"):
        if k in r:
            v = r[k]
            if k=="models" and isinstance(v,dict):
                am = v.get("availableModels") or []
                print(f"models: {len(am)} rows; current={v.get('currentModelId')}")
                print("  providers:", Counter((x.get('description') or '').replace('Provider: ','') for x in am))
                print("  sample:", json.dumps(am[:2]))
            else:
                print(f"{k}:", json.dumps(v)[:3000])
    print("other keys:", {k: (json.dumps(r[k])[:400] if k not in ('models',) else '<models>') for k in r if k not in ('models','modes','configOptions','sessionId')})
time.sleep(2); p.terminate()
try: p.wait(timeout=10)
except Exception: p.kill()
print("\nSTDERR:"); print("\n".join(err[:25]))
