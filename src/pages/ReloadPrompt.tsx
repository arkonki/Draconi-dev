import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '../components/shared/Button' // Your button component

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  const close = () => setNeedRefresh(false)

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 right-4 p-4 bg-white border border-gray-200 shadow-xl rounded-lg z-[100] animate-in slide-in-from-bottom-5">
      <div className="mb-2 text-sm font-bold text-gray-800">
        New version available
      </div>
      <div className="flex gap-2">
        <Button onClick={() => updateServiceWorker(true)} size="sm">
          Reload
        </Button>
        <Button onClick={close} variant="secondary" size="sm">
          Close
        </Button>
      </div>
    </div>
  )
}
