import { Suspense } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { getGame } from '@/data/games'
import { GAME_COMPONENTS } from '@/games/registry'

function Loader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-brand" />
    </div>
  )
}

export function GamePage() {
  const { id } = useParams<{ id: string }>()
  const game = getGame(id)
  const Component = id ? GAME_COMPONENTS[id] : undefined

  if (!game || !Component) return <Navigate to="/" replace />

  return (
    <Suspense fallback={<Loader />}>
      <Component />
    </Suspense>
  )
}
