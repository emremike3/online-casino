import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ShieldCheck, RefreshCw, Copy, Check } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button } from '@/components/ui/Button'

interface Props {
  open: boolean
  onClose: () => void
}

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <div className="space-y-1">
      <span className="stat-label">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-base px-3 py-2">
        <code className={`flex-1 truncate text-xs ${mono ? 'font-mono' : ''} text-muted`}>{value}</code>
        <button onClick={copy} className="text-subtle hover:text-white" title="Copy">
          {copied ? <Check size={14} className="text-win" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}

export function ProvablyFairModal({ open, onClose }: Props) {
  const fairness = useStore((s) => s.fairness)
  const setClientSeed = useStore((s) => s.setClientSeed)
  const rotateServerSeed = useStore((s) => s.rotateServerSeed)
  const [clientDraft, setClientDraft] = useState(fairness.clientSeed)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="card relative z-10 w-full max-w-lg p-6"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand/15 text-brand">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-tight">Provably Fair</h2>
                  <p className="text-xs text-subtle">Every result is verifiable & tamper-proof</p>
                </div>
              </div>
              <button onClick={onClose} className="text-subtle hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted">
                Outcomes are derived from{' '}
                <code className="text-brand-light">HMAC_SHA256(serverSeed, clientSeed:nonce)</code>.
                The server seed's hash is shown <strong>before</strong> you bet. Rotate it any time to
                reveal the old seed and verify past rounds.
              </p>

              <Field label="Active Server Seed (hashed)" value={fairness.serverSeedHashed} />

              <div className="space-y-1">
                <span className="stat-label">Client Seed</span>
                <div className="flex gap-2">
                  <input
                    value={clientDraft}
                    onChange={(e) => setClientDraft(e.target.value)}
                    className="input-field font-mono"
                    placeholder="Your client seed"
                  />
                  <Button variant="ghost" size="sm" onClick={() => setClientSeed(clientDraft)}>
                    Save
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="panel p-3">
                  <span className="stat-label">Current Nonce</span>
                  <p className="mt-1 font-mono text-lg font-bold">{fairness.nonce}</p>
                </div>
                <div className="panel flex flex-col justify-between p-3">
                  <span className="stat-label">Rotate Seed</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1"
                    onClick={() => {
                      rotateServerSeed()
                    }}
                  >
                    <RefreshCw size={14} /> Rotate & Reveal
                  </Button>
                </div>
              </div>

              {fairness.previousServerSeed && (
                <Field label="Previous Server Seed (revealed)" value={fairness.previousServerSeed} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
