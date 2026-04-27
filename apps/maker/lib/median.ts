// Median.co native bridge utilities — maker app copy
// https://median.co/docs/javascript-bridge

declare global {
  interface Window {
    median?: {
      onesignal?: {
        register: () => void
        getDeviceId: () => Promise<string | null>
      }
      geolocation?: {
        getCurrentPosition: (options?: PositionOptions) => Promise<GeolocationPosition>
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
  if (bridge?.onesignal?.register) bridge.onesignal.register()
}

export const getMedianDeviceId = async (): Promise<string | null> => {
  const bridge = getMedianBridge()
  if (bridge?.onesignal?.getDeviceId) return bridge.onesignal.getDeviceId()
  return null
}
