import { useState } from 'react'
import { chooseCache, gib, type EncodeCost } from '../library/cost'

interface Props {
  cost: EncodeCost
  referenceCount: number
}

const n = (value: number) => value.toLocaleString('en-US')

/**
 * The number that predicts an OOM on 8GB. Every figure here is computed, not estimated --
 * except the ones we explicitly say we cannot compute.
 */
export function CostMeter({ cost, referenceCount }: Props) {
  const [open, setOpen] = useState(false)
  if (referenceCount === 0) return null

  const cache = chooseCache(cost, referenceCount)
  const chosenBytes = cache.dtype === 'int8' ? cost.kvBytes.int8 : cost.kvBytes.default
  const heavy = chosenBytes > 4 * 1024 ** 3

  return (
    <div className={`cost ${heavy ? 'cost-heavy' : ''}`}>
      <button
        type="button"
        className="cost-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="label-xs">encode cost</span>
        <span className="num">
          {n(cost.prefixTokensExcludingText)} image tokens · {gib(chosenBytes)} GiB cache
        </span>
      </button>

      {open && (
        <div className="cost-detail">
          <table className="cost-table">
            <tbody>
              {cost.perReference.map((reference) => (
                <tr key={reference.label}>
                  <td>{reference.label}</td>
                  <td className="num">
                    {reference.width}×{reference.height}
                  </td>
                  <td className="num">{n(reference.tokens)}</td>
                </tr>
              ))}
              <tr>
                <td>target</td>
                <td className="num">—</td>
                <td className="num">{n(cost.targetTokens)}</td>
              </tr>
              <tr className="cost-total">
                <td>total</td>
                <td />
                <td className="num">{n(cost.prefixTokensExcludingText)}</td>
              </tr>
            </tbody>
          </table>

          <p className="cost-note">
            Image tokens are exact — this mirrors the encoder&apos;s own resize. Your prompt&apos;s
            text tokens are <strong>not</strong> counted: there is no BPE tokenizer in the browser.
          </p>

          <p className="cost-note">
            KV cache at 0.5 MiB per token (2 × 32 blocks × 4096 dim × 2 bytes):{' '}
            <span className="num">{gib(cost.kvBytes.default)}</span> GiB at full precision,{' '}
            <span className="num">{gib(cost.kvBytes.int8)}</span> at int8.
          </p>

          <p className="cost-note">
            Requesting <span className="num">{cache.device}</span> /{' '}
            <span className="num">{cache.dtype}</span> — {cache.reason}. ComfyUI emits no signal
            for whether the cache was actually used, so this is requested, not confirmed. If it
            does not fit, the prefix is recomputed every step and the run simply takes far longer.
          </p>

          {heavy && (
            <p className="cost-note cost-warn">
              This is a lot for an 8 GB card. Lowering the reference budget to 768 roughly halves
              it. Note that int8 is not chosen automatically: on this machine it fails with
              &quot;aimdo memory compile error&quot; rather than saving anything.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
