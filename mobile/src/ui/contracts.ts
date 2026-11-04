import type { OverlayId, SceneId, SectionId } from '../types'

export type LocationSceneId = 'ferry' | 'station' | 'town' | 'manor'
export type OpenOverlayId = Exclude<OverlayId, null>

export interface NavigationProps {
  navigate: (section: SectionId) => void
  changeScene: (scene: SceneId) => void
  openOverlay: (overlay: OpenOverlayId) => void
  openPerson: (personId: string) => void
  openLocation: (location: LocationSceneId) => void
}

export interface ScreenProps extends NavigationProps {}

export interface OverlayProps extends NavigationProps {
  onClose: () => void
}
