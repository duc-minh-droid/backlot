# Qwen Local — the app

A single-screen client for the local Qwen-Image-2.1 setup, built around one idea: be honest
about what the model is doing for the whole 90 seconds, and never draw a progress bar for a
signal that does not exist.

## Running

```
run-comfyui.bat     (first, and leave it running)
run-app.bat         (then this)
```

Open http://127.0.0.1:5173.

## Why there is a proxy

ComfyUI runs `create_origin_only_middleware` unless started with `--enable-cors-header`
(`server.py:158`). It returns a hard **403** — not a missing CORS header — for any request
whose `Sec-Fetch-Site` is cross-site or whose `Origin` host:port differs from its `Host`. A
port-only difference counts, so no Vite port can dodge it, and it applies to the WebSocket
handshake too.

Vite's proxy fixes this without touching how ComfyUI is launched, but `changeOrigin: true`
is **not** enough — it rewrites `Host` and leaves `Origin` intact. The headers are removed
outright in `vite.config.ts`.

Verify with:

```
curl http://127.0.0.1:5173/api/system_stats                                   # 200
curl -H "Origin: http://127.0.0.1:5173" http://127.0.0.1:8188/system_stats    # 403
```

The second one failing is what proves the proxy is doing work.

## The rules the UI follows

1. A left-anchored fill bar is only ever used for a signal with a real numerator and
   denominator. Sampling has one. Weight loading does not, so it gets a sweeping scanner
   across a rail that never fills — nothing accumulates, so it cannot be misread.
2. Continuous quantities may be animated; discretely observed ones may not. The elapsed
   clock eases. The step counter jumps 12/25 → 13/25, because easing between them would
   imply we know the sub-step position.
3. Numbers from a previous run are prefixed `~` and labelled as history, never a forecast.
4. Durations show one decimal place. They are client-side websocket receipt times and
   carry a few ms of transport latency; two decimals would claim precision we lack.

## Things that will bite if you change the transport

- `client_id` must be sent with `/prompt`. Without it you get **no** `execution_start`,
  `execution_cached`, `executing`, `executed` or `execution_success` — but `progress` and
  legacy previews still arrive, because those are broadcast. Verified by experiment.
- `ws.binaryType = 'arraybuffer'` must be set before any frame arrives, or preview frames
  decode asynchronously and can be dispatched after the `progress` message that followed
  them on the wire.
- The `feature_flags` handshake must be the first text frame, or you get legacy event-1
  previews with no node metadata for the socket's whole lifetime.
- Cached nodes emit `executed` without `executing`, replaying the previous run's images.
  The run store flags this as `outputReplayedFromCache` and the UI says so.
- `/interrupt` silently no-ops (returning 200) for a queued-but-not-running prompt, so
  cancel also sends `/queue {"delete":[id]}`.

## Controls

Top right: **theme** (light/dark), **motion** (auto / reduced / full) and **?** (the colour
law). Motion defaults to `auto`, which follows the OS setting; the explicit options exist
because `useReducedMotion` only reads the media query, so there would otherwise be no way
to exercise or override it. Reduced motion removes animation and nothing else — every
number, state and label stays on screen.

`Cmd/Ctrl+Enter` generates, `Esc` cancels, and the timeline is a single tab stop with
arrow-key navigation between stages.

"Show the graph that ran" prints the exact JSON that was POSTed, so any disagreement
between the timeline and reality can be settled against the request itself.

## Weights are read lazily, which is the whole story

The loader nodes return almost immediately — `UnetLoaderGGUF` finishes in ~0.1s for a
4.2 GB file. Nothing has been read at that point. Under `--lowvram` the GGUF loader hands
back a CPU-resident model and the real transfer happens **inside** `KSampler`, between
`executing {node:"6"}` and the first `progress`.

The timeline shows this as two separate segments — a cold run reads roughly:

```
Loading diffusion weights   0.1s
Moving weights into VRAM    8.0s     <- silent, amber, no step signal
Sampling                   83.5s     <- 25 real steps
```

So the loader chips deliberately do **not** print a MB/s figure. Dividing 4.2 GB by 0.1s
would produce a throughput of tens of GB/s and present it as measured, which is exactly
the class of lie this app exists to avoid. They print the node's real duration and the
file's real size, labelled "read lazily".

## Composing a shot

