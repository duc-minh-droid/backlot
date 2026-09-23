import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { comfySocket } from './comfy/client'
import { imageExists, viewUrl } from './comfy/rest'
import type { ConnState } from './comfy/socket'
import { chooseCache, encodeCost } from './library/cost'
import type { FileCheck } from './library/types'
import { useSubjectLibrary } from './library/useSubjectLibrary'
import { MotionPreferenceProvider } from './motion/useMotionPreference'
import { resolveAttachments, useComposeStore } from './run/composeStore'
import { deriveSegments, stepRate } from './run/phases'
import { useRunStore } from './run/runStore'
import { stageViews } from './run/stageView'
import { useElapsed } from './run/useElapsed'
import { useNow } from './run/useNow'
import { historyFor, useStageHistory } from './run/useStageHistory'
import { useTheme } from './theme/useTheme'
import { ComposePanel } from './ui/ComposePanel'
import { GraphInspector } from './ui/GraphInspector'
import { LibraryView } from './ui/LibraryView'
import { LiveCanvas } from './ui/LiveCanvas'
import { LiveRegion } from './ui/LiveRegion'
import { LogConsole } from './ui/LogConsole'
import { PipelineTimeline } from './ui/PipelineTimeline'
import { RunRail } from './ui/RunRail'
import { FollowUpBar } from './ui/FollowUpBar'
import { StatusPanel } from './ui/StatusPanel'
import { TopBar } from './ui/TopBar'
import './ui/app.css'

const ACTIVE = new Set(['submitting', 'queued', 'running'])

