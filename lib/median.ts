// Median.co native bridge utilities
// https://median.co/docs/javascript-bridge

declare global {
  interface Window {
    median?: {
      onesignal?: {
        register: () => void
        getDeviceId: () => Promise<string | null>
      }
      cordova?: {
        plugins?: {
          permissions?: {
            checkPermission: (permission: string, callback: (status: { hasPermission: boolean }) => void) => void
            requestPermission: (permission: string, callback: (status: { hasPermission: boolean }) => void) => void
          }
        }
      }
      geolocation?: {
        getCurrentPosition: (options?: PositionOptions) => Promise<GeolocationPosition>
      }
      share?: {
        shareUrl: (url: string, text?: string) => void
      }
    }
    gonative?: Window['median']
  }
}

export const isMedian = (): boolean =>
  typeof window !== 'undefined' && (!!window.median || !!window.gonative)

export const getMedianBridge = () =>
  typeof window !== 'undefined' ? window.median || window.gonative : null

export const registerPushNotifications = (): void => {
  const bridge = getMedianBridge()
  if (bridge?.onesignal?.register) {
    bridge.onesignal.register()
  }
}

export const getMedianDeviceId = async (): Promise<string | null> => {
  const bridge = getMedianBridge()
  if (bridge?.onesignal?.getDeviceId) {
    return bridge.onesignal.getDeviceId()
  }
  return null
}

export const getLocation = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    const bridge = getMedianBridge()
    if (bridge?.geolocation?.getCurrentPosition) {
      bridge.geolocation
        .getCurrentPosition({ enableHighAccuracy: true })
        .then(resolve)
        .catch(reject)
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      })
    } else {
      reject(new Error('Geolocation not available'))
    }
  })
}

export const shareUrl = (url: string, text?: string): void => {
  const bridge = getMedianBridge()
  if (bridge?.share?.shareUrl) {
    bridge.share.shareUrl(url, text)
  } else if (navigator.share) {
    navigator.share({ url, text })
  }
}
