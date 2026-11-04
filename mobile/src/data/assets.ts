import type { SceneId } from '../types'
import type { LocationSceneId } from '../ui/contracts'

export const sceneImages: Record<SceneId, string> = {
  county: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/scene-county.png?auth_key=4eb0a0f7a04b24d3c6e6f8fd84763c7a1f3fd6427598e302a5f4f0dd507794b6',
  river: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/scene-river.png?auth_key=d3104172d78084e7373ac1dd500e50a500f31f481040680f7da846187fcc9a9b',
  study: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/scene-study.png?auth_key=a444d7443554d8bb63a642c15872f68474302ff4afcc539b195f4a96d4330f1f',
}

export const locationImages: Record<LocationSceneId, string> = {
  ferry: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/scene-ferry.png?auth_key=4ccf0812a4aa280d863c9c71b6151604d1bd318c5ff32cf83b6bad5b9423052e',
  station: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/scene-station.png?auth_key=cdf762fba02b4ba364900bdc10642e21de9fdd2edee5be2696c855213d8508d6',
  town: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/scene-town.png?auth_key=d3b0189a94499de3ce17fc9b1599b1cbc111b8fdc6bff03f398c97026c1106cb',
  manor: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/scene-manor.png?auth_key=6cb53d4e1d2e1e9f8790779d6d6bd456b0d9ec26cbf4abcf623868804807964a',
}

export const personImages: Record<string, string> = {
  xiancheng: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/person-deputy.png?auth_key=5664b1d9e3f88384aed9f962d14d3a49865d736b6312c6808fd8038ff73186e7',
  expert: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/person-expert.png?auth_key=851984335cb60a8338dafb14c513a06423bd23f149570c87b5e366d181bf0145',
  liangshang: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/person-merchant.png?auth_key=67fa43322df2e3d747aebc079a12961b54ec1598fa4b598a253289a38a073b97',
  foreman: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/person-foreman.png?auth_key=64b348286b484affd5a54849063b8bcf6d1a4258b0eb45d53c74162679a9ed3a',
  zhubu: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/person-clerk.png?auth_key=af4d6cc2d3adc07f682dba497374ecc17cc0d55b60ce9a14833ff20c72105ea9',
  gentry: 'https://g.cdn.meoo.host/ebynvkstlmc7/ai-images/person-gentry.png?auth_key=63630f571ce131a7cb11ea58ec7fadd86a285e4877f69fd3773eb0b5ea9bd2f5',
}