The compose column asks questions instead of demanding a prompt. Pick who is in it, type what
they are doing and where, then answer as much or as little as you like: shot size, camera height,
which way they face, lens, wardrobe, expression, gaze, look, how many people, shape.

**An unanswered question adds no words.** Every preset has a real "unspecified" chip, so leaving
one alone is a visible choice rather than a hidden default.

The chips write `params.prompt` directly, so there is exactly one source of truth — the lints,
the cost meter and the graph inspector all keep working on it untouched. "Show what the model
will read" prints that same string, rendered from the string itself and never re-composed from
the chips, so the preview cannot drift from the graph. **Edit as text** hands it over and stops
recomposition; coming back shows both versions and asks before discarding anything.

Three things about the composition are load-bearing:

- **Binding clauses come first**, because they must sit next to the auto-prepended `<imageN>`
  labels — that adjacency is the only thing that binds a name to a photo.
- **The look leads the scene sentence** rather than trailing it. Qwen3-VL is a causal LM: a token
  at the end is encoded having seen everything before it, but nothing before it has seen *it*. A
  trailing style reaches the subject and setting tokens too late.
- **Every slot drops with its comma.** No `Ana is walking, , smiling`.

`Idris is the only person in the frame.` is a visible chip, on by default, not a silent
insertion. It uses the name rather than "a single person" — an indefinite noun can itself
instantiate someone, which is the opposite of the point. It cannot be done in the negative
prompt: at cfg 1 the sampler discards that entirely.

Aspect presets are all about a megapixel and all multiples of 32, so the choice is cost-neutral
(3920–4096 latent tokens across the whole set). Two of them are labelled with an asterisk because
they are not their nominal ratio on a 32-pixel grid: 1344×768 is 7:4, not 16:9. Exact 16:9 would
be 1536×864, a third more pixels.

## Changing a result

Once a run finishes, **change this image** appears under the canvas: *closer*, *wider*, *from the
left / right*, *from lower down*, *change the outfit*, *make it night*, or a free-text change.

Each preset carries its own enumerated **keep** clause rather than one abstract "keep everything
else identical" — the official edit example names what to preserve, an abstract invariant gives
the model nothing to hold, and on an outfit change it flatly contradicts the request. *wider*
carries `Do not add any other people`, because inventing area next to a person is exactly where a
second copy of them shows up.

The previous output becomes the only reference. It is fetched back through `/view` and
re-uploaded into `input/qwen-app/followups` — ComfyUI has no server-side copy, and a separate
subfolder keeps a long chain's orphans sweepable by hand. `resolution` is set to
`round(sqrt(W×H))` so `referenceTargetSize` returns the source's own dimensions and the image is
never resampled on the way in; for 1248×832 that is 1019. This used to hold by luck.

> Each follow-up is a full re-generation, not an edit of the pixels. The previous image goes back
> through the VAE and the model paints a new one. Small changes accumulate — after three or four
> in a row the face has usually moved.

The bar shows the chain depth and offers **start over from the original**.

One implementation note worth keeping: the run store holds exactly one run and `generate()`
replaces it *synchronously, before the await*. A follow-up therefore copies `{ref, width,
height}` into local state before doing anything async — the output→input round trip takes
seconds, and the Generate button is live for all of it.

## The subject library

A **Library** tab holds named people and scenes. Attach one to a generation and the same face
or the same place comes back, at whatever angle and output size you ask for.

The photos are uploaded to `ComfyUI\input\qwen-app` and stay there; localStorage
(`qwen.subjects.v1`) holds only pointers. That is why a subject survives a reload — and why
deleting one cannot delete its files, which the confirm dialog says outright.

**No photos? Build the character from the description.** The editor has a studio for subjects
that do not exist yet:

1. Write a description, press **generate the first photo**. That is a plain text-to-image run
   at 832x1216 with a neutral-plate wrapper (even light, plain grey background, sharp focus) --
   reference photos want to be boring, because the model copies whatever is in the frame.
2. Keep it, and extra views appear: *three-quarter view*, *profile*, *chin raised*,
   *warmer light*. Each of those is generated **from the photo you kept**, with it attached as
   a reference, so it is the same person at a new angle. "Another take from the description"
   deliberately is not -- that rolls a different person, and the UI says so.
3. Generated images land in ComfyUI's **output** folder but references load from **input**, and
   ComfyUI has no server-side copy. "Keep it" fetches the bytes back through `/view` and
   re-uploads them, so a saved subject also survives an output-folder cleanup.

