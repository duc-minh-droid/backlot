"""Generate images with Qwen-Image-2.1 through a locally running ComfyUI.

Start ComfyUI first (run-comfyui.bat), then:

    python gen.py "a neon shop sign that reads QWEN IMAGE 2.1, rainy night"
"""

import argparse
import json
import pathlib
import time
import urllib.request

SERVER = "http://127.0.0.1:8188"
WORKFLOW = pathlib.Path(__file__).parent / "workflows" / "qwen-2.1-t2i-gguf.json"
OUTPUTS = pathlib.Path(__file__).parent / "outputs"


def post(path, payload):
    req = urllib.request.Request(
        f"{SERVER}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.load(urllib.request.urlopen(req))


def get(path):
    return json.load(urllib.request.urlopen(f"{SERVER}{path}"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt")
    ap.add_argument("--negative", default="")
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--steps", type=int, default=25)
    ap.add_argument("--cfg", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=int(time.time()) % 2**31)
    args = ap.parse_args()

    wf = json.loads(WORKFLOW.read_text())["prompt"]
    wf["4"]["inputs"]["prompt"] = args.prompt
    wf["4"]["inputs"]["negative_prompt"] = args.negative
    wf["5"]["inputs"]["width"] = args.width
    wf["5"]["inputs"]["height"] = args.height
    wf["6"]["inputs"]["steps"] = args.steps
    wf["6"]["inputs"]["cfg"] = args.cfg
    wf["6"]["inputs"]["seed"] = args.seed

    started = time.time()
    prompt_id = post("/prompt", {"prompt": wf})["prompt_id"]
    print(f"queued {prompt_id} (seed {args.seed})")

    while True:
        history = get(f"/history/{prompt_id}")
        if history:
            break
        time.sleep(2)

    entry = history[prompt_id]
    if not entry["status"]["completed"]:
        raise SystemExit(f"generation failed: {entry['status']['messages'][-1]}")

    OUTPUTS.mkdir(exist_ok=True)
    for node in entry["outputs"].values():
        for image in node.get("images", []):
            url = (
                f"{SERVER}/view?filename={image['filename']}"
                f"&subfolder={image['subfolder']}&type={image['type']}"
            )
            dest = OUTPUTS / image["filename"]
            dest.write_bytes(urllib.request.urlopen(url).read())
            print(f"saved {dest} in {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