export default function App() {
  const [connection, setConnection] = useState<ConnState>({ phase: 'idle' })
  const [checks, setChecks] = useState<Record<string, FileCheck>>({})

  const run = useRunStore((state) => state.run)
  const submitError = useRunStore((state) => state.submitError)
  const generate = useRunStore((state) => state.generate)
  const cancel = useRunStore((state) => state.cancel)

  const params = useComposeStore((state) => state.params)
  const setParams = useComposeStore((state) => state.setParams)
  const attachments = useComposeStore((state) => state.attachments)
  const view = useComposeStore((state) => state.view)
  const lastResult = useComposeStore((state) => state.lastResult)
  const setLastResult = useComposeStore((state) => state.setLastResult)

  const [theme, toggleTheme] = useTheme()
  const library = useSubjectLibrary()
  const { history, record } = useStageHistory()
  const recordedFor = useRef<string | null>(null)

  useEffect(() => comfySocket.connect(), [])
  useEffect(() => comfySocket.onState(setConnection), [])

  const busy = run !== null && ACTIVE.has(run.status)
  const elapsed = useElapsed(run?.t0, busy)

  const resolved = useMemo(
    () => resolveAttachments(attachments, library.subjects),
    [attachments, library.subjects],
  )

  // Verify attached files still exist. ComfyUI's input folder is not ours, so a reference
  // can vanish between sessions and would otherwise fail as a raw node error mid-run.
  useEffect(() => {
    let cancelled = false
    if (resolved.length === 0) return
    void (async () => {
      for (const attachment of resolved) {
        const ok = await imageExists(attachment.name, attachment.subfolder)
        if (cancelled) return
        setChecks((current) => ({ ...current, [attachment.key]: ok ? 'present' : 'missing' }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resolved])

  const rate = stepRate(run?.nodes['6']?.steps ?? [])
  const stepFraction = rate && rate.stepsTotal > 0 ? rate.stepsDone / rate.stepsTotal : 0

  const finalImage = run?.images[0]
  const finalUrl = finalImage && run?.status === 'success' ? viewUrl(finalImage) : null

  useEffect(() => {
    if (run?.status !== 'success' || recordedFor.current === run.promptId) return
    recordedFor.current = run.promptId
    record(stageViews(run, run.tEnd ?? 0), run.params.references.length)

    // The run store holds one slot and the next generate() replaces it, so the finished image
    // is copied out here -- this is the only moment it is reachable.
    const image = run.images[0]
    if (image) {
      const link = { ref: image, width: run.params.width, height: run.params.height }
      const previous = useComposeStore.getState().lastResult
      const continuing = previous !== null && previous.chainDepth > 0
      setLastResult({
        ...link,
        chainDepth: continuing ? previous.chainDepth : 0,
        origin: continuing ? previous.origin : null,
      })
    }
  }, [run, record, setLastResult])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && busy) void cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, cancel])

  const onGenerate = useCallback(() => {
    const cost = encodeCost(resolved, params.resolution, params.width, params.height)
    const cache = chooseCache(cost, resolved.length)
    // Minted here rather than inside generate() so the field can show the value that was
    // actually submitted instead of the 0 that stood for "pick one".
    const seed = params.seed || Math.floor(Math.random() * 1e9)
    void generate({
      ...params,
      seed,
      references: resolved.map((attachment) => ({
        name: attachment.name,
        subfolder: attachment.subfolder,
        width: attachment.width,
        height: attachment.height,
      })),
      // The computed placement is used unless the user overrode it in the drawer.
      cacheDevice: params.cacheDevice === 'auto' ? cache.device : params.cacheDevice,
      cacheDtype: params.cacheDtype === 'default' ? cache.dtype : params.cacheDtype,
    })
    if (params.seed === 0) setParams({ seed })
    // A fresh generation starts a new chain; a follow-up manages its own depth.
    setLastResult(null)
  }, [generate, params, resolved, setParams, setLastResult])

  return (
    <MotionPreferenceProvider>
      <div className="shell">
        <TopBar
          connection={connection}
          run={run}
          elapsed={elapsed}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Hidden rather than unmounted: LiveCanvas holds the last painted latent frame in
            two <canvas> elements, and unmounting mid-run would blank it. */}
        <div className="columns" hidden={view !== 'generate'}>
          <ComposePanel
            subjects={library.subjects}
            checks={checks}
            busy={busy}
            onGenerate={onGenerate}
            onCancel={() => void cancel()}
            stepFraction={stepFraction}
          />

          <main className="stage">
            <LiveCanvas
              run={run}
              finalUrl={finalUrl}
              stepFraction={stepFraction}
              step={rate?.stepsDone ?? 0}
              maxSteps={rate?.stepsTotal ?? params.steps}
            />
            <RunColumn history={history} busy={busy} />
            {lastResult && <FollowUpBar busy={busy} />}
            <StatusPanel run={run} connection={connection} submitError={submitError} />
          </main>

          <aside className="telemetry">
            <RunFacts />
            <LogConsole />
          </aside>
        </div>

        {/* Also hidden rather than unmounted: a portrait generation started in the Library
            keeps its pending run and the open editor in component state, so leaving to watch
            the pipeline on the Generate tab used to drop the finished photo on the floor. */}
        <LibraryView library={library} hidden={view !== 'library'} />

        <LiveRegion run={run} stages={stageViews(run, 0)} />
      </div>
    </MotionPreferenceProvider>
  )
}

/**
 * The 250ms tick lives here rather than in App, so a running generation re-renders the
 * timeline and the rail only -- not the prompt textarea, four times a second.
 */
function RunColumn({ history, busy }: { history: Record<string, number>; busy: boolean }) {
  const run = useRunStore((state) => state.run)
  const now = useNow(busy)

  // Compare like with like: a reference run's timings are not a plain run's.
  const bucketed = useMemo(
    () => historyFor(history, run?.params.references.length ?? 0),
    [history, run?.params.references.length],
  )

  const stages = useMemo(() => stageViews(run, now), [run, now])
  const segments = useMemo(() => (run ? deriveSegments(run, now) : []), [run, now])
  const rate = stepRate(run?.nodes['6']?.steps ?? [])

  return (
    <>
      <PipelineTimeline stages={stages} rate={rate} history={bucketed} />
      <RunRail segments={segments} done={run?.tEnd !== undefined} />
    </>
  )
}

function RunFacts() {
  const run = useRunStore((state) => state.run)

  if (!run) {
    return (
      <section className="panel facts">
        <span className="label-xs">this run</span>
        <p className="facts-empty">Nothing running. Facts appear here once you generate.</p>
      </section>
    )
  }

  const cached = run.cachedNodeIds.length
  const replayed = Object.values(run.nodes).some((node) => node.outputReplayedFromCache)
  const cacheNode = run.graph['9']

  return (
    <section className="panel facts">
      <span className="label-xs">this run</span>
      <dl>
        <div>
          <dt>seed</dt>
          <dd className="num">{run.params.seed}</dd>
        </div>
        <div>
          <dt>steps</dt>
          <dd className="num">{run.params.steps}</dd>
        </div>
        <div>
          <dt>references</dt>
          <dd className="num">{run.params.references.length}</dd>
        </div>
        <div>
          <dt>cached nodes</dt>
          <dd className="num">{cached}</dd>
        </div>
        <div>
          <dt>preview frames</dt>
          <dd className="num">{run.previewFramesReceived}</dd>
        </div>
      </dl>

      {cacheNode && (
        <p className="facts-note">
          KV cache requested at {String(cacheNode.inputs['dtype'])} on{' '}
          {String(cacheNode.inputs['device'])} — requested, not confirmed. ComfyUI emits no signal
          for whether the cache was actually used.
        </p>
      )}

      {replayed && (
        <p className="facts-warn">
          This image was replayed from ComfyUI&apos;s cache — nothing was regenerated. Change the
          seed to force a real run.
        </p>
      )}

      <GraphInspector graph={run.graph} promptId={run.promptId} />
    </section>
  )
}