These runs go through the same run store as everything else, so the real timeline, live preview
and log are on the Generate tab rather than a second progress UI that could disagree.

**One artifact worth knowing.** With several references attached and a wide shot, the model
sometimes instantiates the subject twice -- a double in the background. Say "a single man",
"alone", or narrow the shot if it happens.

**How the binding works.** The tokenizer auto-prepends `<image1>…<imageN>` before your prompt,
one per attached image, and each reference's VAE latent is spliced at its label's position. So
"insert binding sentence" writes a real, editable clause into the prompt box:

```
<image1> and <image2> show Ana. a woman in her thirties with short dark hair…

Ana stands on a windswept sea cliff at sunset, wide shot.
```

You write names; the app writes the indices. The text in the box is exactly the text in the
graph — nothing is composed invisibly at submit, and your own sentence is never rewritten.

**Output size is always yours.** `KSampler.latent_image` always comes from `EmptyLatentImage`,
never from the encoder's slot 2. `fix_empty_latent_channels` converts the 4-channel /8 latent to
Qwen's 64-channel /16 format losslessly because it is all zeros, which is what the official
template's `custom_size` path does. A 832×1216 portrait reference happily produces a 1344×768
scene. The attachment list shows the aspect delta and repeats ComfyUI's own warning when it
gets large.

**What it costs.** Each reference is `(W/16)×(H/16)` DiT tokens, and the prefix KV cache is
exactly 0.5 MiB per token (2 × 32 blocks × 4096 dim × 2 bytes — block count and width read from
the GGUF header). Two references at budget 1024 is ~12,200 tokens and ~6 GiB of cache on an 8 GB
card. The cost meter computes this before you submit. Image tokens are exact; your prompt's text
tokens are not counted, because there is no BPE tokenizer in the browser.

### The KV cache node, measured

The prefix cache is **already on** for every run (`model_base.py:2678`) at `device auto` /
`dtype default`, so adding `QwenImage21Cache` at those values would change nothing. It is only
emitted when we override. Measured here, 2 references at budget 768, 12 steps, 1344×768:

| setting | result |
| --- | --- |
| no node (ComfyUI's own default) | 75.1s |
| `cpu` / `default` | **57.1s** — what the app requests |
| `off` | 94.8s |
| `cpu` / `int8` | **fails**: `RuntimeError: aimdo memory compile error` |

So `int8` is never chosen automatically, despite halving the cache: a setting that reliably
crashes is not a saving. It stays selectable in the advanced drawer.

The app cannot observe whether the cache was actually used — ComfyUI emits no signal — so the
run facts say "requested, not confirmed" rather than pretending.

### Guards

- A prompt starting with `<|im_start|>` makes ComfyUI skip its chat template and **silently drop
  every reference**. Submit is blocked.
- `<imageN>` beyond the attachment count is blocked, and reordering renumbers the list, never
  your text.
- `images.image_N` keys must be dense from 1: the encoder compacts its inputs and relabels by
  position, so a gap would silently point `<image3>` at the wrong photo. Asserted in `buildGraph`.
- Attached files are HEAD-checked against ComfyUI's input folder on load and before submit.
- Exceeding 10 references is a hard error, not a silent `slice()`.
- Stage timings are bucketed by reference count, so reference runs cannot poison the `~` history
  shown for plain generations.

## Two traps in the timeline itself

Both were live bugs, both are the same mistake in different clothes:

- A stage that folds several nodes reports the **sum of its members' own durations**, never
  the span from the first start to the last end. `VAELoader` runs near the beginning and
  `VAEDecode` at the very end, so the span between them swept up the whole sampler and
  reported 106s of "decoding" on a 107s run.
- A **cached** member contributes nothing and is skipped. It never gets a `tEnd`, and
  treating that as "still running" stretched ENCODE to the length of the entire run.

Click any stage that folds more than one node to see the split. The parts always add up to
the number on the chip.

## Layout

`comfy/` transport (types, binary frame parser, socket lifecycle, REST) · `graph/` builds
the API prompt for both modes · `run/` the pure reducer, segment derivation and stage view
model · `telemetry/` the log ring buffer · `motion/` tokens and variants · `ui/` components.

`node_modules` is a junction to `C:\AI\qwen-app-node-modules` so OneDrive does not sync it.
Recreate with:

```
mklink /J app\node_modules C:\AI\qwen-app-node-modules
```
